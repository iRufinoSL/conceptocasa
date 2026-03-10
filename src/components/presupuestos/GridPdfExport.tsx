import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface GridPdfExportProps {
  /** Title line 1 (budget name or context) */
  title: string;
  /** Title line 2 (section/workspace name) */
  subtitle: string;
  /** Ref to the scrollable container wrapping the SVG grid */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Button size variant */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Horizontal axis label (e.g. "X", "Y") */
  hAxisLabel?: string;
  /** Vertical axis label (e.g. "Z", "Y") */
  vAxisLabel?: string;
  /** Horizontal scale in mm */
  scaleH?: number;
  /** Vertical scale in mm */
  scaleV?: number;
}

export function GridPdfExport({ title, subtitle, containerRef, size = 'sm', hAxisLabel, vAxisLabel, scaleH, scaleV }: GridPdfExportProps) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [scalePct, setScalePct] = useState(100);
  const [exporting, setExporting] = useState(false);

  // Print options
  const [showWallNumbers, setShowWallNumbers] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showWorkspaceNames, setShowWorkspaceNames] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showVertexLabels, setShowVertexLabels] = useState(true);

  const handleExport = async () => {
    const container = containerRef.current;
    if (!container) {
      toast.error('No se encontró el contenido para exportar');
      return;
    }

    setExporting(true);
    try {
      const A4_W = orientation === 'landscape' ? 297 : 210;
      const A4_H = orientation === 'landscape' ? 210 : 297;
      const MARGIN = 5;
      const HEADER_H = 14;

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

      // Toggle visibility based on print options using data attributes
      const hiddenElements: { el: Element; orig: string }[] = [];
      const toggleElements = (selector: string, show: boolean) => {
        container.querySelectorAll(selector).forEach(el => {
          const htmlEl = el as HTMLElement;
          if (!show) {
            hiddenElements.push({ el, orig: htmlEl.style.display });
            htmlEl.style.display = 'none';
          }
        });
      };

      toggleElements('[data-pdf-wall-number]', showWallNumbers);
      toggleElements('[data-pdf-dimension]', showDimensions);
      toggleElements('[data-pdf-workspace-name]', showWorkspaceNames);
      toggleElements('[data-pdf-axis-label]', showAxes);
      toggleElements('[data-pdf-vertex-label]', showVertexLabels);

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

      // Restore hidden elements
      hiddenElements.forEach(({ el, orig }) => {
        (el as HTMLElement).style.display = orig;
      });

      // Restore styles
      container.style.overflow = origOverflow;
      container.style.width = origWidth;
      container.style.height = origHeight;
      container.style.maxHeight = origMaxHeight;
      container.style.position = origPosition;
      parentOverrides.forEach(({ el, orig }) => { el.style.overflow = orig; });

      // Auto-crop with generous padding for external measurements
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

      // Generous padding to include all external measurement lines
      const cropPad = 50;
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
      if (imgAspect > drawAspect) { finalW = drawW; finalH = drawW / imgAspect; }
      else { finalH = drawH; finalW = drawH * imgAspect; }

      const userScale = scalePct / 100;
      finalW *= userScale;
      finalH *= userScale;

      const offsetX = MARGIN + (drawW - finalW) / 2;
      const offsetY = MARGIN + HEADER_H + 1 + (drawH - finalH) / 2;

      const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

      // Header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${title}  —  ${subtitle}`, MARGIN, MARGIN + 5);

      // Scale info with concrete measurements
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const scaleLabel = buildScaleLabel(hAxisLabel, vAxisLabel, scaleH, scaleV);
      doc.text(scaleLabel, MARGIN, MARGIN + 9);

      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      doc.text(`Impresión: ${scalePct}%  ·  ${dateStr}`, A4_W - MARGIN, MARGIN + 5, { align: 'right' });

      doc.setDrawColor(180, 180, 180);
      doc.line(MARGIN, MARGIN + HEADER_H - 2, A4_W - MARGIN, MARGIN + HEADER_H - 2);

      doc.addImage(imgData, 'PNG', offsetX, offsetY, finalW, finalH);

      const filename = `${title}_${subtitle}.pdf`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]/g, '_').replace(/_+/g, '_');
      doc.save(filename);
      toast.success('PDF exportado correctamente');
      setOpen(false);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast.error('Error al exportar el PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)} className="gap-1">
        <Printer className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-xs">PDF</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Exportar Sección a PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">{title}</p>
              <p className="text-xs font-medium">{subtitle}</p>
              {(scaleH || scaleV) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {buildScaleLabel(hAxisLabel, vAxisLabel, scaleH, scaleV)}
                </p>
              )}
            </div>

            {/* Print options */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Opciones de impresión</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={showDimensions} onCheckedChange={(v) => setShowDimensions(!!v)} />
                  Dimensiones (mm)
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={showWallNumbers} onCheckedChange={(v) => setShowWallNumbers(!!v)} />
                  Números de pared
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={showWorkspaceNames} onCheckedChange={(v) => setShowWorkspaceNames(!!v)} />
                  Nombres de espacios
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={showAxes} onCheckedChange={(v) => setShowAxes(!!v)} />
                  Ejes de coordenadas
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={showVertexLabels} onCheckedChange={(v) => setShowVertexLabels(!!v)} />
                  Etiquetas de vértice
                </label>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Orientación</Label>
              <RadioGroup value={orientation} onValueChange={(v) => setOrientation(v as any)} className="mt-1.5 space-y-1.5">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="landscape" id="gl" />
                  <Label htmlFor="gl" className="text-xs cursor-pointer">Horizontal (apaisado)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="portrait" id="gp" />
                  <Label htmlFor="gp" className="text-xs cursor-pointer">Vertical</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs font-medium">Escala de impresión</Label>
              <div className="flex items-center gap-2 mt-1.5">
                {[100, 150, 200].map((v) => (
                  <Button key={v} type="button" size="sm" variant={scalePct === v ? 'default' : 'outline'}
                    className="text-[10px] px-2 h-6" onClick={() => setScalePct(v)}>
                    {v}%
                  </Button>
                ))}
                <Input type="number" min={25} max={400} value={scalePct}
                  onChange={(e) => setScalePct(Math.max(25, Math.min(400, Number(e.target.value) || 100)))}
                  className="w-16 h-6 text-xs text-center" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Printer className="h-3.5 w-3.5 mr-1" />}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildScaleLabel(hAxisLabel?: string, vAxisLabel?: string, scaleH?: number, scaleV?: number): string {
  const parts: string[] = [];
  if (hAxisLabel && scaleH) parts.push(`Escala ${hAxisLabel}=${scaleH}mm`);
  if (vAxisLabel && scaleV) parts.push(`Escala ${vAxisLabel}=${scaleV}mm`);
  return parts.length > 0 ? parts.join(', ') : '';
}
