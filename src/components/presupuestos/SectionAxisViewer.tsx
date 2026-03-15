import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, PenTool, X, Check, Printer, Ruler, Undo2, RefreshCw } from 'lucide-react';
import type { SectionPolygon } from './CustomSectionManager';
import { WorkspacePropertiesPanel } from './WorkspacePropertiesPanel';
import { VISUAL_PATTERNS, getPatternById } from '@/lib/visual-patterns';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

// ── Undo history stack (max 5) ──
interface UndoSnapshot {
  polygons: SectionPolygon[];
  rulerLines: RulerLine[];
  facePatterns: PolygonFacePatterns;
}
const MAX_UNDO = 5;

// Ruler distinctive color — vivid magenta (not used by axes/dimensions/workspaces)
const RULER_STROKE = 'hsl(310, 100%, 42%)';
const RULER_TEXT = 'hsl(310, 80%, 28%)';
const RULER_BTN = 'hsl(310 100% 42%)';

type WallLabelMode = 'both' | 'name-only' | 'measure-only' | 'none';

interface SectionScale {
  hScale: number;
  vScale: number;
}

interface RidgeLineData {
  x1: number; y1: number; x2: number; y2: number; z: number;
}

type ViewerSectionType = 'vertical' | 'longitudinal' | 'transversal' | 'inclined';

const getDefaultScale = (sectionType: ViewerSectionType): SectionScale => (
  sectionType === 'vertical'
    ? { hScale: 625, vScale: 625 }
    : { hScale: 625, vScale: 250 }
);

const getSafeScale = (
  sectionType: ViewerSectionType,
  input?: { hScale: number; vScale: number }
): SectionScale => {
  if (input && Number.isFinite(input.hScale) && Number.isFinite(input.vScale) && input.hScale > 0 && input.vScale > 0) {
    return { hScale: input.hScale, vScale: input.vScale };
  }
  return getDefaultScale(sectionType);
};

export interface RulerLine {
  id: string;
  start: { col: number; row: number };
  end: { col: number; row: number };
  label?: string;
}

/** Face pattern map: polyId -> { faceKey -> patternId } */
export interface PolygonFacePatterns {
  [polyId: string]: { [faceKey: string]: string | null };
}

interface SectionAxisViewerProps {
  sectionType: ViewerSectionType;
  axisValue: number;
  sectionName: string;
  floorPlanId?: string;
  savedScale?: { hScale: number; vScale: number };
  onSaveScale?: (scale: { hScale: number; vScale: number }) => void;
  savedNegLimits?: { negH: number; negV: number; posH?: number; posV?: number };
  onSaveNegLimits?: (limits: { negH: number; negV: number; posH: number; posV: number }) => void;
  ridgeLine?: RidgeLineData | null;
  /** Persisted polygons (workspaces) */
  polygons?: SectionPolygon[];
  onSavePolygons?: (polygons: SectionPolygon[]) => void;
  /** Persisted ruler lines */
  savedRulerLines?: RulerLine[];
  onSaveRulerLines?: (lines: RulerLine[]) => void;
  /** Face patterns per polygon */
  facePatterns?: PolygonFacePatterns;
  onFacePatternChange?: (polyId: string, faceKey: string, patternId: string | null) => void;
  /** All polygon names across ALL sections for uniqueness validation */
  allPolygonNames?: string[];
  /** Callback to regenerate projected workspaces */
  onRegenerate?: () => void;
}

const AXIS_COLORS = {
  X: 'hsl(0, 70%, 50%)',
  Y: 'hsl(140, 60%, 40%)',
  Z: 'hsl(220, 70%, 55%)',
};

const WORKSPACE_COLORS = [
  'hsl(200, 70%, 55%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(350, 70%, 55%)',
  'hsl(60, 70%, 45%)',
  'hsl(220, 50%, 55%)',
  'hsl(100, 60%, 45%)',
];

function getConfig(sectionType: string) {
  switch (sectionType) {
    case 'vertical': return { fixedAxis: 'Z' as const, hAxis: 'X' as const, vAxis: 'Y' as const };
    case 'transversal': return { fixedAxis: 'X' as const, hAxis: 'Y' as const, vAxis: 'Z' as const };
    case 'longitudinal': return { fixedAxis: 'Y' as const, hAxis: 'X' as const, vAxis: 'Z' as const };
    default: return { fixedAxis: 'Z' as const, hAxis: 'X' as const, vAxis: 'Y' as const };
  }
}

