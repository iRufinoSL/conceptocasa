import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import type { RoomData, FloorLevel } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, isExteriorType } from '@/lib/floor-plan-calculations';

interface FloorPlanGridViewProps {
  rooms: RoomData[];
  floors: FloorLevel[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onAddRoom?: (name: string, width: number, length: number, floorId?: string, gridCol?: number, gridRow?: number) => Promise<void>;
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

/** Compute accumulated ruler ticks per column/row based on actual room sizes */
export function computeGridRuler(positioned: PositionedRoom[]) {
  if (positioned.length === 0) return { colWidths: [], rowHeights: [], colAccum: [], rowAccum: [] };
  const cols = Math.max(...positioned.map(p => p.gridCol));
  const rows = Math.max(...positioned.map(p => p.gridRow));

  // Max width per column, max length per row
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

  // Accumulated positions
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

export function FloorPlanGridView({ rooms, floors, selectedRoomId, onSelectRoom, onAddRoom, saving = false }: FloorPlanGridViewProps) {
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id || '_none_');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState(4);
  const [newLength, setNewLength] = useState(3);
  const [newCol, setNewCol] = useState(1);
  const [newRow, setNewRow] = useState(1);
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

  const getExternalWalls = (room: RoomData): Set<number> => {
    const ext = new Set<number>();
    [1, 2, 3, 4].forEach(idx => {
      const key = `${room.id}::${idx}`;
      const wt = wallClassification.get(key);
      if (wt && isExteriorType(wt)) ext.add(idx);
    });
    return ext;
  };

  const renderFloor = (floorId: string, floorName: string, floorRooms: RoomData[]) => {
    const positioned = deriveGridPositions(floorRooms);
    const cols = positioned.length > 0 ? Math.max(...positioned.map(p => p.gridCol)) : 1;
    const rows = positioned.length > 0 ? Math.max(...positioned.map(p => p.gridRow)) : 1;
    const totalM2 = floorRooms.reduce((s, r) => s + r.width * r.length, 0);
    const { colWidths, rowHeights, colAccum, rowAccum } = computeGridRuler(positioned);

    return (
      <Card key={floorId}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{floorName}</CardTitle>
            <Badge variant="secondary" className="text-xs">{totalM2.toFixed(1)} m²</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Column coordinate headers with ruler */}
          <div
            className="grid gap-1.5 mb-0.5"
            style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(100px, 1fr))` }}
          >
            <div /> {/* empty corner */}
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className="text-center">
                <div className="text-xs font-bold text-muted-foreground">Col {i + 1}</div>
                <div className="text-[9px] text-muted-foreground/70 font-mono">
                  {colAccum[i].toFixed(1)}–{colAccum[i + 1].toFixed(1)}m
                </div>
              </div>
            ))}
          </div>
          {/* Grid with row headers + ruler */}
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(100px, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
          >
            {/* Row headers with ruler */}
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
              const extWalls = getExternalWalls(room);
              const isSelected = room.id === selectedRoomId;
              const m2 = (room.width * room.length).toFixed(1);
              const colorClass = getSpaceColor(room.name);
              const coord = `C${gridCol}·F${gridRow}`;

              return (
                <div
                  key={room.id}
                  className={`
                    relative p-3 rounded cursor-pointer transition-all border-2
                    ${colorClass}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-lg scale-[1.02]' : 'hover:shadow-md'}
                  `}
                  style={{
                    gridColumn: gridCol + 1,
                    gridRow: gridRow,
                    minHeight: '80px',
                    borderTopWidth: extWalls.has(1) ? '4px' : undefined,
                    borderRightWidth: extWalls.has(2) ? '4px' : undefined,
                    borderBottomWidth: extWalls.has(3) ? '4px' : undefined,
                    borderLeftWidth: extWalls.has(4) ? '4px' : undefined,
                    borderTopColor: extWalls.has(1) ? 'hsl(var(--foreground))' : undefined,
                    borderRightColor: extWalls.has(2) ? 'hsl(var(--foreground))' : undefined,
                    borderBottomColor: extWalls.has(3) ? 'hsl(var(--foreground))' : undefined,
                    borderLeftColor: extWalls.has(4) ? 'hsl(var(--foreground))' : undefined,
                  }}
                  onClick={() => onSelectRoom(room.id === selectedRoomId ? null : room.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold truncate">{room.name}</div>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 ml-1">{coord}</Badge>
                  </div>
                  <div className="text-lg font-bold mt-1">{m2} m²</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {room.width.toFixed(1)} × {room.length.toFixed(1)}m
                  </div>
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

  const effectiveFloors = floors.length > 0 ? floors : [{ id: '_none_', name: 'Planta', level: '0', orderIndex: 0 }];
  const currentFloorId = effectiveFloors.find(f => f.id === activeFloorId) ? activeFloorId : effectiveFloors[0]?.id;
  const currentFloor = effectiveFloors.find(f => f.id === currentFloorId);
  const currentFloorRooms = floors.length > 0 ? (roomsByFloor.get(currentFloorId) || []) : rooms;

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

  return (
    <div className="space-y-3">
      {/* Floor tabs + Add button */}
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
        {onAddRoom && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo Espacio
          </Button>
        )}
      </div>

      {/* Inline add space form */}
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
        Bordes gruesos = paredes externas. Clic en un espacio para editar sus paredes.
      </p>
    </div>
  );
}
