import { useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Layers, List, Search, Box, ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WallObjectsPanel } from './WallObjectsPanel';
import { toast } from 'sonner';

/* ── Resizable column table ── */
interface ColDef {
  key: string;
  header: string;
  defaultWidth: number;
  minWidth: number;
}

interface TableRow<T> {
  face: T;
  cells: Record<string, string>;
}

function ResizableTable<T>({
  columns,
  rows,
  onRowClick,
  className,
}: {
  columns: ColDef[];
  rows: TableRow<T>[];
  onRowClick: (row: TableRow<T>) => void;
  className?: string;
}) {
  const [widths, setWidths] = useState<number[]>(() => columns.map(c => c.defaultWidth));
  const dragRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (colIdx: number, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { colIdx, startX: e.clientX, startW: widths[colIdx] };
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const newW = Math.max(columns[dragRef.current.colIdx].minWidth, dragRef.current.startW + delta);
        setWidths(prev => {
          const next = [...prev];
          next[dragRef.current!.colIdx] = newW;
          return next;
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, columns],
  );

  return (
    <div className={cn('border rounded overflow-auto', className)}>
      <table className="border-collapse" style={{ tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) + columns.length * 1 }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        {/* Header */}
        <thead>
          <tr className="bg-muted/50">
            {columns.map((col, ci) => (
              <th
                key={col.key}
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5 relative select-none"
              >
                {col.header}
                {/* Resize handle */}
                <span
                  onPointerDown={e => onPointerDown(ci, e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              onClick={() => onRowClick(row)}
              className="border-t hover:bg-accent/30 transition-colors cursor-pointer"
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className="text-left text-sm px-2 py-1 break-words align-top"
                >
                  {row.cells[col.key] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Types ── */
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
  wallIndex: number;
}

/* ── Main component ── */
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

  /* ── Recursos: all wall objects across the budget ── */
  const { data: allObjects = [] } = useQuery({
    queryKey: ['budget-wall-objects-all', budgetId],
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
      if (!rooms?.length) return [];
      const roomMap = new Map(rooms.map(r => [r.id, r.name]));
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index')
        .in('room_id', rooms.map(r => r.id));
      if (!walls?.length) return [];
      const wallRoomMap = new Map(walls.map(w => [w.id, { roomId: w.room_id, wallIndex: w.wall_index }]));
      const { data: objects } = await supabase
        .from('budget_wall_objects')
        .select('*')
        .in('wall_id', walls.map(w => w.id))
        .order('layer_order', { ascending: true });
      if (!objects?.length) return [];
      return objects.map((obj: any) => {
        const wallInfo = wallRoomMap.get(obj.wall_id);
        const workspace = wallInfo ? (roomMap.get(wallInfo.roomId) || '—') : '—';
        const wi = wallInfo?.wallIndex ?? 0;
        const faceName = wi === 0 ? 'Espacio' : wi === -1 ? 'Suelo' : wi === -2 ? 'Techo' : `Pared ${wi}`;
        return { ...obj, workspace, faceName };
      });
    },
  });

  const [resourcesView, setResourcesView] = useState<'alpha' | 'workspace'>('alpha');
  const [resourceOpenGroups, setResourceOpenGroups] = useState<Set<string>>(new Set());

  const toggleResourceGroup = (name: string) => {
    setResourceOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredObjects = useMemo(() => {
    if (!search.trim()) return allObjects;
    const q = search.toLowerCase();
    return allObjects.filter((o: any) =>
      o.name.toLowerCase().includes(q) || o.workspace.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)
    );
  }, [allObjects, search]);

  const objectsAlpha = useMemo(() =>
    [...filteredObjects].sort((a: any, b: any) => a.name.localeCompare(b.name, 'es')),
  [filteredObjects]);

  const objectsByWorkspace = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const o of filteredObjects) {
      if (!groups.has(o.workspace)) groups.set(o.workspace, []);
      groups.get(o.workspace)!.push(o);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, objs]) => ({ name, objects: objs.sort((a: any, b: any) => a.layer_order - b.layer_order) }));
  }, [filteredObjects]);
  const ensureSuperficieObject = async (wallId: string, face: AutoFace) => {
    // Check if order-0 Superficie already exists
    const { data: existing } = await supabase
      .from('budget_wall_objects')
      .select('id')
      .eq('wall_id', wallId)
      .eq('layer_order', 0)
      .maybeSingle();
    if (existing) return;

    const surfaceM2 = face.m2 ?? null;
    const volumeM3 = face.m3 ?? null;
    const faceLabel = face.faceName;
    const uniqueName = `Superficie`;

    await supabase.from('budget_wall_objects').insert({
      wall_id: wallId,
      layer_order: 0,
      name: uniqueName,
      description: `${faceLabel}/${face.workspace}`,
      object_type: 'material',
      is_core: false,
      surface_m2: surfaceM2,
      volume_m3: volumeM3,
    });
  };

  const handleFaceClick = async (face: AutoFace) => {
    let wall = allWalls.find(w => w.room_id === face.roomId && w.wall_index === face.wallIndex);
    if (!wall) {
      const wallType = face.wallIndex === 0 ? 'espacio' : face.wallIndex === -1 ? 'suelo_basico' : face.wallIndex === -2 ? 'techo_basico' : 'exterior';
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
    // Ensure the automatic Superficie object exists
    await ensureSuperficieObject(wall.id, face);

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

        {/* By Workspace — collapsible with resizable columns */}
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
                  <ResizableTable
                    columns={[
                      { key: 'icon', header: '', defaultWidth: 32, minWidth: 28 },
                      { key: 'name', header: 'Ámbito', defaultWidth: 130, minWidth: 60 },
                      { key: 'measure', header: 'Medición', defaultWidth: 120, minWidth: 60 },
                    ]}
                    rows={group.faces.map((f) => ({
                      face: f,
                      cells: {
                        icon: faceIcon(f.faceName),
                        name: f.faceName,
                        measure: f.m2 != null ? `${f.m2.toFixed(2)} m²` : f.m3 != null ? `${f.m3.toFixed(3)} m³` : '',
                      },
                    }))}
                    onRowClick={(row) => handleFaceClick(row.face)}
                    className="ml-6 mt-1"
                  />
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </TabsContent>

        {/* Alphabetical with resizable columns */}
        <TabsContent value="alpha" className="mt-2">
          <ResizableTable
            columns={[
              { key: 'icon', header: '', defaultWidth: 32, minWidth: 28 },
              { key: 'name', header: 'Ámbito', defaultWidth: 130, minWidth: 60 },
              { key: 'workspace', header: 'Espacio', defaultWidth: 140, minWidth: 60 },
              { key: 'measure', header: 'Medición', defaultWidth: 120, minWidth: 60 },
            ]}
            rows={alphabetical.map((f) => ({
              face: f,
              cells: {
                icon: faceIcon(f.faceName),
                name: f.faceName,
                workspace: f.workspace,
                measure: f.m2 != null ? `${f.m2.toFixed(2)} m²` : f.m3 != null ? `${f.m3.toFixed(3)} m³` : '',
              },
            }))}
            onRowClick={(row) => handleFaceClick(row.face)}
          />
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
