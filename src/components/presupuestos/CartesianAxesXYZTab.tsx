import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Plus, Trash2, ArrowLeft, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomSection, SectionPolygon } from './CustomSectionManager';
import { SectionAxisViewer } from './SectionAxisViewer';
import type { PolygonFacePatterns } from './SectionAxisViewer';

interface PolygonVertex { x: number; y: number; }

interface WorkspaceRoom {
  id: string;
  name: string;
  height: number | null;
  has_floor: boolean;
  has_ceiling: boolean;
  has_roof: boolean;
  vertical_section_id: string | null;
  floor_id: string | null;
  floor_polygon: PolygonVertex[] | null;
}

interface FloorData {
  id: string;
  name: string;
  order_index: number;
  floor_plan_id: string;
}

interface WallData {
  id: string;
  room_id: string;
  wall_index: number;
  height: number | null;
}

/** Find where a polygon's edges cross axis=val, returning values on the other axis */
function findPolyIntersections(poly: PolygonVertex[], axis: 'x' | 'y', val: number): number[] {
  const results: number[] = [];
  const other = axis === 'y' ? 'x' : 'y';
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i], b = poly[j];
    const aV = a[axis], bV = b[axis];
    if ((aV <= val && bV >= val) || (aV >= val && bV <= val)) {
      if (aV === bV) {
        results.push(a[other], b[other]);
      } else {
        const t = (val - aV) / (bV - aV);
        results.push(a[other] + t * (b[other] - a[other]));
      }
    }
  }
  return results;
}

function normalizeWorkspaceName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b(techo|cubierta|suelo|piso|planta)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d+$/g, '')
    .trim();
}

