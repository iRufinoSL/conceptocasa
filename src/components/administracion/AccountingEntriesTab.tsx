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
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { AccountingEntryLinesEditor } from './AccountingEntryLinesEditor';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface AccountingEntry {
  id: string;
  code: number;
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
}

const emptyForm: EntryForm = {
  description: '',
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  budget_id: '',
  total_amount: '0'
};

const emptyFilters: Filters = {
  budgetId: '',
  dateFrom: '',
  dateTo: ''
};

interface Props {
  highlightCode?: number | null;
  onHighlightHandled?: () => void;
}

export function AccountingEntriesTab({ highlightCode, onHighlightHandled }: Props) {
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [allPresupuestos, setAllPresupuestos] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<AccountingEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [selectedEntryForLines, setSelectedEntryForLines] = useState<AccountingEntry | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

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
      const { data: entriesData, error: entriesError } = await supabase
        .from('accounting_entries')
        .select(`
          *,
          presupuesto:presupuestos(id, nombre, codigo_correlativo, version)
        `)
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
    setEditingEntry(null);
    setForm({
      ...emptyForm,
      entry_date: format(new Date(), 'yyyy-MM-dd')
    });
    setDialogOpen(true);
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
        const { error } = await supabase
          .from('accounting_entries')
          .update(entryData)
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
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  // Filter entries based on current filters
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Budget filter
      if (filters.budgetId && entry.budget_id !== filters.budgetId) {
        return false;
      }
      // Date from filter
      if (filters.dateFrom && entry.entry_date < filters.dateFrom) {
        return false;
      }
      // Date to filter
      if (filters.dateTo && entry.entry_date > filters.dateTo) {
        return false;
      }
      return true;
    });
  }, [entries, filters]);

  const hasActiveFilters = filters.budgetId || filters.dateFrom || filters.dateTo;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Asientos Contables</h2>
          <p className="text-sm text-muted-foreground">
            Registro de movimientos contables
            {hasActiveFilters && ` • Mostrando ${filteredEntries.length} de ${entries.length}`}
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

      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters 
              ? 'No hay asientos que coincidan con los filtros seleccionados.'
              : 'No hay asientos contables. Crea el primer asiento.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <Card 
              key={entry.id} 
              id={`entry-${entry.id}`}
              className={`${!entry.is_balanced ? 'border-destructive/50' : ''} ${highlightCode === entry.code ? 'ring-2 ring-primary' : ''}`}
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
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-muted-foreground">
                              #{entry.code}
                            </span>
                            <CardTitle className="text-base">{entry.description}</CardTitle>
                            {!entry.is_balanced ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Descuadrado
                              </Badge>
                            ) : entry.lines_count && entry.lines_count > 0 ? (
                              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
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
                          <div className="text-sm text-muted-foreground">Debe / Haber</div>
                          <div className="font-mono text-sm">
                            {formatCurrency(entry.total_debit || 0)} / {formatCurrency(entry.total_credit || 0)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
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
                    />
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
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
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
