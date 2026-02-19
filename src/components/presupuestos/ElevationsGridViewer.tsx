import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Box, Layers, ArrowUpDown } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, computeWallSegments, autoClassifyWalls, generateExternalWallNames, isExteriorType, isInvisibleType } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment, FloorLevel, WallType } from '@/lib/floor-plan-calculations';

interface ElevationsGridViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors?: FloorLevel[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number }) => Promise<void>;
  saving: boolean;
}

type SurfaceCategory = 'cimentacion' | 'suelo' | 'techo' | 'pared' | 'volumen' | 'tejado';

interface ElevationCard {
  id: string;
  label: string;
  sublabel?: string;
  category: SurfaceCategory;
  width: number;
  height: number;
  room?: RoomData;
  wall?: WallData;
  segment?: WallSegment;
  segmentIndex?: number;
  openings: OpeningData[];
  wallId?: string;
  canAddOpenings: boolean;
  fill: string;
  stroke: string;
  badgeLabel?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
  isInvisible?: boolean;   // wall is invisible (interior_invisible)
  surfaceArea?: number;
  volume?: number;
  roomHeight?: number;
}

// Group of 6 surfaces for a single room
interface RoomElevationGroup {
  room: RoomData;
  cards: ElevationCard[];
}

const CARD_SCALE = 60;
const CARD_PADDING = 20;
const MAX_CARD_WIDTH = 400;

