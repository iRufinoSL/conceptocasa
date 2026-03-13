import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Filter, X, ShoppingCart, Receipt, CreditCard, Wallet, Copy, ArrowUpDown, Calendar, Hash, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { AccountingEntryLinesEditor } from './AccountingEntryLinesEditor';
import { AccountingEntryWizard } from './AccountingEntryWizard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { searchMatch } from '@/lib/search-utils';

const ENTRY_TYPE_LABELS: Record<string, { label: string; icon: typeof ShoppingCart }> = {
  compra: { label: 'Compra', icon: ShoppingCart },
  venta: { label: 'Venta', icon: Receipt },
  cobro: { label: 'Cobro', icon: CreditCard },
  pago: { label: 'Pago', icon: Wallet },
};

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface AccountingEntry {
  id: string;
  code: string;
  description: string;
  entry_date: string;
  budget_id: string;
  total_amount: number;
  created_at: string;
  presupuesto?: Presupuesto;
  lines_count?: number;
  total_debit?: number;
  total_credit?: number;
  is_balanced?: boolean;
  has_provisional_account?: boolean;
  entry_type?: string;
}

interface EntryForm {
  description: string;
  entry_date: string;
  budget_id: string;
  total_amount: string;
}

interface Filters {
  budgetId: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  onlyProvisional: boolean;
}

type SortField = 'code' | 'date';
type SortOrder = 'asc' | 'desc';

const emptyForm: EntryForm = {
  description: '',
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  budget_id: '',
  total_amount: '0'
};

const emptyFilters: Filters = {
  budgetId: '',
  dateFrom: '',
  dateTo: '',
  searchQuery: '',
  onlyProvisional: false
};

interface Props {
  highlightCode?: string | null;
  onHighlightHandled?: () => void;
  budgetId?: string;
  onNavigateToAccount?: (accountId: string) => void;
  ledgerId?: string;
}

