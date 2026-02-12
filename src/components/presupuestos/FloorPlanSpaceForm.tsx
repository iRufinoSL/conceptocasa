import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Save, Unlink } from 'lucide-react';
import type { RoomData, WallType, FloorPlanData } from '@/lib/floor-plan-calculations';

interface FloorPlanSpaceFormProps {
  room: RoomData;
  allRooms: RoomData[];
  planData: FloorPlanData;
  coordCol?: number;
  coordRow?: number;
  floorName?: string;
  onUpdateRoom: (data: { name?: string; width?: number; length?: number; hasFloor?: boolean; hasCeiling?: boolean }) => void;
  onUpdateWall: (wallId: string, data: { wallType?: WallType }) => void;
  onChangeCoordinate?: (col: number, row: number) => void;
  onUngroupRoom?: (groupId: string) => void;
  onDeleteRoom: () => void;
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

export function FloorPlanSpaceForm({ room, allRooms, planData, coordCol, coordRow, floorName, onUpdateRoom, onUpdateWall, onChangeCoordinate, onUngroupRoom, onDeleteRoom, saving }: FloorPlanSpaceFormProps) {
  // Local buffered state for all editable fields
  const [localName, setLocalName] = useState(room.name);
  const [localWidth, setLocalWidth] = useState(String(room.width));
  const [localLength, setLocalLength] = useState(String(room.length));
  const [localHasFloor, setLocalHasFloor] = useState(room.hasFloor !== false);
  const [localHasCeiling, setLocalHasCeiling] = useState(room.hasCeiling !== false);
  const [localCol, setLocalCol] = useState(String(coordCol || 1));
  const [localRow, setLocalRow] = useState(String(coordRow || 1));
  const [localWalls, setLocalWalls] = useState<Record<string, WallType>>(() => {
    const map: Record<string, WallType> = {};
    room.walls.forEach(w => { map[w.id] = w.wallType; });
    return map;
  });

  // Reset local state when a different room is selected
  useEffect(() => {
    setLocalName(room.name);
    setLocalWidth(String(room.width));
    setLocalLength(String(room.length));
    setLocalHasFloor(room.hasFloor !== false);
    setLocalHasCeiling(room.hasCeiling !== false);
    setLocalCol(String(coordCol || 1));
    setLocalRow(String(coordRow || 1));
    const map: Record<string, WallType> = {};
    room.walls.forEach(w => { map[w.id] = w.wallType; });
    setLocalWalls(map);
  }, [room.id, coordCol, coordRow]);

  const parsedWidth = parseFloat(localWidth) || room.width;
  const parsedLength = parseFloat(localLength) || room.length;
  const parsedCol = parseInt(localCol) || 1;
  const parsedRow = parseInt(localRow) || 1;
  const m2 = parsedWidth * parsedLength;

  // Group info
  const groupMembers = useMemo(() => {
    if (!room.groupId) return [];
    return allRooms.filter(r => r.groupId === room.groupId);
  }, [room.groupId, allRooms]);
  const groupTotalM2 = groupMembers.reduce((s, r) => s + r.width * r.length, 0);

  // Detect if anything changed
  const roomChanged =
    localName !== room.name ||
    parsedWidth !== room.width ||
    parsedLength !== room.length ||
    localHasFloor !== (room.hasFloor !== false) ||
    localHasCeiling !== (room.hasCeiling !== false);

  const coordChanged = parsedCol !== (coordCol || 1) || parsedRow !== (coordRow || 1);

  const wallsChanged = room.walls.some(w => localWalls[w.id] !== w.wallType);

  const hasChanges = roomChanged || coordChanged || wallsChanged;

  const handleSave = async () => {
    // Save room property changes
    if (roomChanged) {
      const updates: Record<string, unknown> = {};
      if (localName !== room.name) updates.name = localName;
      if (parsedWidth !== room.width) updates.width = parsedWidth;
      if (parsedLength !== room.length) updates.length = parsedLength;
      if (localHasFloor !== (room.hasFloor !== false)) updates.hasFloor = localHasFloor;
      if (localHasCeiling !== (room.hasCeiling !== false)) updates.hasCeiling = localHasCeiling;
      onUpdateRoom(updates as { name?: string; width?: number; length?: number; hasFloor?: boolean; hasCeiling?: boolean });
    }

    // Save wall changes
    if (wallsChanged) {
      for (const wall of room.walls) {
        if (localWalls[wall.id] !== wall.wallType) {
          onUpdateWall(wall.id, { wallType: localWalls[wall.id] });
        }
      }
    }

    // Save coordinate changes
    if (coordChanged && onChangeCoordinate && parsedCol > 0 && parsedRow > 0) {
      onChangeCoordinate(parsedCol, parsedRow);
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{room.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onDeleteRoom} disabled={saving}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        {floorName && (
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px]">{floorName}</Badge>
            {coordCol && coordRow && (
              <Badge variant="outline" className="text-[10px]">Col {coordCol} · Fila {coordRow}</Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input
            value={localName}
            onChange={e => setLocalName(e.target.value)}
            disabled={saving}
          />
        </div>

        {/* Coordinate - plain text inputs without spinners */}
        <div>
          <Label className="text-xs font-semibold">Coordenadas</Label>
          <div className="flex items-end gap-2 mt-1">
            <div>
              <Label className="text-[10px] text-muted-foreground">Columna</Label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={localCol}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setLocalCol(v);
                }}
                disabled={saving}
                className="flex h-8 w-16 rounded-md border border-input bg-background px-3 py-1 text-sm text-center ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Fila</Label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={localRow}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setLocalRow(v);
                }}
                disabled={saving}
                className="flex h-8 w-16 rounded-md border border-input bg-background px-3 py-1 text-sm text-center ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
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
            <Label className="text-xs">Ancho (m)</Label>
            <Input
              type="number" step="0.1" value={localWidth}
              onChange={e => setLocalWidth(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <Label className="text-xs">Largo (m)</Label>
            <Input
              type="number" step="0.1" value={localLength}
              onChange={e => setLocalLength(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          Superficie: {m2.toFixed(1)} m²
        </div>

        {/* Floor & Ceiling */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiene suelo</Label>
            <Switch
              checked={localHasFloor}
              onCheckedChange={v => setLocalHasFloor(v)}
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiene techo</Label>
            <Switch
              checked={localHasCeiling}
              onCheckedChange={v => setLocalHasCeiling(v)}
              disabled={saving}
            />
          </div>
        </div>

        {/* Walls */}
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold mb-2">Paredes</h4>
          <div className="space-y-2">
            {room.walls
              .slice()
              .sort((a, b) => a.wallIndex - b.wallIndex)
              .map(wall => (
                <div key={wall.id} className="flex items-center gap-2">
                  <span className="text-xs w-24 shrink-0 text-muted-foreground">
                    {WALL_NAMES[wall.wallIndex - 1]}
                  </span>
                  <Select
                    value={localWalls[wall.id] || wall.wallType}
                    onValueChange={v => setLocalWalls(prev => ({ ...prev, [wall.id]: v as WallType }))}
                    disabled={saving}
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
                </div>
              ))}
          </div>
        </div>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-1" /> Guardar
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Las paredes sin nada adyacente (arriba, derecha, abajo, izquierda) se consideran externas por defecto.
          Usa «Auto ext.» en la barra superior para clasificar automáticamente.
        </p>
      </CardContent>
    </Card>
  );
}
