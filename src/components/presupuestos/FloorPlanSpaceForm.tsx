import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Save, Unlink, Plus, DoorOpen, Copy, ArrowRight, ArrowDown, ChevronDown, ChevronRight, Eye, Pencil, X } from 'lucide-react';
import type { RoomData, WallType, FloorPlanData, OpeningData } from '@/lib/floor-plan-calculations';
import { OPENING_PRESETS, metersToBlocks, blocksToMeters, computeWallSegments } from '@/lib/floor-plan-calculations';
import { formatCoord, parseCoord } from './FloorPlanGridView';

interface FloorPlanSpaceFormProps {
  room: RoomData;
  allRooms: RoomData[];
  planData: FloorPlanData;
  coordCol?: number;
  coordRow?: number;
  coordZ?: number;
  floorName?: string;
  onUpdateRoom: (data: { name?: string; width?: number; length?: number; height?: number; extWallThickness?: number | null; intWallThickness?: number | null; hasFloor?: boolean; hasCeiling?: boolean }) => void | Promise<void>;
  onUpdateWall: (wallId: string, data: { wallType?: WallType }) => void | Promise<void>;
  onUpdateWallSegmentType?: (wallId: string, segmentIndex: number, segmentType: WallType) => void | Promise<void>;
  onAddOpening?: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onDeleteOpening?: (openingId: string) => Promise<void>;
  onDuplicateRoom?: (direction: 'right' | 'down') => Promise<void>;
  onChangeCoordinate?: (col: number, row: number, z?: number) => void | Promise<void>;
  onUngroupRoom?: (groupId: string) => void;
  onDeleteRoom: () => void;
  onNavigateToElevation?: (wallId: string, wallIndex: number) => void;
  saving: boolean;
}

const WALL_NAMES = ['Superior (1)', 'Derecha (2)', 'Inferior (3)', 'Izquierda (4)'];

const WALL_TYPE_OPTIONS: { value: WallType; label: string }[] = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'interior_invisible', label: 'Int. invisible' },
];

