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
import { Plus, Trash2, Box, Layers, ArrowUpDown } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, computeWallSegments, autoClassifyWalls, generateExternalWallNames, isExteriorType, isInvisibleType, computeGroupPerimeterWalls, perimeterPositionToCell } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment, FloorLevel } from '@/lib/floor-plan-calculations';

interface ElevationsGridViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors?: FloorLevel[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
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
  // Extra data for detail dialog
  surfaceArea?: number;
  volume?: number;
  roomHeight?: number;
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
  plan, rooms, floors, onUpdateOpening, onAddOpening, onDeleteOpening, saving,
}: ElevationsGridViewerProps) {
  const [selectedOpening, setSelectedOpening] = useState<OpeningData | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<ElevationCard | null>(null);
  const [surfaceDialogOpen, setSurfaceDialogOpen] = useState(false);

  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);
  const perimeterWalls = useMemo(() => computeGroupPerimeterWalls(rooms), [rooms]);
  const groupedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    rooms.forEach(r => { if (r.groupId) ids.add(r.id); });
    return ids;
  }, [rooms]);

  // Build all elevation cards
  const cards: ElevationCard[] = useMemo(() => {
    const result: ElevationCard[] = [];

    // 1. Foundation card
    if (rooms.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rooms.forEach(r => {
        minX = Math.min(minX, r.posX);
        minY = Math.min(minY, r.posY);
        maxX = Math.max(maxX, r.posX + r.width);
        maxY = Math.max(maxY, r.posY + r.length);
      });
      const extT = plan.externalWallThickness;
      const foundW = (maxX - minX) + 2 * extT;
      const foundL = (maxY - minY) + 2 * extT;
      result.push({
        id: 'cimentacion',
        label: 'Cimentación',
        sublabel: `Toda la planta`,
        category: 'cimentacion',
        width: foundW,
        height: foundL,
        openings: [],
        canAddOpenings: false,
        fill: 'hsl(25, 30%, 88%)',
        stroke: 'hsl(25, 40%, 50%)',
        badgeLabel: 'Cimentación',
        badgeVariant: 'secondary',
        surfaceArea: foundW * foundL,
      });
    }

    // 2. Per-room surfaces: suelo, techo, paredes, volumen
    const processedGroupSurfaces = new Set<string>();
    rooms.forEach(room => {
      const roomH = room.height || plan.defaultHeight;
      const floorArea = room.width * room.length;

      // Grouped rooms: aggregate surfaces per group BUT still generate individual wall cards
      if (room.groupId) {
        if (!processedGroupSurfaces.has(room.groupId)) {
          processedGroupSurfaces.add(room.groupId);
          const gRooms = rooms.filter(r => r.groupId === room.groupId);
          const totalArea = gRooms.reduce((s, r) => s + r.width * r.length, 0);
          const gName = room.groupName || room.groupId;
          const sqSide = Math.sqrt(totalArea);

          if (gRooms.some(r => r.hasFloor !== false)) {
            result.push({
              id: `suelo-group-${room.groupId}`, label: 'Suelo', sublabel: gName,
              category: 'suelo', width: sqSide, height: sqSide, room, openings: [],
              canAddOpenings: false, fill: 'hsl(142, 40%, 90%)', stroke: 'hsl(142, 50%, 40%)',
              badgeLabel: `Suelo · ${totalArea.toFixed(1)}m²`, badgeVariant: 'secondary', surfaceArea: totalArea,
            });
          }
          if (gRooms.some(r => r.hasCeiling !== false || r.hasRoof)) {
            result.push({
              id: `techo-group-${room.groupId}`, label: 'Techo', sublabel: gName,
              category: 'techo', width: sqSide, height: sqSide, room, openings: [],
              canAddOpenings: false, fill: 'hsl(200, 30%, 92%)', stroke: 'hsl(200, 40%, 50%)',
              badgeLabel: 'Techo', badgeVariant: 'outline', surfaceArea: totalArea,
            });
          }
          result.push({
            id: `volumen-group-${room.groupId}`, label: 'Volumen', sublabel: gName,
            category: 'volumen', width: sqSide, height: roomH, room, openings: [],
            canAddOpenings: false, fill: 'hsl(280, 20%, 94%)', stroke: 'hsl(280, 30%, 55%)',
            badgeLabel: 'Volumen', badgeVariant: 'outline', surfaceArea: totalArea,
            volume: totalArea * roomH, roomHeight: roomH,
          });
        }
        // Continue to generate individual wall cards for this grouped room (don't return)
      }

      // Suelo - only if hasFloor
      if (room.hasFloor !== false) {
        result.push({
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
          badgeLabel: 'Suelo',
          badgeVariant: 'secondary',
          surfaceArea: floorArea,
        });
      }

      // Techo - only if hasCeiling or hasRoof
      if (room.hasCeiling !== false || room.hasRoof) {
        result.push({
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
          badgeLabel: room.hasCeiling !== false ? 'Techo' : 'Cubierta',
          badgeVariant: 'outline',
          surfaceArea: floorArea,
        });
      }

      // Volumen
      result.push({
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
        badgeLabel: 'Volumen',
        badgeVariant: 'outline',
        surfaceArea: floorArea,
        volume: floorArea * roomH,
        roomHeight: roomH,
      });

      // Paredes - one per visible segment
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        const wallHeight = getWallHeight(wall, room, plan);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const fullWallLen = isHoriz ? room.width : room.length;

        const visibleSegments = segments.map((s, i) => ({ ...s, idx: i })).filter(s => !isInvisibleType(s.segmentType));
        const hasMultiple = visibleSegments.length > 1;

        segments.forEach((seg, si) => {
          const segLen = seg.endMeters - seg.startMeters;

          const ownOpenings = wall.openings.filter(op => {
            const opCenter = op.positionX;
            return opCenter >= seg.startFraction - 0.01 && opCenter <= seg.endFraction + 0.01;
          });

          // Skip invisible segments ONLY if they have no openings on this wall
          if (isInvisibleType(seg.segmentType) && ownOpenings.length === 0) return;

          const visibleNumber = visibleSegments.findIndex(vs => vs.idx === si) + 1;
          const wallLabel = hasMultiple && visibleNumber > 0
            ? `${WALL_LABELS[wall.wallIndex]} ${visibleNumber}`
            : WALL_LABELS[wall.wallIndex];
          const isExternal = isExteriorType(seg.segmentType);
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-');

          result.push({
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
            fill: isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
            stroke: isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
            badgeLabel: isExternal ? (wallName ? `Ext. ${wallName}` : 'Externa') : 'Interna',
            badgeVariant: isExternal ? 'default' : 'outline',
            surfaceArea: segLen * wallHeight,
          });
        });
      });
    });

    // 2b. Perimeter wall cards for grouped spaces
    perimeterWalls.forEach(pw => {
      const firstRoom = rooms.find(r => r.id === pw.cellSegments[0]?.roomId);
      if (!firstRoom) return;
      const wallHeight = firstRoom.height || plan.defaultHeight;
      const isExternal = isExteriorType(pw.wallType);
      const sideLabels: Record<string, string> = { top: 'Superior', right: 'Derecha', bottom: 'Inferior', left: 'Izquierda' };
      const mappedOpenings: OpeningData[] = pw.openings.map(op => ({ ...op, positionX: op.perimeterPositionX }));
      const centerCell = perimeterPositionToCell(pw, 0.5, rooms);
      const firstWall = firstRoom.walls.find(w => w.wallIndex === pw.cellSegments[0]?.wallIndex);
      const targetWallId = centerCell?.wallId || firstWall?.id;
      const canAdd = targetWallId ? !targetWallId.startsWith('temp-') : false;

      result.push({
        id: `pw-${pw.id}`,
        label: `Pared ${sideLabels[pw.side] || pw.side}`,
        sublabel: pw.groupName,
        category: 'pared',
        width: pw.length,
        height: wallHeight,
        room: firstRoom,
        wall: firstWall,
        openings: mappedOpenings,
        wallId: targetWallId,
        canAddOpenings: canAdd,
        fill: isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
        stroke: isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
        badgeLabel: `${isExternal ? 'Ext.' : 'Int.'} ${pw.length.toFixed(1)}m · ${pw.cellSegments.length} celdas`,
        badgeVariant: isExternal ? 'default' : 'outline' as const,
        surfaceArea: pw.length * wallHeight,
      });
    });

    // 3. Roof cards (faldones)
    if (rooms.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rooms.forEach(r => {
        minX = Math.min(minX, r.posX);
        minY = Math.min(minY, r.posY);
        maxX = Math.max(maxX, r.posX + r.width);
        maxY = Math.max(maxY, r.posY + r.length);
      });
      const ov = plan.roofOverhang;
      const baseW = (maxX - minX) + 2 * plan.externalWallThickness + 2 * ov;
      const baseL = (maxY - minY) + 2 * plan.externalWallThickness + 2 * ov;
      const slope = plan.roofSlopePercent / 100;

      if (plan.roofType === 'plana') {
        result.push({
          id: 'roof-flat',
          label: 'Tejado Plano',
          category: 'tejado',
          width: baseW,
          height: baseL,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(200, 20%, 90%)',
          stroke: 'hsl(200, 30%, 50%)',
          badgeLabel: 'Cubierta',
          badgeVariant: 'secondary',
          surfaceArea: baseW * baseL,
        });
      } else if (plan.roofType === 'dos_aguas') {
        const halfW = baseW / 2;
        const rise = halfW * slope;
        const slopeLen = Math.sqrt(halfW * halfW + rise * rise);
        ['Faldón Izquierdo', 'Faldón Derecho'].forEach((lbl, i) => {
          result.push({
            id: `roof-slope-${i}`,
            label: lbl,
            sublabel: 'Dos Aguas',
            category: 'tejado',
            width: baseL,
            height: slopeLen,
            openings: [],
            canAddOpenings: false,
            fill: 'hsl(15, 40%, 88%)',
            stroke: 'hsl(15, 50%, 45%)',
            badgeLabel: 'Cubierta',
            badgeVariant: 'secondary',
            surfaceArea: baseL * slopeLen,
          });
        });
      } else {
        const halfW = baseW / 2;
        const halfL = baseL / 2;
        const riseW = halfW * slope;
        const riseL = halfL * slope;
        const slopeLenW = Math.sqrt(halfW * halfW + riseW * riseW);
        const slopeLenL = Math.sqrt(halfL * halfL + riseL * riseL);
        const labels = ['Faldón Frontal', 'Faldón Trasero', 'Faldón Izquierdo', 'Faldón Derecho'];
        const widths = [baseW, baseW, baseL, baseL];
        const heights = [slopeLenL, slopeLenL, slopeLenW, slopeLenW];
        labels.forEach((lbl, i) => {
          result.push({
            id: `roof-slope-${i}`,
            label: lbl,
            sublabel: 'Cuatro Aguas',
            category: 'tejado',
            width: widths[i],
            height: heights[i],
            openings: [],
            canAddOpenings: false,
            fill: 'hsl(15, 40%, 88%)',
            stroke: 'hsl(15, 50%, 45%)',
            badgeLabel: 'Cubierta',
            badgeVariant: 'secondary',
            surfaceArea: widths[i] * heights[i],
          });
        });
      }
    }

    return result;
  }, [rooms, plan, wallSegmentsMap, wallClassification, externalWallNames]);

  const handleOpeningClick = useCallback((op: OpeningData) => {
    setSelectedOpening(op);
    setEditDialogOpen(true);
  }, []);

  const handleSaveOpening = useCallback(async (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => {
    if (!selectedOpening) return;
    await onUpdateOpening(selectedOpening.id, data);
    setSelectedOpening(prev => prev ? { ...prev, ...data } as OpeningData : null);
  }, [selectedOpening, onUpdateOpening]);

  const handleCardClick = useCallback((card: ElevationCard) => {
    setSelectedSurface(card);
    setSurfaceDialogOpen(true);
  }, []);

  // Group cards by floor > room
  const groupedByFloor = useMemo(() => {
    const cimentacion = cards.filter(c => c.category === 'cimentacion');
    const tejado = cards.filter(c => c.category === 'tejado');

    // Build floor-based hierarchy
    const sortedFloors = floors ? [...floors].sort((a, b) => a.orderIndex - b.orderIndex) : [];
    
    const floorGroups: Array<{ floorId: string; floorName: string; roomGroups: Map<string, ElevationCard[]> }> = [];

    if (sortedFloors.length > 0) {
      sortedFloors.forEach(floor => {
        const floorRoomIds = new Set(rooms.filter(r => r.floorId === floor.id).map(r => r.name));
        const roomMap = new Map<string, ElevationCard[]>();
        cards.forEach(c => {
          if (c.category === 'cimentacion' || c.category === 'tejado') return;
          const roomName = c.sublabel || 'Sin estancia';
          if (!floorRoomIds.has(roomName)) return;
          if (!roomMap.has(roomName)) roomMap.set(roomName, []);
          roomMap.get(roomName)!.push(c);
        });
        if (roomMap.size > 0) {
          floorGroups.push({ floorId: floor.id, floorName: floor.name, roomGroups: roomMap });
        }
      });

      // Unassigned rooms
      const assignedRoomNames = new Set(
        rooms.filter(r => r.floorId && sortedFloors.some(f => f.id === r.floorId)).map(r => r.name)
      );
      const unassignedMap = new Map<string, ElevationCard[]>();
      cards.forEach(c => {
        if (c.category === 'cimentacion' || c.category === 'tejado') return;
        const roomName = c.sublabel || 'Sin estancia';
        if (assignedRoomNames.has(roomName)) return;
        if (!unassignedMap.has(roomName)) unassignedMap.set(roomName, []);
        unassignedMap.get(roomName)!.push(c);
      });
      if (unassignedMap.size > 0) {
        floorGroups.push({ floorId: 'unassigned', floorName: 'Sin nivel asignado', roomGroups: unassignedMap });
      }
    } else {
      // No floors defined: flat list grouped by room
      const roomMap = new Map<string, ElevationCard[]>();
      cards.forEach(c => {
        if (c.category === 'cimentacion' || c.category === 'tejado') return;
        const roomName = c.sublabel || 'Sin estancia';
        if (!roomMap.has(roomName)) roomMap.set(roomName, []);
        roomMap.get(roomName)!.push(c);
      });
      floorGroups.push({ floorId: 'all', floorName: '', roomGroups: roomMap });
    }

    return { cimentacion, tejado, floorGroups };
  }, [cards, floors, rooms]);

  return (
    <div className="space-y-6">
      {/* Foundation */}
      {groupedByFloor.cimentacion.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Cimentación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupedByFloor.cimentacion.map(card => (
              <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onCardClick={handleCardClick} saving={saving} />
            ))}
          </div>
        </div>
      )}

      {/* Floor > Room > Surfaces hierarchy */}
      {groupedByFloor.floorGroups.map(({ floorId, floorName, roomGroups }) => {
        const hasFloorHeader = floorName !== '';
        const floorContent = (
          <div className="space-y-3">
            {Array.from(roomGroups.entries()).map(([roomName, roomCards]) => {
              const order: SurfaceCategory[] = ['suelo', 'techo', 'volumen', 'pared'];
              const sorted = [...roomCards].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
              const wallCount = sorted.filter(c => c.category === 'pared').length;
              return (
                <Collapsible key={roomName} defaultOpen={false}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <h4 className="text-sm font-semibold text-muted-foreground">{roomName}</h4>
                    <Badge variant="outline" className="text-[10px] h-4">{sorted.length} sup. / {wallCount} paredes</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2 ml-4">
                      {sorted.map(card => (
                        <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onCardClick={handleCardClick} saving={saving} />
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
            <Collapsible key={floorId} defaultOpen={true}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1.5 transition-colors border-b border-border/50 mb-2">
                <ChevronRight className="h-4 w-4 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                <h3 className="text-sm font-bold text-foreground">{floorName}</h3>
                <Badge variant="secondary" className="text-[10px] h-4">{roomGroups.size} espacios</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-2">
                {floorContent}
              </CollapsibleContent>
            </Collapsible>
          );
        }

        return <div key={floorId}>{floorContent}</div>;
      })}

      {/* Roof */}
      {groupedByFloor.tejado.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Tejado</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupedByFloor.tejado.map(card => (
              <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onCardClick={handleCardClick} saving={saving} />
            ))}
          </div>
        </div>
      )}

      {/* Opening edit dialog */}
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

      {/* Surface detail dialog */}
      {selectedSurface && (
        <SurfaceDetailDialog
          open={surfaceDialogOpen}
          onOpenChange={setSurfaceDialogOpen}
          card={selectedSurface}
        />
      )}
    </div>
  );
}

// Individual elevation card
function ElevationCardView({ card, onOpeningClick, onAddOpening, onCardClick, saving }: {
  card: ElevationCard;
  onOpeningClick: (op: OpeningData) => void;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number) => Promise<void>;
  onCardClick: (card: ElevationCard) => void;
  saving: boolean;
}) {
  const scale = Math.min(CARD_SCALE, (MAX_CARD_WIDTH - CARD_PADDING * 2 - 30) / card.width);
  const svgW = card.width * scale + CARD_PADDING * 2 + 30;
  const svgH = card.height * scale + CARD_PADDING * 2 + 30;
  const rectX = CARD_PADDING + 20;
  const rectY = CARD_PADDING;
  const rectW = card.width * scale;
  const rectH = card.height * scale;
  const area = (card.width * card.height).toFixed(2);

  const categoryIcon = card.category === 'suelo' ? <Layers className="h-3 w-3" />
    : card.category === 'techo' ? <ArrowUpDown className="h-3 w-3" />
    : card.category === 'volumen' ? <Box className="h-3 w-3" />
    : null;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onCardClick(card)}>
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
            <Badge variant="outline" className="text-[9px] h-4">
              {area}m²
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {/* Volume card shows text info instead of SVG */}
        {card.category === 'volumen' ? (
          <div className="flex flex-col items-center justify-center py-4 gap-1 text-center">
            <Box className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-lg font-bold text-foreground">{card.volume?.toFixed(2)} m³</p>
            <p className="text-[10px] text-muted-foreground">
              {card.width.toFixed(2)} × {(card.room?.length || 0).toFixed(2)} × {card.roomHeight?.toFixed(2)} m
            </p>
          </div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="mx-auto"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: '180px' }}
          >
            {/* Ground line for walls */}
            {card.category === 'pared' && (
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

        {/* Add openings for wall cards */}
        {card.canAddOpenings && card.wallId && (
          <div className="flex items-center gap-1 flex-wrap mt-1 pt-1 border-t border-border/30"
            onClick={e => e.stopPropagation()}>
            {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
              <Button key={key} variant="ghost" size="sm" className="text-[9px] h-5 px-1.5"
                onClick={() => onAddOpening(card.wallId!, key, preset.width, preset.height, preset.sillHeight)}
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

// Surface detail dialog - ficha de la superficie
function SurfaceDetailDialog({ open, onOpenChange, card }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: ElevationCard;
}) {
  const categoryLabels: Record<SurfaceCategory, string> = {
    cimentacion: 'Cimentación',
    suelo: 'Suelo',
    techo: 'Techo',
    pared: 'Pared',
    volumen: 'Volumen',
    tejado: 'Tejado',
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
            Ficha de {categoryLabels[card.category]}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">Categoría</p>
              <p className="text-sm font-medium">{categoryLabels[card.category]}</p>
            </div>
            {card.badgeLabel && (
              <div className="rounded-md border border-border p-2.5">
                <p className="text-[10px] text-muted-foreground">Tipo</p>
                <p className="text-sm font-medium">{card.badgeLabel}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">
                {card.category === 'pared' || card.category === 'tejado' ? 'Largo' : 'Ancho'}
              </p>
              <p className="text-sm font-semibold">{card.width.toFixed(2)} m</p>
            </div>
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">
                {card.category === 'pared' ? 'Alto' : card.category === 'tejado' ? 'Pendiente' : 'Largo'}
              </p>
              <p className="text-sm font-semibold">{card.height.toFixed(2)} m</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-2.5 bg-muted/30">
              <p className="text-[10px] text-muted-foreground">Superficie</p>
              <p className="text-sm font-bold">{(card.surfaceArea || card.width * card.height).toFixed(2)} m²</p>
            </div>
            {card.volume !== undefined && (
              <div className="rounded-md border border-border p-2.5 bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Volumen</p>
                <p className="text-sm font-bold">{card.volume.toFixed(2)} m³</p>
              </div>
            )}
          </div>

          {card.roomHeight !== undefined && card.category === 'volumen' && card.room && (
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">Dimensiones</p>
              <p className="text-sm">
                {card.room.width.toFixed(2)} × {card.room.length.toFixed(2)} × {card.roomHeight.toFixed(2)} m
              </p>
            </div>
          )}

          {card.openings.length > 0 && (
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground mb-1">Huecos ({card.openings.length})</p>
              <div className="space-y-1">
                {card.openings.map(op => (
                  <div key={op.id} className="flex items-center justify-between text-xs">
                    <span>{OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}</span>
                    <span className="text-muted-foreground">{op.width.toFixed(2)} × {op.height.toFixed(2)} m</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {card.segment && (
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">Tramo</p>
              <p className="text-xs">
                Desde {card.segment.startMeters.toFixed(2)}m hasta {card.segment.endMeters.toFixed(2)}m
                ({isExteriorType(card.segment.segmentType) ? 'exterior' : 'interior'})
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic pt-1">
            El contenido detallado de este formulario se definirá próximamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Opening properties edit dialog
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

  useEffect(() => {
    setWidth(opening.width);
    setHeight(opening.height);
    setPositionX(opening.positionX);
    setOpeningType(opening.openingType);
  }, [opening]);

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
