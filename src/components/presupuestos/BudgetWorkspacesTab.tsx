import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Triangle, Pyramid, Cuboid, Grid3x3, MapPin, X, MousePointerClick, List, Layers, Save, RefreshCw, Expand, MousePointer, Box } from 'lucide-react';
import { Workspace3DViewer } from './Workspace3DViewer';
import { Workspace3DListView } from './Workspace3DListView';
import { WallObjectsPanel } from './WallObjectsPanel';
import { GridPdfExport } from './GridPdfExport';
import { DeleteWithBackupDialog } from '@/components/DeleteWithBackupDialog';
import { DeletionBackupsList } from '@/components/DeletionBackupsList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type { CustomSection } from './CustomSectionManager';

interface BudgetWorkspacesTabProps {
  budgetId: string;
  isAdmin: boolean;
  autoShow3D?: boolean;
  onAutoShow3DHandled?: () => void;
}

interface PolygonVertex {
  x: number;
  y: number;
}

interface Workspace {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number | null;
  has_floor: boolean;
  has_ceiling: boolean;
  has_roof: boolean;
  vertical_section_id: string | null;
  floor_id?: string | null;
  floor_polygon: PolygonVertex[] | null;
  is_base: boolean;
}

interface PlacedGridRoom {
  id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  length: number;
}

interface GridBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface WallData {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  height: number | null;
}

type GeometryType = 'cube' | 'prism' | 'pyramid';
type FloorCeilingType = 'normal' | 'invisible' | 'shared';

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'interior_invisible', label: 'Int. invisible' },
];

/** Visual styles per wall type for grid edge rendering */
const WALL_EDGE_STYLES: Record<string, { color: string; width: number; dash: string }> = {
  exterior:             { color: 'hsl(145 70% 35%)',  width: 3.5, dash: 'none' },
  exterior_compartida:  { color: 'hsl(145 70% 35%)',  width: 3.5, dash: 'none' },
  exterior_invisible:   { color: 'hsl(0 0% 65%)',     width: 2.5, dash: '4 3' },
  interior:             { color: 'hsl(30 85% 50%)',   width: 2,   dash: 'none' },
  interior_compartida:  { color: 'hsl(30 85% 50%)',   width: 2,   dash: 'none' },
  interior_invisible:   { color: 'hsl(0 0% 65%)',     width: 1.5, dash: '3 2' },
};
const WALL_EDGE_DEFAULT = { color: 'hsl(200 80% 50%)', width: 2, dash: 'none' };

const FLOOR_CEILING_TYPES: { value: FloorCeilingType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'shared', label: 'Compartido' },
];

const GEOMETRY_INFO: Record<GeometryType, { label: string; vertices: number; description: string }> = {
  cube: { label: 'Cubo', vertices: 8, description: '6 caras — forma estándar' },
  prism: { label: 'Prisma', vertices: 6, description: 'Tejado a dos aguas' },
  pyramid: { label: 'Pirámide', vertices: 5, description: 'Punta central' },
};

/** Shoelace formula for polygon area in m² */
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

/** Compute slope annotation text for an edge */
function edgeSlopeInfo(a: PolygonVertex, b: PolygonVertex, hScaleM: number, vScaleM: number, showDeg: boolean, showPct: boolean): string {
  const dx = (b.x - a.x) * hScaleM;
  const dy = (b.y - a.y) * vScaleM;
  const parts: string[] = [];
  if (showDeg) {
    const angleDeg = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    // Normalize: angle from horizontal
    const fromH = angleDeg > 90 ? 180 - angleDeg : angleDeg;
    parts.push(`${fromH.toFixed(1)}°`);
  }
  if (showPct) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx > 0.0001) {
      const pct = (absDy / absDx) * 100;
      parts.push(`${pct.toFixed(1)}%`);
    } else if (absDy > 0.0001) {
      parts.push('∞%');
    }
  }
  return parts.join(' ');
}


function findPolygonIntersections(
  poly: PolygonVertex[],
  axis: 'x' | 'y',
  val: number,
): number[] {
  const intersections: number[] = [];
  const otherAxis = axis === 'y' ? 'x' : 'y';
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i];
    const b = poly[j];
    const aVal = a[axis];
    const bVal = b[axis];
    if ((aVal <= val && bVal >= val) || (aVal >= val && bVal <= val)) {
      if (aVal === bVal) {
        intersections.push(a[otherAxis], b[otherAxis]);
      } else {
        const t = (val - aVal) / (bVal - aVal);
        intersections.push(a[otherAxis] + t * (b[otherAxis] - a[otherAxis]));
      }
    }
  }
  return intersections;
}

