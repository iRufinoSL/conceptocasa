import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Filter, X, FileText, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { InvoiceLinesEditor } from './InvoiceLinesEditor';
import { InvoicePrintView } from './InvoicePrintView';
import { AccountSelectWithCreate } from './AccountSelectWithCreate';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

type DocumentType = 'factura' | 'presupuesto' | 'proforma';

interface Invoice {
  id: string;
  invoice_number: number;
  invoice_date: string;
  description: string | null;
  budget_id: string | null;
  issuer_account_id: string | null;
  receiver_account_id: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  created_at: string;
  document_type: DocumentType;
  presupuesto?: Presupuesto | null;
  issuer_account?: AccountingAccount | null;
  receiver_account?: AccountingAccount | null;
  lines_count?: number;
}

interface InvoiceForm {
  invoice_number: string;
  invoice_date: string;
  description: string;
  budget_id: string;
  issuer_account_id: string;
  receiver_account_id: string;
  vat_rate: string;
  document_type: DocumentType;
}

interface Filters {
  budgetId: string;
  dateFrom: string;
  dateTo: string;
  documentType: string;
}

const emptyForm: InvoiceForm = {
  invoice_number: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  budget_id: '',
  issuer_account_id: '',
  receiver_account_id: '',
  vat_rate: '21.00',
  document_type: 'factura'
};

const emptyFilters: Filters = {
  budgetId: '',
  dateFrom: '',
  dateTo: '',
  documentType: ''
};

const VAT_RATES = ['21.00', '10.00', '0.00'];
const VAT_RATE_NO_INCLUDED = '-1';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  factura: 'Factura',
  presupuesto: 'Presupuesto',
  proforma: 'Proforma'
};

const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  factura: 'bg-primary text-primary-foreground',
  presupuesto: 'bg-amber-500 text-white',
  proforma: 'bg-violet-500 text-white'
};

// Format invoice number with year: #0010/25
const formatInvoiceNumber = (number: number, date: string, type: DocumentType): string => {
  const year = new Date(date).getFullYear().toString().slice(-2);
  const paddedNumber = String(number).padStart(4, '0');
  const prefix = DOCUMENT_TYPE_LABELS[type];
  return `${prefix} #${paddedNumber}/${year}`;
};

