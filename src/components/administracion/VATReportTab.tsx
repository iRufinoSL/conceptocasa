import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Scale, FileDown, Users, Building2, ArrowUpDown } from 'lucide-react';
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

interface VATByRateSummary {
  vatRate: number;
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  entriesCount: number;
}

interface SupplierClientSummary {
  id: string;
  name: string;
  type: 'supplier' | 'client';
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  entriesCount: number;
}

interface PeriodData {
  ivaSoportado: VATSummary;
  ivaRepercutido: VATSummary;
  resultado: number;
  vatByRate: {
    soportado: VATByRateSummary[];
    repercutido: VATByRateSummary[];
  };
  suppliers: SupplierClientSummary[];
  clients: SupplierClientSummary[];
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
  const [periodType, setPeriodType] = useState<'annual' | 'month' | 'quarter' | 'dateRange'>('quarter');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Q1');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  }, []);

  useEffect(() => {
    fetchEntries();
  }, []);

  // Initialize date range when switching to dateRange mode
  useEffect(() => {
    if (periodType === 'dateRange' && !startDate) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(format(firstDay, 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  }, [periodType, startDate]);

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
    
    let filterStartDate: Date;
    let filterEndDate: Date;

    if (periodType === 'dateRange') {
      filterStartDate = startDate ? new Date(startDate) : new Date(yearNum, 0, 1);
      filterEndDate = endDate ? new Date(endDate) : new Date(yearNum, 11, 31);
      // Set end date to end of day
      filterEndDate.setHours(23, 59, 59, 999);
    } else if (periodType === 'annual') {
      // Año completo
      filterStartDate = new Date(yearNum, 0, 1);
      filterEndDate = new Date(yearNum, 11, 31);
      filterEndDate.setHours(23, 59, 59, 999);
    } else if (periodType === 'quarter') {
      const quarter = QUARTERS.find(q => q.value === selectedPeriod);
      if (!quarter) {
        filterStartDate = new Date(yearNum, 0, 1);
        filterEndDate = new Date(yearNum, 2, 31);
      } else {
        filterStartDate = new Date(yearNum, quarter.months[0], 1);
        filterEndDate = new Date(yearNum, quarter.months[2] + 1, 0);
      }
    } else {
      const monthNum = parseInt(selectedPeriod) - 1;
      filterStartDate = new Date(yearNum, monthNum, 1);
      filterEndDate = new Date(yearNum, monthNum + 1, 0);
    }

    const filteredEntries = entries.filter(entry => {
      const entryDate = new Date(entry.entry_date);
      return entryDate >= filterStartDate && entryDate <= filterEndDate;
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

    const calculateVATByRate = (entries: AccountingEntry[]): VATByRateSummary[] => {
      const byRate: Record<number, { base: number; iva: number; count: number }> = {};

      entries.forEach(entry => {
        const vatRate = entry.vat_rate || 21;
        const total = entry.total_amount;
        const base = total / (1 + vatRate / 100);
        const iva = total - base;

        if (!byRate[vatRate]) {
          byRate[vatRate] = { base: 0, iva: 0, count: 0 };
        }
        byRate[vatRate].base += base;
        byRate[vatRate].iva += iva;
        byRate[vatRate].count += 1;
      });

      return Object.entries(byRate)
        .map(([rate, data]) => ({
          vatRate: parseFloat(rate),
          baseImponible: data.base,
          cuotaIVA: data.iva,
          total: data.base + data.iva,
          entriesCount: data.count
        }))
        .sort((a, b) => b.vatRate - a.vatRate);
    };

    const calculateSuppliersSummary = (entries: AccountingEntry[]): SupplierClientSummary[] => {
      const bySupplier: Record<string, { name: string; base: number; iva: number; count: number }> = {};

      entries.forEach(entry => {
        const supplierId = entry.supplier_id || 'unknown';
        const supplierName = entry.supplier 
          ? `${entry.supplier.name}${entry.supplier.surname ? ' ' + entry.supplier.surname : ''}`
          : 'Sin proveedor';
        
        const vatRate = entry.vat_rate || 21;
        const total = entry.total_amount;
        const base = total / (1 + vatRate / 100);
        const iva = total - base;

        if (!bySupplier[supplierId]) {
          bySupplier[supplierId] = { name: supplierName, base: 0, iva: 0, count: 0 };
        }
        bySupplier[supplierId].base += base;
        bySupplier[supplierId].iva += iva;
        bySupplier[supplierId].count += 1;
      });

      return Object.entries(bySupplier)
        .map(([id, data]) => ({
          id,
          name: data.name,
          type: 'supplier' as const,
          baseImponible: data.base,
          cuotaIVA: data.iva,
          total: data.base + data.iva,
          entriesCount: data.count
        }));
    };

    const calculateClientsSummary = (entries: AccountingEntry[]): SupplierClientSummary[] => {
      const byClient: Record<string, { name: string; base: number; iva: number; count: number }> = {};

      entries.forEach(entry => {
        const clientId = entry.supplier_id || 'unknown';
        const clientName = entry.supplier 
          ? `${entry.supplier.name}${entry.supplier.surname ? ' ' + entry.supplier.surname : ''}`
          : 'Sin cliente';
        
        const vatRate = entry.vat_rate || 21;
        const total = entry.total_amount;
        const base = total / (1 + vatRate / 100);
        const iva = total - base;

        if (!byClient[clientId]) {
          byClient[clientId] = { name: clientName, base: 0, iva: 0, count: 0 };
        }
        byClient[clientId].base += base;
        byClient[clientId].iva += iva;
        byClient[clientId].count += 1;
      });

      return Object.entries(byClient)
        .map(([id, data]) => ({
          id,
          name: data.name,
          type: 'client' as const,
          baseImponible: data.base,
          cuotaIVA: data.iva,
          total: data.base + data.iva,
          entriesCount: data.count
        }));
    };

    const ivaSoportado = calculateSummary(compras);
    const ivaRepercutido = calculateSummary(ventas);
    const resultado = ivaRepercutido.cuotaIVA - ivaSoportado.cuotaIVA;

    const vatByRate = {
      soportado: calculateVATByRate(compras),
      repercutido: calculateVATByRate(ventas)
    };

    const suppliers = calculateSuppliersSummary(compras);
    const clients = calculateClientsSummary(ventas);

    return { ivaSoportado, ivaRepercutido, resultado, vatByRate, suppliers, clients };
  }, [entries, year, periodType, selectedPeriod, startDate, endDate]);

  const sortedSuppliers = useMemo(() => {
    return [...filteredData.suppliers].sort((a, b) => 
      sortOrder === 'desc' ? b.baseImponible - a.baseImponible : a.baseImponible - b.baseImponible
    );
  }, [filteredData.suppliers, sortOrder]);

  const sortedClients = useMemo(() => {
    return [...filteredData.clients].sort((a, b) => 
      sortOrder === 'desc' ? b.baseImponible - a.baseImponible : a.baseImponible - b.baseImponible
    );
  }, [filteredData.clients, sortOrder]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const getPeriodLabel = () => {
    if (periodType === 'dateRange') {
      const start = startDate ? format(new Date(startDate), 'dd/MM/yyyy', { locale: es }) : '';
      const end = endDate ? format(new Date(endDate), 'dd/MM/yyyy', { locale: es }) : '';
      return `${start} - ${end}`;
    } else if (periodType === 'annual') {
      return `Año ${year}`;
    } else if (periodType === 'quarter') {
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
      const periodText = periodType === 'dateRange' 
        ? `Período: ${getPeriodLabel()}`
        : `Período: ${getPeriodLabel()} ${year}`;
      doc.text(periodText, pageWidth / 2, 30, { align: 'center' });
      doc.text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, pageWidth / 2, 37, { align: 'center' });
      
      let yPos = 50;

      // Global Summary section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN GLOBAL', 14, yPos);
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

      // VAT by Rate - Soportado
      if (filteredData.vatByRate.soportado.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('IVA SOPORTADO POR TIPO', 14, yPos);
        yPos += 6;

        const soportadoByRateData = filteredData.vatByRate.soportado.map(item => [
          `${item.vatRate}%`,
          formatCurrency(item.baseImponible),
          formatCurrency(item.cuotaIVA),
          formatCurrency(item.total),
          item.entriesCount.toString()
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Tipo IVA', 'Base Imponible', 'Cuota IVA', 'Total', 'Operaciones']],
          body: soportadoByRateData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // VAT by Rate - Repercutido
      if (filteredData.vatByRate.repercutido.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('IVA REPERCUTIDO POR TIPO', 14, yPos);
        yPos += 6;

        const repercutidoByRateData = filteredData.vatByRate.repercutido.map(item => [
          `${item.vatRate}%`,
          formatCurrency(item.baseImponible),
          formatCurrency(item.cuotaIVA),
          formatCurrency(item.total),
          item.entriesCount.toString()
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Tipo IVA', 'Base Imponible', 'Cuota IVA', 'Total', 'Operaciones']],
          body: repercutidoByRateData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check if we need a new page
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      // Suppliers list
      if (sortedSuppliers.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PROVEEDORES', 14, yPos);
        yPos += 6;

        const suppliersData = sortedSuppliers.map(s => [
          s.name,
          formatCurrency(s.baseImponible),
          formatCurrency(s.cuotaIVA),
          formatCurrency(s.total)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Proveedor', 'Base Imponible', 'IVA', 'Total']],
          body: suppliersData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check if we need a new page
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      // Clients list
      if (sortedClients.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CLIENTES', 14, yPos);
        yPos += 6;

        const clientsData = sortedClients.map(c => [
          c.name,
          formatCurrency(c.baseImponible),
          formatCurrency(c.cuotaIVA),
          formatCurrency(c.total)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Cliente', 'Base Imponible', 'IVA', 'Total']],
          body: clientsData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' }
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
      const fileName = `Informe_IVA_${getPeriodLabel().replace(/[^a-zA-Z0-9]/g, '_')}_${periodType === 'dateRange' ? '' : year}.pdf`;
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
            <div className="space-y-2 min-w-[150px]">
              <Label>Tipo de período</Label>
              <Select 
                value={periodType} 
                onValueChange={(value: 'annual' | 'month' | 'quarter' | 'dateRange') => {
                  setPeriodType(value);
                  if (value === 'quarter') setSelectedPeriod('Q1');
                  else if (value === 'month') setSelectedPeriod('01');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Anual</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                  <SelectItem value="month">Mensual</SelectItem>
                  <SelectItem value="dateRange">Entre fechas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodType === 'dateRange' ? (
              <>
                <div className="space-y-2 min-w-[150px]">
                  <Label>Fecha inicio</Label>
                  <Input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2 min-w-[150px]">
                  <Label>Fecha fin</Label>
                  <Input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            ) : periodType === 'annual' ? (
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
            ) : (
              <>
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
              </>
            )}
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
          <CardTitle className="text-base">
            Resumen del Cálculo - {getPeriodLabel()} {periodType !== 'dateRange' ? year : ''}
          </CardTitle>
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

      {/* Tabs for different views */}
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global">IVA Global</TabsTrigger>
          <TabsTrigger value="byRate">Por Tipo de IVA</TabsTrigger>
          <TabsTrigger value="entities">Proveedores/Clientes</TabsTrigger>
        </TabsList>

        {/* Global VAT Tab */}
        <TabsContent value="global" className="space-y-4">
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
        </TabsContent>

        {/* VAT by Rate Tab */}
        <TabsContent value="byRate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* IVA Soportado by Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  IVA Soportado por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredData.vatByRate.soportado.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay datos de IVA soportado
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo IVA</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">Cuota IVA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Ops.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.vatByRate.soportado.map(item => (
                        <TableRow key={item.vatRate}>
                          <TableCell>
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              {item.vatRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.baseImponible)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">
                            {formatCurrency(item.cuotaIVA)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.total)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {item.entriesCount}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaSoportado.baseImponible)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {formatCurrency(filteredData.ivaSoportado.cuotaIVA)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaSoportado.total)}
                        </TableCell>
                        <TableCell className="text-center">
                          {filteredData.ivaSoportado.entries.length}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* IVA Repercutido by Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  IVA Repercutido por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredData.vatByRate.repercutido.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay datos de IVA repercutido
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo IVA</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">Cuota IVA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Ops.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.vatByRate.repercutido.map(item => (
                        <TableRow key={item.vatRate}>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {item.vatRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.baseImponible)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-600">
                            {formatCurrency(item.cuotaIVA)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.total)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {item.entriesCount}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaRepercutido.baseImponible)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {formatCurrency(filteredData.ivaRepercutido.cuotaIVA)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaRepercutido.total)}
                        </TableCell>
                        <TableCell className="text-center">
                          {filteredData.ivaRepercutido.entries.length}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Suppliers/Clients Tab */}
        <TabsContent value="entities" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="gap-2"
            >
              <ArrowUpDown className="h-4 w-4" />
              Ordenar por Base: {sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Suppliers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-red-500" />
                  Proveedores (IVA Soportado)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedSuppliers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay proveedores en este período
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">IVA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSuppliers.map(supplier => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium truncate max-w-[150px]">
                            {supplier.name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(supplier.baseImponible)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">
                            {formatCurrency(supplier.cuotaIVA)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {formatCurrency(supplier.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaSoportado.baseImponible)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {formatCurrency(filteredData.ivaSoportado.cuotaIVA)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaSoportado.total)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Clients */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-500" />
                  Clientes (IVA Repercutido)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedClients.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay clientes en este período
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">IVA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedClients.map(client => (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium truncate max-w-[150px]">
                            {client.name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(client.baseImponible)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-600">
                            {formatCurrency(client.cuotaIVA)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {formatCurrency(client.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaRepercutido.baseImponible)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {formatCurrency(filteredData.ivaRepercutido.cuotaIVA)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(filteredData.ivaRepercutido.total)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