/** Bounding box dimensions */
function polygonBBox(vertices: PolygonVertex[]) {
  if (vertices.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/** Edge length between two vertices */
function edgeLength(a: PolygonVertex, b: PolygonVertex): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Wall label — just the number, no positional text */
function wallLabel(_index: number, _total: number, _sectionType: 'z' | 'xy' = 'z'): string {
  return '';
}

function normalizeWallType(type?: string | null): string {
  switch (type) {
    case 'external':
    case 'externa':
    case 'exterior':
      return 'exterior';
    case 'internal':
    case 'interna':
    case 'interior':
      return 'interior';
    case 'external_shared':
    case 'compartida':
    case 'exterior_compartida':
      return 'exterior_compartida';
    case 'internal_shared':
    case 'interior_compartida':
      return 'interior_compartida';
    case 'invisible':
    case 'interior_invisible':
      return 'interior_invisible';
    case 'exterior_invisible':
      return 'exterior_invisible';
    default:
      return 'exterior';
  }
}

function getGeometryType(room: Workspace): GeometryType {
  if (room.has_roof) return 'prism';
  return 'cube';
}

function getFloorType(room: Workspace): FloorCeilingType {
  if (!room.has_floor) return 'invisible';
  return 'normal';
}

function getCeilingType(room: Workspace): FloorCeilingType {
  if (room.has_roof) return 'normal';
  if (!room.has_ceiling) return 'invisible';
  return 'normal';
}

function GeometryIcon({ type }: { type: GeometryType }) {
  switch (type) {
    case 'prism': return <Triangle className="h-3.5 w-3.5" />;
    case 'pyramid': return <Pyramid className="h-3.5 w-3.5" />;
    default: return <Cuboid className="h-3.5 w-3.5" />;
  }
}

/** Small inline SVG polygon preview */
function PolygonPreview({ vertices, size = 40 }: { vertices: PolygonVertex[]; size?: number }) {
  if (vertices.length < 3) return null;
  const bbox = polygonBBox(vertices);
  const pad = 2;
  const scale = Math.min((size - pad * 2) / (bbox.w || 1), (size - pad * 2) / (bbox.h || 1));
  const points = vertices.map(v =>
    `${pad + (v.x - bbox.minX) * scale},${pad + (bbox.maxY - v.y) * scale}`
  ).join(' ');

  return (
    <svg width={size} height={size} className="shrink-0">
      <polygon points={points} fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
    </svg>
  );
}

/** Larger polygon preview with clickable wall numbers on each edge */
function PolygonPreviewWithWalls({
  vertices,
  size = 120,
  selectedWall,
  onSelectWall,
}: {
  vertices: PolygonVertex[];
  size?: number;
  selectedWall: number | null;
  onSelectWall: (index: number) => void;
}) {
  if (vertices.length < 3) return null;
  const bbox = polygonBBox(vertices);
  const pad = 18;
  const scale = Math.min((size - pad * 2) / (bbox.w || 1), (size - pad * 2) / (bbox.h || 1));
  const mapped = vertices.map(v => ({
    x: pad + (v.x - bbox.minX) * scale,
    y: pad + (v.y - bbox.minY) * scale,
  }));
  const points = mapped.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={size} height={size} className="shrink-0 cursor-pointer">
      <polygon points={points} fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {mapped.map((p, i) => {
        const next = mapped[(i + 1) % mapped.length];
        const mx = (p.x + next.x) / 2;
        const my = (p.y + next.y) / 2;
        // Offset label slightly outward from polygon center
        const cx = mapped.reduce((s, v) => s + v.x, 0) / mapped.length;
        const cy = mapped.reduce((s, v) => s + v.y, 0) / mapped.length;
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const offX = mx + (dx / dist) * 10;
        const offY = my + (dy / dist) * 10;
        const isSelected = selectedWall === i;
        return (
          <g key={i} onClick={(e) => { e.stopPropagation(); onSelectWall(i); }} style={{ cursor: 'pointer' }}>
            {isSelected && (
              <line x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke="hsl(var(--destructive))" strokeWidth="3" />
            )}
            <circle cx={offX} cy={offY} r={7} fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
            <text x={offX} y={offY} textAnchor="middle" dominantBaseline="central" fill="hsl(var(--primary-foreground))" fontSize="8" fontWeight="bold">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Vertex Editor ───────────────────────────────────────────────

interface VertexEditorProps {
  vertices: PolygonVertex[];
  onChange: (vertices: PolygonVertex[]) => void;
}

function VertexEditor({ vertices, onChange }: VertexEditorProps) {
  const addVertex = () => {
    const last = vertices[vertices.length - 1];
    onChange([...vertices, { x: (last?.x ?? 0) + 1, y: last?.y ?? 0 }]);
  };

  const updateVertex = (idx: number, field: 'x' | 'y', val: string) => {
    const next = [...vertices];
    next[idx] = { ...next[idx], [field]: parseFloat(val) || 0 };
    onChange(next);
  };

  const removeVertex = (idx: number) => {
    onChange(vertices.filter((_, i) => i !== idx));
  };

  const area = polygonArea(vertices);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold">Vértices del polígono base (X, Y en metros)</Label>
        {vertices.length >= 3 && (
          <Badge variant="secondary" className="text-[9px] h-4">📐 {area.toFixed(2)} m²</Badge>
        )}
      </div>

      <div className="space-y-1">
        {vertices.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-4 text-right">{i + 1}</span>
            <Input
              className="h-6 text-[10px] w-16"
              type="number"
              step="0.01"
              placeholder="X"
              value={v.x || ''}
              onChange={e => updateVertex(i, 'x', e.target.value)}
            />
            <Input
              className="h-6 text-[10px] w-16"
              type="number"
              step="0.01"
              placeholder="Y"
              value={v.y || ''}
              onChange={e => updateVertex(i, 'y', e.target.value)}
            />
            <span className="text-[9px] text-muted-foreground">
              {i > 0 ? `↔ ${edgeLength(vertices[i - 1], v).toFixed(2)}m` : ''}
            </span>
            {vertices.length > 3 && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeVertex(i)}>
                <X className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>
        ))}
        {/* Closing edge length */}
        {vertices.length >= 3 && (
          <div className="flex items-center gap-1 pl-5">
            <span className="text-[9px] text-muted-foreground">
              Cierre: ↔ {edgeLength(vertices[vertices.length - 1], vertices[0]).toFixed(2)}m
            </span>
          </div>
        )}
      </div>

      <Button variant="outline" size="sm" className="h-5 text-[10px] gap-0.5" onClick={addVertex}>
        <Plus className="h-2.5 w-2.5" /> Vértice
      </Button>

      {/* Mini preview */}
      {vertices.length >= 3 && (
        <div className="flex justify-center pt-1">
          <PolygonPreview vertices={vertices} size={80} />
        </div>
      )}
    </div>
  );
}

// ─── Grid Polygon Drawer ─────────────────────────────────────────

interface OtherPolygon {
  id: string;
  name: string;
  vertices: PolygonVertex[];
  isBase?: boolean;
  walls?: WallData[];
}

interface RulerLine {
  start: PolygonVertex;
  end: PolygonVertex;
}

interface GridPolygonDrawerProps {
  vertices: PolygonVertex[];
  onChange: (vertices: PolygonVertex[]) => void;
  gridWidth?: number;
  gridHeight?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  placedRooms?: PlacedGridRoom[];
  cellSizeM?: number;
  otherPolygons?: OtherPolygon[];
  activeRoomId?: string | null;
  onSwitchRoom?: (roomId: string) => void;
  onOtherPolygonChange?: (id: string, vertices: PolygonVertex[]) => void;
  onOtherPolygonRename?: (id: string, newName: string) => void;
  onSelectOtherWorkspace?: (id: string | null) => void;
  perimeterPolygon?: PolygonVertex[];
  activeName?: string;
  originTopLeft?: boolean;
  pdfTitle?: string;
  pdfSubtitle?: string;
  onWallClick?: (wallIndex: number) => void;
  onWallSelect?: (wallIndex: number) => void;
  hAxisLabel?: string;
  vAxisLabel?: string;
  hScaleMm?: number;
  vScaleMm?: number;
  activeWalls?: WallData[];
  initialRulerLines?: RulerLine[];
  onSaveRulerLines?: (lines: RulerLine[]) => void;
  ridgeLine?: { x1: number; y1: number; x2: number; y2: number; z: number } | null;
  sectionType?: 'vertical' | 'longitudinal' | 'transversal';
  sectionAxisValue?: number;
}

const RULER_COLOR = 'hsl(30 90% 50%)';

const POLY_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210 70% 50%)',
  'hsl(30 80% 55%)',
  'hsl(280 60% 55%)',
];

function GridPolygonDrawer({ vertices, onChange, gridWidth = 20, gridHeight = 16, gridOffsetX = 0, gridOffsetY = 0, placedRooms = [], cellSizeM = 1, otherPolygons = [], activeRoomId, onSwitchRoom, onOtherPolygonChange, onOtherPolygonRename, onSelectOtherWorkspace, perimeterPolygon, activeName, originTopLeft = false, pdfTitle, pdfSubtitle, onWallClick, onWallSelect, hAxisLabel = 'X', vAxisLabel = 'Y', hScaleMm, vScaleMm, activeWalls = [], initialRulerLines = [], onSaveRulerLines, ridgeLine, sectionType, sectionAxisValue }: GridPolygonDrawerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const FIXED_ZOOM = 1;
  // Selected other polygon for inline editing
  const [selectedOtherId, setSelectedOtherId] = useState<string | null>(null);
  const [draggingOtherIdx, setDraggingOtherIdx] = useState<number | null>(null);
  const [editingOtherName, setEditingOtherName] = useState<string | null>(null);
  const [otherNameValue, setOtherNameValue] = useState('');
  // Local mutable copy of selected other polygon vertices for dragging
  const [otherEditVertices, setOtherEditVertices] = useState<PolygonVertex[]>([]);

  // Polygon is "closed" when it has >= 3 vertices and was explicitly closed by clicking first vertex
  const [isClosed, setIsClosed] = useState(() => vertices.length >= 3);

  // Ruler tool state
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerLines, setRulerLines] = useState<RulerLine[]>(initialRulerLines);
  const [rulerStart, setRulerStart] = useState<PolygonVertex | null>(null);
  // Ruler editing: dragging endpoint of existing ruler
  const [draggingRulerIdx, setDraggingRulerIdx] = useState<number | null>(null);
  const [draggingRulerEnd, setDraggingRulerEnd] = useState<'start' | 'end' | null>(null);
  // Free vertex mode — allows non-node placement
  const [freeMode, setFreeMode] = useState(false);
  // Magnet mode — snaps to nearest edge/vertex of other polygons
  const [magnetMode, setMagnetMode] = useState(false);
  const [magnetSnap, setMagnetSnap] = useState<{ x: number; y: number; label: string } | null>(null);
  // Select/pointer mode — disables drawing, allows precise element selection
  const [selectMode, setSelectMode] = useState(false);
  // Annotation display toggles: always show mm, optionally degrees and/or %
  const [showDegrees, setShowDegrees] = useState(false);
  const [showPercent, setShowPercent] = useState(false);
  // Context menu state for right-click on edge/vertex
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; type: 'edge' | 'vertex'; index: number } | null>(null);
  // Selected vertex for highlighting
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  // Numeric coordinate editing on double-click
  const [editingVertexIdx, setEditingVertexIdx] = useState<number | null>(null);
  const [editCoordX, setEditCoordX] = useState('');
  const [editCoordY, setEditCoordY] = useState('');
  // Long-press timer for context menu
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewContextKey = `${sectionType ?? 'none'}:${sectionAxisValue ?? 'na'}:${activeRoomId ?? 'draft'}`;

  // Cuadrícula con escala fija (zoom desactivado para evitar desbordes de vista)
  const baseCellSize = sectionType === 'vertical' ? 22 : 28;
  const pad = 30;
  // Compute aspect-correct cell dimensions based on axis scales
  const hMm = hScaleMm || 625;
  const vMm = vScaleMm || 625;
  const scaleRatio = vMm / hMm; // < 1 means vertical cells are shorter
  const baseCellW = baseCellSize;
  const baseCellH = Math.round(baseCellSize * scaleRatio);
  const logicalW = gridWidth * baseCellW + pad * 2;
  const logicalH = gridHeight * baseCellH + pad * 2;
  const cellW = Math.round(baseCellW * FIXED_ZOOM);
  const cellH = Math.round(baseCellH * FIXED_ZOOM);
  const svgW = gridWidth * cellW + pad * 2;
  const svgH = gridHeight * cellH + pad * 2;
  const isZoomed = false;

  const toSvg = (gx: number, gy: number) => ({
    sx: pad + (gx - gridOffsetX) * cellW,
    sy: originTopLeft
      ? pad + (gy - gridOffsetY) * cellH
      : pad + (gridHeight - (gy - gridOffsetY)) * cellH,
  });

  const fromSvg = (screenX: number, screenY: number) => {
    // When using viewBox (x1), screen coords differ from SVG coords — scale them
    let sx = screenX, sy = screenY;
    if (!isZoomed && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      sx = screenX * (logicalW / rect.width);
      sy = screenY * (logicalH / rect.height);
    }
    const rawX = (sx - pad) / cellW + gridOffsetX;
    const rawY = originTopLeft
      ? (sy - pad) / cellH + gridOffsetY
      : gridOffsetY + gridHeight - (sy - pad) / cellH;
    if (freeMode || magnetMode || rulerMode) {
      // Sub-grid precision: round to 0.1
      return {
        gx: Math.round(rawX * 10) / 10,
        gy: Math.round(rawY * 10) / 10,
      };
    }
    return {
      gx: Math.round(rawX),
      gy: Math.round(rawY),
    };
  };

  const handleClick = (gx: number, gy: number) => {
    // Select/pointer mode: detect closest vertex or edge
    if (selectMode) {
      setContextMenu(null);
      if (vertices.length >= 3) {
        // First check if clicking near a vertex (threshold 1.2 grid units)
        let bestVDist = Infinity;
        let bestVIdx = -1;
        for (let i = 0; i < vertices.length; i++) {
          const d = Math.sqrt((gx - vertices[i].x) ** 2 + (gy - vertices[i].y) ** 2);
          if (d < bestVDist) { bestVDist = d; bestVIdx = i; }
        }
        if (bestVIdx >= 0 && bestVDist < 1.2) {
          setSelectedVertexIdx(bestVIdx);
          return;
        }
        // Then check edges — click selects the wall (opens wall panel)
        let bestDist = Infinity;
        let bestIdx = -1;
        for (let i = 0; i < vertices.length; i++) {
          const j = (i + 1) % vertices.length;
          const a = vertices[i], b = vertices[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          let t = lenSq > 0 ? ((gx - a.x) * dx + (gy - a.y) * dy) / lenSq : 0;
          t = Math.max(0, Math.min(1, t));
          const px = a.x + t * dx, py = a.y + t * dy;
          const dist = Math.sqrt((gx - px) ** 2 + (gy - py) ** 2);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        if (bestIdx >= 0 && bestDist < 2) {
          // Select this wall — open wall panel
          const wallDbIdx = bestIdx === vertices.length - 1 ? vertices.length : bestIdx + 1;
          if (onWallSelect) {
            onWallSelect(wallDbIdx);
          }
          setSelectedVertexIdx(null);
        } else {
          setSelectedVertexIdx(null);
        }
      }
      return;
    }
    // Ruler mode: collect start/end points
    if (rulerMode) {
      if (!rulerStart) {
        setRulerStart({ x: gx, y: gy });
      } else {
        setRulerLines(prev => [...prev, { start: rulerStart, end: { x: gx, y: gy } }]);
        setRulerStart(null);
      }
      return;
    }
    if (isClosed) return; // In closed/edit mode, no new vertices
    // Close polygon by clicking first vertex
    if (vertices.length >= 3 && gx === vertices[0].x && gy === vertices[0].y) {
      setIsClosed(true);
      return;
    }
    // In free mode, allow same fractional positions
    if (!freeMode && vertices.some(v => v.x === gx && v.y === gy)) return;
    onChange([...vertices, { x: gx, y: gy }]);
  };

  const handleUndo = () => {
    if (isClosed) {
      // Reopen for drawing (remove last vertex)
      setIsClosed(false);
      onChange(vertices.slice(0, -1));
    } else if (vertices.length > 0) {
      onChange(vertices.slice(0, -1));
    }
  };

  const handleClear = () => {
    onChange([]);
    setIsClosed(false);
  };

  // Drag vertex handling
  const handleMouseDown = (idx: number, e: React.MouseEvent) => {
    if (!isClosed) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingIdx(idx);
  };

  // Helper: find closest point on a line segment to a point
  const closestPointOnSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: ax, y: ay, dist: Math.sqrt((px - ax) ** 2 + (py - ay) ** 2) };
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return { x: cx, y: cy, dist: Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) };
  };

  // Magnet: snap to nearest edge or vertex of all visible polygons
  const applyMagnetSnap = (gx: number, gy: number, excludeVertexIdx: number | null, isOther: boolean): { x: number; y: number; label: string } | null => {
    const MAGNET_THRESHOLD = 1.5; // grid units
    let bestDist = MAGNET_THRESHOLD;
    let bestPoint: { x: number; y: number; label: string } | null = null;

    // Collect all polygon vertex lists to check against
    const targets: { verts: PolygonVertex[]; name: string; isSelf: boolean }[] = [];
    if (!isOther && vertices.length >= 2) {
      targets.push({ verts: vertices, name: activeName || 'Actual', isSelf: true });
    }
    for (const op of otherPolygons) {
      if (isOther && op.id === selectedOtherId) continue;
      targets.push({ verts: op.vertices, name: op.name || 'Otro', isSelf: false });
    }
    if (isOther && vertices.length >= 2) {
      targets.push({ verts: vertices, name: activeName || 'Actual', isSelf: false });
    }
    // Also check perimeter polygon
    if (perimeterPolygon && perimeterPolygon.length >= 2) {
      targets.push({ verts: perimeterPolygon, name: 'Perímetro', isSelf: false });
    }

    for (const { verts, name, isSelf } of targets) {
      // Snap to vertices
      for (let i = 0; i < verts.length; i++) {
        if (isSelf && i === excludeVertexIdx) continue;
        const d = Math.sqrt((gx - verts[i].x) ** 2 + (gy - verts[i].y) ** 2);
        if (d < bestDist) {
          bestDist = d;
          bestPoint = { x: verts[i].x, y: verts[i].y, label: `V${i + 1} ${name}` };
        }
      }
      // Snap to edges (closest point on segment)
      const n = verts.length;
      if (n >= 2) {
        const closed = n >= 3;
        const edgeCount = closed ? n : n - 1;
        for (let i = 0; i < edgeCount; i++) {
          const j = (i + 1) % n;
          if (isSelf && (i === excludeVertexIdx || j === excludeVertexIdx)) continue;
          const cp = closestPointOnSegment(gx, gy, verts[i].x, verts[i].y, verts[j].x, verts[j].y);
          if (cp.dist < bestDist) {
            bestDist = cp.dist;
            // Round to 0.01 for precision
            const rx = Math.round(cp.x * 100) / 100;
            const ry = Math.round(cp.y * 100) / 100;
            bestPoint = { x: rx, y: ry, label: `P${i + 1}-${j + 1} ${name}` };
          }
        }
      }
    }
    return bestPoint;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const activeIdx = draggingIdx !== null ? draggingIdx : null;
    const otherIdx = draggingOtherIdx !== null ? draggingOtherIdx : null;
    const rulerDrag = draggingRulerIdx !== null;
    if (activeIdx === null && otherIdx === null && !rulerDrag) {
      if (magnetMode) setMagnetSnap(null);
      return;
    }
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { gx, gy } = fromSvg(sx, sy);
    // Clamp to grid bounds; in free mode allow fractional
    const clampX = (v: number) => Math.max(gridOffsetX, Math.min(gridOffsetX + gridWidth, v));
    const clampY = (v: number) => Math.max(gridOffsetY, Math.min(gridOffsetY + gridHeight, v));
    let snappedX = (freeMode || magnetMode || rulerDrag) ? clampX(Math.round(gx * 10) / 10) : clampX(gx);
    let snappedY = (freeMode || magnetMode || rulerDrag) ? clampY(Math.round(gy * 10) / 10) : clampY(gy);

    // Apply magnet snap if enabled
    if (magnetMode && !rulerDrag) {
      const snap = applyMagnetSnap(snappedX, snappedY, activeIdx, otherIdx !== null);
      if (snap) {
        snappedX = snap.x;
        snappedY = snap.y;
        setMagnetSnap(snap);
      } else {
        setMagnetSnap(null);
      }
    }

    if (rulerDrag && draggingRulerEnd) {
      setRulerLines(prev => prev.map((rl, i) => {
        if (i !== draggingRulerIdx) return rl;
        return draggingRulerEnd === 'start'
          ? { ...rl, start: { x: snappedX, y: snappedY } }
          : { ...rl, end: { x: snappedX, y: snappedY } };
      }));
      return;
    }
    if (activeIdx !== null) {
      if (snappedX !== vertices[activeIdx].x || snappedY !== vertices[activeIdx].y) {
        const next = [...vertices];
        next[activeIdx] = { x: snappedX, y: snappedY };
        onChange(next);
      }
    } else if (otherIdx !== null && selectedOtherId) {
      const cur = otherEditVertices;
      if (cur[otherIdx] && (snappedX !== cur[otherIdx].x || snappedY !== cur[otherIdx].y)) {
        const next = [...cur];
        next[otherIdx] = { x: snappedX, y: snappedY };
        setOtherEditVertices(next);
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingOtherIdx !== null && selectedOtherId && onOtherPolygonChange) {
      onOtherPolygonChange(selectedOtherId, otherEditVertices);
    }
    setDraggingIdx(null);
    setDraggingOtherIdx(null);
    setDraggingRulerIdx(null);
    setDraggingRulerEnd(null);
    setMagnetSnap(null);
  };

  // Select another polygon for inline editing
  const handleSelectOther = (op: OtherPolygon) => {
    if (selectedOtherId === op.id) {
      // Deselect
      setSelectedOtherId(null);
      setOtherEditVertices([]);
      onSelectOtherWorkspace?.(null);
    } else {
      setSelectedOtherId(op.id);
      setOtherEditVertices([...op.vertices]);
      onSelectOtherWorkspace?.(op.id);
    }
  };

  // Scale factors: if hScaleMm/vScaleMm are given, use them; otherwise uniform cellSizeM
  const hScale = hScaleMm ? hScaleMm / 1000 : cellSizeM; // meters per grid unit horizontal
  const vScale = vScaleMm ? vScaleMm / 1000 : cellSizeM; // meters per grid unit vertical
  const areaM2 = hScaleMm && vScaleMm
    ? polygonArea(vertices) * hScale * vScale
    : polygonArea(vertices) * cellSizeM * cellSizeM;
  const closingLen = vertices.length >= 3 ? Math.sqrt(
    ((vertices[vertices.length - 1].x - vertices[0].x) * hScale) ** 2 +
    ((vertices[vertices.length - 1].y - vertices[0].y) * vScale) ** 2
  ) : 0;

  // Check if hovering near first vertex (for close hint)
  const isNearFirst = !isClosed && vertices.length >= 3 && hoverCell && hoverCell.x === vertices[0].x && hoverCell.y === vertices[0].y;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold">
          {!isClosed
            ? vertices.length === 0
              ? 'Pulsa en las intersecciones para dibujar el polígono'
              : vertices.length < 3
                ? `Sigue añadiendo vértices (${vertices.length}/mín.3)`
                : 'Pulsa el primer vértice para cerrar el polígono'
            : 'Polígono cerrado — arrastra los vértices para editar'}
        </Label>
          {vertices.length >= 3 && (
          <Badge variant="secondary" className="text-[9px] h-4">📐 {areaM2.toFixed(2)} m²</Badge>
        )}
      </div>

      {/* Tools + PDF */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] text-muted-foreground">Herramientas:</span>
        <Button
          variant={selectMode ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          onClick={() => { setSelectMode(!selectMode); if (!selectMode) { setRulerMode(false); setFreeMode(false); setRulerStart(null); } }}
        >
          🔍 Puntero
        </Button>
        <Button
          variant={rulerMode ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          style={rulerMode ? { backgroundColor: 'hsl(30 90% 50%)', borderColor: 'hsl(30 90% 50%)' } : {}}
          onClick={() => { setRulerMode(!rulerMode); setRulerStart(null); if (!rulerMode) setSelectMode(false); }}
        >
          📏 Regla
        </Button>
        <Button
          variant={freeMode ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          onClick={() => { setFreeMode(!freeMode); if (!freeMode) setSelectMode(false); }}
        >
          🎯 Libre
        </Button>
        <Button
          variant={magnetMode ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          style={magnetMode ? { backgroundColor: 'hsl(280 70% 50%)', borderColor: 'hsl(280 70% 50%)' } : {}}
          onClick={() => { setMagnetMode(!magnetMode); if (!magnetMode) setSelectMode(false); }}
        >
          🧲 Imán
        </Button>
        {rulerLines.length > 0 && (
          <>
            {onSaveRulerLines && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-2 text-green-600 hover:text-green-700"
                onClick={() => { onSaveRulerLines(rulerLines); toast.success(`${rulerLines.length} regla(s) guardada(s)`); }}
              >
                💾 Guardar reglas
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-2"
              onClick={() => { setRulerLines([]); setRulerStart(null); }}
            >
              Borrar reglas ({rulerLines.length})
            </Button>
          </>
        )}
        <span className="text-[9px] text-muted-foreground ml-2">Cotas:</span>
        <Button
          variant={showDegrees ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          onClick={() => setShowDegrees(!showDegrees)}
        >
          📐 º
        </Button>
        <Button
          variant={showPercent ? 'default' : 'outline'}
          size="sm"
          className="h-5 text-[10px] px-2 gap-0.5"
          onClick={() => setShowPercent(!showPercent)}
        >
          📊 %
        </Button>
        {pdfTitle && (
          <GridPdfExport
            title={pdfTitle}
            subtitle={pdfSubtitle || activeName || 'Espacio'}
            containerRef={gridContainerRef}
            size="sm"
          />
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <Badge variant={isClosed ? 'default' : 'outline'} className="text-[9px] h-4 gap-0.5">
          {isClosed ? '✅ Cerrado' : selectMode ? '🔍 Puntero' : rulerMode ? '📏 Regla' : '⏳ Abierto'}
        </Badge>
        <span className="text-[9px] text-muted-foreground">
          {vertices.length} vértice{vertices.length !== 1 ? 's' : ''}
          {freeMode && ' · modo libre'}
          {rulerStart && ' · pulsa 2º punto de la regla'}
        </span>
      </div>

      {/* Legend for other polygons — with inline editing */}
      {otherPolygons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] text-muted-foreground">Espacios:</span>
          {otherPolygons.map((op) => {
            const isSelected = selectedOtherId === op.id;
            const isEditingName = editingOtherName === op.id;
            return (
              <span key={op.id} className="inline-flex items-center gap-0.5">
                {isEditingName ? (
                  <span className="inline-flex items-center gap-0.5">
                    <input
                      className="h-5 w-20 text-[9px] px-1 border rounded bg-background"
                      value={otherNameValue}
                      onChange={(e) => setOtherNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && otherNameValue.trim()) {
                          onOtherPolygonRename?.(op.id, otherNameValue.trim());
                          setEditingOtherName(null);
                        } else if (e.key === 'Escape') {
                          setEditingOtherName(null);
                        }
                      }}
                      autoFocus
                    />
                    <button className="text-[9px] text-primary hover:underline" onClick={() => {
                      if (otherNameValue.trim()) onOtherPolygonRename?.(op.id, otherNameValue.trim());
                      setEditingOtherName(null);
                    }}>✓</button>
                    <button className="text-[9px] text-muted-foreground hover:underline" onClick={() => setEditingOtherName(null)}>✕</button>
                  </span>
                ) : (
                  <button
                    className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition-colors ${isSelected ? 'bg-accent border-primary font-semibold' : 'hover:bg-accent/50'}`}
                    style={{ borderColor: isSelected ? undefined : 'hsl(200 80% 50%)' }}
                    onClick={() => handleSelectOther(op)}
                    title={`Seleccionar ${op.name} para editar`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isSelected ? 'hsl(var(--primary))' : 'hsl(200 80% 50%)' }} />
                    {op.name}
                  </button>
                )}
                {isSelected && !isEditingName && (
                  <>
                    <button
                      className="text-[9px] text-muted-foreground hover:text-primary px-0.5"
                      title="Renombrar"
                      onClick={() => { setEditingOtherName(op.id); setOtherNameValue(op.name); }}
                    >✏️</button>
                    <button
                      className="text-[9px] text-muted-foreground hover:text-primary px-0.5"
                      title="Ir al espacio"
                      onClick={() => onSwitchRoom?.(op.id)}
                    >↗</button>
                  </>
                )}
              </span>
            );
          })}
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-primary bg-primary/10 font-semibold">
            <span className="w-2 h-2 rounded-full shrink-0 bg-primary" />
            {activeName || 'Editando'}
          </span>
        </div>
      )}

      <div ref={gridContainerRef} className={`rounded border bg-background ${isZoomed ? 'overflow-auto max-h-[70vh]' : 'overflow-hidden'}`}>
        <svg
          key={`${viewContextKey}-${isZoomed ? 'zoomed' : 'fit'}`}
          ref={svgRef}
          {...(isZoomed
            ? { width: svgW, height: svgH, style: { minWidth: svgW, cursor: draggingIdx !== null ? 'grabbing' : undefined } }
            : { viewBox: `0 0 ${logicalW} ${logicalH}`, style: { width: '100%', height: 'auto', cursor: draggingIdx !== null ? 'grabbing' : undefined } }
          )}
          className="block"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid cells — checkerboard */}
          {Array.from({ length: gridHeight }).map((_, row) =>
            Array.from({ length: gridWidth }).map((_, col) => {
              const gx = col + gridOffsetX;
              const gy = originTopLeft
                ? row + gridOffsetY
                : gridOffsetY + gridHeight - row - 1;
              const { sx, sy } = toSvg(gx, gy);
              const isEven = (col + row) % 2 === 0;
              return (
                <rect
                  key={`c-${col}-${row}`}
                  x={sx}
                  y={originTopLeft ? sy : sy - cellH}
                  width={cellW}
                  height={cellH}
                  fill={isEven ? 'hsl(var(--muted))' : 'hsl(var(--background))'}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                />
              );
            })
          )}

          {/* Perimeter polygon from the section — outline only, no vertex labels */}
          {perimeterPolygon && perimeterPolygon.length >= 3 && (
            <polygon
              points={perimeterPolygon.map(v => { const { sx, sy } = toSvg(v.x, v.y); return `${sx},${sy}`; }).join(' ')}
              fill="hsl(var(--primary) / 0.04)"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              className="pointer-events-none"
            />
          )}
          {/* Perimeter vertex dots only (no coordinate labels to avoid visual clutter) */}
          {perimeterPolygon && perimeterPolygon.map((v, i) => {
            const { sx, sy } = toSvg(v.x, v.y);
            return (
              <circle key={`pv-${i}`} cx={sx} cy={sy} r={3} fill="hsl(var(--primary))" opacity={0.4} className="pointer-events-none" />
            );
          })}

          {/* Placed rooms from the floor plan grid (background context) — exclude rooms already shown as polygons */}
          {placedRooms
            .filter(pr => {
              // Skip rooms that are rendered as otherPolygons or active polygon
              if (activeRoomId === pr.id) return false;
              if (otherPolygons.some(op => op.id === pr.id)) return false;
              return true;
            })
            .map(pr => {
            const startGx = Math.round(pr.pos_x / cellSizeM);
            const startGy = Math.round(pr.pos_y / cellSizeM);
            const spanW = Math.max(1, Math.round(pr.width / cellSizeM));
            const spanH = Math.max(1, Math.round(pr.length / cellSizeM));
            const { sx: rx, sy: ry } = originTopLeft
              ? toSvg(startGx, startGy)
              : toSvg(startGx, startGy + spanH);
            const rectY = originTopLeft ? ry : ry - cellH;
            return (
              <g key={`pr-${pr.id}`}>
                <rect
                  x={rx}
                  y={rectY}
                  width={spanW * cellW}
                  height={spanH * cellH}
                  fill="hsl(var(--accent) / 0.25)"
                  stroke="hsl(var(--accent-foreground) / 0.4)"
                  strokeWidth={1}
                  rx={2}
                />
                <text
                  x={rx + (spanW * cellW) / 2}
                  y={rectY + (spanH * cellH) / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[7px] fill-accent-foreground font-medium select-none pointer-events-none"
                  opacity={0.6}
                >
                  {pr.name}
                </text>
              </g>
            );
          })}
          {/* X axis labels — TOP (outside grid) */}
          {Array.from({ length: gridWidth + 1 }).map((_, i) => {
            const gx = i + gridOffsetX;
            const { sx } = toSvg(gx, gridOffsetY);
            return (
              <text key={`xt-${i}`} x={sx} y={pad - 6} textAnchor="middle"
                fill="rgba(192,57,43,0.85)" fontSize={9} fontWeight="bold" className="select-none">
                {hAxisLabel}{gx}
              </text>
            );
          })}
          {/* X axis labels — BOTTOM (outside grid) */}
          {Array.from({ length: gridWidth + 1 }).map((_, i) => {
            const gx = i + gridOffsetX;
            const { sx } = toSvg(gx, gridOffsetY);
            return (
              <text key={`xb-${i}`} x={sx} y={pad + gridHeight * cellH + 14} textAnchor="middle"
                fill="rgba(192,57,43,0.85)" fontSize={9} fontWeight="bold" className="select-none">
                {hAxisLabel}{gx}
              </text>
            );
          })}

          {/* Y axis labels — LEFT (outside grid) */}
          {Array.from({ length: gridHeight + 1 }).map((_, i) => {
            const gy = i + gridOffsetY;
            const { sy } = toSvg(gridOffsetX, gy);
            return (
              <text key={`yl-${i}`} x={pad - 8} y={sy + 3} textAnchor="end"
                fill="rgba(39,174,96,0.85)" fontSize={8} fontWeight="bold" className="select-none">
                {vAxisLabel}{gy}
              </text>
            );
          })}
          {/* Y axis labels — RIGHT (outside grid) */}
          {Array.from({ length: gridHeight + 1 }).map((_, i) => {
            const gy = i + gridOffsetY;
            const { sy } = toSvg(gridOffsetX, gy);
            return (
              <text key={`yr-${i}`} x={pad + gridWidth * cellW + 8} y={sy + 3} textAnchor="start"
                fill="rgba(39,174,96,0.85)" fontSize={8} fontWeight="bold" className="select-none">
                {vAxisLabel}{gy}
              </text>
            );
          })}

          {/* ── Other rooms' polygons (background, clickable) with edge measurements — base first ── */}
          {[...otherPolygons].sort((a, b) => (b.isBase ? 1 : 0) - (a.isBase ? 1 : 0)).map((op) => {
            const isSelected = selectedOtherId === op.id;
            const verts = isSelected ? otherEditVertices : op.vertices;
            if (verts.length < 3) return null;
            const areaVal = polygonArea(verts) * (hScaleMm && vScaleMm ? hScale * vScale : cellSizeM * cellSizeM);
            const opEdges: Array<{ a: PolygonVertex; b: PolygonVertex }> = [];
            for (let i = 1; i < verts.length; i++) opEdges.push({ a: verts[i - 1], b: verts[i] });
            opEdges.push({ a: verts[verts.length - 1], b: verts[0] });
            const opCx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
            const opCy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
            const isBaseWs = !!op.isBase;
            const strokeColor = isBaseWs ? 'hsl(var(--muted-foreground) / 0.25)' : isSelected ? 'hsl(var(--primary))' : 'hsl(200 80% 50%)';
            const fillColor = isBaseWs ? 'hsl(var(--muted-foreground) / 0.06)' : isSelected ? 'hsl(var(--primary) / 0.18)' : 'hsl(200 80% 50% / 0.12)';
            const opWalls = op.walls || [];
            return (
              <g key={`other-${op.id}`} className="cursor-pointer" onClick={() => handleSelectOther(op)}>
                <polygon
                  points={verts.map(v => { const { sx, sy } = toSvg(v.x, v.y); return `${sx},${sy}`; }).join(' ')}
                  fill={fillColor}
                  stroke="none"
                />
                {/* Per-edge wall-type styled lines */}
                {opEdges.map(({ a: ea, b: eb }, ei) => {
                  const { sx: lx1, sy: ly1 } = toSvg(ea.x, ea.y);
                  const { sx: lx2, sy: ly2 } = toSvg(eb.x, eb.y);
                  const dbIdx = ei + 1;
                  const wt = normalizeWallType(opWalls.find(w => w.wall_index === dbIdx)?.wall_type);
                  const ws = WALL_EDGE_STYLES[wt] || WALL_EDGE_DEFAULT;
                  const edgeColor = isBaseWs ? 'hsl(var(--muted-foreground) / 0.25)' : isSelected ? 'hsl(var(--primary))' : ws.color;
                  const edgeWidth = isBaseWs ? 1 : isSelected ? 2.5 : ws.width;
                  const edgeDash = isBaseWs ? '4 2' : isSelected ? 'none' : ws.dash;
                  return <line key={`oe-line-${op.id}-${ei}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                    stroke={edgeColor} strokeWidth={edgeWidth} strokeDasharray={edgeDash} />;
                })}
                {/* Vertices: draggable when selected, static otherwise */}
                {verts.map((v, i) => {
                  const { sx, sy } = toSvg(v.x, v.y);
                  if (isSelected) {
                    const isDragging = draggingOtherIdx === i;
                    return (
                      <g key={`ov-${op.id}-${i}`}>
                        <circle
                          cx={sx} cy={sy} r={isDragging ? 7 : 6}
                          fill={isDragging ? 'hsl(var(--chart-2))' : strokeColor}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                          className="cursor-grab active:cursor-grabbing"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingOtherIdx(i); }}
                        />
                        <text x={sx} y={sy - 9} textAnchor="middle"
                          className="text-[7px] font-bold select-none pointer-events-none"
                          fill={strokeColor}>
                          {i + 1} ({hAxisLabel}{v.x},{vAxisLabel}{v.y})
                        </text>
                      </g>
                    );
                  }
                  return (
                    <circle key={`ov-${op.id}-${i}`} cx={sx} cy={sy} r={3}
                      fill="hsl(200 80% 50%)" opacity={0.7} />
                  );
                })}
                {/* Edge measurements */}
                {opEdges.map(({ a, b }, ei) => {
                  const { sx: ex1, sy: ey1 } = toSvg(a.x, a.y);
                  const { sx: ex2, sy: ey2 } = toSvg(b.x, b.y);
                  const eLenMm = Math.round(Math.sqrt(((b.x - a.x) * hScale) ** 2 + ((b.y - a.y) * vScale) ** 2) * 1000);
                  const emx = (ex1 + ex2) / 2;
                  const emy = (ey1 + ey2) / 2;
                  const edx = ex2 - ex1;
                  const edy = ey2 - ey1;
                  const eLen = Math.sqrt(edx * edx + edy * edy) || 1;
                  let enx = -edy / eLen;
                  let eny = edx / eLen;
                  const { sx: ocsx, sy: ocsy } = toSvg(opCx, opCy);
                  if (((ocsx - emx) * enx + (ocsy - emy) * eny) > 0) { enx = -enx; eny = -eny; }
                  const eAngle = Math.atan2(edy, edx) * (180 / Math.PI);
                  const eRot = (eAngle > 90 || eAngle < -90) ? eAngle + 180 : eAngle;
                  const wallOff = 10;
                  const wmx = emx + enx * wallOff;
                  const wmy = emy + eny * wallOff;
                  const slopeStr = edgeSlopeInfo(a, b, hScale, vScale, showDegrees, showPercent);
                  const labelText = slopeStr ? `${eLenMm} mm · ${slopeStr}` : `${eLenMm} mm`;
                  return (
                    <text key={`oe-${op.id}-${ei}`} x={wmx} y={wmy} textAnchor="middle" dominantBaseline="central"
                      transform={`rotate(${eRot}, ${wmx}, ${wmy})`}
                      className="text-[6px] font-semibold select-none pointer-events-none"
                      fill={isSelected ? 'hsl(var(--primary) / 0.8)' : 'hsl(200 80% 50% / 0.8)'}>
                      {labelText}
                    </text>
                  );
                })}
                {/* Wall number badges on sibling polygon edges */}
                {!isBaseWs && opEdges.map(({ a: ea, b: eb }, ei) => {
                  const { sx: lx1, sy: ly1 } = toSvg(ea.x, ea.y);
                  const { sx: lx2, sy: ly2 } = toSvg(eb.x, eb.y);
                  const emx2 = (lx1 + lx2) / 2;
                  const emy2 = (ly1 + ly2) / 2;
                  const edx2 = lx2 - lx1;
                  const edy2 = ly2 - ly1;
                  const eLen2 = Math.sqrt(edx2 * edx2 + edy2 * edy2) || 1;
                  let enx2 = edy2 / eLen2;
                  let eny2 = -edx2 / eLen2;
                  const { sx: ocsx2, sy: ocsy2 } = toSvg(opCx, opCy);
                  if (((ocsx2 - emx2) * enx2 + (ocsy2 - emy2) * eny2) > 0) { enx2 = -enx2; eny2 = -eny2; }
                  const badgeOff2 = -6;
                  const bx2 = emx2 + enx2 * badgeOff2;
                  const by2 = emy2 + eny2 * badgeOff2;
                  const dbIdx2 = ei + 1;
                  const wt2 = normalizeWallType(opWalls.find(w => w.wall_index === dbIdx2)?.wall_type);
                  const ws2 = WALL_EDGE_STYLES[wt2] || WALL_EDGE_DEFAULT;
                  const badgeColor = isSelected ? 'hsl(var(--primary))' : ws2.color;
                  return (
                    <g key={`op-badge-${op.id}-${ei}`} className="pointer-events-none">
                      <circle cx={bx2} cy={by2} r={7}
                        fill={badgeColor} opacity={0.85}
                        stroke="hsl(var(--background))" strokeWidth={1} />
                      <text x={bx2} y={by2} textAnchor="middle" dominantBaseline="central"
                        className="text-[6px] font-bold select-none"
                        fill="hsl(var(--background))">
                        {dbIdx2}
                      </text>
                    </g>
                  );
                })}
                {(() => {
                  const { sx, sy } = toSvg(opCx, opCy);
                  return (
                    <>
                      <text x={sx} y={sy - 5} textAnchor="middle" dominantBaseline="central"
                        className="text-[8px] font-semibold select-none pointer-events-none"
                        fill={strokeColor}>
                        {op.name}
                      </text>
                      <text x={sx} y={sy + 7} textAnchor="middle" dominantBaseline="central"
                        className="text-[7px] select-none pointer-events-none"
                        fill={strokeColor} opacity={0.8}>
                        {areaVal.toFixed(2)} m²
                      </text>
                    </>
                  );
                })()}
              </g>
            );
          })}

          {/* Filled polygon preview + name/area label */}
           {vertices.length >= 3 && (() => {
            const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
            const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
            const { sx: labelSx, sy: labelSy } = toSvg(cx, cy);
            return (
              <>
                <polygon
                  points={vertices.map(v => { const { sx, sy } = toSvg(v.x, v.y); return `${sx},${sy}`; }).join(' ')}
                  fill={isClosed ? 'hsl(200 80% 50% / 0.10)' : 'hsl(200 80% 50% / 0.05)'}
                  stroke="none"
                  className="pointer-events-none"
                />
                {activeName && (
                  <>
                    <text x={labelSx} y={labelSy - 5} textAnchor="middle" dominantBaseline="central"
                      className="text-[8px] font-semibold select-none pointer-events-none"
                      fill="hsl(200 80% 50%)">
                      {activeName}
                    </text>
                    <text x={labelSx} y={labelSy + 7} textAnchor="middle" dominantBaseline="central"
                      className="text-[7px] select-none pointer-events-none"
                      fill="hsl(200 80% 50%)" opacity={0.8}>
                      {areaM2.toFixed(2)} m²
                    </text>
                  </>
                )}
              </>
            );
           })()}

          {/* ── Edges + dual dimension system ── */}
          {(() => {
            // Build all edges (including closing edge)
            const allEdges: Array<{ a: PolygonVertex; b: PolygonVertex; idx: number }> = [];
            for (let i = 1; i < vertices.length; i++) {
              allEdges.push({ a: vertices[i - 1], b: vertices[i], idx: i });
            }
            if (vertices.length >= 3) {
              allEdges.push({ a: vertices[vertices.length - 1], b: vertices[0], idx: 0 });
            }

            // Centroid for outward normal direction
            const centX = vertices.length > 0 ? vertices.reduce((s, v) => s + v.x, 0) / vertices.length : 0;
            const centY = vertices.length > 0 ? vertices.reduce((s, v) => s + v.y, 0) / vertices.length : 0;

            return allEdges.map(({ a, b, idx }) => {
              const { sx: x1, sy: y1 } = toSvg(a.x, a.y);
              const { sx: x2, sy: y2 } = toSvg(b.x, b.y);
              const lenMm = Math.round(Math.sqrt(((b.x - a.x) * hScale) ** 2 + ((b.y - a.y) * vScale) ** 2) * 1000);
              const isClosing = idx === 0 && allEdges.length > 1 && a === vertices[vertices.length - 1];
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              // Outward normal (perpendicular away from centroid)
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              // Normal candidates: (-dy, dx) or (dy, -dx)
              let nx = -dy / len;
              let ny = dx / len;
              // Check if this normal points outward (away from centroid)
              const { sx: csx, sy: csy } = toSvg(centX, centY);
              const toCenter = (csx - mx) * nx + (csy - my) * ny;
              if (toCenter > 0) { nx = -nx; ny = -ny; }

              // Rotation for labels on non-horizontal edges
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              const rotAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

              // Outer dimension line (arista) - further from wall (28px offset)
              const outerOff = 28;
              const ox1 = x1 + nx * outerOff;
              const oy1 = y1 + ny * outerOff;
              const ox2 = x2 + nx * outerOff;
              const oy2 = y2 + ny * outerOff;
              const omx = (ox1 + ox2) / 2;
              const omy = (oy1 + oy2) / 2;

              // Inner wall label - closer to wall (10px offset)
              const innerOff = 10;
              const imx = mx + nx * innerOff;
              const imy = my + ny * innerOff;

              // Wall type style
              const wallDbIdx = idx === 0 ? vertices.length : idx;
              const activeWt = normalizeWallType(activeWalls.find(w => w.wall_index === wallDbIdx)?.wall_type);
              const activeWs = WALL_EDGE_STYLES[activeWt] || WALL_EDGE_DEFAULT;

              return (
                <g key={`edge-${idx}-${a.x}-${a.y}`}>
                  {/* Edge line — styled by wall type */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isClosing && !isClosed ? 'hsl(200 80% 50% / 0.5)' : activeWs.color}
                    strokeWidth={isClosing && !isClosed ? 1.5 : activeWs.width}
                    strokeDasharray={isClosing && !isClosed ? '4 3' : activeWs.dash} />

                  {/* Outer arista dimension line with ticks */}
                  {isClosed && (
                    <>
                      <line x1={ox1} y1={oy1} x2={ox2} y2={oy2}
                        stroke="hsl(var(--muted-foreground))" strokeWidth={0.7} />
                      {/* Tick marks */}
                      <line x1={x1 + nx * (outerOff - 4)} y1={y1 + ny * (outerOff - 4)}
                        x2={x1 + nx * (outerOff + 4)} y2={y1 + ny * (outerOff + 4)}
                        stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
                      <line x1={x2 + nx * (outerOff - 4)} y1={y2 + ny * (outerOff - 4)}
                        x2={x2 + nx * (outerOff + 4)} y2={y2 + ny * (outerOff + 4)}
                        stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
                      {/* Extension lines */}
                      <line x1={x1} y1={y1} x2={x1 + nx * (outerOff + 4)} y2={y1 + ny * (outerOff + 4)}
                        stroke="hsl(var(--muted-foreground) / 0.3)" strokeWidth={0.4} />
                      <line x1={x2} y1={y2} x2={x2 + nx * (outerOff + 4)} y2={y2 + ny * (outerOff + 4)}
                        stroke="hsl(var(--muted-foreground) / 0.3)" strokeWidth={0.4} />
                      {/* Arista label */}
                      <text x={omx + nx * 6} y={omy + ny * 6} textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(${rotAngle}, ${omx + nx * 6}, ${omy + ny * 6})`}
                        className="text-[6px] font-bold select-none pointer-events-none"
                        fill="hsl(var(--muted-foreground))">
                        {lenMm} mm{(() => { const s = edgeSlopeInfo(a, b, hScale, vScale, showDegrees, showPercent); return s ? ` · ${s}` : ''; })()}
                      </text>
                    </>
                  )}

                  {/* Inner wall label (closer to wall) — color matches wall type */}
                  <text x={imx} y={imy} textAnchor="middle" dominantBaseline="central"
                    transform={`rotate(${rotAngle}, ${imx}, ${imy})`}
                    className="text-[7px] font-semibold select-none pointer-events-none"
                    fill={activeWs.color}>
                    {lenMm} mm{(() => { const s = edgeSlopeInfo(a, b, hScale, vScale, showDegrees, showPercent); return s ? ` · ${s}` : ''; })()}
                  </text>

                  {/* Wall number badge on edge midpoint */}
                  {isClosed && (() => {
                    const badgeR = 8;
                    // Position badge slightly inward from the edge center
                    const badgeOff = -6;
                    const bx = mx + nx * badgeOff;
                    const by = my + ny * badgeOff;
                    const wallTypeLabel = WALL_TYPES.find(t => t.value === activeWt)?.label || activeWt;
                    return (
                      <g className={selectMode ? 'cursor-pointer' : 'pointer-events-none'}
                        onClick={selectMode && onWallSelect ? (e) => { e.stopPropagation(); onWallSelect(wallDbIdx); } : undefined}>
                        <circle cx={bx} cy={by} r={badgeR}
                          fill={activeWs.color} opacity={0.9}
                          stroke="hsl(var(--background))" strokeWidth={1.5} />
                        <text x={bx} y={by} textAnchor="middle" dominantBaseline="central"
                          className="text-[7px] font-bold select-none"
                          fill="hsl(var(--background))">
                          {wallDbIdx}
                        </text>
                        {/* Invisible larger hitbox for easier clicking */}
                        {selectMode && (
                          <circle cx={bx} cy={by} r={badgeR + 6} fill="transparent" />
                        )}
                      </g>
                    );
                  })()}
                </g>
              );
            });
          })()}

          {/* ── Ruler lines ── */}
          {rulerLines.map((rl, ri) => {
            const { sx: rx1, sy: ry1 } = toSvg(rl.start.x, rl.start.y);
            const { sx: rx2, sy: ry2 } = toSvg(rl.end.x, rl.end.y);
            const rLenMm = Math.round(Math.sqrt(((rl.end.x - rl.start.x) * hScale) ** 2 + ((rl.end.y - rl.start.y) * vScale) ** 2) * 1000);
            const rmx = (rx1 + rx2) / 2;
            const rmy = (ry1 + ry2) / 2;
            const rdx = rx2 - rx1;
            const rdy = ry2 - ry1;
            const rAngle = Math.atan2(rdy, rdx) * (180 / Math.PI);
            const rRot = (rAngle > 90 || rAngle < -90) ? rAngle + 180 : rAngle;
            return (
              <g key={`ruler-${ri}`}>
                <line x1={rx1} y1={ry1} x2={rx2} y2={ry2}
                  stroke={RULER_COLOR} strokeWidth={1.5} strokeDasharray="6 3" className="pointer-events-none" />
                {/* Draggable start endpoint */}
                <circle cx={rx1} cy={ry1} r={5} fill={RULER_COLOR} stroke="hsl(var(--background))" strokeWidth={1.5}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingRulerIdx(ri); setDraggingRulerEnd('start'); }} />
                {/* Draggable end endpoint */}
                <circle cx={rx2} cy={ry2} r={5} fill={RULER_COLOR} stroke="hsl(var(--background))" strokeWidth={1.5}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingRulerIdx(ri); setDraggingRulerEnd('end'); }} />
                {/* Delete ruler button */}
                <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setRulerLines(prev => prev.filter((_, i) => i !== ri)); }}>
                  <circle cx={rmx} cy={rmy + 12} r={6} fill="hsl(var(--destructive))" opacity={0.8} />
                  <text x={rmx} y={rmy + 12} textAnchor="middle" dominantBaseline="central"
                    fill="hsl(var(--destructive-foreground))" fontSize={8} fontWeight="bold" className="select-none">✕</text>
                </g>
                <text x={rmx} y={rmy - 8} textAnchor="middle" dominantBaseline="central"
                  transform={`rotate(${rRot}, ${rmx}, ${rmy - 8})`}
                  fill={RULER_COLOR} fontSize={8} fontWeight="bold" className="select-none pointer-events-none">
                  {rLenMm} mm{(() => { const s = edgeSlopeInfo(rl.start, rl.end, hScale, vScale, showDegrees, showPercent); return s ? ` · ${s}` : ''; })()}
                </text>
              </g>
            );
          })}
          {/* Ruler start point preview */}
          {rulerMode && rulerStart && (() => {
            const { sx, sy } = toSvg(rulerStart.x, rulerStart.y);
            const hEnd = hoverCell ? toSvg(hoverCell.x, hoverCell.y) : null;
            const previewLenMm = hEnd ? Math.round(Math.sqrt(((hoverCell!.x - rulerStart.x) * hScale) ** 2 + ((hoverCell!.y - rulerStart.y) * vScale) ** 2) * 1000) : 0;
            const pmx = hEnd ? (sx + hEnd.sx) / 2 : 0;
            const pmy = hEnd ? (sy + hEnd.sy) / 2 : 0;
            const pAngle = hEnd ? Math.atan2(hEnd.sy - sy, hEnd.sx - sx) * (180 / Math.PI) : 0;
            const pRot = (pAngle > 90 || pAngle < -90) ? pAngle + 180 : pAngle;
            return (
              <>
                {/* Magnifier lens on ruler start point */}
                <circle cx={sx} cy={sy} r={18} fill="none" stroke={RULER_COLOR} strokeWidth={1} opacity={0.4} className="pointer-events-none" />
                <circle cx={sx} cy={sy} r={5} fill={RULER_COLOR} stroke="hsl(var(--background))" strokeWidth={2} />
                <text x={sx} y={sy - 22} textAnchor="middle" dominantBaseline="central"
                  fill={RULER_COLOR} fontSize={7} fontWeight="bold" className="select-none pointer-events-none">
                  ({hAxisLabel}{rulerStart.x}, {vAxisLabel}{rulerStart.y})
                </text>
                {hEnd && (
                  <>
                    <line
                      x1={sx} y1={sy}
                      x2={hEnd.sx} y2={hEnd.sy}
                      stroke={RULER_COLOR} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
                    {/* Magnifier lens on hover/destination point */}
                    <circle cx={hEnd.sx} cy={hEnd.sy} r={18} fill="none" stroke={RULER_COLOR} strokeWidth={1} opacity={0.3} className="pointer-events-none" />
                    <circle cx={hEnd.sx} cy={hEnd.sy} r={3} fill={RULER_COLOR} opacity={0.5} />
                    <text x={hEnd.sx} y={hEnd.sy - 22} textAnchor="middle" dominantBaseline="central"
                      fill={RULER_COLOR} fontSize={7} fontWeight="bold" opacity={0.7} className="select-none pointer-events-none">
                      ({hAxisLabel}{hoverCell!.x}, {vAxisLabel}{hoverCell!.y})
                    </text>
                    {previewLenMm > 0 && (
                      <text x={pmx} y={pmy - 8} textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(${pRot}, ${pmx}, ${pmy - 8})`}
                        fill={RULER_COLOR} fontSize={8} fontWeight="bold" opacity={0.7} className="select-none pointer-events-none">
                        {previewLenMm} mm{(() => { const s = edgeSlopeInfo(rulerStart, hoverCell!, hScale, vScale, showDegrees, showPercent); return s ? ` · ${s}` : ''; })()}
                      </text>
                    )}
                  </>
                )}
              </>
            );
          })()}

          {/* Preview line from last vertex to hover (only while drawing, not ruler mode) */}
          {!isClosed && !rulerMode && vertices.length > 0 && hoverCell && (() => {
            const last = vertices[vertices.length - 1];
            const { sx: x1, sy: y1 } = toSvg(last.x, last.y);
            const { sx: x2, sy: y2 } = toSvg(hoverCell.x, hoverCell.y);
            return (
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(200 80% 50% / 0.3)" strokeWidth={1} strokeDasharray="3 3" />
            );
          })()}

          {/* Clickable intersections (drawing mode, grid snap) */}
          {!isClosed && !freeMode && !rulerMode && Array.from({ length: gridHeight + 1 }).map((_, iy) =>
            Array.from({ length: gridWidth + 1 }).map((_, ix) => {
              const gx = ix + gridOffsetX;
              const gy = iy + gridOffsetY;
              const { sx, sy } = toSvg(gx, gy);
              const isPlaced = vertices.some(v => v.x === gx && v.y === gy);
              const isHover = hoverCell?.x === gx && hoverCell?.y === gy;
              const isFirstClose = isNearFirst && gx === vertices[0].x && gy === vertices[0].y;
              // Skip if a selected sibling vertex occupies this position
              const sibVertexHere = selectedOtherId && otherEditVertices.some(v => v.x === gx && v.y === gy);
              if (sibVertexHere) return null;
              return (
                <g key={`pt-${gx}-${gy}`}>
                  <circle
                    cx={sx} cy={sy}
                    r={isPlaced ? 5 : isFirstClose ? 6 : isHover ? 4 : 2}
                    fill={isPlaced ? 'hsl(200 80% 50%)' : isFirstClose ? 'hsl(var(--chart-2))' : isHover ? 'hsl(200 80% 50% / 0.4)' : 'hsl(var(--muted-foreground) / 0.25)'}
                    stroke={isFirstClose ? 'hsl(var(--chart-2))' : 'none'}
                    strokeWidth={isFirstClose ? 2.5 : 0}
                    className="cursor-pointer"
                    onClick={() => handleClick(gx, gy)}
                    onMouseEnter={() => setHoverCell({ x: gx, y: gy })}
                    onMouseLeave={() => setHoverCell(null)}
                  />
                  {isPlaced && (
                    <text x={sx} y={sy - 7} textAnchor="middle"
                      className="text-[7px] font-bold select-none pointer-events-none"
                      fill="hsl(200 80% 50%)">
                      {vertices.findIndex(v => v.x === gx && v.y === gy) + 1}
                    </text>
                  )}
                  {isFirstClose && (
                    <text x={sx} y={sy + 14} textAnchor="middle"
                      className="text-[7px] fill-chart-2 font-bold select-none pointer-events-none">
                      Cerrar
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Select/pointer mode: transparent overlay for clicking on walls/edges */}
          {selectMode && isClosed && vertices.length >= 3 && (
            <rect
              x={pad}
              y={pad}
              width={gridWidth * cellW}
              height={gridHeight * cellH}
              fill="transparent"
              className="cursor-pointer"
              onClick={(e) => {
                if (!svgRef.current) return;
                const rct = svgRef.current.getBoundingClientRect();
                const sx = e.clientX - rct.left;
                const sy = e.clientY - rct.top;
                const { gx, gy } = fromSvg(sx, sy);
                handleClick(gx, gy);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!svgRef.current) return;
                const rct = svgRef.current.getBoundingClientRect();
                const sx = e.clientX - rct.left;
                const sy = e.clientY - rct.top;
                const { gx, gy } = fromSvg(sx, sy);
                // Detect closest vertex or edge
                let bestVDist = Infinity, bestVIdx = -1;
                for (let i = 0; i < vertices.length; i++) {
                  const d = Math.sqrt((gx - vertices[i].x) ** 2 + (gy - vertices[i].y) ** 2);
                  if (d < bestVDist) { bestVDist = d; bestVIdx = i; }
                }
                if (bestVIdx >= 0 && bestVDist < 1.5) {
                  setContextMenu({ screenX: e.clientX, screenY: e.clientY, type: 'vertex', index: bestVIdx });
                  return;
                }
                let bestEDist = Infinity, bestEIdx = -1;
                for (let i = 0; i < vertices.length; i++) {
                  const j = (i + 1) % vertices.length;
                  const a = vertices[i], b = vertices[j];
                  const dx = b.x - a.x, dy = b.y - a.y;
                  const lenSq = dx * dx + dy * dy;
                  let t = lenSq > 0 ? ((gx - a.x) * dx + (gy - a.y) * dy) / lenSq : 0;
                  t = Math.max(0, Math.min(1, t));
                  const dist = Math.sqrt((gx - (a.x + t * (b.x - a.x))) ** 2 + (gy - (a.y + t * (b.y - a.y))) ** 2);
                  if (dist < bestEDist) { bestEDist = dist; bestEIdx = i; }
                }
                if (bestEIdx >= 0 && bestEDist < 2.5) {
                  setContextMenu({ screenX: e.clientX, screenY: e.clientY, type: 'edge', index: bestEIdx });
                }
              }}
            />
          )}

          {/* Free mode / Ruler mode: transparent overlay for clicking anywhere */}
          {((freeMode && !isClosed) || rulerMode) && (
            <rect
              x={pad}
              y={pad}
              width={gridWidth * cellW}
              height={gridHeight * cellH}
              fill="transparent"
              className={rulerMode ? 'cursor-crosshair' : 'cursor-cell'}
              onClick={(e) => {
                if (!svgRef.current) return;
                const rct = svgRef.current.getBoundingClientRect();
                const sx = e.clientX - rct.left;
                const sy = e.clientY - rct.top;
                const { gx, gy } = fromSvg(sx, sy);
                handleClick(gx, gy);
              }}
              onMouseMove={(e) => {
                if (!svgRef.current) return;
                const rct = svgRef.current.getBoundingClientRect();
                const sx = e.clientX - rct.left;
                const sy = e.clientY - rct.top;
                const { gx, gy } = fromSvg(sx, sy);
                setHoverCell({ x: gx, y: gy });
              }}
              onMouseLeave={() => setHoverCell(null)}
            />
          )}
          {/* Free mode: show placed vertex markers */}
          {freeMode && !isClosed && vertices.map((v, vi) => {
            const { sx, sy } = toSvg(v.x, v.y);
            return (
              <g key={`fv-${vi}`}>
                <circle cx={sx} cy={sy} r={5} fill="hsl(200 80% 50%)" stroke="hsl(var(--background))" strokeWidth={1.5} />
                <text x={sx} y={sy - 7} textAnchor="middle" className="text-[7px] font-bold select-none pointer-events-none" fill="hsl(200 80% 50%)">
                  {vi + 1}
                </text>
              </g>
            );
          })}

          {/* Draggable vertices when closed */}
          {isClosed && !rulerMode && vertices.map((v, i) => {
            const { sx, sy } = toSvg(v.x, v.y);
            const isDragging = draggingIdx === i;
            const isSelected = selectedVertexIdx === i;
            return (
              <g key={`dv-${i}`}>
                {/* Selected vertex highlight ring */}
                {isSelected && (
                  <circle cx={sx} cy={sy} r={11} fill="none" stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="3 2" />
                )}
                <circle
                  cx={sx} cy={sy} r={isDragging ? 7 : isSelected ? 7 : 6}
                  fill={isDragging ? 'hsl(var(--chart-2))' : isSelected ? 'hsl(var(--chart-2))' : 'hsl(200 80% 50%)'}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => {
                    if (selectMode) {
                      // Long press for context menu
                      longPressTimer.current = setTimeout(() => {
                        setContextMenu({ screenX: e.clientX, screenY: e.clientY, type: 'vertex', index: i });
                        longPressTimer.current = null;
                      }, 500);
                    }
                    handleMouseDown(i, e);
                  }}
                  onMouseUp={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingVertexIdx(i);
                    setEditCoordX(String(v.x));
                    setEditCoordY(String(v.y));
                    setSelectedVertexIdx(i);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ screenX: e.clientX, screenY: e.clientY, type: 'vertex', index: i });
                  }}
                />
                <text x={sx} y={sy - 9} textAnchor="middle"
                  className="text-[7px] font-bold select-none pointer-events-none"
                  fill={isSelected ? 'hsl(var(--chart-2))' : 'hsl(200 80% 50%)'}>
                  {i + 1} ({hAxisLabel}{v.x},{vAxisLabel}{v.y})
                </text>
              </g>
            );
          })}

          {/* ── Sibling workspace vertices ON TOP for guaranteed interactivity ── */}
          {!rulerMode && otherPolygons.map((op) => {
            if (selectedOtherId !== op.id) return null;
            const verts = otherEditVertices;
            return verts.map((v, i) => {
              const { sx, sy } = toSvg(v.x, v.y);
              const isDragging = draggingOtherIdx === i;
              return (
                <g key={`sib-top-${op.id}-${i}`}>
                  <circle
                    cx={sx} cy={sy} r={isDragging ? 8 : 7}
                    fill={isDragging ? 'hsl(var(--chart-2))' : 'hsl(var(--primary))'}
                    stroke="hsl(var(--background))"
                    strokeWidth={2.5}
                    className="cursor-grab active:cursor-grabbing"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggingOtherIdx(i); }}
                  />
                  <text x={sx} y={sy - 10} textAnchor="middle"
                    className="text-[7px] font-bold select-none pointer-events-none"
                    fill="hsl(var(--primary))">
                    {i + 1} ({hAxisLabel}{v.x},{vAxisLabel}{v.y})
                  </text>
                </g>
              );
            });
          })}
          {/* ── Ridge line axis (cumbrera) ── */}
          {ridgeLine && (() => {
            const RIDGE_COLOR = 'hsl(0, 0%, 45%)';
            if (sectionType === 'vertical' || !sectionType) {
              // On Z sections: draw the ridge as a projected line on the XY plane
              const { sx: sx1, sy: sy1 } = toSvg(ridgeLine.x1, ridgeLine.y1);
              const { sx: sx2, sy: sy2 } = toSvg(ridgeLine.x2, ridgeLine.y2);
              // Extend 3 grid units beyond endpoints
              const dx = ridgeLine.x2 - ridgeLine.x1;
              const dy = ridgeLine.y2 - ridgeLine.y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const ext = len > 0 ? 3 : 0;
              const ux = len > 0 ? dx / len : 0;
              const uy = len > 0 ? dy / len : 0;
              const { sx: exs1, sy: eys1 } = toSvg(ridgeLine.x1 - ux * ext, ridgeLine.y1 - uy * ext);
              const { sx: exs2, sy: eys2 } = toSvg(ridgeLine.x2 + ux * ext, ridgeLine.y2 + uy * ext);
              const mx = (sx1 + sx2) / 2;
              const my = (sy1 + sy2) / 2;
              return (
                <g className="pointer-events-none">
                  <line x1={exs1} y1={eys1} x2={exs2} y2={eys2} stroke={RIDGE_COLOR} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
                  <circle cx={sx1} cy={sy1} r={3} fill={RIDGE_COLOR} opacity={0.8} />
                  <circle cx={sx2} cy={sy2} r={3} fill={RIDGE_COLOR} opacity={0.8} />
                  <text x={mx} y={my - 8} textAnchor="middle" fill={RIDGE_COLOR} fontSize={8} fontWeight={700} className="select-none" opacity={0.85}>
                    CUMBRERA (Z={ridgeLine.z})
                  </text>
                </g>
              );
            }
            if (sectionType === 'longitudinal' && sectionAxisValue !== undefined) {
              // Y section: ridge intersects as a vertical mark at the ridge X coordinate
              // Check if ridge line crosses this Y value
              const y = sectionAxisValue;
              const dy = ridgeLine.y2 - ridgeLine.y1;
              if (Math.abs(dy) < 0.001) {
                // Horizontal ridge — only show if y matches
                if (Math.abs(ridgeLine.y1 - y) > 0.5) return null;
              }
              const t = Math.abs(dy) > 0.001 ? (y - ridgeLine.y1) / dy : 0.5;
              if (t < -0.1 || t > 1.1) return null;
              const ridgeX = ridgeLine.x1 + t * (ridgeLine.x2 - ridgeLine.x1);
              const { sx: rx, sy: ry1 } = toSvg(ridgeX, gridOffsetY);
              const { sx: _rx2, sy: ry2 } = toSvg(ridgeX, gridOffsetY + gridHeight);
              return (
                <g className="pointer-events-none">
                  <line x1={rx} y1={ry1} x2={rx} y2={ry2} stroke={RIDGE_COLOR} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                  <text x={rx} y={Math.min(ry1, ry2) - 6} textAnchor="middle" fill={RIDGE_COLOR} fontSize={7} fontWeight={700} className="select-none" opacity={0.85}>
                    ▽ CUMBRERA
                  </text>
                </g>
              );
            }
            if (sectionType === 'transversal' && sectionAxisValue !== undefined) {
              // X section: ridge intersects as a vertical mark at the ridge Y coordinate
              const x = sectionAxisValue;
              const dx = ridgeLine.x2 - ridgeLine.x1;
              if (Math.abs(dx) < 0.001) {
                if (Math.abs(ridgeLine.x1 - x) > 0.5) return null;
              }
              const t = Math.abs(dx) > 0.001 ? (x - ridgeLine.x1) / dx : 0.5;
              if (t < -0.1 || t > 1.1) return null;
              const ridgeY = ridgeLine.y1 + t * (ridgeLine.y2 - ridgeLine.y1);
              const { sx: ry, sy: ry1 } = toSvg(ridgeY, gridOffsetY);
              const { sx: _ry2, sy: ry2 } = toSvg(ridgeY, gridOffsetY + gridHeight);
              return (
                <g className="pointer-events-none">
                  <line x1={ry} y1={ry1} x2={ry} y2={ry2} stroke={RIDGE_COLOR} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                  <text x={ry} y={Math.min(ry1, ry2) - 6} textAnchor="middle" fill={RIDGE_COLOR} fontSize={7} fontWeight={700} className="select-none" opacity={0.85}>
                    ▽ CUMBRERA
                  </text>
                </g>
              );
            }
            return null;
          })()}

          {/* ── Magnet snap indicator ── */}
          {magnetMode && magnetSnap && (() => {
            const { sx, sy } = toSvg(magnetSnap.x, magnetSnap.y);
            return (
              <g className="pointer-events-none">
                <line x1={sx - 12} y1={sy} x2={sx + 12} y2={sy} stroke="hsl(280 70% 50%)" strokeWidth={1.5} strokeDasharray="3 2" />
                <line x1={sx} y1={sy - 12} x2={sx} y2={sy + 12} stroke="hsl(280 70% 50%)" strokeWidth={1.5} strokeDasharray="3 2" />
                <circle cx={sx} cy={sy} r={5} fill="none" stroke="hsl(280 70% 50%)" strokeWidth={2} />
                <text x={sx} y={sy - 16} textAnchor="middle" fill="hsl(280 70% 50%)" fontSize={7} fontWeight="bold" className="select-none">
                  🧲 {magnetSnap.label}
                </text>
              </g>
            );
          })()}

          {/* ── External perimeter dimension lines (total width & height of all polygons) ── */}
          {(() => {
            // Gather all polygon vertices (active + others)
            const allVerts: PolygonVertex[] = [...vertices];
            for (const op of otherPolygons) {
              if (op.vertices.length >= 3) allVerts.push(...op.vertices);
            }
            if (allVerts.length < 3) return null;

            const allXs = allVerts.map(v => v.x);
            const allYs = allVerts.map(v => v.y);
            const bMinX = Math.min(...allXs);
            const bMaxX = Math.max(...allXs);
            const bMinY = Math.min(...allYs);
            const bMaxY = Math.max(...allYs);

            const totalWidthMm = Math.round((bMaxX - bMinX) * hScale * 1000);
            const totalHeightMm = Math.round((bMaxY - bMinY) * vScale * 1000);

            if (totalWidthMm <= 0 && totalHeightMm <= 0) return null;

            // SVG coordinates for corners
            const { sx: tlX, sy: tlY } = toSvg(bMinX, bMinY);
            const { sx: trX, sy: trY } = toSvg(bMaxX, bMinY);
            const { sx: blX, sy: blY } = toSvg(bMinX, bMaxY);
            const { sx: brX, sy: brY } = toSvg(bMaxX, bMaxY);

            // Grid boundary in SVG space
            const gridTop = pad;
            const gridBottom = pad + gridHeight * cellH;
            const gridLeft = pad;
            const gridRight = pad + gridWidth * cellW;

            const dimOffset = 22; // offset outside the grid boundary
            const tickLen = 5;
            const dimColor = "hsl(0 70% 50%)";

            return (
              <g className="pointer-events-none">
                {/* ── Bottom horizontal dimension (total width) ── */}
                {totalWidthMm > 0 && (() => {
                  const y = gridBottom + dimOffset;
                  return (
                    <>
                      {/* Extension lines */}
                      <line x1={blX} y1={blY} x2={blX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={brX} y1={brY} x2={brX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      {/* Dimension line */}
                      <line x1={blX} y1={y} x2={brX} y2={y} stroke={dimColor} strokeWidth={1} />
                      {/* Tick marks */}
                      <line x1={blX} y1={y - tickLen} x2={blX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.7} />
                      <line x1={brX} y1={y - tickLen} x2={brX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.7} />
                      {/* Label */}
                      <text x={(blX + brX) / 2} y={y + 12} textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fontWeight={800} fill={dimColor}>
                        {totalWidthMm} mm
                      </text>
                    </>
                  );
                })()}

                {/* ── Right vertical dimension (total height) ── */}
                {totalHeightMm > 0 && (() => {
                  const x = gridRight + dimOffset;
                  return (
                    <>
                      {/* Extension lines */}
                      <line x1={trX} y1={trY} x2={x + tickLen} y2={trY} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={brX} y1={brY} x2={x + tickLen} y2={brY} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      {/* Dimension line */}
                      <line x1={x} y1={trY} x2={x} y2={brY} stroke={dimColor} strokeWidth={1} />
                      {/* Tick marks */}
                      <line x1={x - tickLen} y1={trY} x2={x + tickLen} y2={trY} stroke={dimColor} strokeWidth={0.7} />
                      <line x1={x - tickLen} y1={brY} x2={x + tickLen} y2={brY} stroke={dimColor} strokeWidth={0.7} />
                      {/* Label */}
                      <text x={x + 14} y={(trY + brY) / 2} textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(90, ${x + 14}, ${(trY + brY) / 2})`}
                        fontSize={9} fontWeight={800} fill={dimColor}>
                        {totalHeightMm} mm
                      </text>
                    </>
                  );
                })()}

                {/* ── Top horizontal dimension (total width) ── */}
                {totalWidthMm > 0 && (() => {
                  const y = gridTop - dimOffset;
                  return (
                    <>
                      <line x1={tlX} y1={tlY} x2={tlX} y2={y - tickLen} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={trX} y1={trY} x2={trX} y2={y - tickLen} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={tlX} y1={y} x2={trX} y2={y} stroke={dimColor} strokeWidth={1} />
                      <line x1={tlX} y1={y - tickLen} x2={tlX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.7} />
                      <line x1={trX} y1={y - tickLen} x2={trX} y2={y + tickLen} stroke={dimColor} strokeWidth={0.7} />
                      <text x={(tlX + trX) / 2} y={y - 10} textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fontWeight={800} fill={dimColor}>
                        {totalWidthMm} mm
                      </text>
                    </>
                  );
                })()}

                {/* ── Left vertical dimension (total height) ── */}
                {totalHeightMm > 0 && (() => {
                  const x = gridLeft - dimOffset;
                  return (
                    <>
                      <line x1={tlX} y1={tlY} x2={x - tickLen} y2={tlY} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={blX} y1={blY} x2={x - tickLen} y2={blY} stroke={dimColor} strokeWidth={0.4} opacity={0.4} />
                      <line x1={x} y1={tlY} x2={x} y2={blY} stroke={dimColor} strokeWidth={1} />
                      <line x1={x - tickLen} y1={tlY} x2={x + tickLen} y2={tlY} stroke={dimColor} strokeWidth={0.7} />
                      <line x1={x - tickLen} y1={blY} x2={x + tickLen} y2={blY} stroke={dimColor} strokeWidth={0.7} />
                      <text x={x - 14} y={(tlY + blY) / 2} textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(-90, ${x - 14}, ${(tlY + blY) / 2})`}
                        fontSize={9} fontWeight={800} fill={dimColor}>
                        {totalHeightMm} mm
                      </text>
                    </>
                  );
                })()}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Context menu (right-click / long-press) ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onClick={() => setContextMenu(null)}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.type === 'vertex' && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => {
                  const v = vertices[contextMenu.index];
                  setEditingVertexIdx(contextMenu.index);
                  setEditCoordX(String(v.x));
                  setEditCoordY(String(v.y));
                  setSelectedVertexIdx(contextMenu.index);
                  setContextMenu(null);
                }}
              >
                ✏️ Editar coordenadas
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => {
                  if (vertices.length <= 3) {
                    toast.error('Mínimo 3 vértices');
                  } else {
                    const next = vertices.filter((_, idx) => idx !== contextMenu.index);
                    onChange(next);
                    setSelectedVertexIdx(null);
                    toast.success(`Vértice ${contextMenu.index + 1} eliminado`);
                  }
                  setContextMenu(null);
                }}
              >
                🗑️ Eliminar vértice
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => {
                  setSelectedVertexIdx(contextMenu.index);
                  setContextMenu(null);
                  toast('Arrastra el vértice a su nueva posición');
                }}
              >
                ↕️ Mover vértice
              </button>
            </>
          )}
          {contextMenu.type === 'edge' && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => {
                  const a = vertices[contextMenu.index];
                  const b = vertices[(contextMenu.index + 1) % vertices.length];
                  const midX = Math.round(((a.x + b.x) / 2) * 10) / 10;
                  const midY = Math.round(((a.y + b.y) / 2) * 10) / 10;
                  const next = [...vertices];
                  next.splice(contextMenu.index + 1, 0, { x: midX, y: midY });
                  onChange(next);
                  setSelectedVertexIdx(contextMenu.index + 1);
                  toast.success(`Arista ${contextMenu.index + 1} dividida`);
                  setContextMenu(null);
                }}
              >
                ✂️ Dividir aquí
              </button>
              {onWallSelect && (
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                  onClick={() => {
                    onWallSelect(contextMenu.index + 1);
                    setContextMenu(null);
                  }}
                >
                  🧱 Editar tipo de pared
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Coordinate editor (double-click on vertex) ── */}
      {editingVertexIdx !== null && editingVertexIdx < vertices.length && (
        <div className="flex items-center gap-1.5 p-2 rounded border bg-accent/30 text-xs">
          <span className="font-semibold text-muted-foreground">Vértice {editingVertexIdx + 1}:</span>
          <label className="text-muted-foreground">{hAxisLabel}</label>
          <input
            className="h-6 w-14 px-1 border rounded bg-background text-xs text-center"
            value={editCoordX}
            onChange={(e) => setEditCoordX(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const nx = parseFloat(editCoordX);
                const ny = parseFloat(editCoordY);
                if (!isNaN(nx) && !isNaN(ny)) {
                  const next = [...vertices];
                  next[editingVertexIdx!] = { x: nx, y: ny };
                  onChange(next);
                  setEditingVertexIdx(null);
                  toast.success('Coordenadas actualizadas');
                }
              } else if (e.key === 'Escape') {
                setEditingVertexIdx(null);
              }
            }}
            autoFocus
          />
          <label className="text-muted-foreground">{vAxisLabel}</label>
          <input
            className="h-6 w-14 px-1 border rounded bg-background text-xs text-center"
            value={editCoordY}
            onChange={(e) => setEditCoordY(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const nx = parseFloat(editCoordX);
                const ny = parseFloat(editCoordY);
                if (!isNaN(nx) && !isNaN(ny)) {
                  const next = [...vertices];
                  next[editingVertexIdx!] = { x: nx, y: ny };
                  onChange(next);
                  setEditingVertexIdx(null);
                  toast.success('Coordenadas actualizadas');
                }
              } else if (e.key === 'Escape') {
                setEditingVertexIdx(null);
              }
            }}
          />
          <Button
            variant="default"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => {
              const nx = parseFloat(editCoordX);
              const ny = parseFloat(editCoordY);
              if (!isNaN(nx) && !isNaN(ny)) {
                const next = [...vertices];
                next[editingVertexIdx!] = { x: nx, y: ny };
                onChange(next);
                setEditingVertexIdx(null);
                toast.success('Coordenadas actualizadas');
              }
            }}
          >
            ✓ Aplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => setEditingVertexIdx(null)}
          >
            ✕
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" className="h-5 text-[10px] gap-0.5" onClick={handleUndo}
          disabled={vertices.length === 0}>
          {isClosed ? 'Reabrir' : 'Deshacer'}
        </Button>
        <Button variant="outline" size="sm" className="h-5 text-[10px] gap-0.5" onClick={handleClear}
          disabled={vertices.length === 0}>
          Limpiar
        </Button>
        {selectedVertexIdx !== null && vertices.length > 3 && (
          <Button
            variant="outline"
            size="sm"
            className="h-5 text-[10px] gap-0.5 text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => {
              const next = vertices.filter((_, idx) => idx !== selectedVertexIdx);
              onChange(next);
              setSelectedVertexIdx(null);
              toast.success(`Vértice ${selectedVertexIdx + 1} eliminado`);
            }}
          >
            🗑️ Eliminar V{selectedVertexIdx + 1}
          </Button>
        )}
        <span className="text-[9px] text-muted-foreground ml-auto">
          {selectMode
            ? selectedVertexIdx !== null
              ? `V${selectedVertexIdx + 1} seleccionado · Doble clic=coordenadas · Clic derecho=menú`
              : 'Clic en arista=dividir · Clic en vértice=seleccionar · Clic dcho.=menú'
            : rulerMode
              ? rulerStart ? 'Pulsa 2º punto de la regla' : 'Pulsa 1er punto de la regla'
              : isClosed
                ? 'Arrastra vértices · Deshacer para reabrir'
                : vertices.length >= 3
                  ? 'Pulsa primer vértice para cerrar'
                  : `${vertices.length}/3 mín.`}
          {freeMode && ' · Modo libre'}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export function BudgetWorkspacesTab({ budgetId, isAdmin, autoShow3D, onAutoShow3DHandled }: BudgetWorkspacesTabProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedSectionTypes, setCollapsedSectionTypes] = useState<Set<string>>(new Set());
  const [selectedWallMap, setSelectedWallMap] = useState<Record<string, number | null>>({});
  const [gridEditId, setGridEditId] = useState<string | null>(null);
  const [view3DId, setView3DId] = useState<string | null>(null);
  const [selected3DFace, setSelected3DFace] = useState<string | null>(null);
  const [show3DList, setShow3DList] = useState(false);
  const [returnTo3D, setReturnTo3D] = useState<{ type: 'list' } | { type: 'single'; workspaceId: string } | null>(null);
  const [gridEditVertices, setGridEditVertices] = useState<PolygonVertex[]>([]);
  const [activeSectionView, setActiveSectionView] = useState<Record<string, { sectionId: string; type: 'vertical' | 'longitudinal' | 'transversal' | 'inclined' } | null>>({});
  const [sectionEditVertices, setSectionEditVertices] = useState<PolygonVertex[]>([]);
  const [formName, setFormName] = useState('');
  const [formHeight, setFormHeight] = useState('');
  const [formVertices, setFormVertices] = useState<PolygonVertex[]>([]);
  const [formSectionId, setFormSectionId] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionAxisValue, setNewSectionAxisValue] = useState('');
  const [showQuickSectionForm, setShowQuickSectionForm] = useState(false);
  const [quickSectionName, setQuickSectionName] = useState('');
  const [quickSectionAxisValue, setQuickSectionAxisValue] = useState('0');
  const [inputMode, setInputMode] = useState<'manual' | 'grid'>('manual');
  const [formIsBase, setFormIsBase] = useState(false);
  const [selectedOtherWorkspaceId, setSelectedOtherWorkspaceId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Wall objects panel state
  const [wallPanelOpen, setWallPanelOpen] = useState(false);
  const [wallPanelWallId, setWallPanelWallId] = useState<string | null>(null);
  const [wallPanelWallIndex, setWallPanelWallIndex] = useState(0);
  const [wallPanelWallType, setWallPanelWallType] = useState('exterior');
  const [wallPanelLabel, setWallPanelLabel] = useState('');
  const [wallPanelRoomName, setWallPanelRoomName] = useState('');
  const [wallPanelRoomId, setWallPanelRoomId] = useState<string | null>(null);

  // Background sync guards for mandatory Superficie (layer 0)
  const superficieSyncInFlightRef = useRef(false);
  const superficieSyncSignatureRef = useRef('');

  // Auto-show 3D list when navigated from Plano > Vista 3D
  useEffect(() => {
    if (autoShow3D) {
      setShow3DList(true);
      onAutoShow3DHandled?.();
    }
  }, [autoShow3D, onAutoShow3DHandled]);

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan-for-workspaces', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plans')
        .select('id, default_height, custom_corners, scale_mode, block_length_mm, length, width')
        .eq('budget_id', budgetId)
        .maybeSingle();
      return data;
    },
  });

  const allSections = useMemo<CustomSection[]>(() => {
    if (!floorPlan?.custom_corners) return [];
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      return parsed?.customSections || [];
    } catch { return []; }
  }, [floorPlan?.custom_corners]);

  // Extract ridge line from custom_corners
  const ridgeLine = useMemo<{ x1: number; y1: number; x2: number; y2: number; z: number } | null>(() => {
    if (!floorPlan?.custom_corners) return null;
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      return parsed?.ridgeLine ?? null;
    } catch { return null; }
  }, [floorPlan?.custom_corners]);

  const verticalSections = useMemo(() => allSections.filter(s => s.sectionType === 'vertical'), [allSections]);
  const longitudinalSections = useMemo(() => allSections.filter(s => s.sectionType === 'longitudinal'), [allSections]);
  const transversalSections = useMemo(() => allSections.filter(s => s.sectionType === 'transversal'), [allSections]);
  const inclinedSections = useMemo(() => allSections.filter(s => s.sectionType === 'inclined'), [allSections]);

  /** Get the perimeter polygon (XY) from a vertical section's first polygon */
  const getSectionPerimeter = useCallback((sectionId: string | null): PolygonVertex[] | undefined => {
    if (!sectionId) return undefined;
    const section = verticalSections.find(s => s.id === sectionId);
    if (!section || !section.polygons || section.polygons.length === 0) return undefined;
    // Use the first polygon's XY projection
    const poly = section.polygons[0];
    if (!poly.vertices || poly.vertices.length < 3) return undefined;
    return poly.vertices.map(v => ({ x: v.x, y: v.y }));
  }, [verticalSections]);

  const { data: rooms = [], refetch } = useQuery({
    queryKey: ['workspace-rooms', floorPlan?.id],
    enabled: !!floorPlan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, length, width, height, has_floor, has_ceiling, has_roof, vertical_section_id, floor_id, floor_polygon, is_base')
        .eq('floor_plan_id', floorPlan!.id)
        .order('name', { ascending: true });
      return (data || []).map((r: any) => ({
        ...r,
        floor_polygon: Array.isArray(r.floor_polygon) ? r.floor_polygon : null,
      })) as Workspace[];
    },
  });

  // Query ALL rooms from floor plan to get placed rooms for grid context
  const { data: allFloorPlanRooms = [] } = useQuery({
    queryKey: ['floor-plan-all-rooms', floorPlan?.id],
    enabled: !!floorPlan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, pos_x, pos_y, width, length')
        .eq('floor_plan_id', floorPlan!.id)
        .not('pos_x', 'is', null)
        .not('pos_y', 'is', null);
      return (data || []) as PlacedGridRoom[];
    },
  });

  const cellSizeM = useMemo(() => {
    if (!floorPlan) return 1;
    return floorPlan.scale_mode === 'bloque' ? (floorPlan.block_length_mm || 625) / 1000 : 1;
  }, [floorPlan]);

  /** Compute grid bounds from the active section's perimeter polygon, falling back to placed rooms */
  const activeRoom = rooms.find(r => r.id === gridEditId);
  const formPerimeter = getSectionPerimeter(formSectionId || null);
  const activePerimeter = getSectionPerimeter(activeRoom?.vertical_section_id ?? null) || (showForm ? formPerimeter : undefined);

  const [gridExtend, setGridExtend] = useState({ left: 0, right: 0, top: 0, bottom: 0 });

  const autoGridBounds = useMemo<GridBounds>(() => {
    // Priority 1: section perimeter polygon
    if (activePerimeter && activePerimeter.length >= 3) {
      const xs = activePerimeter.map(v => v.x);
      const ys = activePerimeter.map(v => v.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return { minCol: minX - 1, maxCol: maxX + 1, minRow: minY - 1, maxRow: maxY + 1 };
    }
    // Priority 2: placed rooms
    if (allFloorPlanRooms.length > 0) {
      let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
      for (const r of allFloorPlanRooms) {
        const startCol = Math.round(r.pos_x / cellSizeM);
        const endCol = startCol + Math.max(1, Math.round(r.width / cellSizeM)) - 1;
        const startRow = Math.round(r.pos_y / cellSizeM);
        const endRow = startRow + Math.max(1, Math.round(r.length / cellSizeM)) - 1;
        minCol = Math.min(minCol, startCol);
        maxCol = Math.max(maxCol, endCol);
        minRow = Math.min(minRow, startRow);
        maxRow = Math.max(maxRow, endRow);
      }
      return { minCol: minCol - 1, maxCol: maxCol + 1, minRow: minRow - 1, maxRow: maxRow + 1 };
    }
    // Fallback
    const defaultCols = Math.max(1, Math.ceil((floorPlan?.width || 10) / cellSizeM));
    const defaultRows = Math.max(1, Math.ceil((floorPlan?.length || 10) / cellSizeM));
    return { minCol: 0, maxCol: defaultCols - 1, minRow: 0, maxRow: defaultRows - 1 };
  }, [activePerimeter, allFloorPlanRooms, cellSizeM, floorPlan]);

  const gridBounds: GridBounds = {
    minCol: autoGridBounds.minCol - gridExtend.left,
    maxCol: autoGridBounds.maxCol + gridExtend.right,
    minRow: autoGridBounds.minRow - gridExtend.top,
    maxRow: autoGridBounds.maxRow + gridExtend.bottom,
  };

  const gridWidth = gridBounds.maxCol - gridBounds.minCol + 1;
  const gridHeight = gridBounds.maxRow - gridBounds.minRow + 1;

  const roomIds = rooms.map(r => r.id);
  const { data: allWalls = [] } = useQuery({
    queryKey: ['workspace-walls', roomIds],
    enabled: roomIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type, height')
        .in('room_id', roomIds)
        .order('wall_index', { ascending: true });
      return (data || []) as WallData[];
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setFormName('');
    setFormHeight('');
    setFormVertices([]);
    setFormSectionId('');
    setEditingId(null);
    setShowForm(false);
    setShowNewSection(false);
    setNewSectionName('');
    setNewSectionAxisValue('');
    setInputMode('manual');
    setFormIsBase(false);
  };

  const persistVerticalSection = async (name: string, axisValueInput: string): Promise<string | null> => {
    if (!name.trim() || !floorPlan?.id) return null;
    const parsedAxis = parseFloat(axisValueInput);
    const newSection: CustomSection = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      sectionType: 'vertical',
      axis: 'Z',
      axisValue: Number.isFinite(parsedAxis) ? parsedAxis : 0,
      polygons: [],
    };

    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }

    const allSections: CustomSection[] = parsed.customSections || [];
    allSections.push(newSection);
    parsed.customSections = allSections;

    const { error } = await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    if (error) {
      toast.error('Error al crear sección vertical');
      return null;
    }

    toast.success(`Sección vertical "${newSection.name}" creada`);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] });
    return newSection.id;
  };

  const createVerticalSection = async (): Promise<string | null> => {
    const createdId = await persistVerticalSection(newSectionName, newSectionAxisValue);
    if (!createdId) return null;
    setShowNewSection(false);
    setNewSectionName('');
    setNewSectionAxisValue('');
    setFormSectionId(createdId);
    return createdId;
  };

  const handleCreateStandaloneVerticalSection = async () => {
    const createdId = await persistVerticalSection(quickSectionName, quickSectionAxisValue);
    if (!createdId) {
      toast.error('Indica un nombre para la sección vertical');
      return;
    }
    setShowQuickSectionForm(false);
    setQuickSectionName('');
    setQuickSectionAxisValue('0');
  };

  const handleSave = async () => {
    if (!formName.trim() || !floorPlan?.id) return;
    if (formVertices.length < 3) { toast.error('El polígono necesita al menos 3 vértices'); return; }

    let sectionId = formSectionId;
    if (showNewSection) {
      const created = await createVerticalSection();
      if (!created) return;
      sectionId = created;
    }
    if (!sectionId) { toast.error('Debes seleccionar una Sección Vertical'); return; }

    const bbox = polygonBBox(formVertices);
    const scale = inputMode === 'grid' ? cellSizeM : 1;
    const payload: any = {
      name: formName.trim(),
      length: Math.round(bbox.w * scale * 100) / 100,
      width: Math.round(bbox.h * scale * 100) / 100,
      pos_x: Math.round(bbox.minX * scale * 100) / 100,
      pos_y: Math.round(bbox.minY * scale * 100) / 100,
      height: parseFloat(formHeight) || 0,
      floor_plan_id: floorPlan.id,
      vertical_section_id: sectionId,
      floor_polygon: formVertices,
      is_base: formIsBase,
    };

    if (editingId) {
      const { error } = await supabase.from('budget_floor_plan_rooms').update(payload).eq('id', editingId);
      if (error) { toast.error('Error al actualizar'); return; }
      // Smart rebuild: only recreate walls if vertex count changed
      await rebuildWallsSmart(editingId, formVertices.length);
      // Sync polygon to customSections so Plano view updates
      await syncFloorPolygonToSections(editingId, formVertices);

      // Ensure Superficie (layer 0) exists for every face after edit
      const { data: editedWalls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, wall_index, wall_type')
        .eq('room_id', editingId);
      const roomForMetrics: Workspace = {
        id: editingId,
        name: payload.name,
        length: payload.length,
        width: payload.width,
        height: payload.height,
        has_floor: true,
        has_ceiling: true,
        has_roof: false,
        vertical_section_id: payload.vertical_section_id,
        floor_id: null,
        floor_polygon: formVertices,
        is_base: payload.is_base,
      };
      await Promise.all((editedWalls || []).map((w: any) => ensureSuperficieLayer(w.id, roomForMetrics, w.wall_index)));

      toast.success('Espacio actualizado');
    } else {
      const { data: newRoom, error } = await supabase
        .from('budget_floor_plan_rooms').insert(payload).select('id').single();
      if (error || !newRoom) { toast.error('Error al crear'); return; }

      const wallsPayload = [
        ...formVertices.map((_, i) => ({ room_id: newRoom.id, wall_index: i + 1, wall_type: 'exterior' })),
        { room_id: newRoom.id, wall_index: -1, wall_type: 'suelo_basico' },
        { room_id: newRoom.id, wall_index: -2, wall_type: 'techo_basico' },
        { room_id: newRoom.id, wall_index: 0, wall_type: 'espacio' },
      ];

      const { data: insertedWalls, error: wallsInsertError } = await supabase
        .from('budget_floor_plan_walls')
        .insert(wallsPayload)
        .select('id, wall_index, wall_type');

      if (wallsInsertError) {
        toast.error(`Espacio creado, pero falló la creación de caras: ${wallsInsertError.message}`);
        return;
      }

      // Sync polygon to customSections so Plano view updates immediately
      await syncFloorPolygonToSections(newRoom.id, formVertices);

      // Ensure Superficie (layer 0) immediately for all faces
      const roomForMetrics: Workspace = {
        id: newRoom.id,
        name: payload.name,
        length: payload.length,
        width: payload.width,
        height: payload.height,
        has_floor: true,
        has_ceiling: true,
        has_roof: false,
        vertical_section_id: payload.vertical_section_id,
        floor_id: null,
        floor_polygon: formVertices,
        is_base: payload.is_base,
      };
      await Promise.all((insertedWalls || []).map((w: any) => ensureSuperficieLayer(w.id, roomForMetrics, w.wall_index)));

      toast.success(`Espacio creado con ${formVertices.length} paredes`);
    }
    resetForm();
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const handleEdit = (r: Workspace) => {
    setFormName(r.name);
    setFormHeight(String(r.height || ''));
    setFormVertices(r.floor_polygon && r.floor_polygon.length >= 3
      ? r.floor_polygon
      : []
    );
    setFormSectionId(r.vertical_section_id || '');
    setFormIsBase(r.is_base);
    setEditingId(r.id);
    setShowForm(true);
  };

  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await supabase.from('budget_floor_plan_rooms').delete().eq('id', deleteTarget.id);
    toast.success('Espacio eliminado');
    setDeleteTarget(null);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['deletion-backups', budgetId, 'workspaces'] });
  };

  const handleRestoreBackup = async (backupData: Record<string, any>, _entityType: string) => {
    const { id, floor_polygon, ...rest } = backupData;
    const insertData: any = { ...rest };
    if (floorPlan) insertData.floor_plan_id = floorPlan.id;
    if (floor_polygon) insertData.floor_polygon = floor_polygon;
    const { error } = await supabase.from('budget_floor_plan_rooms').insert(insertData);
    if (error) throw error;
    refetch();
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  const updateWallType = async (wallId: string, newType: string) => {
    const normalizedType = normalizeWallType(newType);
    const { error } = await supabase.from('budget_floor_plan_walls').update({ wall_type: normalizedType }).eq('id', wallId);
    if (error) {
      toast.error(`Error al actualizar pared: ${error.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  /**
   * Smart wall rebuild: only deletes+recreates walls when vertex count changes.
   * When count is the same, walls (and their objects/layers/openings) are preserved intact.
   */
  const rebuildWallsSmart = async (roomId: string, newVertexCount: number) => {
    const { data: existingWalls } = await supabase.from('budget_floor_plan_walls')
      .select('id, wall_index, wall_type').eq('room_id', roomId).order('wall_index');
    // Only count structural walls (wall_index > 0); wall_index=0 is "Espacio"
    const structuralWalls = (existingWalls || []).filter(w => w.wall_index > 0);
    if (structuralWalls.length === newVertexCount) {
      // Same count — walls stay in place, no rebuild needed
      return;
    }
    // Different count — rebuild preserving types by index
    const oldTypeMap = new Map(structuralWalls.map(w => [w.wall_index, normalizeWallType(w.wall_type)]));
    // Delete only structural walls (preserve wall_index=0 "Espacio")
    const idsToDelete = structuralWalls.map(w => w.id);
    if (idsToDelete.length > 0) {
      await supabase.from('budget_floor_plan_walls').delete().in('id', idsToDelete);
    }
    const walls = Array.from({ length: newVertexCount }, (_, i) => ({
      room_id: roomId,
      wall_index: i + 1,
      wall_type: oldTypeMap.get(i + 1) || 'exterior',
    }));
    if (walls.length > 0) {
      const { error } = await supabase.from('budget_floor_plan_walls').insert(walls);
      if (error) toast.error(`Error al reconstruir paredes: ${error.message}`);
    }
  };

  /** Update the custom height for a specific wall */
  const updateWallHeight = async (roomId: string, wallIndex: number, heightMm: number | null, existingWallId?: string) => {
    const dbWallIndex = wallIndex + 1;
    const heightM = heightMm !== null ? heightMm / 1000 : null;

    if (existingWallId) {
      const { error } = await supabase.from('budget_floor_plan_walls').update({ height: heightM }).eq('id', existingWallId);
      if (error) { toast.error(`Error: ${error.message}`); return; }
    } else {
      const { error } = await supabase.from('budget_floor_plan_walls')
        .insert({ room_id: roomId, wall_index: dbWallIndex, wall_type: 'exterior', height: heightM });
      if (error) { toast.error(`Error: ${error.message}`); return; }
    }
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
    toast.success(`Altura P${dbWallIndex} actualizada`);

    // Auto-generate inclined sections if height differences detected
    autoGenerateInclinedSections(roomId);
  };

  const ensureAndUpdateWallType = async (roomId: string, wallIndex: number, newType: string, existingWallId?: string) => {
    const dbWallIndex = wallIndex + 1;
    const effectiveType = dbWallIndex > 0 ? normalizeWallType(newType) : newType;

    if (existingWallId) {
      await updateWallType(existingWallId, effectiveType);
      return;
    }

    const { error } = await supabase
      .from('budget_floor_plan_walls')
      .insert({ room_id: roomId, wall_index: dbWallIndex, wall_type: effectiveType });

    if (error) {
      toast.error(`No se pudo guardar el tipo de pared: ${error.message}`);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  const updateFloorCeiling = async (roomId: string, field: 'has_floor' | 'has_ceiling', value: FloorCeilingType) => {
    const boolVal = value !== 'invisible';
    const updatePayload: Record<string, boolean> = { [field]: boolVal };
    // When changing ceiling type, also reset has_roof so it doesn't override the value
    if (field === 'has_ceiling') {
      updatePayload.has_roof = false;
    }
    await supabase.from('budget_floor_plan_rooms').update(updatePayload).eq('id', roomId);
    refetch();
  };

  const getFaceLabel = useCallback((wallDbIndex: number) => {
    if (wallDbIndex === 0) return 'Espacio';
    if (wallDbIndex === -1) return 'Suelo';
    if (wallDbIndex === -2) return 'Techo';
    return `Pared ${wallDbIndex}`;
  }, []);

  const getFaceMetrics = useCallback((room: Workspace, wallDbIndex: number) => {
    const polygon = Array.isArray(room.floor_polygon) && room.floor_polygon.length >= 3
      ? room.floor_polygon
      : null;

    const floorAreaRaw = polygon
      ? polygonArea(polygon) * cellSizeM * cellSizeM
      : (room.length || 0) * (room.width || 0);
    const floorArea = Math.round(floorAreaRaw * 100) / 100;

    const heightM = room.height || floorPlan?.default_height || 2.5;

    if (wallDbIndex === 0) {
      return {
        surface_m2: null as number | null,
        volume_m3: Math.round(floorAreaRaw * heightM * 1000) / 1000,
      };
    }

    if (wallDbIndex === -1 || wallDbIndex === -2) {
      return {
        surface_m2: floorArea,
        volume_m3: null as number | null,
      };
    }

    let wallLengthM = 0;
    if (polygon) {
      const edgeCount = polygon.length;
      const edgeIndex = ((wallDbIndex - 1) % edgeCount + edgeCount) % edgeCount;
      const a = polygon[edgeIndex];
      const b = polygon[(edgeIndex + 1) % edgeCount];
      wallLengthM = edgeLength(a, b) * cellSizeM;
    } else {
      wallLengthM = wallDbIndex % 2 === 1 ? (room.length || 0) : (room.width || 0);
    }

    return {
      surface_m2: Math.round(wallLengthM * heightM * 100) / 100,
      volume_m3: null as number | null,
    };
  }, [cellSizeM, floorPlan?.default_height]);

  const ensureSuperficieLayer = useCallback(async (wallId: string, room: Workspace, wallDbIndex: number) => {
    const faceLabel = getFaceLabel(wallDbIndex);
    const { surface_m2, volume_m3 } = getFaceMetrics(room, wallDbIndex);
    const metricLabel = surface_m2 != null
      ? `${surface_m2} m²`
      : volume_m3 != null
        ? `${volume_m3} m³`
        : null;
    const description = `${room.name} / ${faceLabel}${metricLabel ? ` — ${metricLabel}` : ''}`;

    const { data: existing, error: existingError } = await supabase
      .from('budget_wall_objects')
      .select('id')
      .eq('wall_id', wallId)
      .eq('layer_order', 0)
      .maybeSingle();

    if (existingError) {
      console.error('Error verificando capa Superficie:', existingError);
      return;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('budget_wall_objects')
        .update({
          name: 'Superficie',
          description,
          surface_m2,
          volume_m3,
          object_type: 'material',
          is_core: false,
          layer_order: 0,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error actualizando capa Superficie:', updateError);
      }
      return;
    }

    const { error: insertError } = await supabase
      .from('budget_wall_objects')
      .insert({
        wall_id: wallId,
        layer_order: 0,
        name: 'Superficie',
        description,
        object_type: 'material',
        is_core: false,
        surface_m2,
        volume_m3,
        visual_pattern: 'vacio',
      });

    if (insertError) {
      console.error('Error creando capa Superficie:', insertError);
      toast.error('No se pudo crear la capa automática Superficie');
    }
  }, [getFaceLabel, getFaceMetrics]);

  /** Open the wall objects panel for a specific wall */
  const openWallPanel = async (roomId: string, wallDbIndex: number, _sectionType: 'z' | 'xy' = 'z') => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    let wall = allWalls.find(w => w.room_id === roomId && w.wall_index === wallDbIndex);

    // Auto-create the face record if it doesn't exist
    if (!wall) {
      const wallType = wallDbIndex === 0 ? 'espacio' : wallDbIndex === -1 ? 'suelo_basico' : wallDbIndex === -2 ? 'techo_basico' : 'exterior';
      const { data: newWall, error } = await supabase
        .from('budget_floor_plan_walls')
        .insert({ room_id: roomId, wall_index: wallDbIndex, wall_type: wallType })
        .select('id, room_id, wall_index, wall_type')
        .single();
      if (error || !newWall) {
        toast.error('Error al abrir el ámbito');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
      wall = newWall as WallData;
    }

    await ensureSuperficieLayer(wall.id, room, wallDbIndex);

    setWallPanelWallId(wall.id);
    setWallPanelWallIndex(wallDbIndex);
    setWallPanelWallType(wallDbIndex > 0 ? normalizeWallType(wall.wall_type) : wall.wall_type);
    setWallPanelLabel(wallDbIndex === 0 ? 'Espacio' : wallDbIndex === -1 ? 'Suelo' : wallDbIndex === -2 ? 'Techo' : `P${wallDbIndex}`);
    setWallPanelRoomName(room.name);
    setWallPanelRoomId(roomId);
    setWallPanelOpen(true);

    // Also highlight in the wall map (skip for Espacio)
    if (wallDbIndex > 0) {
      setSelectedWallMap(prev => ({ ...prev, [roomId]: wallDbIndex - 1 }));
    }
  };

  /** Open the objects panel for the "Espacio" (interior volume) scope */
  const openEspacioPanel = async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    // Ensure a face record with wall_index=0 (espacio) exists
    let wall = allWalls.find(w => w.room_id === roomId && w.wall_index === 0);
    if (!wall) {
      const { data: newWall, error } = await supabase
        .from('budget_floor_plan_walls')
        .insert({ room_id: roomId, wall_index: 0, wall_type: 'espacio' })
        .select('id, room_id, wall_index, wall_type')
        .single();
      if (error || !newWall) {
        toast.error('Error al crear ámbito Espacio');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
      wall = newWall as WallData;
    }

    await ensureSuperficieLayer(wall.id, room, 0);

    setWallPanelWallId(wall.id);
    setWallPanelWallIndex(0);
    setWallPanelWallType('espacio');
    setWallPanelLabel('Espacio');
    setWallPanelRoomName(room.name);
    setWallPanelRoomId(roomId);
    setWallPanelOpen(true);
  };

  const handleWallPanelTypeChange = async (newType: string) => {
    if (!wallPanelRoomId) return;
    const effectiveType = wallPanelWallIndex > 0 ? normalizeWallType(newType) : newType;
    setWallPanelWallType(effectiveType);
    await ensureAndUpdateWallType(wallPanelRoomId, wallPanelWallIndex - 1, effectiveType, wallPanelWallId || undefined);
  };

  const openGridEditor = (r: Workspace) => {
    const verts = r.floor_polygon && r.floor_polygon.length >= 3
      ? r.floor_polygon
      : [];
    setGridEditVertices(verts);
    setGridEditId(r.id);
    setActiveSectionView(prev => ({ ...prev, [r.id]: null }));
    // Ensure the room is expanded
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.add(r.id);
      return next;
    });
  };

  const switchGridEditRoom = (targetRoomId: string) => {
    const target = rooms.find(rm => rm.id === targetRoomId);
    if (!target) return;
    openGridEditor(target);
  };

  /** Get the effective height (in Z blocks) for a specific wall of a workspace */
  const getWallZTop = useCallback((room: Workspace, wallIndex: number, zBase: number, defaultZTop: number): number => {
    const wall = allWalls.find(w => w.room_id === room.id && w.wall_index === wallIndex);
    if (wall?.height != null && wall.height > 0) {
      return zBase + Math.round((wall.height * 1000) / 250);
    }
    return defaultZTop;
  }, [allWalls]);

  /** Check if a workspace has non-uniform wall heights */
  const getWallHeightsMap = useCallback((roomId: string): Map<number, number | null> => {
    const map = new Map<number, number | null>();
    allWalls.filter(w => w.room_id === roomId && w.wall_index > 0).forEach(w => {
      map.set(w.wall_index, w.height);
    });
    return map;
  }, [allWalls]);

  /** Auto-generate inclined sections when height differences are detected */
  const autoGenerateInclinedSections = async (roomId: string) => {
    if (!floorPlan?.id) return;
    const room = rooms.find(r => r.id === roomId);
    if (!room || !room.floor_polygon || room.floor_polygon.length < 3) return;

    const poly = room.floor_polygon;
    const heightM = room.height || floorPlan?.default_height || 2.5;
    const vSection = verticalSections.find(s => s.id === room.vertical_section_id);
    const zBase = vSection ? vSection.axisValue : 0;
    const defaultHeightMm = heightM * 1000;

    // Get per-wall heights
    const wallHeights = allWalls.filter(w => w.room_id === roomId && w.wall_index > 0);
    const edgeCount = poly.length;
    
    // Build height array for each wall (mm)
    const heights: number[] = [];
    for (let i = 0; i < edgeCount; i++) {
      const wall = wallHeights.find(w => w.wall_index === i + 1);
      heights.push(wall?.height != null ? wall.height * 1000 : defaultHeightMm);
    }

    // Check if any heights differ → needs inclined section
    const uniqueHeights = new Set(heights);
    if (uniqueHeights.size <= 1) return; // All same height, no inclined sections needed

    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }
    const sections: CustomSection[] = parsed.customSections || [];

    // Remove existing auto-generated inclined sections for this workspace
    const filteredSections = sections.filter(s => 
      !(s.sectionType === 'inclined' && s.inclinedMeta?.workspaceId === roomId)
    );

    // Find pairs of adjacent walls with different heights → these form inclined planes
    for (let i = 0; i < edgeCount; i++) {
      const nextI = (i + 1) % edgeCount;
      const h1 = heights[i];
      const h2 = heights[nextI];
      if (Math.abs(h1 - h2) < 1) continue; // Same height, skip

      // The wall between vertex[nextI] and vertex[(nextI+1)%n] connects these two corners
      // Actually the inclined plane spans between the two walls at different heights
      // Calculate real length of the inclined surface
      const v1 = poly[i];
      const v2 = poly[nextI];
      const cellMm = (floorPlan.block_length_mm || 625);
      const edgeLenMm = Math.sqrt(
        ((v2.x - v1.x) * cellMm) ** 2 + ((v2.y - v1.y) * cellMm) ** 2
      );
      const dH = Math.abs(h2 - h1);
      const realLengthMm = Math.sqrt(edgeLenMm ** 2 + dH ** 2);
      const slopeAngleDeg = Math.atan2(dH, edgeLenMm) * (180 / Math.PI);

      const inclinedSection: CustomSection = {
        id: `inclined_${roomId}_p${i + 1}_p${nextI + 1}`,
        name: `${room.name} Inclinada P${i + 1}→P${nextI + 1}`,
        sectionType: 'inclined',
        axis: 'Z',
        axisValue: zBase,
        polygons: [],
        inclinedMeta: {
          workspaceId: roomId,
          workspaceName: room.name,
          wallHeights: [
            { wallIndex: i + 1, heightMm: h1 },
            { wallIndex: nextI + 1, heightMm: h2 },
          ],
          realLengthMm,
          slopeAngleDeg,
        },
      };

      filteredSections.push(inclinedSection);
    }

    parsed.customSections = filteredSections;
    await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  /** Compute the default projected polygon for a workspace on a Y or X section */
  const computeDefaultProjection = useCallback((room: Workspace, section: CustomSection): PolygonVertex[] => {
    if (!room.floor_polygon || room.floor_polygon.length < 3) return [];
    const poly = room.floor_polygon;
    const heightM = room.height || floorPlan?.default_height || 2.5;
    
    // Find workspace's Z base from its vertical section
    const vSection = verticalSections.find(s => s.id === room.vertical_section_id);
    const zBase = vSection ? vSection.axisValue : 0;
    const defaultZTop = zBase + Math.round((heightM * 1000) / 250);

    const axisVal = section.axisValue;

    if (section.sectionType === 'longitudinal') {
      // Cut at Y=axisVal: find which edges intersect this line
      const intersections = findPolygonIntersections(poly, 'y', axisVal);
      if (intersections.length < 2) return [];
      const hMin = Math.min(...intersections);
      const hMax = Math.max(...intersections);

      // Find wall indices at hMin and hMax to determine their heights
      const zTopLeft = getWallTopAtIntersection(room, poly, 'y', axisVal, hMin, zBase, defaultZTop);
      const zTopRight = getWallTopAtIntersection(room, poly, 'y', axisVal, hMax, zBase, defaultZTop);

      if (zTopLeft === zTopRight) {
        return [
          { x: hMin, y: zBase },
          { x: hMax, y: zBase },
          { x: hMax, y: zTopRight },
          { x: hMin, y: zTopLeft },
        ];
      }
      // Non-uniform top → diagonal ceiling line
      return [
        { x: hMin, y: zBase },
        { x: hMax, y: zBase },
        { x: hMax, y: zTopRight },
        { x: hMin, y: zTopLeft },
      ];
    } else if (section.sectionType === 'transversal') {
      const intersections = findPolygonIntersections(poly, 'x', axisVal);
      if (intersections.length < 2) return [];
      const hMin = Math.min(...intersections);
      const hMax = Math.max(...intersections);

      const zTopLeft = getWallTopAtIntersection(room, poly, 'x', axisVal, hMin, zBase, defaultZTop);
      const zTopRight = getWallTopAtIntersection(room, poly, 'x', axisVal, hMax, zBase, defaultZTop);

      return [
        { x: hMin, y: zBase },
        { x: hMax, y: zBase },
        { x: hMax, y: zTopRight },
        { x: hMin, y: zTopLeft },
      ];
    }
    return [];
  }, [floorPlan, verticalSections, allWalls]);

  /** Find the Z-top at a specific intersection point by identifying which wall edge it falls on */
  const getWallTopAtIntersection = useCallback((
    room: Workspace,
    poly: PolygonVertex[],
    cutAxis: 'x' | 'y',
    cutVal: number,
    hVal: number,
    zBase: number,
    defaultZTop: number
  ): number => {
    const otherAxis = cutAxis === 'y' ? 'x' : 'y';
    const heightM = room.height || floorPlan?.default_height || 2.5;

    // Find which edge contains this intersection
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const a = poly[i];
      const b = poly[j];
      const aVal = a[cutAxis], bVal = b[cutAxis];

      if ((aVal <= cutVal && bVal >= cutVal) || (aVal >= cutVal && bVal <= cutVal)) {
        if (Math.abs(aVal - bVal) < 0.001 && Math.abs(aVal - cutVal) < 0.001) {
          // Edge is along the cut line
          if (Math.min(a[otherAxis], b[otherAxis]) <= hVal && Math.max(a[otherAxis], b[otherAxis]) >= hVal) {
            const wallIdx = i + 1;
            return getWallZTop(room, wallIdx, zBase, defaultZTop);
          }
        } else {
          const t = (cutVal - aVal) / (bVal - aVal);
          const intersectH = a[otherAxis] + t * (b[otherAxis] - a[otherAxis]);
          if (Math.abs(intersectH - hVal) < 0.5) {
            // This intersection is on edge i→j
            // The "top height" at this point interpolates between wall i+1 and wall j+1 heights
            const zTopI = getWallZTop(room, i + 1, zBase, defaultZTop);
            const zTopJ = getWallZTop(room, j + 1, zBase, defaultZTop);
            return Math.round(zTopI + t * (zTopJ - zTopI));
          }
        }
      }
    }
    return defaultZTop;
  }, [floorPlan, getWallZTop]);

  /** Open a Y or X section editor for a workspace */
  const openSectionEditor = (roomId: string, section: CustomSection) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    setGridEditId(null); // Close Z editor if open
    
    // Check if there's already a stored polygon for this workspace in this section
    const existingPoly = section.polygons?.find(p => p.id === roomId);
    const verts = existingPoly && existingPoly.vertices.length >= 3
      ? existingPoly.vertices.map(v => ({ x: v.x, y: v.y }))
      : computeDefaultProjection(room, section);
    
    setSectionEditVertices(verts);
    setActiveSectionView(prev => ({ ...prev, [roomId]: { sectionId: section.id, type: section.sectionType } }));
    setExpandedIds(prev => { const next = new Set(prev); next.add(roomId); return next; });
  };

  /** Navigate from 3D face double-click to the corresponding 2D section editor */
  const handleFaceNavigateTo2D = useCallback((info: { workspaceId: string; workspaceName: string; faceType: string; faceIndex: number }) => {
    const room = rooms.find(r => r.id === info.workspaceId);
    if (!room) {
      toast.error('Espacio de trabajo no encontrado');
      return;
    }

    // Remember where to return after 2D editing
    if (show3DList) {
      setReturnTo3D({ type: 'list' });
    } else if (view3DId) {
      setReturnTo3D({ type: 'single', workspaceId: view3DId });
    }

    // Close 3D views
    setShow3DList(false);
    setView3DId(null);
    setSelected3DFace(null);

    if (info.faceType === 'suelo' || info.faceType === 'techo') {
      // Open the Z grid editor (floor polygon editor)
      openGridEditor(room);
      toast.info(`Editando ${info.faceType === 'suelo' ? 'suelo' : 'techo'} de "${room.name}" en sección Z`);
      return;
    }

    if (info.faceType === 'pared' && room.floor_polygon && room.floor_polygon.length >= 3) {
      const poly = room.floor_polygon;
      const wallIdx = info.faceIndex - 1; // 0-based
      const nextIdx = (wallIdx + 1) % poly.length;
      const v1 = poly[wallIdx];
      const v2 = poly[nextIdx];
      const dx = Math.abs(v2.x - v1.x);
      const dy = Math.abs(v2.y - v1.y);

      // Determine wall orientation: horizontal walls (along X) → Y section, vertical walls (along Y) → X section
      const isHorizontal = dx >= dy;
      const sectionsToSearch = isHorizontal ? longitudinalSections : transversalSections;
      const axisKey = isHorizontal ? 'y' : 'x';
      const wallAxisVal = isHorizontal ? v1.y : v1.x; // The constant axis value of this wall edge

      // Find the closest matching section
      let bestSection: CustomSection | null = null;
      let bestDist = Infinity;
      for (const s of sectionsToSearch) {
        const dist = Math.abs(s.axisValue - wallAxisVal);
        if (dist < bestDist) {
          bestDist = dist;
          bestSection = s;
        }
      }

      if (bestSection && bestDist <= 1) {
        openSectionEditor(room.id, bestSection);
        toast.info(`Editando pared P${info.faceIndex} de "${room.name}" en sección ${isHorizontal ? 'Y' : 'X'}=${bestSection.axisValue}`);
      } else {
        // No matching section found, fall back to Z editor
        openGridEditor(room);
        toast.info(`No hay sección ${isHorizontal ? 'Y' : 'X'} para P${info.faceIndex}. Abriendo editor Z de "${room.name}"`);
      }
      return;
    }

    // Fallback
    openGridEditor(room);
  }, [rooms, longitudinalSections, transversalSections, openGridEditor, openSectionEditor]);

  /** Save the edited Y/X section polygon back to custom_corners */
  /** Get the max Z value from a section polygon at a given horizontal position */
  const getMaxZFromSectionPoly = (verts: PolygonVertex[], xPos: number): number | null => {
    const zValues: number[] = [];
    for (let i = 0; i < verts.length; i++) {
      const j = (i + 1) % verts.length;
      const a = verts[i], b = verts[j];
      if ((a.x <= xPos + 0.3 && b.x >= xPos - 0.3) || (a.x >= xPos - 0.3 && b.x <= xPos + 0.3)) {
        if (Math.abs(a.x - b.x) < 0.001) {
          zValues.push(a.y, b.y);
        } else {
          const t = Math.max(0, Math.min(1, (xPos - a.x) / (b.x - a.x)));
          zValues.push(a.y + t * (b.y - a.y));
        }
      }
      if (Math.abs(a.x - xPos) < 0.3) {
        zValues.push(a.y);
      }
    }
    if (zValues.length === 0) return null;
    return Math.max(...zValues);
  };

  /** Sync section polygon heights back to wall heights in the database */
  const syncSectionToWallHeights = async (roomId: string, sectionPolyVerts: PolygonVertex[], section: CustomSection) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || !room.floor_polygon || room.floor_polygon.length < 3) return;
    const poly = room.floor_polygon;
    const vSection = verticalSections.find(s => s.id === room.vertical_section_id);
    const zBase = vSection ? vSection.axisValue : 0;
    const zScaleBlocks = 250 / 1000; // scaleZ=250mm per Z unit → 0.25 meters per Z unit

    // Which building axis maps to section horizontal (x)?
    // Transversal cuts at X=val → shows Y on horizontal, Z on vertical
    // Longitudinal cuts at Y=val → shows X on horizontal, Z on vertical
    const isTransversal = section.sectionType === 'transversal';
    const cutAxis: 'x' | 'y' = isTransversal ? 'x' : 'y';
    const projAxis: 'x' | 'y' = isTransversal ? 'y' : 'x';
    const axisVal = section.axisValue;

    // Only update vertices that lie on edges crossing this section
    const updates: { wallIndex: number; heightM: number }[] = [];

    for (let i = 0; i < poly.length; i++) {
      const vertex = poly[i];
      // Check if this vertex is on the section cut line (within tolerance)
      if (Math.abs(vertex[cutAxis] - axisVal) > 1) continue;

      const projPos = vertex[projAxis]; // position along section horizontal
      const zTop = getMaxZFromSectionPoly(sectionPolyVerts, projPos);

      if (zTop !== null) {
        const heightZ = zTop - zBase;
        const heightM = heightZ * zScaleBlocks;
        updates.push({ wallIndex: i + 1, heightM: Math.max(0, heightM) });
      }
    }

    if (updates.length === 0) {
      // Also try: find vertices on edges that CROSS the section (not just on the line)
      // For vertices at corners of the section cut
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const a = poly[i], b = poly[j];
        const aOnCut = Math.abs(a[cutAxis] - axisVal) <= 1;
        const bOnCut = Math.abs(b[cutAxis] - axisVal) <= 1;

        if (aOnCut && !updates.some(u => u.wallIndex === i + 1)) {
          const projPos = a[projAxis];
          const zTop = getMaxZFromSectionPoly(sectionPolyVerts, projPos);
          if (zTop !== null) {
            updates.push({ wallIndex: i + 1, heightM: Math.max(0, (zTop - zBase) * zScaleBlocks) });
          }
        }
        if (bOnCut && !updates.some(u => u.wallIndex === j + 1)) {
          const projPos = b[projAxis];
          const zTop = getMaxZFromSectionPoly(sectionPolyVerts, projPos);
          if (zTop !== null) {
            updates.push({ wallIndex: j + 1, heightM: Math.max(0, (zTop - zBase) * zScaleBlocks) });
          }
        }
      }
    }

    // Check if the section polygon has peak vertices at positions not corresponding to workspace vertices
    const existingProjPositions = new Set(
      poly.filter(v => Math.abs(v[cutAxis] - axisVal) <= 1).map(v => v[projAxis])
    );
    const sectionPeaks = sectionPolyVerts.filter(sv => {
      if (sv.y <= zBase + 0.5) return false; // Not a peak (at base level)
      // Check if this position matches any workspace vertex
      for (const pos of existingProjPositions) {
        if (Math.abs(sv.x - pos) < 0.5) return false;
      }
      return true;
    });

    if (sectionPeaks.length > 0) {
      toast.info(`ℹ️ El polígono de sección tiene ${sectionPeaks.length} vértice(s) de cumbrera sin vértice base correspondiente. Considera añadir vértices al polígono base para una representación 3D exacta.`);
    }

    // Apply updates
    for (const u of updates) {
      await supabase.from('budget_floor_plan_walls')
        .update({ height: u.heightM })
        .eq('room_id', roomId)
        .eq('wall_index', u.wallIndex);
    }

    if (updates.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
      toast.info(`🔄 ${updates.length} altura(s) de pared sincronizadas con el 3D`);
    }
  };

  const saveSectionPolygon = async (roomId: string) => {
    const view = activeSectionView[roomId];
    if (!view || !floorPlan?.id) return;
    if (sectionEditVertices.length < 3) { toast.error('Mínimo 3 vértices'); return; }

    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }

    const sections: CustomSection[] = parsed.customSections || [];
    const sIdx = sections.findIndex(s => s.id === view.sectionId);
    if (sIdx < 0) { toast.error('Sección no encontrada'); return; }

    const room = rooms.find(r => r.id === roomId);
    const polyEntry = {
      id: roomId,
      name: room?.name || 'Espacio',
      vertices: sectionEditVertices.map(v => ({ x: v.x, y: v.y, z: 0 })),
    };

    // Upsert polygon in section
    const existingIdx = sections[sIdx].polygons?.findIndex(p => p.id === roomId) ?? -1;
    if (!sections[sIdx].polygons) sections[sIdx].polygons = [];
    if (existingIdx >= 0) {
      sections[sIdx].polygons[existingIdx] = polyEntry;
    } else {
      sections[sIdx].polygons.push(polyEntry);
    }

    parsed.customSections = sections;
    const { error } = await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    if (error) { toast.error('Error al guardar'); return; }

    // Sync section polygon heights → wall heights for 3D consistency
    const section = sections[sIdx];
    await syncSectionToWallHeights(roomId, sectionEditVertices, section);

    toast.success('Polígono de sección guardado y 3D sincronizado');
    setActiveSectionView(prev => ({ ...prev, [roomId]: null }));
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    restoreReturnTo3D();
  };

  /** Sync floor_polygon changes to customSections polygons so Plano view stays in sync */
  const syncFloorPolygonToSections = async (roomId: string, vertices: PolygonVertex[]) => {
    if (!floorPlan?.id) return;
    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }
    const sections: CustomSection[] = parsed.customSections || [];
    const room = rooms.find(r => r.id === roomId);
    const roomName = room?.name || 'Espacio';
    let changed = false;
    // Find the vertical section for this room and update its polygon entry
    const vSectionId = room?.vertical_section_id;
    for (const s of sections) {
      if (!s.polygons) continue;
      const pIdx = s.polygons.findIndex(p => p.id === roomId);
      if (pIdx >= 0) {
        s.polygons[pIdx] = { ...s.polygons[pIdx], vertices: vertices.map(v => ({ x: v.x, y: v.y, z: 0 })) };
        changed = true;
      } else if (vSectionId && s.id === vSectionId) {
        // If room has a vertical_section_id but no polygon entry yet, add it
        s.polygons.push({ id: roomId, name: roomName, vertices: vertices.map(v => ({ x: v.x, y: v.y, z: 0 })) });
        changed = true;
      }
    }
    if (changed) {
      parsed.customSections = sections;
      await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    }
  };

  const saveGridEditorPolygon = async (roomId: string) => {
    if (gridEditVertices.length < 3) { toast.error('Mínimo 3 vértices'); return; }
    const bbox = polygonBBox(gridEditVertices);
    await supabase.from('budget_floor_plan_rooms').update({
      floor_polygon: gridEditVertices as any,
      length: Math.round(bbox.w * cellSizeM * 100) / 100,
      width: Math.round(bbox.h * cellSizeM * 100) / 100,
      pos_x: Math.round(bbox.minX * cellSizeM * 100) / 100,
      pos_y: Math.round(bbox.minY * cellSizeM * 100) / 100,
    }).eq('id', roomId);
    // Smart rebuild: only recreate walls if vertex count changed
    await rebuildWallsSmart(roomId, gridEditVertices.length);
    // Sync polygon to customSections so Plano view updates
    await syncFloorPolygonToSections(roomId, gridEditVertices);
    toast.success('Polígono actualizado');
    setGridEditId(null);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    restoreReturnTo3D();
  };

  /** Restore 3D view after 2D editing if navigated from 3D */
  const restoreReturnTo3D = useCallback(() => {
    if (!returnTo3D) return;
    if (returnTo3D.type === 'list') {
      setShow3DList(true);
    } else if (returnTo3D.type === 'single') {
      setView3DId(returnTo3D.workspaceId);
    }
    setReturnTo3D(null);
  }, [returnTo3D]);

  // Rename workspace inline
  const handleRename = async (roomId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    const { error } = await supabase.from('budget_floor_plan_rooms').update({ name: trimmed }).eq('id', roomId);
    if (error) { toast.error('Error al renombrar'); return; }
    toast.success('Nombre actualizado');
    setRenamingId(null);
    refetch();
  };

  // Handle polygon change for another workspace from within a grid editor (Z section)
  const handleOtherPolygonChangeZ = async (otherId: string, newVertices: PolygonVertex[]) => {
    if (newVertices.length < 3) return;
    const bbox = polygonBBox(newVertices);
    await supabase.from('budget_floor_plan_rooms').update({
      floor_polygon: newVertices as any,
      length: Math.round(bbox.w * cellSizeM * 100) / 100,
      width: Math.round(bbox.h * cellSizeM * 100) / 100,
      pos_x: Math.round(bbox.minX * cellSizeM * 100) / 100,
      pos_y: Math.round(bbox.minY * cellSizeM * 100) / 100,
    }).eq('id', otherId);
    // Smart rebuild: only recreate walls if vertex count changed
    await rebuildWallsSmart(otherId, newVertices.length);
    // Sync polygon to customSections so Plano view updates
    await syncFloorPolygonToSections(otherId, newVertices);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  // Handle polygon change for another workspace from within a Y/X section editor
  const handleOtherPolygonChangeSection = async (otherId: string, newVertices: PolygonVertex[], sectionId: string) => {
    if (newVertices.length < 3 || !floorPlan?.id) return;
    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }
    const sections: CustomSection[] = parsed.customSections || [];
    const sIdx = sections.findIndex(s => s.id === sectionId);
    if (sIdx < 0) return;
    const room = rooms.find(r => r.id === otherId);
    const polyEntry = { id: otherId, name: room?.name || 'Espacio', vertices: newVertices.map(v => ({ x: v.x, y: v.y, z: 0 })) };
    if (!sections[sIdx].polygons) sections[sIdx].polygons = [];
    const existingIdx = sections[sIdx].polygons.findIndex(p => p.id === otherId);
    if (existingIdx >= 0) sections[sIdx].polygons[existingIdx] = polyEntry;
    else sections[sIdx].polygons.push(polyEntry);
    parsed.customSections = sections;
    await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  /** Save ruler lines for a workspace/section to custom_corners */
  const saveRulerLines = async (key: string, lines: RulerLine[]) => {
    if (!floorPlan?.id) return;
    let parsed: any = {};
    try {
      parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : (floorPlan.custom_corners || {});
    } catch { parsed = {}; }
    if (!parsed.rulerData) parsed.rulerData = {};
    parsed.rulerData[key] = lines;
    await supabase.from('budget_floor_plans').update({ custom_corners: parsed }).eq('id', floorPlan.id);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
  };

  /** Load saved ruler lines for a workspace/section */
  const getSavedRulerLines = (key: string): RulerLine[] => {
    if (!floorPlan?.custom_corners) return [];
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners) : floorPlan.custom_corners;
      return parsed?.rulerData?.[key] || [];
    } catch { return []; }
  };

  const handleOtherPolygonRename = async (otherId: string, newName: string) => {
    const { error } = await supabase.from('budget_floor_plan_rooms').update({ name: newName }).eq('id', otherId);
    if (error) { toast.error('Error al renombrar'); return; }
    toast.success('Nombre actualizado');
    refetch();
  };

  // Group by section type → section → workspaces
  const groupedByType = useMemo(() => {
    const sectionTypes = [
      { type: 'vertical' as const, label: 'Secciones Verticales (Z)', sections: verticalSections },
      { type: 'longitudinal' as const, label: 'Secciones Longitudinales (Y)', sections: longitudinalSections },
      { type: 'transversal' as const, label: 'Secciones Transversales (X)', sections: transversalSections },
      { type: 'inclined' as const, label: 'Secciones Inclinadas', sections: inclinedSections },
    ];

    return sectionTypes.map(({ type, label, sections }) => {
      const sectionGroups = sections.map(section => {
        // For vertical sections, match by vertical_section_id
        // For Y/X sections, match by polygon intersection
        let sectionRooms: Workspace[];
        if (type === 'vertical') {
          sectionRooms = rooms.filter(r => r.vertical_section_id === section.id);
        } else if (type === 'inclined') {
          // For inclined sections, match by workspace ID from inclinedMeta
          sectionRooms = section.inclinedMeta
            ? rooms.filter(r => r.id === section.inclinedMeta!.workspaceId)
            : [];
        } else {
          const axis = type === 'longitudinal' ? 'y' : 'x';
          sectionRooms = rooms.filter(r => {
            if (!r.floor_polygon || r.floor_polygon.length < 3) return false;
            // Check if workspace has a stored polygon in this section
            const hasPoly = section.polygons?.some(p => p.id === r.id);
            if (hasPoly) return true;
            // Check if workspace intersects this section
            return findPolygonIntersections(r.floor_polygon, axis as 'x' | 'y', section.axisValue).length >= 2;
          });
        }
        return { section, rooms: sectionRooms.sort((a, b) => a.name.localeCompare(b.name, 'es')) };
      });

      // For vertical, also include unassigned rooms
      let unassigned: Workspace[] = [];
      if (type === 'vertical') {
        const assignedIds = new Set(sectionGroups.flatMap(g => g.rooms.map(r => r.id)));
        unassigned = rooms.filter(r => !r.vertical_section_id && !assignedIds.has(r.id));
      }

      const totalRooms = sectionGroups.reduce((sum, g) => sum + g.rooms.length, 0) + unassigned.length;
      return { type, label, sectionGroups, unassigned, totalRooms };
    });
  }, [rooms, verticalSections, longitudinalSections, transversalSections]);

  const canSave = formName.trim() && formVertices.length >= 3 && (formSectionId || showNewSection);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-walls'] }),
      queryClient.invalidateQueries({ queryKey: ['floor-plan-all-rooms'] }),
    ]);
  }, [queryClient, budgetId]);

  const renderWorkspaceCard = (r: Workspace) => {
    const poly = r.floor_polygon && r.floor_polygon.length >= 3 ? r.floor_polygon : null;
    const area = poly ? polygonArea(poly) : r.length * r.width;
    const vol = r.height ? area * r.height : null;
    const edgeCount = poly ? poly.length : 4;
    const geo = getGeometryType(r);
    const isExpanded = expandedIds.has(r.id);
    const roomWalls = allWalls.filter(w => w.room_id === r.id).sort((a, b) => a.wall_index - b.wall_index);
    const floorType = getFloorType(r);
    const ceilingType = getCeilingType(r);
    const isRenaming = renamingId === r.id;

    return (
      <div key={r.id} className="rounded-lg border bg-card overflow-hidden">
        <button
          onClick={() => toggleExpand(r.id)}
          className="flex items-center gap-2 p-2.5 w-full text-left hover:bg-accent/30 transition-colors"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          {poly ? <PolygonPreview vertices={poly} size={28} /> : <GeometryIcon type={geo} />}
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Input
                  className="h-6 text-xs w-40"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(r.id); if (e.key === 'Escape') setRenamingId(null); }}
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRename(r.id)}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setRenamingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <span
                className="text-sm font-medium cursor-text hover:text-primary"
                onClick={e => {
                  if (isAdmin) {
                    e.stopPropagation();
                    setRenamingId(r.id);
                    setRenameValue(r.name);
                  }
                }}
                title={isAdmin ? 'Clic para renombrar' : undefined}
              >
                {r.name}
                {r.is_base && <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1 border-dashed text-muted-foreground">Base</Badge>}
              </span>
            )}
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              <Badge variant="secondary" className="text-[10px] h-4 px-1">📐 {area.toFixed(2)} m²</Badge>
              {vol != null && vol > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">📦 {vol.toFixed(2)} m³</Badge>
              )}
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {edgeCount} aristas · {edgeCount + 2} caras
              </Badge>
              {r.height != null && r.height > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">Z {r.height}m</Badge>
              )}
            </div>
          </div>
          {isAdmin && !isRenaming && (
            <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(r)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteTarget(r)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </button>

        {isExpanded && (
          <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
            {/* Summary header */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold">{r.name}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1">📐 {area.toFixed(2)} m²</Badge>
              <Badge variant="outline" className="text-[10px] h-4 px-1">↔ {(poly ? polygonBBox(poly).w : r.length).toFixed(2)}m × ↕ {(poly ? polygonBBox(poly).h : r.width).toFixed(2)}m</Badge>
              {vol != null && vol > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">📦 {vol.toFixed(2)} m³</Badge>
              )}
            </div>

            {/* Section buttons — Z, Y, X */}
            {isAdmin && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Secciones disponibles</p>
                <div className="flex flex-wrap gap-1">
                  {/* Z section (vertical) */}
                  <Button
                    variant={gridEditId === r.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      if (gridEditId === r.id) {
                        setGridEditId(null);
                      } else {
                        openGridEditor(r);
                      }
                    }}
                  >
                    <Layers className="h-3 w-3" /> Sección Z
                    {r.vertical_section_id && (() => {
                      const vs = verticalSections.find(s => s.id === r.vertical_section_id);
                      return vs ? <span className="text-muted-foreground ml-0.5">({vs.name})</span> : null;
                    })()}
                  </Button>

                  {/* Y sections (longitudinal) */}
                  {longitudinalSections.map(ls => {
                    const isActive = activeSectionView[r.id]?.sectionId === ls.id;
                    const hasProjection = r.floor_polygon && r.floor_polygon.length >= 3 &&
                      findPolygonIntersections(r.floor_polygon, 'y', ls.axisValue).length >= 2;
                    if (!hasProjection) return null;
                    return (
                      <Button
                        key={ls.id}
                        variant={isActive ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => {
                          if (isActive) {
                            setActiveSectionView(prev => ({ ...prev, [r.id]: null }));
                          } else {
                            openSectionEditor(r.id, ls);
                          }
                        }}
                      >
                        <span className="text-chart-2 font-bold">Y</span> {ls.name} (Y={ls.axisValue})
                      </Button>
                    );
                  })}

                  {/* X sections (transversal) */}
                  {transversalSections.map(ts => {
                    const isActive = activeSectionView[r.id]?.sectionId === ts.id;
                    const hasProjection = r.floor_polygon && r.floor_polygon.length >= 3 &&
                      findPolygonIntersections(r.floor_polygon, 'x', ts.axisValue).length >= 2;
                    if (!hasProjection) return null;
                    return (
                      <Button
                        key={ts.id}
                        variant={isActive ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => {
                          if (isActive) {
                            setActiveSectionView(prev => ({ ...prev, [r.id]: null }));
                          } else {
                            openSectionEditor(r.id, ts);
                          }
                        }}
                      >
                        <span className="text-chart-4 font-bold">X</span> {ts.name} (X={ts.axisValue})
                      </Button>
                    );
                  })}

                  {longitudinalSections.length === 0 && transversalSections.length === 0 && (
                    <span className="text-[9px] text-muted-foreground italic ml-1">
                      Define secciones Y/X en la pestaña Secciones para ver cortes
                    </span>
                  )}

                  {/* 3D viewer button */}
                  {poly && poly.length >= 3 && (
                    <Button
                      variant={view3DId === r.id ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => {
                        if (view3DId === r.id) {
                          setView3DId(null);
                          setSelected3DFace(null);
                        } else {
                          setView3DId(r.id);
                          setGridEditId(null);
                          setActiveSectionView(prev => ({ ...prev, [r.id]: null }));
                          setSelected3DFace(null);
                        }
                      }}
                    >
                      <Box className="h-3 w-3" /> 3D
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 3D Workspace Viewer */}
            {view3DId === r.id && poly && poly.length >= 3 && (() => {
              const vSection3D = verticalSections.find(s => s.id === r.vertical_section_id);
              const zBase3D = vSection3D ? vSection3D.axisValue : 0;
              return (
                <div className="border rounded-lg p-2 bg-background">
                  <Workspace3DViewer
                    name={r.name}
                    polygon={poly}
                    height={r.height || floorPlan?.default_height || 2.5}
                    walls={roomWalls}
                    scaleXY={floorPlan?.block_length_mm || 625}
                    scaleZ={250}
                    zBase={zBase3D}
                    allSections={allSections}
                    roomId={r.id}
                    hasFloor={r.has_floor}
                    hasCeiling={r.has_ceiling}
                    onFaceClick={(faceType, faceIndex) => {
                      const key = `${faceType}_${faceIndex}`;
                      setSelected3DFace(prev => prev === key ? null : key);
                    }}
                    onFaceEdit={async (faceType, faceIndex, data) => {
                      if (faceType === 'pared') {
                        const wall = roomWalls.find(w => w.wall_index === faceIndex);
                        if (wall) {
                          const updates: Record<string, any> = {};
                          if (data.wallType) updates.wall_type = data.wallType;
                          if (data.height != null) updates.height = data.height;
                          if (Object.keys(updates).length > 0) {
                            await supabase.from('budget_floor_plan_walls').update(updates).eq('id', wall.id);
                            queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
                            toast.success(`Pared ${faceIndex} actualizada`);
                          }
                        }
                      }
                    }}
                    onVertexEdit={async (faceType, faceIndex, vertices) => {
                      const scaleZVal = 250 / 1000; // scaleZ in meters per grid unit
                      if (faceType === 'techo') {
                        // Each techo vertex Z maps to a wall height: height = (Z - zBase) * scaleZ_m
                        for (let vi = 0; vi < vertices.length; vi++) {
                          const wallIdx = vi + 1;
                          const wall = roomWalls.find(w => w.wall_index === wallIdx);
                          const newHeightM = (vertices[vi].z - zBase3D) * scaleZVal;
                          if (wall) {
                            await supabase.from('budget_floor_plan_walls').update({ height: Math.max(0, newHeightM) }).eq('id', wall.id);
                          } else {
                            // Create wall record if it doesn't exist
                            await supabase.from('budget_floor_plan_walls').insert({
                              room_id: r.id,
                              wall_index: wallIdx,
                              wall_type: 'exterior',
                              height: Math.max(0, newHeightM),
                            });
                          }
                        }
                        queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
                        toast.success('Vértices del techo actualizados — alturas de paredes recalculadas');
                      } else if (faceType === 'pared') {
                        // Wall face has 4 vertices: [base1, base2, top2, top1]
                        const nextIdx = (faceIndex % (poly?.length || 4)) + 1;
                        const wallCurr = roomWalls.find(w => w.wall_index === faceIndex);
                        const wallNext = roomWalls.find(w => w.wall_index === nextIdx);
                        if (vertices.length >= 4) {
                          const h1 = (vertices[3].z - zBase3D) * scaleZVal;
                          const h2 = (vertices[2].z - zBase3D) * scaleZVal;
                          if (wallCurr) {
                            await supabase.from('budget_floor_plan_walls').update({ height: Math.max(0, h1) }).eq('id', wallCurr.id);
                          } else {
                            await supabase.from('budget_floor_plan_walls').insert({
                              room_id: r.id, wall_index: faceIndex, wall_type: 'exterior', height: Math.max(0, h1),
                            });
                          }
                          if (wallNext) {
                            await supabase.from('budget_floor_plan_walls').update({ height: Math.max(0, h2) }).eq('id', wallNext.id);
                          } else {
                            await supabase.from('budget_floor_plan_walls').insert({
                              room_id: r.id, wall_index: nextIdx, wall_type: 'exterior', height: Math.max(0, h2),
                            });
                          }
                        }
                        queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
                        toast.success(`Alturas de paredes actualizadas desde vértices`);
                      }
                    }}
                    onNavigateTo2D={(faceType, faceIndex) => {
                      handleFaceNavigateTo2D({
                        workspaceId: r.id,
                        workspaceName: r.name,
                        faceType,
                        faceIndex,
                      });
                    }}
                    selectedFace={selected3DFace}
                  />
                </div>
              );
            })()}

            {/* Inline Z grid editor */}
            {gridEditId === r.id && (
              <div className="space-y-2 border rounded-lg p-2 bg-background">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[8px] text-muted-foreground font-medium">Ampliar cuadrícula:</span>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, left: e.left + 2 }))}>
                    <ChevronLeft className="h-3 w-3" />←X
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, right: e.right + 2 }))}>
                    X→<ChevronRight className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, top: e.top + 2 }))}>
                    <ChevronUp className="h-3 w-3" />↑Y
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, bottom: e.bottom + 2 }))}>
                    Y↓<ChevronDown className="h-3 w-3" />
                  </Button>
                  {(gridExtend.left + gridExtend.right + gridExtend.top + gridExtend.bottom > 0) && (
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => setGridExtend({ left: 0, right: 0, top: 0, bottom: 0 })}>
                      Reset
                    </Button>
                  )}
                </div>
                <GridPolygonDrawer
                  key={`workspace-z-${r.id}-${r.vertical_section_id ?? 'none'}`}
                  originTopLeft
                  vertices={gridEditVertices}
                  onChange={setGridEditVertices}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  gridOffsetX={gridBounds.minCol}
                  gridOffsetY={gridBounds.minRow}
                  placedRooms={allFloorPlanRooms}
                  cellSizeM={cellSizeM}
                  activeRoomId={r.id}
                  activeName={r.name}
                  otherPolygons={rooms
                    .filter(other => other.id !== r.id && other.vertical_section_id === r.vertical_section_id && other.floor_polygon && other.floor_polygon.length >= 3)
                    .map(other => ({ id: other.id, name: other.name, vertices: other.floor_polygon!, isBase: other.is_base, walls: allWalls.filter(w => w.room_id === other.id) }))}
                  activeWalls={allWalls.filter(w => w.room_id === r.id)}
                  onSwitchRoom={switchGridEditRoom}
                  onOtherPolygonChange={handleOtherPolygonChangeZ}
                   onOtherPolygonRename={handleOtherPolygonRename}
                   onSelectOtherWorkspace={setSelectedOtherWorkspaceId}
                   perimeterPolygon={getSectionPerimeter(r.vertical_section_id)}
                   pdfTitle="Espacio de trabajo"
                   pdfSubtitle={r.name}
                   onWallClick={(idx) => {
                     setSelectedWallMap(prev => ({ ...prev, [r.id]: idx }));
                     if (!expandedIds.has(r.id)) {
                       setExpandedIds(prev => { const n = new Set(prev); n.add(r.id); return n; });
                     }
                   }}
                   onWallSelect={(wallDbIdx) => openWallPanel(r.id, wallDbIdx, 'z')}
                   initialRulerLines={getSavedRulerLines(`z_${r.id}`)}
                    onSaveRulerLines={(lines) => saveRulerLines(`z_${r.id}`, lines)}
                    ridgeLine={ridgeLine}
                    sectionType="vertical"
                  />
                 {/* Sibling workspace inline property editor */}
                 {selectedOtherWorkspaceId && (() => {
                   const sibRoom = rooms.find(rm => rm.id === selectedOtherWorkspaceId);
                   if (!sibRoom) return null;
                   const sibWalls = allWalls.filter(w => w.room_id === sibRoom.id);
                   const sibPoly = sibRoom.floor_polygon;
                   const sibEdgeCount = sibPoly ? sibPoly.length : 0;
                   return (
                     <div className="border rounded p-2 space-y-1.5 bg-accent/10">
                       <div className="flex items-center gap-2">
                         <span className="text-[10px] font-semibold">✏️ Editando: {sibRoom.name}</span>
                         <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setSelectedOtherWorkspaceId(null)}>✕ Cerrar</Button>
                       </div>
                       <FaceRow label="🟫 Suelo" type={getFloorType(sibRoom)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(sibRoom.id, 'has_floor', v as FloorCeilingType)} />
                       {Array.from({ length: sibEdgeCount }).map((_, i) => {
                         const dbWallIndex = i + 1;
                         const wall = sibWalls.find(w => w.wall_index === dbWallIndex);
                         return (
                            <FaceRow key={i} label={`🧱 P${i + 1}`} type={normalizeWallType(wall?.wall_type)} options={WALL_TYPES} onChange={(v) => ensureAndUpdateWallType(sibRoom.id, i, v, wall?.id)} />
                         );
                       })}
                       <FaceRow label="⬜ Techo" type={getCeilingType(sibRoom)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(sibRoom.id, 'has_ceiling', v as FloorCeilingType)} />
                       <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-accent/30" onClick={() => openEspacioPanel(sibRoom.id)}>
                         <span className="text-xs">🔷 Espacio (volumen interior)</span>
                         <Badge variant="outline" className="text-[9px] h-4">Objetos →</Badge>
                       </div>
                     </div>
                   );
                 })()}
                 {/* Inline face editor near Z grid */}
                 {gridEditVertices.length >= 3 && (
                   <div className="border rounded p-2 space-y-1 bg-muted/20">
                     <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Caras del volumen — {r.name}</p>
                     <FaceRow label="🟫 Suelo" type={getFloorType(r)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(r.id, 'has_floor', v as FloorCeilingType)} />
                     {Array.from({ length: gridEditVertices.length }).map((_, i) => {
                       const dbWallIndex = i + 1;
                       const wall = roomWalls.find(w => w.wall_index === dbWallIndex);
                       return (
                         <FaceRow key={i} label={`🧱 P${i + 1}`} type={normalizeWallType(wall?.wall_type)} options={WALL_TYPES} onChange={(v) => ensureAndUpdateWallType(r.id, i, v, wall?.id)} />
                       );
                     })}
                      <FaceRow label={r.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'} type={getCeilingType(r)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(r.id, 'has_ceiling', v as FloorCeilingType)} />
                      <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-accent/30" onClick={() => openEspacioPanel(r.id)}>
                        <span className="text-xs">🔷 Espacio (volumen interior)</span>
                        <Badge variant="outline" className="text-[9px] h-4">Objetos →</Badge>
                      </div>
                   </div>
                 )}
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {gridEditVertices.length >= 3 && (
                      <>
                        <Badge variant="secondary" className="text-[10px] h-4">📐 {(polygonArea(gridEditVertices) * cellSizeM * cellSizeM).toFixed(2)} m²</Badge>
                        <Badge variant="outline" className="text-[10px] h-4">↔ {(polygonBBox(gridEditVertices).w * cellSizeM).toFixed(2)}m × ↕ {(polygonBBox(gridEditVertices).h * cellSizeM).toFixed(2)}m</Badge>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setGridEditId(null); restoreReturnTo3D(); }}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => saveGridEditorPolygon(r.id)} disabled={gridEditVertices.length < 3}>
                      <Save className="h-3 w-3" /> Guardar polígono
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Inline Y/X section editor */}
            {activeSectionView[r.id] && (() => {
              const view = activeSectionView[r.id]!;
              const section = allSections.find(s => s.id === view.sectionId);
              if (!section) return null;
              const isLongitudinal = section.sectionType === 'longitudinal';
              const hLabel = isLongitudinal ? 'X' : 'Y';
              const vLabel = 'Z';
              const scaleH = floorPlan?.block_length_mm || 625;
              const scaleV = 250;
              const scaleHm = scaleH / 1000;
              const scaleVm = scaleV / 1000;

              const otherProjections: OtherPolygon[] = rooms
                .filter(other => other.id !== r.id && other.floor_polygon && other.floor_polygon.length >= 3)
                .map(other => {
                  const existingPoly = section.polygons?.find(p => p.id === other.id);
                  if (existingPoly && existingPoly.vertices.length >= 3) {
                    return { id: other.id, name: other.name, vertices: existingPoly.vertices.map(v => ({ x: v.x, y: v.y })), isBase: other.is_base, walls: allWalls.filter(w => w.room_id === other.id) };
                  }
                  const defaultProj = computeDefaultProjection(other, section);
                  if (defaultProj.length >= 3) {
                    return { id: other.id, name: other.name, vertices: defaultProj, isBase: other.is_base, walls: allWalls.filter(w => w.room_id === other.id) };
                  }
                  return null;
                })
                .filter(Boolean) as OtherPolygon[];

              const allProjVerts: PolygonVertex[] = [...sectionEditVertices];
              for (const op of otherProjections) allProjVerts.push(...op.vertices);
              const projBBox = allProjVerts.length >= 2 ? polygonBBox(allProjVerts) : { minX: -3, maxX: 20, minY: -3, maxY: 20 };
              const secGridMinCol = Math.floor(projBBox.minX) - 2;
              const secGridMaxCol = Math.ceil(projBBox.maxX) + 2;
              const secGridMinRow = Math.floor(projBBox.minY) - 2;
              const secGridMaxRow = Math.ceil(projBBox.maxY) + 2;
              const secGridW = secGridMaxCol - secGridMinCol + 1;
              const secGridH = secGridMaxRow - secGridMinRow + 1;

              return (
                <div className="space-y-2 border rounded-lg p-2 bg-background">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {isLongitudinal ? '↔ Longitudinal' : '↕ Transversal'} — {section.name} ({section.axis}={section.axisValue})
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {hLabel}: {scaleH}mm · {vLabel}: {scaleV}mm
                    </span>
                  </div>
                  <GridPolygonDrawer
                    originTopLeft={false}
                    vertices={sectionEditVertices}
                    onChange={setSectionEditVertices}
                    gridWidth={secGridW}
                    gridHeight={secGridH}
                    gridOffsetX={secGridMinCol}
                    gridOffsetY={secGridMinRow}
                    cellSizeM={1}
                    activeName={r.name}
                    otherPolygons={otherProjections}
                    onSwitchRoom={(targetId) => {
                      const targetSection = allSections.find(s => s.id === view.sectionId);
                      if (targetSection) openSectionEditor(targetId, targetSection);
                    }}
                    onOtherPolygonChange={(otherId, newVerts) => handleOtherPolygonChangeSection(otherId, newVerts, view.sectionId)}
                     onOtherPolygonRename={handleOtherPolygonRename}
                     onSelectOtherWorkspace={setSelectedOtherWorkspaceId}
                     pdfTitle={`${section.name} — ${r.name}`}
                     pdfSubtitle={`${section.axis}=${section.axisValue}`}
                     hAxisLabel={hLabel}
                     vAxisLabel={vLabel}
                     hScaleMm={scaleH}
                     vScaleMm={scaleV}
                     activeWalls={allWalls.filter(w => w.room_id === r.id)}
                     initialRulerLines={getSavedRulerLines(`sec_${r.id}_${view.sectionId}`)}
                     onSaveRulerLines={(lines) => saveRulerLines(`sec_${r.id}_${view.sectionId}`, lines)}
                     onWallSelect={(wallDbIdx) => openWallPanel(r.id, wallDbIdx, 'xy')}
                     ridgeLine={ridgeLine}
                     sectionType={isLongitudinal ? 'longitudinal' : 'transversal'}
                     sectionAxisValue={parseFloat(String(section.axisValue)) || 0}
                   />
                   {/* Sibling workspace inline property editor (Y/X) */}
                   {selectedOtherWorkspaceId && (() => {
                     const sibRoom = rooms.find(rm => rm.id === selectedOtherWorkspaceId);
                     if (!sibRoom) return null;
                     const sibWalls = allWalls.filter(w => w.room_id === sibRoom.id);
                     const sibPoly = sibRoom.floor_polygon;
                     const sibEdgeCount = sibPoly ? sibPoly.length : 0;
                     return (
                       <div className="border rounded p-2 space-y-1.5 bg-accent/10">
                         <div className="flex items-center gap-2">
                           <span className="text-[10px] font-semibold">✏️ Editando: {sibRoom.name}</span>
                           <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setSelectedOtherWorkspaceId(null)}>✕ Cerrar</Button>
                         </div>
                         <FaceRow label="🟫 Suelo" type={getFloorType(sibRoom)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(sibRoom.id, 'has_floor', v as FloorCeilingType)} />
                         {Array.from({ length: sibEdgeCount }).map((_, i) => {
                           const dbWallIndex = i + 1;
                           const wall = sibWalls.find(w => w.wall_index === dbWallIndex);
                           return (
                             <FaceRow key={i} label={`🧱 P${i + 1}`} type={normalizeWallType(wall?.wall_type)} options={WALL_TYPES} onChange={(v) => ensureAndUpdateWallType(sibRoom.id, i, v, wall?.id)} />
                           );
                         })}
                          <FaceRow label="⬜ Techo" type={getCeilingType(sibRoom)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(sibRoom.id, 'has_ceiling', v as FloorCeilingType)} />
                          <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-accent/30" onClick={() => openEspacioPanel(sibRoom.id)}>
                            <span className="text-xs">🔷 Espacio (volumen interior)</span>
                            <Badge variant="outline" className="text-[9px] h-4">Objetos →</Badge>
                          </div>
                       </div>
                     );
                   })()}
                   {/* Inline face editor near Y/X grid */}
                   {sectionEditVertices.length >= 3 && (
                     <div className="border rounded p-2 space-y-1 bg-muted/20">
                       <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Caras del volumen — {r.name}</p>
                       <FaceRow label="🟫 Suelo" type={getFloorType(r)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(r.id, 'has_floor', v as FloorCeilingType)} />
                       {Array.from({ length: sectionEditVertices.length }).map((_, i) => {
                         const dbWallIndex = i + 1;
                         const wall = roomWalls.find(w => w.wall_index === dbWallIndex);
                         return (
                           <FaceRow key={i} label={`🧱 P${i + 1}`} type={normalizeWallType(wall?.wall_type)} options={WALL_TYPES} onChange={(v) => ensureAndUpdateWallType(r.id, i, v, wall?.id)} />
                         );
                       })}
                        <FaceRow label={r.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'} type={getCeilingType(r)} options={FLOOR_CEILING_TYPES} onChange={(v) => updateFloorCeiling(r.id, 'has_ceiling', v as FloorCeilingType)} />
                        <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-accent/30" onClick={() => openEspacioPanel(r.id)}>
                          <span className="text-xs">🔷 Espacio (volumen interior)</span>
                          <Badge variant="outline" className="text-[9px] h-4">Objetos →</Badge>
                        </div>
                     </div>
                   )}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {sectionEditVertices.length >= 3 && (
                        <>
                          <Badge variant="secondary" className="text-[10px] h-4">📐 {(polygonArea(sectionEditVertices) * scaleHm * scaleVm).toFixed(2)} m²</Badge>
                          <Badge variant="outline" className="text-[10px] h-4">↔ {(polygonBBox(sectionEditVertices).w * scaleHm * 1000).toFixed(0)}mm × ↕ {(polygonBBox(sectionEditVertices).h * scaleVm * 1000).toFixed(0)}mm</Badge>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setActiveSectionView(prev => ({ ...prev, [r.id]: null })); restoreReturnTo3D(); }}>
                        Cancelar
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => {
                        const defaultVerts = computeDefaultProjection(r, section);
                        setSectionEditVertices(defaultVerts);
                      }}>
                        Resetear
                      </Button>
                      <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => saveSectionPolygon(r.id)} disabled={sectionEditVertices.length < 3}>
                        <Save className="h-3 w-3" /> Guardar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Polygon with wall numbers + vertices list */}
            {poly && gridEditId !== r.id && (
              <div className="space-y-2">
                <div className="flex gap-3 items-start">
                  <PolygonPreviewWithWalls
                    vertices={poly}
                    size={140}
                    selectedWall={selectedWallMap[r.id] ?? null}
                    onSelectWall={(idx) => setSelectedWallMap(prev => ({ ...prev, [r.id]: prev[r.id] === idx ? null : idx }))}
                  />
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      Polígono base — {poly.length} vértices
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {poly.map((v, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] h-4 px-1 gap-0.5">
                          <MapPin className="h-2.5 w-2.5" />
                          ({v.x}, {v.y})
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">Pulsa un nº de pared para ver/editar sus datos</p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Caras del volumen
            </p>

            {/* Floor */}
            <FaceRow
              label="🟫 Suelo"
              type={floorType}
              options={FLOOR_CEILING_TYPES}
              onChange={(v) => updateFloorCeiling(r.id, 'has_floor', v as FloorCeilingType)}
            />
            {/* Walls — one per edge */}
            {Array.from({ length: edgeCount }).map((_, i) => {
              const dbWallIndex = i + 1;
              const wall = roomWalls.find(w => w.wall_index === dbWallIndex);
              const edgeLen = poly ? edgeLength(poly[i], poly[(i + 1) % poly.length]) : null;
              const isWallSelected = selectedWallMap[r.id] === i;
              const defaultHMm = (r.height || floorPlan?.default_height || 2.5) * 1000;
              return (
                <FaceRow
                  key={i}
                  label={`🧱 P${i + 1}${edgeLen ? ` (${edgeLen.toFixed(2)}m)` : ''}`}
                  type={normalizeWallType(wall?.wall_type)}
                  options={WALL_TYPES}
                  onChange={(v) => ensureAndUpdateWallType(r.id, i, v, wall?.id)}
                  highlighted={isWallSelected}
                  onLabelClick={() => setSelectedWallMap(prev => ({ ...prev, [r.id]: prev[r.id] === i ? null : i }))}
                  heightMm={wall?.height != null ? wall.height * 1000 : null}
                  defaultHeightMm={defaultHMm}
                  onHeightChange={(mm) => updateWallHeight(r.id, i, mm, wall?.id)}
                />
              );
            })}

            {/* Ceiling */}
            <FaceRow
              label={r.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'}
              type={ceilingType}
              options={FLOOR_CEILING_TYPES}
              onChange={(v) => updateFloorCeiling(r.id, 'has_ceiling', v as FloorCeilingType)}
            />

            {/* Espacio (interior volume) */}
            <div className="flex items-center justify-between gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-accent/30" onClick={() => openEspacioPanel(r.id)}>
              <span className="text-xs">🔷 Espacio (volumen interior)</span>
              <Badge variant="outline" className="text-[9px] h-4">Objetos →</Badge>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Espacios de trabajo</h3>
        <div className="flex items-center gap-1">
          {rooms.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShow3DList(true)}>
              <Box className="h-3 w-3" /> Listado 3D
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={async () => { await refetchAll(); toast.success('Datos actualizados'); }} title="Actualizar datos">
            <RefreshCw className="h-3 w-3" /> Actualizar
          </Button>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setShowQuickSectionForm(v => !v)}
              >
                <Grid3x3 className="h-3 w-3" /> Nueva sección Z
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setFormHeight(String(floorPlan?.default_height ?? '')); setShowForm(true); }}>
                <Plus className="h-3 w-3" /> Añadir
              </Button>
            </>
          )}
        </div>
      </div>

      {isAdmin && showQuickSectionForm && (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Crear Sección Vertical limpia (Z)</p>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowQuickSectionForm(false)}>
              Cancelar
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Nombre</Label>
              <Input
                className="h-7 text-xs"
                placeholder="Ej: Sección Z=0"
                value={quickSectionName}
                onChange={(e) => setQuickSectionName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px]">Eje Z</Label>
              <Input
                className="h-7 text-xs"
                type="number"
                placeholder="0"
                value={quickSectionAxisValue}
                onChange={(e) => setQuickSectionAxisValue(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-6 text-[10px]"
              onClick={handleCreateStandaloneVerticalSection}
              disabled={!quickSectionName.trim()}
            >
              Crear sección
            </Button>
          </div>
        </div>
      )}

      {/* ── 3D List View ── */}
      {show3DList && (() => {
        const wsEntries = rooms
          .filter(r => r.floor_polygon && r.floor_polygon.length >= 3)
          .map(r => {
            const vSec = verticalSections.find(s => s.id === r.vertical_section_id);
            const roomWalls = allWalls.filter(w => w.room_id === r.id).sort((a, b) => a.wall_index - b.wall_index);
            return {
              id: r.id,
              name: r.name,
              polygon: r.floor_polygon!,
              height: r.height || floorPlan?.default_height || 2.5,
              walls: roomWalls,
              zBase: vSec ? vSec.axisValue : 0,
              sectionName: vSec ? vSec.name : 'Sin sección',
              hasFloor: r.has_floor,
              hasCeiling: r.has_ceiling,
            };
          });
        return (
          <Workspace3DListView
            workspaces={wsEntries}
            scaleXY={floorPlan?.block_length_mm || 625}
            scaleZ={250}
            onClose={() => setShow3DList(false)}
            onFaceDoubleClick={handleFaceNavigateTo2D}
            allSections={allSections}
          />
        );
      })()}

      {/* ── Creation/Edit form ── */}
      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          {/* Section selector */}
          <div>
            <Label className="text-[10px] font-semibold">Sección Vertical *</Label>
            {verticalSections.length === 0 && !showNewSection ? (
              <div className="text-xs text-muted-foreground mt-1 space-y-1">
                <p>No hay secciones verticales registradas.</p>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowNewSection(true)}>
                  <Plus className="h-3 w-3" /> Crear Sección Vertical
                </Button>
              </div>
            ) : !showNewSection ? (
              <div className="flex gap-1 items-end">
                <div className="flex-1">
                  <Select value={formSectionId} onValueChange={setFormSectionId}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Seleccionar sección..." />
                    </SelectTrigger>
                    <SelectContent>
                      {verticalSections.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          <span className="flex items-center gap-1">
                            <Grid3x3 className="h-3 w-3 text-primary" />
                            {s.name} <span className="text-muted-foreground">(Z={s.axisValue})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 gap-0.5" onClick={() => setShowNewSection(true)}>
                  <Plus className="h-3 w-3" /> Nueva
                </Button>
              </div>
            ) : null}

            {showNewSection && (
              <div className="mt-1 p-2 rounded border border-primary/30 bg-primary/5 space-y-1.5">
                <p className="text-[10px] font-medium text-primary">Nueva Sección Vertical</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Nombre</Label>
                    <Input className="h-7 text-xs" placeholder="Ej: Sección 1" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Eje Z</Label>
                    <Input className="h-7 text-xs" type="number" placeholder="0" value={newSectionAxisValue} onChange={e => setNewSectionAxisValue(e.target.value)} />
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setShowNewSection(false)}>Cancelar</Button>
              </div>
            )}
          </div>

          {/* Name + Height */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Nombre</Label>
              <Input className="h-7 text-xs" placeholder="Ej: Cocina" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px]">Alto Z (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="2.6" value={formHeight} onChange={e => setFormHeight(e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsBase}
                  onChange={e => setFormIsBase(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
                <span className="text-[10px] font-medium text-muted-foreground">Base (fondo de sección)</span>
              </label>
            </div>
          </div>

          {/* Input mode toggle + editor */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Button
                variant={inputMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => setInputMode('manual')}
              >
                <List className="h-3 w-3" /> Coordenadas
              </Button>
              <Button
                variant={inputMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => setInputMode('grid')}
              >
                <MousePointerClick className="h-3 w-3" /> Dibujar en cuadrícula
              </Button>
            </div>

            {inputMode === 'manual' ? (
              <VertexEditor vertices={formVertices} onChange={setFormVertices} />
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[8px] text-muted-foreground font-medium">Ampliar cuadrícula:</span>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, left: e.left + 2 }))}>
                    <ChevronLeft className="h-3 w-3" />←X
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, right: e.right + 2 }))}>
                    X→<ChevronRight className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, top: e.top + 2 }))}>
                    <ChevronUp className="h-3 w-3" />↑Y
                  </Button>
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5" onClick={() => setGridExtend(e => ({ ...e, bottom: e.bottom + 2 }))}>
                    Y↓<ChevronDown className="h-3 w-3" />
                  </Button>
                  {(gridExtend.left + gridExtend.right + gridExtend.top + gridExtend.bottom > 0) && (
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => setGridExtend({ left: 0, right: 0, top: 0, bottom: 0 })}>
                      Reset
                    </Button>
                  )}
                </div>
                <GridPolygonDrawer
                  key={`form-z-${formSectionId || 'none'}-${editingId || 'new'}`}
                  originTopLeft
                  vertices={formVertices}
                  onChange={setFormVertices}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  gridOffsetX={gridBounds.minCol}
                  gridOffsetY={gridBounds.minRow}
                  placedRooms={allFloorPlanRooms}
                  cellSizeM={cellSizeM}
                  perimeterPolygon={getSectionPerimeter(formSectionId)}
                  activeName={formName || undefined}
                  otherPolygons={rooms
                    .filter(other => other.id !== editingId && other.vertical_section_id === formSectionId && other.floor_polygon && other.floor_polygon.length >= 3)
                    .map(other => ({ id: other.id, name: other.name, vertices: other.floor_polygon!, isBase: other.is_base, walls: allWalls.filter(w => w.room_id === other.id) }))}
                  activeWalls={editingId ? allWalls.filter(w => w.room_id === editingId) : []}
                  onSwitchRoom={editingId ? switchGridEditRoom : undefined}
                  onOtherPolygonChange={handleOtherPolygonChangeZ}
                  onOtherPolygonRename={handleOtherPolygonRename}
                  pdfTitle="Espacio de trabajo"
                   pdfSubtitle={formName || 'Nuevo espacio'}
                   ridgeLine={ridgeLine}
                   sectionType="vertical"
                 />
              </div>
            )}
          </div>

          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={!canSave}>
              {editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </div>
      )}

      {rooms.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground text-center py-4">No hay espacios de trabajo definidos</p>
      )}

       {/* ── Grouped list by Section Type → Section → Workspaces ── */}
      <div className="space-y-3">
        {groupedByType.map(({ type, label, sectionGroups, unassigned, totalRooms }) => {
          if (totalRooms === 0 && sectionGroups.length === 0) return null;
          const isTypeCollapsed = collapsedSectionTypes.has(type);
          return (
            <div key={type} className="space-y-1">
              {/* Section Type header */}
              <button
                onClick={() => setCollapsedSectionTypes(prev => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type); else next.add(type);
                  return next;
                })}
                className="flex items-center gap-1.5 px-1 w-full text-left hover:bg-accent/30 rounded transition-colors py-1.5"
              >
                {isTypeCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-xs font-bold">{label}</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1">{totalRooms}</Badge>
              </button>

              {!isTypeCollapsed && (
                <div className="pl-3 space-y-2">
                  {sectionGroups.map(({ section, rooms: groupRooms }) => {
                    if (groupRooms.length === 0) return null;
                    const sectionKey = `${type}-${section.id}`;
                    const isSectionCollapsed = collapsedSections.has(sectionKey);
                    return (
                      <div key={section.id} className="space-y-1.5">
                        <button
                          onClick={() => setCollapsedSections(prev => {
                            const next = new Set(prev);
                            if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
                            return next;
                          })}
                          className="flex items-center gap-1.5 px-1 w-full text-left hover:bg-accent/30 rounded transition-colors py-1"
                        >
                          {isSectionCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <Grid3x3 className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold">{section.name}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{section.axis}={section.axisValue}</Badge>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">{groupRooms.length}</Badge>
                        </button>

                        {!isSectionCollapsed && groupRooms.map(r => renderWorkspaceCard(r))}
                      </div>
                    );
                  })}

                  {/* Unassigned rooms (only for vertical type) */}
                  {unassigned.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 py-1">
                        <span className="text-xs font-semibold text-muted-foreground">Sin sección asignada</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">{unassigned.length}</Badge>
                      </div>
                      {unassigned.map(r => renderWorkspaceCard(r))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Backups list */}
      <DeletionBackupsList
        budgetId={budgetId}
        module="workspaces"
        onRestore={handleRestoreBackup}
      />
      {/* Delete with backup dialog */}
      {deleteTarget && (
        <DeleteWithBackupDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          onConfirmDelete={handleDeleteConfirmed}
          entityName={deleteTarget.name}
          entityId={deleteTarget.id}
          entityType="workspace"
          module="workspaces"
          budgetId={budgetId}
          backupData={{
            id: deleteTarget.id,
            name: deleteTarget.name,
            length: deleteTarget.length,
            width: deleteTarget.width,
            height: deleteTarget.height,
            has_floor: deleteTarget.has_floor,
            has_ceiling: deleteTarget.has_ceiling,
            has_roof: deleteTarget.has_roof,
            vertical_section_id: deleteTarget.vertical_section_id,
            floor_polygon: deleteTarget.floor_polygon,
          }}
        />
      )}

      {/* Wall Objects Panel */}
      <WallObjectsPanel
        open={wallPanelOpen}
        onOpenChange={setWallPanelOpen}
        wallId={wallPanelWallId}
        wallIndex={wallPanelWallIndex}
        wallType={wallPanelWallType}
        wallLabel={wallPanelLabel}
        roomName={wallPanelRoomName}
        onWallTypeChange={handleWallPanelTypeChange}
      />
    </div>
  );
}

function FaceRow({
  label, type, options, onChange, highlighted, onLabelClick, heightMm, onHeightChange, defaultHeightMm,
}: {
  label: string;
  type: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  highlighted?: boolean;
  onLabelClick?: () => void;
  heightMm?: number | null;
  onHeightChange?: (mm: number | null) => void;
  defaultHeightMm?: number;
}) {
  const [editingHeight, setEditingHeight] = useState(false);
  const [tempHeight, setTempHeight] = useState('');

  const isCustomHeight = heightMm != null && heightMm > 0;
  const displayHeight = isCustomHeight ? heightMm : defaultHeightMm;

  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 px-1 rounded ${highlighted ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
      <span
        className={`text-xs flex-shrink-0 ${onLabelClick ? 'cursor-pointer hover:text-primary underline-offset-2 hover:underline' : ''}`}
        onClick={onLabelClick}
      >
        {label}
      </span>
      <div className="flex items-center gap-1 flex-1 justify-end">
        {onHeightChange && (
          editingHeight ? (
            <div className="flex items-center gap-0.5">
              <Input
                className="h-5 w-16 text-[9px] px-1"
                type="number"
                placeholder={String(defaultHeightMm || '')}
                value={tempHeight}
                onChange={e => setTempHeight(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = tempHeight.trim() ? parseFloat(tempHeight) : null;
                    onHeightChange(val === 0 ? 0 : val);
                    setEditingHeight(false);
                  }
                  if (e.key === 'Escape') setEditingHeight(false);
                }}
                onBlur={() => {
                  const val = tempHeight.trim() ? parseFloat(tempHeight) : null;
                  onHeightChange(val === 0 ? 0 : val);
                  setEditingHeight(false);
                }}
              />
              <span className="text-[8px] text-muted-foreground">mm</span>
            </div>
          ) : (
            <Badge
              variant={isCustomHeight ? 'default' : 'outline'}
              className={`text-[8px] h-4 px-1 cursor-pointer ${isCustomHeight ? 'bg-amber-500/20 text-amber-700 border-amber-300 hover:bg-amber-500/30' : 'hover:bg-accent/50'}`}
              onClick={() => {
                setTempHeight(isCustomHeight ? String(heightMm) : '');
                setEditingHeight(true);
              }}
              title="Altura personalizada de esta pared (mm). Click para editar."
            >
              ↕ {displayHeight != null ? `${displayHeight}mm` : 'Auto'}
            </Badge>
          )
        )}
        <Select value={type} onValueChange={onChange}>
          <SelectTrigger className="h-6 w-[120px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
