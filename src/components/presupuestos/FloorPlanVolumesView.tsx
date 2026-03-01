import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FloorPlanData, RoomData, calculateRoofSlopes, RoofSlopeDetail, isExteriorType, isVisibleWall, calculateRoom } from '@/lib/floor-plan-calculations';
import { Box, ChevronDown, ChevronRight, Plus, Trash2, Layers, ArrowDown, ArrowUp, ArrowRight as ArrowRightIcon, Save, Loader2, CornerDownRight, Copy, Ruler, Settings2, Link2, Unlink, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FloorPlanVolumesViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors: { id: string; name: string; level: string; orderIndex: number }[];
  floorPlanId: string;
}

type SurfaceType = 'suelo' | 'cara_superior' | 'cara_derecha' | 'cara_inferior' | 'cara_izquierda' | 'techo' | 'cubierta_superior' | 'cubierta_inferior' | 'volumen';

type MeasurementType = 'area' | 'linear';

interface VolumeLayer {
  id: string;
  dbId?: string;
  name: string;
  description: string;
  thicknessMm: number;
  surfaceType: SurfaceType;
  includeNonStructural: boolean;
  extraSurfaceName: string;
  orderIndex: number;
  measurementType: MeasurementType;
  sectionWidthMm: number | null;
  sectionHeightMm: number | null;
  orientation: 'parallel_ridge' | 'crossed_ridge' | 'left_right' | 'top_bottom' | null;
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
  volumen: '▣ Volumen del espacio',
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
  volumen: 'Volumen',
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
  volumen: <Box className="h-3.5 w-3.5" />,
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

