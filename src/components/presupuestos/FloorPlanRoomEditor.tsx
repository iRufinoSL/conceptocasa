import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, DoorOpen, Square } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, ROOM_PRESETS } from '@/lib/floor-plan-calculations';
import type { RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlanRoomEditorProps {
  rooms: RoomData[];
  selectedRoomId?: string;
  onSelectRoom: (roomId: string) => void;
  onAddRoom: (name: string, width: number, length: number) => Promise<void>;
  onUpdateRoom: (roomId: string, data: any) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onUpdateWall: (wallId: string, data: any) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  saving: boolean;
}

export function FloorPlanRoomEditor({
  rooms, selectedRoomId, onSelectRoom,
  onAddRoom, onUpdateRoom, onDeleteRoom,
  onUpdateWall, onAddOpening, onDeleteOpening,
  saving,
}: FloorPlanRoomEditorProps) {
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomWidth, setNewRoomWidth] = useState(4);
  const [newRoomLength, setNewRoomLength] = useState(3);
  const [showPresets, setShowPresets] = useState(false);

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    await onAddRoom(newRoomName.trim(), newRoomWidth, newRoomLength);
    setNewRoomName('');
  };

  const handlePreset = async (preset: typeof ROOM_PRESETS[0]) => {
    await onAddRoom(preset.name, preset.width, preset.length);
    setShowPresets(false);
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  return (
    <div className="space-y-4">
      {/* Add room */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Añadir habitación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Nombre (ej: Salón)"
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
              />
            </div>
            <div className="w-20">
              <Input
                type="number"
                step="0.1"
                value={newRoomWidth}
                onChange={e => setNewRoomWidth(Number(e.target.value))}
                placeholder="Ancho"
              />
            </div>
            <div className="w-20">
              <Input
                type="number"
                step="0.1"
                value={newRoomLength}
                onChange={e => setNewRoomLength(Number(e.target.value))}
                placeholder="Largo"
              />
            </div>
            <Button onClick={handleAddRoom} disabled={saving || !newRoomName.trim()} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowPresets(!showPresets)} className="text-xs">
              Presets rápidos
            </Button>
            {showPresets && (
              <div className="flex flex-wrap gap-1 mt-1">
                {ROOM_PRESETS.map(p => (
                  <Button key={p.name} variant="outline" size="sm" className="text-xs h-7"
                    onClick={() => handlePreset(p)} disabled={saving}>
                    {p.name} ({p.width}×{p.length})
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Room list */}
      <div className="space-y-2">
        {rooms.map(room => (
          <Card key={room.id} 
            className={`cursor-pointer transition-colors ${selectedRoomId === room.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            <CardHeader className="pb-1 py-2 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Square className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">{room.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {room.width}×{room.length}m = {(room.width * room.length).toFixed(1)}m²
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                  onClick={e => { e.stopPropagation(); onDeleteRoom(room.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Selected room detail */}
      {selectedRoom && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Editar: {selectedRoom.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Room dimensions */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Ancho (m)</Label>
                <Input type="number" step="0.1" value={selectedRoom.width}
                  onChange={e => onUpdateRoom(selectedRoom.id, { width: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Largo (m)</Label>
                <Input type="number" step="0.1" value={selectedRoom.length}
                  onChange={e => onUpdateRoom(selectedRoom.id, { length: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Alto (m)</Label>
                <Input type="number" step="0.1" value={selectedRoom.height || ''}
                  placeholder="Auto"
                  onChange={e => onUpdateRoom(selectedRoom.id, { height: Number(e.target.value) || undefined })} />
              </div>
            </div>

            {/* Walls */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Paredes</Label>
              {selectedRoom.walls.map(wall => (
                <Collapsible key={wall.wallIndex}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-xs p-2 rounded bg-muted/50 hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{WALL_LABELS[wall.wallIndex]}</span>
                      <Badge variant={wall.wallType === 'externa' ? 'default' : 'outline'} className="text-[10px] h-4">
                        {wall.wallType}
                      </Badge>
                      {wall.openings.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4">
                          {wall.openings.length} abertura(s)
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-2 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px]">Tipo</Label>
                        <Select value={wall.wallType}
                          onValueChange={v => !wall.id.startsWith('temp-') && onUpdateWall(wall.id, { wallType: v })}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="externa">Externa</SelectItem>
                            <SelectItem value="interna">Interna</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20">
                        <Label className="text-[10px]">Espesor (m)</Label>
                        <Input type="number" step="0.01" className="h-7 text-xs"
                          value={wall.thickness || ''}
                          placeholder="Auto"
                          onChange={e => !wall.id.startsWith('temp-') && onUpdateWall(wall.id, { thickness: Number(e.target.value) || undefined })} />
                      </div>
                    </div>

                    {/* Openings */}
                    <div className="space-y-1">
                      {wall.openings.map(op => (
                        <div key={op.id} className="flex items-center gap-2 text-xs bg-background p-1.5 rounded">
                          <DoorOpen className="h-3 w-3 text-muted-foreground" />
                          <span className="flex-1">
                            {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                            {' '}({op.width}×{op.height}m = {(op.width * op.height).toFixed(2)}m²)
                          </span>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive"
                            onClick={() => onDeleteOpening(op.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Add opening */}
                    {!wall.id.startsWith('temp-') && (
                      <div className="flex gap-1 flex-wrap">
                        {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
                          <Button key={key} variant="outline" size="sm" className="text-[10px] h-6"
                            onClick={() => onAddOpening(wall.id, key, preset.width, preset.height)}
                            disabled={saving}>
                            + {preset.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
