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
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Filter, X, FileText, Printer, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { PurchaseOrderLinesEditor } from './PurchaseOrderLinesEditor';
import { PurchaseOrderPrintView } from './PurchaseOrderPrintView';
import { AdminDocumentFiles } from './AdminDocumentFiles';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface CrmContact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  nif_dni: string | null;
}

interface PurchaseOrder {
  id: string;
  order_number: number;
  order_date: string;
  order_id: string;
  description: string | null;
  observations: string | null;
  budget_id: string | null;
  supplier_contact_id: string | null;
  client_contact_id: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  created_at: string;
  presupuesto?: Presupuesto | null;
  supplier_contact?: CrmContact | null;
  client_contact?: CrmContact | null;
  lines_count?: number;
}

type FooterContactSource = 'company' | 'supplier' | 'client';

interface OrderForm {
  order_number: string;
  order_date: string;
  description: string;
  observations: string;
  budget_id: string;
  supplier_contact_id: string;
  client_contact_id: string;
  vat_rate: string;
  footer_contact_source: FooterContactSource;
}

interface Filters {
  budgetId: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
}

const emptyForm: OrderForm = {
  order_number: '',
  order_date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  observations: '',
  budget_id: '',
  supplier_contact_id: '',
  client_contact_id: '',
  vat_rate: '21.00',
  footer_contact_source: 'company'
};

const emptyFilters: Filters = {
  budgetId: '',
  dateFrom: '',
  dateTo: '',
  searchQuery: ''
};

const VAT_RATES = ['21.00', '10.00', '0.00'];
const VAT_RATE_NO_INCLUDED = '-1';

const formatOrderId = (number: number, date: string): string => {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const paddedNumber = String(number).padStart(4, '0');
  return `${paddedNumber}/${month}/${year}`;
};

const getYearFromDate = (date: string): number => {
  return new Date(date).getFullYear();
};

