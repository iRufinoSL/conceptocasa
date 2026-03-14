import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Box, Layers, Paintbrush, Plus, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VISUAL_PATTERNS, PATTERN_CATEGORIES, getPatternById, patternPreviewDataUri, type VisualPattern } from '@/lib/visual-patterns';

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
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

  // Resource linking
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [resources, setResources] = useState<ExternalResourceOption[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');

  // Positioning state
  const [positioningObjId, setPositioningObjId] = useState<string | null>(null);

  // Active tab: 'faces' | 'objects'
  const [activeTab, setActiveTab] = useState<'faces' | 'objects'>('faces');

  const getFaceLabel = useCallback((wallIndex: number) => {
    if (wallIndex === -1) return 'Suelo';
    if (wallIndex === -2) return 'Techo';
    if (wallIndex === 0) return 'Espacio';
    return `Pared ${wallIndex}`;
  }, []);

  const getFaceMetrics = useCallback((roomData: any, wallIndex: number) => {
    const polygon = Array.isArray(roomData?.floor_polygon) && roomData.floor_polygon.length >= 3
      ? roomData.floor_polygon as Array<{ x: number; y: number }>
      : null;

    const floorAreaRaw = (() => {
      if (!polygon) return (roomData?.length || 0) * (roomData?.width || 0);
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
      }
      return Math.abs(area) / 2;
    })();

    const floorArea = Math.round(floorAreaRaw * 100) / 100;
    const heightM = roomData?.height || 2.5;

    if (wallIndex === 0) {
      return {
        surface_m2: null as number | null,
        volume_m3: Math.round(floorAreaRaw * heightM * 1000) / 1000,
      };
    }

    if (wallIndex === -1 || wallIndex === -2) {
      return {
        surface_m2: floorArea,
        volume_m3: null as number | null,
      };
    }

    let wallLengthM = 0;
    if (polygon) {
      const edgeCount = polygon.length;
      const edgeIndex = ((wallIndex - 1) % edgeCount + edgeCount) % edgeCount;
      const a = polygon[edgeIndex];
      const b = polygon[(edgeIndex + 1) % edgeCount];
      wallLengthM = Math.hypot(b.x - a.x, b.y - a.y);
    } else {
      wallLengthM = wallIndex % 2 === 1 ? (roomData?.length || 0) : (roomData?.width || 0);
    }

    return {
      surface_m2: Math.round(wallLengthM * heightM * 100) / 100,
      volume_m3: null as number | null,
    };
  }, []);

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

      // Sync room flags from wall records if they disagree
      if (nextWalls.length > 0) {
        const floorWall = nextWalls.find(w => w.wall_index === -1);
        const ceilingWall = nextWalls.find(w => w.wall_index === -2);
        const updates: Record<string, boolean> = {};

        if (floorWall) {
          const wallSaysInvisible = floorWall.wall_type === 'invisible';
          if (roomData.has_floor === wallSaysInvisible) {
            updates.has_floor = !wallSaysInvisible;
          }
        }

        if (ceilingWall) {
          const wallSaysInvisible = ceilingWall.wall_type === 'invisible';
          if (roomData.has_ceiling === wallSaysInvisible) {
            updates.has_ceiling = !wallSaysInvisible;
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('budget_floor_plan_rooms').update(updates).eq('id', workspaceId);
          Object.assign(roomData, updates);
        }
      }

      // Ensure all face records exist (walls + suelo + techo + espacio)
      const expectedStructuralCount = edgeCountProp ?? (Array.isArray(roomData.floor_polygon) ? roomData.floor_polygon.length : 0);
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
          .select('id, wall_id')
          .in('wall_id', wallIds)
          .eq('layer_order', 0);

        if (existingSuperficiesError) {
          console.error('Error consultando capas Superficie:', existingSuperficiesError);
        }

        const existingByWall = new Map<string, string>(
          (existingSuperficies || []).map((row: any) => [row.wall_id as string, row.id as string])
        );

        const updates = nextWalls
          .filter(w => existingByWall.has(w.id))
          .map(w => {
            const { surface_m2, volume_m3 } = getFaceMetrics(roomData, w.wall_index);
            const metricLabel = surface_m2 != null ? `${surface_m2} m²` : volume_m3 != null ? `${volume_m3} m³` : null;
            return {
              id: existingByWall.get(w.id)!,
              payload: {
                name: 'Superficie',
                description: `${workspaceName} / ${getFaceLabel(w.wall_index)}${metricLabel ? ` — ${metricLabel}` : ''}`,
                object_type: 'material',
                is_core: false,
                layer_order: 0,
                surface_m2,
                volume_m3,
              },
            };
          });

        const inserts = nextWalls
          .filter(w => !existingByWall.has(w.id))
          .map(w => {
            const { surface_m2, volume_m3 } = getFaceMetrics(roomData, w.wall_index);
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

        const mutationResults = await Promise.all([
          ...updates.map(u => supabase.from('budget_wall_objects').update(u.payload).eq('id', u.id)),
          ...(inserts.length > 0 ? [supabase.from('budget_wall_objects').insert(inserts)] : []),
        ]);

        mutationResults.forEach((res) => {
          if (res.error) {
            console.error('Error sincronizando Superficie automática:', res.error);
          }
        });

        const { data: objData } = await supabase
          .from('budget_wall_objects')
          .select('*')
          .in('wall_id', wallIds)
          .order('layer_order', { ascending: true });

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

  const fetchResources = async () => {
    const { data } = await supabase
      .from('external_resources')
      .select('id, name, resource_type, unit_cost, unit_measure')
      .order('name')
      .limit(200);
    setResources((data || []) as ExternalResourceOption[]);
  };

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
  }, [resources.length, showObjectForm]);

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
    if (existingWall) {
      await supabase.from('budget_floor_plan_walls').update({ wall_type: newWallType }).eq('id', existingWall.id);
      setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, wall_type: newWallType } : w));
    } else {
      // Create the wall record if it doesn't exist
      const { data } = await supabase.from('budget_floor_plan_walls')
        .insert({ room_id: workspaceId, wall_index: wallIndex, wall_type: newWallType })
        .select().single();
      if (data) setWalls(prev => [...prev, data as WallRecord]);
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
      const { data } = await supabase.from('budget_wall_objects').insert({
        wall_id: wallId, layer_order: 0, name: 'Superficie',
        description: `${faceLabel}/${workspaceName}`, object_type: 'superficie', visual_pattern: patternId,
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
    const { data, error } = await supabase.from('budget_floor_plan_rooms')
      .insert({ id: workspaceId, floor_plan_id: floorPlanId, name: workspaceName, width: 1, length: 1 })
      .select().single();
    if (error) {
      const { data: existing } = await supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle();
      if (existing) { setRoom(existing); return true; }
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

  const applyPreset = (idx: number) => {
    const p = OBJECT_PRESETS[idx];
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
      sill_height: objType === 'hueco' ? (sillHeightInput ?? 900) : sillHeightInput,
      distance_to_wall: parseNumeric(objDistWall),
      resource_id: objResourceId === '_none' ? null : objResourceId,
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

  const poly = room?.floor_polygon as Array<{ x: number; y: number }> | null;
  const edgeCount = edgeCountProp ?? (poly ? poly.length : (room ? 4 : 0));

  let area = 0;
  if (poly && poly.length >= 3) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    area = Math.abs(area) / 2;
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
    return `P${wall.wall_index}`;
  };

  // Face options for object target
  const faceOptions = [
    ...Array.from({ length: edgeCount }).map((_, i) => ({ value: `wall-${i}`, label: `P${i + 1}` })),
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
              : `📦 Objetos (${allObjects.length})${huecoCount > 0 ? ` · 🚪${huecoCount}` : ''}`
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
                  const off = 24; // label offset further from edge
                  const isHighlighted = expandedFace === `wall-${i}`;
                  const wallObjs = getObjectsForWall(i + 1);
                  const wallHuecos = wallObjs.filter(o => o.object_type === 'hueco');

                  // Determine label: T (techo) / S (suelo) for cross-sections
                  let wallLabel = `P${i + 1}`;
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
            let wallLabel = `P${i + 1}`;
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
                else if (Math.abs(eMinY - maxY) < rangeY * 0.15 && Math.abs(eMaxY - maxY) < rangeY * 0.15) wallLabel = 'T (Techo)';
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
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1">Objetos y huecos</p>
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => { setShowObjectForm(!showObjectForm); if (!showObjectForm) setObjTargetFace('wall-0'); }}>
              <Plus className="h-3 w-3" /> Nuevo
            </Button>
          </div>

          {/* Add object form */}
          {showObjectForm && (
            <div className="border rounded p-2 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold">Nuevo objeto / hueco</p>

              {/* Presets for huecos */}
              <div>
                <label className="text-[9px] text-muted-foreground">Predefinido (huecos)</label>
                <Select value={objPreset} onValueChange={v => { setObjPreset(v); applyPreset(parseInt(v)); }}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Elegir plantilla..." /></SelectTrigger>
                  <SelectContent>
                    {OBJECT_PRESETS.map((p, i) => (
                      <SelectItem key={i} value={String(i)}>{p.label} ({p.width}×{p.height}mm)</SelectItem>
                    ))}
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
                  <Select value={objTargetFace} onValueChange={setObjTargetFace}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {faceOptions.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
