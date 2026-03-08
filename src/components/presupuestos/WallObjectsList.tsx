import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Layers, Box, Ruler } from 'lucide-react';

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

const OBJECT_TYPE_LABELS: Record<string, string> = {
  material: 'Material',
  bloque: 'Bloque',
  aislamiento: 'Aislamiento',
  revestimiento: 'Revestimiento',
  estructura: 'Estructura',
  instalacion: 'Instalación',
  otro: 'Otro',
};

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

export function WallObjectsList({ budgetId }: WallObjectsListProps) {
  // Fetch all wall objects for this budget through the chain
  const { data: rawObjects = [], isLoading } = useQuery({
    queryKey: ['budget-all-wall-objects', budgetId],
    queryFn: async () => {
      // Get floor plan
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];

      // Get all rooms
      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, vertical_section_id')
        .eq('floor_plan_id', fp.id);
      if (!rooms || rooms.length === 0) return [];

      const roomMap = new Map(rooms.map(r => [r.id, r]));

      // Get all walls
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', rooms.map(r => r.id));
      if (!walls || walls.length === 0) return [];

      const wallMap = new Map(walls.map(w => [w.id, w]));

      // Get all objects
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

  // Group by type
  const byType = useMemo(() => {
    const groups = new Map<string, { objects: WallObjectRow[]; totalM2: number; totalM3: number; totalMl: number }>();
    for (const obj of rawObjects) {
      const key = obj.object_type || 'otro';
      if (!groups.has(key)) groups.set(key, { objects: [], totalM2: 0, totalM3: 0, totalMl: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
      if (obj.length_ml) g.totalMl += obj.length_ml;
    }
    return Array.from(groups.entries()).map(([type, data]) => ({ type, label: OBJECT_TYPE_LABELS[type] || type, ...data }));
  }, [rawObjects]);

  // Group by wall (room + wall_index)
  const byWall = useMemo(() => {
    const groups = new Map<string, { wallKey: string; roomName: string; wallIndex: number; wallType: string; objects: WallObjectRow[]; totalM2: number; totalM3: number }>();
    for (const obj of rawObjects) {
      const key = `${obj.room_id}_${obj.wall_index}`;
      if (!groups.has(key)) groups.set(key, { wallKey: key, roomName: obj.room_name, wallIndex: obj.wall_index, wallType: obj.wall_type, objects: [], totalM2: 0, totalM3: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
    }
    return Array.from(groups.values()).sort((a, b) => a.roomName.localeCompare(b.roomName, 'es'));
  }, [rawObjects]);

  // Group by section
  const bySection = useMemo(() => {
    const groups = new Map<string, { sectionId: string; objects: WallObjectRow[]; totalM2: number; totalM3: number }>();
    for (const obj of rawObjects) {
      const key = obj.section_id || 'sin_seccion';
      if (!groups.has(key)) groups.set(key, { sectionId: key, objects: [], totalM2: 0, totalM3: 0 });
      const g = groups.get(key)!;
      g.objects.push(obj);
      if (obj.surface_m2) g.totalM2 += obj.surface_m2;
      if (obj.volume_m3) g.totalM3 += obj.volume_m3;
    }
    return Array.from(groups.values());
  }, [rawObjects]);

  // Totals
  const totalM2 = rawObjects.reduce((s, o) => s + (o.surface_m2 || 0), 0);
  const totalM3 = rawObjects.reduce((s, o) => s + (o.volume_m3 || 0), 0);
  const totalMl = rawObjects.reduce((s, o) => s + (o.length_ml || 0), 0);

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Cargando objetos...</p>;

  if (rawObjects.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Box className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">No hay objetos definidos en las paredes</p>
        <p className="text-[10px]">Añade objetos/capas desde el editor de cada pared</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <Box className="h-3 w-3" /> {rawObjects.length} objetos
        </Badge>
        {totalM2 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📐 {totalM2.toFixed(2)} m² total</Badge>}
        {totalM3 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📦 {totalM3.toFixed(3)} m³ total</Badge>}
        {totalMl > 0 && <Badge variant="secondary" className="text-[10px] h-5">📏 {totalMl.toFixed(2)} ml total</Badge>}
      </div>

      <Tabs defaultValue="tipo" className="w-full">
        <TabsList className="h-7">
          <TabsTrigger value="tipo" className="text-[10px] h-6 gap-1">
            <Layers className="h-3 w-3" /> Por tipo
          </TabsTrigger>
          <TabsTrigger value="pared" className="text-[10px] h-6 gap-1">
            <Ruler className="h-3 w-3" /> Por pared
          </TabsTrigger>
          <TabsTrigger value="seccion" className="text-[10px] h-6 gap-1">
            <Box className="h-3 w-3" /> Por sección
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tipo" className="space-y-2 mt-2">
          {byType.map(group => (
            <div key={group.type} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">{group.label}</span>
                <Badge variant="outline" className="text-[9px] h-4">{group.objects.length}</Badge>
                {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
                {group.totalM3 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📦 {group.totalM3.toFixed(3)} m³</Badge>}
                {group.totalMl > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📏 {group.totalMl.toFixed(2)} ml</Badge>}
              </div>
              {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="pared" className="space-y-2 mt-2">
          {byWall.map(group => (
            <div key={group.wallKey} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">{group.roomName} — P{group.wallIndex}</span>
                <Badge variant="outline" className="text-[9px] h-4">{group.wallType}</Badge>
                <Badge variant="outline" className="text-[9px] h-4">{group.objects.length} obj.</Badge>
                {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
              </div>
              {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="seccion" className="space-y-2 mt-2">
          {bySection.map(group => (
            <div key={group.sectionId} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">
                  {group.sectionId === 'sin_seccion' ? 'Sin sección asignada' : `Sección ${group.sectionId.slice(0, 8)}…`}
                </span>
                <Badge variant="outline" className="text-[9px] h-4">{group.objects.length} obj.</Badge>
                {group.totalM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {group.totalM2.toFixed(2)} m²</Badge>}
              </div>
              {group.objects.map(obj => <ObjectRow key={obj.id} obj={obj} />)}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
