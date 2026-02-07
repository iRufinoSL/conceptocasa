import {
  Document,
  Packer,
  Paragraph,
  ImageRun,
  SectionType,
  PageOrientation,
} from 'docx';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';
import { supabase } from '@/integrations/supabase/client';

ensurePdfjsWorker();

/**
 * Render a single PDF page to a PNG ArrayBuffer at high resolution.
 */
async function renderPageToBuffer(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale = 2.5
): Promise<{ buffer: ArrayBuffer; width: number; height: number }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Canvas to blob failed'));
      blob.arrayBuffer().then((buffer) =>
        resolve({ buffer, width: canvas.width, height: canvas.height })
      );
    }, 'image/png');
  });
}

/**
 * Load an image URL into an ArrayBuffer (for already-rendered page images).
 */
async function loadImageUrlToBuffer(
  url: string
): Promise<{ buffer: ArrayBuffer; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas to blob failed'));
        blob.arrayBuffer().then((buf) =>
          resolve({ buffer: buf, width: img.naturalWidth, height: img.naturalHeight })
        );
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}

// A4 dimensions in EMUs (914400 EMUs = 1 inch)
// A4: 210mm x 297mm ≈ 8.27 x 11.69 inches
const A4_WIDTH_EMU = Math.round(8.27 * 914400);
const A4_HEIGHT_EMU = Math.round(11.69 * 914400);

// Margins (≈ 1cm each side)
const MARGIN_EMU = Math.round(0.4 * 914400);
const USABLE_WIDTH_EMU = A4_WIDTH_EMU - 2 * MARGIN_EMU;
const USABLE_HEIGHT_EMU = A4_HEIGHT_EMU - 2 * MARGIN_EMU;

/**
 * Build a Word document from an array of page images.
 * Each page image becomes a full-page image in the Word document,
 * preserving the original aspect ratio.
 */
function buildWordDoc(
  pages: { buffer: ArrayBuffer; width: number; height: number }[]
): Document {
  const sections = pages.map((page, idx) => {
    const isLandscape = page.width > page.height;

    const usableW = isLandscape ? USABLE_HEIGHT_EMU : USABLE_WIDTH_EMU;
    const usableH = isLandscape ? USABLE_WIDTH_EMU : USABLE_HEIGHT_EMU;

    const ratioW = usableW / page.width;
    const ratioH = usableH / page.height;
    const ratio = Math.min(ratioW, ratioH);

    // Convert from EMU to pixels (docx ImageRun uses pixels for transformation)
    // 914400 EMU = 1 inch, 96 pixels = 1 inch → 1 pixel = 9525 EMU
    const finalWidthPx = Math.round((page.width * ratio) / 9525);
    const finalHeightPx = Math.round((page.height * ratio) / 9525);

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
            top: MARGIN_EMU,
            bottom: MARGIN_EMU,
            left: MARGIN_EMU,
            right: MARGIN_EMU,
          },
        },
      },
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: page.buffer,
              transformation: {
                width: finalWidthPx,
                height: finalHeightPx,
              },
              type: 'png',
            }),
          ],
        }),
      ],
    };
  });

  return new Document({ sections });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PUBLIC API ────────────────────────────────────────────────

/**
 * Clone a PDF stored in Supabase storage to a Word document.
 * Downloads the PDF, renders every page at high resolution,
 * and exports each page as a full-page image in a .docx file.
 */
export async function cloneStoragePdfToWord(
  bucketName: string,
  filePath: string,
  outputName: string
): Promise<void> {
  // Download the PDF
  const { data: blob, error } = await supabase.storage
    .from(bucketName)
    .download(filePath);
  if (error) throw error;

  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: { buffer: ArrayBuffer; width: number; height: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pages.push(await renderPageToBuffer(pdf, i));
  }

  const doc = buildWordDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}

/**
 * Clone a template (whose pages are already rendered as images in storage)
 * to a Word document. Uses the pre-rendered page images for speed.
 */
export async function cloneTemplateToWord(
  pageImagePaths: string[],
  outputName: string
): Promise<void> {
  const pages: { buffer: ArrayBuffer; width: number; height: number }[] = [];

  for (const path of pageImagePaths) {
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(path, 600);
    if (error) throw error;
    pages.push(await loadImageUrlToBuffer(data.signedUrl));
  }

  const doc = buildWordDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}

/**
 * Clone a local File (PDF) to a Word document.
 * Useful when the file hasn't been uploaded yet.
 */
export async function cloneLocalPdfToWord(
  file: File,
  outputName: string
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: { buffer: ArrayBuffer; width: number; height: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pages.push(await renderPageToBuffer(pdf, i));
  }

  const doc = buildWordDoc(pages);
  const wordBlob = await Packer.toBlob(doc);
  downloadBlob(wordBlob, `${outputName}.docx`);
}
