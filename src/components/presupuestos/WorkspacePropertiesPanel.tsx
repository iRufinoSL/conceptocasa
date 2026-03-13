import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Box, Layers, Paintbrush, Plus, DoorOpen, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
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

// Predefined opening templates
const OPENING_PRESETS = [
  { label: 'Ventana pequeña', type: 'ventana', width: 1000, height: 800, sill: 1200 },
  { label: 'Ventana mediana', type: 'ventana', width: 1500, height: 1250, sill: 1000 },
  { label: 'Ventana grande', type: 'ventana', width: 2000, height: 1500, sill: 800 },
  { label: 'Puerta estándar', type: 'puerta', width: 900, height: 2100, sill: 0 },
  { label: 'Puerta doble', type: 'puerta', width: 1600, height: 2100, sill: 0 },
  { label: 'Puerta balconera', type: 'puerta', width: 1800, height: 2200, sill: 0 },
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
  object_type: string;
  thickness_mm: number | null;
}

interface OpeningRecord {
  id: string;
  wall_id: string;
  opening_type: string;
  width: number;
  height: number;
  sill_height: number;
  position_x: number | null;
  name: string | null;
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
  const [openings, setOpenings] = useState<OpeningRecord[]>([]);
  const [expandedFace, setExpandedFace] = useState<string | null>(focusFace || null);
  const [patternPickerFace, setPatternPickerFace] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});

  // Opening form state
  const [addingOpeningWall, setAddingOpeningWall] = useState<number | null>(null);
  const [openingPreset, setOpeningPreset] = useState('');
  const [openingName, setOpeningName] = useState('');
  const [openingType, setOpeningType] = useState('ventana');
  const [openingWidth, setOpeningWidth] = useState('1500');
  const [openingHeight, setOpeningHeight] = useState('1250');
  const [openingSill, setOpeningSill] = useState('1000');
  const [openingPosX, setOpeningPosX] = useState('500');

  // Object form state
  const [showObjectForm, setShowObjectForm] = useState(false);
  const [objName, setObjName] = useState('');
  const [objType, setObjType] = useState('material');
  const [objThickness, setObjThickness] = useState('');
  const [objDescription, setObjDescription] = useState('');

  // Positioning state
  const [positioningOpeningId, setPositioningOpeningId] = useState<string | null>(null);

  // Active tab: 'faces' | 'openings' | 'objects'
  const [activeTab, setActiveTab] = useState<'faces' | 'openings' | 'objects'>('faces');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomRes, wallsRes] = await Promise.all([
      supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle(),
      supabase.from('budget_floor_plan_walls').select('*').eq('room_id', workspaceId).order('wall_index'),
    ]);
    setRoom(roomRes.data);
    const wallData = (wallsRes.data || []) as WallRecord[];
    setWalls(wallData);

    if (wallData.length > 0) {
      const wallIds = wallData.map(w => w.id);
      const [objRes, openingRes] = await Promise.all([
        supabase.from('budget_wall_objects').select('*').in('wall_id', wallIds),
        supabase.from('budget_floor_plan_openings').select('*').in('wall_id', wallIds),
      ]);
      setWallObjects((objRes.data || []) as WallObjectRecord[]);
      setOpenings((openingRes.data || []) as OpeningRecord[]);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (focusFace) setExpandedFace(focusFace); }, [focusFace]);

  const getFloorType = () => {
    if (!room) return 'normal';
    if (!room.has_floor) return 'invisible';
    return 'normal';
  };

  const getCeilingType = () => {
    if (!room) return 'normal';
    if (room.has_roof) return 'normal';
    if (!room.has_ceiling) return 'invisible';
    return 'normal';
  };

  const updateFloorCeiling = async (field: 'has_floor' | 'has_ceiling', value: string) => {
    const boolVal = value !== 'invisible';
    await supabase.from('budget_floor_plan_rooms').update({ [field]: boolVal }).eq('id', workspaceId);
    setRoom((prev: any) => prev ? { ...prev, [field]: boolVal } : prev);
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

  /** Ensure wall + layer 0 Superficie, then update pattern */
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

  // ── Openings (huecos) ──
  const ensureRoomRecord = async (): Promise<boolean> => {
    // Check if room already exists
    if (room) return true;
    if (!floorPlanId) {
      toast.error('No se encontró el plano asociado');
      return false;
    }
    const { data, error } = await supabase.from('budget_floor_plan_rooms')
      .insert({ id: workspaceId, floor_plan_id: floorPlanId, name: workspaceName, width: 1, length: 1 })
      .select().single();
    if (error) {
      // Maybe it already exists (race condition)
      const { data: existing } = await supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle();
      if (existing) { setRoom(existing); return true; }
      toast.error('Error creando registro de espacio');
      return false;
    }
    setRoom(data);
    return true;
  };

  const ensureWallRecord = async (wallIndex0: number): Promise<string | null> => {
    const dbIdx = wallIndex0 + 1;
    let wall = walls.find(w => w.wall_index === dbIdx);
    if (wall) return wall.id;
    // Ensure room exists first
    const roomOk = await ensureRoomRecord();
    if (!roomOk) return null;
    const { data, error } = await supabase.from('budget_floor_plan_walls')
      .insert({ room_id: workspaceId, wall_index: dbIdx, wall_type: 'exterior' })
      .select().single();
    if (error || !data) { toast.error(`Error creando pared: ${error?.message || 'desconocido'}`); return null; }
    setWalls(prev => [...prev, data as WallRecord]);
    return data.id;
  };

  const handleAddOpening = async () => {
    if (addingOpeningWall === null) return;
    const wallId = await ensureWallRecord(addingOpeningWall);
    if (!wallId) return;
    const { data, error } = await supabase.from('budget_floor_plan_openings').insert({
      wall_id: wallId,
      opening_type: openingType,
      width: parseFloat(openingWidth) || 1000,
      height: parseFloat(openingHeight) || 1000,
      sill_height: parseFloat(openingSill) || 0,
      position_x: parseFloat(openingPosX) || 0,
      name: openingName.trim() || null,
    }).select().single();
    if (error) { toast.error(`Error: ${error.message}`); return; }
    if (data) setOpenings(prev => [...prev, data as OpeningRecord]);
    setAddingOpeningWall(null);
    setOpeningName(''); setOpeningPreset('');
    onOpeningsChange?.();
    toast.success('Hueco añadido');
  };

  const handleDeleteOpening = async (id: string) => {
    await supabase.from('budget_floor_plan_openings').delete().eq('id', id);
    setOpenings(prev => prev.filter(o => o.id !== id));
    toast.success('Hueco eliminado');
  };

  const handleMoveOpening = async (id: string, delta: number) => {
    const opening = openings.find(o => o.id === id);
    if (!opening) return;
    const newPosX = Math.max(0, (opening.position_x || 0) + delta);
    await supabase.from('budget_floor_plan_openings').update({ position_x: newPosX }).eq('id', id);
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, position_x: newPosX } : o));
  };

  // ── Objects (objetos generales) ──
  const handleAddObject = async () => {
    if (!objName.trim()) return;
    // Add to the first available wall or create one
    let wallId: string | null = null;
    if (walls.length > 0) {
      wallId = walls[0].id;
    } else {
      wallId = await ensureWallRecord(0);
    }
    if (!wallId) return;
    const maxOrder = wallObjects.filter(o => o.wall_id === wallId).reduce((m, o) => Math.max(m, o.layer_order), 0);
    const { data, error } = await supabase.from('budget_wall_objects').insert({
      wall_id: wallId,
      layer_order: maxOrder + 1,
      name: objName.trim(),
      description: objDescription.trim() || null,
      object_type: objType,
      thickness_mm: parseFloat(objThickness) || null,
    }).select().single();
    if (error) { toast.error(`Error: ${error.message}`); return; }
    if (data) setWallObjects(prev => [...prev, data as WallObjectRecord]);
    setShowObjectForm(false);
    setObjName(''); setObjDescription(''); setObjThickness('');
    toast.success('Objeto registrado');
  };

  const handleDeleteObject = async (id: string) => {
    await supabase.from('budget_wall_objects').delete().eq('id', id);
    setWallObjects(prev => prev.filter(o => o.id !== id));
    toast.success('Objeto eliminado');
  };

  const applyPreset = (idx: number) => {
    const p = OPENING_PRESETS[idx];
    setOpeningType(p.type);
    setOpeningWidth(String(p.width));
    setOpeningHeight(String(p.height));
    setOpeningSill(String(p.sill));
    setOpeningName(p.label);
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

  // Get openings for a specific wall index (0-based)
  const getOpeningsForWall = (wallIdx0: number) => {
    const dbIdx = wallIdx0 + 1;
    const wall = walls.find(w => w.wall_index === dbIdx);
    if (!wall) return [];
    return openings.filter(o => o.wall_id === wall.id);
  };

  // Get non-surface objects for all walls
  const allObjects = wallObjects.filter(o => o.layer_order > 0);

  // Find wall label for an object
  const getWallLabelForObject = (wallId: string) => {
    const wall = walls.find(w => w.id === wallId);
    if (!wall) return '—';
    if (wall.wall_index === -1) return 'Suelo';
    if (wall.wall_index === -2) return 'Techo';
    return `P${wall.wall_index}`;
  };

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

      {/* Tab bar */}
      <div className="flex border-b">
        {(['faces', 'openings', 'objects'] as const).map(tab => (
          <button
            key={tab}
            className={`flex-1 text-[10px] py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'faces' ? '🧱 Caras' : tab === 'openings' ? `🚪 Huecos (${openings.length})` : `📦 Objetos (${allObjects.length})`}
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
          const svgH = edgeN > 4 ? 220 : 180;
          const pad = 36;
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

          return (
            <div className="px-2 py-1.5 border-b">
              <svg width={svgW} height={svgH} className="w-full" viewBox={`0 0 ${svgW} ${svgH}`}>
                <polygon points={pointsStr} fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))" strokeWidth={2} />
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
                  const off = 16;
                  const isHighlighted = expandedFace === `wall-${i}`;
                  const wallOpenings = getOpeningsForWall(i);
                  return (
                    <g key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedFace(expandedFace === `wall-${i}` ? null : `wall-${i}`)}>
                      <rect x={mx + nx * off - 14} y={my + ny * off - 9} width={28} height={18} rx={4}
                        fill={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth={0.5} />
                      <text x={mx + nx * off} y={my + ny * off + 5} textAnchor="middle"
                        fontSize={11} fontWeight={700} fill={isHighlighted ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'} fontFamily="monospace">
                        P{i + 1}
                      </text>
                      {wallOpenings.length > 0 && (
                        <circle cx={mx + nx * off + 12} cy={my + ny * off - 6} r={5}
                          fill="hsl(var(--destructive))" />
                      )}
                      {wallOpenings.length > 0 && (
                        <text x={mx + nx * off + 12} y={my + ny * off - 3}
                          textAnchor="middle" fontSize={7} fill="white" fontWeight={700}>
                          {wallOpenings.length}
                        </text>
                      )}
                    </g>
                  );
                })}
                {svgPts.map((p, i) => (
                  <circle key={`v${i}`} cx={p.sx} cy={p.sy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
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
            onOpenPatternPicker={() => setPatternPickerFace('floor')} />

          {Array.from({ length: edgeCount }).map((_, i) => {
            const faceKey = `wall-${i}`;
            const wallOpenings = getOpeningsForWall(i);
            return (
              <div key={i}>
                <FaceRow label={`🧱 P${i + 1}`} faceKey={faceKey} type={getWallTypeForFace(i)} options={WALL_TYPES}
                  onChange={(v) => ensureAndUpdateWallType(i, v)} pattern={getPatternForFace(faceKey)}
                  isExpanded={expandedFace === faceKey} onToggle={() => setExpandedFace(expandedFace === faceKey ? null : faceKey)}
                  onOpenPatternPicker={() => setPatternPickerFace(faceKey)}
                  openingCount={wallOpenings.length}
                  onAddOpening={() => { setAddingOpeningWall(i); setActiveTab('openings'); }}
                />
              </div>
            );
          })}

          <FaceRow label={room?.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'} faceKey="ceiling" type={getCeilingType()} options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_ceiling', v)} pattern={getPatternForFace('ceiling')}
            isExpanded={expandedFace === 'ceiling'} onToggle={() => setExpandedFace(expandedFace === 'ceiling' ? null : 'ceiling')}
            onOpenPatternPicker={() => setPatternPickerFace('ceiling')} />

          <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded">
            <span className="text-xs">🔷 Espacio</span>
            <Badge variant="outline" className="text-[9px] h-4">Vol. interior</Badge>
          </div>
        </div>
      )}

      {/* ══ OPENINGS TAB ══ */}
      {activeTab === 'openings' && !loading && (
        <div className="px-2 py-2 max-h-[50vh] overflow-y-auto space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1">Huecos (ventanas y puertas)</p>
            <Select value={addingOpeningWall !== null ? String(addingOpeningWall) : ''} onValueChange={v => setAddingOpeningWall(parseInt(v))}>
              <SelectTrigger className="h-6 w-28 text-[10px]">
                <SelectValue placeholder="+ Añadir en..." />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: edgeCount }).map((_, i) => (
                  <SelectItem key={i} value={String(i)}>P{i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add opening form */}
          {addingOpeningWall !== null && (
            <div className="border rounded p-2 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold">Nuevo hueco en P{addingOpeningWall + 1}</p>
              <div>
                <label className="text-[9px] text-muted-foreground">Predefinido</label>
                <Select value={openingPreset} onValueChange={v => { setOpeningPreset(v); applyPreset(parseInt(v)); }}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Elegir plantilla..." /></SelectTrigger>
                  <SelectContent>
                    {OPENING_PRESETS.map((p, i) => (
                      <SelectItem key={i} value={String(i)}>{p.label} ({p.width}×{p.height}mm)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-[9px] text-muted-foreground">Nombre</label>
                  <Input className="h-6 text-[10px]" value={openingName} onChange={e => setOpeningName(e.target.value)} placeholder="Ej: V1" />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Tipo</label>
                  <Select value={openingType} onValueChange={setOpeningType}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ventana">Ventana</SelectItem>
                      <SelectItem value="puerta">Puerta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Ancho (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={openingWidth} onChange={e => setOpeningWidth(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Alto (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={openingHeight} onChange={e => setOpeningHeight(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Dist. suelo (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={openingSill} onChange={e => setOpeningSill(e.target.value)} />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Pos. X (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={openingPosX} onChange={e => setOpeningPosX(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] gap-1 flex-1" onClick={handleAddOpening}>
                  <Plus className="h-3 w-3" /> Añadir
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setAddingOpeningWall(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* List openings per wall */}
          {Array.from({ length: edgeCount }).map((_, i) => {
            const wallOpenings = getOpeningsForWall(i);
            if (wallOpenings.length === 0) return null;
            return (
              <div key={i} className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">P{i + 1}</p>
                {wallOpenings.map(op => (
                  <div key={op.id} className="flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border bg-background">
                    <DoorOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{op.name || (op.opening_type === 'ventana' ? 'Ventana' : 'Puerta')}</span>
                    <span className="text-muted-foreground">{op.width}×{op.height}</span>
                    <span className="text-muted-foreground">↑{op.sill_height}</span>
                    {op.position_x != null && <span className="text-muted-foreground">→{op.position_x}</span>}
                    <div className="ml-auto flex items-center gap-0.5">
                      {positioningOpeningId === op.id ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveOpening(op.id, -50)}>
                            <ArrowLeft className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveOpening(op.id, 50)}>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPositioningOpeningId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-5 w-5" title="Mover" onClick={() => setPositioningOpeningId(op.id)}>
                            <Move className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => handleDeleteOpening(op.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {openings.length === 0 && addingOpeningWall === null && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              Sin huecos. Selecciona una pared para añadir ventanas o puertas.
            </p>
          )}
        </div>
      )}

      {/* ══ OBJECTS TAB ══ */}
      {activeTab === 'objects' && !loading && (
        <div className="px-2 py-2 max-h-[50vh] overflow-y-auto space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1">Objetos del espacio</p>
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => setShowObjectForm(!showObjectForm)}>
              <Plus className="h-3 w-3" /> Nuevo
            </Button>
          </div>

          {/* Add object form */}
          {showObjectForm && (
            <div className="border rounded p-2 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold">Nuevo objeto</p>
              <div className="grid grid-cols-2 gap-1">
                <div className="col-span-2">
                  <label className="text-[9px] text-muted-foreground">Nombre</label>
                  <Input className="h-6 text-[10px]" value={objName} onChange={e => setObjName(e.target.value)} placeholder="Ej: Aislamiento XPS" />
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Tipo</label>
                  <Select value={objType} onValueChange={setObjType}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="bloque">Bloque</SelectItem>
                      <SelectItem value="aislamiento">Aislamiento</SelectItem>
                      <SelectItem value="revestimiento">Revestimiento</SelectItem>
                      <SelectItem value="estructura">Estructura</SelectItem>
                      <SelectItem value="instalacion">Instalación</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground">Espesor (mm)</label>
                  <Input className="h-6 text-[10px] font-mono" type="number" value={objThickness} onChange={e => setObjThickness(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] text-muted-foreground">Descripción</label>
                  <Input className="h-6 text-[10px]" value={objDescription} onChange={e => setObjDescription(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] gap-1 flex-1" onClick={handleAddObject} disabled={!objName.trim()}>
                  <Plus className="h-3 w-3" /> Registrar
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowObjectForm(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* List objects */}
          {allObjects.length > 0 ? (
            <div className="space-y-1">
              {allObjects.map(obj => (
                <div key={obj.id} className="flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded border bg-background">
                  <span className="font-medium truncate flex-1">{obj.name}</span>
                  <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">{obj.object_type}</Badge>
                  {obj.thickness_mm && <span className="text-muted-foreground shrink-0">{obj.thickness_mm}mm</span>}
                  <Badge variant="secondary" className="text-[8px] h-4 px-1 shrink-0">{getWallLabelForObject(obj.wall_id)}</Badge>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive shrink-0" onClick={() => handleDeleteObject(obj.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : !showObjectForm && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              Sin objetos. Pulsa "Nuevo" para registrar materiales, capas, etc.
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

function FaceRow({ label, faceKey, type, options, onChange, pattern, isExpanded, onToggle, onOpenPatternPicker, openingCount, onAddOpening }: {
  label: string;
  faceKey: string;
  type: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  pattern: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPatternPicker: () => void;
  openingCount?: number;
  onAddOpening?: () => void;
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
          {(openingCount ?? 0) > 0 && (
            <Badge variant="destructive" className="text-[8px] h-3.5 px-1">{openingCount} hueco{openingCount! > 1 ? 's' : ''}</Badge>
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
            {onAddOpening && (
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Añadir hueco" onClick={(e) => { e.stopPropagation(); onAddOpening(); }}>
                <DoorOpen className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
