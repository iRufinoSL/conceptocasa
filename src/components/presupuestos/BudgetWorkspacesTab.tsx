import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Box, Pencil, Trash2, Plus, ChevronDown, ChevronRight, Triangle, Pyramid, Cuboid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { toast } from 'sonner';

interface BudgetWorkspacesTabProps {
  budgetId: string;
  isAdmin: boolean;
}

interface Workspace {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number | null;
  has_floor: boolean;
  has_ceiling: boolean;
  has_roof: boolean;
}

interface WallData {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
}

type GeometryType = 'cube' | 'prism' | 'pyramid';
type FloorCeilingType = 'normal' | 'invisible' | 'shared';

const WALL_TYPES = [
  { value: 'external', label: 'Externa' },
  { value: 'internal', label: 'Interna' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'external_shared', label: 'Ext. compartida' },
  { value: 'internal_shared', label: 'Int. compartida' },
];

const FLOOR_CEILING_TYPES: { value: FloorCeilingType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'shared', label: 'Compartido' },
];

const WALL_LABELS = ['Superior', 'Derecha', 'Inferior', 'Izquierda'];

const GEOMETRY_INFO: Record<GeometryType, { label: string; vertices: number; description: string }> = {
  cube: { label: 'Cubo', vertices: 8, description: '6 caras — forma estándar' },
  prism: { label: 'Prisma', vertices: 6, description: 'Tejado a dos aguas' },
  pyramid: { label: 'Pirámide', vertices: 5, description: 'Punta central' },
};

function getGeometryType(room: Workspace): GeometryType {
  if (room.has_roof) return 'prism';
  return 'cube';
}

function getFloorType(room: Workspace): FloorCeilingType {
  if (!room.has_floor) return 'invisible';
  return 'normal';
}

function getCeilingType(room: Workspace): FloorCeilingType {
  if (room.has_roof) return 'normal';
  if (!room.has_ceiling) return 'invisible';
  return 'normal';
}

function GeometryIcon({ type }: { type: GeometryType }) {
  switch (type) {
    case 'prism': return <Triangle className="h-3.5 w-3.5" />;
    case 'pyramid': return <Pyramid className="h-3.5 w-3.5" />;
    default: return <Cuboid className="h-3.5 w-3.5" />;
  }
}

