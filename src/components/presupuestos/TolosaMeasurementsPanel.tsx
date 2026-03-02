import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Ruler, Link2, X, ExternalLink, ChevronDown, ChevronRight, Layers, Home, Building } from 'lucide-react';
import { formatNumber } from '@/lib/format-utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

interface FloorInfo {
  id: string;
  name: string;
  level: string;
  orderIndex: number;
}

interface RoomInfo {
  id: string;
  name: string;
  floorId: string | null;
}

// Surface type labels for grouping
const SURFACE_TYPE_LABELS: Record<string, string> = {
  suelo: 'Suelos',
  techo: 'Techos',
  ext: 'Paredes externas',
  int: 'Paredes internas',
  roof: 'Cubierta',
  volumen: 'Volumen',
};

const SURFACE_TYPE_ORDER = ['suelo', 'techo', 'ext', 'int', 'roof', 'volumen'];

interface TolosaMeasurementsPanelProps {
  budgetId: string;
  tolosItemId: string;
  isAdmin: boolean;
  parentItemId?: string | null;
  onNavigateToMeasurements?: () => void;
  onMeasurementChange?: () => void;
}

type GroupMode = 'level' | 'space';

/**
 * Parse source_classification to extract type and granularity.
 * Patterns: vol_<tipo>_room_<roomId>, vol_<tipo>_<floorId>, vol_<tipo>_total
 */
function parseClassification(sc: string): { surfaceType: string; granularity: 'room' | 'level' | 'total'; refId: string | null } | null {
  if (!sc.startsWith('vol_')) return null;
  const rest = sc.slice(4); // remove 'vol_'

  // Check for _total suffix
  if (rest.endsWith('_total')) {
    const tipo = rest.slice(0, -6); // remove '_total'
    return { surfaceType: tipo, granularity: 'total', refId: null };
  }

  // Check for _room_ pattern
  const roomMatch = rest.match(/^(.+?)_room_(.+)$/);
  if (roomMatch) {
    return { surfaceType: roomMatch[1], granularity: 'room', refId: roomMatch[2] };
  }

  // Otherwise it's a level: vol_<tipo>_<floorId>
  const lastUnderscore = rest.lastIndexOf('_');
  if (lastUnderscore > 0) {
    // The tipo could contain underscores... but our types are simple: suelo, techo, ext, int, roof, volumen
    // Try known types first
    for (const tipo of SURFACE_TYPE_ORDER) {
      if (rest.startsWith(tipo + '_')) {
        const floorId = rest.slice(tipo.length + 1);
        return { surfaceType: tipo, granularity: 'level', refId: floorId };
      }
    }
  }

  return null;
}

