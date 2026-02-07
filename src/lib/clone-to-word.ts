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

// A4 usable area for image scaling (in pixels at 96 DPI)
// A4 = 210mm x 297mm. With ~10mm margin each side → usable 190mm x 277mm
const A4_USABLE_W_PX = Math.round((190 / 25.4) * 96); // ~717 px
const A4_USABLE_H_PX = Math.round((277 / 25.4) * 96); // ~1047 px
const A4_USABLE_W_LANDSCAPE_PX = Math.round((277 / 25.4) * 96);
const A4_USABLE_H_LANDSCAPE_PX = Math.round((190 / 25.4) * 96);

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

    const usableW = isLandscape ? A4_USABLE_W_LANDSCAPE_PX : A4_USABLE_W_PX;
    const usableH = isLandscape ? A4_USABLE_H_LANDSCAPE_PX : A4_USABLE_H_PX;

    const ratioW = usableW / page.width;
    const ratioH = usableH / page.height;
    const ratio = Math.min(ratioW, ratioH);

    const finalWidthPx = Math.round(page.width * ratio);
    const finalHeightPx = Math.round(page.height * ratio);

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
            top: "10mm" as const,
            bottom: "10mm" as const,
            left: "10mm" as const,
            right: "10mm" as const,
          },
        },
      },
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: new Uint8Array(page.buffer),
              transformation: {
                width: finalWidthPx,
                height: finalHeightPx,
              },
            }),
          ],
        }),
      ],
    };
  });

  return new Document({ sections });
}

function downloadBlob(blob: Blob, filename: string) {
  // Ensure the blob has the correct MIME type for Word documents
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
