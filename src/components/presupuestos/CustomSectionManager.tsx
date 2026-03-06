import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, MapPin, Pentagon, MousePointer2, Undo2, X } from 'lucide-react';

export interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
  /** Z base for height definition (vertical sections only, grid units) */
  zBase?: number;
  /** Z top for height definition (vertical sections only, grid units) */
  zTop?: number;
}

export interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
}

export interface ScaleConfig {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  gridRange?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

interface WorkspacePolygonData {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number }>;
  widthM: number;
  lengthM: number;
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
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  scaleConfig?: ScaleConfig;
  workspacesBySection?: Map<string, WorkspacePolygonData[]>;
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }[]> = {
  vertical: [{ axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' }],
  longitudinal: [{ axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' }],
  transversal: [{ axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' }],
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computePolygonMetrics(
  vertices: Array<{ x: number; y: number; z: number }>,
  sectionType: string,
  scaleConfig?: ScaleConfig
) {
  if (vertices.length < 2) return { areaM2: 0, largoM: 0, altoM: 0 };
  const get2D = (v: { x: number; y: number; z: number }): [number, number] => {
    if (sectionType === 'vertical') return [v.x, v.y];
    if (sectionType === 'longitudinal') return [v.x, v.z];
    return [v.y, v.z];
  };
  const hScale = sectionType === 'transversal'
    ? (scaleConfig?.scaleY ?? 625) / 1000
    : (scaleConfig?.scaleX ?? 625) / 1000;
  const vScale = sectionType === 'vertical'
    ? (scaleConfig?.scaleY ?? 625) / 1000
    : (scaleConfig?.scaleZ ?? 250) / 1000;
  const pts = vertices.map(get2D);
  const hs = pts.map(p => p[0]);
  const vs = pts.map(p => p[1]);
  const largoM = (Math.max(...hs) - Math.min(...hs)) * hScale;
  const altoM = (Math.max(...vs) - Math.min(...vs)) * vScale;
  let area = 0;
  if (pts.length >= 3) {
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += (pts[i][0] * hScale) * (pts[j][1] * vScale);
      area -= (pts[j][0] * hScale) * (pts[i][1] * vScale);
    }
    area = Math.abs(area) / 2;
  }
  return { areaM2: area, largoM, altoM };
}

const POLY_COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 50%)',
  'hsl(150, 60%, 40%)',
  'hsl(30, 80%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 70%, 50%)',
];

const AXIS_COLORS = { X: '#c0392b', Y: '#27ae60', Z: '#2980b9' };

/** Interactive polygon drawing mode state */
interface DrawingState {
  sectionId: string;
  vertices: Array<{ h: number; v: number }>; // grid coordinates
  closed: boolean;
}

/** Renders an SVG grid for a custom section with interactive drawing */
function SectionGrid({
  section,
  scaleConfig,
  workspaces,
  wallProjections,
  drawingState,
  onGridClick,
  onVertexDrag,
  onClosePolygon,
}: {
  section: CustomSection;
  scaleConfig?: ScaleConfig;
  workspaces?: WorkspacePolygonData[];
  wallProjections?: SectionWallProjection[];
  drawingState?: DrawingState | null;
  onGridClick?: (h: number, v: number) => void;
  onVertexDrag?: (index: number, h: number, v: number) => void;
  onClosePolygon?: () => void;
}) {
  const { sectionType, polygons } = section;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const axisMapping = useMemo(() => {
    if (sectionType === 'vertical') return { hAxis: 'X', vAxis: 'Y', hLabel: 'X', vLabel: 'Y', flipV: false } as const;
    if (sectionType === 'longitudinal') return { hAxis: 'X', vAxis: 'Z', hLabel: 'X', vLabel: 'Z', flipV: true } as const;
    return { hAxis: 'Y', vAxis: 'Z', hLabel: 'Y', vLabel: 'Z', flipV: true } as const;
  }, [sectionType]);

  const hColor = AXIS_COLORS[axisMapping.hAxis];
  const vColor = AXIS_COLORS[axisMapping.vAxis];

  const bounds = useMemo(() => {
    const allH: number[] = [];
    const allV: number[] = [];
    polygons.forEach(p => p.vertices.forEach(v => {
      allH.push(v[axisMapping.hAxis.toLowerCase() as 'x' | 'y' | 'z']);
      allV.push(v[axisMapping.vAxis.toLowerCase() as 'x' | 'y' | 'z']);
    }));
    // Include drawing vertices
    if (drawingState && drawingState.sectionId === section.id) {
      drawingState.vertices.forEach(v => { allH.push(v.h); allV.push(v.v); });
    }
    const defaultRange = scaleConfig?.gridRange;
    let minH = allH.length > 0 ? Math.min(...allH) : (defaultRange ? defaultRange[`min${axisMapping.hAxis}` as keyof typeof defaultRange] as number : 0);
    let maxH = allH.length > 0 ? Math.max(...allH) : (defaultRange ? defaultRange[`max${axisMapping.hAxis}` as keyof typeof defaultRange] as number : 10);
    let minV = allV.length > 0 ? Math.min(...allV) : (defaultRange ? defaultRange[`min${axisMapping.vAxis}` as keyof typeof defaultRange] as number : 0);
    let maxV = allV.length > 0 ? Math.max(...allV) : (defaultRange ? defaultRange[`max${axisMapping.vAxis}` as keyof typeof defaultRange] as number : 10);
    const hRange = maxH - minH || 10;
    const vRange = maxV - minV || 10;
    minH = Math.floor(minH - hRange * 0.1);
    maxH = Math.ceil(maxH + hRange * 0.1);
    minV = Math.floor(minV - vRange * 0.1);
    maxV = Math.ceil(maxV + vRange * 0.1);
    if (maxH - minH < 5) { minH -= 2; maxH += 3; }
    if (maxV - minV < 5) { minV -= 2; maxV += 3; }
    return { minH, maxH, minV, maxV };
  }, [polygons, axisMapping, scaleConfig, drawingState, section.id]);

  const cellSize = 36;
  const padding = 48;
  const cols = bounds.maxH - bounds.minH;
  const rows = bounds.maxV - bounds.minV;
  const svgW = cols * cellSize + padding * 2;
  const svgH = rows * cellSize + padding * 2;

  const toSvgX = (val: number) => padding + (val - bounds.minH) * cellSize;
  const toSvgY = (val: number) => axisMapping.flipV
    ? padding + (bounds.maxV - val) * cellSize
    : padding + (val - bounds.minV) * cellSize;

  // Convert SVG pixel coords to grid coords (snapped to integer)
  const toGridCoords = useCallback((clientX: number, clientY: number): { h: number; v: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewBoxW = svgW;
    const viewBoxH = svgH;
    const scaleFactorX = viewBoxW / rect.width;
    const scaleFactorY = viewBoxH / rect.height;
    const svgX = (clientX - rect.left) * scaleFactorX;
    const svgY = (clientY - rect.top) * scaleFactorY;
    const rawH = bounds.minH + (svgX - padding) / cellSize;
    const rawV = axisMapping.flipV
      ? bounds.maxV - (svgY - padding) / cellSize
      : bounds.minV + (svgY - padding) / cellSize;
    return { h: Math.round(rawH), v: Math.round(rawV) };
  }, [bounds, cellSize, padding, axisMapping.flipV, svgW, svgH]);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onGridClick || !drawingState || drawingState.sectionId !== section.id || drawingState.closed) return;
    const coords = toGridCoords(e.clientX, e.clientY);
    if (!coords) return;
    // Check if clicking near first vertex to close
    if (drawingState.vertices.length >= 3) {
      const first = drawingState.vertices[0];
      if (coords.h === first.h && coords.v === first.v) {
        onClosePolygon?.();
        return;
      }
    }
    onGridClick(coords.h, coords.v);
  }, [onGridClick, drawingState, section.id, toGridCoords, onClosePolygon]);

  const handleMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    if (!drawingState?.closed || !onVertexDrag) return;
    e.stopPropagation();
    setDragIdx(idx);
  }, [drawingState, onVertexDrag]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragIdx === null || !onVertexDrag) return;
    const coords = toGridCoords(e.clientX, e.clientY);
    if (coords) onVertexDrag(dragIdx, coords.h, coords.v);
  }, [dragIdx, onVertexDrag, toGridCoords]);

  const handleMouseUp = useCallback(() => { setDragIdx(null); }, []);

  const isDrawing = drawingState && drawingState.sectionId === section.id && !drawingState.closed;
  const isDrawingClosed = drawingState && drawingState.sectionId === section.id && drawingState.closed;

  const chessCells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDark = (r + c) % 2 === 0;
      chessCells.push(
        <rect key={`cell-${r}-${c}`} x={padding + c * cellSize} y={padding + r * cellSize}
          width={cellSize} height={cellSize} fill={isDark ? '#e8e8e8' : '#ffffff'} stroke="#cccccc" strokeWidth={0.5} />
      );
    }
  }

  return (
    <div className="overflow-auto border-2 border-border rounded-lg bg-white my-2 shadow-sm">
      {/* Drawing mode indicator */}
      {isDrawing && (
        <div className="bg-primary/10 border-b border-primary/30 px-3 py-1.5 flex items-center gap-2">
          <MousePointer2 className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">
            Modo dibujo: Pulse sobre la cuadrícula para colocar vértices.
            {drawingState!.vertices.length >= 3 && ' Pulse sobre el primer vértice para cerrar.'}
            {drawingState!.vertices.length < 3 && ` (${drawingState!.vertices.length}/3 mín.)`}
          </span>
        </div>
      )}
      {isDrawingClosed && (
        <div className="bg-green-500/10 border-b border-green-500/30 px-3 py-1.5 flex items-center gap-2">
          <Pentagon className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs text-green-700 font-medium">
            Polígono cerrado ({drawingState!.vertices.length} vértices). Arrastre los vértices para ajustar.
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        width={Math.min(svgW, 960)}
        height={Math.min(svgH, 640)}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className={`w-full ${isDrawing ? 'cursor-crosshair' : isDrawingClosed ? 'cursor-grab' : ''}`}
        style={{ minHeight: 200 }}
        onClick={handleSvgClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Title bar */}
        <rect x={0} y={0} width={svgW} height={28} fill="#2c3e50" />
        <text x={svgW / 2} y={18} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#ffffff" fontFamily="system-ui, sans-serif">
          {section.name} — {section.axis}={section.axisValue}
        </text>

        {chessCells}

        <rect x={padding} y={padding} width={cols * cellSize} height={rows * cellSize} fill="none" stroke="#555555" strokeWidth={1.5} />

        {/* H axis labels */}
        {Array.from({ length: cols + 1 }, (_, i) => {
          const x = padding + i * cellSize;
          const val = bounds.minH + i;
          const isOrigin = val === 0;
          return (
            <g key={`h-${i}`}>
              <line x1={x} y1={padding} x2={x} y2={padding + rows * cellSize} stroke={isOrigin ? hColor : '#999999'} strokeWidth={isOrigin ? 2 : 0.5} />
              <text x={x} y={padding - 8} textAnchor="middle" fontSize={12} fontWeight="bold" fill={hColor} fontFamily="system-ui, sans-serif">
                {axisMapping.hLabel}{val}
              </text>
              <text x={x} y={padding + rows * cellSize + 16} textAnchor="middle" fontSize={12} fontWeight="bold" fill={hColor} fontFamily="system-ui, sans-serif">
                {axisMapping.hLabel}{val}
              </text>
            </g>
          );
        })}
        {/* V axis labels */}
        {Array.from({ length: rows + 1 }, (_, i) => {
          const y = padding + i * cellSize;
          const val = axisMapping.flipV ? bounds.maxV - i : bounds.minV + i;
          const isOrigin = val === 0;
          return (
            <g key={`v-${i}`}>
              <line x1={padding} y1={y} x2={padding + cols * cellSize} y2={y} stroke={isOrigin ? vColor : '#999999'} strokeWidth={isOrigin ? 2 : 0.5} />
              <text x={padding - 8} y={y + 4} textAnchor="end" fontSize={12} fontWeight="bold" fill={vColor} fontFamily="system-ui, sans-serif">
                {axisMapping.vLabel}{val}
              </text>
              <text x={padding + cols * cellSize + 8} y={y + 4} textAnchor="start" fontSize={12} fontWeight="bold" fill={vColor} fontFamily="system-ui, sans-serif">
                {axisMapping.vLabel}{val}
              </text>
            </g>
          );
        })}

        {/* Origin marker */}
        {bounds.minH <= 0 && bounds.maxH >= 0 && bounds.minV <= 0 && bounds.maxV >= 0 && (
          <>
            <circle cx={toSvgX(0)} cy={toSvgY(0)} r={5} fill="#e74c3c" stroke="#ffffff" strokeWidth={1.5} />
            <text x={toSvgX(0) + 8} y={toSvgY(0) - 8} fontSize={10} fontWeight="bold" fill="#e74c3c" fontFamily="system-ui, sans-serif">O</text>
          </>
        )}

        {/* Existing polygons */}
        {polygons.map((poly, pi) => {
          if (poly.vertices.length < 2) return null;
          const color = POLY_COLORS[pi % POLY_COLORS.length];
          const hKey = axisMapping.hAxis.toLowerCase() as 'x' | 'y' | 'z';
          const vKey = axisMapping.vAxis.toLowerCase() as 'x' | 'y' | 'z';
          const points = poly.vertices.map(v => `${toSvgX(v[hKey])},${toSvgY(v[vKey])}`).join(' ');
          return (
            <g key={poly.id}>
              {poly.vertices.length >= 3 && <polygon points={points} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />}
              {poly.vertices.length === 2 && <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} />}
              {poly.vertices.map((v, vi) => (
                <g key={vi}>
                  <circle cx={toSvgX(v[hKey])} cy={toSvgY(v[vKey])} r={4} fill={color} stroke="#fff" strokeWidth={1} />
                  <text x={toSvgX(v[hKey]) + 6} y={toSvgY(v[vKey]) - 6} fontSize={10} fill="#333333" fontWeight="bold" fontFamily="system-ui, sans-serif">
                    ({v.x},{v.y},{v.z})
                  </text>
                </g>
              ))}
              {poly.vertices.length >= 2 && (() => {
                const cx = poly.vertices.reduce((s, v) => s + v[hKey], 0) / poly.vertices.length;
                const cy = poly.vertices.reduce((s, v) => s + v[vKey], 0) / poly.vertices.length;
                return (
                  <text x={toSvgX(cx)} y={toSvgY(cy)} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color} fontFamily="system-ui, sans-serif">
                    {poly.name}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Workspace polygons overlay */}
        {workspaces && workspaces.length > 0 && sectionType === 'vertical' && workspaces.map((ws) => {
          if (ws.vertices.length < 3) return null;
          const wsPoints = ws.vertices.map(v => `${toSvgX(v.x)},${toSvgY(v.y)}`).join(' ');
          const cx = ws.vertices.reduce((s, v) => s + v.x, 0) / ws.vertices.length;
          const cy = ws.vertices.reduce((s, v) => s + v.y, 0) / ws.vertices.length;
          const hScale = (scaleConfig?.scaleX ?? 625) / 1000;
          const vScale = (scaleConfig?.scaleY ?? 625) / 1000;
          let area = 0;
          for (let i = 0; i < ws.vertices.length; i++) {
            const j = (i + 1) % ws.vertices.length;
            area += (ws.vertices[i].x * hScale) * (ws.vertices[j].y * vScale);
            area -= (ws.vertices[j].x * hScale) * (ws.vertices[i].y * vScale);
          }
          area = Math.abs(area) / 2;
          return (
            <g key={`ws-${ws.id}`}>
              <polygon points={wsPoints} fill="hsl(200, 80%, 50%)" fillOpacity={0.15} stroke="hsl(200, 80%, 50%)" strokeWidth={2} strokeDasharray="6 3" />
              <text x={toSvgX(cx)} y={toSvgY(cy) - 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif">{ws.name}</text>
              <text x={toSvgX(cx)} y={toSvgY(cy) + 10} textAnchor="middle" fontSize={9} fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif" opacity={0.8}>{area.toFixed(2)} m²</text>
            </g>
          );
        })}

        {/* Wall projections */}
        {wallProjections && wallProjections.length > 0 && (sectionType === 'longitudinal' || sectionType === 'transversal') && (() => {
          const grouped = new Map<string, SectionWallProjection[]>();
          wallProjections.forEach(wp => {
            if (!grouped.has(wp.workspaceId)) grouped.set(wp.workspaceId, []);
            grouped.get(wp.workspaceId)!.push(wp);
          });
          return Array.from(grouped.entries()).map(([wsId, projections]) => {
            const wsName = projections[0].workspaceName;
            const allH = projections.flatMap(p => [p.hStart, p.hEnd]);
            const allV = projections.flatMap(p => [p.zBase, p.zTop]);
            const hMin = Math.min(...allH);
            const hMax = Math.max(...allH);
            const vMin = Math.min(...allV);
            const vMax = Math.max(...allV);
            return (
              <g key={`wp-${wsId}`}>
                <rect x={toSvgX(hMin)} y={toSvgY(vMax)} width={toSvgX(hMax) - toSvgX(hMin)} height={toSvgY(vMin) - toSvgY(vMax)} fill="hsl(200, 80%, 50%)" fillOpacity={0.1} stroke="none" />
                {projections.map((p, pi) => (
                  <g key={`wall-${pi}`}>
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hStart)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={2.5} />
                    {p.hEnd !== p.hStart && <line x1={toSvgX(p.hEnd)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={2.5} />}
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zTop)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zBase)} stroke="hsl(200, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
                  </g>
                ))}
                <text x={toSvgX((hMin + hMax) / 2)} y={toSvgY((vMin + vMax) / 2) - 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif">{wsName}</text>
              </g>
            );
          });
        })()}

        {/* Drawing in progress */}
        {drawingState && drawingState.sectionId === section.id && drawingState.vertices.length > 0 && (() => {
          const verts = drawingState.vertices;
          const color = drawingState.closed ? 'hsl(150, 70%, 40%)' : 'hsl(30, 90%, 50%)';
          const points = verts.map(v => `${toSvgX(v.h)},${toSvgY(v.v)}`).join(' ');
          return (
            <g>
              {/* Fill when closed */}
              {drawingState.closed && verts.length >= 3 && (
                <polygon points={points} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={2.5} />
              )}
              {/* Lines */}
              {!drawingState.closed && verts.length >= 2 && (
                <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 3" />
              )}
              {/* Vertices */}
              {verts.map((v, vi) => {
                const isFirst = vi === 0;
                const r = isFirst && !drawingState.closed && verts.length >= 3 ? 7 : 5;
                return (
                  <g key={`dv-${vi}`}>
                    <circle
                      cx={toSvgX(v.h)} cy={toSvgY(v.v)} r={r}
                      fill={isFirst && !drawingState.closed ? '#e74c3c' : color}
                      stroke="#fff" strokeWidth={1.5}
                      className={drawingState.closed ? 'cursor-grab' : isFirst && verts.length >= 3 ? 'cursor-pointer' : ''}
                      onMouseDown={drawingState.closed ? (e) => handleMouseDown(e, vi) : undefined}
                    />
                    {isFirst && !drawingState.closed && verts.length >= 3 && (
                      <text x={toSvgX(v.h)} y={toSvgY(v.v) - 10} textAnchor="middle" fontSize={9} fill="#e74c3c" fontWeight="bold" fontFamily="system-ui, sans-serif">
                        Cerrar
                      </text>
                    )}
                    <text x={toSvgX(v.h) + 8} y={toSvgY(v.v) - 6} fontSize={9} fill="#333" fontWeight="bold" fontFamily="system-ui, sans-serif">
                      ({v.h},{v.v})
                    </text>
                  </g>
                );
              })}
              {/* Edge lengths */}
              {verts.length >= 2 && (() => {
                const edges: React.ReactNode[] = [];
                const n = drawingState.closed ? verts.length : verts.length - 1;
                const hScale = sectionType === 'transversal' ? (scaleConfig?.scaleY ?? 625) / 1000 : (scaleConfig?.scaleX ?? 625) / 1000;
                const vScaleVal = sectionType === 'vertical' ? (scaleConfig?.scaleY ?? 625) / 1000 : (scaleConfig?.scaleZ ?? 250) / 1000;
                for (let i = 0; i < n; i++) {
                  const a = verts[i];
                  const b = verts[(i + 1) % verts.length];
                  const dh = (b.h - a.h) * hScale;
                  const dv = (b.v - a.v) * vScaleVal;
                  const len = Math.sqrt(dh * dh + dv * dv);
                  const mx = (toSvgX(a.h) + toSvgX(b.h)) / 2;
                  const my = (toSvgY(a.v) + toSvgY(b.v)) / 2;
                  edges.push(
                    <text key={`edge-${i}`} x={mx} y={my - 4} textAnchor="middle" fontSize={9} fill={color} fontFamily="system-ui, sans-serif" fontWeight="bold">
                      {len.toFixed(2)}m
                    </text>
                  );
                }
                return edges;
              })()}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, workspacesBySection, wallProjectionsBySection }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingPolygonOf, setEditingPolygonOf] = useState<string | null>(null);
  const [polygonName, setPolygonName] = useState('');
  const [polygonVertices, setPolygonVertices] = useState('');
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');
  // Height fields for vertical sections
  const [polygonZBase, setPolygonZBase] = useState('0');
  const [polygonZTop, setPolygonZTop] = useState('10');
  // Interactive drawing state
  const [drawingState, setDrawingState] = useState<DrawingState | null>(null);

  const axisConfig = AXIS_MAP[sectionType][0];
  const filtered = sections.filter(s => s.sectionType === sectionType);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseFloat(newAxisValue) || 0;
    const section: CustomSection = { id: generateId(), name: newName.trim(), sectionType, axis: axisConfig.axis, axisValue: val, polygons: [] };
    const newSections = [...sections, section];
    onSectionsChange(newSections);
    setExpandedSections(prev => new Set([...prev, section.id]));
    setNewName('');
    setNewAxisValue('0');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
    if (drawingState?.sectionId === id) setDrawingState(null);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    const val = parseFloat(editAxisValue) || 0;
    onSectionsChange(sections.map(s => s.id === id ? { ...s, name: editName.trim(), axisValue: val } : s));
    setEditingSectionId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedSections(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const getFreeAxes = (section: CustomSection): { first: 'x' | 'y' | 'z'; second: 'x' | 'y' | 'z'; fixedAxis: 'x' | 'y' | 'z' } => {
    const fixedAxis = section.axis.toLowerCase() as 'x' | 'y' | 'z';
    if (fixedAxis === 'z') return { first: 'x', second: 'y', fixedAxis };
    if (fixedAxis === 'y') return { first: 'x', second: 'z', fixedAxis };
    return { first: 'y', second: 'z', fixedAxis };
  };

  const parseVertices2D = (text: string, section: CustomSection): Array<{ x: number; y: number; z: number }> => {
    const { first, second, fixedAxis } = getFreeAxes(section);
    return text.split(';').map(v => {
      const parts = v.trim().split(',').map(Number);
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
      const vertex = { x: 0, y: 0, z: 0 };
      vertex[first] = parts[0];
      vertex[second] = parts[1];
      vertex[fixedAxis] = section.axisValue;
      return vertex;
    }).filter((v): v is { x: number; y: number; z: number } => v !== null);
  };

  /** Start interactive drawing mode for a section */
  const startDrawing = (sectionId: string) => {
    setDrawingState({ sectionId, vertices: [], closed: false });
    setEditingPolygonOf(null);
    setEditingPolygonId(null);
  };

  /** Cancel drawing */
  const cancelDrawing = () => { setDrawingState(null); };

  /** Add vertex from grid click */
  const handleGridClick = useCallback((h: number, v: number) => {
    setDrawingState(prev => {
      if (!prev || prev.closed) return prev;
      // Avoid duplicate consecutive vertices
      const last = prev.vertices[prev.vertices.length - 1];
      if (last && last.h === h && last.v === v) return prev;
      return { ...prev, vertices: [...prev.vertices, { h, v }] };
    });
  }, []);

  /** Close polygon */
  const handleClosePolygon = useCallback(() => {
    setDrawingState(prev => prev ? { ...prev, closed: true } : prev);
  }, []);

  /** Drag vertex (after closing) */
  const handleVertexDrag = useCallback((index: number, h: number, v: number) => {
    setDrawingState(prev => {
      if (!prev || !prev.closed) return prev;
      const newVerts = [...prev.vertices];
      newVerts[index] = { h, v };
      return { ...prev, vertices: newVerts };
    });
  }, []);

  /** Undo last vertex */
  const undoLastVertex = () => {
    setDrawingState(prev => {
      if (!prev || prev.vertices.length === 0) return prev;
      if (prev.closed) return { ...prev, closed: false, vertices: prev.vertices };
      return { ...prev, vertices: prev.vertices.slice(0, -1) };
    });
  };

  /** Confirm drawn polygon → save it */
  const confirmDrawnPolygon = (sectionId: string) => {
    if (!drawingState || !drawingState.closed || drawingState.vertices.length < 3) return;
    if (!polygonName.trim()) {
      // Auto-name
      const section = sections.find(s => s.id === sectionId);
      const count = section?.polygons.length ?? 0;
      setPolygonName(`Polígono ${count + 1}`);
    }
    const name = polygonName.trim() || `Polígono ${(sections.find(s => s.id === sectionId)?.polygons.length ?? 0) + 1}`;
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const { first, second, fixedAxis } = getFreeAxes(section);
    const vertices = drawingState.vertices.map(v => {
      const vertex = { x: 0, y: 0, z: 0 };
      vertex[first] = v.h;
      vertex[second] = v.v;
      vertex[fixedAxis] = section.axisValue;
      return vertex;
    });

    const zBase = sectionType === 'vertical' ? parseFloat(polygonZBase) || 0 : undefined;
    const zTop = sectionType === 'vertical' ? parseFloat(polygonZTop) || 10 : undefined;

    const polygon: SectionPolygon = {
      id: generateId(),
      name,
      vertices,
      ...(sectionType === 'vertical' ? { zBase, zTop } : {}),
    };

    onSectionsChange(sections.map(s =>
      s.id === sectionId ? { ...s, polygons: [...s.polygons, polygon] } : s
    ));
    setDrawingState(null);
    setPolygonName('');
    setPolygonZBase('0');
    setPolygonZTop('10');
  };

  const addPolygon = (sectionId: string) => {
    if (!polygonName.trim() || !polygonVertices.trim()) return;
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const vertices = parseVertices2D(polygonVertices, section);
    if (vertices.length < 2) return;

    const zBase = sectionType === 'vertical' ? parseFloat(polygonZBase) || 0 : undefined;
    const zTop = sectionType === 'vertical' ? parseFloat(polygonZTop) || 10 : undefined;

    if (editingPolygonId) {
      onSectionsChange(sections.map(s =>
        s.id === sectionId
          ? { ...s, polygons: s.polygons.map(p => p.id === editingPolygonId ? { ...p, name: polygonName.trim(), vertices, ...(sectionType === 'vertical' ? { zBase, zTop } : {}) } : p) }
          : s
      ));
    } else {
      const polygon: SectionPolygon = { id: generateId(), name: polygonName.trim(), vertices, ...(sectionType === 'vertical' ? { zBase, zTop } : {}) };
      onSectionsChange(sections.map(s =>
        s.id === sectionId ? { ...s, polygons: [...s.polygons, polygon] } : s
      ));
    }
    setPolygonName('');
    setPolygonVertices('');
    setPolygonZBase('0');
    setPolygonZTop('10');
    setEditingPolygonOf(null);
    setEditingPolygonId(null);
  };

  const startEditPolygon = (sectionId: string, poly: SectionPolygon) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const { first, second } = getFreeAxes(section);
    setEditingPolygonOf(sectionId);
    setEditingPolygonId(poly.id);
    setPolygonName(poly.name);
    setPolygonVertices(poly.vertices.map(v => `${v[first]},${v[second]}`).join('; '));
    setPolygonZBase(String(poly.zBase ?? 0));
    setPolygonZTop(String(poly.zTop ?? 10));
  };

  const deletePolygon = (sectionId: string, polygonId: string) => {
    onSectionsChange(sections.map(s =>
      s.id === sectionId ? { ...s, polygons: s.polygons.filter(p => p.id !== polygonId) } : s
    ));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Secciones {TYPE_LABELS[sectionType]}
          <Badge variant="outline" className="text-[9px] h-4">{filtered.length}</Badge>
        </h4>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Nueva Sección
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input className="h-7 text-xs" placeholder="Ej: Cara Superior" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <div>
                <Label className="text-[10px]">{axisConfig.label} (valor)</Label>
                <Input className="h-7 text-xs" type="number" placeholder={axisConfig.placeholder} value={newAxisValue} onChange={e => setNewAxisValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
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
        const isExpanded = expandedSections.has(section.id);
        const isEditing = editingSectionId === section.id;
        const isDrawingThis = drawingState?.sectionId === section.id;

        return (
          <div key={section.id} className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            {/* Section header */}
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer bg-muted/60 hover:bg-muted/80" onClick={() => !isEditing && toggleExpand(section.id)}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                    <Input className="h-7 text-xs w-36" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRename(section.id); if (e.key === 'Escape') setEditingSectionId(null); }} autoFocus placeholder="Nombre" />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{axisConfig.label}=</span>
                      <Input className="h-7 text-xs w-16" type="number" value={editAxisValue} onChange={e => setEditAxisValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRename(section.id); if (e.key === 'Escape') setEditingSectionId(null); }} />
                    </div>
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleRename(section.id)}>Guardar</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingSectionId(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-semibold truncate">{section.name}</span>
                    <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{section.axis}={section.axisValue}</Badge>
                    <Badge variant="outline" className="text-[9px] h-4 shrink-0"><Pentagon className="h-2.5 w-2.5 mr-0.5" />{section.polygons.length}</Badge>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingSectionId(section.id); setEditName(section.name); setEditAxisValue(String(section.axisValue)); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(section.id)}>
                    <Trash2 className="h-4.5 w-4.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Section content */}
            {isExpanded && (
              <div className="px-3 py-2 space-y-2 bg-background">
                <SectionGrid
                  section={section}
                  scaleConfig={scaleConfig}
                  workspaces={workspacesBySection?.get(section.id)}
                  wallProjections={wallProjectionsBySection?.get(section.id)}
                  drawingState={isDrawingThis ? drawingState : null}
                  onGridClick={handleGridClick}
                  onVertexDrag={handleVertexDrag}
                  onClosePolygon={handleClosePolygon}
                />

                {/* Drawing controls */}
                {isDrawingThis && (
                  <div className="border border-dashed border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Dibujo interactivo</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={undoLastVertex} disabled={drawingState!.vertices.length === 0}>
                          <Undo2 className="h-3 w-3 mr-1" /> Deshacer
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={cancelDrawing}>
                          <X className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      </div>
                    </div>
                    {drawingState!.closed && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px]">Nombre del polígono</Label>
                            <Input className="h-7 text-xs" placeholder="Ej: Perímetro planta" value={polygonName} onChange={e => setPolygonName(e.target.value)} />
                          </div>
                          {sectionType === 'vertical' && (
                            <>
                              <div className="grid grid-cols-2 gap-1">
                                <div>
                                  <Label className="text-[10px]">Z base (bloques)</Label>
                                  <Input className="h-7 text-xs" type="number" value={polygonZBase} onChange={e => setPolygonZBase(e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">Z superior (bloques)</Label>
                                  <Input className="h-7 text-xs" type="number" value={polygonZTop} onChange={e => setPolygonZTop(e.target.value)} />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        {sectionType === 'vertical' && (() => {
                          const zB = parseFloat(polygonZBase) || 0;
                          const zT = parseFloat(polygonZTop) || 0;
                          const zScaleMm = scaleConfig?.scaleZ ?? 250;
                          const heightM = Math.abs(zT - zB) * zScaleMm / 1000;
                          // Calculate polygon area
                          const hScale = (scaleConfig?.scaleX ?? 625) / 1000;
                          const vScale = (scaleConfig?.scaleY ?? 625) / 1000;
                          const verts = drawingState!.vertices;
                          let area = 0;
                          for (let i = 0; i < verts.length; i++) {
                            const j = (i + 1) % verts.length;
                            area += (verts[i].h * hScale) * (verts[j].v * vScale);
                            area -= (verts[j].h * hScale) * (verts[i].v * vScale);
                          }
                          area = Math.abs(area) / 2;
                          const vol = area * heightM;
                          return (
                            <div className="bg-muted/40 rounded px-2 py-1 text-[10px] text-muted-foreground flex items-center gap-4">
                              <span>📐 Superficie suelo: <strong>{area.toFixed(2)} m²</strong></span>
                              <span>↕ Altura: <strong>{heightM.toFixed(2)} m</strong> (Z{zB}→Z{zT})</span>
                              <span>📦 Volumen: <strong>{vol.toFixed(2)} m³</strong></span>
                            </div>
                          );
                        })()}
                        <Button size="sm" className="h-7 text-xs w-full" onClick={() => confirmDrawnPolygon(section.id)}>
                          ✓ Confirmar polígono
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Existing polygons list */}
                {section.polygons.length === 0 && !isDrawingThis && (
                  <p className="text-[10px] text-muted-foreground italic">Sin polígonos definidos.</p>
                )}
                {section.polygons.map(poly => {
                  const metrics = computePolygonMetrics(poly.vertices, section.sectionType, scaleConfig);
                  const hasHeight = poly.zBase != null && poly.zTop != null;
                  const zScaleMm = scaleConfig?.scaleZ ?? 250;
                  const heightM = hasHeight ? Math.abs((poly.zTop! - poly.zBase!) * zScaleMm / 1000) : 0;
                  const volM3 = hasHeight ? metrics.areaM2 * heightM : 0;
                  return (
                    <div key={poly.id} className="bg-muted/30 rounded px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Pentagon className="h-3 w-3 text-primary" />
                          <span className="text-[11px] font-medium">{poly.name}</span>
                          <span className="text-[9px] text-muted-foreground">{poly.vertices.length} vértices</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEditPolygon(section.id, poly)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10" onClick={() => deletePolygon(section.id, poly.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 ml-5 text-[10px] text-muted-foreground flex-wrap">
                        <span title="Superficie">📐 {metrics.areaM2.toFixed(2)} m²</span>
                        <span title="Largo máximo (horizontal)">↔ {metrics.largoM.toFixed(2)} m</span>
                        <span title="Alto máximo (vertical)">↕ {metrics.altoM.toFixed(2)} m</span>
                        {hasHeight && (
                          <>
                            <span title="Altura Z">🏗️ Z{poly.zBase}→Z{poly.zTop} ({heightM.toFixed(2)} m)</span>
                            <span title="Volumen">📦 {volM3.toFixed(2)} m³</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add/Edit polygon form (text-based) */}
                {editingPolygonOf === section.id ? (
                  <div className="border border-dashed border-primary/30 rounded p-2 space-y-1.5">
                    <div>
                      <Label className="text-[10px]">Nombre del polígono</Label>
                      <Input className="h-6 text-xs" placeholder="Ej: Muro principal" value={polygonName} onChange={e => setPolygonName(e.target.value)} />
                    </div>
                    {(() => {
                      const { first, second, fixedAxis } = getFreeAxes(section);
                      const fixedLabel = fixedAxis.toUpperCase();
                      const firstLabel = first.toUpperCase();
                      const secondLabel = second.toUpperCase();
                      return (
                        <div>
                          <Label className="text-[10px]">
                            Vértices ({firstLabel},{secondLabel} separados por ;)
                            <span className="ml-1 text-muted-foreground">— {fixedLabel}={section.axisValue} (fijo)</span>
                          </Label>
                          <Input className="h-6 text-xs" placeholder={`Ej: 0,0; 5,0; 5,10; 0,10`} value={polygonVertices} onChange={e => setPolygonVertices(e.target.value)} />
                        </div>
                      );
                    })()}
                    {sectionType === 'vertical' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">Z base (bloques)</Label>
                          <Input className="h-6 text-xs" type="number" value={polygonZBase} onChange={e => setPolygonZBase(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-[10px]">Z superior (bloques)</Label>
                          <Input className="h-6 text-xs" type="number" value={polygonZTop} onChange={e => setPolygonZTop(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => { setEditingPolygonOf(null); setEditingPolygonId(null); }}>Cancelar</Button>
                      <Button size="sm" className="h-5 text-[10px]" onClick={() => addPolygon(section.id)} disabled={!polygonName.trim() || !polygonVertices.trim()}>
                        {editingPolygonId ? 'Guardar' : 'Añadir'}
                      </Button>
                    </div>
                  </div>
                ) : !isDrawingThis && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setEditingPolygonOf(section.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Texto
                    </Button>
                    <Button variant="default" size="sm" className="h-6 text-[10px] flex-1" onClick={() => startDrawing(section.id)}>
                      <MousePointer2 className="h-3 w-3 mr-1" /> Dibujar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
