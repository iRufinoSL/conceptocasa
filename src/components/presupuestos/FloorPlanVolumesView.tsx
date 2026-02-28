import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FloorPlanData, RoomData, calculateRoofSlopes, RoofSlopeDetail, isExteriorType, isVisibleWall } from '@/lib/floor-plan-calculations';
import { Box, ChevronDown, ChevronRight, Plus, Trash2, Layers, ArrowDown, ArrowUp, ArrowRight as ArrowRightIcon, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FloorPlanVolumesViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors: { id: string; name: string; level: string; orderIndex: number }[];
  floorPlanId: string;
}

// 6 faces of a level volume + roof slopes
type SurfaceType = 'suelo' | 'cara_superior' | 'cara_derecha' | 'cara_inferior' | 'cara_izquierda' | 'techo' | 'cubierta_superior' | 'cubierta_inferior';

interface VolumeLayer {
  id: string;
  dbId?: string; // DB UUID if persisted
  name: string;
  thicknessMm: number;
  surfaceType: SurfaceType;
  includeNonStructural: boolean;
  dirty?: boolean;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

const SURFACE_DIRECTION: Record<SurfaceType, string> = {
  suelo: '↓ De arriba a abajo',
  cara_superior: '← Del exterior al interior',
  cara_derecha: '← Del exterior al interior',
  cara_inferior: '← Del exterior al interior',
  cara_izquierda: '← Del exterior al interior',
  techo: '↑ De abajo a arriba',
  cubierta_superior: '↑ Faldón superior (de abajo a arriba)',
  cubierta_inferior: '↑ Faldón inferior (de abajo a arriba)',
};

const SURFACE_LABELS: Record<SurfaceType, string> = {
  suelo: 'Suelo',
  cara_superior: 'Cara superior',
  cara_derecha: 'Cara derecha',
  cara_inferior: 'Cara inferior',
  cara_izquierda: 'Cara izquierda',
  techo: 'Techo',
  cubierta_superior: 'Faldón superior (Tejado 1)',
  cubierta_inferior: 'Faldón inferior (Tejado 2)',
};

const SURFACE_ICONS: Record<SurfaceType, React.ReactNode> = {
  suelo: <ArrowDown className="h-3.5 w-3.5" />,
  cara_superior: <ArrowUp className="h-3.5 w-3.5" />,
  cara_derecha: <ArrowRightIcon className="h-3.5 w-3.5" />,
  cara_inferior: <ArrowDown className="h-3.5 w-3.5" />,
  cara_izquierda: <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />,
  techo: <ArrowUp className="h-3.5 w-3.5" />,
  cubierta_superior: <ArrowUp className="h-3.5 w-3.5" />,
  cubierta_inferior: <ArrowUp className="h-3.5 w-3.5" />,
};

function isNonStructural(name: string): boolean {
  const n = (name || '').toLowerCase();
  return n.includes('acera') || n.includes('alero') || n.includes('eave');
}

/** Calculate 2D surface area for a given surface type */
function calcSurfaceArea(
  surfaceType: SurfaceType,
  plan: FloorPlanData,
  rooms: RoomData[],
  floorRooms: RoomData[],
  slopes: RoofSlopeDetail[],
  includeNonStructural: boolean,
): { area: number; description: string } {
  const filterRooms = includeNonStructural
    ? floorRooms
    : floorRooms.filter(r => !isNonStructural(r.name));

  if (surfaceType === 'suelo' || surfaceType === 'techo') {
    if (filterRooms.length === 0) return { area: 0, description: 'Sin espacios' };
    const minX = Math.min(...filterRooms.map(r => r.posX));
    const maxX = Math.max(...filterRooms.map(r => r.posX + r.width));
    const minY = Math.min(...filterRooms.map(r => r.posY));
    const maxY = Math.max(...filterRooms.map(r => r.posY + r.length));
    const totalW = maxX - minX;
    const totalL = maxY - minY;
    const area = totalW * totalL;
    return {
      area,
      description: `${fmt(totalW, 3)}m × ${fmt(totalL, 3)}m`,
    };
  }

  // 4 wall faces: cara_superior (wall 1, top/Y-min), cara_derecha (wall 2, right/X-max),
  // cara_inferior (wall 3, bottom/Y-max), cara_izquierda (wall 4, left/X-min)
  const caraWallMap: Record<string, number> = {
    cara_superior: 1,
    cara_derecha: 2,
    cara_inferior: 3,
    cara_izquierda: 4,
  };
  if (surfaceType in caraWallMap) {
    const targetWallIdx = caraWallMap[surfaceType];
    let totalArea = 0;
    const descriptions: string[] = [];
    for (const room of filterRooms) {
      const h = room.height ?? plan.defaultHeight;
      for (const wall of room.walls) {
        if (wall.wallIndex !== targetWallIdx) continue;
        if (!isVisibleWall(wall.wallType)) continue;
        const wallLen = wall.wallIndex === 1 || wall.wallIndex === 3 ? room.width : room.length;
        totalArea += wallLen * h;
      }
    }
    return { area: totalArea, description: `Cara ${surfaceType.replace('cara_', '')} × altura` };
  }

  if (surfaceType === 'cubierta_superior') {
    const slope = slopes.find(s => s.side === 'superior');
    if (!slope) return { area: 0, description: 'Sin faldón' };
    if (includeNonStructural) {
      return {
        area: slope.slopeArea,
        description: `${fmt(slope.baseLength, 3)}m (largo c/aleros) × ${fmt(slope.hypotenuse, 3)}m (hipotenusa c/aleros)`,
      };
    }
    return {
      area: slope.structSlopeArea,
      description: `${fmt(slope.structBaseLength, 3)}m (largo) × ${fmt(slope.structHypotenuse, 3)}m (hipotenusa)`,
    };
  }

  if (surfaceType === 'cubierta_inferior') {
    const slope = slopes.find(s => s.side === 'inferior');
    if (!slope) return { area: 0, description: 'Sin faldón' };
    if (includeNonStructural) {
      return {
        area: slope.slopeArea,
        description: `${fmt(slope.baseLength, 3)}m (largo c/aleros) × ${fmt(slope.hypotenuse, 3)}m (hipotenusa c/aleros)`,
      };
    }
    return {
      area: slope.structSlopeArea,
      description: `${fmt(slope.structBaseLength, 3)}m (largo) × ${fmt(slope.structHypotenuse, 3)}m (hipotenusa)`,
    };
  }

  return { area: 0, description: '' };
}

let layerCounter = 0;
function newLayerId() {
  return `local-${Date.now()}-${++layerCounter}`;
}

function SurfaceSection({
  surfaceType,
  layers,
  surfaceAreaDefault,
  description,
  onAddLayer,
  onRemoveLayer,
  onUpdateLayer,
  calcAreaForLayer,
}: {
  surfaceType: SurfaceType;
  layers: VolumeLayer[];
  surfaceAreaDefault: number;
  description: string;
  onAddLayer: () => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
  calcAreaForLayer: (includeNonStructural: boolean) => number;
}) {
  const [open, setOpen] = useState(layers.length > 0);

  const totalThicknessMm = layers.reduce((sum, l) => sum + l.thicknessMm, 0);
  const totalVolume = layers.reduce((sum, l) => {
    const area = calcAreaForLayer(l.includeNonStructural);
    return sum + (area * l.thicknessMm / 1000);
  }, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors text-left">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          {SURFACE_ICONS[surfaceType]}
          <span className="font-medium text-sm flex-1">{SURFACE_LABELS[surfaceType]}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {fmt(surfaceAreaDefault)} m²
          </Badge>
          {layers.length > 0 && (
            <Badge variant="secondary" className="text-xs font-mono">
              {layers.length} capa{layers.length !== 1 ? 's' : ''} · {fmt(totalVolume)} m³
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-8 pr-3 pb-3 space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{SURFACE_DIRECTION[surfaceType]}</span>
            <span>·</span>
            <span>{description}</span>
          </p>

          {layers.length > 0 && (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_100px_120px_100px_80px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                <span className="w-5">Nº</span>
                <span>Nombre capa</span>
                <span className="text-right">Espesor (mm)</span>
                <span className="text-right">Superficie (m²)</span>
                <span className="text-right">Volumen (m³)</span>
                <span className="text-center text-[10px]">+Aleros</span>
                <span></span>
              </div>

              {layers.map((layer, idx) => {
                const layerArea = calcAreaForLayer(layer.includeNonStructural);
                const vol = layerArea * layer.thicknessMm / 1000;
                return (
                  <div key={layer.id} className="grid grid-cols-[auto_1fr_100px_120px_100px_80px_32px] gap-2 items-center">
                    <span className="w-5 text-xs text-muted-foreground text-center">{idx + 1}</span>
                    <Input
                      className="h-8 text-sm"
                      value={layer.name}
                      onChange={e => onUpdateLayer(layer.id, { name: e.target.value })}
                      placeholder="Nombre de la capa"
                    />
                    <Input
                      type="number"
                      className="h-8 text-sm text-right font-mono"
                      value={layer.thicknessMm}
                      min={1}
                      onChange={e => onUpdateLayer(layer.id, { thicknessMm: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                    <span className="text-xs font-mono text-right text-muted-foreground">{fmt(layerArea)}</span>
                    <span className="text-xs font-mono text-right font-medium">{fmt(vol)}</span>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={layer.includeNonStructural}
                        onCheckedChange={(checked) => onUpdateLayer(layer.id, { includeNonStructural: !!checked })}
                      />
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveLayer(layer.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}

              {/* Totals */}
              <Separator className="my-1" />
              <div className="grid grid-cols-[auto_1fr_100px_120px_100px_80px_32px] gap-2 items-center text-xs font-semibold">
                <span className="w-5"></span>
                <span>Total</span>
                <span className="text-right font-mono">{totalThicknessMm} mm</span>
                <span></span>
                <span className="text-right font-mono text-primary">{fmt(totalVolume)} m³</span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={onAddLayer} className="mt-1">
            <Plus className="h-3.5 w-3.5 mr-1" /> Añadir capa
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FloorPlanVolumesView({ plan, rooms, floors, floorPlanId }: FloorPlanVolumesViewProps) {
  const slopes = calculateRoofSlopes(plan, rooms);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // State: layers per floor per surface type
  const [levelVolumes, setLevelVolumes] = useState<Record<string, Record<SurfaceType, VolumeLayer[]>>>({});
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(floors.map(f => f.id)));

  // Load from DB
  useEffect(() => {
    if (!floorPlanId) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('budget_volume_layers')
        .select('*')
        .eq('floor_plan_id', floorPlanId)
        .order('layer_order');

      if (error) {
        console.error('Error loading volume layers:', error);
        return;
      }

      const init: Record<string, Record<SurfaceType, VolumeLayer[]>> = {};
      for (const floor of floors) {
        init[floor.id] = {
          suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
          cubierta_superior: [], cubierta_inferior: [],
        };
      }

      // Also init for layers without a floor (global)
      if (data) {
        for (const row of data) {
          const floorId = row.floor_id || floors[0]?.id;
          if (!floorId || !init[floorId]) continue;
          const st = row.surface_type as SurfaceType;
          if (!init[floorId][st]) init[floorId][st] = [];
          init[floorId][st].push({
            id: newLayerId(),
            dbId: row.id,
            name: row.name || '',
            thicknessMm: row.thickness_mm || 20,
            surfaceType: st,
            includeNonStructural: row.include_non_structural || false,
          });
        }
      }

      setLevelVolumes(init);
      setLoaded(true);
    };
    load();
  }, [floorPlanId, floors]);

  // Init empty state if no DB data
  useEffect(() => {
    if (loaded) return;
    const init: Record<string, Record<SurfaceType, VolumeLayer[]>> = {};
    for (const floor of floors) {
      init[floor.id] = {
        suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
        cubierta_superior: [], cubierta_inferior: [],
      };
    }
    setLevelVolumes(init);
  }, [floors, loaded]);

  const toggleLevel = (floorId: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  const addLayer = (floorId: string, surfaceType: SurfaceType) => {
    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      const current = [...(floorLayers[surfaceType] || [])];
      current.push({
        id: newLayerId(),
        name: '',
        thicknessMm: surfaceType === 'suelo' ? 20 : surfaceType === 'techo' ? 15 : 120,
        surfaceType,
        includeNonStructural: false,
        dirty: true,
      });
      floorLayers[surfaceType] = current;
      return { ...prev, [floorId]: floorLayers };
    });
  };

  const removeLayer = (floorId: string, surfaceType: SurfaceType, layerId: string) => {
    const layer = levelVolumes[floorId]?.[surfaceType]?.find(l => l.id === layerId);
    if (layer?.dbId) {
      // Delete from DB
      supabase.from('budget_volume_layers').delete().eq('id', layer.dbId).then(({ error }) => {
        if (error) toast.error('Error eliminando capa');
      });
    }
    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      floorLayers[surfaceType] = (floorLayers[surfaceType] || []).filter(l => l.id !== layerId);
      return { ...prev, [floorId]: floorLayers };
    });
  };

  const updateLayer = (floorId: string, surfaceType: SurfaceType, layerId: string, data: Partial<VolumeLayer>) => {
    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      floorLayers[surfaceType] = (floorLayers[surfaceType] || []).map(l =>
        l.id === layerId ? { ...l, ...data, dirty: true } : l
      );
      return { ...prev, [floorId]: floorLayers };
    });
  };

  // Save all to DB
  const saveAll = useCallback(async () => {
    if (!floorPlanId) return;
    setSaving(true);
    try {
      // Delete all existing and re-insert
      await supabase.from('budget_volume_layers').delete().eq('floor_plan_id', floorPlanId);

      const rows: any[] = [];
      for (const floorId of Object.keys(levelVolumes)) {
        const surfaces = levelVolumes[floorId];
        if (!surfaces) continue;
        for (const st of Object.keys(surfaces) as SurfaceType[]) {
          const layers = surfaces[st];
          if (!layers) continue;
          layers.forEach((layer, idx) => {
            rows.push({
              floor_plan_id: floorPlanId,
              floor_id: floorId,
              surface_type: st,
              layer_order: idx,
              name: layer.name,
              thickness_mm: layer.thicknessMm,
              include_non_structural: layer.includeNonStructural,
            });
          });
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('budget_volume_layers').insert(rows);
        if (error) throw error;
      }

      // Mark all as clean
      setLevelVolumes(prev => {
        const next = { ...prev };
        for (const fid of Object.keys(next)) {
          const surfaces = { ...next[fid] };
          for (const st of Object.keys(surfaces) as SurfaceType[]) {
            surfaces[st] = surfaces[st].map(l => ({ ...l, dirty: false }));
          }
          next[fid] = surfaces;
        }
        return next;
      });

      toast.success('Capas de volumen guardadas');
    } catch (err: any) {
      toast.error('Error guardando: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  }, [floorPlanId, levelVolumes]);

  // Check if any dirty
  const hasDirty = Object.values(levelVolumes).some(surfaces =>
    Object.values(surfaces).some(layers => layers.some(l => l.dirty))
  );

  // Compute general values
  const structRooms = rooms.filter(r => !isNonStructural(r.name));
  const allMinX = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posX)) : 0;
  const allMaxX = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posX + r.width)) : plan.width;
  const allMinY = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posY)) : 0;
  const allMaxY = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posY + r.length)) : plan.length;
  const totalW = allMaxX - allMinX;
  const totalL = allMaxY - allMinY;
  const totalPlantArea = totalW * totalL;

  // Grand total volumes
  let grandTotalVolume = 0;

  return (
    <div className="space-y-4">
      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={saving || !hasDirty} size="sm" variant={hasDirty ? 'default' : 'outline'}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Guardar capas
        </Button>
      </div>

      {/* General info */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Box className="h-4 w-4" />
            Volúmenes — Valores generales
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Largo total:</span>
              <span className="font-mono font-medium">{fmt(totalW, 3)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ancho total:</span>
              <span className="font-mono font-medium">{fmt(totalL, 3)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Superficie planta:</span>
              <span className="font-mono font-medium">{fmt(totalPlantArea)} m²</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Niveles:</span>
              <span className="font-mono font-medium">{floors.length}</span>
            </div>
          </div>
          {/* Roof slopes summary */}
          {slopes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Faldones (cubierta dos aguas)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {slopes.map((s, i) => (
                  <div key={i} className="text-xs space-y-0.5 bg-muted/30 rounded p-2">
                    <div className="font-medium">{s.name} ({s.side})</div>
                    <div className="flex justify-between"><span>Base (largo) estructural:</span> <span className="font-mono">{fmt(s.structBaseLength, 3)} m</span></div>
                    <div className="flex justify-between"><span>Hipotenusa estructural:</span> <span className="font-mono">{fmt(s.structHypotenuse, 3)} m</span></div>
                    <div className="flex justify-between font-semibold"><span>Superficie sin aleros:</span> <span className="font-mono">{fmt(s.structSlopeArea)} m²</span></div>
                    {s.includesEaves && (
                      <>
                        <Separator className="my-1" />
                        <div className="flex justify-between"><span>Base c/aleros:</span> <span className="font-mono">{fmt(s.baseLength, 3)} m</span></div>
                        <div className="flex justify-between"><span>Hipotenusa c/aleros:</span> <span className="font-mono">{fmt(s.hypotenuse, 3)} m</span></div>
                        <div className="flex justify-between font-semibold"><span>Superficie c/aleros:</span> <span className="font-mono">{fmt(s.slopeArea)} m²</span></div>
                      </>
                    )}
                    <div className="flex justify-between text-muted-foreground"><span>Altura cumbrera:</span> <span className="font-mono">{fmt(s.ridgeHeight, 3)} m</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-level volumes */}
      {floors.map(floor => {
        const floorRooms = rooms.filter(r => r.floorId === floor.id);
        const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
        const isExpanded = expandedLevels.has(floor.id);
        const floorLayers = levelVolumes[floor.id] || {
          suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
          cubierta_superior: [], cubierta_inferior: [],
        };

        // All levels have 6 faces; bajo cubierta adds faldones under techo
        const surfaceTypes: SurfaceType[] = isBajoCubierta
          ? ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo', 'cubierta_superior', 'cubierta_inferior']
          : ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo'];

        let levelTotalVolume = 0;
        const surfaceData = surfaceTypes.map(st => {
          const { area, description } = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, false);
          const layers = floorLayers[st] || [];
          const vol = layers.reduce((sum, l) => {
            const lArea = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, l.includeNonStructural).area;
            return sum + (lArea * l.thicknessMm / 1000);
          }, 0);
          levelTotalVolume += vol;
          return { surfaceType: st, area, description, layers, volume: vol };
        });
        grandTotalVolume += levelTotalVolume;

        return (
          <Card key={floor.id}>
            <CardHeader className="py-2 px-4 cursor-pointer" onClick={() => toggleLevel(floor.id)}>
              <CardTitle className="text-sm flex items-center gap-2">
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Layers className="h-4 w-4" />
                <span className="flex-1">{floor.name}</span>
                {levelTotalVolume > 0 && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    Total: {fmt(levelTotalVolume)} m³
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            {isExpanded && (
              <CardContent className="px-4 pb-4 pt-0 space-y-1">
                {surfaceData.map(sd => (
                  <SurfaceSection
                    key={sd.surfaceType}
                    surfaceType={sd.surfaceType}
                    layers={sd.layers}
                    surfaceAreaDefault={sd.area}
                    description={sd.description}
                    onAddLayer={() => addLayer(floor.id, sd.surfaceType)}
                    onRemoveLayer={(id) => removeLayer(floor.id, sd.surfaceType, id)}
                    onUpdateLayer={(id, data) => updateLayer(floor.id, sd.surfaceType, id, data)}
                    calcAreaForLayer={(includeNS) => calcSurfaceArea(sd.surfaceType, plan, rooms, floorRooms, slopes, includeNS).area}
                  />
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Grand total */}
      {grandTotalVolume > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total volúmenes (todas las capas):</span>
              <span className="font-mono text-lg font-bold text-primary">{fmt(grandTotalVolume)} m³</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
