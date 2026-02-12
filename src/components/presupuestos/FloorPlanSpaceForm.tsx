import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, MapPin } from 'lucide-react';
import type { RoomData, WallType, FloorPlanData } from '@/lib/floor-plan-calculations';

interface FloorPlanSpaceFormProps {
  room: RoomData;
  planData: FloorPlanData;
  coordCol?: number;
  coordRow?: number;
  floorName?: string;
  onUpdateRoom: (data: { name?: string; width?: number; length?: number; hasFloor?: boolean; hasCeiling?: boolean }) => void;
  onUpdateWall: (wallId: string, data: { wallType?: WallType }) => void;
  onChangeCoordinate?: (col: number, row: number) => void;
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

export function FloorPlanSpaceForm({ room, planData, coordCol, coordRow, floorName, onUpdateRoom, onUpdateWall, onChangeCoordinate, onDeleteRoom, saving }: FloorPlanSpaceFormProps) {
  const m2 = room.width * room.length;
  const [inputCol, setInputCol] = useState(coordCol || 1);
  const [inputRow, setInputRow] = useState(coordRow || 1);

  useEffect(() => {
    setInputCol(coordCol || 1);
    setInputRow(coordRow || 1);
  }, [coordCol, coordRow]);

  const coordChanged = inputCol !== (coordCol || 1) || inputRow !== (coordRow || 1);

  const handleApplyCoordinate = () => {
    if (!onChangeCoordinate || !coordChanged) return;
    if (inputCol > 0 && inputRow > 0) {
      onChangeCoordinate(inputCol, inputRow);
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
            value={room.name}
            onChange={e => onUpdateRoom({ name: e.target.value })}
            disabled={saving}
          />
        </div>

        {/* Coordinate - separate Col / Row inputs */}
        <div>
          <Label className="text-xs font-semibold">Coordenadas</Label>
          <div className="flex items-end gap-2 mt-1">
            <div>
              <Label className="text-[10px] text-muted-foreground">Columna</Label>
              <Input
                type="number"
                min={1}
                value={inputCol}
                onChange={e => setInputCol(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={e => { if (e.key === 'Enter') handleApplyCoordinate(); }}
                disabled={saving}
                className="w-16 h-8 text-sm text-center"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Fila</Label>
              <Input
                type="number"
                min={1}
                value={inputRow}
                onChange={e => setInputRow(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={e => { if (e.key === 'Enter') handleApplyCoordinate(); }}
                disabled={saving}
                className="w-16 h-8 text-sm text-center"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyCoordinate}
              disabled={saving || !coordChanged}
              title="Mover espacio a la coordenada indicada"
            >
              <MapPin className="h-3.5 w-3.5 mr-1" /> Mover
            </Button>
          </div>
          {coordChanged && (
            <p className="text-[10px] text-primary font-medium mt-1">
              Pulsa «Mover» para reposicionar de Col {coordCol} · Fila {coordRow} → Col {inputCol} · Fila {inputRow}
            </p>
          )}
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Ancho (m)</Label>
            <Input
              type="number" step="0.1" value={room.width}
              onChange={e => onUpdateRoom({ width: Number(e.target.value) })}
              disabled={saving}
            />
          </div>
          <div>
            <Label className="text-xs">Largo (m)</Label>
            <Input
              type="number" step="0.1" value={room.length}
              onChange={e => onUpdateRoom({ length: Number(e.target.value) })}
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
              checked={room.hasFloor !== false}
              onCheckedChange={v => onUpdateRoom({ hasFloor: v })}
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiene techo</Label>
            <Switch
              checked={room.hasCeiling !== false}
              onCheckedChange={v => onUpdateRoom({ hasCeiling: v })}
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
                    value={wall.wallType}
                    onValueChange={v => onUpdateWall(wall.id, { wallType: v as WallType })}
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

        <p className="text-[10px] text-muted-foreground">
          Las paredes sin nada adyacente (arriba, derecha, abajo, izquierda) se consideran externas por defecto.
          Usa «Auto ext.» en la barra superior para clasificar automáticamente.
        </p>
      </CardContent>
    </Card>
  );
}