export function FloorPlanSpaceForm({ room, allRooms, planData, coordCol, coordRow, coordZ, floorName, onUpdateRoom, onUpdateWall, onUpdateWallSegmentType, onAddOpening, onDeleteOpening, onDuplicateRoom, onChangeCoordinate, onUngroupRoom, onDeleteRoom, onNavigateToElevation, saving }: FloorPlanSpaceFormProps) {
  const isBlockMode = planData.scaleMode === 'bloque';
  const blockL = planData.blockLengthMm || 625;
  const blockH = planData.blockHeightMm || 250;

  const toDisplay = useCallback((meters: number) => isBlockMode ? String(metersToBlocks(meters, blockL)) : String(meters), [isBlockMode, blockL]);

  // Local buffered state for all editable fields
  const [localName, setLocalName] = useState(room.name);
  const [localWidth, setLocalWidth] = useState(toDisplay(room.width));
  const [localLength, setLocalLength] = useState(toDisplay(room.length));
  const [localHeight, setLocalHeight] = useState(room.height != null ? String(room.height) : '');
  const [localExtWT, setLocalExtWT] = useState(room.extWallThickness != null ? String(room.extWallThickness) : '');
  const [localIntWT, setLocalIntWT] = useState(room.intWallThickness != null ? String(room.intWallThickness) : '');
  const [localHasFloor, setLocalHasFloor] = useState(room.hasFloor !== false);
  const [localHasCeiling, setLocalHasCeiling] = useState(room.hasCeiling !== false);
  const [localCoord, setLocalCoord] = useState(coordCol != null && coordRow != null ? `${coordCol - 1},${coordRow - 1}` : '');
  const [localWalls, setLocalWalls] = useState<Record<string, WallType>>(() => {
    const map: Record<string, WallType> = {};
    room.walls.forEach(w => { map[w.id] = w.wallType; });
    return map;
  });
  const [expandedWall, setExpandedWall] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const resetDraftFromRoom = useCallback(() => {
    setLocalName(room.name);
    setLocalWidth(toDisplay(room.width));
    setLocalLength(toDisplay(room.length));
    setLocalHeight(room.height != null ? String(room.height) : '');
    setLocalExtWT(room.extWallThickness != null ? String(room.extWallThickness) : '');
    setLocalIntWT(room.intWallThickness != null ? String(room.intWallThickness) : '');
    setLocalHasFloor(room.hasFloor !== false);
    setLocalHasCeiling(room.hasCeiling !== false);
    setLocalCoord(coordCol != null && coordRow != null ? `${coordCol - 1},${coordRow - 1}` : '');
    const map: Record<string, WallType> = {};
    room.walls.forEach(w => { map[w.id] = w.wallType; });
    setLocalWalls(map);
    setExpandedWall(null);
    setIsEditing(false);
  }, [room, coordCol, coordRow, coordZ, toDisplay]);

  // Filter rooms to same floor and only placed rooms to avoid false adjacencies and crashes
  const sameFloorRooms = useMemo(() => {
    const base = room.floorId ? allRooms.filter(r => r.floorId === room.floorId) : allRooms;
    // Exclude unplaced rooms (posX/posY null) and zero-dimension rooms to prevent division-by-zero in computeWallSegments
    return base.filter(r => r.posX != null && r.posY != null && r.width > 0 && r.length > 0);
  }, [allRooms, room.floorId]);

  // Compute wall segments dynamically based on room adjacency (same floor only)
  const wallSegmentsMap = useMemo(() => {
    try {
      const map = computeWallSegments(sameFloorRooms);
      return map;
    } catch (err) {
      console.error('[FloorPlanSpaceForm] computeWallSegments crashed:', err);
      return new Map();
    }
  }, [sameFloorRooms]);

  // Reset local state when a different room is selected
  useEffect(() => {
    resetDraftFromRoom();
  }, [resetDraftFromRoom]);

  const parsedWidth = parseFloat(localWidth) || room.width;
  const parsedLength = parseFloat(localLength) || room.length;
  const parsedCoord = localCoord ? parseCoord(localCoord) : null;
  const parsedCol = parsedCoord?.col || 0;
  const parsedRow = parsedCoord?.row || 0;
  const parsedZ = parsedCoord?.z ?? 0;
  const m2 = isBlockMode
    ? blocksToMeters(parsedWidth, blockL) * blocksToMeters(parsedLength, blockL)
    : parsedWidth * parsedLength;

  // Group info
  const groupMembers = useMemo(() => {
    if (!room.groupId) return [];
    return allRooms.filter(r => r.groupId === room.groupId);
  }, [room.groupId, allRooms]);
  const groupTotalM2 = groupMembers.reduce((s, r) => s + r.width * r.length, 0);

  // Get the effective meter values (converting from blocks if needed)
  const effectiveWidth = isBlockMode ? blocksToMeters(parsedWidth, blockL) : parsedWidth;
  const effectiveLength = isBlockMode ? blocksToMeters(parsedLength, blockL) : parsedLength;

  const parsedHeight = localHeight ? parseFloat(localHeight) : undefined;
  const parsedExtWT = localExtWT ? parseFloat(localExtWT) : undefined;
  const parsedIntWT = localIntWT ? parseFloat(localIntWT) : undefined;

  // Detect if anything changed
  const roomChanged =
    localName !== room.name ||
    effectiveWidth !== room.width ||
    effectiveLength !== room.length ||
    parsedHeight !== room.height ||
    parsedExtWT !== room.extWallThickness ||
    parsedIntWT !== room.intWallThickness ||
    localHasFloor !== (room.hasFloor !== false) ||
    localHasCeiling !== (room.hasCeiling !== false);

  const coordChanged = parsedCol !== (coordCol ?? 0) || parsedRow !== (coordRow ?? 0);

  const wallsChanged = room.walls.some(w => localWalls[w.id] !== w.wallType);

  const hasChanges = roomChanged || coordChanged || wallsChanged;
  const fieldsDisabled = saving || !isEditing;

  const handleSave = async () => {
    // Save coordinate changes FIRST (most important for unplaced rooms)
    if (coordChanged && onChangeCoordinate && parsedCol != null && parsedRow != null) {
      await onChangeCoordinate(parsedCol, parsedRow, coordZ);
    }

    // Save room property changes
    if (roomChanged) {
      const updates: Record<string, unknown> = {};
      if (localName !== room.name) updates.name = localName;
      if (effectiveWidth !== room.width) updates.width = effectiveWidth;
      if (effectiveLength !== room.length) updates.length = effectiveLength;
      if (parsedHeight !== room.height) updates.height = parsedHeight;
      if (parsedExtWT !== room.extWallThickness) updates.extWallThickness = parsedExtWT ?? null;
      if (parsedIntWT !== room.intWallThickness) updates.intWallThickness = parsedIntWT ?? null;
      if (localHasFloor !== (room.hasFloor !== false)) updates.hasFloor = localHasFloor;
      if (localHasCeiling !== (room.hasCeiling !== false)) updates.hasCeiling = localHasCeiling;
      await onUpdateRoom(updates as any);
    }

    // Save wall changes
    if (wallsChanged) {
      for (const wall of room.walls) {
        if (localWalls[wall.id] !== wall.wallType) {
          await onUpdateWall(wall.id, { wallType: localWalls[wall.id] });
        }
      }
    }

    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{room.name}</CardTitle>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={resetDraftFromRoom}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => setIsEditing(true)}
                disabled={saving}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDeleteRoom} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
        {floorName && (
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px]">{floorName}</Badge>
            {coordCol != null && coordRow != null && (
              <Badge variant="outline" className="text-[10px] font-mono">{formatCoord(coordCol, coordRow, undefined, coordZ)}</Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEditing && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Pulsa <span className="font-semibold text-foreground">Editar</span> para modificar este espacio.
          </div>
        )}

        {/* Name */}
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input
            value={localName}
            onChange={e => setLocalName(e.target.value)}
            disabled={fieldsDisabled}
          />
        </div>

        {/* Coordinate - XY editable, Z read-only (derived from floor level) */}
        <div>
          <Label className="text-xs font-semibold">Coordenada XY (ej: 0,0 o 18,1)</Label>
          <div className="flex items-end gap-2 mt-1">
            <input
              type="text"
              value={localCoord}
              onChange={e => setLocalCoord(e.target.value)}
              placeholder="X,Y"
              disabled={fieldsDisabled}
              className="flex h-8 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm text-center font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="text-[10px] text-muted-foreground pb-1">
              Z={coordZ ?? 0} (nivel)
              {coordCol != null && coordRow != null
                ? ` · Actual: ${formatCoord(coordCol, coordRow, undefined, coordZ)}`
                : ' · Sin colocar — asigna coordenada para posicionar'}
            </span>
          </div>
        </div>

        {/* Group info */}
        {room.groupId && groupMembers.length > 0 && (
          <div className="border rounded-lg p-2 bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold">🔗 Grupo: {room.groupName || 'Sin nombre'}</Label>
              {onUngroupRoom && (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => onUngroupRoom(room.groupId!)} disabled={saving}>
                  <Unlink className="h-3 w-3 mr-1" /> Desagrupar
                </Button>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              {groupMembers.map(r => (
                <div key={r.id} className={r.id === room.id ? 'font-bold' : ''}>
                  {r.name} — {(r.width * r.length).toFixed(1)} m²
                </div>
              ))}
              <div className="font-semibold text-xs mt-1 text-foreground">
                Total grupo: {groupTotalM2.toFixed(1)} m²
              </div>
            </div>
          </div>
        )}

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">{isBlockMode ? 'Ancho (bloques)' : 'Ancho (m)'}</Label>
            <Input
              type="number" step={isBlockMode ? '1' : '0.1'} value={localWidth}
              onChange={e => setLocalWidth(e.target.value)}
              disabled={fieldsDisabled}
            />
            {isBlockMode && (
              <span className="text-[10px] text-muted-foreground">
                = {blocksToMeters(parsedWidth, blockL).toFixed(3)} m ({(parsedWidth * blockL).toFixed(0)} mm)
              </span>
            )}
          </div>
          <div>
            <Label className="text-xs">{isBlockMode ? 'Largo (bloques)' : 'Largo (m)'}</Label>
            <Input
              type="number" step={isBlockMode ? '1' : '0.1'} value={localLength}
              onChange={e => setLocalLength(e.target.value)}
              disabled={fieldsDisabled}
            />
            {isBlockMode && (
              <span className="text-[10px] text-muted-foreground">
                = {blocksToMeters(parsedLength, blockL).toFixed(3)} m ({(parsedLength * blockL).toFixed(0)} mm)
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          Superficie: {m2.toFixed(isBlockMode ? 3 : 1)} m²
          {isBlockMode && ` (${parsedWidth}×${parsedLength} bloques)`}
        </div>

        {/* Height & Wall Thickness overrides */}
        <div className="border-t pt-3">
          <Label className="text-xs font-semibold mb-2 block">Volumen — Propiedades individuales</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Altura (m)</Label>
              <Input
                type="number" step="0.01" value={localHeight}
                onChange={e => setLocalHeight(e.target.value)}
                placeholder={String(planData.defaultHeight)}
                disabled={fieldsDisabled}
                className="h-8 text-xs"
              />
              <span className="text-[9px] text-muted-foreground">
                {localHeight ? '' : `General: ${planData.defaultHeight}m`}
              </span>
            </div>
            <div>
              <Label className="text-[10px]">Esp. ext (m)</Label>
              <Input
                type="number" step="0.01" value={localExtWT}
                onChange={e => setLocalExtWT(e.target.value)}
                placeholder={String(planData.externalWallThickness)}
                disabled={fieldsDisabled}
                className="h-8 text-xs"
              />
              <span className="text-[9px] text-muted-foreground">
                {localExtWT ? '' : `General: ${planData.externalWallThickness}m`}
              </span>
            </div>
            <div>
              <Label className="text-[10px]">Esp. int (m)</Label>
              <Input
                type="number" step="0.01" value={localIntWT}
                onChange={e => setLocalIntWT(e.target.value)}
                placeholder={String(planData.internalWallThickness)}
                disabled={fieldsDisabled}
                className="h-8 text-xs"
              />
              <span className="text-[9px] text-muted-foreground">
                {localIntWT ? '' : `General: ${planData.internalWallThickness}m`}
              </span>
            </div>
          </div>
        </div>

        {/* Floor & Ceiling */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiene suelo</Label>
            <Switch
              checked={localHasFloor}
              onCheckedChange={v => setLocalHasFloor(v)}
              disabled={fieldsDisabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiene techo</Label>
            <Switch
              checked={localHasCeiling}
              onCheckedChange={v => setLocalHasCeiling(v)}
              disabled={fieldsDisabled}
            />
          </div>
        </div>

        {/* Walls with openings */}
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold mb-2">Paredes y Aperturas</h4>
          <p className="text-[10px] text-muted-foreground mb-2">
            Pulsa en una pared para ver/añadir puertas y ventanas
          </p>
          <div className="space-y-2">
            {room.walls
              .slice()
              .sort((a, b) => a.wallIndex - b.wallIndex)
              .map(wall => {
                const segKey = `${room.id}::${wall.wallIndex}`;
                const segments = wallSegmentsMap.get(segKey) || [];
                const hasMultipleSegments = segments.length > 1;
                const isExpanded = expandedWall === wall.wallIndex;
                const openingCount = wall.openings.length;

                return (
                  <div key={wall.id} className="border rounded-md p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs shrink-0 text-muted-foreground text-left font-medium hover:text-foreground flex items-center gap-1"
                        onClick={() => setExpandedWall(isExpanded ? null : wall.wallIndex)}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {WALL_NAMES[wall.wallIndex - 1]}
                        {hasMultipleSegments && (
                          <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0 h-3.5">
                            {segments.length} seg.
                          </Badge>
                        )}
                        {openingCount > 0 && (
                          <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0 h-3.5">
                            {openingCount} {openingCount === 1 ? 'hueco' : 'huecos'}
                          </Badge>
                        )}
                      </button>

                      <Select
                        value={localWalls[wall.id] || wall.wallType}
                        onValueChange={v => setLocalWalls(prev => ({ ...prev, [wall.id]: v as WallType }))}
                        disabled={fieldsDisabled}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WALL_TYPE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {onNavigateToElevation && !wall.id.startsWith('temp-') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          title="Ver alzado de esta pared"
                          onClick={() => onNavigateToElevation(wall.id, wall.wallIndex)}
                        >
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                    </div>

                    {/* Segments detail */}
                    {isExpanded && hasMultipleSegments && (
                      <div className="pl-2 space-y-1">
                        <Label className="text-[10px] text-muted-foreground font-semibold">
                          Segmentos ({segments.length}):
                        </Label>
                        {segments.map((seg, si) => {
                          const neighborRoom = seg.neighborRoomId ? sameFloorRooms.find(r => r.id === seg.neighborRoomId) : undefined;
                          const baseName = WALL_NAMES[wall.wallIndex - 1].split(' ')[0];
                          return (
                            <div key={si} className="flex items-center gap-2 text-[10px] bg-accent/30 rounded px-2 py-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {baseName} ({wall.wallIndex}{si + 1})
                              </Badge>
                              <span>{(seg.endMeters - seg.startMeters).toFixed(2)}m</span>
                              {onUpdateWallSegmentType ? (
                                <Select
                                  value={seg.segmentType}
                                  onValueChange={v => onUpdateWallSegmentType(wall.id, si, v as WallType)}
                                  disabled={fieldsDisabled}
                                >
                                  <SelectTrigger className="h-5 text-[9px] w-auto min-w-[100px] px-1 py-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {WALL_TYPE_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant={seg.segmentType.includes('exterior') ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
                                  {seg.segmentType.replace('_', ' ')}
                                </Badge>
                              )}
                              {neighborRoom && (
                                <span className="text-muted-foreground">↔ {neighborRoom.name}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Openings section */}
                    {isExpanded && (
                      <div className="pl-2 space-y-1.5">
                        {wall.openings.map(op => (
                          <div key={op.id} className="flex items-center justify-between text-[10px] bg-muted/40 rounded px-2 py-1">
                            <div className="flex items-center gap-1">
                              <DoorOpen className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                              </span>
                              <span className="text-muted-foreground">
                                {op.width.toFixed(2)}×{op.height.toFixed(2)}m
                                {op.sillHeight > 0 && ` ↑${op.sillHeight.toFixed(2)}m`}
                              </span>
                            </div>
                            {onDeleteOpening && (
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDeleteOpening(op.id)} disabled={fieldsDisabled}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                        {onAddOpening && (
                          <div className="space-y-1 pt-1">
                            <Label className="text-[10px] text-muted-foreground font-semibold">Añadir apertura:</Label>
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
                                <Button
                                  key={key}
                                  variant="outline"
                                  size="sm"
                                  className="text-[9px] h-6 px-2"
                                  onClick={() => onAddOpening(wall.id, key, preset.width, preset.height, preset.sillHeight)}
                                  disabled={fieldsDisabled}
                                >
                                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                                  {preset.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        {wall.openings.length === 0 && !onAddOpening && (
                          <p className="text-[10px] text-muted-foreground italic">Sin aperturas</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Duplicate buttons */}
        {onDuplicateRoom && (
          <div className="border-t pt-3">
            <Label className="text-xs font-semibold mb-2 block">Duplicar espacio (auto-agrupa)</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onDuplicateRoom('right')}
                disabled={saving}
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1" /> Derecha
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onDuplicateRoom('down')}
                disabled={saving}
              >
                <ArrowDown className="h-3.5 w-3.5 mr-1" /> Abajo
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              La copia se agrupa automáticamente con el original. Las dimensiones se definen en el espacio original.
            </p>
          </div>
        )}

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving || !isEditing || !hasChanges}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-1" /> Guardar cambios
        </Button>

        <p className="text-[10px] text-muted-foreground">
          {isEditing
            ? 'Haz los cambios y pulsa Guardar cambios para confirmarlos.'
            : 'Modo lectura activo. Pulsa Editar para habilitar cambios.'}
        </p>
      </CardContent>
    </Card>
  );
}
