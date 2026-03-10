import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { RoomData } from '@/lib/floor-plan-calculations';
import { Plus, Minus, Trash2, Pencil, MapPin, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Save, RefreshCw, MousePointer, PenTool, ZoomIn, ZoomOut } from 'lucide-react';
import { GridPdfExport } from './GridPdfExport';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { VISUAL_PATTERNS, getPatternById } from '@/lib/visual-patterns';

export interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
  zBase?: number;
  zTop?: number;
}

export interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal' | 'inclined';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
  /** For inclined sections: reference workspace and wall height data */
  inclinedMeta?: {
    workspaceId: string;
    workspaceName: string;
    wallHeights: { wallIndex: number; heightMm: number }[];
    realLengthMm: number;
    slopeAngleDeg: number;
  };
}

export interface ScaleConfig {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  gridRange?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface SectionWallProjection {
  workspaceId: string;
  workspaceName: string;
  hStart: number;
  hEnd: number;
  zBase: number;
  zTop: number;
}

interface CustomSectionManagerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal' | 'inclined';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  scaleConfig?: ScaleConfig;
  workspacesBySection?: Map<string, any[]>;
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
  rooms?: RoomData[];
  budgetName?: string;
   /** Navigate to the section that contains a wall (double-click on wall number) */
  onNavigateToWallSection?: (wallInfo: { roomId: string; roomName: string; wallIndex: number; isHorizontal: boolean; edgeAxisValue: number; sourceSectionType: string }) => void;
  /** Force this section's grid to be visible (set externally for navigation) */
  forcedVisibleGridId?: string | null;
  /** Plan data for ridge line rendering */
  planData?: import('@/lib/floor-plan-calculations').FloorPlanData;
  /** Configurable ridge line */
  ridgeLine?: import('@/hooks/useFloorPlan').RidgeLine | null;
  onRidgeLineChange?: (ridge: import('@/hooks/useFloorPlan').RidgeLine | null) => void;
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }> = {
  vertical: { axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' },
  longitudinal: { axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' },
  transversal: { axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' },
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

const AXIS_DESCRIPTION: Record<string, string> = {
  vertical: 'Plano a nivel Z — define la cota de altura',
  longitudinal: 'Corte en Y — sección longitudinal del edificio',
  transversal: 'Corte en X — sección transversal del edificio',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Grid range constants
const GRID_MIN = -3;
const GRID_MAX = 20;

const PROJ_COLORS = [
  'hsl(210 70% 55%)', 'hsl(150 60% 45%)', 'hsl(30 80% 55%)',
  'hsl(280 60% 55%)', 'hsl(0 70% 55%)', 'hsl(180 60% 45%)',
  'hsl(60 70% 45%)', 'hsl(330 60% 55%)',
];

/** Convert hsl color to hsl with alpha: hsl(210 70% 55%) → hsl(210 70% 55% / 0.15) */
function hslWithAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace(')', ` / ${alpha})`);
}

interface PolygonVertex {
  x: number;
  y: number;
}

/** Get the polygon for a workspace in a section: saved or computed default rectangle */
function getWorkspacePolygon(
  section: CustomSection,
  proj: SectionWallProjection,
): PolygonVertex[] {
  // Check for saved polygon
  const saved = section.polygons?.find(p => p.id === proj.workspaceId);
  if (saved) {
    if (saved.vertices.length === 0) return []; // Hidden marker
    return saved.vertices.map(v => ({ x: v.x, y: v.y }));
  }
  // Default rectangular projection
  return [
    { x: proj.hStart, y: proj.zBase },
    { x: proj.hEnd, y: proj.zBase },
    { x: proj.hEnd, y: proj.zTop },
    { x: proj.hStart, y: proj.zTop },
  ];
}

/** Geometry type label based on vertex count */
function geometryTypeLabel(count: number): string {
  if (count === 0) return '—';
  if (count === 1) return 'Punto';
  if (count === 2) return 'Línea';
  if (count === 3) return 'Triángulo';
  if (count === 4) return 'Cuadrilátero';
  return `Polígono (${count}v)`;
}

/** Shoelace polygon area */
function polygonAreaCalc(vertices: PolygonVertex[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/** Info about which wall edge is being assigned to a section */
interface WallAssignInfo {
  roomId: string;
  roomName: string;
  wallIndex: number;
  wallLenMm: number;
  isHorizontal: boolean; // true = runs along X (constant Y) → longitudinal; false = runs along Y (constant X) → transversal
  edgeAxisValue: number; // the Y or X value of the wall edge
  vertexA: { x: number; y: number };
  vertexB: { x: number; y: number };
  svgMidX: number;
  svgMidY: number;
}

/** Remove degenerate edges: merge vertices closer than threshold grid units */
function cleanDegenerateVertices(vertices: Array<{ x: number; y: number }>, threshold = 0.01): Array<{ x: number; y: number }> {
  if (vertices.length < 2) return vertices;
  const cleaned: Array<{ x: number; y: number }> = [];
  for (const v of vertices) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(v.x - last.x, v.y - last.y) > threshold) {
      cleaned.push(v);
    }
  }
  // Check last vs first
  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) <= threshold) {
      cleaned.pop();
    }
  }
  return cleaned;
}

interface SectionGridProps {
  section: CustomSection;
  scaleConfig?: ScaleConfig;
  rooms?: RoomData[];
  budgetName?: string;
  wallProjections?: SectionWallProjection[];
  allSections?: CustomSection[];
  onSectionsChange?: (sections: CustomSection[]) => void;
  onNavigateToWallSection?: (wallInfo: { roomId: string; roomName: string; wallIndex: number; isHorizontal: boolean; edgeAxisValue: number; sourceSectionType: string }) => void;
  planData?: import('@/lib/floor-plan-calculations').FloorPlanData;
  /** If true, show all rooms across all Z sections (overview mode) */
  isOverview?: boolean;
  allZSections?: CustomSection[];
  /** Configurable ridge line */
  ridgeLine?: import('@/hooks/useFloorPlan').RidgeLine | null;
  onRidgeLineChange?: (ridge: import('@/hooks/useFloorPlan').RidgeLine | null) => void;
}

function SectionGrid({ section, scaleConfig, rooms, budgetName, wallProjections, allSections, onSectionsChange, onNavigateToWallSection, planData, isOverview, allZSections, ridgeLine, onRidgeLineChange }: SectionGridProps) {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [gridMin, setGridMin] = useState(GRID_MIN);
  const [gridMax, setGridMax] = useState(GRID_MAX);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [editVertices, setEditVertices] = useState<PolygonVertex[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [showPlacementDialog, setShowPlacementDialog] = useState<string | null>(null);
  const [wallAssignInfo, setWallAssignInfo] = useState<WallAssignInfo | null>(null);
  const [wallAssignNewName, setWallAssignNewName] = useState('');
  const [wallAssignNewValue, setWallAssignNewValue] = useState('');
  const [ceilingAssignRoom, setCeilingAssignRoom] = useState<{ roomId: string; roomName: string } | null>(null);
  const [ceilingNewName, setCeilingNewName] = useState('');
  const [ceilingNewValue, setCeilingNewValue] = useState('');
  // ── New: draw workspace directly on section ──
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [showNewWorkspaceInput, setShowNewWorkspaceInput] = useState(false);
  // ── Edit existing section polygon (standalone) ──
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [editingPolygonName, setEditingPolygonName] = useState('');
  const [showPolygonsList, setShowPolygonsList] = useState(false);
  const [selectedFaceType, setSelectedFaceType] = useState('Suelo');
  const [selectedExistingWorkspace, setSelectedExistingWorkspace] = useState('');
  // ── Wall visual patterns: roomId → patternId (from Superficie layer 0) ──
  const [wallPatterns, setWallPatterns] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!rooms?.length) return;
    const roomIds = rooms.map(r => r.id);
    if (!roomIds.length) return;
    (async () => {
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index')
        .in('room_id', roomIds);
      if (!walls?.length) return;
      const wallIds = walls.map(w => w.id);
      const { data: objs } = await supabase
        .from('budget_wall_objects')
        .select('wall_id, visual_pattern, layer_order')
        .in('wall_id', wallIds)
        .eq('layer_order', 0)
        .not('visual_pattern', 'is', null);
      if (!objs?.length) { setWallPatterns(new Map()); return; }
      const wallRoomMap = new Map(walls.map(w => [w.id, w.room_id]));
      const pMap = new Map<string, string>();
      for (const o of objs) {
        const roomId = wallRoomMap.get(o.wall_id);
        if (roomId && o.visual_pattern) pMap.set(roomId, o.visual_pattern);
      }
      setWallPatterns(pMap);
    })();
  }, [rooms]);

  const gridCount = gridMax - gridMin + 1;
  const baseCellSize = 28;
  const cellSize = Math.round(baseCellSize * zoomLevel);
  const margin = { top: 60, left: 64, right: 48, bottom: 60 };
  const totalW = margin.left + gridCount * cellSize + margin.right;
  const totalH = margin.top + gridCount * cellSize + margin.bottom;

  const isElevation = section.sectionType !== 'vertical';
  const hLabel = section.sectionType === 'transversal' ? 'Y' : 'X';
  const vLabel = section.sectionType === 'vertical' ? 'Y' : 'Z';

  const getVIndex = (val: number) => {
    if (isElevation) return gridMax - val;
    return val - gridMin;
  };

  const getHIndex = (val: number) => val - gridMin;

  const scaleH = section.sectionType === 'transversal'
    ? (scaleConfig?.scaleY ?? 625)
    : (scaleConfig?.scaleX ?? 625);
  const scaleV = isElevation
    ? (scaleConfig?.scaleZ ?? 250)
    : (scaleConfig?.scaleY ?? 625);

  const scaleHm = scaleH / 1000;
  const scaleVm = scaleV / 1000;

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;

  // Convert grid coords to SVG pixel coords
  const toSvg = useCallback((gx: number, gy: number) => ({
    sx: margin.left + getHIndex(gx) * cellSize,
    sy: margin.top + getVIndex(gy) * cellSize,
  }), [cellSize, gridMin, gridMax, isElevation]);

  // Convert SVG pixel coords back to grid coords (snapped)
  const fromSvg = useCallback((px: number, py: number) => {
    const gx = Math.round((px - margin.left) / cellSize + gridMin);
    const gy = isElevation
      ? Math.round(gridMax - (py - margin.top) / cellSize)
      : Math.round((py - margin.top) / cellSize + gridMin);
    return { gx, gy };
  }, [cellSize, gridMin, gridMax, isElevation]);

  // Select a workspace for editing — show auto/manual dialog
  const selectWorkspace = (proj: SectionWallProjection) => {
    if (selectedWorkspaceId === proj.workspaceId) {
      setSelectedWorkspaceId(null);
      setEditVertices([]);
      setDrawingMode(false);
      return;
    }
    // Show placement dialog
    setShowPlacementDialog(proj.workspaceId);
  };

  // Start editing with automatic placement (use default polygon)
  const startAutomatic = (workspaceId: string) => {
    const proj = wallProjections?.find(p => p.workspaceId === workspaceId);
    if (!proj) return;
    setSelectedWorkspaceId(workspaceId);
    setEditVertices(getWorkspacePolygon(section, proj));
    setDrawingMode(false);
    setShowPlacementDialog(null);
  };

  // Start editing with manual drawing (empty, user clicks to add vertices)
  const startManual = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setEditVertices([]);
    setDrawingMode(true);
    setShowPlacementDialog(null);
    toast.info('Haz clic en la cuadrícula para marcar vértices. Doble clic para cerrar la figura.');
  };

  // Handle grid click in drawing mode — add vertex
  const handleGridClick = useCallback((e: React.MouseEvent) => {
    if (!drawingMode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { gx, gy } = fromSvg(px, py);
    const snappedX = Math.max(gridMin, Math.min(gridMax, gx));
    const snappedY = Math.max(gridMin, Math.min(gridMax, gy));
    setEditVertices(prev => [...prev, { x: snappedX, y: snappedY }]);
  }, [drawingMode, fromSvg, gridMin, gridMax]);

  // Handle double-click in drawing mode — close the shape
  const handleGridDblClick = useCallback((e: React.MouseEvent) => {
    if (!drawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    // If we have at least 1 vertex, close drawing
    if (editVertices.length >= 1) {
      setDrawingMode(false);
      toast.success(`Figura cerrada: ${geometryTypeLabel(editVertices.length)}`);
    }
  }, [drawingMode, editVertices.length]);

  // Drag vertex handling
  const handleMouseDown = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { gx, gy } = fromSvg(px, py);
    const snappedX = Math.max(gridMin, Math.min(gridMax, gx));
    const snappedY = Math.max(gridMin, Math.min(gridMax, gy));
    if (snappedX !== editVertices[draggingIdx].x || snappedY !== editVertices[draggingIdx].y) {
      const next = [...editVertices];
      next[draggingIdx] = { x: snappedX, y: snappedY };
      setEditVertices(next);
    }
  };

  const handleMouseUp = () => setDraggingIdx(null);

  // Add vertex to edited polygon
  const addVertex = () => {
    const last = editVertices[editVertices.length - 1];
    setEditVertices([...editVertices, { x: (last?.x ?? 0) + 1, y: last?.y ?? 0 }]);
  };

  // Remove vertex
  const removeVertex = (idx: number) => {
    if (editVertices.length <= 1) return;
    setEditVertices(editVertices.filter((_, i) => i !== idx));
  };

  // Save edited polygon back to section
  const saveEditedPolygon = () => {
    if (!selectedWorkspaceId || !allSections || !onSectionsChange) return;
    if (editVertices.length < 1) { toast.error('Mínimo 1 vértice (Punto)'); return; }

    // Clean degenerate edges (coincident vertices)
    const cleanedVerts = editVertices.length >= 3 ? cleanDegenerateVertices(editVertices) : editVertices;
    if (cleanedVerts.length < 1) { toast.error('Todos los vértices son coincidentes'); return; }
    if (cleanedVerts.length < editVertices.length) {
      toast.info(`Se eliminaron ${editVertices.length - cleanedVerts.length} vértice(s) duplicado(s)`);
    }

    const proj = wallProjections?.find(p => p.workspaceId === selectedWorkspaceId);
    const updatedSections = allSections.map(s => {
      if (s.id !== section.id) return s;
      const polys = [...(s.polygons || [])];
      const existingIdx = polys.findIndex(p => p.id === selectedWorkspaceId);
      const polyEntry: SectionPolygon = {
        id: selectedWorkspaceId,
        name: proj?.workspaceName || 'Espacio',
        vertices: cleanedVerts.map(v => ({ x: v.x, y: v.y, z: 0 })),
      };
      if (existingIdx >= 0) {
        polys[existingIdx] = polyEntry;
      } else {
        polys.push(polyEntry);
      }
      return { ...s, polygons: polys };
    });

    onSectionsChange(updatedSections);
    toast.success(`${geometryTypeLabel(editVertices.length)} guardado`);
    setSelectedWorkspaceId(null);
    setEditVertices([]);
    setDrawingMode(false);
  };

  // ── Wall click handler: detect orientation, open assignment panel ──
  const handleWallEdgeClick = useCallback((
    room: RoomData,
    wallIndex: number,
    vertexA: { x: number; y: number },
    vertexB: { x: number; y: number },
    svgMidX: number,
    svgMidY: number,
  ) => {
    const dxGrid = Math.abs(vertexB.x - vertexA.x);
    const dyGrid = Math.abs(vertexB.y - vertexA.y);
    const isHorizontal = dxGrid >= dyGrid;
    const edgeAxisValue = isHorizontal
      ? Math.round((vertexA.y + vertexB.y) / 2)
      : Math.round((vertexA.x + vertexB.x) / 2);

    const wallLenMm = Math.round(Math.hypot(
      (vertexB.x - vertexA.x) * scaleH,
      (vertexB.y - vertexA.y) * scaleV,
    ));

    setWallAssignInfo({
      roomId: room.id,
      roomName: room.name,
      wallIndex,
      wallLenMm,
      isHorizontal,
      edgeAxisValue,
      vertexA,
      vertexB,
      svgMidX,
      svgMidY,
    });
    setWallAssignNewName('');
    setWallAssignNewValue(String(edgeAxisValue));
  }, [scaleH, scaleV]);

  // ── Double-click on wall number → navigate to the section containing this wall ──
  const wallClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleWallNumberClick = useCallback((
    room: RoomData,
    wallIndex: number,
    vertexA: { x: number; y: number },
    vertexB: { x: number; y: number },
    svgMidX: number,
    svgMidY: number,
  ) => {
    if (wallClickTimerRef.current) {
      // Second click within 300ms → navigate
      clearTimeout(wallClickTimerRef.current);
      wallClickTimerRef.current = null;
      if (!onNavigateToWallSection) return;
      const dxGrid = Math.abs(vertexB.x - vertexA.x);
      const dyGrid = Math.abs(vertexB.y - vertexA.y);
      const isHorizontal = dxGrid >= dyGrid;
      const edgeAxisValue = isHorizontal
        ? Math.round((vertexA.y + vertexB.y) / 2)
        : Math.round((vertexA.x + vertexB.x) / 2);
      onNavigateToWallSection({
        roomId: room.id,
        roomName: room.name,
        wallIndex,
        isHorizontal,
        edgeAxisValue,
        sourceSectionType: section.sectionType,
      });
    } else {
      // First click → wait 300ms then do single-click action
      wallClickTimerRef.current = setTimeout(() => {
        wallClickTimerRef.current = null;
        handleWallEdgeClick(room, wallIndex, vertexA, vertexB, svgMidX, svgMidY);
      }, 300);
    }
  }, [onNavigateToWallSection, handleWallEdgeClick, section.sectionType]);

  // Assign wall to an existing section → auto-generate rectangle
  const assignWallToSection = useCallback((targetSectionId: string) => {
    if (!wallAssignInfo || !allSections || !onSectionsChange) return;
    const targetSection = allSections.find(s => s.id === targetSectionId);
    if (!targetSection) return;

    const room = rooms?.find(r => r.id === wallAssignInfo.roomId);
    const heightM = room?.height ?? 2.6;
    const blockHMm = scaleConfig?.scaleZ ?? 250;
    const heightBlocks = Math.round((heightM * 1000) / blockHMm);
    const zBase = section.axisValue;
    const zTop = zBase + heightBlocks;

    const { vertexA, vertexB, isHorizontal } = wallAssignInfo;
    let hStart: number, hEnd: number;
    if (isHorizontal) {
      hStart = Math.min(vertexA.x, vertexB.x);
      hEnd = Math.max(vertexA.x, vertexB.x);
    } else {
      hStart = Math.min(vertexA.y, vertexB.y);
      hEnd = Math.max(vertexA.y, vertexB.y);
    }

    const wallPolyEntry: SectionPolygon = {
      id: `${wallAssignInfo.roomId}_wall${wallAssignInfo.wallIndex}`,
      name: `${wallAssignInfo.roomName} P${wallAssignInfo.wallIndex + 1}`,
      vertices: [
        { x: hStart, y: zBase, z: 0 },
        { x: hEnd, y: zBase, z: 0 },
        { x: hEnd, y: zTop, z: 0 },
        { x: hStart, y: zTop, z: 0 },
      ],
    };

    const updatedSections = allSections.map(s => {
      if (s.id !== targetSectionId) return s;
      const polys = [...(s.polygons || [])];
      const existingIdx = polys.findIndex(p => p.id === wallPolyEntry.id);
      if (existingIdx >= 0) {
        polys[existingIdx] = wallPolyEntry;
      } else {
        polys.push(wallPolyEntry);
      }
      return { ...s, polygons: polys };
    });

    onSectionsChange(updatedSections);
    toast.success(`Pared ${wallAssignInfo.wallIndex + 1} asignada a ${targetSection.name}`);
    setWallAssignInfo(null);
  }, [wallAssignInfo, allSections, onSectionsChange, rooms, scaleConfig, section.axisValue]);

  // Create a new section and assign the wall to it
  const createSectionAndAssign = useCallback(() => {
    if (!wallAssignInfo || !allSections || !onSectionsChange) return;
    const name = wallAssignNewName.trim();
    if (!name) { toast.error('Introduce un nombre para la sección'); return; }
    const val = parseFloat(wallAssignNewValue) || wallAssignInfo.edgeAxisValue;

    const sType = wallAssignInfo.isHorizontal ? 'longitudinal' : 'transversal';
    const axis = wallAssignInfo.isHorizontal ? 'Y' : 'X';

    const newSection: CustomSection = {
      id: generateId(),
      name,
      sectionType: sType as any,
      axis: axis as any,
      axisValue: val,
      polygons: [],
    };

    const updatedWithNew = [...allSections, newSection];

    // Build wall polygon
    const room = rooms?.find(r => r.id === wallAssignInfo.roomId);
    const heightM = room?.height ?? 2.6;
    const blockHMm = scaleConfig?.scaleZ ?? 250;
    const heightBlocks = Math.round((heightM * 1000) / blockHMm);
    const zBase = section.axisValue;
    const zTop = zBase + heightBlocks;
    const { vertexA, vertexB, isHorizontal } = wallAssignInfo;
    let hStart: number, hEnd: number;
    if (isHorizontal) {
      hStart = Math.min(vertexA.x, vertexB.x);
      hEnd = Math.max(vertexA.x, vertexB.x);
    } else {
      hStart = Math.min(vertexA.y, vertexB.y);
      hEnd = Math.max(vertexA.y, vertexB.y);
    }

    const wallPolyEntry: SectionPolygon = {
      id: `${wallAssignInfo.roomId}_wall${wallAssignInfo.wallIndex}`,
      name: `${wallAssignInfo.roomName} P${wallAssignInfo.wallIndex + 1}`,
      vertices: [
        { x: hStart, y: zBase, z: 0 },
        { x: hEnd, y: zBase, z: 0 },
        { x: hEnd, y: zTop, z: 0 },
        { x: hStart, y: zTop, z: 0 },
      ],
    };

    const finalSections = updatedWithNew.map(s => {
      if (s.id !== newSection.id) return s;
      return { ...s, polygons: [wallPolyEntry] };
    });

    onSectionsChange(finalSections);
    toast.success(`Pared ${wallAssignInfo.wallIndex + 1} asignada a nueva sección "${name}"`);
    setWallAssignInfo(null);
    setWallAssignNewName('');
  }, [wallAssignInfo, wallAssignNewName, wallAssignNewValue, allSections, onSectionsChange, rooms, scaleConfig, section.axisValue]);

  // ── Ceiling assignment ──
  const assignCeilingToSection = useCallback((targetSectionId: string) => {
    if (!ceilingAssignRoom || !allSections || !onSectionsChange) return;
    const room = rooms?.find(r => r.id === ceilingAssignRoom.roomId);
    if (!room || !room.floorPolygon || room.floorPolygon.length < 3) return;

    const ceilingPoly: SectionPolygon = {
      id: `${ceilingAssignRoom.roomId}_ceiling`,
      name: `${ceilingAssignRoom.roomName} (Techo)`,
      vertices: room.floorPolygon.map(v => ({ x: v.x, y: v.y, z: 0 })),
    };

    const updatedSections = allSections.map(s => {
      if (s.id !== targetSectionId) return s;
      const polys = [...(s.polygons || [])];
      const existingIdx = polys.findIndex(p => p.id === ceilingPoly.id);
      if (existingIdx >= 0) polys[existingIdx] = ceilingPoly;
      else polys.push(ceilingPoly);
      return { ...s, polygons: polys };
    });

    onSectionsChange(updatedSections);
    toast.success(`Techo de ${ceilingAssignRoom.roomName} asignado`);
    setCeilingAssignRoom(null);
  }, [ceilingAssignRoom, allSections, onSectionsChange, rooms]);

  const createCeilingSectionAndAssign = useCallback(() => {
    if (!ceilingAssignRoom || !allSections || !onSectionsChange) return;
    const name = ceilingNewName.trim();
    if (!name) { toast.error('Introduce un nombre'); return; }
    const val = parseFloat(ceilingNewValue) || 0;
    const room = rooms?.find(r => r.id === ceilingAssignRoom.roomId);
    if (!room || !room.floorPolygon) return;

    const newSection: CustomSection = {
      id: generateId(),
      name,
      sectionType: 'vertical',
      axis: 'Z',
      axisValue: val,
      polygons: [],
    };

    const ceilingPoly: SectionPolygon = {
      id: `${ceilingAssignRoom.roomId}_ceiling`,
      name: `${ceilingAssignRoom.roomName} (Techo)`,
      vertices: room.floorPolygon.map(v => ({ x: v.x, y: v.y, z: 0 })),
    };

    const finalSections = [...allSections, { ...newSection, polygons: [ceilingPoly] }];
    onSectionsChange(finalSections);
    toast.success(`Techo asignado a nueva sección "${name}"`);
    setCeilingAssignRoom(null);
    setCeilingNewName('');
  }, [ceilingAssignRoom, ceilingNewName, ceilingNewValue, allSections, onSectionsChange, rooms]);

  // Reset to default rectangle
  const resetToDefault = () => {
    if (!selectedWorkspaceId || !wallProjections) return;
    const proj = wallProjections.find(p => p.workspaceId === selectedWorkspaceId);
    if (!proj) return;
    setDrawingMode(false);
    setEditVertices([
      { x: proj.hStart, y: proj.zBase },
      { x: proj.hEnd, y: proj.zBase },
      { x: proj.hEnd, y: proj.zTop },
      { x: proj.hStart, y: proj.zTop },
    ]);
  };

  // ── Face types ──
  const FACE_OPTIONS_BY_SECTION: Record<string, string[]> = {
    vertical: ['Suelo', 'Techo'],
    longitudinal: ['Pared', 'Suelo', 'Techo'],
    transversal: ['Pared', 'Suelo', 'Techo'],
  };

  const getDefaultFaceType = () => {
    return section.sectionType === 'vertical' ? 'Suelo' : 'Pared';
  };

  // Collect all unique workspace names across ALL sections
  const allWorkspaceNames = (() => {
    const names = new Set<string>();
    // From rooms (existing workspace system)
    rooms?.forEach(r => names.add(r.name));
    // From wallProjections
    wallProjections?.forEach(wp => names.add(wp.workspaceName));
    // From all section polygons — extract workspace name from polygon name
    allSections?.forEach(s => {
      s.polygons?.forEach(p => {
        // Extract workspace name: "Cocina (Suelo)" → "Cocina", "Cocina P1" → "Cocina"
        const wsName = p.name.replace(/\s*\((?:Suelo|Techo|Pared\s*\d*)\)\s*$/, '').replace(/\s+P\d+$/, '').trim();
        if (wsName) names.add(wsName);
      });
    });
    return Array.from(names).sort();
  })();

  // Count existing faces for a workspace to auto-number walls
  const getNextWallIndex = (workspaceName: string) => {
    let maxIdx = 0;
    allSections?.forEach(s => {
      s.polygons?.forEach(p => {
        const match = p.name.match(new RegExp(`^${workspaceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+P(\\d+)$`));
        if (match) maxIdx = Math.max(maxIdx, parseInt(match[1]));
        if (p.name === `${workspaceName} (Pared)`) maxIdx = Math.max(maxIdx, 1);
      });
    });
    return maxIdx + 1;
  };

  // Build the full polygon display name
  const buildPolygonName = (workspaceName: string, faceType: string, wallIndex?: number) => {
    if (faceType === 'Pared') {
      const idx = wallIndex ?? getNextWallIndex(workspaceName);
      return `${workspaceName} P${idx}`;
    }
    return `${workspaceName} (${faceType})`;
  };

  // Build polygon ID
  const buildPolygonId = (workspaceName: string, faceType: string, wallIndex?: number) => {
    const sanitized = workspaceName.replace(/\s+/g, '_').toLowerCase();
    if (faceType === 'Suelo') return `ws_${sanitized}_suelo`;
    if (faceType === 'Techo') return `ws_${sanitized}_techo`;
    const idx = wallIndex ?? getNextWallIndex(workspaceName);
    return `ws_${sanitized}_pared${idx}`;
  };


  // ── Start drawing a face for a workspace ──
  const startNewWorkspaceDrawing = () => {
    const wsName = newWorkspaceName.trim() || selectedExistingWorkspace;
    if (!wsName) { toast.error('Selecciona o crea un Espacio de trabajo'); return; }

    const wallIdx = selectedFaceType === 'Pared' ? getNextWallIndex(wsName) : undefined;
    const polyId = buildPolygonId(wsName, selectedFaceType, wallIdx);
    const polyName = buildPolygonName(wsName, selectedFaceType, wallIdx);

    // Check if this face already exists
    const existing = section.polygons?.find(p => p.id === polyId);
    if (existing && selectedFaceType !== 'Pared') {
      toast.error(`"${polyName}" ya existe en esta sección. Edítalo desde la lista.`);
      return;
    }

    setIsCreatingWorkspace(true);
    setSelectedWorkspaceId(null);
    setEditingPolygonId(polyId);
    setEditingPolygonName(polyName);
    setEditVertices([]);
    setDrawingMode(true);
    setShowNewWorkspaceInput(false);
    toast.info(`Dibuja "${polyName}" — Clic para añadir vértices, doble clic para cerrar.`);
  };

  // Save a newly drawn or edited polygon
  const saveStandalonePolygon = () => {
    if (!editingPolygonId || !allSections || !onSectionsChange) return;
    if (editVertices.length < 1) { toast.error('Mínimo 1 vértice'); return; }
    const polyName = editingPolygonName.trim() || 'Espacio';

    // Clean degenerate edges (coincident vertices)
    const cleanedVerts = editVertices.length >= 3 ? cleanDegenerateVertices(editVertices) : editVertices;
    if (cleanedVerts.length < 1) { toast.error('Todos los vértices son coincidentes'); return; }
    if (cleanedVerts.length < editVertices.length) {
      toast.info(`Se eliminaron ${editVertices.length - cleanedVerts.length} vértice(s) duplicado(s)`);
    }

    const updatedSections = allSections.map(s => {
      if (s.id !== section.id) return s;
      const polys = [...(s.polygons || [])];
      const existingIdx = polys.findIndex(p => p.id === editingPolygonId);
      const polyEntry: SectionPolygon = {
        id: editingPolygonId,
        name: polyName,
        vertices: cleanedVerts.map(v => ({ x: v.x, y: v.y, z: 0 })),
      };
      if (existingIdx >= 0) {
        polys[existingIdx] = polyEntry;
      } else {
        polys.push(polyEntry);
      }
      return { ...s, polygons: polys };
    });

    onSectionsChange(updatedSections);
    toast.success(`"${polyName}" guardado (${geometryTypeLabel(editVertices.length)})`);
    setEditingPolygonId(null);
    setEditingPolygonName('');
    setEditVertices([]);
    setDrawingMode(false);
    setIsCreatingWorkspace(false);
    setNewWorkspaceName('');
    setSelectedExistingWorkspace('');
  };

  const cancelNewWorkspace = () => {
    setEditingPolygonId(null);
    setEditingPolygonName('');
    setEditVertices([]);
    setDrawingMode(false);
    setIsCreatingWorkspace(false);
    setShowNewWorkspaceInput(false);
    setNewWorkspaceName('');
    setSelectedExistingWorkspace('');
  };

  const selectSectionPolygon = (poly: SectionPolygon) => {
    if (editingPolygonId === poly.id) {
      cancelNewWorkspace();
      return;
    }
    setSelectedWorkspaceId(null);
    setEditingPolygonId(poly.id);
    setEditingPolygonName(poly.name);
    setEditVertices(poly.vertices.map(v => ({ x: v.x, y: v.y })));
    setDrawingMode(false);
    setIsCreatingWorkspace(false);
  };

  const deleteSectionPolygon = (polyId: string) => {
    if (!allSections || !onSectionsChange) return;
    const updatedSections = allSections.map(s => {
      if (s.id !== section.id) return s;
      return { ...s, polygons: (s.polygons || []).filter(p => p.id !== polyId) };
    });
    onSectionsChange(updatedSections);
    if (editingPolygonId === polyId) cancelNewWorkspace();
    toast.success('Cara eliminada');
  };

  // Get all section polygons (excluding wallProjection-bound ones)
  const standalonePolygons = (section.polygons || []).filter(p => {
    if (wallProjections?.some(wp => wp.workspaceId === p.id)) return false;
    return true;
  });

  // Group standalone polygons by workspace name
  const groupedPolygons = (() => {
    const groups: Record<string, SectionPolygon[]> = {};
    standalonePolygons.forEach(p => {
      const wsName = p.name.replace(/\s*\((?:Suelo|Techo|Pared\s*\d*)\)\s*$/, '').replace(/\s+P\d+$/, '').trim();
      if (!groups[wsName]) groups[wsName] = [];
      groups[wsName].push(p);
    });
    return groups;
  })();


  // Helper: get visual pattern for a standalone polygon by matching workspace name to rooms
  const getStandalonePolygonPattern = (poly: SectionPolygon): string | undefined => {
    const wsName = poly.name.replace(/\s*\((?:Suelo|Techo|Pared\s*\d*)\)\s*$/, '').replace(/\s+P\d+$/, '').trim();
    const room = rooms?.find(r => r.name === wsName);
    if (room) return wallPatterns.get(room.id);
    return undefined;
  };

  const renderWorkspaceGeometry = (
    verts: PolygonVertex[],
    proj: SectionWallProjection,
    pi: number,
    isEditingThis: boolean,
  ) => {
    if (verts.length === 0) return null;

    const color = PROJ_COLORS[pi % PROJ_COLORS.length];
    const svgPts = verts.map(v => toSvg(v.x, v.y));
    const fontSize = Math.round(7 * Math.max(1, zoomLevel * 0.8));

    // ─── POINT (1 vertex) ───
    if (verts.length === 1) {
      const { sx, sy } = svgPts[0];
      return (
        <g key={`proj-${proj.workspaceId}-${pi}`}>
          <circle
            cx={sx} cy={sy} r={isEditingThis ? 8 : 6}
            fill={hslWithAlpha(color, 0.6)}
            stroke={color} strokeWidth={2}
            className={isEditingThis ? '' : 'cursor-pointer'}
            onClick={() => !isEditingThis && selectWorkspace(proj)}
          />
          <text x={sx} y={sy - 12} textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
            className="pointer-events-none select-none"
          >
            {hLabel}{verts[0].x},{vLabel}{verts[0].y}
          </text>
          <rect x={sx - 25} y={sy + 10} width={50} height={14} rx={3}
            fill="hsl(45 100% 50% / 0.85)"
            className={isEditingThis ? '' : 'cursor-pointer'}
            onClick={() => !isEditingThis && selectWorkspace(proj)}
          />
          <text x={sx} y={sy + 19} textAnchor="middle" fontSize={fontSize} fontWeight={700}
            fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
          >
            {proj.workspaceName}
          </text>
          {isEditingThis && (
            <circle cx={sx} cy={sy} r={draggingIdx === 0 ? 10 : 7}
              fill={draggingIdx === 0 ? 'hsl(var(--destructive))' : color}
              stroke="white" strokeWidth={2} className="cursor-grab"
              onMouseDown={(e) => handleMouseDown(0, e)}
            />
          )}
        </g>
      );
    }

    // ─── LINE (2 vertices) ───
    if (verts.length === 2) {
      const { sx: x1, sy: y1 } = svgPts[0];
      const { sx: x2, sy: y2 } = svgPts[1];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const lineLenMm = Math.round(Math.sqrt(
        ((verts[1].x - verts[0].x) * scaleHm) ** 2 + ((verts[1].y - verts[0].y) * scaleVm) ** 2
      ) * 1000);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const rotAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

      return (
        <g key={`proj-${proj.workspaceId}-${pi}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth={isEditingThis ? 3 : 2} strokeLinecap="round"
            className={isEditingThis ? '' : 'cursor-pointer'}
            onClick={() => !isEditingThis && selectWorkspace(proj)}
          />
          {verts.map((v, vi) => {
            const { sx, sy } = svgPts[vi];
            return (
              <text key={`vl-${vi}`} x={sx} y={sy - 8}
                textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
                className="pointer-events-none select-none"
              >{hLabel}{v.x},{vLabel}{v.y}</text>
            );
          })}
          <text x={mx} y={my - 8} textAnchor="middle" dominantBaseline="central"
            transform={`rotate(${rotAngle}, ${mx}, ${my - 8})`}
            fontSize={fontSize} fontWeight={700} fill={color}
            className="pointer-events-none select-none"
          >{lineLenMm} mm</text>
          <rect x={mx - 25} y={my + 3} width={50} height={14} rx={3}
            fill="hsl(45 100% 50% / 0.85)"
            className={isEditingThis ? '' : 'cursor-pointer'}
            onClick={() => !isEditingThis && selectWorkspace(proj)}
          />
          <text x={mx} y={my + 12} textAnchor="middle" fontSize={fontSize} fontWeight={700}
            fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
          >{proj.workspaceName}</text>
          {isEditingThis && verts.map((v, vi) => {
            const { sx, sy } = svgPts[vi];
            return (
              <circle key={`dv-${vi}`} cx={sx} cy={sy} r={draggingIdx === vi ? 7 : 5}
                fill={draggingIdx === vi ? 'hsl(var(--destructive))' : color}
                stroke="white" strokeWidth={2} className="cursor-grab"
                onMouseDown={(e) => handleMouseDown(vi, e)}
              />
            );
          })}
        </g>
      );
    }

    // ─── POLYGON (3+ vertices) ───
    const points = svgPts.map(p => `${p.sx},${p.sy}`).join(' ');
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
    const { sx: cxSvg, sy: cySvg } = toSvg(cx, cy);
    const areaVal = polygonAreaCalc(verts) * scaleHm * scaleVm;

    const isVerticalSection = section.sectionType === 'vertical';

    return (
      <g key={`proj-${proj.workspaceId}-${pi}`}>
        {/* Fill polygon — never captures clicks in vertical sections (walls must stay clickable) */}
        {(() => {
          const patId = wallPatterns.get(proj.workspaceId);
          const pat = patId ? getPatternById(patId) : undefined;
          return (
            <polygon points={points}
              fill={pat ? `url(#wall-pattern-${pat.id})` : hslWithAlpha(color, isEditingThis ? 0.25 : 0.12)}
              stroke="none"
              className={isEditingThis || isVerticalSection ? '' : 'cursor-pointer'}
              style={{ pointerEvents: isVerticalSection ? 'none' : undefined }}
              onClick={() => !isEditingThis && !isVerticalSection && selectWorkspace(proj)}
            />
          );
        })()}

        {/* ── Clickable wall edges for vertical (Z) sections ── */}
        {isVerticalSection && verts.map((v, ei) => {
          const next = verts[(ei + 1) % verts.length];
          const { sx: x1, sy: y1 } = svgPts[ei];
          const { sx: x2, sy: y2 } = svgPts[(ei + 1) % svgPts.length];
          const emx = (x1 + x2) / 2;
          const emy = (y1 + y2) / 2;
          const edx = x2 - x1;
          const edy = y2 - y1;

          const edgeDxGrid = Math.abs(next.x - v.x);
          const edgeDyGrid = Math.abs(next.y - v.y);
          const isHoriz = edgeDxGrid >= edgeDyGrid;
          const isThisWallSelected = wallAssignInfo?.roomId === proj.workspaceId && wallAssignInfo?.wallIndex === ei;

          const pseudoRoom = { id: proj.workspaceId, name: proj.workspaceName } as RoomData;

          return (
            <g key={`wall-edge-${proj.workspaceId}-${ei}`}>
              {/* Wide hit area for reliable clicks */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.001}
                strokeWidth={14}
                pointerEvents="stroke"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleWallEdgeClick(pseudoRoom, ei, v, next, emx, emy);
                }}
              />
              {/* Visible edge line — highlight if selected */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isThisWallSelected ? (isHoriz ? 'hsl(150 70% 40%)' : 'hsl(30 80% 50%)') : color}
                strokeWidth={isThisWallSelected ? 3 : 1.5}
                strokeDasharray={isThisWallSelected ? 'none' : '4 2'}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleWallEdgeClick(pseudoRoom, ei, v, next, emx, emy);
                }}
              />
              {/* Wall number badge */}
              {(() => {
                const len = Math.sqrt(edx * edx + edy * edy) || 1;
                let wnx = -edy / len;
                let wny = edx / len;
                const toCenter = (cxSvg - emx) * wnx + (cySvg - emy) * wny;
                if (toCenter > 0) { wnx = -wnx; wny = -wny; }
                const offX = emx + wnx * 12;
                const offY = emy + wny * 12;
                return (
                  <>
                    <circle cx={offX} cy={offY} r={6}
                      fill={isThisWallSelected ? (isHoriz ? 'hsl(150 70% 40%)' : 'hsl(30 80% 50%)') : 'hsl(210 60% 50%)'}
                      className="cursor-pointer"
                      data-pdf-wall-number=""
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWallNumberClick(pseudoRoom, ei, v, next, emx, emy);
                      }}
                    />
                    <text x={offX} y={offY} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="7" fontWeight="bold" className="pointer-events-none select-none"
                      data-pdf-wall-number=""
                    >
                      {ei + 1}
                    </text>
                  </>
                );
              })()}
              {/* Section type hint on selected wall */}
              {isThisWallSelected && (
                <text
                  x={emx} y={emy + 14}
                  textAnchor="middle" fontSize={7} fontWeight={700}
                  fill={isHoriz ? 'hsl(150 70% 30%)' : 'hsl(30 80% 40%)'}
                  className="pointer-events-none select-none"
                >
                  {isHoriz ? '→ Longitudinal Y' : '→ Transversal X'}
                </text>
              )}
            </g>
          );
        })}

        {/* Non-vertical sections: draw stroke on polygon */}
        {!isVerticalSection && (
          <polygon points={points}
            fill="none"
            stroke={color} strokeWidth={isEditingThis ? 2.5 : 1.5}
            strokeDasharray={isEditingThis ? 'none' : '4 2'}
            className="pointer-events-none"
          />
        )}

        {/* Edge measurements */}
        {verts.map((v, ei) => {
          const next = verts[(ei + 1) % verts.length];
          const { sx: x1, sy: y1 } = toSvg(v.x, v.y);
          const { sx: x2, sy: y2 } = toSvg(next.x, next.y);
          const emx = (x1 + x2) / 2;
          const emy = (y1 + y2) / 2;
          const edx = x2 - x1;
          const edy = y2 - y1;
          const eAngle = Math.atan2(edy, edx) * (180 / Math.PI);
          const eRotAngle = (eAngle > 90 || eAngle < -90) ? eAngle + 180 : eAngle;
          const eLenMm = Math.round(Math.sqrt(
            ((next.x - v.x) * scaleHm) ** 2 + ((next.y - v.y) * scaleVm) ** 2
          ) * 1000);
          const len = Math.sqrt(edx * edx + edy * edy) || 1;
          let nx = -edy / len;
          let ny = edx / len;
          if ((cxSvg - emx) * nx + (cySvg - emy) * ny > 0) { nx = -nx; ny = -ny; }
          const offPx = isEditingThis ? 14 : 10;
          return (
            <text key={`emm-${ei}`}
              x={emx + nx * offPx} y={emy + ny * offPx}
              textAnchor="middle" dominantBaseline="central"
              transform={`rotate(${eRotAngle}, ${emx + nx * offPx}, ${emy + ny * offPx})`}
              fontSize={fontSize} fontWeight={700} fill={color}
              className="pointer-events-none select-none"
              data-pdf-dimension=""
            >{eLenMm} mm</text>
          );
        })}
        {/* Vertex labels */}
        {verts.map((v, vi) => (
          <text key={`vl-${vi}`} x={toSvg(v.x, v.y).sx} y={toSvg(v.x, v.y).sy - (isEditingThis ? 10 : 7)}
            textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
            className="pointer-events-none select-none"
            data-pdf-vertex-label=""
          >{hLabel}{v.x},{vLabel}{v.y}</text>
        ))}

        {/* Ceiling assignment button (vertical sections only) */}
        {isVerticalSection && !isEditingThis && (
          <>
            <rect
              x={cxSvg + 22} y={cySvg - 16} width={16} height={16} rx={3}
              fill="hsl(210 70% 55% / 0.8)" className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setCeilingAssignRoom({ roomId: proj.workspaceId, roomName: proj.workspaceName });
                setCeilingNewName('');
                setCeilingNewValue('');
              }}
            />
            <text
              x={cxSvg + 30} y={cySvg - 8} textAnchor="middle" fontSize={8} fontWeight={700}
              fill="white" className="pointer-events-none select-none"
            >T</text>
          </>
        )}

        {/* Name + area label */}
        <rect x={cxSvg - 30} y={cySvg - 10} width={60} height={20} rx={3}
          fill="hsl(45 100% 50% / 0.85)"
          className={isEditingThis ? '' : 'cursor-pointer'}
          data-pdf-workspace-name=""
          onClick={() => !isEditingThis && selectWorkspace(proj)}
        />
        <text x={cxSvg} y={cySvg - 1} textAnchor="middle" fontSize={fontSize} fontWeight={700}
          fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
          data-pdf-workspace-name=""
        >{proj.workspaceName}</text>
        <text x={cxSvg} y={cySvg + 8} textAnchor="middle" fontSize={fontSize - 1} fontWeight={500}
          fill="hsl(0 0% 25%)" className="pointer-events-none select-none"
          data-pdf-workspace-name=""
        >{areaVal.toFixed(2)} m²</text>
        {/* Draggable vertices */}
        {isEditingThis && verts.map((v, vi) => {
          const { sx, sy } = toSvg(v.x, v.y);
          return (
            <g key={`dv-${vi}`}>
              <circle cx={sx} cy={sy} r={draggingIdx === vi ? 7 : 5}
                fill={draggingIdx === vi ? 'hsl(var(--destructive))' : color}
                stroke="white" strokeWidth={2} className="cursor-grab"
                onMouseDown={(e) => handleMouseDown(vi, e)}
              />
              <text x={sx} y={sy + 16} textAnchor="middle" fontSize={7} fontWeight={700}
                fill={color} className="pointer-events-none select-none"
              >V{vi + 1}</text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-2 pt-1 pb-0.5 flex-wrap gap-1">
        <span className="text-[9px] text-muted-foreground">
          {section.sectionType === 'vertical' && `Vista planta Z=${section.axisValue} — Origen (0,0) arriba-izq`}
          {section.sectionType === 'longitudinal' && `Vista longitudinal Y=${section.axisValue} — Origen (0,0) abajo-izq`}
          {section.sectionType === 'transversal' && `Vista transversal X=${section.axisValue} — Origen (0,0) abajo-izq`}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Zoom controls +/- */}
          <div className="flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" disabled={zoomLevel <= ZOOM_MIN}
              onClick={() => setZoomLevel(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))} title="Reducir zoom">
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-[9px] font-mono text-muted-foreground min-w-[32px] text-center">{zoomLevel}x</span>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" disabled={zoomLevel >= ZOOM_MAX}
              onClick={() => setZoomLevel(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} title="Ampliar zoom">
              <ZoomIn className="h-3 w-3" />
            </Button>
            {[1, 2, 3].map(z => (
              <Button key={z} variant={zoomLevel === z ? 'default' : 'ghost'} size="sm"
                className="h-4 px-1.5 text-[8px] min-w-0" onClick={() => setZoomLevel(z)}>{z}x</Button>
            ))}
          </div>
          {/* Grid range controls */}
          <div className="flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5">
            <span className="text-[8px] text-muted-foreground font-medium">Rango:</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMin(m => m - 3)} title="Ampliar mín −3">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[8px] font-mono text-muted-foreground">{gridMin}</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMin(m => Math.min(m + 3, -1))} title="Reducir mín +3">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <span className="text-[8px] text-muted-foreground mx-0.5">→</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMax(m => Math.max(m - 3, 1))} title="Reducir máx −3">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[8px] font-mono text-muted-foreground">{gridMax}</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMax(m => m + 3)} title="Ampliar máx +3">
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-[9px] text-muted-foreground/60">
            {hLabel}: {scaleH}mm · {vLabel}: {scaleV}mm
          </span>
          <GridPdfExport
            title={budgetName || 'Presupuesto'}
            subtitle={`${section.name} (${section.axis}=${section.axisValue})`}
            containerRef={gridContainerRef}
            size="sm"
            hAxisLabel={hLabel}
            vAxisLabel={vLabel}
            scaleH={scaleH}
            scaleV={scaleV}
          />
          {/* Draw workspace directly on section */}
          <Button
            variant={showNewWorkspaceInput ? 'default' : 'outline'}
            size="sm"
            className="h-5 text-[9px] gap-0.5 px-1.5"
            onClick={() => {
              setShowNewWorkspaceInput(!showNewWorkspaceInput);
              setNewWorkspaceName('');
              setSelectedExistingWorkspace('');
              setSelectedFaceType(getDefaultFaceType());
            }}
            disabled={isCreatingWorkspace || !!editingPolygonId}
          >
            <Plus className="h-3 w-3" /> Dibujar Cara
          </Button>
          {/* Toggle polygon list */}
          {standalonePolygons.length > 0 && (
            <Button
              variant={showPolygonsList ? 'default' : 'ghost'}
              size="sm"
              className="h-5 text-[9px] gap-0.5 px-1.5"
              onClick={() => setShowPolygonsList(!showPolygonsList)}
            >
              <Pencil className="h-3 w-3" /> Caras ({standalonePolygons.length})
            </Button>
          )}
        </div>
      </div>

      {/* ── New face drawing panel ── */}
      {showNewWorkspaceInput && (
        <div className="px-2 py-2 bg-accent/20 border border-accent rounded-md mx-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Workspace selector: existing or new */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-foreground shrink-0">Espacio:</span>
              {allWorkspaceNames.length > 0 && (
                <select
                  className="h-6 text-[10px] rounded border border-input bg-background px-1.5"
                  value={selectedExistingWorkspace}
                  onChange={e => { setSelectedExistingWorkspace(e.target.value); setNewWorkspaceName(''); }}
                >
                  <option value="">— Nuevo —</option>
                  {allWorkspaceNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              {!selectedExistingWorkspace && (
                <Input
                  className="h-6 text-[10px] w-32"
                  placeholder="Nombre nuevo..."
                  value={newWorkspaceName}
                  onChange={e => setNewWorkspaceName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startNewWorkspaceDrawing()}
                  autoFocus
                />
              )}
            </div>

            {/* Face type selector */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-foreground shrink-0">Cara:</span>
              <div className="flex items-center gap-0.5">
                {(FACE_OPTIONS_BY_SECTION[section.sectionType] || ['Suelo']).map(face => (
                  <Button
                    key={face}
                    variant={selectedFaceType === face ? 'default' : 'outline'}
                    size="sm"
                    className="h-5 text-[9px] px-2"
                    onClick={() => setSelectedFaceType(face)}
                  >
                    {face}
                  </Button>
                ))}
                {/* Allow Pared on Z sections too for special cases */}
                {section.sectionType === 'vertical' && (
                  <Button
                    variant={selectedFaceType === 'Pared' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-5 text-[9px] px-2"
                    onClick={() => setSelectedFaceType('Pared')}
                  >
                    Pared
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-6 text-[10px] gap-0.5"
              onClick={startNewWorkspaceDrawing}
              disabled={!newWorkspaceName.trim() && !selectedExistingWorkspace}
            >
              <PenTool className="h-3 w-3" /> Dibujar {selectedFaceType}
            </Button>
            <span className="text-[9px] text-muted-foreground">
              {(selectedExistingWorkspace || newWorkspaceName.trim()) && selectedFaceType
                ? `→ "${buildPolygonName(selectedExistingWorkspace || newWorkspaceName.trim(), selectedFaceType)}"`
                : ''}
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { setShowNewWorkspaceInput(false); setNewWorkspaceName(''); setSelectedExistingWorkspace(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Polygon list panel (grouped by workspace) ── */}
      {showPolygonsList && standalonePolygons.length > 0 && (
        <div className="mx-1 px-2 py-1.5 border border-border rounded-md bg-card space-y-1.5">
          <span className="text-[10px] font-semibold text-foreground">Caras en esta sección:</span>
          {Object.entries(groupedPolygons).map(([wsName, polys]) => (
            <div key={wsName} className="space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">{wsName}</span>
              {polys.map((poly, pi) => {
                const isActive = editingPolygonId === poly.id;
                const vertCount = poly.vertices.length;
                const color = PROJ_COLORS[(standalonePolygons.indexOf(poly) + (wallProjections?.length || 0)) % PROJ_COLORS.length];
                // Extract face label from name
                const faceLabel = poly.name.replace(wsName, '').trim();
                return (
                  <div key={poly.id} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${isActive ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent/30'}`}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[10px] font-medium flex-1 truncate cursor-pointer" onClick={() => selectSectionPolygon(poly)}>
                      {faceLabel || poly.name}
                    </span>
                    <Badge variant="outline" className="text-[8px] h-3.5 shrink-0">{geometryTypeLabel(vertCount)}</Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => selectSectionPolygon(poly)} title="Editar">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive hover:bg-destructive/10" onClick={() => deleteSectionPolygon(poly.id)} title="Eliminar">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}


      {showPlacementDialog && wallProjections && (() => {
        const diagProj = wallProjections.find(p => p.workspaceId === showPlacementDialog);
        if (!diagProj) return null;
        return (
          <div className="flex items-center gap-2 px-2 py-2 bg-accent/30 border border-accent rounded-md">
            <span className="text-xs font-medium">Ubicación de <strong>{diagProj.workspaceName}</strong>:</span>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => startAutomatic(showPlacementDialog)}>
              <MousePointer className="h-3 w-3" /> Automática
            </Button>
            <Button variant="default" size="sm" className="h-7 text-[10px] gap-1" onClick={() => startManual(showPlacementDialog)}>
              <PenTool className="h-3 w-3" /> Manual
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setShowPlacementDialog(null)}>
              Cancelar
            </Button>
          </div>
        );
      })()}

      {/* Legend for workspaces */}
      {wallProjections && wallProjections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-2 py-1">
          <span className="text-[9px] text-muted-foreground font-medium">Espacios:</span>
          {wallProjections.map((proj, pi) => {
            const isActive = selectedWorkspaceId === proj.workspaceId;
            const savedPoly = section.polygons?.find(p => p.id === proj.workspaceId);
            const isHidden = savedPoly?.vertices.length === 0;
            const vertCount = isHidden ? 0 : (savedPoly?.vertices.length ?? 4);
            return (
              <div
                key={proj.workspaceId}
                className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition-colors ${isHidden ? 'opacity-40' : ''} ${isActive ? 'bg-primary/15 border-primary font-semibold' : 'hover:bg-accent/50'}`}
                style={{ borderColor: isActive ? undefined : PROJ_COLORS[pi % PROJ_COLORS.length] }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PROJ_COLORS[pi % PROJ_COLORS.length] }} />
                <button
                  className="truncate"
                  onClick={() => !isHidden && selectWorkspace(proj)}
                  title={isHidden ? 'Oculto' : isActive ? 'Deseleccionar' : `Editar ${proj.workspaceName}`}
                >
                  {proj.workspaceName}
                </button>
                {!isHidden && <span className="text-muted-foreground ml-0.5">({geometryTypeLabel(vertCount)})</span>}
                {isActive && <span className="text-primary ml-0.5">✎</span>}
                {isElevation && (
                  isHidden ? (
                    <button className="ml-0.5 text-muted-foreground hover:text-foreground" title="Mostrar"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!allSections || !onSectionsChange) return;
                        const updatedSections = allSections.map(s => {
                          if (s.id !== section.id) return s;
                          return { ...s, polygons: (s.polygons || []).filter(p => p.id !== proj.workspaceId) };
                        });
                        onSectionsChange(updatedSections);
                        toast.success(`${proj.workspaceName} restaurado`);
                      }}
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  ) : (
                    <button className="ml-0.5 text-destructive/60 hover:text-destructive" title="Ocultar en esta sección"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!allSections || !onSectionsChange) return;
                        const hiddenEntry: SectionPolygon = { id: proj.workspaceId, name: proj.workspaceName, vertices: [] };
                        const updatedSections = allSections.map(s => {
                          if (s.id !== section.id) return s;
                          const polys = [...(s.polygons || [])];
                          const existingIdx = polys.findIndex(p => p.id === proj.workspaceId);
                          if (existingIdx >= 0) polys[existingIdx] = hiddenEntry;
                          else polys.push(hiddenEntry);
                          return { ...s, polygons: polys };
                        });
                        onSectionsChange(updatedSections);
                        if (selectedWorkspaceId === proj.workspaceId) {
                          setSelectedWorkspaceId(null);
                          setEditVertices([]);
                        }
                        toast.success(`${proj.workspaceName} ocultado`);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div ref={gridContainerRef} className="overflow-auto border border-border rounded-md bg-muted/20" style={{ maxHeight: zoomLevel > 1 ? '600px' : undefined }}>
      <svg
        ref={svgRef}
        width={totalW}
        height={totalH}
        className="block"
        style={{ cursor: drawingMode ? 'crosshair' : draggingIdx !== null ? 'grabbing' : undefined }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleGridClick}
        onDoubleClick={handleGridDblClick}
      >
        {/* SVG pattern definitions for wall visual patterns */}
        <defs>
          {VISUAL_PATTERNS.map(p => (
            <pattern
              key={`pat-${p.id}`}
              id={`wall-pattern-${p.id}`}
              patternUnits="userSpaceOnUse"
              width={p.width}
              height={p.height}
              dangerouslySetInnerHTML={{ __html: p.svgContent }}
            />
          ))}
        </defs>
        {/* Checkerboard cells */}
        {Array.from({ length: gridCount }, (_, row) =>
          Array.from({ length: gridCount }, (_, col) => {
            const isOdd = (row + col) % 2 === 1;
            return (
              <rect
                key={`cell-${row}-${col}`}
                x={margin.left + col * cellSize}
                y={margin.top + row * cellSize}
                width={cellSize}
                height={cellSize}
                fill={isOdd ? 'hsl(var(--border) / 0.45)' : 'transparent'}
              />
            );
          })
        )}

        {/* Grid lines */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const x = margin.left + i * cellSize;
          const y = margin.top + i * cellSize;
          const isOriginH = i === getHIndex(0);
          const isOriginV = i === getVIndex(0);
          return (
            <React.Fragment key={i}>
              <line
                x1={x} y1={margin.top}
                x2={x} y2={margin.top + gridCount * cellSize}
                stroke={isOriginH ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginH ? 1.5 : 0.5}
                opacity={isOriginH ? 0.7 : 0.4}
              />
              <line
                x1={margin.left} y1={y}
                x2={margin.left + gridCount * cellSize} y2={y}
                stroke={isOriginV ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginV ? 1.5 : 0.5}
                opacity={isOriginV ? 0.7 : 0.4}
              />
            </React.Fragment>
          );
        })}

        {/* Origin marker */}
        {getHIndex(0) >= 0 && getHIndex(0) <= gridCount && getVIndex(0) >= 0 && getVIndex(0) <= gridCount && (
          <circle
            cx={margin.left + getHIndex(0) * cellSize}
            cy={margin.top + getVIndex(0) * cellSize}
            r={4}
            fill="hsl(var(--primary))"
            opacity={0.8}
            data-pdf-vertex-label=""
          />
        )}

        {/* H-axis labels (top) */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const val = gridMin + i;
          return (
            <text
              key={`h-${i}`}
              x={margin.left + i * cellSize}
              y={margin.top - 6}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={val === 0 ? 10 : 7}
              fontWeight={val === 0 ? 700 : 400}
              data-pdf-axis-label=""
            >
              {hLabel}{val}
            </text>
          );
        })}

        {/* H-axis title */}
        <text
          x={margin.left + gridCount * cellSize + 6}
          y={margin.top - 6}
          className="fill-muted-foreground"
          fontSize={9}
          fontWeight={600}
          data-pdf-axis-label=""
        >
          {hLabel}
        </text>

        {/* V-axis labels (left) */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const val = isElevation ? (gridMax - i) : (gridMin + i);
          return (
            <text
              key={`v-${i}`}
              x={margin.left - 4}
              y={margin.top + i * cellSize + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={val === 0 ? 10 : 7}
              fontWeight={val === 0 ? 700 : 400}
              data-pdf-axis-label=""
            >
              {vLabel}{val}
            </text>
          );
        })}

        {/* V-axis title */}
        <text
          x={margin.left - 4}
          y={margin.top - 14}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={9}
          fontWeight={600}
          data-pdf-axis-label=""
        >
          {vLabel}
        </text>

        {/* Axis value indicator label */}
        <text
          x={totalW - margin.right}
          y={totalH - 4}
          textAnchor="end"
          className="fill-primary"
          fontSize={9}
          fontWeight={600}
        >
          {section.axis}={section.axisValue}
        </text>

        {/* ── Ridge axis (cumbrera) — dashed red line ── */}
        {section.sectionType === 'vertical' && (() => {
          // Use configurable ridgeLine if available, else fallback to center
          const rl = ridgeLine;
          if (!rl && (!planData || planData.roofType === 'plana')) return null;
          const x1 = rl ? rl.x1 : (planData ? planData.width / 2 : 0);
          const y1 = rl ? rl.y1 : 0;
          const x2 = rl ? rl.x2 : (planData ? planData.width / 2 : 0);
          const y2 = rl ? rl.y2 : (planData ? planData.length || 20 : 20);
          const svgX1 = margin.left + getHIndex(x1) * cellSize;
          const svgY1 = margin.top + getVIndex(y1) * cellSize;
          const svgX2 = margin.left + getHIndex(x2) * cellSize;
          const svgY2 = margin.top + getVIndex(y2) * cellSize;
          const midSvgX = (svgX1 + svgX2) / 2;
          const midSvgY = Math.min(svgY1, svgY2) - 6;
          return (
            <g className="pointer-events-none">
              <line
                x1={svgX1} y1={svgY1}
                x2={svgX2} y2={svgY2}
                stroke="hsl(0 70% 50%)"
                strokeWidth={1.5}
                strokeDasharray="8 4"
                opacity={0.7}
              />
              {/* Start marker */}
              <circle cx={svgX1} cy={svgY1} r={3} fill="hsl(0 70% 50%)" opacity={0.8} />
              {/* End marker */}
              <circle cx={svgX2} cy={svgY2} r={3} fill="hsl(0 70% 50%)" opacity={0.8} />
              <text
                x={midSvgX}
                y={midSvgY}
                textAnchor="middle"
                fontSize={7}
                fontWeight={700}
                fill="hsl(0 70% 45%)"
              >
                CUMBRERA ({x1},{y1})→({x2},{y2})
              </text>
            </g>
          );
        })()}

        {/* ── Ridge intersection on Y/X sections ── */}
        {(section.sectionType === 'longitudinal' || section.sectionType === 'transversal') && (() => {
          const rl = ridgeLine;
          if (!rl) return null;
          // For a section at Y=val (longitudinal) or X=val (transversal), find where the ridge line intersects
          const axisVal = section.axisValue;
          let intersectH: number | null = null;
          if (section.sectionType === 'longitudinal') {
            // Section plane Y=axisVal; ridge from (x1,y1) to (x2,y2)
            const dy = rl.y2 - rl.y1;
            if (Math.abs(dy) > 0.001) {
              const t = (axisVal - rl.y1) / dy;
              if (t >= -0.1 && t <= 1.1) {
                intersectH = rl.x1 + t * (rl.x2 - rl.x1);
              }
            } else if (Math.abs(rl.y1 - axisVal) < 0.5) {
              // Ridge is parallel to section, show midpoint
              intersectH = (rl.x1 + rl.x2) / 2;
            }
          } else {
            // Section plane X=axisVal; ridge from (x1,y1) to (x2,y2)
            const dx = rl.x2 - rl.x1;
            if (Math.abs(dx) > 0.001) {
              const t = (axisVal - rl.x1) / dx;
              if (t >= -0.1 && t <= 1.1) {
                intersectH = rl.y1 + t * (rl.y2 - rl.y1);
              }
            } else if (Math.abs(rl.x1 - axisVal) < 0.5) {
              intersectH = (rl.y1 + rl.y2) / 2;
            }
          }
          if (intersectH == null) return null;
          const hIdx = getHIndex(intersectH);
          if (hIdx < 0 || hIdx > gridCount) return null;
          const svgX = margin.left + hIdx * cellSize;
          const gridTop = margin.top;
          const gridBottom = margin.top + gridCount * cellSize;
          return (
            <g className="pointer-events-none">
              <line
                x1={svgX} y1={gridTop}
                x2={svgX} y2={gridBottom}
                stroke="hsl(0 70% 50%)"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                opacity={0.5}
              />
              <text x={svgX} y={gridTop - 4} textAnchor="middle" fontSize={6} fontWeight={700} fill="hsl(0 70% 45%)">
                ▽ CUMBRERA
              </text>
            </g>
          );
        })()}

        {/* Workspace floor polygons for vertical sections */}
        {section.sectionType === 'vertical' && rooms && (() => {
          const sectionRooms = isOverview
            ? rooms.filter(r => r.floorPolygon && r.floorPolygon.length >= 3 && allZSections?.some(s => s.id === r.verticalSectionId))
            : rooms.filter(r => r.verticalSectionId === section.id && r.floorPolygon && r.floorPolygon.length >= 3);

          if (sectionRooms.length === 0) return null;

          const allVertices = sectionRooms.flatMap(room => room.floorPolygon ?? []);
          const hasGlobalBounds = allVertices.length >= 2;

          const globalMinX = hasGlobalBounds ? Math.min(...allVertices.map(v => v.x)) : 0;
          const globalMaxX = hasGlobalBounds ? Math.max(...allVertices.map(v => v.x)) : 0;
          const globalMinY = hasGlobalBounds ? Math.min(...allVertices.map(v => v.y)) : 0;
          const globalMaxY = hasGlobalBounds ? Math.max(...allVertices.map(v => v.y)) : 0;

          const globalLeft = margin.left + getHIndex(globalMinX) * cellSize;
          const globalRight = margin.left + getHIndex(globalMaxX) * cellSize;
          const globalTop = margin.top + getVIndex(globalMinY) * cellSize;
          const globalBottom = margin.top + getVIndex(globalMaxY) * cellSize;

          const globalWidthMm = Math.round((globalMaxX - globalMinX) * scaleH);
          const globalHeightMm = Math.round((globalMaxY - globalMinY) * scaleV);

          return (
            <>
              {sectionRooms.map(room => {
                const poly = room.floorPolygon!;
                const points = poly.map(p => {
                  const hIdx = getHIndex(p.x);
                  const vIdx = getVIndex(p.y);
                  return `${margin.left + hIdx * cellSize},${margin.top + vIdx * cellSize}`;
                }).join(' ');

                const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                const cxSvg = margin.left + getHIndex(cx) * cellSize;
                const cySvg = margin.top + getVIndex(cy) * cellSize;

                let area = 0;
                for (let i = 0; i < poly.length; i++) {
                  const j = (i + 1) % poly.length;
                  area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
                }
                area = Math.abs(area) / 2;
                const areaScaleHm = (scaleConfig?.scaleX ?? 625) / 1000;
                const areaScaleVm = (scaleConfig?.scaleY ?? 625) / 1000;
                const areaM2 = area * areaScaleHm * areaScaleVm;

                const svgPts = poly.map(p => ({
                  x: margin.left + getHIndex(p.x) * cellSize,
                  y: margin.top + getVIndex(p.y) * cellSize,
                }));

                return (
                  <g key={room.id}>
                    {/* Fill polygon (no stroke — edges drawn individually below) */}
                    {(() => {
                      const patId = wallPatterns.get(room.id);
                      const pat = patId ? getPatternById(patId) : undefined;
                      return (
                        <polygon
                          points={points}
                          fill={pat ? `url(#wall-pattern-${pat.id})` : 'hsl(var(--primary) / 0.12)'}
                          stroke="none"
                          className="pointer-events-none"
                        />
                      );
                    })()}

                    {/* Wall edges — CLICKABLE to assign to Y/X section */}
                    {svgPts.map((pt, i) => {
                      const next = svgPts[(i + 1) % svgPts.length];
                      const currGrid = poly[i];
                      const nextGrid = poly[(i + 1) % poly.length];

                      const mx = (pt.x + next.x) / 2;
                      const my = (pt.y + next.y) / 2;
                      const dx = next.x - pt.x;
                      const dy = next.y - pt.y;

                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      const rotAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

                      const dxMm = (nextGrid.x - currGrid.x) * scaleH;
                      const dyMm = (nextGrid.y - currGrid.y) * scaleV;
                      const wallLenMm = Math.round(Math.hypot(dxMm, dyMm));

                      const isThisWallSelected = wallAssignInfo?.roomId === room.id && wallAssignInfo?.wallIndex === i;
                      const edgeDxGrid = Math.abs(nextGrid.x - currGrid.x);
                      const edgeDyGrid = Math.abs(nextGrid.y - currGrid.y);
                      const isHoriz = edgeDxGrid >= edgeDyGrid;

                      return (
                        <g key={`wall-mm-${room.id}-${i}`}>
                          {/* Wide hit area for reliable clicks */}
                          <line
                            x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                            stroke="hsl(var(--primary))"
                            strokeOpacity={0.001}
                            strokeWidth={12}
                            pointerEvents="stroke"
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWallEdgeClick(room, i, currGrid, nextGrid, mx, my);
                            }}
                          />
                          {/* Visible wall line — highlight if selected */}
                          <line
                            x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                            stroke={isThisWallSelected ? (isHoriz ? 'hsl(150 70% 40%)' : 'hsl(30 80% 50%)') : 'hsl(var(--primary))'}
                            strokeWidth={isThisWallSelected ? 3 : 1.5}
                            strokeDasharray={isThisWallSelected ? 'none' : '4 2'}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWallEdgeClick(room, i, currGrid, nextGrid, mx, my);
                            }}
                          />
                          {/* Wall length label */}
                          <text
                            x={mx}
                            y={my}
                            textAnchor="middle"
                            dominantBaseline="central"
                            transform={`rotate(${rotAngle}, ${mx}, ${my})`}
                            fontSize={Math.round(8 * Math.max(1, zoomLevel * 0.8))}
                            fontWeight={900}
                            fill="hsl(210 100% 45%)"
                            stroke="white"
                            strokeWidth={0.3}
                            className="pointer-events-none select-none"
                            data-pdf-dimension=""
                          >
                            {wallLenMm} mm
                          </text>
                          {/* Wall number */}
                          {(() => {
                            const len = Math.sqrt(dx * dx + dy * dy) || 1;
                            let wnx = -dy / len;
                            let wny = dx / len;
                            const toCenter = (cxSvg - mx) * wnx + (cySvg - my) * wny;
                            if (toCenter > 0) { wnx = -wnx; wny = -wny; }
                            const offX = mx + wnx * 12;
                            const offY = my + wny * 12;
                            return (
                              <>
                                <circle cx={offX} cy={offY} r={6}
                                  fill={isThisWallSelected ? (isHoriz ? 'hsl(150 70% 40%)' : 'hsl(30 80% 50%)') : 'hsl(210 60% 50%)'}
                                  className="cursor-pointer"
                                  data-pdf-wall-number=""
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleWallNumberClick(room, i, currGrid, nextGrid, mx, my);
                                  }}
                                />
                                <text x={offX} y={offY} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="7" fontWeight="bold" className="pointer-events-none select-none"
                                  data-pdf-wall-number=""
                                >
                                  {i + 1}
                                </text>
                              </>
                            );
                          })()}
                          {/* Section type hint on selected wall */}
                          {isThisWallSelected && (
                            <text
                              x={mx} y={my + 14}
                              textAnchor="middle" fontSize={7} fontWeight={700}
                              fill={isHoriz ? 'hsl(150 70% 30%)' : 'hsl(30 80% 40%)'}
                              className="pointer-events-none select-none"
                            >
                              {isHoriz ? '→ Longitudinal Y' : '→ Transversal X'}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Ceiling assignment button (center of polygon) */}
                    <rect
                      x={cxSvg + 22} y={cySvg - 16} width={16} height={16} rx={3}
                      fill="hsl(210 70% 55% / 0.8)" className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCeilingAssignRoom({ roomId: room.id, roomName: room.name });
                        setCeilingNewName('');
                        setCeilingNewValue('');
                      }}
                    />
                    <text
                      x={cxSvg + 30} y={cySvg - 8} textAnchor="middle" fontSize={8} fontWeight={700}
                      fill="white" className="pointer-events-none select-none"
                    >T</text>

                    {/* Name + area label */}
                    <rect
                      x={cxSvg - 30}
                      y={cySvg - 12}
                      width={60}
                      height={22}
                      rx={3}
                      fill="hsl(45 100% 50% / 0.85)"
                      data-pdf-workspace-name=""
                    />
                    <text
                      x={cxSvg}
                      y={cySvg - 3}
                      textAnchor="middle"
                      fontSize={Math.round(8 * Math.max(1, zoomLevel * 0.7))}
                      fontWeight={700}
                      fill="hsl(0 0% 10%)"
                      data-pdf-workspace-name=""
                    >
                      {room.name}
                    </text>
                    <text
                      x={cxSvg}
                      y={cySvg + 7}
                      textAnchor="middle"
                      fontSize={Math.round(7 * Math.max(1, zoomLevel * 0.7))}
                      fontWeight={600}
                      fill="hsl(0 0% 15%)"
                      data-pdf-workspace-name=""
                    >
                      {areaM2.toFixed(2)} m²
                    </text>
                  </g>
                );
              })}

              {/* Global perimeter dimensions — OUTSIDE axis labels */}
              {hasGlobalBounds && (() => {
                // Position outside the axis label area (above X labels, below grid, left of Y labels, right of grid)
                const topY = margin.top - 22; // above X-axis labels
                const bottomY = margin.top + gridCount * cellSize + 18; // below grid
                const leftX = margin.left - 28; // left of Y-axis labels
                const rightX = margin.left + gridCount * cellSize + 18; // right of grid
                const midX = (globalLeft + globalRight) / 2;
                const midY = (globalTop + globalBottom) / 2;
                const perimFontSize = Math.round(8 * Math.max(1, zoomLevel * 0.8));

                return (
                  <g className="pointer-events-none" data-pdf-dimension="">
                    {/* Top horizontal — above axis labels */}
                    <line x1={globalLeft} y1={topY} x2={globalRight} y2={topY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={globalLeft} y2={topY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <line x1={globalRight} y1={globalTop} x2={globalRight} y2={topY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <text x={midX} y={topY - 4} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    {/* Bottom horizontal — below grid */}
                    <line x1={globalLeft} y1={bottomY} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalBottom} x2={globalLeft} y2={bottomY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <line x1={globalRight} y1={globalBottom} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <text x={midX} y={bottomY + 10} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    {/* Left vertical — left of axis labels */}
                    <line x1={leftX} y1={globalTop} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={leftX} y2={globalTop} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <line x1={globalLeft} y1={globalBottom} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <text
                      x={leftX - 5}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${leftX - 5}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>

                    {/* Right vertical — right of grid */}
                    <line x1={rightX} y1={globalTop} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalRight} y1={globalTop} x2={rightX} y2={globalTop} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <line x1={globalRight} y1={globalBottom} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                    <text
                      x={rightX + 5}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${rightX + 5}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>
                  </g>
                );
              })()}
            </>
          );
        })()}

        {/* ── Workspace geometries for all section types ── */}
        {wallProjections && wallProjections.length > 0 && (() => {
          return (
            <>
              {wallProjections.map((proj, pi) => {
                const isEditingThis = selectedWorkspaceId === proj.workspaceId;
                const verts = isEditingThis ? editVertices : getWorkspacePolygon(section, proj);
                return renderWorkspaceGeometry(verts, proj, pi, isEditingThis);
              })}

              {/* Drawing mode preview: show vertices being placed */}
              {drawingMode && editVertices.length > 0 && (() => {
                const drawColor = 'hsl(var(--primary))';
                const svgPts = editVertices.map(v => toSvg(v.x, v.y));
                return (
                  <g>
                    {/* Lines connecting placed vertices */}
                    {svgPts.map((pt, i) => {
                      if (i === 0) return null;
                      const prev = svgPts[i - 1];
                      return (
                        <line key={`draw-line-${i}`}
                          x1={prev.sx} y1={prev.sy} x2={pt.sx} y2={pt.sy}
                          stroke={drawColor} strokeWidth={2} strokeDasharray="6 3"
                        />
                      );
                    })}
                    {/* Vertex dots */}
                    {svgPts.map((pt, i) => (
                      <g key={`draw-v-${i}`}>
                        <circle cx={pt.sx} cy={pt.sy} r={5}
                          fill={drawColor} stroke="white" strokeWidth={2}
                        />
                        <text x={pt.sx} y={pt.sy - 10} textAnchor="middle" fontSize={7} fontWeight={600}
                          fill={drawColor} className="pointer-events-none select-none"
                        >{hLabel}{editVertices[i].x},{vLabel}{editVertices[i].y}</text>
                      </g>
                    ))}
                  </g>
                );
              })()}

              {/* Global bounding dimensions for all projections */}
              {(() => {
                const allVerts: PolygonVertex[] = [];
                for (const proj of wallProjections) {
                  const verts = selectedWorkspaceId === proj.workspaceId
                    ? editVertices
                    : getWorkspacePolygon(section, proj);
                  allVerts.push(...verts);
                }
                if (allVerts.length < 2) return null;
                const xs = allVerts.map(v => v.x);
                const ys = allVerts.map(v => v.y);
                const bMinX = Math.min(...xs), bMaxX = Math.max(...xs);
                const bMinY = Math.min(...ys), bMaxY = Math.max(...ys);
                const totalWidthMm = Math.round((bMaxX - bMinX) * scaleH);
                const totalHeightMm = Math.round((bMaxY - bMinY) * scaleV);
                if (totalWidthMm <= 0 && totalHeightMm <= 0) return null;

                const { sx: gleft, sy: gtop } = toSvg(bMinX, isElevation ? bMaxY : bMinY);
                const { sx: gright, sy: gbottom } = toSvg(bMaxX, isElevation ? bMinY : bMaxY);
                // Position outside the axis label area
                const topY = margin.top - 22;
                const bottomY = margin.top + gridCount * cellSize + 18;
                const leftX = margin.left - 28;
                const rightX = margin.left + gridCount * cellSize + 18;
                const perimFontSize = Math.round(8 * Math.max(1, zoomLevel * 0.8));
                const midX = (gleft + gright) / 2;
                const midY = (gtop + gbottom) / 2;

                return (
                  <g className="pointer-events-none" data-pdf-dimension="">
                    {totalWidthMm > 0 && (
                      <>
                        {/* Top horizontal — above axis labels */}
                        <line x1={gleft} y1={topY} x2={gright} y2={topY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gleft} y1={gtop} x2={gleft} y2={topY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <line x1={gright} y1={gtop} x2={gright} y2={topY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <text x={midX} y={topY - 4} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{totalWidthMm} mm</text>
                        {/* Bottom horizontal — below grid */}
                        <line x1={gleft} y1={bottomY} x2={gright} y2={bottomY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gleft} y1={gbottom} x2={gleft} y2={bottomY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <line x1={gright} y1={gbottom} x2={gright} y2={bottomY} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <text x={midX} y={bottomY + 10} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{totalWidthMm} mm</text>
                      </>
                    )}
                    {totalHeightMm > 0 && (
                      <>
                        {/* Right vertical — right of grid */}
                        <line x1={rightX} y1={gtop} x2={rightX} y2={gbottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gright} y1={gtop} x2={rightX} y2={gtop} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <line x1={gright} y1={gbottom} x2={rightX} y2={gbottom} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <text
                          x={rightX + 5} y={midY}
                          textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)"
                          transform={`rotate(-90, ${rightX + 5}, ${midY})`}
                        >{totalHeightMm} mm</text>
                        {/* Left vertical — left of axis labels */}
                        <line x1={leftX} y1={gtop} x2={leftX} y2={gbottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gleft} y1={gtop} x2={leftX} y2={gtop} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <line x1={gleft} y1={gbottom} x2={leftX} y2={gbottom} stroke="hsl(0 70% 50% / 0.4)" strokeWidth={0.6} strokeDasharray="2 2" />
                        <text
                          x={leftX - 5} y={midY}
                          textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)"
                          transform={`rotate(-90, ${leftX - 5}, ${midY})`}
                        >{totalHeightMm} mm</text>
                      </>
                    )}
                  </g>
                );
              })()}
            </>
          );
        })()}

        {/* ── Standalone section polygons (drawn directly on section) ── */}
        {standalonePolygons.map((poly, pi) => {
          const isEditingThisPoly = editingPolygonId === poly.id;
          const verts = isEditingThisPoly ? editVertices : poly.vertices.map(v => ({ x: v.x, y: v.y }));
          if (verts.length === 0) return null;

          const color = PROJ_COLORS[(pi + (wallProjections?.length || 0)) % PROJ_COLORS.length];
          const svgPts = verts.map(v => toSvg(v.x, v.y));
          const fontSize = Math.round(7 * Math.max(1, zoomLevel * 0.8));

          if (verts.length === 1) {
            const { sx, sy } = svgPts[0];
            return (
              <g key={`sp-${poly.id}`}>
                <circle cx={sx} cy={sy} r={isEditingThisPoly ? 8 : 6}
                  fill={hslWithAlpha(color, 0.6)} stroke={color} strokeWidth={2}
                  className="cursor-pointer" onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)}
                />
                <text x={sx} y={sy - 12} textAnchor="middle" fontSize={6} fontWeight={600} fill={color} className="pointer-events-none select-none">
                  {hLabel}{verts[0].x},{vLabel}{verts[0].y}
                </text>
                <rect x={sx - 25} y={sy + 10} width={50} height={14} rx={3}
                  fill="hsl(45 100% 50% / 0.85)" className="cursor-pointer"
                  onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)}
                />
                <text x={sx} y={sy + 19} textAnchor="middle" fontSize={fontSize} fontWeight={700}
                  fill="hsl(0 0% 10%)" className="pointer-events-none select-none">{poly.name}</text>
                {isEditingThisPoly && (
                  <circle cx={sx} cy={sy} r={draggingIdx === 0 ? 10 : 7}
                    fill={draggingIdx === 0 ? 'hsl(var(--destructive))' : color}
                    stroke="white" strokeWidth={2} className="cursor-grab"
                    onMouseDown={(e) => handleMouseDown(0, e)}
                  />
                )}
              </g>
            );
          }

          if (verts.length === 2) {
            const { sx: x1, sy: y1 } = svgPts[0];
            const { sx: x2, sy: y2 } = svgPts[1];
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const lineLenMm = Math.round(Math.sqrt(((verts[1].x - verts[0].x) * scaleHm) ** 2 + ((verts[1].y - verts[0].y) * scaleVm) ** 2) * 1000);
            return (
              <g key={`sp-${poly.id}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={isEditingThisPoly ? 3 : 2}
                  className="cursor-pointer" onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)} />
                <text x={mx} y={my - 8} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={color}
                  className="pointer-events-none select-none">{lineLenMm} mm</text>
                <rect x={mx - 25} y={my + 3} width={50} height={14} rx={3}
                  fill="hsl(45 100% 50% / 0.85)" className="cursor-pointer"
                  onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)} />
                <text x={mx} y={my + 12} textAnchor="middle" fontSize={fontSize} fontWeight={700}
                  fill="hsl(0 0% 10%)" className="pointer-events-none select-none">{poly.name}</text>
                {isEditingThisPoly && verts.map((v, vi) => {
                  const { sx, sy } = svgPts[vi];
                  return (
                    <circle key={`dv-${vi}`} cx={sx} cy={sy} r={draggingIdx === vi ? 7 : 5}
                      fill={draggingIdx === vi ? 'hsl(var(--destructive))' : color}
                      stroke="white" strokeWidth={2} className="cursor-grab"
                      onMouseDown={(e) => handleMouseDown(vi, e)} />
                  );
                })}
              </g>
            );
          }

          // 3+ vertices polygon
          const points = svgPts.map(p => `${p.sx},${p.sy}`).join(' ');
          const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
          const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
          const { sx: cxSvg, sy: cySvg } = toSvg(cx, cy);
          const areaVal = polygonAreaCalc(verts) * scaleHm * scaleVm;

          return (
            <g key={`sp-${poly.id}`}>
              {(() => {
                const patId = getStandalonePolygonPattern(poly);
                const pat = patId ? getPatternById(patId) : undefined;
                return (
                  <polygon points={points}
                    fill={pat ? `url(#wall-pattern-${pat.id})` : hslWithAlpha(color, isEditingThisPoly ? 0.25 : 0.12)}
                    stroke={color} strokeWidth={isEditingThisPoly ? 2.5 : 1.5}
                    strokeDasharray={isEditingThisPoly ? 'none' : '4 2'}
                    className="cursor-pointer"
                    onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)}
                  />
                );
              })()}
              {/* Edge measurements */}
              {verts.map((v, ei) => {
                const next = verts[(ei + 1) % verts.length];
                const { sx: x1, sy: y1 } = toSvg(v.x, v.y);
                const { sx: x2, sy: y2 } = toSvg(next.x, next.y);
                const emx = (x1 + x2) / 2;
                const emy = (y1 + y2) / 2;
                const edx = x2 - x1;
                const edy = y2 - y1;
                const eAngle = Math.atan2(edy, edx) * (180 / Math.PI);
                const eRotAngle = (eAngle > 90 || eAngle < -90) ? eAngle + 180 : eAngle;
                const eLenMm = Math.round(Math.sqrt(((next.x - v.x) * scaleHm) ** 2 + ((next.y - v.y) * scaleVm) ** 2) * 1000);
                const len = Math.sqrt(edx * edx + edy * edy) || 1;
                let nx = -edy / len; let ny = edx / len;
                if ((cxSvg - emx) * nx + (cySvg - emy) * ny > 0) { nx = -nx; ny = -ny; }
                return (
                  <text key={`emm-${ei}`} x={emx + nx * 10} y={emy + ny * 10}
                    textAnchor="middle" dominantBaseline="central"
                    transform={`rotate(${eRotAngle}, ${emx + nx * 10}, ${emy + ny * 10})`}
                    fontSize={fontSize} fontWeight={700} fill={color}
                    className="pointer-events-none select-none"
                    data-pdf-dimension=""
                  >{eLenMm} mm</text>
                );
              })}
              {/* Vertex labels */}
              {verts.map((v, vi) => (
                <text key={`vl-${vi}`} x={toSvg(v.x, v.y).sx} y={toSvg(v.x, v.y).sy - 7}
                  textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
                  className="pointer-events-none select-none"
                  data-pdf-vertex-label=""
                >{hLabel}{v.x},{vLabel}{v.y}</text>
              ))}
              {/* Edge face type labels (P#/Suelo/Techo) for all section types */}
              {verts.length >= 3 && !isEditingThisPoly && verts.map((v, ei) => {
                const next = verts[(ei + 1) % verts.length];
                const { sx: x1, sy: y1 } = toSvg(v.x, v.y);
                const { sx: x2, sy: y2 } = toSvg(next.x, next.y);
                const emx = (x1 + x2) / 2;
                const emy = (y1 + y2) / 2;
                const edgeLabel = poly.vertices[ei]?.label || `P${ei + 1}`;
                const edx = x2 - x1;
                const edy = y2 - y1;
                const elen = Math.sqrt(edx * edx + edy * edy) || 1;
                let enx = edy / elen;
                let eny = -edx / elen;
                if ((cxSvg - emx) * enx + (cySvg - emy) * eny < 0) { enx = -enx; eny = -eny; }
                const labelX = emx + enx * 20;
                const labelY = emy + eny * 20;
                const bgColor = edgeLabel === 'Suelo' ? 'hsl(30 80% 50% / 0.9)' : edgeLabel === 'Techo' ? 'hsl(210 70% 55% / 0.9)' : 'hsl(var(--muted-foreground) / 0.7)';
                return (
                  <g key={`efl-${ei}`} data-pdf-wall-number="">
                    <rect x={labelX - 18} y={labelY - 6} width={36} height={12} rx={3}
                      fill={bgColor} className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        const faceTypes = [`P${ei + 1}`, 'Suelo', 'Techo'];
                        const currentIdx = faceTypes.indexOf(edgeLabel);
                        const nextFaceLabel = faceTypes[(currentIdx + 1) % faceTypes.length];
                        if (!allSections || !onSectionsChange) return;
                        const updatedSections = allSections.map(s => {
                          if (s.id !== section.id) return s;
                          const polys = (s.polygons || []).map(p => {
                            if (p.id !== poly.id) return p;
                            const newVerts = [...p.vertices];
                            newVerts[ei] = { ...newVerts[ei], label: nextFaceLabel };
                            return { ...p, vertices: newVerts };
                          });
                          return { ...s, polygons: polys };
                        });
                        onSectionsChange(updatedSections);
                        toast.success(`Arista ${ei + 1}: ${nextFaceLabel}`);
                      }}
                    />
                    <text x={labelX} y={labelY + 1} textAnchor="middle" dominantBaseline="central"
                      fontSize={7} fontWeight={700} fill="white"
                      className="pointer-events-none select-none"
                    >{edgeLabel}</text>
                  </g>
                );
              })}
              {/* Name + area label */}
              <rect x={cxSvg - 30} y={cySvg - 10} width={60} height={20} rx={3}
                fill="hsl(45 100% 50% / 0.85)" className="cursor-pointer"
                data-pdf-workspace-name=""
                onClick={() => !isEditingThisPoly && selectSectionPolygon(poly)} />
              <text x={cxSvg} y={cySvg - 1} textAnchor="middle" fontSize={fontSize} fontWeight={700}
                fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
                data-pdf-workspace-name=""
              >{poly.name}</text>
              <text x={cxSvg} y={cySvg + 8} textAnchor="middle" fontSize={fontSize - 1} fontWeight={500}
                fill="hsl(0 0% 25%)" className="pointer-events-none select-none"
                data-pdf-workspace-name=""
              >{areaVal.toFixed(2)} m²</text>
              {/* Draggable vertices in edit mode */}
              {isEditingThisPoly && verts.map((v, vi) => {
                const { sx, sy } = toSvg(v.x, v.y);
                return (
                  <g key={`dv-${vi}`}>
                    <circle cx={sx} cy={sy} r={draggingIdx === vi ? 7 : 5}
                      fill={draggingIdx === vi ? 'hsl(var(--destructive))' : color}
                      stroke="white" strokeWidth={2} className="cursor-grab"
                      onMouseDown={(e) => handleMouseDown(vi, e)} />
                    <text x={sx} y={sy + 16} textAnchor="middle" fontSize={7} fontWeight={700}
                      fill={color} className="pointer-events-none select-none">V{vi + 1}</text>
                  </g>
                );
              })}
            </g>
          );
        })}

      </svg>
      </div>

      {/* ── Wall assignment panel ── */}
      {wallAssignInfo && section.sectionType === 'vertical' && (() => {
        const targetType = wallAssignInfo.isHorizontal ? 'longitudinal' : 'transversal';
        const targetAxis = wallAssignInfo.isHorizontal ? 'Y' : 'X';
        const candidateSections = (allSections || []).filter(s => s.sectionType === targetType);
        const colorClass = wallAssignInfo.isHorizontal ? 'border-green-500/50 bg-green-50/50' : 'border-orange-500/50 bg-orange-50/50';

        return (
          <div className={`mt-1 p-2 border rounded-md ${colorClass} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                Pared {wallAssignInfo.wallIndex + 1} de {wallAssignInfo.roomName} ({wallAssignInfo.wallLenMm} mm)
                <Badge variant="secondary" className="ml-1.5 text-[9px] h-4">
                  {wallAssignInfo.isHorizontal ? 'Longitudinal (Y)' : 'Transversal (X)'}
                </Badge>
              </span>
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setWallAssignInfo(null)}>Cerrar</Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Selecciona la sección {targetType} ({targetAxis}=?) donde se dibujará esta pared, o crea una nueva.
            </p>

            {/* Existing sections */}
            {candidateSections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {candidateSections.map(cs => (
                  <Button
                    key={cs.id}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => assignWallToSection(cs.id)}
                  >
                    {cs.name} ({cs.axis}={cs.axisValue})
                  </Button>
                ))}
              </div>
            )}

            {/* Create new section inline */}
            <div className="flex items-center gap-1.5">
              <Input
                className="h-6 text-[10px] w-28"
                placeholder={`Nombre sección ${targetType}`}
                value={wallAssignNewName}
                onChange={e => setWallAssignNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createSectionAndAssign()}
              />
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground">{targetAxis}=</span>
                <Input
                  className="h-6 text-[10px] w-14"
                  type="number"
                  value={wallAssignNewValue}
                  onChange={e => setWallAssignNewValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createSectionAndAssign()}
                />
              </div>
              <Button size="sm" className="h-6 text-[10px] gap-0.5" onClick={createSectionAndAssign} disabled={!wallAssignNewName.trim()}>
                <Plus className="h-3 w-3" /> Crear y asignar
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ── Ceiling assignment panel ── */}
      {ceilingAssignRoom && section.sectionType === 'vertical' && (() => {
        const verticalSections = (allSections || []).filter(s => s.sectionType === 'vertical' && s.id !== section.id);

        return (
          <div className="mt-1 p-2 border border-blue-500/50 bg-blue-50/50 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                Techo de {ceilingAssignRoom.roomName}
                <Badge variant="secondary" className="ml-1.5 text-[9px] h-4">Sección Vertical Z</Badge>
              </span>
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setCeilingAssignRoom(null)}>Cerrar</Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Selecciona la sección vertical (Z=?) donde se ubicará el techo, o crea una nueva.
            </p>

            {/* Existing vertical sections */}
            {verticalSections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {verticalSections.map(vs => (
                  <Button
                    key={vs.id}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => assignCeilingToSection(vs.id)}
                  >
                    {vs.name} (Z={vs.axisValue})
                  </Button>
                ))}
              </div>
            )}

            {/* Create new vertical section inline */}
            <div className="flex items-center gap-1.5">
              <Input
                className="h-6 text-[10px] w-28"
                placeholder="Nombre sección Z"
                value={ceilingNewName}
                onChange={e => setCeilingNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCeilingSectionAndAssign()}
              />
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground">Z=</span>
                <Input
                  className="h-6 text-[10px] w-14"
                  type="number"
                  value={ceilingNewValue}
                  onChange={e => setCeilingNewValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCeilingSectionAndAssign()}
                />
              </div>
              <Button size="sm" className="h-6 text-[10px] gap-0.5" onClick={createCeilingSectionAndAssign} disabled={!ceilingNewName.trim()}>
                <Plus className="h-3 w-3" /> Crear y asignar
              </Button>
            </div>
          </div>
        );
      })()}
      {drawingMode && (
        <div className="mt-1 px-2 py-1.5 bg-primary/10 border border-primary/30 rounded-md flex items-center gap-2">
          <PenTool className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="text-[10px] text-primary font-medium">
            {editingPolygonId && !selectedWorkspaceId
              ? `Dibujando "${editingPolygonName}" — `
              : 'Modo dibujo manual — '}
            Clic en la cuadrícula para añadir vértices ({editVertices.length} colocados: {geometryTypeLabel(editVertices.length)}).
            <strong> Doble clic para cerrar la figura.</strong>
          </span>
          <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={() => { setDrawingMode(false); }}>
            Finalizar
          </Button>
          {editingPolygonId && !selectedWorkspaceId && (
            <Button variant="ghost" size="sm" className="h-5 text-[9px] text-destructive" onClick={cancelNewWorkspace}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      {/* Editing controls */}
      {selectedWorkspaceId && !drawingMode && (
        <div className="mt-2 border rounded-lg p-2 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              Editando: {wallProjections?.find(p => p.workspaceId === selectedWorkspaceId)?.workspaceName}
            </span>
            <Badge variant="secondary" className="text-[9px] h-4">
              {geometryTypeLabel(editVertices.length)}
              {editVertices.length >= 3 && ` · ${(polygonAreaCalc(editVertices) * scaleHm * scaleVm).toFixed(2)} m²`}
              {editVertices.length === 2 && ` · ${Math.round(Math.sqrt(((editVertices[1].x - editVertices[0].x) * scaleHm) ** 2 + ((editVertices[1].y - editVertices[0].y) * scaleVm) ** 2) * 1000)} mm`}
            </Badge>
          </div>

          {/* Vertex list */}
          <div className="space-y-1">
            {editVertices.map((v, i) => {
              const nextV = editVertices.length > 1 ? editVertices[(i + 1) % editVertices.length] : v;
              const edgeMm = editVertices.length > 1
                ? Math.round(Math.sqrt(((nextV.x - v.x) * scaleHm) ** 2 + ((nextV.y - v.y) * scaleVm) ** 2) * 1000)
                : 0;
              return (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-5 text-right font-mono">V{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] text-muted-foreground">{hLabel}=</span>
                    <Input
                      className="h-5 text-[10px] w-12"
                      type="number"
                      value={v.x}
                      onChange={e => {
                        const next = [...editVertices];
                        next[i] = { ...next[i], x: parseFloat(e.target.value) || 0 };
                        setEditVertices(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] text-muted-foreground">{vLabel}=</span>
                    <Input
                      className="h-5 text-[10px] w-12"
                      type="number"
                      value={v.y}
                      onChange={e => {
                        const next = [...editVertices];
                        next[i] = { ...next[i], y: parseFloat(e.target.value) || 0 };
                        setEditVertices(next);
                      }}
                    />
                  </div>
                  {editVertices.length > 1 && <span className="text-[8px] text-muted-foreground">→ {edgeMm}mm</span>}
                  {editVertices.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeVertex(i)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={addVertex}>
              <Plus className="h-3 w-3" /> Vértice
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={() => setDrawingMode(true)}>
              <PenTool className="h-3 w-3" /> Dibujar
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={resetToDefault}>
              <RefreshCw className="h-3 w-3" /> Resetear
            </Button>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedWorkspaceId(null); setEditVertices([]); setDrawingMode(false); }}>
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-[10px] gap-0.5" onClick={saveEditedPolygon} disabled={editVertices.length < 1}>
                <Save className="h-3 w-3" /> Guardar
              </Button>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Punto (1v) · Línea (2v) · Triángulo (3v) · Polígono (N vértices). Arrastra o edita coordenadas. Usa "Dibujar" para marcar vértices haciendo clic.
          </p>
        </div>
      )}

      {/* ── Standalone polygon editing controls ── */}
      {editingPolygonId && !selectedWorkspaceId && !drawingMode && (
        <div className="mt-2 border rounded-lg p-2 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Nombre:</span>
              <Input
                className="h-6 text-[10px] w-36"
                value={editingPolygonName}
                onChange={e => setEditingPolygonName(e.target.value)}
              />
            </div>
            <Badge variant="secondary" className="text-[9px] h-4">
              {geometryTypeLabel(editVertices.length)}
              {editVertices.length >= 3 && ` · ${(polygonAreaCalc(editVertices) * scaleHm * scaleVm).toFixed(2)} m²`}
              {editVertices.length === 2 && ` · ${Math.round(Math.sqrt(((editVertices[1].x - editVertices[0].x) * scaleHm) ** 2 + ((editVertices[1].y - editVertices[0].y) * scaleVm) ** 2) * 1000)} mm`}
            </Badge>
          </div>

          {/* Vertex list */}
          <div className="space-y-1">
            {editVertices.map((v, i) => {
              const nextV = editVertices.length > 1 ? editVertices[(i + 1) % editVertices.length] : v;
              const edgeMm = editVertices.length > 1
                ? Math.round(Math.sqrt(((nextV.x - v.x) * scaleHm) ** 2 + ((nextV.y - v.y) * scaleVm) ** 2) * 1000)
                : 0;
              return (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-5 text-right font-mono">V{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] text-muted-foreground">{hLabel}=</span>
                    <Input
                      className="h-5 text-[10px] w-12"
                      type="number"
                      value={v.x}
                      onChange={e => {
                        const next = [...editVertices];
                        next[i] = { ...next[i], x: parseFloat(e.target.value) || 0 };
                        setEditVertices(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] text-muted-foreground">{vLabel}=</span>
                    <Input
                      className="h-5 text-[10px] w-12"
                      type="number"
                      value={v.y}
                      onChange={e => {
                        const next = [...editVertices];
                        next[i] = { ...next[i], y: parseFloat(e.target.value) || 0 };
                        setEditVertices(next);
                      }}
                    />
                  </div>
                  {editVertices.length > 1 && <span className="text-[8px] text-muted-foreground">→ {edgeMm}mm</span>}
                  {editVertices.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeVertex(i)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={addVertex}>
              <Plus className="h-3 w-3" /> Vértice
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={() => setDrawingMode(true)}>
              <PenTool className="h-3 w-3" /> Dibujar
            </Button>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={cancelNewWorkspace}>
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-[10px] gap-0.5" onClick={saveStandalonePolygon} disabled={editVertices.length < 1}>
                <Save className="h-3 w-3" /> Guardar
              </Button>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Punto (1v) · Línea (2v) · Triángulo (3v) · Polígono (N vértices). Arrastra o edita coordenadas.
          </p>
        </div>
      )}
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, wallProjectionsBySection, rooms, budgetName, onNavigateToWallSection, forcedVisibleGridId, planData, ridgeLine, onRidgeLineChange }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');
  const [visibleGridId, setVisibleGridId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);

  const axisConfig = AXIS_MAP[sectionType];
  const filtered = sections.filter(s => s.sectionType === sectionType);

  // React to forced navigation from parent
  React.useEffect(() => {
    if (forcedVisibleGridId) {
      const matchesThisType = filtered.some(s => s.id === forcedVisibleGridId);
      if (matchesThisType) {
        setVisibleGridId(forcedVisibleGridId);
      }
    }
  }, [forcedVisibleGridId, filtered]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseFloat(newAxisValue) || 0;
    const section: CustomSection = {
      id: generateId(),
      name: newName.trim(),
      sectionType,
      axis: axisConfig.axis,
      axisValue: val,
      polygons: [],
    };
    onSectionsChange([...sections, section]);
    setNewName('');
    setNewAxisValue('0');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
    if (visibleGridId === id) setVisibleGridId(null);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    const val = parseFloat(editAxisValue) || 0;
    onSectionsChange(sections.map(s =>
      s.id === id ? { ...s, name: editName.trim(), axisValue: val } : s
    ));
    setEditingSectionId(null);
  };

  const toggleGrid = (id: string) => {
    setVisibleGridId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Secciones {TYPE_LABELS[sectionType]}
          <Badge variant="outline" className="text-[9px] h-4">{filtered.length}</Badge>
        </h4>
        <div className="flex items-center gap-1">
          {sectionType === 'vertical' && filtered.length > 0 && (
            <Button
              variant={showOverview ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setShowOverview(!showOverview)}
            >
              <Eye className="h-3 w-3 mr-1" /> Plano General
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-3 w-3 mr-1" /> Nueva Sección
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground italic">{AXIS_DESCRIPTION[sectionType]}</p>

      {/* ── Overview grid: all Z sections combined ── */}
      {sectionType === 'vertical' && showOverview && filtered.length > 0 && (() => {
        // Create a virtual "overview" section that combines all vertical section rooms
        const overviewSection: CustomSection = {
          id: '__overview__',
          name: 'Plano General',
          sectionType: 'vertical',
          axis: 'Z',
          axisValue: 0,
          polygons: [],
        };
        return (
          <div className="border border-primary/30 rounded-lg p-1 bg-muted/20">
            <div className="flex items-center gap-2 px-2 py-1">
              <Badge variant="default" className="text-[9px] h-4">Plano General</Badge>
              <span className="text-[10px] text-muted-foreground">Vista de todos los espacios registrados</span>
            </div>
            <SectionGrid
              section={overviewSection}
              scaleConfig={scaleConfig}
              rooms={rooms}
              budgetName={budgetName}
              allSections={sections}
              planData={planData}
              isOverview={true}
              allZSections={filtered}
            />
          </div>
        );
      })()}

      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ej: Nivel 0"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-[10px]">{axisConfig.label} (valor)</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  placeholder={axisConfig.placeholder}
                  value={newAxisValue}
                  onChange={e => setNewAxisValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </div>
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              <Button size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!newName.trim()}>Crear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && !showAddForm && (
        <p className="text-[10px] text-muted-foreground italic py-2">No hay secciones definidas. Pulse "Nueva Sección" para crear una.</p>
      )}

      {filtered.map(section => {
        const isEditing = editingSectionId === section.id;
        const gridVisible = visibleGridId === section.id;

        return (
          <div key={section.id} data-section-id={section.id}>
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                    <Input
                      className="h-7 text-xs w-36"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(section.id);
                        if (e.key === 'Escape') setEditingSectionId(null);
                      }}
                      autoFocus
                      placeholder="Nombre"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{axisConfig.label}=</span>
                      <Input
                        className="h-7 text-xs w-16"
                        type="number"
                        value={editAxisValue}
                        onChange={e => setEditAxisValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(section.id);
                          if (e.key === 'Escape') setEditingSectionId(null);
                        }}
                      />
                    </div>
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleRename(section.id)}>Guardar</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingSectionId(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-semibold truncate">{section.name}</span>
                    <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                      {section.axis}={section.axisValue}
                    </Badge>
                    {/* Show count of workspace projections */}
                    {section.sectionType !== 'vertical' && (() => {
                      const projCount = wallProjectionsBySection?.get(section.id)?.length || 0;
                      return projCount > 0 ? (
                        <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                          {projCount} espacio{projCount !== 1 ? 's' : ''}
                        </Badge>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant={gridVisible ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleGrid(section.id)}
                    title={gridVisible ? 'Ocultar cuadrícula' : 'Ver cuadrícula'}
                  >
                    {gridVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingSectionId(section.id);
                      setEditName(section.name);
                      setEditAxisValue(String(section.axisValue));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(section.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {gridVisible && (
              <SectionGrid
                section={section}
                scaleConfig={scaleConfig}
                rooms={rooms}
                budgetName={budgetName}
                wallProjections={wallProjectionsBySection?.get(section.id)}
                allSections={sections}
                onSectionsChange={onSectionsChange}
                onNavigateToWallSection={onNavigateToWallSection}
                planData={planData}
                ridgeLine={ridgeLine}
                onRidgeLineChange={onRidgeLineChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}