const getContactDisplayName = (contact: CrmContact | null | undefined): string => {
  if (!contact) return 'No definido';
  const parts = [contact.name, contact.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Sin nombre';
};

export function PurchaseOrdersTab({ budgetId: fixedBudgetId }: { budgetId?: string } = {}) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [allPresupuestos, setAllPresupuestos] = useState<Presupuesto[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [selectedOrderForLines, setSelectedOrderForLines] = useState<PurchaseOrder | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<PurchaseOrder | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [contactSearch, setContactSearch] = useState({ supplier: '', client: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [presRes, allPresRes, contactsRes, ordersRes] = await Promise.all([
        supabase.from('presupuestos').select('id, nombre, codigo_correlativo, version').eq('archived', false).order('codigo_correlativo', { ascending: false }),
        supabase.from('presupuestos').select('id, nombre, codigo_correlativo, version').order('codigo_correlativo', { ascending: false }),
        supabase.from('crm_contacts').select('id, name, surname, contact_type, email, phone, address, city, postal_code, province, nif_dni').order('name'),
        (() => {
          let q = supabase.from('purchase_orders').select(`
            *,
            presupuesto:presupuestos(id, nombre, codigo_correlativo, version),
            supplier_contact:crm_contacts!purchase_orders_supplier_contact_id_fkey(id, name, surname, contact_type, email, phone, address, city, postal_code, province, nif_dni),
            client_contact:crm_contacts!purchase_orders_client_contact_id_fkey(id, name, surname, contact_type, email, phone, address, city, postal_code, province, nif_dni)
          `);
          if (fixedBudgetId) q = q.eq('budget_id', fixedBudgetId);
          return q.order('order_date', { ascending: false }).order('order_number', { ascending: false });
        })()
      ]);

      if (presRes.error) throw presRes.error;
      if (allPresRes.error) throw allPresRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      setPresupuestos(presRes.data || []);
      setAllPresupuestos(allPresRes.data || []);
      setContacts(contactsRes.data || []);

      // Fetch line counts
      const { data: linesData } = await supabase.from('purchase_order_lines').select('purchase_order_id');
      const lineCounts = new Map<string, number>();
      linesData?.forEach(line => {
        const count = lineCounts.get(line.purchase_order_id) || 0;
        lineCounts.set(line.purchase_order_id, count + 1);
      });

      const enriched = (ordersRes.data || []).map((order: any) => ({
        ...order,
        lines_count: lineCounts.get(order.id) || 0
      }));
      setOrders(enriched);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const getNextOrderNumber = (year: number): number => {
    const yearOrders = orders.filter(o => getYearFromDate(o.order_date) === year);
    const maxNumber = yearOrders.reduce((max, o) => Math.max(max, o.order_number), 0);
    return maxNumber + 1;
  };

  const handleOpenCreate = () => {
    setEditingOrder(null);
    const currentYear = new Date().getFullYear();
    const nextNumber = getNextOrderNumber(currentYear);
    setForm({
      ...emptyForm,
      order_number: nextNumber.toString(),
      order_date: format(new Date(), 'yyyy-MM-dd'),
      budget_id: fixedBudgetId || ''
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setForm({
      order_number: order.order_number.toString(),
      order_date: order.order_date,
      description: order.description || '',
      observations: order.observations || '',
      budget_id: order.budget_id || '',
      supplier_contact_id: order.supplier_contact_id || '',
      client_contact_id: order.client_contact_id || '',
      vat_rate: order.vat_rate === -1 ? VAT_RATE_NO_INCLUDED : order.vat_rate.toString(),
      footer_contact_source: (order as any).footer_contact_source || 'company'
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.order_number || !form.order_date) {
      toast.error('Número y fecha son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const vatRate = form.vat_rate === VAT_RATE_NO_INCLUDED ? -1 : parseFloat(form.vat_rate);
      
      const orderData = {
        order_number: parseInt(form.order_number),
        order_date: form.order_date,
        description: form.description.trim() || null,
        observations: form.observations.trim() || null,
        budget_id: form.budget_id || null,
        supplier_contact_id: form.supplier_contact_id || null,
        client_contact_id: form.client_contact_id || null,
        vat_rate: vatRate,
        footer_contact_source: form.footer_contact_source
      };

      if (editingOrder) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(orderData)
          .eq('id', editingOrder.id);
        if (error) throw error;
        toast.success('Orden de pedido actualizada');
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert(orderData)
          .select()
          .single();
        if (error) {
          if (error.code === '23505') {
            toast.error('Ya existe una orden de pedido con ese número para esa fecha');
            return;
          }
          throw error;
        }
        toast.success('Orden de pedido creada');
        if (data) {
          setSelectedOrderForLines({
            ...data,
            lines_count: 0
          } as PurchaseOrder);
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
    if (!orderToDelete) return;
    try {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', orderToDelete.id);
      if (error) throw error;
      toast.success('Orden de pedido eliminada');
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar');
    }
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(id)) newExpanded.delete(id); else newExpanded.add(id);
    setExpandedOrders(newExpanded);
  };

  const toggleYearExpanded = (year: number) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) newExpanded.delete(year); else newExpanded.add(year);
    setExpandedYears(newExpanded);
  };

  const formatDate = (dateStr: string) => format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });

  const formatVatRate = (rate: number): string => {
    if (rate === -1) return 'IVA no incluido';
    return `IVA ${rate}%`;
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (filters.budgetId && order.budget_id !== filters.budgetId) return false;
      if (filters.dateFrom && order.order_date < filters.dateFrom) return false;
      if (filters.dateTo && order.order_date > filters.dateTo) return false;
      if (filters.searchQuery) {
        const q = filters.searchQuery;
        const matchesSearch =
          searchMatch(order.order_id, q) ||
          searchMatch(order.description, q) ||
          searchMatch(order.observations, q) ||
          searchMatch(order.presupuesto?.nombre, q) ||
          searchMatch(getContactDisplayName(order.supplier_contact), q) ||
          searchMatch(getContactDisplayName(order.client_contact), q) ||
          searchMatch(order.total.toString(), q) ||
          searchMatch(formatDate(order.order_date), q);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [orders, filters]);

  const ordersByYear = useMemo(() => {
    const grouped = new Map<number, PurchaseOrder[]>();
    filteredOrders.forEach(order => {
      const year = getYearFromDate(order.order_date);
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year)!.push(order);
    });
    grouped.forEach((yearOrders) => {
      yearOrders.sort((a, b) => b.order_number - a.order_number);
    });
    return Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]);
  }, [filteredOrders]);

  const hasActiveFilters = filters.budgetId || filters.dateFrom || filters.dateTo || filters.searchQuery;

  const handleFormDateChange = (newDate: string) => {
    const year = getYearFromDate(newDate);
    const nextNumber = getNextOrderNumber(year);
    setForm({
      ...form,
      order_date: newDate,
      order_number: editingOrder ? form.order_number : nextNumber.toString()
    });
  };

  // Filtered contacts for supplier/client selectors
  const filteredSupplierContacts = useMemo(() => {
    if (!contactSearch.supplier) return contacts;
    return contacts.filter(c => searchMatch(getContactDisplayName(c), contactSearch.supplier));
  }, [contacts, contactSearch.supplier]);

  const filteredClientContacts = useMemo(() => {
    if (!contactSearch.client) return contacts;
    return contacts.filter(c => searchMatch(getContactDisplayName(c), contactSearch.client));
  }, [contacts, contactSearch.client]);

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
          <h2 className="text-lg font-semibold">Órdenes de Pedido</h2>
          <p className="text-sm text-muted-foreground">
            Gestión de órdenes de pedido a proveedores
            {hasActiveFilters && ` • Mostrando ${filteredOrders.length} de ${orders.length}`}
          </p>
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
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setFilters({ ...filters, searchQuery: '' })}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)} className="gap-2">
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
            Nueva Orden
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[200px]">
                <Label>Presupuesto</Label>
                <Select value={filters.budgetId} onValueChange={(v) => setFilters({ ...filters, budgetId: v === 'all' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Todos los presupuestos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los presupuestos</SelectItem>
                    {allPresupuestos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.codigo_correlativo} - {p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha desde</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="w-[160px]" />
              </div>
              <div className="space-y-2">
                <Label>Fecha hasta</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="w-[160px]" />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" onClick={() => setFilters(emptyFilters)} className="gap-2">
                  <X className="h-4 w-4" /> Limpiar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters
              ? 'No hay órdenes de pedido que coincidan con los filtros.'
              : 'No hay órdenes de pedido. Crea la primera.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {ordersByYear.map(([year, yearOrders]) => (
            <Collapsible key={year} open={expandedYears.has(year)} onOpenChange={() => toggleYearExpanded(year)}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedYears.has(year) ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        <CardTitle className="text-lg">{year}</CardTitle>
                        <Badge variant="outline">{yearOrders.length} orden(es)</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 mt-3 ml-4">
                  {yearOrders.map((order) => (
                    <Card key={order.id}>
                      <Collapsible open={expandedOrders.has(order.id)} onOpenChange={() => toggleExpanded(order.id)}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {expandedOrders.has(order.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-orange-500 text-white">
                                      OP {order.order_id}
                                    </Badge>
                                    <CardTitle className="text-base">
                                      {order.description || 'Sin descripción'}
                                    </CardTitle>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                    <span>{formatDate(order.order_date)}</span>
                                    <span>|</span>
                                    <span>{getContactDisplayName(order.supplier_contact)}</span>
                                    <span>|</span>
                                    <span>{order.presupuesto?.nombre || 'Sin presupuesto'}</span>
                                    <span>|</span>
                                    <span>{order.lines_count || 0} líneas</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="text-sm text-muted-foreground">{formatVatRate(order.vat_rate)}</span>
                                  <div className="font-semibold">{formatCurrency(order.total)}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setOrderToPrint(order); }} title="Imprimir">
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenEdit(order); }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setOrderToDelete(order); setDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 pb-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
                              <div>
                                <div className="text-sm text-muted-foreground">Proveedor</div>
                                <div className="font-medium">{getContactDisplayName(order.supplier_contact)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Cliente</div>
                                <div className="font-medium">{getContactDisplayName(order.client_contact)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Subtotal</div>
                                <div className="font-medium">{formatCurrency(order.subtotal)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">{formatVatRate(order.vat_rate)}</div>
                                <div className="font-medium">{order.vat_rate === -1 ? '-' : formatCurrency(order.vat_amount)}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Presupuesto</div>
                                <div className="font-medium">{order.presupuesto?.nombre || '-'}</div>
                              </div>
                            </div>
                            {order.observations && (
                              <div className="mb-4 p-3 bg-muted/30 rounded-lg border-l-3 border-orange-400">
                                <div className="text-xs text-muted-foreground uppercase mb-1">Observaciones</div>
                                <div className="text-sm whitespace-pre-wrap">{order.observations}</div>
                              </div>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setSelectedOrderForLines(order)} className="gap-2">
                              <Plus className="h-4 w-4" />
                              Gestionar Líneas
                            </Button>
                            <div className="mt-4 border-t pt-3">
                              <AdminDocumentFiles documentType="purchase_order" documentId={order.id} />
                            </div>
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Editar Orden de Pedido' : 'Nueva Orden de Pedido'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Orden *</Label>
                <Input type="number" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} min="1" />
                <p className="text-xs text-muted-foreground">
                  {form.order_number && form.order_date && `ID: ${formatOrderId(parseInt(form.order_number) || 0, form.order_date)}`}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" value={form.order_date} onChange={(e) => handleFormDateChange(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción del pedido..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Proveedor / Suministrador</Label>
              <Select value={form.supplier_contact_id} onValueChange={(v) => setForm({ ...form, supplier_contact_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proveedor..." /></SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder="Buscar contacto..." value={contactSearch.supplier} onChange={(e) => setContactSearch({ ...contactSearch, supplier: e.target.value })} className="h-8" />
                  </div>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {filteredSupplierContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{getContactDisplayName(c)}{c.nif_dni ? ` (${c.nif_dni})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cliente (quién hace el pedido)</Label>
              <Select value={form.client_contact_id} onValueChange={(v) => setForm({ ...form, client_contact_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder="Buscar contacto..." value={contactSearch.client} onChange={(e) => setContactSearch({ ...contactSearch, client: e.target.value })} className="h-8" />
                  </div>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {filteredClientContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{getContactDisplayName(c)}{c.nif_dni ? ` (${c.nif_dni})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Presupuesto Relacionado</Label>
              <Select value={form.budget_id} onValueChange={(v) => setForm({ ...form, budget_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar presupuesto..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin presupuesto</SelectItem>
                  {presupuestos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.codigo_correlativo} - {p.nombre} ({p.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de IVA</Label>
              <Select value={form.vat_rate} onValueChange={(v) => setForm({ ...form, vat_rate: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                  ))}
                  <SelectItem value={VAT_RATE_NO_INCLUDED}>IVA no incluido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Datos de contacto al pie del documento</Label>
              <Select value={form.footer_contact_source} onValueChange={(v) => setForm({ ...form, footer_contact_source: v as FooterContactSource })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Empresa (datos propios)</SelectItem>
                  <SelectItem value="supplier">Proveedor / Suministrador</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observaciones..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingOrder ? 'Guardar Cambios' : 'Crear Orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Orden de Pedido"
        description={`¿Estás seguro de que deseas eliminar la orden ${orderToDelete?.order_id || ''}? Esta acción eliminará también todas las líneas asociadas.`}
      />

      {/* Lines Editor */}
      {selectedOrderForLines && (
        <PurchaseOrderLinesEditor
          order={selectedOrderForLines}
          onClose={() => { setSelectedOrderForLines(null); fetchData(); }}
        />
      )}

      {/* Print View */}
      {orderToPrint && (
        <PurchaseOrderPrintView
          order={orderToPrint}
          onClose={() => setOrderToPrint(null)}
        />
      )}
    </div>
  );
}
