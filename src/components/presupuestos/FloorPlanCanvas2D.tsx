import { useMemo, useState, useCallback, useRef, useEffect } from 'react'; // zoom-fix-test
import type { FloorPlanData, RoomData, OutlineVertex } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, generateExternalWallNames, computeWallSegments, isExteriorType, isInvisibleType, isCompartidaType, computeGroupPerimeterWalls, computeBuildingOutline } from '@/lib/floor-plan-calculations';
import { Button } from '@/components/ui/button';
import { Expand, X, Map as MapIcon } from 'lucide-react';
import { createPortal } from 'react-dom';

interface FloorPlanCanvas2DProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  selectedRoomId?: string;
  selectedWallKey?: string;
  sharedWallKeys?: Set<string>;
  onSelectRoom?: (roomId: string) => void;
  onSelectWall?: (wallKey: string | null) => void;
  onMoveRoom?: (roomId: string, posX: number, posY: number) => void;
  onResizeWall?: (roomId: string, wallIndex: number, delta: number) => void;
  onDoubleClickRoom?: (roomId: string) => void;
  onDoubleClickWall?: (roomId: string, wallIndex: number, segIndex?: number) => void;
}

const ROOM_COLORS: Record<string, string> = {
  'Salón': '#c5d9f1',
  'Cocina': '#f5deb3',
  'Habitación': '#b8e6c8',
  'Baño': '#b3ddf0',
  'Despensa': '#d8c8e8',
  'Pasillo': '#e0e2e6',
  'Entrada': '#f5d0b0',
  'Patio': '#c0dfc0',
};

function getRoomColor(name: string): string {
  for (const [key, color] of Object.entries(ROOM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#e2e4e8';
}

const GRID_SNAP = 0.05;
const MAGNET_THRESHOLD = 0.15;
const SCALE = 40;

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SNAP) * GRID_SNAP;
}

function magneticSnap(
  roomId: string, posX: number, posY: number, width: number, length: number,
  allRooms: RoomData[]
): { x: number; y: number } {
  const edges = { left: posX, right: posX + width, top: posY, bottom: posY + length };
  const xCandidates: { target: number; dist: number; flush: boolean }[] = [];
  const yCandidates: { target: number; dist: number; flush: boolean }[] = [];

  for (const other of allRooms) {
    if (other.id === roomId) continue;
    const oEdges = { left: other.posX, right: other.posX + other.width, top: other.posY, bottom: other.posY + other.length };
    const vOverlap = Math.min(edges.bottom, oEdges.bottom) - Math.max(edges.top, oEdges.top);
    const hOverlap = Math.min(edges.right, oEdges.right) - Math.max(edges.left, oEdges.left);

    if (vOverlap > -MAGNET_THRESHOLD) {
      const d1 = Math.abs(edges.right - oEdges.left);
      if (d1 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.left - width, dist: d1, flush: true });
      const d2 = Math.abs(edges.left - oEdges.right);
      if (d2 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.right, dist: d2, flush: true });
      const d3 = Math.abs(edges.left - oEdges.left);
      if (d3 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.left, dist: d3, flush: false });
      const d4 = Math.abs(edges.right - oEdges.right);
      if (d4 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.right - width, dist: d4, flush: false });
    }

    if (hOverlap > -MAGNET_THRESHOLD) {
      const d5 = Math.abs(edges.bottom - oEdges.top);
      if (d5 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.top - length, dist: d5, flush: true });
      const d6 = Math.abs(edges.top - oEdges.bottom);
      if (d6 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.bottom, dist: d6, flush: true });
      const d7 = Math.abs(edges.top - oEdges.top);
      if (d7 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.top, dist: d7, flush: false });
      const d8 = Math.abs(edges.bottom - oEdges.bottom);
      if (d8 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.bottom - length, dist: d8, flush: false });
    }
  }

  const pickBest = (candidates: { target: number; dist: number; flush: boolean }[], fallback: number) => {
    if (candidates.length === 0) return fallback;
    candidates.sort((a, b) => {
      if (a.flush !== b.flush) return a.flush ? -1 : 1;
      return a.dist - b.dist;
    });
    return candidates[0].target;
  };

  return {
    x: pickBest(xCandidates, posX),
    y: pickBest(yCandidates, posY),
  };
}

// Wall style definitions — 6 exact types, no extras
const WALL_SELECTED_COLOR = '#6366f1';
const DIM_COLOR = '#c2410c';

const EXT_STROKE_WIDTH = 5;   // thick for all exterior types
const INT_STROKE_WIDTH = 2.5; // thin for all interior types

function getWallStyle(segType: string): { color: string; width: number; dash?: string } {
  const t = (segType || '').toLowerCase();
  // Exterior invisible
  if (t.includes('exterior') && t.includes('invisible'))
    return { color: '#9ca3af', width: EXT_STROKE_WIDTH, dash: '6 3' };
  // Exterior compartida
  if (t.includes('exterior') && t.includes('compartida'))
    return { color: '#2563eb', width: EXT_STROKE_WIDTH };
  // Exterior simple
  if (t.includes('exterior'))
    return { color: '#000000', width: EXT_STROKE_WIDTH };
  // Interior invisible
  if (t.includes('invisible'))
    return { color: '#9ca3af', width: INT_STROKE_WIDTH, dash: '4 3' };
  // Interior compartida
  if (t.includes('compartida'))
    return { color: '#16a34a', width: INT_STROKE_WIDTH };
  // Interior simple (default)
  return { color: '#f97316', width: INT_STROKE_WIDTH };
}

type DragState = {
  type: 'pan';
  startMouse: { x: number; y: number };
  startVal: { x: number; y: number };
} | {
  type: 'room';
  roomId: string;
  startMouse: { x: number; y: number };
  startPos: { x: number; y: number };
} | {
  type: 'resize';
  roomId: string;
  wallIndex: number;
  isHoriz: boolean;
  startMouse: { x: number; y: number };
};

