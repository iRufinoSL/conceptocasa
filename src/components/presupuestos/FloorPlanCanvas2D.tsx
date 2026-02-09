import { useMemo, useState, useCallback, useRef } from 'react';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

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
};

function getRoomColor(name: string): string {
  for (const [key, color] of Object.entries(ROOM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return 'hsl(220, 14%, 93%)';
}

const GRID_SNAP = 0.5;

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SNAP) * GRID_SNAP;
}

export function FloorPlanCanvas2D({
  plan, rooms, selectedRoomId, selectedWallKey, sharedWallKeys,
  onSelectRoom, onSelectWall, onMoveRoom, onResizeWall,
}: FloorPlanCanvas2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scale = 40;
  const padding = 2.5; // increased padding for external dimension annotations

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

  const handleWallClick = useCallback((e: React.MouseEvent, roomId: string, wallIndex: number) => {
    e.stopPropagation();
    const key = `${roomId}::${wallIndex}`;
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
      const newX = snapToGrid(roomDrag.origPosX + roomDragOffset.dx);
      const newY = snapToGrid(roomDrag.origPosY + roomDragOffset.dy);
      if (newX !== roomDrag.origPosX || newY !== roomDrag.origPosY) {
        onMoveRoom(roomDrag.roomId, newX, newY);
      }
    } else if (wallDrag && onResizeWall && wallDragDelta !== 0) {
      onResizeWall(wallDrag.roomId, wallDrag.wallIndex, wallDragDelta);
    }
    setRoomDrag(null);
    setRoomDragOffset({ dx: 0, dy: 0 });
    setWallDrag(null);
    setWallDragDelta(0);
  }, [roomDrag, roomDragOffset, wallDrag, wallDragDelta, onMoveRoom, onResizeWall]);

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

  const { viewBox, elements } = useMemo(() => {
    const extT = plan.externalWallThickness;
    let minX = 0, minY = 0, maxX = plan.width, maxY = plan.length;
    displayRooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });
    // Extend viewBox to include external walls
    const vbX = (minX - extT - padding) * scale;
    const vbY = (minY - extT - padding) * scale;
    const vbW = (maxX - minX + 2 * extT + 2 * padding) * scale;
    const vbH = (maxY - minY + 2 * extT + 2 * padding + 1) * scale; // +1 for legend

    const elements = displayRooms.map(room => {
      const x = room.posX * scale;
      const y = room.posY * scale;
      const w = room.width * scale;
      const h = room.length * scale;
      const color = getRoomColor(room.name);

      const wallData = room.walls.map(wall => {
        const wallKey = `${room.id}::${wall.wallIndex}`;
        const isShared = sharedWallKeys?.has(wallKey) || wall.wallType === 'compartida';
        const isExternal = wall.wallType === 'externa';
        const isWallSelected = selectedWallKey === wallKey;

        const baseThickness = isExternal ? plan.externalWallThickness * scale : plan.internalWallThickness * scale;
        const strokeWidth = Math.max(baseThickness, isExternal ? 4 : isShared ? 3 : 2);

        let x1: number, y1: number, x2: number, y2: number;
        switch (wall.wallIndex) {
          case 1: x1 = x; y1 = y; x2 = x + w; y2 = y; break;
          case 2: x1 = x + w; y1 = y; x2 = x + w; y2 = y + h; break;
          case 3: x1 = x; y1 = y + h; x2 = x + w; y2 = y + h; break;
          case 4: default: x1 = x; y1 = y; x2 = x; y2 = y + h; break;
        }

        const wallColor = isWallSelected ? 'hsl(var(--primary))'
          : isExternal ? 'hsl(222, 47%, 20%)'
          : isShared ? 'hsl(25, 95%, 53%)'
          : 'hsl(220, 9%, 46%)';

        // External wall dimension (interior length + wall thickness on both ends for external walls)
        const interiorLen = (wall.wallIndex === 1 || wall.wallIndex === 3) ? room.width : room.length;
        const externalLen = isExternal ? interiorLen + 2 * extT : interiorLen;

        // Openings
        const openingEls = wall.openings.map((op, oi) => {
          const wallLen = (wall.wallIndex === 1 || wall.wallIndex === 3) ? room.width : room.length;
          const opWidth = op.width * scale;
          const pos = op.positionX * wallLen * scale;
          const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;

          if (op.openingType === 'puerta' || op.openingType === 'puerta_externa') {
            if (isHoriz) {
              const cx = x + pos;
              const cy = (wall.wallIndex === 1) ? y : y + h;
              const dir = wall.wallIndex === 1 ? 1 : -1;
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={cy} x2={cx + opWidth} y2={cy}
                    stroke="hsl(var(--background))" strokeWidth={strokeWidth + 2} />
                  <path d={`M ${cx} ${cy} A ${opWidth} ${opWidth} 0 0 ${dir > 0 ? 1 : 0} ${cx + opWidth} ${cy + dir * opWidth * 0.3}`}
                    fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="3,2" />
                </g>
              );
            } else {
              const cx = (wall.wallIndex === 4) ? x : x + w;
              const cy = y + pos;
              const dir = wall.wallIndex === 4 ? 1 : -1;
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={cy} x2={cx} y2={cy + opWidth}
                    stroke="hsl(var(--background))" strokeWidth={strokeWidth + 2} />
                  <path d={`M ${cx} ${cy} A ${opWidth} ${opWidth} 0 0 ${dir > 0 ? 0 : 1} ${cx + dir * opWidth * 0.3} ${cy + opWidth}`}
                    fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="3,2" />
                </g>
              );
            }
          } else {
            if (isHoriz) {
              const cx = x + pos;
              const cy = (wall.wallIndex === 1) ? y : y + h;
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={cy} x2={cx + opWidth} y2={cy}
                    stroke="hsl(var(--background))" strokeWidth={strokeWidth + 2} />
                  <line x1={cx} y1={cy - 1.5} x2={cx + opWidth} y2={cy - 1.5}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                  <line x1={cx} y1={cy + 1.5} x2={cx + opWidth} y2={cy + 1.5}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                </g>
              );
            } else {
              const cx = (wall.wallIndex === 4) ? x : x + w;
              const cy = y + pos;
              return (
                <g key={`op-${oi}`}>
                  <line x1={cx} y1={cy} x2={cx} y2={cy + opWidth}
                    stroke="hsl(var(--background))" strokeWidth={strokeWidth + 2} />
                  <line x1={cx - 1.5} y1={cy} x2={cx - 1.5} y2={cy + opWidth}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                  <line x1={cx + 1.5} y1={cy} x2={cx + 1.5} y2={cy + opWidth}
                    stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
                </g>
              );
            }
          }
        });

        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const handleX = isHoriz ? (x1 + x2) / 2 : x1;
        const handleY = isHoriz ? y1 : (y1 + y2) / 2;

        return {
          wallIndex: wall.wallIndex, wallKey, isSelected: isWallSelected, isShared,
          isExternal, x1, y1, x2, y2, strokeWidth, color: wallColor,
          dashArray: isShared ? '6,3' : undefined,
          openingEls, handleX, handleY, isHoriz,
          interiorLen, externalLen,
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
  }, [plan, displayRooms, selectedWallKey, sharedWallKeys]);

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

  return (
    <div className="w-full overflow-auto bg-background rounded-lg border border-border">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto min-h-[300px] max-h-[500px]"
        style={{
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          cursor: isDragging ? (wallDrag ? (wallDrag.isHorizontal ? 'ns-resize' : 'ew-resize') : 'grabbing') : 'default',
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

              {/* Fill */}
              <rect x={el.x} y={el.y} width={el.w} height={el.h}
                fill={el.color} opacity={isSelected ? 0.9 : 0.6} rx={2}
                onMouseDown={e => handleRoomMouseDown(e, el.roomId, el.posX, el.posY)}
                className={onMoveRoom ? 'cursor-grab' : 'cursor-pointer'}
              />
              {isSelected && (
                <rect x={el.x} y={el.y} width={el.w} height={el.h}
                  fill="none" stroke="hsl(var(--primary))" strokeWidth={2} rx={2}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* Walls */}
              {el.wallData.map(w => (
                <g key={w.wallKey}>
                  {/* Hit area */}
                  <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
                    stroke="transparent" strokeWidth={14}
                    style={{ cursor: 'pointer' }}
                    onClick={e => handleWallClick(e, el.roomId, w.wallIndex)}
                  />
                  {/* Selected glow */}
                  {w.isSelected && (
                    <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
                      stroke="hsl(var(--primary))" strokeWidth={w.strokeWidth + 4}
                      strokeLinecap="round" opacity={0.3} style={{ pointerEvents: 'none' }} />
                  )}
                  {/* Visible wall */}
                  <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
                    stroke={w.color} strokeWidth={w.strokeWidth}
                    strokeLinecap="round" strokeDasharray={w.dashArray}
                    style={{ pointerEvents: 'none' }} />
                  {/* Openings */}
                  {w.openingEls}

                  {/* External wall outer dimension annotation */}
                  {w.isExternal && (
                    <g style={{ pointerEvents: 'none' }}>
                      {w.isHoriz ? (
                        <>
                          {/* Horizontal external wall: show dimension above/below */}
                          {(() => {
                            const extLen = w.externalLen;
                            const midX = (w.x1 + w.x2) / 2;
                            const outside = w.wallIndex === 1 ? w.y1 - extT * scale - 6 : w.y1 + extT * scale + 10;
                            return (
                              <text x={midX} y={outside}
                                textAnchor="middle" fontSize={6.5} fontWeight="500" fill={dimColor}>
                                {extLen.toFixed(2)}m (ext.)
                              </text>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          {/* Vertical external wall: show dimension left/right */}
                          {(() => {
                            const extLen = w.externalLen;
                            const midY = (w.y1 + w.y2) / 2;
                            const outside = w.wallIndex === 4 ? w.x1 - extT * scale - 4 : w.x1 + extT * scale + 4;
                            return (
                              <text x={outside} y={midY}
                                textAnchor={w.wallIndex === 4 ? 'end' : 'start'}
                                fontSize={6.5} fontWeight="500" fill={dimColor}
                                transform={`rotate(${w.wallIndex === 4 ? -90 : 90}, ${outside}, ${midY})`}>
                                {extLen.toFixed(2)}m (ext.)
                              </text>
                            );
                          })()}
                        </>
                      )}
                    </g>
                  )}
                </g>
              ))}

              {/* Interior labels */}
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 - 6}
                textAnchor="middle" fontSize={10} fontWeight="600" fill="hsl(222, 47%, 11%)"
                style={{ pointerEvents: 'none' }}>{el.label}</text>
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 + 6}
                textAnchor="middle" fontSize={8} fill="hsl(220, 9%, 46%)"
                style={{ pointerEvents: 'none' }}>{el.dims}</text>
              <text x={el.x + el.w / 2} y={el.y + el.h / 2 + 16}
                textAnchor="middle" fontSize={8} fontWeight="500" fill="hsl(217, 91%, 60%)"
                style={{ pointerEvents: 'none' }}>{el.area}</text>

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
            <rect x={65} y={0} width={12} height={2} fill="hsl(220, 9%, 46%)" />
            <text x={81} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Interna</text>
            <line x1={130} y1={1} x2={145} y2={1} stroke="hsl(25, 95%, 53%)" strokeWidth={3} strokeDasharray="6,3" />
            <text x={149} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Compartida</text>
            <line x1={220} y1={-1} x2={232} y2={-1} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
            <line x1={220} y1={3} x2={232} y2={3} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
            <text x={236} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Ventana</text>
            <rect x={280} y={-1} width={8} height={6} fill="none" stroke={dimColor} strokeWidth={0.6} strokeDasharray="3,2" />
            <text x={292} y={4} fontSize={7} fill={dimColor}>Ext. (grosor)</text>
          </g>
        )}
      </svg>
    </div>
  );
}
