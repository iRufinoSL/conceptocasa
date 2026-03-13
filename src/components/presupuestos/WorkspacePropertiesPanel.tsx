import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Box, Layers, Paintbrush } from 'lucide-react';
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
}

export interface FacePatterns {
  [faceKey: string]: string | null; // faceKey: "floor" | "ceiling" | "wall-{index}" → pattern id
}

interface WorkspacePropertiesPanelProps {
  workspaceId: string;
  workspaceName: string;
  sectionType: string;
  sectionName: string;
  onClose: () => void;
  /** Which face to highlight/focus (e.g., 'wall-0', 'floor', 'ceiling') */
  focusFace?: string;
  /** Override edge count from the actual polygon in the section viewer */
  edgeCount?: number;
  /** Polygon vertices for rendering the mini diagram */
  vertices?: Array<{ x: number; y: number }>;
  /** Callback when a pattern changes so parent can re-render */
  onPatternChange?: (faceKey: string, patternId: string | null) => void;
  /** Local overrides for section-only polygons (not linked to a room row) */
  localFaceTypes?: Record<string, string>;
  /** Persist local wall type overrides in section polygon JSON */
  onLocalFaceTypeChange?: (faceKey: string, wallType: string) => void;
}

export function WorkspacePropertiesPanel({
  workspaceId,
  workspaceName,
  sectionType,
  sectionName,
  onClose,
  focusFace,
  edgeCount: edgeCountProp,
  vertices: verticesProp,
  onPatternChange,
  localFaceTypes,
  onLocalFaceTypeChange,
}: WorkspacePropertiesPanelProps) {
  const [walls, setWalls] = useState<WallRecord[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wallObjects, setWallObjects] = useState<WallObjectRecord[]>([]);
  const [expandedFace, setExpandedFace] = useState<string | null>(focusFace || null);
  const [patternPickerFace, setPatternPickerFace] = useState<string | null>(null);
  // Local override for immediate UI feedback (avoids round-trip through parent)
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomRes, wallsRes] = await Promise.all([
      supabase.from('budget_floor_plan_rooms').select('*').eq('id', workspaceId).maybeSingle(),
      supabase.from('budget_floor_plan_walls').select('*').eq('room_id', workspaceId).order('wall_index'),
    ]);
    setRoom(roomRes.data);
    const wallData = (wallsRes.data || []) as WallRecord[];
    setWalls(wallData);

    // Fetch wall objects (layer 0 = Superficie) for all walls
    if (wallData.length > 0) {
      const wallIds = wallData.map(w => w.id);
      const { data: objData } = await supabase
        .from('budget_wall_objects')
        .select('*')
        .in('wall_id', wallIds)
        .eq('layer_order', 0);
      setWallObjects((objData || []) as WallObjectRecord[]);
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
    // 1. Local override (immediate feedback within this panel)
    const localOverride = localOverrides[faceKey];
    if (localOverride) return localOverride;
    // 2. Parent-level face types (section polygon JSON metadata)
    const localType = localFaceTypes?.[faceKey];
    if (localType) return normalizeWallType(localType);
    // 3. DB wall record
    const wall = walls.find(w => w.wall_index === wallIndex + 1);
    return normalizeWallType(wall?.wall_type);
  };

  const ensureAndUpdateWallType = async (wallIndex: number, newType: string) => {
    const normalized = normalizeWallType(newType);
    const dbWallIndex = wallIndex + 1;
    const faceKey = `wall-${wallIndex}`;

    // Immediate UI feedback — no round-trip needed
    setLocalOverrides(prev => ({ ...prev, [faceKey]: normalized }));

    // Persist in section polygon metadata (for synthetic X/Y/Z polygons)
    onLocalFaceTypeChange?.(faceKey, normalized);

    // If this polygon is not tied to a real room row, stop at local persistence
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

      if (error) {
        toast.error(`Error al actualizar pared ${dbWallIndex}: ${error.message}`);
        return;
      }

      setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, wall_type: normalized } : w));
      toast.success(`Pared ${dbWallIndex} actualizada`);
      return;
    }

    const { data, error } = await supabase
      .from('budget_floor_plan_walls')
      .insert({
        room_id: workspaceId,
        wall_index: dbWallIndex,
        wall_type: normalized,
      })
      .select()
      .single();

    if (error) {
      toast.error(`Error al crear pared ${dbWallIndex}: ${error.message}`);
      return;
    }

    if (data) setWalls(prev => [...prev, data as WallRecord]);
    toast.success(`Pared ${dbWallIndex} actualizada`);
  };

  /** Ensure wall record exists, then ensure layer 0 Superficie object exists, then update pattern */
  const updateFacePattern = async (faceKey: string, patternId: string | null) => {
    let wallId: string | null = null;
    let wallIndex: number;

    if (faceKey === 'floor') {
      wallIndex = -1; // Convention: floor uses wall_index = -1
    } else if (faceKey === 'ceiling') {
      wallIndex = -2; // Convention: ceiling uses wall_index = -2
    } else {
      // wall-N where N is 0-based
      const idx = parseInt(faceKey.replace('wall-', ''));
      wallIndex = idx + 1; // DB is 1-based
    }

    // Find or create wall record
    let existingWall = walls.find(w => w.wall_index === wallIndex);
    if (!existingWall) {
      const wallType = wallIndex === -1 ? 'suelo_basico' : wallIndex === -2 ? 'techo_basico' : 'exterior';
      const { data } = await supabase.from('budget_floor_plan_walls').insert({
        room_id: workspaceId,
        wall_index: wallIndex,
        wall_type: wallType,
      }).select().single();
      if (data) {
        existingWall = data as WallRecord;
        setWalls(prev => [...prev, existingWall!]);
      }
    }
    if (!existingWall) return;
    wallId = existingWall.id;

    // Find or create layer 0 Superficie object
    let surfObj = wallObjects.find(o => o.wall_id === wallId && o.layer_order === 0);
    if (surfObj) {
      await supabase.from('budget_wall_objects').update({ visual_pattern: patternId }).eq('id', surfObj.id);
      setWallObjects(prev => prev.map(o => o.id === surfObj!.id ? { ...o, visual_pattern: patternId } : o));
    } else {
      const faceLabel = faceKey === 'floor' ? 'Suelo' : faceKey === 'ceiling' ? 'Techo' : `Pared ${wallIndex}`;
      const { data } = await supabase.from('budget_wall_objects').insert({
        wall_id: wallId,
        layer_order: 0,
        name: 'Superficie',
        description: `${faceLabel}/${workspaceName}`,
        object_type: 'superficie',
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

  return (
    <div className="absolute right-2 top-2 z-50 w-72 bg-card border rounded-lg shadow-lg overflow-hidden"
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
            {room.height != null && room.height > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">Z {room.height}m</Badge>
            )}
          </div>
        )}
      </div>

      {/* Mini polygon diagram */}
      {(() => {
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
            sy: offY + (maxY - v.y) * scaleF, // flip Y
          });
          const svgPts = diagramVerts.map(toSvg);
          const pointsStr = svgPts.map(p => `${p.sx},${p.sy}`).join(' ');

          return (
            <div className="px-2 py-1.5 border-b">
              <svg width={svgW} height={svgH} className="w-full" viewBox={`0 0 ${svgW} ${svgH}`}>
                {/* Fill */}
                <polygon points={pointsStr} fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))" strokeWidth={2} />
                {/* Edge labels + midpoint markers */}
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
                  const off = 12;
                  const isHighlighted = expandedFace === `wall-${i}`;
                  return (
                    <g key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedFace(expandedFace === `wall-${i}` ? null : `wall-${i}`)}>
                      <rect x={mx + nx * off - 11} y={my + ny * off - 7} width={22} height={14} rx={3}
                        fill={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth={0.5} />
                      <text x={mx + nx * off} y={my + ny * off + 4} textAnchor="middle"
                        fontSize={9} fontWeight={700} fill={isHighlighted ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'} fontFamily="monospace">
                        P{i + 1}
                      </text>
                    </g>
                  );
                })}
                {/* Vertex dots */}
                {svgPts.map((p, i) => (
                  <circle key={`v${i}`} cx={p.sx} cy={p.sy} r={3} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={1.5} />
                ))}
              </svg>
            </div>
          );
        }
        return null;
      })()}

      {/* Faces */}
      {loading ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">Cargando...</div>
      ) : (
        <div className="px-2 py-2 space-y-0.5 max-h-[60vh] overflow-y-auto">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider px-1 mb-1">Caras del volumen</p>

          {/* Floor */}
          <FaceRow
            label="🟫 Suelo"
            faceKey="floor"
            type={getFloorType()}
            options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_floor', v)}
            pattern={getPatternForFace('floor')}
            isExpanded={expandedFace === 'floor'}
            onToggle={() => setExpandedFace(expandedFace === 'floor' ? null : 'floor')}
            onOpenPatternPicker={() => setPatternPickerFace('floor')}
          />

          {/* Walls */}
          {Array.from({ length: edgeCount }).map((_, i) => {
            const faceKey = `wall-${i}`;
            return (
              <FaceRow
                key={i}
                label={`🧱 P${i + 1}`}
                faceKey={faceKey}
                type={getWallTypeForFace(i)}
                options={WALL_TYPES}
                onChange={(v) => ensureAndUpdateWallType(i, v)}
                pattern={getPatternForFace(faceKey)}
                isExpanded={expandedFace === faceKey}
                onToggle={() => setExpandedFace(expandedFace === faceKey ? null : faceKey)}
                onOpenPatternPicker={() => setPatternPickerFace(faceKey)}
              />
            );
          })}

          {/* Ceiling */}
          <FaceRow
            label={room?.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'}
            faceKey="ceiling"
            type={getCeilingType()}
            options={FLOOR_CEILING_TYPES}
            onChange={(v) => updateFloorCeiling('has_ceiling', v)}
            pattern={getPatternForFace('ceiling')}
            isExpanded={expandedFace === 'ceiling'}
            onToggle={() => setExpandedFace(expandedFace === 'ceiling' ? null : 'ceiling')}
            onOpenPatternPicker={() => setPatternPickerFace('ceiling')}
          />

          {/* Interior space */}
          <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded">
            <span className="text-xs">🔷 Espacio</span>
            <Badge variant="outline" className="text-[9px] h-4">Vol. interior</Badge>
          </div>
        </div>
      )}

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
            {/* None option */}
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
                        style={{
                          backgroundImage: `url("${patternPreviewDataUri(p, 32)}")`,
                          backgroundSize: 'cover',
                        }}
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

