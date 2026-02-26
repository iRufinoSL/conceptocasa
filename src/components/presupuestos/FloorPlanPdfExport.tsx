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
      const MARGIN = 10; // 1cm margins
      const HEADER_H = 14; // header height in mm

      const drawW = A4_W - 2 * MARGIN;
      const drawH = A4_H - 2 * MARGIN - HEADER_H;

      // Temporarily set overflow visible so html2canvas captures top/left dims
      const scrollEl = container.querySelector('.overflow-auto');
      const origOverflow = scrollEl ? (scrollEl as HTMLElement).style.overflow : '';
      if (scrollEl) (scrollEl as HTMLElement).style.overflow = 'visible';

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      if (scrollEl) (scrollEl as HTMLElement).style.overflow = origOverflow;

      const imgData = canvas.toDataURL('image/png');

      // Calculate aspect ratio to fit within the drawable area
      const imgAspect = canvas.width / canvas.height;
      const drawAspect = drawW / drawH;

      let finalW: number, finalH: number;
      if (imgAspect > drawAspect) {
        // Image is wider - fit to width
        finalW = drawW;
        finalH = drawW / imgAspect;
      } else {
        // Image is taller - fit to height
        finalH = drawH;
        finalW = drawH * imgAspect;
      }

      // Center horizontally
      const offsetX = MARGIN + (drawW - finalW) / 2;
      const offsetY = MARGIN + HEADER_H + 1;

      // Create PDF
      const doc = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
      });

      // Header
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(`Presupuesto: ${budgetName}`, MARGIN, MARGIN + 6);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nivel: ${floorName}`, MARGIN, MARGIN + 12);

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
            <p className="text-xs text-muted-foreground">Formato: DIN A4 · Márgenes: 1 cm por lado</p>
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
