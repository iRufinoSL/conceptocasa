import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text, Group } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, generateExternalWallNames, computeWallSegments, isExteriorType, isInvisibleType } from '@/lib/floor-plan-calculations';

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
const SCALE = 40; // pixels per meter

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

// Wall colors
const WALL_EXT_COLOR = '#1e2d4d';
const WALL_INT_COLOR = '#d97706';
const WALL_INVIS_COLOR = '#9ca3af';
const WALL_SELECTED_COLOR = '#6366f1';
const DIM_COLOR = '#c2410c';
const PERIM_COLOR = '#166534';

export function FloorPlanCanvas2D({
  plan, rooms, selectedRoomId, selectedWallKey, sharedWallKeys,
  onSelectRoom, onSelectWall, onMoveRoom, onResizeWall, onDoubleClickRoom, onDoubleClickWall,
}: FloorPlanCanvas2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 500 });
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 80, y: 80 });

  // Resize observer for container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height: Math.max(height, 400) });
    });
    ro.observe(el);
    setStageSize({ width: el.clientWidth, height: Math.max(el.clientHeight, 400) });
    return () => ro.disconnect();
  }, []);

  // Wall classification
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);
  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.3, Math.min(5, newScale));
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    setZoom(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, [zoom, stagePos]);

  // Room drag end
  const handleRoomDragEnd = useCallback((roomId: string, room: RoomData, e: KonvaEventObject<DragEvent>) => {
    if (!onMoveRoom) return;
    const rawX = snapToGrid(e.target.x() / SCALE);
    const rawY = snapToGrid(e.target.y() / SCALE);
    const snapped = magneticSnap(roomId, rawX, rawY, room.width, room.length, rooms);
    // Reset node position - the parent will re-render with new data
    e.target.x(snapped.x * SCALE);
    e.target.y(snapped.y * SCALE);
    if (snapped.x !== room.posX || snapped.y !== room.posY) {
      onMoveRoom(roomId, snapped.x, snapped.y);
    }
  }, [rooms, onMoveRoom]);

  // Room drag move (live snap preview)
  const handleRoomDragMove = useCallback((roomId: string, room: RoomData, e: KonvaEventObject<DragEvent>) => {
    const rawX = snapToGrid(e.target.x() / SCALE);
    const rawY = snapToGrid(e.target.y() / SCALE);
    // Snap to grid during drag
    e.target.x(rawX * SCALE);
    e.target.y(rawY * SCALE);
  }, []);

  // Wall resize via drag handle
  const handleResizeHandleDrag = useCallback((roomId: string, wallIndex: number, isHoriz: boolean, startVal: number, e: KonvaEventObject<DragEvent>) => {
    // Constrain handle to axis
    if (isHoriz) {
      e.target.x(0); // keep x fixed relative to group
    } else {
      e.target.y(0);
    }
  }, []);

  const handleResizeHandleDragEnd = useCallback((roomId: string, wallIndex: number, isHoriz: boolean, startVal: number, e: KonvaEventObject<DragEvent>) => {
    if (!onResizeWall) return;
    const raw = isHoriz
      ? e.target.y() / SCALE
      : e.target.x() / SCALE;
    const delta = snapToGrid(raw);
    // Reset handle position
    e.target.x(0);
    e.target.y(0);
    if (delta !== 0) {
      onResizeWall(roomId, wallIndex, delta);
    }
  }, [onResizeWall]);

  // Keyboard arrow key movement
  useEffect(() => {
    if (!selectedRoomId || !onMoveRoom) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      e.stopPropagation();
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

  // Compute perimeter dimensions
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
      interiorWidth: maxX - minX,
      interiorLength: maxY - minY,
    };
  }, [rooms, plan.externalWallThickness]);

  // Zoom buttons
  const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 250, 300];

  // Click on empty stage deselects
  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      onSelectRoom?.('');
      onSelectWall?.(null);
    }
  }, [onSelectRoom, onSelectWall]);

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed border-border">
        <p className="text-muted-foreground text-sm">Añade habitaciones para ver el plano</p>
      </div>
    );
  }

  const extT = plan.externalWallThickness;

  return (
    <div className="w-full bg-background rounded-lg border border-border">
      {/* Zoom toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30">
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
        <span className="text-[10px] text-muted-foreground ml-2">🖱️ Rueda = zoom · Arrastrar fondo = pan</span>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '500px', cursor: 'default' }}>
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePos.x}
          y={stagePos.y}
          draggable
          onWheel={handleWheel}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
          onClick={handleStageClick}
        >
          <Layer>
            {/* Grid */}
            {(() => {
              const gridLines: JSX.Element[] = [];
              const gridW = plan.width * SCALE;
              const gridH = plan.length * SCALE;
              const step = GRID_SNAP * SCALE;
              for (let x = 0; x <= gridW; x += step) {
                gridLines.push(
                  <Line key={`gv-${x}`} points={[x, 0, x, gridH]}
                    stroke="#e5e7eb" strokeWidth={0.3} opacity={0.5} listening={false} />
                );
              }
              for (let y = 0; y <= gridH; y += step) {
                gridLines.push(
                  <Line key={`gh-${y}`} points={[0, y, gridW, y]}
                    stroke="#e5e7eb" strokeWidth={0.3} opacity={0.5} listening={false} />
                );
              }
              return gridLines;
            })()}

            {/* Plan outline */}
            <Rect
              x={0} y={0}
              width={plan.width * SCALE}
              height={plan.length * SCALE}
              stroke="#d1d5db"
              strokeWidth={1}
              dash={[8, 4]}
              listening={false}
            />

            {/* External perimeter outline */}
            {perimeterDims && (
              <Rect
                x={perimeterDims.extMinX}
                y={perimeterDims.extMinY}
                width={perimeterDims.extMaxX - perimeterDims.extMinX}
                height={perimeterDims.extMaxY - perimeterDims.extMinY}
                stroke={DIM_COLOR}
                strokeWidth={0.8}
                dash={[4, 3]}
                opacity={0.5}
                listening={false}
              />
            )}

            {/* Perimeter dimension annotations */}
            {perimeterDims && (
              <>
                {/* Top dimension - Side A */}
                <Line
                  points={[perimeterDims.extMinX, perimeterDims.extMinY - 18, perimeterDims.extMaxX, perimeterDims.extMinY - 18]}
                  stroke={DIM_COLOR} strokeWidth={0.6} listening={false}
                />
                <Text
                  x={perimeterDims.extMinX}
                  y={perimeterDims.extMinY - 30}
                  width={perimeterDims.extMaxX - perimeterDims.extMinX}
                  align="center"
                  text={`A: ${perimeterDims.topLen.toFixed(2)}m`}
                  fontSize={7} fontStyle="bold" fill={DIM_COLOR} listening={false}
                />
                {/* Right dimension - Side B */}
                <Line
                  points={[perimeterDims.extMaxX + 18, perimeterDims.extMinY, perimeterDims.extMaxX + 18, perimeterDims.extMaxY]}
                  stroke={DIM_COLOR} strokeWidth={0.6} listening={false}
                />
                <Text
                  x={perimeterDims.extMaxX + 22}
                  y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2 - 4}
                  text={`B: ${perimeterDims.rightLen.toFixed(2)}m`}
                  fontSize={7} fontStyle="bold" fill={DIM_COLOR}
                  rotation={90} listening={false}
                />
                {/* Bottom dimension - Side C */}
                <Line
                  points={[perimeterDims.extMinX, perimeterDims.extMaxY + 18, perimeterDims.extMaxX, perimeterDims.extMaxY + 18]}
                  stroke={DIM_COLOR} strokeWidth={0.6} listening={false}
                />
                <Text
                  x={perimeterDims.extMinX}
                  y={perimeterDims.extMaxY + 22}
                  width={perimeterDims.extMaxX - perimeterDims.extMinX}
                  align="center"
                  text={`C: ${perimeterDims.topLen.toFixed(2)}m`}
                  fontSize={7} fontStyle="bold" fill={DIM_COLOR} listening={false}
                />
                {/* Left dimension - Side D */}
                <Line
                  points={[perimeterDims.extMinX - 18, perimeterDims.extMinY, perimeterDims.extMinX - 18, perimeterDims.extMaxY]}
                  stroke={DIM_COLOR} strokeWidth={0.6} listening={false}
                />
                <Text
                  x={perimeterDims.extMinX - 28}
                  y={(perimeterDims.extMinY + perimeterDims.extMaxY) / 2 + 4}
                  text={`D: ${perimeterDims.rightLen.toFixed(2)}m`}
                  fontSize={7} fontStyle="bold" fill={DIM_COLOR}
                  rotation={-90} listening={false}
                />
              </>
            )}

            {/* Rooms */}
            {rooms.map(room => {
              const x = room.posX * SCALE;
              const y = room.posY * SCALE;
              const w = room.width * SCALE;
              const h = room.length * SCALE;
              const color = getRoomColor(room.name);
              const isSelected = selectedRoomId === room.id;

              // Wall segments for this room
              const roomWallSegments = room.walls.map(wall => {
                const wallKey = `${room.id}::${wall.wallIndex}`;
                const segments = wallSegmentsMap.get(wallKey) || [];
                const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;

                // Wall endpoints relative to room
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
                <Group
                  key={room.id}
                  x={x}
                  y={y}
                  draggable={!!onMoveRoom}
                  onDragMove={(e) => handleRoomDragMove(room.id, room, e)}
                  onDragEnd={(e) => handleRoomDragEnd(room.id, room, e)}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelectRoom?.(room.id);
                    onSelectWall?.(null);
                  }}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    onDoubleClickRoom?.(room.id);
                  }}
                >
                  {/* Floor fill */}
                  <Rect
                    x={0} y={0}
                    width={w} height={h}
                    fill={color}
                    opacity={0.75}
                    cornerRadius={2}
                  />

                  {/* Selection highlight */}
                  {isSelected && (
                    <Rect
                      x={0} y={0}
                      width={w} height={h}
                      stroke={WALL_SELECTED_COLOR}
                      strokeWidth={2}
                      cornerRadius={2}
                      listening={false}
                    />
                  )}

                  {/* Wall segments */}
                  {roomWallSegments.map(({ wall, wallKey, segments, isHoriz, wx1, wy1, wx2, wy2 }) => (
                    <Group key={wallKey}>
                      {segments.map((seg, si) => {
                        const segKey = `${wallKey}::${si}`;
                        const isSegSelected = selectedWallKey === segKey;
                        const isInvisible = isInvisibleType(seg.segmentType);
                        const isExternal = isExteriorType(seg.segmentType);

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
                          : isExternal ? WALL_EXT_COLOR
                          : WALL_INT_COLOR;

                        return (
                          <Group key={`seg-${si}`}>
                            {/* Hit area */}
                            <Line
                              points={[sx1, sy1, sx2, sy2]}
                              stroke="transparent"
                              strokeWidth={14}
                              onClick={(e) => {
                                e.cancelBubble = true;
                                const key = `${wallKey}::${si}`;
                                onSelectWall?.(selectedWallKey === key ? null : key);
                                onSelectRoom?.(room.id);
                              }}
                              onDblClick={(e) => {
                                e.cancelBubble = true;
                                onDoubleClickWall?.(room.id, wall.wallIndex, si);
                              }}
                            />
                            {/* Selection glow */}
                            {isSegSelected && (
                              <Line
                                points={[sx1, sy1, sx2, sy2]}
                                stroke={WALL_SELECTED_COLOR}
                                strokeWidth={8}
                                lineCap="round"
                                opacity={0.3}
                                listening={false}
                              />
                            )}
                            {/* Visible wall line */}
                            <Line
                              points={[sx1, sy1, sx2, sy2]}
                              stroke={segColor}
                              strokeWidth={strokeWidth}
                              dash={isInvisible ? [4, 3] : undefined}
                              listening={false}
                            />
                          </Group>
                        );
                      })}

                      {/* Openings */}
                      {wall.openings.map((op, oi) => {
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
                              <Group key={`op-${oi}`} listening={false}>
                                {/* Clear wall for door */}
                                <Line points={[ox, cy, ox + opWidth, cy]}
                                  stroke="#ffffff" strokeWidth={sw + 4} />
                                {/* Door swing arc approximation */}
                                <Line points={[ox, cy, ox + opWidth * 0.7, cy + (wall.wallIndex === 1 ? 1 : -1) * opWidth * 0.3]}
                                  stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                              </Group>
                            );
                          } else {
                            const oy = startPos;
                            const cx = wall.wallIndex === 4 ? 0 : w;
                            return (
                              <Group key={`op-${oi}`} listening={false}>
                                <Line points={[cx, oy, cx, oy + opWidth]}
                                  stroke="#ffffff" strokeWidth={sw + 4} />
                                <Line points={[cx, oy, cx + (wall.wallIndex === 4 ? 1 : -1) * opWidth * 0.3, oy + opWidth * 0.7]}
                                  stroke={WALL_SELECTED_COLOR} strokeWidth={0.8} opacity={0.6} />
                              </Group>
                            );
                          }
                        } else {
                          // Window
                          if (isHoriz) {
                            const ox = startPos;
                            const cy = wall.wallIndex === 1 ? 0 : h;
                            return (
                              <Group key={`op-${oi}`} listening={false}>
                                <Line points={[ox, cy, ox + opWidth, cy]}
                                  stroke="#ffffff" strokeWidth={sw + 4} />
                                <Line points={[ox, cy - 1.5, ox + opWidth, cy - 1.5]}
                                  stroke="#3b82f6" strokeWidth={1.5} />
                                <Line points={[ox, cy + 1.5, ox + opWidth, cy + 1.5]}
                                  stroke="#3b82f6" strokeWidth={1.5} />
                              </Group>
                            );
                          } else {
                            const oy = startPos;
                            const cx = wall.wallIndex === 4 ? 0 : w;
                            return (
                              <Group key={`op-${oi}`} listening={false}>
                                <Line points={[cx, oy, cx, oy + opWidth]}
                                  stroke="#ffffff" strokeWidth={sw + 4} />
                                <Line points={[cx - 1.5, oy, cx - 1.5, oy + opWidth]}
                                  stroke="#3b82f6" strokeWidth={1.5} />
                                <Line points={[cx + 1.5, oy, cx + 1.5, oy + opWidth]}
                                  stroke="#3b82f6" strokeWidth={1.5} />
                              </Group>
                            );
                          }
                        }
                      })}
                    </Group>
                  ))}

                  {/* External wall thickness bands */}
                  {roomWallSegments.map(({ wallKey, segments, isHoriz, wall }) => {
                    const overallType = wallClassification.get(wallKey) || wall.wallType;
                    if (!isExteriorType(overallType)) return null;
                    const extThick = extT * SCALE;
                    if (isHoriz) {
                      return (
                        <Rect key={`ext-${wallKey}`}
                          x={0}
                          y={wall.wallIndex === 1 ? -extThick : h}
                          width={w} height={extThick}
                          fill={WALL_EXT_COLOR} opacity={0.12}
                          listening={false}
                        />
                      );
                    } else {
                      return (
                        <Rect key={`ext-${wallKey}`}
                          x={wall.wallIndex === 4 ? -extThick : w}
                          y={0}
                          width={extThick} height={h}
                          fill={WALL_EXT_COLOR} opacity={0.12}
                          listening={false}
                        />
                      );
                    }
                  })}

                  {/* Interior labels */}
                  <Text
                    x={0} y={h / 2 - 14}
                    width={w}
                    align="center"
                    text={room.name}
                    fontSize={10} fontStyle="bold"
                    fill="#1e293b"
                    listening={false}
                  />
                  <Text
                    x={0} y={h / 2 - 2}
                    width={w}
                    align="center"
                    text={`${room.width}×${room.length}m`}
                    fontSize={8}
                    fill="#64748b"
                    listening={false}
                  />
                  <Text
                    x={0} y={h / 2 + 9}
                    width={w}
                    align="center"
                    text={`Suelo: ${(room.width * room.length).toFixed(1)}m²`}
                    fontSize={8.5} fontStyle="bold"
                    fill="#3b82f6"
                    listening={false}
                  />

                  {/* Interior dimension annotation (top) */}
                  <Line
                    points={[0, -8, w, -8]}
                    stroke="#9ca3af" strokeWidth={0.5}
                    listening={false}
                  />
                  <Text
                    x={0} y={-18}
                    width={w}
                    align="center"
                    text={`${room.width.toFixed(1)}m`}
                    fontSize={7}
                    fill="#64748b"
                    listening={false}
                  />

                  {/* Resize handles - only for selected room */}
                  {isSelected && onResizeWall && roomWallSegments.map(({ wall, isHoriz }) => {
                    let hx: number, hy: number;
                    switch (wall.wallIndex) {
                      case 1: hx = w / 2; hy = 0; break;
                      case 2: hx = w; hy = h / 2; break;
                      case 3: hx = w / 2; hy = h; break;
                      case 4: default: hx = 0; hy = h / 2; break;
                    }
                    return (
                      <Circle
                        key={`h-${wall.wallIndex}`}
                        x={hx} y={hy}
                        radius={4}
                        fill={WALL_SELECTED_COLOR}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        draggable
                        dragBoundFunc={(pos) => {
                          // Constrain to axis
                          const stage = stageRef.current;
                          if (!stage) return pos;
                          const absGroup = stage.findOne(`#room-${room.id}`);
                          if (isHoriz) {
                            return { x: pos.x, y: pos.y }; // Allow vertical movement
                          }
                          return { x: pos.x, y: pos.y }; // Allow horizontal movement
                        }}
                        onDragEnd={(e) => {
                          const delta = isHoriz
                            ? snapToGrid(e.target.y() / SCALE)
                            : snapToGrid(e.target.x() / SCALE);
                          // Reset handle
                          e.target.x(hx);
                          e.target.y(hy);
                          if (delta !== 0 && onResizeWall) {
                            onResizeWall(room.id, wall.wallIndex, delta);
                          }
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = isHoriz ? 'ns-resize' : 'ew-resize';
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = 'default';
                        }}
                      />
                    );
                  })}
                </Group>
              );
            })}

            {/* Legend */}
            {perimeterDims && (
              <Group x={perimeterDims.extMinX} y={perimeterDims.extMaxY + 24} listening={false}>
                <Rect x={0} y={0} width={12} height={4} fill={WALL_EXT_COLOR} />
                <Text x={16} y={-2} text="Externa" fontSize={7} fill="#64748b" />
                <Rect x={65} y={0} width={12} height={3} fill={WALL_INT_COLOR} />
                <Text x={81} y={-2} text="Interna" fontSize={7} fill="#64748b" />
                <Line points={[130, 1.5, 142, 1.5]} stroke={WALL_INVIS_COLOR} strokeWidth={1.5} dash={[4, 3]} />
                <Text x={146} y={-2} text="Invisible" fontSize={7} fill="#64748b" />
                <Line points={[195, -1, 207, -1]} stroke="#3b82f6" strokeWidth={1.5} />
                <Line points={[195, 3, 207, 3]} stroke="#3b82f6" strokeWidth={1.5} />
                <Text x={211} y={-2} text="Ventana" fontSize={7} fill="#64748b" />
              </Group>
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
