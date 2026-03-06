import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, Triangle, Pyramid, Cuboid, Grid3x3, MapPin, X, MousePointerClick, List, Layers, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { CustomSection } from './CustomSectionManager';

interface BudgetWorkspacesTabProps {
  budgetId: string;
  isAdmin: boolean;
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
  floor_polygon: PolygonVertex[] | null;
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
}

type GeometryType = 'cube' | 'prism' | 'pyramid';
type FloorCeilingType = 'normal' | 'invisible' | 'shared';

const WALL_TYPES = [
  { value: 'external', label: 'Externa' },
  { value: 'internal', label: 'Interna' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'external_shared', label: 'Ext. compartida' },
  { value: 'internal_shared', label: 'Int. compartida' },
];

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

/** Wall label from edge index */
function wallLabel(index: number, total: number): string {
  if (total <= 4) {
    const labels = ['Superior', 'Derecha', 'Inferior', 'Izquierda'];
    return labels[index] || `Pared ${index + 1}`;
  }
  return `Pared ${index + 1}`;
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
  perimeterPolygon?: PolygonVertex[];
  activeName?: string;
  originTopLeft?: boolean;
}

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

function GridPolygonDrawer({ vertices, onChange, gridWidth = 20, gridHeight = 16, gridOffsetX = 0, gridOffsetY = 0, placedRooms = [], cellSizeM = 1, otherPolygons = [], activeRoomId, onSwitchRoom, perimeterPolygon, activeName, originTopLeft = false }: GridPolygonDrawerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Polygon is "closed" when it has >= 3 vertices and was explicitly closed by clicking first vertex
  const [isClosed, setIsClosed] = useState(() => vertices.length >= 3);

  const baseCellSize = 28;
  const cellSize = Math.round(baseCellSize * zoomLevel);
  const pad = 30;
  const svgW = gridWidth * cellSize + pad * 2;
  const svgH = gridHeight * cellSize + pad * 2;

  const toSvg = (gx: number, gy: number) => ({
    sx: pad + (gx - gridOffsetX) * cellSize,
    sy: originTopLeft
      ? pad + (gy - gridOffsetY) * cellSize
      : pad + (gridHeight - (gy - gridOffsetY)) * cellSize,
  });

  const fromSvg = (sx: number, sy: number) => ({
    gx: Math.round((sx - pad) / cellSize + gridOffsetX),
    gy: originTopLeft
      ? Math.round((sy - pad) / cellSize + gridOffsetY)
      : Math.round(gridOffsetY + gridHeight - (sy - pad) / cellSize),
  });

  const handleClick = (gx: number, gy: number) => {
    if (isClosed) return; // In closed/edit mode, no new vertices
    // Close polygon by clicking first vertex
    if (vertices.length >= 3 && gx === vertices[0].x && gy === vertices[0].y) {
      setIsClosed(true);
      return;
    }
    if (vertices.some(v => v.x === gx && v.y === gy)) return;
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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { gx, gy } = fromSvg(sx, sy);
    // Snap to grid
    const snappedX = Math.max(gridOffsetX, Math.min(gridOffsetX + gridWidth, gx));
    const snappedY = Math.max(gridOffsetY, Math.min(gridOffsetY + gridHeight, gy));
    if (snappedX !== vertices[draggingIdx].x || snappedY !== vertices[draggingIdx].y) {
      const next = [...vertices];
      next[draggingIdx] = { x: snappedX, y: snappedY };
      onChange(next);
    }
  };

  const handleMouseUp = () => {
    setDraggingIdx(null);
  };

  const areaM2 = polygonArea(vertices) * cellSizeM * cellSizeM;
  const closingLen = vertices.length >= 3 ? edgeLength(vertices[vertices.length - 1], vertices[0]) * cellSizeM : 0;

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

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground">Zoom:</span>
        {[1, 1.5, 2, 2.5].map(z => (
          <Button
            key={z}
            variant={zoomLevel === z ? 'default' : 'outline'}
            size="sm"
            className="h-5 text-[10px] px-2"
            onClick={() => setZoomLevel(z)}
          >
            {z === 1 ? '1×' : `${z}×`}
          </Button>
        ))}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <Badge variant={isClosed ? 'default' : 'outline'} className="text-[9px] h-4 gap-0.5">
          {isClosed ? '✅ Cerrado' : '⏳ Abierto'}
        </Badge>
        <span className="text-[9px] text-muted-foreground">
          {vertices.length} vértice{vertices.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Legend for other polygons */}
      {otherPolygons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] text-muted-foreground">Espacios:</span>
          {otherPolygons.map((op) => (
            <button
              key={op.id}
              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border hover:bg-accent/50 transition-colors"
              style={{ borderColor: 'hsl(200 80% 50%)' }}
              onClick={() => onSwitchRoom?.(op.id)}
              title={`Editar ${op.name}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'hsl(200 80% 50%)' }} />
              {op.name}
            </button>
          ))}
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-primary bg-primary/10 font-semibold">
            <span className="w-2 h-2 rounded-full shrink-0 bg-primary" />
            Editando
          </span>
        </div>
      )}

      <div className="overflow-auto rounded border bg-background max-h-[400px]">
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          className="block"
          style={{ minWidth: svgW, cursor: draggingIdx !== null ? 'grabbing' : undefined }}
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
                  y={originTopLeft ? sy : sy - cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={isEven ? 'hsl(var(--muted))' : 'hsl(var(--background))'}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                />
              );
            })
          )}

          {/* Perimeter polygon from the section */}
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
          {/* Perimeter vertex markers */}
          {perimeterPolygon && perimeterPolygon.map((v, i) => {
            const { sx, sy } = toSvg(v.x, v.y);
            return (
              <g key={`pv-${i}`}>
                <circle cx={sx} cy={sy} r={4} fill="hsl(var(--primary))" opacity={0.6} className="pointer-events-none" />
                <text x={sx} y={sy - 8} textAnchor="middle"
                  className="text-[7px] fill-primary font-bold select-none pointer-events-none">
                  ({v.x},{v.y})
                </text>
              </g>
            );
          })}

          {/* Placed rooms from the floor plan grid (background context) */}
          {placedRooms.map(pr => {
            const startGx = Math.round(pr.pos_x / cellSizeM);
            const startGy = Math.round(pr.pos_y / cellSizeM);
            const spanW = Math.max(1, Math.round(pr.width / cellSizeM));
            const spanH = Math.max(1, Math.round(pr.length / cellSizeM));
            const { sx: rx, sy: ry } = toSvg(startGx, startGy + spanH);
            return (
              <g key={`pr-${pr.id}`}>
                <rect
                  x={rx}
                  y={ry - cellSize}
                  width={spanW * cellSize}
                  height={spanH * cellSize}
                  fill="hsl(var(--accent) / 0.25)"
                  stroke="hsl(var(--accent-foreground) / 0.4)"
                  strokeWidth={1}
                  rx={2}
                />
                <text
                  x={rx + (spanW * cellSize) / 2}
                  y={ry - cellSize + (spanH * cellSize) / 2}
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

          {/* X axis labels (bottom) */}
          {Array.from({ length: gridWidth + 1 }).map((_, i) => {
            const gx = i + gridOffsetX;
            const { sx } = toSvg(gx, gridOffsetY);
            return (
              <text key={`xl-${i}`} x={sx} y={svgH - 6} textAnchor="middle"
                className="text-[8px] fill-destructive font-bold select-none">
                X{gx}
              </text>
            );
          })}

          {/* Y axis labels (left) */}
          {Array.from({ length: gridHeight + 1 }).map((_, i) => {
            const gy = originTopLeft ? (i + gridOffsetY) : (i + gridOffsetY);
            const { sy } = toSvg(gridOffsetX, gy);
            return (
              <text key={`yl-${i}`} x={8} y={sy + 3} textAnchor="middle"
                className="text-[8px] fill-emerald-600 dark:fill-emerald-400 font-bold select-none">
                Y{gy}
              </text>
            );
          })}

          {/* ── Other rooms' polygons (background, clickable) ── */}
          {otherPolygons.map((op) => {
            const verts = op.vertices;
            if (verts.length < 3) return null;
            const areaVal = polygonArea(verts) * cellSizeM * cellSizeM;
            return (
              <g key={`other-${op.id}`} className="cursor-pointer" onClick={() => onSwitchRoom?.(op.id)}>
                <polygon
                  points={verts.map(v => { const { sx, sy } = toSvg(v.x, v.y); return `${sx},${sy}`; }).join(' ')}
                  fill="hsl(200 80% 50% / 0.12)"
                  stroke="hsl(200 80% 50%)"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                {verts.map((v, i) => {
                  const { sx, sy } = toSvg(v.x, v.y);
                  return (
                    <circle key={`ov-${op.id}-${i}`} cx={sx} cy={sy} r={3}
                      fill="hsl(200 80% 50%)" opacity={0.7} />
                  );
                })}
                {(() => {
                  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
                  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
                  const { sx, sy } = toSvg(cx, cy);
                  return (
                    <>
                      <text x={sx} y={sy - 5} textAnchor="middle" dominantBaseline="central"
                        className="text-[8px] font-semibold select-none pointer-events-none"
                        fill="hsl(200 80% 50%)">
                        {op.name}
                      </text>
                      <text x={sx} y={sy + 7} textAnchor="middle" dominantBaseline="central"
                        className="text-[7px] select-none pointer-events-none"
                        fill="hsl(200 80% 50%)" opacity={0.8}>
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
                  fill={isClosed ? 'hsl(200 80% 50% / 0.18)' : 'hsl(200 80% 50% / 0.08)'}
                  stroke={isClosed ? 'hsl(200 80% 50%)' : 'none'}
                  strokeWidth={isClosed ? 2 : 0}
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

          {/* Edges between placed vertices */}
          {vertices.map((v, i) => {
            if (i === 0) return null;
            const { sx: x1, sy: y1 } = toSvg(vertices[i - 1].x, vertices[i - 1].y);
            const { sx: x2, sy: y2 } = toSvg(v.x, v.y);
            const len = edgeLength(vertices[i - 1], v) * cellSizeM;
            return (
              <g key={`e-${i}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="hsl(200 80% 50%)" strokeWidth={2} />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle"
                  className="text-[7px] font-semibold select-none pointer-events-none"
                  fill="hsl(200 80% 50%)">
                  {len.toFixed(2)}m
                </text>
              </g>
            );
          })}

          {/* Closing edge */}
          {vertices.length >= 3 && (() => {
            const { sx: x1, sy: y1 } = toSvg(vertices[vertices.length - 1].x, vertices[vertices.length - 1].y);
            const { sx: x2, sy: y2 } = toSvg(vertices[0].x, vertices[0].y);
            return (
              <g>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={isClosed ? 'hsl(200 80% 50%)' : 'hsl(200 80% 50% / 0.5)'}
                  strokeWidth={isClosed ? 2 : 1.5}
                  strokeDasharray={isClosed ? 'none' : '4 3'} />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle"
                  className="text-[7px] font-semibold select-none pointer-events-none"
                  fill="hsl(200 80% 50%)">
                  {closingLen.toFixed(2)}m
                </text>
              </g>
            );
          })()}

          {/* Preview line from last vertex to hover (only while drawing) */}
          {!isClosed && vertices.length > 0 && hoverCell && !vertices.some(v => v.x === hoverCell.x && v.y === hoverCell.y) && (() => {
            const last = vertices[vertices.length - 1];
            const { sx: x1, sy: y1 } = toSvg(last.x, last.y);
            const { sx: x2, sy: y2 } = toSvg(hoverCell.x, hoverCell.y);
            return (
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(200 80% 50% / 0.3)" strokeWidth={1} strokeDasharray="3 3" />
            );
          })()}

          {/* Clickable intersections (drawing mode) or draggable vertices (edit mode) */}
          {!isClosed && Array.from({ length: gridHeight + 1 }).map((_, iy) =>
            Array.from({ length: gridWidth + 1 }).map((_, ix) => {
              const gx = ix + gridOffsetX;
              const gy = iy + gridOffsetY;
              const { sx, sy } = toSvg(gx, gy);
              const isPlaced = vertices.some(v => v.x === gx && v.y === gy);
              const isHover = hoverCell?.x === gx && hoverCell?.y === gy;
              const isFirstClose = isNearFirst && gx === vertices[0].x && gy === vertices[0].y;
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

          {/* Draggable vertices when closed */}
          {isClosed && vertices.map((v, i) => {
            const { sx, sy } = toSvg(v.x, v.y);
            const isDragging = draggingIdx === i;
            return (
              <g key={`dv-${i}`}>
                <circle
                  cx={sx} cy={sy} r={isDragging ? 7 : 6}
                  fill={isDragging ? 'hsl(var(--chart-2))' : 'hsl(200 80% 50%)'}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handleMouseDown(i, e)}
                />
                <text x={sx} y={sy - 9} textAnchor="middle"
                  className="text-[7px] font-bold select-none pointer-events-none"
                  fill="hsl(200 80% 50%)">
                  {i + 1} ({v.x},{v.y})
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-5 text-[10px] gap-0.5" onClick={handleUndo}
          disabled={vertices.length === 0}>
          {isClosed ? 'Reabrir' : 'Deshacer'}
        </Button>
        <Button variant="outline" size="sm" className="h-5 text-[10px] gap-0.5" onClick={handleClear}
          disabled={vertices.length === 0}>
          Limpiar
        </Button>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {isClosed
            ? 'Arrastra vértices · Deshacer para reabrir'
            : vertices.length >= 3
              ? 'Pulsa primer vértice para cerrar'
              : `${vertices.length}/3 mín.`}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export function BudgetWorkspacesTab({ budgetId, isAdmin }: BudgetWorkspacesTabProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [gridEditId, setGridEditId] = useState<string | null>(null);
  const [gridEditVertices, setGridEditVertices] = useState<PolygonVertex[]>([]);
  const [formName, setFormName] = useState('');
  const [formHeight, setFormHeight] = useState('');
  const [formVertices, setFormVertices] = useState<PolygonVertex[]>([]);
  const [formSectionId, setFormSectionId] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionAxisValue, setNewSectionAxisValue] = useState('');
  const [inputMode, setInputMode] = useState<'manual' | 'grid'>('manual');

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

  const verticalSections = useMemo<CustomSection[]>(() => {
    if (!floorPlan?.custom_corners) return [];
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      const sections: CustomSection[] = parsed?.customSections || [];
      return sections.filter(s => s.sectionType === 'vertical');
    } catch { return []; }
  }, [floorPlan?.custom_corners]);

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
        .select('id, name, length, width, height, has_floor, has_ceiling, has_roof, vertical_section_id, floor_polygon')
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

  const gridBounds = useMemo<GridBounds>(() => {
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

  const gridWidth = gridBounds.maxCol - gridBounds.minCol + 1;
  const gridHeight = gridBounds.maxRow - gridBounds.minRow + 1;

  const roomIds = rooms.map(r => r.id);
  const { data: allWalls = [] } = useQuery({
    queryKey: ['workspace-walls', roomIds],
    enabled: roomIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
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
  };

  const createVerticalSection = async (): Promise<string | null> => {
    if (!newSectionName.trim() || !floorPlan?.id) return null;
    const newSection: CustomSection = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newSectionName.trim(),
      sectionType: 'vertical',
      axis: 'Z',
      axisValue: parseFloat(newSectionAxisValue) || 0,
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
    if (error) { toast.error('Error al crear sección vertical'); return null; }
    toast.success(`Sección vertical "${newSection.name}" creada`);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces'] });
    setShowNewSection(false);
    setNewSectionName('');
    setNewSectionAxisValue('');
    return newSection.id;
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
      height: parseFloat(formHeight) || 0,
      floor_plan_id: floorPlan.id,
      vertical_section_id: sectionId,
      floor_polygon: formVertices,
    };

    if (editingId) {
      const { error } = await supabase.from('budget_floor_plan_rooms').update(payload).eq('id', editingId);
      if (error) { toast.error('Error al actualizar'); return; }
      // Preserve existing wall types when rebuilding walls
      const { data: existingWalls } = await supabase.from('budget_floor_plan_walls')
        .select('wall_index, wall_type').eq('room_id', editingId).order('wall_index');
      const oldTypeMap = new Map((existingWalls || []).map(w => [w.wall_index, w.wall_type]));
      await supabase.from('budget_floor_plan_walls').delete().eq('room_id', editingId);
      const walls = formVertices.map((_, i) => ({ room_id: editingId, wall_index: i, wall_type: oldTypeMap.get(i) || 'external' }));
      await supabase.from('budget_floor_plan_walls').insert(walls);
      toast.success('Espacio actualizado');
    } else {
      const { data: newRoom, error } = await supabase
        .from('budget_floor_plan_rooms').insert(payload).select('id').single();
      if (error || !newRoom) { toast.error('Error al crear'); return; }
      const walls = formVertices.map((_, i) => ({ room_id: newRoom.id, wall_index: i, wall_type: 'external' }));
      await supabase.from('budget_floor_plan_walls').insert(walls);
      toast.success(`Espacio creado con ${formVertices.length} paredes`);
    }
    resetForm();
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  const handleEdit = (r: Workspace) => {
    setFormName(r.name);
    setFormHeight(String(r.height || ''));
    setFormVertices(r.floor_polygon && r.floor_polygon.length >= 3
      ? r.floor_polygon
      : []
    );
    setFormSectionId(r.vertical_section_id || '');
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('budget_floor_plan_rooms').delete().eq('id', id);
    toast.success('Espacio eliminado');
    refetch();
  };

  const updateWallType = async (wallId: string, newType: string) => {
    await supabase.from('budget_floor_plan_walls').update({ wall_type: newType }).eq('id', wallId);
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  const updateFloorCeiling = async (roomId: string, field: 'has_floor' | 'has_ceiling', value: FloorCeilingType) => {
    const boolVal = value !== 'invisible';
    await supabase.from('budget_floor_plan_rooms').update({ [field]: boolVal }).eq('id', roomId);
    refetch();
  };

  const openGridEditor = (r: Workspace) => {
    const verts = r.floor_polygon && r.floor_polygon.length >= 3
      ? r.floor_polygon
      : [];
    setGridEditVertices(verts);
    setGridEditId(r.id);
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

  const saveGridEditorPolygon = async (roomId: string) => {
    if (gridEditVertices.length < 3) { toast.error('Mínimo 3 vértices'); return; }
    const bbox = polygonBBox(gridEditVertices);
    await supabase.from('budget_floor_plan_rooms').update({
      floor_polygon: gridEditVertices as any,
      length: Math.round(bbox.w * cellSizeM * 100) / 100,
      width: Math.round(bbox.h * cellSizeM * 100) / 100,
    }).eq('id', roomId);
    // Preserve existing wall types when rebuilding walls
    const { data: existingWalls } = await supabase.from('budget_floor_plan_walls')
      .select('wall_index, wall_type').eq('room_id', roomId).order('wall_index');
    const oldTypeMap = new Map((existingWalls || []).map(w => [w.wall_index, w.wall_type]));
    await supabase.from('budget_floor_plan_walls').delete().eq('room_id', roomId);
    const walls = gridEditVertices.map((_, i) => ({ room_id: roomId, wall_index: i, wall_type: oldTypeMap.get(i) || 'external' }));
    await supabase.from('budget_floor_plan_walls').insert(walls);
    toast.success('Polígono actualizado');
    setGridEditId(null);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['workspace-walls'] });
  };

  // Group by vertical section
  const grouped = useMemo(() => {
    const map = new Map<string, { section: CustomSection | null; rooms: Workspace[] }>();
    for (const s of verticalSections) map.set(s.id, { section: s, rooms: [] });
    for (const r of rooms) {
      const key = r.vertical_section_id || '__unassigned__';
      if (!map.has(key)) map.set(key, { section: null, rooms: [] });
      map.get(key)!.rooms.push(r);
    }
    for (const g of map.values()) g.rooms.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return map;
  }, [rooms, verticalSections]);

  const canSave = formName.trim() && formVertices.length >= 3 && (formSectionId || showNewSection);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Espacios de trabajo</h3>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setFormHeight(String(floorPlan?.default_height ?? '')); setShowForm(true); }}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        )}
      </div>

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
              <GridPolygonDrawer
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
                  .map(other => ({ id: other.id, name: other.name, vertices: other.floor_polygon! }))}
                onSwitchRoom={editingId ? switchGridEditRoom : undefined}
              />
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

      {/* ── Grouped list ── */}
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([key, { section, rooms: groupRooms }]) => {
          if (groupRooms.length === 0) return null;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                <Grid3x3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">{section ? section.name : 'Sin sección asignada'}</span>
                {section && <Badge variant="outline" className="text-[9px] h-4 px-1">Z={section.axisValue}</Badge>}
                <Badge variant="secondary" className="text-[9px] h-4 px-1">{groupRooms.length}</Badge>
              </div>

              {groupRooms.map(r => {
                const poly = r.floor_polygon && r.floor_polygon.length >= 3 ? r.floor_polygon : null;
                const area = poly ? polygonArea(poly) : r.length * r.width;
                const vol = r.height ? area * r.height : null;
                const edgeCount = poly ? poly.length : 4;
                const geo = getGeometryType(r);
                const geoInfo = GEOMETRY_INFO[geo];
                const isExpanded = expandedIds.has(r.id);
                const roomWalls = allWalls.filter(w => w.room_id === r.id).sort((a, b) => a.wall_index - b.wall_index);
                const floorType = getFloorType(r);
                const ceilingType = getCeilingType(r);

                return (
                  <div key={r.id} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      onClick={() => toggleExpand(r.id)}
                      className="flex items-center gap-2 p-2.5 w-full text-left hover:bg-accent/30 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      {poly ? <PolygonPreview vertices={poly} size={28} /> : <GeometryIcon type={geo} />}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{r.name}</span>
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
                      {isAdmin && (
                        <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(r)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(r.id)}>
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

                        {/* Sección Z button */}
                        {isAdmin && (
                          <div>
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
                            </Button>
                          </div>
                        )}

                        {/* Inline grid editor */}
                        {gridEditId === r.id && (
                          <div className="space-y-2 border rounded-lg p-2 bg-background">
                            <GridPolygonDrawer
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
                                .map(other => ({ id: other.id, name: other.name, vertices: other.floor_polygon! }))}
                              onSwitchRoom={switchGridEditRoom}
                              perimeterPolygon={getSectionPerimeter(r.vertical_section_id)}
                            />
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
                                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setGridEditId(null)}>
                                  Cancelar
                                </Button>
                                <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => saveGridEditorPolygon(r.id)} disabled={gridEditVertices.length < 3}>
                                  <Save className="h-3 w-3" /> Guardar polígono
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Polygon vertices list */}
                        {poly && gridEditId !== r.id && (
                          <div className="space-y-1">
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
                          isAdmin={isAdmin}
                          onChange={(v) => updateFloorCeiling(r.id, 'has_floor', v as FloorCeilingType)}
                        />

                        {/* Walls — one per edge */}
                        {Array.from({ length: edgeCount }).map((_, i) => {
                          const wall = roomWalls.find(w => w.wall_index === i);
                          const edgeLen = poly ? edgeLength(poly[i], poly[(i + 1) % poly.length]) : null;
                          return (
                            <FaceRow
                              key={i}
                              label={`🧱 ${wallLabel(i, edgeCount)}${edgeLen ? ` (${edgeLen.toFixed(2)}m)` : ''}`}
                              type={wall?.wall_type || 'external'}
                              options={WALL_TYPES}
                              isAdmin={isAdmin}
                              onChange={(v) => wall && updateWallType(wall.id, v)}
                            />
                          );
                        })}

                        {/* Ceiling */}
                        <FaceRow
                          label={r.has_roof ? '🏠 Techo (cubierta)' : '⬜ Techo'}
                          type={ceilingType}
                          options={FLOOR_CEILING_TYPES}
                          isAdmin={isAdmin}
                          onChange={(v) => updateFloorCeiling(r.id, 'has_ceiling', v as FloorCeilingType)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaceRow({
  label, type, options, isAdmin, onChange,
}: {
  label: string;
  type: string;
  options: { value: string; label: string }[];
  isAdmin: boolean;
  onChange: (value: string) => void;
}) {
  const current = options.find(o => o.value === type);
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs">{label}</span>
      {isAdmin ? (
        <Select value={type} onValueChange={onChange}>
          <SelectTrigger className="h-6 w-[140px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="text-[10px] h-5">{current?.label || type}</Badge>
      )}
    </div>
  );
}
