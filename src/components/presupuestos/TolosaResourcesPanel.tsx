import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Package, X, Link2 } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
}

const RESOURCE_TYPES = ['Material', 'Mano de obra', 'Alquiler', 'Equipo', 'Producto', 'Servicio', 'Utiles y herramientas'];
const UNIT_MEASURES = ['m2', 'm3', 'ml', 'mes', 'ud', 'kg', 'hora', 'día'];

interface TolosaResourcesPanelProps {
  budgetId: string;
  tolosItemId: string;
  isAdmin: boolean;
  onSubtotalChange?: (subtotal: number) => void;
}

export function TolosaResourcesPanel({ budgetId, tolosItemId, isAdmin, onSubtotalChange }: TolosaResourcesPanelProps) {
  const [linkedResources, setLinkedResources] = useState<BudgetResource[]>([]);
  const [allResources, setAllResources] = useState<BudgetResource[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('ud');
  const [newType, setNewType] = useState('Material');
  const [newUnitCost, setNewUnitCost] = useState<number | null>(null);
  const [newUnits, setNewUnits] = useState<number | null>(null);

  const getSubtotal = (r: BudgetResource) => calcResourceSubtotal({
    externalUnitCost: r.external_unit_cost,
    safetyPercent: r.safety_margin_percent,
    salesPercent: r.sales_margin_percent,
    manualUnits: r.manual_units,
    relatedUnits: r.related_units,
  });

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
        .select('id, budget_id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units, activity_id, description, supplier_id')
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
      .select('id, budget_id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units, activity_id, description, supplier_id')
      .eq('budget_id', budgetId)
      .order('name');
    setAllResources((data as BudgetResource[]) || []);
  }, [budgetId]);

  useEffect(() => { fetchLinked(); }, [fetchLinked]);
  useEffect(() => { if (showSearch) fetchAllResources(); }, [showSearch, fetchAllResources]);

  // Notify parent of subtotal changes
  useEffect(() => {
    const total = linkedResources.reduce((sum, r) => sum + getSubtotal(r), 0);
    onSubtotalChange?.(total);
  }, [linkedResources, onSubtotalChange]);

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

  const createAndLink = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('budget_activity_resources')
      .insert({
        budget_id: budgetId,
        name: newName.trim(),
        unit: newUnit,
        resource_type: newType,
        external_unit_cost: newUnitCost,
        manual_units: newUnits,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error('Error al crear recurso');
      setCreating(false);
      return;
    }

    await supabase
      .from('tolosa_item_resources')
      .insert({ tolosa_item_id: tolosItemId, resource_id: data.id });

    toast.success('Recurso creado y vinculado');
    setShowCreateDialog(false);
    setNewName(''); setNewUnit('ud'); setNewType('Material'); setNewUnitCost(null); setNewUnits(null);
    setCreating(false);
    fetchLinked();
    fetchAllResources();
  };

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
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowCreateDialog(true)}>
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
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium">Nombre</th>
                <th className="text-center px-2 py-1.5 font-medium w-16">Tipo</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">Uds</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">€/Ud</th>
                <th className="text-right px-2 py-1.5 font-medium w-24">SubTotal</th>
                <th className="text-center px-2 py-1.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {linkedResources.map(r => {
                const units = r.manual_units ?? r.related_units ?? 0;
                const subtotal = getSubtotal(r);
                return (
                  <tr key={r.id} className="border-t hover:bg-accent/20 transition-colors">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{r.name}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Badge variant="outline" className="text-[9px]">{r.resource_type || '—'}</Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {formatNumber(units)} {r.unit || ''}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {r.external_unit_cost != null ? formatCurrency(r.external_unit_cost) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">
                      {formatCurrency(subtotal)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
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
                  <td colSpan={4} className="px-3 py-1.5 text-right">Total</td>
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
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShowSearch(false); setShowCreateDialog(true); }}>
                <Plus className="h-3 w-3 mr-1" /> Crear nuevo recurso
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Recurso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Ladrillo, Oficial 1ª..." autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Unidad</Label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_MEASURES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Coste unitario (€)</Label>
                <NumericInput value={newUnitCost} onChange={setNewUnitCost} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Unidades</Label>
                <NumericInput value={newUnits} onChange={setNewUnits} className="h-8" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={createAndLink} disabled={creating || !newName.trim()}>
              <Plus className="h-3 w-3 mr-1" /> Crear y vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
