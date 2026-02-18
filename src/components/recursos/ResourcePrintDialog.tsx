import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalResource } from '@/types/resource';
import { formatCurrency } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { Printer, FileDown, Mail, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ResourcePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: ExternalResource[];
  getEffectiveCost: (resource: ExternalResource) => number;
  onSendEmail: (selectedResources: ExternalResource[], headerText: string, pdfBlob: Blob) => void;
}

export function ResourcePrintDialog({
  open,
  onOpenChange,
  resources,
  getEffectiveCost,
  onSendEmail,
}: ResourcePrintDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [headerText, setHeaderText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const sortedResources = useMemo(
    () => [...resources].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [resources]
  );

  const filteredResources = useMemo(
    () => sortedResources.filter((r) =>
      searchMatch(r.name, searchTerm) ||
      searchMatch(r.description, searchTerm)
    ),
    [sortedResources, searchTerm]
  );

  const allSelected = filteredResources.length > 0 && filteredResources.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredResources.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredResources.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedResources = sortedResources.filter((r) => selectedIds.has(r.id));

  const buildPdf = (): jsPDF => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const title = headerText.trim() || 'Listado de Recursos';
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxTextWidth = pageWidth - margin * 2;

    // Header – wrap long titles to fit within page width
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const titleLines: string[] = doc.splitTextToSize(title, maxTextWidth);
    doc.text(titleLines, margin, 18);

    const titleHeight = titleLines.length * 7; // ~7mm per line at font-size 16
    const subtitleY = 18 + titleHeight;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`${selectedResources.length} recurso(s) · ${new Date().toLocaleDateString('es-ES')}`, margin, subtitleY);
    doc.setTextColor(0);

    const rows = selectedResources.map((r) => [
      r.name,
      r.description || '—',
      formatCurrency(getEffectiveCost(r)),
    ]);

    autoTable(doc, {
      startY: subtitleY + 5,
      head: [['Nombre', 'Descripción', 'Coste']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [30, 30, 30],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [180, 180, 180],
      },
      columnStyles: {
        0: { cellWidth: 70 },
        2: { halign: 'right', cellWidth: 35 },
      },
      didDrawPage: (data) => {
        // Footer
        const pageCount = doc.getNumberOfPages();
        const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor(130);
        doc.text(
          `Página ${pageNum} / ${pageCount}`,
          doc.internal.pageSize.getWidth() - 14,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'right' }
        );
        // Repeat header on every page (wrapped)
        if (data.pageNumber > 1) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);
          const repeatLines: string[] = doc.splitTextToSize(title, maxTextWidth);
          doc.text(repeatLines, margin, 12);
        }
      },
    });

    return doc;
  };

  const handlePrint = () => {
    if (selectedResources.length === 0) return;
    const doc = buildPdf();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    if (w) {
      w.onload = () => {
        w.print();
      };
    }
  };

  const handleExportPdf = () => {
    if (selectedResources.length === 0) return;
    const doc = buildPdf();
    const fileName = headerText.trim()
      ? headerText.trim().replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, '_')
      : 'Listado_Recursos';
    doc.save(`${fileName}.pdf`);
  };

  const handleEmailClick = () => {
    if (selectedResources.length === 0) return;
    const doc = buildPdf();
    const blob = doc.output('blob');
    onSendEmail(selectedResources, headerText.trim() || 'Listado de Recursos', blob);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimir / Exportar Recursos
          </DialogTitle>
          <DialogDescription>
            Selecciona los recursos que quieres incluir en el listado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Custom header */}
          <div className="space-y-1.5 flex-shrink-0">
            <Label htmlFor="list-header">Cabecera del listado</Label>
            <Input
              id="list-header"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Introduce el título del listado..."
            />
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar recursos..."
              className="pl-10"
            />
          </div>

          {/* Resource selection table */}
          <ScrollArea className="border rounded-lg" style={{ height: 'clamp(200px, 40vh, 400px)' }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Descripción</TableHead>
                  <TableHead className="text-right">Coste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(resource.id)}
                        onCheckedChange={() => toggleOne(resource.id)}
                        aria-label={`Seleccionar ${resource.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{resource.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm line-clamp-1 max-w-[300px]">
                      {resource.description || '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatCurrency(getEffectiveCost(resource))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <p className="text-sm text-muted-foreground flex-shrink-0">
            {selectedIds.size} de {sortedResources.length} recursos seleccionados
          </p>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={selectedIds.size === 0}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={selectedIds.size === 0}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
          <Button
            onClick={handleEmailClick}
            disabled={selectedIds.size === 0}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Enviar por Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
