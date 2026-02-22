import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Trash2, DoorOpen } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, computeWallSegments, generateExternalWallNames, autoClassifyWalls, isExteriorType, isInvisibleType } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment } from '@/lib/floor-plan-calculations';

interface WallElevationViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  saving: boolean;
}

interface ElevationSegmentInfo {
  room: RoomData;
  wall: WallData;
  segment: WallSegment;
  segmentIndex: number;
  totalSegments: number;
  segmentLength: number;
  wallHeight: number;
  wallName?: string;
  ownOpenings: OpeningData[];
  neighborRoom?: RoomData;
  neighborWall?: WallData;
  neighborOpenings: OpeningData[];
}

const SCALE = 120;
const PADDING = 40;
const DIM_OFFSET = 25;
const MIN_CANVAS_HEIGHT = 200;
const HANDLE_WIDTH = 6;
const ARROW_STEP = 0.01; // 1cm per arrow press

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

function getOpeningSillHeight(op: OpeningData): number {
  return op.sillHeight ?? 0;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';

export function WallElevationView({
  plan, rooms, onUpdateOpening, onAddOpening, onDeleteOpening, saving,
}: WallElevationViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    openingId: string;
    mode: DragMode;
    startX: number;
    startPosX: number;
    startWidth: number;
    wallLength: number;
    opWidth: number;
  } | null>(null);

  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Build flat list of wall segments for navigation
  const allSegments: ElevationSegmentInfo[] = useMemo(() => {
    const result: ElevationSegmentInfo[] = [];
    rooms.forEach(room => {
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        const wallHeight = getWallHeight(wall, room, plan);
        const wallName = externalWallNames.get(key);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const fullWallLen = isHoriz ? room.width : room.length;

        segments.forEach((seg, si) => {
          const segLen = seg.endMeters - seg.startMeters;
          const ownOpenings = wall.openings.filter(op => {
            const opCenter = op.positionX;
            return opCenter >= seg.startFraction - 0.01 && opCenter <= seg.endFraction + 0.01;
          });

          let neighborRoom: RoomData | undefined;
          let neighborWall: WallData | undefined;
          let neighborOpenings: OpeningData[] = [];

          if (isInvisibleType(seg.segmentType) && seg.neighborRoomId) {
            neighborRoom = rooms.find(r => r.id === seg.neighborRoomId);
            if (neighborRoom && seg.neighborWallIndex !== undefined) {
              neighborWall = neighborRoom.walls.find(w => w.wallIndex === seg.neighborWallIndex);
              if (neighborWall) {
                const neighborIsHoriz = seg.neighborWallIndex === 1 || seg.neighborWallIndex === 3;
                const neighborFullLen = neighborIsHoriz ? neighborRoom.width : neighborRoom.length;
                const absStart = isHoriz ? room.posX + seg.startMeters : room.posY + seg.startMeters;
                const absEnd = isHoriz ? room.posX + seg.endMeters : room.posY + seg.endMeters;
                neighborOpenings = neighborWall.openings.filter(op => {
                  const opAbsCenter = neighborIsHoriz
                    ? neighborRoom!.posX + op.positionX * neighborFullLen
                    : neighborRoom!.posY + op.positionX * neighborFullLen;
                  return opAbsCenter >= absStart - 0.05 && opAbsCenter <= absEnd + 0.05;
                });
              }
            }
          }

          result.push({
            room, wall, segment: seg, segmentIndex: si,
            totalSegments: segments.length,
            segmentLength: segLen,
            wallHeight, wallName,
            ownOpenings,
            neighborRoom, neighborWall,
            neighborOpenings,
          });
        });
      });
    });
    return result;
  }, [rooms, plan, wallSegmentsMap, externalWallNames, wallClassification]);

  const current = allSegments[currentIndex];

  // Keyboard handler for arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOpeningId || !current) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      e.preventDefault();
      const step = e.shiftKey ? ARROW_STEP * 5 : ARROW_STEP; // Shift = 5cm
      const direction = e.key === 'ArrowLeft' ? -1 : 1;

      // Find the opening in displayOpenings
      const isInvisible = isInvisibleType(current.segment.segmentType);
      const openings = isInvisible ? current.neighborOpenings : current.ownOpenings;
      const op = openings.find(o => o.id === selectedOpeningId);
      if (!op) return;

      const effLen = isInvisible
        ? (() => {
            const nwi = current.segment.neighborWallIndex;
            if (nwi === undefined || !current.neighborRoom) return current.segmentLength;
            const nh = nwi === 1 || nwi === 3;
            return nh ? current.neighborRoom.width : current.neighborRoom.length;
          })()
        : (() => {
            const ih = current.wall.wallIndex === 1 || current.wall.wallIndex === 3;
            return ih ? current.room.width : current.room.length;
          })();

      const deltaFraction = (step * direction) / effLen;
      const halfW = (op.width / 2) / effLen;
      const newPosX = Math.max(halfW, Math.min(1 - halfW, op.positionX + deltaFraction));
      onUpdateOpening(selectedOpeningId, { positionX: newPosX });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOpeningId, current, onUpdateOpening]);

  // Click outside to deselect
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedOpeningId(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  if (!current || allSegments.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-muted/30 rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">No hay paredes para mostrar alzados</p>
      </div>
    );
  }

  const { room, wall, segment, segmentIndex, totalSegments, segmentLength, wallHeight, wallName, ownOpenings, neighborRoom, neighborWall, neighborOpenings } = current;

  const displayOpenings: Array<OpeningData & { isNeighbor: boolean; segStartMeters: number; segLengthMeters: number; fullWallLen: number }> = [];
  const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
  const fullWallLen = isHoriz ? room.width : room.length;

  if (isInvisibleType(segment.segmentType)) {
    neighborOpenings.forEach(op => {
      const neighborIsHoriz = segment.neighborWallIndex === 1 || segment.neighborWallIndex === 3;
      const neighborFullLen = neighborRoom ? (neighborIsHoriz ? neighborRoom.width : neighborRoom.length) : segmentLength;
      displayOpenings.push({ ...op, isNeighbor: true, segStartMeters: segment.startMeters, segLengthMeters: segmentLength, fullWallLen: neighborFullLen });
    });
  } else {
    ownOpenings.forEach(op => {
      displayOpenings.push({ ...op, isNeighbor: false, segStartMeters: segment.startMeters, segLengthMeters: segmentLength, fullWallLen });
    });
  }

  const canvasWidth = segmentLength * SCALE + PADDING * 2 + DIM_OFFSET;
  const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, wallHeight * SCALE + PADDING * 2 + DIM_OFFSET);
  const wallX = PADDING + DIM_OFFSET;
  const wallY = PADDING;
  const wallW = segmentLength * SCALE;
  const wallH = wallHeight * SCALE;

  const svgPoint = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return clientX - rect.left;
  };

  const handleOpeningMouseDown = (e: React.MouseEvent, op: typeof displayOpenings[0], mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOpeningId(op.id);
    const effLen = op.isNeighbor ? op.fullWallLen : fullWallLen;
    setDragState({
      openingId: op.id,
      mode,
      startX: svgPoint(e.clientX),
      startPosX: op.positionX,
      startWidth: op.width,
      wallLength: effLen,
      opWidth: op.width,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const currentX = svgPoint(e.clientX);
    const deltaPixels = currentX - dragState.startX;
    const deltaMeters = deltaPixels / SCALE;

    if (dragState.mode === 'move') {
      const deltaFraction = deltaMeters / dragState.wallLength;
      let newPosX = dragState.startPosX + deltaFraction;
      const halfWidthFraction = (dragState.opWidth / 2) / dragState.wallLength;
      newPosX = Math.max(halfWidthFraction, Math.min(1 - halfWidthFraction, newPosX));
      onUpdateOpening(dragState.openingId, { positionX: newPosX });
    } else if (dragState.mode === 'resize-left') {
      // Left edge: move left edge → changes width and positionX
      const newWidth = Math.max(0.3, dragState.startWidth - deltaMeters);
      const widthDelta = newWidth - dragState.startWidth;
      const posShift = -(widthDelta / 2) / dragState.wallLength;
      const newPosX = Math.max(newWidth / 2 / dragState.wallLength, Math.min(1 - newWidth / 2 / dragState.wallLength, dragState.startPosX + posShift));
      onUpdateOpening(dragState.openingId, { width: Math.round(newWidth * 100) / 100, positionX: newPosX });
    } else if (dragState.mode === 'resize-right') {
      const newWidth = Math.max(0.3, dragState.startWidth + deltaMeters);
      const widthDelta = newWidth - dragState.startWidth;
      const posShift = (widthDelta / 2) / dragState.wallLength;
      const newPosX = Math.max(newWidth / 2 / dragState.wallLength, Math.min(1 - newWidth / 2 / dragState.wallLength, dragState.startPosX + posShift));
      onUpdateOpening(dragState.openingId, { width: Math.round(newWidth * 100) / 100, positionX: newPosX });
    }
  };

  const handleMouseUp = () => {
    setDragState(null);
  };

  const handleSvgClick = (e: React.MouseEvent) => {
    // Click on empty space deselects
    if ((e.target as Element).tagName === 'svg' || (e.target as Element).tagName === 'rect') {
      const isWallRect = (e.target as Element).getAttribute('data-wall-bg') === 'true';
      const isGround = (e.target as Element).getAttribute('data-ground') === 'true';
      if (isWallRect || isGround || (e.target as Element).tagName === 'svg') {
        setSelectedOpeningId(null);
      }
    }
  };

  const prevWall = () => setCurrentIndex(i => (i - 1 + allSegments.length) % allSegments.length);
  const nextWall = () => setCurrentIndex(i => (i + 1) % allSegments.length);

  const typeLabel = isExteriorType(segment.segmentType) ? 'Exterior' : isInvisibleType(segment.segmentType) ? 'Invisible' : 'Interior';
  const typeBadgeVariant = isExteriorType(segment.segmentType) ? 'default' as const : 'outline' as const;

  const targetWallId = (isInvisibleType(segment.segmentType) && neighborWall) ? neighborWall.id : wall.id;
  const canAddOpenings = !targetWallId.startsWith('temp-') && !isInvisibleType(segment.segmentType);

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={prevWall} disabled={allSegments.length <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{room.name} — {WALL_LABELS[wall.wallIndex]} ({totalSegments > 1 ? `${wall.wallIndex}${segmentIndex + 1}` : wall.wallIndex})</span>
            {totalSegments > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                Segmento {segmentIndex + 1}/{totalSegments}
              </Badge>
            )}
            <Badge variant={typeBadgeVariant} className="text-[10px]">{typeLabel}</Badge>
            {wallName && <Badge variant="secondary" className="text-[10px] font-bold">{wallName}</Badge>}
          </div>
          {isInvisibleType(segment.segmentType) && neighborRoom && (
            <span className="text-[10px] text-muted-foreground">
              Compartida con <strong>{neighborRoom.name}</strong> — los objetos son de la pared vecina
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            ({currentIndex + 1}/{allSegments.length})
            {selectedOpeningId && <span className="ml-2 text-primary font-medium">← → mover • Shift+← → 5cm</span>}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={nextWall} disabled={allSegments.length <= 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Elevation SVG */}
      <Card>
        <CardContent className="p-2 overflow-auto">
          <svg
            ref={svgRef}
            width={canvasWidth}
            height={canvasHeight}
            className="mx-auto"
            tabIndex={0}
            style={{ cursor: dragState ? 'grabbing' : 'default', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleSvgClick}
          >
            {/* Ground line */}
            <line
              x1={wallX - 10} y1={wallY + wallH}
              x2={wallX + wallW + 10} y2={wallY + wallH}
              stroke="hsl(25, 60%, 40%)" strokeWidth={2} data-ground="true"
            />
            {Array.from({ length: Math.ceil((wallW + 20) / 8) }, (_, i) => (
              <line key={`gh-${i}`}
                x1={wallX - 10 + i * 8} y1={wallY + wallH + 2}
                x2={wallX - 10 + i * 8 - 5} y2={wallY + wallH + 7}
                stroke="hsl(25, 60%, 40%)" strokeWidth={0.5} opacity={0.6}
              />
            ))}

            {/* Wall rectangle */}
            <rect
              x={wallX} y={wallY} width={wallW} height={wallH}
              fill={isInvisibleType(segment.segmentType) ? 'hsl(0, 0%, 95%)' : isExteriorType(segment.segmentType) ? 'hsl(30, 30%, 92%)' : 'hsl(220, 14%, 95%)'}
              stroke={isInvisibleType(segment.segmentType) ? 'hsl(0, 0%, 80%)' : 'hsl(220, 9%, 46%)'}
              strokeWidth={isExteriorType(segment.segmentType) ? 2 : 1}
              strokeDasharray={isInvisibleType(segment.segmentType) ? '6,3' : undefined}
              data-wall-bg="true"
            />

            {/* Dimension: width (bottom) */}
            <line
              x1={wallX} y1={wallY + wallH + 15}
              x2={wallX + wallW} y2={wallY + wallH + 15}
              stroke="hsl(25, 95%, 45%)" strokeWidth={0.8}
              markerStart="url(#elevDimStart)" markerEnd="url(#elevDimEnd)"
            />
            <text
              x={wallX + wallW / 2} y={wallY + wallH + 28}
              textAnchor="middle" fontSize={10} fill="hsl(25, 95%, 45%)" fontWeight={600}
            >
              {segmentLength.toFixed(2)}m
            </text>

            {/* Dimension: height (left) */}
            <line
              x1={wallX - 15} y1={wallY}
              x2={wallX - 15} y2={wallY + wallH}
              stroke="hsl(25, 95%, 45%)" strokeWidth={0.8}
              markerStart="url(#elevDimStart)" markerEnd="url(#elevDimEnd)"
            />
            <text
              x={wallX - 20} y={wallY + wallH / 2}
              textAnchor="middle" fontSize={10} fill="hsl(25, 95%, 45%)" fontWeight={600}
              transform={`rotate(-90, ${wallX - 20}, ${wallY + wallH / 2})`}
            >
              {wallHeight.toFixed(2)}m
            </text>

            {/* Openings */}
            {displayOpenings.map((op) => {
              let opCenterInSegment: number;
              if (op.isNeighbor) {
                const neighborIsHoriz = segment.neighborWallIndex === 1 || segment.neighborWallIndex === 3;
                const neighborFullLen = neighborRoom ? (neighborIsHoriz ? neighborRoom.width : neighborRoom.length) : segmentLength;
                const opAbsCenter = neighborRoom
                  ? (neighborIsHoriz ? neighborRoom.posX : neighborRoom.posY) + op.positionX * neighborFullLen
                  : op.positionX * segmentLength;
                const segAbsStart = isHoriz ? room.posX + segment.startMeters : room.posY + segment.startMeters;
                opCenterInSegment = (opAbsCenter - segAbsStart) / segmentLength;
              } else {
                const opMeters = op.positionX * fullWallLen;
                opCenterInSegment = (opMeters - segment.startMeters) / segmentLength;
              }
              opCenterInSegment = Math.max(0.05, Math.min(0.95, opCenterInSegment));

              const opWidthPx = op.width * SCALE;
              const opHeightPx = op.height * SCALE;
              const sillH = getOpeningSillHeight(op);
              const opX = wallX + opCenterInSegment * wallW - opWidthPx / 2;
              const opY = wallY + wallH - opHeightPx - sillH * SCALE;
              const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'hueco_paso' || op.openingType === 'ventana_balconera';
              const isSelected = selectedOpeningId === op.id;

              return (
                <g key={op.id}>
                  {/* Selection highlight */}
                  {isSelected && (
                    <rect
                      x={opX - 3} y={opY - 3} width={opWidthPx + 6} height={opHeightPx + 6}
                      fill="none" stroke="hsl(var(--primary))" strokeWidth={2}
                      strokeDasharray="4,2" rx={3}
                    />
                  )}

                  {/* Main opening body - click to select, drag to move */}
                  <rect
                    x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                    fill={op.isNeighbor ? 'hsl(280, 60%, 95%)' : isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                    stroke={isSelected ? 'hsl(var(--primary))' : op.isNeighbor ? 'hsl(280, 60%, 50%)' : isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                    strokeWidth={isSelected ? 2 : 1.5}
                    rx={2}
                    style={{ cursor: dragState?.mode === 'move' ? 'grabbing' : 'grab' }}
                    onMouseDown={e => handleOpeningMouseDown(e, op, 'move')}
                  />

                  {/* Window cross lines */}
                  {!isDoor && (
                    <>
                      <line x1={opX} y1={opY + opHeightPx / 2} x2={opX + opWidthPx} y2={opY + opHeightPx / 2}
                        stroke={op.isNeighbor ? 'hsl(280, 60%, 70%)' : 'hsl(210, 80%, 70%)'} strokeWidth={0.8} pointerEvents="none" />
                      <line x1={opX + opWidthPx / 2} y1={opY} x2={opX + opWidthPx / 2} y2={opY + opHeightPx}
                        stroke={op.isNeighbor ? 'hsl(280, 60%, 70%)' : 'hsl(210, 80%, 70%)'} strokeWidth={0.8} pointerEvents="none" />
                    </>
                  )}

                  {/* Door handle */}
                  {isDoor && (
                    <circle cx={opX + opWidthPx * 0.8} cy={opY + opHeightPx * 0.55} r={2.5}
                      fill={op.isNeighbor ? 'hsl(280, 60%, 50%)' : 'hsl(30, 80%, 45%)'} pointerEvents="none" />
                  )}

                  {/* Dimension labels */}
                  <text x={opX + opWidthPx / 2} y={opY - 4} textAnchor="middle"
                    fontSize={8} fill="hsl(var(--foreground))" fontWeight={500} pointerEvents="none">
                    {op.width.toFixed(2)}m
                  </text>
                  <text x={opX + opWidthPx + 4} y={opY + opHeightPx / 2} textAnchor="start"
                    fontSize={8} fill="hsl(var(--foreground))" fontWeight={500}
                    dominantBaseline="middle" pointerEvents="none">
                    {op.height.toFixed(2)}m
                  </text>
                  <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 4} textAnchor="middle"
                    fontSize={7} fill="hsl(var(--muted-foreground))" dominantBaseline="middle" pointerEvents="none">
                    {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                  </text>
                  {op.isNeighbor && (
                    <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 14} textAnchor="middle"
                      fontSize={6} fill="hsl(280, 60%, 50%)" dominantBaseline="middle" fontStyle="italic" pointerEvents="none">
                      (de {neighborRoom?.name})
                    </text>
                  )}

                  {/* Resize handles - only when selected */}
                  {isSelected && (
                    <>
                      {/* Left resize handle */}
                      <rect
                        x={opX - HANDLE_WIDTH / 2} y={opY + opHeightPx * 0.2}
                        width={HANDLE_WIDTH} height={opHeightPx * 0.6}
                        fill="hsl(var(--primary))" rx={2} opacity={0.8}
                        style={{ cursor: 'ew-resize' }}
                        onMouseDown={e => handleOpeningMouseDown(e, op, 'resize-left')}
                      />
                      {/* Right resize handle */}
                      <rect
                        x={opX + opWidthPx - HANDLE_WIDTH / 2} y={opY + opHeightPx * 0.2}
                        width={HANDLE_WIDTH} height={opHeightPx * 0.6}
                        fill="hsl(var(--primary))" rx={2} opacity={0.8}
                        style={{ cursor: 'ew-resize' }}
                        onMouseDown={e => handleOpeningMouseDown(e, op, 'resize-right')}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Arrow markers */}
            <defs>
              <marker id="elevDimStart" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto">
                <path d="M5,0 L0,2.5 L5,5" fill="none" stroke="hsl(25, 95%, 45%)" strokeWidth="0.5" />
              </marker>
              <marker id="elevDimEnd" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="hsl(25, 95%, 45%)" strokeWidth="0.5" />
              </marker>
            </defs>
          </svg>
        </CardContent>
      </Card>

      {/* Add openings toolbar */}
      {canAddOpenings && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Añadir:</span>
          {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
            <Button key={key} variant="outline" size="sm" className="text-[10px] h-6"
              onClick={() => onAddOpening(targetWallId, key, preset.width, preset.height, preset.sillHeight)}
              disabled={saving}>
              <Plus className="h-3 w-3 mr-0.5" />
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {/* Opening list */}
      {displayOpenings.length > 0 && (
        <div className="space-y-1">
          {displayOpenings.map(op => (
            <div key={op.id}
              className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer transition-colors ${
                selectedOpeningId === op.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/30 hover:bg-muted/50'
              }`}
              onClick={() => setSelectedOpeningId(selectedOpeningId === op.id ? null : op.id)}
            >
              <DoorOpen className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select value={op.openingType}
                onValueChange={v => onUpdateOpening(op.id, { openingType: v })}>
                <SelectTrigger className="h-5 text-[10px] w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OPENING_PRESETS).map(([k, p]) => (
                    <SelectItem key={k} value={k} className="text-xs">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">
                {op.width.toFixed(2)}×{op.height.toFixed(2)}m
              </span>
              {op.isNeighbor && (
                <Badge variant="outline" className="text-[9px] h-4">de {neighborRoom?.name}</Badge>
              )}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive ml-auto"
                onClick={(e) => { e.stopPropagation(); onDeleteOpening(op.id); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {displayOpenings.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sin aberturas en este segmento
        </p>
      )}
    </div>
  );
}