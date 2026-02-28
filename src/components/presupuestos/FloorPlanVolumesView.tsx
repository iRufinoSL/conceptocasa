import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FloorPlanData, RoomData, calculateRoofSlopes, RoofSlopeDetail, isExteriorType, isVisibleWall } from '@/lib/floor-plan-calculations';
import { Box, ChevronDown, ChevronRight, Plus, Trash2, Layers, ArrowDown, ArrowUp, ArrowRight as ArrowRightIcon, Save, Loader2, CornerDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FloorPlanVolumesViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors: { id: string; name: string; level: string; orderIndex: number }[];
  floorPlanId: string;
}

type SurfaceType = 'suelo' | 'cara_superior' | 'cara_derecha' | 'cara_inferior' | 'cara_izquierda' | 'techo' | 'cubierta_superior' | 'cubierta_inferior';

type MeasurementType = 'area' | 'linear';

interface VolumeLayer {
  id: string;
  dbId?: string;
  name: string;
  thicknessMm: number;
  surfaceType: SurfaceType;
  includeNonStructural: boolean;
  extraSurfaceName: string;
  orderIndex: number;
  measurementType: MeasurementType;
  sectionWidthMm: number | null;
  sectionHeightMm: number | null;
  orientation: 'parallel_ridge' | 'crossed_ridge' | null;
  spacingMm: number | null;
  groupTag: string;
  parentLayerId: string | null; // null = root layer, string = child of parent
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
): { area: number; description: string; largo: number; ancho: number } {
  const filterRooms = includeNonStructural
    ? floorRooms
    : floorRooms.filter(r => !isNonStructural(r.name));

  if (surfaceType === 'suelo' || surfaceType === 'techo') {
    if (filterRooms.length === 0) return { area: 0, description: 'Sin espacios', largo: 0, ancho: 0 };
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
      largo: totalW,
      ancho: totalL,
    };
  }

  const caraWallMap: Record<string, number> = {
    cara_superior: 1,
    cara_derecha: 2,
    cara_inferior: 3,
    cara_izquierda: 4,
  };
  if (surfaceType in caraWallMap) {
    const targetWallIdx = caraWallMap[surfaceType];
    let totalArea = 0;
    let totalLen = 0;
    let avgHeight = 0;
    let count = 0;
    for (const room of filterRooms) {
      const h = room.height ?? plan.defaultHeight;
      for (const wall of room.walls) {
        if (wall.wallIndex !== targetWallIdx) continue;
        if (!isVisibleWall(wall.wallType)) continue;
        const wallLen = wall.wallIndex === 1 || wall.wallIndex === 3 ? room.width : room.length;
        totalArea += wallLen * h;
        totalLen += wallLen;
        avgHeight += h;
        count++;
      }
    }
    if (count > 0) avgHeight /= count;
    return { area: totalArea, description: `Cara ${surfaceType.replace('cara_', '')} × altura`, largo: totalLen, ancho: avgHeight };
  }

  if (surfaceType === 'cubierta_superior') {
    const slope = slopes.find(s => s.side === 'superior');
    if (!slope) return { area: 0, description: 'Sin faldón', largo: 0, ancho: 0 };
    if (includeNonStructural) {
      return {
        area: slope.slopeArea,
        description: `${fmt(slope.baseLength, 3)}m × ${fmt(slope.hypotenuse, 3)}m`,
        largo: slope.baseLength,
        ancho: slope.hypotenuse,
      };
    }
    return {
      area: slope.structSlopeArea,
      description: `${fmt(slope.structBaseLength, 3)}m × ${fmt(slope.structHypotenuse, 3)}m`,
      largo: slope.structBaseLength,
      ancho: slope.structHypotenuse,
    };
  }

  if (surfaceType === 'cubierta_inferior') {
    const slope = slopes.find(s => s.side === 'inferior');
    if (!slope) return { area: 0, description: 'Sin faldón', largo: 0, ancho: 0 };
    if (includeNonStructural) {
      return {
        area: slope.slopeArea,
        description: `${fmt(slope.baseLength, 3)}m × ${fmt(slope.hypotenuse, 3)}m`,
        largo: slope.baseLength,
        ancho: slope.hypotenuse,
      };
    }
    return {
      area: slope.structSlopeArea,
      description: `${fmt(slope.structBaseLength, 3)}m × ${fmt(slope.structHypotenuse, 3)}m`,
      largo: slope.structBaseLength,
      ancho: slope.structHypotenuse,
    };
  }

  return { area: 0, description: '', largo: 0, ancho: 0 };
}

