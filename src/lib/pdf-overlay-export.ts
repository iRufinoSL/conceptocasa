import jsPDF from 'jspdf';

export interface TextOverlay {
  id: string;
  /** X position as percentage of page width (0-100) */
  x: number;
  /** Y position as percentage of page height (0-100) */
  y: number;
  /** Width as percentage of page width */
  width: number;
  /** Text content */
  text: string;
  /** Font size in pt */
  fontSize: number;
  /** Font family */
  fontFamily: 'helvetica' | 'times' | 'courier';
  /** Bold */
  bold: boolean;
  /** Text color hex */
  color: string;
}

export interface PageOverlays {
  /** Page image as data URL */
  imageDataUrl: string;
  /** Whether page is landscape */
  isLandscape: boolean;
  /** Text overlays for this page */
  overlays: TextOverlay[];
}

/**
 * Generate a PDF with original page images as backgrounds
 * and text overlays positioned on top.
 * The text boxes cover the original text with a white rectangle
 * then print the new text at the same position.
 */
export function generateOverlayPdf(
  pages: PageOverlays[],
  filename: string
): void {
  if (pages.length === 0) return;

  const firstPage = pages[0];
  const doc = new jsPDF({
    orientation: firstPage.isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      doc.addPage(
        'a4',
        page.isLandscape ? 'landscape' : 'portrait'
      );
    }

    const pdfW = doc.internal.pageSize.getWidth();
    const pdfH = doc.internal.pageSize.getHeight();

    // 1. Draw the original page image as full-page background
    doc.addImage(page.imageDataUrl, 'PNG', 0, 0, pdfW, pdfH);

    // 2. For each text overlay, white-out the area then draw text
    for (const overlay of page.overlays) {
      const ox = (overlay.x / 100) * pdfW;
      const oy = (overlay.y / 100) * pdfH;
      const ow = (overlay.width / 100) * pdfW;

      // Estimate height based on font size and text lines
      const lines = overlay.text.split('\n');
      const lineHeightMm = (overlay.fontSize * 0.3528) * 1.3; // pt to mm * line spacing
      const oh = lineHeightMm * lines.length + 1;

      // White out the original content behind the overlay
      doc.setFillColor(255, 255, 255);
      doc.rect(ox - 0.3, oy - 0.3, ow + 0.6, oh + 0.6, 'F');

      // Set text properties
      const fontStyle = overlay.bold ? 'bold' : 'normal';
      doc.setFont(overlay.fontFamily, fontStyle);
      doc.setFontSize(overlay.fontSize);

      // Parse hex color
      const hex = overlay.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      doc.setTextColor(r, g, b);

      // Draw each line
      lines.forEach((line, lineIdx) => {
        const textY = oy + lineHeightMm * (lineIdx + 0.8);
        doc.text(line, ox, textY, { maxWidth: ow });
      });
    }
  }

  // Download
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
