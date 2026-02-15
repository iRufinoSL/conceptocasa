import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Ruler, Link2, X, Check, ExternalLink } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';
import { formatNumber } from '@/lib/format-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Measurement {
  id: string;
  budget_id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
  source: string | null;
  source_classification: string | null;
  floor: string | null;
  size_text: string | null;
  count_raw: number | null;
  created_at: string;
  updated_at: string;
}

const MEASUREMENT_UNITS = ['ud', 'm', 'm2', 'm3', 'kg', 'l', 'ml', 'h', 'día', 'sem', 'mes', 'año', 'pa', 'pza', 'rollo', 'saco', 'caja', 'palé'];

interface TolosaMeasurementsPanelProps {
  budgetId: string;
  tolosItemId: string;
  isAdmin: boolean;
  parentItemId?: string | null;
  onNavigateToMeasurements?: () => void;
  onMeasurementChange?: () => void;
}

export function TolosaMeasurementsPanel({ budgetId, tolosItemId, isAdmin, parentItemId, onNavigateToMeasurements, onMeasurementChange }: TolosaMeasurementsPanelProps) {
  const [linkedMeasurements, setLinkedMeasurements] = useState<Measurement[]>([]);
  const [inheritedMeasurements, setInheritedMeasurements] = useState<Measurement[]>([]);
  const [allMeasurements, setAllMeasurements] = useState<Measurement[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [isInheriting, setIsInheriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('ud');
  const [newManualUnits, setNewManualUnits] = useState<number | null>(null);
  const [newFloor, setNewFloor] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchLinked = useCallback(async () => {
    setLoading(true);
    // Get linked measurement IDs for this item
    const { data: links } = await supabase
      .from('tolosa_item_measurements')
      .select('measurement_id')
      .eq('tolosa_item_id', tolosItemId);

    const ids = new Set((links || []).map(l => l.measurement_id));
    setLinkedIds(ids);

    if (ids.size > 0) {
      const { data: measurements } = await supabase
        .from('budget_measurements')
        .select('*')
        .in('id', Array.from(ids))
        .order('name');
      setLinkedMeasurements((measurements as Measurement[]) || []);
      setInheritedMeasurements([]);
      setIsInheriting(false);
    } else {
      setLinkedMeasurements([]);
      // Walk up ancestor chain to find inherited measurements
      let currentParentId: string | null = parentItemId ?? null;
      let foundInherited = false;

      while (currentParentId && !foundInherited) {
        const { data: ancestorLinks } = await supabase
          .from('tolosa_item_measurements')
          .select('measurement_id')
          .eq('tolosa_item_id', currentParentId);
        const ancestorIds = (ancestorLinks || []).map(l => l.measurement_id);

        if (ancestorIds.length > 0) {
          const { data: ancestorMeasurements } = await supabase
            .from('budget_measurements')
            .select('*')
            .in('id', ancestorIds)
            .order('name');
          setInheritedMeasurements((ancestorMeasurements as Measurement[]) || []);
          setIsInheriting(true);
          foundInherited = true;
        } else {
          // Go up to next ancestor
          const { data: parentItem } = await supabase
            .from('tolosa_items')
            .select('parent_id')
            .eq('id', currentParentId)
            .single();
          currentParentId = parentItem?.parent_id ?? null;
        }
      }

      if (!foundInherited) {
        setInheritedMeasurements([]);
        setIsInheriting(false);
      }
    }
    setLoading(false);
  }, [tolosItemId, parentItemId]);

  const fetchAllMeasurements = useCallback(async () => {
    const { data } = await supabase
      .from('budget_measurements')
      .select('*')
      .eq('budget_id', budgetId)
      .order('name');
    setAllMeasurements((data as Measurement[]) || []);
  }, [budgetId]);

  useEffect(() => { fetchLinked(); }, [fetchLinked]);
  useEffect(() => { if (showSearch) fetchAllMeasurements(); }, [showSearch, fetchAllMeasurements]);

  const linkMeasurement = async (measurementId: string) => {
    const { error } = await supabase
      .from('tolosa_item_measurements')
      .insert({ tolosa_item_id: tolosItemId, measurement_id: measurementId });
    if (error) {
      if (error.code === '23505') {
        toast.info('Esta medición ya está vinculada');
      } else {
        toast.error('Error al vincular medición');
      }
    } else {
      toast.success('Medición vinculada');
      fetchLinked();
      fetchAllMeasurements();
      onMeasurementChange?.();
    }
  };

  const unlinkMeasurement = async (measurementId: string) => {
    const { error } = await supabase
      .from('tolosa_item_measurements')
      .delete()
      .eq('tolosa_item_id', tolosItemId)
      .eq('measurement_id', measurementId);
    if (error) {
      toast.error('Error al desvincular');
    } else {
      toast.success('Medición desvinculada');
      fetchLinked();
      onMeasurementChange?.();
    }
  };

  const createAndLink = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('budget_measurements')
      .insert({
        budget_id: budgetId,
        name: newName.trim(),
        measurement_unit: newUnit,
        manual_units: newManualUnits,
        floor: newFloor.trim() || null,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error('Error al crear medición');
      setCreating(false);
      return;
    }

    // Link it
    await supabase
      .from('tolosa_item_measurements')
      .insert({ tolosa_item_id: tolosItemId, measurement_id: data.id });

    toast.success('Medición creada y vinculada');
    setShowCreateDialog(false);
    setNewName('');
    setNewUnit('ud');
    setNewManualUnits(null);
    setNewFloor('');
    setCreating(false);
    fetchLinked();
    fetchAllMeasurements();
    onMeasurementChange?.();
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ name: string; floor: string; manual_units: number | null; measurement_unit: string }>({ name: '', floor: '', manual_units: null, measurement_unit: 'ud' });
  const [saving, setSaving] = useState(false);

  const getCalculatedUnits = (m: Measurement): number => {
    if (m.manual_units != null) return m.manual_units;
    return m.count_raw ?? 0;
  };

  const startEdit = (m: Measurement) => {
    setEditingId(m.id);
    setEditData({
      name: m.name,
      floor: m.floor || '',
      manual_units: m.manual_units,
      measurement_unit: m.measurement_unit || 'ud',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editData.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('budget_measurements')
      .update({
        name: editData.name.trim(),
        floor: editData.floor.trim() || null,
        manual_units: editData.manual_units,
        measurement_unit: editData.measurement_unit,
      })
      .eq('id', editingId);
    setSaving(false);
    if (error) {
      toast.error('Error al guardar');
    } else {
      toast.success('Medición actualizada');
      setEditingId(null);
      fetchLinked();
      onMeasurementChange?.();
    }
  };

  // Filter available measurements (not yet linked)
  const availableMeasurements = allMeasurements.filter(m =>
    !linkedIds.has(m.id) && (
      !searchQuery || searchMatch(m.name, searchQuery) ||
      (m.floor && searchMatch(m.floor, searchQuery)) ||
      (m.measurement_unit && searchMatch(m.measurement_unit, searchQuery))
    )
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold flex items-center gap-1.5">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          Mediciones {isInheriting ? '(heredadas del padre)' : `vinculadas (${linkedMeasurements.length})`}
          {isInheriting && <Badge variant="outline" className="text-[9px] ml-1">heredadas</Badge>}
        </h5>
        <div className="flex gap-1">
          {onNavigateToMeasurements && (
            <Button size="sm" variant="outline" className="text-xs" onClick={onNavigateToMeasurements}>
              <ExternalLink className="h-3 w-3 mr-1" /> Ver Mediciones
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowSearch(!showSearch)}>
            <Search className="h-3 w-3 mr-1" /> Buscar existente
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-3 w-3 mr-1" /> Nueva
          </Button>
        </div>
      </div>

      {/* Linked or inherited measurements list */}
      {(() => {
        const displayMeasurements = linkedMeasurements.length > 0 ? linkedMeasurements : inheritedMeasurements;
        const isDisplayInherited = linkedMeasurements.length === 0 && inheritedMeasurements.length > 0;

        if (loading) return <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>;

        if (displayMeasurements.length === 0) return (
          <div className="p-4 rounded border border-dashed text-center space-y-1">
            <Ruler className="h-6 w-6 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">Sin mediciones vinculadas</p>
            <p className="text-xs text-muted-foreground">Busca una medición existente o crea una nueva.</p>
          </div>
        );

        return (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium">Nombre</th>
                <th className="text-center px-2 py-1.5 font-medium w-16">Planta</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">Uds</th>
                <th className="text-center px-2 py-1.5 font-medium w-14">Tipo</th>
                <th className="text-center px-2 py-1.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {displayMeasurements.map(m => {
                const isEditing = !isDisplayInherited && editingId === m.id;
                return (
                  <tr key={m.id} className={`border-t hover:bg-accent/20 transition-colors ${isDisplayInherited ? 'opacity-70' : ''}`}>
                    {isEditing ? (
                      <>
                        <td className="px-2 py-1">
                          <Input
                            value={editData.name}
                            onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={editData.floor}
                            onChange={e => setEditData(d => ({ ...d, floor: e.target.value }))}
                            className="h-7 text-sm text-center w-16"
                            placeholder="—"
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <NumericInput
                            value={editData.manual_units}
                            onChange={v => setEditData(d => ({ ...d, manual_units: v }))}
                            className="h-7 text-sm text-right w-20"
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Select value={editData.measurement_unit} onValueChange={v => setEditData(d => ({ ...d, measurement_unit: v }))}>
                            <SelectTrigger className="h-7 text-xs w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEASUREMENT_UNITS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <div className="flex gap-0.5 justify-center">
                            <button onClick={saveEdit} disabled={saving} className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" title="Guardar">
                              <Check className="h-3 w-3" />
                            </button>
                            <button onClick={cancelEdit} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Cancelar">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 cursor-pointer" onClick={() => !isDisplayInherited && startEdit(m)}>
                          <span className="font-medium">{m.name}</span>
                          {m.source && (
                            <Badge variant="outline" className="ml-2 text-[9px]">{m.source}</Badge>
                          )}
                          {isDisplayInherited && (
                            <Badge variant="outline" className="ml-2 text-[9px] border-amber-300 text-amber-600">heredada</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground text-xs cursor-pointer" onClick={() => !isDisplayInherited && startEdit(m)}>
                          {m.floor || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs cursor-pointer" onClick={() => !isDisplayInherited && startEdit(m)}>
                          {formatNumber(getCalculatedUnits(m))}
                        </td>
                        <td className="px-2 py-1.5 text-center cursor-pointer" onClick={() => !isDisplayInherited && startEdit(m)}>
                          <Badge variant="secondary" className="text-[9px]">{m.measurement_unit || 'ud'}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {!isDisplayInherited && (
                            <button
                              onClick={() => unlinkMeasurement(m.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Desvincular medición"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })()}

      {/* Search panel */}
      {showSearch && (
        <div className="space-y-2 p-3 rounded border border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar medición por nombre, planta, tipo..."
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {availableMeasurements.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {availableMeasurements.slice(0, 30).map(m => (
                <button
                  key={m.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded flex items-center justify-between gap-2 transition-colors"
                  onClick={() => linkMeasurement(m.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link2 className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate font-medium">{m.name}</span>
                    {m.floor && <span className="text-xs text-muted-foreground shrink-0">({m.floor})</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">{formatNumber(getCalculatedUnits(m))}</span>
                    <Badge variant="secondary" className="text-[9px]">{m.measurement_unit || 'ud'}</Badge>
                  </div>
                </button>
              ))}
              {availableMeasurements.length > 30 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{availableMeasurements.length - 30} más — refina la búsqueda
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                {searchQuery ? 'No se encontraron mediciones' : 'Todas las mediciones ya están vinculadas'}
              </p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShowSearch(false); setShowCreateDialog(true); }}>
                <Plus className="h-3 w-3 mr-1" /> Crear nueva medición
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Medición</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej: Tabiquería interior, Solado planta baja..."
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Unidad</Label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cantidad</Label>
                <NumericInput
                  value={newManualUnits}
                  onChange={setNewManualUnits}
                  className="h-8"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Planta</Label>
                <Input
                  value={newFloor}
                  onChange={e => setNewFloor(e.target.value)}
                  className="h-8"
                  placeholder="PB, P1..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={createAndLink} disabled={!newName.trim() || creating}>
              <Plus className="h-3 w-3 mr-1" /> Crear y vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
