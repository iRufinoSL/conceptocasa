import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FloorPlanData, RoomData, calculateRoofSlopes, RoofSlopeDetail, isExteriorType, isVisibleWall } from '@/lib/floor-plan-calculations';
import { Box, ChevronDown, ChevronRight, Plus, Trash2, Layers, ArrowDown, ArrowUp, ArrowRight as ArrowRightIcon, GripVertical } from 'lucide-react';

interface FloorPlanVolumesViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors: { id: string; name: string; level: string; orderIndex: number }[];
}

// Surface types that can have layers
type SurfaceType = 'suelo' | 'pared_exterior' | 'pared_interior' | 'techo' | 'cubierta';

interface VolumeLayer {
  id: string;
  name: string;
  thicknessMm: number; // height/depth in mm
  surfaceType: SurfaceType;
}

interface LevelVolumes {
  floorId: string;
  surfaces: Record<SurfaceType, VolumeLayer[]>;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtM3(n: number): string {
  return n.toFixed(2);
}

/** Direction label for layer stacking */
const SURFACE_DIRECTION: Record<SurfaceType, string> = {
  suelo: '↓ De arriba a abajo',
  pared_exterior: '← Del exterior al interior',
  pared_interior: '→ Desde punto medio al interior',
  techo: '↑ De abajo a arriba',
  cubierta: '↑ De abajo a arriba',
};

const SURFACE_LABELS: Record<SurfaceType, string> = {
  suelo: 'Suelo',
  pared_exterior: 'Paredes exteriores',
  pared_interior: 'Paredes interiores',
  techo: 'Techo',
  cubierta: 'Cubierta (faldones)',
};

const SURFACE_ICONS: Record<SurfaceType, React.ReactNode> = {
  suelo: <ArrowDown className="h-3.5 w-3.5" />,
  pared_exterior: <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />,
  pared_interior: <ArrowRightIcon className="h-3.5 w-3.5" />,
  techo: <ArrowUp className="h-3.5 w-3.5" />,
  cubierta: <ArrowUp className="h-3.5 w-3.5" />,
};

/** Calculate 2D surface area for a given surface type within a level */
function calcSurfaceArea(
  surfaceType: SurfaceType,
  plan: FloorPlanData,
  rooms: RoomData[],
  floorRooms: RoomData[],
  slopes: RoofSlopeDetail[],
): { area: number; description: string } {
  if (surfaceType === 'suelo' || surfaceType === 'techo') {
    // Full plant footprint including walls
    const structRooms = floorRooms.filter(r => {
      const n = (r.name || '').toLowerCase();
      return !n.includes('acera') && !n.includes('alero') && !n.includes('eave');
    });
    if (structRooms.length === 0) return { area: 0, description: 'Sin espacios' };
    const minX = Math.min(...structRooms.map(r => r.posX));
    const maxX = Math.max(...structRooms.map(r => r.posX + r.width));
    const minY = Math.min(...structRooms.map(r => r.posY));
    const maxY = Math.max(...structRooms.map(r => r.posY + r.length));
    const totalW = (maxX - minX) + 2 * plan.externalWallThickness;
    const totalL = (maxY - minY) + 2 * plan.externalWallThickness;
    const area = totalW * totalL;
    return {
      area,
      description: `${fmt(totalW, 3)}m × ${fmt(totalL, 3)}m`,
    };
  }

  if (surfaceType === 'pared_exterior') {
    // Sum of all exterior wall surfaces (perimeter × height)
    let totalArea = 0;
    const descriptions: string[] = [];
    for (const room of floorRooms) {
      const h = room.height ?? plan.defaultHeight;
      for (const wall of room.walls) {
        if (!isExteriorType(wall.wallType) || !isVisibleWall(wall.wallType)) continue;
        const wallLen = wall.wallIndex === 1 || wall.wallIndex === 3 ? room.width : room.length;
        totalArea += wallLen * h;
      }
    }
    return { area: totalArea, description: `Perímetro × altura` };
  }

  if (surfaceType === 'pared_interior') {
    let totalArea = 0;
    for (const room of floorRooms) {
      const h = room.height ?? plan.defaultHeight;
      for (const wall of room.walls) {
        if (isExteriorType(wall.wallType)) continue;
        if (!isVisibleWall(wall.wallType)) continue;
        const wallLen = wall.wallIndex === 1 || wall.wallIndex === 3 ? room.width : room.length;
        totalArea += wallLen * h;
      }
    }
    return { area: totalArea, description: `Paredes interiores × altura` };
  }

  if (surfaceType === 'cubierta') {
    const totalRoofArea = slopes.reduce((sum, s) => sum + s.slopeArea, 0);
    return { area: totalRoofArea, description: `${slopes.length} faldón(es)` };
  }

  return { area: 0, description: '' };
}

let layerCounter = 0;
function newLayerId() {
  return `layer-${Date.now()}-${++layerCounter}`;
}

function SurfaceSection({
  surfaceType,
  layers,
  surfaceArea,
  description,
  onAddLayer,
  onRemoveLayer,
  onUpdateLayer,
}: {
  surfaceType: SurfaceType;
  layers: VolumeLayer[];
  surfaceArea: number;
  description: string;
  onAddLayer: () => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
}) {
  const [open, setOpen] = useState(layers.length > 0);

  const totalThicknessMm = layers.reduce((sum, l) => sum + l.thicknessMm, 0);
  const totalVolume = layers.reduce((sum, l) => sum + (surfaceArea * l.thicknessMm / 1000), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors text-left">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          {SURFACE_ICONS[surfaceType]}
          <span className="font-medium text-sm flex-1">{SURFACE_LABELS[surfaceType]}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {fmt(surfaceArea)} m²
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
              <div className="grid grid-cols-[auto_1fr_100px_120px_100px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                <span className="w-5">Nº</span>
                <span>Nombre capa</span>
                <span className="text-right">Espesor (mm)</span>
                <span className="text-right">Superficie (m²)</span>
                <span className="text-right">Volumen (m³)</span>
                <span></span>
              </div>

              {layers.map((layer, idx) => {
                const vol = surfaceArea * layer.thicknessMm / 1000;
                return (
                  <div key={layer.id} className="grid grid-cols-[auto_1fr_100px_120px_100px_32px] gap-2 items-center">
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
                    <span className="text-xs font-mono text-right text-muted-foreground">{fmt(surfaceArea)}</span>
                    <span className="text-xs font-mono text-right font-medium">{fmtM3(vol)}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveLayer(layer.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}

              {/* Totals */}
              <Separator className="my-1" />
              <div className="grid grid-cols-[auto_1fr_100px_120px_100px_32px] gap-2 items-center text-xs font-semibold">
                <span className="w-5"></span>
                <span>Total</span>
                <span className="text-right font-mono">{totalThicknessMm} mm</span>
                <span></span>
                <span className="text-right font-mono text-primary">{fmtM3(totalVolume)} m³</span>
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

export function FloorPlanVolumesView({ plan, rooms, floors }: FloorPlanVolumesViewProps) {
  const slopes = calculateRoofSlopes(plan, rooms);

  // State: layers per floor per surface type
  const [levelVolumes, setLevelVolumes] = useState<Record<string, Record<SurfaceType, VolumeLayer[]>>>(() => {
    const init: Record<string, Record<SurfaceType, VolumeLayer[]>> = {};
    for (const floor of floors) {
      const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
      init[floor.id] = {
        suelo: [],
        pared_exterior: [],
        pared_interior: [],
        techo: isBajoCubierta ? [] : [],
        cubierta: isBajoCubierta ? [] : [],
      };
    }
    return init;
  });

  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(floors.map(f => f.id)));

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
      });
      floorLayers[surfaceType] = current;
      return { ...prev, [floorId]: floorLayers };
    });
  };

  const removeLayer = (floorId: string, surfaceType: SurfaceType, layerId: string) => {
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
        l.id === layerId ? { ...l, ...data } : l
      );
      return { ...prev, [floorId]: floorLayers };
    });
  };

  // Compute general values
  const structRooms = rooms.filter(r => {
    const n = (r.name || '').toLowerCase();
    return !n.includes('acera') && !n.includes('alero') && !n.includes('eave');
  });
  const allMinX = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posX)) : 0;
  const allMaxX = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posX + r.width)) : plan.width;
  const allMinY = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posY)) : 0;
  const allMaxY = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posY + r.length)) : plan.length;
  const totalW = (allMaxX - allMinX) + 2 * plan.externalWallThickness;
  const totalL = (allMaxY - allMinY) + 2 * plan.externalWallThickness;
  const totalPlantArea = totalW * totalL;

  // Grand total volumes
  let grandTotalVolume = 0;

  return (
    <div className="space-y-4">
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
        </CardContent>
      </Card>

      {/* Per-level volumes */}
      {floors.map(floor => {
        const floorRooms = rooms.filter(r => r.floorId === floor.id);
        const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
        const isExpanded = expandedLevels.has(floor.id);
        const floorLayers = levelVolumes[floor.id] || { suelo: [], pared_exterior: [], pared_interior: [], techo: [], cubierta: [] };

        // Determine which surface types are relevant for this level
        const surfaceTypes: SurfaceType[] = isBajoCubierta
          ? ['cubierta', 'pared_exterior', 'pared_interior']
          : ['suelo', 'pared_exterior', 'pared_interior', 'techo'];

        // Compute totals for this level
        let levelTotalVolume = 0;
        const surfaceData = surfaceTypes.map(st => {
          const { area, description } = calcSurfaceArea(st, plan, rooms, floorRooms, slopes);
          const layers = floorLayers[st] || [];
          const vol = layers.reduce((sum, l) => sum + (area * l.thicknessMm / 1000), 0);
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
                    Total: {fmtM3(levelTotalVolume)} m³
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
                    surfaceArea={sd.area}
                    description={sd.description}
                    onAddLayer={() => addLayer(floor.id, sd.surfaceType)}
                    onRemoveLayer={(id) => removeLayer(floor.id, sd.surfaceType, id)}
                    onUpdateLayer={(id, data) => updateLayer(floor.id, sd.surfaceType, id, data)}
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
              <span className="font-mono text-lg font-bold text-primary">{fmtM3(grandTotalVolume)} m³</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
