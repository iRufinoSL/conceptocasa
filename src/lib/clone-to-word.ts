import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  SectionType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  PageOrientation,
} from 'docx';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';
import { supabase } from '@/integrations/supabase/client';

ensurePdfjsWorker();

// ─── Constants ───────────────────────────────────────────────

// A4 dimensions in points (1pt = 1/72 inch)
const A4_WIDTH_PT = 595;
const A4_HEIGHT_PT = 842;

// EMU conversion: 1pt = 12700 EMU
const PT_TO_EMU = 12700;

// Render scale for high-quality page images
const RENDER_SCALE = 2;

// ─── Types ───────────────────────────────────────────────────

interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
}

interface ExtractedLine {
  text: string;
  fontSize: number;
  bold: boolean;
  y: number;
}

interface PageData {
  imageBuffer: Uint8Array;
  width: number;
  height: number;
  lines: ExtractedLine[];
  isLandscape: boolean;
}

// ─── PDF page rendering ─────────────────────────────────────

/**
 * Render a single PDF page to a PNG Uint8Array.
 */
async function renderPageToImage(
  page: pdfjsLib.PDFPageProxy
): Promise<{ buffer: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  const arrayBuffer = await blob.arrayBuffer();
  return {
    buffer: new Uint8Array(arrayBuffer),
    width: viewport.width,
    height: viewport.height,
  };
}

// ─── Text extraction ─────────────────────────────────────────

/**
 * Extract text from a PDF page, grouped into lines.
 */
async function extractTextFromPage(
  page: pdfjsLib.PDFPageProxy
): Promise<ExtractedLine[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });

  const items: ExtractedTextItem[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str.trim()) continue;

    const x = item.transform[4];
    const rawY = item.transform[5];
    // PDF Y goes bottom-up; convert to top-down
    const y = viewport.height - rawY;
    const fontSize = Math.abs(item.transform[0]) || 12;
    const bold = ((item as any).fontName || '').toLowerCase().includes('bold');

    items.push({ text: item.str, x, y, fontSize, bold });
  }

  // Group by approximate Y position (cluster within 4pt)
  const lineMap = new Map<number, ExtractedTextItem[]>();
  for (const item of items) {
    const bucket = Math.round(item.y / 4) * 4;
    if (!lineMap.has(bucket)) lineMap.set(bucket, []);
    lineMap.get(bucket)!.push(item);
  }

  // Sort lines top-to-bottom
  const sortedYs = [...lineMap.keys()].sort((a, b) => a - b);

  return sortedYs
    .map((y) => {
      const lineItems = lineMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);

      const text = lineItems
        .map((i) => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        text,
        fontSize: lineItems[0]?.fontSize || 12,
        bold: lineItems.some((i) => i.bold),
        y,
      };
    })
    .filter((line) => line.text.length > 0);
}

// ─── Process all pages ───────────────────────────────────────

