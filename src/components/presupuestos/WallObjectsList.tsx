import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Layers, Box, Ruler, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface WallObjectsListProps {
  budgetId: string;
}

interface WallObjectRow {
  id: string;
  wall_id: string;
  layer_order: number;
  name: string;
  description: string | null;
  object_type: string;
  is_core: boolean;
  surface_m2: number | null;
  volume_m3: number | null;
  length_ml: number | null;
  // Joined data
  wall_index: number;
  wall_type: string;
  room_name: string;
  room_id: string;
  section_id: string | null;
}

interface WallInfo {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  room_name: string;
}

const OBJECT_TYPE_LABELS: Record<string, string> = {
  material: 'Material',
  bloque: 'Bloque',
  aislamiento: 'Aislamiento',
  revestimiento: 'Revestimiento',
  estructura: 'Estructura',
  instalacion: 'Instalación',
  otro: 'Otro',
};

const OBJECT_TYPES = [
  { value: 'material', label: 'Material' },
  { value: 'bloque', label: 'Bloque' },
  { value: 'aislamiento', label: 'Aislamiento' },
  { value: 'revestimiento', label: 'Revestimiento' },
  { value: 'estructura', label: 'Estructura' },
  { value: 'instalacion', label: 'Instalación' },
  { value: 'otro', label: 'Otro' },
];

function ObjectRow({ obj }: { obj: WallObjectRow }) {
  return (
    <div className="flex items-start gap-2 p-1.5 rounded border text-xs hover:bg-accent/20 transition-colors">
      <span className="text-muted-foreground font-mono w-4 text-center shrink-0 mt-0.5">{obj.layer_order}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-medium">{obj.name}</span>
          {obj.is_core && (
            <Badge variant="default" className="text-[8px] h-3.5 px-1 gap-0.5">
              <Star className="h-2 w-2" /> Núcleo
            </Badge>
          )}
        </div>
        {obj.description && <p className="text-[9px] text-muted-foreground truncate">{obj.description}</p>}
        <div className="flex gap-1 flex-wrap">
          {obj.surface_m2 != null && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📐 {obj.surface_m2} m²</Badge>}
          {obj.volume_m3 != null && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📦 {obj.volume_m3} m³</Badge>}
          {obj.length_ml != null && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📏 {obj.length_ml} ml</Badge>}
          <Badge variant="outline" className="text-[8px] h-3.5 px-1">P{obj.wall_index} · {obj.room_name}</Badge>
        </div>
      </div>
    </div>
  );
}