function getPolygonBounds(vertices: Array<{ x: number; y: number }>) {
  if (!vertices || vertices.length === 0) return null;
  const xs = vertices.map(v => v.x).filter(Number.isFinite);
  const ys = vertices.map(v => v.y).filter(Number.isFinite);
  if (xs.length === 0 || ys.length === 0) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function buildHealedPolygonFromAuto(saved: SectionPolygon, auto: SectionPolygon): SectionPolygon {
  return {
    ...auto,
    name: saved.name || auto.name,
    hasFloor: saved.hasFloor ?? auto.hasFloor,
    hasCeiling: saved.hasCeiling ?? auto.hasCeiling,
    faceTypes: saved.faceTypes ?? auto.faceTypes,
  };
}

function maybeHealLegacySavedPolygon(
  saved: SectionPolygon,
  auto: SectionPolygon | undefined,
  sectionType: 'vertical' | 'longitudinal' | 'transversal',
): SectionPolygon {
  if (!auto) return saved;
  if (!saved.vertices || saved.vertices.length < 3) return saved;

  const savedBounds = getPolygonBounds(saved.vertices);
  const autoBounds = getPolygonBounds(auto.vertices);
  if (!savedBounds || !autoBounds) return buildHealedPolygonFromAuto(saved, auto);

  // 1) Legacy degenerate lines in X/Y (height or width collapsed)
  const isDegenerate = savedBounds.width < 0.01 || savedBounds.height < 0.01;

  // 2) Legacy outliers where Z was persisted in incompatible units (e.g. thousands)
  const isOutlier =
    Math.abs(savedBounds.height - autoBounds.height) > Math.max(2, autoBounds.height * 4) ||
    Math.abs(savedBounds.minY - autoBounds.minY) > Math.max(2, autoBounds.height * 4) ||
    Math.abs(savedBounds.maxY - autoBounds.maxY) > Math.max(2, autoBounds.height * 4);

  if (isDegenerate || isOutlier) {
    return buildHealedPolygonFromAuto(saved, auto);
  }

  // 3) Legacy mirrored X-sections: unmirror around inferred mirror constant
  if (sectionType === 'transversal') {
    const mirrorConst = ((autoBounds.minX + savedBounds.maxX) + (autoBounds.maxX + savedBounds.minX)) / 2;
    const mirroredVertices = saved.vertices.map(v => ({ ...v, x: mirrorConst - v.x }));
    const mirroredBounds = getPolygonBounds(mirroredVertices);

    if (mirroredBounds) {
      const originalDiff =
        Math.abs(savedBounds.minX - autoBounds.minX) +
        Math.abs(savedBounds.maxX - autoBounds.maxX) +
        Math.abs(savedBounds.minY - autoBounds.minY) +
        Math.abs(savedBounds.maxY - autoBounds.maxY);

      const mirroredDiff =
        Math.abs(mirroredBounds.minX - autoBounds.minX) +
        Math.abs(mirroredBounds.maxX - autoBounds.maxX) +
        Math.abs(mirroredBounds.minY - autoBounds.minY) +
        Math.abs(mirroredBounds.maxY - autoBounds.maxY);

      const shouldUnmirror = originalDiff > 1 && mirroredDiff + 0.05 < originalDiff * 0.45;
      if (shouldUnmirror) {
        return {
          ...saved,
          vertices: mirroredVertices,
          zBase: auto.zBase,
          zTop: auto.zTop,
        };
      }
    }
  }

  return saved;
}

interface CartesianAxesXYZTabProps {
  budgetId: string;
  isAdmin: boolean;
}

type SectionType = Extract<CustomSection['sectionType'], 'vertical' | 'longitudinal' | 'transversal'>;

type SectionDraft = {
  name: string;
  axisValue: string;
};

const SECTION_CONFIG: Record<SectionType, { title: string; axis: 'X' | 'Y' | 'Z'; axisLabel: string; placeholder: string }> = {
  vertical: { title: 'Crear secciones Z', axis: 'Z', axisLabel: 'Eje Z', placeholder: '0' },
  longitudinal: { title: 'Crear secciones Y', axis: 'Y', axisLabel: 'Eje Y', placeholder: '0' },
  transversal: { title: 'Crear secciones X', axis: 'X', axisLabel: 'Eje X', placeholder: '0' },
};

const INITIAL_DRAFTS: Record<SectionType, SectionDraft> = {
  vertical: { name: 'Sección Z=0', axisValue: '0' },
  longitudinal: { name: 'Sección Y=0', axisValue: '0' },
  transversal: { name: 'Sección X=0', axisValue: '0' },
};

export function CartesianAxesXYZTab({ budgetId, isAdmin }: CartesianAxesXYZTabProps) {
  const queryClient = useQueryClient();
  const [openCreator, setOpenCreator] = useState<SectionType | null>('vertical');
  const [drafts, setDrafts] = useState<Record<SectionType, SectionDraft>>(INITIAL_DRAFTS);
  const [creating, setCreating] = useState(false);
  const [activeSection, setActiveSection] = useState<CustomSection | null>(null);

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan-for-workspaces', budgetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_floor_plans')
        .select('id, custom_corners')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ── Load workspace rooms for auto-projection ──
  const { data: workspaceRooms } = useQuery({
    queryKey: ['workspace-rooms-for-projection', budgetId],
    queryFn: async () => {
      if (!floorPlan?.id) return [];
      const { data, error } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, height, has_floor, has_ceiling, has_roof, vertical_section_id, floor_id, floor_polygon')
        .eq('floor_plan_id', floorPlan.id);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        floor_polygon: r.floor_polygon ? (typeof r.floor_polygon === 'string' ? JSON.parse(r.floor_polygon) : r.floor_polygon) : null,
      })) as WorkspaceRoom[];
    },
    enabled: !!floorPlan?.id,
  });

  // ── Load floors for Z-level computation ──
  const { data: allFloors } = useQuery({
    queryKey: ['budget-floors-for-projection', budgetId],
    queryFn: async () => {
      if (!floorPlan?.id) return [];
      const { data, error } = await supabase
        .from('budget_floors')
        .select('id, name, order_index, floor_plan_id')
        .eq('floor_plan_id', floorPlan.id)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []) as FloorData[];
    },
    enabled: !!floorPlan?.id,
  });

  const { data: allWalls } = useQuery({
    queryKey: ['workspace-walls-for-projection', budgetId],
    queryFn: async () => {
      if (!floorPlan?.id) return [];
      const roomIds = (workspaceRooms || []).map(r => r.id);
      if (roomIds.length === 0) return [];
      const { data, error } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, height')
        .in('room_id', roomIds);
      if (error) throw error;
      return (data || []) as WallData[];
    },
    enabled: !!(workspaceRooms && workspaceRooms.length > 0),
  });

  // ── Load wall objects (Layer 0 surface patterns) for visual fill ──
  const { data: wallObjectSurfaces } = useQuery({
    queryKey: ['wall-object-surfaces-for-projection', budgetId],
    queryFn: async () => {
      const wallIds = (allWalls || []).map(w => w.id);
      if (wallIds.length === 0) return [];
      const { data, error } = await supabase
        .from('budget_wall_objects')
        .select('id, wall_id, layer_order, visual_pattern')
        .in('wall_id', wallIds)
        .eq('layer_order', 0);
      if (error) throw error;
      return (data || []) as Array<{ id: string; wall_id: string; layer_order: number; visual_pattern: string | null }>;
    },
    enabled: !!(allWalls && allWalls.length > 0),
  });

  // Build facePatterns map: roomId → { faceKey → patternId }
  // Maps wall_index: -1=floor, -2=ceiling, 0=space, 1+=wall-N
  const autoFacePatterns = useMemo<PolygonFacePatterns>(() => {
    if (!allWalls || !wallObjectSurfaces) return {};
    const patterns: PolygonFacePatterns = {};
    for (const surface of wallObjectSurfaces) {
      if (!surface.visual_pattern) continue;
      const wall = allWalls.find(w => w.id === surface.wall_id);
      if (!wall) continue;
      const roomId = wall.room_id;
      if (!patterns[roomId]) patterns[roomId] = {};
      let faceKey: string;
      if (wall.wall_index === -1) faceKey = 'floor';
      else if (wall.wall_index === -2) faceKey = 'ceiling';
      else faceKey = `wall-${wall.wall_index - 1}`;
      patterns[roomId][faceKey] = surface.visual_pattern;
    }
    return patterns;
  }, [allWalls, wallObjectSurfaces]);

  const allSections = useMemo<CustomSection[]>(() => {
    if (!floorPlan?.custom_corners) return [];
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      return Array.isArray(parsed?.customSections) ? parsed.customSections : [];
    } catch {
      return [];
    }
  }, [floorPlan?.custom_corners]);

  const ridgeLine = useMemo(() => {
    if (!floorPlan?.custom_corners) return null;
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      return parsed?.ridgeLine ?? null;
    } catch {
      return null;
    }
  }, [floorPlan?.custom_corners]);

  const sectionsByType = useMemo(() => ({
    vertical: allSections.filter(s => s.sectionType === 'vertical').sort((a, b) => a.axisValue - b.axisValue),
    longitudinal: allSections.filter(s => s.sectionType === 'longitudinal').sort((a, b) => a.axisValue - b.axisValue),
    transversal: allSections.filter(s => s.sectionType === 'transversal').sort((a, b) => a.axisValue - b.axisValue),
  }), [allSections]);

  const updateDraft = (type: SectionType, patch: Partial<SectionDraft>) => {
    setDrafts(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  };

  /** Ensure a floor_plan row exists; returns its id */
  const ensureFloorPlan = async (): Promise<{ id: string; custom_corners: any } | null> => {
    if (floorPlan?.id) return floorPlan;

    // Auto-create floor plan for this budget
    const { data, error } = await supabase
      .from('budget_floor_plans')
      .insert({ budget_id: budgetId, name: 'Plano principal', custom_corners: { corners: [], manualElevations: [], customSections: [], rulerData: {} } as any })
      .select('id, custom_corners')
      .single();

    if (error) {
      console.error('Error creating floor plan:', error);
      toast.error('Error al inicializar el plano');
      return null;
    }

    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    return data;
  };

  const handleCreateSection = async (type: SectionType) => {
    if (!isAdmin) { toast.error('No tienes permisos'); return; }

    const draft = drafts[type];
    if (!draft.name.trim()) { toast.error('Indica un nombre para la sección'); return; }

    setCreating(true);
    try {
      const fp = await ensureFloorPlan();
      if (!fp) return;

      const axisValue = parseFloat(draft.axisValue);
      const newSection: CustomSection = {
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: draft.name.trim(),
        sectionType: type,
        axis: SECTION_CONFIG[type].axis,
        axisValue: Number.isFinite(axisValue) ? axisValue : 0,
        polygons: [],
      };

      let parsedCorners: Record<string, unknown> = {};
      try {
        parsedCorners = typeof fp.custom_corners === 'string'
          ? JSON.parse(fp.custom_corners)
          : (fp.custom_corners || {});
      } catch { parsedCorners = {}; }

      const existingSections = Array.isArray(parsedCorners.customSections)
        ? parsedCorners.customSections as CustomSection[]
        : [];

      const nextCustomCorners = {
        ...parsedCorners,
        customSections: [...existingSections, newSection],
      };

      const { error } = await supabase
        .from('budget_floor_plans')
        .update({ custom_corners: nextCustomCorners as any })
        .eq('id', fp.id);

      if (error) { toast.error(`Error al crear sección ${SECTION_CONFIG[type].axis}`); return; }

      toast.success(`Sección ${newSection.axis}=${newSection.axisValue} creada: ${newSection.name}`);
      queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!isAdmin || !floorPlan?.id) return;

    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const existingSections = Array.isArray(parsedCorners.customSections)
      ? parsedCorners.customSections as CustomSection[]
      : [];

    const nextCustomCorners = {
      ...parsedCorners,
      customSections: existingSections.filter(s => s.id !== sectionId),
    };

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: nextCustomCorners as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al eliminar sección'); return; }

    toast.success('Sección eliminada');
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] });
  };

  const handleDeleteAllSections = async () => {
    if (!isAdmin || !floorPlan?.id) return;

    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const nextCustomCorners = { ...parsedCorners, customSections: [] };

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: nextCustomCorners as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al eliminar secciones'); return; }

    toast.success('Todas las secciones eliminadas');
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] });
  };

  const creators: SectionType[] = ['vertical', 'transversal', 'longitudinal'];
  const totalSections = allSections.length;

  const handleSaveScale = async (sectionId: string, scale: { hScale: number; vScale: number }) => {
    if (!floorPlan?.id) return;
    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const sections = Array.isArray(parsedCorners.customSections)
      ? (parsedCorners.customSections as CustomSection[])
      : [];

    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, scale } : s
    );

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al guardar escala'); return; }
    toast.success('Escala guardada');
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const handleSaveNegLimits = async (sectionId: string, negLimits: { negH: number; negV: number; posH: number; posV: number }) => {
    if (!floorPlan?.id) return;
    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const sections = Array.isArray(parsedCorners.customSections)
      ? (parsedCorners.customSections as CustomSection[])
      : [];

    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, negLimits } : s
    );

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al guardar límites negativos'); return; }
    toast.success('Límites negativos guardados');
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const handleSavePolygons = async (sectionId: string, polygons: import('./CustomSectionManager').SectionPolygon[]) => {
    if (!floorPlan?.id) return;
    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const sections = Array.isArray(parsedCorners.customSections)
      ? (parsedCorners.customSections as CustomSection[])
      : [];

    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, polygons } : s
    );

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al guardar espacios'); return; }

    // Sync has_floor / has_ceiling to budget_floor_plan_rooms
    for (const poly of polygons) {
      if (poly.hasFloor !== undefined || poly.hasCeiling !== undefined) {
        const roomUpdate: Record<string, boolean> = {};
        if (poly.hasFloor !== undefined) roomUpdate.has_floor = poly.hasFloor;
        if (poly.hasCeiling !== undefined) roomUpdate.has_ceiling = poly.hasCeiling;
        await supabase.from('budget_floor_plan_rooms').update(roomUpdate).eq('id', poly.id);
      }
    }

    toast.success('Espacio guardado');
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const handleSaveRulerLines = async (sectionId: string, rulerLines: import('./SectionAxisViewer').RulerLine[]) => {
    if (!floorPlan?.id) return;
    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch { parsedCorners = {}; }

    const sections = Array.isArray(parsedCorners.customSections)
      ? (parsedCorners.customSections as CustomSection[])
      : [];

    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, rulerLines } : s
    );

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al guardar reglas'); return; }
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const verticalSections = useMemo(
    () => allSections.filter(s => s.sectionType === 'vertical').sort((a, b) => a.axisValue - b.axisValue),
    [allSections],
  );

  const workspaceRoomMap = useMemo(
    () => new Map((workspaceRooms || []).map(room => [room.id, room])),
    [workspaceRooms],
  );

  // Build a name/id → zBase mapping from ALL vertical section polygons
  const verticalZBaseMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const vs of verticalSections) {
      const polys = vs.polygons;
      if (!polys) continue;
      for (const p of polys) {
        map.set(p.id, vs.axisValue);
        if (p.name) map.set(`name:${p.name}`, vs.axisValue);
      }
    }
    return map;
  }, [verticalSections]);

  // Build normalized-name → axis set mapping for legacy projects where IDs changed
  const verticalNameAxisMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const vs of verticalSections) {
      const polys = vs.polygons;
      if (!polys) continue;
      for (const p of polys) {
        const normalized = normalizeWorkspaceName(p.name);
        if (!normalized) continue;
        const axes = map.get(normalized) || new Set<number>();
        axes.add(vs.axisValue);
        map.set(normalized, axes);
      }
    }
    return map;
  }, [verticalSections]);

  const verticalNameAxisEntries = useMemo(
    () => Array.from(verticalNameAxisMap.entries()),
    [verticalNameAxisMap],
  );

  // Build floor_id → Z base mapping from vertical sections sorted by axisValue
  // Each floor's Z base = the vertical section axisValue at that floor's order_index
  const floorZBaseMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!allFloors || allFloors.length === 0 || verticalSections.length === 0) return map;

    const sortedFloors = [...allFloors].sort((a, b) => a.order_index - b.order_index);
    for (let i = 0; i < sortedFloors.length; i++) {
      const floor = sortedFloors[i];
      if (i < verticalSections.length) {
        map.set(floor.id, verticalSections[i].axisValue);
      }
    }
    return map;
  }, [allFloors, verticalSections]);

  // Map legacy vertical_section_id values (from older saved data) to a current Z base
  const legacyVerticalSectionZBaseMap = useMemo(() => {
    const votes = new Map<string, Map<number, number>>();
    for (const room of (workspaceRooms || [])) {
      if (!room.vertical_section_id) continue;

      let resolved: number | undefined;

      if (room.floor_id) {
        const byFloor = floorZBaseMap.get(room.floor_id);
        if (byFloor !== undefined) resolved = byFloor;
      }

      if (resolved === undefined) {
        const byId = verticalZBaseMap.get(room.id);
        if (byId !== undefined) resolved = byId;
      }

      if (resolved === undefined) {
        const byName = verticalZBaseMap.get(`name:${room.name}`);
        if (byName !== undefined) resolved = byName;
      }

      if (resolved === undefined) {
        const normalized = normalizeWorkspaceName(room.name);
        if (normalized) {
          const axes = verticalNameAxisMap.get(normalized);
          if (axes && axes.size === 1) {
            resolved = Array.from(axes)[0];
          }
        }
      }

      if (resolved === undefined) continue;

      const sectionVotes = votes.get(room.vertical_section_id) || new Map<number, number>();
      sectionVotes.set(resolved, (sectionVotes.get(resolved) || 0) + 1);
      votes.set(room.vertical_section_id, sectionVotes);
    }

    const mapped = new Map<string, number>();
    for (const [legacySectionId, sectionVotes] of votes) {
      const sorted = Array.from(sectionVotes.entries()).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) continue;
      if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) continue;
      mapped.set(legacySectionId, sorted[0][0]);
    }

    return mapped;
  }, [workspaceRooms, floorZBaseMap, verticalZBaseMap, verticalNameAxisMap]);

  const resolveRoomZBase = useCallback((room: WorkspaceRoom): number => {
    // 1) HIGHEST PRIORITY: Use floor_id → floorZBaseMap (most reliable)
    if (room.floor_id) {
      const byFloor = floorZBaseMap.get(room.floor_id);
      if (byFloor !== undefined) return byFloor;
    }

    // 2) Check by room ID in vertical section polygons
    const byId = verticalZBaseMap.get(room.id);
    if (byId !== undefined) return byId;

    // 3) Check by room name in vertical section polygons
    const byName = verticalZBaseMap.get(`name:${room.name}`);
    if (byName !== undefined) return byName;

    // 4) Direct match by current vertical_section_id
    const direct = verticalSections.find(s => s.id === room.vertical_section_id);
    if (direct) return direct.axisValue;

    // 5) Legacy match by stale vertical_section_id values (majority-vote inferred)
    if (room.vertical_section_id) {
      const byLegacySection = legacyVerticalSectionZBaseMap.get(room.vertical_section_id);
      if (byLegacySection !== undefined) return byLegacySection;
    }

    // 6) Legacy fallback: normalized name matching (e.g. "Atico1" -> "Atico")
    const normalizedRoomName = normalizeWorkspaceName(room.name);
    if (normalizedRoomName) {
      const directAxes = verticalNameAxisMap.get(normalizedRoomName);
      if (directAxes && directAxes.size === 1) {
        return Array.from(directAxes)[0];
      }

      const partialAxes = new Set<number>();
      for (const [nameKey, axes] of verticalNameAxisEntries) {
        if (nameKey.includes(normalizedRoomName) || normalizedRoomName.includes(nameKey)) {
          for (const axis of axes) partialAxes.add(axis);
        }
      }
      if (partialAxes.size === 1) {
        return Array.from(partialAxes)[0];
      }
    }

    return 0;
  }, [floorZBaseMap, verticalZBaseMap, verticalSections, legacyVerticalSectionZBaseMap, verticalNameAxisMap, verticalNameAxisEntries]);

  const rebaseSavedPolygonToRoomLevel = useCallback((polygon: SectionPolygon): SectionPolygon => {
    const room = workspaceRoomMap.get(polygon.id);
    if (!room || !polygon.vertices || polygon.vertices.length === 0) return polygon;

    const expectedZBase = resolveRoomZBase(room);
    const currentZBase = typeof polygon.zBase === 'number'
      ? polygon.zBase
      : Math.min(...polygon.vertices.map(v => v.y));

    const delta = expectedZBase - currentZBase;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return polygon;

    return {
      ...polygon,
      zBase: typeof polygon.zBase === 'number' ? polygon.zBase + delta : expectedZBase,
      zTop: typeof polygon.zTop === 'number' ? polygon.zTop + delta : polygon.zTop,
      vertices: polygon.vertices.map(v => ({ ...v, y: v.y + delta })),
    };
  }, [workspaceRoomMap, resolveRoomZBase]);

  // Collect ALL polygon names across ALL sections for uniqueness check
  const allPolygonNames = useMemo(() => {
    const names: string[] = [];
    for (const section of allSections) {
      for (const poly of (section.polygons || [])) {
        if (poly.name) names.push(poly.name);
      }
    }
    return names;
  }, [allSections]);

  // Set of room IDs that exist in any vertical (Z) section — used to filter auto-projection
  const validRoomIds = useMemo(() => {
    const ids = new Set<string>();
    for (const vs of verticalSections) {
      for (const p of (vs.polygons || [])) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [verticalSections]);

  // Flatten all vertical polygons as fallback projection source (for legacy/manual Z drawings)
  const verticalPolygonSources = useMemo(() => {
    const sources: Array<{ sectionId: string; axisValue: number; polygon: SectionPolygon }> = [];
    for (const vs of verticalSections) {
      for (const polygon of (vs.polygons || [])) {
        if (!polygon.vertices || polygon.vertices.length < 3) continue;
        sources.push({ sectionId: vs.id, axisValue: vs.axisValue, polygon });
      }
    }
    return sources;
  }, [verticalSections]);

  const verticalRoomNameSet = useMemo(() => {
    const names = new Set<string>();
    for (const src of verticalPolygonSources) {
      const normalized = normalizeWorkspaceName(src.polygon.name);
      if (normalized) names.add(normalized);
    }
    return names;
  }, [verticalPolygonSources]);

  const workspaceRoomsByNormalizedName = useMemo(() => {
    const map = new Map<string, WorkspaceRoom[]>();
    for (const room of (workspaceRooms || [])) {
      const key = normalizeWorkspaceName(room.name);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(room);
      map.set(key, list);
    }
    return map;
  }, [workspaceRooms]);

  /** Compute auto-projected polygons for Y/X sections from workspace rooms */
  const computeProjectedPolygons = useCallback((section: CustomSection): SectionPolygon[] => {
    if (section.sectionType === 'vertical') return [];

    const defaultHeight = 2.5; // fallback metres
    // Z unit = 250mm (block_height_mm)
    const zUnitMm = 250;

    // Filter: only project rooms that exist in a Z section (by id or by normalized name)
    const eligibleRooms = (workspaceRooms || []).filter(room => {
      if (validRoomIds.size === 0 && verticalRoomNameSet.size === 0) return true;
      const normalized = normalizeWorkspaceName(room.name);
      return validRoomIds.has(room.id) || (normalized ? verticalRoomNameSet.has(normalized) : false);
    });

    // For transversal sections (X cut), keep Y orientation tied to the immutable origin.
    // No mirroring by point of view: Y=0 must remain the same reference side.
    const projected: SectionPolygon[] = [];
    const projectedKeys = new Set<string>();

    const pushProjectedRoom = (
      key: string,
      roomName: string,
      poly: PolygonVertex[],
      zBase: number,
      roomHeightM: number | null | undefined,
      hasFloor: boolean | undefined,
      hasCeiling: boolean | undefined,
      wallRoomId?: string,
    ) => {
      if (!poly || poly.length < 3) return;
      const cutAxis = section.sectionType === 'longitudinal' ? 'y' : 'x';
      const axisVal = section.axisValue;

      const intersections = findPolyIntersections(poly, cutAxis, axisVal);
      if (intersections.length < 2) return;

      const hMin = Math.min(...intersections);
      const hMax = Math.max(...intersections);
      if (Math.abs(hMax - hMin) < 0.01) return;

      // Resolve effective height: room height → max wall height → default
      let effectiveHeightM = roomHeightM && roomHeightM > 0 ? roomHeightM : null;

      // If room height is missing/zero, compute from individual wall heights (prisma with per-face heights)
      if (!effectiveHeightM && wallRoomId) {
        const roomWalls = (allWalls || []).filter(w => w.room_id === wallRoomId);
        const wallHeights = roomWalls.filter(w => w.height != null && w.height > 0).map(w => w.height!);
        if (wallHeights.length > 0) {
          effectiveHeightM = Math.max(...wallHeights);
        }
      }

      // Also check vertical section polygons for this room's actual drawn height
      if (!effectiveHeightM) {
        for (const src of verticalPolygonSources) {
          if (src.polygon.id === key || src.polygon.name === roomName) {
            const verts = src.polygon.vertices;
            if (verts && verts.length >= 3) {
              const minY = Math.min(...verts.map(v => v.y));
              const maxY = Math.max(...verts.map(v => v.y));
              const drawnHeightUnits = maxY - minY;
              if (drawnHeightUnits > 0.01) {
                effectiveHeightM = (drawnHeightUnits * zUnitMm) / 1000;
                break;
              }
            }
          }
        }
      }

      if (!effectiveHeightM) effectiveHeightM = defaultHeight;

      const defaultZTop = zBase + Math.round((effectiveHeightM * 1000) / zUnitMm);

      // Check wall heights for non-uniform tops (inclined roofs)
      const getWallZTop = (wallIndex: number): number => {
        if (!wallRoomId) return defaultZTop;
        const wall = (allWalls || []).find(w => w.room_id === wallRoomId && w.wall_index === wallIndex);
        if (wall?.height != null && wall.height > 0) {
          return zBase + Math.round((wall.height * 1000) / zUnitMm);
        }
        return defaultZTop;
      };

      const getTopAtIntersection = (hVal: number): number => {
        const otherAxis = cutAxis === 'y' ? 'x' : 'y';
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length;
          const a = poly[i], b = poly[j];
          const aV = a[cutAxis], bV = b[cutAxis];
          if ((aV <= axisVal && bV >= axisVal) || (aV >= axisVal && bV <= axisVal)) {
            if (Math.abs(aV - bV) < 0.001 && Math.abs(aV - axisVal) < 0.001) {
              if (Math.min(a[otherAxis], b[otherAxis]) <= hVal && Math.max(a[otherAxis], b[otherAxis]) >= hVal) {
                return getWallZTop(i + 1);
              }
            } else {
              const t = (axisVal - aV) / (bV - aV);
              const intH = a[otherAxis] + t * (b[otherAxis] - a[otherAxis]);
              if (Math.abs(intH - hVal) < 0.5) {
                const zI = getWallZTop(i + 1);
                const zJ = getWallZTop(((i + 1) % poly.length) + 1);
                return Math.round(zI + t * (zJ - zI));
              }
            }
          }
        }
        return defaultZTop;
      };

      const zTopLeft = getTopAtIntersection(hMin);
      const zTopRight = getTopAtIntersection(hMax);

      // Guard against degenerate polygons (collapsed to a line)
      const maxZTop = Math.max(zTopLeft, zTopRight);
      const finalZTop = maxZTop <= zBase ? zBase + Math.max(1, Math.round((defaultHeight * 1000) / zUnitMm)) : maxZTop;
      const finalZTopLeft = zTopLeft <= zBase ? finalZTop : zTopLeft;
      const finalZTopRight = zTopRight <= zBase ? finalZTop : zTopRight;

      projected.push({
        id: key,
        name: roomName,
        vertices: [
          { x: hMin, y: zBase, z: 0 },
          { x: hMax, y: zBase, z: 0 },
          { x: hMax, y: finalZTopRight, z: 0 },
          { x: hMin, y: finalZTopLeft, z: 0 },
        ],
        zBase,
        zTop: Math.max(finalZTopLeft, finalZTopRight),
        hasFloor,
        hasCeiling,
      });
      projectedKeys.add(key);
    };

    // 1) Main source: workspace rooms linked to plan
    for (const room of eligibleRooms) {
      if (!room.floor_polygon || room.floor_polygon.length < 3) continue;
      const zBase = resolveRoomZBase(room);
      pushProjectedRoom(
        room.id,
        room.name,
        room.floor_polygon,
        zBase,
        room.height,
        room.has_floor,
        room.has_ceiling,
        room.id,
      );
    }

    // 2) Fallback source: polygons drawn in vertical sections (ensures new X/Y sections are never empty)
    for (const src of verticalPolygonSources) {
      const normalized = normalizeWorkspaceName(src.polygon.name);
      const matchedRoom = workspaceRoomMap.get(src.polygon.id)
        || (normalized ? (workspaceRoomsByNormalizedName.get(normalized)?.[0] || null) : null);

      const fallbackId = matchedRoom?.id || src.polygon.id;
      if (projectedKeys.has(fallbackId)) continue;

      const footprint: PolygonVertex[] = src.polygon.vertices.map(v => ({ x: v.x, y: v.y }));
      const inferredHeightM =
        typeof src.polygon.zTop === 'number' && typeof src.polygon.zBase === 'number'
          ? Math.max(0.25, ((src.polygon.zTop - src.polygon.zBase) * zUnitMm) / 1000)
          : null;

      pushProjectedRoom(
        fallbackId,
        matchedRoom?.name || src.polygon.name,
        footprint,
        src.axisValue,
        matchedRoom?.height ?? inferredHeightM ?? defaultHeight,
        matchedRoom?.has_floor ?? src.polygon.hasFloor,
        matchedRoom?.has_ceiling ?? src.polygon.hasCeiling,
        matchedRoom?.id,
      );
    }

    return projected;
  }, [workspaceRooms, allWalls, resolveRoomZBase, validRoomIds, verticalRoomNameSet, verticalPolygonSources, workspaceRoomsByNormalizedName, workspaceRoomMap]);

  // If viewing a section, show the viewer
  if (activeSection) {
    const liveSection = allSections.find(s => s.id === activeSection.id) || activeSection;
    console.log('[SectionDebug] activeSection:', liveSection.name, liveSection.sectionType, 'axisValue:', liveSection.axisValue);
    console.log('[SectionDebug] savedScale:', (liveSection as any).scale);
    console.log('[SectionDebug] savedPolygons:', liveSection.polygons?.length || 0);
    console.log('[SectionDebug] workspaceRooms:', workspaceRooms?.length || 0);
    const autoPolysDebug = computeProjectedPolygons(liveSection);
    console.log('[SectionDebug] autoProjectedPolygons:', autoPolysDebug.length, autoPolysDebug);
    const savedScale = (liveSection as any).scale as { hScale: number; vScale: number } | undefined;
    const savedNegLimits = (liveSection as any).negLimits as { negH: number; negV: number; posH?: number; posV?: number } | undefined;

    // Merge: auto-projected polygons + manually saved ones.
    // For X/Y sections, rebase + heal stale legacy geometries (degenerate lines, mirrored X, invalid Z units).
    const savedPolys = liveSection.polygons || [];
    const normalizedSavedPolys = liveSection.sectionType === 'vertical'
      ? savedPolys
      : savedPolys.map(rebaseSavedPolygonToRoomLevel);

    const autoPolys = computeProjectedPolygons(liveSection);
    const autoPolysById = new Map(autoPolys.map(p => [p.id, p]));
    const healedSavedPolys = liveSection.sectionType === 'vertical'
      ? normalizedSavedPolys
      : normalizedSavedPolys.map(p => maybeHealLegacySavedPolygon(
          p,
          autoPolysById.get(p.id),
          liveSection.sectionType as 'vertical' | 'longitudinal' | 'transversal',
        ));

    const savedIds = new Set(healedSavedPolys.map(p => p.id));
    const mergedPolygons = [
      ...healedSavedPolys,
      ...autoPolys.filter(ap => !savedIds.has(ap.id)),
    ];

    // X/Y sections always referenced from (0,0,0) at bottom-left.
    // Auto-expand positive ranges so all projected polygons stay visible.
    const effectiveNegLimits = (() => {
      const base = {
        negH: savedNegLimits?.negH ?? 3,
        negV: savedNegLimits?.negV ?? 3,
        posH: savedNegLimits?.posH ?? 8,
        posV: savedNegLimits?.posV ?? 6,
      };

      if (liveSection.sectionType === 'vertical') return base;

      let maxX = 0;
      let maxY = 0;
      for (const poly of mergedPolygons) {
        for (const v of (poly.vertices || [])) {
          if (Number.isFinite(v.x)) maxX = Math.max(maxX, v.x);
          if (Number.isFinite(v.y)) maxY = Math.max(maxY, v.y);
        }
      }

      return {
        negH: 0,
        negV: 0,
        posH: Math.max(base.posH, Math.ceil(maxX) + 2),
        posV: Math.max(base.posV, Math.ceil(maxY) + 2),
      };
    })();

    // Merge saved section facePatterns with auto-generated surface patterns
    const savedSectionPatterns: PolygonFacePatterns = (liveSection as any).facePatterns || {};
    const mergedFacePatterns: PolygonFacePatterns = { ...autoFacePatterns };
    // Saved patterns override auto patterns
    for (const [polyId, faces] of Object.entries(savedSectionPatterns)) {
      mergedFacePatterns[polyId] = { ...(mergedFacePatterns[polyId] || {}), ...faces };
    }

    const handleFacePatternChange = async (polyId: string, faceKey: string, patternId: string | null) => {
      if (!floorPlan?.id) return;
      let parsedCorners: Record<string, unknown> = {};
      try {
        parsedCorners = typeof floorPlan.custom_corners === 'string'
          ? JSON.parse(floorPlan.custom_corners)
          : (floorPlan.custom_corners || {});
      } catch { parsedCorners = {}; }
      const sections = Array.isArray(parsedCorners.customSections)
        ? (parsedCorners.customSections as CustomSection[])
        : [];
      const updated = sections.map(s => {
        if (s.id !== liveSection.id) return s;
        const existing = (s as any).facePatterns || {};
        return {
          ...s,
          facePatterns: {
            ...existing,
            [polyId]: { ...(existing[polyId] || {}), [faceKey]: patternId },
          },
        };
      });
      await supabase.from('budget_floor_plans')
        .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
        .eq('id', floorPlan.id);
      queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
            onClick={() => setActiveSection(null)}>
            <ArrowLeft className="h-3 w-3" /> Volver a ejes
          </Button>
          <span className="text-sm font-semibold">{liveSection.name}</span>
          <Badge variant="secondary" className="text-[10px] h-5 font-mono">
            {liveSection.axis}={liveSection.axisValue}
          </Badge>
        </div>
        <SectionAxisViewer
          sectionType={liveSection.sectionType as 'vertical' | 'longitudinal' | 'transversal'}
          axisValue={liveSection.axisValue}
          sectionName={liveSection.name}
          floorPlanId={floorPlan?.id}
          savedScale={savedScale}
          onSaveScale={(scale) => handleSaveScale(liveSection.id, scale)}
          savedNegLimits={effectiveNegLimits}
          onSaveNegLimits={(limits) => {
            const normalizedLimits = liveSection.sectionType === 'vertical'
              ? limits
              : { ...limits, negH: 0, negV: 0 };
            handleSaveNegLimits(liveSection.id, normalizedLimits);
          }}
          ridgeLine={ridgeLine}
          polygons={mergedPolygons}
          onSavePolygons={(polys) => handleSavePolygons(liveSection.id, polys)}
          savedRulerLines={(liveSection as any).rulerLines || []}
          onSaveRulerLines={(lines) => handleSaveRulerLines(liveSection.id, lines)}
          facePatterns={mergedFacePatterns}
          onFacePatternChange={handleFacePatternChange}
          allPolygonNames={allPolygonNames}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Ejes cartesianos XYZ</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crea y gestiona secciones por eje. Total: {totalSections}
          </p>
        </div>
        {totalSections > 0 && isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleDeleteAllSections}
          >
            <Trash2 className="h-3 w-3" /> Eliminar todas
          </Button>
        )}
      </div>

      {creators.map((type) => {
        const config = SECTION_CONFIG[type];
        const draft = drafts[type];
        const currentSections = sectionsByType[type];

        return (
          <Collapsible
            key={type}
            open={openCreator === type}
            onOpenChange={() => setOpenCreator(prev => prev === type ? null : type)}
          >
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors">
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  openCreator === type && 'rotate-90',
                )}
              />
              <span className="text-sm font-medium">{config.title}</span>
              <Badge variant="secondary" className="ml-auto h-5 text-[10px]">{currentSections.length}</Badge>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px]">Nombre</Label>
                    <Input
                      className="h-8 text-xs"
                      value={draft.name}
                      onChange={(e) => updateDraft(type, { name: e.target.value })}
                      placeholder={`Ej: Sección ${config.axis}=0`}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">{config.axisLabel}</Label>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      value={draft.axisValue}
                      onChange={(e) => updateDraft(type, { axisValue: e.target.value })}
                      placeholder={config.placeholder}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCreateSection(type)}
                    disabled={!isAdmin || !draft.name.trim() || creating}
                  >
                    <Plus className="h-3 w-3" /> Crear sección
                  </Button>
                </div>

                {currentSections.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Secciones existentes — clic para entrar</p>
                    <div className="flex flex-wrap gap-1">
                      {currentSections.map((section) => (
                        <Badge
                          key={section.id}
                          variant="outline"
                          className="text-[10px] h-6 gap-1 pr-1 cursor-pointer hover:bg-accent/60 transition-colors"
                          onClick={() => setActiveSection(section)}
                        >
                          <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                          {section.name} ({section.axis}={section.axisValue})
                          {isAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id); }}
                              className="ml-0.5 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
