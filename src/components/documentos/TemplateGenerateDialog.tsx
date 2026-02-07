import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Plus, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  TextRun,
  BorderStyle,
  ImageRun,
  SectionType,
} from 'docx';
import { supabase } from '@/integrations/supabase/client';

interface Template {
  id: string;
  name: string;
  page_count: number;
  page_image_paths: string[];
}

interface Zone {
  id: string;
  page_number: number;
  zone_x: number;
  zone_y: number;
  zone_width: number;
  zone_height: number;
  table_headers: string[];
  default_data: string[][];
  font_family: string;
  font_size: number;
}

interface TemplateGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template;
  zone: Zone;
  pageImageUrl: string | null;
}

export function TemplateGenerateDialog({
  open,
  onOpenChange,
  template,
  zone,
  pageImageUrl,
}: TemplateGenerateDialogProps) {
  const [outputName, setOutputName] = useState(template.name + ' - Editado');
  const [headers] = useState<string[]>(zone.table_headers);
  const [tableData, setTableData] = useState<string[][]>(
    zone.default_data.length > 0 ? zone.default_data.map((r) => [...r]) : [new Array(zone.table_headers.length).fill('')]
  );
  const [generating, setGenerating] = useState(false);

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setTableData((prev) => {
      const updated = prev.map((r) => [...r]);
      updated[rowIdx][colIdx] = value;
      return updated;
    });
  };

  const addRow = () => {
    setTableData((prev) => [...prev, new Array(headers.length).fill('')]);
  };

  const removeRow = (idx: number) => {
    if (tableData.length <= 1) return;
    setTableData((prev) => prev.filter((_, i) => i !== idx));
  };

  const loadImageAsDataUrl = useCallback(async (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  const loadImageAsArrayBuffer = useCallback(async (url: string): Promise<{ buffer: ArrayBuffer; width: number; height: number }> => {
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
          if (!blob) return reject(new Error('Failed to convert canvas to blob'));
          blob.arrayBuffer().then((buffer) => {
            resolve({ buffer, width: img.naturalWidth, height: img.naturalHeight });
          });
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  const generatePdf = async () => {
    if (!pageImageUrl) {
      toast.error('No se pudo cargar la imagen de la página');
      return;
    }

    setGenerating(true);
    try {
      // Load all page images
      const allPageUrls: string[] = [];
      for (let i = 0; i < template.page_count; i++) {
        const path = template.page_image_paths[i];
        if (!path) continue;
        const { data, error } = await supabase.storage
          .from('project-documents')
          .createSignedUrl(path, 600);
        if (error) throw error;
        allPageUrls.push(data.signedUrl);
      }

      if (allPageUrls.length === 0) throw new Error('No page images found');

      // Load first image to determine dimensions
      const firstDataUrl = await loadImageAsDataUrl(allPageUrls[0]);
      const tempImg = new Image();
      await new Promise<void>((resolve) => {
        tempImg.onload = () => resolve();
        tempImg.src = firstDataUrl;
      });

      const imgW = tempImg.naturalWidth;
      const imgH = tempImg.naturalHeight;
      const isLandscape = imgW > imgH;

      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfW = doc.internal.pageSize.getWidth();
      const pdfH = doc.internal.pageSize.getHeight();

      for (let pageIdx = 0; pageIdx < allPageUrls.length; pageIdx++) {
        if (pageIdx > 0) doc.addPage();

        const dataUrl = pageIdx === 0 ? firstDataUrl : await loadImageAsDataUrl(allPageUrls[pageIdx]);
        doc.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);

        // If this page has the zone, overlay the edited table
        if (pageIdx === zone.page_number - 1) {
          const zx = (zone.zone_x / 100) * pdfW;
          const zy = (zone.zone_y / 100) * pdfH;
          const zw = (zone.zone_width / 100) * pdfW;
          const zh = (zone.zone_height / 100) * pdfH;

          // White out zone
          doc.setFillColor(255, 255, 255);
          doc.rect(zx, zy, zw, zh, 'F');

          // Draw table
          autoTable(doc, {
            startY: zy + 0.5,
            margin: { left: zx + 0.5, right: pdfW - (zx + zw) + 0.5 },
            tableWidth: zw - 1,
            head: [headers],
            body: tableData,
            styles: {
              fontSize: zone.font_size,
              cellPadding: 0.8,
              font: 'helvetica',
              lineWidth: 0.1,
              lineColor: [0, 0, 0],
            },
            headStyles: {
              fillColor: [240, 240, 240],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              fontSize: zone.font_size,
            },
            theme: 'grid',
          });
        }
      }

      // Download PDF
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${outputName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF generado correctamente');
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error(err?.message || 'Error al generar el PDF');
    } finally {
      setGenerating(false);
    }
  };

  const generateWord = async () => {
    if (!pageImageUrl) {
      toast.error('No se pudo cargar la imagen de la página');
      return;
    }

    setGenerating(true);
    try {
      // Load page image for the zone's page
      const pageImagePath = template.page_image_paths[zone.page_number - 1];
      if (!pageImagePath) throw new Error('Page image not found');

      const { data: signedData, error: signedError } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(pageImagePath, 600);
      if (signedError) throw signedError;

      const { buffer, width, height } = await loadImageAsArrayBuffer(signedData.signedUrl);

      // Build table rows for docx
      const docxHeaderRow = new DocxTableRow({
        children: headers.map(
          (h) =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: zone.font_size * 2 })] })],
              width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
            })
        ),
      });

      const docxDataRows = tableData.map(
        (row) =>
          new DocxTableRow({
            children: row.map(
              (cell) =>
                new DocxTableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: cell, size: zone.font_size * 2 })] })],
                  width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
                })
            ),
          })
      );

      const docxTable = new DocxTable({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [docxHeaderRow, ...docxDataRows],
      });

      // Build Word document with page image + table
      const doc = new Document({
        sections: [
          {
            properties: {
              type: SectionType.CONTINUOUS,
            },
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: buffer,
                    transformation: {
                      width: 595, // A4 width in points approximately
                      height: Math.round((595 / width) * height),
                    },
                    type: 'png',
                  }),
                ],
              }),
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [new TextRun({ text: 'Datos editados:', bold: true, size: 24 })],
              }),
              docxTable,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${outputName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Documento Word generado correctamente');
    } catch (err: any) {
      console.error('Error generating Word:', err);
      toast.error(err?.message || 'Error al generar el Word');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generar documento desde plantilla
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Output name */}
          <div className="space-y-2">
            <Label>Nombre del documento generado</Label>
            <Input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="Nombre del archivo..."
            />
          </div>

          {/* Preview */}
          {pageImageUrl && (
            <div className="relative border rounded-lg overflow-hidden max-h-[200px]">
              <img src={pageImageUrl} alt="Vista previa" className="w-full h-auto opacity-60" />
              <div
                className="absolute border-2 border-primary bg-primary/20"
                style={{
                  left: `${zone.zone_x}%`,
                  top: `${zone.zone_y}%`,
                  width: `${zone.zone_width}%`,
                  height: `${zone.zone_height}%`,
                }}
              />
            </div>
          )}

          {/* Editable table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Datos de la tabla</Label>
              <Button size="sm" variant="outline" onClick={addRow} className="gap-1">
                <Plus className="h-3 w-3" />
                Añadir fila
              </Button>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h, i) => (
                      <TableHead key={i} className="text-xs">
                        {h}
                      </TableHead>
                    ))}
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData.map((row, ri) => (
                    <TableRow key={ri}>
                      {row.map((cell, ci) => (
                        <TableCell key={ci} className="p-1">
                          <Input
                            value={cell}
                            onChange={(e) => updateCell(ri, ci, e.target.value)}
                            className="h-8 text-xs"
                            placeholder={headers[ci]}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="p-1">
                        {tableData.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeRow(ri)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={generatePdf}
            disabled={generating}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {generating ? 'Generando...' : 'Descargar PDF'}
          </Button>
          <Button
            onClick={generateWord}
            disabled={generating}
            variant="secondary"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {generating ? 'Generando...' : 'Descargar Word'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
