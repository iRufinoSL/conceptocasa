import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Package, X, Link2, Pencil } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResourceSupplierSelect } from '@/components/ResourceSupplierSelect';

interface BudgetResource {
  id: string;
  budget_id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
  description: string | null;
  supplier_id: string | null;
  signed_subtotal: number | null;
  purchase_vat_percent: number | null;
  purchase_units: number | null;
  purchase_unit_measure: string | null;
  purchase_unit_cost: number | null;
}

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos', 'Tarea', 'Equipo', 'Material', 'Utiles y herramientas'];
const UNIT_MEASURES = ['m2', 'm3', 'ml', 'mes', 'ud', 'kg', 'hora', 'día'];

const RESOURCE_SELECT_FIELDS = 'id, budget_id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units, activity_id, description, supplier_id, signed_subtotal, purchase_vat_percent, purchase_units, purchase_unit_measure, purchase_unit_cost';

interface TolosaResourcesPanelProps {
  budgetId: string;
  tolosItemId: string;
  isAdmin: boolean;
  parentItemId?: string | null;
  onSubtotalChange?: (subtotal: number) => void;
}

const defaultForm = {
  name: '',
  external_unit_cost: 0,
  unit: 'ud',
  resource_type: 'Producto',
  safety_margin_percent: 0.15,
  sales_margin_percent: 0.25,
  manual_units: null as number | null,
  related_units: null as number | null,
  description: '',
  supplier_id: null as string | null,
  purchase_vat_percent: 21,
  purchase_units: null as number | null,
  purchase_unit_measure: '',
  purchase_unit_cost: null as number | null,
};

