import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Plus, Trash2, ArrowLeft, Eye, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomSection, SectionPolygon } from './CustomSectionManager';
import { SectionAxisViewer } from './SectionAxisViewer';
import type { PolygonFacePatterns } from './SectionAxisViewer';
import { SnapshotRestoreButton } from './SnapshotRestoreButton';

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
  updated_at: string | null;
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
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWorkspaceNameLoose(value: string | null | undefined): string {
  return normalizeWorkspaceName(value)
    .replace(/\b(techo|cubierta|suelo|piso|planta|roof|ceiling|floor)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRoofLikeName(value: string | null | undefined): boolean {
  const normalized = normalizeWorkspaceName(value);
  return /\b(techo|cubierta|roof|ceiling)\b/.test(normalized);
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
  vertical: { title: 'Secciones Z', axis: 'Z', axisLabel: 'Eje Z', placeholder: '0' },
  longitudinal: { title: 'Secciones Y', axis: 'Y', axisLabel: 'Eje Y', placeholder: '0' },
  transversal: { title: 'Secciones X', axis: 'X', axisLabel: 'Eje X', placeholder: '0' },
};

const INITIAL_DRAFTS: Record<SectionType, SectionDraft> = {
  vertical: { name: '', axisValue: '0' },
  longitudinal: { name: '', axisValue: '0' },
  transversal: { name: '', axisValue: '0' },
};

export function CartesianAxesXYZTab({ budgetId, isAdmin }: CartesianAxesXYZTabProps) {
  const queryClient = useQueryClient();
  const [openCreator, setOpenCreator] = useState<SectionType | null>('vertical');
  const [drafts, setDrafts] = useState<Record<SectionType, SectionDraft>>(INITIAL_DRAFTS);
  const [creating, setCreating] = useState(false);
  const [activeSection, setActiveSection] = useState<CustomSection | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionAxisValue, setEditSectionAxisValue] = useState('');

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
        .select('id, name, height, has_floor, has_ceiling, has_roof, vertical_section_id, floor_id, floor_polygon, updated_at')
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

  const parseCustomCorners = useCallback((): Record<string, unknown> => {
    try {
      const raw = typeof floorPlan?.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan?.custom_corners;

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }, [floorPlan?.custom_corners]);

  const invalidateSectionQueries = useCallback(() => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-rooms-for-projection', budgetId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-walls-for-projection', budgetId] }),
      queryClient.invalidateQueries({ queryKey: ['wall-object-surfaces-for-projection', budgetId] }),
    ]);
  }, [budgetId, queryClient]);

  const resetAllSectionsAndWorkspaces = useCallback(async () => {
    if (!floorPlan?.id) return;

    const { data: roomRows, error: roomError } = await supabase
      .from('budget_floor_plan_rooms')
      .select('id')
      .eq('floor_plan_id', floorPlan.id);
    if (roomError) throw roomError;

    const roomIds = (roomRows || []).map(r => r.id);

    let wallIds: string[] = [];
    if (roomIds.length > 0) {
      const { data: wallRows, error: wallError } = await supabase
        .from('budget_floor_plan_walls')
        .select('id')
        .in('room_id', roomIds);
      if (wallError) throw wallError;
      wallIds = (wallRows || []).map(w => w.id);
    }

    const childCleanupOps: any[] = [];

    if (wallIds.length > 0) {
      childCleanupOps.push(
        supabase.from('budget_floor_plan_openings').delete().in('wall_id', wallIds),
        supabase.from('budget_floor_plan_block_groups').delete().in('wall_id', wallIds),
        supabase.from('budget_floor_plan_wall_layers').delete().in('wall_id', wallIds),
        supabase.from('budget_wall_objects').delete().in('wall_id', wallIds),
      );
    }

    if (roomIds.length > 0) {
      childCleanupOps.push(
        supabase.from('budget_activity_workspaces').delete().in('workspace_id', roomIds),
        supabase.from('budget_items').update({ workspace_id: null }).in('workspace_id', roomIds),
        supabase.from('budget_concepts').update({ workspace_id: null }).in('workspace_id', roomIds),
      );
    }

    if (childCleanupOps.length > 0) {
      const childResults = await Promise.all(childCleanupOps);
      const failedChildOp = childResults.find((result: any) => result?.error);
      if (failedChildOp?.error) throw failedChildOp.error;
    }

    if (roomIds.length > 0) {
      const { error: deleteWallsError } = await supabase
        .from('budget_floor_plan_walls')
        .delete()
        .in('room_id', roomIds);
      if (deleteWallsError) throw deleteWallsError;

      const { error: deleteRoomsError } = await supabase
        .from('budget_floor_plan_rooms')
        .delete()
        .in('id', roomIds);
      if (deleteRoomsError) throw deleteRoomsError;
    }

    const currentCorners = parseCustomCorners();
    const cleanCorners = {
      ...currentCorners,
      corners: [],
      manualElevations: [],
      customSections: [],
      rulerData: {},
      ridgeLine: null,
    };

    const { error: floorPlanError } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: cleanCorners as any })
      .eq('id', floorPlan.id);
    if (floorPlanError) throw floorPlanError;

    setActiveSection(null);
    await invalidateSectionQueries();
  }, [floorPlan?.id, invalidateSectionQueries, parseCustomCorners]);

  const handleDeleteSection = async (section: CustomSection) => {
    if (!isAdmin || !floorPlan?.id) return;

    const confirmed = window.confirm(`¿Eliminar solo la sección "${section.name}"? Esta acción no borrará las demás secciones.`);
    if (!confirmed) return;

    const parsedCorners = parseCustomCorners();
    const existingSections = Array.isArray(parsedCorners.customSections)
      ? parsedCorners.customSections as CustomSection[]
      : [];

    const nextCustomCorners = {
      ...parsedCorners,
      customSections: existingSections.filter(s => s.id !== section.id),
    };

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: nextCustomCorners as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al eliminar sección'); return; }

    toast.success('Sección eliminada');
    await invalidateSectionQueries();
  };

  const handleRenameSection = async (sectionId: string) => {
    if (!isAdmin || !floorPlan?.id || !editSectionName.trim()) return;

    const parsedCorners = parseCustomCorners();
    const existingSections = Array.isArray(parsedCorners.customSections)
      ? parsedCorners.customSections as CustomSection[]
      : [];

    const newAxisVal = parseFloat(editSectionAxisValue) || 0;
    const nextCustomCorners = {
      ...parsedCorners,
      customSections: existingSections.map(s =>
        s.id === sectionId ? { ...s, name: editSectionName.trim(), axisValue: newAxisVal } : s
      ),
    };

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: nextCustomCorners as any })
      .eq('id', floorPlan.id);

    if (error) { toast.error('Error al renombrar sección'); return; }

    toast.success('Sección renombrada');
    setEditingSectionId(null);
    await invalidateSectionQueries();
  };

  const handleDeleteAllSections = async () => {
    if (!isAdmin || !floorPlan?.id) return;

    const confirmed = window.confirm('Se eliminarán todas las secciones y todos los espacios para dejar el sistema en blanco. ¿Continuar?');
    if (!confirmed) return;

    try {
      await resetAllSectionsAndWorkspaces();
      toast.success('Limpieza total aplicada: sistema vacío y listo para empezar de nuevo.');
    } catch (error: any) {
      toast.error(`Error al limpiar todo: ${error?.message || 'inténtalo de nuevo'}`);
    }
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

  // Helper: read FRESH custom_corners from DB to avoid stale-state race conditions
  const readFreshCustomCorners = async (): Promise<Record<string, unknown>> => {
    if (!floorPlan?.id) return {};
    const { data } = await supabase
      .from('budget_floor_plans')
      .select('custom_corners')
      .eq('id', floorPlan.id)
      .single();
    if (!data) return {};
    try {
      return typeof data.custom_corners === 'string'
        ? JSON.parse(data.custom_corners)
        : (data.custom_corners || {}) as Record<string, unknown>;
    } catch { return {}; }
  };

  const handleSavePolygons = async (sectionId: string, polygons: import('./CustomSectionManager').SectionPolygon[]) => {
    if (!floorPlan?.id) return;
    const parsedCorners = await readFreshCustomCorners();

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
    const parsedCorners = await readFreshCustomCorners();

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

  // Build strict normalized-name → axis set mapping
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

  // Legacy loose mapping (strips descriptors like "techo") as last-resort fallback only
  const verticalLooseNameAxisMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const vs of verticalSections) {
      const polys = vs.polygons;
      if (!polys) continue;
      for (const p of polys) {
        const normalized = normalizeWorkspaceNameLoose(p.name);
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

  const verticalLooseNameAxisEntries = useMemo(
    () => Array.from(verticalLooseNameAxisMap.entries()),
    [verticalLooseNameAxisMap],
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

    // 6) Strict normalized name fallback (does not merge "Techo" with base room)
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

    // 7) Loose fallback only as last resort for legacy naming mismatches
    const looseRoomName = normalizeWorkspaceNameLoose(room.name);
    if (looseRoomName) {
      const directAxes = verticalLooseNameAxisMap.get(looseRoomName);
      if (directAxes && directAxes.size === 1) {
        return Array.from(directAxes)[0];
      }

      const partialAxes = new Set<number>();
      for (const [nameKey, axes] of verticalLooseNameAxisEntries) {
        if (nameKey.includes(looseRoomName) || looseRoomName.includes(nameKey)) {
          for (const axis of axes) partialAxes.add(axis);
        }
      }
      if (partialAxes.size === 1) {
        return Array.from(partialAxes)[0];
      }
    }

    return 0;
  }, [floorZBaseMap, verticalZBaseMap, verticalSections, legacyVerticalSectionZBaseMap, verticalNameAxisMap, verticalNameAxisEntries, verticalLooseNameAxisMap, verticalLooseNameAxisEntries]);

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

  // Collect canonical workspace names from vertical sections only.
  // This avoids stale X/Y ghost polygons from blocking legitimate workspace creation in Z.
  const allPolygonNames = useMemo(() => {
    const names = new Set<string>();
    for (const section of verticalSections) {
      for (const poly of (section.polygons || [])) {
        if (!poly.vertices || poly.vertices.length < 3) continue;
        if (poly.name?.trim()) names.add(poly.name.trim());
      }
    }
    return Array.from(names);
  }, [verticalSections]);

  // Set of room IDs that exist in any vertical (Z) section — used to filter auto-projection
  const validRoomIds = useMemo(() => {
    const ids = new Set<string>();
    for (const vs of verticalSections) {
      for (const p of (vs.polygons || [])) {
        if (!p.vertices || p.vertices.length < 3) continue;
        ids.add(p.id);
      }
    }
    return ids;
  }, [verticalSections]);

  // Map from room ID → canonical polygon name from Z sections (authoritative name)
  const canonicalNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const vs of verticalSections) {
      for (const p of (vs.polygons || [])) {
        if (!p.vertices || p.vertices.length < 3) continue;
        if (p.name) map.set(p.id, p.name);
      }
    }
    return map;
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

  const workspaceRoomsByLooseName = useMemo(() => {
    const map = new Map<string, WorkspaceRoom[]>();
    for (const room of (workspaceRooms || [])) {
      const key = normalizeWorkspaceNameLoose(room.name);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(room);
      map.set(key, list);
    }
    return map;
  }, [workspaceRooms]);

  const pickMostRecentlyUpdatedRoom = useCallback((rooms: WorkspaceRoom[]): WorkspaceRoom | null => {
    if (!rooms || rooms.length === 0) return null;
    return [...rooms].sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    })[0] || null;
  }, []);

  /** Compute auto-projected polygons for Y/X sections from workspace rooms */
  const computeProjectedPolygons = useCallback((section: CustomSection, otherSectionsOfSameType?: CustomSection[]): SectionPolygon[] => {
    if (section.sectionType === 'vertical') return [];

    // NOTE: We no longer exclude rooms just because they appear in sibling sections.
    // A workspace can legitimately intersect multiple X (or Y) planes.
    // The geometric intersection check (findPolyIntersections) is the authoritative filter.

    const defaultHeight = 2.5; // fallback metres
    // Z unit = 250mm (block_height_mm)
    const zUnitMm = 250;

    // Project only canonical workspaces from vertical (Z) sections.
    // This blocks stale duplicates/ghosts from re-entering X/Y during regeneration.
    const hasVerticalReference = validRoomIds.size > 0 || verticalRoomNameSet.size > 0;
    const allEligible = (workspaceRooms || []).filter(room => {
      if (!room.floor_polygon || room.floor_polygon.length < 3) return false;
      if (!hasVerticalReference) return true;
      return validRoomIds.has(room.id);
    });

    // Deduplicate by normalized name while keeping canonical IDs.
    // If there is no vertical reference at all, fallback to most recently updated by name.
    const eligibleRooms = (() => {
      const byName = new Map<string, WorkspaceRoom[]>();
      for (const room of allEligible) {
        // Use canonical name from Z section if available (prevents collisions when
        // a room was renamed in the rooms table but not in the section polygon)
        const effectiveName = canonicalNameMap.get(room.id) || room.name;
        const key = normalizeWorkspaceName(effectiveName);
        if (!key) continue;
        const list = byName.get(key) || [];
        list.push(room);
        byName.set(key, list);
      }

      const result: WorkspaceRoom[] = [];
      for (const [, rooms] of byName) {
        const canonical = rooms.filter(r => validRoomIds.has(r.id));
        const pool = canonical.length > 0
          ? canonical
          : (hasVerticalReference ? [] : rooms);

        if (pool.length === 0) continue;

        const winner = [...pool].sort((a, b) => {
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return bTime - aTime;
        })[0];

        if (winner) result.push(winner);
      }

      return result;
    })();

    // For transversal sections (X cut), keep Y orientation tied to the immutable origin.
    // No mirroring by point of view: Y=0 must remain the same reference side.
    const projected: SectionPolygon[] = [];
    const projectedKeys = new Set<string>();
    const sameTypeAxisValues = (otherSectionsOfSameType || [])
      .filter(s => s.sectionType === section.sectionType)
      .map(s => s.axisValue);
    const minSectionAxis = sameTypeAxisValues.length > 0 ? Math.min(...sameTypeAxisValues) : section.axisValue;
    const AXIS_EPS = 1e-6;

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

      // Prevent sibling bleed between adjacent sections:
      // only include polygons that cross this axis interval, not those that merely start here.
      const axisCoords = poly.map(v => v[cutAxis]).filter(Number.isFinite);
      if (axisCoords.length < 2) return;
      const polyMinAxis = Math.min(...axisCoords);
      const polyMaxAxis = Math.max(...axisCoords);
      const onMinBoundary = Math.abs(axisVal - polyMinAxis) <= AXIS_EPS;
      const isFirstSectionAxis = Math.abs(axisVal - minSectionAxis) <= AXIS_EPS;
      const belongsToSection =
        (axisVal > polyMinAxis + AXIS_EPS && axisVal <= polyMaxAxis + AXIS_EPS) ||
        (onMinBoundary && isFirstSectionAxis);
      if (!belongsToSection) return;

      const intersections = findPolyIntersections(poly, cutAxis, axisVal);
      if (intersections.length < 2) return;

      // Snap intersections to nearest grid node (0.5 unit) so polygon edges align with grid lines
      const hMin = Math.round(Math.min(...intersections) * 2) / 2;
      const hMax = Math.round(Math.max(...intersections) * 2) / 2;
      if (Math.abs(hMax - hMin) < 0.01) return;

      // Defensive dedupe (main+fallback sources)
      if (projectedKeys.has(key)) return;

      // Resolve effective height: room height → max wall height → default
      // Sanitize: if height > 50, assume it's in mm and convert to metres
      let effectiveHeightM = roomHeightM && roomHeightM > 0
        ? (roomHeightM > 50 ? roomHeightM / 1000 : roomHeightM)
        : null;

      // If room height is missing/zero, compute from individual wall heights (prisma with per-face heights)
      if (!effectiveHeightM && wallRoomId) {
        const roomWalls = (allWalls || []).filter(w => w.room_id === wallRoomId);
        const wallHeights = roomWalls
          .filter(w => w.height != null && w.height > 0)
          .map(w => w.height! > 50 ? w.height! / 1000 : w.height!);
        if (wallHeights.length > 0) {
          effectiveHeightM = Math.max(...wallHeights);
        }
      }

      // Also check vertical section polygons for this room's actual height (zTop/zBase)
      if (!effectiveHeightM) {
        for (const src of verticalPolygonSources) {
          if (src.polygon.id === key || src.polygon.name === roomName) {
            // Use zTop/zBase which store the actual height in mm or grid units
            if (typeof src.polygon.zTop === 'number' && typeof src.polygon.zBase === 'number') {
              const rawDelta = src.polygon.zTop - src.polygon.zBase;
              if (rawDelta > 0.01) {
                // If > 50 assume mm, otherwise grid units
                effectiveHeightM = rawDelta > 50
                  ? rawDelta / 1000
                  : Math.max(0.25, (rawDelta * zUnitMm) / 1000);
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
      // Use canonical name from Z section if available (authoritative)
      const displayName = canonicalNameMap.get(room.id) || room.name;
      pushProjectedRoom(
        room.id,
        displayName,
        room.floor_polygon,
        zBase,
        room.height,
        room.has_floor,
        room.has_ceiling,
        room.id,
      );
    }

    // 2) Fallback source: polygons drawn in vertical sections
    for (const src of verticalPolygonSources) {
      const normalized = normalizeWorkspaceName(src.polygon.name);
      const looseNormalized = normalizeWorkspaceNameLoose(src.polygon.name);
      const sourceIsRoofLike = isRoofLikeName(src.polygon.name);
      const directMatch = workspaceRoomMap.get(src.polygon.id) || null;
      const exactCandidates = normalized ? (workspaceRoomsByNormalizedName.get(normalized) || []) : [];

      let matchedRoom = directMatch;
      if (!matchedRoom && exactCandidates.length > 0) {
        const compatible = exactCandidates.filter(room => isRoofLikeName(room.name) === sourceIsRoofLike);
        matchedRoom = pickMostRecentlyUpdatedRoom(compatible.length > 0 ? compatible : exactCandidates);
      }

      if (!matchedRoom && looseNormalized) {
        const looseCandidates = workspaceRoomsByLooseName.get(looseNormalized) || [];
        if (looseCandidates.length > 0) {
          const compatible = looseCandidates.filter(room => isRoofLikeName(room.name) === sourceIsRoofLike);
          matchedRoom = pickMostRecentlyUpdatedRoom(compatible.length > 0 ? compatible : looseCandidates);
        }
      }

      // Avoid permissive partial-name matching here: it can inject wrong rooms in X/Y (ghost projections).
      // Keep fallback strict to direct ID / exact normalized match / loose legacy match only.

      const fallbackId = matchedRoom?.id || src.polygon.id;
      if (projectedKeys.has(fallbackId)) continue;

      const roomFootprint = matchedRoom?.floor_polygon && matchedRoom.floor_polygon.length >= 3
        ? matchedRoom.floor_polygon
        : null;
      const footprint: PolygonVertex[] = (roomFootprint || src.polygon.vertices).map(v => ({ x: v.x, y: v.y }));
      let inferredHeightM: number | null = null;
      if (typeof src.polygon.zTop === 'number' && typeof src.polygon.zBase === 'number') {
        const rawDelta = src.polygon.zTop - src.polygon.zBase;
        if (rawDelta > 50) {
          inferredHeightM = Math.max(0.25, rawDelta / 1000);
        } else {
          inferredHeightM = Math.max(0.25, (rawDelta * zUnitMm) / 1000);
        }
      }

      const resolvedZBase = matchedRoom ? resolveRoomZBase(matchedRoom) : src.axisValue;

      pushProjectedRoom(
        fallbackId,
        matchedRoom?.name || src.polygon.name || `Espacio ${src.axisValue}`,
        footprint,
        resolvedZBase,
        matchedRoom?.height ?? inferredHeightM ?? defaultHeight,
        matchedRoom?.has_floor ?? src.polygon.hasFloor,
        matchedRoom?.has_ceiling ?? src.polygon.hasCeiling,
        matchedRoom?.id,
      );
    }

    return projected;
  }, [workspaceRooms, allWalls, resolveRoomZBase, validRoomIds, verticalRoomNameSet, verticalPolygonSources, workspaceRoomsByNormalizedName, workspaceRoomsByLooseName, workspaceRoomMap, pickMostRecentlyUpdatedRoom, canonicalNameMap]);

  // If viewing a section, show the viewer
  if (activeSection) {
    const liveSection = allSections.find(s => s.id === activeSection.id) || activeSection;
    const savedScale = (liveSection as any).scale as { hScale: number; vScale: number } | undefined;
    const savedNegLimits = (liveSection as any).negLimits as { negH: number; negV: number; posH?: number; posV?: number } | undefined;

    // Merge: auto-projected polygons + manually saved ones.
    // For X/Y sections, rebase + heal stale legacy geometries (degenerate lines, mirrored X, invalid Z units).
    const savedPolys = liveSection.polygons || [];
    const normalizedSavedPolys = liveSection.sectionType === 'vertical'
      ? savedPolys
      : savedPolys.map(rebaseSavedPolygonToRoomLevel);

    const siblingSections = allSections.filter(s => s.sectionType === liveSection.sectionType);
    const autoPolys = computeProjectedPolygons(liveSection, siblingSections);
    const autoPolysById = new Map(autoPolys.map(p => [p.id, p]));
    const autoNameToId = new Map<string, string>();
    for (const poly of autoPolys) {
      const key = normalizeWorkspaceName(poly.name);
      if (key && !autoNameToId.has(key)) autoNameToId.set(key, poly.id);
    }

    const filteredSavedPolys = liveSection.sectionType === 'vertical'
      ? normalizedSavedPolys
      : normalizedSavedPolys.filter(poly => {
          // Always keep hidden markers (empty vertices = user explicitly hid this space)
          if (!poly.vertices || poly.vertices.length === 0) return true;
          // Always keep if it matches an auto-projected polygon
          if (autoPolysById.has(poly.id)) return true;

          // Keep explicit face-assignment polygons (wall / ceiling) created from workspace bindings
          if (/_wall\d+$/.test(poly.id) || /_ceiling$/.test(poly.id)) return true;

          // If this polygon belongs to a real workspace room but no longer projects here,
          // treat it as stale carry-over from another sibling section and drop it.
          if (workspaceRoomMap.has(poly.id)) return false;

          // For truly manual polygons (non-workspace IDs), keep them unless they collide by name
          // with a canonical auto-projection in this section.
          const key = normalizeWorkspaceName(poly.name);
          if (!key) return true;
          const canonicalId = autoNameToId.get(key);
          if (!canonicalId) return true;
          return canonicalId === poly.id;
        });

    const healedSavedPolys = liveSection.sectionType === 'vertical'
      ? filteredSavedPolys
      : filteredSavedPolys.map(p => maybeHealLegacySavedPolygon(
          p,
          autoPolysById.get(p.id),
          liveSection.sectionType as 'vertical' | 'longitudinal' | 'transversal',
        ));

    const hiddenNameKeys = new Set(
      healedSavedPolys
        .filter(p => !p.vertices || p.vertices.length === 0)
        .map(p => normalizeWorkspaceName(p.name))
        .filter(Boolean),
    );

    const savedIds = new Set(healedSavedPolys.map(p => p.id));
    const mergedPolygons = [
      ...healedSavedPolys,
      ...autoPolys.filter(ap => {
        if (savedIds.has(ap.id)) return false;
        const key = normalizeWorkspaceName(ap.name);
        return !(key && hiddenNameKeys.has(key));
      }),
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
          // Sanitize: ignore absurd values (>100 grid units = likely mm-encoded bug)
          if (Number.isFinite(v.x) && v.x < 100) maxX = Math.max(maxX, v.x);
          if (Number.isFinite(v.y) && v.y < 100) maxY = Math.max(maxY, v.y);
        }
      }

      // Cap auto-expansion to prevent unmanageable grids (max ~40 cells per axis)
      const MAX_AUTO = 40;
      return {
        negH: 0,
        negV: 0,
        posH: Math.min(MAX_AUTO, Math.max(base.posH, Math.ceil(maxX) + 2)),
        posV: Math.min(MAX_AUTO, Math.max(base.posV, Math.ceil(maxY) + 2)),
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
        <div className="flex items-center gap-2 flex-wrap">
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
          key={liveSection.id}
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
          onRegenerate={liveSection.sectionType !== 'vertical' ? async () => {
            // Regenerate: recompute auto-projected polygons and merge with existing ones
            const siblingSections = allSections.filter(s => s.sectionType === liveSection.sectionType);
            const autoPolys = computeProjectedPolygons(liveSection, siblingSections);
            const autoById = new Map(autoPolys.map(p => [p.id, p]));
            const autoNameToId = new Map<string, string>();
            for (const poly of autoPolys) {
              const key = normalizeWorkspaceName(poly.name);
              if (key && !autoNameToId.has(key)) autoNameToId.set(key, poly.id);
            }

            const parsedCorners = parseCustomCorners();
            const sections = Array.isArray(parsedCorners.customSections)
              ? (parsedCorners.customSections as CustomSection[])
              : [];
            const currentSection = sections.find(s => s.id === liveSection.id);
            const existingPolygons = currentSection?.polygons || [];

            // Remove stale duplicates that only differ by old IDs but collide by normalized auto name.
            // Keep hidden markers (vertices:[]) so user-deleted spaces do not reappear.
            const cleanedExisting = existingPolygons.filter((p: SectionPolygon) => {
              if (!p.vertices || p.vertices.length === 0) return true;
              if (autoById.has(p.id)) return true;
              if (/_wall\d+$/.test(p.id) || /_ceiling$/.test(p.id)) return true;
              const key = normalizeWorkspaceName(p.name);
              if (!key) return true;
              return !autoNameToId.has(key);
            });

            // Update existing polygons from auto-projection, including canonical name and flags
            const updatedExisting = cleanedExisting.map((p: SectionPolygon) => {
              const auto = autoById.get(p.id);
              if (!auto) return p;
              const shouldUpdateGeometry = p.vertices.length === auto.vertices.length && p.vertices.length === 4;
              return {
                ...p,
                name: auto.name,
                hasFloor: auto.hasFloor,
                hasCeiling: auto.hasCeiling,
                zBase: auto.zBase,
                zTop: auto.zTop,
                vertices: shouldUpdateGeometry ? auto.vertices : p.vertices,
              };
            });

            const hiddenNameKeys = new Set(
              updatedExisting
                .filter((p: SectionPolygon) => !p.vertices || p.vertices.length === 0)
                .map((p: SectionPolygon) => normalizeWorkspaceName(p.name))
                .filter(Boolean),
            );

            const existingIds = new Set(updatedExisting.map((p: SectionPolygon) => p.id));
            const newPolys = autoPolys.filter(ap => {
              if (existingIds.has(ap.id)) return false;
              const key = normalizeWorkspaceName(ap.name);
              return !(key && hiddenNameKeys.has(key));
            });

            const mergedPolygons = [...updatedExisting, ...newPolys];
            const removedStale = existingPolygons.length - cleanedExisting.length;
            const updated = sections.map(s =>
              s.id === liveSection.id ? { ...s, polygons: mergedPolygons } : s
            );
            await supabase.from('budget_floor_plans')
              .update({ custom_corners: { ...parsedCorners, customSections: updated } as any })
              .eq('id', floorPlan!.id);
            await invalidateSectionQueries();
            toast.success(`Espacios regenerados: ${newPolys.length} nuevos, ${updatedExisting.length} actualizados${removedStale > 0 ? `, ${removedStale} duplicados limpiados` : ''}`);
          } : undefined}
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
        <div className="flex items-center gap-2">
          <SnapshotRestoreButton
            budgetId={budgetId}
            module="plano"
            onRestored={() => {
              setActiveSection(null);
              invalidateSectionQueries();
            }}
          />
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
                    <p className="text-[11px] font-medium text-muted-foreground">Secciones existentes — clic para entrar, lápiz para editar nombre</p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentSections.map((section) => (
                        editingSectionId === section.id ? (
                          <div key={section.id} className="flex items-center gap-1 rounded border border-primary/40 bg-card px-1.5 py-0.5" onClick={e => e.stopPropagation()}>
                            <Input
                              className="h-5 text-[10px] w-24 px-1"
                              value={editSectionName}
                              onChange={e => setEditSectionName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSection(section.id);
                                if (e.key === 'Escape') setEditingSectionId(null);
                              }}
                              autoFocus
                            />
                            <Input
                              className="h-5 text-[10px] w-12 px-1"
                              type="number"
                              value={editSectionAxisValue}
                              onChange={e => setEditSectionAxisValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSection(section.id);
                                if (e.key === 'Escape') setEditingSectionId(null);
                              }}
                            />
                            <button onClick={() => handleRenameSection(section.id)} className="text-primary hover:text-primary/80">
                              <Check className="h-3 w-3" />
                            </button>
                            <button onClick={() => setEditingSectionId(null)} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <Badge
                            key={section.id}
                            variant="outline"
                            className="text-[10px] h-6 gap-1 pr-1 cursor-pointer hover:bg-accent/60 transition-colors"
                            onClick={() => setActiveSection(section)}
                          >
                            <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                            {section.name} ({section.axis}={section.axisValue})
                            {isAdmin && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSectionId(section.id);
                                    setEditSectionName(section.name);
                                    setEditSectionAxisValue(String(section.axisValue));
                                  }}
                                  className="ml-0.5 hover:text-primary transition-colors"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteSection(section); }}
                                  className="ml-0.5 hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </>
                            )}
                          </Badge>
                        )
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
