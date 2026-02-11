import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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
}

const ROOM_COLORS: Record<string, string> = {
  'Salón': 'hsl(217, 91%, 90%)',
  'Cocina': 'hsl(38, 92%, 85%)',
  'Habitación': 'hsl(142, 76%, 85%)',
  'Baño': 'hsl(200, 80%, 85%)',
  'Despensa': 'hsl(280, 60%, 88%)',
  'Pasillo': 'hsl(220, 14%, 92%)',
  'Entrada': 'hsl(25, 95%, 88%)',
  'Patio': 'hsl(120, 40%, 85%)',
};

function getRoomColor(name: string): string {
  for (const [key, color] of Object.entries(ROOM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return 'hsl(220, 14%, 93%)';
}

const GRID_SNAP = 0.05;
const MAGNET_THRESHOLD = 0.15; // snap to adjacent edges within 15cm

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SNAP) * GRID_SNAP;
}

/** Snap room position to adjacent room edges (magnetic snap).
 *  Picks the closest snap candidate per axis so that later matches don't override better earlier ones.
 *  Prioritises flush snaps (right→left, bottom→top) over alignment snaps (left→left) so that
 *  adjacent rooms always produce a single shared wall. */
function magneticSnap(
  roomId: string, posX: number, posY: number, width: number, length: number,
  allRooms: RoomData[]
): { x: number; y: number } {
  const edges = { left: posX, right: posX + width, top: posY, bottom: posY + length };

  // Collect snap candidates per axis: { targetX, distance }
  const xCandidates: { target: number; dist: number; flush: boolean }[] = [];
  const yCandidates: { target: number; dist: number; flush: boolean }[] = [];

  for (const other of allRooms) {
    if (other.id === roomId) continue;
    const oEdges = { left: other.posX, right: other.posX + other.width, top: other.posY, bottom: other.posY + other.length };

    // Check vertical overlap to ensure rooms are actually adjacent (not just horizontally aligned but far apart)
    const vOverlap = Math.min(edges.bottom, oEdges.bottom) - Math.max(edges.top, oEdges.top);
    const hOverlap = Math.min(edges.right, oEdges.right) - Math.max(edges.left, oEdges.left);

    // X-axis snaps (only if there's some vertical overlap or close to it)
    if (vOverlap > -MAGNET_THRESHOLD) {
      // Flush: right→left (rooms side by side)
      const d1 = Math.abs(edges.right - oEdges.left);
      if (d1 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.left - width, dist: d1, flush: true });
      // Flush: left→right
      const d2 = Math.abs(edges.left - oEdges.right);
      if (d2 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.right, dist: d2, flush: true });
      // Align: left→left
      const d3 = Math.abs(edges.left - oEdges.left);
      if (d3 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.left, dist: d3, flush: false });
      // Align: right→right
      const d4 = Math.abs(edges.right - oEdges.right);
      if (d4 < MAGNET_THRESHOLD) xCandidates.push({ target: oEdges.right - width, dist: d4, flush: false });
    }

    // Y-axis snaps (only if there's some horizontal overlap or close to it)
    if (hOverlap > -MAGNET_THRESHOLD) {
      // Flush: bottom→top
      const d5 = Math.abs(edges.bottom - oEdges.top);
      if (d5 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.top - length, dist: d5, flush: true });
      // Flush: top→bottom
      const d6 = Math.abs(edges.top - oEdges.bottom);
      if (d6 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.bottom, dist: d6, flush: true });
      // Align: top→top
      const d7 = Math.abs(edges.top - oEdges.top);
      if (d7 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.top, dist: d7, flush: false });
      // Align: bottom→bottom
      const d8 = Math.abs(edges.bottom - oEdges.bottom);
      if (d8 < MAGNET_THRESHOLD) yCandidates.push({ target: oEdges.bottom - length, dist: d8, flush: false });
    }
  }

  // Pick best snap: flush snaps win ties, then closest distance
  const pickBest = (candidates: { target: number; dist: number; flush: boolean }[], fallback: number) => {
    if (candidates.length === 0) return fallback;
    candidates.sort((a, b) => {
      // Flush snaps have priority over alignment snaps
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

export function FloorPlanCanvas2D({
  plan, rooms, selectedRoomId, selectedWallKey, sharedWallKeys,
  onSelectRoom, onSelectWall, onMoveRoom, onResizeWall,
}: FloorPlanCanvas2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scale = 40;
  const padding = 2.5;
  const [zoomPercent, setZoomPercent] = useState(100);

  // Room drag state
  const [roomDrag, setRoomDrag] = useState<{
    roomId: string; startX: number; startY: number; origPosX: number; origPosY: number;
  } | null>(null);
  const [roomDragOffset, setRoomDragOffset] = useState({ dx: 0, dy: 0 });

  // Wall resize drag state
  const [wallDrag, setWallDrag] = useState<{
    roomId: string; wallIndex: number; startVal: number; isHorizontal: boolean;
  } | null>(null);
  const [wallDragDelta, setWallDragDelta] = useState(0);

  // Preview rooms with wall drag applied
  const displayRooms = useMemo(() => {
    if (!wallDrag || wallDragDelta === 0) return rooms;
    return rooms.map(room => {
      if (room.id !== wallDrag.roomId) return room;
      const r = { ...room };
      switch (wallDrag.wallIndex) {
        case 1: r.posY += wallDragDelta; r.length = Math.max(0.5, r.length - wallDragDelta); break;
        case 2: r.width = Math.max(0.5, r.width + wallDragDelta); break;
        case 3: r.length = Math.max(0.5, r.length + wallDragDelta); break;
        case 4: r.posX += wallDragDelta; r.width = Math.max(0.5, r.width - wallDragDelta); break;
      }
      return r;
    });
  }, [rooms, wallDrag, wallDragDelta]);

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x / scale, y: svgPt.y / scale };
  }, [scale]);

  const handleRoomMouseDown = useCallback((e: React.MouseEvent, roomId: string, posX: number, posY: number) => {
    if (!onMoveRoom || wallDrag) return;
    e.preventDefault(); e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    setRoomDrag({ roomId, startX: pt.x, startY: pt.y, origPosX: posX, origPosY: posY });
    setRoomDragOffset({ dx: 0, dy: 0 });
    onSelectRoom?.(roomId);
    onSelectWall?.(null);
  }, [onMoveRoom, svgPoint, onSelectRoom, onSelectWall, wallDrag]);

  const handleWallClick = useCallback((e: React.MouseEvent, roomId: string, wallIndex: number, segIndex?: number) => {
    e.stopPropagation();
    const key = segIndex !== undefined ? `${roomId}::${wallIndex}::${segIndex}` : `${roomId}::${wallIndex}`;
    onSelectWall?.(selectedWallKey === key ? null : key);
    onSelectRoom?.(roomId);
  }, [onSelectWall, onSelectRoom, selectedWallKey]);

  const handleWallHandleDown = useCallback((e: React.MouseEvent, roomId: string, wallIndex: number) => {
    if (!onResizeWall) return;
    e.preventDefault(); e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    const isHorizontal = wallIndex === 1 || wallIndex === 3;
    setWallDrag({ roomId, wallIndex, startVal: isHorizontal ? pt.y : pt.x, isHorizontal });
    setWallDragDelta(0);
    onSelectRoom?.(roomId);
  }, [onResizeWall, svgPoint, onSelectRoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (roomDrag) {
      const pt = svgPoint(e.clientX, e.clientY);
      setRoomDragOffset({ dx: snapToGrid(pt.x - roomDrag.startX), dy: snapToGrid(pt.y - roomDrag.startY) });
    } else if (wallDrag) {
      const pt = svgPoint(e.clientX, e.clientY);
      const raw = wallDrag.isHorizontal ? pt.y - wallDrag.startVal : pt.x - wallDrag.startVal;
      setWallDragDelta(snapToGrid(raw));
    }
  }, [roomDrag, wallDrag, svgPoint]);

  const handleMouseUp = useCallback(() => {
    if (roomDrag && onMoveRoom) {
      const rawX = snapToGrid(roomDrag.origPosX + roomDragOffset.dx);
      const rawY = snapToGrid(roomDrag.origPosY + roomDragOffset.dy);
      const draggedRoom = rooms.find(r => r.id === roomDrag.roomId);
      if (draggedRoom) {
        const snapped = magneticSnap(roomDrag.roomId, rawX, rawY, draggedRoom.width, draggedRoom.length, rooms);
        if (snapped.x !== roomDrag.origPosX || snapped.y !== roomDrag.origPosY) {
          onMoveRoom(roomDrag.roomId, snapped.x, snapped.y);
        }
      } else if (rawX !== roomDrag.origPosX || rawY !== roomDrag.origPosY) {
        onMoveRoom(roomDrag.roomId, rawX, rawY);
      }
    } else if (wallDrag && onResizeWall && wallDragDelta !== 0) {
      onResizeWall(wallDrag.roomId, wallDrag.wallIndex, wallDragDelta);
    }
    setRoomDrag(null);
    setRoomDragOffset({ dx: 0, dy: 0 });
    setWallDrag(null);
    setWallDragDelta(0);
  }, [roomDrag, roomDragOffset, wallDrag, wallDragDelta, onMoveRoom, onResizeWall, rooms]);

  // Keyboard arrow key movement for selected room
  useEffect(() => {
    if (!selectedRoomId || !onMoveRoom) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      // Don't intercept if focus is on an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 0.05 : 0.01; // Shift = 5cm, normal = 1cm
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      let newX = room.posX, newY = room.posY;
      if (e.key === 'ArrowLeft') newX -= step;
      if (e.key === 'ArrowRight') newX += step;
      if (e.key === 'ArrowUp') newY -= step;
      if (e.key === 'ArrowDown') newY += step;
      // Round to avoid floating point drift
      newX = Math.round(newX * 100) / 100;
      newY = Math.round(newY * 100) / 100;
      // Apply magnetic snap so arrow-key movement also produces shared walls
      const snapped = magneticSnap(selectedRoomId, newX, newY, room.width, room.length, rooms);
      onMoveRoom(selectedRoomId, snapped.x, snapped.y);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedRoomId, onMoveRoom, rooms]);

  // Compute external perimeter dimensions (outer bounds including wall thickness)
  const perimeterDims = useMemo(() => {
    if (displayRooms.length === 0) return null;
    const extT = plan.externalWallThickness;

    // Find bounding box of all rooms (interior bounds)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displayRooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });

    // Exterior bounds = interior bounds + wall thickness on each side
    const extMinX = minX - extT;
    const extMinY = minY - extT;
    const extMaxX = maxX + extT;
    const extMaxY = maxY + extT;

    const topLen = extMaxX - extMinX; // Side A (top)
    const rightLen = extMaxY - extMinY; // Side B (right)
    const bottomLen = topLen; // Side C (bottom)
    const leftLen = rightLen; // Side D (left)

    return {
      extMinX, extMinY, extMaxX, extMaxY,
      topLen, rightLen, bottomLen, leftLen,
      interiorWidth: maxX - minX,
      interiorLength: maxY - minY,
    };
  }, [displayRooms, plan.externalWallThickness]);

  const wallClassification = useMemo(() => autoClassifyWalls(displayRooms), [displayRooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(displayRooms, wallClassification), [displayRooms, wallClassification]);
  const wallSegmentsMap = useMemo(() => computeWallSegments(displayRooms), [displayRooms]);

  const { viewBox, elements } = useMemo(() => {
    const extT = plan.externalWallThickness;
    let minX = 0, minY = 0, maxX = plan.width, maxY = plan.length;
    displayRooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });
    const vbX = (minX - extT - padding) * scale;
    const vbY = (minY - extT - padding) * scale;
    const vbW = (maxX - minX + 2 * extT + 2 * padding) * scale;
    const vbH = (maxY - minY + 2 * extT + 2 * padding + 1) * scale;

    const elements = displayRooms.map(room => {
      const x = room.posX * scale;
      const y = room.posY * scale;
      const w = room.width * scale;
      const h = room.length * scale;
      const color = getRoomColor(room.name);

      const wallData = room.walls.map(wall => {
        const wallKey = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(wallKey) || [];
        const isWallSelected = selectedWallKey === wallKey || selectedWallKey?.startsWith(wallKey + '::');
        const wallName = externalWallNames.get(wallKey);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;

        // Wall line endpoints
        let wx1: number, wy1: number, wx2: number, wy2: number;
        switch (wall.wallIndex) {
          case 1: wx1 = x; wy1 = y; wx2 = x + w; wy2 = y; break;
          case 2: wx1 = x + w; wy1 = y; wx2 = x + w; wy2 = y + h; break;
          case 3: wx1 = x; wy1 = y + h; wx2 = x + w; wy2 = y + h; break;
          case 4: default: wx1 = x; wy1 = y; wx2 = x; wy2 = y + h; break;
        }

        // Render each segment
        const segmentEls = segments.map((seg, si) => {
          const segKey = `${wallKey}::${si}`;
          const isSegSelected = selectedWallKey === segKey;
          const isInvisible = isInvisibleType(seg.segmentType);
          const isExternal = isExteriorType(seg.segmentType);

          // Invisible segments are not rendered at all
          if (isInvisible) return null;

          const baseThickness = isExternal ? plan.externalWallThickness * scale : plan.internalWallThickness * scale;
          const strokeWidth = Math.max(baseThickness, isExternal ? 4 : 3);

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

          const segColor = isSegSelected ? 'hsl(var(--primary))'
            : isExternal ? 'hsl(222, 47%, 20%)'
            : 'hsl(25, 80%, 50%)';

          return (
            <g key={`seg-${si}`}>
              {/* Hit area per segment */}
              <line
                x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                stroke="transparent" strokeWidth={14}
                onClick={e => handleWallClick(e, room.id, wall.wallIndex, si)}
                style={{ cursor: 'pointer' }}
              />
              {/* Selection glow per segment */}
              {isSegSelected && (
                <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                  stroke="hsl(var(--primary))" strokeWidth={8}
                  strokeLinecap="round" opacity={0.3} style={{ pointerEvents: 'none' }} />
              )}
              {/* Visible segment line */}
              <line
                x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                stroke={segColor} strokeWidth={strokeWidth}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        }).filter(Boolean);

        // Determine overall wall type for opening rendering (use first non-invisible segment, or invisible if all invisible)
        const hasVisibleSegment = segments.some(s => !isInvisibleType(s.segmentType));

        // Openings - render on non-invisible segments
        const openingEls = wall.openings.map((op, oi) => {
          // Check which segment this opening falls in
          const opCenter = op.positionX;
          const opSeg = segments.find(s => opCenter >= s.startFraction - 0.01 && opCenter <= s.endFraction + 0.01);
          const isOnInvisible = opSeg ? isInvisibleType(opSeg.segmentType) : false;

          // Skip openings on invisible segments
          if (isOnInvisible) return null;

          const wallLen = isHoriz ? room.width : room.length;
          const opWidth = op.width * scale;
          const centerPos = op.positionX * wallLen * scale;
          const startPos = centerPos - opWidth / 2;
          const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';

          if (isDoor) {
            if (isHoriz) {
              const ox = x + startPos;
              const cy = (wall.wallIndex === 1) ? y : y + h;
              const dir = wall.wallIndex === 1 ? 1 : -1;
              const segStroke = opSeg ? (isExteriorType(opSeg.segmentType) ? plan.externalWallThickness * scale : plan.internalWallThickness * scale) : 2;
              const sw = Math.max(segStroke, 2);
              return (
                <g key={`op-${oi}`}>
                  <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy}
                    stroke="hsl(var(--background))" strokeWidth={sw + 4} />
                  <path d={`M ${ox} ${cy} A ${opWidth} ${opWidth} 0 0 ${dir > 0 ? 1 : 0} ${ox + opWidth} ${cy + dir * opWidth * 0.4}`}
                    fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="3,2" />
                  <line x1={ox} y1={cy} x2={ox + opWidth * 0.7} y2={cy + dir * opWidth * 0.3}
                    stroke="hsl(var(--primary))" strokeWidth={0.8} opacity={0.6} />
                </g>
              );
            } else {
              const oy = y + startPos;
              const cx = (wall.wallIndex === 4) ? x : x + w;
              const dir = wall.wallIndex === 4 ? 1 : -1;
              const segStroke = opSeg ? (isExteriorType(opSeg.segmentType) ? plan.externalWallThickness * scale : plan.internalWallThickness * scale) : 2;
              const sw = Math.max(segStroke, 2);
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth}
                    stroke="hsl(var(--background))" strokeWidth={sw + 4} />
                  <path d={`M ${cx} ${oy} A ${opWidth} ${opWidth} 0 0 ${dir > 0 ? 0 : 1} ${cx + dir * opWidth * 0.4} ${oy + opWidth}`}
                    fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="3,2" />
                  <line x1={cx} y1={oy} x2={cx + dir * opWidth * 0.3} y2={oy + opWidth * 0.7}
                    stroke="hsl(var(--primary))" strokeWidth={0.8} opacity={0.6} />
                </g>
              );
            }
          } else {
            if (isHoriz) {
              const ox = x + startPos;
              const cy = (wall.wallIndex === 1) ? y : y + h;
              const segStroke = opSeg ? (isExteriorType(opSeg.segmentType) ? plan.externalWallThickness * scale : plan.internalWallThickness * scale) : 2;
              const sw = Math.max(segStroke, 2);
              return (
                <g key={`op-${oi}`}>
                  <line x1={ox} y1={cy} x2={ox + opWidth} y2={cy}
                    stroke="hsl(var(--background))" strokeWidth={sw + 4} />
                  <line x1={ox} y1={cy - 1.5} x2={ox + opWidth} y2={cy - 1.5}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                  <line x1={ox} y1={cy + 1.5} x2={ox + opWidth} y2={cy + 1.5}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                </g>
              );
            } else {
              const oy = y + startPos;
              const cx = (wall.wallIndex === 4) ? x : x + w;
              const segStroke = opSeg ? (isExteriorType(opSeg.segmentType) ? plan.externalWallThickness * scale : plan.internalWallThickness * scale) : 2;
              const sw = Math.max(segStroke, 2);
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={oy} x2={cx} y2={oy + opWidth}
                    stroke="hsl(var(--background))" strokeWidth={sw + 4} />
                  <line x1={cx - 1.5} y1={oy} x2={cx - 1.5} y2={oy + opWidth}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                  <line x1={cx + 1.5} y1={oy} x2={cx + 1.5} y2={oy + opWidth}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                </g>
              );
            }
          }
        }).filter(Boolean);

        const handleX = isHoriz ? (wx1 + wx2) / 2 : wx1;
        const handleY = isHoriz ? wy1 : (wy1 + wy2) / 2;

        // For dimensions, use the overall wall classification
        const overallType = wallClassification.get(wallKey) || wall.wallType;
        const isExternal = isExteriorType(overallType);
        const isInvisible = isInvisibleType(overallType);
        const interiorLen = isHoriz ? room.width : room.length;
        const externalLen = isExternal ? interiorLen + 2 * extT : interiorLen;

        return {
          wallIndex: wall.wallIndex, wallKey, isSelected: isWallSelected,
          isInvisible, isExternal,
          x1: wx1, y1: wy1, x2: wx2, y2: wy2,
          strokeWidth: 0, // not used anymore for single line
          color: 'transparent',
          dashArray: undefined,
          segmentEls,
          openingEls, handleX, handleY, isHoriz,
          interiorLen, externalLen, wallName,
        };
      });

      return {
        roomId: room.id, x, y, w, h, color, wallData,
        label: room.name,
        dims: `${room.width}×${room.length}m`,
        area: `${(room.width * room.length).toFixed(1)}m²`,
        posX: room.posX, posY: room.posY,
      };
    });

    return { viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`, elements };
  }, [plan, displayRooms, selectedWallKey, sharedWallKeys, wallClassification, wallSegmentsMap, externalWallNames]);

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed border-border">
        <p className="text-muted-foreground text-sm">Añade habitaciones para ver el plano</p>
      </div>
    );
  }

  const isDragging = !!roomDrag || !!wallDrag;
  const extT = plan.externalWallThickness;
  const dimColor = 'hsl(25, 95%, 45%)';
  const dimFontSize = 7;
  const perimColor = 'hsl(142, 76%, 30%)';

  const zoomFactor = zoomPercent / 100;
  const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 250, 300];

  return (
    <div className="w-full bg-background rounded-lg border border-border">
      {/* Zoom toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Zoom:</span>
        {ZOOM_STEPS.map(z => (
          <button key={z}
            onClick={() => setZoomPercent(z)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              zoomPercent === z
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-background text-muted-foreground hover:bg-accent/20 border border-border'
            }`}
          >
            {z}%
          </button>
        ))}
      </div>
      <div className="overflow-auto" style={{ maxHeight: zoomPercent > 100 ? '70vh' : undefined }}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="h-auto"
        style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          cursor: isDragging ? (wallDrag ? (wallDrag.isHorizontal ? 'ns-resize' : 'ew-resize') : 'grabbing') : 'default',
          width: `${zoomFactor * 100}%`,
          minHeight: `${Math.max(300, 300 * zoomFactor)}px`,
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <pattern id="grid05" width={GRID_SNAP * scale} height={GRID_SNAP * scale} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_SNAP * scale} 0 L 0 0 0 ${GRID_SNAP * scale}`} fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" opacity="0.4" />
          </pattern>
          <marker id="arrowStart" markerWidth="4" markerHeight="4" refX="0" refY="2" orient="auto">
            <path d="M4,0 L0,2 L4,4" fill="none" stroke="hsl(220, 9%, 70%)" strokeWidth="0.5" />
          </marker>
          <marker id="arrowEnd" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4" fill="none" stroke="hsl(220, 9%, 70%)" strokeWidth="0.5" />
          </marker>
          <marker id="dimArrowStart" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto">
            <path d="M5,0 L0,2.5 L5,5" fill="none" stroke={dimColor} strokeWidth="0.5" />
          </marker>
          <marker id="dimArrowEnd" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5" fill="none" stroke={dimColor} strokeWidth="0.5" />
          </marker>
          <marker id="perimArrowStart" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto">
            <path d="M5,0 L0,2.5 L5,5" fill="none" stroke={perimColor} strokeWidth="0.5" />
          </marker>
          <marker id="perimArrowEnd" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5" fill="none" stroke={perimColor} strokeWidth="0.5" />
          </marker>
        </defs>

        {/* Grid */}
        <rect x={0} y={0} width={plan.width * scale} height={plan.length * scale} fill="url(#grid05)" />

        {/* Plan outline */}
        <rect x={0} y={0} width={plan.width * scale} height={plan.length * scale}
          fill="none" stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="8,4" />

        {/* External perimeter dimensions (A=top, B=right, C=bottom, D=left) */}
        {perimeterDims && (() => {
          const p = perimeterDims;
          const extMinXs = p.extMinX * scale;
          const extMinYs = p.extMinY * scale;
          const extMaxXs = p.extMaxX * scale;
          const extMaxYs = p.extMaxY * scale;
          const offset1 = 18; // distance for individual wall dim
          const offset2 = 32; // distance for perimeter total

          return (
            <g style={{ pointerEvents: 'none' }}>
              {/* External wall outline (thin dashed) */}
              <rect x={extMinXs} y={extMinYs} width={(p.extMaxX - p.extMinX) * scale} height={(p.extMaxY - p.extMinY) * scale}
                fill="none" stroke={dimColor} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.5} />

              {/* Side A - Top: external dimension */}
              <line x1={extMinXs} y1={extMinYs - offset1} x2={extMaxXs} y2={extMinYs - offset1}
                stroke={dimColor} strokeWidth={0.6}
                markerStart="url(#dimArrowStart)" markerEnd="url(#dimArrowEnd)" />
              <text x={(extMinXs + extMaxXs) / 2} y={extMinYs - offset1 - 3}
                textAnchor="middle" fontSize={dimFontSize} fontWeight="600" fill={dimColor}>
                A: {p.topLen.toFixed(2)}m
              </text>

              {/* Side A - Perimeter total above */}
              <line x1={extMinXs} y1={extMinYs - offset2} x2={extMaxXs} y2={extMinYs - offset2}
                stroke={perimColor} strokeWidth={0.6}
                markerStart="url(#perimArrowStart)" markerEnd="url(#perimArrowEnd)" />
              <text x={(extMinXs + extMaxXs) / 2} y={extMinYs - offset2 - 3}
                textAnchor="middle" fontSize={dimFontSize} fontWeight="700" fill={perimColor}>
                Perímetro A: {p.topLen.toFixed(2)}m
              </text>

              {/* Side B - Right: external dimension */}
              <line x1={extMaxXs + offset1} y1={extMinYs} x2={extMaxXs + offset1} y2={extMaxYs}
                stroke={dimColor} strokeWidth={0.6}
                markerStart="url(#dimArrowStart)" markerEnd="url(#dimArrowEnd)" />
              <text x={extMaxXs + offset1 + 3} y={(extMinYs + extMaxYs) / 2}
                textAnchor="start" fontSize={dimFontSize} fontWeight="600" fill={dimColor}
                transform={`rotate(90, ${extMaxXs + offset1 + 3}, ${(extMinYs + extMaxYs) / 2})`}>
                B: {p.rightLen.toFixed(2)}m
              </text>

              {/* Side B - Perimeter total */}
              <line x1={extMaxXs + offset2} y1={extMinYs} x2={extMaxXs + offset2} y2={extMaxYs}
                stroke={perimColor} strokeWidth={0.6}
                markerStart="url(#perimArrowStart)" markerEnd="url(#perimArrowEnd)" />
              <text x={extMaxXs + offset2 + 3} y={(extMinYs + extMaxYs) / 2}
                textAnchor="start" fontSize={dimFontSize} fontWeight="700" fill={perimColor}
                transform={`rotate(90, ${extMaxXs + offset2 + 3}, ${(extMinYs + extMaxYs) / 2})`}>
                Perímetro B: {p.rightLen.toFixed(2)}m
              </text>

              {/* Side C - Bottom: external dimension */}
              <line x1={extMinXs} y1={extMaxYs + offset1} x2={extMaxXs} y2={extMaxYs + offset1}
                stroke={dimColor} strokeWidth={0.6}
                markerStart="url(#dimArrowStart)" markerEnd="url(#dimArrowEnd)" />
              <text x={(extMinXs + extMaxXs) / 2} y={extMaxYs + offset1 + 9}
                textAnchor="middle" fontSize={dimFontSize} fontWeight="600" fill={dimColor}>
                C: {p.bottomLen.toFixed(2)}m
              </text>

              {/* Side D - Left: external dimension */}
              <line x1={extMinXs - offset1} y1={extMinYs} x2={extMinXs - offset1} y2={extMaxYs}
                stroke={dimColor} strokeWidth={0.6}
                markerStart="url(#dimArrowStart)" markerEnd="url(#dimArrowEnd)" />
              <text x={extMinXs - offset1 - 3} y={(extMinYs + extMaxYs) / 2}
                textAnchor="end" fontSize={dimFontSize} fontWeight="600" fill={dimColor}
                transform={`rotate(-90, ${extMinXs - offset1 - 3}, ${(extMinYs + extMaxYs) / 2})`}>
                D: {p.leftLen.toFixed(2)}m
              </text>

              {/* Side D - Perimeter total */}
              <line x1={extMinXs - offset2} y1={extMinYs} x2={extMinXs - offset2} y2={extMaxYs}
                stroke={perimColor} strokeWidth={0.6}
                markerStart="url(#perimArrowStart)" markerEnd="url(#perimArrowEnd)" />
              <text x={extMinXs - offset2 - 3} y={(extMinYs + extMaxYs) / 2}
                textAnchor="end" fontSize={dimFontSize} fontWeight="700" fill={perimColor}
                transform={`rotate(-90, ${extMinXs - offset2 - 3}, ${(extMinYs + extMaxYs) / 2})`}>
                Perímetro D: {p.leftLen.toFixed(2)}m
              </text>
            </g>
          );
        })()}

        {/* Rooms */}
        {elements.map(el => {
          const isDraggingRoom = roomDrag?.roomId === el.roomId;
          const tx = isDraggingRoom ? roomDragOffset.dx * scale : 0;
          const ty = isDraggingRoom ? roomDragOffset.dy * scale : 0;
          const isSelected = selectedRoomId === el.roomId;

          return (
            <g key={el.roomId} transform={`translate(${tx}, ${ty})`}
              style={{ opacity: isDraggingRoom ? 0.75 : 1 }}>

              {/* Floor fill - always visible with distinct color */}
              <rect x={el.x} y={el.y} width={el.w} height={el.h}
                fill={el.color} opacity={0.75} rx={2}
                onMouseDown={e => handleRoomMouseDown(e, el.roomId, el.posX, el.posY)}
                className={onMoveRoom ? 'cursor-grab' : 'cursor-pointer'}
              />
              {/* Floor pattern indicator */}
              <rect x={el.x + 2} y={el.y + 2} width={el.w - 4} height={el.h - 4}
                fill="none" stroke={el.color} strokeWidth={0.5} rx={1}
                style={{ pointerEvents: 'none' }} opacity={0.5} />
              {isSelected && (
                <rect x={el.x} y={el.y} width={el.w} height={el.h}
                  fill="none" stroke="hsl(var(--primary))" strokeWidth={2} rx={2}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* Walls */}
              {el.wallData.map(w => (
                <g key={w.wallKey}>
                  {/* External wall base thickness band - per segment */}
                  {w.isExternal && (
                    <g style={{ pointerEvents: 'none' }}>
                      {w.isHoriz ? (
                        <rect
                          x={w.x1} y={w.wallIndex === 1 ? w.y1 - extT * scale : w.y1}
                          width={Math.abs(w.x2 - w.x1)} height={extT * scale}
                          fill="hsl(222, 47%, 20%)" opacity={0.12} />
                      ) : (
                        <rect
                          x={w.wallIndex === 4 ? w.x1 - extT * scale : w.x1} y={w.y1}
                          width={extT * scale} height={Math.abs(w.y2 - w.y1)}
                          fill="hsl(222, 47%, 20%)" opacity={0.12} />
                      )}
                    </g>
                  )}
                  {/* Hit areas and selection glows are now per-segment inside segmentEls */}
                  {/* Wall segments (replaces single wall line) */}
                  {w.segmentEls}
                  {/* Openings */}
                  {w.openingEls}

                  {/* External wall outer dimension annotation */}
                  {w.isExternal && (
                     <g style={{ pointerEvents: 'none' }}>
                      {w.isHoriz ? (
                        <>
                          {(() => {
                            const extLen = w.externalLen;
                            const midX = (w.x1 + w.x2) / 2;
                            const outside = w.wallIndex === 1 ? w.y1 - extT * scale - 6 : w.y1 + extT * scale + 10;
                            return (
                              <text x={midX} y={outside}
                                textAnchor="middle" fontSize={6.5} fontWeight="500" fill={dimColor}>
                                {w.wallName ? `${w.wallName}: ` : ''}{extLen.toFixed(2)}m (ext.)
                              </text>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          {(() => {
                            const extLen = w.externalLen;
                            const midY = (w.y1 + w.y2) / 2;
                            const outside = w.wallIndex === 4 ? w.x1 - extT * scale - 4 : w.x1 + extT * scale + 4;
                            return (
                              <text x={outside} y={midY}
                                textAnchor={w.wallIndex === 4 ? 'end' : 'start'}
                                fontSize={6.5} fontWeight="500" fill={dimColor}
                                transform={`rotate(${w.wallIndex === 4 ? -90 : 90}, ${outside}, ${midY})`}>
                                {w.wallName ? `${w.wallName}: ` : ''}{extLen.toFixed(2)}m (ext.)
                              </text>
                            );
                          })()}
                        </>
                      )}
                    </g>
                  )}
                </g>
              ))}

              {/* Interior labels - Name, Dims, Floor area */}
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 - 8}
                textAnchor="middle" fontSize={10} fontWeight="700" fill="hsl(222, 47%, 11%)"
                style={{ pointerEvents: 'none' }}>{el.label}</text>
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 + 4}
                textAnchor="middle" fontSize={8} fill="hsl(220, 9%, 46%)"
                style={{ pointerEvents: 'none' }}>{el.dims}</text>
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 + 15}
                textAnchor="middle" fontSize={8.5} fontWeight="600" fill="hsl(217, 91%, 50%)"
                style={{ pointerEvents: 'none' }}>Suelo: {el.area}</text>

              {/* Interior dimension annotation (top) */}
              <line x1={el.x} y1={el.y - 8} x2={el.x + el.w} y2={el.y - 8}
                stroke="hsl(220, 9%, 70%)" strokeWidth={0.5}
                markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)"
                style={{ pointerEvents: 'none' }} />
              <text x={el.x + el.w / 2} y={el.y - 11}
                textAnchor="middle" fontSize={7} fill="hsl(220, 9%, 46%)"
                style={{ pointerEvents: 'none' }}>{`${(el.w / scale).toFixed(1)}m`}</text>

              {/* Resize handles - only for selected room */}
              {isSelected && onResizeWall && el.wallData.map(w => (
                <circle key={`h-${w.wallKey}`}
                  cx={w.handleX} cy={w.handleY} r={4}
                  fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={1.5}
                  style={{ cursor: w.isHoriz ? 'ns-resize' : 'ew-resize' }}
                  onMouseDown={e => handleWallHandleDown(e, el.roomId, w.wallIndex)}
                />
              ))}
            </g>
          );
        })}

        {/* Legend */}
        {perimeterDims && (
          <g transform={`translate(${(perimeterDims.extMinX) * scale}, ${(perimeterDims.extMaxY + 0.6) * scale})`}>
            <rect x={0} y={0} width={12} height={4} fill="hsl(222, 47%, 20%)" />
            <text x={16} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Externa</text>
            <rect x={65} y={0} width={12} height={3} fill="hsl(25, 80%, 50%)" />
            <text x={81} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Interna</text>
            <line x1={130} y1={-1} x2={142} y2={-1} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
            <line x1={220} y1={3} x2={232} y2={3} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
            <line x1={130} y1={3} x2={142} y2={3} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
            <text x={146} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Ventana</text>
            <rect x={190} y={-1} width={8} height={6} fill="none" stroke={dimColor} strokeWidth={0.6} strokeDasharray="3,2" />
            <text x={202} y={4} fontSize={7} fill={dimColor}>Ext. (grosor)</text>
          </g>
        )}
      </svg>
      </div>
    </div>
  );
}