  if (surfaceType === 'suelo') {
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

  if (surfaceType === 'techo') {
    // Sum rooms with flat ceiling OR inclined roof ceiling (faldón = techo)
    const ceilingRooms = filterRooms.filter(r => r.hasCeiling || (!r.hasCeiling && r.hasRoof));
    if (ceilingRooms.length === 0) return { area: 0, description: 'Sin techos', largo: 0, ancho: 0 };
    let totalArea = 0;
    // Calculate bounding box of ceiling rooms INCLUDING wall thicknesses for linear calcs
    let bbMinX = Infinity, bbMaxX = -Infinity, bbMinY = Infinity, bbMaxY = -Infinity;
    for (const room of ceilingRooms) {
      const calc = calculateRoom(room, plan);
      // Use inclined area when no flat ceiling but has roof (faldón = techo)
      totalArea += calc.hasCeiling ? calc.ceilingArea : (calc.slopeRoofCeilingArea > 0 ? calc.slopeRoofCeilingArea : 0);
      // Expand bounding box by wall thicknesses (same logic as ceilingArea)
      const wallThick = (w: typeof room.walls[0] | undefined) => {
        if (!w || w.wallType.endsWith('_invisible')) return 0;
        return w.thickness || (w.wallType.startsWith('exterior') ? plan.externalWallThickness : plan.internalWallThickness);
      };
      const topW = room.walls.find(w => w.wallIndex === 1);
      const rightW = room.walls.find(w => w.wallIndex === 2);
      const bottomW = room.walls.find(w => w.wallIndex === 3);
      const leftW = room.walls.find(w => w.wallIndex === 4);
      const rMinX = room.posX - wallThick(leftW);
      const rMaxX = room.posX + room.width + wallThick(rightW);
      const rMinY = room.posY - wallThick(topW);
      const rMaxY = room.posY + room.length + wallThick(bottomW);
      if (rMinX < bbMinX) bbMinX = rMinX;
      if (rMaxX > bbMaxX) bbMaxX = rMaxX;
      if (rMinY < bbMinY) bbMinY = rMinY;
      if (rMaxY > bbMaxY) bbMaxY = rMaxY;
    }
    const techoW = bbMaxX - bbMinX;
    const techoL = bbMaxY - bbMinY;
    return {
      area: totalArea,
      description: `Suma de ${ceilingRooms.length} espacios con techo (${fmt(techoW, 3)}m × ${fmt(techoL, 3)}m)`,
      largo: techoW,
      ancho: techoL,
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

  if (surfaceType === 'volumen') {
    // Volume = sum of room volumes (width × length × height)
    let totalVol = 0;
    for (const room of filterRooms) {
      const h = room.height ?? plan.defaultHeight;
      totalVol += room.width * room.length * h;
    }
    return { area: totalVol, description: `Volumen total de ${filterRooms.length} espacios`, largo: 0, ancho: 0 };
  }

  return { area: 0, description: '', largo: 0, ancho: 0 };
}

/** Calculate surface area for a single room */
function calcRoomSurfaceArea(
  surfaceType: SurfaceType,
  room: RoomData,
  plan: FloorPlanData,
): { area: number; description: string; largo: number; ancho: number } {
  const h = room.height ?? plan.defaultHeight;

  if (surfaceType === 'suelo') {
    const area = room.width * room.length;
    return { area, description: `${fmt(room.width, 3)}m × ${fmt(room.length, 3)}m`, largo: room.width, ancho: room.length };
  }

  if (surfaceType === 'techo') {
    const calc = calculateRoom(room, plan);
    const area = calc.hasCeiling ? calc.ceilingArea : (calc.slopeRoofCeilingArea > 0 ? calc.slopeRoofCeilingArea : 0);
    return { area, description: `Techo de ${room.name}`, largo: room.width, ancho: room.length };
  }

  const caraWallMap: Record<string, number> = {
    cara_superior: 1, cara_derecha: 2, cara_inferior: 3, cara_izquierda: 4,
  };
  if (surfaceType in caraWallMap) {
    const targetWallIdx = caraWallMap[surfaceType];
    const wall = room.walls.find(w => w.wallIndex === targetWallIdx);
    if (!wall || !isVisibleWall(wall.wallType)) return { area: 0, description: 'Pared invisible', largo: 0, ancho: 0 };
    const wallLen = targetWallIdx === 1 || targetWallIdx === 3 ? room.width : room.length;
    const area = wallLen * h;
    return { area, description: `${fmt(wallLen, 3)}m × ${fmt(h, 3)}m (${wall.wallType})`, largo: wallLen, ancho: h };
  }

  if (surfaceType === 'volumen') {
    const vol = room.width * room.length * h;
    return { area: vol, description: `${fmt(room.width, 3)} × ${fmt(room.length, 3)} × ${fmt(h, 3)}m`, largo: 0, ancho: 0 };
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
  if (layer.measurementType !== 'linear') return null;
  if (surfaceData.largo <= 0 || surfaceData.ancho <= 0) return null;

  // Fallback: if spacing is missing in old rows, use 600mm default
  const spacingM = ((layer.spacingMm && layer.spacingMm > 0) ? layer.spacingMm : 600) / 1000;
  const orient = layer.orientation || 'parallel_ridge';

  // Continuous piece count (can be decimal): length / spacing
  // parallel_ridge / left_right: pieces run along "largo", spaced across "ancho"
  // crossed_ridge / top_bottom: pieces run along "ancho", spaced across "largo"
  if (orient === 'parallel_ridge' || orient === 'left_right') {
    const pieceLength = surfaceData.largo;
    const pieceCount = Math.max(surfaceData.ancho / spacingM, 1);
    return { pieceLength, pieceCount, totalMl: pieceLength * pieceCount };
  }

  const pieceLength = surfaceData.ancho;
  const pieceCount = Math.max(surfaceData.largo / spacingM, 1);
  return { pieceLength, pieceCount, totalMl: pieceLength * pieceCount };
}

/** Group tag input with suggestions from existing layers */
function GroupTagInput({
  value,
  allLayers,
  currentLayerId,
  onChange,
  className,
}: {
  value: string;
  allLayers: VolumeLayer[];
  currentLayerId: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const existingTags = useMemo(() => {
    const tags = new Set<string>();
    allLayers.forEach(l => {
      if (l.id !== currentLayerId && l.groupTag && l.groupTag.trim() !== '') {
        tags.add(l.groupTag.trim());
      }
    });
    return Array.from(tags).sort();
  }, [allLayers, currentLayerId]);

  const listId = `group-tags-${currentLayerId}`;

  return (
    <div className={className}>
      <Input
        className="h-6 text-[10px] p-1"
        value={value}
        placeholder="Seleccionar o escribir grupo"
        list={listId}
        onChange={e => onChange(e.target.value)}
      />
      {existingTags.length > 0 && (
        <datalist id={listId}>
          {existingTags.map(tag => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Single layer row component */
function LayerRow({
  layer,
  allLayers,
  calcDimsForLayer,
  calcAreaForLayer,
  onUpdateLayer,
  onRemoveLayer,
  onDuplicateLayer,
  onAddChild,
  defaultExtraLabel,
  depth = 0,
  childCount = 0,
  onEditLayer,
}: {
  layer: VolumeLayer;
  allLayers: VolumeLayer[];
  calcDimsForLayer: (includeNonStructural: boolean) => { largo: number; ancho: number };
  calcAreaForLayer: (includeNonStructural: boolean) => number;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
  onRemoveLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onAddChild: (parentId: string) => void;
  defaultExtraLabel: string;
  depth?: number;
  childCount?: number;
  onEditLayer?: (layer: VolumeLayer) => void;
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
      <div className={`grid grid-cols-[50px_1fr_120px_70px_80px_80px_90px_90px_70px_50px_32px_32px_32px] gap-1 items-center ${groupColor} rounded px-1`}
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
        <Input
          className="h-7 text-xs"
          value={layer.description}
          onChange={e => onUpdateLayer(layer.id, { description: e.target.value })}
          placeholder="Descripción"
        />
        <Select
          value={layer.measurementType}
          onValueChange={(v) => {
            const nextType = v as MeasurementType;
            onUpdateLayer(layer.id, nextType === 'linear'
              ? {
                  measurementType: nextType,
                  spacingMm: layer.spacingMm ?? 600,
                  orientation: layer.orientation ?? 'parallel_ridge',
                }
              : { measurementType: nextType });
          }}
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
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditLayer?.(layer)} title="Editar objeto">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDuplicateLayer(layer.id)} title="Duplicar capa">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveLayer(layer.id)} title="Eliminar capa">
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
              onValueChange={(v) => onUpdateLayer(layer.id, { orientation: v as VolumeLayer['orientation'] })}
            >
              <SelectTrigger className="h-6 text-[10px] px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parallel_ridge">∥ Paralelo a cumbrera</SelectItem>
                <SelectItem value="crossed_ridge">⊥ Cruzado a cumbrera</SelectItem>
                <SelectItem value="left_right">↔ Izquierda / Derecha</SelectItem>
                <SelectItem value="top_bottom">↕ Arriba / Abajo</SelectItem>
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
            <GroupTagInput
              value={layer.groupTag}
              allLayers={allLayers}
              currentLayerId={layer.id}
              onChange={val => onUpdateLayer(layer.id, { groupTag: val })}
            />
          </div>
          {linearMetrics && (
            <div className="col-span-5 flex gap-4 text-xs mt-1 pt-1 border-t border-border">
              <span>Longitud pieza: <strong className="font-mono">{fmt(linearMetrics.pieceLength, 3)} m</strong></span>
              <span>Nº piezas: <strong className="font-mono">{fmt(linearMetrics.pieceCount, 2)}</strong></span>
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
          <GroupTagInput
            value={layer.groupTag}
            allLayers={allLayers}
            currentLayerId={layer.id}
            onChange={val => onUpdateLayer(layer.id, { groupTag: val })}
            className="w-40"
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
  onDuplicateLayer,
  onUpdateLayer,
  calcAreaForLayer,
  calcDimsForLayer,
  onRemoveAllLayers,
  onDuplicateAllLayers,
  onEditLayer,
}: {
  surfaceType: SurfaceType;
  layers: VolumeLayer[];
  surfaceAreaDefault: number;
  description: string;
  onAddLayer: () => void;
  onAddChildLayer: (parentId: string) => void;
  onRemoveLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onUpdateLayer: (id: string, data: Partial<VolumeLayer>) => void;
  calcAreaForLayer: (includeNonStructural: boolean) => number;
  calcDimsForLayer: (includeNonStructural: boolean) => { largo: number; ancho: number };
  onRemoveAllLayers?: () => void;
  onDuplicateAllLayers?: () => void;
  onEditLayer?: (layer: VolumeLayer) => void;
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
      <div className="flex items-center gap-1">
        <CollapsibleTrigger asChild>
          <button className="flex-1 flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors text-left">
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
        {onDuplicateAllLayers && layers.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onDuplicateAllLayers} title="Duplicar todas las capas de este faldón">
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        {onRemoveAllLayers && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onRemoveAllLayers} title="Eliminar todas las capas de este faldón">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
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
              <div className="grid grid-cols-[50px_1fr_120px_70px_80px_80px_90px_90px_70px_50px_32px_32px_32px] gap-1 text-[10px] font-semibold text-muted-foreground px-1">
                <span className="text-center">Orden</span>
                <span>Nombre</span>
                <span className="truncate" title="Descripción">Desc.</span>
                <span className="text-center">Tipo</span>
                <span className="text-right">Largo (m)</span>
                <span className="text-right">Ancho (m)</span>
                <span className="text-right">Alto/Esp (mm)</span>
                <span className="text-right">Sup m² / ml</span>
                <span className="text-right">Vol m³</span>
                <span className="text-center text-[9px]">+{defaultExtraLabel}</span>
                <span></span>
                <span></span>
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
                          onClick={(e) => { e.stopPropagation(); onDuplicateLayer(rootLayer.id); }}
                          title="Duplicar capa"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
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
                        onDuplicateLayer={onDuplicateLayer}
                        onAddChild={onAddChildLayer}
                        defaultExtraLabel={defaultExtraLabel}
                        depth={0}
                        childCount={0}
                        onEditLayer={onEditLayer}
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
                            onDuplicateLayer={onDuplicateLayer}
                            onAddChild={onAddChildLayer}
                            defaultExtraLabel={defaultExtraLabel}
                            depth={1}
                            childCount={0}
                            onEditLayer={onEditLayer}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Totals */}
              <Separator className="my-1" />
              <div className="grid grid-cols-[50px_1fr_120px_70px_80px_80px_90px_90px_70px_50px_32px_32px_32px] gap-1 items-center text-xs font-semibold px-1">
                <span></span>
                <span>Total</span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span className="text-right font-mono">{totalThicknessMm} mm</span>
                <span></span>
                <span className="text-right font-mono text-primary">{fmt(totalVolume)} m³</span>
                <span></span>
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
  // Per-level room selector: 'all' = Todo el Nivel, room.id = specific room
  const [selectedRoom, setSelectedRoom] = useState<Record<string, string>>({});

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
          cubierta_superior: [], cubierta_inferior: [], volumen: [],
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
            description: (row as any).description || '',
            thicknessMm: row.thickness_mm || 20,
            surfaceType: st,
            includeNonStructural: row.include_non_structural || false,
            extraSurfaceName: row.extra_surface_name || '',
            orderIndex: row.layer_order || 0,
            measurementType: (row.measurement_type || 'area') as MeasurementType,
            sectionWidthMm: row.section_width_mm || null,
            sectionHeightMm: row.section_height_mm || null,
            orientation: (row.orientation as VolumeLayer['orientation']) || null,
            spacingMm: row.measurement_type === 'linear'
              ? (row.spacing_mm ?? 600)
              : (row.spacing_mm ?? null),
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
        cubierta_superior: [], cubierta_inferior: [], volumen: [],
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
        description: '',
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
        description: '',
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

  const duplicateLayer = (floorId: string, surfaceType: SurfaceType, layerId: string) => {
    setLevelVolumes(prev => {
      const floorLayers = { ...prev[floorId] };
      const current = [...(floorLayers[surfaceType] || [])];
      const source = current.find(l => l.id === layerId);
      if (!source) return prev;

      // Duplicate the layer itself
      const newId = newLayerId();
      const duplicate: VolumeLayer = {
        ...source,
        id: newId,
        dbId: undefined,
        name: source.name ? `${source.name} (copia)` : '(copia)',
        dirty: true,
      };
      current.push(duplicate);

      // If the source has children, duplicate them too
      const children = current.filter(l => l.parentLayerId === layerId || (source.dbId && l.parentLayerId === source.dbId));
      children.forEach(child => {
        current.push({
          ...child,
          id: newLayerId(),
          dbId: undefined,
          name: child.name ? `${child.name} (copia)` : '(copia)',
          parentLayerId: newId,
          dirty: true,
        });
      });

      floorLayers[surfaceType] = current;
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
          description: e.layer.description || null,
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
          description: e.layer.description || null,
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

  // ── Compute area summaries per level ──
  const areaSummaryByLevel = useMemo(() => {
    return floors.map(floor => {
      const floorRooms = rooms.filter(r => r.floorId === floor.id);
      const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
      let totalFloorArea = 0;
      let totalCeilingArea = 0;
      let totalExtWallArea = 0;
      let totalIntWallArea = 0;

      for (const room of floorRooms) {
        if (isNonStructural(room.name)) continue;
        const calc = calculateRoom(room, plan);
        if (calc.hasFloor) totalFloorArea += calc.floorArea;
        if (calc.hasCeiling) {
          totalCeilingArea += calc.ceilingArea;
        } else if (calc.slopeRoofCeilingArea > 0) {
          totalCeilingArea += calc.slopeRoofCeilingArea;
        }
        totalExtWallArea += calc.totalExternalWallArea;
        totalIntWallArea += calc.totalInternalWallArea;
      }

      // Roof slopes for bajo cubierta
      let totalRoofArea = 0;
      if (isBajoCubierta && slopes.length > 0) {
        totalRoofArea = slopes.reduce((sum, s) => sum + s.structSlopeArea, 0);
      }

      return {
        floorId: floor.id,
        floorName: floor.name,
        isBajoCubierta,
        totalFloorArea,
        totalCeilingArea,
        totalExtWallArea,
        totalIntWallArea,
        totalRoofArea,
      };
    });
  }, [floors, rooms, plan, slopes]);

  const globalTotalFloors = areaSummaryByLevel.reduce((s, l) => s + l.totalFloorArea, 0);
  const globalTotalCeilings = areaSummaryByLevel.reduce((s, l) => s + l.totalCeilingArea, 0);
  const globalTotalExtWalls = areaSummaryByLevel.reduce((s, l) => s + l.totalExtWallArea, 0);
  const globalTotalIntWalls = areaSummaryByLevel.reduce((s, l) => s + l.totalIntWallArea, 0);
  const globalTotalRoofs = areaSummaryByLevel.reduce((s, l) => s + l.totalRoofArea, 0);

  // grandTotalVolume is declared inside the render section below

  // ── Collect all measurement items for the Mediciones section ──
  type MeasurementItem = { name: string; value: number; unit: 'm²' | 'ml'; surfaceLabel: string; floorName: string; layerRef: { floorId: string; surfaceType: SurfaceType; layerId: string } };
  const [editingLayer, setEditingLayer] = useState<{ floorId: string; surfaceType: SurfaceType; layerId: string } | null>(null);
  const allMeasurementItems = useMemo(() => {
    const items: MeasurementItem[] = [];
    for (const floor of floors) {
      const floorRooms = rooms.filter(r => r.floorId === floor.id);
      const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
      const floorLayers = levelVolumes[floor.id];
      if (!floorLayers) continue;
      const surfaceTypes: SurfaceType[] = ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo', 'volumen',
        ...(isBajoCubierta ? ['cubierta_superior', 'cubierta_inferior'] as SurfaceType[] : [])];
      for (const st of surfaceTypes) {
        const layers = floorLayers[st] || [];
        // Only leaf layers
        const childParentIds = new Set(layers.filter(l => l.parentLayerId).map(l => l.parentLayerId!));
        const leafLayers = layers.filter(l => !childParentIds.has(l.id));
        for (const l of leafLayers) {
          if (!l.name || l.name.trim() === '') continue;
          const dims = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, l.includeNonStructural);
          if (l.measurementType === 'linear') {
            const lm = calcLinearMetrics(l, { largo: dims.largo, ancho: dims.ancho });
            const ref = { floorId: floor.id, surfaceType: st, layerId: l.id };
            items.push({ name: l.name, value: lm ? lm.totalMl : 0, unit: 'ml', surfaceLabel: SURFACE_LABELS[st], floorName: floor.name, layerRef: ref });
          } else {
            const ref = { floorId: floor.id, surfaceType: st, layerId: l.id };
            items.push({ name: l.name, value: dims.area, unit: 'm²', surfaceLabel: SURFACE_LABELS[st], floorName: floor.name, layerRef: ref });
          }
        }
      }
    }
    return items;
  }, [levelVolumes, floors, rooms, plan, slopes]);

  // Unified items: group by normalized name + unit — persisted in localStorage
  const unifiedStorageKey = `volumes-unified-${floorPlanId}`;
  const [unifiedNames, setUnifiedNames] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(unifiedStorageKey);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });

  // Persist unification state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(unifiedStorageKey, JSON.stringify(Array.from(unifiedNames)));
    } catch { /* ignore */ }
  }, [unifiedNames, unifiedStorageKey]);

  const toggleUnify = (normalizedName: string) => {
    setUnifiedNames(prev => {
      const next = new Set(prev);
      if (next.has(normalizedName)) next.delete(normalizedName);
      else next.add(normalizedName);
      return next;
    });
  };

  const normalizeForGroup = (name: string) => {
    return name
      .replace(/\s*\(copia\)\s*$/i, '')
      .replace(/\b(superior|inferior|izquierd[oa]|derech[oa]|exterior|interior|lateral|central|frontal|trasero)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const alphabeticalItems = useMemo(() => {
    const grouped = new Map<string, { items: MeasurementItem[]; unit: 'ml' | 'm²'; canUnify: boolean }>();
    for (const item of allMeasurementItems) {
      const norm = normalizeForGroup(item.name);
      const key = `${norm}__${item.unit}`;
      if (!grouped.has(key)) grouped.set(key, { items: [], unit: item.unit, canUnify: false });
      grouped.get(key)!.items.push(item);
    }
    // All items are unifiable — allows pre-marking single items for future association
    grouped.forEach((g) => {
      g.canUnify = true;
    });
    // Build display list
    const result: { name: string; value: number; unit: string; canUnify: boolean; isUnified: boolean; subItems?: MeasurementItem[]; layerRef?: MeasurementItem['layerRef']; floorName?: string }[] = [];
    const processedKeys = new Set<string>();
    const sortedItems = [...allMeasurementItems].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    for (const item of sortedItems) {
      const norm = normalizeForGroup(item.name);
      const key = `${norm}__${item.unit}`;
      if (unifiedNames.has(key)) {
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          const group = grouped.get(key)!;
          const total = group.items.reduce((s, i) => s + i.value, 0);
          result.push({ name: norm, value: total, unit: item.unit, canUnify: true, isUnified: true, subItems: group.items, layerRef: group.items[0]?.layerRef });
        }
      } else {
        const group = grouped.get(key)!;
        result.push({ name: item.name, value: item.value, unit: item.unit, canUnify: group.canUnify, isUnified: false, layerRef: item.layerRef, floorName: item.floorName });
      }
    }
    return result;
  }, [allMeasurementItems, unifiedNames]);

  // By-layer grouping
  const byLayerItems = useMemo(() => {
    const grouped = new Map<string, MeasurementItem[]>();
    for (const item of allMeasurementItems) {
      const key = `${item.floorName} > ${item.surfaceLabel}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    return grouped;
  }, [allMeasurementItems]);

  // Section collapse states
  const [sectionGeneralOpen, setSectionGeneralOpen] = useState(true);
  const [sectionNivelesOpen, setSectionNivelesOpen] = useState(true);
  const [sectionMedicionesOpen, setSectionMedicionesOpen] = useState(false);

  let grandTotalVolume = 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={saving || !hasDirty} size="sm" variant={hasDirty ? 'default' : 'outline'}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Guardar capas
        </Button>
      </div>

      {/* ── SECTION 1: Valores generales ── */}
      <Collapsible open={sectionGeneralOpen} onOpenChange={setSectionGeneralOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                {sectionGeneralOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Settings2 className="h-4 w-4" />
                Valores generales
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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

              {/* ── Resumen de superficies por nivel ── */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Superficies principales por nivel</p>
                <div className="space-y-2">
                  {areaSummaryByLevel.map(lvl => (
                    <div key={lvl.floorId} className="bg-muted/30 rounded p-2">
                      <p className="text-xs font-medium mb-1">{lvl.floorName}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Suelos:</span>
                          <span className="font-mono">{fmt(lvl.totalFloorArea)} m²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Techos:</span>
                          <span className="font-mono">{fmt(lvl.totalCeilingArea)} m²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Paredes ext.:</span>
                          <span className="font-mono">{fmt(lvl.totalExtWallArea)} m²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Paredes int.:</span>
                          <span className="font-mono">{fmt(lvl.totalIntWallArea)} m²</span>
                        </div>
                        {lvl.totalRoofArea > 0 && (
                          <div className="flex justify-between col-span-2">
                            <span className="text-muted-foreground">Cubiertas:</span>
                            <span className="font-mono">{fmt(lvl.totalRoofArea)} m²</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totales globales */}
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Totales globales</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-0.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Suelos:</span>
                      <span className="font-mono font-semibold">{fmt(globalTotalFloors)} m²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Techos:</span>
                      <span className="font-mono font-semibold">{fmt(globalTotalCeilings)} m²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paredes ext.:</span>
                      <span className="font-mono font-semibold">{fmt(globalTotalExtWalls)} m²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paredes int.:</span>
                      <span className="font-mono font-semibold">{fmt(globalTotalIntWalls)} m²</span>
                    </div>
                    {globalTotalRoofs > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cubiertas:</span>
                        <span className="font-mono font-semibold">{fmt(globalTotalRoofs)} m²</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── SECTION 2: Niveles ── */}
      <Collapsible open={sectionNivelesOpen} onOpenChange={setSectionNivelesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                {sectionNivelesOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Layers className="h-4 w-4" />
                Niveles
                <Badge variant="outline" className="text-xs font-mono ml-auto">{floors.length} nivel{floors.length !== 1 ? 'es' : ''}</Badge>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              {floors.map(floor => {
                const floorRooms = rooms.filter(r => r.floorId === floor.id);
                const isBajoCubierta = floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('cubierta');
                const isExpanded = expandedLevels.has(floor.id);
                const floorLayers = levelVolumes[floor.id] || {
                  suelo: [], cara_superior: [], cara_derecha: [], cara_inferior: [], cara_izquierda: [], techo: [],
                  cubierta_superior: [], cubierta_inferior: [], volumen: [],
                };

                const mainSurfaceTypes: SurfaceType[] = ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo', 'volumen'];
                const roofSubSurfaces: SurfaceType[] = isBajoCubierta ? ['cubierta_superior', 'cubierta_inferior'] : [];
                const surfaceTypes: SurfaceType[] = [...mainSurfaceTypes, ...roofSubSurfaces];

                let levelTotalVolume = 0;
                const surfaceData = surfaceTypes.map(st => {
                  const result = calcSurfaceArea(st, plan, rooms, floorRooms, slopes, false);
                  const layers = floorLayers[st] || [];
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

                // Per-room summary
                const structFloorRooms = floorRooms.filter(r => !isNonStructural(r.name));
                const roomSummaries = structFloorRooms.map(room => {
                  const calc = calculateRoom(room, plan);
                  const h = room.height ?? plan.defaultHeight;
                  return {
                    room,
                    calc,
                    floorArea: calc.floorArea,
                    ceilingArea: calc.hasCeiling ? calc.ceilingArea : (calc.slopeRoofCeilingArea > 0 ? calc.slopeRoofCeilingArea : 0),
                    extWallArea: calc.totalExternalWallArea,
                    intWallArea: calc.totalInternalWallArea,
                    volume: room.width * room.length * h,
                    walls: calc.walls,
                  };
                });

                // Level summary by wall type
                const levelSummary = {
                  totalFloor: roomSummaries.reduce((s, r) => s + r.floorArea, 0),
                  totalCeiling: roomSummaries.reduce((s, r) => s + r.ceilingArea, 0),
                  totalExtWall: roomSummaries.reduce((s, r) => s + r.extWallArea, 0),
                  totalIntWall: roomSummaries.reduce((s, r) => s + r.intWallArea, 0),
                  totalVolume: roomSummaries.reduce((s, r) => s + r.volume, 0),
                };

                const currentRoomId = selectedRoom[floor.id] || 'all';

                return (
                  <div key={floor.id} className="border rounded-lg">
                    <div className="py-2 px-4 cursor-pointer flex items-center gap-2 hover:bg-muted/30 transition-colors" onClick={() => toggleLevel(floor.id)}>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <Layers className="h-4 w-4" />
                      <span className="text-sm font-medium flex-1">{floor.name}</span>
                      {levelTotalVolume > 0 && (
                        <Badge variant="secondary" className="text-xs font-mono">
                          Total: {fmt(levelTotalVolume)} m³
                        </Badge>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 space-y-2">
                        {/* Room selector */}
                        <div className="flex items-center gap-2 pb-2 border-b border-border">
                          <span className="text-xs text-muted-foreground">Vista:</span>
                          <Select
                            value={currentRoomId}
                            onValueChange={v => setSelectedRoom(prev => ({ ...prev, [floor.id]: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs w-56">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todo el Nivel</SelectItem>
                              {structFloorRooms.map(room => (
                                <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Level summary by type */}
                        <div className="bg-muted/30 rounded p-2 text-xs">
                          <p className="font-semibold text-muted-foreground mb-1">Resumen del nivel por tipo de superficie</p>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-0.5">
                            <div className="flex justify-between"><span className="text-muted-foreground">Suelos:</span><span className="font-mono">{fmt(levelSummary.totalFloor)} m²</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Techos:</span><span className="font-mono">{fmt(levelSummary.totalCeiling)} m²</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Paredes ext.:</span><span className="font-mono">{fmt(levelSummary.totalExtWall)} m²</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Paredes int.:</span><span className="font-mono">{fmt(levelSummary.totalIntWall)} m²</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Volumen:</span><span className="font-mono">{fmt(levelSummary.totalVolume)} m³</span></div>
                          </div>
                        </div>

                        {currentRoomId === 'all' ? (
                          /* Original level-wide view */
                          <div className="space-y-1">
                            {surfaceData
                              .filter(sd => !roofSubSurfaces.includes(sd.surfaceType))
                              .map(sd => {
                                const isTecho = sd.surfaceType === 'techo';
                                const roofSubData = isTecho
                                  ? surfaceData.filter(s => roofSubSurfaces.includes(s.surfaceType))
                                  : [];

                                return (
                                  <div key={sd.surfaceType}>
                                    <SurfaceSection
                                      surfaceType={sd.surfaceType}
                                      layers={sd.layers}
                                      surfaceAreaDefault={sd.area}
                                      description={sd.description}
                                      onAddLayer={() => addLayer(floor.id, sd.surfaceType)}
                                      onAddChildLayer={(parentId) => addChildLayer(floor.id, sd.surfaceType, parentId)}
                                      onRemoveLayer={(id) => removeLayer(floor.id, sd.surfaceType, id)}
                                      onDuplicateLayer={(id) => duplicateLayer(floor.id, sd.surfaceType, id)}
                                      onUpdateLayer={(id, data) => updateLayer(floor.id, sd.surfaceType, id, data)}
                                      calcAreaForLayer={(includeNS) => calcSurfaceArea(sd.surfaceType, plan, rooms, floorRooms, slopes, includeNS).area}
                                      calcDimsForLayer={(includeNS) => {
                                        const r = calcSurfaceArea(sd.surfaceType, plan, rooms, floorRooms, slopes, includeNS);
                                        return { largo: r.largo, ancho: r.ancho };
                                      }}
                                      onEditLayer={(layer) => setEditingLayer({ floorId: floor.id, surfaceType: sd.surfaceType, layerId: layer.id })}
                                    />
                                    {roofSubData.length > 0 && (
                                      <div className="ml-6 border-l-2 border-muted pl-2 space-y-1">
                                        {roofSubData.map(rsd => (
                                          <SurfaceSection
                                            key={rsd.surfaceType}
                                            surfaceType={rsd.surfaceType}
                                            layers={rsd.layers}
                                            surfaceAreaDefault={rsd.area}
                                            description={rsd.description}
                                            onAddLayer={() => addLayer(floor.id, rsd.surfaceType)}
                                            onAddChildLayer={(parentId) => addChildLayer(floor.id, rsd.surfaceType, parentId)}
                                            onRemoveLayer={(id) => removeLayer(floor.id, rsd.surfaceType, id)}
                                            onDuplicateLayer={(id) => duplicateLayer(floor.id, rsd.surfaceType, id)}
                                            onUpdateLayer={(id, data) => updateLayer(floor.id, rsd.surfaceType, id, data)}
                                            calcAreaForLayer={(includeNS) => calcSurfaceArea(rsd.surfaceType, plan, rooms, floorRooms, slopes, includeNS).area}
                                            calcDimsForLayer={(includeNS) => {
                                              const r = calcSurfaceArea(rsd.surfaceType, plan, rooms, floorRooms, slopes, includeNS);
                                              return { largo: r.largo, ancho: r.ancho };
                                            }}
                                            onEditLayer={(layer) => setEditingLayer({ floorId: floor.id, surfaceType: rsd.surfaceType, layerId: layer.id })}
                                            onRemoveAllLayers={() => {
                                              const layers = floorLayers[rsd.surfaceType] || [];
                                              layers.forEach(l => {
                                                if (l.dbId) {
                                                  supabase.from('budget_volume_layers').delete().eq('id', l.dbId).then(({ error }) => {
                                                    if (error) toast.error('Error eliminando capa');
                                                  });
                                                }
                                              });
                                              supabase.from('budget_volume_layers')
                                                .delete()
                                                .eq('floor_plan_id', floorPlanId)
                                                .eq('floor_id', floor.id)
                                                .eq('surface_type', rsd.surfaceType)
                                                .then(({ error }) => {
                                                  if (error) console.error('Error limpiando capas huérfanas:', error);
                                                });
                                              setLevelVolumes(prev => {
                                                const fl = { ...prev[floor.id] };
                                                fl[rsd.surfaceType] = [];
                                                return { ...prev, [floor.id]: fl };
                                              });
                                              toast.success(`Capas de ${SURFACE_LABELS[rsd.surfaceType]} eliminadas`);
                                            }}
                                            onDuplicateAllLayers={() => {
                                              const sourceLayers = floorLayers[rsd.surfaceType] || [];
                                              if (sourceLayers.length === 0) return;
                                              setLevelVolumes(prev => {
                                                const fl = { ...prev[floor.id] };
                                                const existing = [...(fl[rsd.surfaceType] || [])];
                                                const idRemap = new Map<string, string>();
                                                const roots = sourceLayers.filter(l => !l.parentLayerId);
                                                roots.forEach(l => {
                                                  const nid = newLayerId();
                                                  idRemap.set(l.id, nid);
                                                  existing.push({ ...l, id: nid, dbId: undefined, name: l.name ? `${l.name} (copia)` : '(copia)', dirty: true, parentLayerId: null });
                                                });
                                                const children = sourceLayers.filter(l => l.parentLayerId);
                                                children.forEach(l => {
                                                  const newParent = idRemap.get(l.parentLayerId!) || l.parentLayerId;
                                                  existing.push({ ...l, id: newLayerId(), dbId: undefined, name: l.name ? `${l.name} (copia)` : '(copia)', dirty: true, parentLayerId: newParent });
                                                });
                                                fl[rsd.surfaceType] = existing;
                                                return { ...prev, [floor.id]: fl };
                                              });
                                              toast.success(`Capas duplicadas en ${SURFACE_LABELS[rsd.surfaceType]}`);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          /* Per-room view */
                          (() => {
                            const room = structFloorRooms.find(r => r.id === currentRoomId);
                            if (!room) return <p className="text-sm text-muted-foreground">Espacio no encontrado</p>;
                            const roomCalc = calculateRoom(room, plan);
                            const h = room.height ?? plan.defaultHeight;
                            const roomSurfaceTypes: SurfaceType[] = ['suelo', 'cara_superior', 'cara_derecha', 'cara_inferior', 'cara_izquierda', 'techo', 'volumen'];

                            return (
                              <div className="space-y-2">
                                <div className="bg-muted/30 rounded p-2">
                                  <p className="text-sm font-medium mb-1">{room.name}</p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                                    <div className="flex justify-between"><span className="text-muted-foreground">Ancho:</span><span className="font-mono">{fmt(room.width, 3)} m</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Largo:</span><span className="font-mono">{fmt(room.length, 3)} m</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Altura:</span><span className="font-mono">{fmt(h, 3)} m</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Volumen:</span><span className="font-mono">{fmt(room.width * room.length * h)} m³</span></div>
                                  </div>
                                </div>

                                {/* Room surfaces */}
                                <div className="space-y-1">
                                  {roomSurfaceTypes.map(st => {
                                    const roomSd = calcRoomSurfaceArea(st, room, plan);
                                    const wallInfo = st.startsWith('cara_') ? (() => {
                                      const wallMap: Record<string, number> = { cara_superior: 1, cara_derecha: 2, cara_inferior: 3, cara_izquierda: 4 };
                                      const wall = room.walls.find(w => w.wallIndex === wallMap[st]);
                                      return wall ? ` (${wall.wallType})` : '';
                                    })() : '';
                                    const unitLabel = st === 'volumen' ? 'm³' : 'm²';

                                    return (
                                      <div key={st} className="flex items-center gap-2 py-1.5 px-3 rounded-md hover:bg-muted/30 transition-colors">
                                        {SURFACE_ICONS[st]}
                                        <span className="text-sm flex-1">{SURFACE_LABELS[st]}{wallInfo}</span>
                                        <Badge variant="outline" className="text-xs font-mono">
                                          {fmt(roomSd.area)} {unitLabel}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── SECTION 3: Mediciones ── */}
      <Collapsible open={sectionMedicionesOpen} onOpenChange={setSectionMedicionesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                {sectionMedicionesOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Ruler className="h-4 w-4" />
                Mediciones
                <Badge variant="outline" className="text-xs font-mono ml-auto">{allMeasurementItems.length} objeto{allMeasurementItems.length !== 1 ? 's' : ''}</Badge>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-4 pb-4 pt-0">
              {allMeasurementItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No hay objetos/capas con nombre definido. Añade capas en la sección Niveles.</p>
              ) : (
                <Tabs defaultValue="alphabetical" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="alphabetical">Orden alfabético</TabsTrigger>
                    <TabsTrigger value="by-layer">Por capa</TabsTrigger>
                  </TabsList>

                  <TabsContent value="alphabetical">
                    <div className="space-y-1">
                      <div className="grid grid-cols-[24px_1fr_120px_40px_32px] gap-2 text-[10px] font-semibold text-muted-foreground px-1 pb-1 border-b border-border">
                        <span className="text-center">#</span>
                        <span>Nombre</span>
                        <span className="text-right">Cantidad</span>
                        <span className="text-center" title="Unificar objetos del mismo tipo">⊕</span>
                        <span className="text-center">✎</span>
                      </div>
                      {alphabeticalItems.map((item, idx) => (
                        <React.Fragment key={`${item.name}-${idx}`}>
                        <div className={`grid grid-cols-[24px_1fr_120px_40px_32px] gap-2 items-center text-sm px-1 py-1 rounded ${item.isUnified ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/30'}`}>
                          <span className="text-xs text-muted-foreground text-center font-mono">{idx + 1}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={item.isUnified ? 'font-medium text-primary' : ''}>{item.name}</span>
                            {item.isUnified && item.subItems && (
                              <Badge variant="secondary" className="text-[9px]">{item.subItems.length} unificados</Badge>
                            )}
                            {!item.isUnified && item.floorName && (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">{item.floorName}</Badge>
                            )}
                          </div>
                          <span className="text-right font-mono font-medium">
                            {fmt(item.value)} {item.unit}
                          </span>
                          <div className="flex justify-center">
                            {item.canUnify && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  const norm = normalizeForGroup(item.name);
                                  toggleUnify(`${norm}__${item.unit}`);
                                }}
                                title={item.isUnified ? 'Separar objetos' : 'Unificar objetos del mismo tipo'}
                              >
                                {item.isUnified
                                  ? <Unlink className="h-3.5 w-3.5 text-primary" />
                                  : <Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            )}
                          </div>
                          <div className="flex justify-center">
                            {!item.isUnified && item.layerRef && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingLayer(item.layerRef!)} title="Editar objeto">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {item.isUnified && item.subItems && item.subItems.length > 0 && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingLayer(item.subItems![0].layerRef)} title="Editar primer objeto">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Show sub-items with floor origin when unified */}
                        {item.isUnified && item.subItems && (
                          <div className="pl-8 space-y-0.5 mb-1">
                            {item.subItems.map((sub, si) => (
                              <div key={si} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center text-xs text-muted-foreground px-1 py-0.5 hover:bg-muted/20 rounded">
                                <div className="flex items-center gap-1.5">
                                  <CornerDownRight className="h-3 w-3 shrink-0" />
                                  <span>{sub.name}</span>
                                  <Badge variant="outline" className="text-[9px]">{sub.floorName}</Badge>
                                  <span className="text-[9px] opacity-60">{sub.surfaceLabel}</span>
                                </div>
                                <span className="text-right font-mono">{fmt(sub.value)} {sub.unit}</span>
                                <div className="flex justify-center">
                                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingLayer(sub.layerRef)} title="Editar">
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        </React.Fragment>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="by-layer">
                    <div className="space-y-3">
                      {Array.from(byLayerItems.entries()).map(([groupKey, items]) => (
                        <div key={groupKey}>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{groupKey}</p>
                          <div className="space-y-0.5 pl-2 border-l-2 border-muted">
                            {items.sort((a, b) => a.name.localeCompare(b.name, 'es')).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm px-2 py-0.5 hover:bg-muted/30 rounded group">
                                <span>{item.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-medium">{fmt(item.value)} {item.unit}</span>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingLayer(item.layerRef)} title="Editar objeto">
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Edit Layer Dialog ── */}
      {editingLayer && (() => {
        const el = editingLayer;
        const layer = (levelVolumes[el.floorId]?.[el.surfaceType] || []).find(l => l.id === el.layerId);
        if (!layer) return null;
        const floorRooms = rooms.filter(r => r.floorId === el.floorId);
        const dims = calcSurfaceArea(el.surfaceType, plan, rooms, floorRooms, slopes, layer.includeNonStructural);
        const linearMetrics = calcLinearMetrics(layer, { largo: dims.largo, ancho: dims.ancho });
        const onUpdate = (data: Partial<VolumeLayer>) => updateLayer(el.floorId, el.surfaceType, el.layerId, data);
        return (
          <Dialog open={!!editingLayer} onOpenChange={(open) => { if (!open) setEditingLayer(null); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  Editar objeto/capa
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={layer.name} onChange={e => onUpdate({ name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input value={layer.description} onChange={e => onUpdate({ description: e.target.value })} placeholder="Descripción del objeto" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de medición</Label>
                    <Select
                      value={layer.measurementType}
                      onValueChange={v => {
                        const nextType = v as MeasurementType;
                        onUpdate(nextType === 'linear'
                          ? {
                              measurementType: nextType,
                              spacingMm: layer.spacingMm ?? 600,
                              orientation: layer.orientation ?? 'parallel_ridge',
                            }
                          : { measurementType: nextType });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="area">Superficie (m²)</SelectItem>
                        <SelectItem value="linear">Lineal (ml)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Espesor (mm)</Label>
                    <Input type="number" value={layer.thicknessMm} min={1} onChange={e => onUpdate({ thicknessMm: Math.max(1, parseInt(e.target.value) || 1) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Superficie</Label>
                    <span className="text-sm font-mono block pt-1">{SURFACE_LABELS[el.surfaceType]}</span>
                  </div>
                  <div className="space-y-2">
                    <Label>Incluir no estructural</Label>
                    <div className="pt-1">
                      <Checkbox checked={layer.includeNonStructural} onCheckedChange={c => onUpdate({ includeNonStructural: !!c })} />
                      <span className="text-xs text-muted-foreground ml-2">{layer.extraSurfaceName || (el.surfaceType.startsWith('cubierta') ? 'Aleros' : 'Ext.')}</span>
                    </div>
                  </div>
                </div>
                {layer.measurementType === 'linear' && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">Propiedades lineales</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Sección ancho (mm)</Label>
                        <Input type="number" value={layer.sectionWidthMm ?? ''} placeholder="100" onChange={e => onUpdate({ sectionWidthMm: parseInt(e.target.value) || null })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Sección alto (mm)</Label>
                        <Input type="number" value={layer.sectionHeightMm ?? ''} placeholder="150" onChange={e => onUpdate({ sectionHeightMm: parseInt(e.target.value) || null })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Orientación</Label>
                        <Select value={layer.orientation || 'parallel_ridge'} onValueChange={v => onUpdate({ orientation: v as VolumeLayer['orientation'] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="parallel_ridge">∥ Paralelo cumbrera</SelectItem>
                            <SelectItem value="crossed_ridge">⊥ Cruzado cumbrera</SelectItem>
                            <SelectItem value="left_right">↔ Izquierda / Derecha</SelectItem>
                            <SelectItem value="top_bottom">↕ Arriba / Abajo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Separación (mm)</Label>
                        <Input type="number" value={layer.spacingMm ?? ''} placeholder="600" onChange={e => onUpdate({ spacingMm: parseInt(e.target.value) || null })} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Grupo (compartir espesor)</Label>
                    <GroupTagInput value={layer.groupTag} allLayers={Object.values(levelVolumes[el.floorId] || {}).flat()} currentLayerId={layer.id} onChange={val => onUpdate({ groupTag: val })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Etiqueta superficie extra</Label>
                    <Input value={layer.extraSurfaceName} placeholder={el.surfaceType.startsWith('cubierta') ? 'Aleros' : 'Ext.'} onChange={e => onUpdate({ extraSurfaceName: e.target.value })} />
                  </div>
                </div>
                {/* Summary */}
                <div className="border-t pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Largo:</span><span className="font-mono">{fmt(dims.largo, 3)} m</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ancho:</span><span className="font-mono">{fmt(dims.ancho, 3)} m</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Superficie:</span><span className="font-mono">{fmt(dims.area)} m²</span></div>
                  {layer.measurementType === 'area' && (
                    <div className="flex justify-between font-medium"><span>Volumen:</span><span className="font-mono">{fmt(dims.area * layer.thicknessMm / 1000)} m³</span></div>
                  )}
                  {layer.measurementType === 'linear' && linearMetrics && (
                    <>
                      <div className="flex justify-between"><span className="text-muted-foreground">Nº piezas:</span><span className="font-mono">{fmt(linearMetrics.pieceCount, 2)}</span></div>
                      <div className="flex justify-between font-medium"><span>Total lineal:</span><span className="font-mono">{fmt(linearMetrics.totalMl)} ml</span></div>
                    </>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

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
