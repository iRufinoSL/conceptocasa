import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Printer, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface FloorPlanPdfExportProps {
  budgetName: string;
  floorName: string;
  /** Ref to the HTML container of the grid to export */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function FloorPlanPdfExport({ budgetName, floorName, containerRef }: FloorPlanPdfExportProps) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const container = containerRef.current;
    if (!container) {
      toast.error('No se encontró el plano para exportar');
      return;
    }

    setExporting(true);
    try {
      // A4 dimensions in mm
      const A4_W = orientation === 'landscape' ? 297 : 210;
      const A4_H = orientation === 'landscape' ? 210 : 297;
      const MARGIN = 5; // 5mm margins for maximum size
      const HEADER_H = 10; // compact header

      const drawW = A4_W - 2 * MARGIN;
      const drawH = A4_H - 2 * MARGIN - HEADER_H;

      // The containerRef IS the .overflow-auto element itself.
      // Find the inner content div (the relative-positioned child with the actual grid).
      const innerContent = container.querySelector(':scope > div') as HTMLElement | null;

      // Save original styles
      const origContainerOverflow = container.style.overflow;
      const origContainerWidth = container.style.width;
      const origContainerHeight = container.style.height;
      const origContainerMaxHeight = container.style.maxHeight;
      const origContainerPosition = container.style.position;

      // Get the full content dimensions BEFORE modifying styles
      const fullW = container.scrollWidth;
      const fullH = container.scrollHeight;

      // Expand container to full content size so html2canvas can see everything
      container.style.overflow = 'visible';
      container.style.width = fullW + 'px';
      container.style.height = fullH + 'px';
      container.style.maxHeight = 'none';
      container.style.position = 'relative';

      // Also walk up parents and temporarily remove overflow:hidden/auto constraints
      const parentOverrides: { el: HTMLElement; orig: string }[] = [];
      let parent = container.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const ov = getComputedStyle(parent).overflow;
        if (ov === 'hidden' || ov === 'auto' || ov === 'scroll') {
          parentOverrides.push({ el: parent, orig: parent.style.overflow });
          parent.style.overflow = 'visible';
        }
        parent = parent.parentElement;
      }

      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: fullW,
        height: fullH,
        windowWidth: fullW + 200,
        windowHeight: fullH + 200,
      });

      // Restore all styles
      container.style.overflow = origContainerOverflow;
      container.style.width = origContainerWidth;
      container.style.height = origContainerHeight;
      container.style.maxHeight = origContainerMaxHeight;
      container.style.position = origContainerPosition;
      parentOverrides.forEach(({ el, orig }) => { el.style.overflow = orig; });

      // Auto-crop whitespace: scan canvas pixels to find the bounding box of actual content
      const ctx = canvas.getContext('2d');
      let cropTop = 0, cropLeft = 0, cropRight = canvas.width, cropBottom = canvas.height;
      if (ctx) {
        const imgDataRaw = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgDataRaw.data;
        const w = canvas.width, h = canvas.height;
        // Find top
        topScan: for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropTop = y; break topScan; }
          }
        }
        // Find bottom
        bottomScan: for (let y = h - 1; y >= cropTop; y--) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropBottom = y + 1; break bottomScan; }
          }
        }
        // Find left
        leftScan: for (let x = 0; x < w; x++) {
          for (let y = cropTop; y < cropBottom; y++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropLeft = x; break leftScan; }
          }
        }
        // Find right
        rightScan: for (let x = w - 1; x >= cropLeft; x--) {
          for (let y = cropTop; y < cropBottom; y++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropRight = x + 1; break rightScan; }
          }
        }
      }

      // Add a small padding around the crop (in canvas pixels)
      const cropPad = 15;
      cropTop = Math.max(0, cropTop - cropPad);
      cropLeft = Math.max(0, cropLeft - cropPad);
      cropRight = Math.min(canvas.width, cropRight + cropPad);
      cropBottom = Math.min(canvas.height, cropBottom + cropPad);

      const cropW = cropRight - cropLeft;
      const cropH = cropBottom - cropTop;

      // Create cropped canvas
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const croppedCtx = croppedCanvas.getContext('2d')!;
      croppedCtx.drawImage(canvas, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

      const imgData = croppedCanvas.toDataURL('image/png');

      // Calculate aspect ratio to fit within the drawable area
      const imgAspect = cropW / cropH;
      const drawAspect = drawW / drawH;

      let finalW: number, finalH: number;
      if (imgAspect > drawAspect) {
        finalW = drawW;
        finalH = drawW / imgAspect;
      } else {
        finalH = drawH;
        finalW = drawH * imgAspect;
      }

      // Center horizontally and vertically
      const offsetX = MARGIN + (drawW - finalW) / 2;
      const offsetY = MARGIN + HEADER_H + 1 + (drawH - finalH) / 2;

      // Create PDF
      const doc = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
      });

      // Header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${budgetName}  —  ${floorName}`, MARGIN, MARGIN + 6);

      // Separator line
      doc.setDrawColor(180, 180, 180);
      doc.line(MARGIN, MARGIN + HEADER_H, A4_W - MARGIN, MARGIN + HEADER_H);

      // Draw the floor plan image
      doc.addImage(imgData, 'PNG', offsetX, offsetY, finalW, finalH);

      // Save
      const filename = `Plano_${budgetName}_${floorName}.pdf`.replace(/\s+/g, '_');
      doc.save(filename);
      toast.success('PDF exportado correctamente');
      setOpen(false);
    } catch (err) {
      console.error('Error exporting floor plan PDF:', err);
      toast.error('Error al exportar el PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4 mr-1" /> Imprimir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Plano a PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Presupuesto: <strong>{budgetName}</strong></p>
              <p className="text-sm text-muted-foreground">Nivel: <strong>{floorName}</strong></p>
            </div>
            <div>
              <Label className="text-sm font-medium">Orientación</Label>
              <RadioGroup value={orientation} onValueChange={(v) => setOrientation(v as 'landscape' | 'portrait')} className="mt-2 space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="landscape" id="landscape" />
                  <Label htmlFor="landscape" className="text-sm cursor-pointer">Horizontal (apaisado)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="portrait" id="portrait" />
                  <Label htmlFor="portrait" className="text-sm cursor-pointer">Vertical</Label>
                </div>
              </RadioGroup>
            </div>
            <p className="text-xs text-muted-foreground">Formato: DIN A4 · Márgenes: 5 mm · Tamaño máximo</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
