import { useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Layers, List, Search, Box, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WallObjectsPanel } from './WallObjectsPanel';
import { toast } from 'sonner';

interface WallObjectsListProps {
  budgetId: string;
}

interface PolygonVertex { x: number; y: number }

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
  roomId: string;
  faceName: string;
  m2: number | null;
  m3: number | null;
  sortKey: number;
  wallIndex: number; // 0=espacio, -1=suelo, -2=techo, 1..N=paredes
}

export function WallObjectsList({ budgetId }: WallObjectsListProps) {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWallId, setPanelWallId] = useState<string | null>(null);
  const [panelWallIndex, setPanelWallIndex] = useState(0);
  const [panelWallType, setPanelWallType] = useState('exterior');
  const [panelWallLabel, setPanelWallLabel] = useState('');
  const [panelRoomName, setPanelRoomName] = useState('');

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
        if (room.is_base) continue;

        const poly = Array.isArray(room.floor_polygon) ? (room.floor_polygon as unknown as PolygonVertex[]) : null;
        const heightM = room.height || 2.5;

        let floorArea: number;
        if (poly && poly.length >= 3) {
          floorArea = polygonArea(poly) * cellSizeM * cellSizeM;
        } else {
          floorArea = (room.length || 0) * (room.width || 0);
        }

        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Suelo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: 0, wallIndex: -1 });

        const edgeCount = poly && poly.length >= 3 ? poly.length : 4;
        for (let i = 0; i < edgeCount; i++) {
          let wallLengthM: number;
          if (poly && poly.length >= 3) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            wallLengthM = edgeLength(a, b) * cellSizeM;
          } else {
            wallLengthM = i % 2 === 0 ? (room.length || 0) : (room.width || 0);
          }
          const wallArea = Math.round(wallLengthM * heightM * 100) / 100;
          faces.push({ workspace: room.name, roomId: room.id, faceName: `Pared ${i + 1}`, m2: wallArea, m3: null, sortKey: i + 1, wallIndex: i + 1 });
        }

        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Techo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: edgeCount + 1, wallIndex: -2 });

        const vol = Math.round(floorArea * heightM * 1000) / 1000;
        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Espacio', m2: null, m3: vol, sortKey: edgeCount + 2, wallIndex: 0 });
      }

      return faces;
    },
  });

  // Fetch walls for panel opening
  const { data: allWalls = [] } = useQuery({
    queryKey: ['budget-walls-for-panel', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];
      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id')
        .eq('floor_plan_id', fp.id);
      if (!rooms?.length) return [];
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', rooms.map(r => r.id));
      return walls || [];
    },
  });

  const handleFaceClick = async (face: AutoFace) => {
    // Find or create the wall record for this face
    let wall = allWalls.find(w => w.room_id === face.roomId && w.wall_index === face.wallIndex);
    if (!wall) {
      const wallType = face.wallIndex === 0 ? 'espacio' : face.wallIndex === -1 ? 'suelo' : face.wallIndex === -2 ? 'techo' : 'exterior';
      const { data: newWall, error } = await supabase
        .from('budget_floor_plan_walls')
        .insert({ room_id: face.roomId, wall_index: face.wallIndex, wall_type: wallType })
        .select()
        .single();
      if (error || !newWall) {
        toast.error('Error al abrir el ámbito');
        return;
      }
      wall = newWall;
    }
    setPanelWallId(wall.id);
    setPanelWallIndex(face.wallIndex);
    setPanelWallType(wall.wall_type);
    setPanelWallLabel(face.faceName);
    setPanelRoomName(face.workspace);
    setPanelOpen(true);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return autoFaces;
    const q = search.toLowerCase();
    return autoFaces.filter(f =>
      f.workspace.toLowerCase().includes(q) || f.faceName.toLowerCase().includes(q)
    );
  }, [autoFaces, search]);

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

  const alphabetical = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const cmp = a.faceName.localeCompare(b.faceName, 'es');
      return cmp !== 0 ? cmp : a.workspace.localeCompare(b.workspace, 'es');
    });
  }, [filtered]);

  const totalM2 = filtered.reduce((s, f) => s + (f.m2 || 0), 0);
  const totalM3 = filtered.reduce((s, f) => s + (f.m3 || 0), 0);
  const workspaceCount = new Set(filtered.map(f => f.workspace)).size;

  const toggleGroup = (name: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-2">Cargando objetos...</p>;

  if (autoFaces.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Box className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay Espacios de trabajo definidos</p>
        <p className="text-xs">Crea espacios en la cuadrícula para ver su desglose automático</p>
      </div>
    );
  }

  const faceIcon = (name: string) =>
    name === 'Espacio' ? '🔷' : name === 'Suelo' ? '⬛' : name === 'Techo' ? '⬜' : '🧱';

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant="secondary" className="text-xs h-6 gap-1">
          <Layers className="h-3.5 w-3.5" /> {workspaceCount} espacios
        </Badge>
        <Badge variant="secondary" className="text-xs h-6 gap-1">
          <Box className="h-3.5 w-3.5" /> {autoFaces.length} ámbitos
        </Badge>
        {totalM2 > 0 && <Badge variant="secondary" className="text-xs h-6">📐 {totalM2.toFixed(2)} m²</Badge>}
        {totalM3 > 0 && <Badge variant="secondary" className="text-xs h-6">📦 {totalM3.toFixed(3)} m³</Badge>}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-9 text-sm pl-8"
          placeholder="Buscar espacio o ámbito..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="workspace" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="workspace" className="text-xs h-7 gap-1">
            <Layers className="h-3.5 w-3.5" /> Por espacio
          </TabsTrigger>
          <TabsTrigger value="alpha" className="text-xs h-7 gap-1">
            <List className="h-3.5 w-3.5" /> Alfabético
          </TabsTrigger>
        </TabsList>

        {/* By Workspace — collapsible */}
        <TabsContent value="workspace" className="space-y-1.5 mt-2">
          {byWorkspace.map(group => {
            const groupM2 = group.faces.reduce((s, f) => s + (f.m2 || 0), 0);
            const groupM3 = group.faces.reduce((s, f) => s + (f.m3 || 0), 0);
            const isOpen = openGroups.has(group.name);
            return (
              <Collapsible key={group.name} open={isOpen} onOpenChange={() => toggleGroup(group.name)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 bg-accent/30 hover:bg-accent/50 transition-colors text-left">
                  <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')} />
                  <span className="text-sm font-semibold flex-1">{group.name}</span>
                  <Badge variant="outline" className="text-[10px] h-5">{group.faces.length}</Badge>
                  {groupM2 > 0 && <span className="text-xs text-muted-foreground tabular-nums">{groupM2.toFixed(2)} m²</span>}
                  {groupM3 > 0 && <span className="text-xs text-muted-foreground tabular-nums">{groupM3.toFixed(3)} m³</span>}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="max-w-md ml-6 mt-1 space-y-px">
                    {group.faces.map((f, i) => (
                      <button
                        key={`${f.faceName}-${i}`}
                        onClick={() => handleFaceClick(f)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-accent/40 transition-colors cursor-pointer group"
                      >
                        <span className="text-sm">{faceIcon(f.faceName)}</span>
                        <span className="text-sm font-medium">{f.faceName}</span>
                        <span className="text-sm tabular-nums text-muted-foreground ml-auto">
                          {f.m2 != null && `${f.m2.toFixed(2)} m²`}
                          {f.m3 != null && `${f.m3.toFixed(3)} m³`}
                        </span>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </TabsContent>

        {/* Alphabetical */}
        <TabsContent value="alpha" className="mt-2">
          <div className="border rounded overflow-hidden max-w-lg">
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-1.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Ámbito</span>
              <span>Espacio</span>
              <span className="text-right">Medición</span>
            </div>
            {alphabetical.map((f, i) => (
              <button
                key={`${f.faceName}-${f.workspace}-${i}`}
                onClick={() => handleFaceClick(f)}
                className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-1.5 text-sm border-t hover:bg-accent/30 transition-colors w-full text-left cursor-pointer"
              >
                <span className="font-medium whitespace-nowrap">
                  {faceIcon(f.faceName)} {f.faceName}
                </span>
                <span className="text-muted-foreground">{f.workspace}</span>
                <span className="text-right tabular-nums whitespace-nowrap">
                  {f.m2 != null && `${f.m2.toFixed(2)} m²`}
                  {f.m3 != null && `${f.m3.toFixed(3)} m³`}
                </span>
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Panel for editing wall objects */}
      <WallObjectsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        wallId={panelWallId}
        wallIndex={panelWallIndex}
        wallType={panelWallType}
        wallLabel={panelWallLabel}
        roomName={panelRoomName}
        onWallTypeChange={(newType) => setPanelWallType(newType)}
      />
    </div>
  );
}