async function processAllPages(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<PageData[]> {
  const pages: PageData[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const isLandscape = viewport.width > viewport.height;

    const [image, lines] = await Promise.all([
      renderPageToImage(page),
      extractTextFromPage(page),
    ]);

    pages.push({
      imageBuffer: image.buffer,
      width: image.width,
      height: image.height,
      lines,
      isLandscape,
    });
  }

  return pages;
}

// ─── Word document builder ───────────────────────────────────

/**
 * Build a hybrid Word document:
 * - Each page's rendered image is placed as a FLOATING image BEHIND the text
 * - Extracted text is overlaid as editable paragraphs on top
 *
 * This preserves logos, graphics, signatures visually while
 * making all text content selectable and editable.
 */
function buildHybridDoc(pages: PageData[]): Document {
  const sections = pages.map((pageData, idx) => {
    const { isLandscape } = pageData;
    const pageW = isLandscape ? A4_HEIGHT_PT : A4_WIDTH_PT;
    const pageH = isLandscape ? A4_WIDTH_PT : A4_HEIGHT_PT;

    // Create the background image that covers the full page
    const bgImage = new ImageRun({
      type: 'png',
      data: pageData.imageBuffer,
      transformation: {
        width: pageW,
        height: pageH,
      },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          offset: 0,
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          offset: 0,
        },
        behindDocument: true,
        allowOverlap: true,
        lockAnchor: true,
      },
    });

    // Build editable text paragraphs from extracted content
    const textParagraphs: Paragraph[] = [];

    if (pageData.lines.length > 0) {
      // Calculate spacing between lines based on their Y positions
      let prevY = 0;
      for (let i = 0; i < pageData.lines.length; i++) {
        const line = pageData.lines[i];
        // Convert from PDF points to Word half-points for spacing
        const gapPt = i === 0 ? line.y : line.y - prevY;
        // before = gap in twips (1pt = 20 twips). Clamp to reasonable range.
        const spacingBefore = Math.max(0, Math.min(Math.round(gapPt * 14), 4000));

        textParagraphs.push(
          new Paragraph({
            spacing: {
              before: i === 0 ? spacingBefore : Math.max(0, spacingBefore - Math.round(line.fontSize * 16)),
              after: 0,
              line: Math.round(line.fontSize * 1.2 * 20), // ~1.2x line height in twips
            },
            children: [
              new TextRun({
                text: line.text,
                bold: line.bold,
                size: Math.round(line.fontSize * 2), // half-points
                font: 'Arial',
              }),
            ],
          })
        );
        prevY = line.y;
      }
    } else {
      // If no text was extracted, add empty lines so user can type
      for (let i = 0; i < 30; i++) {
        textParagraphs.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: ' ', size: 22, font: 'Arial' })],
          })
        );
      }
    }

    // First paragraph contains the background image
    const firstParagraph = textParagraphs.length > 0
      ? new Paragraph({
          ...textParagraphs[0],
          children: [bgImage, ...(textParagraphs[0] as any).root?.filter?.((c: any) => c instanceof TextRun) || []],
        })
      : new Paragraph({ children: [bgImage] });

    // We need to reconstruct properly - put the image in a separate paragraph
    // and then add all text paragraphs
    const imageParagraph = new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [bgImage],
    });

    return {
      properties: {
        type: idx === 0 ? undefined : SectionType.NEXT_PAGE,
        page: {
          size: {
            orientation: isLandscape
              ? PageOrientation.LANDSCAPE
              : PageOrientation.PORTRAIT,
          },
          margin: {
            top: '0mm' as const,
            bottom: '0mm' as const,
            left: '0mm' as const,
            right: '0mm' as const,
          },
        },
      },
      children: [imageParagraph, ...textParagraphs],
    };
  });

  return new Document({ sections });
}

// ─── Helpers ─────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const wordBlob = new Blob([blob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(wordBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadPdfFromStorage(
  bucketName: string,
  filePath: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  const { data: blob, error } = await supabase.storage
    .from(bucketName)
    .download(filePath);
  if (error) throw error;
  const arrayBuffer = await blob.arrayBuffer();
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

// ─── PUBLIC API ──────────────────────────────────────────────

/**
 * Clone a PDF stored in Supabase storage to an editable Word document.
 * Uses a hybrid approach: page images as backgrounds + extracted text as editable overlay.
 */
export async function cloneStoragePdfToWord(
  bucketName: string,
  filePath: string,
  outputName: string
): Promise<void> {
  const pdf = await loadPdfFromStorage(bucketName, filePath);
  const pages = await processAllPages(pdf);
  const doc = buildHybridDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}

/**
 * Clone a template to an editable Word document.
 */
export async function cloneTemplateToWord(
  originalFilePath: string,
  outputName: string,
  bucketName: string = 'project-documents'
): Promise<void> {
  const pdf = await loadPdfFromStorage(bucketName, originalFilePath);
  const pages = await processAllPages(pdf);
  const doc = buildHybridDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}

/**
 * Clone a local PDF file to an editable Word document.
 */
export async function cloneLocalPdfToWord(
  file: File,
  outputName: string
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = await processAllPages(pdf);
  const doc = buildHybridDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}
