import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, List, Search, Plus, Box } from 'lucide-react';

interface WallObjectsListProps {
  budgetId: string;
}

interface PolygonVertex { x: number; y: number }

/** Shoelace formula */
function polygonArea(vertices: PolygonVertex[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function edgeLength(a: PolygonVertex, b: PolygonVertex): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

interface AutoFace {
  workspace: string;
  faceName: string; // Suelo, Pared 1, ..., Techo, Espacio
  m2: number | null;
  m3: number | null;
  sortKey: number; // 0=suelo, 1..N=paredes, N+1=techo, N+2=espacio
}

export function WallObjectsList({ budgetId }: WallObjectsListProps) {
  const [search, setSearch] = useState('');

  // Fetch rooms + floor plan data to auto-compute surfaces
  const { data: autoFaces = [], isLoading } = useQuery({
    queryKey: ['budget-auto-faces', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id, scale_mode, block_length_mm')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];

      const cellSizeM = fp.scale_mode === 'bloque' ? (fp.block_length_mm || 625) / 1000 : 1;

      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, length, width, height, floor_polygon, is_base, has_floor, has_ceiling')
        .eq('floor_plan_id', fp.id)
        .order('name', { ascending: true });
      if (!rooms) return [];

      const faces: AutoFace[] = [];

      for (const room of rooms) {
        if (room.is_base) continue; // skip perimeter polygons

        const poly = Array.isArray(room.floor_polygon) ? (room.floor_polygon as PolygonVertex[]) : null;
        const heightM = room.height || 2.5;

        // Floor area
        let floorArea: number;
        if (poly && poly.length >= 3) {
          floorArea = polygonArea(poly) * cellSizeM * cellSizeM;
        } else {
          floorArea = (room.length || 0) * (room.width || 0);
        }

        // Suelo
        faces.push({ workspace: room.name, faceName: 'Suelo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: 0 });

        // Walls
        const edgeCount = poly && poly.length >= 3 ? poly.length : 4;
        for (let i = 0; i < edgeCount; i++) {
          let wallLengthM: number;
          if (poly && poly.length >= 3) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            wallLengthM = edgeLength(a, b) * cellSizeM;
          } else {
            // Rectangular fallback
            wallLengthM = i % 2 === 0 ? (room.length || 0) : (room.width || 0);
          }
          const wallArea = Math.round(wallLengthM * heightM * 100) / 100;
          faces.push({ workspace: room.name, faceName: `Pared ${i + 1}`, m2: wallArea, m3: null, sortKey: i + 1 });
        }

        // Techo
        faces.push({ workspace: room.name, faceName: 'Techo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: edgeCount + 1 });

        // Espacio (volumen)
        const vol = Math.round(floorArea * heightM * 1000) / 1000;
        faces.push({ workspace: room.name, faceName: 'Espacio', m2: null, m3: vol, sortKey: edgeCount + 2 });
      }

      return faces;
    },
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return autoFaces;
    const q = search.toLowerCase();
    return autoFaces.filter(f =>
      f.workspace.toLowerCase().includes(q) || f.faceName.toLowerCase().includes(q)
    );
  }, [autoFaces, search]);

  // View: By workspace
  const byWorkspace = useMemo(() => {
    const groups = new Map<string, AutoFace[]>();
    for (const f of filtered) {
      if (!groups.has(f.workspace)) groups.set(f.workspace, []);
      groups.get(f.workspace)!.push(f);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, faces]) => ({ name, faces: faces.sort((a, b) => a.sortKey - b.sortKey) }));
  }, [filtered]);

  // View: Alphabetical by face
  const alphabetical = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const cmp = a.faceName.localeCompare(b.faceName, 'es');
      return cmp !== 0 ? cmp : a.workspace.localeCompare(b.workspace, 'es');
    });
  }, [filtered]);

  // Totals
  const totalM2 = filtered.reduce((s, f) => s + (f.m2 || 0), 0);
  const totalM3 = filtered.reduce((s, f) => s + (f.m3 || 0), 0);
  const workspaceCount = new Set(filtered.map(f => f.workspace)).size;

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Cargando objetos...</p>;

  if (autoFaces.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Box className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">No hay Espacios de trabajo definidos</p>
        <p className="text-[10px]">Crea espacios en la cuadrícula para ver su desglose automático</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <Layers className="h-3 w-3" /> {workspaceCount} espacios
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <Box className="h-3 w-3" /> {autoFaces.length} ámbitos
        </Badge>
        {totalM2 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📐 {totalM2.toFixed(2)} m²</Badge>}
        {totalM3 > 0 && <Badge variant="secondary" className="text-[10px] h-5">📦 {totalM3.toFixed(3)} m³</Badge>}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="h-7 text-[11px] pl-7"
          placeholder="Buscar espacio o ámbito..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="workspace" className="w-full">
        <TabsList className="h-7">
          <TabsTrigger value="workspace" className="text-[10px] h-6 gap-1">
            <Layers className="h-3 w-3" /> Por espacio
          </TabsTrigger>
          <TabsTrigger value="alpha" className="text-[10px] h-6 gap-1">
            <List className="h-3 w-3" /> Alfabético
          </TabsTrigger>
        </TabsList>

        {/* By Workspace */}
        <TabsContent value="workspace" className="space-y-2 mt-2">
          {byWorkspace.map(group => {
            const groupM2 = group.faces.reduce((s, f) => s + (f.m2 || 0), 0);
            const groupM3 = group.faces.reduce((s, f) => s + (f.m3 || 0), 0);
            return (
              <div key={group.name} className="space-y-0.5">
                <div className="flex items-center gap-1.5 bg-accent/30 rounded px-1.5 py-0.5">
                  <span className="text-xs font-semibold">{group.name}</span>
                  <Badge variant="outline" className="text-[9px] h-4">{group.faces.length} ámbitos</Badge>
                  {groupM2 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📐 {groupM2.toFixed(2)} m²</Badge>}
                  {groupM3 > 0 && <Badge variant="secondary" className="text-[8px] h-3.5">📦 {groupM3.toFixed(3)} m³</Badge>}
                </div>
                {group.faces.map((f, i) => (
                  <FaceRow key={`${f.faceName}-${i}`} face={f} showWorkspace={false} />
                ))}
              </div>
            );
          })}
        </TabsContent>

        {/* Alphabetical */}
        <TabsContent value="alpha" className="mt-2">
          <div className="border rounded overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Ámbito</span>
              <span>Espacio</span>
              <span className="text-right w-20">Medición</span>
            </div>
            {alphabetical.map((f, i) => (
              <div key={`${f.faceName}-${f.workspace}-${i}`} className="grid grid-cols-[1fr_1fr_auto] gap-1 px-2 py-1 text-xs border-t hover:bg-accent/20 transition-colors">
                <span className="font-medium">
                  {f.faceName === 'Espacio' ? '🔷 ' : f.faceName === 'Suelo' ? '⬛ ' : f.faceName === 'Techo' ? '⬜ ' : '🧱 '}
                  {f.faceName}
                </span>
                <span className="text-muted-foreground">{f.workspace}</span>
                <span className="text-right w-20 tabular-nums">
                  {f.m2 != null && `${f.m2.toFixed(2)} m²`}
                  {f.m3 != null && `${f.m3.toFixed(3)} m³`}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FaceRow({ face, showWorkspace = true }: { face: AutoFace; showWorkspace?: boolean }) {
  const icon = face.faceName === 'Espacio' ? '🔷' : face.faceName === 'Suelo' ? '⬛' : face.faceName === 'Techo' ? '⬜' : '🧱';
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-xs hover:bg-accent/20 transition-colors rounded">
      <span className="text-[10px]">{icon}</span>
      <span className="font-medium flex-1">{face.faceName}</span>
      {showWorkspace && <span className="text-muted-foreground text-[10px]">{face.workspace}</span>}
      {face.m2 != null && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 tabular-nums">📐 {face.m2.toFixed(2)} m²</Badge>}
      {face.m3 != null && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 tabular-nums">📦 {face.m3.toFixed(3)} m³</Badge>}
    </div>
  );
}
