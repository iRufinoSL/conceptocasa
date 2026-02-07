import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  SectionType,
} from 'docx';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';
import { supabase } from '@/integrations/supabase/client';

ensurePdfjsWorker();

// ─── Types ────────────────────────────────────────────────────

interface ExtractedLine {
  text: string;
  fontSize: number;
  bold: boolean;
}

// ─── Text extraction ─────────────────────────────────────────

/**
 * Extract text from every page of a PDF document.
 * Groups text items into lines based on their Y-coordinate,
 * sorts items left-to-right within each line, and returns
 * them ordered top-to-bottom.
 */
async function extractTextFromPdf(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<ExtractedLine[][]> {
  const allPages: ExtractedLine[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Collect items grouped by approximate Y position
    const lineMap = new Map<
      number,
      Array<{ text: string; x: number; fontSize: number; bold: boolean }>
    >();

    for (const item of textContent.items) {
      // Skip non-text items (e.g. TextMarkedContent)
      if (!('str' in item) || !item.str.trim()) continue;

      const y = Math.round(item.transform[5]);
      const bucket = Math.round(y / 3) * 3; // cluster nearby Y values
      const x = item.transform[4];
      const fontSize = Math.abs(item.transform[0]) || 12;
      const bold = ((item as any).fontName || '').toLowerCase().includes('bold');

      if (!lineMap.has(bucket)) lineMap.set(bucket, []);
      lineMap.get(bucket)!.push({ text: item.str, x, fontSize, bold });
    }

    // Sort lines top → bottom (PDF Y axis goes bottom-up)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    const lines: ExtractedLine[] = sortedYs
      .map((y) => {
        const items = lineMap.get(y)!;
        // Sort items left → right within the line
        items.sort((a, b) => a.x - b.x);

        const text = items
          .map((i) => i.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const fontSize = items[0]?.fontSize || 12;
        const bold = items.some((i) => i.bold);

        return { text, fontSize, bold };
      })
      .filter((line) => line.text.length > 0);

    allPages.push(lines);
  }

  return allPages;
}

// ─── Word document builder ───────────────────────────────────

/**
 * Build a Word document from extracted text.
 * Each PDF page becomes a Word section (with a page break in between).
 * Text is fully editable.
 */
function buildEditableDoc(pages: ExtractedLine[][]): Document {
  const sections = pages.map((lines, idx) => {
    const children: Paragraph[] =
      lines.length > 0
        ? lines.map(
            (line) =>
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: line.text,
                    bold: line.bold,
                    // docx size is in half-points (24 = 12pt)
                    size: Math.round(line.fontSize * 2),
                  }),
                ],
              })
          )
        : [new Paragraph({ children: [new TextRun({ text: '' })] })];

    return {
      properties: {
        type: idx === 0 ? undefined : SectionType.NEXT_PAGE,
        page: {
          margin: {
            top: '15mm' as const,
            bottom: '15mm' as const,
            left: '15mm' as const,
            right: '15mm' as const,
          },
        },
      },
      children,
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
 * Extracts text content from the PDF and creates Word paragraphs
 * that can be freely edited in any Word-compatible editor.
 */
export async function cloneStoragePdfToWord(
  bucketName: string,
  filePath: string,
  outputName: string
): Promise<void> {
  const pdf = await loadPdfFromStorage(bucketName, filePath);
  const pages = await extractTextFromPdf(pdf);
  const doc = buildEditableDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}

/**
 * Clone a template to an editable Word document.
 * Uses the original PDF file to extract text content.
 */
export async function cloneTemplateToWord(
  originalFilePath: string,
  outputName: string,
  bucketName: string = 'project-documents'
): Promise<void> {
  const pdf = await loadPdfFromStorage(bucketName, originalFilePath);
  const pages = await extractTextFromPdf(pdf);
  const doc = buildEditableDoc(pages);
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
  const pages = await extractTextFromPdf(pdf);
  const doc = buildEditableDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}
