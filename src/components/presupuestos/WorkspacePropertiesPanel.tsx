import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Box, Layers, Paintbrush, Plus, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Link2, Search, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VISUAL_PATTERNS, PATTERN_CATEGORIES, getPatternById, patternPreviewDataUri, type VisualPattern } from '@/lib/visual-patterns';
import { normalizeSearchText } from '@/lib/search-utils';

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'tejado', label: 'Tejado' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'interior_invisible', label: 'Int. invisible' },
  { value: 'invisible', label: 'Invisible' },
];

const FLOOR_CEILING_TYPES = [
  { value: 'normal', label: 'Normal' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'shared', label: 'Compartido' },
];

const OBJECT_TYPES = [
  { value: 'hueco', label: '🚪 Hueco (vacío)' },
  { value: 'material', label: '🧱 Material' },
  { value: 'bloque', label: '📦 Bloque' },
  { value: 'aislamiento', label: '🧊 Aislamiento' },
  { value: 'revestimiento', label: '🎨 Revestimiento' },
  { value: 'estructura', label: '🏗️ Estructura' },
  { value: 'instalacion', label: '⚡ Instalación' },
  { value: 'otro', label: '📋 Otro' },
];

// Preset templates for quick object creation
const OBJECT_PRESETS = [
  { label: 'Ventana pequeña', type: 'hueco', width: 1000, height: 800, sill: 1200 },
  { label: 'Ventana mediana', type: 'hueco', width: 1500, height: 1250, sill: 1000 },
  { label: 'Ventana grande', type: 'hueco', width: 2000, height: 1500, sill: 800 },
  { label: 'Puerta estándar', type: 'hueco', width: 900, height: 2100, sill: 0 },
  { label: 'Puerta doble', type: 'hueco', width: 1600, height: 2100, sill: 0 },
  { label: 'Puerta balconera', type: 'hueco', width: 1800, height: 2200, sill: 0 },
];

function normalizeWallType(type?: string | null): string {
  switch (type) {
    case 'external': return 'exterior';
    case 'internal': return 'interior';
    case 'shared': return 'interior_compartida';
    default: return type || 'exterior';
  }
}

function isInvisibleWallType(type?: string | null): boolean {
  const normalized = (type || '').toLowerCase();
  return normalized.includes('invisible');
}

interface WallRecord {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  height: number | null;
}

interface WallObjectRecord {
  id: string;
  wall_id: string;
  layer_order: number;
  name: string;
  description: string | null;
  visual_pattern: string | null;
  surface_m2: number | null;
  volume_m3: number | null;
  object_type: string;
  thickness_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  position_x: number | null;
  sill_height: number | null;
  distance_to_wall: number | null;
  resource_id: string | null;
  template_id: string | null;
  coord_x: number | null;
  coord_y: number | null;
  coord_z: number | null;
  shown_in_section: boolean;
}

export interface FacePatterns {
  [faceKey: string]: string | null;
}

interface WorkspacePropertiesPanelProps {
  workspaceId: string;
  workspaceName: string;
  sectionType: string;
  sectionName: string;
  floorPlanId?: string;
  onClose: () => void;
  focusFace?: string;
  edgeCount?: number;
  vertices?: Array<{ x: number; y: number }>;
  onPatternChange?: (faceKey: string, patternId: string | null) => void;
  onOpeningsChange?: () => void;
  localFaceTypes?: Record<string, string>;
  onLocalFaceTypeChange?: (faceKey: string, wallType: string) => void;
}

interface ExternalResourceOption {
  id: string;
  name: string;
  resource_type: string | null;
  unit_cost: number;
  unit_measure: string | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
}

