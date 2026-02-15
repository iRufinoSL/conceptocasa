import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Link, Unlink, Undo2 } from 'lucide-react';
import type { RoomData, FloorLevel, WallType } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, isExteriorType, isInvisibleType, isCompartidaType } from '@/lib/floor-plan-calculations';

interface FloorPlanGridViewProps {
  rooms: RoomData[];
  floors: FloorLevel[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onAddRoom?: (name: string, width: number, length: number, floorId?: string, gridCol?: number, gridRow?: number) => Promise<void>;
  onGroupRooms?: (roomIds: string[], groupName: string) => Promise<void>;
  onUngroupRooms?: (groupId: string) => Promise<void>;
  onUndo?: () => Promise<void>;
  undoCount?: number;
  saving?: boolean;
}

export interface PositionedRoom {
  room: RoomData;
  gridCol: number;
  gridRow: number;
}

const THRESHOLD = 0.15;

export function deriveGridPositions(floorRooms: RoomData[]): PositionedRoom[] {
  if (floorRooms.length === 0) return [];

  const xVals = [...new Set(floorRooms.map(r => r.posX))].sort((a, b) => a - b);
  const xClusters: number[] = [];
  xVals.forEach(x => { if (!xClusters.some(c => Math.abs(c - x) < THRESHOLD)) xClusters.push(x); });
  xClusters.sort((a, b) => a - b);

  const yVals = [...new Set(floorRooms.map(r => r.posY))].sort((a, b) => a - b);
  const yClusters: number[] = [];
  yVals.forEach(y => { if (!yClusters.some(c => Math.abs(c - y) < THRESHOLD)) yClusters.push(y); });
  yClusters.sort((a, b) => a - b);

  return floorRooms.map(r => ({
    room: r,
    gridCol: xClusters.findIndex(c => Math.abs(c - r.posX) < THRESHOLD) + 1,
    gridRow: yClusters.findIndex(c => Math.abs(c - r.posY) < THRESHOLD) + 1,
  }));
}

export function computeGridRuler(positioned: PositionedRoom[]) {
  if (positioned.length === 0) return { colWidths: [], rowHeights: [], colAccum: [], rowAccum: [] };
  const cols = Math.max(...positioned.map(p => p.gridCol));
  const rows = Math.max(...positioned.map(p => p.gridRow));

  const colWidths: number[] = [];
  for (let c = 1; c <= cols; c++) {
    const roomsInCol = positioned.filter(p => p.gridCol === c);
    colWidths.push(roomsInCol.length > 0 ? Math.max(...roomsInCol.map(p => p.room.width)) : 0);
  }
  const rowHeights: number[] = [];
  for (let r = 1; r <= rows; r++) {
    const roomsInRow = positioned.filter(p => p.gridRow === r);
    rowHeights.push(roomsInRow.length > 0 ? Math.max(...roomsInRow.map(p => p.room.length)) : 0);
  }

  const colAccum: number[] = [0];
  colWidths.forEach((w, i) => colAccum.push(colAccum[i] + w));
  const rowAccum: number[] = [0];
  rowHeights.forEach((h, i) => rowAccum.push(rowAccum[i] + h));

  return { colWidths, rowHeights, colAccum, rowAccum };
}

const getSpaceColor = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('salón') || n.includes('salon')) return 'bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700';
  if (n.includes('hab')) return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
  if (n.includes('baño') || n.includes('bano')) return 'bg-cyan-100 border-cyan-300 dark:bg-cyan-900/30 dark:border-cyan-700';
  if (n.includes('porche')) return 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700';
  if (n.includes('pasillo') || n.includes('corredor')) return 'bg-gray-100 border-gray-300 dark:bg-gray-800/50 dark:border-gray-600';
  if (n.includes('cocina')) return 'bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700';
  return 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700';
};

const getGroupColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = ((hash << 5) - hash) + groupId.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 85%)`;
};

export function FloorPlanGridView({ rooms, floors, selectedRoomId, onSelectRoom, onAddRoom, onGroupRooms, onUngroupRooms, onUndo, undoCount = 0, saving = false }: FloorPlanGridViewProps) {
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id || '_none_');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState(4);
  const [newLength, setNewLength] = useState(3);
  const [newCol, setNewCol] = useState(1);
  const [newRow, setNewRow] = useState(1);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupNameInput, setGroupNameInput] = useState('');

  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);

  const roomsByFloor = useMemo(() => {
    const map = new Map<string, RoomData[]>();
    rooms.forEach(r => {
      const fid = r.floorId || '_none_';
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid)!.push(r);
    });
    return map;
  }, [rooms]);

  const groupsMap = useMemo(() => {
    const map = new Map<string, { name: string; rooms: RoomData[] }>();
    rooms.forEach(r => {
      if (r.groupId) {
        if (!map.has(r.groupId)) map.set(r.groupId, { name: r.groupName || 'Grupo', rooms: [] });
        map.get(r.groupId)!.rooms.push(r);
      }
    });
    return map;
  }, [rooms]);

  const effectiveFloors = floors.length > 0 ? floors : [{ id: '_none_', name: 'Planta', level: '0', orderIndex: 0 }];
  const currentFloorId = effectiveFloors.find(f => f.id === activeFloorId) ? activeFloorId : effectiveFloors[0]?.id;
  const currentFloor = effectiveFloors.find(f => f.id === currentFloorId);
  const currentFloorRooms = floors.length > 0 ? (roomsByFloor.get(currentFloorId) || []) : rooms;

  const currentFloorGroups = useMemo(() => {
    const groups = new Map<string, { name: string; rooms: RoomData[] }>();
    currentFloorRooms.forEach(r => {
      if (r.groupId) {
        if (!groups.has(r.groupId)) groups.set(r.groupId, { name: r.groupName || 'Grupo', rooms: [] });
        groups.get(r.groupId)!.rooms.push(r);
      }
    });
    return groups;
  }, [currentFloorRooms]);

  // Get wall type for each side of a room
  const getWallInfo = (room: RoomData) => {
    const info = new Map<number, WallType>();
    [1, 2, 3, 4].forEach(idx => {
      // Use the room's own wall type first, fallback to classification
      const ownWall = room.walls.find(w => w.wallIndex === idx);
      const key = `${room.id}::${idx}`;
      const classified = wallClassification.get(key);
      info.set(idx, ownWall?.wallType || classified || 'interior');
    });
    return info;
  };

  // Color/style for each wall type
  const getWallStyle = (wt: WallType, planExtThickness = 0.25, planIntThickness = 0.13) => {
    const isExt = isExteriorType(wt);
    const isInvis = isInvisibleType(wt);
    const isComp = isCompartidaType(wt);

    // Proportional thickness: ext=5px, int=3px, scale roughly
    const thickness = isExt
      ? Math.max(4, Math.round(planExtThickness * 20))
      : Math.max(2, Math.round(planIntThickness * 20));

    let color: string;
    if (isExt && isComp) color = 'hsl(210, 70%, 55%)';       // Blue - exterior shared
    else if (isExt && isInvis) color = 'hsl(0, 0%, 30%)';    // Dark gray dashed
    else if (isExt) color = 'hsl(var(--foreground))';         // Black - exterior
    else if (isComp) color = 'hsl(210, 60%, 70%)';           // Light blue - interior shared
    else if (isInvis) color = 'hsl(0, 0%, 60%)';             // Gray dashed
    else color = 'hsl(0, 0%, 50%)';                          // Gray - interior

    const style = isInvis ? 'dashed' : 'solid';

    return { width: `${thickness}px`, color, style };
  };

  const toggleMultiSelect = (roomId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const handleGroup = async () => {
    if (!onGroupRooms || selectedIds.size < 2 || !groupNameInput.trim()) return;
    await onGroupRooms(Array.from(selectedIds), groupNameInput.trim());
    setSelectedIds(new Set());
    setGroupNameInput('');
    setMultiSelectMode(false);
  };

  const handleAddSpace = async () => {
    if (!onAddRoom || !newName.trim()) return;
    const floorId = currentFloorId !== '_none_' ? currentFloorId : undefined;
    await onAddRoom(newName.trim(), newWidth, newLength, floorId, newCol, newRow);
    setNewName('');
    setNewWidth(4);
    setNewLength(3);
    setNewCol(1);
    setNewRow(1);
    setShowAddForm(false);
  };

  const renderFloor = (floorId: string, floorName: string, floorRooms: RoomData[]) => {
    const positioned = deriveGridPositions(floorRooms);
    const cols = positioned.length > 0 ? Math.max(...positioned.map(p => p.gridCol)) : 1;
    const rows = positioned.length > 0 ? Math.max(...positioned.map(p => p.gridRow)) : 1;
    const totalM2 = floorRooms.reduce((s, r) => s + r.width * r.length, 0);
    const { colAccum, rowAccum } = computeGridRuler(positioned);

    return (
      <Card key={floorId}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{floorName}</CardTitle>
            <Badge variant="secondary" className="text-xs">{totalM2.toFixed(1)} m²</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-1.5 mb-0.5"
            style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(100px, 1fr))` }}
          >
            <div />
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className="text-center">
                <div className="text-xs font-bold text-muted-foreground">Col {i + 1}</div>
                <div className="text-[9px] text-muted-foreground/70 font-mono">
                  {colAccum[i].toFixed(1)}–{colAccum[i + 1].toFixed(1)}m
                </div>
              </div>
            ))}
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(100px, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
          >
            {Array.from({ length: rows }, (_, ri) => (
              <div
                key={`rh-${ri}`}
                className="flex flex-col items-center justify-center"
                style={{ gridColumn: 1, gridRow: ri + 1 }}
              >
                <span className="text-xs font-bold text-muted-foreground">Fila {ri + 1}</span>
                <span className="text-[9px] text-muted-foreground/70 font-mono leading-tight">
                  {rowAccum[ri].toFixed(1)}–{rowAccum[ri + 1].toFixed(1)}m
                </span>
              </div>
            ))}
            {positioned.map(({ room, gridCol, gridRow }) => {
              const wallInfo = getWallInfo(room);
              const ws1 = getWallStyle(wallInfo.get(1)!);
              const ws2 = getWallStyle(wallInfo.get(2)!);
              const ws3 = getWallStyle(wallInfo.get(3)!);
              const ws4 = getWallStyle(wallInfo.get(4)!);
              const isSelected = room.id === selectedRoomId;
              const isMultiSelected = selectedIds.has(room.id);
              const m2 = (room.width * room.length).toFixed(1);
              const colorClass = getSpaceColor(room.name);
              const coord = `C${gridCol}·F${gridRow}`;
              const groupColor = room.groupId ? getGroupColor(room.groupId) : undefined;
              const groupInfo = room.groupId ? groupsMap.get(room.groupId) : null;
              const groupTotalM2 = groupInfo ? groupInfo.rooms.reduce((s, r) => s + r.width * r.length, 0) : null;

              // Count openings per wall for visual marks
              const openingCounts = new Map<number, { windows: number; doors: number }>();
              room.walls.forEach(w => {
                const wins = w.openings.filter(o => o.openingType.startsWith('ventana')).length;
                const doors = w.openings.filter(o => o.openingType.startsWith('puerta')).length;
                if (wins > 0 || doors > 0) openingCounts.set(w.wallIndex, { windows: wins, doors });
              });

              // Opening marks renderer for a wall side
              const renderOpeningMarks = (wallIndex: number, side: 'top' | 'right' | 'bottom' | 'left') => {
                const counts = openingCounts.get(wallIndex);
                if (!counts) return null;
                const marks: React.ReactNode[] = [];
                for (let i = 0; i < counts.windows; i++) marks.push(
                  <div key={`w${i}`} className="bg-sky-400/80" style={{
                    ...(side === 'top' || side === 'bottom' ? { width: '12px', height: '3px' } : { width: '3px', height: '12px' }),
                    borderRadius: '1px',
                  }} />
                );
                for (let i = 0; i < counts.doors; i++) marks.push(
                  <div key={`d${i}`} className="bg-amber-600/80" style={{
                    ...(side === 'top' || side === 'bottom' ? { width: '8px', height: '4px' } : { width: '4px', height: '8px' }),
                    borderRadius: '1px',
                  }} />
                );
                const posClasses: Record<string, string> = {
                  top: 'absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-0.5',
                  bottom: 'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 flex gap-0.5',
                  left: 'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5',
                  right: 'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5',
                };
                return <div className={posClasses[side]}>{marks}</div>;
              };

              return (
                <div
                  key={room.id}
                  className={`
                    relative p-3 rounded cursor-pointer transition-all
                    ${colorClass}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-lg scale-[1.02]' : 'hover:shadow-md'}
                    ${isMultiSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                  `}
                  style={{
                    gridColumn: gridCol + 1,
                    gridRow: gridRow,
                    minHeight: '80px',
                    borderTopWidth: ws1.width,
                    borderRightWidth: ws2.width,
                    borderBottomWidth: ws3.width,
                    borderLeftWidth: ws4.width,
                    borderTopColor: ws1.color,
                    borderRightColor: ws2.color,
                    borderBottomColor: ws3.color,
                    borderLeftColor: ws4.color,
                    borderTopStyle: ws1.style as any,
                    borderRightStyle: ws2.style as any,
                    borderBottomStyle: ws3.style as any,
                    borderLeftStyle: ws4.style as any,
                    ...(groupColor ? { boxShadow: `inset 0 0 0 3px ${groupColor}` } : {}),
                  }}
                  onClick={() => {
                    if (multiSelectMode) {
                      toggleMultiSelect(room.id);
                    } else {
                      onSelectRoom(room.id === selectedRoomId ? null : room.id);
                    }
                  }}
                >
                  {/* Opening marks on borders */}
                  {renderOpeningMarks(1, 'top')}
                  {renderOpeningMarks(2, 'right')}
                  {renderOpeningMarks(3, 'bottom')}
                  {renderOpeningMarks(4, 'left')}

                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold truncate">{room.name}</div>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 ml-1">{coord}</Badge>
                  </div>
                  <div className="text-lg font-bold mt-1">{m2} m²</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {room.width.toFixed(1)} × {room.length.toFixed(1)}m
                  </div>
                  {groupInfo && (
                    <div className="mt-1">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 py-0 h-3.5"
                        style={{ backgroundColor: groupColor, color: '#333' }}
                      >
                        🔗 {groupInfo.name} ({groupTotalM2?.toFixed(1)} m²)
                      </Badge>
                    </div>
                  )}
                  {multiSelectMode && (
                    <div className={`absolute top-1 right-1 w-4 h-4 rounded-full border-2 ${isMultiSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50 bg-background'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No hay espacios definidos. Genera el plano primero.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {effectiveFloors.length > 1 && (
          <Tabs value={currentFloorId} onValueChange={setActiveFloorId}>
            <TabsList className="h-8">
              {effectiveFloors.map(f => (
                <TabsTrigger key={f.id} value={f.id} className="text-xs h-7">{f.name}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onGroupRooms && (
            <Button
              variant={multiSelectMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                setSelectedIds(new Set());
                setGroupNameInput('');
              }}
              disabled={saving}
            >
              <Link className="h-4 w-4 mr-1" />
              {multiSelectMode ? 'Cancelar selección' : 'Agrupar espacios'}
            </Button>
          )}
          {onAddRoom && (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo Espacio
            </Button>
          )}
          {onUndo && undoCount > 0 && (
            <Button variant="outline" size="sm" onClick={onUndo} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-1" /> Deshacer ({undoCount})
            </Button>
          )}
        </div>
      </div>

      {multiSelectMode && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-2">
              Selecciona 2 o más espacios haciendo clic sobre ellos, luego asígnales un nombre de grupo.
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Nombre del grupo</Label>
                <Input
                  value={groupNameInput}
                  onChange={e => setGroupNameInput(e.target.value)}
                  placeholder="Ej: Porche 1"
                  className="w-40 h-8 text-sm"
                  autoFocus
                />
              </div>
              <Badge variant="secondary" className="text-xs h-8 flex items-center">
                {selectedIds.size} seleccionados
              </Badge>
              <Button
                size="sm"
                onClick={handleGroup}
                disabled={saving || selectedIds.size < 2 || !groupNameInput.trim()}
              >
                <Link className="h-4 w-4 mr-1" /> Crear grupo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentFloorGroups.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">Grupos:</span>
          {Array.from(currentFloorGroups.entries()).map(([gid, g]) => {
            const totalM2 = g.rooms.reduce((s, r) => s + r.width * r.length, 0);
            return (
              <Badge
                key={gid}
                variant="secondary"
                className="text-xs gap-1 cursor-default"
                style={{ backgroundColor: getGroupColor(gid), color: '#333' }}
              >
                🔗 {g.name} — {g.rooms.length} espacios — {totalM2.toFixed(1)} m²
                {onUngroupRooms && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUngroupRooms(gid); }}
                    className="ml-1 hover:text-destructive"
                    title="Desagrupar"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}

      {showAddForm && onAddRoom && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej: Dormitorio 3"
                  className="w-40 h-8 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSpace(); }}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs">Ancho (m)</Label>
                <Input type="number" step="0.1" value={newWidth}
                  onChange={e => setNewWidth(Number(e.target.value))}
                  className="w-20 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Largo (m)</Label>
                <Input type="number" step="0.1" value={newLength}
                  onChange={e => setNewLength(Number(e.target.value))}
                  className="w-20 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Columna</Label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={newCol}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setNewCol(Math.max(1, parseInt(v) || 1));
                  }}
                  className="flex h-8 w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
              </div>
              <div>
                <Label className="text-xs">Fila</Label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={newRow}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setNewRow(Math.max(1, parseInt(v) || 1));
                  }}
                  className="flex h-8 w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
              </div>
              <Button size="sm" onClick={handleAddSpace} disabled={saving || !newName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Añadir
              </Button>
            </div>
            {currentFloor && currentFloor.id !== '_none_' && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Se añadirá a: {currentFloor.name} en Col {newCol} · Fila {newRow}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {currentFloor && currentFloorRooms.length > 0
        ? renderFloor(currentFloor.id, currentFloor.name, currentFloorRooms)
        : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No hay espacios en esta planta.
            </CardContent>
          </Card>
        )
      }

      <p className="text-xs text-muted-foreground">
        Bordes gruesos = paredes externas. Clic en un espacio para editar. Usa «Agrupar espacios» para unir varios en uno lógico.
      </p>
    </div>
  );
}
