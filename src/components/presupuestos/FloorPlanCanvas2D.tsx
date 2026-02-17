import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, generateExternalWallNames, computeWallSegments, isExteriorType, isInvisibleType, isCompartidaType, computeGroupPerimeterWalls } from '@/lib/floor-plan-calculations';

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

const WALL_EXT_COLOR = '#1e2d4d';
const WALL_INT_COLOR = '#d97706';
const WALL_INVIS_COLOR = '#9ca3af';
const WALL_SELECTED_COLOR = '#6366f1';
const DIM_COLOR = '#c2410c';
const SHARED_WALL_COLOR = '#059669';

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
  const groupedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    rooms.forEach(r => { if (r.groupId) ids.add(r.id); });
    return ids;
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
    const mousePointTo = {
      x: (pointerX - pan.x) / oldScale,
      y: (pointerY - pan.y) / oldScale,
    };
    setZoom(clampedScale);
    setPan({
      x: pointerX - mousePointTo.x * clampedScale,
      y: pointerY - mousePointTo.y * clampedScale,
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

  const isDraggingAnything = !!dragging && dragging.type !== 'pan';

  return (
    <div className="w-full bg-background rounded-lg border border-border">
      {/* Zoom toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30 flex-wrap">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Zoom:</span>
        {ZOOM_STEPS.map(z => (
          <button key={z}
            onClick={() => setZoom(z / 100)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              Math.round(zoom * 100) === z
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-background text-muted-foreground hover:bg-accent/20 border border-border'
            }`}
          >
            {z}%
          </button>
        ))}
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

            {/* External perimeter */}
            {perimeterDims && (
              <>
                <rect
                  x={perimeterDims.extMinX} y={perimeterDims.extMinY}
                  width={perimeterDims.extMaxX - perimeterDims.extMinX}
                  height={perimeterDims.extMaxY - perimeterDims.extMinY}
                  stroke={DIM_COLOR} strokeWidth={0.8} strokeDasharray="4 3" fill="none" opacity={0.5}
                />
                {/* Top dim */}
                <line x1={perimeterDims.extMinX} y1={perimeterDims.extMinY - 18} x2={perimeterDims.extMaxX} y2={perimeterDims.extMinY - 18}
                  stroke={DIM_COLOR} strokeWidth={0.6} />
                <text x={(perimeterDims.extMinX + perimeterDims.extMaxX) / 2} y={perimeterDims.extMinY - 22}
                  textAnchor="middle" fontSize={7} fontWeight="bold" fill={DIM_COLOR}>
                  A: {perimeterDims.topLen.toFixed(2)}m
                </text>
                {/* Right dim */}
                <line x1={perimeterDims.extMaxX + 18} y1={perimeterDims.extMinY} x2={perimeterDims.extMaxX + 18} y2={perimeterDims.extMaxY}
                  stroke={DIM_COLOR} strokeWidth={0.6} />
                <text x={perimeterDims.extMaxX + 22} y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2}
                  textAnchor="start" fontSize={7} fontWeight="bold" fill={DIM_COLOR}
                  transform={`rotate(90, ${perimeterDims.extMaxX + 22}, ${(perimeterDims.extMinY + perimeterDims.extMaxY) / 2})`}>
                  B: {perimeterDims.rightLen.toFixed(2)}m
                </text>
                {/* Bottom dim */}
                <line x1={perimeterDims.extMinX} y1={perimeterDims.extMaxY + 18} x2={perimeterDims.extMaxX} y2={perimeterDims.extMaxY + 18}
                  stroke={DIM_COLOR} strokeWidth={0.6} />
                <text x={(perimeterDims.extMinX + perimeterDims.extMaxX) / 2} y={perimeterDims.extMaxY + 28}
                  textAnchor="middle" fontSize={7} fontWeight="bold" fill={DIM_COLOR}>
                  C: {perimeterDims.topLen.toFixed(2)}m
                </text>
                {/* Left dim */}
                <line x1={perimeterDims.extMinX - 18} y1={perimeterDims.extMinY} x2={perimeterDims.extMinX - 18} y2={perimeterDims.extMaxY}
                  stroke={DIM_COLOR} strokeWidth={0.6} />
                <text x={perimeterDims.extMinX - 22} y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2}
                  textAnchor="start" fontSize={7} fontWeight="bold" fill={DIM_COLOR}
                  transform={`rotate(-90, ${perimeterDims.extMinX - 22}, ${(perimeterDims.extMinY + perimeterDims.extMaxY) / 2})`}>
                  D: {perimeterDims.rightLen.toFixed(2)}m
                </text>
              </>
            )}

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

                  {/* Wall segments */}
                  {roomWallSegments.map(({ wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 }) => (
                    <g key={wallKey}>
                      {segments.map((seg, si) => {
                        const segKey = `${wallKey}::${si}`;
                        const isSegSelected = selectedWallKey === segKey;
                        // Detect shared from segment type OR from prop
                        const isShared = isCompartidaType(seg.segmentType) || (sharedWallKeys?.has(wallKey) ?? false);
                        // Detect invisible from segment type OR from wall's manual override
                        const wallManualInvisible = isInvisibleType(wall.wallType);
                        const isInvisible = isInvisibleType(seg.segmentType) || wallManualInvisible;
                        const isExternal = !isInvisible && isExteriorType(seg.segmentType);

                        const baseThickness = isInvisible ? plan.internalWallThickness * SCALE * 0.5
                          : isExternal ? plan.externalWallThickness * SCALE : plan.internalWallThickness * SCALE;
                        const strokeWidth = isInvisible ? Math.max(baseThickness, 1.5)
                          : Math.max(baseThickness, isExternal ? 4 : 3);

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

                        const segColor = isSegSelected ? WALL_SELECTED_COLOR
                          : isInvisible ? WALL_INVIS_COLOR
                          : isShared ? SHARED_WALL_COLOR
                          : isExternal ? WALL_EXT_COLOR
                          : WALL_INT_COLOR;

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
                                stroke={WALL_SELECTED_COLOR} strokeWidth={8} strokeLinecap="round" opacity={0.3} pointerEvents="none" />
                            )}
                            {/* Shared wall glow */}
                            {isShared && !isSegSelected && (
                              <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                                stroke={SHARED_WALL_COLOR} strokeWidth={6} strokeLinecap="round" opacity={0.15} pointerEvents="none" />
                            )}
                            {/* Visible wall */}
                            <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                              stroke={segColor} strokeWidth={strokeWidth}
                              strokeDasharray={isInvisible ? '4 3' : undefined}
                              pointerEvents="none" />
                          </g>
                        );
                      })}

                      {/* Openings — skip for grouped rooms (rendered via perimeter walls) */}
                      {!groupedRoomIds.has(room.id) && wall.openings.map((op, oi) => {
                        const opCenter = op.positionX;
                        const opSeg = segments.find(s => opCenter >= s.startFraction - 0.01 && opCenter <= s.endFraction + 0.01);
                        const isOnInvisible = opSeg ? isInvisibleType(opSeg.segmentType) : false;
                        if (isOnInvisible) return null;

                        const wallLen = isHoriz ? room.width : room.length;
                        const opWidth = op.width * SCALE;
                        const centerPos = op.positionX * wallLen * SCALE;
                        const startPos = centerPos - opWidth / 2;
                        const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
                        const opSegStroke = opSeg ? (isExteriorType(opSeg.segmentType) ? plan.externalWallThickness * SCALE : plan.internalWallThickness * SCALE) : 2;
                        const sw = Math.max(opSegStroke, 2);

                        if (isDoor) {
                          if (isHoriz) {
                            const ox = startPos;
                            const cy = wall.wallIndex === 1 ? 0 : h;
                            return (
                              <g key={`op-${oi}`} pointerEvents="none">
                                <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy} stroke="#ffffff" strokeWidth={sw + 4} />
                                <line x1={ox} y1={cy} x2={ox + opWidth * 0.7} y2={cy + (wall.wallIndex === 1 ? 1 : -1) * opWidth * 0.3}
                                  stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                              </g>
                            );
                          } else {
                            const oy = startPos;
                            const cx = wall.wallIndex === 4 ? 0 : w;
                            return (
                              <g key={`op-${oi}`} pointerEvents="none">
                                <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth} stroke="#ffffff" strokeWidth={sw + 4} />
                                <line x1={cx} y1={oy} x2={cx + (wall.wallIndex === 4 ? 1 : -1) * opWidth * 0.3} y2={oy + opWidth * 0.7}
                                  stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                              </g>
                            );
                          }
                        } else {
                          if (isHoriz) {
                            const ox = startPos;
                            const cy = wall.wallIndex === 1 ? 0 : h;
                            return (
                              <g key={`op-${oi}`} pointerEvents="none">
                                <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy} stroke="#ffffff" strokeWidth={sw + 4} />
                                <line x1={ox} y1={cy - 1.5} x2={ox + opWidth} y2={cy - 1.5} stroke="#3b82f6" strokeWidth={1.5} />
                                <line x1={ox} y1={cy + 1.5} x2={ox + opWidth} y2={cy + 1.5} stroke="#3b82f6" strokeWidth={1.5} />
                              </g>
                            );
                          } else {
                            const oy = startPos;
                            const cx = wall.wallIndex === 4 ? 0 : w;
                            return (
                              <g key={`op-${oi}`} pointerEvents="none">
                                <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth} stroke="#ffffff" strokeWidth={sw + 4} />
                                <line x1={cx - 1.5} y1={oy} x2={cx - 1.5} y2={oy + opWidth} stroke="#3b82f6" strokeWidth={1.5} />
                                <line x1={cx + 1.5} y1={oy} x2={cx + 1.5} y2={oy + opWidth} stroke="#3b82f6" strokeWidth={1.5} />
                              </g>
                            );
                          }
                        }
                      })}
                    </g>
                  ))}

                  {/* External wall thickness bands */}
                  {roomWallSegments.map(({ wallKey, wall, isHoriz: ih }) => {
                    const overallType = wallClassification.get(wallKey) || wall.wallType;
                    if (!isExteriorType(overallType)) return null;
                    const extThick = extT * SCALE;
                    if (ih) {
                      return (
                        <rect key={`ext-${wallKey}`}
                          x={0} y={wall.wallIndex === 1 ? -extThick : h}
                          width={w} height={extThick}
                          fill={WALL_EXT_COLOR} opacity={0.12} pointerEvents="none" />
                      );
                    } else {
                      return (
                        <rect key={`ext-${wallKey}`}
                          x={wall.wallIndex === 4 ? -extThick : w} y={0}
                          width={extThick} height={h}
                          fill={WALL_EXT_COLOR} opacity={0.12} pointerEvents="none" />
                      );
                    }
                  })}

                  {/* Labels */}
                  <text x={w / 2} y={h / 2 - 10} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#1e293b" pointerEvents="none">
                    {room.name}
                  </text>
                  <text x={w / 2} y={h / 2 + 2} textAnchor="middle" fontSize={8} fill="#64748b" pointerEvents="none">
                    {room.width}×{room.length}m
                  </text>
                  <text x={w / 2} y={h / 2 + 14} textAnchor="middle" fontSize={8.5} fontWeight="bold" fill="#3b82f6" pointerEvents="none">
                    Suelo: {(room.width * room.length).toFixed(1)}m²
                  </text>

                  {/* Interior dimension (top) */}
                  <line x1={0} y1={-8} x2={w} y2={-8} stroke="#9ca3af" strokeWidth={0.5} pointerEvents="none" />
                  <text x={w / 2} y={-12} textAnchor="middle" fontSize={7} fill="#64748b" pointerEvents="none">
                    {room.width.toFixed(1)}m
                  </text>

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
                    const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
                    const sw = Math.max(wallThick, 2);

                    if (isHoriz) {
                      const ox = pw.start * SCALE + startPos;
                      const cy = pw.fixedCoord * SCALE;
                      const dir = pw.side === 'top' ? 1 : -1;
                      if (isDoor) {
                        return (
                          <g key={`pw-op-${oi}`} pointerEvents="none">
                            <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy} stroke="#ffffff" strokeWidth={sw + 4} />
                            <line x1={ox} y1={cy} x2={ox + opWidth * 0.7} y2={cy + dir * opWidth * 0.3}
                              stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                          </g>
                        );
                      }
                      return (
                        <g key={`pw-op-${oi}`} pointerEvents="none">
                          <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy} stroke="#ffffff" strokeWidth={sw + 4} />
                          <line x1={ox} y1={cy - 1.5} x2={ox + opWidth} y2={cy - 1.5} stroke="#3b82f6" strokeWidth={1.5} />
                          <line x1={ox} y1={cy + 1.5} x2={ox + opWidth} y2={cy + 1.5} stroke="#3b82f6" strokeWidth={1.5} />
                        </g>
                      );
                    } else {
                      const oy = pw.start * SCALE + startPos;
                      const cx = pw.fixedCoord * SCALE;
                      const dir = pw.side === 'left' ? 1 : -1;
                      if (isDoor) {
                        return (
                          <g key={`pw-op-${oi}`} pointerEvents="none">
                            <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth} stroke="#ffffff" strokeWidth={sw + 4} />
                            <line x1={cx} y1={oy} x2={cx + dir * opWidth * 0.3} y2={oy + opWidth * 0.7}
                              stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                          </g>
                        );
                      }
                      return (
                        <g key={`pw-op-${oi}`} pointerEvents="none">
                          <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth} stroke="#ffffff" strokeWidth={sw + 4} />
                          <line x1={cx - 1.5} y1={oy} x2={cx - 1.5} y2={oy + opWidth} stroke="#3b82f6" strokeWidth={1.5} />
                          <line x1={cx + 1.5} y1={oy} x2={cx + 1.5} y2={oy + opWidth} stroke="#3b82f6" strokeWidth={1.5} />
                        </g>
                      );
                    }
                  })}
                </g>
              );
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
                <rect x={0} y={0} width={12} height={4} fill={WALL_EXT_COLOR} />
                <text x={16} y={4} fontSize={7} fill="#64748b">Externa</text>
                <rect x={65} y={0} width={12} height={3} fill={WALL_INT_COLOR} />
                <text x={81} y={4} fontSize={7} fill="#64748b">Interna</text>
                <line x1={130} y1={1.5} x2={142} y2={1.5} stroke={WALL_INVIS_COLOR} strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={146} y={4} fontSize={7} fill="#64748b">Invisible</text>
                <line x1={195} y1={-1} x2={207} y2={-1} stroke="#3b82f6" strokeWidth={1.5} />
                <line x1={195} y1={3} x2={207} y2={3} stroke="#3b82f6" strokeWidth={1.5} />
                <text x={211} y={4} fontSize={7} fill="#64748b">Ventana</text>
                <rect x={260} y={0} width={12} height={3} fill={SHARED_WALL_COLOR} />
                <text x={276} y={4} fontSize={7} fill="#64748b">Compartida</text>
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