function FaceRow({ label, faceKey, type, options, onChange, pattern, isExpanded, onToggle, onOpenPatternPicker }: {
  label: string;
  faceKey: string;
  type: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  pattern: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPatternPicker: () => void;
}) {
  const patternObj = getPatternById(pattern);
  return (
    <div className={`rounded ${isExpanded ? 'bg-accent/20 border border-accent/30' : ''}`}>
      <div className="flex items-center justify-between gap-1 py-0.5 px-1 hover:bg-accent/30 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs flex-shrink-0">{label}</span>
          {patternObj && (
            <span className="w-4 h-4 border rounded overflow-hidden inline-block flex-shrink-0"
              style={{
                backgroundImage: `url("${patternPreviewDataUri(patternObj, 16)}")`,
                backgroundSize: 'cover',
              }}
              title={patternObj.label} />
          )}
        </div>
        <Select value={type} onValueChange={onChange}>
          <SelectTrigger className="h-6 w-[110px] text-[10px]" onClick={e => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isExpanded && (
        <div className="px-2 pb-1.5 pt-0.5">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[8px] h-3.5 px-1">Capa 0</Badge>
            <span className="text-[9px] text-muted-foreground">Superficie</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={onOpenPatternPicker} title="Cambiar patrón visual">
              <Paintbrush className="h-3 w-3" />
            </Button>
          </div>
          {patternObj ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-5 h-5 border rounded overflow-hidden inline-block"
                style={{
                  backgroundImage: `url("${patternPreviewDataUri(patternObj, 20)}")`,
                  backgroundSize: 'cover',
                }} />
              <span className="text-[9px] text-muted-foreground">{patternObj.label}</span>
            </div>
          ) : (
            <span className="text-[9px] text-muted-foreground italic mt-0.5 block">Sin patrón asignado</span>
          )}
        </div>
      )}
    </div>
  );
}
