import { useState, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Trash2, DoorOpen, Maximize2 } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, detectSharedWalls, autoClassifyWalls, generateExternalWallNames } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData } from '@/lib/floor-plan-calculations';

interface WallElevationViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  saving: boolean;
}

interface ElevationWallInfo {
  room: RoomData;
  wall: WallData;
  wallLength: number;
  wallHeight: number;
  wallType: 'externa' | 'interna' | 'invisible';
  wallName?: string;
  // For invisible walls: the neighbor wall whose openings to show
  neighborRoom?: RoomData;
  neighborWall?: WallData;
  neighborWallLength?: number;
}

const SCALE = 120; // pixels per meter
const PADDING = 40;
const DIM_OFFSET = 25;
const MIN_CANVAS_HEIGHT = 200;

function getWallLength(room: RoomData, wallIndex: number): number {
  return (wallIndex === 1 || wallIndex === 3) ? room.width : room.length;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

// Get Y position from floor for the opening (doors at 0, windows typically at ~0.9m)
function getOpeningBaseY(op: OpeningData): number {
  if (op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera') {
    return 0;
  }
  // Windows: position from floor = wallHeight - windowHeight - some offset (standard ~0.9m from floor)
  return 0.9;
}

export function WallElevationView({
  plan, rooms, onUpdateOpening, onAddOpening, onDeleteOpening, saving,
}: WallElevationViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<{
    openingId: string;
    startX: number;
    startPosX: number;
    wallLength: number;
    opWidth: number;
    isNeighbor: boolean;
  } | null>(null);

  const sharedWallMap = useMemo(() => detectSharedWalls(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Build flat list of all walls with their info
  const allWalls: ElevationWallInfo[] = useMemo(() => {
    const result: ElevationWallInfo[] = [];
    rooms.forEach(room => {
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const autoType = wallClassification.get(key) || wall.wallType;
        const wallLength = getWallLength(room, wall.wallIndex);
        const wallHeight = getWallHeight(wall, room, plan);
        const wallName = externalWallNames.get(key);

        let neighborRoom: RoomData | undefined;
        let neighborWall: WallData | undefined;
        let neighborWallLength: number | undefined;

        if (autoType === 'invisible') {
          const neighborInfo = sharedWallMap.get(key);
          if (neighborInfo) {
            neighborRoom = rooms.find(r => r.id === neighborInfo.neighborRoomId);
            if (neighborRoom) {
              neighborWall = neighborRoom.walls.find(w => w.wallIndex === neighborInfo.neighborWallIndex);
              neighborWallLength = getWallLength(neighborRoom, neighborInfo.neighborWallIndex);
            }
          }
        }

        result.push({
          room, wall, wallLength, wallHeight,
          wallType: autoType as 'externa' | 'interna' | 'invisible',
          wallName,
          neighborRoom, neighborWall, neighborWallLength,
        });
      });
    });
    return result;
  }, [rooms, plan, wallClassification, externalWallNames, sharedWallMap]);

  const current = allWalls[currentIndex];
  if (!current || allWalls.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-muted/30 rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">No hay paredes para mostrar alzados</p>
      </div>
    );
  }

  const { room, wall, wallLength, wallHeight, wallType, wallName, neighborRoom, neighborWall, neighborWallLength } = current;

  // The openings to display: own openings + neighbor openings for invisible walls
  const displayOpenings: Array<OpeningData & { isNeighbor: boolean; effectiveWallLength: number }> = [];

  if (wallType === 'invisible' && neighborWall) {
    // Show neighbor wall's openings
    neighborWall.openings.forEach(op => {
      displayOpenings.push({ ...op, isNeighbor: true, effectiveWallLength: neighborWallLength || wallLength });
    });
  } else {
    wall.openings.forEach(op => {
      displayOpenings.push({ ...op, isNeighbor: false, effectiveWallLength: wallLength });
    });
  }

  const canvasWidth = wallLength * SCALE + PADDING * 2 + DIM_OFFSET;
  const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, wallHeight * SCALE + PADDING * 2 + DIM_OFFSET);

  const wallX = PADDING + DIM_OFFSET;
  const wallY = PADDING;
  const wallW = wallLength * SCALE;
  const wallH = wallHeight * SCALE;

  const svgPoint = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return clientX - rect.left;
  };

  const handleOpeningMouseDown = (e: React.MouseEvent, op: OpeningData & { isNeighbor: boolean; effectiveWallLength: number }) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      openingId: op.id,
      startX: svgPoint(e.clientX),
      startPosX: op.positionX,
      wallLength: op.effectiveWallLength,
      opWidth: op.width,
      isNeighbor: op.isNeighbor,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const currentX = svgPoint(e.clientX);
    const deltaPixels = currentX - dragState.startX;
    const deltaMeters = deltaPixels / SCALE;
    const deltaFraction = deltaMeters / dragState.wallLength;
    let newPosX = dragState.startPosX + deltaFraction;

    // Clamp so opening stays within wall
    const halfWidthFraction = (dragState.opWidth / 2) / dragState.wallLength;
    newPosX = Math.max(halfWidthFraction, Math.min(1 - halfWidthFraction, newPosX));

    onUpdateOpening(dragState.openingId, { positionX: newPosX });
  };

  const handleMouseUp = () => {
    setDragState(null);
  };

  const prevWall = () => setCurrentIndex(i => (i - 1 + allWalls.length) % allWalls.length);
  const nextWall = () => setCurrentIndex(i => (i + 1) % allWalls.length);

  const typeLabel = wallType === 'externa' ? 'Externa' : wallType === 'invisible' ? 'Invisible' : 'Interna';
  const typeBadgeVariant = wallType === 'externa' ? 'default' as const : 'outline' as const;

  // Determine which wall to add openings to
  const targetWallId = (wallType === 'invisible' && neighborWall) ? neighborWall.id : wall.id;
  const canAddOpenings = !targetWallId.startsWith('temp-');

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={prevWall} disabled={allWalls.length <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{room.name} — {WALL_LABELS[wall.wallIndex]}</span>
          <Badge variant={typeBadgeVariant} className="text-[10px]">{typeLabel}</Badge>
          {wallName && <Badge variant="secondary" className="text-[10px] font-bold">{wallName}</Badge>}
          {wallType === 'invisible' && neighborRoom && (
            <Badge variant="outline" className="text-[10px]">compartida con {neighborRoom.name}</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            ({currentIndex + 1}/{allWalls.length})
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={nextWall} disabled={allWalls.length <= 1}>
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
            style={{ cursor: dragState ? 'grabbing' : 'default', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Ground line */}
            <line
              x1={wallX - 10} y1={wallY + wallH}
              x2={wallX + wallW + 10} y2={wallY + wallH}
              stroke="hsl(25, 60%, 40%)" strokeWidth={2}
            />
            {/* Ground hatch */}
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
              fill={wallType === 'invisible' ? 'hsl(0, 0%, 95%)' : wallType === 'externa' ? 'hsl(30, 30%, 92%)' : 'hsl(220, 14%, 95%)'}
              stroke={wallType === 'invisible' ? 'hsl(0, 0%, 80%)' : 'hsl(220, 9%, 46%)'}
              strokeWidth={wallType === 'externa' ? 2 : 1}
              strokeDasharray={wallType === 'invisible' ? '6,3' : undefined}
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
              {wallLength.toFixed(2)}m
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
              const opWidthPx = op.width * SCALE;
              const opHeightPx = op.height * SCALE;
              const baseY = getOpeningBaseY(op);
              const opX = wallX + op.positionX * wallW - opWidthPx / 2;
              const opY = wallY + wallH - opHeightPx - baseY * SCALE;
              const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';

              return (
                <g key={op.id}
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => handleOpeningMouseDown(e, op)}
                >
                  {/* Opening rectangle */}
                  <rect
                    x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                    fill={op.isNeighbor ? 'hsl(280, 60%, 95%)' : isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                    stroke={op.isNeighbor ? 'hsl(280, 60%, 50%)' : isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                    strokeWidth={1.5}
                    rx={2}
                  />
                  {/* Cross for windows */}
                  {!isDoor && (
                    <>
                      <line x1={opX} y1={opY + opHeightPx / 2} x2={opX + opWidthPx} y2={opY + opHeightPx / 2}
                        stroke={op.isNeighbor ? 'hsl(280, 60%, 70%)' : 'hsl(210, 80%, 70%)'} strokeWidth={0.8} />
                      <line x1={opX + opWidthPx / 2} y1={opY} x2={opX + opWidthPx / 2} y2={opY + opHeightPx}
                        stroke={op.isNeighbor ? 'hsl(280, 60%, 70%)' : 'hsl(210, 80%, 70%)'} strokeWidth={0.8} />
                    </>
                  )}
                  {/* Door handle */}
                  {isDoor && (
                    <circle cx={opX + opWidthPx * 0.8} cy={opY + opHeightPx * 0.55} r={2.5}
                      fill={op.isNeighbor ? 'hsl(280, 60%, 50%)' : 'hsl(30, 80%, 45%)'} />
                  )}
                  {/* Dimension: width */}
                  <text x={opX + opWidthPx / 2} y={opY - 4} textAnchor="middle"
                    fontSize={8} fill="hsl(var(--foreground))" fontWeight={500}>
                    {op.width.toFixed(2)}m
                  </text>
                  {/* Dimension: height */}
                  <text x={opX + opWidthPx + 4} y={opY + opHeightPx / 2} textAnchor="start"
                    fontSize={8} fill="hsl(var(--foreground))" fontWeight={500}
                    dominantBaseline="middle">
                    {op.height.toFixed(2)}m
                  </text>
                  {/* Label */}
                  <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 4} textAnchor="middle"
                    fontSize={7} fill="hsl(var(--muted-foreground))" dominantBaseline="middle">
                    {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                  </text>
                  {op.isNeighbor && (
                    <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 14} textAnchor="middle"
                      fontSize={6} fill="hsl(280, 60%, 50%)" dominantBaseline="middle" fontStyle="italic">
                      (de {neighborRoom?.name})
                    </text>
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
              onClick={() => onAddOpening(targetWallId, key, preset.width, preset.height)}
              disabled={saving}>
              <Plus className="h-3 w-3 mr-0.5" />
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {/* Opening list for editing/deleting */}
      {displayOpenings.length > 0 && (
        <div className="space-y-1">
          {displayOpenings.map(op => (
            <div key={op.id} className="flex items-center gap-2 text-xs bg-muted/30 p-1.5 rounded">
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
              <span className="text-muted-foreground">
                pos: {(op.positionX * 100).toFixed(0)}%
              </span>
              {op.isNeighbor && (
                <Badge variant="outline" className="text-[9px] h-4">de {neighborRoom?.name}</Badge>
              )}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive ml-auto"
                onClick={() => onDeleteOpening(op.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {wallType === 'invisible' && !neighborWall && (
        <p className="text-xs text-muted-foreground italic">
          Esta pared invisible no tiene vecina detectada. Las aberturas se muestran desde la pared visible correspondiente.
        </p>
      )}

      {displayOpenings.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Arrastra los objetos en el alzado para reposicionarlos. Sin aberturas en esta pared.
        </p>
      )}
    </div>
  );
}