let layerCounter = 0;
function newLayerId() {
  return `local-${Date.now()}-${++layerCounter}`;
}

/** Calculate effective thickness for a layer considering group sharing */
function getEffectiveThickness(layer: VolumeLayer, allLayers: VolumeLayer[]): number {
  if (!layer.groupTag) return layer.thicknessMm;
  const grouped = allLayers.filter(l => l.groupTag === layer.groupTag && l.groupTag !== '');
  if (grouped.length <= 1) return layer.thicknessMm;
  return Math.max(...grouped.map(l => l.thicknessMm));
}

/** Calculate linear layer metrics */
function calcLinearMetrics(
  layer: VolumeLayer,
  surfaceData: { largo: number; ancho: number },
): { pieceLength: number; pieceCount: number; totalMl: number } | null {
  if (layer.measurementType !== 'linear' || !layer.spacingMm || layer.spacingMm <= 0) return null;

  const spacingM = layer.spacingMm / 1000;
  if (layer.orientation === 'parallel_ridge' || layer.orientation === null) {
    const pieceLength = surfaceData.largo;
    const pieceCount = Math.floor(surfaceData.ancho / spacingM) + 1;
    return { pieceLength, pieceCount, totalMl: pieceLength * pieceCount };
  } else {
    const pieceLength = surfaceData.ancho;
    const pieceCount = Math.floor(surfaceData.largo / spacingM) + 1;
    return { pieceLength, pieceCount, totalMl: pieceLength * pieceCount };
  }
}