/** Inline add object form */
function AddObjectForm({ walls, onSave, onCancel }: {
  walls: WallInfo[];
  onSave: (data: { wall_id: string; name: string; object_type: string; is_core: boolean; layer_order: number; surface_m2: number | null; volume_m3: number | null; length_ml: number | null }) => void;
  onCancel: () => void;
}) {
  const [wallId, setWallId] = useState(walls[0]?.id || '');
  const [name, setName] = useState('');
  const [objectType, setObjectType] = useState('material');
  const [isCore, setIsCore] = useState(false);
  const [layerOrder, setLayerOrder] = useState(1);
  const [surfaceM2, setSurfaceM2] = useState('');
  const [volumeM3, setVolumeM3] = useState('');
  const [lengthMl, setLengthMl] = useState('');

  const selectedWall = walls.find(w => w.id === wallId);

  return (
    <div className="border rounded p-2 space-y-2 bg-accent/10">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Nuevo objeto</p>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="col-span-2">
          <Label className="text-[9px]">Pared</Label>
          <Select value={wallId} onValueChange={setWallId}>
            <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {walls.map(w => (
                <SelectItem key={w.id} value={w.id} className="text-[10px]">
                  {w.room_name} — P{w.wall_index} ({w.wall_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-[9px]">Nombre</Label>
          <Input className="h-6 text-[10px]" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Bloque 20cm" />
        </div>
        <div>
          <Label className="text-[9px]">Tipo</Label>
          <Select value={objectType} onValueChange={setObjectType}>
            <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OBJECT_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-[10px]">{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[9px]">Nº orden</Label>
          <Input className="h-6 text-[10px]" type="number" min={1} value={layerOrder} onChange={e => setLayerOrder(parseInt(e.target.value) || 1)} />
        </div>
        <div className="col-span-2 flex items-center gap-1.5">
          <Checkbox id="add-core" checked={isCore} onCheckedChange={(v) => setIsCore(!!v)} className="h-3 w-3" />
          <Label htmlFor="add-core" className="text-[9px]">Núcleo estructural</Label>
        </div>
        <div>
          <Label className="text-[9px]">m²</Label>
          <Input className="h-6 text-[10px]" type="number" step="0.01" value={surfaceM2} onChange={e => setSurfaceM2(e.target.value)} />
        </div>
        <div>
          <Label className="text-[9px]">m³</Label>
          <Input className="h-6 text-[10px]" type="number" step="0.001" value={volumeM3} onChange={e => setVolumeM3(e.target.value)} />
        </div>
        <div>
          <Label className="text-[9px]">ml</Label>
          <Input className="h-6 text-[10px]" type="number" step="0.01" value={lengthMl} onChange={e => setLengthMl(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-5 text-[9px] gap-0.5" disabled={!name.trim() || !wallId}
          onClick={() => onSave({
            wall_id: wallId,
            name: name.trim(),
            object_type: objectType,
            is_core: isCore,
            layer_order: layerOrder,
            surface_m2: surfaceM2 ? parseFloat(surfaceM2) : null,
            volume_m3: volumeM3 ? parseFloat(volumeM3) : null,
            length_ml: lengthMl ? parseFloat(lengthMl) : null,
          })}>
          <Save className="h-2.5 w-2.5" /> Guardar
        </Button>
      </div>
    </div>
  );
}

export function WallObjectsList({ budgetId }: WallObjectsListProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch all wall objects for this budget through the chain
  const { data: rawObjects = [], isLoading } = useQuery({
    queryKey: ['budget-all-wall-objects', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];

      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, vertical_section_id')
        .eq('floor_plan_id', fp.id);
      if (!rooms || rooms.length === 0) return [];

      const roomMap = new Map(rooms.map(r => [r.id, r]));

      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', rooms.map(r => r.id));
      if (!walls || walls.length === 0) return [];

      const wallMap = new Map(walls.map(w => [w.id, w]));

      const { data: objects } = await supabase
        .from('budget_wall_objects')
        .select('*')
        .in('wall_id', walls.map(w => w.id))
        .order('layer_order', { ascending: true });
      if (!objects) return [];

      return objects.map(obj => {
        const wall = wallMap.get(obj.wall_id);
        const room = wall ? roomMap.get(wall.room_id) : null;
        return {
          ...obj,
          wall_index: wall?.wall_index || 0,
          wall_type: wall?.wall_type || 'exterior',
          room_name: room?.name || '',
          room_id: room?.id || '',
          section_id: room?.vertical_section_id || null,
        } as WallObjectRow;
      });
    },
  });

  // Fetch all walls for the "add" form
  const { data: allWalls = [] } = useQuery({
    queryKey: ['budget-all-walls-for-add', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];
      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name')
        .eq('floor_plan_id', fp.id);
      if (!rooms || rooms.length === 0) return [];
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', rooms.map(r => r.id))
        .order('wall_index', { ascending: true });
      if (!walls) return [];
      const roomMap = new Map(rooms.map(r => [r.id, r]));
      return walls.map(w => ({
        id: w.id,
        room_id: w.room_id,
        wall_index: w.wall_index,
        wall_type: w.wall_type,
        room_name: roomMap.get(w.room_id)?.name || '',
      })) as WallInfo[];
    },
  });

  const handleAddObject = async (data: { wall_id: string; name: string; object_type: string; is_core: boolean; layer_order: number; surface_m2: number | null; volume_m3: number | null; length_ml: number | null }) => {
    const { error } = await supabase.from('budget_wall_objects').insert(data);
    if (error) { toast.error('Error al crear objeto'); return; }
    toast.success('Objeto creado');
    setShowAddForm(false);
    queryClient.invalidateQueries({ queryKey: ['budget-all-wall-objects', budgetId] });
  };

  // Group by workspace (room)
  const byWorkspace = useMemo(() => {
    const groups = new Map<string, { roomId: string; roomName: string; objects: WallObjectRow[]; totalM2: number; totalM3: number; totalMl: number }>();
    for (const obj of rawObjects) {
      const key = obj.room_id;
      if (!groups.has(key)) groups.set(key, { roomId: key, roomName: obj.room_name, objects: [], totalM2: 0, totalM3: 0, totalMl: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
      if (obj.length_ml) g.totalMl += obj.length_ml;
    }
    return Array.from(groups.values()).sort((a, b) => a.roomName.localeCompare(b.roomName, 'es'));
  }, [rawObjects]);

  // Group by section
  const bySection = useMemo(() => {
    const groups = new Map<string, { sectionId: string; objects: WallObjectRow[]; totalM2: number; totalM3: number; totalMl: number }>();
    for (const obj of rawObjects) {
      const key = obj.section_id || 'sin_seccion';
      if (!groups.has(key)) groups.set(key, { sectionId: key, objects: [], totalM2: 0, totalM3: 0, totalMl: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
      if (obj.length_ml) g.totalMl += obj.length_ml;
    }
    return Array.from(groups.values());
  }, [rawObjects]);

  // Group by object name (alphabetical)
  const byObject = useMemo(() => {
    const groups = new Map<string, { objectName: string; objects: WallObjectRow[]; totalM2: number; totalM3: number; totalMl: number }>();
    for (const obj of rawObjects) {
      const key = obj.name.toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, { objectName: obj.name, objects: [], totalM2: 0, totalM3: 0, totalMl: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
      if (obj.length_ml) g.totalMl += obj.length_ml;
    }
    return Array.from(groups.values()).sort((a, b) => a.objectName.localeCompare(b.objectName, 'es'));
  }, [rawObjects]);

  // Totals
  const totalM2 = rawObjects.reduce((s, o) => s + (o.surface_m2 || 0), 0);
  const totalM3 = rawObjects.reduce((s, o) => s + (o.volume_m3 || 0), 0);
  const totalMl = rawObjects.reduce((s, o) => s + (o.length_ml || 0), 0);

  const addButton = (
    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowAddForm(true)} disabled={allWalls.length === 0}>
      <Plus className="h-3 w-3" /> Añadir objeto
    </Button>
  );

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Cargando objetos...</p>;

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <Box className="h-3 w-3" /> {rawObjects.length} objetos
        </Badge>
        {totalM2 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📐 {totalM2.toFixed(2)} m² total</Badge>}
        {totalM3 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📦 {totalM3.toFixed(3)} m³ total</Badge>}
        {totalMl > 0 && <Badge variant="secondary" className="text-[10px] h-5">📏 {totalMl.toFixed(2)} ml total</Badge>}
      </div>

      {showAddForm && allWalls.length > 0 && (
        <AddObjectForm walls={allWalls} onSave={handleAddObject} onCancel={() => setShowAddForm(false)} />
      )}

      {rawObjects.length === 0 && !showAddForm && (
        <div className="text-center py-6 text-muted-foreground">
          <Box className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">No hay objetos definidos en las paredes</p>
          <p className="text-[10px] mb-2">Añade objetos/capas desde el editor de cada pared o desde aquí</p>
          {addButton}
        </div>
      )}

      {(rawObjects.length > 0 || showAddForm) && (
        <Tabs defaultValue="espacio" className="w-full">
          <TabsList className="h-7">
            <TabsTrigger value="espacio" className="text-[10px] h-6 gap-1">
              <Layers className="h-3 w-3" /> Por espacio
            </TabsTrigger>
            <TabsTrigger value="seccion" className="text-[10px] h-6 gap-1">
              <Box className="h-3 w-3" /> Por sección
            </TabsTrigger>
            <TabsTrigger value="objeto" className="text-[10px] h-6 gap-1">
              <Ruler className="h-3 w-3" /> Por objeto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="espacio" className="space-y-2 mt-2">
            {!showAddForm && addButton}
            {byWorkspace.map(group => (
              <div key={group.roomId} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{group.roomName}</span>
                  <Badge variant="outline" className="text-[9px] h-4">{group.objects.length}</Badge>
                  {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
                  {group.totalM3 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📦 {group.totalM3.toFixed(3)} m³</Badge>}
                  {group.totalMl > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📏 {group.totalMl.toFixed(2)} ml</Badge>}
                </div>
                {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="seccion" className="space-y-2 mt-2">
            {!showAddForm && addButton}
            {bySection.map(group => (
              <div key={group.sectionId} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">
                    {group.sectionId === 'sin_seccion' ? 'Sin sección asignada' : `Sección ${group.sectionId.slice(0, 8)}…`}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4">{group.objects.length} obj.</Badge>
                  {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
                  {group.totalM3 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📦 {group.totalM3.toFixed(3)} m³</Badge>}
                  {group.totalMl > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📏 {group.totalMl.toFixed(2)} ml</Badge>}
                </div>
                {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="objeto" className="space-y-2 mt-2">
            {!showAddForm && addButton}
            {byObject.map(group => (
              <div key={group.objectName} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{group.objectName}</span>
                  <Badge variant="outline" className="text-[9px] h-4">{group.objects.length} uds.</Badge>
                  {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
                  {group.totalM3 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📦 {group.totalM3.toFixed(3)} m³</Badge>}
                  {group.totalMl > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📏 {group.totalMl.toFixed(2)} ml</Badge>}
                </div>
                {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