export function WorkspacePropertiesPanel({
  workspaceId,
  workspaceName,
  sectionType,
  sectionName,
  floorPlanId,
  onClose,
  focusFace,
  edgeCount: edgeCountProp,
  vertices: verticesProp,
  onPatternChange,
  onOpeningsChange,
  localFaceTypes,
  onLocalFaceTypeChange,
}: WorkspacePropertiesPanelProps) {
  const [walls, setWalls] = useState<WallRecord[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wallObjects, setWallObjects] = useState<WallObjectRecord[]>([]);
  const [expandedFace, setExpandedFace] = useState<string | null>(focusFace || null);
  const [patternPickerFace, setPatternPickerFace] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});
  const [cellSizeM, setCellSizeM] = useState(1);

  // Object form state
  const [showObjectForm, setShowObjectForm] = useState(false);
  const [objName, setObjName] = useState('');
  const [objType, setObjType] = useState('material');
  const [objLayerOrder, setObjLayerOrder] = useState('1');
  const [objThickness, setObjThickness] = useState('');
  const [objDescription, setObjDescription] = useState('');
  const [objWidthMm, setObjWidthMm] = useState('');
  const [objHeightMm, setObjHeightMm] = useState('');
  const [objSillHeight, setObjSillHeight] = useState('');
  const [objPosX, setObjPosX] = useState('');
  const [objDistWall, setObjDistWall] = useState('');
  const [objTargetFace, setObjTargetFace] = useState('wall-0');
  const [objPreset, setObjPreset] = useState('');
  const [objResourceId, setObjResourceId] = useState('_none');
  const [objCoordX, setObjCoordX] = useState('');
  const [objCoordY, setObjCoordY] = useState('');
  const [objCoordZ, setObjCoordZ] = useState('');
  const [objShownInSection, setObjShownInSection] = useState(false);

  // Resource linking
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [resources, setResources] = useState<ExternalResourceOption[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [formResourceSearch, setFormResourceSearch] = useState('');
  const [formResourceOpen, setFormResourceOpen] = useState(false);

  // DB templates for "Elegir plantilla"
  const [dbTemplates, setDbTemplates] = useState<Array<{ id: string; name: string; object_type: string; width_mm: number | null; height_mm: number | null; thickness_mm: number | null; unit_measure: string | null; }>>([]);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);

  // Positioning state
  const [positioningObjId, setPositioningObjId] = useState<string | null>(null);

  // Active tab: 'faces' | 'objects'
  const [activeTab, setActiveTab] = useState<'faces' | 'objects'>('faces');
  const [isRegeneratingSuperficies, setIsRegeneratingSuperficies] = useState(false);
  const [editingSuperficieId, setEditingSuperficieId] = useState<string | null>(null);
  const [manualSurfaceValue, setManualSurfaceValue] = useState('');
  const [manualVolumeValue, setManualVolumeValue] = useState('');
  const [savingManualSuperficie, setSavingManualSuperficie] = useState(false);

  const getFaceLabel = useCallback((wallIndex: number, wallType?: string) => {
    if (wallIndex === -1) return 'Suelo';
    if (wallIndex === -2) return 'Techo';
    if (wallIndex === 0) return 'Espacio';
    if (wallType === 'tejado') return `T${wallIndex}`;
    return `Pared ${wallIndex}`;
  }, []);

  const getEffectivePolygon = useCallback((roomData: any): Array<{ x: number; y: number }> | null => {
    if (Array.isArray(verticesProp) && verticesProp.length >= 3) {
      return verticesProp;
    }

    if (Array.isArray(roomData?.floor_polygon) && roomData.floor_polygon.length >= 3) {
      return roomData.floor_polygon as Array<{ x: number; y: number }>;
    }

    return null;
  }, [verticesProp]);

  const getFaceMetrics = useCallback((roomData: any, wallIndex: number, cellSize: number, wallType?: string) => {
    const polygon = getEffectivePolygon(roomData);

    const floorAreaRaw = (() => {
      if (!polygon) return (roomData?.length || 0) * (roomData?.width || 0);
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
      }
      return Math.abs(area) / 2 * cellSize * cellSize;
    })();

    const floorArea = Math.round(floorAreaRaw * 100) / 100;
    const heightM = roomData?.height || 2.5;

    if (wallIndex === 0) {
      return {
        surface_m2: null as number | null,
        volume_m3: Math.round(floorAreaRaw * heightM * 1000) / 1000,
      };
    }

    if (wallIndex === -1) {
      // Floor: return 0 if workspace has no floor or wall is invisible
      const hasFloor = roomData?.has_floor !== false;
      const floorVisible = !isInvisibleWallType(wallType);
      return {
        surface_m2: hasFloor && floorVisible ? floorArea : 0,
        volume_m3: null as number | null,
      };
    }

    if (wallIndex === -2) {
      // Ceiling: return 0 if workspace has no ceiling or wall is invisible
      const hasCeiling = roomData?.has_ceiling !== false;
      const ceilingVisible = !isInvisibleWallType(wallType);
      return {
        surface_m2: hasCeiling && ceilingVisible ? floorArea : 0,
        volume_m3: null as number | null,
      };
    }

    let wallLengthM = 0;
    if (polygon) {
      const edgeCount = polygon.length;
      const edgeIndex = ((wallIndex - 1) % edgeCount + edgeCount) % edgeCount;
      const a = polygon[edgeIndex];
      const b = polygon[(edgeIndex + 1) % edgeCount];
      wallLengthM = Math.hypot(b.x - a.x, b.y - a.y) * cellSize;
    } else {
      wallLengthM = wallIndex % 2 === 1 ? (roomData?.length || 0) : (roomData?.width || 0);
    }

    return {
      surface_m2: Math.round(wallLengthM * heightM * 100) / 100,
      volume_m3: null as number | null,
    };
  }, [getEffectivePolygon]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomRes, wallsRes] = await Promise.all([
        supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle(),
        supabase.from('budget_floor_plan_walls').select('*').eq('room_id', workspaceId).order('wall_index'),
      ]);

      const roomData = roomRes.data;
      if (!roomData) {
        setRoom(null);
        setWalls([]);
        setWallObjects([]);
        return;
      }

      let nextWalls = (wallsRes.data || []) as WallRecord[];

      // Sync floor/ceiling wall visibility from room flags (room flags are source of truth)
      if (nextWalls.length > 0) {
        const floorWall = nextWalls.find(w => w.wall_index === -1);
        const ceilingWall = nextWalls.find(w => w.wall_index === -2);
        const wallUpdates: Array<{ id: string; wall_type: string }> = [];

        if (floorWall) {
          const floorShouldBeInvisible = roomData.has_floor === false;
          const floorIsInvisible = isInvisibleWallType(floorWall.wall_type);
          if (floorShouldBeInvisible !== floorIsInvisible) {
            wallUpdates.push({
              id: floorWall.id,
              wall_type: floorShouldBeInvisible ? 'invisible' : 'suelo_basico',
            });
          }
        }

        if (ceilingWall) {
          const ceilingShouldBeInvisible = roomData.has_ceiling === false;
          const ceilingIsInvisible = isInvisibleWallType(ceilingWall.wall_type);
          if (ceilingShouldBeInvisible !== ceilingIsInvisible) {
            wallUpdates.push({
              id: ceilingWall.id,
              wall_type: ceilingShouldBeInvisible ? 'invisible' : 'techo_basico',
            });
          }
        }

        if (wallUpdates.length > 0) {
          await Promise.all(
            wallUpdates.map(update =>
              supabase
                .from('budget_floor_plan_walls')
                .update({ wall_type: update.wall_type })
                .eq('id', update.id),
            ),
          );

          const updatedWallTypeById = new Map(wallUpdates.map(update => [update.id, update.wall_type]));
          nextWalls = nextWalls.map(wall => {
            const nextType = updatedWallTypeById.get(wall.id);
            return nextType ? { ...wall, wall_type: nextType } : wall;
          });
        }
      }

      let nextCellSizeM = 1;
      if (roomData.floor_plan_id) {
        const { data: floorPlanScale } = await supabase
          .from('budget_floor_plans')
          .select('scale_mode, block_length_mm')
          .eq('id', roomData.floor_plan_id)
          .maybeSingle();

        if (floorPlanScale?.scale_mode === 'bloque') {
          nextCellSizeM = (floorPlanScale.block_length_mm || 625) / 1000;
        }
      }
      setCellSizeM(nextCellSizeM);

      // Ensure all face records exist (walls + suelo + techo + espacio)
      // Fallback chain: prop → provided vertices → DB polygon → existing wall records → default 4
      const effectivePolygon = getEffectivePolygon(roomData);
      const polyCountFromSource = effectivePolygon?.length || 0;
      const polyCountFromDb = Array.isArray(roomData.floor_polygon) ? roomData.floor_polygon.length : 0;
      const existingWallMax = nextWalls.reduce((max, w) => (w.wall_index > max ? w.wall_index : max), 0);
      const expectedStructuralCount = edgeCountProp ?? (polyCountFromSource > 0
        ? polyCountFromSource
        : polyCountFromDb > 0
          ? polyCountFromDb
          : existingWallMax > 0
            ? existingWallMax
            : 4);

      const missingWallPayloads: Array<{ room_id: string; wall_index: number; wall_type: string }> = [];

      for (let i = 1; i <= expectedStructuralCount; i++) {
        if (!nextWalls.some(w => w.wall_index === i)) {
          missingWallPayloads.push({ room_id: workspaceId, wall_index: i, wall_type: 'exterior' });
        }
      }

      const defaultFaceWalls = [
        { wall_index: -1, wall_type: roomData.has_floor === false ? 'invisible' : 'suelo_basico' },
        { wall_index: -2, wall_type: roomData.has_ceiling === false ? 'invisible' : 'techo_basico' },
        { wall_index: 0, wall_type: 'espacio' },
      ];

      for (const face of defaultFaceWalls) {
        if (!nextWalls.some(w => w.wall_index === face.wall_index)) {
          missingWallPayloads.push({ room_id: workspaceId, wall_index: face.wall_index, wall_type: face.wall_type });
        }
      }

      if (missingWallPayloads.length > 0) {
        const { data: insertedWalls, error: insertedWallsError } = await supabase
          .from('budget_floor_plan_walls')
          .insert(missingWallPayloads)
          .select('*');

        if (insertedWallsError) {
          console.error('Error creando caras faltantes:', insertedWallsError);
        }

        if (insertedWalls?.length) {
          nextWalls = [...nextWalls, ...(insertedWalls as WallRecord[])];
        }
      }

      nextWalls = [...nextWalls].sort((a, b) => a.wall_index - b.wall_index);

      // Ensure automatic Superficie (layer 0) exists and is synced for every face
      if (nextWalls.length > 0) {
        const wallIds = nextWalls.map(w => w.id);

        const { data: existingSuperficies, error: existingSuperficiesError } = await supabase
          .from('budget_wall_objects')
          .select('id, wall_id, surface_m2, volume_m3, description')
          .in('wall_id', wallIds)
          .eq('layer_order', 0)
          .eq('name', 'Superficie');

        if (existingSuperficiesError) {
          console.error('Error consultando capas Superficie:', existingSuperficiesError);
        }

        const existingByWall = new Map<string, {
          id: string;
          surface_m2: number | null;
          volume_m3: number | null;
          description: string | null;
        }>();

        (existingSuperficies || []).forEach((row: any) => {
          if (!existingByWall.has(row.wall_id)) {
            existingByWall.set(row.wall_id, {
              id: row.id,
              surface_m2: row.surface_m2 ?? null,
              volume_m3: row.volume_m3 ?? null,
              description: row.description ?? null,
            });
          }
        });

        const mustForceZeroForFace = (wall: WallRecord) => {
          if (wall.wall_index === -1) {
            return roomData.has_floor === false || isInvisibleWallType(wall.wall_type);
          }
          if (wall.wall_index === -2) {
            return roomData.has_ceiling === false || isInvisibleWallType(wall.wall_type);
          }
          return false;
        };

        const updates = nextWalls
          .map(w => {
            const existing = existingByWall.get(w.id);
            if (!existing) return null;
            if (!mustForceZeroForFace(w)) return null;

            const baseLabel = `${workspaceName} / ${getFaceLabel(w.wall_index)}`;
            const needsMetricUpdate = existing.surface_m2 === null || Math.abs(existing.surface_m2) > 0.0001 || existing.volume_m3 !== null;
            const needsDescriptionUpdate = !(existing.description || '').includes('— 0 m²');

            if (!needsMetricUpdate && !needsDescriptionUpdate) {
              return null;
            }

            return {
              id: existing.id,
              payload: {
                name: 'Superficie',
                description: `${baseLabel} — 0 m²`,
                object_type: 'material',
                is_core: false,
                layer_order: 0,
                surface_m2: 0,
                volume_m3: null as number | null,
              },
            };
          })
          .filter((update): update is {
            id: string;
            payload: {
              name: string;
              description: string;
              object_type: string;
              is_core: boolean;
              layer_order: number;
              surface_m2: number;
              volume_m3: number | null;
            };
          } => update !== null);

        const inserts = nextWalls
          .filter(w => !existingByWall.has(w.id))
          .map(w => {
            const { surface_m2, volume_m3 } = getFaceMetrics(roomData, w.wall_index, nextCellSizeM, w.wall_type);
            const metricLabel = surface_m2 != null ? `${surface_m2} m²` : volume_m3 != null ? `${volume_m3} m³` : null;
            return {
              wall_id: w.id,
              layer_order: 0,
              name: 'Superficie',
              description: `${workspaceName} / ${getFaceLabel(w.wall_index)}${metricLabel ? ` — ${metricLabel}` : ''}`,
              object_type: 'material',
              is_core: false,
              surface_m2,
              volume_m3,
              visual_pattern: 'vacio',
            };
          });

        console.log(`[Superficie Auto] walls=${nextWalls.length}, existing=${existingByWall.size}, toInsert=${inserts.length}, toUpdate=${updates.length}`);

        const mutationResults = await Promise.all([
          ...updates.map(u => supabase.from('budget_wall_objects').update(u.payload).eq('id', u.id)),
          ...(inserts.length > 0 ? [supabase.from('budget_wall_objects').insert(inserts)] : []),
        ]);

        const mutationError = mutationResults.find(result => result.error)?.error;
        if (mutationError) {
          throw mutationError;
        }

        const { data: objData, error: objError } = await supabase
          .from('budget_wall_objects')
          .select('*')
          .in('wall_id', wallIds)
          .order('layer_order', { ascending: true });

        if (objError) {
          throw objError;
        }

        setWallObjects((objData || []) as WallObjectRecord[]);
      } else {
        setWallObjects([]);
      }

      setRoom(roomData);
      setWalls(nextWalls);
    } finally {
      setLoading(false);
    }
  }, [edgeCountProp, getFaceLabel, getFaceMetrics, workspaceId, workspaceName]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (focusFace) setExpandedFace(focusFace); }, [focusFace]);

  const handleRegenerateSuperficies = async () => {
    if (isRegeneratingSuperficies) return;
    setIsRegeneratingSuperficies(true);
    try {
      if (!room) {
        const roomReady = await ensureRoomRecord();
        if (!roomReady) {
          throw new Error('No se pudo preparar el espacio de trabajo');
        }
      }

      await fetchData();

      const { data: wallRows, error: wallsError } = await supabase
        .from('budget_floor_plan_walls')
        .select('id')
        .eq('room_id', workspaceId);

      if (wallsError) throw wallsError;

      const wallIds = (wallRows || []).map(w => w.id);
      if (wallIds.length === 0) {
        toast.error('No se encontraron caras para generar superficies');
        return;
      }

      const { count: superficieCount, error: superficieCountError } = await supabase
        .from('budget_wall_objects')
        .select('id', { count: 'exact', head: true })
        .in('wall_id', wallIds)
        .eq('layer_order', 0);

      if (superficieCountError) throw superficieCountError;

      if (!superficieCount || superficieCount === 0) {
        toast.error('No se generó ninguna superficie en este espacio');
        return;
      }

      toast.success(`Superficies regeneradas y sincronizadas (${superficieCount})`);
    } catch (error) {
      console.error('Error regenerando superficies:', error);
      toast.error('No se pudieron regenerar las superficies');
    } finally {
      setIsRegeneratingSuperficies(false);
    }
  };

  const fetchResources = async () => {
    const { data } = await supabase
      .from('external_resources')
      .select('id, name, resource_type, unit_cost, unit_measure, width_mm, height_mm, depth_mm')
      .order('name')
      .limit(200);
    setResources((data || []) as ExternalResourceOption[]);
  };

  const fetchTemplates = async () => {
    if (!floorPlanId) return;
    // Get budget_id from floor_plan
    const { data: fp } = await supabase.from('budget_floor_plans').select('budget_id').eq('id', floorPlanId).single();
    if (!fp) return;
    const { data } = await supabase
      .from('budget_object_templates')
      .select('id, name, object_type, width_mm, height_mm, thickness_mm, unit_measure')
      .eq('budget_id', fp.budget_id)
      .order('name')
      .limit(200);
    setDbTemplates((data || []) as any);
  };

  const handleSaveAsTemplate = async () => {
    if (!objName.trim() || !floorPlanId) return;
    setSavingAsTemplate(true);
    const { data: fp } = await supabase.from('budget_floor_plans').select('budget_id').eq('id', floorPlanId).single();
    if (!fp) { setSavingAsTemplate(false); toast.error('No se encontró el presupuesto'); return; }
    const { error } = await supabase.from('budget_object_templates').insert({
      budget_id: fp.budget_id,
      name: objName.trim(),
      object_type: objType,
      width_mm: objWidthMm ? parseFloat(objWidthMm) : null,
      height_mm: objHeightMm ? parseFloat(objHeightMm) : null,
      thickness_mm: objThickness ? parseFloat(objThickness) : null,
    });
    setSavingAsTemplate(false);
    if (error) { toast.error('Error guardando plantilla'); return; }
    toast.success('Guardado como predefinido');
    fetchTemplates();
  };

  // Filtered resources for the inline form search
  const formFilteredResources = useMemo(() => {
    if (!formResourceSearch) return resources;
    const norm = normalizeSearchText(formResourceSearch);
    return resources.filter(r => normalizeSearchText(r.name).includes(norm));
  }, [resources, formResourceSearch]);

  const selectedResourceName = useMemo(() => {
    if (objResourceId === '_none') return 'Sin recurso';
    return resources.find(r => r.id === objResourceId)?.name || 'Recurso';
  }, [objResourceId, resources]);

  const getNextLayerOrder = useCallback((faceKey: string) => {
    let wallIndex: number;
    if (faceKey === 'floor') wallIndex = -1;
    else if (faceKey === 'ceiling') wallIndex = -2;
    else if (faceKey === 'space') wallIndex = 0;
    else wallIndex = parseInt(faceKey.replace('wall-', ''), 10) + 1;

    const wall = walls.find(w => w.wall_index === wallIndex);
    if (!wall) return 1;

    const maxOrder = wallObjects
      .filter(o => o.wall_id === wall.id)
      .reduce((max, o) => Math.max(max, o.layer_order), 0);

    return Math.max(1, maxOrder + 1);
  }, [wallObjects, walls]);

  useEffect(() => {
    if (!showObjectForm) return;
    if (resources.length === 0) fetchResources();
    if (dbTemplates.length === 0) fetchTemplates();
  }, [resources.length, dbTemplates.length, showObjectForm]);


  const getFloorType = () => {
    if (!room) return 'normal';
    if (room.has_floor === false) return 'invisible';
    return 'normal';
  };

  const getCeilingType = () => {
    if (!room) return 'normal';
    if (room.has_ceiling === false) return 'invisible';
    return 'normal';
  };

  const updateFloorCeiling = async (field: 'has_floor' | 'has_ceiling', value: string) => {
    const boolVal = value !== 'invisible';
    const updatePayload: Record<string, boolean> = { [field]: boolVal };

    // Sync has_roof when ceiling changes
    if (field === 'has_ceiling' && !boolVal) {
      updatePayload.has_roof = false;
    }

    // Ensure room record exists before updating
    const roomOk = await ensureRoomRecord();
    if (!roomOk) {
      toast.error('No se pudo crear el registro del espacio');
      return;
    }

    await supabase.from('budget_floor_plan_rooms').update(updatePayload).eq('id', workspaceId);
    setRoom((prev: any) => prev ? { ...prev, ...updatePayload } : prev);

    // Also sync the wall record type for this face
    const wallIndex = field === 'has_floor' ? -1 : -2;
    const newWallType = boolVal ? (field === 'has_floor' ? 'suelo_basico' : 'techo_basico') : 'invisible';
    const existingWall = walls.find(w => w.wall_index === wallIndex);
    let targetWall: WallRecord | null = null;

    if (existingWall) {
      await supabase.from('budget_floor_plan_walls').update({ wall_type: newWallType }).eq('id', existingWall.id);
      targetWall = { ...existingWall, wall_type: newWallType };
      setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, wall_type: newWallType } : w));
    } else {
      // Create the wall record if it doesn't exist
      const { data } = await supabase.from('budget_floor_plan_walls')
        .insert({ room_id: workspaceId, wall_index: wallIndex, wall_type: newWallType })
        .select().single();
      if (data) {
        targetWall = data as WallRecord;
        setWalls(prev => [...prev, targetWall!]);
      }
    }

    const nextRoomForMetrics = room ? { ...room, ...updatePayload } : null;
    if (targetWall && nextRoomForMetrics) {
      const { surface_m2, volume_m3 } = getFaceMetrics(nextRoomForMetrics, wallIndex, cellSizeM, newWallType);
      const faceLabel = wallIndex === -1 ? 'Suelo' : 'Techo';
      const metricLabel = surface_m2 != null ? `${surface_m2} m²` : volume_m3 != null ? `${volume_m3} m³` : null;
      const description = `${workspaceName} / ${faceLabel}${metricLabel ? ` — ${metricLabel}` : ''}`;
      const existingSurface = wallObjects.find(o => o.wall_id === targetWall!.id && o.layer_order === 0);

      if (existingSurface) {
        const { error } = await supabase
          .from('budget_wall_objects')
          .update({
            name: 'Superficie',
            description,
            object_type: 'material',
            is_core: false,
            layer_order: 0,
            surface_m2,
            volume_m3,
          })
          .eq('id', existingSurface.id);

        if (!error) {
          setWallObjects(prev => prev.map(o => o.id === existingSurface.id
            ? { ...o, description, surface_m2, volume_m3 }
            : o));
        }
      } else {
        const { data, error } = await supabase
          .from('budget_wall_objects')
          .insert({
            wall_id: targetWall.id,
            layer_order: 0,
            name: 'Superficie',
            description,
            object_type: 'material',
            is_core: false,
            surface_m2,
            volume_m3,
            visual_pattern: 'vacio',
          })
          .select()
          .single();

        if (!error && data) {
          setWallObjects(prev => [...prev, data as WallObjectRecord]);
        }
      }
    }

    toast.success('Actualizado');
  };

  const getWallTypeForFace = (wallIndex: number) => {
    const faceKey = `wall-${wallIndex}`;
    const localOverride = localOverrides[faceKey];
    if (localOverride) return localOverride;
    const localType = localFaceTypes?.[faceKey];
    if (localType) return normalizeWallType(localType);
    const wall = walls.find(w => w.wall_index === wallIndex + 1);
    return normalizeWallType(wall?.wall_type);
  };

  const ensureAndUpdateWallType = async (wallIndex: number, newType: string) => {
    const normalized = normalizeWallType(newType);
    const dbWallIndex = wallIndex + 1;
    const faceKey = `wall-${wallIndex}`;
    setLocalOverrides(prev => ({ ...prev, [faceKey]: normalized }));
    onLocalFaceTypeChange?.(faceKey, normalized);

    if (!room) {
      toast.success(`Pared ${dbWallIndex} actualizada`);
      return;
    }

    const existingWall = walls.find(w => w.wall_index === dbWallIndex);
    if (existingWall) {
      const { error } = await supabase
        .from('budget_floor_plan_walls')
        .update({ wall_type: normalized })
        .eq('id', existingWall.id);
      if (error) { toast.error(`Error: ${error.message}`); return; }
      setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, wall_type: normalized } : w));
      toast.success(`Pared ${dbWallIndex} actualizada`);
      return;
    }

    const { data, error } = await supabase
      .from('budget_floor_plan_walls')
      .insert({ room_id: workspaceId, wall_index: dbWallIndex, wall_type: normalized })
      .select().single();
    if (error) { toast.error(`Error: ${error.message}`); return; }
    if (data) setWalls(prev => [...prev, data as WallRecord]);
    toast.success(`Pared ${dbWallIndex} actualizada`);
  };

  const updateFacePattern = async (faceKey: string, patternId: string | null) => {
    let wallIndex: number;
    if (faceKey === 'floor') wallIndex = -1;
    else if (faceKey === 'ceiling') wallIndex = -2;
    else wallIndex = parseInt(faceKey.replace('wall-', '')) + 1;

    let existingWall = walls.find(w => w.wall_index === wallIndex);
    if (!existingWall) {
      const wallType = wallIndex === -1 ? 'suelo_basico' : wallIndex === -2 ? 'techo_basico' : 'exterior';
      const { data } = await supabase.from('budget_floor_plan_walls').insert({
        room_id: workspaceId, wall_index: wallIndex, wall_type: wallType,
      }).select().single();
      if (data) { existingWall = data as WallRecord; setWalls(prev => [...prev, existingWall!]); }
    }
    if (!existingWall) return;
    const wallId = existingWall.id;

    let surfObj = wallObjects.find(o => o.wall_id === wallId && o.layer_order === 0);
    if (surfObj) {
      await supabase.from('budget_wall_objects').update({ visual_pattern: patternId }).eq('id', surfObj.id);
      setWallObjects(prev => prev.map(o => o.id === surfObj!.id ? { ...o, visual_pattern: patternId } : o));
    } else {
      const faceLabel = faceKey === 'floor' ? 'Suelo' : faceKey === 'ceiling' ? 'Techo' : `Pared ${wallIndex}`;
      const { surface_m2, volume_m3 } = room
        ? getFaceMetrics(room, wallIndex, cellSizeM, existingWall?.wall_type)
        : { surface_m2: null as number | null, volume_m3: null as number | null };
      const metricLabel = surface_m2 != null ? `${surface_m2} m²` : volume_m3 != null ? `${volume_m3} m³` : null;
      const { data } = await supabase.from('budget_wall_objects').insert({
        wall_id: wallId,
        layer_order: 0,
        name: 'Superficie',
        description: `${workspaceName} / ${faceLabel}${metricLabel ? ` — ${metricLabel}` : ''}`,
        object_type: 'material',
        is_core: false,
        surface_m2,
        volume_m3,
        visual_pattern: patternId,
      }).select().single();
      if (data) setWallObjects(prev => [...prev, data as WallObjectRecord]);
    }
    onPatternChange?.(faceKey, patternId);
    setPatternPickerFace(null);
    toast.success('Patrón visual actualizado');
  };

  const getPatternForFace = (faceKey: string): string | null => {
    let wallIndex: number;
    if (faceKey === 'floor') wallIndex = -1;
    else if (faceKey === 'ceiling') wallIndex = -2;
    else wallIndex = parseInt(faceKey.replace('wall-', '')) + 1;
    const wall = walls.find(w => w.wall_index === wallIndex);
    if (!wall) return null;
    const obj = wallObjects.find(o => o.wall_id === wall.id && o.layer_order === 0);
    return obj?.visual_pattern || null;
  };

  const ensureRoomRecord = async (): Promise<boolean> => {
    if (room) return true;
    if (!floorPlanId) {
      toast.error('No se encontró el plano asociado');
      return false;
    }

    const sourceVertices = Array.isArray(verticesProp) && verticesProp.length >= 3 ? verticesProp : null;
    const xValues = sourceVertices?.map(v => v.x) || [];
    const yValues = sourceVertices?.map(v => v.y) || [];
    const derivedWidth = xValues.length > 0 ? Math.max(0.1, Math.max(...xValues) - Math.min(...xValues)) : 1;
    const derivedLength = yValues.length > 0 ? Math.max(0.1, Math.max(...yValues) - Math.min(...yValues)) : 1;

    const { data, error } = await supabase
      .from('budget_floor_plan_rooms')
      .insert({
        id: workspaceId,
        floor_plan_id: floorPlanId,
        name: workspaceName,
        width: derivedWidth,
        length: derivedLength,
        floor_polygon: sourceVertices,
      })
      .select()
      .single();

    if (error) {
      const { data: existing } = await supabase
        .from('budget_floor_plan_rooms')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (existing) {
        setRoom(existing);
        return true;
      }

      toast.error('Error creando registro de espacio');
      return false;
    }

    setRoom(data);
    return true;
  };

  const ensureWallRecord = async (faceKey: string): Promise<string | null> => {
    let wallIndex: number;
    if (faceKey === 'floor') wallIndex = -1;
    else if (faceKey === 'ceiling') wallIndex = -2;
    else if (faceKey === 'space') wallIndex = 0;
    else wallIndex = parseInt(faceKey.replace('wall-', '')) + 1;

    let wall = walls.find(w => w.wall_index === wallIndex);
    if (wall) return wall.id;
    const roomOk = await ensureRoomRecord();
    if (!roomOk) return null;
    const wallType = wallIndex === -1 ? 'suelo_basico' : wallIndex === -2 ? 'techo_basico' : wallIndex === 0 ? 'espacio' : 'exterior';
    const { data, error } = await supabase.from('budget_floor_plan_walls')
      .insert({ room_id: workspaceId, wall_index: wallIndex, wall_type: wallType })
      .select().single();
    if (error || !data) { toast.error(`Error creando cara: ${error?.message || 'desconocido'}`); return null; }
    setWalls(prev => [...prev, data as WallRecord]);
    return data.id;
  };

  const applyPreset = (val: string) => {
    // Check if it's a DB template (prefixed with 'db-')
    if (val.startsWith('db-')) {
      const tplId = val.replace('db-', '');
      const tpl = dbTemplates.find(t => t.id === tplId);
      if (tpl) {
        setObjType(tpl.object_type || 'material');
        setObjWidthMm(tpl.width_mm ? String(tpl.width_mm) : '');
        setObjHeightMm(tpl.height_mm ? String(tpl.height_mm) : '');
        setObjThickness(tpl.thickness_mm ? String(tpl.thickness_mm) : '');
        setObjName(tpl.name);
        setObjSillHeight('');
      }
      return;
    }
    const idx = parseInt(val, 10);
    const p = OBJECT_PRESETS[idx];
    if (!p) return;
    setObjType(p.type);
    setObjWidthMm(String(p.width));
    setObjHeightMm(String(p.height));
    setObjSillHeight(String(p.sill));
    setObjName(p.label);
  };

  const handleAddObject = async () => {
    if (!objName.trim()) return;

    const parsedLayerOrder = Number.parseInt(objLayerOrder, 10);
    if (Number.isNaN(parsedLayerOrder)) {
      toast.error('Indica un orden de capa válido');
      return;
    }
    if (parsedLayerOrder === 0) {
      toast.error('La capa 0 está reservada para Superficie automática');
      return;
    }

    if (objType === 'hueco' && !objTargetFace.startsWith('wall-')) {
      toast.error('Los huecos solo se pueden colocar en paredes (P1, P2, ...)');
      return;
    }

    const wallId = await ensureWallRecord(objTargetFace);
    if (!wallId) return;

    const parseNumeric = (value: string) => {
      if (!value.trim()) return null;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const widthMmInput = parseNumeric(objWidthMm);
    const heightMmInput = parseNumeric(objHeightMm);
    const sillHeightInput = parseNumeric(objSillHeight);
    const positionXInput = parseNumeric(objPosX);

    const coordXInput = parseNumeric(objCoordX);
    const coordYInput = parseNumeric(objCoordY);
    const coordZInput = parseNumeric(objCoordZ);

    // If all 3 coordinates are set, auto-compute sill_height and distance_to_wall
    let computedSill = objType === 'hueco' ? (sillHeightInput ?? 900) : sillHeightInput;
    let computedDistWall = parseNumeric(objDistWall);
    if (coordZInput != null) computedSill = coordZInput;
    if (coordXInput != null) computedDistWall = coordXInput;

    const payload: any = {
      wall_id: wallId,
      layer_order: parsedLayerOrder,
      name: objName.trim(),
      description: objDescription.trim() || null,
      object_type: objType,
      thickness_mm: parseNumeric(objThickness),
      width_mm: objType === 'hueco' ? (widthMmInput ?? 1200) : widthMmInput,
      height_mm: objType === 'hueco' ? (heightMmInput ?? 1000) : heightMmInput,
      position_x: objType === 'hueco' ? (positionXInput ?? 300) : positionXInput,
      sill_height: computedSill,
      distance_to_wall: computedDistWall,
      resource_id: objResourceId === '_none' ? null : objResourceId,
      coord_x: coordXInput,
      coord_y: coordYInput,
      coord_z: coordZInput,
      shown_in_section: objShownInSection,
    };

    const { data, error } = await supabase.from('budget_wall_objects').insert(payload).select().single();
    if (error) {
      toast.error(`Error: ${error.message}`);
      return;
    }

    if (data) {
      setWallObjects(prev => [...prev, data as WallObjectRecord]);
    }

    resetForm();
    onOpeningsChange?.();
    toast.success(objType === 'hueco' ? 'Hueco añadido' : 'Objeto registrado');
  };

  const resetForm = () => {
    setShowObjectForm(false);
    setObjName('');
    setObjDescription('');
    setObjThickness('');
    setObjWidthMm('');
    setObjHeightMm('');
    setObjSillHeight('');
    setObjPosX('');
    setObjDistWall('');
    setObjPreset('');
    setObjType('material');
    setObjTargetFace('wall-0');
    setObjLayerOrder('1');
    setObjResourceId('_none');
  };

  const handleDeleteObject = async (id: string) => {
    await supabase.from('budget_wall_objects').delete().eq('id', id);
    setWallObjects(prev => prev.filter(o => o.id !== id));
    onOpeningsChange?.();
    toast.success('Eliminado');
  };

  const handleMoveObject = async (id: string, field: 'position_x' | 'sill_height', delta: number) => {
    const obj = wallObjects.find(o => o.id === id);
    if (!obj) return;
    const currentVal = (obj[field] as number) || 0;
    const newVal = Math.max(0, currentVal + delta);
    await supabase.from('budget_wall_objects').update({ [field]: newVal }).eq('id', id);
    setWallObjects(prev => prev.map(o => o.id === id ? { ...o, [field]: newVal } : o));
    onOpeningsChange?.();
  };

  const handleLinkResource = async (objId: string, resourceId: string, resource: ExternalResourceOption) => {
    await supabase.from('budget_wall_objects').update({ resource_id: resourceId }).eq('id', objId);
    setWallObjects(prev => prev.map(o => o.id === objId ? { ...o, resource_id: resourceId } : o));
    setShowResourcePicker(false);
    toast.success(`Vinculado a: ${resource.name}`);
  };

  const stripMetricFromDescription = (description: string | null, fallback: string) => {
    if (!description) return fallback;
    return description.replace(/\s+—\s+[-\d.,]+\s*(m²|m³|ml)\s*$/u, '').trim();
  };

  const openSuperficieManualEditor = (sup: WallObjectRecord) => {
    setEditingSuperficieId(sup.id);
    setManualSurfaceValue(sup.surface_m2 != null ? String(sup.surface_m2) : '');
    setManualVolumeValue(sup.volume_m3 != null ? String(sup.volume_m3) : '');
  };

  const saveSuperficieManualValues = async (sup: WallObjectRecord) => {
    const parseMaybeNumber = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number.parseFloat(trimmed.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    const nextSurface = parseMaybeNumber(manualSurfaceValue);
    const nextVolume = parseMaybeNumber(manualVolumeValue);

    if (Number.isNaN(nextSurface) || Number.isNaN(nextVolume)) {
      toast.error('Introduce valores numéricos válidos');
      return;
    }

    const faceWall = walls.find(w => w.id === sup.wall_id);
    const faceLabel = !faceWall
      ? '—'
      : faceWall.wall_index === -1
        ? 'Suelo'
        : faceWall.wall_index === -2
          ? 'Techo'
          : faceWall.wall_index === 0
            ? 'Espacio'
            : faceWall.wall_type === 'tejado'
              ? `T${faceWall.wall_index}`
              : `P${faceWall.wall_index}`;
    const baseDescription = stripMetricFromDescription(sup.description, `${workspaceName} / ${faceLabel}`);
    const metricLabel = nextSurface != null
      ? `${nextSurface} m²`
      : nextVolume != null
        ? `${nextVolume} m³`
        : null;

    setSavingManualSuperficie(true);
    const { error } = await supabase
      .from('budget_wall_objects')
      .update({
        surface_m2: nextSurface,
        volume_m3: nextVolume,
        description: metricLabel ? `${baseDescription} — ${metricLabel}` : baseDescription,
      })
      .eq('id', sup.id);
    setSavingManualSuperficie(false);

    if (error) {
      toast.error('No se pudo guardar el valor manual');
      return;
    }

    setWallObjects(prev => prev.map(o => o.id === sup.id
      ? {
          ...o,
          surface_m2: nextSurface,
          volume_m3: nextVolume,
          description: metricLabel ? `${baseDescription} — ${metricLabel}` : baseDescription,
        }
      : o
    ));
    setEditingSuperficieId(null);
    toast.success('Valor manual guardado');
  };

  const poly = getEffectivePolygon(room);
  const roomPolyCount = Array.isArray(room?.floor_polygon) ? room.floor_polygon.length : 0;
  const edgeCount = edgeCountProp ?? (poly ? poly.length : roomPolyCount > 0 ? roomPolyCount : (room ? 4 : 0));

  let area = 0;
  if (poly && poly.length >= 3) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    area = (Math.abs(area) / 2) * cellSizeM * cellSizeM;
  }

  const sectionLabel = sectionType === 'vertical' ? 'Z' : sectionType === 'longitudinal' ? 'Y' : sectionType === 'transversal' ? 'X' : 'I';

  // Split automatic surfaces from manual objects
  const superficieObjects = wallObjects.filter(o => o.layer_order === 0);
  const allObjects = wallObjects.filter(o => o.layer_order > 0);
  const huecoCount = allObjects.filter(o => o.object_type === 'hueco').length;

  // Get objects for a specific wall index (0-based for walls, -1 floor, -2 ceiling)
  const getObjectsForWall = (wallIdx: number) => {
    const wall = walls.find(w => w.wall_index === wallIdx);
    if (!wall) return [];
    return allObjects.filter(o => o.wall_id === wall.id);
  };

  const getWallLabelForObject = (wallId: string) => {
    const wall = walls.find(w => w.id === wallId);
    if (!wall) return '—';
    if (wall.wall_index === -1) return 'Suelo';
    if (wall.wall_index === -2) return 'Techo';
    if (wall.wall_index === 0) return 'Espacio';
    if (wall.wall_type === 'tejado') return `T${wall.wall_index}`;
    return `P${wall.wall_index}`;
  };

  // Face options for object target
  const faceOptions = [
    ...Array.from({ length: edgeCount }).map((_, i) => {
      const w = walls.find(ww => ww.wall_index === i + 1);
      const prefix = w?.wall_type === 'tejado' ? 'T' : 'P';
      return { value: `wall-${i}`, label: `${prefix}${i + 1}` };
    }),
    { value: 'floor', label: 'Suelo' },
    { value: 'ceiling', label: 'Techo' },
    { value: 'space', label: 'Espacio' },
  ];

  // Filtered resources for picker
  const filteredResources = resources.filter(r =>
    !resourceSearch || r.name.toLowerCase().includes(resourceSearch.toLowerCase())
  );

  return (
    <div className="absolute right-2 top-2 z-50 w-80 bg-card border rounded-lg shadow-lg overflow-hidden"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}>
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
          </div>
        )}
      </div>

      {/* Tab bar - only 2 tabs now */}
      <div className="flex border-b">
        {(['faces', 'objects'] as const).map(tab => (
          <button
            key={tab}
            className={`flex-1 text-[10px] py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'faces'
              ? '🧱 Caras'
              : `📦 Objetos (${wallObjects.length})${huecoCount > 0 ? ` · 🚪${huecoCount}` : ''}`
            }
          </button>
        ))}
      </div>

      {/* Mini polygon diagram */}
      {activeTab === 'faces' && (() => {
        const diagramVerts = verticesProp || poly;
        if (diagramVerts && diagramVerts.length >= 3) {
          const xs = diagramVerts.map(v => v.x);
          const ys = diagramVerts.map(v => v.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const rangeX = maxX - minX || 1;
          const rangeY = maxY - minY || 1;
          const edgeN = diagramVerts.length;
          const svgW = 320;
          const svgH = edgeN > 4 ? 280 : 240;
          const pad = 50; // increased padding for labels outside
          const drawW = svgW - pad * 2;
          const drawH = svgH - pad * 2;
          const scaleF = Math.min(drawW / rangeX, drawH / rangeY);
          const offX = pad + (drawW - rangeX * scaleF) / 2;
          const offY = pad + (drawH - rangeY * scaleF) / 2;
          const toSvg = (v: { x: number; y: number }) => ({
            sx: offX + (v.x - minX) * scaleF,
            sy: offY + (maxY - v.y) * scaleF,
          });
          const svgPts = diagramVerts.map(toSvg);
          const pointsStr = svgPts.map(p => `${p.sx},${p.sy}`).join(' ');

          // Determine if we're in a cross-section
          const isCrossSection = sectionType === 'transversal' || sectionType === 'longitudinal';

          return (
            <div className="px-2 py-1.5 border-b">
              <svg width={svgW} height={svgH} className="w-full" viewBox={`0 0 ${svgW} ${svgH}`}>
                <polygon points={pointsStr} fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))" strokeWidth={2.5} />
                {diagramVerts.map((_, i) => {
                  const j = (i + 1) % diagramVerts.length;
                  const a = svgPts[i];
                  const b = svgPts[j];
                  const mx = (a.sx + b.sx) / 2;
                  const my = (a.sy + b.sy) / 2;
                  const dx = b.sx - a.sx;
                  const dy = b.sy - a.sy;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const nx = len > 0 ? -dy / len : 0;
                  const ny = len > 0 ? dx / len : 0;
                  const off = 0; // label sits on top of the edge line
                  const isHighlighted = expandedFace === `wall-${i}`;
                  const wallObjs = getObjectsForWall(i + 1);
                  const wallHuecos = wallObjs.filter(o => o.object_type === 'hueco');

                  // Determine label: T (techo/tejado) / S (suelo) for cross-sections
                  const wallRec = walls.find(ww => ww.wall_index === i + 1);
                  let wallLabel = wallRec?.wall_type === 'tejado' ? `T${i + 1}` : `P${i + 1}`;
                  if (isCrossSection && diagramVerts.length >= 3) {
                    const eMinY = Math.min(diagramVerts[i].y, diagramVerts[j].y);
                    const eMaxY = Math.max(diagramVerts[i].y, diagramVerts[j].y);
                    if (rangeY > 0.01) {
                      const isBottom = Math.abs(eMinY - minY) < rangeY * 0.15 && Math.abs(eMaxY - minY) < rangeY * 0.15;
                      const isTop = Math.abs(eMinY - maxY) < rangeY * 0.15 && Math.abs(eMaxY - maxY) < rangeY * 0.15;
                      if (isBottom) wallLabel = 'S';
                      else if (isTop) wallLabel = 'T';
                    }
                  }

                  return (
                    <g key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedFace(expandedFace === `wall-${i}` ? null : `wall-${i}`)}>
                      <rect x={mx + nx * off - 16} y={my + ny * off - 10} width={32} height={20} rx={4}
                        fill={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth={0.5} />
                      <text x={mx + nx * off} y={my + ny * off + 5} textAnchor="middle"
                        fontSize={12} fontWeight={700} fill={isHighlighted ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'} fontFamily="monospace">
                        {wallLabel}
                      </text>
                      {wallHuecos.length > 0 && (
                        <circle cx={mx + nx * off + 14} cy={my + ny * off - 7} r={5}
                          fill="hsl(var(--destructive))" />
                      )}
                      {wallHuecos.length > 0 && (
                        <text x={mx + nx * off + 14} y={my + ny * off - 4}
                          textAnchor="middle" fontSize={7} fill="white" fontWeight={700}>
                          {wallHuecos.length}
                        </text>
                      )}
                    </g>
                  );
                })}
                {svgPts.map((p, i) => (
                  <circle key={`v${i}`} cx={p.sx} cy={p.sy} r={5} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
                ))}
              </svg>
            </div>
          );
        }
        return null;
      })()}

      {/* ══ FACES TAB ══ */}
      {activeTab === 'faces' && !loading && (
        <div className="px-2 py-2 space-y-0.5 max-h-[50vh] overflow-y-auto">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1 mb-1">Caras del volumen</p>

          <FaceRow label="🟫 Suelo" faceKey="floor" type={getFloorType()} options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_floor', v)} pattern={getPatternForFace('floor')}
            isExpanded={expandedFace === 'floor'} onToggle={() => setExpandedFace(expandedFace === 'floor' ? null : 'floor')}
            onOpenPatternPicker={() => setPatternPickerFace('floor')}
            objectCount={getObjectsForWall(-1).length}
            onAddObject={() => {
              setObjTargetFace('floor');
              setObjLayerOrder(String(getNextLayerOrder('floor')));
              setObjResourceId('_none');
              setShowObjectForm(true);
              setActiveTab('objects');
            }}
          />

          {Array.from({ length: edgeCount }).map((_, i) => {
            const faceKey = `wall-${i}`;
            const wallObjs = getObjectsForWall(i + 1);
            const wallHuecos = wallObjs.filter(o => o.object_type === 'hueco');
            // Determine wall label: T/S for cross-sections
            const isCross = sectionType === 'transversal' || sectionType === 'longitudinal';
            const wallRecFace = walls.find(ww => ww.wall_index === i + 1);
            let wallLabel = wallRecFace?.wall_type === 'tejado' ? `T${i + 1}` : `P${i + 1}`;
            const diagramVerts = verticesProp || poly;
            if (isCross && diagramVerts && diagramVerts.length >= 3) {
              const j = (i + 1) % diagramVerts.length;
              const ys = diagramVerts.map(v => v.y);
              const minY = Math.min(...ys), maxY = Math.max(...ys);
              const rangeY = maxY - minY;
              const eMinY = Math.min(diagramVerts[i].y, diagramVerts[j].y);
              const eMaxY = Math.max(diagramVerts[i].y, diagramVerts[j].y);
              if (rangeY > 0.01) {
                if (Math.abs(eMinY - minY) < rangeY * 0.15 && Math.abs(eMaxY - minY) < rangeY * 0.15) wallLabel = 'S (Suelo)';
                else if (Math.abs(eMinY - maxY) < rangeY * 0.15 && Math.abs(eMaxY - maxY) < rangeY * 0.15) wallLabel = wallRecFace?.wall_type === 'tejado' ? `T${i + 1} (Tejado)` : 'T (Techo)';
              }
            }
            return (
              <div key={i}>
                <FaceRow label={`🧱 ${wallLabel}`} faceKey={faceKey} type={getWallTypeForFace(i)} options={WALL_TYPES}
                  onChange={(v) => ensureAndUpdateWallType(i, v)} pattern={getPatternForFace(faceKey)}
                  isExpanded={expandedFace === faceKey} onToggle={() => setExpandedFace(expandedFace === faceKey ? null : faceKey)}
                  onOpenPatternPicker={() => setPatternPickerFace(faceKey)}
                  objectCount={wallObjs.length}
                  huecoCount={wallHuecos.length}
                  onAddObject={() => {
                    setObjTargetFace(faceKey);
                    setObjLayerOrder(String(getNextLayerOrder(faceKey)));
                    setObjResourceId('_none');
                    setShowObjectForm(true);
                    setActiveTab('objects');
                  }}
                />
              </div>
            );
          })}

          <FaceRow label={room?.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'} faceKey="ceiling" type={getCeilingType()} options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_ceiling', v)} pattern={getPatternForFace('ceiling')}
            isExpanded={expandedFace === 'ceiling'} onToggle={() => setExpandedFace(expandedFace === 'ceiling' ? null : 'ceiling')}
            onOpenPatternPicker={() => setPatternPickerFace('ceiling')}
            objectCount={getObjectsForWall(-2).length}
            onAddObject={() => {
              setObjTargetFace('ceiling');
              setObjLayerOrder(String(getNextLayerOrder('ceiling')));
              setObjResourceId('_none');
              setShowObjectForm(true);
              setActiveTab('objects');
            }}
          />

          <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded">
            <span className="text-xs">🔷 Espacio</span>
            <Badge variant="outline" className="text-[9px] h-4">Vol. interior</Badge>
          </div>
        </div>
      )}

      {/* ══ OBJECTS TAB (unified: objects + huecos) ══ */}
      {activeTab === 'objects' && !loading && (
        <div className="px-2 py-2 max-h-[50vh] overflow-y-auto space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1">Objetos y huecos</p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1"
                disabled={isRegeneratingSuperficies}
                onClick={() => {
                  void handleRegenerateSuperficies();
                }}
              >
                <Layers className="h-3 w-3" />
                {isRegeneratingSuperficies ? 'Sincronizando...' : 'Generar superficies'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1"
                onClick={() => {
                  setShowObjectForm(!showObjectForm);
                  if (!showObjectForm) {
                    setObjTargetFace('wall-0');
                    setObjLayerOrder(String(getNextLayerOrder('wall-0')));
                    setObjResourceId('_none');
                  }
                }}
              >
                <Plus className="h-3 w-3" /> Nuevo
              </Button>
            </div>
          </div>

          {/* Add object form */}
          {showObjectForm && (
            <div className="border rounded p-2 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold">Nuevo objeto / hueco</p>

              {/* Presets for huecos + DB templates */}
              <div>
                <label className="text-[9px] text-muted-foreground">Predefinido / Plantilla</label>
                <Select value={objPreset} onValueChange={v => { setObjPreset(v); applyPreset(v); }}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Elegir plantilla..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_header_presets" disabled>— Huecos predefinidos —</SelectItem>
                    {OBJECT_PRESETS.map((p, i) => (
                      <SelectItem key={i} value={String(i)}>{p.label} ({p.width}×{p.height}mm)</SelectItem>
                    ))}
                    {dbTemplates.length > 0 && (
                      <>
                        <SelectItem value="_header_db" disabled>— Plantillas del presupuesto —</SelectItem>
                        {dbTemplates.map(t => (
                          <SelectItem key={t.id} value={`db-${t.id}`}>
                            {t.name} {t.width_mm && t.height_mm ? `(${t.width_mm}×${t.height_mm}mm)` : ''}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-1">
                <div className="col-span-2">
                  <label className="text-[9px] text-muted-foreground">Nombre</label>
                  <Input className="h-6 text-[10px]" value={objName} onChange={e => setObjName(e.target.value)} placeholder="Ej: Ventana V1, Aislamiento XPS..." />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Tipo</label>
                  <Select value={objType} onValueChange={setObjType}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OBJECT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Ubicación</label>
                  <Select
                    value={objTargetFace}
                    onValueChange={(value) => {
                      setObjTargetFace(value);
                      setObjLayerOrder(String(getNextLayerOrder(value)));
                    }}
                  >
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {faceOptions.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Orden capa (≠ 0)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objLayerOrder} onChange={e => setObjLayerOrder(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] text-muted-foreground">Recurso enlazado</label>
                  <Popover open={formResourceOpen} onOpenChange={setFormResourceOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] w-full justify-start font-normal truncate">
                        <Search className="h-3 w-3 mr-1 shrink-0" />
                        <span className="truncate">{selectedResourceName}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <Input
                        className="h-6 text-[10px] mb-1.5"
                        placeholder="Buscar recurso..."
                        value={formResourceSearch}
                        onChange={e => setFormResourceSearch(e.target.value)}
                        autoFocus
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        <button
                          className={`w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-accent/40 ${objResourceId === '_none' ? 'bg-accent/30 font-medium' : ''}`}
                          onClick={() => { setObjResourceId('_none'); setFormResourceOpen(false); setFormResourceSearch(''); }}
                        >
                          Sin recurso
                        </button>
                        {formFilteredResources.map(r => (
                          <button
                            key={r.id}
                            className={`w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-accent/40 flex items-center gap-1 ${objResourceId === r.id ? 'bg-accent/30 font-medium' : ''}`}
                            onClick={() => {
                              setObjResourceId(r.id);
                              setObjName(r.name);
                              if (r.width_mm) setObjWidthMm(String(r.width_mm));
                              if (r.height_mm) setObjHeightMm(String(r.height_mm));
                              if (r.depth_mm) setObjThickness(String(r.depth_mm));
                              setFormResourceOpen(false);
                              setFormResourceSearch('');
                            }}
                          >
                            <span className="truncate flex-1">{r.name}</span>
                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0">{r.resource_type || '—'}</Badge>
                          </button>
                        ))}
                        {formFilteredResources.length === 0 && (
                          <p className="text-[9px] text-muted-foreground text-center py-2">Sin resultados</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Ancho (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objWidthMm} onChange={e => setObjWidthMm(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Alto (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objHeightMm} onChange={e => setObjHeightMm(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Espesor (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objThickness} onChange={e => setObjThickness(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Dist. suelo (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objSillHeight} onChange={e => setObjSillHeight(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Pos. X (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objPosX} onChange={e => setObjPosX(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Dist. pared (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objDistWall} onChange={e => setObjDistWall(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] text-muted-foreground">Descripción</label>
                  <Input className="h-6 text-[10px]" value={objDescription} onChange={e => setObjDescription(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] gap-1 flex-1" onClick={handleAddObject} disabled={!objName.trim()}>
                  <Plus className="h-3 w-3" /> {objType === 'hueco' ? 'Añadir hueco' : 'Registrar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1"
                  disabled={!objName.trim() || savingAsTemplate}
                  onClick={handleSaveAsTemplate}
                  title="Guardar como plantilla predefinida"
                >
                  <Star className="h-3 w-3" /> {savingAsTemplate ? '...' : 'Predefinir'}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={resetForm}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Resource picker overlay */}
          {showResourcePicker && (
            <div className="border rounded p-2 bg-muted/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold">Vincular recurso</p>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowResourcePicker(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Input className="h-6 text-[10px]" value={resourceSearch} onChange={e => setResourceSearch(e.target.value)} placeholder="Buscar recurso..." />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {filteredResources.map(r => (
                  <button key={r.id} className="w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-accent/40 flex items-center gap-1"
                    onClick={() => {
                      const targetObjId = (showResourcePicker as any);
                      if (typeof targetObjId === 'string') handleLinkResource(targetObjId, r.id, r);
                    }}>
                    <span className="truncate flex-1">{r.name}</span>
                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0">{r.resource_type || '—'}</Badge>
                  </button>
                ))}
                {filteredResources.length === 0 && <p className="text-[9px] text-muted-foreground text-center py-2">Sin resultados</p>}
              </div>
            </div>
          )}

          {/* Listado: Superficies automáticas + objetos manuales */}
          {(superficieObjects.length > 0 || allObjects.length > 0) ? (
            <div className="space-y-2">
              {superficieObjects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground px-1">Superficies automáticas (capa 0)</p>
                  {walls.map(wall => {
                    const sup = superficieObjects.find(o => o.wall_id === wall.id);
                    if (!sup) return null;
                    const label = getWallLabelForObject(wall.id);
                    return (
                      <div key={`sup-${wall.id}`} className="text-[10px] px-1.5 py-1 rounded border bg-muted/20">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{label}</span>
                          <Badge variant="secondary" className="text-[8px] h-4 px-1">Auto</Badge>
                          <div className="flex-1" />
                          {sup.surface_m2 != null && <span className="font-mono">{sup.surface_m2} m²</span>}
                          {sup.volume_m3 != null && <span className="font-mono">{sup.volume_m3} m³</span>}
                        </div>
                        {sup.description && (
                          <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{sup.description}</p>
                        )}

                        {editingSuperficieId === sup.id ? (
                          <div className="mt-1.5 border rounded p-1.5 bg-background space-y-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] text-muted-foreground">m²</span>
                              <Input
                                className="h-6 w-20 text-[10px]"
                                type="number"
                                step="0.01"
                                value={manualSurfaceValue}
                                onChange={e => setManualSurfaceValue(e.target.value)}
                                placeholder="0"
                              />
                              <span className="text-[9px] text-muted-foreground">m³</span>
                              <Input
                                className="h-6 w-20 text-[10px]"
                                type="number"
                                step="0.001"
                                value={manualVolumeValue}
                                onChange={e => setManualVolumeValue(e.target.value)}
                                placeholder="—"
                              />
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                disabled={savingManualSuperficie}
                                onClick={() => void saveSuperficieManualValues(sup)}
                              >
                                {savingManualSuperficie ? 'Guardando…' : 'Guardar'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => setEditingSuperficieId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => openSuperficieManualEditor(sup)}
                            >
                              Editar valor
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {allObjects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground px-1">Objetos y huecos manuales</p>
                  {walls.map(wall => {
                    const objs = allObjects.filter(o => o.wall_id === wall.id);
                    if (objs.length === 0) return null;
                    const label = getWallLabelForObject(wall.id);
                    return (
                      <div key={wall.id} className="space-y-0.5">
                        <p className="text-[10px] font-semibold text-muted-foreground px-1">{label}</p>
                        {objs.map(obj => (
                          <ObjectRow
                            key={obj.id}
                            obj={obj}
                            isPositioning={positioningObjId === obj.id}
                            onTogglePosition={() => setPositioningObjId(positioningObjId === obj.id ? null : obj.id)}
                            onMove={(field, delta) => handleMoveObject(obj.id, field, delta)}
                            onDelete={() => handleDeleteObject(obj.id)}
                            onLinkResource={() => {
                              fetchResources();
                              setShowResourcePicker(obj.id as any);
                              setResourceSearch('');
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !showObjectForm && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              Sin objetos ni superficies aún. Pulsa "Nuevo" para registrar.
            </p>
          )}
        </div>
      )}

      {loading && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Cargando...</div>}

      {/* Pattern picker overlay */}
      {patternPickerFace && (
        <div className="px-2 py-2 border-t bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Patrón visual — Superficie</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPatternPickerFace(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            <button
              className="flex items-center gap-2 w-full text-left px-1.5 py-1 rounded hover:bg-accent/40 text-[10px]"
              onClick={() => updateFacePattern(patternPickerFace, null)}
            >
              <span className="w-5 h-5 border rounded bg-background" />
              <span>Sin patrón</span>
            </button>
            {PATTERN_CATEGORIES.map(cat => {
              const patterns = VISUAL_PATTERNS.filter(p => p.category === cat.id);
              if (!patterns.length) return null;
              return (
                <div key={cat.id}>
                  <span className="text-[9px] text-muted-foreground font-medium uppercase px-1">{cat.label}</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {patterns.map(p => (
                      <button
                        key={p.id}
                        className="w-8 h-8 border rounded hover:ring-2 ring-primary overflow-hidden"
                        title={p.label}
                        style={{ backgroundImage: `url("${patternPreviewDataUri(p, 32)}")`, backgroundSize: 'cover' }}
                        onClick={() => updateFacePattern(patternPickerFace, p.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Object row with positioning controls ──
function ObjectRow({ obj, isPositioning, onTogglePosition, onMove, onDelete, onLinkResource }: {
  obj: WallObjectRecord;
  isPositioning: boolean;
  onTogglePosition: () => void;
  onMove: (field: 'position_x' | 'sill_height', delta: number) => void;
  onDelete: () => void;
  onLinkResource: () => void;
}) {
  const isHueco = obj.object_type === 'hueco';
  const icon = isHueco ? '🚪' : '📦';
  const dims = [
    obj.width_mm ? `${obj.width_mm}` : null,
    obj.height_mm ? `×${obj.height_mm}` : null,
  ].filter(Boolean).join('');

  return (
    <div className="text-[10px] px-1.5 py-1 rounded border bg-background space-y-1">
      <div className="flex items-center gap-1">
        <span className="shrink-0">{icon}</span>
        <span className="font-medium truncate flex-1">{obj.name}</span>
        <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">Capa {obj.layer_order}</Badge>
        <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">{obj.object_type}</Badge>
        {obj.resource_id && <Link2 className="h-3 w-3 text-primary shrink-0" />}
      </div>
      <div className="flex items-center gap-1 flex-wrap text-muted-foreground">
        {dims && <span className="font-mono">{dims}mm</span>}
        {obj.thickness_mm && <span className="font-mono">e:{obj.thickness_mm}mm</span>}
        {obj.sill_height != null && <span>↑{obj.sill_height}</span>}
        {obj.position_x != null && <span>→{obj.position_x}</span>}
        {obj.distance_to_wall != null && <span>↔{obj.distance_to_wall}</span>}
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        {isPositioning ? (
          <>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Izquierda" onClick={() => onMove('position_x', -50)}>
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Derecha" onClick={() => onMove('position_x', 50)}>
              <ArrowRight className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Subir" onClick={() => onMove('sill_height', 50)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Bajar" onClick={() => onMove('sill_height', -50)}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onTogglePosition}>
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Mover" onClick={onTogglePosition}>
              <Move className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Vincular recurso" onClick={onLinkResource}>
              <Link2 className="h-3 w-3" />
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={onDelete}>
              <X className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function FaceRow({ label, faceKey, type, options, onChange, pattern, isExpanded, onToggle, onOpenPatternPicker, objectCount, huecoCount, onAddObject }: {
  label: string;
  faceKey: string;
  type: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  pattern: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPatternPicker: () => void;
  objectCount?: number;
  huecoCount?: number;
  onAddObject?: () => void;
}) {
  const patternObj = getPatternById(pattern);
  return (
    <div className={`rounded ${isExpanded ? 'bg-accent/20 border border-accent/30' : ''}`}>
      <div className="flex items-center justify-between gap-1 py-0.5 px-1 hover:bg-accent/30 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs flex-shrink-0">{label}</span>
          {patternObj && (
            <span className="w-4 h-4 border rounded overflow-hidden inline-block flex-shrink-0"
              style={{ backgroundImage: `url("${patternPreviewDataUri(patternObj, 16)}")`, backgroundSize: 'cover' }} />
          )}
          {(huecoCount ?? 0) > 0 && (
            <Badge variant="destructive" className="text-[8px] h-3.5 px-1">🚪{huecoCount}</Badge>
          )}
          {(objectCount ?? 0) > 0 && (
            <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📦{objectCount}</Badge>
          )}
        </div>
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
          {options.find(o => o.value === type)?.label || type}
        </Badge>
      </div>
      {isExpanded && (
        <div className="px-2 py-1 space-y-1 border-t border-accent/20">
          <div className="flex items-center gap-1">
            <Select value={type} onValueChange={onChange}>
              <SelectTrigger className="h-6 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Patrón visual" onClick={(e) => { e.stopPropagation(); onOpenPatternPicker(); }}>
              <Paintbrush className="h-3 w-3" />
            </Button>
            {onAddObject && (
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Añadir objeto" onClick={(e) => { e.stopPropagation(); onAddObject(); }}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
