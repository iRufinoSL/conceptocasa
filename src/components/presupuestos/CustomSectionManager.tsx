import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { RoomData } from '@/lib/floor-plan-calculations';
import { Plus, Trash2, Pencil, MapPin, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Save, RefreshCw, MousePointer, PenTool } from 'lucide-react';
import { GridPdfExport } from './GridPdfExport';
import { toast } from 'sonner';

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
  workspacesBySection?: Map<string, any[]>;
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
  rooms?: RoomData[];
  budgetName?: string;
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
  if (saved && saved.vertices.length >= 1) {
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

interface SectionGridProps {
  section: CustomSection;
  scaleConfig?: ScaleConfig;
  rooms?: RoomData[];
  budgetName?: string;
  wallProjections?: SectionWallProjection[];
  allSections?: CustomSection[];
  onSectionsChange?: (sections: CustomSection[]) => void;
}

function SectionGrid({ section, scaleConfig, rooms, budgetName, wallProjections, allSections, onSectionsChange }: SectionGridProps) {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [gridMin, setGridMin] = useState(GRID_MIN);
  const [gridMax, setGridMax] = useState(GRID_MAX);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [editVertices, setEditVertices] = useState<PolygonVertex[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [drawingMode, setDrawingMode] = useState(false); // interactive click-to-draw
  const [showPlacementDialog, setShowPlacementDialog] = useState<string | null>(null); // workspaceId asking auto/manual
  const gridCount = gridMax - gridMin + 1;
  const baseCellSize = 28;
  const cellSize = Math.round(baseCellSize * zoomLevel);
  const margin = { top: 28, left: 36, right: 16, bottom: 28 };
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

  const zoomOptions = [1, 1.5, 2, 2.5, 3];

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

    const proj = wallProjections?.find(p => p.workspaceId === selectedWorkspaceId);
    const updatedSections = allSections.map(s => {
      if (s.id !== section.id) return s;
      const polys = [...(s.polygons || [])];
      const existingIdx = polys.findIndex(p => p.id === selectedWorkspaceId);
      const polyEntry: SectionPolygon = {
        id: selectedWorkspaceId,
        name: proj?.workspaceName || 'Espacio',
        vertices: editVertices.map(v => ({ x: v.x, y: v.y, z: 0 })),
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

  /** Render a workspace geometry (point, line, or polygon) */
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

    return (
      <g key={`proj-${proj.workspaceId}-${pi}`}>
        <polygon points={points}
          fill={hslWithAlpha(color, isEditingThis ? 0.25 : 0.12)}
          stroke={color} strokeWidth={isEditingThis ? 2.5 : 1.5}
          strokeDasharray={isEditingThis ? 'none' : '4 2'}
          className={isEditingThis ? '' : 'cursor-pointer'}
          onClick={() => !isEditingThis && selectWorkspace(proj)}
        />
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
            >{eLenMm} mm</text>
          );
        })}
        {/* Vertex labels */}
        {verts.map((v, vi) => (
          <text key={`vl-${vi}`} x={toSvg(v.x, v.y).sx} y={toSvg(v.x, v.y).sy - (isEditingThis ? 10 : 7)}
            textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
            className="pointer-events-none select-none"
          >{hLabel}{v.x},{vLabel}{v.y}</text>
        ))}
        {/* Name + area label */}
        <rect x={cxSvg - 30} y={cySvg - 10} width={60} height={20} rx={3}
          fill="hsl(45 100% 50% / 0.85)"
          className={isEditingThis ? '' : 'cursor-pointer'}
          onClick={() => !isEditingThis && selectWorkspace(proj)}
        />
        <text x={cxSvg} y={cySvg - 1} textAnchor="middle" fontSize={fontSize} fontWeight={700}
          fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
        >{proj.workspaceName}</text>
        <text x={cxSvg} y={cySvg + 8} textAnchor="middle" fontSize={fontSize - 1} fontWeight={500}
          fill="hsl(0 0% 25%)" className="pointer-events-none select-none"
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
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5">
            <span className="text-[8px] text-muted-foreground font-medium">Zoom:</span>
            {zoomOptions.map(z => (
              <Button
                key={z}
                variant={zoomLevel === z ? 'default' : 'ghost'}
                size="sm"
                className="h-4 px-1.5 text-[8px] min-w-0"
                onClick={() => setZoomLevel(z)}
              >
                {z}x
              </Button>
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
          />
        </div>
      </div>

      {/* Legend for workspaces in elevation sections */}
      {isElevation && wallProjections && wallProjections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-2 py-1">
          <span className="text-[9px] text-muted-foreground font-medium">Espacios:</span>
          {wallProjections.map((proj, pi) => {
            const isActive = selectedWorkspaceId === proj.workspaceId;
            return (
              <button
                key={proj.workspaceId}
                className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition-colors ${isActive ? 'bg-primary/15 border-primary font-semibold' : 'hover:bg-accent/50'}`}
                style={{ borderColor: isActive ? undefined : PROJ_COLORS[pi % PROJ_COLORS.length] }}
                onClick={() => selectWorkspace(proj)}
                title={isActive ? 'Deseleccionar' : `Editar ${proj.workspaceName}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PROJ_COLORS[pi % PROJ_COLORS.length] }} />
                {proj.workspaceName}
                {isActive && <span className="text-primary ml-0.5">✎</span>}
              </button>
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
        style={{ cursor: draggingIdx !== null ? 'grabbing' : undefined }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
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

        {/* Workspace floor polygons for vertical sections */}
        {section.sectionType === 'vertical' && rooms && (() => {
          const sectionRooms = rooms
            .filter(r => r.verticalSectionId === section.id && r.floorPolygon && r.floorPolygon.length >= 3);

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
                    <polygon
                      points={points}
                      fill="hsl(var(--primary) / 0.12)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />

                    {/* Wall measurements */}
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

                      return (
                        <g key={`wall-mm-${room.id}-${i}`} className="pointer-events-none">
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
                          >
                            {wallLenMm} mm
                          </text>
                        </g>
                      );
                    })}

                    {/* Wall numbers (positioned outward) */}
                    {svgPts.map((pt, i) => {
                      const next = svgPts[(i + 1) % svgPts.length];
                      const mx = (pt.x + next.x) / 2;
                      const my = (pt.y + next.y) / 2;
                      const dx = next.x - pt.x;
                      const dy = next.y - pt.y;
                      const len = Math.sqrt(dx * dx + dy * dy) || 1;
                      let nx = -dy / len;
                      let ny = dx / len;
                      const toCenter = (cxSvg - mx) * nx + (cySvg - my) * ny;
                      if (toCenter > 0) { nx = -nx; ny = -ny; }
                      const offX = mx + nx * 12;
                      const offY = my + ny * 12;
                      return (
                        <g key={`wn-${room.id}-${i}`}>
                          <circle cx={offX} cy={offY} r={6} fill="hsl(var(--muted-foreground))" />
                          <text x={offX} y={offY} textAnchor="middle" dominantBaseline="central" fill="hsl(var(--primary-foreground))" fontSize="7" fontWeight="bold">
                            {i + 1}
                          </text>
                        </g>
                      );
                    })}

                    {/* Name + area label */}
                    <rect
                      x={cxSvg - 30}
                      y={cySvg - 12}
                      width={60}
                      height={22}
                      rx={3}
                      fill="hsl(45 100% 50% / 0.85)"
                    />
                    <text
                      x={cxSvg}
                      y={cySvg - 3}
                      textAnchor="middle"
                      fontSize={Math.round(8 * Math.max(1, zoomLevel * 0.7))}
                      fontWeight={700}
                      fill="hsl(0 0% 10%)"
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
                    >
                      {areaM2.toFixed(2)} m²
                    </text>
                  </g>
                );
              })}

              {/* Global perimeter dimensions */}
              {hasGlobalBounds && (() => {
                const off = 26;
                const topY = globalTop - off;
                const bottomY = globalBottom + off;
                const leftX = globalLeft - off;
                const rightX = globalRight + off;
                const midX = (globalLeft + globalRight) / 2;
                const midY = (globalTop + globalBottom) / 2;
                const perimFontSize = Math.round(8 * Math.max(1, zoomLevel * 0.8));

                return (
                  <g className="pointer-events-none">
                    <line x1={globalLeft} y1={topY} x2={globalRight} y2={topY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={globalLeft} y2={topY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalTop} x2={globalRight} y2={topY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text x={midX} y={topY - 5} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    <line x1={globalLeft} y1={bottomY} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalBottom} x2={globalLeft} y2={bottomY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalBottom} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text x={midX} y={bottomY + 10} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    <line x1={leftX} y1={globalTop} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={leftX} y2={globalTop} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalLeft} y1={globalBottom} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text
                      x={leftX - 6}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${leftX - 6}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>

                    <line x1={rightX} y1={globalTop} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalRight} y1={globalTop} x2={rightX} y2={globalTop} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalBottom} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text
                      x={rightX + 6}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${rightX + 6}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>
                  </g>
                );
              })()}
            </>
          );
        })()}

        {/* ── Workspace polygons for longitudinal/transversal sections ── */}
        {isElevation && wallProjections && wallProjections.length > 0 && (() => {
          return (
            <>
              {wallProjections.map((proj, pi) => {
                const isEditingThis = selectedWorkspaceId === proj.workspaceId;
                const color = PROJ_COLORS[pi % PROJ_COLORS.length];
                
                // Use saved polygon or default rectangle
                const verts = isEditingThis ? editVertices : getWorkspacePolygon(section, proj);
                
                // Support 2-vertex lines (e.g. ridge lines, roof start edges)
                if (verts.length < 2) return null;
                const isLine = verts.length === 2;

                const svgPts = verts.map(v => toSvg(v.x, v.y));
                const fontSize = Math.round(7 * Math.max(1, zoomLevel * 0.8));

                if (isLine) {
                  // Render as a line with label
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
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={color}
                        strokeWidth={isEditingThis ? 3 : 2}
                        strokeLinecap="round"
                        className={isEditingThis ? '' : 'cursor-pointer'}
                        onClick={() => !isEditingThis && selectWorkspace(proj)}
                      />
                      {/* Vertex coordinate labels */}
                      {verts.map((v, vi) => {
                        const { sx, sy } = svgPts[vi];
                        return (
                          <text
                            key={`vl-${proj.workspaceId}-${vi}`}
                            x={sx} y={sy - 8}
                            textAnchor="middle" fontSize={6} fontWeight={600} fill={color}
                            className="pointer-events-none select-none"
                          >
                            {hLabel}{v.x},{vLabel}{v.y}
                          </text>
                        );
                      })}
                      {/* Length label */}
                      <text
                        x={mx} y={my - 8}
                        textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(${rotAngle}, ${mx}, ${my - 8})`}
                        fontSize={fontSize} fontWeight={700} fill={color}
                        className="pointer-events-none select-none"
                      >
                        {lineLenMm} mm
                      </text>
                      {/* Name label */}
                      <rect x={mx - 25} y={my + 3} width={50} height={14} rx={3}
                        fill="hsl(45 100% 50% / 0.85)"
                        className={isEditingThis ? '' : 'cursor-pointer'}
                        onClick={() => !isEditingThis && selectWorkspace(proj)}
                      />
                      <text x={mx} y={my + 12} textAnchor="middle" fontSize={fontSize} fontWeight={700}
                        fill="hsl(0 0% 10%)" className="pointer-events-none select-none"
                      >
                        {proj.workspaceName}
                      </text>
                      {/* Draggable vertices when editing */}
                      {isEditingThis && verts.map((v, vi) => {
                        const { sx, sy } = svgPts[vi];
                        const isDragging = draggingIdx === vi;
                        return (
                          <circle key={`dv-${vi}`}
                            cx={sx} cy={sy} r={isDragging ? 7 : 5}
                            fill={isDragging ? 'hsl(var(--destructive))' : color}
                            stroke="white" strokeWidth={2} className="cursor-grab"
                            onMouseDown={(e) => handleMouseDown(vi, e)}
                          />
                        );
                      })}
                    </g>
                  );
                }

                // Polygon (3+ vertices) rendering
                const points = svgPts.map(p => `${p.sx},${p.sy}`).join(' ');

                // Centroid
                const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
                const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
                const { sx: cxSvg, sy: cySvg } = toSvg(cx, cy);

                // Area
                const areaVal = polygonAreaCalc(verts) * scaleHm * scaleVm;

                return (
                  <g key={`proj-${proj.workspaceId}-${pi}`}>
                    {/* Filled polygon with correct alpha */}
                    <polygon
                      points={points}
                      fill={hslWithAlpha(color, isEditingThis ? 0.25 : 0.12)}
                      stroke={color}
                      strokeWidth={isEditingThis ? 2.5 : 1.5}
                      strokeDasharray={isEditingThis ? 'none' : '4 2'}
                      className={isEditingThis ? '' : 'cursor-pointer'}
                      onClick={() => !isEditingThis && selectWorkspace(proj)}
                    />

                    {/* Edge measurements */}
                    {verts.map((v, ei) => {
                      const next = verts[(ei + 1) % verts.length];
                      const { sx: x1, sy: y1 } = toSvg(v.x, v.y);
                      const { sx: x2, sy: y2 } = toSvg(next.x, next.y);
                      const mx = (x1 + x2) / 2;
                      const my = (y1 + y2) / 2;
                      const dx = x2 - x1;
                      const dy = y2 - y1;
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      const rotAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
                      const eLenMm = Math.round(Math.sqrt(
                        ((next.x - v.x) * scaleHm) ** 2 + ((next.y - v.y) * scaleVm) ** 2
                      ) * 1000);

                      // Outward normal for label positioning
                      const len = Math.sqrt(dx * dx + dy * dy) || 1;
                      let nx = -dy / len;
                      let ny = dx / len;
                      if ((cxSvg - mx) * nx + (cySvg - my) * ny > 0) { nx = -nx; ny = -ny; }
                      const offPx = isEditingThis ? 14 : 10;

                      return (
                        <text
                          key={`emm-${proj.workspaceId}-${ei}`}
                          x={mx + nx * offPx}
                          y={my + ny * offPx}
                          textAnchor="middle"
                          dominantBaseline="central"
                          transform={`rotate(${rotAngle}, ${mx + nx * offPx}, ${my + ny * offPx})`}
                          fontSize={fontSize}
                          fontWeight={700}
                          fill={color}
                          className="pointer-events-none select-none"
                        >
                          {eLenMm} mm
                        </text>
                      );
                    })}

                    {/* Vertex labels with coordinates */}
                    {verts.map((v, vi) => {
                      const { sx, sy } = toSvg(v.x, v.y);
                      return (
                        <text
                          key={`vl-${proj.workspaceId}-${vi}`}
                          x={sx}
                          y={sy - (isEditingThis ? 10 : 7)}
                          textAnchor="middle"
                          fontSize={6}
                          fontWeight={600}
                          fill={color}
                          className="pointer-events-none select-none"
                        >
                          {hLabel}{v.x},{vLabel}{v.y}
                        </text>
                      );
                    })}

                    {/* Name label */}
                    <rect
                      x={cxSvg - 30}
                      y={cySvg - 10}
                      width={60}
                      height={20}
                      rx={3}
                      fill="hsl(45 100% 50% / 0.85)"
                      className={isEditingThis ? '' : 'cursor-pointer'}
                      onClick={() => !isEditingThis && selectWorkspace(proj)}
                    />
                    <text
                      x={cxSvg} y={cySvg - 1}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fontWeight={700}
                      fill="hsl(0 0% 10%)"
                      className="pointer-events-none select-none"
                    >
                      {proj.workspaceName}
                    </text>
                    <text
                      x={cxSvg} y={cySvg + 8}
                      textAnchor="middle"
                      fontSize={fontSize - 1}
                      fontWeight={500}
                      fill="hsl(0 0% 25%)"
                      className="pointer-events-none select-none"
                    >
                      {areaVal.toFixed(2)} m²
                    </text>

                    {/* Draggable vertices when editing */}
                    {isEditingThis && verts.map((v, vi) => {
                      const { sx, sy } = toSvg(v.x, v.y);
                      const isDragging = draggingIdx === vi;
                      return (
                        <g key={`dv-${vi}`}>
                          <circle
                            cx={sx} cy={sy}
                            r={isDragging ? 7 : 5}
                            fill={isDragging ? 'hsl(var(--destructive))' : color}
                            stroke="white"
                            strokeWidth={2}
                            className="cursor-grab"
                            onMouseDown={(e) => handleMouseDown(vi, e)}
                          />
                          <text
                            x={sx} y={sy + 16}
                            textAnchor="middle"
                            fontSize={7}
                            fontWeight={700}
                            fill={color}
                            className="pointer-events-none select-none"
                          >
                            V{vi + 1}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

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

                const { sx: gleft, sy: gtop } = toSvg(bMinX, bMaxY);
                const { sx: gright, sy: gbottom } = toSvg(bMaxX, bMinY);
                const off = 26;
                const perimFontSize = Math.round(8 * Math.max(1, zoomLevel * 0.8));
                const midX = (gleft + gright) / 2;
                const midY = (gtop + gbottom) / 2;

                return (
                  <g className="pointer-events-none">
                    {totalWidthMm > 0 && (
                      <>
                        <line x1={gleft} y1={gtop - off} x2={gright} y2={gtop - off} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gleft} y1={gtop} x2={gleft} y2={gtop - off - 4} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.5} />
                        <line x1={gright} y1={gtop} x2={gright} y2={gtop - off - 4} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.5} />
                        <text x={midX} y={gtop - off - 5} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{totalWidthMm} mm</text>
                      </>
                    )}
                    {totalHeightMm > 0 && (
                      <>
                        <line x1={gright + off} y1={gtop} x2={gright + off} y2={gbottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                        <line x1={gright} y1={gtop} x2={gright + off + 4} y2={gtop} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.5} />
                        <line x1={gright} y1={gbottom} x2={gright + off + 4} y2={gbottom} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.5} />
                        <text
                          x={gright + off + 8} y={midY}
                          textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)"
                          transform={`rotate(-90, ${gright + off + 8}, ${midY})`}
                        >{totalHeightMm} mm</text>
                      </>
                    )}
                  </g>
                );
              })()}
            </>
          );
        })()}

      </svg>
      </div>

      {/* Editing controls */}
      {isElevation && selectedWorkspaceId && (
        <div className="mt-2 border rounded-lg p-2 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              Editando: {wallProjections?.find(p => p.workspaceId === selectedWorkspaceId)?.workspaceName}
            </span>
            <Badge variant="secondary" className="text-[9px] h-4">
              {editVertices.length} vértices
              {editVertices.length >= 3 && ` · ${(polygonAreaCalc(editVertices) * scaleHm * scaleVm).toFixed(2)} m²`}
              {editVertices.length === 2 && ` · ${Math.round(Math.sqrt(((editVertices[1].x - editVertices[0].x) * scaleHm) ** 2 + ((editVertices[1].y - editVertices[0].y) * scaleVm) ** 2) * 1000)} mm`}
            </Badge>
          </div>

          {/* Vertex list */}
          <div className="space-y-1">
            {editVertices.map((v, i) => {
              const nextV = editVertices[(i + 1) % editVertices.length];
              const edgeMm = Math.round(Math.sqrt(((nextV.x - v.x) * scaleHm) ** 2 + ((nextV.y - v.y) * scaleVm) ** 2) * 1000);
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
                  <span className="text-[8px] text-muted-foreground">→ {edgeMm}mm</span>
                  {editVertices.length > 2 && (
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
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5" onClick={resetToDefault}>
              <RefreshCw className="h-3 w-3" /> Resetear
            </Button>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedWorkspaceId(null); setEditVertices([]); }}>
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-[10px] gap-0.5" onClick={saveEditedPolygon} disabled={editVertices.length < 2}>
                <Save className="h-3 w-3" /> Guardar
              </Button>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Arrastra los vértices en la cuadrícula o edita las coordenadas manualmente. Útil para definir caídas de tejado.
          </p>
        </div>
      )}
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, wallProjectionsBySection, rooms, budgetName }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');
  const [visibleGridId, setVisibleGridId] = useState<string | null>(null);

  const axisConfig = AXIS_MAP[sectionType];
  const filtered = sections.filter(s => s.sectionType === sectionType);

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
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Nueva Sección
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground italic">{AXIS_DESCRIPTION[sectionType]}</p>

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
          <div key={section.id}>
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
              />
            )}
          </div>
        );
      })}
    </div>
  );
}