export function TolosaResourcesPanel({ budgetId, tolosItemId, isAdmin, parentItemId, onSubtotalChange }: TolosaResourcesPanelProps) {
  const [linkedResources, setLinkedResources] = useState<BudgetResource[]>([]);
  const [allResources, setAllResources] = useState<BudgetResource[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingResource, setEditingResource] = useState<BudgetResource | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(defaultForm);
  const [measurementUnits, setMeasurementUnits] = useState<number>(0);

  // Fetch measurements linked to this QUÉ? (own or inherited from parent)
  const fetchMeasurementUnits = useCallback(async () => {
    // First check own measurements
    const { data: ownLinks } = await supabase
      .from('tolosa_item_measurements')
      .select('measurement_id')
      .eq('tolosa_item_id', tolosItemId);
    
    let measurementIds = (ownLinks || []).map((l: any) => l.measurement_id);
    
    // If no own measurements, inherit from parent
    if (measurementIds.length === 0 && parentItemId) {
      const { data: parentLinks } = await supabase
        .from('tolosa_item_measurements')
        .select('measurement_id')
        .eq('tolosa_item_id', parentItemId);
      measurementIds = (parentLinks || []).map((l: any) => l.measurement_id);
    }
    
    if (measurementIds.length > 0) {
      const { data: measurements } = await supabase
        .from('budget_measurements')
        .select('manual_units, count_raw')
        .in('id', measurementIds);
      const total = (measurements || []).reduce((sum: number, m: any) => {
        return sum + (m.manual_units != null ? Number(m.manual_units) : Number(m.count_raw) || 0);
      }, 0);
      setMeasurementUnits(total);
    } else {
      setMeasurementUnits(0);
    }
  }, [tolosItemId, parentItemId]);

  // Use measurement units as related_units for subtotal calculation
  const getSubtotal = useCallback((r: BudgetResource) => calcResourceSubtotal({
    externalUnitCost: r.external_unit_cost,
    safetyPercent: r.safety_margin_percent,
    salesPercent: r.sales_margin_percent,
    manualUnits: r.manual_units,
    relatedUnits: r.manual_units != null ? r.related_units : measurementUnits,
  }), [measurementUnits]);

  const fetchLinked = useCallback(async () => {
    setLoading(true);
    const { data: links } = await supabase
      .from('tolosa_item_resources')
      .select('resource_id')
      .eq('tolosa_item_id', tolosItemId);

    const ids = new Set((links || []).map((l: any) => l.resource_id));
    setLinkedIds(ids);

    if (ids.size > 0) {
      const { data } = await supabase
        .from('budget_activity_resources')
        .select(RESOURCE_SELECT_FIELDS)
        .in('id', Array.from(ids))
        .order('name');
      setLinkedResources((data as BudgetResource[]) || []);
    } else {
      setLinkedResources([]);
    }
    setLoading(false);
  }, [tolosItemId]);

  const fetchAllResources = useCallback(async () => {
    const { data } = await supabase
      .from('budget_activity_resources')
      .select(RESOURCE_SELECT_FIELDS)
      .eq('budget_id', budgetId)
      .order('name');
    setAllResources((data as BudgetResource[]) || []);
  }, [budgetId]);

  useEffect(() => { fetchLinked(); }, [fetchLinked]);
  useEffect(() => { fetchMeasurementUnits(); }, [fetchMeasurementUnits]);
  useEffect(() => { if (showSearch) fetchAllResources(); }, [showSearch, fetchAllResources]);

  useEffect(() => {
    const total = linkedResources.reduce((sum, r) => sum + getSubtotal(r), 0);
    onSubtotalChange?.(total);
  }, [linkedResources, onSubtotalChange, measurementUnits, getSubtotal]);

  const linkResource = async (resourceId: string) => {
    const { error } = await supabase
      .from('tolosa_item_resources')
      .insert({ tolosa_item_id: tolosItemId, resource_id: resourceId });
    if (error) {
      if (error.code === '23505') toast.info('Este recurso ya está vinculado');
      else toast.error('Error al vincular recurso');
    } else {
      toast.success('Recurso vinculado');
      fetchLinked();
      fetchAllResources();
    }
  };

  const unlinkResource = async (resourceId: string) => {
    const { error } = await supabase
      .from('tolosa_item_resources')
      .delete()
      .eq('tolosa_item_id', tolosItemId)
      .eq('resource_id', resourceId);
    if (error) toast.error('Error al desvincular');
    else { toast.success('Recurso desvinculado'); fetchLinked(); }
  };

  // Open create dialog
  const openCreate = () => {
    setEditingResource(null);
    setFormData(defaultForm);
    setShowFormDialog(true);
  };

  // Open edit dialog
  const openEdit = (r: BudgetResource) => {
    setEditingResource(r);
    setFormData({
      name: r.name,
      external_unit_cost: r.external_unit_cost || 0,
      unit: r.unit || 'ud',
      resource_type: r.resource_type || 'Producto',
      safety_margin_percent: r.safety_margin_percent ?? 0.15,
      sales_margin_percent: r.sales_margin_percent ?? 0.25,
      manual_units: r.manual_units,
      related_units: r.related_units,
      description: r.description || '',
      supplier_id: r.supplier_id || null,
      purchase_vat_percent: r.purchase_vat_percent ?? 21,
      purchase_units: r.purchase_units ?? null,
      purchase_unit_measure: r.purchase_unit_measure || '',
      purchase_unit_cost: r.purchase_unit_cost ?? null,
    });
    setShowFormDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);

    const payload = {
      budget_id: budgetId,
      name: formData.name.trim(),
      external_unit_cost: formData.external_unit_cost,
      unit: formData.unit,
      resource_type: formData.resource_type,
      safety_margin_percent: formData.safety_margin_percent,
      sales_margin_percent: formData.sales_margin_percent,
      manual_units: formData.manual_units,
      related_units: formData.related_units,
      description: formData.description || null,
      supplier_id: formData.supplier_id,
      purchase_vat_percent: formData.purchase_vat_percent,
      purchase_units: formData.purchase_units,
      purchase_unit_measure: formData.purchase_unit_measure || null,
      purchase_unit_cost: formData.purchase_unit_cost,
    };

    try {
      if (editingResource) {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update(payload)
          .eq('id', editingResource.id);
        if (error) throw error;
        toast.success('Recurso actualizado');
      } else {
        const { data, error } = await supabase
          .from('budget_activity_resources')
          .insert(payload)
          .select()
          .single();
        if (error || !data) throw error || new Error('No data');
        // Link to tolosa item
        await supabase
          .from('tolosa_item_resources')
          .insert({ tolosa_item_id: tolosItemId, resource_id: data.id });
        toast.success('Recurso creado y vinculado');
      }
      setShowFormDialog(false);
      fetchLinked();
      fetchAllResources();
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err?.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // Derived calculations for form
  const safetyMarginUd = formData.external_unit_cost * formData.safety_margin_percent;
  const internalCostUd = formData.external_unit_cost + safetyMarginUd;
  const salesMarginUd = internalCostUd * formData.sales_margin_percent;
  const salesCostUd = internalCostUd + salesMarginUd;
  const calculatedUnits = formData.manual_units !== null ? formData.manual_units : measurementUnits;
  const subtotalSales = calculatedUnits * salesCostUd;

  const purchaseUnitCost = formData.purchase_unit_cost ?? formData.external_unit_cost;
  const purchaseUnits = formData.purchase_units ?? calculatedUnits;
  const purchaseVatPercent = formData.purchase_vat_percent ?? 21;
  const vatAmount = purchaseUnitCost * purchaseUnits * (purchaseVatPercent / 100);
  const purchaseSubtotal = (purchaseUnitCost * purchaseUnits) + vatAmount;

  const totalSubtotal = linkedResources.reduce((sum, r) => sum + getSubtotal(r), 0);

  const availableResources = allResources.filter(r =>
    !linkedIds.has(r.id) && (
      !searchQuery || searchMatch(r.name, searchQuery) ||
      (r.resource_type && searchMatch(r.resource_type, searchQuery))
    )
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold flex items-center gap-1.5">
          <Package className="h-4 w-4 text-muted-foreground" />
          Recursos ({linkedResources.length})
          {totalSubtotal > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs font-mono">
              {formatCurrency(totalSubtotal)}
            </Badge>
          )}
        </h5>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowSearch(!showSearch)}>
            <Search className="h-3 w-3 mr-1" /> Buscar
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" /> Nuevo
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
      ) : linkedResources.length === 0 ? (
        <div className="p-4 rounded border border-dashed text-center space-y-1">
          <Package className="h-6 w-6 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Sin recursos vinculados</p>
          <p className="text-xs text-muted-foreground">Busca un recurso existente o crea uno nuevo.</p>
        </div>
      ) : (
        <div className="border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium">Nombre</th>
                <th className="text-center px-2 py-1.5 font-medium w-20">Tipo</th>
                <th className="text-right px-2 py-1.5 font-medium w-24">€Coste Ud (IVA incl.)</th>
                <th className="text-right px-2 py-1.5 font-medium w-16">%IVA</th>
                <th className="text-right px-2 py-1.5 font-medium w-14">%Seg.</th>
                <th className="text-right px-2 py-1.5 font-medium w-14">%Vta.</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">Uds</th>
                <th className="text-right px-2 py-1.5 font-medium w-24">SubTotal</th>
                <th className="text-center px-2 py-1.5 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {linkedResources.map(r => {
                const units = r.manual_units ?? measurementUnits;
                const subtotal = getSubtotal(r);
                const vatPct = r.purchase_vat_percent ?? 21;
                const safetyPct = r.safety_margin_percent != null
                  ? (r.safety_margin_percent > 1 ? r.safety_margin_percent : r.safety_margin_percent * 100)
                  : 15;
                const salesPct = r.sales_margin_percent != null
                  ? (r.sales_margin_percent > 1 ? r.sales_margin_percent : r.sales_margin_percent * 100)
                  : 25;
                return (
                  <tr key={r.id} className="border-t hover:bg-accent/20 transition-colors">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{r.name}</span>
                      {r.description && (
                        <span className="text-xs text-muted-foreground ml-1 truncate">— {r.description}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Badge variant="outline" className="text-[9px]">{r.resource_type || '—'}</Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {r.external_unit_cost != null ? formatCurrency(r.external_unit_cost) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {vatPct}%
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {safetyPct.toFixed(0)}%
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {salesPct.toFixed(0)}%
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {formatNumber(units)} {r.unit || ''}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">
                      {formatCurrency(subtotal)}
                    </td>
                    <td className="px-2 py-1.5 text-center flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title="Editar recurso"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => unlinkResource(r.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Desvincular recurso"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {linkedResources.length > 1 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold text-xs">
                  <td colSpan={7} className="px-3 py-1.5 text-right">Total</td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(totalSubtotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Search panel */}
      {showSearch && (
        <div className="space-y-2 p-3 rounded border border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar recurso por nombre, tipo..."
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {availableResources.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {availableResources.slice(0, 30).map(r => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded flex items-center justify-between gap-2 transition-colors"
                  onClick={() => linkResource(r.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link2 className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate font-medium">{r.name}</span>
                    {r.resource_type && <Badge variant="outline" className="text-[9px] shrink-0">{r.resource_type}</Badge>}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {r.external_unit_cost != null ? formatCurrency(r.external_unit_cost) : '—'}
                  </span>
                </button>
              ))}
              {availableResources.length > 30 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{availableResources.length - 30} más — refina la búsqueda
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                {searchQuery ? 'No se encontraron recursos' : 'Todos los recursos ya están vinculados'}
              </p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShowSearch(false); openCreate(); }}>
                <Plus className="h-3 w-3 mr-1" /> Crear nuevo recurso
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Full resource form dialog (create / edit) */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingResource ? 'Editar Recurso' : 'Nuevo Recurso'}</DialogTitle>
            <DialogDescription>
              {editingResource ? 'Modifica los datos del recurso' : 'Introduce los datos del nuevo recurso'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nombre del Recurso *</Label>
              <Input value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} placeholder="Ej: Ladrillo, Oficial 1ª..." autoFocus />
            </div>

            {/* Row 1: Cost (IVA incl.) + %IVA + Unit + Type */}
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>€Coste Ud externa (IVA incl.)</Label>
                <NumericInput
                  value={formData.external_unit_cost}
                  onChange={v => setFormData(d => ({ ...d, external_unit_cost: v ?? 0 }))}
                  decimals={2}
                />
              </div>
              <div className="space-y-2">
                <Label>%IVA Recurso compra externa</Label>
                <NumericInput
                  value={formData.purchase_vat_percent}
                  onChange={v => setFormData(d => ({ ...d, purchase_vat_percent: v ?? 21 }))}
                  decimals={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Ud medida</Label>
                <Select value={formData.unit} onValueChange={v => setFormData(d => ({ ...d, unit: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_MEASURES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo Recurso</Label>
                <Select value={formData.resource_type} onValueChange={v => setFormData(d => ({ ...d, resource_type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Safety margin */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>%Margen seguridad</Label>
                <NumericInput
                  value={formData.safety_margin_percent * 100}
                  onChange={v => setFormData(d => ({ ...d, safety_margin_percent: Math.max(0, v ?? 0) / 100 }))}
                  decimals={2}
                />
              </div>
              <div className="space-y-2">
                <Label>€Margen seguridad ud</Label>
                <Input value={formatCurrency(safetyMarginUd)} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>€Coste ud interna</Label>
                <Input value={formatCurrency(internalCostUd)} disabled className="bg-muted" />
              </div>
            </div>

            {/* Row 3: Sales margin */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>%Margen venta</Label>
                <NumericInput
                  value={formData.sales_margin_percent * 100}
                  onChange={v => setFormData(d => ({ ...d, sales_margin_percent: Math.max(0, v ?? 0) / 100 }))}
                  decimals={2}
                />
              </div>
              <div className="space-y-2">
                <Label>€Margen venta ud</Label>
                <Input value={formatCurrency(salesMarginUd)} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>€Coste venta ud</Label>
                <Input value={formatCurrency(salesCostUd)} disabled className="bg-muted font-semibold" />
              </div>
            </div>

            {/* Row 4: Units */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Uds manual</Label>
                <NumericInput
                  value={formData.manual_units ?? 0}
                  onChange={v => setFormData(d => ({ ...d, manual_units: v === 0 ? null : v }))}
                  decimals={2}
                />
                <p className="text-xs text-muted-foreground">Dejar vacío para usar Uds relacionadas</p>
              </div>
              <div className="space-y-2">
                <Label>Uds relacionadas</Label>
                <NumericInput
                  value={formData.related_units ?? 0}
                  onChange={v => setFormData(d => ({ ...d, related_units: v === 0 ? null : v }))}
                  decimals={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Uds calculadas</Label>
                <Input
                  value={calculatedUnits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  disabled className="bg-muted font-semibold"
                />
              </div>
            </div>

            {/* Row 4.5: Buying list fields */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Campos Lista de Compra</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>€Coste ud compra</Label>
                  <NumericInput
                    value={formData.purchase_unit_cost ?? formData.external_unit_cost}
                    onChange={v => setFormData(d => ({ ...d, purchase_unit_cost: v === d.external_unit_cost ? null : v }))}
                    decimals={2}
                  />
                  <p className="text-xs text-muted-foreground">Por defecto = €Coste ud externa</p>
                </div>
                <div className="space-y-2">
                  <Label>€Importe IVA</Label>
                  <Input value={formatCurrency(vatAmount)} disabled className="bg-blue-100 dark:bg-blue-900/50" />
                </div>
                <div className="space-y-2">
                  <Label>€SubTotal compra</Label>
                  <Input value={formatCurrency(purchaseSubtotal)} disabled className="bg-blue-100 dark:bg-blue-900/50 font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Ud medida lista compra</Label>
                  <Select
                    value={formData.purchase_unit_measure || formData.unit}
                    onValueChange={v => setFormData(d => ({ ...d, purchase_unit_measure: v }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_MEASURES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Uds compra</Label>
                  <NumericInput
                    value={formData.purchase_units ?? calculatedUnits}
                    onChange={v => setFormData(d => ({ ...d, purchase_units: v }))}
                    decimals={2}
                  />
                </div>
              </div>
            </div>

            {/* Subtotal venta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>€Subtotal venta</Label>
                <Input value={formatCurrency(subtotalSales)} disabled className="bg-primary/10 font-bold text-primary" />
              </div>
              <div className="space-y-2">
                <Label>Suministrador / Proveedor</Label>
                <ResourceSupplierSelect
                  value={formData.supplier_id}
                  onChange={sid => setFormData(d => ({ ...d, supplier_id: sid }))}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formData.description} onChange={e => setFormData(d => ({ ...d, description: e.target.value }))} placeholder="Descripción opcional..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowFormDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving ? 'Guardando...' : editingResource ? 'Actualizar' : 'Crear y vincular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
