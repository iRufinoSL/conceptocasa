import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Box, Layers, ArrowUpDown, Maximize2, Merge, Unlink, Map as MapIcon } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, WALL_SIDE_LETTERS, computeWallSegments, autoClassifyWalls, generateExternalWallNames, isExteriorType, isInvisibleType, computeBuildingOutline, computeCompositeWalls } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment, FloorLevel, WallType, BlockGroupData, OutlineVertex, CompositeWall } from '@/lib/floor-plan-calculations';

interface ElevationsGridViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors?: FloorLevel[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number; elevationGroup?: string | null }) => Promise<void>;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  onUpdateBlockGroup?: (blockGroupId: string, data: { name?: string; color?: string; spanCols?: number; spanRows?: number }) => Promise<void>;
  saving: boolean;
  focusWallId?: string;
  autoEditWallId?: string;
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
  isInvisible?: boolean;
  surfaceArea?: number;
  volume?: number;
  roomHeight?: number;
  elevationGroup?: string;
}

// Group of 6 surfaces for a single room
interface RoomElevationGroup {
  room: RoomData;
  cards: ElevationCard[];
}

const CARD_SCALE = 60;
const CARD_PADDING = 20;
const MAX_CARD_WIDTH = 400;

function getOpeningSillHeight(op: OpeningData): number {
  // Use the stored sillHeight (meters from floor)
  return op.sillHeight ?? 0;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

export function ElevationsGridViewer({
  plan, rooms, floors, onUpdateOpening, onAddOpening, onDeleteOpening, onUpdateWall,
  onAddBlockGroup, onDeleteBlockGroup, onUpdateBlockGroup, saving, focusWallId, autoEditWallId,
}: ElevationsGridViewerProps) {
  const [selectedOpening, setSelectedOpening] = useState<OpeningData | null>(null);
  const [selectedOpeningWallLen, setSelectedOpeningWallLen] = useState<number>(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCard, setEditCard] = useState<ElevationCard | null>(null);
  const [editCardDialogOpen, setEditCardDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'rooms' | 'groups' | 'composite'>('rooms');

  // Scroll to focused wall on mount
  useEffect(() => {
    if (focusWallId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-wall-id="${focusWallId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
        }
      }, 300);
    }
  }, [focusWallId]);

  // Auto-open the WallEditDialog for a specific wall (from space form eye icon)
  const [autoEditTriggered, setAutoEditTriggered] = useState(false);

  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Building outline & composite walls
  const buildingOutline = useMemo(() => computeBuildingOutline(rooms), [rooms]);
  const compositeWalls = useMemo(() => computeCompositeWalls(rooms, buildingOutline, plan), [rooms, buildingOutline, plan]);

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
            elevationGroup: wall.elevationGroup,
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
            return op.positionX >= seg.startFraction - 0.05 && op.positionX <= seg.endFraction + 0.05;
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
            elevationGroup: wall.elevationGroup,
          });
        });
      });

      return { room, cards };
    });
  }, [rooms, plan, wallSegmentsMap, wallClassification, externalWallNames]);

  // Auto-open the WallEditDialog for a specific wall (from space form eye icon)
  useEffect(() => {
    if (autoEditWallId && !autoEditTriggered && roomGroups.length > 0) {
      for (const rg of roomGroups) {
        const card = rg.cards.find(c => c.wallId === autoEditWallId && c.category === 'pared');
        if (card) {
          setEditCard(card);
          setEditCardDialogOpen(true);
          setAutoEditTriggered(true);
          break;
        }
      }
    }
  }, [autoEditWallId, autoEditTriggered, roomGroups]);

  // Sort rooms by grid position: top-to-bottom then left-to-right, grouped spaces together
  const sortedRoomGroups = useMemo(() => {
    // Build a map of groupId → rooms for grouping
    const groupMap = new Map<string, RoomElevationGroup[]>();
    const ungrouped: RoomElevationGroup[] = [];
    const processed = new Set<string>();

    roomGroups.forEach(rg => {
      if (rg.room.groupId) {
        if (!groupMap.has(rg.room.groupId)) groupMap.set(rg.room.groupId, []);
        groupMap.get(rg.room.groupId)!.push(rg);
      } else {
        ungrouped.push(rg);
      }
    });

    // Sort function: by posY first (top-to-bottom), then posX (left-to-right)
    const sortByPos = (a: RoomElevationGroup, b: RoomElevationGroup) => {
      const dy = a.room.posY - b.room.posY;
      if (Math.abs(dy) > 0.1) return dy;
      return a.room.posX - b.room.posX;
    };

    // Sort ungrouped by position
    ungrouped.sort(sortByPos);

    // Sort each group internally by position
    groupMap.forEach(group => group.sort(sortByPos));

    // Merge: for each room in position order, if it's grouped, insert the whole group at the first member's position
    const allByPos = [...roomGroups].sort(sortByPos);
    const result: RoomElevationGroup[] = [];

    allByPos.forEach(rg => {
      if (processed.has(rg.room.id)) return;
      if (rg.room.groupId && groupMap.has(rg.room.groupId)) {
        const group = groupMap.get(rg.room.groupId)!;
        group.forEach(g => {
          if (!processed.has(g.room.id)) {
            result.push(g);
            processed.add(g.room.id);
          }
        });
      } else {
        result.push(rg);
        processed.add(rg.room.id);
      }
    });

    return result;
  }, [roomGroups]);

  // Group by floor
  const floorGroups: Array<{ floorId: string; floorName: string; roomGroups: RoomElevationGroup[] }> = useMemo(() => {
    const sortedFloors = floors ? [...floors].sort((a, b) => a.orderIndex - b.orderIndex) : [];
    if (sortedFloors.length === 0) {
      return [{ floorId: 'all', floorName: '', roomGroups: sortedRoomGroups }];
    }
    const result: Array<{ floorId: string; floorName: string; roomGroups: RoomElevationGroup[] }> = [];
    sortedFloors.forEach(floor => {
      const floorRooms = sortedRoomGroups.filter(rg => rg.room.floorId === floor.id);
      if (floorRooms.length > 0) {
        result.push({ floorId: floor.id, floorName: floor.name, roomGroups: floorRooms });
      }
    });
    const assignedIds = new Set(rooms.filter(r => r.floorId && sortedFloors.some(f => f.id === r.floorId)).map(r => r.id));
    const unassigned = sortedRoomGroups.filter(rg => !assignedIds.has(rg.room.id));
    if (unassigned.length > 0) {
      result.push({ floorId: 'unassigned', floorName: 'Sin nivel asignado', roomGroups: unassigned });
    }
    return result;
  }, [sortedRoomGroups, floors, rooms]);

  const handleOpeningClick = useCallback((op: OpeningData) => {
    // Find the wall length for this opening
    let wLen = 1;
    for (const room of rooms) {
      for (const wall of room.walls) {
        if (wall.openings.some(o => o.id === op.id)) {
          const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
          wLen = isHoriz ? room.width : room.length;
          break;
        }
      }
    }
    setSelectedOpening(op);
    setSelectedOpeningWallLen(wLen);
    setEditDialogOpen(true);
  }, [rooms]);

  const handleSaveOpening = useCallback(async (data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => {
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

  // Build elevation groups from all wall cards
  const elevationGroups = useMemo(() => {
    const allCards = roomGroups.flatMap(rg => rg.cards.filter(c => c.category === 'pared' && c.elevationGroup));
    const groups = new Map<string, ElevationCard[]>();
    allCards.forEach(card => {
      const g = card.elevationGroup!;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(card);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [roomGroups]);

  const hasGroups = elevationGroups.length > 0;

  const [gridFullscreen, setGridFullscreen] = useState(false);

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-auto" onClick={() => setGridFullscreen(true)} title="Pantalla completa">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant={viewMode === 'rooms' ? 'default' : 'outline'} size="sm" className="text-xs h-7"
          onClick={() => setViewMode('rooms')}>
          <Layers className="h-3 w-3 mr-1" /> Por espacio
        </Button>
        {hasGroups && (
          <Button variant={viewMode === 'groups' ? 'default' : 'outline'} size="sm" className="text-xs h-7"
            onClick={() => setViewMode('groups')}>
            <Box className="h-3 w-3 mr-1" /> Por grupo ({elevationGroups.length})
          </Button>
        )}
        {compositeWalls.length > 0 && (
          <Button variant={viewMode === 'composite' ? 'default' : 'outline'} size="sm" className="text-xs h-7"
            onClick={() => setViewMode('composite')}>
            <MapIcon className="h-3 w-3 mr-1" /> Paredes compuestas ({compositeWalls.length})
          </Button>
        )}
        {viewMode === 'composite' && buildingOutline.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-2">
            Esquinas: {buildingOutline.map(v => v.label).join(' → ')} → {buildingOutline[0]?.label}
          </span>
        )}
      </div>

      {/* Grouped view */}
      {viewMode === 'groups' && hasGroups && (
        <div className="space-y-4">
          {elevationGroups.map(([groupName, cards]) => (
            <Collapsible key={groupName} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1.5 transition-colors border-b border-border/50 mb-2">
                <ChevronRight className="h-4 w-4 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                <h3 className="text-sm font-bold text-foreground">{groupName}</h3>
                <Badge variant="secondary" className="text-[10px] h-4">{cards.length} paredes</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 ml-4">
                  {cards.map(card => (
                    <ElevationCardView
                      key={card.id}
                      card={card}
                      plan={plan}
                      onOpeningClick={handleOpeningClick}
                      onAddOpening={onAddOpening}
                      onCardDoubleClick={handleCardDoubleClick}
                      onAddBlockGroup={onAddBlockGroup}
                      onDeleteBlockGroup={onDeleteBlockGroup}
                      saving={saving}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Composite walls view */}
      {viewMode === 'composite' && compositeWalls.length > 0 && (
        <div className="space-y-4">
          {compositeWalls.map(cw => (
            <CompositeWallCard
              key={cw.id}
              compositeWall={cw}
              plan={plan}
              onOpeningClick={handleOpeningClick}
            />
          ))}
        </div>
      )}

      {/* Room-based view (default) */}
      {viewMode === 'rooms' && floorGroups.map(({ floorId, floorName, roomGroups: floorRoomGroups }) => {
        const hasFloorHeader = floorName !== '';
        const content = (
          <div className="space-y-3">
            {floorRoomGroups.map(({ room, cards }) => {
              const wallCount = cards.filter(c => c.category === 'pared').length;
              const groupLabel = room.groupName
                ? <Badge variant="secondary" className="text-[9px] h-4 ml-1">Grupo: {room.groupName}</Badge>
                : null;
              return (
                <Collapsible key={room.id} defaultOpen={!!focusWallId && cards.some(c => c.wallId === focusWallId)}>
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
                          plan={plan}
                          onOpeningClick={handleOpeningClick}
                          onAddOpening={onAddOpening}
                          onCardDoubleClick={handleCardDoubleClick}
                          onAddBlockGroup={onAddBlockGroup}
                          onDeleteBlockGroup={onDeleteBlockGroup}
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
          wallLen={selectedOpeningWallLen}
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

      {/* Grid fullscreen dialog */}
      <Dialog open={gridFullscreen} onOpenChange={setGridFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[96vh] h-[96vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm">Alzados — Pantalla completa</DialogTitle>
            <DialogDescription className="sr-only">Vista completa de todos los alzados</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {floorGroups.map(({ floorId, floorName, roomGroups: floorRoomGroups }) => {
              const hasFloorHeader = floorName !== '';
              const content = (
                <div className="space-y-3">
                  {floorRoomGroups.map(({ room, cards }) => (
                    <Collapsible key={room.id} defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <h4 className="text-sm font-semibold text-muted-foreground">{room.name}</h4>
                        <Badge variant="outline" className="text-[10px] h-4">{cards.filter(c => c.category === 'pared').length} paredes</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 mt-2 ml-4">
                          {cards.map(card => (
                            <ElevationCardView
                              key={card.id}
                              card={card}
                              plan={plan}
                              onOpeningClick={handleOpeningClick}
                              onAddOpening={onAddOpening}
                              onCardDoubleClick={handleCardDoubleClick}
                              onAddBlockGroup={onAddBlockGroup}
                              onDeleteBlockGroup={onDeleteBlockGroup}
                              saving={saving}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              );
              if (hasFloorHeader) {
                return (
                  <Collapsible key={floorId} defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1.5 transition-colors border-b border-border/50 mb-2">
                      <ChevronRight className="h-4 w-4 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                      <h3 className="text-sm font-bold text-foreground">{floorName}</h3>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ml-2">{content}</CollapsibleContent>
                  </Collapsible>
                );
              }
              return <div key={floorId}>{content}</div>;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Individual elevation card
function ElevationCardView({ card, plan, onOpeningClick, onAddOpening, onCardDoubleClick, onAddBlockGroup, onDeleteBlockGroup, saving }: {
  card: ElevationCard;
  plan: FloorPlanData;
  onOpeningClick: (op: OpeningData) => void;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onCardDoubleClick: (card: ElevationCard) => void;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  saving: boolean;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set()); // "col-row" keys
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

  // Block count calculation
  const blockCount = useMemo(() => {
    if (!isWall || card.isInvisible || plan.scaleMode !== 'bloque') return null;
    const blockW = plan.blockLengthMm / 1000;
    const blockH = plan.blockHeightMm / 1000;
    if (blockW <= 0 || blockH <= 0) return null;
    const cols = Math.ceil(card.width / blockW);
    const rows = Math.ceil(card.height / blockH);
    return { cols, rows, total: cols * rows };
  }, [isWall, card.isInvisible, card.width, card.height, plan.scaleMode, plan.blockLengthMm, plan.blockHeightMm]);

  // SVG render function shared between inline and fullscreen
  const renderSvg = (fsScale?: number) => {
    const s = fsScale || scale;
    const sw = card.width * s + CARD_PADDING * 2 + 30;
    const sh = card.height * s + CARD_PADDING * 2 + 30;
    const rx = CARD_PADDING + 20;
    const ry = CARD_PADDING;
    const rw = card.width * s;
    const rh = card.height * s;

    return (
      <svg
        width="100%"
        viewBox={`0 0 ${sw} ${sh}`}
        className="mx-auto"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '90vh' : '180px' }}
      >
        {isWall && (
          <>
            <line x1={rx - 5} y1={ry + rh} x2={rx + rw + 5} y2={ry + rh}
              stroke="hsl(25, 60%, 40%)" strokeWidth={1.5} />
            {Array.from({ length: Math.ceil((rw + 10) / 6) }, (_, i) => (
              <line key={`gh-${i}`}
                x1={rx - 5 + i * 6} y1={ry + rh + 1.5}
                x2={rx - 5 + i * 6 - 4} y2={ry + rh + 5}
                stroke="hsl(25, 60%, 40%)" strokeWidth={0.4} opacity={0.5}
              />
            ))}
          </>
        )}
        <rect x={rx} y={ry} width={rw} height={rh}
          fill={card.fill} stroke={card.stroke} strokeWidth={1.5} rx={1} />

        {/* Block pattern */}
        {isWall && !card.isInvisible && plan.scaleMode === 'bloque' && (() => {
          const blockWPx = (plan.blockLengthMm / 1000) * s;
          const blockHPx = (plan.blockHeightMm / 1000) * s;
          if (blockWPx < 3 || blockHPx < 2) return null;
          const rows = Math.ceil(rh / blockHPx);
          const cols = Math.ceil(rw / blockWPx) + 1;
          const lines: React.ReactElement[] = [];
          for (let r = 1; r < rows; r++) {
            const y = ry + rh - r * blockHPx;
            if (y <= ry) break;
            lines.push(
              <line key={`bh-${r}`} x1={rx} y1={y} x2={rx + rw} y2={y}
                stroke="hsl(25, 30%, 65%)" strokeWidth={0.5} opacity={0.6} pointerEvents="none" />
            );
          }
          for (let r = 0; r < rows; r++) {
            const yTop = Math.max(ry, ry + rh - (r + 1) * blockHPx);
            const yBot = ry + rh - r * blockHPx;
            if (yTop >= ry + rh) break;
            const offset = r % 2 === 0 ? 0 : blockWPx / 2;
            for (let c = 1; c < cols; c++) {
              const x = rx + offset + c * blockWPx;
              if (x >= rx + rw) break;
              if (x <= rx) continue;
              lines.push(
                <line key={`bv-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={Math.min(yBot, ry + rh)}
                  stroke="hsl(25, 30%, 65%)" strokeWidth={0.4} opacity={0.5} pointerEvents="none" />
              );
            }
          }
          return <g className="block-pattern">{lines}</g>;
        })()}

        {/* Direction arrows — only on external walls, viewed from exterior */}
        {isWall && card.wall && isExteriorType(card.wall.wallType as string) && (() => {
          const wi = card.wall.wallIndex;
          // External walls: viewed from EXTERIOR (flipped left-right vs interior)
          const exteriorCornerMap: Record<number, [string, string]> = {
            1: ['B', 'A'], // top wall from outside (standing north): left=B, right=A
            2: ['C', 'B'], // right wall from outside (standing east): left=C, right=B
            3: ['D', 'C'], // bottom wall from outside (standing south): left=D, right=C
            4: ['A', 'D'], // left wall from outside (standing west): left=A, right=D
          };
          const [leftCorner, rightCorner] = exteriorCornerMap[wi] || ['?', '?'];
          const arrowY = ry - 8;
          const fs = fsScale ? 9 : 7;
          return (
            <g>
              <text x={rx} y={arrowY} textAnchor="start" fontSize={fs} fontWeight={700} fill="hsl(222, 47%, 40%)">
                ← {leftCorner}
              </text>
              <text x={rx + rw} y={arrowY} textAnchor="end" fontSize={fs} fontWeight={700} fill="hsl(222, 47%, 40%)">
                {rightCorner} →
              </text>
              <line x1={rx + 12} y1={arrowY - 3} x2={rx + rw - 12} y2={arrowY - 3}
                stroke="hsl(222, 47%, 40%)" strokeWidth={0.5} opacity={0.4} />
            </g>
          );
        })()}

        {/* Dimensions */}
        <line x1={rx} y1={ry + rh + 12} x2={rx + rw} y2={ry + rh + 12}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
        <line x1={rx} y1={ry + rh + 8} x2={rx} y2={ry + rh + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <line x1={rx + rw} y1={ry + rh + 8} x2={rx + rw} y2={ry + rh + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <text x={rx + rw / 2} y={ry + rh + 24} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}>
          {Math.round(card.width * 1000)} mm
        </text>
        <line x1={rx - 12} y1={ry} x2={rx - 12} y2={ry + rh}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
        <line x1={rx - 16} y1={ry} x2={rx - 8} y2={ry} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <line x1={rx - 16} y1={ry + rh} x2={rx - 8} y2={ry + rh} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <text x={rx - 18} y={ry + rh / 2} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}
          transform={`rotate(-90, ${rx - 18}, ${ry + rh / 2})`}>
          {Math.round(card.height * 1000)} mm
        </text>

        {/* Openings */}
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
          opCenterInSegment = Math.max(0, Math.min(1, opCenterInSegment));
          const opWidthPx = op.width * s;
          const opHeightPx = op.height * s;
          const sillH = getOpeningSillHeight(op);
          const rawOpX = rx + opCenterInSegment * rw - opWidthPx / 2;
          const opX = Math.max(rx, Math.min(rawOpX, rx + rw - opWidthPx));
          const opY = ry + rh - opHeightPx - sillH * s;
          const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';
          return (
            <g key={op.id} style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onOpeningClick(op); }}>
              <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                strokeWidth={1.2} rx={1} />
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
                fontSize={fsScale ? 8 : 6} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
                {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <>
    <Card
      data-wall-id={card.wallId || undefined}
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
              {isWall && card.wall && (
                <p className="text-[9px] text-muted-foreground/70 italic">
                  {WALL_TYPE_OPTIONS.find(o => o.value === (card.wall?.wallType as string))?.label || card.wall.wallType}
                  {' · '}
                  <span className="underline cursor-pointer hover:text-primary" onClick={e => { e.stopPropagation(); onCardDoubleClick(card); }}>
                    cambiar
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {blockCount && (
              <Badge variant="outline" className="text-[9px] h-4 bg-accent/30">
                {blockCount.total} bloques ({blockCount.cols}×{blockCount.rows})
              </Badge>
            )}
            {card.badgeLabel && (
              <Badge variant={card.badgeVariant || 'secondary'} className="text-[9px] h-4">
                {card.badgeLabel}
              </Badge>
            )}
            {!card.isInvisible && (
              <Badge variant="outline" className="text-[9px] h-4">{area}m²</Badge>
            )}
            {card.elevationGroup && (
              <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary">{card.elevationGroup}</Badge>
            )}
            {!card.isInvisible && card.category !== 'volumen' && (
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); setFullscreen(true); }}
                title="Ampliar">
                <Maximize2 className="h-3 w-3" />
              </Button>
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
          renderSvg()
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

    {/* Fullscreen dialog with interactive block editing */}
    <Dialog open={fullscreen} onOpenChange={(open) => { setFullscreen(open); if (!open) setSelectedBlocks(new Set()); }}>
      <DialogContent className="!max-w-none !w-screen !h-screen !m-0 !p-4 !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            {card.label}
            {card.sublabel && <span className="text-muted-foreground font-normal">— {card.sublabel}</span>}
            {blockCount && (
              <Badge variant="outline" className="text-xs">
                {blockCount.total} bloques ({blockCount.cols}×{blockCount.rows})
              </Badge>
            )}
            {!card.isInvisible && (
              <Badge variant="outline" className="text-xs">{area}m²</Badge>
            )}
            {isWall && plan.scaleMode === 'bloque' && (card.wall?.blockGroups?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {card.wall!.blockGroups!.length} grupos
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">Vista a pantalla completa del alzado</DialogDescription>
        </DialogHeader>

        {/* Block editing toolbar */}
        {isWall && plan.scaleMode === 'bloque' && !card.isInvisible && blockCount && (
          <div className="shrink-0 flex items-center gap-2 flex-wrap border-b border-border/50 pb-2">
            <span className="text-xs text-muted-foreground">
              {selectedBlocks.size > 0
                ? `${selectedBlocks.size} bloques seleccionados`
                : 'Haz clic en los bloques para seleccionarlos'}
            </span>
            {selectedBlocks.size >= 2 && onAddBlockGroup && card.wallId && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs gap-1"
                disabled={saving}
                onClick={async () => {
                  const cells = Array.from(selectedBlocks).map(k => {
                    const [c, r] = k.split('-').map(Number);
                    return { col: c, row: r };
                  });
                  const minCol = Math.min(...cells.map(c => c.col));
                  const maxCol = Math.max(...cells.map(c => c.col));
                  const minRow = Math.min(...cells.map(c => c.row));
                  const maxRow = Math.max(...cells.map(c => c.row));
                  const spanCols = maxCol - minCol + 1;
                  const spanRows = maxRow - minRow + 1;
                  const blockW = plan.blockLengthMm;
                  const blockH = plan.blockHeightMm;
                  const name = `${(spanCols * blockW).toFixed(0)}×${(spanRows * blockH).toFixed(0)}×${plan.blockWidthMm}mm`;
                  await onAddBlockGroup(card.wallId!, minCol, minRow, spanCols, spanRows, name);
                  setSelectedBlocks(new Set());
                }}
              >
                <Merge className="h-3 w-3" /> Agrupar ({selectedBlocks.size})
              </Button>
            )}
            {selectedBlocks.size > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setSelectedBlocks(new Set())}>
                Limpiar selección
              </Button>
            )}
            {(card.wall?.blockGroups?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1 ml-auto flex-wrap">
                {card.wall!.blockGroups!.map(bg => (
                  <Badge
                    key={bg.id}
                    variant="secondary"
                    className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                    style={bg.color ? { backgroundColor: bg.color + '30', borderColor: bg.color } : undefined}
                  >
                    {bg.name || `${bg.spanCols}×${bg.spanRows}`}
                    {onDeleteBlockGroup && (
                      <button
                        className="ml-0.5 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteBlockGroup(bg.id); }}
                        disabled={saving}
                      >
                        <Unlink className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto flex items-center justify-center min-h-0">
          {card.isInvisible ? (
            <p className="text-muted-foreground italic">Pared invisible</p>
          ) : isWall && plan.scaleMode === 'bloque' && blockCount ? (
            <FullscreenBlockGrid
              card={card}
              plan={plan}
              blockCount={blockCount}
              selectedBlocks={selectedBlocks}
              onToggleBlock={(key) => {
                setSelectedBlocks(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                });
              }}
              onOpeningClick={onOpeningClick}
            />
          ) : (
            renderSvg(Math.min(
              (window.innerHeight * 0.85) / card.height,
              (window.innerWidth * 0.9) / card.width
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Fullscreen interactive block grid
// ──────────────────────────────────────────────────────────────────

const BLOCK_GROUP_COLORS = [
  'hsl(210, 70%, 55%)', 'hsl(340, 70%, 55%)', 'hsl(150, 60%, 45%)',
  'hsl(45, 80%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(15, 80%, 55%)',
  'hsl(180, 60%, 45%)', 'hsl(330, 50%, 55%)',
];

function FullscreenBlockGrid({ card, plan, blockCount, selectedBlocks, onToggleBlock, onOpeningClick }: {
  card: ElevationCard;
  plan: FloorPlanData;
  blockCount: { cols: number; rows: number; total: number };
  selectedBlocks: Set<string>;
  onToggleBlock: (key: string) => void;
  onOpeningClick: (op: OpeningData) => void;
}) {
  const blockGroups = card.wall?.blockGroups || [];

  // Build a map of which cells are covered by groups
  const groupCellMap = useMemo(() => {
    const map = new Map<string, BlockGroupData>();
    blockGroups.forEach(bg => {
      for (let c = bg.startCol; c < bg.startCol + bg.spanCols; c++) {
        for (let r = bg.startRow; r < bg.startRow + bg.spanRows; r++) {
          map.set(`${c}-${r}`, bg);
        }
      }
    });
    return map;
  }, [blockGroups]);

  // Calculate scale to fit viewport
  const blockWm = plan.blockLengthMm / 1000;
  const blockHm = plan.blockHeightMm / 1000;
  const wallWm = card.width;
  const wallHm = card.height;
  const padding = 60;
  const maxW = window.innerWidth - padding * 2;
  const maxH = window.innerHeight - 200;
  const s = Math.min(maxW / wallWm, maxH / wallHm);
  const svgW = wallWm * s + padding * 2;
  const svgH = wallHm * s + padding * 2;
  const rx = padding;
  const ry = padding / 2;
  const rw = wallWm * s;
  const rh = wallHm * s;
  const bwPx = blockWm * s;
  const bhPx = blockHm * s;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: '85vh' }}
    >
      {/* Ground line */}
      <line x1={rx - 5} y1={ry + rh} x2={rx + rw + 5} y2={ry + rh}
        stroke="hsl(25, 60%, 40%)" strokeWidth={2} />

      {/* Wall background */}
      <rect x={rx} y={ry} width={rw} height={rh}
        fill={card.fill} stroke={card.stroke} strokeWidth={1.5} rx={1} />

      {/* Individual blocks */}
      {Array.from({ length: blockCount.rows }, (_, r) => {
        const yTop = ry + rh - (r + 1) * bhPx;
        const offset = r % 2 === 0 ? 0 : bwPx / 2;

        return Array.from({ length: blockCount.cols }, (_, c) => {
          const xLeft = rx + offset + c * bwPx;
          const clippedX = Math.max(rx, xLeft);
          const clippedW = Math.min(rx + rw, xLeft + bwPx) - clippedX;
          const clippedY = Math.max(ry, yTop);
          const clippedH = Math.min(ry + rh, yTop + bhPx) - clippedY;
          if (clippedW <= 0 || clippedH <= 0) return null;

          const key = `${c}-${r}`;
          const isSelected = selectedBlocks.has(key);
          const group = groupCellMap.get(key);
          const isGroupOrigin = group && group.startCol === c && group.startRow === r;

          if (group && !isGroupOrigin) return null;

          if (group && isGroupOrigin) {
            const gx = rx + (r % 2 === 0 ? 0 : bwPx / 2) + group.startCol * bwPx;
            const gy = ry + rh - (group.startRow + group.spanRows) * bhPx;
            const gw = group.spanCols * bwPx;
            const gh = group.spanRows * bhPx;
            const colorIdx = blockGroups.indexOf(group) % BLOCK_GROUP_COLORS.length;
            const color = group.color || BLOCK_GROUP_COLORS[colorIdx];

            return (
              <g key={`group-${group.id}`}>
                <rect
                  x={Math.max(rx, gx)} y={Math.max(ry, gy)}
                  width={Math.min(rx + rw, gx + gw) - Math.max(rx, gx)}
                  height={Math.min(ry + rh, gy + gh) - Math.max(ry, gy)}
                  fill={color + '25'}
                  stroke={color}
                  strokeWidth={2.5}
                  rx={2}
                />
                <text
                  x={Math.max(rx, gx) + (Math.min(rx + rw, gx + gw) - Math.max(rx, gx)) / 2}
                  y={Math.max(ry, gy) + (Math.min(ry + rh, gy + gh) - Math.max(ry, gy)) / 2 + 4}
                  textAnchor="middle"
                  fontSize={Math.min(12, gw / 8)}
                  fill={color}
                  fontWeight={700}
                  pointerEvents="none"
                >
                  {group.name || `${group.spanCols}×${group.spanRows}`}
                </text>
              </g>
            );
          }

          return (
            <rect
              key={key}
              x={clippedX + 0.5}
              y={clippedY + 0.5}
              width={clippedW - 1}
              height={clippedH - 1}
              fill={isSelected ? 'hsl(210, 80%, 60%, 0.4)' : 'transparent'}
              stroke={isSelected ? 'hsl(210, 80%, 50%)' : 'hsl(25, 30%, 65%)'}
              strokeWidth={isSelected ? 2 : 0.4}
              opacity={isSelected ? 1 : 0.5}
              rx={0.5}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onToggleBlock(key); }}
            >
              <title>Bloque [{c},{r}] — {plan.blockLengthMm}×{plan.blockHeightMm}×{plan.blockWidthMm}mm</title>
            </rect>
          );
        });
      })}

      {/* Direction arrows — only on external walls, from exterior */}
      {card.wall && isExteriorType(card.wall.wallType as string) && (() => {
        const wi = card.wall.wallIndex;
        const exteriorCornerMap: Record<number, [string, string]> = {
          1: ['B', 'A'], 2: ['C', 'B'], 3: ['D', 'C'], 4: ['A', 'D'],
        };
        const [leftCorner, rightCorner] = exteriorCornerMap[wi] || ['?', '?'];
        return (
          <g>
            <text x={rx} y={ry - 10} textAnchor="start" fontSize={11} fontWeight={700} fill="hsl(222, 47%, 40%)">← {leftCorner}</text>
            <text x={rx + rw} y={ry - 10} textAnchor="end" fontSize={11} fontWeight={700} fill="hsl(222, 47%, 40%)">{rightCorner} →</text>
            <line x1={rx + 18} y1={ry - 13} x2={rx + rw - 18} y2={ry - 13} stroke="hsl(222, 47%, 40%)" strokeWidth={0.5} opacity={0.4} />
          </g>
        );
      })()}

      {/* Dimension lines */}
      <line x1={rx} y1={ry + rh + 15} x2={rx + rw} y2={ry + rh + 15}
        stroke="hsl(25, 95%, 45%)" strokeWidth={0.8} />
      <line x1={rx} y1={ry + rh + 10} x2={rx} y2={ry + rh + 20} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <line x1={rx + rw} y1={ry + rh + 10} x2={rx + rw} y2={ry + rh + 20} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <text x={rx + rw / 2} y={ry + rh + 30} textAnchor="middle" fontSize={12} fill="hsl(25, 95%, 45%)" fontWeight={600}>
        {Math.round(card.width * 1000)} mm ({blockCount.cols} bloques)
      </text>
      <line x1={rx - 15} y1={ry} x2={rx - 15} y2={ry + rh}
        stroke="hsl(25, 95%, 45%)" strokeWidth={0.8} />
      <line x1={rx - 20} y1={ry} x2={rx - 10} y2={ry} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <line x1={rx - 20} y1={ry + rh} x2={rx - 10} y2={ry + rh} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <text x={rx - 22} y={ry + rh / 2} textAnchor="middle" fontSize={12} fill="hsl(25, 95%, 45%)" fontWeight={600}
        transform={`rotate(-90, ${rx - 22}, ${ry + rh / 2})`}>
        {Math.round(card.height * 1000)} mm ({blockCount.rows} filas)
      </text>

      {/* Openings overlay */}
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
        opCenterInSegment = Math.max(0, Math.min(1, opCenterInSegment));
        const opWidthPx = op.width * s;
        const opHeightPx = op.height * s;
        const sillH = op.sillHeight ?? 0;
        const rawOpX = rx + opCenterInSegment * rw - opWidthPx / 2;
        const opX = Math.max(rx, Math.min(rawOpX, rx + rw - opWidthPx));
        const opY = ry + rh - opHeightPx - sillH * s;
        const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';
        return (
          <g key={op.id} style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onOpeningClick(op); }}>
            <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
              fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
              stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
              strokeWidth={1.5} rx={2} />
            <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 4} textAnchor="middle"
              fontSize={10} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
              {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
            </text>
            <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 16} textAnchor="middle"
              fontSize={8} fill="hsl(var(--muted-foreground))" pointerEvents="none">
              {Math.round(op.width * 1000)}×{Math.round(op.height * 1000)}mm
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// Composite Wall Card — groups room walls along a building edge
// ──────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<string, string> = {
  top: 'Norte', right: 'Este', bottom: 'Sur', left: 'Oeste',
};

function CompositeWallCard({ compositeWall, plan, onOpeningClick }: {
  compositeWall: CompositeWall;
  plan: FloorPlanData;
  onOpeningClick: (op: OpeningData) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const cw = compositeWall;
  const maxHeight = Math.max(...cw.sections.map(s => s.height), 0);

  // SVG dimensions
  const padding = 40;
  const maxW = 600;
  const scale = Math.min((maxW - padding * 2) / cw.totalLength, 80);
  const svgW = cw.totalLength * scale + padding * 2;
  const svgH = maxHeight * scale + padding * 2 + 30;
  const rx = padding;
  const ry = padding / 2;
  const rw = cw.totalLength * scale;

  const renderCompositeSvg = (fsScale?: number) => {
    const s = fsScale || scale;
    const sw = cw.totalLength * s + padding * 2;
    const totalH = maxHeight * s;
    const sh = totalH + padding * 2 + 30;
    const rxs = padding;
    const rys = padding / 2;

    return (
      <svg
        width="100%"
        viewBox={`0 0 ${sw} ${sh}`}
        className="mx-auto"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '85vh' : '200px' }}
      >
        {/* Ground line */}
        <line x1={rxs - 5} y1={rys + totalH} x2={rxs + cw.totalLength * s + 5} y2={rys + totalH}
          stroke="hsl(25, 60%, 40%)" strokeWidth={1.5} />

        {/* Room sections */}
        {cw.sections.map((section, idx) => {
          const sx = rxs + section.startOffset * s;
          const sw2 = section.length * s;
          const sh2 = section.height * s;
          const sy = rys + totalH - sh2;

          const sectionFill = idx % 2 === 0 ? 'hsl(30, 30%, 92%)' : 'hsl(30, 25%, 88%)';

          return (
            <g key={`section-${idx}`}>
              {/* Section rectangle */}
              <rect x={sx} y={sy} width={sw2} height={sh2}
                fill={sectionFill} stroke="hsl(222, 47%, 30%)" strokeWidth={1.2} rx={1} />

              {/* Block pattern */}
              {plan.scaleMode === 'bloque' && (() => {
                const bwPx = (plan.blockLengthMm / 1000) * s;
                const bhPx = (plan.blockHeightMm / 1000) * s;
                if (bwPx < 3 || bhPx < 2) return null;
                const rows = Math.ceil(sh2 / bhPx);
                const cols = Math.ceil(sw2 / bwPx) + 1;
                const lines: React.ReactElement[] = [];
                for (let r = 1; r < rows; r++) {
                  const y = sy + sh2 - r * bhPx;
                  if (y <= sy) break;
                  lines.push(
                    <line key={`bh-${idx}-${r}`} x1={sx} y1={y} x2={sx + sw2} y2={y}
                      stroke="hsl(25, 30%, 65%)" strokeWidth={0.4} opacity={0.5} pointerEvents="none" />
                  );
                }
                for (let r = 0; r < rows; r++) {
                  const yTop = Math.max(sy, sy + sh2 - (r + 1) * bhPx);
                  const yBot = sy + sh2 - r * bhPx;
                  const offset = r % 2 === 0 ? 0 : bwPx / 2;
                  for (let c = 1; c < cols; c++) {
                    const x = sx + offset + c * bwPx;
                    if (x >= sx + sw2) break;
                    if (x <= sx) continue;
                    lines.push(
                      <line key={`bv-${idx}-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={Math.min(yBot, sy + sh2)}
                        stroke="hsl(25, 30%, 65%)" strokeWidth={0.3} opacity={0.4} pointerEvents="none" />
                    );
                  }
                }
                return <g>{lines}</g>;
              })()}

              {/* Section separator line */}
              {idx > 0 && (
                <line x1={sx} y1={rys} x2={sx} y2={rys + totalH}
                  stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="3 2" />
              )}

              {/* Room label */}
              <text x={sx + sw2 / 2} y={sy + 12} textAnchor="middle"
                fontSize={fsScale ? 10 : 7} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.7}
                pointerEvents="none">
                {section.roomName}
              </text>

              {/* Openings */}
              {section.openings.map(op => {
                const isHoriz = section.wallIndex === 1 || section.wallIndex === 3;
                const room = cw.sections.find(sec => sec.roomId === section.roomId);
                if (!room) return null;
                // Calculate opening position within this section
                const fullWallLen = isHoriz
                  ? (rooms_cache_ref?.find(r => r.id === section.roomId)?.width || section.length)
                  : (rooms_cache_ref?.find(r => r.id === section.roomId)?.length || section.length);
                const opCenterFraction = op.positionX;
                const opCenterInSection = opCenterFraction * fullWallLen;
                // Check if this opening is within the section bounds
                const opWidthPx = op.width * s;
                const opHeightPx = op.height * s;
                const sillH = op.sillHeight ?? 0;
                const opX = sx + (opCenterInSection / section.length) * sw2 - opWidthPx / 2;
                const opY = sy + sh2 - opHeightPx - sillH * s;
                const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';

                return (
                  <g key={op.id} style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); onOpeningClick(op); }}>
                    <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                      fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                      stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                      strokeWidth={1} rx={1} />
                    <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 3} textAnchor="middle"
                      fontSize={fsScale ? 9 : 6} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
                      {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Total dimension line */}
        <line x1={rxs} y1={rys + totalH + 12} x2={rxs + cw.totalLength * s} y2={rys + totalH + 12}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
        <line x1={rxs} y1={rys + totalH + 8} x2={rxs} y2={rys + totalH + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <line x1={rxs + cw.totalLength * s} y1={rys + totalH + 8} x2={rxs + cw.totalLength * s} y2={rys + totalH + 16}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <text x={rxs + cw.totalLength * s / 2} y={rys + totalH + 25} textAnchor="middle"
          fontSize={fsScale ? 11 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}>
          {cw.totalLength.toFixed(2)}m
        </text>

        {/* Height dimension */}
        <line x1={rxs - 12} y1={rys} x2={rxs - 12} y2={rys + totalH}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
        <line x1={rxs - 16} y1={rys} x2={rxs - 8} y2={rys} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <line x1={rxs - 16} y1={rys + totalH} x2={rxs - 8} y2={rys + totalH} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <text x={rxs - 18} y={rys + totalH / 2} textAnchor="middle"
          fontSize={fsScale ? 11 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}
          transform={`rotate(-90, ${rxs - 18}, ${rys + totalH / 2})`}>
          {maxHeight.toFixed(2)}m
        </text>

        {/* Corner labels */}
        <text x={rxs - 3} y={rys + totalH + 25} textAnchor="end"
          fontSize={fsScale ? 13 : 9} fill="hsl(var(--primary))" fontWeight={800}>
          {cw.startCorner.label}
        </text>
        <text x={rxs + cw.totalLength * s + 3} y={rys + totalH + 25} textAnchor="start"
          fontSize={fsScale ? 13 : 9} fill="hsl(var(--primary))" fontWeight={800}>
          {cw.endCorner.label}
        </text>
      </svg>
    );
  };

  // Avoid using a variable that doesn't exist in this scope
  // The openings are already calculated in CompositeWallSection, no need for room lookup
  const rooms_cache_ref: RoomData[] | null = null; // placeholder - openings already have positionX

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow group">
        <CardHeader className="py-2 px-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm font-bold">{cw.label}</CardTitle>
              <Badge variant="default" className="text-[9px] h-4">{SIDE_LABELS[cw.side] || cw.side}</Badge>
              <Badge variant="outline" className="text-[9px] h-4">{cw.totalLength.toFixed(2)}m</Badge>
              <Badge variant="secondary" className="text-[9px] h-4">{cw.sections.length} espacios</Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {cw.objectSummary.totalBlocks && (
                <Badge variant="outline" className="text-[9px] h-4 bg-accent/30">
                  {cw.objectSummary.totalBlocks.total} bloques
                </Badge>
              )}
              {cw.objectSummary.doors > 0 && (
                <Badge variant="outline" className="text-[9px] h-4">{cw.objectSummary.doors} puertas</Badge>
              )}
              {cw.objectSummary.windows > 0 && (
                <Badge variant="outline" className="text-[9px] h-4">{cw.objectSummary.windows} ventanas</Badge>
              )}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setFullscreen(true)} title="Ampliar">
                <Maximize2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {renderCompositeSvg()}
          {/* Object summary */}
          {cw.objectSummary.openingDetails.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5 pt-1 border-t border-border/30">
              {cw.objectSummary.openingDetails.map(od => (
                <Badge key={od.type} variant="outline" className="text-[9px] h-4">
                  {od.count}× {od.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="!max-w-none !w-screen !h-screen !m-0 !p-4 !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
              {cw.label}
              <Badge variant="default" className="text-xs">{SIDE_LABELS[cw.side]}</Badge>
              <Badge variant="outline" className="text-xs">{cw.totalLength.toFixed(2)}m × {maxHeight.toFixed(2)}m</Badge>
              <Badge variant="secondary" className="text-xs">{cw.sections.length} espacios</Badge>
              {cw.objectSummary.totalBlocks && (
                <Badge variant="outline" className="text-xs">{cw.objectSummary.totalBlocks.total} bloques</Badge>
              )}
              {cw.objectSummary.openingDetails.map(od => (
                <Badge key={od.type} variant="outline" className="text-xs">
                  {od.count}× {od.label}
                </Badge>
              ))}
            </DialogTitle>
            <DialogDescription className="sr-only">Vista a pantalla completa de pared compuesta</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center min-h-0">
            {renderCompositeSvg(Math.min(
              (window.innerHeight * 0.8) / maxHeight,
              (window.innerWidth * 0.9) / cw.totalLength
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  onUpdateOpening: (id: string, data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDeleteOpening: (id: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number; elevationGroup?: string | null }) => Promise<void>;
  saving: boolean;
}) {
  const [editingOp, setEditingOp] = useState<OpeningData | null>(null);
  // Use currentWallType (live from rooms state) if available, fallback to card snapshot
  const resolvedInitialType = (currentWallType || card.wall?.wallType || 'interior') as WallType;
  const [wallType, setWallType] = useState<WallType>(resolvedInitialType);
  const [wallTypeChanged, setWallTypeChanged] = useState(false);
  const [elevGroup, setElevGroup] = useState(card.elevationGroup || '');
  const [elevGroupChanged, setElevGroupChanged] = useState(false);

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

  const handleSaveOp = async (data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => {
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
            {Math.round(card.width * 1000)} mm × {Math.round(card.height * 1000)} mm
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

          {/* Elevation group assignment */}
          {card.wall && !card.wall.id.startsWith('temp-') && onUpdateWall && (
            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground">Grupo de alzado</p>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 text-xs flex-1"
                  placeholder="Ej: Fachada Norte, Interior..."
                  value={elevGroup}
                  onChange={e => { setElevGroup(e.target.value); setElevGroupChanged(true); }}
                />
                {elevGroupChanged && (
                  <Button size="sm" className="h-8 text-xs px-3" disabled={saving}
                    onClick={async () => {
                      if (!card.wall?.id || !onUpdateWall) return;
                      await onUpdateWall(card.wall.id, { elevationGroup: elevGroup.trim() || null });
                      setElevGroupChanged(false);
                    }}>
                    Guardar
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">Las paredes con el mismo nombre de grupo se mostrarán juntas en la vista "Por grupo"</p>
            </div>
          )}

          {/* Existing openings - use liveOpenings so add/delete are instantly reflected */}
          {(() => {
            const isHoriz = card.wall ? (card.wall.wallIndex === 1 || card.wall.wallIndex === 3) : true;
            const fullWallLen = card.room ? (isHoriz ? card.room.width : card.room.length) : card.width;
            return (
              <>
                {liveOpenings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Huecos ({liveOpenings.length})</p>
                    {liveOpenings.map(op => {
                      const leftEdgeMm = Math.round((op.positionX * fullWallLen - op.width / 2) * 1000);
                      return (
                        <div key={op.id} className="flex items-center gap-2 border border-border rounded-md p-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">
                              {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {Math.round(op.width * 1000)} × {Math.round(op.height * 1000)} mm · suelo: {Math.round((op.sillHeight ?? 0) * 1000)} mm · pos. {leftEdgeMm} mm
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
                      );
                    })}
                  </div>
                )}

                {/* Inline edit for selected opening */}
                {editingOp && (
                  <InlineOpeningEditor
                    opening={editingOp}
                    wallLen={fullWallLen}
                    onSave={handleSaveOp}
                    onCancel={() => setEditingOp(null)}
                    saving={saving}
                  />
                )}
              </>
            );
          })()}

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

function InlineOpeningEditor({ opening, wallLen, onSave, onCancel, saving }: {
  opening: OpeningData;
  wallLen?: number;
  onSave: (data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  // All UI in mm, stored in m
  const [widthMm, setWidthMm] = useState(Math.round(opening.width * 1000));
  const [heightMm, setHeightMm] = useState(Math.round(opening.height * 1000));
  const [sillHeightMm, setSillHeightMm] = useState(Math.round((opening.sillHeight ?? 0) * 1000));
  const [openingType, setOpeningType] = useState(opening.openingType);
  const wl = wallLen || 1;
  const initLeftMm = Math.round((opening.positionX * wl - opening.width / 2) * 1000);
  const [leftEdgeMm, setLeftEdgeMm] = useState(initLeftMm);
  const positionXFromMm = (mm: number, wMm: number) => wl > 0 ? ((mm + wMm / 2) / 1000) / wl : 0.5;

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
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Ancho (mm)</Label>
          <Input type="number" step="1" className="h-8 text-xs"
            value={widthMm} onChange={e => setWidthMm(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Alto (mm)</Label>
          <Input type="number" step="1" className="h-8 text-xs"
            value={heightMm} onChange={e => setHeightMm(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Dist. suelo (mm)</Label>
          <Input type="number" step="1" className="h-8 text-xs"
            value={sillHeightMm} onChange={e => setSillHeightMm(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Posición esq. izq. (mm desde borde izq.)</Label>
        <div className="flex items-center gap-2">
          <Input type="number" step="1" className="h-8 text-xs w-24"
            value={leftEdgeMm}
            onChange={e => setLeftEdgeMm(Number(e.target.value))} />
          <span className="text-[10px] text-muted-foreground">
            de {Math.round(wl * 1000)} mm
          </span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({
          width: widthMm / 1000,
          height: heightMm / 1000,
          sillHeight: sillHeightMm / 1000,
          positionX: positionXFromMm(leftEdgeMm, widthMm),
          openingType,
        })} disabled={saving}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

// Opening properties edit dialog (single click on opening)
function OpeningEditDialog({ open, onOpenChange, opening, wallLen, onSave, onDelete, saving }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opening: OpeningData;
  wallLen?: number;
  onSave: (data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}) {
  // All UI in mm, stored in m
  const [widthMm, setWidthMm] = useState(Math.round(opening.width * 1000));
  const [heightMm, setHeightMm] = useState(Math.round(opening.height * 1000));
  const [sillHeightMm, setSillHeightMm] = useState(Math.round((opening.sillHeight ?? 0) * 1000));
  const [openingType, setOpeningType] = useState(opening.openingType);
  const wl = wallLen || 1;
  const initLeftMm = Math.round((opening.positionX * wl - opening.width / 2) * 1000);
  const [leftEdgeMm, setLeftEdgeMm] = useState(initLeftMm);
  const positionXFromMm = (mm: number, wMm: number) => wl > 0 ? ((mm + wMm / 2) / 1000) / wl : 0.5;

  // Sync when opening changes
  useEffect(() => {
    setWidthMm(Math.round(opening.width * 1000));
    setHeightMm(Math.round(opening.height * 1000));
    setSillHeightMm(Math.round((opening.sillHeight ?? 0) * 1000));
    setOpeningType(opening.openingType);
    setLeftEdgeMm(Math.round((opening.positionX * wl - opening.width / 2) * 1000));
  }, [opening.id, opening.width, opening.height, opening.sillHeight, opening.positionX, opening.openingType, wl]);

  const handleSave = async () => {
    await onSave({
      width: widthMm / 1000,
      height: heightMm / 1000,
      sillHeight: sillHeightMm / 1000,
      positionX: positionXFromMm(leftEdgeMm, widthMm),
      openingType,
    });
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
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Ancho (mm)</Label>
              <Input type="number" step="1" className="h-8 text-xs"
                value={widthMm} onChange={e => setWidthMm(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Alto (mm)</Label>
              <Input type="number" step="1" className="h-8 text-xs"
                value={heightMm} onChange={e => setHeightMm(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Dist. suelo (mm)</Label>
              <Input type="number" step="1" className="h-8 text-xs"
                value={sillHeightMm} onChange={e => setSillHeightMm(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Posición esq. izq. (mm desde borde izq.)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" step="1" className="h-8 text-xs w-24"
                value={leftEdgeMm}
                onChange={e => setLeftEdgeMm(Number(e.target.value))} />
              <span className="text-[10px] text-muted-foreground">
                de {Math.round(wl * 1000)} mm
              </span>
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