export function AccountingEntriesTab({ highlightCode, onHighlightHandled, budgetId: fixedBudgetId, onNavigateToAccount, ledgerId }: Props) {
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [allPresupuestos, setAllPresupuestos] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<AccountingEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [selectedEntryForLines, setSelectedEntryForLines] = useState<AccountingEntry | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [groupByYear, setGroupByYear] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchData();
  }, [ledgerId]);

  // Handle highlight from navigation
  useEffect(() => {
    if (highlightCode && entries.length > 0) {
      const entryToHighlight = entries.find(e => e.code === highlightCode);
      if (entryToHighlight) {
        setExpandedEntries(prev => new Set([...prev, entryToHighlight.id]));
        // Scroll to the entry after a short delay
        setTimeout(() => {
          const element = document.getElementById(`entry-${entryToHighlight.id}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      onHighlightHandled?.();
    }
  }, [highlightCode, entries, onHighlightHandled]);

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

      // Fetch entries with presupuesto info
      let entriesQuery = supabase
        .from('accounting_entries')
        .select(`
          *,
          presupuesto:presupuestos(id, nombre, codigo_correlativo, version)
        `);
      
      if (fixedBudgetId) {
        entriesQuery = entriesQuery.eq('budget_id', fixedBudgetId);
      }
      
      const { data: entriesData, error: entriesError } = await entriesQuery
        .order('entry_date', { ascending: false })
        .order('code', { ascending: false });

      if (entriesError) throw entriesError;

      // Fetch all entry lines to calculate totals
      const { data: linesData, error: linesError } = await supabase
        .from('accounting_entry_lines')
        .select('entry_id, debit_amount, credit_amount');

      if (linesError) throw linesError;

      // Calculate totals per entry
      const entryTotals = new Map<string, { count: number; debit: number; credit: number }>();
      linesData?.forEach(line => {
        const current = entryTotals.get(line.entry_id) || { count: 0, debit: 0, credit: 0 };
        current.count++;
        current.debit += Number(line.debit_amount) || 0;
        current.credit += Number(line.credit_amount) || 0;
        entryTotals.set(line.entry_id, current);
      });

      // Merge with entries
      const enrichedEntries = entriesData?.map(entry => {
        const totals = entryTotals.get(entry.id) || { count: 0, debit: 0, credit: 0 };
        return {
          ...entry,
          lines_count: totals.count,
          total_debit: totals.debit,
          total_credit: totals.credit,
          is_balanced: Math.abs(totals.debit - totals.credit) < 0.01
        };
      }) || [];

      setEntries(enrichedEntries);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setWizardOpen(true);
  };

  const handleOpenEdit = (entry: AccountingEntry) => {
    setEditingEntry(entry);
    setForm({
      description: entry.description,
      entry_date: entry.entry_date,
      budget_id: entry.budget_id,
      total_amount: entry.total_amount.toString()
    });
    setDialogOpen(true);
  };

  const handleOpenManualCreate = () => {
    setEditingEntry(null);
    setForm({
      ...emptyForm,
      entry_date: format(new Date(), 'yyyy-MM-dd'),
      budget_id: fixedBudgetId || ''
    });
    setDialogOpen(true);
  };


  const handleSave = async () => {
    if (!form.description.trim() || !form.budget_id || !form.entry_date) {
      toast.error('Descripción, fecha y presupuesto son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const entryData = {
        description: form.description.trim(),
        entry_date: form.entry_date,
        budget_id: form.budget_id,
        total_amount: parseFloat(form.total_amount) || 0
      };

      if (editingEntry) {
        // Check if the year has changed - if so, we need to regenerate the code
        const oldYear = editingEntry.code ? parseInt(editingEntry.code.split('/')[1]) + 2000 : null;
        const newYear = new Date(form.entry_date).getFullYear();
        
        let updateData: typeof entryData & { code?: string } = entryData;
        
        // If year changed, generate a new code for the new year
        if (oldYear && oldYear !== newYear) {
          const { data: newCode, error: codeError } = await supabase
            .rpc('generate_entry_code', { entry_year: newYear });
          
          if (codeError) throw codeError;
          updateData = { ...entryData, code: newCode };
        }
        
        const { error } = await supabase
          .from('accounting_entries')
          .update(updateData)
          .eq('id', editingEntry.id);

        if (error) throw error;
        toast.success('Asiento actualizado');
      } else {
        const { data, error } = await supabase
          .from('accounting_entries')
          .insert(entryData)
          .select()
          .single();

        if (error) throw error;
        toast.success('Asiento creado');
        
        // Open lines editor for new entry
        if (data) {
          setSelectedEntryForLines({
            ...data,
            lines_count: 0,
            total_debit: 0,
            total_credit: 0,
            is_balanced: true
          });
        }
      }

      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving entry:', error);
      toast.error('Error al guardar el asiento');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (entry: AccountingEntry) => {
    try {
      // Get the year from today for the new entry
      const today = new Date();
      const entryYear = today.getFullYear();
      
      // Generate a new code for the current year
      const { data: newCode, error: codeError } = await supabase
        .rpc('generate_entry_code', { entry_year: entryYear });
      
      if (codeError) throw codeError;

      // Create the duplicated entry
      const { data: newEntry, error: insertError } = await supabase
        .from('accounting_entries')
        .insert({
          code: newCode,
          description: entry.description,
          entry_date: format(today, 'yyyy-MM-dd'),
          budget_id: entry.budget_id,
          total_amount: entry.total_amount,
          entry_type: (entry as any).entry_type || null,
          vat_rate: (entry as any).vat_rate || null,
          supplier_id: (entry as any).supplier_id || null,
          expense_account_id: (entry as any).expense_account_id || null
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Fetch existing lines for the original entry
      const { data: originalLines, error: linesError } = await supabase
        .from('accounting_entry_lines')
        .select('*')
        .eq('entry_id', entry.id);

      if (linesError) throw linesError;

      // Duplicate lines if they exist
      if (originalLines && originalLines.length > 0) {
        const newLines = originalLines.map((line, index) => ({
          entry_id: newEntry.id,
          account_id: line.account_id,
          description: line.description,
          debit_amount: line.debit_amount,
          credit_amount: line.credit_amount,
          line_date: format(today, 'yyyy-MM-dd'),
          code: `${newCode}-${String(index + 1).padStart(3, '0')}`
        }));

        const { error: insertLinesError } = await supabase
          .from('accounting_entry_lines')
          .insert(newLines);

        if (insertLinesError) throw insertLinesError;
      }

      toast.success(`Asiento duplicado como #${newCode}`);
      fetchData();
    } catch (error) {
      console.error('Error duplicating entry:', error);
      toast.error('Error al duplicar el asiento');
    }
  };

  const handleDelete = async () => {
    if (!entryToDelete) return;

    try {
      const { error } = await supabase
        .from('accounting_entries')
        .delete()
        .eq('id', entryToDelete.id);

      if (error) throw error;

      toast.success('Asiento eliminado');
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error('Error al eliminar el asiento');
    }
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEntries(newExpanded);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  // Filter and sort entries
  const sortedAndFilteredEntries = useMemo(() => {
    // First filter
    const filtered = entries.filter(entry => {
      if (filters.budgetId && entry.budget_id !== filters.budgetId) {
        return false;
      }
      if (filters.dateFrom && entry.entry_date < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && entry.entry_date > filters.dateTo) {
        return false;
      }
      if (filters.onlyProvisional && !entry.has_provisional_account) {
        return false;
      }
      // Search in any field
      if (filters.searchQuery) {
        const query = filters.searchQuery;
        const matchesSearch = 
          searchMatch(entry.code, query) ||
          searchMatch(entry.description, query) ||
          searchMatch(entry.presupuesto?.nombre, query) ||
          searchMatch(entry.total_amount?.toString(), query) ||
          searchMatch(formatDate(entry.entry_date), query);
        if (!matchesSearch) return false;
      }
      return true;
    });

    // Then sort
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'code') {
        // Parse code like "2025-001" to compare
        comparison = a.code.localeCompare(b.code);
      } else {
        // Sort by date
        comparison = a.entry_date.localeCompare(b.entry_date);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [entries, filters, sortField, sortOrder]);

  // Group by year
  const entriesByYear = useMemo(() => {
    const groups = new Map<number, AccountingEntry[]>();
    sortedAndFilteredEntries.forEach(entry => {
      const year = new Date(entry.entry_date).getFullYear();
      const existing = groups.get(year) || [];
      groups.set(year, [...existing, entry]);
    });
    // Sort years descending
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [sortedAndFilteredEntries]);

  // Initialize expanded years with the current year
  useEffect(() => {
    if (entriesByYear.length > 0 && expandedYears.size === 0) {
      const currentYear = new Date().getFullYear();
      const yearsToExpand = entriesByYear.map(([year]) => year).filter(y => y === currentYear);
      if (yearsToExpand.length === 0 && entriesByYear.length > 0) {
        yearsToExpand.push(entriesByYear[0][0]); // Expand first year if current year not found
      }
      setExpandedYears(new Set(yearsToExpand));
    }
  }, [entriesByYear]);

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  const hasActiveFilters = filters.budgetId || filters.dateFrom || filters.dateTo || filters.searchQuery || filters.onlyProvisional;
  const provisionalCount = entries.filter(e => e.has_provisional_account).length;

  const clearFilters = () => {
    setFilters(emptyFilters);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderEntryCard = (entry: AccountingEntry) => (
    <Card 
      key={entry.id} 
      id={`entry-${entry.id}`}
      className={`${entry.has_provisional_account ? 'border-destructive bg-destructive/5' : !entry.is_balanced ? 'border-destructive/50' : ''} ${highlightCode === entry.code ? 'ring-2 ring-primary' : ''}`}
    >
      <Collapsible
        open={expandedEntries.has(entry.id)}
        onOpenChange={() => toggleExpanded(entry.id)}
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {expandedEntries.has(entry.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-muted-foreground">
                      #{entry.code}
                    </span>
                    <CardTitle className="text-base">{entry.description}</CardTitle>
                    {entry.has_provisional_account && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Cuenta Pendiente
                      </Badge>
                    )}
                    {!entry.is_balanced ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Descuadrado
                      </Badge>
                    ) : entry.lines_count && entry.lines_count > 0 ? (
                      <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600 dark:text-emerald-400 dark:border-emerald-400">
                        <CheckCircle className="h-3 w-3" />
                        Cuadrado
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>{formatDate(entry.entry_date)}</span>
                    <span>|</span>
                    <span>{entry.presupuesto?.nombre || 'Sin presupuesto'}</span>
                    <span>|</span>
                    <span>{entry.lines_count || 0} apuntes</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Importe global / Debe / Haber</div>
                  <div className="font-mono text-sm">
                    {formatCurrency(entry.total_amount || 0)} / {formatCurrency(entry.total_debit || 0)} / {formatCurrency(entry.total_credit || 0)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Duplicar asiento"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(entry);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Editar asiento"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(entry);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Eliminar asiento"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEntryToDelete(entry);
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
          <CardContent className="pt-0">
            <AccountingEntryLinesEditor
              entry={entry}
              onUpdate={fetchData}
              onNavigateToAccount={onNavigateToAccount}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Asientos Contables</h2>
          <p className="text-sm text-muted-foreground">
            Registro de movimientos contables
            {hasActiveFilters && ` • Mostrando ${sortedAndFilteredEntries.length} de ${entries.length}`}
          </p>
          {provisionalCount > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-destructive hover:text-destructive/80"
              onClick={() => setFilters({ ...filters, onlyProvisional: !filters.onlyProvisional })}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {filters.onlyProvisional 
                ? 'Mostrar todos los asientos' 
                : `${provisionalCount} asiento${provisionalCount > 1 ? 's' : ''} con cuentas pendientes`}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
              className="pl-9 w-[200px]"
            />
            {filters.searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setFilters({ ...filters, searchQuery: '' })}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
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
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Asiento
          </Button>
        </div>
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

      {/* Sorting and Grouping Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ordenar por:</span>
          <Button
            variant={sortField === 'code' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              if (sortField === 'code') {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField('code');
                setSortOrder('desc');
              }
            }}
            className="gap-1"
          >
            <Hash className="h-3 w-3" />
            Nº Asiento
            {sortField === 'code' && (
              <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
            )}
          </Button>
          <Button
            variant={sortField === 'date' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              if (sortField === 'date') {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField('date');
                setSortOrder('desc');
              }
            }}
            className="gap-1"
          >
            <Calendar className="h-3 w-3" />
            Fecha
            {sortField === 'date' && (
              <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="group-by-year" className="text-sm text-muted-foreground cursor-pointer">
            Agrupar por año
          </Label>
          <input
            id="group-by-year"
            type="checkbox"
            checked={groupByYear}
            onChange={(e) => setGroupByYear(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
        </div>
      </div>

      {sortedAndFilteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters 
              ? 'No hay asientos que coincidan con los filtros seleccionados.'
              : 'No hay asientos contables. Crea el primer asiento.'}
          </CardContent>
        </Card>
      ) : groupByYear ? (
        <div className="space-y-4">
          {entriesByYear.map(([year, yearEntries]) => (
            <Collapsible
              key={year}
              open={expandedYears.has(year)}
              onOpenChange={() => toggleYear(year)}
            >
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedYears.has(year) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg">{year}</CardTitle>
                        <Badge variant="secondary">{yearEntries.length} asientos</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total: {formatCurrency(yearEntries.reduce((sum, e) => sum + (e.total_debit || 0), 0))}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 mt-3 ml-4 border-l-2 border-muted pl-4">
                  {yearEntries.map(renderEntryCard)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAndFilteredEntries.map(renderEntryCard)}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? 'Editar Asiento' : 'Nuevo Asiento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Descripción del asiento *</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Factura proveedor nº 123"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entry_date">Fecha del asiento *</Label>
                <Input
                  id="entry_date"
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_amount">Importe global (€)</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            {!fixedBudgetId && (
              <div className="space-y-2">
                <Label htmlFor="budget_id">Presupuesto *</Label>
                <Select
                  value={form.budget_id}
                  onValueChange={(value) => setForm({ ...form, budget_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un presupuesto" />
                  </SelectTrigger>
                  <SelectContent>
                    {presupuestos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.codigo_correlativo} - {p.nombre} ({p.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingEntry ? 'Guardar Cambios' : 'Crear Asiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Asiento"
        description={`¿Estás seguro de que deseas eliminar el asiento #${entryToDelete?.code}? Se eliminarán también todos sus apuntes. Esta acción no se puede deshacer.`}
      />

      {/* Lines Editor Dialog for new entries */}
      {selectedEntryForLines && (
        <Dialog open={!!selectedEntryForLines} onOpenChange={() => setSelectedEntryForLines(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Añadir apuntes al asiento #{selectedEntryForLines.code}
              </DialogTitle>
            </DialogHeader>
            <AccountingEntryLinesEditor
              entry={selectedEntryForLines}
              onUpdate={() => {
                fetchData();
                setSelectedEntryForLines(null);
              }}
              onNavigateToAccount={onNavigateToAccount}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Wizard for new entries */}
      <AccountingEntryWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onEntryCreated={fetchData}
        budgetId={fixedBudgetId}
      />
    </div>
  );
}
