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
  planWidth: number;   // plan width in meters
  planLength: number;  // plan length in meters
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

/** Convert column index (1-based) to letter(s): 1→A, 2→B, ..., 27→AA */
export function colToLetter(col: number): string {
  let s = '';
  let c = col;
  while (c > 0) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}

/** Convert letter(s) to column index (1-based): A→1, B→2, AA→27 */
export function letterToCol(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col;
}

/** Parse coordinate like "A1" → { col: 1, row: 1 } */
export function parseCoord(coord: string): { col: number; row: number } | null {
  const m = coord.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: letterToCol(m[1]), row: parseInt(m[2]) };
}

/** Format coordinate: col=1, row=1 → "A1" */
export function formatCoord(col: number, row: number): string {
  return `${colToLetter(col)}${row}`;
}

// Derive grid positions from room posX/posY based on 1m grid
export function deriveGridPositions(floorRooms: RoomData[]): PositionedRoom[] {
  return floorRooms.map(r => ({
    room: r,
    gridCol: Math.round(r.posX) + 1, // 1-based col from posX in meters
    gridRow: Math.round(r.posY) + 1, // 1-based row from posY in meters
  }));
}

export function computeGridRuler(positioned: PositionedRoom[]) {
  if (positioned.length === 0) return { colWidths: [], rowHeights: [], colAccum: [], rowAccum: [] };
  const cols = Math.max(...positioned.map(p => p.gridCol));
  const rows = Math.max(...positioned.map(p => p.gridRow));
  const colWidths = Array(cols).fill(1);
  const rowHeights = Array(rows).fill(1);
  const colAccum = colWidths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);
  const rowAccum = rowHeights.reduce((acc, h) => [...acc, acc[acc.length - 1] + h], [0]);
  return { colWidths, rowHeights, colAccum, rowAccum };
}

const getSpaceColor = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('salón') || n.includes('salon')) return 'bg-amber-100/70 border-amber-400 dark:bg-amber-900/30 dark:border-amber-700';
  if (n.includes('hab')) return 'bg-blue-100/70 border-blue-400 dark:bg-blue-900/30 dark:border-blue-700';
  if (n.includes('baño') || n.includes('bano')) return 'bg-cyan-100/70 border-cyan-400 dark:bg-cyan-900/30 dark:border-cyan-700';
  if (n.includes('porche')) return 'bg-green-100/70 border-green-400 dark:bg-green-900/30 dark:border-green-700';
  if (n.includes('pasillo') || n.includes('corredor')) return 'bg-gray-100/70 border-gray-400 dark:bg-gray-800/50 dark:border-gray-600';
  if (n.includes('cocina')) return 'bg-orange-100/70 border-orange-400 dark:bg-orange-900/30 dark:border-orange-700';
  return 'bg-purple-100/70 border-purple-400 dark:bg-purple-900/30 dark:border-purple-700';
};

const getGroupColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = ((hash << 5) - hash) + groupId.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 85%)`;
};

/** Predefined space sizes */
const SPACE_PRESETS = [
  { label: 'Hab. pequeña', width: 3, length: 3 },
  { label: 'Hab. mediana', width: 4, length: 3 },
  { label: 'Hab. grande', width: 5, length: 4 },
  { label: 'Baño pequeño', width: 2, length: 2 },
  { label: 'Baño mediano', width: 3, length: 2 },
  { label: 'Baño grande', width: 4, length: 2 },
  { label: 'Cocina pequeña', width: 4, length: 2 },
  { label: 'Salón grande', width: 6, length: 5 },
];

// Get wall type for each side of a room
const getWallInfo = (room: RoomData, wallClassification: Map<string, WallType>) => {
  const info = new Map<number, WallType>();
  [1, 2, 3, 4].forEach(idx => {
    const ownWall = room.walls.find(w => w.wallIndex === idx);
    const key = `${room.id}::${idx}`;
    const classified = wallClassification.get(key);
    info.set(idx, ownWall?.wallType || classified || 'interior');
  });
  return info;
};

const getWallStyle = (wt: WallType) => {
  const isExt = isExteriorType(wt);
  const isInvis = isInvisibleType(wt);
  const isComp = isCompartidaType(wt);
  const thickness = isExt ? 4 : 2;
  let color: string;
  if (isExt && isComp) color = 'hsl(210, 70%, 55%)';
  else if (isExt && isInvis) color = 'hsl(0, 0%, 30%)';
  else if (isExt) color = 'hsl(var(--foreground))';
  else if (isComp) color = 'hsl(210, 60%, 70%)';
  else if (isInvis) color = 'hsl(0, 0%, 60%)';
  else color = 'hsl(0, 0%, 50%)';
  const style = isInvis ? 'dashed' : 'solid';
  return { width: `${thickness}px`, color, style };
};

export function FloorPlanGridView({
  rooms, floors, planWidth, planLength, selectedRoomId, onSelectRoom,
  onAddRoom, onGroupRooms, onUngroupRooms, onUndo, undoCount = 0, saving = false,
}: FloorPlanGridViewProps) {
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id || '_none_');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupNameInput, setGroupNameInput] = useState('');

  const totalCols = Math.max(1, Math.ceil(planWidth));
  const totalRows = Math.max(1, Math.ceil(planLength));
  const CELL_SIZE = 48; // px per 1m cell

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

  const effectiveFloors = floors.length > 0 ? floors : [{ id: '_none_', name: 'Planta', level: '0', orderIndex: 0 }];
  const currentFloorId = effectiveFloors.find(f => f.id === activeFloorId) ? activeFloorId : effectiveFloors[0]?.id;
  const currentFloorRooms = floors.length > 0 ? (roomsByFloor.get(currentFloorId) || []) : rooms;

  // Rooms placed on the grid (posX > 0 or posY > 0 or explicitly placed)
  const placedRooms = useMemo(() => {
    return currentFloorRooms.filter(r => r.width > 0 && r.length > 0);
  }, [currentFloorRooms]);

  // Build a cell occupation map: key = "col,row" → roomId
  const cellMap = useMemo(() => {
    const map = new Map<string, { roomId: string; isOrigin: boolean }>();
    placedRooms.forEach(r => {
      const startCol = Math.round(r.posX) + 1;
      const startRow = Math.round(r.posY) + 1;
      const spanCols = Math.round(r.width);
      const spanRows = Math.round(r.length);
      for (let dc = 0; dc < spanCols; dc++) {
        for (let dr = 0; dr < spanRows; dr++) {
          const c = startCol + dc;
          const row = startRow + dr;
          if (c >= 1 && c <= totalCols && row >= 1 && row <= totalRows) {
            map.set(`${c},${row}`, { roomId: r.id, isOrigin: dc === 0 && dr === 0 });
          }
        }
      }
    });
    return map;
  }, [placedRooms, totalCols, totalRows]);

  // Unplaced rooms: rooms with posX=0 and posY=0 and no cells in the grid
  // Actually, we show ALL rooms in header but mark placed ones
  const unplacedRooms = useMemo(() => {
    // A room is "unplaced" if it's at (0,0) and the cell A1 is not explicitly assigned to it,
    // or more practically: it shows in the header until the user assigns a coordinate.
    // For simplicity: rooms not occupying any grid cell are unplaced
    const placedIds = new Set<string>();
    cellMap.forEach(v => placedIds.add(v.roomId));
    return currentFloorRooms.filter(r => !placedIds.has(r.id));
  }, [currentFloorRooms, cellMap]);

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

  // Opening marks for walls
  const renderOpeningMarks = (room: RoomData, wallIndex: number, side: 'top' | 'right' | 'bottom' | 'left') => {
    const wall = room.walls.find(w => w.wallIndex === wallIndex);
    if (!wall) return null;
    const wins = wall.openings.filter(o => o.openingType.startsWith('ventana')).length;
    const doors = wall.openings.filter(o => o.openingType.startsWith('puerta')).length;
    if (wins === 0 && doors === 0) return null;
    const marks: React.ReactNode[] = [];
    for (let i = 0; i < wins; i++) marks.push(
      <div key={`w${i}`} className="bg-sky-400/80" style={{
        ...(side === 'top' || side === 'bottom' ? { width: '10px', height: '3px' } : { width: '3px', height: '10px' }),
        borderRadius: '1px',
      }} />
    );
    for (let i = 0; i < doors; i++) marks.push(
      <div key={`d${i}`} className="bg-amber-600/80" style={{
        ...(side === 'top' || side === 'bottom' ? { width: '7px', height: '3px' } : { width: '3px', height: '7px' }),
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

  const renderGrid = () => {
    // Render rooms as absolutely positioned overlays on the grid
    const roomOverlays = placedRooms.map(room => {
      const startCol = Math.round(room.posX) + 1;
      const startRow = Math.round(room.posY) + 1;
      const spanCols = Math.max(1, Math.round(room.width));
      const spanRows = Math.max(1, Math.round(room.length));

      const wallInfo = getWallInfo(room, wallClassification);
      const ws1 = getWallStyle(wallInfo.get(1)!);
      const ws2 = getWallStyle(wallInfo.get(2)!);
      const ws3 = getWallStyle(wallInfo.get(3)!);
      const ws4 = getWallStyle(wallInfo.get(4)!);

      const isSelected = room.id === selectedRoomId;
      const isMultiSelected = selectedIds.has(room.id);
      const m2 = (room.width * room.length).toFixed(1);
      const colorClass = getSpaceColor(room.name);
      const coord = formatCoord(startCol, startRow);
      const groupColor = room.groupId ? getGroupColor(room.groupId) : undefined;

      // Position: col header (30px) + (startCol-1)*CELL_SIZE, row header (20px) + (startRow-1)*CELL_SIZE
      const left = 30 + (startCol - 1) * CELL_SIZE;
      const top = 20 + (startRow - 1) * CELL_SIZE;
      const width = spanCols * CELL_SIZE;
      const height = spanRows * CELL_SIZE;

      return (
        <div
          key={room.id}
          className={`
            absolute cursor-pointer transition-shadow z-10 flex flex-col items-center justify-center
            ${colorClass}
            ${isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-lg z-20' : 'hover:shadow-md'}
            ${isMultiSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-20' : ''}
          `}
          style={{
            left, top, width, height,
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
            ...(groupColor ? { boxShadow: `inset 0 0 0 2px ${groupColor}` } : {}),
          }}
          onClick={() => {
            if (multiSelectMode) toggleMultiSelect(room.id);
            else onSelectRoom(room.id === selectedRoomId ? null : room.id);
          }}
        >
          {renderOpeningMarks(room, 1, 'top')}
          {renderOpeningMarks(room, 2, 'right')}
          {renderOpeningMarks(room, 3, 'bottom')}
          {renderOpeningMarks(room, 4, 'left')}

          <div className="text-[9px] font-bold truncate max-w-full px-0.5 leading-tight">{room.name}</div>
          <div className="text-[10px] font-semibold">{m2} m²</div>
          <div className="text-[8px] text-muted-foreground">{room.width.toFixed(1)}×{room.length.toFixed(1)}</div>
          <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 mt-0.5">{coord}</Badge>

          {multiSelectMode && (
            <div className={`absolute top-0.5 right-0.5 w-3 h-3 rounded-full border ${isMultiSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50 bg-background'}`} />
          )}
        </div>
      );
    });

    return (
      <div className="overflow-auto border rounded-lg bg-background">
        <div
          className="relative"
          style={{
            width: 30 + totalCols * CELL_SIZE + 1,
            height: 20 + totalRows * CELL_SIZE + 1,
          }}
        >
          {/* Column headers (A, B, C...) */}
          {Array.from({ length: totalCols }, (_, ci) => (
            <div
              key={`ch-${ci}`}
              className="absolute text-[8px] font-bold text-muted-foreground/60 text-center"
              style={{
                left: 30 + ci * CELL_SIZE,
                top: 0,
                width: CELL_SIZE,
                height: 20,
                lineHeight: '20px',
              }}
            >
              {colToLetter(ci + 1)}
            </div>
          ))}

          {/* Row headers (1, 2, 3...) */}
          {Array.from({ length: totalRows }, (_, ri) => (
            <div
              key={`rh-${ri}`}
              className="absolute text-[8px] font-bold text-muted-foreground/60 text-center"
              style={{
                left: 0,
                top: 20 + ri * CELL_SIZE,
                width: 30,
                height: CELL_SIZE,
                lineHeight: `${CELL_SIZE}px`,
              }}
            >
              {ri + 1}
            </div>
          ))}

          {/* Grid lines - very subtle */}
          {/* Vertical lines */}
          {Array.from({ length: totalCols + 1 }, (_, ci) => (
            <div
              key={`vl-${ci}`}
              className="absolute bg-muted-foreground/10"
              style={{
                left: 30 + ci * CELL_SIZE,
                top: 20,
                width: 1,
                height: totalRows * CELL_SIZE,
              }}
            />
          ))}
          {/* Horizontal lines */}
          {Array.from({ length: totalRows + 1 }, (_, ri) => (
            <div
              key={`hl-${ri}`}
              className="absolute bg-muted-foreground/10"
              style={{
                left: 30,
                top: 20 + ri * CELL_SIZE,
                width: totalCols * CELL_SIZE,
                height: 1,
              }}
            />
          ))}

          {/* Room overlays */}
          {roomOverlays}
        </div>
      </div>
    );
  };

  const totalM2 = currentFloorRooms.reduce((s, r) => s + r.width * r.length, 0);

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
      {/* Toolbar */}
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
              {multiSelectMode ? 'Cancelar' : 'Agrupar'}
            </Button>
          )}
          {onUndo && undoCount > 0 && (
            <Button variant="outline" size="sm" onClick={onUndo} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-1" /> Deshacer ({undoCount})
            </Button>
          )}
        </div>
      </div>

      {/* Multi-select grouping UI */}
      {multiSelectMode && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-2">
              Selecciona 2+ espacios en la cuadrícula, luego asígnales un nombre de grupo.
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Nombre del grupo</Label>
                <Input value={groupNameInput} onChange={e => setGroupNameInput(e.target.value)}
                  placeholder="Ej: Porche 1" className="w-40 h-8 text-sm" autoFocus />
              </div>
              <Badge variant="secondary" className="text-xs h-8 flex items-center">{selectedIds.size} sel.</Badge>
              <Button size="sm" onClick={handleGroup} disabled={saving || selectedIds.size < 2 || !groupNameInput.trim()}>
                <Link className="h-4 w-4 mr-1" /> Crear grupo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups summary */}
      {currentFloorGroups.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">Grupos:</span>
          {Array.from(currentFloorGroups.entries()).map(([gid, g]) => {
            const gm2 = g.rooms.reduce((s, r) => s + r.width * r.length, 0);
            return (
              <Badge key={gid} variant="secondary" className="text-xs gap-1"
                style={{ backgroundColor: getGroupColor(gid), color: '#333' }}>
                🔗 {g.name} — {g.rooms.length} esp. — {gm2.toFixed(1)} m²
                {onUngroupRooms && (
                  <button onClick={e => { e.stopPropagation(); onUngroupRooms(gid); }} className="ml-1 hover:text-destructive" title="Desagrupar">
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Unplaced spaces header */}
      {unplacedRooms.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Espacios sin colocar — Asigna coordenada en el formulario para posicionarlos en el plano
            </p>
            <div className="flex gap-2 flex-wrap">
              {unplacedRooms.map(r => (
                <div
                  key={r.id}
                  className={`
                    px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-center
                    ${getSpaceColor(r.name)}
                    ${r.id === selectedRoomId ? 'ring-2 ring-primary shadow-md' : 'hover:shadow'}
                  `}
                  onClick={() => onSelectRoom(r.id === selectedRoomId ? null : r.id)}
                >
                  <div className="text-xs font-semibold">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.width.toFixed(1)}×{r.length.toFixed(1)}m = {(r.width * r.length).toFixed(1)}m²
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main grid */}
      <Card>
        <CardHeader className="py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Plano {totalCols}×{totalRows}m ({totalCols * totalRows} m²)
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {placedRooms.length} colocados · {totalM2.toFixed(1)} m²
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {renderGrid()}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cada celda = 1 m². Coordenadas: columnas A-Z, filas 1-N. Clic en un espacio para editar propiedades, paredes y aperturas.
      </p>
    </div>
  );
}
