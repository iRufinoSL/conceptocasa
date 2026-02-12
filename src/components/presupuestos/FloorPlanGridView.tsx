import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RoomData, FloorLevel } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, isExteriorType } from '@/lib/floor-plan-calculations';

interface FloorPlanGridViewProps {
  rooms: RoomData[];
  floors: FloorLevel[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
}

interface PositionedRoom {
  room: RoomData;
  gridCol: number;
  gridRow: number;
}

const THRESHOLD = 0.15;

function deriveGridPositions(floorRooms: RoomData[]): PositionedRoom[] {
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

export function FloorPlanGridView({ rooms, floors, selectedRoomId, onSelectRoom }: FloorPlanGridViewProps) {
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
    const totalM2 = floorRooms.reduce((s, r) => s + r.width * r.length, 0);

    return (
      <Card key={floorId} className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{floorName}</CardTitle>
            <Badge variant="secondary" className="text-xs">{totalM2.toFixed(1)} m²</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(100px, 1fr))` }}
          >
            {positioned.map(({ room, gridCol, gridRow }) => {
              const extWalls = getExternalWalls(room);
              const isSelected = room.id === selectedRoomId;
              const m2 = (room.width * room.length).toFixed(1);
              const colorClass = getSpaceColor(room.name);

              return (
                <div
                  key={room.id}
                  className={`
                    relative p-3 rounded cursor-pointer transition-all border-2
                    ${colorClass}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-lg scale-[1.02]' : 'hover:shadow-md'}
                  `}
                  style={{
                    gridColumn: gridCol,
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
                  <div className="text-xs font-semibold truncate">{room.name}</div>
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

  return (
    <div>
      {floors.length > 0 ? (
        floors.map(f => {
          const floorRooms = roomsByFloor.get(f.id) || [];
          if (floorRooms.length === 0) return null;
          return renderFloor(f.id, f.name, floorRooms);
        })
      ) : (
        renderFloor('_none_', 'Planta', rooms)
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Bordes gruesos = paredes externas. Clic en un espacio para editar sus paredes.
      </p>
    </div>
  );
}