function getOpeningBaseY(op: OpeningData): number {
  if (op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera') {
    return 0;
  }
  return 0.9;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

export function ElevationsGridViewer({
  plan, rooms, floors, onUpdateOpening, onAddOpening, onDeleteOpening, onUpdateWall, saving,
}: ElevationsGridViewerProps) {
  const [selectedOpening, setSelectedOpening] = useState<OpeningData | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // Card that was double-clicked → opens edit dialog for its openings
  const [editCard, setEditCard] = useState<ElevationCard | null>(null);
  const [editCardDialogOpen, setEditCardDialogOpen] = useState(false);

  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Sync editCard wall data when rooms refresh (e.g. after saving wall type)
  // This ensures the WallEditDialog always shows the current wall type
  // Using a simple inline effect approach that runs when rooms change
  const syncedEditCardWallType = editCard?.wall
    ? rooms.find(r => r.id === editCard.room?.id)?.walls.find(w => w.id === editCard.wall?.id)?.wallType ?? editCard.wall.wallType
    : undefined;

  // Build per-room elevation cards – NO group aggregate cards; each room stands alone
  const roomGroups: RoomElevationGroup[] = useMemo(() => {
    return rooms.map(room => {
      const roomH = room.height || plan.defaultHeight;
      const floorArea = room.width * room.length;
      const cards: ElevationCard[] = [];

      // Suelo
      if (room.hasFloor !== false) {
        cards.push({
          id: `suelo-${room.id}`,
          label: 'Suelo',
          sublabel: room.name,
          category: 'suelo',
          width: room.width,
          height: room.length,
          room,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(142, 40%, 90%)',
          stroke: 'hsl(142, 50%, 40%)',
          badgeLabel: `${floorArea.toFixed(1)} m²`,
          badgeVariant: 'secondary',
          surfaceArea: floorArea,
        });
      }

      // Techo
      if (room.hasCeiling !== false || room.hasRoof) {
        cards.push({
          id: `techo-${room.id}`,
          label: room.hasCeiling !== false ? 'Techo' : 'Techo (cubierta)',
          sublabel: room.name,
          category: 'techo',
          width: room.width,
          height: room.length,
          room,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(200, 30%, 92%)',
          stroke: 'hsl(200, 40%, 50%)',
          badgeLabel: `${floorArea.toFixed(1)} m²`,
          badgeVariant: 'outline',
          surfaceArea: floorArea,
        });
      }

      // Volumen
      cards.push({
        id: `volumen-${room.id}`,
        label: 'Volumen',
        sublabel: room.name,
        category: 'volumen',
        width: room.width,
        height: roomH,
        room,
        openings: [],
        canAddOpenings: false,
        fill: 'hsl(280, 20%, 94%)',
        stroke: 'hsl(280, 30%, 55%)',
        badgeLabel: `${(floorArea * roomH).toFixed(1)} m³`,
        badgeVariant: 'outline',
        surfaceArea: floorArea,
        volume: floorArea * roomH,
        roomHeight: roomH,
      });

      // 4 Walls (always all 4, including invisible ones)
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        const wallHeight = getWallHeight(wall, room, plan);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const fullWallLen = isHoriz ? room.width : room.length;

        if (segments.length === 0) {
          // No computed segments → render a simple wall card (may be invisible)
          const invisible = isInvisibleType(wall.wallType as string);
          const isExternal = isExteriorType(wall.wallType as string);
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-') && !invisible;
          cards.push({
            id: `wall-${room.id}-${wall.wallIndex}-noseg`,
            label: WALL_LABELS[wall.wallIndex],
            sublabel: room.name,
            category: 'pared',
            width: fullWallLen,
            height: wallHeight,
            room,
            wall,
            openings: wall.openings,
            wallId: wall.id,
            canAddOpenings: canAdd,
            isInvisible: invisible,
            fill: invisible ? 'hsl(0, 0%, 96%)' : isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
            stroke: invisible ? 'hsl(0, 0%, 70%)' : isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
            badgeLabel: invisible ? 'Invisible' : isExternal ? (wallName ? `Ext. ${wallName}` : 'Externa') : 'Interna',
            badgeVariant: invisible ? 'outline' : isExternal ? 'default' : 'outline',
            surfaceArea: invisible ? 0 : fullWallLen * wallHeight,
          });
          return;
        }

        segments.forEach((seg, si) => {
          const segLen = seg.endMeters - seg.startMeters;
          // Use wall.wallType (manual DB type) for VISUAL display; seg.segmentType is for calculations
          // This ensures edits to wall type are always reflected in the Alzados view
          const displayType = wall.wallType as string;
          const invisible = isInvisibleType(displayType);
          const ownOpenings = wall.openings.filter(op => {
            return op.positionX >= seg.startFraction - 0.01 && op.positionX <= seg.endFraction + 0.01;
          });

          const isExternal = isExteriorType(displayType);
          const visibleSegCount = segments.filter(s => !isInvisibleType(s.segmentType)).length;
          const wallLabel = visibleSegCount > 1 ? `${WALL_LABELS[wall.wallIndex]} ${si + 1}` : WALL_LABELS[wall.wallIndex];
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-') && !invisible;

          let badgeLabel: string;
          if (invisible) {
            badgeLabel = 'Invisible';
          } else if (displayType === 'exterior_compartida') {
            badgeLabel = wallName ? `Ext. compartida ${wallName}` : 'Ext. compartida';
          } else if (displayType === 'interior_compartida') {
            badgeLabel = 'Int. compartida';
          } else if (isExternal) {
            badgeLabel = wallName ? `Ext. ${wallName}` : 'Externa';
          } else {
            badgeLabel = 'Interna';
          }

          cards.push({
            id: `wall-${room.id}-${wall.wallIndex}-${si}`,
            label: wallLabel,
            sublabel: room.name,
            category: 'pared',
            width: segLen,
            height: wallHeight,
            room,
            wall,
            segment: seg,
            segmentIndex: si,
            openings: ownOpenings,
            wallId: wall.id,
            canAddOpenings: canAdd,
            isInvisible: invisible,
            fill: invisible ? 'hsl(0, 0%, 96%)' : isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
            stroke: invisible ? 'hsl(0, 0%, 70%)' : isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
            badgeLabel,
            badgeVariant: invisible ? 'outline' : isExternal ? 'default' : 'outline',
            surfaceArea: invisible ? 0 : segLen * wallHeight,
          });
        });
      });

      return { room, cards };
    });
  }, [rooms, plan, wallSegmentsMap, wallClassification, externalWallNames]);

  // Group by floor
  const floorGroups: Array<{ floorId: string; floorName: string; roomGroups: RoomElevationGroup[] }> = useMemo(() => {
    const sortedFloors = floors ? [...floors].sort((a, b) => a.orderIndex - b.orderIndex) : [];
    if (sortedFloors.length === 0) {
      return [{ floorId: 'all', floorName: '', roomGroups }];
    }
    const result: Array<{ floorId: string; floorName: string; roomGroups: RoomElevationGroup[] }> = [];
    sortedFloors.forEach(floor => {
      const floorRooms = roomGroups.filter(rg => rg.room.floorId === floor.id);
      if (floorRooms.length > 0) {
        result.push({ floorId: floor.id, floorName: floor.name, roomGroups: floorRooms });
      }
    });
    const assignedIds = new Set(rooms.filter(r => r.floorId && sortedFloors.some(f => f.id === r.floorId)).map(r => r.id));
    const unassigned = roomGroups.filter(rg => !assignedIds.has(rg.room.id));
    if (unassigned.length > 0) {
      result.push({ floorId: 'unassigned', floorName: 'Sin nivel asignado', roomGroups: unassigned });
    }
    return result;
  }, [roomGroups, floors, rooms]);

  const handleOpeningClick = useCallback((op: OpeningData) => {
    setSelectedOpening(op);
    setEditDialogOpen(true);
  }, []);

  const handleSaveOpening = useCallback(async (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => {
    if (!selectedOpening) return;
    await onUpdateOpening(selectedOpening.id, data);
    setSelectedOpening(prev => prev ? { ...prev, ...data } as OpeningData : null);
  }, [selectedOpening, onUpdateOpening]);

  // Double-click on a card → edit card openings
  const handleCardDoubleClick = useCallback((card: ElevationCard) => {
    if (card.category !== 'pared') return;
    setEditCard(card);
    setEditCardDialogOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      {floorGroups.map(({ floorId, floorName, roomGroups: floorRoomGroups }) => {
        const hasFloorHeader = floorName !== '';
        const content = (
          <div className="space-y-3">
            {floorRoomGroups.map(({ room, cards }) => {
              const wallCount = cards.filter(c => c.category === 'pared').length;
              const groupLabel = room.groupName
                ? <Badge variant="secondary" className="text-[9px] h-4 ml-1">Grupo: {room.groupName}</Badge>
                : null;
              return (
                <Collapsible key={room.id} defaultOpen={false}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <h4 className="text-sm font-semibold text-muted-foreground">{room.name}</h4>
                    {groupLabel}
                    <Badge variant="outline" className="text-[10px] h-4">{cards.length} sup. / {wallCount} paredes</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2 ml-4">
                      {cards.map(card => (
                        <ElevationCardView
                          key={card.id}
                          card={card}
                          onOpeningClick={handleOpeningClick}
                          onAddOpening={onAddOpening}
                          onCardDoubleClick={handleCardDoubleClick}
                          saving={saving}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        );

        if (hasFloorHeader) {
          return (
            <Collapsible key={floorId} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1.5 transition-colors border-b border-border/50 mb-2">
                <ChevronRight className="h-4 w-4 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                <h3 className="text-sm font-bold text-foreground">{floorName}</h3>
                <Badge variant="secondary" className="text-[10px] h-4">{floorRoomGroups.length} espacios</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-2">{content}</CollapsibleContent>
            </Collapsible>
          );
        }
        return <div key={floorId}>{content}</div>;
      })}

      {/* Opening edit dialog (single opening) */}
      {selectedOpening && (
        <OpeningEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          opening={selectedOpening}
          onSave={handleSaveOpening}
          onDelete={async () => {
            await onDeleteOpening(selectedOpening.id);
            setEditDialogOpen(false);
            setSelectedOpening(null);
          }}
          saving={saving}
        />
      )}

      {/* Wall card edit dialog (double-click) */}
      {editCard && (
        <WallEditDialog
          open={editCardDialogOpen}
          onOpenChange={setEditCardDialogOpen}
          card={editCard}
          currentWallType={syncedEditCardWallType}
          liveRooms={rooms}
          onAddOpening={onAddOpening}
          onUpdateOpening={onUpdateOpening}
          onDeleteOpening={onDeleteOpening}
          onUpdateWall={onUpdateWall}
          saving={saving}
        />
      )}
    </div>
  );
}

// Individual elevation card
function ElevationCardView({ card, onOpeningClick, onAddOpening, onCardDoubleClick, saving }: {
  card: ElevationCard;
  onOpeningClick: (op: OpeningData) => void;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onCardDoubleClick: (card: ElevationCard) => void;
  saving: boolean;
}) {
  const scale = Math.min(CARD_SCALE, (MAX_CARD_WIDTH - CARD_PADDING * 2 - 30) / card.width);
  const svgW = card.width * scale + CARD_PADDING * 2 + 30;
  const svgH = card.height * scale + CARD_PADDING * 2 + 30;
  const rectX = CARD_PADDING + 20;
  const rectY = CARD_PADDING;
  const rectW = card.width * scale;
  const rectH = card.height * scale;
  const area = (card.surfaceArea ?? card.width * card.height).toFixed(2);

  const categoryIcon = card.category === 'suelo' ? <Layers className="h-3 w-3" />
    : card.category === 'techo' ? <ArrowUpDown className="h-3 w-3" />
    : card.category === 'volumen' ? <Box className="h-3 w-3" />
    : null;

  const isWall = card.category === 'pared';

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      title={isWall ? 'Doble clic para editar huecos' : undefined}
      onDoubleClick={isWall ? () => onCardDoubleClick(card) : undefined}
    >
      <CardHeader className="py-2 px-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            {categoryIcon}
            <div>
              <CardTitle className="text-xs font-semibold truncate">{card.label}</CardTitle>
              {card.sublabel && (
                <p className="text-[10px] text-muted-foreground truncate">{card.sublabel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {card.badgeLabel && (
              <Badge variant={card.badgeVariant || 'secondary'} className="text-[9px] h-4">
                {card.badgeLabel}
              </Badge>
            )}
            {!card.isInvisible && (
              <Badge variant="outline" className="text-[9px] h-4">{area}m²</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {card.category === 'volumen' ? (
          <div className="flex flex-col items-center justify-center py-4 gap-1 text-center">
            <Box className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-lg font-bold text-foreground">{card.volume?.toFixed(2)} m³</p>
            <p className="text-[10px] text-muted-foreground">
              {card.width.toFixed(2)} × {(card.room?.length || 0).toFixed(2)} × {card.roomHeight?.toFixed(2)} m
            </p>
          </div>
        ) : card.isInvisible ? (
          /* Invisible wall — show X overlay */
          <div className="relative flex items-center justify-center" style={{ minHeight: 80 }}>
            <svg
              width="100%"
              viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: 160, opacity: 0.35 }}
            >
              <rect x={rectX} y={rectY} width={rectW} height={rectH}
                fill="hsl(0, 0%, 94%)" stroke="hsl(0, 0%, 60%)"
                strokeWidth={1} rx={1} strokeDasharray="4 3" />
              {/* Big X */}
              <line x1={rectX + 4} y1={rectY + 4} x2={rectX + rectW - 4} y2={rectY + rectH - 4}
                stroke="hsl(0, 0%, 50%)" strokeWidth={1.5} />
              <line x1={rectX + rectW - 4} y1={rectY + 4} x2={rectX + 4} y2={rectY + rectH - 4}
                stroke="hsl(0, 0%, 50%)" strokeWidth={1.5} />
              <text x={rectX + rectW / 2} y={rectY + rectH / 2 + 3} textAnchor="middle"
                fontSize={9} fill="hsl(0, 0%, 45%)" fontStyle="italic">
                Invisible
              </text>
            </svg>
          </div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="mx-auto"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: '180px' }}
          >
            {/* Ground line for walls */}
            {isWall && (
              <>
                <line
                  x1={rectX - 5} y1={rectY + rectH}
                  x2={rectX + rectW + 5} y2={rectY + rectH}
                  stroke="hsl(25, 60%, 40%)" strokeWidth={1.5}
                />
                {Array.from({ length: Math.ceil((rectW + 10) / 6) }, (_, i) => (
                  <line key={`gh-${i}`}
                    x1={rectX - 5 + i * 6} y1={rectY + rectH + 1.5}
                    x2={rectX - 5 + i * 6 - 4} y2={rectY + rectH + 5}
                    stroke="hsl(25, 60%, 40%)" strokeWidth={0.4} opacity={0.5}
                  />
                ))}
                {/* Double-click hint */}
                <text x={rectX + rectW / 2} y={rectY - 5} textAnchor="middle"
                  fontSize={6.5} fill="hsl(var(--muted-foreground))" opacity={0.6}>
                  doble clic para editar huecos
                </text>
              </>
            )}

            {/* Main rectangle */}
            <rect
              x={rectX} y={rectY} width={rectW} height={rectH}
              fill={card.fill} stroke={card.stroke}
              strokeWidth={1.5} rx={1}
            />

            {/* Width dimension (bottom) */}
            <line x1={rectX} y1={rectY + rectH + 12} x2={rectX + rectW} y2={rectY + rectH + 12}
              stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
            <line x1={rectX} y1={rectY + rectH + 8} x2={rectX} y2={rectY + rectH + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
            <line x1={rectX + rectW} y1={rectY + rectH + 8} x2={rectX + rectW} y2={rectY + rectH + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
            <text x={rectX + rectW / 2} y={rectY + rectH + 24} textAnchor="middle" fontSize={8} fill="hsl(25, 95%, 45%)" fontWeight={600}>
              {card.width.toFixed(2)}m
            </text>

            {/* Height dimension (left) */}
            <line x1={rectX - 12} y1={rectY} x2={rectX - 12} y2={rectY + rectH}
              stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
            <line x1={rectX - 16} y1={rectY} x2={rectX - 8} y2={rectY} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
            <line x1={rectX - 16} y1={rectY + rectH} x2={rectX - 8} y2={rectY + rectH} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
            <text x={rectX - 18} y={rectY + rectH / 2} textAnchor="middle" fontSize={8} fill="hsl(25, 95%, 45%)" fontWeight={600}
              transform={`rotate(-90, ${rectX - 18}, ${rectY + rectH / 2})`}>
              {card.height.toFixed(2)}m
            </text>

            {/* Openings (walls only) */}
            {card.openings.map(op => {
              const isHoriz = card.wall ? (card.wall.wallIndex === 1 || card.wall.wallIndex === 3) : true;
              const fullWallLen = card.room ? (isHoriz ? card.room.width : card.room.length) : card.width;
              const seg = card.segment;

              let opCenterInSegment: number;
              if (seg) {
                const opMeters = op.positionX * fullWallLen;
                opCenterInSegment = (opMeters - seg.startMeters) / (seg.endMeters - seg.startMeters);
              } else {
                opCenterInSegment = op.positionX;
              }
              opCenterInSegment = Math.max(0.05, Math.min(0.95, opCenterInSegment));

              const opWidthPx = op.width * scale;
              const opHeightPx = op.height * scale;
              const baseY = getOpeningBaseY(op);
              const opX = rectX + opCenterInSegment * rectW - opWidthPx / 2;
              const opY = rectY + rectH - opHeightPx - baseY * scale;
              const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';

              return (
                <g key={op.id} style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onOpeningClick(op); }}>
                  <rect
                    x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                    fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                    stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                    strokeWidth={1.2} rx={1}
                  />
                  {!isDoor && (
                    <>
                      <line x1={opX} y1={opY + opHeightPx / 2} x2={opX + opWidthPx} y2={opY + opHeightPx / 2}
                        stroke="hsl(210, 80%, 70%)" strokeWidth={0.5} pointerEvents="none" />
                      <line x1={opX + opWidthPx / 2} y1={opY} x2={opX + opWidthPx / 2} y2={opY + opHeightPx}
                        stroke="hsl(210, 80%, 70%)" strokeWidth={0.5} pointerEvents="none" />
                    </>
                  )}
                  {isDoor && (
                    <circle cx={opX + opWidthPx * 0.8} cy={opY + opHeightPx * 0.55} r={1.5}
                      fill="hsl(30, 80%, 45%)" pointerEvents="none" />
                  )}
                  <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 3} textAnchor="middle"
                    fontSize={6} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
                    {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Quick add openings for wall cards (single-click zone, stop propagation) */}
        {card.canAddOpenings && card.wallId && !card.isInvisible && (
          <div className="flex items-center gap-1 flex-wrap mt-1 pt-1 border-t border-border/30"
            onClick={e => e.stopPropagation()}>
            {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
              <Button key={key} variant="ghost" size="sm" className="text-[9px] h-5 px-1.5"
                onClick={() => {
                  const segPosX = card.segment
                    ? (card.segment.startFraction + card.segment.endFraction) / 2
                    : undefined;
                  onAddOpening(card.wallId!, key, preset.width, preset.height, preset.sillHeight, segPosX);
                }}
                disabled={saving}>
                <Plus className="h-2.5 w-2.5 mr-0.5" />
                {preset.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Wall card edit dialog — opened on double-click
// ──────────────────────────────────────────────────────────────────

const WALL_TYPE_OPTIONS: Array<{ value: WallType; label: string; description: string }> = [
  { value: 'exterior', label: 'Exterior', description: 'Pared perimetral exterior' },
  { value: 'exterior_compartida', label: 'Ext. compartida', description: 'Exterior compartida con otro espacio' },
  { value: 'exterior_invisible', label: 'Ext. invisible', description: 'Exterior sin cómputo (hueco, porche)' },
  { value: 'interior', label: 'Interior', description: 'Pared interior normal' },
  { value: 'interior_compartida', label: 'Int. compartida', description: 'Interior compartida con espacio adyacente' },
  { value: 'interior_invisible', label: 'Invisible', description: 'Sin pared física (espacio abierto)' },
];

function WallEditDialog({ open, onOpenChange, card, currentWallType, liveRooms, onAddOpening, onUpdateOpening, onDeleteOpening, onUpdateWall, saving }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: ElevationCard;
  currentWallType?: WallType; // live wall type from updated rooms data
  liveRooms: RoomData[]; // live rooms for up-to-date openings
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onUpdateOpening: (id: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDeleteOpening: (id: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number }) => Promise<void>;
  saving: boolean;
}) {
  const [editingOp, setEditingOp] = useState<OpeningData | null>(null);
  // Use currentWallType (live from rooms state) if available, fallback to card snapshot
  const resolvedInitialType = (currentWallType || card.wall?.wallType || 'interior') as WallType;
  const [wallType, setWallType] = useState<WallType>(resolvedInitialType);
  const [wallTypeChanged, setWallTypeChanged] = useState(false);

  // Sync wallType state when the live wall type changes (e.g. another user or after save)
  const effectiveWallType = currentWallType || (card.wall?.wallType as WallType);
  if (effectiveWallType && wallType !== effectiveWallType && !wallTypeChanged) {
    setWallType(effectiveWallType);
  }

  // Derive live openings from current rooms state (not from stale card snapshot)
  // This ensures add/delete operations are immediately reflected in the dialog
  const liveOpenings = useMemo(() => {
    if (!card.wall || !card.room) return card.openings;
    const liveRoom = liveRooms.find(r => r.id === card.room!.id);
    if (!liveRoom) return card.openings;
    const liveWall = liveRoom.walls.find(w => w.id === card.wall!.id);
    if (!liveWall) return card.openings;

    // If card has a segment, filter openings to only those within this segment's fraction range
    if (card.segment) {
      return liveWall.openings.filter(op =>
        op.positionX >= card.segment!.startFraction - 0.01 &&
        op.positionX <= card.segment!.endFraction + 0.01
      );
    }
    return liveWall.openings;
  }, [liveRooms, card]);

  const handleAdd = async (key: string) => {
    if (!card.wallId) return;
    const preset = OPENING_PRESETS[key as keyof typeof OPENING_PRESETS];
    // Calculate position_x within the correct segment to avoid placing in wrong segment
    // Default position is center of segment; if no segment, use 0.5 (center of wall)
    let positionX = 0.5;
    if (card.segment) {
      // Place at center of this specific segment, expressed as fraction of full wall
      positionX = (card.segment.startFraction + card.segment.endFraction) / 2;
    }
    await onAddOpening(card.wallId, key, preset.width, preset.height, preset.sillHeight, positionX);
  };

  const handleSaveOp = async (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => {
    if (!editingOp) return;
    await onUpdateOpening(editingOp.id, data);
    setEditingOp(null);
  };

  const handleSaveWallType = async () => {
    if (!card.wallId || !onUpdateWall || card.wall?.id.startsWith('temp-')) return;
    await onUpdateWall(card.wall!.id, { wallType });
    setWallTypeChanged(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {card.label}
            {card.sublabel && <span className="text-muted-foreground font-normal">— {card.sublabel}</span>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {card.width.toFixed(2)} m × {card.height.toFixed(2)} m
            {card.badgeLabel && ` · ${card.badgeLabel}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wall type editor */}
          {card.wall && !card.wall.id.startsWith('temp-') && onUpdateWall && (
            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground">Tipo de pared</p>
              <Select value={wallType} onValueChange={v => { setWallType(v as WallType); setWallTypeChanged(true); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WALL_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground ml-2">{opt.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wallTypeChanged && (
                <Button size="sm" className="w-full h-7 text-xs" onClick={handleSaveWallType} disabled={saving}>
                  Guardar tipo de pared
                </Button>
              )}
            </div>
          )}

          {/* Existing openings - use liveOpenings so add/delete are instantly reflected */}
          {liveOpenings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Huecos ({liveOpenings.length})</p>
              {liveOpenings.map(op => (
                <div key={op.id} className="flex items-center gap-2 border border-border rounded-md p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">
                      {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {op.width.toFixed(2)} × {op.height.toFixed(2)} m · pos. {(op.positionX * 100).toFixed(0)}%
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] px-2"
                    onClick={() => setEditingOp(op)}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={async () => { await onDeleteOpening(op.id); }} disabled={saving}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Inline edit for selected opening */}
          {editingOp && (
            <InlineOpeningEditor
              opening={editingOp}
              onSave={handleSaveOp}
              onCancel={() => setEditingOp(null)}
              saving={saving}
            />
          )}

          {/* Add opening */}
          {card.canAddOpenings && card.wallId && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Añadir hueco</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
                  <Button key={key} variant="outline" size="sm" className="text-xs h-7"
                    onClick={() => handleAdd(key)} disabled={saving}>
                    <Plus className="h-3 w-3 mr-1" />
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlineOpeningEditor({ opening, onSave, onCancel, saving }: {
  opening: OpeningData;
  onSave: (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [width, setWidth] = useState(opening.width);
  const [height, setHeight] = useState(opening.height);
  const [positionX, setPositionX] = useState(opening.positionX);
  const [openingType, setOpeningType] = useState(opening.openingType);

  return (
    <div className="border border-primary/30 rounded-md p-3 space-y-3 bg-muted/20">
      <p className="text-xs font-semibold text-primary">Editar hueco</p>
      <div>
        <Label className="text-xs">Tipo</Label>
        <Select value={openingType} onValueChange={v => setOpeningType(v as OpeningData['openingType'])}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(OPENING_PRESETS).map(([k, p]) => (
              <SelectItem key={k} value={k} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Ancho (m)</Label>
          <Input type="number" step="0.05" className="h-8 text-xs"
            value={width} onChange={e => setWidth(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Alto (m)</Label>
          <Input type="number" step="0.05" className="h-8 text-xs"
            value={height} onChange={e => setHeight(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Posición en pared</Label>
        <div className="flex items-center gap-2">
          <input type="range" min="0" max="1" step="0.01"
            className="flex-1 accent-primary"
            value={positionX}
            onChange={e => setPositionX(Number(e.target.value))} />
          <span className="text-xs text-muted-foreground w-10 text-right">{(positionX * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({ width, height, positionX, openingType })} disabled={saving}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

// Opening properties edit dialog (single click on opening)
function OpeningEditDialog({ open, onOpenChange, opening, onSave, onDelete, saving }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opening: OpeningData;
  onSave: (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}) {
  const [width, setWidth] = useState(opening.width);
  const [height, setHeight] = useState(opening.height);
  const [positionX, setPositionX] = useState(opening.positionX);
  const [openingType, setOpeningType] = useState(opening.openingType);

  // Sync when opening changes
  useState(() => {
    setWidth(opening.width);
    setHeight(opening.height);
    setPositionX(opening.positionX);
    setOpeningType(opening.openingType);
  });

  const handleSave = async () => {
    await onSave({ width, height, positionX, openingType });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Editar {OPENING_PRESETS[openingType as keyof typeof OPENING_PRESETS]?.label || openingType}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={openingType} onValueChange={v => setOpeningType(v as OpeningData['openingType'])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OPENING_PRESETS).map(([k, p]) => (
                  <SelectItem key={k} value={k} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Ancho (m)</Label>
              <Input type="number" step="0.05" className="h-8 text-xs"
                value={width} onChange={e => setWidth(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Alto (m)</Label>
              <Input type="number" step="0.05" className="h-8 text-xs"
                value={height} onChange={e => setHeight(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Posición (%)</Label>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="1" step="0.01"
                className="flex-1 accent-primary"
                value={positionX}
                onChange={e => setPositionX(Number(e.target.value))} />
              <span className="text-xs text-muted-foreground w-10 text-right">{(positionX * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