export function FloorPlanCanvas2D({
  plan, rooms, selectedRoomId, selectedWallKey, sharedWallKeys,
  onSelectRoom, onSelectWall, onMoveRoom, onResizeWall, onDoubleClickRoom, onDoubleClickWall,
}: FloorPlanCanvas2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [dragging, setDragging] = useState<DragState | null>(null);

  // Live preview offsets — updated every mousemove frame
  const [liveDragOffset, setLiveDragOffset] = useState<{ roomId: string; dx: number; dy: number } | null>(null);
  const [liveResizeDelta, setLiveResizeDelta] = useState<{ roomId: string; wallIndex: number; delta: number; isHoriz: boolean } | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);

  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const perimeterWalls = useMemo(() => computeGroupPerimeterWalls(rooms), [rooms]);
  const buildingOutline = useMemo(() => computeBuildingOutline(rooms), [rooms]);
  const groupedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    rooms.forEach(r => { if (r.groupId) ids.add(r.id); });
    return ids;
  }, [rooms]);

  // Walls between cells of the same group → should be invisible
  const intraGroupWallKeys = useMemo(() => {
    const keys = new Set<string>();
    const EPSILON = 0.05;
    const grouped = rooms.filter(r => r.groupId);
    for (let i = 0; i < grouped.length; i++) {
      for (let j = i + 1; j < grouped.length; j++) {
        const a = grouped[i], b = grouped[j];
        if (a.groupId !== b.groupId) continue;
        // A right = B left
        if (Math.abs((a.posX + a.width) - b.posX) < EPSILON) {
          const os = Math.max(a.posY, b.posY);
          const oe = Math.min(a.posY + a.length, b.posY + b.length);
          if (oe - os > EPSILON) { keys.add(`${a.id}::2`); keys.add(`${b.id}::4`); }
        }
        // A left = B right
        if (Math.abs(a.posX - (b.posX + b.width)) < EPSILON) {
          const os = Math.max(a.posY, b.posY);
          const oe = Math.min(a.posY + a.length, b.posY + b.length);
          if (oe - os > EPSILON) { keys.add(`${a.id}::4`); keys.add(`${b.id}::2`); }
        }
        // A bottom = B top
        if (Math.abs((a.posY + a.length) - b.posY) < EPSILON) {
          const os = Math.max(a.posX, b.posX);
          const oe = Math.min(a.posX + a.width, b.posX + b.width);
          if (oe - os > EPSILON) { keys.add(`${a.id}::3`); keys.add(`${b.id}::1`); }
        }
        // A top = B bottom
        if (Math.abs(a.posY - (b.posY + b.length)) < EPSILON) {
          const os = Math.max(a.posX, b.posX);
          const oe = Math.min(a.posX + a.width, b.posX + b.width);
          if (oe - os > EPSILON) { keys.add(`${a.id}::1`); keys.add(`${b.id}::3`); }
        }
      }
    }
    return keys;
  }, [rooms]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const oldScale = zoom;
    const scaleBy = 1.08;
    const newScale = e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.3, Math.min(5, newScale));
    const normalizedScale = Math.abs(clampedScale - 1) < 0.03 ? 1 : clampedScale;

    if (normalizedScale === 1) {
      setZoom(1);
      setPan({ x: 80, y: 80 });
      return;
    }

    const mousePointTo = {
      x: (pointerX - pan.x) / oldScale,
      y: (pointerY - pan.y) / oldScale,
    };
    setZoom(normalizedScale);
    setPan({
      x: pointerX - mousePointTo.x * normalizedScale,
      y: pointerY - mousePointTo.y * normalizedScale,
    });
  }, [zoom, pan]);

  // ESC to cancel any drag
  useEffect(() => {
    if (!dragging) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragging(null);
        setLiveDragOffset(null);
        setLiveResizeDelta(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [dragging]);

  // Global mouse move/up for dragging — with LIVE preview
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startMouse.x;
      const dy = e.clientY - dragging.startMouse.y;

      if (dragging.type === 'pan') {
        setPan({ x: dragging.startVal.x + dx, y: dragging.startVal.y + dy });
      } else if (dragging.type === 'room') {
        // Live preview: compute snapped position offset
        const room = rooms.find(r => r.id === dragging.roomId);
        if (!room) return;
        const rawX = snapToGrid(dragging.startPos.x + dx / zoom / SCALE);
        const rawY = snapToGrid(dragging.startPos.y + dy / zoom / SCALE);
        const snapped = magneticSnap(dragging.roomId, rawX, rawY, room.width, room.length, rooms);
        setLiveDragOffset({
          roomId: dragging.roomId,
          dx: (snapped.x - room.posX) * SCALE,
          dy: (snapped.y - room.posY) * SCALE,
        });
      } else if (dragging.type === 'resize') {
        const delta = dragging.isHoriz
          ? snapToGrid(dy / zoom / SCALE)
          : snapToGrid(dx / zoom / SCALE);
        setLiveResizeDelta({
          roomId: dragging.roomId,
          wallIndex: dragging.wallIndex,
          delta,
          isHoriz: dragging.isHoriz,
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startMouse.x;
      const dy = e.clientY - dragging.startMouse.y;

      if (dragging.type === 'room' && onMoveRoom) {
        const room = rooms.find(r => r.id === dragging.roomId);
        if (room) {
          const rawX = snapToGrid(dragging.startPos.x + dx / zoom / SCALE);
          const rawY = snapToGrid(dragging.startPos.y + dy / zoom / SCALE);
          const snapped = magneticSnap(dragging.roomId, rawX, rawY, room.width, room.length, rooms);
          if (snapped.x !== room.posX || snapped.y !== room.posY) {
            onMoveRoom(dragging.roomId, snapped.x, snapped.y);
          }
        }
      } else if (dragging.type === 'resize' && onResizeWall) {
        const delta = dragging.isHoriz
          ? snapToGrid(dy / zoom / SCALE)
          : snapToGrid(dx / zoom / SCALE);
        if (delta !== 0) {
          onResizeWall(dragging.roomId, dragging.wallIndex, delta);
        }
      }
      setDragging(null);
      setLiveDragOffset(null);
      setLiveResizeDelta(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, rooms, zoom, onMoveRoom, onResizeWall]);

  // Keyboard movement
  useEffect(() => {
    if (!selectedRoomId || !onMoveRoom) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.01;
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      let newX = room.posX, newY = room.posY;
      if (e.key === 'ArrowLeft') newX -= step;
      if (e.key === 'ArrowRight') newX += step;
      if (e.key === 'ArrowUp') newY -= step;
      if (e.key === 'ArrowDown') newY += step;
      newX = Math.round(newX * 100) / 100;
      newY = Math.round(newY * 100) / 100;
      const snapped = magneticSnap(selectedRoomId, newX, newY, room.width, room.length, rooms);
      onMoveRoom(selectedRoomId, snapped.x, snapped.y);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedRoomId, onMoveRoom, rooms]);

  const perimeterDims = useMemo(() => {
    if (rooms.length === 0) return null;
    const extT = plan.externalWallThickness;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });
    return {
      extMinX: (minX - extT) * SCALE,
      extMinY: (minY - extT) * SCALE,
      extMaxX: (maxX + extT) * SCALE,
      extMaxY: (maxY + extT) * SCALE,
      topLen: (maxX - minX + 2 * extT),
      rightLen: (maxY - minY + 2 * extT),
    };
  }, [rooms, plan.externalWallThickness]);

  const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 250, 300];
  const extT = plan.externalWallThickness;

  const isDraggingAnything = !!dragging && dragging.type !== 'pan';
  const [showCorners, setShowCorners] = useState(true);
  const [gridFullscreen, setGridFullscreen] = useState(false);

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed border-border">
        <p className="text-muted-foreground text-sm">Añade habitaciones para ver el plano</p>
      </div>
    );
  }

  // Compute live-preview room position
  const getRoomTransform = (room: RoomData) => {
    const x = room.posX * SCALE;
    const y = room.posY * SCALE;
    if (liveDragOffset && liveDragOffset.roomId === room.id) {
      return { x: x + liveDragOffset.dx, y: y + liveDragOffset.dy, isDragging: true };
    }
    return { x, y, isDragging: false };
  };

  // Compute live-preview room dimensions (for resize)
  const getRoomDims = (room: RoomData) => {
    let w = room.width * SCALE;
    let h = room.length * SCALE;
    if (liveResizeDelta && liveResizeDelta.roomId === room.id) {
      const d = liveResizeDelta.delta * SCALE;
      const wi = liveResizeDelta.wallIndex;
      if (liveResizeDelta.isHoriz) {
        // wall 1 (top) or 3 (bottom)
        if (wi === 3) h += d;
        else if (wi === 1) h -= d;
      } else {
        // wall 2 (right) or 4 (left)
        if (wi === 2) w += d;
        else if (wi === 4) w -= d;
      }
    }
    return { w: Math.max(w, SCALE * 0.3), h: Math.max(h, SCALE * 0.3) };
  };




  // Render the SVG content (shared between inline and fullscreen)
  const renderSvgContent = () => (
    <>
      {/* Grid */}
      {(() => {
        const lines: JSX.Element[] = [];
        const gridW = plan.width * SCALE;
        const gridH = plan.length * SCALE;
        const step = GRID_SNAP * SCALE;
        for (let gx = 0; gx <= gridW; gx += step) {
          lines.push(<line key={`gv-${gx}`} x1={gx} y1={0} x2={gx} y2={gridH} stroke="#e5e7eb" strokeWidth={0.3} opacity={0.5} />);
        }
        for (let gy = 0; gy <= gridH; gy += step) {
          lines.push(<line key={`gh-${gy}`} x1={0} y1={gy} x2={gridW} y2={gy} stroke="#e5e7eb" strokeWidth={0.3} opacity={0.5} />);
        }
        return lines;
      })()}

      {/* Background hit area for pan */}
      <rect data-bg="true" x={-500} y={-500} width={plan.width * SCALE + 1000} height={plan.length * SCALE + 1000} fill="transparent" />

      {/* Plan outline */}
      <rect x={0} y={0} width={plan.width * SCALE} height={plan.length * SCALE}
        stroke="#d1d5db" strokeWidth={1} strokeDasharray="8 4" fill="none" />

      {/* Ridge line (viga cumbrera) — horizontal red line at midpoint of length (from gable to gable) for dos_aguas roofs */}
      {plan.roofType === 'dos_aguas' && (() => {
        const ridgeY = (plan.length / 2) * SCALE;
        const extT = plan.externalWallThickness;
        const overhang = plan.roofOverhang || 0;
        const x1 = -(extT + overhang) * SCALE - 20;
        const x2 = (plan.width + extT + overhang) * SCALE + 20;
        return (
          <g pointerEvents="none">
            <line x1={x1} y1={ridgeY} x2={x2} y2={ridgeY}
              stroke="#dc2626" strokeWidth={2.5} strokeDasharray="10 4" opacity={0.9} />
            <text x={x2 - 4} y={ridgeY - 6}
              textAnchor="end" fontSize={9} fill="#dc2626" opacity={0.95} fontWeight="700">
              ▲ Cumbrera
            </text>
          </g>
        );
      })()}

      {/* External perimeter with corner-based labels */}
      {perimeterDims && (
        <>
          <rect
            x={perimeterDims.extMinX} y={perimeterDims.extMinY}
            width={perimeterDims.extMaxX - perimeterDims.extMinX}
            height={perimeterDims.extMaxY - perimeterDims.extMinY}
            stroke={DIM_COLOR} strokeWidth={0.8} strokeDasharray="4 3" fill="none" opacity={0.5}
          />
          {/* Top dim: A→B */}
          <line x1={perimeterDims.extMinX} y1={perimeterDims.extMinY - 18} x2={perimeterDims.extMaxX} y2={perimeterDims.extMinY - 18}
            stroke={DIM_COLOR} strokeWidth={0.6} />
          <text x={(perimeterDims.extMinX + perimeterDims.extMaxX) / 2} y={perimeterDims.extMinY - 22}
            textAnchor="middle" fontSize={7} fontWeight="bold" fill={DIM_COLOR}>
            A→B: {perimeterDims.topLen.toFixed(2)}m
          </text>
          {/* Right dim: B→C */}
          <line x1={perimeterDims.extMaxX + 18} y1={perimeterDims.extMinY} x2={perimeterDims.extMaxX + 18} y2={perimeterDims.extMaxY}
            stroke={DIM_COLOR} strokeWidth={0.6} />
          <text x={perimeterDims.extMaxX + 22} y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2}
            textAnchor="start" fontSize={7} fontWeight="bold" fill={DIM_COLOR}
            transform={`rotate(90, ${perimeterDims.extMaxX + 22}, ${(perimeterDims.extMinY + perimeterDims.extMaxY) / 2})`}>
            B→C: {perimeterDims.rightLen.toFixed(2)}m
          </text>
          {/* Bottom dim: C→D */}
          <line x1={perimeterDims.extMinX} y1={perimeterDims.extMaxY + 18} x2={perimeterDims.extMaxX} y2={perimeterDims.extMaxY + 18}
            stroke={DIM_COLOR} strokeWidth={0.6} />
          <text x={(perimeterDims.extMinX + perimeterDims.extMaxX) / 2} y={perimeterDims.extMaxY + 28}
            textAnchor="middle" fontSize={7} fontWeight="bold" fill={DIM_COLOR}>
            C←D: {perimeterDims.topLen.toFixed(2)}m
          </text>
          {/* Left dim: D→A */}
          <line x1={perimeterDims.extMinX - 18} y1={perimeterDims.extMinY} x2={perimeterDims.extMinX - 18} y2={perimeterDims.extMaxY}
            stroke={DIM_COLOR} strokeWidth={0.6} />
          <text x={perimeterDims.extMinX - 22} y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2}
            textAnchor="start" fontSize={7} fontWeight="bold" fill={DIM_COLOR}
            transform={`rotate(-90, ${perimeterDims.extMinX - 22}, ${(perimeterDims.extMinY + perimeterDims.extMaxY) / 2})`}>
            D→A: {perimeterDims.rightLen.toFixed(2)}m
          </text>

          {/* Corner markers on perimeter */}
          {showCorners && (() => {
            const corners = [
              { x: perimeterDims.extMinX, y: perimeterDims.extMinY, label: 'A' },
              { x: perimeterDims.extMaxX, y: perimeterDims.extMinY, label: 'B' },
              { x: perimeterDims.extMaxX, y: perimeterDims.extMaxY, label: 'C' },
              { x: perimeterDims.extMinX, y: perimeterDims.extMaxY, label: 'D' },
            ];
            return corners.map(c => (
              <g key={`corner-${c.label}`}>
                <circle cx={c.x} cy={c.y} r={8} fill="#1e40af" stroke="#ffffff" strokeWidth={1.5} opacity={0.9} />
                <text x={c.x} y={c.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fontWeight="bold" fill="#ffffff" pointerEvents="none">
                  {c.label}
                </text>
              </g>
            ));
          })()}
        </>
      )}
    </>
  );

  return (
    <div className="w-full bg-background rounded-lg border border-border">
      {/* {/* Zoom toolbar patched */} */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30 flex-wrap">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Zoom:</span>
        {ZOOM_STEPS.map(z => (
          <button key={z}
            onClick={() => {
              const nextZoom = z / 100;
              setZoom(nextZoom);
              if (z === 100) {
                setPan({ x: 80, y: 80 });
              }
            }}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              Math.round(zoom * 100) === z
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-background text-muted-foreground hover:bg-accent/20 border border-border'
            }`}
          >
            {z}%
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 ml-1"
          onClick={() => {
            setZoom(1);
            setPan({ x: 80, y: 80 });
          }}
          title="Volver a tamaño y posición inicial"
        >
          Reset vista
        </Button>
        <Button
          variant={showCorners ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[10px] px-2 ml-1 gap-1"
          onClick={() => setShowCorners(!showCorners)}
          title="Mostrar/ocultar esquinas ABCD en el perímetro del edificio"
        >
          <MapIcon className="h-3 w-3" />
          Esquinas ABCD
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 ml-1 gap-1" onClick={() => setGridFullscreen(true)} title="Ampliar plano a pantalla completa">
          <Expand className="h-3 w-3" />
          Pantalla completa
        </Button>
        <span className="text-[10px] text-muted-foreground ml-2">
          🖱️ Rueda=zoom · Fondo=pan · Flechas=mover · ESC=cancelar
        </span>
        {isDraggingAnything && (
          <span className="text-[10px] font-semibold text-primary ml-auto animate-pulse">
            {dragging.type === 'room' ? '✋ Arrastrando…' : '↔ Redimensionando…'} (ESC cancela)
          </span>
        )}
      </div>

      <div style={{ width: '100%', height: '500px', overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: dragging?.type === 'pan' ? 'grabbing' : dragging?.type === 'room' ? 'move' : 'default' }}
          onWheel={handleWheel}
          onMouseDown={(e) => {
            if (e.target === svgRef.current || (e.target as SVGElement).dataset?.bg === 'true') {
              e.preventDefault();
              setDragging({ type: 'pan', startMouse: { x: e.clientX, y: e.clientY }, startVal: { ...pan } });
              onSelectRoom?.('');
              onSelectWall?.(null);
            }
          }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {renderSvgContent()}

            {/* Rooms */}
            {rooms.map(room => {
              const { x, y, isDragging: isRoomDragging } = getRoomTransform(room);
              const { w, h } = getRoomDims(room);
              const color = getRoomColor(room.name);
              const isSelected = selectedRoomId === room.id;

              const roomWallSegments = room.walls.map(wall => {
                const wallKey = `${room.id}::${wall.wallIndex}`;
                const segments = wallSegmentsMap.get(wallKey) || [];
                const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
                let wx1: number, wy1: number, wx2: number, wy2: number;
                switch (wall.wallIndex) {
                  case 1: wx1 = 0; wy1 = 0; wx2 = w; wy2 = 0; break;
                  case 2: wx1 = w; wy1 = 0; wx2 = w; wy2 = h; break;
                  case 3: wx1 = 0; wy1 = h; wx2 = w; wy2 = h; break;
                  case 4: default: wx1 = 0; wy1 = 0; wx2 = 0; wy2 = h; break;
                }
                return { wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 };
              });

              return (
                <g key={room.id} transform={`translate(${x}, ${y})`}
                  opacity={isRoomDragging ? 0.8 : 1}
                  style={{ transition: isRoomDragging ? 'none' : 'opacity 0.15s' }}
                >
                  {/* Drop shadow when dragging */}
                  {isRoomDragging && (
                    <rect x={2} y={2} width={w} height={h} fill="#000" opacity={0.1} rx={3} />
                  )}

                  {/* Floor fill */}
                  <rect x={0} y={0} width={w} height={h} fill={color} opacity={0.75} rx={2}
                    style={{ cursor: onMoveRoom ? 'move' : 'pointer' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (onMoveRoom) {
                        setDragging({
                          type: 'room', roomId: room.id,
                          startMouse: { x: e.clientX, y: e.clientY },
                          startPos: { x: room.posX, y: room.posY },
                        });
                      }
                      onSelectRoom?.(room.id);
                      onSelectWall?.(null);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onDoubleClickRoom?.(room.id);
                    }}
                  />

                  {/* Selection highlight */}
                  {isSelected && !isRoomDragging && (
                    <rect x={0} y={0} width={w} height={h}
                      stroke={WALL_SELECTED_COLOR} strokeWidth={2} fill="none" rx={2} pointerEvents="none" />
                  )}
                  {/* Drag outline */}
                  {isRoomDragging && (
                    <rect x={0} y={0} width={w} height={h}
                      stroke={WALL_SELECTED_COLOR} strokeWidth={2} fill="none" rx={2} strokeDasharray="6 3" pointerEvents="none" />
                  )}

                  {/* Wall segments — skip intra-group walls entirely */}
                  {roomWallSegments.map(({ wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 }) => {
                    if (intraGroupWallKeys.has(wallKey)) return null;
                    return (
                    <g key={wallKey}>
                      {segments.map((seg, si) => {
                        const segKey = `${wallKey}::${si}`;
                        const isSegSelected = selectedWallKey === segKey;
                        const style = isSegSelected
                          ? { color: WALL_SELECTED_COLOR, width: getWallStyle(seg.segmentType).width, dash: getWallStyle(seg.segmentType).dash }
                          : getWallStyle(seg.segmentType);

                        let sx1: number, sy1: number, sx2: number, sy2: number;
                        if (isHoriz) {
                          sx1 = wx1 + seg.startFraction * (wx2 - wx1);
                          sy1 = wy1;
                          sx2 = wx1 + seg.endFraction * (wx2 - wx1);
                          sy2 = wy2;
                        } else {
                          sx1 = wx1;
                          sy1 = wy1 + seg.startFraction * (wy2 - wy1);
                          sx2 = wx2;
                          sy2 = wy1 + seg.endFraction * (wy2 - wy1);
                        }

                        return (
                          <g key={`seg-${si}`}>
                            {/* Hit area */}
                            <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                              stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectWall?.(selectedWallKey === segKey ? null : segKey);
                                onSelectRoom?.(room.id);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                onDoubleClickWall?.(room.id, wall.wallIndex, si);
                              }}
                            />
                            {/* Selection glow */}
                            {isSegSelected && (
                              <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                                stroke={WALL_SELECTED_COLOR} strokeWidth={style.width + 4} strokeLinecap="round" opacity={0.3} pointerEvents="none" />
                            )}
                            {/* Wall line */}
                            <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                              stroke={style.color} strokeWidth={style.width}
                              strokeDasharray={style.dash}
                              pointerEvents="none" />
                          </g>
                        );
                      })}

                      {/* Openings — centered on wall midpoint, proportional to real dimensions */}
                      {!groupedRoomIds.has(room.id) && (() => {
                        // Collect openings from this wall + neighbor shared wall
                        const allOpenings: { op: typeof wall.openings[0]; fromNeighbor: boolean }[] = [];
                        wall.openings.forEach(op => allOpenings.push({ op, fromNeighbor: false }));
                        // If shared wall, also render neighbor's openings on this wall
                        const sharedInfo = sharedWallKeys?.has(wallKey);
                        if (sharedInfo) {
                          const neighborEntry = rooms.find(nr => {
                            if (nr.id === room.id) return false;
                            const EPSILON = 0.05;
                            switch (wall.wallIndex) {
                              case 1: return Math.abs(nr.posY + nr.length - room.posY) < EPSILON;
                              case 2: return Math.abs(nr.posX - (room.posX + room.width)) < EPSILON;
                              case 3: return Math.abs(nr.posY - (room.posY + room.length)) < EPSILON;
                              case 4: return Math.abs(nr.posX + nr.width - room.posX) < EPSILON;
                              default: return false;
                            }
                          });
                          if (neighborEntry) {
                            const oppositeIdx = wall.wallIndex === 1 ? 3 : wall.wallIndex === 2 ? 4 : wall.wallIndex === 3 ? 1 : 2;
                            const neighborWall = neighborEntry.walls.find(nw => nw.wallIndex === oppositeIdx);
                            if (neighborWall) {
                              const neighborWallLen = (oppositeIdx === 1 || oppositeIdx === 3) ? neighborEntry.width : neighborEntry.length;
                              const thisWallLen = isHoriz ? room.width : room.length;
                              neighborWall.openings.forEach(nop => {
                                // Convert neighbor positionX to this wall's coordinate space
                                const absPos = nop.positionX * neighborWallLen;
                                const mappedPosX = thisWallLen > 0 ? absPos / thisWallLen : 0.5;
                                allOpenings.push({ op: { ...nop, positionX: mappedPosX }, fromNeighbor: true });
                              });
                            }
                          }
                        }

                        return allOpenings.map(({ op, fromNeighbor }, oi) => {
                          const opCenter = op.positionX;
                          const opSeg = segments.find(s => opCenter >= s.startFraction - 0.05 && opCenter <= s.endFraction + 0.05);
                          const isOnInvisible = opSeg ? isInvisibleType(opSeg.segmentType) : false;
                          if (isOnInvisible) return null;

                          const wallLen = isHoriz ? room.width : room.length;
                          const opWidth = Math.max(op.width * SCALE, 4); // proportional, min 4px
                          // Clamp positionX to valid range (same formula as elevation view)
                          const halfWFrac = wallLen > 0 ? (op.width / 2) / wallLen : 0;
                          const clampedPosX = Math.max(halfWFrac, Math.min(1 - halfWFrac, op.positionX));
                          const leftEdgePos = (clampedPosX * wallLen - op.width / 2) * SCALE;
                          // Clamp to wall pixel bounds as safety
                          const clampedLeft = Math.max(0, Math.min(leftEdgePos, wallLen * SCALE - opWidth));
                          const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'hueco_paso';

                          // Determine wall thickness to center the marker ON the wall structural line
                          const isExtWall = opSeg ? isExteriorType(opSeg.segmentType) : false;
                          const wallThickPx = isExtWall ? extT * SCALE : plan.internalWallThickness * SCALE;
                          const markerThick = Math.max(wallThickPx + 4, 6);

                          if (isHoriz) {
                            const ox = clampedLeft;
                            // Center marker on the wall's structural line
                            const wallLineY = wall.wallIndex === 1 ? 0 : h;
                            const wallMidY = isExtWall
                              ? (wall.wallIndex === 1 ? -wallThickPx / 2 : h + wallThickPx / 2)
                              : wallLineY;
                            return (
                              <g key={`op-${oi}${fromNeighbor ? '-n' : ''}`} pointerEvents="none">
                                <rect x={ox} y={wallMidY - markerThick / 2} width={opWidth} height={markerThick}
                                  fill="#ffffff" stroke={isDoor ? '#d97706' : '#06b6d4'}
                                  strokeWidth={fromNeighbor ? 1 : 1.5} rx={1}
                                  strokeDasharray={fromNeighbor ? '3 2' : undefined} />
                                <text x={ox + opWidth / 2} y={wallMidY + 1} textAnchor="middle" fontSize={Math.min(6, opWidth * 0.6)} fill={isDoor ? '#92400e' : '#0e7490'} fontWeight="600" dominantBaseline="middle">
                                  {isDoor ? 'P' : 'V'}
                                </text>
                              </g>
                            );
                          } else {
                            const oy = clampedLeft;
                            const wallLineX = wall.wallIndex === 4 ? 0 : w;
                            const wallMidX = isExtWall
                              ? (wall.wallIndex === 4 ? -wallThickPx / 2 : w + wallThickPx / 2)
                              : wallLineX;
                            return (
                              <g key={`op-${oi}${fromNeighbor ? '-n' : ''}`} pointerEvents="none">
                                <rect x={wallMidX - markerThick / 2} y={oy} width={markerThick} height={opWidth}
                                  fill="#ffffff" stroke={isDoor ? '#d97706' : '#06b6d4'}
                                  strokeWidth={fromNeighbor ? 1 : 1.5} rx={1}
                                  strokeDasharray={fromNeighbor ? '3 2' : undefined} />
                                <text x={wallMidX} y={oy + opWidth / 2 + 1} textAnchor="middle" fontSize={Math.min(6, opWidth * 0.6)} fill={isDoor ? '#92400e' : '#0e7490'} fontWeight="600" dominantBaseline="middle">
                                  {isDoor ? 'P' : 'V'}
                                </text>
                              </g>
                            );
                          }
                        });
                      })()}
                    </g>
                    );
                  })}

                  {/* External wall thickness bands */}
                  {roomWallSegments.map(({ wallKey, wall, isHoriz: ih }) => {
                    if (intraGroupWallKeys.has(wallKey)) return null;
                    const overallType = wallClassification.get(wallKey) || wall.wallType;
                    if (!isExteriorType(overallType)) return null;
                    const extThick = extT * SCALE;
                    if (ih) {
                      return (
                        <rect key={`ext-${wallKey}`}
                          x={0} y={wall.wallIndex === 1 ? -extThick : h}
                          width={w} height={extThick}
                          fill="#000000" opacity={0.12} pointerEvents="none" />
                      );
                    } else {
                      return (
                        <rect key={`ext-${wallKey}`}
                          x={wall.wallIndex === 4 ? -extThick : w} y={0}
                          width={extThick} height={h}
                          fill="#000000" opacity={0.12} pointerEvents="none" />
                      );
                    }
                  })}

                  {/* Labels — adaptive 3 lines max */}
                  {(() => {
                    const area = (room.width * room.length).toFixed(1);
                    const dims = `${room.width}×${room.length}m`;
                    const maxChars = Math.max(3, Math.floor(w / 5.5)); // approx chars that fit
                    const nameStr = room.name.length > maxChars
                      ? room.name.slice(0, maxChars - 1) + '…'
                      : room.name;
                    // 3 lines: name + m², dims, (empty or nothing based on height)
                    const lineH = 11;
                    const totalH = h;
                    const lines3 = totalH >= lineH * 3;
                    const lines2 = totalH >= lineH * 2;
                    const cy = h / 2;

                    if (lines3) {
                      return (
                        <>
                          <text x={w / 2} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#1e293b" pointerEvents="none">
                            {nameStr} · {area}m²
                          </text>
                          <text x={w / 2} y={cy + 3} textAnchor="middle" fontSize={7.5} fill="#64748b" pointerEvents="none">
                            {dims}
                          </text>
                          <text x={w / 2} y={cy + 13} textAnchor="middle" fontSize={7} fill="#3b82f6" pointerEvents="none">
                            h:{(room.height || 2.5).toFixed(1)}m
                          </text>
                        </>
                      );
                    }
                    if (lines2) {
                      return (
                        <>
                          <text x={w / 2} y={cy - 4} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e293b" pointerEvents="none">
                            {nameStr} · {area}m²
                          </text>
                          <text x={w / 2} y={cy + 7} textAnchor="middle" fontSize={7} fill="#64748b" pointerEvents="none">
                            {dims}
                          </text>
                        </>
                      );
                    }
                    // Single line only
                    return (
                      <text x={w / 2} y={cy + 3} textAnchor="middle" fontSize={7} fontWeight="bold" fill="#1e293b" pointerEvents="none">
                        {nameStr} {area}m²
                      </text>
                    );
                  })()}

                  {/* (Wall dimensions are now shown globally outside each room) */}

                  {/* Resize handles — improved with hover glow */}
                  {isSelected && onResizeWall && roomWallSegments.map(({ wall, isHoriz: ih }) => {
                    let hx: number, hy: number;
                    switch (wall.wallIndex) {
                      case 1: hx = w / 2; hy = 0; break;
                      case 2: hx = w; hy = h / 2; break;
                      case 3: hx = w / 2; hy = h; break;
                      case 4: default: hx = 0; hy = h / 2; break;
                    }
                    const handleKey = `${room.id}-h-${wall.wallIndex}`;
                    const isHovered = hoveredHandle === handleKey;
                    const isActiveResize = liveResizeDelta && liveResizeDelta.roomId === room.id && liveResizeDelta.wallIndex === wall.wallIndex;

                    return (
                      <g key={`h-${wall.wallIndex}`}>
                        {/* Hover/active glow */}
                        {(isHovered || isActiveResize) && (
                          <circle cx={hx} cy={hy} r={8}
                            fill={WALL_SELECTED_COLOR} opacity={0.15} pointerEvents="none" />
                        )}
                        {/* Handle */}
                        <circle
                          cx={hx} cy={hy} r={isHovered || isActiveResize ? 5 : 4}
                          fill={isActiveResize ? '#4338ca' : WALL_SELECTED_COLOR}
                          stroke="#ffffff" strokeWidth={1.5}
                          style={{
                            cursor: ih ? 'ns-resize' : 'ew-resize',
                            transition: 'r 0.1s',
                          }}
                          onMouseEnter={() => setHoveredHandle(handleKey)}
                          onMouseLeave={() => setHoveredHandle(null)}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragging({
                              type: 'resize', roomId: room.id, wallIndex: wall.wallIndex, isHoriz: ih,
                              startMouse: { x: e.clientX, y: e.clientY },
                            });
                          }}
                        />
                        {/* Resize delta label */}
                        {isActiveResize && liveResizeDelta && Math.abs(liveResizeDelta.delta) > 0.001 && (
                          <text x={hx + (ih ? 12 : 0)} y={hy + (ih ? 0 : -12)}
                            textAnchor="middle" fontSize={8} fontWeight="bold"
                            fill={liveResizeDelta.delta > 0 ? '#059669' : '#dc2626'}
                            pointerEvents="none">
                            {liveResizeDelta.delta > 0 ? '+' : ''}{liveResizeDelta.delta.toFixed(2)}m
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Perimeter wall openings for grouped spaces */}
            {perimeterWalls.map(pw => {
              const isHoriz = pw.direction === 'horizontal';
              const isExt = isExteriorType(pw.wallType);
              const wallThick = (isExt ? plan.externalWallThickness : plan.internalWallThickness) * SCALE;

              return (
                <g key={`pw-${pw.id}`}>
                  {/* Merged wall indicator */}
                  {pw.cellSegments.length > 1 && (() => {
                    const sx = isHoriz ? pw.start * SCALE : pw.fixedCoord * SCALE;
                    const sy = isHoriz ? pw.fixedCoord * SCALE : pw.start * SCALE;
                    const ex = isHoriz ? pw.end * SCALE : pw.fixedCoord * SCALE;
                    const ey = isHoriz ? pw.fixedCoord * SCALE : pw.end * SCALE;
                    return (
                      <line x1={sx} y1={sy} x2={ex} y2={ey}
                        stroke="#8b5cf6" strokeWidth={1} strokeDasharray="2 4" opacity={0.4} pointerEvents="none" />
                    );
                  })()}

                  {/* Length label for merged walls */}
                  {pw.cellSegments.length > 1 && (() => {
                    const mid = (pw.start + pw.end) / 2 * SCALE;
                    const fixed = pw.fixedCoord * SCALE;
                    const offset = pw.side === 'top' || pw.side === 'left' ? -16 : 16;
                    return (
                      <text
                        x={isHoriz ? mid : fixed + offset}
                        y={isHoriz ? fixed + offset : mid}
                        textAnchor="middle" fontSize={7} fontWeight="bold" fill="#8b5cf6" opacity={0.7} pointerEvents="none"
                      >
                        ↔ {pw.length.toFixed(1)}m ({pw.cellSegments.length} celdas)
                      </text>
                    );
                  })()}

                  {/* Openings on perimeter walls */}
                  {pw.openings.map((op, oi) => {
                    const opWidth = op.width * SCALE;
                    const centerPos = op.perimeterPositionX * pw.length * SCALE;
                    const startPos = centerPos - opWidth / 2;
                    const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'hueco_paso';
                    const sw = Math.max(wallThick, 2);
                    const rectThick = sw + 4;

                    if (isHoriz) {
                      const ox = pw.start * SCALE + startPos;
                      const cy = pw.fixedCoord * SCALE;
                      const arcDir = pw.side === 'top' ? 1 : -1;
                      return (
                        <g key={`pw-op-${oi}`} pointerEvents="none">
                          <rect x={ox} y={cy - rectThick / 2} width={opWidth} height={rectThick}
                            fill="#ffffff" stroke={isDoor ? '#d97706' : '#06b6d4'} strokeWidth={1} />
                          {isDoor && (
                            <path d={`M ${ox},${cy} A ${opWidth},${opWidth} 0 0 ${arcDir > 0 ? 1 : 0} ${ox + opWidth},${cy + arcDir * opWidth * 0.05}`}
                              stroke="#d97706" strokeWidth={0.7} fill="none" opacity={0.4} />
                          )}
                        </g>
                      );
                    } else {
                      const oy = pw.start * SCALE + startPos;
                      const cx = pw.fixedCoord * SCALE;
                      const arcDir = pw.side === 'left' ? 1 : -1;
                      return (
                        <g key={`pw-op-${oi}`} pointerEvents="none">
                          <rect x={cx - rectThick / 2} y={oy} width={rectThick} height={opWidth}
                            fill="#ffffff" stroke={isDoor ? '#d97706' : '#06b6d4'} strokeWidth={1} />
                          {isDoor && (
                            <path d={`M ${cx},${oy} A ${opWidth},${opWidth} 0 0 ${arcDir > 0 ? 1 : 0} ${cx + arcDir * opWidth * 0.05},${oy + opWidth}`}
                              stroke="#d97706" strokeWidth={0.7} fill="none" opacity={0.4} />
                          )}
                        </g>
                      );
                    }
                  })}
                </g>
              );
            })}

            {/* Wall dimension labels on each room edge — prominent */}
            {rooms.map(room => {
              const rx = room.posX * SCALE;
              const ry = room.posY * SCALE;
              const rw = room.width * SCALE;
              const rh = room.length * SCALE;
              const WALL_DIM_FONT = 10;
              const WALL_DIM_COLOR = '#1e293b';
              const WALL_DIM_BG = 'rgba(255,255,255,0.85)';
              const wallDims: JSX.Element[] = [];

              // Top wall (wall 1) — width
              wallDims.push(
                <g key={`wd-${room.id}-1`} transform={`translate(${rx + rw / 2}, ${ry - 6})`}>
                  <rect x={-20} y={-7} width={40} height={14} rx={3} fill={WALL_DIM_BG} />
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={WALL_DIM_FONT} fontWeight="700" fill={WALL_DIM_COLOR}>
                    {room.width.toFixed(2)}m
                  </text>
                </g>
              );
              // Right wall (wall 2) — length
              wallDims.push(
                <g key={`wd-${room.id}-2`} transform={`translate(${rx + rw + 6}, ${ry + rh / 2})`}>
                  <rect x={-2} y={-7} width={42} height={14} rx={3} fill={WALL_DIM_BG} />
                  <text x={19} textAnchor="middle" dominantBaseline="middle" fontSize={WALL_DIM_FONT} fontWeight="700" fill={WALL_DIM_COLOR}>
                    {room.length.toFixed(2)}m
                  </text>
                </g>
              );
              // Bottom wall (wall 3) — width
              wallDims.push(
                <g key={`wd-${room.id}-3`} transform={`translate(${rx + rw / 2}, ${ry + rh + 8})`}>
                  <rect x={-20} y={-7} width={40} height={14} rx={3} fill={WALL_DIM_BG} />
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={WALL_DIM_FONT} fontWeight="700" fill={WALL_DIM_COLOR}>
                    {room.width.toFixed(2)}m
                  </text>
                </g>
              );
              // Left wall (wall 4) — length
              wallDims.push(
                <g key={`wd-${room.id}-4`} transform={`translate(${rx - 6}, ${ry + rh / 2})`}>
                  <rect x={-40} y={-7} width={42} height={14} rx={3} fill={WALL_DIM_BG} />
                  <text x={-19} textAnchor="middle" dominantBaseline="middle" fontSize={WALL_DIM_FONT} fontWeight="700" fill={WALL_DIM_COLOR}>
                    {room.length.toFixed(2)}m
                  </text>
                </g>
              );
              return wallDims;
            })}

            {/* Magnetic alignment guides when dragging */}
            {liveDragOffset && (() => {
              const room = rooms.find(r => r.id === liveDragOffset.roomId);
              if (!room) return null;
              const newX = room.posX + liveDragOffset.dx / SCALE;
              const newY = room.posY + liveDragOffset.dy / SCALE;
              const guides: JSX.Element[] = [];
              for (const other of rooms) {
                if (other.id === room.id) continue;
                // Show alignment lines when edges match
                const edges = [
                  { val: newX, oVal: other.posX, axis: 'x' },
                  { val: newX + room.width, oVal: other.posX + other.width, axis: 'x' },
                  { val: newX + room.width, oVal: other.posX, axis: 'x' },
                  { val: newX, oVal: other.posX + other.width, axis: 'x' },
                  { val: newY, oVal: other.posY, axis: 'y' },
                  { val: newY + room.length, oVal: other.posY + other.length, axis: 'y' },
                  { val: newY + room.length, oVal: other.posY, axis: 'y' },
                  { val: newY, oVal: other.posY + other.length, axis: 'y' },
                ];
                edges.forEach((edge, i) => {
                  if (Math.abs(edge.val - edge.oVal) < 0.005) {
                    if (edge.axis === 'x') {
                      guides.push(
                        <line key={`guide-${other.id}-${i}`}
                          x1={edge.val * SCALE} y1={-200} x2={edge.val * SCALE} y2={plan.length * SCALE + 200}
                          stroke="#6366f1" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} pointerEvents="none" />
                      );
                    } else {
                      guides.push(
                        <line key={`guide-${other.id}-${i}`}
                          x1={-200} y1={edge.val * SCALE} x2={plan.width * SCALE + 200} y2={edge.val * SCALE}
                          stroke="#6366f1" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} pointerEvents="none" />
                      );
                    }
                  }
                });
              }
              return guides;
            })()}

            {/* Legend */}
            {perimeterDims && (
              <g transform={`translate(${perimeterDims.extMinX}, ${perimeterDims.extMaxY + 24})`} pointerEvents="none">
                <rect x={0} y={0} width={12} height={4} fill="#000000" />
                <text x={16} y={4} fontSize={7} fill="#64748b">Ext.</text>
                <rect x={45} y={0} width={12} height={4} fill="#2563eb" />
                <text x={61} y={4} fontSize={7} fill="#64748b">Ext.comp.</text>
                <line x1={110} y1={2} x2={122} y2={2} stroke="#9ca3af" strokeWidth={4} strokeDasharray="4 3" />
                <text x={126} y={4} fontSize={7} fill="#64748b">Ext.inv.</text>
                <rect x={170} y={0.5} width={12} height={3} fill="#f97316" />
                <text x={186} y={4} fontSize={7} fill="#64748b">Int.</text>
                <rect x={210} y={0.5} width={12} height={3} fill="#16a34a" />
                <text x={226} y={4} fontSize={7} fill="#64748b">Int.comp.</text>
                <line x1={275} y1={2} x2={287} y2={2} stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 3" />
                <text x={291} y={4} fontSize={7} fill="#64748b">Int.inv.</text>
                <line x1={330} y1={-1} x2={342} y2={-1} stroke="#06b6d4" strokeWidth={1} />
                <line x1={330} y1={3} x2={342} y2={3} stroke="#06b6d4" strokeWidth={1} />
                <text x={346} y={4} fontSize={7} fill="#64748b">Ventana</text>
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Fullscreen overlay via portal */}
      {gridFullscreen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
            <span className="text-sm font-medium">Plano 2D — Pantalla completa</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setGridFullscreen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            <svg
              width="100%"
              height="100%"
              style={{ cursor: 'default' }}
            >
              <g transform={`translate(60, 60) scale(${Math.min(
                (window.innerWidth * 0.85) / (plan.width * SCALE + 200),
                (window.innerHeight * 0.75) / (plan.length * SCALE + 200)
              )})`}>
                {renderSvgContent()}

                {/* Rooms in fullscreen */}
                {rooms.map(room => {
                  const x = room.posX * SCALE;
                  const y = room.posY * SCALE;
                  const w = room.width * SCALE;
                  const h = room.length * SCALE;
                  const color = getRoomColor(room.name);
                  const roomWallSegments = room.walls.map(wall => {
                    const wallKey = `${room.id}::${wall.wallIndex}`;
                    const segments = wallSegmentsMap.get(wallKey) || [];
                    const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
                    let wx1: number, wy1: number, wx2: number, wy2: number;
                    switch (wall.wallIndex) {
                      case 1: wx1 = 0; wy1 = 0; wx2 = w; wy2 = 0; break;
                      case 2: wx1 = w; wy1 = 0; wx2 = w; wy2 = h; break;
                      case 3: wx1 = 0; wy1 = h; wx2 = w; wy2 = h; break;
                      case 4: default: wx1 = 0; wy1 = 0; wx2 = 0; wy2 = h; break;
                    }
                    return { wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 };
                  });

                  return (
                    <g key={room.id} transform={`translate(${x}, ${y})`}>
                      <rect x={0} y={0} width={w} height={h} fill={color} opacity={0.75} rx={2} />
                      {roomWallSegments.map(({ wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 }) => {
                        if (intraGroupWallKeys.has(wallKey)) return null;
                        return (
                          <g key={wallKey}>
                            {segments.map((seg, si) => {
                              const style = getWallStyle(seg.segmentType);
                              let sx1: number, sy1: number, sx2: number, sy2: number;
                              if (isHoriz) {
                                sx1 = wx1 + seg.startFraction * (wx2 - wx1); sy1 = wy1;
                                sx2 = wx1 + seg.endFraction * (wx2 - wx1); sy2 = wy2;
                              } else {
                                sx1 = wx1; sy1 = wy1 + seg.startFraction * (wy2 - wy1);
                                sx2 = wx2; sy2 = wy1 + seg.endFraction * (wy2 - wy1);
                              }
                              return (
                                <line key={`seg-${si}`} x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                                  stroke={style.color} strokeWidth={style.width}
                                  strokeDasharray={style.dash}
                                  pointerEvents="none" />
                              );
                            })}
                          </g>
                        );
                      })}
                      <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle"
                        fontSize={9} fontWeight="bold" fill="#1e293b" pointerEvents="none">
                        {room.name} · {(room.width * room.length).toFixed(1)}m²
                      </text>
                    </g>
                  );
                })}

                {/* Wall dimensions in fullscreen */}
                {rooms.map(room => {
                  const rx = room.posX * SCALE;
                  const ry = room.posY * SCALE;
                  const rw = room.width * SCALE;
                  const rh = room.length * SCALE;
                  return (
                    <g key={`fs-wd-${room.id}`} pointerEvents="none">
                      <text x={rx + rw / 2} y={ry - 6} textAnchor="middle" fontSize={10} fontWeight="700" fill="#1e293b">
                        {room.width.toFixed(2)}m
                      </text>
                      <text x={rx + rw + 8} y={ry + rh / 2} textAnchor="start" dominantBaseline="middle" fontSize={10} fontWeight="700" fill="#1e293b">
                        {room.length.toFixed(2)}m
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
