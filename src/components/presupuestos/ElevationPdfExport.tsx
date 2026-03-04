import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FileDown, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface ElevationPdfExportProps {
  /** Title shown in the PDF header */
  title: string;
  /** Subtitle / secondary info */
  subtitle?: string;
  /** Ref to the container to capture */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Button size variant */
  size?: 'sm' | 'default';
  /** Custom button className */
  className?: string;
}

export function ElevationPdfExport({ title, subtitle, containerRef, size = 'sm', className }: ElevationPdfExportProps) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [scalePct, setScalePct] = useState(100);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const container = containerRef.current;
    if (!container) {
      toast.error('No se encontró el alzado para exportar');
      return;
    }

    setExporting(true);
    try {
      const A4_W = orientation === 'landscape' ? 297 : 210;
      const A4_H = orientation === 'landscape' ? 210 : 297;
      const MARGIN = 5;
      const HEADER_H = 10;
      const drawW = A4_W - 2 * MARGIN;
      const drawH = A4_H - 2 * MARGIN - HEADER_H;

      // Save original styles
      const origOverflow = container.style.overflow;
      const origWidth = container.style.width;
      const origHeight = container.style.height;
      const origMaxHeight = container.style.maxHeight;
      const origPosition = container.style.position;

      const fullW = container.scrollWidth;
      const fullH = container.scrollHeight;

      container.style.overflow = 'visible';
      container.style.width = fullW + 'px';
      container.style.height = fullH + 'px';
      container.style.maxHeight = 'none';
      container.style.position = 'relative';

      // Remove parent overflow constraints
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

      // Restore styles
      container.style.overflow = origOverflow;
      container.style.width = origWidth;
      container.style.height = origHeight;
      container.style.maxHeight = origMaxHeight;
      container.style.position = origPosition;
      parentOverrides.forEach(({ el, orig }) => { el.style.overflow = orig; });

      // Auto-crop whitespace
      const ctx = canvas.getContext('2d');
      let cropTop = 0, cropLeft = 0, cropRight = canvas.width, cropBottom = canvas.height;
      if (ctx) {
        const imgDataRaw = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgDataRaw.data;
        const w = canvas.width, h = canvas.height;
        topScan: for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropTop = y; break topScan; }
          }
        }
        bottomScan: for (let y = h - 1; y >= cropTop; y--) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropBottom = y + 1; break bottomScan; }
          }
        }
        leftScan: for (let x = 0; x < w; x++) {
          for (let y = cropTop; y < cropBottom; y++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropLeft = x; break leftScan; }
          }
        }
        rightScan: for (let x = w - 1; x >= cropLeft; x--) {
          for (let y = cropTop; y < cropBottom; y++) {
            const i = (y * w + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { cropRight = x + 1; break rightScan; }
          }
        }
      }

      const cropPad = 15;
      cropTop = Math.max(0, cropTop - cropPad);
      cropLeft = Math.max(0, cropLeft - cropPad);
      cropRight = Math.min(canvas.width, cropRight + cropPad);
      cropBottom = Math.min(canvas.height, cropBottom + cropPad);

      const cropW = cropRight - cropLeft;
      const cropH = cropBottom - cropTop;

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const croppedCtx = croppedCanvas.getContext('2d')!;
      croppedCtx.drawImage(canvas, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

      const imgData = croppedCanvas.toDataURL('image/png');

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

      const userScale = scalePct / 100;
      finalW *= userScale;
      finalH *= userScale;

      const offsetX = MARGIN + (drawW - finalW) / 2;
      const offsetY = MARGIN + HEADER_H + 1 + (drawH - finalH) / 2;

      const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

      // Header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(title, MARGIN, MARGIN + 6);
      if (subtitle) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(subtitle, MARGIN, MARGIN + 10);
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Escala: ${scalePct}%`, A4_W - MARGIN, MARGIN + 6, { align: 'right' });

      // Separator
      doc.setDrawColor(180, 180, 180);
      doc.line(MARGIN, MARGIN + HEADER_H, A4_W - MARGIN, MARGIN + HEADER_H);

      // Image
      doc.addImage(imgData, 'PNG', offsetX, offsetY, finalW, finalH);

      const filename = `Alzado_${title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
      toast.success('PDF exportado correctamente');
      setOpen(false);
    } catch (err) {
      console.error('Error exporting elevation PDF:', err);
      toast.error('Error al exportar el PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className || "h-7 text-xs gap-1"}
        onClick={() => setOpen(true)}
      >
        <FileDown className="h-3 w-3" /> Exportar PDF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Alzado a PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Alzado: <strong>{title}</strong></p>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium">Orientación</Label>
              <RadioGroup value={orientation} onValueChange={(v) => setOrientation(v as 'landscape' | 'portrait')} className="mt-2 space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="landscape" id="elev-landscape" />
                  <Label htmlFor="elev-landscape" className="text-sm cursor-pointer">Horizontal (apaisado)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="portrait" id="elev-portrait" />
                  <Label htmlFor="elev-portrait" className="text-sm cursor-pointer">Vertical</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label className="text-sm font-medium">Escala de impresión</Label>
              <div className="flex items-center gap-3 mt-2">
                {[50, 75, 100, 125, 150, 200].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={scalePct === v ? 'default' : 'outline'}
                    className="text-xs px-2 py-1"
                    onClick={() => setScalePct(v)}
                  >
                    {v}%
                  </Button>
                ))}
                <Input
                  type="number"
                  min={25}
                  max={400}
                  value={scalePct}
                  onChange={(e) => setScalePct(Math.max(25, Math.min(400, Number(e.target.value) || 100)))}
                  className="w-20 h-8 text-sm text-center"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valores &gt;100% amplían el alzado · &lt;100% lo reducen</p>
            </div>
            <p className="text-xs text-muted-foreground">Formato: DIN A4 · Márgenes: 5 mm · Auto-crop activado</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
