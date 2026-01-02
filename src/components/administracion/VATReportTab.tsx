import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Scale, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AccountingEntry {
  id: string;
  code: string;
  description: string;
  entry_date: string;
  entry_type: string | null;
  total_amount: number;
  vat_rate: number | null;
  supplier_id: string | null;
  supplier?: { name: string; surname: string | null } | null;
}

interface VATSummary {
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  entries: AccountingEntry[];
}

interface PeriodData {
  ivaSoportado: VATSummary;
  ivaRepercutido: VATSummary;
  resultado: number;
}

const QUARTERS = [
  { value: 'Q1', label: '1º Trimestre (Ene-Mar)', months: [0, 1, 2] },
  { value: 'Q2', label: '2º Trimestre (Abr-Jun)', months: [3, 4, 5] },
  { value: 'Q3', label: '3º Trimestre (Jul-Sep)', months: [6, 7, 8] },
  { value: 'Q4', label: '4º Trimestre (Oct-Dic)', months: [9, 10, 11] },
];

const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export function VATReportTab() {
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [periodType, setPeriodType] = useState<'month' | 'quarter'>('quarter');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Q1');

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  }, []);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select(`
          id,
          code,
          description,
          entry_date,
          entry_type,
          total_amount,
          vat_rate,
          supplier_id,
          supplier:crm_contacts(name, surname)
        `)
        .in('entry_type', ['compra', 'venta'])
        .order('entry_date', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching entries:', error);
      toast.error('Error al cargar los asientos');
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo((): PeriodData => {
    const yearNum = parseInt(year);
    
    let startDate: Date;
    let endDate: Date;

    if (periodType === 'quarter') {
      const quarter = QUARTERS.find(q => q.value === selectedPeriod);
      if (!quarter) {
        startDate = new Date(yearNum, 0, 1);
        endDate = new Date(yearNum, 2, 31);
      } else {
        startDate = new Date(yearNum, quarter.months[0], 1);
        endDate = new Date(yearNum, quarter.months[2] + 1, 0);
      }
    } else {
      const monthNum = parseInt(selectedPeriod) - 1;
      startDate = new Date(yearNum, monthNum, 1);
      endDate = new Date(yearNum, monthNum + 1, 0);
    }

    const filteredEntries = entries.filter(entry => {
      const entryDate = new Date(entry.entry_date);
      return entryDate >= startDate && entryDate <= endDate;
    });

    const compras = filteredEntries.filter(e => e.entry_type === 'compra');
    const ventas = filteredEntries.filter(e => e.entry_type === 'venta');

    const calculateSummary = (entries: AccountingEntry[]): VATSummary => {
      let baseImponible = 0;
      let cuotaIVA = 0;

      entries.forEach(entry => {
        const vatRate = entry.vat_rate || 21;
        const total = entry.total_amount;
        const base = total / (1 + vatRate / 100);
        const iva = total - base;

        baseImponible += base;
        cuotaIVA += iva;
      });

      return {
        baseImponible,
        cuotaIVA,
        total: baseImponible + cuotaIVA,
        entries
      };
    };

    const ivaSoportado = calculateSummary(compras);
    const ivaRepercutido = calculateSummary(ventas);
    const resultado = ivaRepercutido.cuotaIVA - ivaSoportado.cuotaIVA;

    return { ivaSoportado, ivaRepercutido, resultado };
  }, [entries, year, periodType, selectedPeriod]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const getPeriodLabel = () => {
    if (periodType === 'quarter') {
      const quarter = QUARTERS.find(q => q.value === selectedPeriod);
      return quarter?.label || '';
    } else {
      const month = MONTHS.find(m => m.value === selectedPeriod);
      return month?.label || '';
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME DE IVA', pageWidth / 2, 20, { align: 'center' });
      
      // Period info
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Período: ${getPeriodLabel()} ${year}`, pageWidth / 2, 30, { align: 'center' });
      doc.text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, pageWidth / 2, 37, { align: 'center' });
      
      let yPos = 50;

      // Summary section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN', 14, yPos);
      yPos += 8;

      const summaryData = [
        ['IVA Repercutido (Ventas)', formatCurrency(filteredData.ivaRepercutido.baseImponible), formatCurrency(filteredData.ivaRepercutido.cuotaIVA)],
        ['IVA Soportado (Compras)', formatCurrency(filteredData.ivaSoportado.baseImponible), formatCurrency(filteredData.ivaSoportado.cuotaIVA)],
        ['RESULTADO A LIQUIDAR', '', formatCurrency(filteredData.resultado)],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Base Imponible', 'Cuota IVA']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 10 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // IVA Soportado detail
      if (filteredData.ivaSoportado.entries.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE IVA SOPORTADO (COMPRAS)', 14, yPos);
        yPos += 6;

        const comprasData = filteredData.ivaSoportado.entries.map(entry => {
          const vatRate = entry.vat_rate || 21;
          const base = entry.total_amount / (1 + vatRate / 100);
          const iva = entry.total_amount - base;
          return [
            formatDate(entry.entry_date),
            entry.code,
            entry.description.substring(0, 40) + (entry.description.length > 40 ? '...' : ''),
            `${vatRate}%`,
            formatCurrency(base),
            formatCurrency(iva)
          ];
        });

        // Add totals row
        comprasData.push([
          '', '', 'TOTAL', '',
          formatCurrency(filteredData.ivaSoportado.baseImponible),
          formatCurrency(filteredData.ivaSoportado.cuotaIVA)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Fecha', 'Código', 'Descripción', 'Tipo', 'Base', 'IVA']],
          body: comprasData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 8 },
          columnStyles: {
            4: { halign: 'right' },
            5: { halign: 'right' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // IVA Repercutido detail
      if (filteredData.ivaRepercutido.entries.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE IVA REPERCUTIDO (VENTAS)', 14, yPos);
        yPos += 6;

        const ventasData = filteredData.ivaRepercutido.entries.map(entry => {
          const vatRate = entry.vat_rate || 21;
          const base = entry.total_amount / (1 + vatRate / 100);
          const iva = entry.total_amount - base;
          return [
            formatDate(entry.entry_date),
            entry.code,
            entry.description.substring(0, 40) + (entry.description.length > 40 ? '...' : ''),
            `${vatRate}%`,
            formatCurrency(base),
            formatCurrency(iva)
          ];
        });

        // Add totals row
        ventasData.push([
          '', '', 'TOTAL', '',
          formatCurrency(filteredData.ivaRepercutido.baseImponible),
          formatCurrency(filteredData.ivaRepercutido.cuotaIVA)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Fecha', 'Código', 'Descripción', 'Tipo', 'Base', 'IVA']],
          body: ventasData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { fontSize: 8 },
          columnStyles: {
            4: { halign: 'right' },
            5: { halign: 'right' }
          }
        });
      }

      // Footer with result
      const finalY = (doc as any).lastAutoTable?.finalY || yPos;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      
      const resultText = filteredData.resultado >= 0 
        ? `RESULTADO: ${formatCurrency(filteredData.resultado)} A INGRESAR`
        : `RESULTADO: ${formatCurrency(Math.abs(filteredData.resultado))} A COMPENSAR/DEVOLVER`;
      
      doc.text(resultText, pageWidth / 2, finalY + 15, { align: 'center' });

      // Save the PDF
      const fileName = `Informe_IVA_${getPeriodLabel().replace(/[^a-zA-Z0-9]/g, '_')}_${year}.pdf`;
      doc.save(fileName);
      
      toast.success('PDF generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Informe de IVA</h2>
          <p className="text-sm text-muted-foreground">
            IVA soportado y repercutido por período
          </p>
        </div>
        <Button onClick={exportToPDF} className="gap-2">
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[120px]">
              <Label>Año</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-[150px]">
              <Label>Tipo de período</Label>
              <Select 
                value={periodType} 
                onValueChange={(value: 'month' | 'quarter') => {
                  setPeriodType(value);
                  setSelectedPeriod(value === 'quarter' ? 'Q1' : '01');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                  <SelectItem value="month">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-[200px]">
              <Label>Período</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodType === 'quarter' 
                    ? QUARTERS.map(q => (
                        <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                      ))
                    : MONTHS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                IVA Soportado (Compras)
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(filteredData.ivaSoportado.cuotaIVA)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Base: {formatCurrency(filteredData.ivaSoportado.baseImponible)}
            </p>
            <p className="text-xs text-muted-foreground">
              {filteredData.ivaSoportado.entries.length} operaciones
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                IVA Repercutido (Ventas)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(filteredData.ivaRepercutido.cuotaIVA)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Base: {formatCurrency(filteredData.ivaRepercutido.baseImponible)}
            </p>
            <p className="text-xs text-muted-foreground">
              {filteredData.ivaRepercutido.entries.length} operaciones
            </p>
          </CardContent>
        </Card>

        <Card className={filteredData.resultado >= 0 ? 'border-amber-500/50' : 'border-green-500/50'}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Resultado a Liquidar
              </CardTitle>
              <Scale className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${filteredData.resultado >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(filteredData.resultado))}
            </div>
            <Badge variant={filteredData.resultado >= 0 ? 'secondary' : 'outline'} className="mt-2">
              {filteredData.resultado >= 0 ? 'A ingresar' : 'A compensar/devolver'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Calculation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen del Cálculo - {getPeriodLabel()} {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-4 py-4 text-lg">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">IVA Repercutido</p>
              <p className="font-bold text-green-600">{formatCurrency(filteredData.ivaRepercutido.cuotaIVA)}</p>
            </div>
            <span className="text-muted-foreground">−</span>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">IVA Soportado</p>
              <p className="font-bold text-red-600">{formatCurrency(filteredData.ivaSoportado.cuotaIVA)}</p>
            </div>
            <span className="text-muted-foreground">=</span>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Resultado</p>
              <p className={`font-bold ${filteredData.resultado >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCurrency(filteredData.resultado)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IVA Soportado Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Detalle IVA Soportado (Compras)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredData.ivaSoportado.entries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay compras en este período
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.ivaSoportado.entries.map(entry => {
                    const vatRate = entry.vat_rate || 21;
                    const base = entry.total_amount / (1 + vatRate / 100);
                    const iva = entry.total_amount - base;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{formatDate(entry.entry_date)}</TableCell>
                        <TableCell className="text-sm truncate max-w-[200px]">
                          {entry.description}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(base)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {formatCurrency(iva)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(filteredData.ivaSoportado.baseImponible)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {formatCurrency(filteredData.ivaSoportado.cuotaIVA)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* IVA Repercutido Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Detalle IVA Repercutido (Ventas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredData.ivaRepercutido.entries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay ventas en este período
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.ivaRepercutido.entries.map(entry => {
                    const vatRate = entry.vat_rate || 21;
                    const base = entry.total_amount / (1 + vatRate / 100);
                    const iva = entry.total_amount - base;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{formatDate(entry.entry_date)}</TableCell>
                        <TableCell className="text-sm truncate max-w-[200px]">
                          {entry.description}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(base)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {formatCurrency(iva)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(filteredData.ivaRepercutido.baseImponible)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {formatCurrency(filteredData.ivaRepercutido.cuotaIVA)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
