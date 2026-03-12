import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, PenTool, X, Check } from 'lucide-react';
import type { SectionPolygon } from './CustomSectionManager';

interface SectionScale {
  hScale: number;
  vScale: number;
}

interface RidgeLineData {
  x1: number; y1: number; x2: number; y2: number; z: number;
}

interface SectionAxisViewerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axisValue: number;
  sectionName: string;
  savedScale?: { hScale: number; vScale: number };
  onSaveScale?: (scale: { hScale: number; vScale: number }) => void;
  savedNegLimits?: { negH: number; negV: number; posH?: number; posV?: number };
  onSaveNegLimits?: (limits: { negH: number; negV: number; posH: number; posV: number }) => void;
  ridgeLine?: RidgeLineData | null;
  /** Persisted polygons (workspaces) */
  polygons?: SectionPolygon[];
  onSavePolygons?: (polygons: SectionPolygon[]) => void;
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

/** Compute polygon area using the Shoelace formula (in grid units²) */
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

/** Compute centroid of polygon */
function polygonCentroid(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
  let cx = 0, cy = 0;
  vertices.forEach(v => { cx += v.x; cy += v.y; });
  return { x: cx / vertices.length, y: cy / vertices.length };
}

/** Distance between two points in grid coords */
function edgeLengthGrid(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function SectionAxisViewer({
  sectionType,
  axisValue,
  sectionName,
  savedScale,
  onSaveScale,
  savedNegLimits,
  onSaveNegLimits,
  ridgeLine,
  polygons: savedPolygons,
  onSavePolygons,
}: SectionAxisViewerProps) {
  const { fixedAxis, hAxis, vAxis } = getConfig(sectionType);
  const hColor = AXIS_COLORS[hAxis];
  const vColor = AXIS_COLORS[vAxis];
  const fixedColor = AXIS_COLORS[fixedAxis];

  // Scale inputs
  const [hScaleInput, setHScaleInput] = useState(String(savedScale?.hScale || ''));
  const [vScaleInput, setVScaleInput] = useState(String(savedScale?.vScale || ''));
  const [scale, setScale] = useState<SectionScale | null>(savedScale || null);

  // Grid limits: negative and positive for each axis (in grid nodes)
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

  // Polygons
  const [polygons, setPolygons] = useState<SectionPolygon[]>(savedPolygons || []);

  // Editing state for inline polygon editing
  const [editingPolyId, setEditingPolyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editVertices, setEditVertices] = useState<Array<{ x: number; y: number; z: number }>>([]);

  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (savedScale) {
      setScale(savedScale);
      setHScaleInput(String(savedScale.hScale));
      setVScaleInput(String(savedScale.vScale));
    }
  }, [savedScale]);

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

  useEffect(() => {
    if (savedPolygons) setPolygons(savedPolygons);
  }, [savedPolygons]);

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

  const margin = 50;
  const w = containerSize.w;
  const h = containerSize.h;

  // Compute grid layout: fixed number of cols/rows from limits, cellPx auto-calculated to fill viewport
  const gridLayout = useMemo(() => {
    if (!scale) return null;
    const totalCols = gridLimits.negH + gridLimits.posH;
    const totalRows = gridLimits.negV + gridLimits.posV;
    if (totalCols < 1 || totalRows < 1) return null;
    const drawW = w - margin * 2;
    const drawH = h - margin * 2;
    const cellW = drawW / totalCols;
    const cellH = drawH / totalRows;
    const cellPx = Math.floor(Math.min(cellW, cellH));
    if (cellPx < 8) return null;
    const gridW = totalCols * cellPx;
    const gridH = totalRows * cellPx;
    const ox = margin + Math.floor((drawW - gridW) / 2);
    const oy = margin + Math.floor((drawH - gridH) / 2);
    const originCol = gridLimits.negH;
    const originRow = gridLimits.posV;
    const originX = ox + originCol * cellPx;
    const originY = oy + originRow * cellPx;
    return { totalCols, totalRows, gridW, gridH, ox, oy, originCol, originRow, originX, originY, cellPx };
  }, [scale, w, h, gridLimits]);

  // Convert grid col/row to pixel
  const colRowToPx = useCallback((col: number, row: number) => {
    if (!gridLayout) return { px: 0, py: 0 };
    return {
      px: gridLayout.ox + col * gridLayout.cellPx,
      py: gridLayout.oy + row * gridLayout.cellPx,
    };
  }, [gridLayout]);

  // Convert grid col/row to coordinate label values
  const colRowToCoord = useCallback((col: number, row: number) => {
    if (!gridLayout) return { hIdx: 0, vIdx: 0 };
    return {
      hIdx: col - gridLayout.originCol,
      vIdx: gridLayout.originRow - row,
    };
  }, [gridLayout]);

  // Snap mouse position to nearest grid node
  const snapToNode = useCallback((clientX: number, clientY: number): { col: number; row: number } | null => {
    if (!gridLayout || !containerRef.current) return null;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const col = Math.round((mx - gridLayout.ox) / gridLayout.cellPx);
    const row = Math.round((my - gridLayout.oy) / gridLayout.cellPx);
    if (col < 0 || col > gridLayout.totalCols || row < 0 || row > gridLayout.totalRows) return null;
    return { col, row };
  }, [gridLayout]);

  // Handle SVG click for drawing
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode || !gridLayout) return;
    const node = snapToNode(e.clientX, e.clientY);
    if (!node) return;

    // Check if closing the polygon (clicking first vertex)
    if (drawingVertices.length >= 3 &&
        node.col === drawingVertices[0].col && node.row === drawingVertices[0].row) {
      // Close polygon and save
      finishDrawing();
      return;
    }

    // Don't add duplicate of last vertex
    const last = drawingVertices[drawingVertices.length - 1];
    if (last && last.col === node.col && last.row === node.row) return;

    setDrawingVertices(prev => [...prev, node]);
  }, [drawMode, gridLayout, drawingVertices, snapToNode]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode || !gridLayout) { setHoverNode(null); return; }
    const node = snapToNode(e.clientX, e.clientY);
    setHoverNode(node);
  }, [drawMode, gridLayout, snapToNode]);

  const finishDrawing = useCallback(() => {
    if (drawingVertices.length < 3 || !scale || !gridLayout) return;
    const name = drawingName.trim() || `Espacio ${polygons.length + 1}`;
    const heightMm = parseInt(drawingHeight) || 0;

    // Convert col/row to axis coordinates
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
  }, [drawingVertices, drawingName, drawingHeight, polygons, scale, gridLayout, colRowToCoord, onSavePolygons]);

  const cancelDrawing = () => {
    setDrawMode(false);
    setDrawingVertices([]);
    setDrawingName('');
    setDrawingHeight('');
    setHoverNode(null);
  };

  const handleDeletePolygon = (polyId: string) => {
    const updated = polygons.filter(p => p.id !== polyId);
    setPolygons(updated);
    onSavePolygons?.(updated);
  };

  // Edit polygon handlers
  const startEditPolygon = (poly: SectionPolygon) => {
    setEditingPolyId(poly.id);
    setEditName(poly.name);
    setEditHeight(String(poly.zTop || 0));
    setEditVertices(poly.vertices.map(v => ({ ...v })));
  };

  const saveEditPolygon = () => {
    if (!editingPolyId) return;
    const updated = polygons.map(p => {
      if (p.id !== editingPolyId) return p;
      return {
        ...p,
        name: editName.trim() || p.name,
        zTop: parseInt(editHeight) || p.zTop,
        vertices: editVertices,
      };
    });
    setPolygons(updated);
    onSavePolygons?.(updated);
    setEditingPolyId(null);
  };

  const cancelEditPolygon = () => {
    setEditingPolyId(null);
  };

  const updateEditVertex = (idx: number, axis: 'x' | 'y', value: number) => {
    setEditVertices(prev => prev.map((v, i) => i === idx ? { ...v, [axis]: value } : v));
  };

  // Grid rendering
  const gridContent = useMemo(() => {
    if (!scale || !gridLayout) return null;
    const { totalCols, totalRows, gridW, gridH, ox, oy, originCol, originRow, originX, originY, cellPx } = gridLayout;

    const gridLines: JSX.Element[] = [];
    const axisRefs: JSX.Element[] = [];

    // Grid lines (these will fade during draw mode)
    for (let c = 0; c <= totalCols; c++) {
      const x = ox + c * cellPx;
      const isOrigin = c === originCol;
      gridLines.push(
        <line key={`gv${c}`} x1={x} y1={oy} x2={x} y2={oy + gridH}
          stroke={isOrigin ? hColor : 'hsl(var(--muted-foreground))'} strokeWidth={isOrigin ? 2.5 : 1} opacity={isOrigin ? 1 : 0.7} />
      );
    }
    for (let r = 0; r <= totalRows; r++) {
      const y = oy + r * cellPx;
      const isOrigin = r === originRow;
      gridLines.push(
        <line key={`gh${r}`} x1={ox} y1={y} x2={ox + gridW} y2={y}
          stroke={isOrigin ? vColor : 'hsl(var(--muted-foreground))'} strokeWidth={isOrigin ? 2.5 : 1} opacity={isOrigin ? 1 : 0.7} />
      );
    }

    // Tick labels (axis references - always visible)
    for (let c = 0; c <= totalCols; c++) {
      const x = ox + c * cellPx;
      const idx = c - originCol;
      axisRefs.push(
        <text key={`ht${c}`} x={x} y={oy + gridH + 16}
          textAnchor="middle" fontSize={9} fill={hColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {hAxis}{idx}
        </text>
      );
    }
    for (let r = 0; r <= totalRows; r++) {
      const y = oy + r * cellPx;
      const idx = originRow - r;
      axisRefs.push(
        <text key={`vt${r}`} x={ox - 6} y={y + 4}
          textAnchor="end" fontSize={9} fill={vColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {vAxis}{idx}
        </text>
      );
    }

    // H axis arrow
    axisRefs.push(
      <polygon key="harrow"
        points={`${ox + gridW},${originY} ${ox + gridW - 8},${originY - 4} ${ox + gridW - 8},${originY + 4}`}
        fill={hColor} />
    );
    axisRefs.push(
      <text key="hlabel" x={ox + gridW + 4} y={originY - 8}
        fontSize={14} fontWeight="bold" fill={hColor} fontFamily="monospace">{hAxis}</text>
    );

    // V axis arrow (up)
    axisRefs.push(
      <polygon key="varrow"
        points={`${originX},${oy} ${originX - 4},${oy + 8} ${originX + 4},${oy + 8}`}
        fill={vColor} />
    );
    axisRefs.push(
      <text key="vlabel" x={originX + 8} y={oy + 4}
        fontSize={14} fontWeight="bold" fill={vColor} fontFamily="monospace">{vAxis}</text>
    );

    // Origin indicator
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

    // Ridge line on Z sections
    if (sectionType === 'vertical' && ridgeLine) {
      const RIDGE_COLOR = 'hsl(0, 70%, 50%)';
      const rx1 = originX + ridgeLine.x1 * cellPx;
      const ry1 = originY - ridgeLine.y1 * cellPx;
      const rx2 = originX + ridgeLine.x2 * cellPx;
      const ry2 = originY - ridgeLine.y2 * cellPx;
      const dx = ridgeLine.x2 - ridgeLine.x1;
      const dy = ridgeLine.y2 - ridgeLine.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ext = len > 0 ? 3 : 0;
      const ux = len > 0 ? dx / len : 0;
      const uy = len > 0 ? dy / len : 0;
      const ex1 = originX + (ridgeLine.x1 - ux * ext) * cellPx;
      const ey1 = originY - (ridgeLine.y1 - uy * ext) * cellPx;
      const ex2 = originX + (ridgeLine.x2 + ux * ext) * cellPx;
      const ey2 = originY - (ridgeLine.y2 + uy * ext) * cellPx;
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

    return { gridLines, axisRefs };
  }, [scale, gridLayout, hAxis, vAxis, hColor, vColor, fixedColor, sectionType, ridgeLine]);

  // Render saved polygons
  const polygonElements = useMemo(() => {
    if (!gridLayout || !scale) return null;
    const { originX, originY, cellPx } = gridLayout;
    const elements: JSX.Element[] = [];

    polygons.forEach((poly, polyIdx) => {
      const color = WORKSPACE_COLORS[polyIdx % WORKSPACE_COLORS.length];
      const verts = poly.vertices;
      if (verts.length < 3) return;

      // Convert to pixel positions: x is hAxis (positive right), y is vAxis (positive up → screen up)
      const pxVerts = verts.map(v => ({
        px: originX + v.x * cellPx,
        py: originY - v.y * cellPx,
      }));

      // Polygon fill
      const pointsStr = pxVerts.map(p => `${p.px},${p.py}`).join(' ');
      elements.push(
        <polygon key={`poly-${poly.id}`} points={pointsStr}
          fill={color} fillOpacity={0.15} stroke={color} strokeWidth={2.5} />
      );

      // Edge labels: wall number + length in mm
      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length;
        const a = pxVerts[i];
        const b = pxVerts[j];
        const edgeMidX = (a.px + b.px) / 2;
        const edgeMidY = (a.py + b.py) / 2;

        // Length in mm using scale
        const dxGrid = Math.abs(verts[j].x - verts[i].x);
        const dyGrid = Math.abs(verts[j].y - verts[i].y);
        const lengthMm = Math.sqrt((dxGrid * scale.hScale) ** 2 + (dyGrid * scale.vScale) ** 2);
        const wallNum = i + 1;

        // Offset label slightly perpendicular to the edge
        const edgeDx = b.px - a.px;
        const edgeDy = b.py - a.py;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        const nx = edgeLen > 0 ? -edgeDy / edgeLen : 0;
        const ny = edgeLen > 0 ? edgeDx / edgeLen : 0;
        const offset = 14;

        elements.push(
          <g key={`edge-${poly.id}-${i}`}>
            {/* Background */}
            <rect
              x={edgeMidX + nx * offset - 28}
              y={edgeMidY + ny * offset - 8}
              width={56} height={16} rx={3}
              fill="white" fillOpacity={0.92} stroke={color} strokeWidth={0.5}
            />
            <text
              x={edgeMidX + nx * offset}
              y={edgeMidY + ny * offset + 4}
              textAnchor="middle" fontSize={9} fontWeight={700} fill={color} fontFamily="monospace">
              P{wallNum} {Math.round(lengthMm)}mm
            </text>
          </g>
        );

        // Vertex dot
        elements.push(
          <circle key={`vtx-${poly.id}-${i}`} cx={a.px} cy={a.py} r={3.5}
            fill={color} stroke="white" strokeWidth={1.5} />
        );
      }

      // Center label: name + area m² — NO box, text only with contrasting dark color
      const areaGrid = polygonAreaGrid(verts.map(v => ({ x: v.x, y: v.y })));
      const areaM2 = areaGrid * (scale.hScale / 1000) * (scale.vScale / 1000);
      const centroid = polygonCentroid(verts.map(v => ({ x: v.x, y: v.y })));
      const cx = originX + centroid.x * cellPx;
      const cy = originY - centroid.y * cellPx;
      const heightMm = poly.zTop ? poly.zTop : null;

      // Use a darkened version of the workspace color for contrast
      const darkColor = color.replace(/(\d+)%\)$/, (_, l) => `${Math.max(parseInt(l) - 20, 15)}%)`);

      elements.push(
        <g key={`center-${poly.id}`}>
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fontWeight={800} fill={darkColor} fontFamily="sans-serif"
            stroke="white" strokeWidth={2.5} paintOrder="stroke">
            {poly.name}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fontWeight={700} fill={darkColor} fontFamily="monospace"
            stroke="white" strokeWidth={2} paintOrder="stroke">
            {areaM2.toFixed(2)} m²{heightMm ? ` · h=${heightMm}mm` : ''}
          </text>
        </g>
      );
    });

    return elements;
  }, [polygons, gridLayout, scale]);

  // Drawing overlay (current drawing in progress)
  const drawingOverlay = useMemo(() => {
    if (!drawMode || !gridLayout || drawingVertices.length === 0) return null;
    const { ox, oy, cellPx } = gridLayout;
    const elements: JSX.Element[] = [];

    const pxVerts = drawingVertices.map(v => ({
      px: ox + v.col * cellPx,
      py: oy + v.row * cellPx,
    }));

    // Lines between placed vertices
    for (let i = 0; i < pxVerts.length - 1; i++) {
      elements.push(
        <line key={`dline-${i}`}
          x1={pxVerts[i].px} y1={pxVerts[i].py}
          x2={pxVerts[i + 1].px} y2={pxVerts[i + 1].py}
          stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 3" />
      );
    }

    // Line from last vertex to hover node
    if (hoverNode && pxVerts.length > 0) {
      const lastPx = pxVerts[pxVerts.length - 1];
      const hPx = ox + hoverNode.col * cellPx;
      const hPy = oy + hoverNode.row * cellPx;
      elements.push(
        <line key="dhover"
          x1={lastPx.px} y1={lastPx.py} x2={hPx} y2={hPy}
          stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} />
      );
      // If hovering first vertex and enough vertices, show close indicator
      if (drawingVertices.length >= 3 &&
          hoverNode.col === drawingVertices[0].col && hoverNode.row === drawingVertices[0].row) {
        elements.push(
          <circle key="dclose" cx={pxVerts[0].px} cy={pxVerts[0].py} r={10}
            fill="hsl(var(--primary))" fillOpacity={0.25} stroke="hsl(var(--primary))" strokeWidth={2} />
        );
      }
    }

    // Vertex dots
    pxVerts.forEach((p, i) => {
      elements.push(
        <circle key={`dvtx-${i}`} cx={p.px} cy={p.py} r={4}
          fill={i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--primary))'} stroke="white" strokeWidth={2} />
      );
    });

    // Custom round cursor at hover node
    if (hoverNode) {
      const hPx = ox + hoverNode.col * cellPx;
      const hPy = oy + hoverNode.row * cellPx;
      const isCloseNode = drawingVertices.length >= 3 &&
        hoverNode.col === drawingVertices[0].col && hoverNode.row === drawingVertices[0].row;
      // Glow halo for visibility
      elements.push(
        <circle key="cursorGlow" cx={hPx} cy={hPy} r={isCloseNode ? 18 : 14}
          fill="hsl(var(--primary))" fillOpacity={0.12} />
      );
      // Outer ring — bigger if closing
      elements.push(
        <circle key="cursorOuter" cx={hPx} cy={hPy} r={isCloseNode ? 14 : 10}
          fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} opacity={0.9} />
      );
      // Inner filled dot
      elements.push(
        <circle key="cursorInner" cx={hPx} cy={hPy} r={4.5}
          fill="hsl(var(--primary))" opacity={1} />
      );
      // Crosshair lines for precision
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

  // Node interaction dots (visible in draw mode)
  const nodeInteractionDots = useMemo(() => {
    if (!drawMode || !gridLayout) return null;
    const { totalCols, totalRows, ox, oy, cellPx } = gridLayout;
    const elements: JSX.Element[] = [];
    for (let c = 0; c <= totalCols; c++) {
      for (let r = 0; r <= totalRows; r++) {
        const x = ox + c * cellPx;
        const y = oy + r * cellPx;
        const isHovered = hoverNode && hoverNode.col === c && hoverNode.row === r;
        elements.push(
          <circle key={`ndot-${c}-${r}`} cx={x} cy={y} r={isHovered ? 6 : 4}
            fill="hsl(var(--primary))" fillOpacity={isHovered ? 0.6 : 0.35}
            stroke="hsl(var(--primary))" strokeWidth={isHovered ? 2 : 0} strokeOpacity={0.5} />
        );
      }
    }
    return elements;
  }, [drawMode, gridLayout, hoverNode]);

  return (
    <div ref={containerRef} className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">{sectionName}</span>
        <span className="text-xs px-2 py-0.5 rounded font-mono font-bold"
          style={{ backgroundColor: fixedColor, color: 'white' }}>
          {fixedAxis}={axisValue}
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px]">
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
              value={hScaleInput} onChange={e => setHScaleInput(e.target.value)} placeholder="625" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Escala {vAxis} (mm)</Label>
            <Input className="h-7 w-24 text-xs font-mono" type="number" min={1}
              value={vScaleInput} onChange={e => setVScaleInput(e.target.value)} placeholder="625" />
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
            {gridLayout ? ` · celda=${gridLayout.cellPx}px` : ''}
          </span>
        </div>
      )}

      {/* Drawing toolbar */}
      {scale && (
        <div className="px-3 py-2 border-b bg-muted/10 flex items-center gap-3 flex-wrap">
          {!drawMode ? (
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
              </div>
              {polygons.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {polygons.length} espacio(s) dibujado(s)
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
      {polygons.length > 0 && !drawMode && (
        <div className="px-3 py-1.5 border-b bg-muted/5 flex flex-wrap gap-1.5">
          {polygons.map((poly, idx) => {
            const color = WORKSPACE_COLORS[idx % WORKSPACE_COLORS.length];
            const areaGrid = polygonAreaGrid(poly.vertices.map(v => ({ x: v.x, y: v.y })));
            const areaM2 = scale ? areaGrid * (scale.hScale / 1000) * (scale.vScale / 1000) : 0;
            const heightMm = poly.zTop || 0;
            return (
              <span key={poly.id}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: color, color, backgroundColor: editingPolyId === poly.id ? `${color}15` : undefined }}
                onClick={() => startEditPolygon(poly)}>
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
            <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEditPolygon}>
              <Check className="h-3 w-3" /> Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEditPolygon}>
              <X className="h-3 w-3" /> Cancelar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {editVertices.map((v, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 bg-background">
                <span className="font-mono font-bold text-muted-foreground">V{i + 1}</span>
                <span className="text-muted-foreground">{hAxis}:</span>
                <Input className="h-5 w-12 text-[10px] font-mono px-1" type="number"
                  value={v.x} onChange={e => updateEditVertex(i, 'x', parseFloat(e.target.value) || 0)} />
                <span className="text-muted-foreground">{vAxis}:</span>
                <Input className="h-5 w-12 text-[10px] font-mono px-1" type="number"
                  value={v.y} onChange={e => updateEditVertex(i, 'y', parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      {scale ? (
        <svg
          width={w} height={h}
          style={drawMode ? { cursor: 'none' } : undefined}
          className="block bg-background"
          onClick={handleSvgClick}
          onMouseMove={handleSvgMouseMove}
        >
          <g opacity={drawMode ? 0.25 : 1}>{gridContent?.gridLines}</g>
          {gridContent?.axisRefs}
          {nodeInteractionDots}
          {polygonElements}
          {drawingOverlay}
        </svg>
      ) : (
        <div className="flex items-center justify-center bg-background" style={{ height: h }}>
          <p className="text-sm text-muted-foreground">
            Define las escalas {hAxis} y {vAxis} en milímetros y pulsa <strong>Guardar escala</strong> para generar la cuadrícula.
          </p>
        </div>
      )}
    </div>
  );
}