function polygonAreaGrid(vertices: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function polygonCentroid(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
  let cx = 0, cy = 0;
  vertices.forEach(v => { cx += v.x; cy += v.y; });
  return { x: cx / vertices.length, y: cy / vertices.length };
}

function edgeLengthGrid(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function SectionAxisViewer({
  sectionType,
  axisValue,
  sectionName,
  floorPlanId,
  savedScale,
  onSaveScale,
  savedNegLimits,
  onSaveNegLimits,
  ridgeLine,
  polygons: savedPolygons,
  onSavePolygons,
  savedRulerLines,
  onSaveRulerLines,
  facePatterns: savedFacePatterns,
  onFacePatternChange,
  allPolygonNames,
  onRegenerate,
}: SectionAxisViewerProps) {
  const { fixedAxis, hAxis, vAxis } = getConfig(sectionType);
  const hColor = AXIS_COLORS[hAxis];
  const vColor = AXIS_COLORS[vAxis];
  const fixedColor = AXIS_COLORS[fixedAxis];

  // Default scale: vertical sections use 625/625, X/Y sections use 625/250
  const initialScale = getSafeScale(sectionType, savedScale);

  // Scale inputs
  const [hScaleInput, setHScaleInput] = useState(String(initialScale.hScale));
  const [vScaleInput, setVScaleInput] = useState(String(initialScale.vScale));
  const [scale, setScale] = useState<SectionScale | null>(initialScale);

  // Grid limits
  const [negHInput, setNegHInput] = useState(String(savedNegLimits?.negH ?? 3));
  const [negVInput, setNegVInput] = useState(String(savedNegLimits?.negV ?? 3));
  const [posHInput, setPosHInput] = useState(String(savedNegLimits?.posH ?? 8));
  const [posVInput, setPosVInput] = useState(String(savedNegLimits?.posV ?? 6));
  const [gridLimits, setGridLimits] = useState<{ negH: number; negV: number; posH: number; posV: number }>(
    savedNegLimits ? { negH: savedNegLimits.negH, negV: savedNegLimits.negV, posH: savedNegLimits.posH ?? 8, posV: savedNegLimits.posV ?? 6 }
    : { negH: 3, negV: 3, posH: 8, posV: 6 }
  );

  // Drawing state
  const [drawMode, setDrawMode] = useState(false);
  const [drawingName, setDrawingName] = useState('');
  const [drawingHeight, setDrawingHeight] = useState('');
  const [drawingVertices, setDrawingVertices] = useState<Array<{ col: number; row: number }>>([]);
  const [hoverNode, setHoverNode] = useState<{ col: number; row: number } | null>(null);

  // Vertex editing mode (drag vertices, add new ones)
  const [vertexEditMode, setVertexEditMode] = useState(false);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [draggingVertexInfo, setDraggingVertexInfo] = useState<{ polyId: string; vertexIdx: number } | null>(null);

  // Polygons
  const [polygons, setPolygons] = useState<SectionPolygon[]>(savedPolygons || []);

  // Editing state for inline polygon editing
  const [editingPolyId, setEditingPolyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editVertices, setEditVertices] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [editHasFloor, setEditHasFloor] = useState(true);
  const [editHasCeiling, setEditHasCeiling] = useState(true);

  // Ruler tool state
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerLines, setRulerLines] = useState<RulerLine[]>(savedRulerLines || []);
  const [rulerStart, setRulerStart] = useState<{ col: number; row: number } | null>(null);
  const [draggingRulerId, setDraggingRulerId] = useState<string | null>(null);
  const [draggingRulerEnd, setDraggingRulerEnd] = useState<'start' | 'end' | null>(null);
  const [editingRulerId, setEditingRulerId] = useState<string | null>(null);
  const [editRulerLabel, setEditRulerLabel] = useState('');
  const [rulerHoverNode, setRulerHoverNode] = useState<{ col: number; row: number } | null>(null);

  // Wall label display mode
  const [wallLabelMode, setWallLabelMode] = useState<WallLabelMode>('both');

  // PDF export layer options
  const [pdfLayers, setPdfLayers] = useState({
    grid: true,
    axes: true,
    dimensions: true,
    wallLabels: true,
    rulers: true,
    names: true,
  });

  // Face properties panel state
  const [facePanel, setFacePanel] = useState<{ polyId: string; polyName: string; faceKey: string; edgeCount: number; vertices: Array<{ x: number; y: number }>; initialEditObjectId?: string; initialTab?: 'faces' | 'objects' } | null>(null);

  // Double-click timer for polygon fill
  const lastPolyClickRef = useRef<{ time: number; polyId: string } | null>(null);

  // Local face patterns (for immediate SVG re-render)
  const [facePatterns, setFacePatterns] = useState<PolygonFacePatterns>(savedFacePatterns || {});

  // Double-click timer for edge detection
  const lastClickRef = useRef<{ time: number; polyId: string; edgeIdx: number } | null>(null);

  // ── Undo history ──
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => {
      const snap: UndoSnapshot = {
        polygons: JSON.parse(JSON.stringify(polygons)),
        rulerLines: JSON.parse(JSON.stringify(rulerLines)),
        facePatterns: JSON.parse(JSON.stringify(facePatterns)),
      };
      const next = [...prev, snap];
      if (next.length > MAX_UNDO) next.shift();
      return next;
    });
  }, [polygons, rulerLines, facePatterns]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setPolygons(snap.polygons);
    setRulerLines(snap.rulerLines);
    setFacePatterns(snap.facePatterns);
    onSavePolygons?.(snap.polygons);
    onSaveRulerLines?.(snap.rulerLines);
    toast.success('Deshacer aplicado');
  }, [undoStack, onSavePolygons, onSaveRulerLines]);

  // ── Openings data for visual rendering ──
  interface OpeningData { id: string; wall_id: string; opening_type: string; width: number; height: number; sill_height: number; position_x: number | null; name: string | null; }
  const [openingsMap, setOpeningsMap] = useState<Record<string, { wallIndex: number; openings: OpeningData[] }>>({});
  const [openingsVersion, setOpeningsVersion] = useState(0);

  // ── Section objects (shown_in_section=true) ──
  interface SectionObjectData {
    id: string;
    wall_id: string;
    room_id: string;
    name: string;
    width_mm: number;
    height_mm: number;
    position_x: number;
    sill_height: number;
    object_type: string;
    coord_x: number | null;
    coord_y: number | null;
    coord_z: number | null;
  }
  const [sectionObjects, setSectionObjects] = useState<SectionObjectData[]>([]);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; posX: number; sill: number } | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  const loadOpenings = useCallback(async () => {
    if (polygons.length === 0) return;
    const polyIds = polygons.map(p => p.id);
    const { data: walls } = await supabase.from('budget_floor_plan_walls').select('id, room_id, wall_index').in('room_id', polyIds);
    if (!walls || walls.length === 0) { setOpeningsMap({}); setSectionObjects([]); return; }
    const wallIds = walls.map(w => w.id);
    // Read from both legacy openings table AND wall_objects with type 'hueco'
    const [legacyRes, huecoRes, sectionObjRes] = await Promise.all([
      supabase.from('budget_floor_plan_openings').select('*').in('wall_id', wallIds),
      supabase.from('budget_wall_objects').select('*').in('wall_id', wallIds).eq('object_type', 'hueco'),
      supabase.from('budget_wall_objects').select('*').in('wall_id', wallIds).eq('shown_in_section', true),
    ]);
    // Normalize hueco objects to OpeningData format
    const huecoOpenings: OpeningData[] = (huecoRes.data || []).map((h: any) => ({
      id: h.id,
      wall_id: h.wall_id,
      opening_type: (h.name || '').toLowerCase().includes('puerta') ? 'puerta' : 'ventana',
      width: h.width_mm || 1000,
      height: h.height_mm || 1000,
      sill_height: h.sill_height || 0,
      position_x: h.position_x,
      name: h.name,
    }));
    const allOpenings = [...(legacyRes.data || []) as OpeningData[], ...huecoOpenings];
    const map: Record<string, { wallIndex: number; openings: OpeningData[] }> = {};
    for (const w of walls) {
      const wOpenings = allOpenings.filter(o => o.wall_id === w.id);
      if (wOpenings.length > 0) {
        if (!map[w.room_id]) map[w.room_id] = { wallIndex: w.wall_index, openings: [] };
        for (const o of wOpenings) {
          if (!map[`${w.room_id}__${w.wall_index}`]) map[`${w.room_id}__${w.wall_index}`] = { wallIndex: w.wall_index, openings: [] };
          map[`${w.room_id}__${w.wall_index}`].openings.push(o);
        }
      }
    }
    setOpeningsMap(map);

    // Build section objects array with room_id resolved
    const wallToRoom = new Map(walls.map(w => [w.id, w.room_id]));
    const secObjs: SectionObjectData[] = (sectionObjRes.data || [])
      .filter((o: any) => o.object_type !== 'hueco') // huecos already rendered
      .map((o: any) => ({
        id: o.id,
        wall_id: o.wall_id,
        room_id: wallToRoom.get(o.wall_id) || '',
        name: o.name || '',
        width_mm: o.width_mm || 200,
        height_mm: o.height_mm || 200,
        position_x: o.position_x || 0,
        sill_height: o.sill_height || 0,
        object_type: o.object_type || 'material',
        coord_x: o.coord_x,
        coord_y: o.coord_y,
        coord_z: o.coord_z,
      }));
    setSectionObjects(secObjs);
  }, [polygons]);

  useEffect(() => { loadOpenings(); }, [loadOpenings, openingsVersion]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerSize({ w: entry.contentRect.width, h: Math.max(400, window.innerHeight - 280) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (savedRulerLines) setRulerLines(savedRulerLines); }, [savedRulerLines]);
  useEffect(() => {
    const nextScale = getSafeScale(sectionType, savedScale);
    setScale(nextScale);
    setHScaleInput(String(nextScale.hScale));
    setVScaleInput(String(nextScale.vScale));
  }, [sectionType, savedScale]);

  useEffect(() => {
    if (savedNegLimits) {
      setGridLimits({
        negH: savedNegLimits.negH, negV: savedNegLimits.negV,
        posH: savedNegLimits.posH ?? 8, posV: savedNegLimits.posV ?? 6,
      });
      setNegHInput(String(savedNegLimits.negH));
      setNegVInput(String(savedNegLimits.negV));
      setPosHInput(String(savedNegLimits.posH ?? 8));
      setPosVInput(String(savedNegLimits.posV ?? 6));
    }
  }, [savedNegLimits]);

  useEffect(() => { if (savedPolygons) setPolygons(savedPolygons); }, [savedPolygons]);
  useEffect(() => { if (savedFacePatterns) setFacePatterns(savedFacePatterns); }, [savedFacePatterns]);

  const handleSaveScale = () => {
    const h = parseFloat(hScaleInput);
    const v = parseFloat(vScaleInput);
    if (!h || h <= 0 || !v || v <= 0) return;
    const newScale = { hScale: h, vScale: v };
    setScale(newScale);
    onSaveScale?.(newScale);
  };

  const handleSaveNegLimits = () => {
    const nh = Math.max(0, Math.round(parseFloat(negHInput) || 0));
    const nv = Math.max(0, Math.round(parseFloat(negVInput) || 0));
    const ph = Math.max(1, Math.round(parseFloat(posHInput) || 1));
    const pv = Math.max(1, Math.round(parseFloat(posVInput) || 1));
    const newLimits = { negH: nh, negV: nv, posH: ph, posV: pv };
    setGridLimits(newLimits);
    onSaveNegLimits?.(newLimits);
  };

  const handleExportPDF = useCallback(async () => {
    if (!svgRef.current) return;
    try {
      const svgEl = svgRef.current;
      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      const svgW = svgEl.width.baseVal.value || svgEl.clientWidth || 800;
      const svgH = svgEl.height.baseVal.value || svgEl.clientHeight || 500;
      svgClone.setAttribute('width', String(svgW));
      svgClone.setAttribute('height', String(svgH));
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', '#ffffff');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Remove layers based on pdfLayers options
      const layersToRemove: string[] = [];
      if (!pdfLayers.grid) layersToRemove.push('grid');
      if (!pdfLayers.axes) layersToRemove.push('axes');
      if (!pdfLayers.dimensions) layersToRemove.push('dimensions');
      if (!pdfLayers.wallLabels) layersToRemove.push('wall-labels');
      if (!pdfLayers.rulers) layersToRemove.push('rulers');
      if (!pdfLayers.names) layersToRemove.push('center-labels');
      layersToRemove.forEach(layer => {
        svgClone.querySelectorAll(`[data-pdf-layer="${layer}"]`).forEach(el => el.remove());
      });

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      const scaleFactor = 2;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgW * scaleFactor;
        canvas.height = svgH * scaleFactor;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`Seccion_${sectionName.replace(/\s+/g, '_')}.pdf`);
      };
      img.onerror = (e) => console.error('SVG to image failed:', e);
      img.src = url;
    } catch (err) {
      console.error('PDF export error:', err);
    }
  }, [sectionName, pdfLayers]);

  const margin = 50;
  const w = containerSize.w;
  const h = containerSize.h;

  const gridLayout = useMemo(() => {
    if (!scale) return null;
    const totalCols = gridLimits.negH + gridLimits.posH;
    const totalRows = gridLimits.negV + gridLimits.posV;
    if (totalCols < 1 || totalRows < 1) return null;
    const drawW = w - margin * 2;
    const drawH = h - margin * 2;
    // Compute proportional cell sizes based on real-world mm scales
    const totalRealW = totalCols * scale.hScale;
    const totalRealH = totalRows * scale.vScale;
    if (!Number.isFinite(totalRealW) || !Number.isFinite(totalRealH) || totalRealW <= 0 || totalRealH <= 0) return null;

    const pxPerMm = Math.min(drawW / totalRealW, drawH / totalRealH);
    if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;

    const cellPxW = Math.max(4, Math.floor(pxPerMm * scale.hScale));
    const cellPxH = Math.max(4, Math.floor(pxPerMm * scale.vScale));
    const gridW = totalCols * cellPxW;
    const gridH = totalRows * cellPxH;
    const ox = margin + Math.floor((drawW - gridW) / 2);
    const oy = margin + Math.floor((drawH - gridH) / 2);
    const originCol = gridLimits.negH;
    const originRow = gridLimits.posV;
    const originX = ox + originCol * cellPxW;
    const originY = oy + originRow * cellPxH;
    return { totalCols, totalRows, gridW, gridH, ox, oy, originCol, originRow, originX, originY, cellPxW, cellPxH };
  }, [scale, w, h, gridLimits]);

  const colRowToPx = useCallback((col: number, row: number) => {
    if (!gridLayout) return { px: 0, py: 0 };
    return {
      px: gridLayout.ox + col * gridLayout.cellPxW,
      py: gridLayout.oy + row * gridLayout.cellPxH,
    };
  }, [gridLayout]);

  const colRowToCoord = useCallback((col: number, row: number) => {
    if (!gridLayout) return { hIdx: 0, vIdx: 0 };
    return {
      hIdx: col - gridLayout.originCol,
      vIdx: gridLayout.originRow - row,
    };
  }, [gridLayout]);

  const snapToNode = useCallback((e: React.MouseEvent<SVGSVGElement>): { col: number; row: number } | null => {
    if (!gridLayout) return null;
    const svg = e.currentTarget;
    let pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) pt = pt.matrixTransform(ctm.inverse());
    const rawCol = (pt.x - gridLayout.ox) / gridLayout.cellPxW;
    const rawRow = (pt.y - gridLayout.oy) / gridLayout.cellPxH;
    const col = Math.round(rawCol * 2) / 2;
    const row = Math.round(rawRow * 2) / 2;
    if (col < 0 || col > gridLayout.totalCols || row < 0 || row > gridLayout.totalRows) return null;
    return { col, row };
  }, [gridLayout]);

  const snapToNodePrecise = useCallback((e: React.MouseEvent<SVGSVGElement>): { col: number; row: number } | null => {
    if (!gridLayout) return null;
    const svg = e.currentTarget;
    let pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) pt = pt.matrixTransform(ctm.inverse());
    const rawCol = (pt.x - gridLayout.ox) / gridLayout.cellPxW;
    const rawRow = (pt.y - gridLayout.oy) / gridLayout.cellPxH;
    const col = Math.round(rawCol * 2) / 2;
    const row = Math.round(rawRow * 2) / 2;
    if (col < 0 || col > gridLayout.totalCols || row < 0 || row > gridLayout.totalRows) return null;
    return { col, row };
  }, [gridLayout]);

  /** Handle edge double-click to open face properties */
  const handleEdgeClick = useCallback((polyId: string, edgeIdx: number) => {
    if (vertexEditMode) {
      setSelectedPolygonId(polyId);
      lastClickRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.polyId === polyId && last.edgeIdx === edgeIdx && (now - last.time) < 400) {
      // Double click! Open face panel
      const poly = polygons.find(p => p.id === polyId);
      if (poly) {
        const faceKey = `wall-${edgeIdx}`;
        setFacePanel({ polyId, polyName: poly.name, faceKey, edgeCount: poly.vertices.length, vertices: poly.vertices.map(v => ({ x: v.x, y: v.y })) });
      }
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { time: now, polyId, edgeIdx };
    }
  }, [polygons, vertexEditMode]);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!gridLayout) return;

    if (rulerMode) {
      const node = snapToNodePrecise(e);
      if (!node) return;
      if (!rulerStart) {
        setRulerStart(node);
      } else {
        const newLine: RulerLine = {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          start: rulerStart,
          end: node,
        };
        setRulerLines(prev => [...prev, newLine]);
        setRulerStart(null);
      }
      return;
    }

    if (vertexEditMode && !drawMode) {
      setSelectedPolygonId(null);
      return;
    }

    if (!drawMode) return;
    const node = snapToNode(e);
    if (!node) return;

    if (drawingVertices.length >= 3 &&
        node.col === drawingVertices[0].col && node.row === drawingVertices[0].row) {
      finishDrawing();
      return;
    }

    const last = drawingVertices[drawingVertices.length - 1];
    if (last && last.col === node.col && last.row === node.row) return;

    setDrawingVertices(prev => [...prev, node]);
  }, [drawMode, rulerMode, gridLayout, drawingVertices, snapToNode, snapToNodePrecise, rulerStart, vertexEditMode]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Vertex drag
    if (vertexEditMode && draggingVertexInfo && gridLayout) {
      const node = snapToNode(e);
      if (!node) return;
      const coord = colRowToCoord(node.col, node.row);
      setPolygons(prev => prev.map(p => {
        if (p.id !== draggingVertexInfo.polyId) return p;
        const newVerts = p.vertices.map((v, i) =>
          i === draggingVertexInfo.vertexIdx ? { ...v, x: coord.hIdx, y: coord.vIdx } : v
        );
        return { ...p, vertices: newVerts };
      }));
      setHoverNode(node);
      return;
    }

    if (rulerMode && gridLayout) {
      const node = snapToNodePrecise(e);
      setRulerHoverNode(node);
      setHoverNode(null);
      if (draggingRulerId && draggingRulerEnd && node) {
        setRulerLines(prev => prev.map(rl => {
          if (rl.id !== draggingRulerId) return rl;
          return draggingRulerEnd === 'start'
            ? { ...rl, start: node }
            : { ...rl, end: node };
        }));
      }
      return;
    }
    if (!drawMode || !gridLayout) { setHoverNode(null); setRulerHoverNode(null); return; }
    const node = snapToNode(e);
    setHoverNode(node);
    if (vertexEditMode) setHoverNode(node);
  }, [drawMode, rulerMode, vertexEditMode, draggingVertexInfo, gridLayout, snapToNode, snapToNodePrecise, draggingRulerId, draggingRulerEnd, colRowToCoord]);

  const handleSvgMouseUp = useCallback(() => {
    if (draggingVertexInfo) {
      // Save after vertex drag
      onSavePolygons?.(polygons);
      setDraggingVertexInfo(null);
      return;
    }
    if (draggingRulerId) {
      setDraggingRulerId(null);
      setDraggingRulerEnd(null);
    }
  }, [draggingRulerId, draggingVertexInfo, polygons, onSavePolygons]);

  const handleDeleteRuler = useCallback((id: string) => {
    pushUndo();
    const updated = rulerLines.filter(rl => rl.id !== id);
    setRulerLines(updated);
    onSaveRulerLines?.(updated);
  }, [pushUndo, rulerLines, onSaveRulerLines]);

  const handleSaveRulers = useCallback(() => {
    onSaveRulerLines?.(rulerLines);
    toast.success(`${rulerLines.length} regla(s) guardada(s)`);
  }, [rulerLines, onSaveRulerLines]);

  const handleClearRulers = useCallback(() => {
    pushUndo();
    setRulerLines([]);
    setRulerStart(null);
    onSaveRulerLines?.([]);
    toast.success('Reglas borradas');
  }, [onSaveRulerLines]);

  const finishDrawing = useCallback(() => {
    if (drawingVertices.length < 3 || !scale || !gridLayout) return;
    const name = drawingName.trim() || `Espacio ${polygons.length + 1}`;

    // Validate unique name — allow if it exists in OTHER sections (same workspace, different face)
    // Only block if it already exists in THIS section's polygons
    const existsInCurrentSection = polygons
      .filter(p => Array.isArray(p.vertices) && p.vertices.length >= 3)
      .some(p => p.name.toLowerCase() === name.toLowerCase());
    if (existsInCurrentSection) {
      toast.error(`"${name}" ya existe en esta sección. Edítalo desde la lista de caras.`);
      return;
    }

    pushUndo();
    const heightMm = parseInt(drawingHeight) || 0;

    const vertices = drawingVertices.map(v => {
      const coord = colRowToCoord(v.col, v.row);
      return { x: coord.hIdx, y: coord.vIdx, z: 0 };
    });

    const newPoly: SectionPolygon = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      vertices,
      zBase: 0,
      zTop: heightMm,
    };

    const updated = [...polygons, newPoly];
    setPolygons(updated);
    onSavePolygons?.(updated);
    setDrawMode(false);
    setDrawingVertices([]);
    setDrawingName('');
    setDrawingHeight('');
    setHoverNode(null);
  }, [drawingVertices, drawingName, drawingHeight, polygons, scale, gridLayout, colRowToCoord, onSavePolygons, allPolygonNames]);

  const cancelDrawing = () => {
    setDrawMode(false);
    setDrawingVertices([]);
    setDrawingName('');
    setDrawingHeight('');
    setHoverNode(null);
  };

  const visiblePolygons = useMemo(
    () => polygons.filter(p => Array.isArray(p.vertices) && p.vertices.length >= 3),
    [polygons],
  );

  useEffect(() => {
    if (!selectedPolygonId) return;
    if (!vertexEditMode) {
      setSelectedPolygonId(null);
      return;
    }
    const exists = polygons.some(p => p.id === selectedPolygonId && p.vertices.length >= 3);
    if (!exists) setSelectedPolygonId(null);
  }, [polygons, selectedPolygonId, vertexEditMode]);

  // ── Vertex editing helpers ──
  const handleInsertVertexOnEdge = useCallback((polyId: string, edgeIdx: number) => {
    if (!vertexEditMode) return;
    pushUndo();
    setPolygons(prev => {
      const updated = prev.map(p => {
        if (p.id !== polyId) return p;
        const verts = [...p.vertices];
        const a = verts[edgeIdx];
        const b = verts[(edgeIdx + 1) % verts.length];
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
        verts.splice(edgeIdx + 1, 0, midpoint);
        return { ...p, vertices: verts };
      });
      onSavePolygons?.(updated);
      return updated;
    });
    toast.success('Vértice insertado en arista');
  }, [vertexEditMode, pushUndo, onSavePolygons]);

  const handleDeleteVertex = useCallback((polyId: string, vertexIdx: number) => {
    const poly = polygons.find(p => p.id === polyId);
    if (!poly || poly.vertices.length <= 3) {
      toast.error('Un polígono necesita al menos 3 vértices');
      return;
    }
    pushUndo();
    setPolygons(prev => {
      const updated = prev.map(p => {
        if (p.id !== polyId) return p;
        return { ...p, vertices: p.vertices.filter((_, i) => i !== vertexIdx) };
      });
      onSavePolygons?.(updated);
      return updated;
    });
    toast.success('Vértice eliminado');
  }, [polygons, pushUndo, onSavePolygons]);

  const handleDeletePolygon = (polyId: string) => {
    const target = polygons.find(p => p.id === polyId);
    if (!target) return;

    pushUndo();

    // In X/Y sections, keep a hidden marker (vertices=[]) so regen does not reintroduce this workspace.
    if (sectionType !== 'vertical' && target.vertices.length >= 3) {
      const hidden = polygons.map(p => (
        p.id === polyId
          ? { ...p, vertices: [] }
          : p
      ));
      setPolygons(hidden);
      onSavePolygons?.(hidden);
      if (editingPolyId === polyId) setEditingPolyId(null);
      if (selectedPolygonId === polyId) setSelectedPolygonId(null);
      toast.success('Espacio ocultado en esta sección');
      return;
    }

    const updated = polygons.filter(p => p.id !== polyId);
    setPolygons(updated);
    onSavePolygons?.(updated);
    if (editingPolyId === polyId) setEditingPolyId(null);
    if (selectedPolygonId === polyId) setSelectedPolygonId(null);
  };

  const startEditPolygon = (poly: SectionPolygon) => {
    setEditingPolyId(poly.id);
    setEditName(poly.name);
    setEditHeight(String(poly.zTop || 0));
    setEditVertices(poly.vertices.map(v => ({ ...v })));
    setEditHasFloor(poly.hasFloor !== false);
    setEditHasCeiling(poly.hasCeiling !== false);
  };

  const saveEditPolygon = () => {
    if (!editingPolyId) return;
    const trimmedName = editName.trim();
    // Validate unique name (skip current polygon's own name)
    if (trimmedName) {
      // Only block if the name already exists in THIS section (excluding the polygon being edited)
      const existsInCurrentSection = polygons
        .filter(p => p.id !== editingPolyId && Array.isArray(p.vertices) && p.vertices.length >= 3)
        .some(p => p.name.toLowerCase() === trimmedName.toLowerCase());
      if (existsInCurrentSection) {
        toast.error(`"${trimmedName}" ya existe en esta sección. Edítalo desde la lista de caras.`);
        return;
      }
    }
    pushUndo();
    const updated = polygons.map(p => {
      if (p.id !== editingPolyId) return p;
      return {
        ...p,
        name: trimmedName || p.name,
        zTop: parseInt(editHeight) || p.zTop,
        vertices: editVertices,
        hasFloor: editHasFloor,
        hasCeiling: editHasCeiling,
      };
    });
    setPolygons(updated);
    onSavePolygons?.(updated);
    setEditingPolyId(null);
  };

  const cancelEditPolygon = () => {
    setEditingPolyId(null);
  };

  const updateEditVertex = (idx: number, axis: 'x' | 'y' | 'z', value: number) => {
    setEditVertices(prev => prev.map((v, i) => i === idx ? { ...v, [axis]: value } : v));
  };

  /** Handle local face type change from panel (persists into section polygon JSON) */
  const handleLocalFaceTypeChange = useCallback((faceKey: string, wallType: string) => {
    if (!facePanel) return;
    setPolygons(prev => {
      const updated = prev.map(poly => {
        if (poly.id !== facePanel.polyId) return poly;
        return {
          ...poly,
          faceTypes: {
            ...(poly.faceTypes || {}),
            [faceKey]: wallType,
          },
        };
      });
      onSavePolygons?.(updated);
      return updated;
    });
  }, [facePanel, onSavePolygons]);

  /** Handle pattern change from the face panel */
  const handlePatternChange = useCallback((faceKey: string, patternId: string | null) => {
    if (!facePanel) return;
    setFacePatterns(prev => ({
      ...prev,
      [facePanel.polyId]: {
        ...(prev[facePanel.polyId] || {}),
        [faceKey]: patternId,
      },
    }));
    onFacePatternChange?.(facePanel.polyId, faceKey, patternId);
  }, [facePanel, onFacePatternChange]);

  // Collect unique patterns used by polygons for SVG <defs>
  const usedPatternIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(facePatterns).forEach(faces => {
      Object.values(faces).forEach(pid => {
        if (pid) ids.add(pid);
      });
    });
    return ids;
  }, [facePatterns]);

  // Grid rendering
  const gridContent = useMemo(() => {
    if (!scale || !gridLayout) return null;
    const { totalCols, totalRows, gridW, gridH, ox, oy, originCol, originRow, originX, originY, cellPxW, cellPxH } = gridLayout;

    const gridLines: JSX.Element[] = [];
    const axisRefs: JSX.Element[] = [];

    for (let c = 0; c <= totalCols; c++) {
      const x = ox + c * cellPxW;
      const isOrigin = c === originCol;
      gridLines.push(
        <line key={`gv${c}`} x1={x} y1={oy} x2={x} y2={oy + gridH}
          stroke={isOrigin ? hColor : 'hsl(220, 10%, 50%)'} strokeWidth={isOrigin ? 2.5 : 0.7} opacity={isOrigin ? 1 : 0.5} />
      );
    }
    for (let r = 0; r <= totalRows; r++) {
      const y = oy + r * cellPxH;
      const isOrigin = r === originRow;
      gridLines.push(
        <line key={`gh${r}`} x1={ox} y1={y} x2={ox + gridW} y2={y}
          stroke={isOrigin ? vColor : 'hsl(220, 10%, 50%)'} strokeWidth={isOrigin ? 2.5 : 0.7} opacity={isOrigin ? 1 : 0.5} />
      );
    }

    for (let c = 0; c <= totalCols; c++) {
      const x = ox + c * cellPxW;
      const idx = c - originCol;
      axisRefs.push(
        <text key={`ht${c}`} x={x} y={oy + gridH + 16}
          textAnchor="middle" fontSize={9} fill={hColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {hAxis}{idx}
        </text>
      );
    }
    for (let r = 0; r <= totalRows; r++) {
      const y = oy + r * cellPxH;
      const idx = originRow - r;
      axisRefs.push(
        <text key={`vt${r}`} x={ox - 6} y={y + 4}
          textAnchor="end" fontSize={9} fill={vColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {vAxis}{idx}
        </text>
      );
    }

    // Arrows
    axisRefs.push(
      <polygon key="harrow"
        points={`${ox + gridW},${originY} ${ox + gridW - 8},${originY - 4} ${ox + gridW - 8},${originY + 4}`}
        fill={hColor} />
    );
    axisRefs.push(
      <text key="hlabel" x={ox + gridW + 4} y={originY - 8}
        fontSize={14} fontWeight="bold" fill={hColor} fontFamily="monospace">{hAxis}</text>
    );
    axisRefs.push(
      <polygon key="varrow"
        points={`${originX},${oy} ${originX - 4},${oy + 8} ${originX + 4},${oy + 8}`}
        fill={vColor} />
    );
    axisRefs.push(
      <text key="vlabel" x={originX + 8} y={oy + 4}
        fontSize={14} fontWeight="bold" fill={vColor} fontFamily="monospace">{vAxis}</text>
    );

    // Origin
    axisRefs.push(<circle key="origin" cx={originX} cy={originY} r={5} fill={fixedColor} opacity={0.8} />);
    axisRefs.push(<circle key="originInner" cx={originX} cy={originY} r={2.5} fill="white" />);
    axisRefs.push(
      <text key="originLabel" x={originX + 10} y={originY + 16}
        fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="monospace">(0,0)</text>
    );

    // Scale legend
    axisRefs.push(
      <text key="scaleLegend" x={ox + gridW} y={oy - 6}
        textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="monospace">
        Escala: {hAxis}={scale.hScale}mm · {vAxis}={scale.vScale}mm
      </text>
    );

    // Ridge line
    if (sectionType === 'vertical' && ridgeLine) {
      const RIDGE_COLOR = 'hsl(0, 0%, 45%)';
      const rx1 = originX + ridgeLine.x1 * cellPxW;
      const ry1 = originY - ridgeLine.y1 * cellPxH;
      const rx2 = originX + ridgeLine.x2 * cellPxW;
      const ry2 = originY - ridgeLine.y2 * cellPxH;
      const dx = ridgeLine.x2 - ridgeLine.x1;
      const dy = ridgeLine.y2 - ridgeLine.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ext = len > 0 ? 3 : 0;
      const ux = len > 0 ? dx / len : 0;
      const uy = len > 0 ? dy / len : 0;
      const ex1 = originX + (ridgeLine.x1 - ux * ext) * cellPxW;
      const ey1 = originY - (ridgeLine.y1 - uy * ext) * cellPxH;
      const ex2 = originX + (ridgeLine.x2 + ux * ext) * cellPxW;
      const ey2 = originY - (ridgeLine.y2 + uy * ext) * cellPxH;
      axisRefs.push(
        <line key="ridgeExt" x1={ex1} y1={ey1} x2={ex2} y2={ey2}
          stroke={RIDGE_COLOR} strokeWidth={2} strokeDasharray="8 4" opacity={0.7} />
      );
      axisRefs.push(
        <line key="ridgeSolid" x1={rx1} y1={ry1} x2={rx2} y2={ry2}
          stroke={RIDGE_COLOR} strokeWidth={2.5} strokeDasharray="10 5" opacity={0.9} />
      );
      axisRefs.push(<circle key="ridgeP1" cx={rx1} cy={ry1} r={3.5} fill={RIDGE_COLOR} opacity={0.9} />);
      axisRefs.push(<circle key="ridgeP2" cx={rx2} cy={ry2} r={3.5} fill={RIDGE_COLOR} opacity={0.9} />);
      const mx = (rx1 + rx2) / 2;
      const my = (ry1 + ry2) / 2;
      axisRefs.push(
        <text key="ridgeLabel" x={mx} y={my - 10}
          textAnchor="middle" fontSize={9} fontWeight={700} fill={RIDGE_COLOR} fontFamily="monospace" opacity={0.9}>
          CUMBRERA (Z={ridgeLine.z})
        </text>
      );
    }

    // Dimension lines — separated for PDF layer control
    const dimensions: JSX.Element[] = [];
    const dimOffsetH = cellPxW;
    const dimColor = 'hsl(0, 70%, 50%)';
    const dimFontSize = 9;
    const tickLen = 5;

    const bottomY = oy + gridH + dimOffsetH;
    const totalWidthMm = totalCols * scale.hScale;
    dimensions.push(
      <line key="dim-bottom" x1={ox} y1={bottomY} x2={ox + gridW} y2={bottomY}
        stroke={dimColor} strokeWidth={1} />
    );
    dimensions.push(<line key="dim-bottom-t1" x1={ox} y1={bottomY - tickLen} x2={ox} y2={bottomY + tickLen} stroke={dimColor} strokeWidth={1} />);
    dimensions.push(<line key="dim-bottom-t2" x1={ox + gridW} y1={bottomY - tickLen} x2={ox + gridW} y2={bottomY + tickLen} stroke={dimColor} strokeWidth={1} />);
    dimensions.push(
      <text key="dim-bottom-label" x={ox + gridW / 2} y={bottomY + 14}
        textAnchor="middle" fontSize={dimFontSize} fontWeight={700} fill={dimColor} fontFamily="monospace">
        {totalWidthMm >= 1000 ? `${(totalWidthMm / 1000).toFixed(2)} m` : `${totalWidthMm} mm`}
      </text>
    );

    const dimOffsetV = cellPxH;
    const rightX = ox + gridW + dimOffsetV;
    const totalHeightMm = totalRows * scale.vScale;
    dimensions.push(
      <line key="dim-right" x1={rightX} y1={oy} x2={rightX} y2={oy + gridH}
        stroke={dimColor} strokeWidth={1} />
    );
    dimensions.push(<line key="dim-right-t1" x1={rightX - tickLen} y1={oy} x2={rightX + tickLen} y2={oy} stroke={dimColor} strokeWidth={1} />);
    dimensions.push(<line key="dim-right-t2" x1={rightX - tickLen} y1={oy + gridH} x2={rightX + tickLen} y2={oy + gridH} stroke={dimColor} strokeWidth={1} />);
    dimensions.push(
      <text key="dim-right-label" x={rightX + 6} y={oy + gridH / 2}
        textAnchor="start" fontSize={dimFontSize} fontWeight={700} fill={dimColor} fontFamily="monospace"
        transform={`rotate(90, ${rightX + 6}, ${oy + gridH / 2})`}>
        {totalHeightMm >= 1000 ? `${(totalHeightMm / 1000).toFixed(2)} m` : `${totalHeightMm} mm`}
      </text>
    );

    for (let c = 0; c < totalCols; c++) {
      const x1 = ox + c * cellPxW;
      const x2 = ox + (c + 1) * cellPxW;
      const midX = (x1 + x2) / 2;
      if (totalCols <= 20) {
        dimensions.push(
          <text key={`dim-bc-${c}`} x={midX} y={bottomY - 3}
            textAnchor="middle" fontSize={7} fill={dimColor} fontFamily="monospace" opacity={0.7}>
            {scale.hScale}
          </text>
        );
      }
      dimensions.push(
        <line key={`dim-bt-${c}`} x1={x2} y1={bottomY - 2} x2={x2} y2={bottomY + 2}
          stroke={dimColor} strokeWidth={0.5} opacity={0.5} />
      );
    }

    for (let r = 0; r < totalRows; r++) {
      const y1 = oy + r * cellPxH;
      const y2 = oy + (r + 1) * cellPxH;
      const midY = (y1 + y2) / 2;
      if (totalRows <= 20) {
        dimensions.push(
          <text key={`dim-rc-${r}`} x={rightX - 3} y={midY + 3}
            textAnchor="end" fontSize={7} fill={dimColor} fontFamily="monospace" opacity={0.7}>
            {scale.vScale}
          </text>
        );
      }
      dimensions.push(
        <line key={`dim-rt-${r}`} x1={rightX - 2} y1={y2} x2={rightX + 2} y2={y2}
          stroke={dimColor} strokeWidth={0.5} opacity={0.5} />
      );
    }

    return { gridLines, axisRefs, dimensions };
  }, [scale, gridLayout, hAxis, vAxis, hColor, vColor, fixedColor, sectionType, ridgeLine]);

  // SVG pattern definitions
  const patternDefs = useMemo(() => {
    const defs: JSX.Element[] = [];
    usedPatternIds.forEach(pid => {
      const pat = getPatternById(pid);
      if (!pat) return;
      defs.push(
        <pattern key={`pat-${pid}`} id={`section-pat-${pid}`}
          patternUnits="userSpaceOnUse" width={pat.width} height={pat.height}>
          <g dangerouslySetInnerHTML={{ __html: pat.svgContent }} />
        </pattern>
      );
    });
    return defs;
  }, [usedPatternIds]);

  // Render saved polygons with pattern fills
  const polygonElements = useMemo(() => {
    if (!gridLayout || !scale) return null;
    const { originX, originY, cellPxW, cellPxH } = gridLayout;
    const elements: JSX.Element[] = [];

    // Sort polygons so the selected one renders LAST (on top) in vertex edit mode
    const sortedPolygons = vertexEditMode && selectedPolygonId
      ? [...visiblePolygons].sort((a, b) => {
          if (a.id === selectedPolygonId) return 1;
          if (b.id === selectedPolygonId) return -1;
          return 0;
        })
      : visiblePolygons;

    sortedPolygons.forEach((poly, polyIdx) => {
      // Use original index for color consistency
      const origIdx = visiblePolygons.indexOf(poly);
      const color = WORKSPACE_COLORS[(origIdx >= 0 ? origIdx : polyIdx) % WORKSPACE_COLORS.length];
      const verts = poly.vertices;
      if (verts.length < 3) return;

      const isSelectedInEdit = !vertexEditMode || selectedPolygonId === poly.id;

      const pxVerts = verts.map(v => ({
        px: originX + v.x * cellPxW,
        py: originY - v.y * cellPxH,
      }));

      const pointsStr = pxVerts.map(p => `${p.px},${p.py}`).join(' ');

      // Check if there's a whole-polygon pattern (we use the first wall pattern found, or floor pattern for Z sections)
      const polyPatterns = facePatterns[poly.id] || {};
      // For the polygon fill: use floor pattern for vertical sections, or first available pattern
      const fillPatternId = polyPatterns['floor'] || polyPatterns['wall-0'] || null;
      const fillPatternObj = getPatternById(fillPatternId);

      // Double-click handler for polygon fill area
      const handlePolyFillClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (vertexEditMode) {
          setSelectedPolygonId(poly.id);
          return;
        }

        const now = Date.now();
        const last = lastPolyClickRef.current;
        if (last && last.polyId === poly.id && (now - last.time) < 400) {
          // Double click on polygon fill → open full panel with no specific face focus
          setFacePanel({ polyId: poly.id, polyName: poly.name, faceKey: 'floor', edgeCount: poly.vertices.length, vertices: poly.vertices.map(v => ({ x: v.x, y: v.y })) });
          lastPolyClickRef.current = null;
        } else {
          lastPolyClickRef.current = { time: now, polyId: poly.id };
        }
      };

      // Polygon fill — use pattern if available, else transparent color
      if (fillPatternObj) {
        elements.push(
          <polygon key={`poly-fill-${poly.id}`} points={pointsStr}
            fill={`url(#section-pat-${fillPatternId})`}
            fillOpacity={isSelectedInEdit ? 0.6 : 0.35}
            stroke="none"
            style={{ cursor: 'pointer', pointerEvents: 'fill', opacity: isSelectedInEdit ? 1 : 0.5 }}
            onClick={handlePolyFillClick} />
        );
        // Border on top
        elements.push(
          <polygon key={`poly-border-${poly.id}`} points={pointsStr}
            fill="none" stroke={color} strokeWidth={isSelectedInEdit ? 2.5 : 1.5} pointerEvents="none" opacity={isSelectedInEdit ? 1 : 0.5} />
        );
      } else {
        elements.push(
          <polygon key={`poly-${poly.id}`} points={pointsStr}
            fill={color} fillOpacity={isSelectedInEdit ? 0.15 : 0.1}
            stroke={color}
            strokeWidth={isSelectedInEdit ? 2.5 : 1.5}
            style={{ cursor: 'pointer', pointerEvents: 'fill', opacity: isSelectedInEdit ? 1 : 0.45 }}
            onClick={handlePolyFillClick} />
        );
      }

      // Edge labels and clickable edges
      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length;
        const a = pxVerts[i];
        const b = pxVerts[j];
        const edgeMidX = (a.px + b.px) / 2;
        const edgeMidY = (a.py + b.py) / 2;

        const dxGrid = Math.abs(verts[j].x - verts[i].x);
        const dyGrid = Math.abs(verts[j].y - verts[i].y);
        const lengthMm = Math.sqrt((dxGrid * scale.hScale) ** 2 + (dyGrid * scale.vScale) ** 2);
        const wallNum = i + 1;

        // Check if this edge has a pattern
        const edgePatternId = polyPatterns[`wall-${i}`];
        const edgePattern = getPatternById(edgePatternId);

        // If this edge has a pattern, render a thick band along the edge
        if (edgePattern) {
          const edgeDx = b.px - a.px;
          const edgeDy = b.py - a.py;
          const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          if (edgeLen > 0) {
            const nx = -edgeDy / edgeLen;
            const ny = edgeDx / edgeLen;
            const thickness = 12; // px
            const p1x = a.px + nx * thickness / 2;
            const p1y = a.py + ny * thickness / 2;
            const p2x = b.px + nx * thickness / 2;
            const p2y = b.py + ny * thickness / 2;
            const p3x = b.px - nx * thickness / 2;
            const p3y = b.py - ny * thickness / 2;
            const p4x = a.px - nx * thickness / 2;
            const p4y = a.py - ny * thickness / 2;
            elements.push(
              <polygon key={`edge-pat-${poly.id}-${i}`}
                points={`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`}
                fill={`url(#section-pat-${edgePatternId})`} fillOpacity={0.8}
                stroke={color} strokeWidth={0.5} />
            );
          }
        }

        // Invisible thick hitbox for edge double-click
        {
          const edgeDx = b.px - a.px;
          const edgeDy = b.py - a.py;
          elements.push(
            <line key={`edge-hit-${poly.id}-${i}`}
              x1={a.px} y1={a.py} x2={b.px} y2={b.py}
              stroke="transparent" strokeWidth={14}
              style={{ cursor: '🔍', pointerEvents: 'stroke' }}
              onClick={(e) => { e.stopPropagation(); handleEdgeClick(poly.id, i); }}
            />
          );
        }

        // Label text - use T (techo) / S (suelo) for top/bottom edges in cross-sections
        if (wallLabelMode !== 'none') {
          let wallLabel = `P${wallNum}`;
          const isCrossSection = sectionType === 'transversal' || sectionType === 'longitudinal';
          if (isCrossSection && verts.length >= 3) {
            const minY = Math.min(...verts.map(v => v.y));
            const maxY = Math.max(...verts.map(v => v.y));
            const rangeY = maxY - minY;
            const edgeMinY = Math.min(verts[i].y, verts[j].y);
            const edgeMaxY = Math.max(verts[i].y, verts[j].y);
            if (rangeY > 0.01) {
              const isBottom = Math.abs(edgeMinY - minY) < rangeY * 0.15 && Math.abs(edgeMaxY - minY) < rangeY * 0.15;
              const isTop = Math.abs(edgeMinY - maxY) < rangeY * 0.15 && Math.abs(edgeMaxY - maxY) < rangeY * 0.15;
              if (isBottom) wallLabel = 'S';
              else if (isTop) wallLabel = 'T';
            }
          }

          let labelText = '';
          if (wallLabelMode === 'both') labelText = `${wallLabel} ${Math.round(lengthMm)}mm`;
          else if (wallLabelMode === 'name-only') labelText = wallLabel;
          else if (wallLabelMode === 'measure-only') labelText = `${Math.round(lengthMm)}mm`;

          const edgeDx = b.px - a.px;
          const edgeDy = b.py - a.py;
          const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          const nx = edgeLen > 0 ? -edgeDy / edgeLen : 0;
          const ny = edgeLen > 0 ? edgeDx / edgeLen : 0;
          const offset = 14;
          const boxW = labelText.length * 5.5 + 10;

          elements.push(
            <g key={`edge-label-${poly.id}-${i}`} data-pdf-layer="wall-labels"
              style={{
                cursor: vertexEditMode ? (isSelectedInEdit ? 'pointer' : 'default') : 'pointer',
                pointerEvents: vertexEditMode ? (isSelectedInEdit ? 'auto' : 'none') : 'auto',
              }}
              onClick={(e) => { e.stopPropagation(); handleEdgeClick(poly.id, i); }}>
              <rect
                x={edgeMidX + nx * offset - boxW / 2}
                y={edgeMidY + ny * offset - 8}
                width={boxW} height={16} rx={3}
                fill="white" fillOpacity={0.92} stroke={color} strokeWidth={0.5}
              />
              <text
                x={edgeMidX + nx * offset}
                y={edgeMidY + ny * offset + 4}
                textAnchor="middle" fontSize={9} fontWeight={700} fill={color} fontFamily="monospace">
                {labelText}
              </text>
              {edgePattern && (
                <rect
                  x={edgeMidX + nx * offset + boxW / 2 - 14}
                  y={edgeMidY + ny * offset - 5}
                  width={10} height={10} rx={2}
                  fill={edgePattern.bgColor} stroke={edgePattern.fgColor} strokeWidth={0.5} />
              )}
            </g>
          );
        }
      }

      // Vertex dots — draggable in vertex edit mode
      for (let i = 0; i < verts.length; i++) {
        const a = pxVerts[i];
        const isDraggable = vertexEditMode && selectedPolygonId === poly.id;
        const isNonSelectedVertex = vertexEditMode && selectedPolygonId !== poly.id;
        const vertIdx = i;
        elements.push(
          <circle key={`vtx-${poly.id}-${i}`} cx={a.px} cy={a.py}
            r={isDraggable ? 7 : 3.5}
            fill={isDraggable ? 'hsl(var(--primary))' : color}
            stroke="white" strokeWidth={isDraggable ? 2.5 : 1.5}
            style={{
              cursor: isDraggable ? 'grab' : undefined,
              pointerEvents: isNonSelectedVertex ? 'none' : undefined,
            }}
            onMouseDown={isDraggable ? (e) => {
              e.stopPropagation(); e.preventDefault();
              pushUndo();
              setDraggingVertexInfo({ polyId: poly.id, vertexIdx: vertIdx });
            } : undefined}
            onDoubleClick={isDraggable ? (e) => {
              e.stopPropagation();
              handleDeleteVertex(poly.id, vertIdx);
            } : undefined}
          />
        );
        // Show axis coordinate label on vertices that fall on integer grid positions
        if (!isDraggable) {
          const vx = verts[i].x;
          const vy = verts[i].y;
          const isIntX = Math.abs(vx - Math.round(vx)) < 0.01;
          const isIntY = Math.abs(vy - Math.round(vy)) < 0.01;
          if (isIntX || isIntY) {
            const coordParts: string[] = [];
            if (isIntX) {
              const hIdx = Math.round(vx);
              coordParts.push(`${hAxis}${hIdx}`);
            }
            if (isIntY) {
              const vIdx = Math.round(vy);
              coordParts.push(`${vAxis}${vIdx}`);
            }
            const coordLabel = coordParts.join(',');
            const labelW = coordLabel.length * 5.5 + 6;
            elements.push(
              <g key={`vtx-coord-${poly.id}-${i}`} style={{ pointerEvents: vertexEditMode ? 'none' : 'auto' }}>
                <rect
                  x={a.px + 8} y={a.py - 14}
                  width={labelW} height={14} rx={2}
                  fill="white" fillOpacity={0.92} stroke={color} strokeWidth={0.5}
                />
                <text
                  x={a.px + 8 + labelW / 2} y={a.py - 5}
                  textAnchor="middle" fontSize={8} fontWeight={700} fill={color} fontFamily="monospace">
                  {coordLabel}
                </text>
              </g>
            );
          }
        }
        // In edit mode, show "+" on edges to insert vertices
        if (isDraggable) {
          const j = (i + 1) % verts.length;
          const b = pxVerts[j];
          const midPx = (a.px + b.px) / 2;
          const midPy = (a.py + b.py) / 2;
          elements.push(
            <g key={`insert-${poly.id}-${i}`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); handleInsertVertexOnEdge(poly.id, i); }}>
              <circle cx={midPx} cy={midPy} r={6}
                fill="hsl(140, 60%, 45%)" stroke="white" strokeWidth={1.5} opacity={0.7} />
              <text x={midPx} y={midPy + 3.5} textAnchor="middle" fontSize={9} fontWeight={900} fill="white">+</text>
            </g>
          );
        }
      }

      // Center label — always visible for every polygon
      const areaGrid = polygonAreaGrid(verts.map(v => ({ x: v.x, y: v.y })));
      const areaM2 = areaGrid * (scale.hScale / 1000) * (scale.vScale / 1000);
      const centroid = polygonCentroid(verts.map(v => ({ x: v.x, y: v.y })));
      const cx = originX + centroid.x * cellPxW;
      const cy = originY - centroid.y * cellPxH;
      const heightMm = poly.zTop ? poly.zTop : null;
      const darkColor = color.replace(/(\d+)%\)$/, (_, l) => `${Math.max(parseInt(l) - 20, 15)}%)`);

      // Compute bounding box to fit label inside
      const pxMinX = Math.min(...pxVerts.map(p => p.px));
      const pxMaxX = Math.max(...pxVerts.map(p => p.px));
      const pxMinY = Math.min(...pxVerts.map(p => p.py));
      const pxMaxY = Math.max(...pxVerts.map(p => p.py));
      const polyWidth = pxMaxX - pxMinX;
      const polyHeight = pxMaxY - pxMinY;

      // Adaptive font size: fit name within polygon bounds
      const nameFontSize = Math.max(8, Math.min(12, polyWidth / Math.max(poly.name.length, 1) * 1.2, polyHeight / 4));
      const detailFontSize = Math.max(7, nameFontSize - 2);
      const labelText = `${areaM2.toFixed(2)} m²${heightMm ? ` · h=${heightMm}mm` : ''}`;
      const labelW = Math.max(poly.name.length * nameFontSize * 0.65, labelText.length * detailFontSize * 0.55) + 12;
      const labelH = nameFontSize + detailFontSize + 10;

      elements.push(
        <g key={`center-${poly.id}`} data-pdf-layer="center-labels"
          style={{ cursor: vertexEditMode ? 'pointer' : 'pointer', pointerEvents: 'auto', opacity: isSelectedInEdit ? 1 : 0.72 }}
          onClick={(e) => {
            e.stopPropagation();
            if (vertexEditMode) {
              setSelectedPolygonId(poly.id);
              return;
            }
            setFacePanel({ polyId: poly.id, polyName: poly.name, faceKey: 'floor', edgeCount: poly.vertices.length, vertices: poly.vertices.map(v => ({ x: v.x, y: v.y })) });
          }}>
          <rect
            x={cx - labelW / 2} y={cy - labelH / 2}
            width={labelW} height={labelH} rx={4}
            fill="white" fillOpacity={0.85} stroke={color} strokeWidth={0.5}
          />
          <text x={cx} y={cy - detailFontSize / 2 + 1} textAnchor="middle" fontSize={nameFontSize} fontWeight={800} fill={darkColor} fontFamily="sans-serif">
            {poly.name}
          </text>
          <text x={cx} y={cy + nameFontSize / 2 + 3} textAnchor="middle" fontSize={detailFontSize} fontWeight={700} fill={darkColor} fontFamily="monospace">
            {labelText}
          </text>
        </g>
      );
    });

    return elements;
  }, [polygons, gridLayout, scale, wallLabelMode, facePatterns, handleEdgeClick, vertexEditMode, selectedPolygonId, pushUndo, handleInsertVertexOnEdge, handleDeleteVertex]);

  // ── Openings visual rendering on edges ──
  const openingElements = useMemo(() => {
    if (!gridLayout || !scale || Object.keys(openingsMap).length === 0) return null;
    const { originX, originY, cellPxW, cellPxH } = gridLayout;
    const elements: JSX.Element[] = [];
    const OPENING_COLOR = 'hsl(30, 90%, 50%)'; // orange for visibility
    const DOOR_COLOR = 'hsl(200, 70%, 45%)';

    polygons.forEach((poly) => {
      const verts = poly.vertices;
      if (verts.length < 3) return;
      const pxVerts = verts.map(v => ({
        px: originX + v.x * cellPxW,
        py: originY - v.y * cellPxH,
      }));

      for (let i = 0; i < verts.length; i++) {
        const wallIdx = i + 1; // db wall_index is 1-based
        const key = `${poly.id}__${wallIdx}`;
        const entry = openingsMap[key];
        if (!entry || entry.openings.length === 0) continue;

        const a = pxVerts[i];
        const b = pxVerts[(i + 1) % verts.length];
        const edgeDx = b.px - a.px;
        const edgeDy = b.py - a.py;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        if (edgeLen === 0) continue;

        // Edge unit vector and normal
        const ux = edgeDx / edgeLen;
        const uy = edgeDy / edgeLen;
        const nx = -uy;
        const ny = ux;

        // Edge length in mm
        const dxGrid = Math.abs(verts[(i + 1) % verts.length].x - verts[i].x);
        const dyGrid = Math.abs(verts[(i + 1) % verts.length].y - verts[i].y);
        const edgeMm = Math.sqrt((dxGrid * scale.hScale) ** 2 + (dyGrid * scale.vScale) ** 2);
        const pxPerMm = edgeLen / edgeMm;

        if (sectionType === 'vertical') {
          // Z sections: openings appear as rectangles ON the wall line (horizontal)
          for (const op of entry.openings) {
            const posXmm = op.position_x || 0;
            const wMm = op.width;
            const color = op.opening_type === 'puerta' ? DOOR_COLOR : OPENING_COLOR;
            // Position along edge
            const startPx = posXmm * pxPerMm;
            const widthPx = wMm * pxPerMm;
            const thickness = 8; // px thickness perpendicular to edge

            const x1 = a.px + ux * startPx;
            const y1 = a.py + uy * startPx;
            const x2 = a.px + ux * (startPx + widthPx);
            const y2 = a.py + uy * (startPx + widthPx);

            // Rectangle perpendicular to edge
            const p1 = `${x1 + nx * thickness / 2},${y1 + ny * thickness / 2}`;
            const p2 = `${x2 + nx * thickness / 2},${y2 + ny * thickness / 2}`;
            const p3 = `${x2 - nx * thickness / 2},${y2 - ny * thickness / 2}`;
            const p4 = `${x1 - nx * thickness / 2},${y1 - ny * thickness / 2}`;

            elements.push(
              <g key={`opening-${op.id}`}>
                <polygon points={`${p1} ${p2} ${p3} ${p4}`}
                  fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.5} />
                {op.name && (
                  <text x={(x1 + x2) / 2 + nx * 14} y={(y1 + y2) / 2 + ny * 14}
                    textAnchor="middle" fontSize={7} fontWeight={600} fill={color} fontFamily="sans-serif"
                    stroke="white" strokeWidth={1.5} paintOrder="stroke">
                    {op.name}
                  </text>
                )}
              </g>
            );
          }
        } else {
          // X/Y sections: openings appear as vertical rectangles on the wall.
          // Here polygon Y-values are in grid units, so convert with current vertical scale (mm per unit).
          const polyMinY = Math.min(...verts.map(v => v.y));
          const polyMaxY = Math.max(...verts.map(v => v.y));
          const wallHeightUnits = Math.max(0.001, polyMaxY - polyMinY);
          const wallHeightMm = Math.max(1, wallHeightUnits * scale.vScale);
          const wallHeightPx = edgeLen;
          const pxPerMmV = wallHeightPx / wallHeightMm;

          for (const op of entry.openings) {
            const rawSillPx = op.sill_height * pxPerMmV;
            const rawHeightPx = op.height * pxPerMmV;
            const startFromBottom = Math.max(0, Math.min(rawSillPx, wallHeightPx));
            const openingHeightPx = Math.max(0, Math.min(rawHeightPx, wallHeightPx - startFromBottom));
            if (openingHeightPx <= 0.5) continue;

            const color = op.opening_type === 'puerta' ? DOOR_COLOR : OPENING_COLOR;
            const thickness = 6;

            // Opening rectangle: from bottom (b) going up
            const x1 = b.px - ux * startFromBottom;
            const y1 = b.py - uy * startFromBottom;
            const x2 = b.px - ux * (startFromBottom + openingHeightPx);
            const y2 = b.py - uy * (startFromBottom + openingHeightPx);

            const p1 = `${x1 + nx * thickness / 2},${y1 + ny * thickness / 2}`;
            const p2 = `${x2 + nx * thickness / 2},${y2 + ny * thickness / 2}`;
            const p3 = `${x2 - nx * thickness / 2},${y2 - ny * thickness / 2}`;
            const p4 = `${x1 - nx * thickness / 2},${y1 - ny * thickness / 2}`;

            elements.push(
              <g key={`opening-${op.id}`}>
                <polygon points={`${p1} ${p2} ${p3} ${p4}`}
                  fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.5} />
                {op.name && (
                  <text x={(x1 + x2) / 2 + nx * 12} y={(y1 + y2) / 2 + ny * 12}
                    textAnchor="middle" fontSize={6} fontWeight={600} fill={color} fontFamily="sans-serif"
                    stroke="white" strokeWidth={1.5} paintOrder="stroke">
                    {op.name}
                  </text>
                )}
              </g>
            );
          }
        }
      }
    });
    return elements.length > 0 ? elements : null;
  }, [polygons, gridLayout, scale, openingsMap, sectionType]);

  // ── Section objects rendering (shown_in_section=true) ──
  const OBJECT_COLOR = 'hsl(270, 60%, 55%)';

  const lastObjClickRef = useRef<{ time: number; objId: string } | null>(null);

  const handleObjectMouseDown = useCallback((e: React.MouseEvent, objId: string, obj: SectionObjectData) => {
    e.stopPropagation();
    e.preventDefault();

    // Double-click detection → open edit panel
    const now = Date.now();
    const last = lastObjClickRef.current;
    if (last && last.objId === objId && (now - last.time) < 400) {
      lastObjClickRef.current = null;
      // Find polygon for this object
      const poly = polygons.find(p => p.id === obj.room_id);
      if (poly) {
        setFacePanel({
          polyId: poly.id,
          polyName: poly.name,
          faceKey: 'floor',
          edgeCount: poly.vertices.length,
          vertices: poly.vertices.map(v => ({ x: v.x, y: v.y })),
          initialEditObjectId: objId,
          initialTab: 'objects',
        });
      }
      return;
    }
    lastObjClickRef.current = { time: now, objId };

    // Select this object for keyboard movement
    setSelectedObjectId(objId);

    const svg = svgRef.current;
    if (!svg) return;
    let pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) pt = pt.matrixTransform(ctm.inverse());
    setDraggingObjectId(objId);
    setDragStart({ x: pt.x, y: pt.y, posX: obj.position_x, sill: obj.sill_height });
  }, [polygons]);

  const handleObjectMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingObjectId || !dragStart || !gridLayout || !scale) return;
    const svg = svgRef.current;
    if (!svg) return;
    let pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) pt = pt.matrixTransform(ctm.inverse());
    
    const dxPx = pt.x - dragStart.x;
    const dyPx = pt.y - dragStart.y;
    
    // Convert pixel delta to mm
    const pxPerMmH = gridLayout.cellPxW / scale.hScale;
    const pxPerMmV = gridLayout.cellPxH / scale.vScale;
    const dxMm = Math.round(dxPx / pxPerMmH);
    const dyMm = Math.round(-dyPx / pxPerMmV); // y axis is inverted in SVG
    
    const newPosX = Math.max(0, dragStart.posX + dxMm);
    const newSill = Math.max(0, dragStart.sill + dyMm);
    
    setSectionObjects(prev => prev.map(o => o.id === draggingObjectId ? { ...o, position_x: newPosX, sill_height: newSill } : o));
  }, [draggingObjectId, dragStart, gridLayout, scale]);

  const handleObjectMouseUp = useCallback(async () => {
    if (!draggingObjectId) return;
    const obj = sectionObjects.find(o => o.id === draggingObjectId);
    if (obj) {
      await supabase.from('budget_wall_objects').update({
        position_x: obj.position_x,
        sill_height: obj.sill_height,
      }).eq('id', draggingObjectId);
    }
    setDraggingObjectId(null);
    setDragStart(null);
  }, [draggingObjectId, sectionObjects]);

  // ── Keyboard arrow movement for selected object (half-scale increments) ──
  useEffect(() => {
    if (!selectedObjectId || !scale) return;
    const halfH = Math.round(scale.hScale / 2); // half node in mm horizontally
    const halfV = Math.round(scale.vScale / 2); // half node in mm vertically

    const handler = async (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();

      setSectionObjects(prev => prev.map(o => {
        if (o.id !== selectedObjectId) return o;
        let { position_x, sill_height } = o;
        switch (e.key) {
          case 'ArrowRight': position_x = position_x + halfH; break;
          case 'ArrowLeft': position_x = Math.max(0, position_x - halfH); break;
          case 'ArrowUp': sill_height = sill_height + halfV; break;
          case 'ArrowDown': sill_height = Math.max(0, sill_height - halfV); break;
        }
        return { ...o, position_x, sill_height };
      }));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedObjectId, scale]);

  // Persist after keyboard movement (debounced)
  const keyMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedObjectId) return;
    const obj = sectionObjects.find(o => o.id === selectedObjectId);
    if (!obj) return;
    if (keyMoveTimerRef.current) clearTimeout(keyMoveTimerRef.current);
    keyMoveTimerRef.current = setTimeout(async () => {
      await supabase.from('budget_wall_objects').update({
        position_x: obj.position_x,
        sill_height: obj.sill_height,
      }).eq('id', selectedObjectId);
    }, 300);
  }, [sectionObjects, selectedObjectId]);

  // Deselect object when pressing Escape
  useEffect(() => {
    if (!selectedObjectId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedObjectId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedObjectId]);

  const sectionObjectElements = useMemo(() => {
    if (!gridLayout || !scale || sectionObjects.length === 0) return null;
    const { originX, originY, cellPxW, cellPxH } = gridLayout;
    const elements: JSX.Element[] = [];

    for (const obj of sectionObjects) {
      // Find the polygon this object belongs to
      const poly = polygons.find(p => p.id === obj.room_id);
      if (!poly) continue;

      const polyMinY = Math.min(...poly.vertices.map(v => v.y));
      const isSelected = obj.id === selectedObjectId;
      const selStroke = isSelected ? 'hsl(45, 100%, 50%)' : OBJECT_COLOR;
      const selWidth = isSelected ? 2.5 : 1.5;

      if (sectionType === 'vertical') {
        const polyMinX = Math.min(...poly.vertices.map(v => v.x));
        const posXmm = obj.position_x;
        const wMm = obj.width_mm;
        const pxPerMmH = cellPxW / scale.hScale;
        const x = originX + polyMinX * cellPxW + posXmm * pxPerMmH;
        const w = wMm * pxPerMmH;
        const hMm = obj.height_mm;
        const h = hMm * pxPerMmH;
        const y = originY - (polyMinY * cellPxH) - h;

        elements.push(
          <g key={`secobj-${obj.id}`} style={{ cursor: 'move' }}
            onMouseDown={e => handleObjectMouseDown(e, obj.id, obj)}>
            {isSelected && <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4}
              fill="none" stroke="hsl(45, 100%, 50%)" strokeWidth={1} strokeDasharray="4 2" rx={3} />}
            <rect x={x} y={y} width={w} height={h}
              fill={OBJECT_COLOR} fillOpacity={isSelected ? 0.45 : 0.3} stroke={selStroke} strokeWidth={selWidth} rx={2} />
            <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle" fontSize={7} fontWeight={600}
              fill={OBJECT_COLOR} fontFamily="sans-serif" stroke="white" strokeWidth={1.5} paintOrder="stroke">
              {obj.name}
            </text>
            {isSelected && <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={5}
              fill="hsl(45, 90%, 40%)" fontFamily="sans-serif" fontWeight={700}>⇦⇧⇩⇨</text>}
          </g>
        );
      } else {
        const polyMinX = Math.min(...poly.vertices.map(v => v.x));
        const pxPerMmH = cellPxW / scale.hScale;
        const pxPerMmV = cellPxH / scale.vScale;

        const basePxY = originY - polyMinY * cellPxH;
        const sillPx = obj.sill_height * pxPerMmV;
        const heightPx = obj.height_mm * pxPerMmV;
        const widthPx = obj.width_mm * pxPerMmH;
        const posXPx = obj.position_x * pxPerMmH;

        const rx = originX + polyMinX * cellPxW + posXPx;
        const ry = basePxY - sillPx - heightPx;

        elements.push(
          <g key={`secobj-${obj.id}`} style={{ cursor: 'move' }}
            onMouseDown={e => handleObjectMouseDown(e, obj.id, obj)}>
            {isSelected && <rect x={rx - 2} y={ry - 2} width={widthPx + 4} height={heightPx + 4}
              fill="none" stroke="hsl(45, 100%, 50%)" strokeWidth={1} strokeDasharray="4 2" rx={3} />}
            <rect x={rx} y={ry} width={widthPx} height={heightPx}
              fill={OBJECT_COLOR} fillOpacity={isSelected ? 0.45 : 0.3} stroke={selStroke} strokeWidth={selWidth} rx={2} />
            <text x={rx + widthPx / 2} y={ry + heightPx / 2 + 3} textAnchor="middle" fontSize={6} fontWeight={600}
              fill={OBJECT_COLOR} fontFamily="sans-serif" stroke="white" strokeWidth={1.5} paintOrder="stroke">
              {obj.name}
            </text>
            <text x={rx + widthPx / 2} y={ry - 3} textAnchor="middle" fontSize={5} fill={OBJECT_COLOR}
              fontFamily="sans-serif" stroke="white" strokeWidth={1} paintOrder="stroke">
              {obj.width_mm}×{obj.height_mm}mm
            </text>
            {isSelected && <text x={rx + widthPx / 2} y={ry - 10} textAnchor="middle" fontSize={5}
              fill="hsl(45, 90%, 40%)" fontFamily="sans-serif" fontWeight={700}>⇦⇧⇩⇨</text>}
          </g>
        );
      }
    }

    return elements.length > 0 ? elements : null;
  }, [sectionObjects, polygons, gridLayout, scale, sectionType, handleObjectMouseDown, selectedObjectId]);


  const drawingOverlay = useMemo(() => {
    if (!drawMode || !gridLayout || drawingVertices.length === 0) return null;
    const { ox, oy, cellPxW, cellPxH } = gridLayout;
    const elements: JSX.Element[] = [];

    const pxVerts = drawingVertices.map(v => ({
      px: ox + v.col * cellPxW,
      py: oy + v.row * cellPxH,
    }));

    for (let i = 0; i < pxVerts.length - 1; i++) {
      elements.push(
        <line key={`dline-${i}`}
          x1={pxVerts[i].px} y1={pxVerts[i].py}
          x2={pxVerts[i + 1].px} y2={pxVerts[i + 1].py}
          stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 3" />
      );
    }

    if (hoverNode && pxVerts.length > 0) {
      const lastPx = pxVerts[pxVerts.length - 1];
      const hPx = ox + hoverNode.col * cellPxW;
      const hPy = oy + hoverNode.row * cellPxH;
      elements.push(
        <line key="dhover"
          x1={lastPx.px} y1={lastPx.py} x2={hPx} y2={hPy}
          stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} />
      );
      if (drawingVertices.length >= 3 &&
          hoverNode.col === drawingVertices[0].col && hoverNode.row === drawingVertices[0].row) {
        elements.push(
          <circle key="dclose" cx={pxVerts[0].px} cy={pxVerts[0].py} r={10}
            fill="hsl(var(--primary))" fillOpacity={0.25} stroke="hsl(var(--primary))" strokeWidth={2} />
        );
      }
    }

    pxVerts.forEach((p, i) => {
      elements.push(
        <circle key={`dvtx-${i}`} cx={p.px} cy={p.py} r={4}
          fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
      );
    });

    if (hoverNode) {
      const hPx = ox + hoverNode.col * cellPxW;
      const hPy = oy + hoverNode.row * cellPxH;
      const isCloseNode = drawingVertices.length >= 3 &&
        hoverNode.col === drawingVertices[0].col && hoverNode.row === drawingVertices[0].row;
      elements.push(
        <circle key="cursorGlow" cx={hPx} cy={hPy} r={isCloseNode ? 18 : 14}
          fill="hsl(var(--primary))" fillOpacity={0.12} />
      );
      elements.push(
        <circle key="cursorOuter" cx={hPx} cy={hPy} r={isCloseNode ? 14 : 10}
          fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} opacity={0.9} />
      );
      elements.push(
        <circle key="cursorInner" cx={hPx} cy={hPy} r={4.5}
          fill="hsl(var(--primary))" opacity={1} />
      );
      elements.push(
        <line key="cursorH" x1={hPx - (isCloseNode ? 20 : 16)} y1={hPy} x2={hPx + (isCloseNode ? 20 : 16)} y2={hPy}
          stroke="hsl(var(--primary))" strokeWidth={1} opacity={0.4} />
      );
      elements.push(
        <line key="cursorV" x1={hPx} y1={hPy - (isCloseNode ? 20 : 16)} x2={hPx} y2={hPy + (isCloseNode ? 20 : 16)}
          stroke="hsl(var(--primary))" strokeWidth={1} opacity={0.4} />
      );
    }

    return elements;
  }, [drawMode, gridLayout, drawingVertices, hoverNode]);

  // Node interaction dots
  const nodeInteractionDots = useMemo(() => {
    if (!drawMode || !gridLayout) return null;
    const { totalCols, totalRows, ox, oy, cellPxW, cellPxH } = gridLayout;
    const elements: JSX.Element[] = [];
    for (let c = 0; c <= totalCols * 2; c++) {
      for (let r = 0; r <= totalRows * 2; r++) {
        const col = c / 2;
        const row = r / 2;
        const x = ox + col * cellPxW;
        const y = oy + row * cellPxH;
        const isHalf = (c % 2 !== 0) || (r % 2 !== 0);
        const isHovered = hoverNode && hoverNode.col === col && hoverNode.row === row;
        elements.push(
          <circle key={`ndot-${c}-${r}`} cx={x} cy={y} r={isHovered ? 6 : (isHalf ? 2.5 : 4)}
            fill="hsl(var(--primary))" fillOpacity={isHovered ? 0.6 : (isHalf ? 0.2 : 0.35)}
            stroke="hsl(var(--primary))" strokeWidth={isHovered ? 2 : 0} strokeOpacity={0.5} />
        );
      }
    }
    return elements;
  }, [drawMode, gridLayout, hoverNode]);

  return (
    <div ref={containerRef} className="rounded-lg border bg-card overflow-hidden relative">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">{sectionName}</span>
        <span className="text-xs px-2 py-0.5 rounded font-mono font-bold"
          style={{ backgroundColor: fixedColor, color: 'white' }}>
          {fixedAxis}={axisValue}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title={`Deshacer (${undoStack.length}/${MAX_UNDO})`}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: hColor }} />
            <span className="font-mono font-bold" style={{ color: hColor }}>{hAxis}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: vColor }} />
            <span className="font-mono font-bold" style={{ color: vColor }}>{vAxis}</span>
          </span>
        </div>
      </div>

      {/* Scale config bar */}
      <div className="px-3 py-2 border-b bg-muted/10 flex items-end gap-3 flex-wrap">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Escala {hAxis} (mm)</Label>
            <Input className="h-7 w-24 text-xs font-mono" type="number" min={1}
              value={hScaleInput} onChange={e => setHScaleInput(e.target.value)}
              placeholder={sectionType === 'vertical' ? '625' : '625'} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Escala {vAxis} (mm)</Label>
            <Input className="h-7 w-24 text-xs font-mono" type="number" min={1}
              value={vScaleInput} onChange={e => setVScaleInput(e.target.value)}
              placeholder={sectionType === 'vertical' ? '625' : '250'} />
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveScale}
            disabled={!parseFloat(hScaleInput) || !parseFloat(vScaleInput)}>
            <Save className="h-3 w-3" /> Guardar escala
          </Button>
        </div>
        {scale && (
          <span className="text-[10px] text-muted-foreground ml-2">
            ✓ {hAxis}={scale.hScale}mm · {vAxis}={scale.vScale}mm
          </span>
        )}
        {scale && (
          <div className="flex items-center gap-1 ml-auto">
            <Button
              size="sm"
              variant={rulerMode ? 'default' : 'outline'}
              className="h-7 text-xs gap-1"
              style={rulerMode ? { backgroundColor: RULER_BTN, borderColor: RULER_BTN } : {}}
              onClick={() => { setRulerMode(!rulerMode); setRulerStart(null); if (!rulerMode) { setDrawMode(false); } }}
            >
              <Ruler className="h-3 w-3" /> {rulerMode ? 'Regla ON' : 'Regla'}
            </Button>
            {rulerLines.length > 0 && onSaveRulerLines && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-green-600" onClick={handleSaveRulers}>
                <Save className="h-3 w-3" /> Guardar ({rulerLines.length})
              </Button>
            )}
            {rulerLines.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={handleClearRulers}>
                <X className="h-3 w-3" /> Borrar reglas
              </Button>
            )}
            <div className="flex items-center gap-1">
              <Select value={wallLabelMode} onValueChange={(v) => setWallLabelMode(v as WallLabelMode)}>
                <SelectTrigger className="h-7 w-[130px] text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">P + medida</SelectItem>
                  <SelectItem value="name-only">Solo P</SelectItem>
                  <SelectItem value="measure-only">Solo medida</SelectItem>
                  <SelectItem value="none">Sin etiquetas</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Printer className="h-3 w-3" /> PDF ▾
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <p className="text-xs font-semibold mb-2">Capas a imprimir</p>
                  <div className="space-y-2">
                    {([
                      ['grid', 'Cuadrícula'],
                      ['axes', 'Ejes y escala'],
                      ['dimensions', 'Cotas perimetrales'],
                      ['wallLabels', 'Etiquetas de pared'],
                      ['rulers', 'Medidas de regla'],
                      ['names', 'Nombres y m²'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={pdfLayers[key]}
                          onCheckedChange={(v) => setPdfLayers(prev => ({ ...prev, [key]: !!v }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <Button size="sm" className="w-full mt-3 h-7 text-xs gap-1" onClick={handleExportPDF}>
                    <Printer className="h-3 w-3" /> Exportar PDF
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>

      {/* Grid limits config bar */}
      {scale && (
        <div className="px-3 py-2 border-b bg-muted/10 flex items-end gap-3 flex-wrap">
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">-{hAxis} (nodos)</Label>
              <Input className="h-7 w-16 text-xs font-mono" type="number" min={0}
                value={negHInput} onChange={e => setNegHInput(e.target.value)} placeholder="3" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">+{hAxis} (nodos)</Label>
              <Input className="h-7 w-16 text-xs font-mono" type="number" min={1}
                value={posHInput} onChange={e => setPosHInput(e.target.value)} placeholder="8" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">-{vAxis} (nodos)</Label>
              <Input className="h-7 w-16 text-xs font-mono" type="number" min={0}
                value={negVInput} onChange={e => setNegVInput(e.target.value)} placeholder="3" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">+{vAxis} (nodos)</Label>
              <Input className="h-7 w-16 text-xs font-mono" type="number" min={1}
                value={posVInput} onChange={e => setPosVInput(e.target.value)} placeholder="6" />
            </div>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveNegLimits}>
              <Save className="h-3 w-3" /> Guardar límites
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground ml-2">
            {hAxis}: -{gridLimits.negH} a +{gridLimits.posH} · {vAxis}: -{gridLimits.negV} a +{gridLimits.posV}
            {gridLayout ? ` · ${gridLayout.cellPxW}×${gridLayout.cellPxH}px` : ''}
          </span>
        </div>
      )}

      {/* Drawing toolbar */}
      {scale && (
        <div className="px-3 py-2 border-b bg-muted/10 flex items-center gap-3 flex-wrap">
          {vertexEditMode ? (
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs font-semibold text-primary">
                ✏️ Modo Modificar — Primero selecciona un espacio con clic · Luego arrastra vértices · Clic en + para insertar · Doble clic en vértice para eliminar
              </span>
              <span className="text-[10px] text-muted-foreground">
                {selectedPolygonId
                  ? `Seleccionado: ${polygons.find(p => p.id === selectedPolygonId)?.name || '—'}`
                  : 'Sin espacio seleccionado'}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="default" className="h-7 text-xs gap-1"
                  onClick={() => { setVertexEditMode(false); setSelectedPolygonId(null); onSavePolygons?.(polygons); toast.success('Cambios guardados'); }}>
                  <Check className="h-3 w-3" /> Listo
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                  onClick={() => { setVertexEditMode(false); setSelectedPolygonId(null); handleUndo(); }}>
                  <X className="h-3 w-3" /> Cancelar
                </Button>
              </div>
            </div>
          ) : !drawMode ? (
            <>
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Nombre del espacio</Label>
                  <Input className="h-7 w-40 text-xs" placeholder="Ej: Salón"
                    value={drawingName} onChange={e => setDrawingName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Altura (mm)</Label>
                  <Input className="h-7 w-24 text-xs" placeholder="Ej: 2500" type="number" min={0}
                    value={drawingHeight} onChange={e => setDrawingHeight(e.target.value)} />
                </div>
                <Button size="sm" className="h-7 text-xs gap-1"
                  onClick={() => { if (!drawingName.trim() || !drawingHeight.trim()) return; setDrawMode(true); }}
                  disabled={!drawingName.trim() || !drawingHeight.trim()}>
                  <PenTool className="h-3 w-3" /> Dibujar espacio
                </Button>
                {visiblePolygons.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => { pushUndo(); setSelectedPolygonId(null); setVertexEditMode(true); setRulerMode(false); setDrawMode(false); }}>
                    <PenTool className="h-3 w-3" /> Modificar
                  </Button>
                )}
                {onRegenerate && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={onRegenerate}>
                    <RefreshCw className="h-3 w-3" /> Regenerar espacios
                  </Button>
                )}
              </div>
              {visiblePolygons.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {visiblePolygons.length} espacio(s) — clic para seleccionar en Modificar
                </span>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs font-semibold text-primary">
                🎯 Dibujando: {drawingName} — Clic en nodos (cualquier sentido). Cierra en el 1er nodo o pulsa Cerrar.
              </span>
              <span className="text-[10px] text-muted-foreground">
                Vértices: {drawingVertices.length}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {drawingVertices.length >= 3 && (
                  <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={finishDrawing}>
                    <Check className="h-3 w-3" /> Cerrar
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelDrawing}>
                  <X className="h-3 w-3" /> Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Polygon list */}
      {visiblePolygons.length > 0 && !drawMode && (
        <div className="px-3 py-1.5 border-b bg-muted/5 flex flex-wrap gap-1.5">
          {visiblePolygons.map((poly, idx) => {
            const color = WORKSPACE_COLORS[idx % WORKSPACE_COLORS.length];
            const areaGrid = polygonAreaGrid(poly.vertices.map(v => ({ x: v.x, y: v.y })));
            const areaM2 = scale ? areaGrid * (scale.hScale / 1000) * (scale.vScale / 1000) : 0;
            const heightMm = poly.zTop || 0;
            const isSelectedForVertexEdit = vertexEditMode && selectedPolygonId === poly.id;
            return (
              <span key={poly.id}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  borderColor: color,
                  color,
                  backgroundColor: isSelectedForVertexEdit
                    ? `${color}22`
                    : editingPolyId === poly.id
                      ? `${color}15`
                      : undefined,
                }}
                onClick={() => {
                  if (vertexEditMode) {
                    setSelectedPolygonId(poly.id);
                    return;
                  }
                  startEditPolygon(poly);
                }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {poly.name} ({areaM2.toFixed(2)} m²{heightMm ? ` · h=${heightMm}mm` : ''})
                <button onClick={(e) => { e.stopPropagation(); handleDeletePolygon(poly.id); }}
                  className="ml-0.5 hover:opacity-70" title="Eliminar">✕</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Inline edit panel */}
      {editingPolyId && !drawMode && (
        <div className="px-3 py-2 border-b bg-muted/10 space-y-2">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-[10px] text-muted-foreground">Nombre</Label>
              <Input className="h-7 w-40 text-xs" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Altura (mm)</Label>
              <Input className="h-7 w-24 text-xs font-mono" type="number" min={0}
                value={editHeight} onChange={e => setEditHeight(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input type="checkbox" checked={editHasFloor} onChange={e => setEditHasFloor(e.target.checked)} className="h-3 w-3 rounded" />
                <span className="text-muted-foreground">Tiene suelo</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input type="checkbox" checked={editHasCeiling} onChange={e => setEditHasCeiling(e.target.checked)} className="h-3 w-3 rounded" />
                <span className="text-muted-foreground">Tiene techo</span>
              </label>
            </div>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEditPolygon}>
              <Check className="h-3 w-3" /> Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEditPolygon}>
              <X className="h-3 w-3" /> Cancelar
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground font-medium">Coordenadas de vértices (inicio → fin de cada línea/pared)</p>
          <div className="flex flex-wrap gap-2">
            {editVertices.map((v, i) => {
              const j = (i + 1) % editVertices.length;
              const isCross = sectionType === 'transversal' || sectionType === 'longitudinal';
              // Determine label for this edge
              let edgeLabel = `P${i + 1}`;
              if (isCross && editVertices.length >= 3) {
                const minY = Math.min(...editVertices.map(vv => vv.y));
                const maxY = Math.max(...editVertices.map(vv => vv.y));
                const rangeY = maxY - minY;
                const eMinY = Math.min(editVertices[i].y, editVertices[j].y);
                const eMaxY = Math.max(editVertices[i].y, editVertices[j].y);
                if (rangeY > 0.01) {
                  if (Math.abs(eMinY - minY) < rangeY * 0.15 && Math.abs(eMaxY - minY) < rangeY * 0.15) edgeLabel = 'S';
                  else if (Math.abs(eMinY - maxY) < rangeY * 0.15 && Math.abs(eMaxY - maxY) < rangeY * 0.15) edgeLabel = 'T';
                }
              }
              return (
                <div key={i} className="flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 bg-background">
                  <span className="font-mono font-bold text-primary">{edgeLabel}</span>
                  <span className="text-muted-foreground text-[9px]">ini:</span>
                  <span className="text-muted-foreground">{hAxis}:</span>
                  <Input className="h-5 w-12 text-[10px] font-mono px-1" type="number"
                    value={v.x} onChange={e => updateEditVertex(i, 'x', parseFloat(e.target.value) || 0)} />
                  <span className="text-muted-foreground">{vAxis}:</span>
                  <Input className="h-5 w-12 text-[10px] font-mono px-1" type="number"
                    value={v.y} onChange={e => updateEditVertex(i, 'y', parseFloat(e.target.value) || 0)} />
                  <span className="text-muted-foreground">Z:</span>
                  <Input className="h-5 w-12 text-[10px] font-mono px-1" type="number"
                    value={v.z} onChange={e => updateEditVertex(i, 'z', parseFloat(e.target.value) || 0)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ruler lines list */}
      {rulerLines.length > 0 && !drawMode && !rulerMode && (
        <div className="px-3 py-1.5 border-b bg-muted/5 flex flex-wrap gap-1.5">
          {rulerLines.map((rl) => {
            if (!scale || !gridLayout) return null;
            const { originCol, originRow } = gridLayout;
            const startCoord = { h: rl.start.col - originCol, v: originRow - rl.start.row };
            const endCoord = { h: rl.end.col - originCol, v: originRow - rl.end.row };
            const dh = Math.abs(endCoord.h - startCoord.h) * scale.hScale;
            const dv = Math.abs(endCoord.v - startCoord.v) * scale.vScale;
            const lengthMm = Math.sqrt(dh * dh + dv * dv);
            const isEditing = editingRulerId === rl.id;
            return (
              <span key={rl.id}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: RULER_BTN, color: RULER_TEXT }}
                onClick={() => { setEditingRulerId(rl.id); setEditRulerLabel(rl.label || ''); }}>
                📏 {rl.label || `${Math.round(lengthMm)} mm`}
                {isEditing && (
                  <Input className="h-5 w-20 text-[10px] font-mono px-1 ml-1" placeholder="Etiqueta"
                    value={editRulerLabel}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setEditRulerLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setRulerLines(prev => prev.map(r => r.id === rl.id ? { ...r, label: editRulerLabel.trim() || undefined } : r));
                        setEditingRulerId(null);
                      }
                    }}
                  />
                )}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteRuler(rl.id); }}
                  className="ml-0.5 hover:opacity-70" title="Eliminar">✕</button>
              </span>
            );
          })}
        </div>
      )}

      {/* SVG Canvas */}
      {scale ? (
        <svg
          ref={svgRef}
          width={w} height={h}
          style={(drawMode || rulerMode || vertexEditMode) ? { cursor: vertexEditMode ? 'default' : rulerMode ? 'crosshair' : 'none' } : undefined}
          className="block bg-background"
          onClick={handleSvgClick}
          onMouseMove={(e) => { handleSvgMouseMove(e); handleObjectMouseMove(e); }}
          onMouseUp={() => { handleSvgMouseUp(); handleObjectMouseUp(); }}
          onMouseLeave={() => { handleObjectMouseUp(); }}
        >
          {/* Pattern definitions */}
          <defs>
            {patternDefs}
          </defs>

          <g data-pdf-layer="grid" opacity={drawMode ? 0.25 : 1}>{gridContent?.gridLines}</g>
          <g data-pdf-layer="axes">{gridContent?.axisRefs}</g>
          <g data-pdf-layer="dimensions">{gridContent?.dimensions}</g>
          {nodeInteractionDots}
          {polygonElements}
          {openingElements}
          {sectionObjectElements}
          {drawingOverlay}

          {/* Ruler lines rendering */}
          <g data-pdf-layer="rulers">
          {gridLayout && scale && rulerLines.map((rl) => {
            const { ox, oy, cellPxW, cellPxH, originCol, originRow } = gridLayout;
            const x1 = ox + rl.start.col * cellPxW;
            const y1 = oy + rl.start.row * cellPxH;
            const x2 = ox + rl.end.col * cellPxW;
            const y2 = oy + rl.end.row * cellPxH;
            const startCoord = { h: rl.start.col - originCol, v: originRow - rl.start.row };
            const endCoord = { h: rl.end.col - originCol, v: originRow - rl.end.row };
            const dh = Math.abs(endCoord.h - startCoord.h) * scale.hScale;
            const dv = Math.abs(endCoord.v - startCoord.v) * scale.vScale;
            const lengthMm = Math.sqrt(dh * dh + dv * dv);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const displayText = rl.label || `${Math.round(lengthMm)} mm`;

            const edgeDx = x2 - x1;
            const edgeDy = y2 - y1;
            const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            const nx = edgeLen > 0 ? -edgeDy / edgeLen : 0;
            const ny = edgeLen > 0 ? edgeDx / edgeLen : 0;
            const labelOffset = 12;

            return (
              <g key={`ruler-${rl.id}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={RULER_STROKE} strokeWidth={2.5} strokeDasharray="8 4" />
                <line x1={x1 - ny * 6} y1={y1 + nx * 6} x2={x1 + ny * 6} y2={y1 - nx * 6}
                  stroke={RULER_STROKE} strokeWidth={2} />
                <line x1={x2 - ny * 6} y1={y2 + nx * 6} x2={x2 + ny * 6} y2={y2 - nx * 6}
                  stroke={RULER_STROKE} strokeWidth={2} />
                <circle cx={x1} cy={y1} r={5} fill={RULER_STROKE} stroke="white" strokeWidth={1.5}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingRulerId(rl.id); setDraggingRulerEnd('start'); setRulerMode(true); }} />
                <circle cx={x2} cy={y2} r={5} fill={RULER_STROKE} stroke="white" strokeWidth={1.5}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingRulerId(rl.id); setDraggingRulerEnd('end'); setRulerMode(true); }} />
                <rect x={mx + nx * labelOffset - 30} y={my + ny * labelOffset - 8}
                  width={60} height={16} rx={3}
                  fill="white" fillOpacity={0.95} stroke={RULER_STROKE} strokeWidth={1} />
                <text x={mx + nx * labelOffset} y={my + ny * labelOffset + 4}
                  textAnchor="middle" fontSize={10} fontWeight={800} fill={RULER_TEXT} fontFamily="monospace">
                  {displayText}
                </text>
                <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleDeleteRuler(rl.id); }}>
                  <circle cx={mx + nx * labelOffset + 28} cy={my + ny * labelOffset} r={6}
                    fill="hsl(0, 70%, 50%)" fillOpacity={0.8} />
                  <text x={mx + nx * labelOffset + 28} y={my + ny * labelOffset + 3.5}
                    textAnchor="middle" fontSize={8} fill="white" fontWeight={700}>✕</text>
                </g>
              </g>
            );
          })}
          </g>

          {/* Ruler drawing preview */}
          {rulerMode && rulerStart && rulerHoverNode && gridLayout && (
            (() => {
              const { ox, oy, cellPxW, cellPxH, originCol, originRow } = gridLayout;
              const x1 = ox + rulerStart.col * cellPxW;
              const y1 = oy + rulerStart.row * cellPxH;
              const x2 = ox + rulerHoverNode.col * cellPxW;
              const y2 = oy + rulerHoverNode.row * cellPxH;
              const startCoord = { h: rulerStart.col - originCol, v: originRow - rulerStart.row };
              const endCoord = { h: rulerHoverNode.col - originCol, v: originRow - rulerHoverNode.row };
              const dh = Math.abs(endCoord.h - startCoord.h) * (scale?.hScale || 1);
              const dv = Math.abs(endCoord.v - startCoord.v) * (scale?.vScale || 1);
              const lengthMm = Math.sqrt(dh * dh + dv * dv);
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              return (
                <g>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={RULER_STROKE} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
                  <circle cx={x1} cy={y1} r={4} fill={RULER_STROKE} opacity={0.8} />
                  <circle cx={x2} cy={y2} r={4} fill={RULER_STROKE} opacity={0.6} />
                  <text x={mx} y={my - 8} textAnchor="middle" fontSize={10} fontWeight={800}
                    fill={RULER_TEXT} fontFamily="monospace"
                    stroke="white" strokeWidth={2} paintOrder="stroke">
                    {Math.round(lengthMm)} mm
                  </text>
                </g>
              );
            })()
          )}

          {/* Ruler mode: start point indicator */}
          {rulerMode && rulerHoverNode && !rulerStart && gridLayout && (
            (() => {
              const { ox, oy, cellPxW, cellPxH } = gridLayout;
              const hx = ox + rulerHoverNode.col * cellPxW;
              const hy = oy + rulerHoverNode.row * cellPxH;
              return (
                <g>
                  <circle cx={hx} cy={hy} r={8} fill={RULER_STROKE} fillOpacity={0.2} />
                  <circle cx={hx} cy={hy} r={4} fill={RULER_STROKE} opacity={0.8} />
                  <line x1={hx - 12} y1={hy} x2={hx + 12} y2={hy} stroke={RULER_STROKE} strokeWidth={1} opacity={0.5} />
                  <line x1={hx} y1={hy - 12} x2={hx} y2={hy + 12} stroke={RULER_STROKE} strokeWidth={1} opacity={0.5} />
                </g>
              );
            })()
          )}
        </svg>
      ) : (
        <div className="flex items-center justify-center bg-background" style={{ height: h }}>
          <p className="text-sm text-muted-foreground">
            Define las escalas {hAxis} y {vAxis} en milímetros y pulsa <strong>Guardar escala</strong> para generar la cuadrícula.
          </p>
        </div>
      )}

      {/* Face properties panel (floating) */}
      {facePanel && (
        <WorkspacePropertiesPanel
          workspaceId={facePanel.polyId}
          workspaceName={facePanel.polyName}
          sectionType={sectionType}
          sectionName={sectionName}
          sectionAxisValue={axisValue}
          floorPlanId={floorPlanId}
          focusFace={facePanel.faceKey}
          edgeCount={facePanel.edgeCount}
          vertices={facePanel.vertices}
          onClose={() => setFacePanel(null)}
          onPatternChange={handlePatternChange}
          onOpeningsChange={() => setOpeningsVersion(v => v + 1)}
          localFaceTypes={polygons.find(p => p.id === facePanel.polyId)?.faceTypes || {}}
          onLocalFaceTypeChange={handleLocalFaceTypeChange}
          initialEditObjectId={facePanel.initialEditObjectId}
          initialTab={facePanel.initialTab}
        />
      )}
    </div>
  );
}
