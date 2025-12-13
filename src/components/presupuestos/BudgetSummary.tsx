import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { Calculator, TrendingUp, Percent, Euro, Package, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface BudgetResource {
  id: string;
  name: string;
  description: string | null;
  resource_type: string | null;
  unit: string | null;
  manual_units: number | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
}

interface BudgetSummaryProps {
  budgetId: string;
  budgetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format for PDF (simpler format without symbols)
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €';
};

export function BudgetSummary({ budgetId, budgetName, open, onOpenChange }: BudgetSummaryProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && budgetId) {
      fetchResources();
    }
  }, [open, budgetId]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name');

      if (error) throw error;
      setResources(data || []);
    } catch (error) {
      console.error('Error fetching budget resources:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const calculations = useMemo(() => {
    let totalBaseCost = 0;
    let totalWithSafety = 0;
    let totalWithMargins = 0;

    const resourceDetails = resources.map(resource => {
      const units = resource.manual_units || 0;
      const unitCost = resource.external_unit_cost || 0;
      const safetyPercent = resource.safety_margin_percent ?? 15;
      const salesPercent = resource.sales_margin_percent ?? 25;

      const baseCost = units * unitCost;
      const withSafety = baseCost * (1 + safetyPercent / 100);
      const withMargins = withSafety * (1 + salesPercent / 100);

      totalBaseCost += baseCost;
      totalWithSafety += withSafety;
      totalWithMargins += withMargins;

      return {
        ...resource,
        units,
        unitCost,
        safetyPercent,
        salesPercent,
        baseCost,
        withSafety,
        withMargins
      };
    });

    // Group by resource type
    const byType = resourceDetails.reduce((acc, r) => {
      const type = r.resource_type || 'Sin tipo';
      if (!acc[type]) {
        acc[type] = { count: 0, total: 0 };
      }
      acc[type].count++;
      acc[type].total += r.withMargins;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return {
      resources: resourceDetails,
      totalBaseCost,
      totalWithSafety,
      totalWithMargins,
      totalSafetyMargin: totalWithSafety - totalBaseCost,
      totalSalesMargin: totalWithMargins - totalWithSafety,
      byType,
      resourceCount: resources.length
    };
  }, [resources]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen de Presupuesto', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(budgetName, pageWidth / 2, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 35, { align: 'center' });
    doc.setTextColor(0);

    // Summary section
    let yPos = 50;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General', 14, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryData = [
      ['Total de recursos:', calculations.resourceCount.toString()],
      ['Coste base:', formatPdfCurrency(calculations.totalBaseCost)],
      ['Margen de seguridad:', formatPdfCurrency(calculations.totalSafetyMargin)],
      ['Margen comercial:', formatPdfCurrency(calculations.totalSalesMargin)],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total PVP highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94); // Green
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PVP:', 18, yPos + 3);
    doc.text(formatPdfCurrency(calculations.totalWithMargins), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    // Breakdown by type
    if (Object.keys(calculations.byType).length > 0) {
      yPos += 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Desglose por Tipo de Recurso', 14, yPos);
      
      yPos += 8;
      const typeData = Object.entries(calculations.byType).map(([type, data]) => [
        type,
        data.count.toString(),
        formatPdfCurrency(data.total)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Tipo', 'Cantidad', 'Total']],
        body: typeData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Resource details table
    if (calculations.resources.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle de Recursos', 14, yPos);
      
      const tableData = calculations.resources.map(r => [
        r.name,
        r.resource_type || '-',
        `${formatNumber(r.units)} ${r.unit || ''}`.trim(),
        formatPdfCurrency(r.unitCost),
        `${formatNumber(r.safetyPercent, 0)}%`,
        `${formatNumber(r.salesPercent, 0)}%`,
        formatPdfCurrency(r.withMargins)
      ]);
      
      // Add total row
      tableData.push([
        { content: 'TOTAL PVP', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } } as any,
        { content: formatPdfCurrency(calculations.totalWithMargins), styles: { fontStyle: 'bold' } } as any
      ]);
      
      autoTable(doc, {
        startY: yPos + 5,
        head: [['Recurso', 'Tipo', 'Uds.', 'Coste/Ud.', 'Seg.', 'Margen', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 25 },
          2: { cellWidth: 20, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 15, halign: 'right' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 30, halign: 'right' },
        },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Save
    const fileName = `presupuesto_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Resumen de Presupuesto: {budgetName}
            </DialogTitle>
            {!loading && calculations.resourceCount > 0 && (
              <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-2">
                <FileDown className="h-4 w-4" />
                Exportar PDF
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{calculations.resourceCount}</p>
                      <p className="text-xs text-muted-foreground">Recursos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-500/5 border-slate-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-500/10">
                      <Euro className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                      <p className="text-xs text-muted-foreground">Coste base</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Percent className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalSafetyMargin + calculations.totalSalesMargin)}</p>
                      <p className="text-xs text-muted-foreground">Márgenes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalWithMargins)}</p>
                      <p className="text-xs text-muted-foreground">Total PVP</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by Type */}
            {Object.keys(calculations.byType).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose por tipo de recurso</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calculations.byType).map(([type, data]) => (
                      <Badge key={type} variant="outline" className="text-sm py-1 px-3">
                        {type}: {data.count} ({formatCurrency(data.total)})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resource Details Table */}
            {calculations.resources.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Detalle de recursos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recurso</TableHead>
                          <TableHead className="text-right">Uds.</TableHead>
                          <TableHead className="text-right">Coste/Ud.</TableHead>
                          <TableHead className="text-right">Seguridad</TableHead>
                          <TableHead className="text-right">Margen</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculations.resources.map((resource) => (
                          <TableRow key={resource.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{resource.name}</p>
                                {resource.resource_type && (
                                  <p className="text-xs text-muted-foreground">{resource.resource_type}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.units)} {resource.unit || ''}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(resource.unitCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.safetyPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.salesPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(resource.withMargins)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={5} className="text-right">
                            TOTAL PVP
                          </TableCell>
                          <TableCell className="text-right font-mono text-lg">
                            {formatCurrency(calculations.totalWithMargins)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Este presupuesto no tiene recursos definidos
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Margin Breakdown */}
            {calculations.resourceCount > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose de márgenes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Coste base (sin márgenes)</p>
                      <p className="text-xl font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen de seguridad</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatCurrency(calculations.totalSafetyMargin)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen comercial</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(calculations.totalSalesMargin)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Precio de venta total (PVP)</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(calculations.totalWithMargins)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
