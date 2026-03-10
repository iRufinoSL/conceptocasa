import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Box, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'interior_invisible', label: 'Int. invisible' },
];

const FLOOR_CEILING_TYPES = [
  { value: 'normal', label: 'Normal' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'shared', label: 'Compartido' },
];

function normalizeWallType(type?: string | null): string {
  switch (type) {
    case 'external': return 'exterior';
    case 'internal': return 'interior';
    case 'shared': return 'interior_compartida';
    case 'invisible': return 'exterior_invisible';
    default: return type || 'exterior';
  }
}

interface WallRecord {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  height: number | null;
}

interface WorkspacePropertiesPanelProps {
  workspaceId: string;
  workspaceName: string;
  sectionType: string;
  sectionName: string;
  onClose: () => void;
}

export function WorkspacePropertiesPanel({ workspaceId, workspaceName, sectionType, sectionName, onClose }: WorkspacePropertiesPanelProps) {
  const [walls, setWalls] = useState<WallRecord[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomRes, wallsRes] = await Promise.all([
      supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle(),
      supabase.from('budget_floor_plan_walls').select('*').eq('room_id', workspaceId).order('wall_index'),
    ]);
    setRoom(roomRes.data);
    setWalls((wallsRes.data || []) as WallRecord[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getFloorType = () => {
    if (!room) return 'normal';
    if (!room.has_floor) return 'invisible';
    return 'normal';
  };

  const getCeilingType = () => {
    if (!room) return 'normal';
    if (room.has_roof) return 'normal';
    if (!room.has_ceiling) return 'invisible';
    return 'normal';
  };

  const updateFloorCeiling = async (field: 'has_floor' | 'has_ceiling', value: string) => {
    const boolVal = value !== 'invisible';
    await supabase.from('budget_floor_plan_rooms').update({ [field]: boolVal }).eq('id', workspaceId);
    setRoom((prev: any) => prev ? { ...prev, [field]: boolVal } : prev);
    toast.success('Actualizado');
  };

  const ensureAndUpdateWallType = async (wallIndex: number, newType: string) => {
    const normalized = normalizeWallType(newType);
    const dbWallIndex = wallIndex + 1;
    const existingWall = walls.find(w => w.wall_index === dbWallIndex);
    if (existingWall) {
      await supabase.from('budget_floor_plan_walls').update({ wall_type: normalized }).eq('id', existingWall.id);
      setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, wall_type: normalized } : w));
    } else {
      const { data } = await supabase.from('budget_floor_plan_walls').insert({
        room_id: workspaceId,
        wall_index: dbWallIndex,
        wall_type: normalized,
      }).select().single();
      if (data) setWalls(prev => [...prev, data as WallRecord]);
    }
    toast.success(`Pared ${dbWallIndex} actualizada`);
  };

  const poly = room?.floor_polygon as Array<{ x: number; y: number }> | null;
  const edgeCount = poly ? poly.length : (room ? 4 : 0);

  let area = 0;
  if (poly && poly.length >= 3) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    area = Math.abs(area) / 2;
  }

  const sectionLabel = sectionType === 'vertical' ? 'Z' : sectionType === 'longitudinal' ? 'Y' : sectionType === 'transversal' ? 'X' : 'I';

  return (
    <div className="absolute right-2 top-2 z-50 w-64 bg-card border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-1.5 min-w-0">
          <Box className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold truncate">{workspaceName}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Section info */}
      <div className="px-3 py-1.5 border-b bg-muted/20">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            <Layers className="h-2.5 w-2.5 mr-0.5" /> Sección {sectionLabel}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{sectionName}</span>
        </div>
        {room && (
          <div className="flex flex-wrap gap-1 mt-1">
            {area > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">📐 {area.toFixed(2)} u²</Badge>}
            <Badge variant="outline" className="text-[9px] h-4 px-1">{edgeCount} aristas · {edgeCount + 2} caras</Badge>
            {room.height != null && room.height > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">Z {room.height}m</Badge>
            )}
          </div>
        )}
      </div>

      {/* Faces */}
      {loading ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">Cargando...</div>
      ) : (
        <div className="px-2 py-2 space-y-0.5 max-h-[50vh] overflow-y-auto">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1 mb-1">Caras del volumen</p>

          {/* Floor */}
          <FaceRow
            label="🟫 Suelo"
            type={getFloorType()}
            options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_floor', v)}
          />

          {/* Walls */}
          {Array.from({ length: edgeCount }).map((_, i) => {
            const wall = walls.find(w => w.wall_index === i + 1);
            return (
              <FaceRow
                key={i}
                label={`🧱 P${i + 1}`}
                type={normalizeWallType(wall?.wall_type)}
                options={WALL_TYPES}
                onChange={(v) => ensureAndUpdateWallType(i, v)}
              />
            );
          })}

          {/* Ceiling */}
          <FaceRow
            label={room?.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'}
            type={getCeilingType()}
            options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_ceiling', v)}
          />

          {/* Interior space */}
          <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded">
            <span className="text-xs">🔷 Espacio</span>
            <Badge variant="outline" className="text-[9px] h-4">Vol. interior</Badge>
          </div>
        </div>
      )}
    </div>
  );
}

function FaceRow({ label, type, options, onChange }: {
  label: string;
  type: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded hover:bg-accent/30">
      <span className="text-xs flex-shrink-0">{label}</span>
      <Select value={type} onValueChange={onChange}>
        <SelectTrigger className="h-6 w-[110px] text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
