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

interface PolygonVertex { x: number; y: number; }

interface WorkspaceRoom {
  id: string;
  name: string;
  height: number | null;
  has_floor: boolean;
  has_ceiling: boolean;
  has_roof: boolean;
  vertical_section_id: string | null;
  floor_polygon: PolygonVertex[] | null;
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
        .select('id, name, height, has_floor, has_ceiling, has_roof, vertical_section_id, floor_polygon')
        .eq('floor_plan_id', floorPlan.id);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        floor_polygon: r.floor_polygon ? (typeof r.floor_polygon === 'string' ? JSON.parse(r.floor_polygon) : r.floor_polygon) : null,
      })) as WorkspaceRoom[];
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

  // Build a name/id → zBase mapping from ALL vertical section polygons
  const verticalZBaseMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const vs of allSections.filter(s => s.sectionType === 'vertical')) {
      const polys = vs.polygons;
      if (polys) {
        for (const p of polys) {
          map.set(p.id, vs.axisValue);
          if (p.name) map.set(`name:${p.name}`, vs.axisValue);
        }
      }
    }
    return map;
  }, [allSections]);

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

  /** Compute auto-projected polygons for Y/X sections from workspace rooms */
  const computeProjectedPolygons = useCallback((section: CustomSection): SectionPolygon[] => {
    if (section.sectionType === 'vertical') return [];
    if (!workspaceRooms || workspaceRooms.length === 0) return [];

    const verticalSections = allSections.filter(s => s.sectionType === 'vertical');
    const defaultHeight = 2.5; // fallback metres

    // For transversal sections (X cut), compute maxY to invert Y axis
    let globalMaxY = 0;
    if (section.sectionType === 'transversal') {
      for (const r of workspaceRooms) {
        if (!r.floor_polygon) continue;
        for (const v of r.floor_polygon) {
          if (v.y > globalMaxY) globalMaxY = v.y;
        }
      }
    }

    /** Resolve zBase for a room using the precomputed map + fallbacks */
    const resolveZBase = (room: WorkspaceRoom): number => {
      // 1) Check by room ID in vertical section polygons
      const byId = verticalZBaseMap.get(room.id);
      if (byId !== undefined) return byId;
      // 2) Check by room name in vertical section polygons
      const byName = verticalZBaseMap.get(`name:${room.name}`);
      if (byName !== undefined) return byName;
      // 3) Direct match by vertical_section_id
      const direct = verticalSections.find(s => s.id === room.vertical_section_id);
      if (direct) return direct.axisValue;
      // 4) Search vertical sections for a saved polygon whose id or name matches
      for (const vs of verticalSections) {
        const polys = vs.polygons;
        if (polys?.some(p => p.id === room.id || p.name === room.name)) return vs.axisValue;
      }
      return 0;
    };

    const projected: SectionPolygon[] = [];

    for (const room of workspaceRooms) {
      if (!room.floor_polygon || room.floor_polygon.length < 3) continue;
      const poly = room.floor_polygon;
      const cutAxis = section.sectionType === 'longitudinal' ? 'y' : 'x';
      const axisVal = section.axisValue;

      const intersections = findPolyIntersections(poly, cutAxis, axisVal);
      if (intersections.length < 2) continue;

      // For transversal sections, invert Y: section_h = maxY - polygon_y
      const mappedIntersections = section.sectionType === 'transversal'
        ? intersections.map(v => globalMaxY - v)
        : intersections;

      const hMin = Math.min(...mappedIntersections);
      const hMax = Math.max(...mappedIntersections);
      if (Math.abs(hMax - hMin) < 0.01) continue;

      // Determine Z base from vertical section with fallback resolution
      const zBase = resolveZBase(room);
      const heightM = room.height || defaultHeight;
      const defaultZTop = zBase + Math.round((heightM * 1000) / 250);

      // Check wall heights for non-uniform tops
      const getWallZTop = (wallIndex: number): number => {
        const wall = (allWalls || []).find(w => w.room_id === room.id && w.wall_index === wallIndex);
        if (wall?.height != null && wall.height > 0) {
          return zBase + Math.round((wall.height * 1000) / 250);
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

      projected.push({
        id: room.id,
        name: room.name,
        vertices: [
          { x: hMin, y: zBase, z: 0 },
          { x: hMax, y: zBase, z: 0 },
          { x: hMax, y: zTopRight, z: 0 },
          { x: hMin, y: zTopLeft, z: 0 },
        ],
        zBase,
        zTop: Math.max(zTopLeft, zTopRight),
        hasFloor: room.has_floor,
        hasCeiling: room.has_ceiling,
      });
    }
    return projected;
  }, [workspaceRooms, allWalls, allSections]);

  // If viewing a section, show the viewer
  if (activeSection) {
    const liveSection = allSections.find(s => s.id === activeSection.id) || activeSection;
    const savedScale = (liveSection as any).scale as { hScale: number; vScale: number } | undefined;
    const savedNegLimits = (liveSection as any).negLimits as { negH: number; negV: number } | undefined;

    // Merge: auto-projected polygons + manually saved ones (saved override auto by id)
    const savedPolys = liveSection.polygons || [];
    const autoPolys = computeProjectedPolygons(liveSection);
    const savedIds = new Set(savedPolys.map(p => p.id));
    const mergedPolygons = [
      ...savedPolys,
      ...autoPolys.filter(ap => !savedIds.has(ap.id)),
    ];

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
          savedNegLimits={savedNegLimits}
          onSaveNegLimits={(limits) => handleSaveNegLimits(liveSection.id, limits)}
          ridgeLine={ridgeLine}
          polygons={mergedPolygons}
          onSavePolygons={(polys) => handleSavePolygons(liveSection.id, polys)}
          savedRulerLines={(liveSection as any).rulerLines || []}
          onSaveRulerLines={(lines) => handleSaveRulerLines(liveSection.id, lines)}
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