// Get year from date
const getYearFromDate = (date: string): number => {
  return new Date(date).getFullYear();
};

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [allPresupuestos, setAllPresupuestos] = useState<Presupuesto[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [selectedInvoiceForLines, setSelectedInvoiceForLines] = useState<Invoice | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [activeDocumentType, setActiveDocumentType] = useState<DocumentType>('factura');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch presupuestos
      const { data: presupuestosData, error: presError } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version')
        .eq('archived', false)
        .order('codigo_correlativo', { ascending: false });

      if (presError) throw presError;
      setPresupuestos(presupuestosData || []);

      // Fetch ALL presupuestos for filter (including archived)
      const { data: allPresData, error: allPresError } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version')
        .order('codigo_correlativo', { ascending: false });

      if (allPresError) throw allPresError;
      setAllPresupuestos(allPresData || []);

      // Fetch accounting accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounting_accounts')
        .select('id, name, account_type')
        .order('name');

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Fetch invoices with related data
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          *,
          presupuesto:presupuestos(id, nombre, codigo_correlativo, version),
          issuer_account:accounting_accounts!invoices_issuer_account_id_fkey(id, name, account_type),
          receiver_account:accounting_accounts!invoices_receiver_account_id_fkey(id, name, account_type)
        `)
        .order('invoice_date', { ascending: false })
        .order('invoice_number', { ascending: false });

      if (invoicesError) throw invoicesError;

      // Fetch line counts
      const { data: linesData, error: linesError } = await supabase
        .from('invoice_lines')
        .select('invoice_id');

      if (linesError) throw linesError;

      // Count lines per invoice
      const lineCounts = new Map<string, number>();
      linesData?.forEach(line => {
        const count = lineCounts.get(line.invoice_id) || 0;
        lineCounts.set(line.invoice_id, count + 1);
      });

      const enrichedInvoices = invoicesData?.map(invoice => ({
        ...invoice,
        document_type: (invoice.document_type || 'factura') as DocumentType,
        lines_count: lineCounts.get(invoice.id) || 0
      })) || [];

      setInvoices(enrichedInvoices);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Calculate next invoice number for a specific document type and year
  const getNextInvoiceNumber = (docType: DocumentType, year: number): number => {
    const typeInvoices = invoices.filter(inv => 
      inv.document_type === docType && 
      getYearFromDate(inv.invoice_date) === year
    );
    const maxNumber = typeInvoices.reduce((max, inv) => Math.max(max, inv.invoice_number), 0);
    return maxNumber + 1;
  };

  const handleOpenCreate = (docType: DocumentType = 'factura') => {
    setEditingInvoice(null);
    const currentYear = new Date().getFullYear();
    const nextNumber = getNextInvoiceNumber(docType, currentYear);
    setForm({
      ...emptyForm,
      invoice_number: nextNumber.toString(),
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      document_type: docType,
      vat_rate: docType === 'factura' ? '21.00' : '21.00'
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setForm({
      invoice_number: invoice.invoice_number.toString(),
      invoice_date: invoice.invoice_date,
      description: invoice.description || '',
      budget_id: invoice.budget_id || '',
      issuer_account_id: invoice.issuer_account_id || '',
      receiver_account_id: invoice.receiver_account_id || '',
      vat_rate: invoice.vat_rate === -1 ? VAT_RATE_NO_INCLUDED : invoice.vat_rate.toString(),
      document_type: invoice.document_type
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.invoice_number || !form.invoice_date) {
      toast.error('Número y fecha son obligatorios');
      return;
    }

    // Validate VAT for Factura type
    if (form.document_type === 'factura' && form.vat_rate === VAT_RATE_NO_INCLUDED) {
      toast.error('El tipo Factura requiere un IVA válido');
      return;
    }

    setSaving(true);
    try {
      const vatRate = form.vat_rate === VAT_RATE_NO_INCLUDED ? -1 : parseFloat(form.vat_rate);
      
      const invoiceData = {
        invoice_number: parseInt(form.invoice_number),
        invoice_date: form.invoice_date,
        description: form.description.trim() || null,
        budget_id: form.budget_id || null,
        issuer_account_id: form.issuer_account_id || null,
        receiver_account_id: form.receiver_account_id || null,
        vat_rate: vatRate,
        document_type: form.document_type
      };

      if (editingInvoice) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', editingInvoice.id);

        if (error) throw error;
        toast.success(`${DOCUMENT_TYPE_LABELS[form.document_type]} actualizado`);
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            toast.error(`Ya existe un ${DOCUMENT_TYPE_LABELS[form.document_type].toLowerCase()} con ese número para ese año`);
            return;
          }
          throw error;
        }
        toast.success(`${DOCUMENT_TYPE_LABELS[form.document_type]} creado`);
        
        // Open lines editor for new invoice
        if (data) {
          setSelectedInvoiceForLines({
            ...data,
            document_type: form.document_type,
            lines_count: 0
          });
        }
      }

      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceToDelete.id);

      if (error) throw error;

      toast.success(`${DOCUMENT_TYPE_LABELS[invoiceToDelete.document_type]} eliminado`);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar');
    }
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedInvoices);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedInvoices(newExpanded);
  };

  const toggleYearExpanded = (year: number) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const formatVatRate = (rate: number): string => {
    if (rate === -1) return 'IVA no incluido';
    return `IVA ${rate}%`;
  };

  // Filter invoices based on current filters and active document type
  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      if (invoice.document_type !== activeDocumentType) {
        return false;
      }
      if (filters.budgetId && invoice.budget_id !== filters.budgetId) {
        return false;
      }
      if (filters.dateFrom && invoice.invoice_date < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && invoice.invoice_date > filters.dateTo) {
        return false;
      }
      return true;
    });
  }, [invoices, filters, activeDocumentType]);

  // Group invoices by year
  const invoicesByYear = useMemo(() => {
    const grouped = new Map<number, Invoice[]>();
    
    filteredInvoices.forEach(invoice => {
      const year = getYearFromDate(invoice.invoice_date);
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(invoice);
    });

    // Sort each year's invoices by number descending
    grouped.forEach((yearInvoices) => {
      yearInvoices.sort((a, b) => b.invoice_number - a.invoice_number);
    });

    // Convert to sorted array (years descending)
    return Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]);
  }, [filteredInvoices]);

  const hasActiveFilters = filters.budgetId || filters.dateFrom || filters.dateTo;

  const clearFilters = () => {
    setFilters(emptyFilters);
  };

  const handleAccountCreated = () => {
    supabase
      .from('accounting_accounts')
      .select('id, name, account_type')
      .order('name')
      .then(({ data }) => {
        if (data) setAccounts(data);
      });
  };

  // Update next number when date or document type changes
  const handleFormDateChange = (newDate: string) => {
    const year = getYearFromDate(newDate);
    const nextNumber = getNextInvoiceNumber(form.document_type, year);
    setForm({ 
      ...form, 
      invoice_date: newDate,
      invoice_number: editingInvoice ? form.invoice_number : nextNumber.toString()
    });
  };

  const handleFormTypeChange = (newType: DocumentType) => {
    const year = getYearFromDate(form.invoice_date);
    const nextNumber = getNextInvoiceNumber(newType, year);
    setForm({ 
      ...form, 
      document_type: newType,
      invoice_number: editingInvoice ? form.invoice_number : nextNumber.toString(),
      // Reset VAT if switching to factura and it was "no included"
      vat_rate: newType === 'factura' && form.vat_rate === VAT_RATE_NO_INCLUDED ? '21.00' : form.vat_rate
    });
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
          <h2 className="text-lg font-semibold">Documentos de Facturación</h2>
          <p className="text-sm text-muted-foreground">
            Gestión de facturas, presupuestos y proformas
            {hasActiveFilters && ` • Mostrando ${filteredInvoices.length} de ${invoices.filter(i => i.document_type === activeDocumentType).length}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={showFilters ? "secondary" : "outline"} 
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                {[filters.budgetId, filters.dateFrom, filters.dateTo].filter(Boolean).length}
              </Badge>
            )}
          </Button>
          <Button onClick={() => handleOpenCreate(activeDocumentType)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo {DOCUMENT_TYPE_LABELS[activeDocumentType]}
          </Button>
        </div>
      </div>

      {/* Document Type Tabs */}
      <div className="flex gap-2 border-b">
        {(['factura', 'presupuesto', 'proforma'] as DocumentType[]).map((type) => {
          const count = invoices.filter(i => i.document_type === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveDocumentType(type)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeDocumentType === type
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {DOCUMENT_TYPE_LABELS[type]}s
              <Badge variant="secondary" className="ml-2 text-xs">
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[200px]">
                <Label htmlFor="filter-budget">Presupuesto</Label>
                <Select
                  value={filters.budgetId}
                  onValueChange={(value) => setFilters({ ...filters, budgetId: value === 'all' ? '' : value })}
                >
                  <SelectTrigger id="filter-budget">
                    <SelectValue placeholder="Todos los presupuestos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los presupuestos</SelectItem>
                    {allPresupuestos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.codigo_correlativo} - {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-date-from">Fecha desde</Label>
                <Input
                  id="filter-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-date-to">Fecha hasta</Label>
                <Input
                  id="filter-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-[160px]"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters 
              ? `No hay ${DOCUMENT_TYPE_LABELS[activeDocumentType].toLowerCase()}s que coincidan con los filtros.`
              : `No hay ${DOCUMENT_TYPE_LABELS[activeDocumentType].toLowerCase()}s. Crea el primero.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoicesByYear.map(([year, yearInvoices]) => (
            <Collapsible
              key={year}
              open={expandedYears.has(year)}
              onOpenChange={() => toggleYearExpanded(year)}
            >
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedYears.has(year) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg">{year}</CardTitle>
                        <Badge variant="outline">{yearInvoices.length} {DOCUMENT_TYPE_LABELS[activeDocumentType].toLowerCase()}(s)</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 mt-3 ml-4">
                  {yearInvoices.map((invoice) => (
                    <Card key={invoice.id}>
                      <Collapsible
                        open={expandedInvoices.has(invoice.id)}
                        onOpenChange={() => toggleExpanded(invoice.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {expandedInvoices.has(invoice.id) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={DOCUMENT_TYPE_COLORS[invoice.document_type]}>
                                      {formatInvoiceNumber(invoice.invoice_number, invoice.invoice_date, invoice.document_type)}
                                    </Badge>
                                    <CardTitle className="text-base">
                                      {invoice.description || 'Sin descripción'}
                                    </CardTitle>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                    <span>{formatDate(invoice.invoice_date)}</span>
                                    <span>|</span>
                                    <span>{invoice.presupuesto?.nombre || 'Sin presupuesto'}</span>
                                    <span>|</span>
                                    <span>{invoice.lines_count || 0} líneas</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-sm text-muted-foreground">
                                    {formatVatRate(invoice.vat_rate)}
                                  </div>
                                  <div className="font-semibold">
                                    {formatCurrency(invoice.total)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInvoiceToPrint(invoice);
                                    }}
                                    title="Imprimir"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(invoice);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInvoiceToDelete(invoice);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 pb-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
                              <div>
                                <div className="text-sm text-muted-foreground">Emisor</div>
                                <div className="font-medium">
                                  {invoice.issuer_account?.name || 'No definido'}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Receptor</div>
                                <div className="font-medium">
                                  {invoice.receiver_account?.name || 'No definido'}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Subtotal</div>
                                <div className="font-medium">{formatCurrency(invoice.subtotal)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">{formatVatRate(invoice.vat_rate)}</div>
                                <div className="font-medium">
                                  {invoice.vat_rate === -1 ? '-' : formatCurrency(invoice.vat_amount)}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedInvoiceForLines(invoice)}
                              className="gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              Gestionar Líneas
                            </Button>
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingInvoice 
                ? `Editar ${DOCUMENT_TYPE_LABELS[form.document_type]}` 
                : `Nuevo ${DOCUMENT_TYPE_LABELS[form.document_type]}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Documento</Label>
              <Select
                value={form.document_type}
                onValueChange={(value) => handleFormTypeChange(value as DocumentType)}
                disabled={!!editingInvoice}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factura">Factura</SelectItem>
                  <SelectItem value="presupuesto">Presupuesto</SelectItem>
                  <SelectItem value="proforma">Proforma</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Número *</Label>
                <Input
                  id="invoice_number"
                  type="number"
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  min="1"
                />
                <p className="text-xs text-muted-foreground">
                  {form.invoice_number && form.invoice_date && 
                    formatInvoiceNumber(parseInt(form.invoice_number) || 0, form.invoice_date, form.document_type)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_date">Fecha *</Label>
                <Input
                  id="invoice_date"
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => handleFormDateChange(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget_id">Presupuesto Relacionado</Label>
              <Select
                value={form.budget_id}
                onValueChange={(value) => setForm({ ...form, budget_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger id="budget_id">
                  <SelectValue placeholder="Seleccionar presupuesto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin presupuesto</SelectItem>
                  {presupuestos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo_correlativo} - {p.nombre} ({p.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <AccountSelectWithCreate
                accounts={accounts}
                value={form.issuer_account_id}
                onChange={(value) => setForm({ ...form, issuer_account_id: value })}
                onAccountCreated={handleAccountCreated}
                label="Emisor (Facturador)"
                placeholder="Seleccionar emisor..."
              />
              <AccountSelectWithCreate
                accounts={accounts}
                value={form.receiver_account_id}
                onChange={(value) => setForm({ ...form, receiver_account_id: value })}
                onAccountCreated={handleAccountCreated}
                label="Receptor (Facturado)"
                placeholder="Seleccionar receptor..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat_rate">Tipo de IVA</Label>
              <Select
                value={form.vat_rate}
                onValueChange={(value) => setForm({ ...form, vat_rate: value })}
              >
                <SelectTrigger id="vat_rate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate}%
                    </SelectItem>
                  ))}
                  {form.document_type !== 'factura' && (
                    <SelectItem value={VAT_RATE_NO_INCLUDED}>
                      IVA no incluido
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.document_type === 'factura' && (
                <p className="text-xs text-muted-foreground">
                  Las facturas requieren un tipo de IVA válido
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingInvoice ? 'Guardar Cambios' : `Crear ${DOCUMENT_TYPE_LABELS[form.document_type]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title={`Eliminar ${invoiceToDelete ? DOCUMENT_TYPE_LABELS[invoiceToDelete.document_type] : 'Documento'}`}
        description={`¿Estás seguro de que deseas eliminar ${invoiceToDelete ? formatInvoiceNumber(invoiceToDelete.invoice_number, invoiceToDelete.invoice_date, invoiceToDelete.document_type) : 'este documento'}? Esta acción eliminará también todas las líneas asociadas.`}
      />

      {/* Invoice Lines Editor Dialog */}
      {selectedInvoiceForLines && (
        <InvoiceLinesEditor
          invoice={selectedInvoiceForLines}
          onClose={() => {
            setSelectedInvoiceForLines(null);
            fetchData();
          }}
        />
      )}

      {/* Print View Dialog */}
      {invoiceToPrint && (
        <InvoicePrintView
          invoice={invoiceToPrint}
          onClose={() => setInvoiceToPrint(null)}
        />
      )}
    </div>
  );
}