/** Single layer row component */
function LayerRow({
  layer,
  allLayers,
  calcDimsForLayer,
  calcAreaForLayer,
  onUpdateLayer,
  onRemoveLayer,
  onAddChild,
  defaultExtraLabel,
  depth = 0,
  childCount = 0,
}: {
  layer: VolumeLayer;
  allLayers: VolumeLayer[];
  calcDimsForLayer: (includeNonStructural: boolean) => { largo: number; ancho: number };
  calcAreaForLayer: (includeNonStructural: boolean) => number;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
  onRemoveLayer: (id: string) => void;
  onAddChild: (parentId: string) => void;
  defaultExtraLabel: string;
  depth?: number;
  childCount?: number;
}) {
  const dims = calcDimsForLayer(layer.includeNonStructural);
  const layerArea = calcAreaForLayer(layer.includeNonStructural);
  const linearMetrics = calcLinearMetrics(layer, dims);
  const vol = layer.measurementType === 'area' ? layerArea * layer.thicknessMm / 1000 : 0;
  const isGrouped = layer.groupTag && layer.groupTag !== '';
  const groupColor = isGrouped ? 'bg-accent/20 border-l-2 border-accent' : '';
  const isParent = childCount > 0;

  return (
    <div className="space-y-1">
      <div className={`grid grid-cols-[50px_1fr_70px_80px_80px_90px_90px_70px_50px_32px] gap-1 items-center ${groupColor} rounded px-1`}
        style={{ paddingLeft: depth > 0 ? `${depth * 20 + 4}px` : undefined }}
      >
        <Input
          type="number"
          className="h-7 text-xs text-center font-mono p-1"
          value={layer.orderIndex}
          onChange={e => onUpdateLayer(layer.id, { orderIndex: parseInt(e.target.value) || 0 })}
        />
        <div className="flex items-center gap-1">
          {depth > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <Input
            className="h-7 text-xs flex-1"
            value={layer.name}
            onChange={e => onUpdateLayer(layer.id, { name: e.target.value })}
            placeholder={depth > 0 ? "Sub-capa" : "Nombre"}
          />
          {!isParent && depth === 0 && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" title="Añadir sub-capa" onClick={() => onAddChild(layer.id)}>
              <Plus className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
        <Select
          value={layer.measurementType}
          onValueChange={(v) => onUpdateLayer(layer.id, { measurementType: v as MeasurementType })}
        >
          <SelectTrigger className="h-7 text-[10px] px-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="area">m²</SelectItem>
            <SelectItem value="linear">ml</SelectItem>
          </SelectContent>
        </Select>
        {isParent ? (
          <>
            <span className="text-[10px] text-muted-foreground text-center col-span-2">
              {childCount} sub-capa{childCount !== 1 ? 's' : ''}
            </span>
            <span></span>
            <span></span>
            <span></span>
          </>
        ) : (
          <>
            <span className="text-xs font-mono text-right text-muted-foreground">{fmt(dims.largo, 3)}</span>
            <span className="text-xs font-mono text-right text-muted-foreground">{fmt(dims.ancho, 3)}</span>
            <Input
              type="number"
              className="h-7 text-xs text-right font-mono p-1"
              value={layer.thicknessMm}
              min={1}
              onChange={e => onUpdateLayer(layer.id, { thicknessMm: Math.max(1, parseInt(e.target.value) || 1) })}
            />
            <span className="text-xs font-mono text-right font-medium">
              {layer.measurementType === 'area'
                ? `${fmt(layerArea)} m²`
                : linearMetrics
                  ? `${fmt(linearMetrics.totalMl)} ml`
                  : '—'
              }
            </span>
            <span className="text-xs font-mono text-right font-medium">
              {layer.measurementType === 'area' ? fmt(vol) : '—'}
            </span>
          </>
        )}
        <div className="flex justify-center">
          {!isParent && (
            <Checkbox
              checked={layer.includeNonStructural}
              onCheckedChange={(checked) => onUpdateLayer(layer.id, { includeNonStructural: !!checked })}
            />
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveLayer(layer.id)}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Linear layer details */}
      {!isParent && layer.measurementType === 'linear' && (
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 text-[10px] bg-muted/30 rounded p-2"
          style={{ marginLeft: `${(depth > 0 ? depth * 20 : 0) + 52}px` }}
        >
          <div>
            <label className="text-muted-foreground block mb-0.5">Sección ancho (mm)</label>
            <Input
              type="number"
              className="h-6 text-[10px] font-mono p-1"
              value={layer.sectionWidthMm ?? ''}
              placeholder="100"
              onChange={e => onUpdateLayer(layer.id, { sectionWidthMm: parseInt(e.target.value) || null })}
            />
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Sección alto (mm)</label>
            <Input
              type="number"
              className="h-6 text-[10px] font-mono p-1"
              value={layer.sectionHeightMm ?? ''}
              placeholder="150"
              onChange={e => onUpdateLayer(layer.id, { sectionHeightMm: parseInt(e.target.value) || null })}
            />
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Orientación</label>
            <Select
              value={layer.orientation || 'parallel_ridge'}
              onValueChange={(v) => onUpdateLayer(layer.id, { orientation: v as 'parallel_ridge' | 'crossed_ridge' })}
            >
              <SelectTrigger className="h-6 text-[10px] px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parallel_ridge">∥ Paralelo a cumbrera</SelectItem>
                <SelectItem value="crossed_ridge">⊥ Cruzado a cumbrera</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Separación (mm)</label>
            <Input
              type="number"
              className="h-6 text-[10px] font-mono p-1"
              value={layer.spacingMm ?? ''}
              placeholder="600"
              onChange={e => onUpdateLayer(layer.id, { spacingMm: parseInt(e.target.value) || null })}
            />
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Grupo (compartir espesor)</label>
            <Input
              className="h-6 text-[10px] p-1"
              value={layer.groupTag}
              placeholder="ej: viguetas_aislamiento"
              onChange={e => onUpdateLayer(layer.id, { groupTag: e.target.value })}
            />
          </div>
          {linearMetrics && (
            <div className="col-span-5 flex gap-4 text-xs mt-1 pt-1 border-t border-border">
              <span>Longitud pieza: <strong className="font-mono">{fmt(linearMetrics.pieceLength, 3)} m</strong></span>
              <span>Nº piezas: <strong className="font-mono">{linearMetrics.pieceCount}</strong></span>
              <span>Total ml: <strong className="font-mono">{fmt(linearMetrics.totalMl)} ml</strong></span>
              {layer.sectionWidthMm && layer.sectionHeightMm && (
                <span>Sección: <strong className="font-mono">{layer.sectionWidthMm}×{layer.sectionHeightMm} mm</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Group tag for area layers */}
      {!isParent && layer.measurementType === 'area' && (
        <div className="flex gap-2 items-center"
          style={{ marginLeft: `${(depth > 0 ? depth * 20 : 0) + 52}px` }}
        >
          <label className="text-[10px] text-muted-foreground">Grupo:</label>
          <Input
            className="h-6 text-[10px] w-40 p-1"
            value={layer.groupTag}
            placeholder="Compartir espesor"
            onChange={e => onUpdateLayer(layer.id, { groupTag: e.target.value })}
          />
          <label className="text-[10px] text-muted-foreground ml-2">Etiqueta +:</label>
          <Input
            className="h-6 text-[10px] w-28 p-1"
            value={layer.extraSurfaceName}
            placeholder={defaultExtraLabel}
            onChange={e => onUpdateLayer(layer.id, { extraSurfaceName: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function SurfaceSection({
  surfaceType,
  layers,
  surfaceAreaDefault,
  description,
  onAddLayer,
  onAddChildLayer,
  onRemoveLayer,
  onUpdateLayer,
  calcAreaForLayer,
  calcDimsForLayer,
}: {
  surfaceType: SurfaceType;
  layers: VolumeLayer[];
  surfaceAreaDefault: number;
  description: string;
  onAddLayer: () => void;
  onAddChildLayer: (parentId: string) => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
  calcAreaForLayer: (includeNonStructural: boolean) => number;
  calcDimsForLayer: (includeNonStructural: boolean) => { largo: number; ancho: number };
}) {
  const [open, setOpen] = useState(layers.length > 0);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // Separate root layers and children
  const rootLayers = layers.filter(l => !l.parentLayerId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, VolumeLayer[]>();
    layers.forEach(l => {
      if (l.parentLayerId) {
        const arr = map.get(l.parentLayerId) || [];
        arr.push(l);
        map.set(l.parentLayerId, arr);
      }
    });
    return map;
  }, [layers]);

  // Sort root layers by orderIndex descending
  const sortedRoots = [...rootLayers].sort((a, b) => b.orderIndex - a.orderIndex);

  // Calculate grouped thickness map
  const groupedThicknessMap = new Map<string, number>();
  layers.forEach(l => {
    if (l.groupTag) {
      const current = groupedThicknessMap.get(l.groupTag) || 0;
      groupedThicknessMap.set(l.groupTag, Math.max(current, l.thicknessMm));
    }
  });

  // Total thickness (only leaf layers contribute)
  const leafLayers = layers.filter(l => {
    const children = childrenByParent.get(l.dbId || l.id);
    return !children || children.length === 0;
  });
  const processedGroups = new Set<string>();
  let totalThicknessMm = 0;
  leafLayers.forEach(l => {
    if (l.groupTag && l.groupTag !== '') {
      if (!processedGroups.has(l.groupTag)) {
        totalThicknessMm += groupedThicknessMap.get(l.groupTag) || l.thicknessMm;
        processedGroups.add(l.groupTag);
      }
    } else {
      totalThicknessMm += l.thicknessMm;
    }
  });

  const totalVolume = leafLayers.reduce((sum, l) => {
    if (l.measurementType === 'linear') return sum;
    const area = calcAreaForLayer(l.includeNonStructural);
    return sum + (area * l.thicknessMm / 1000);
  }, 0);

  const defaultExtraLabel = surfaceType.startsWith('cubierta') ? 'Aleros' : 'Ext.';

  const toggleParentCollapse = (parentId: string) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // Get children for a layer (match by dbId or local id)
  const getChildren = (layer: VolumeLayer) => {
    const byDbId = layer.dbId ? childrenByParent.get(layer.dbId) : undefined;
    const byLocalId = childrenByParent.get(layer.id);
    return [...(byDbId || []), ...(byLocalId || [])].sort((a, b) => b.orderIndex - a.orderIndex);
  };

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

          {sortedRoots.length > 0 && (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="grid grid-cols-[50px_1fr_70px_80px_80px_90px_90px_70px_50px_32px] gap-1 text-[10px] font-semibold text-muted-foreground px-1">
                <span className="text-center">Orden</span>
                <span>Nombre</span>
                <span className="text-center">Tipo</span>
                <span className="text-right">Largo (m)</span>
                <span className="text-right">Ancho (m)</span>
                <span className="text-right">Alto/Esp (mm)</span>
                <span className="text-right">Sup m² / ml</span>
                <span className="text-right">Vol m³</span>
                <span className="text-center text-[9px]">+{defaultExtraLabel}</span>
                <span></span>
              </div>

              {sortedRoots.map((rootLayer) => {
                const children = getChildren(rootLayer);
                const hasChildren = children.length > 0;
                const isCollapsed = collapsedParents.has(rootLayer.id);

                return (
                  <div key={rootLayer.id} className="space-y-0.5">
                    {/* Parent row - clickable to collapse if has children */}
                    {hasChildren && (
                      <button
                        className="w-full flex items-center gap-1 px-1 py-0.5 text-left hover:bg-muted/30 rounded transition-colors"
                        onClick={() => toggleParentCollapse(rootLayer.id)}
                      >
                        {isCollapsed
                          ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                        <span className="text-xs font-medium">{rootLayer.name || 'Sin nombre'}</span>
                        <Badge variant="outline" className="text-[9px] ml-1">
                          {children.length} sub-capa{children.length !== 1 ? 's' : ''}
                        </Badge>
                        <Button
                          variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto shrink-0"
                          onClick={(e) => { e.stopPropagation(); onAddChildLayer(rootLayer.id); }}
                          title="Añadir sub-capa"
                        >
                          <Plus className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0"
                          onClick={(e) => { e.stopPropagation(); onRemoveLayer(rootLayer.id); }}
                          title="Eliminar capa padre y sus sub-capas"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </button>
                    )}

                    {/* Render the root layer row if it has NO children (leaf root) */}
                    {!hasChildren && (
                      <LayerRow
                        layer={rootLayer}
                        allLayers={layers}
                        calcDimsForLayer={calcDimsForLayer}
                        calcAreaForLayer={calcAreaForLayer}
                        onUpdateLayer={onUpdateLayer}
                        onRemoveLayer={onRemoveLayer}
                        onAddChild={onAddChildLayer}
                        defaultExtraLabel={defaultExtraLabel}
                        depth={0}
                        childCount={0}
                      />
                    )}

                    {/* Render children if not collapsed */}
                    {hasChildren && !isCollapsed && (
                      <div className="space-y-0.5 border-l-2 border-muted ml-2 pl-1">
                        {children.map(child => (
                          <LayerRow
                            key={child.id}
                            layer={child}
                            allLayers={layers}
                            calcDimsForLayer={calcDimsForLayer}
                            calcAreaForLayer={calcAreaForLayer}
                            onUpdateLayer={onUpdateLayer}
                            onRemoveLayer={onRemoveLayer}
                            onAddChild={onAddChildLayer}
                            defaultExtraLabel={defaultExtraLabel}
                            depth={1}
                            childCount={0}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Totals */}
              <Separator className="my-1" />
              <div className="grid grid-cols-[50px_1fr_70px_80px_80px_90px_90px_70px_50px_32px] gap-1 items-center text-xs font-semibold px-1">
                <span></span>
                <span>Total</span>
                <span></span>
                <span></span>
                <span></span>
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

  const [levelVolumes, setLevelVolumes] = useState<Record<string, Record<SurfaceType, VolumeLayer[]>>>({});
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(floors.map(f => f.id)));

  // Stabilize floors reference to avoid re-running load on every render
  const floorsKey = useMemo(() => floors.map(f => f.id).join(','), [floors]);
  const floorsRef = useRef(floors);
  floorsRef.current = floors;

  // Map dbId -> localId for parent references after load
  const dbIdToLocalId = useRef(new Map<string, string>());

  // Load from DB
  useEffect(() => {
    if (!floorPlanId) return;
    const currentFloors = floorsRef.current;
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
      for (const floor of currentFloors) {
        init[floor.id] = {
          suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
          cubierta_superior: [], cubierta_inferior: [],
        };
      }

      const idMap = new Map<string, string>();

      if (data) {
        // First pass: create all layers and map dbId -> localId
        const layersByDbId = new Map<string, VolumeLayer>();
        for (const row of data) {
          const floorId = row.floor_id || currentFloors[0]?.id;
          if (!floorId || !init[floorId]) continue;
          const st = row.surface_type as SurfaceType;
          if (!init[floorId][st]) init[floorId][st] = [];
          const localId = newLayerId();
          idMap.set(row.id, localId);
          const layer: VolumeLayer = {
            id: localId,
            dbId: row.id,
            name: row.name || '',
            thicknessMm: row.thickness_mm || 20,
            surfaceType: st,
            includeNonStructural: row.include_non_structural || false,
            extraSurfaceName: row.extra_surface_name || '',
            orderIndex: row.layer_order || 0,
            measurementType: (row.measurement_type || 'area') as MeasurementType,
            sectionWidthMm: row.section_width_mm || null,
            sectionHeightMm: row.section_height_mm || null,
            orientation: (row.orientation as 'parallel_ridge' | 'crossed_ridge' | null) || null,
            spacingMm: row.spacing_mm || null,
            groupTag: row.group_tag || '',
            parentLayerId: (row as any).parent_layer_id || null,
          };
          layersByDbId.set(row.id, layer);
          init[floorId][st].push(layer);
        }

        // Second pass: resolve parent references from dbId to localId
        for (const floorId of Object.keys(init)) {
          for (const st of Object.keys(init[floorId]) as SurfaceType[]) {
            init[floorId][st] = init[floorId][st].map(l => {
              if (l.parentLayerId && idMap.has(l.parentLayerId)) {
                return { ...l, parentLayerId: idMap.get(l.parentLayerId)! };
              }
              return l;
            });
          }
        }
      }

      dbIdToLocalId.current = idMap;
      setLevelVolumes(init);
      setLoaded(true);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPlanId, floorsKey]);

  // Init empty state if no DB data
  useEffect(() => {
    if (loaded) return;
    const init: Record<string, Record<SurfaceType, VolumeLayer[]>> = {};
    for (const floor of floorsRef.current) {
      init[floor.id] = {
        suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
        cubierta_superior: [], cubierta_inferior: [],
      };
    }
    setLevelVolumes(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorsKey, loaded]);

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
      const maxOrder = current.length > 0 ? Math.max(...current.map(l => l.orderIndex)) : 0;
      current.push({
        id: newLayerId(),
        name: '',
        thicknessMm: surfaceType === 'suelo' ? 20 : surfaceType === 'techo' ? 15 : 120,
        surfaceType,
        includeNonStructural: false,
        extraSurfaceName: '',
        orderIndex: maxOrder + 1,
        measurementType: 'area',
        sectionWidthMm: null,
        sectionHeightMm: null,
        orientation: null,
        spacingMm: null,
        groupTag: '',
        parentLayerId: null,
        dirty: true,
      });
      floorLayers[surfaceType] = current;
      return { ...prev, [floorId]: floorLayers };
    });
  };

  const addChildLayer = (floorId: string, surfaceType: SurfaceType, parentId: string) => {
    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      const current = [...(floorLayers[surfaceType] || [])];
      // Get children of this parent to compute order
      const siblings = current.filter(l => l.parentLayerId === parentId);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(l => l.orderIndex)) : 0;
      current.push({
        id: newLayerId(),
        name: '',
        thicknessMm: surfaceType === 'suelo' ? 20 : surfaceType === 'techo' ? 15 : 120,
        surfaceType,
        includeNonStructural: false,
        extraSurfaceName: '',
        orderIndex: maxOrder + 1,
        measurementType: 'area',
        sectionWidthMm: null,
        sectionHeightMm: null,
        orientation: null,
        spacingMm: null,
        groupTag: '',
        parentLayerId: parentId,
        dirty: true,
      });
      floorLayers[surfaceType] = current;
      return { ...prev, [floorId]: floorLayers };
    });
  };

  const removeLayer = (floorId: string, surfaceType: SurfaceType, layerId: string) => {
    const allSurfaceLayers = levelVolumes[floorId]?.[surfaceType] || [];
    // Find the layer and all its children
    const layersToRemove = new Set<string>();
    layersToRemove.add(layerId);
    // Also remove children
    allSurfaceLayers.forEach(l => {
      if (l.parentLayerId === layerId) layersToRemove.add(l.id);
    });

    // Delete from DB
    layersToRemove.forEach(lid => {
      const layer = allSurfaceLayers.find(l => l.id === lid);
      if (layer?.dbId) {
        supabase.from('budget_volume_layers').delete().eq('id', layer.dbId).then(({ error }) => {
          if (error) toast.error('Error eliminando capa');
        });
      }
    });

    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      floorLayers[surfaceType] = (floorLayers[surfaceType] || []).filter(l => !layersToRemove.has(l.id));
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

  // Save all to DB — with two-pass insert for parent_layer_id references
  const saveAll = useCallback(async () => {
    if (!floorPlanId) return;
    setSaving(true);
    try {
      await supabase.from('budget_volume_layers').delete().eq('floor_plan_id', floorPlanId);

      // Collect all layers with their local parent references
      const allLayers: Array<{ floorId: string; st: SurfaceType; layer: VolumeLayer }> = [];
      for (const floorId of Object.keys(levelVolumes)) {
        const surfaces = levelVolumes[floorId];
        if (!surfaces) continue;
        for (const st of Object.keys(surfaces) as SurfaceType[]) {
          (surfaces[st] || []).forEach(layer => {
            allLayers.push({ floorId, st, layer });
          });
        }
      }

      if (allLayers.length === 0) {
        setSaving(false);
        return;
      }

      // First pass: insert root layers (no parent)
      const rootEntries = allLayers.filter(e => !e.layer.parentLayerId);
      const childEntries = allLayers.filter(e => !!e.layer.parentLayerId);

      const localIdToDbId = new Map<string, string>();

      if (rootEntries.length > 0) {
        const rootRows = rootEntries.map(e => ({
          floor_plan_id: floorPlanId,
          floor_id: e.floorId,
          surface_type: e.st,
          layer_order: e.layer.orderIndex,
          name: e.layer.name,
          thickness_mm: e.layer.thicknessMm,
          include_non_structural: e.layer.includeNonStructural,
          measurement_type: e.layer.measurementType,
          section_width_mm: e.layer.sectionWidthMm,
          section_height_mm: e.layer.sectionHeightMm,
          orientation: e.layer.orientation,
          spacing_mm: e.layer.spacingMm,
          group_tag: e.layer.groupTag || null,
          extra_surface_name: e.layer.extraSurfaceName || null,
          parent_layer_id: null,
        }));

        const { data: insertedRoots, error } = await supabase
          .from('budget_volume_layers')
          .insert(rootRows)
          .select('id');

        if (error) throw error;

        // Map localId -> new dbId by order
        if (insertedRoots) {
          rootEntries.forEach((e, i) => {
            if (insertedRoots[i]) {
              localIdToDbId.set(e.layer.id, insertedRoots[i].id);
            }
          });
        }
      }

      // Second pass: insert child layers with resolved parent_layer_id
      if (childEntries.length > 0) {
        const childRows = childEntries.map(e => ({
          floor_plan_id: floorPlanId,
          floor_id: e.floorId,
          surface_type: e.st,
          layer_order: e.layer.orderIndex,
          name: e.layer.name,
          thickness_mm: e.layer.thicknessMm,
          include_non_structural: e.layer.includeNonStructural,
          measurement_type: e.layer.measurementType,
          section_width_mm: e.layer.sectionWidthMm,
          section_height_mm: e.layer.sectionHeightMm,
          orientation: e.layer.orientation,
          spacing_mm: e.layer.spacingMm,
          group_tag: e.layer.groupTag || null,
          extra_surface_name: e.layer.extraSurfaceName || null,
          parent_layer_id: localIdToDbId.get(e.layer.parentLayerId!) || null,
        }));

        const { error } = await supabase.from('budget_volume_layers').insert(childRows);
        if (error) throw error;
      }

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

  // Auto-save with debounce when layers change
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasDirty = Object.values(levelVolumes).some(surfaces =>
    Object.values(surfaces).some(layers => layers.some(l => l.dirty))
  );

  useEffect(() => {
    if (!loaded || !hasDirty) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveAll();
    }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelVolumes, loaded]);

  // Compute general values
  const structRooms = rooms.filter(r => !isNonStructural(r.name));
  const allMinX = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posX)) : 0;
  const allMaxX = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posX + r.width)) : plan.width;
  const allMinY = structRooms.length > 0 ? Math.min(...structRooms.map(r => r.posY)) : 0;
  const allMaxY = structRooms.length > 0 ? Math.max(...structRooms.map(r => r.posY + r.length)) : plan.length;
  const totalW = allMaxX - allMinX;
  const totalL = allMaxY - allMinY;
  const totalPlantArea = totalW * totalL;

  let grandTotalVolume = 0;

  return (
    <div className="space-y-4">
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

        const surfaceTypes: SurfaceType[] = isBajoCubierta
          ? ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo', 'cubierta_superior', 'cubierta_inferior']
          : ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo'];

        let levelTotalVolume = 0;
        const surfaceData = surfaceTypes.map(st => {
          const result = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, false);
          const layers = floorLayers[st] || [];
          // Only count leaf layers for volume (those without children)
          const childParentIds = new Set(layers.filter(l => l.parentLayerId).map(l => l.parentLayerId!));
          const leafLayers = layers.filter(l => !childParentIds.has(l.id));
          const vol = leafLayers.reduce((sum, l) => {
            if (l.measurementType === 'linear') return sum;
            const lArea = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, l.includeNonStructural).area;
            return sum + (lArea * l.thicknessMm / 1000);
          }, 0);
          levelTotalVolume += vol;
          return { surfaceType: st, area: result.area, description: result.description, largo: result.largo, ancho: result.ancho, layers, volume: vol };
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
                    onAddChildLayer={(parentId) => addChildLayer(floor.id, sd.surfaceType, parentId)}
                    onRemoveLayer={(id) => removeLayer(floor.id, sd.surfaceType, id)}
                    onUpdateLayer={(id, data) => updateLayer(floor.id, sd.surfaceType, id, data)}
                    calcAreaForLayer={(includeNS) => calcSurfaceArea(sd.surfaceType, plan, rooms, floorRooms, slopes, includeNS).area}
                    calcDimsForLayer={(includeNS) => {
                      const r = calcSurfaceArea(sd.surfaceType, plan, rooms, floorRooms, slopes, includeNS);
                      return { largo: r.largo, ancho: r.ancho };
                    }}
                  />
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}

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