export function TolosaMeasurementsPanel({ budgetId, tolosItemId, isAdmin, parentItemId, onNavigateToMeasurements, onMeasurementChange }: TolosaMeasurementsPanelProps) {
  const [volumeMeasurements, setVolumeMeasurements] = useState<Measurement[]>([]);
  const [floors, setFloors] = useState<FloorInfo[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [inheritedIds, setInheritedIds] = useState<Set<string>>(new Set());
  const [isInheriting, setIsInheriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groupMode, setGroupMode] = useState<GroupMode>('level');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Fetch volume measurements + floors + rooms
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [measRes, floorsRes, roomsRes] = await Promise.all([
      supabase
        .from('budget_measurements')
        .select('*')
        .eq('budget_id', budgetId)
        .eq('source', 'volumen_auto')
        .order('name'),
      supabase
        .from('budget_floors')
        .select('id, name, level, order_index, floor_plan_id')
        .order('order_index'),
      supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, floor_id, floor_plan_id')
        .order('order_index'),
    ]);

    // Filter floors/rooms to only those belonging to floor plans of this budget
    const { data: floorPlans } = await supabase
      .from('budget_floor_plans')
      .select('id')
      .eq('budget_id', budgetId);
    const fpIds = new Set((floorPlans || []).map(fp => fp.id));

    const filteredFloors = (floorsRes.data || [])
      .filter((f: any) => fpIds.has(f.floor_plan_id))
      .map((f: any) => ({ id: f.id, name: f.name, level: f.level, orderIndex: f.order_index }));

    const filteredRooms = (roomsRes.data || [])
      .filter((r: any) => fpIds.has(r.floor_plan_id))
      .map((r: any) => ({ id: r.id, name: r.name, floorId: r.floor_id }));

    setVolumeMeasurements((measRes.data as Measurement[]) || []);
    setFloors(filteredFloors);
    setRooms(filteredRooms);
    setLoading(false);
  }, [budgetId]);

  // Fetch linked measurements for this item + inheritance
  const fetchLinked = useCallback(async () => {
    const { data: links } = await supabase
      .from('tolosa_item_measurements')
      .select('measurement_id')
      .eq('tolosa_item_id', tolosItemId);

    const ids = new Set((links || []).map(l => l.measurement_id));
    setLinkedIds(ids);

    if (ids.size > 0) {
      setInheritedIds(new Set());
      setIsInheriting(false);
    } else {
      // Walk up ancestors for inheritance
      let currentParentId: string | null = parentItemId ?? null;
      let found = false;
      while (currentParentId && !found) {
        const { data: ancestorLinks } = await supabase
          .from('tolosa_item_measurements')
          .select('measurement_id')
          .eq('tolosa_item_id', currentParentId);
        const ancestorMeasIds = (ancestorLinks || []).map(l => l.measurement_id);
        if (ancestorMeasIds.length > 0) {
          setInheritedIds(new Set(ancestorMeasIds));
          setIsInheriting(true);
          found = true;
        } else {
          const { data: parentItem } = await supabase
            .from('tolosa_items')
            .select('parent_id')
            .eq('id', currentParentId)
            .single();
          currentParentId = parentItem?.parent_id ?? null;
        }
      }
      if (!found) {
        setInheritedIds(new Set());
        setIsInheriting(false);
      }
    }
  }, [tolosItemId, parentItemId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchLinked(); }, [fetchLinked]);

  const activeIds = linkedIds.size > 0 ? linkedIds : inheritedIds;

  const linkMeasurement = async (measurementId: string) => {
    const { error } = await supabase
      .from('tolosa_item_measurements')
      .insert({ tolosa_item_id: tolosItemId, measurement_id: measurementId });
    if (error) {
      if (error.code === '23505') toast.info('Ya vinculada');
      else toast.error('Error al vincular');
    } else {
      toast.success('Medición vinculada');
      fetchLinked();
      onMeasurementChange?.();
    }
  };

  const unlinkMeasurement = async (measurementId: string) => {
    const { error } = await supabase
      .from('tolosa_item_measurements')
      .delete()
      .eq('tolosa_item_id', tolosItemId)
      .eq('measurement_id', measurementId);
    if (error) toast.error('Error al desvincular');
    else {
      toast.success('Medición desvinculada');
      fetchLinked();
      onMeasurementChange?.();
    }
  };

  const getUnits = (m: Measurement): number => m.manual_units ?? m.count_raw ?? 0;

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Build organized structure
  const floorMap = useMemo(() => new Map(floors.map(f => [f.id, f])), [floors]);
  const roomMap = useMemo(() => new Map(rooms.map(r => [r.id, r])), [rooms]);

  // Parse all measurements
  const parsed = useMemo(() => {
    return volumeMeasurements.map(m => ({
      measurement: m,
      parsed: m.source_classification ? parseClassification(m.source_classification) : null,
    })).filter(p => p.parsed !== null) as Array<{ measurement: Measurement; parsed: NonNullable<ReturnType<typeof parseClassification>> }>;
  }, [volumeMeasurements]);

  // Group by level
  const byLevel = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      orderIndex: number;
      items: Array<{ measurement: Measurement; surfaceType: string; granularity: string }>;
    }> = [];

    // Total group
    const totalItems = parsed.filter(p => p.parsed.granularity === 'total');
    if (totalItems.length > 0) {
      groups.push({
        key: 'total',
        label: 'Total Vivienda',
        orderIndex: 999,
        items: totalItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType, granularity: 'total' })),
      });
    }

    // Level groups
    const levelIds = new Set(parsed.filter(p => p.parsed.granularity === 'level').map(p => p.parsed.refId!));
    for (const floorId of levelIds) {
      const floor = floorMap.get(floorId);
      const levelItems = parsed.filter(p => p.parsed.granularity === 'level' && p.parsed.refId === floorId);
      const roomItems = parsed.filter(p => p.parsed.granularity === 'room' && (() => {
        const room = roomMap.get(p.parsed.refId!);
        return room?.floorId === floorId;
      })());
      groups.push({
        key: floorId,
        label: floor?.name || `Nivel ${floorId.slice(0, 6)}`,
        orderIndex: floor?.orderIndex ?? 50,
        items: [
          ...levelItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType, granularity: 'level' })),
          ...roomItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType, granularity: 'room' })),
        ],
      });
    }

    // Rooms without a matching floor in levelIds (orphans)
    const roomOnlyItems = parsed.filter(p => {
      if (p.parsed.granularity !== 'room') return false;
      const room = roomMap.get(p.parsed.refId!);
      if (!room?.floorId) return true;
      return !levelIds.has(room.floorId);
    });
    if (roomOnlyItems.length > 0) {
      groups.push({
        key: 'other_rooms',
        label: 'Otros espacios',
        orderIndex: 998,
        items: roomOnlyItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType, granularity: 'room' })),
      });
    }

    groups.sort((a, b) => a.orderIndex - b.orderIndex);
    return groups;
  }, [parsed, floorMap, roomMap]);

  // Group by space (room)
  const bySpace = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      floorName: string;
      items: Array<{ measurement: Measurement; surfaceType: string }>;
    }> = [];

    // Collect all room IDs from room-level measurements
    const roomIds = new Set(parsed.filter(p => p.parsed.granularity === 'room').map(p => p.parsed.refId!));
    for (const roomId of roomIds) {
      const room = roomMap.get(roomId);
      const floor = room?.floorId ? floorMap.get(room.floorId) : null;
      const roomItems = parsed.filter(p => p.parsed.granularity === 'room' && p.parsed.refId === roomId);
      groups.push({
        key: roomId,
        label: room?.name || `Espacio ${roomId.slice(0, 6)}`,
        floorName: floor?.name || '',
        items: roomItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType })),
      });
    }

    // Add level totals as a separate group
    const levelItems = parsed.filter(p => p.parsed.granularity === 'level');
    if (levelItems.length > 0) {
      const byFloor = new Map<string, typeof levelItems>();
      levelItems.forEach(p => {
        const fid = p.parsed.refId!;
        if (!byFloor.has(fid)) byFloor.set(fid, []);
        byFloor.get(fid)!.push(p);
      });
      for (const [fid, items] of byFloor) {
        const floor = floorMap.get(fid);
        groups.push({
          key: `level_${fid}`,
          label: `Totales ${floor?.name || 'Nivel'}`,
          floorName: floor?.name || '',
          items: items.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType })),
        });
      }
    }

    // Add totals
    const totalItems = parsed.filter(p => p.parsed.granularity === 'total');
    if (totalItems.length > 0) {
      groups.push({
        key: 'total',
        label: 'Total Vivienda',
        floorName: '',
        items: totalItems.map(p => ({ measurement: p.measurement, surfaceType: p.parsed.surfaceType })),
      });
    }

    return groups;
  }, [parsed, roomMap, floorMap]);

  const renderMeasurementRow = (m: Measurement, isActive: boolean, isInherit: boolean) => {
    const units = getUnits(m);
    return (
      <button
        key={m.id}
        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 transition-colors rounded ${
          isActive
            ? 'bg-primary/10 border border-primary/30'
            : 'hover:bg-accent'
        }`}
        onClick={() => {
          if (isInherit) return;
          if (isActive) unlinkMeasurement(m.id);
          else linkMeasurement(m.id);
        }}
        disabled={isInherit}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isActive && <Link2 className="h-3 w-3 text-primary shrink-0" />}
          <span className={`truncate ${isActive ? 'font-medium text-primary' : ''}`}>{m.name}</span>
          {isInherit && <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 shrink-0">heredada</Badge>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-mono text-muted-foreground">{formatNumber(units)}</span>
          <Badge variant="secondary" className="text-[9px]">{m.measurement_unit || 'ud'}</Badge>
          {isActive && !isInherit && (
            <X className="h-3 w-3 text-muted-foreground hover:text-destructive ml-1" />
          )}
        </div>
      </button>
    );
  };

  if (loading) return <p className="text-xs text-muted-foreground text-center py-4">Cargando mediciones de volúmenes...</p>;

  if (volumeMeasurements.length === 0) return (
    <div className="p-4 rounded border border-dashed text-center space-y-1">
      <Ruler className="h-6 w-6 text-muted-foreground/40 mx-auto" />
      <p className="text-sm text-muted-foreground">Sin mediciones de volúmenes</p>
      <p className="text-xs text-muted-foreground">Las mediciones se generan automáticamente desde la pestaña Volúmenes del plano.</p>
    </div>
  );

  const activeCount = activeIds.size;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h5 className="text-sm font-semibold flex items-center gap-1.5">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          Mediciones de Volúmenes
          {isInheriting && <Badge variant="outline" className="text-[9px] ml-1 border-amber-300 text-amber-600">heredadas del padre</Badge>}
          {activeCount > 0 && !isInheriting && (
            <Badge variant="default" className="text-[9px] ml-1">{activeCount} vinculadas</Badge>
          )}
        </h5>
        <div className="flex gap-1">
          {onNavigateToMeasurements && (
            <Button size="sm" variant="outline" className="text-xs" onClick={onNavigateToMeasurements}>
              <ExternalLink className="h-3 w-3 mr-1" /> Ver Mediciones
            </Button>
          )}
          <Button
            size="sm"
            variant={groupMode === 'level' ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => setGroupMode('level')}
          >
            <Layers className="h-3 w-3 mr-1" /> Por Nivel
          </Button>
          <Button
            size="sm"
            variant={groupMode === 'space' ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => setGroupMode('space')}
          >
            <Home className="h-3 w-3 mr-1" /> Por Espacio
          </Button>
        </div>
      </div>

      {/* Grouped measurement tree */}
      {groupMode === 'level' && (
        <div className="space-y-1">
          {byLevel.map(group => {
            const isExpanded = expandedSections.has(group.key);
            const groupActiveCount = group.items.filter(i => activeIds.has(i.measurement.id)).length;

            // Separate level-total items from room items
            const levelTotalItems = group.items.filter(i => i.granularity === 'level' || i.granularity === 'total');
            const roomItems = group.items.filter(i => i.granularity === 'room');

            // Group room items by surface type
            const roomsBySurface = new Map<string, typeof roomItems>();
            roomItems.forEach(ri => {
              if (!roomsBySurface.has(ri.surfaceType)) roomsBySurface.set(ri.surfaceType, []);
              roomsBySurface.get(ri.surfaceType)!.push(ri);
            });

            return (
              <Collapsible key={group.key} open={isExpanded} onOpenChange={() => toggleSection(group.key)}>
                <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{group.label}</span>
                  {groupActiveCount > 0 && <Badge variant="default" className="text-[9px]">{groupActiveCount}</Badge>}
                  <span className="text-xs text-muted-foreground">{group.items.length} mediciones</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 space-y-0.5 mt-1">
                  {/* Level totals first */}
                  {levelTotalItems
                    .sort((a, b) => SURFACE_TYPE_ORDER.indexOf(a.surfaceType) - SURFACE_TYPE_ORDER.indexOf(b.surfaceType))
                    .map(item => renderMeasurementRow(item.measurement, activeIds.has(item.measurement.id), isInheriting && inheritedIds.has(item.measurement.id) && !linkedIds.has(item.measurement.id)))}

                  {/* Room items grouped by surface type */}
                  {SURFACE_TYPE_ORDER.map(st => {
                    const items = roomsBySurface.get(st);
                    if (!items || items.length === 0) return null;
                    const stKey = `${group.key}_${st}`;
                    const stExpanded = expandedSections.has(stKey);
                    return (
                      <Collapsible key={stKey} open={stExpanded} onOpenChange={() => toggleSection(stKey)}>
                        <CollapsibleTrigger className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50 transition-colors text-left">
                          {stExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          <span className="text-xs text-muted-foreground">{SURFACE_TYPE_LABELS[st] || st} por espacio ({items.length})</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-4 space-y-0.5 mt-0.5">
                          {items.map(item => renderMeasurementRow(item.measurement, activeIds.has(item.measurement.id), isInheriting && inheritedIds.has(item.measurement.id) && !linkedIds.has(item.measurement.id)))}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {groupMode === 'space' && (
        <div className="space-y-1">
          {bySpace.map(group => {
            const isExpanded = expandedSections.has(group.key);
            const groupActiveCount = group.items.filter(i => activeIds.has(i.measurement.id)).length;

            return (
              <Collapsible key={group.key} open={isExpanded} onOpenChange={() => toggleSection(group.key)}>
                <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{group.label}</span>
                  {group.floorName && <span className="text-xs text-muted-foreground">{group.floorName}</span>}
                  {groupActiveCount > 0 && <Badge variant="default" className="text-[9px]">{groupActiveCount}</Badge>}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 space-y-0.5 mt-1">
                  {group.items
                    .sort((a, b) => SURFACE_TYPE_ORDER.indexOf(a.surfaceType) - SURFACE_TYPE_ORDER.indexOf(b.surfaceType))
                    .map(item => renderMeasurementRow(item.measurement, activeIds.has(item.measurement.id), isInheriting && inheritedIds.has(item.measurement.id) && !linkedIds.has(item.measurement.id)))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