export function BudgetWorkspacesTab({ budgetId, isAdmin }: BudgetWorkspacesTabProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', length: '', width: '', height: '' });

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan-for-workspaces', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plans')
        .select('id, default_height')
        .eq('budget_id', budgetId)
        .maybeSingle();
      return data;
    },
  });

  const { data: rooms = [], refetch } = useQuery({
    queryKey: ['workspace-rooms', floorPlan?.id],
    enabled: !!floorPlan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, length, width, height, has_floor, has_ceiling, has_roof')
        .eq('floor_plan_id', floorPlan!.id)
        .order('name', { ascending: true });
      return (data || []) as Workspace[];
    },
  });

  const roomIds = rooms.map(r => r.id);
  const { data: allWalls = [] } = useQuery({
    queryKey: ['workspace-walls', roomIds],
    enabled: roomIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', roomIds)
        .order('wall_index', { ascending: true });
      return (data || []) as WallData[];
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setForm({ name: '', length: '', width: '', height: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !floorPlan?.id) return;
    const payload = {
      name: form.name.trim(),
      length: parseFloat(form.length) || 0,
      width: parseFloat(form.width) || 0,
      height: parseFloat(form.height) || 0,
      floor_plan_id: floorPlan.id,
    };

    if (editingId) {
      const { error } = await supabase.from('budget_floor_plan_rooms').update(payload).eq('id', editingId);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Espacio actualizado');
    } else {
      const { data: newRoom, error } = await supabase
        .from('budget_floor_plan_rooms')
        .insert(payload)
        .select('id')
        .single();
      if (error || !newRoom) { toast.error('Error al crear'); return; }
      // Create default 4 walls
      const defaultWalls = WALL_LABELS.map((_, i) => ({
        room_id: newRoom.id,
        wall_index: i,
        wall_type: 'external',
      }));
      await supabase.from('budget_floor_plan_walls').insert(defaultWalls);
      toast.success('Espacio creado con 4 paredes');
    }
    resetForm();
    refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  const handleEdit = (r: Workspace) => {
    setForm({ name: r.name, length: String(r.length), width: String(r.width), height: String(r.height || '') });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('budget_floor_plan_rooms').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Espacio eliminado');
    refetch();
  };

  const updateWallType = async (wallId: string, newType: string) => {
    const { error } = await supabase.from('budget_floor_plan_walls').update({ wall_type: newType }).eq('id', wallId);
    if (error) { toast.error('Error al actualizar tipo de pared'); return; }
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  const updateFloorCeiling = async (roomId: string, field: 'has_floor' | 'has_ceiling', value: FloorCeilingType) => {
    const boolVal = value !== 'invisible';
    const { error } = await supabase.from('budget_floor_plan_rooms').update({ [field]: boolVal }).eq('id', roomId);
    if (error) { toast.error('Error al actualizar'); return; }
    refetch();
  };

  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Espacios de trabajo</h3>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Nombre</Label>
              <Input className="h-7 text-xs" placeholder="Ej: Cocina" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Largo X (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="4" value={form.length} onChange={e => setForm(f => ({ ...f, length: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Ancho Y (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="3" value={form.width} onChange={e => setForm(f => ({ ...f, width: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Alto Z (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="3" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground text-center py-4">No hay espacios de trabajo definidos</p>
      )}

      <div className="space-y-1.5">
        {sorted.map(r => {
          const area = r.length * r.width;
          const vol = r.height ? r.length * r.width * r.height : null;
          const geo = getGeometryType(r);
          const geoInfo = GEOMETRY_INFO[geo];
          const isExpanded = expandedIds.has(r.id);
          const roomWalls = allWalls.filter(w => w.room_id === r.id).sort((a, b) => a.wall_index - b.wall_index);
          const floorType = getFloorType(r);
          const ceilingType = getCeilingType(r);

          return (
            <div key={r.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggleExpand(r.id)}
                className="flex items-center gap-2 p-2.5 w-full text-left hover:bg-accent/30 transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <GeometryIcon type={geo} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{r.name}</span>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">X {r.length}m</Badge>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">Y {r.width}m</Badge>
                    {r.height != null && r.height > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">Z {r.height}m</Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">📐 {area.toFixed(2)} m²</Badge>
                    {vol != null && vol > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">📦 {vol.toFixed(2)} m³</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
                      {geoInfo.label} ({geoInfo.vertices}v)
                    </Badge>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(r)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </button>

              {/* Expanded: Faces detail */}
              {isExpanded && (
                <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Caras del volumen — {geoInfo.description}
                  </p>

                  {/* Floor */}
                  <FaceRow
                    label="🟫 Suelo"
                    type={floorType}
                    options={FLOOR_CEILING_TYPES}
                    isAdmin={isAdmin}
                    onChange={(v) => updateFloorCeiling(r.id, 'has_floor', v as FloorCeilingType)}
                  />

                  {/* 4 Walls */}
                  {WALL_LABELS.map((label, i) => {
                    const wall = roomWalls.find(w => w.wall_index === i);
                    return (
                      <FaceRow
                        key={i}
                        label={`🧱 Pared ${label}`}
                        type={wall?.wall_type || 'external'}
                        options={WALL_TYPES}
                        isAdmin={isAdmin}
                        onChange={(v) => wall && updateWallType(wall.id, v)}
                      />
                    );
                  })}

                  {/* Ceiling/Roof */}
                  <FaceRow
                    label={r.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'}
                    type={ceilingType}
                    options={FLOOR_CEILING_TYPES}
                    isAdmin={isAdmin}
                    onChange={(v) => updateFloorCeiling(r.id, 'has_ceiling', v as FloorCeilingType)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaceRow({
  label,
  type,
  options,
  isAdmin,
  onChange,
}: {
  label: string;
  type: string;
  options: { value: string; label: string }[];
  isAdmin: boolean;
  onChange: (value: string) => void;
}) {
  const current = options.find(o => o.value === type);
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs">{label}</span>
      {isAdmin ? (
        <Select value={type} onValueChange={onChange}>
          <SelectTrigger className="h-6 w-[140px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="text-[10px] h-5">{current?.label || type}</Badge>
      )}
    </div>
  );
}
