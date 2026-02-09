import { useMemo, useState, useCallback, useRef } from 'react';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlanCanvas2DProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  selectedRoomId?: string;
  onSelectRoom?: (roomId: string) => void;
  onMoveRoom?: (roomId: string, posX: number, posY: number) => void;
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

const GRID_SNAP = 0.5; // snap to 0.5m grid

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SNAP) * GRID_SNAP;
}

export function FloorPlanCanvas2D({ plan, rooms, selectedRoomId, onSelectRoom, onMoveRoom }: FloorPlanCanvas2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ roomId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const scale = 40; // pixels per meter
  const padding = 1.5;

  const { viewBox, elements } = useMemo(() => {
    let minX = 0, minY = 0, maxX = plan.width, maxY = plan.length;
    rooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });

    const vbX = (minX - padding) * scale;
    const vbY = (minY - padding) * scale;
    const vbW = (maxX - minX + 2 * padding) * scale;
    const vbH = (maxY - minY + 2 * padding) * scale;

    const elements = rooms.map(room => {
      const x = room.posX * scale;
      const y = room.posY * scale;
      const w = room.width * scale;
      const h = room.length * scale;
      const color = getRoomColor(room.name);

      const wallElements = room.walls.map(wall => {
        const isExternal = wall.wallType === 'externa';
        const thickness = isExternal
          ? plan.externalWallThickness * scale
          : plan.internalWallThickness * scale;
        const strokeWidth = Math.max(thickness, isExternal ? 4 : 2);

        let x1: number, y1: number, x2: number, y2: number;
        switch (wall.wallIndex) {
          case 1: x1 = x; y1 = y; x2 = x + w; y2 = y; break;
          case 2: x1 = x + w; y1 = y; x2 = x + w; y2 = y + h; break;
          case 3: x1 = x; y1 = y + h; x2 = x + w; y2 = y + h; break;
          case 4: default: x1 = x; y1 = y; x2 = x; y2 = y + h; break;
        }

        const openingElements = wall.openings.map((op, oi) => {
          const wallLen = (wall.wallIndex === 1 || wall.wallIndex === 3) ? room.width : room.length;
          const opWidth = op.width * scale;
          const pos = op.positionX * wallLen * scale;
          const isHorizontal = wall.wallIndex === 1 || wall.wallIndex === 3;

          if (op.openingType === 'puerta') {
            if (isHorizontal) {
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
            if (isHorizontal) {
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

        return (
          <g key={`wall-${wall.wallIndex}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isExternal ? 'hsl(222, 47%, 20%)' : 'hsl(220, 9%, 46%)'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {openingElements}
          </g>
        );
      });

      const fontSize = 9;

      return {
        roomId: room.id,
        rect: { x, y, w, h, color },
        wallElements,
        label: room.name,
        dims: `${room.width}×${room.length}m`,
        area: `${(room.width * room.length).toFixed(1)}m²`,
        fontSize,
        posX: room.posX,
        posY: room.posY,
      };
    });

    return { viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`, elements };
  }, [plan, rooms]);

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x / scale, y: svgPt.y / scale };
  }, [scale]);

  const handleMouseDown = useCallback((e: React.MouseEvent, roomId: string, room: { posX: number; posY: number }) => {
    if (!onMoveRoom) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    setDragging({ roomId, startX: pt.x, startY: pt.y, origPosX: room.posX, origPosY: room.posY });
    setDragOffset({ dx: 0, dy: 0 });
    onSelectRoom?.(roomId);
  }, [onMoveRoom, svgPoint, onSelectRoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const pt = svgPoint(e.clientX, e.clientY);
    const dx = pt.x - dragging.startX;
    const dy = pt.y - dragging.startY;
    setDragOffset({ dx: snapToGrid(dx), dy: snapToGrid(dy) });
  }, [dragging, svgPoint]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || !onMoveRoom) {
      setDragging(null);
      return;
    }
    const newX = snapToGrid(dragging.origPosX + dragOffset.dx);
    const newY = snapToGrid(dragging.origPosY + dragOffset.dy);
    if (newX !== dragging.origPosX || newY !== dragging.origPosY) {
      onMoveRoom(dragging.roomId, newX, newY);
    }
    setDragging(null);
    setDragOffset({ dx: 0, dy: 0 });
  }, [dragging, dragOffset, onMoveRoom]);

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed border-border">
        <p className="text-muted-foreground text-sm">Añade habitaciones para ver el plano</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto bg-background rounded-lg border border-border">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto min-h-[300px] max-h-[500px]"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', cursor: dragging ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid lines */}
        <defs>
          <pattern id="grid05" width={GRID_SNAP * scale} height={GRID_SNAP * scale} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_SNAP * scale} 0 L 0 0 0 ${GRID_SNAP * scale}`} fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" opacity="0.4" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={plan.width * scale} height={plan.length * scale} fill="url(#grid05)" />

        {/* Plan outline */}
        <rect
          x={0} y={0}
          width={plan.width * scale}
          height={plan.length * scale}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={1}
          strokeDasharray="8,4"
        />

        {/* Rooms */}
        {elements.map(el => {
          const isDragging = dragging?.roomId === el.roomId;
          const tx = isDragging ? dragOffset.dx * scale : 0;
          const ty = isDragging ? dragOffset.dy * scale : 0;

          return (
            <g key={el.roomId}
              transform={`translate(${tx}, ${ty})`}
              onMouseDown={e => handleMouseDown(e, el.roomId, { posX: el.posX, posY: el.posY })}
              className={onMoveRoom ? 'cursor-grab' : 'cursor-pointer'}
              style={{ opacity: isDragging ? 0.75 : 1 }}
            >
              {/* Fill */}
              <rect
                x={el.rect.x} y={el.rect.y}
                width={el.rect.w} height={el.rect.h}
                fill={el.rect.color}
                opacity={selectedRoomId === el.roomId ? 0.9 : 0.6}
                rx={2}
              />
              {selectedRoomId === el.roomId && (
                <rect
                  x={el.rect.x} y={el.rect.y}
                  width={el.rect.w} height={el.rect.h}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  rx={2}
                />
              )}

              {/* Walls */}
              {el.wallElements}

              {/* Labels */}
              <text
                x={el.rect.x + el.rect.w / 2}
                y={el.rect.y + el.rect.h / 2 - 6}
                textAnchor="middle"
                fontSize={el.fontSize + 1}
                fontWeight="600"
                fill="hsl(222, 47%, 11%)"
              >
                {el.label}
              </text>
              <text
                x={el.rect.x + el.rect.w / 2}
                y={el.rect.y + el.rect.h / 2 + 6}
                textAnchor="middle"
                fontSize={el.fontSize - 1}
                fill="hsl(220, 9%, 46%)"
              >
                {el.dims}
              </text>
              <text
                x={el.rect.x + el.rect.w / 2}
                y={el.rect.y + el.rect.h / 2 + 16}
                textAnchor="middle"
                fontSize={el.fontSize - 1}
                fontWeight="500"
                fill="hsl(217, 91%, 60%)"
              >
                {el.area}
              </text>

              {/* Width annotation at top */}
              <line
                x1={el.rect.x} y1={el.rect.y - 8}
                x2={el.rect.x + el.rect.w} y2={el.rect.y - 8}
                stroke="hsl(220, 9%, 70%)" strokeWidth={0.5}
                markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)"
              />
              <text
                x={el.rect.x + el.rect.w / 2}
                y={el.rect.y - 11}
                textAnchor="middle"
                fontSize={7}
                fill="hsl(220, 9%, 46%)"
              >
                {`${(el.rect.w / scale).toFixed(1)}m`}
              </text>
            </g>
          );
        })}

        {/* Arrow markers */}
        <defs>
          <marker id="arrowStart" markerWidth="4" markerHeight="4" refX="0" refY="2" orient="auto">
            <path d="M4,0 L0,2 L4,4" fill="none" stroke="hsl(220, 9%, 70%)" strokeWidth="0.5" />
          </marker>
          <marker id="arrowEnd" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4" fill="none" stroke="hsl(220, 9%, 70%)" strokeWidth="0.5" />
          </marker>
        </defs>

        {/* Legend */}
        <g transform={`translate(${-0.5 * scale}, ${(plan.length + 0.8) * scale})`}>
          <rect x={0} y={0} width={12} height={4} fill="hsl(222, 47%, 20%)" />
          <text x={16} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Pared externa</text>
          <rect x={80} y={0} width={12} height={2} fill="hsl(220, 9%, 46%)" />
          <text x={96} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Pared interna</text>
          <line x1={160} y1={-1} x2={172} y2={-1} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
          <line x1={160} y1={3} x2={172} y2={3} stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} />
          <text x={176} y={4} fontSize={7} fill="hsl(220, 9%, 46%)">Ventana</text>
          <text x={220} y={4} fontSize={7} fill="hsl(var(--muted-foreground))">⤡ Arrastra para mover</text>
        </g>
      </svg>
    </div>
  );
}
