import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Box, Layers, ArrowUpDown, Maximize2, Merge, Unlink, Map as MapIcon, Printer, FileDown, Ruler } from 'lucide-react';
import jsPDF from 'jspdf';
import { OPENING_PRESETS, WALL_LABELS, WALL_SIDE_LETTERS, computeWallSegments, autoClassifyWalls, generateExternalWallNames, isExteriorType, isInvisibleType, computeBuildingOutline, computeCompositeWalls, computeCompositeWallsFromCorners, calcBajoCubiertaWallHeight, getBlockDimensions, getEffectiveRidgeHeight } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment, FloorLevel, WallType, BlockGroupData, OutlineVertex, CompositeWall } from '@/lib/floor-plan-calculations';
import type { CustomCorner } from '@/hooks/useFloorPlan';

interface ElevationsGridViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors?: FloorLevel[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number; elevationGroup?: string | null }) => Promise<void>;
  onUpdateWallSegmentType?: (wallId: string, segmentIndex: number, segmentType: WallType) => Promise<void>;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  onUpdateBlockGroup?: (blockGroupId: string, data: { name?: string; color?: string; spanCols?: number; spanRows?: number }) => Promise<void>;
  saving: boolean;
  focusWallId?: string;
  autoEditWallId?: string;
  budgetName?: string;
  customCorners?: CustomCorner[];
}

type SurfaceCategory = 'cimentacion' | 'suelo' | 'techo' | 'pared' | 'volumen' | 'tejado' | 'faldon';

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
  isGable?: boolean;
  gablePeakH?: number; // peak height of gable triangle in meters
}

// Group of 6 surfaces for a single room
interface RoomElevationGroup {
  room: RoomData;
  cards: ElevationCard[];
}

const CARD_SCALE = 60;
const CARD_PADDING = 20;
const MAX_CARD_WIDTH = 400;

/** Check if a composite section is invisible, using effectiveWallType when available */
function isSectionWallInvisible(section: { wall: WallData; effectiveWallType?: string }): boolean {
  return isInvisibleType((section.effectiveWallType || section.wall.wallType) as string);
}

function getOpeningSillHeight(op: OpeningData): number {
  // Use the stored sillHeight (meters from floor)
  return op.sillHeight ?? 0;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  if (wall.height != null && wall.height > 0) return wall.height;
  if (room.height != null && room.height > 0) return room.height;
  if (room.height === 0) return 0;
  return plan.defaultHeight;
}

/** Check if a room is bajo cubierta (height=0 or undefined with dos_aguas roof, or floor level is bajo_cubierta) */
function isBajoCubierta(room: RoomData, plan: FloorPlanData, floors?: FloorLevel[]): boolean {
  if (plan.roofType !== 'dos_aguas') return false;
  // Check room height
  if (room.height === 0) return true;
  // Check floor level
  if (room.floorId && floors) {
    const floor = floors.find(f => f.id === room.floorId);
    if (floor && (floor.level === 'bajo_cubierta' || floor.name.toLowerCase().includes('bajo cubierta'))) return true;
  }
  return false;
}

/** Calculate gable peak height for a bajo cubierta room (between walls, excluding eaves) */
function getGablePeakHeight(plan: FloorPlanData, rooms: RoomData[]): number {
  let minX = Infinity, maxX = Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.posX);
    maxX = Math.max(maxX !== Infinity ? maxX : r.posX + r.width, r.posX + r.width);
  });
  if (minX === Infinity) return 0;
  // Gable is strictly between wall perimeter, NO eave overhang
  const totalWidth = (maxX - minX) + 2 * plan.externalWallThickness;
  const halfWidth = totalWidth / 2;
  return getEffectiveRidgeHeight(plan, halfWidth);
}

export function ElevationsGridViewer({
  plan, rooms, floors, onUpdateOpening, onAddOpening, onDeleteOpening, onUpdateWall, onUpdateWallSegmentType,
  onAddBlockGroup, onDeleteBlockGroup, onUpdateBlockGroup, saving, focusWallId, autoEditWallId, budgetName,
  customCorners,
}: ElevationsGridViewerProps) {
  const [selectedOpening, setSelectedOpening] = useState<OpeningData | null>(null);
  const [selectedOpeningWallLen, setSelectedOpeningWallLen] = useState<number>(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCard, setEditCard] = useState<ElevationCard | null>(null);
  const [editCardDialogOpen, setEditCardDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'rooms' | 'groups' | 'composite' | 'total'>('rooms');
  // showFaldonesWithAleros removed — faldones are now in Volúmenes tab

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

  // Compute wall segments per floor to avoid cross-floor false adjacencies
  const wallSegmentsMap = useMemo(() => {
    if (!floors || floors.length <= 1) {
      return computeWallSegments(rooms);
    }
    // Compute segments separately per floor, then merge maps
    const merged = new Map<string, WallSegment[]>();
    floors.forEach(floor => {
      const floorRooms = rooms.filter(r => r.floorId === floor.id);
      const floorMap = computeWallSegments(floorRooms);
      floorMap.forEach((v, k) => merged.set(k, v));
    });
    // Also handle rooms without a floorId
    const orphanRooms = rooms.filter(r => !r.floorId);
    if (orphanRooms.length > 0) {
      const orphanMap = computeWallSegments(orphanRooms);
      orphanMap.forEach((v, k) => merged.set(k, v));
    }
    return merged;
  }, [rooms, floors]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms, plan), [rooms, plan]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Building outline & composite walls — use user-defined corners when available
  const cellSizeM = plan.scaleMode === 'bloque' ? plan.blockLengthMm / 1000 : 1;

  const ensureMainPerimeterComposites = useCallback((composites: CompositeWall[], floorCorners: CustomCorner[] = []) => {
    if (composites.length === 0) return composites;

    const mains = floorCorners.filter(c => c.isMain);
    if (mains.length < 4) return composites;

    const byPos = new Map(mains.map(c => [c.mainPosition, c] as const));
    const tl = byPos.get('TL');
    const tr = byPos.get('TR');
    const br = byPos.get('BR');
    const bl = byPos.get('BL');
    if (!tl || !tr || !br || !bl) return composites;

    const defs: Array<{
      side: 'top' | 'right' | 'bottom' | 'left';
      start: CustomCorner;
      end: CustomCorner;
    }> = [
      { side: 'top', start: tl, end: tr },
      { side: 'right', start: tr, end: br },
      { side: 'bottom', start: br, end: bl },
      { side: 'left', start: bl, end: tl },
    ];

    const additions: CompositeWall[] = [];

    defs.forEach(({ side, start, end }) => {
      const fullLabel = `${start.label}-${end.label}`;
      const alreadyExists = composites.some(cw => cw.isExterior && cw.label === fullLabel);
      if (alreadyExists) return;

      const split = composites.filter(cw => cw.isExterior && cw.side === side);
      if (split.length === 0) return;

      const ordered = [...split].sort((a, b) => {
        const aPos = side === 'top' || side === 'bottom' ? a.startCorner.x : a.startCorner.y;
        const bPos = side === 'top' || side === 'bottom' ? b.startCorner.x : b.startCorner.y;
        return side === 'bottom' || side === 'left' ? bPos - aPos : aPos - bPos;
      });

      const mergedSections = [] as CompositeWall['sections'];
      let totalLength = 0;
      let doors = 0;
      let windows = 0;
      const openingCounts: Record<string, number> = {};

      ordered.forEach(cw => {
        cw.sections.forEach(s => {
          mergedSections.push({ ...s, startOffset: totalLength + s.startOffset });
        });
        totalLength += cw.totalLength;
        doors += cw.objectSummary.doors;
        windows += cw.objectSummary.windows;
        cw.objectSummary.openingDetails.forEach(od => {
          openingCounts[od.type] = (openingCounts[od.type] || 0) + od.count;
        });
      });

      let runningOffset = 0;
      const sections = mergedSections.map(s => {
        const next = { ...s, startOffset: runningOffset };
        runningOffset += s.length;
        return next;
      });

      const openingDetails = Object.entries(openingCounts).map(([type, count]) => ({
        type,
        count,
        label: OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type,
      }));

      let totalBlocks: { cols: number; rows: number; total: number } | undefined;
      if (plan.scaleMode === 'bloque') {
        const bw = plan.blockLengthMm / 1000;
        const bh = plan.blockHeightMm / 1000;
        if (bw > 0 && bh > 0 && sections.length > 0) {
          const maxH = Math.max(...sections.map(s => s.height));
          totalBlocks = {
            cols: Math.ceil(totalLength / bw),
            rows: Math.ceil(maxH / bh),
            total: Math.ceil(totalLength / bw) * Math.ceil(maxH / bh),
          };
        }
      }

      additions.push({
        id: `cw-ui-full-${start.label}-${end.label}`,
        label: fullLabel,
        startCorner: { x: (start.col - 1) * cellSizeM, y: (start.row - 1) * cellSizeM, label: start.label },
        endCorner: { x: (end.col - 1) * cellSizeM, y: (end.row - 1) * cellSizeM, label: end.label },
        side,
        totalLength,
        sections,
        isExterior: true,
        objectSummary: { totalBlocks, doors, windows, openingDetails },
      });
    });

    return additions.length > 0 ? [...composites, ...additions] : composites;
  }, [cellSizeM, plan.blockHeightMm, plan.blockLengthMm, plan.scaleMode]);

  const perFloorComposites = useMemo(() => {
    const hasUserCorners = customCorners && customCorners.length > 0;

    const filterHidden = (composites: CompositeWall[]) =>
      composites.filter(cw => !cw.sections.every(s => s.wall.elevationGroup === '__hidden__'));

    if (!floors || floors.length <= 1) {
      // Single floor or no floors: compute from all rooms
      const composites = hasUserCorners
        ? computeCompositeWallsFromCorners(rooms, plan, customCorners!, cellSizeM)
        : (() => { const outline = computeBuildingOutline(rooms); return computeCompositeWalls(rooms, outline, plan); })();
      const visible = filterHidden(composites);
      return [{ floorId: 'all', floorName: '', composites: ensureMainPerimeterComposites(visible, customCorners || []) }];
    }
    const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);
    return sortedFloors.map(floor => {
      const floorRooms = rooms.filter(r => r.floorId === floor.id);
      if (floorRooms.length === 0) return { floorId: floor.id, floorName: floor.name, composites: [] as CompositeWall[] };
      // Filter custom corners STRICTLY by floorId — never leak between levels
      const floorCorners = hasUserCorners
        ? customCorners!.filter(c => c.floorId === floor.id)
        : [];
      const hasFloorCorners = floorCorners.length > 0;
      const composites = hasFloorCorners
        ? computeCompositeWallsFromCorners(floorRooms, plan, floorCorners, cellSizeM)
        : (() => { const outline = computeBuildingOutline(floorRooms); return computeCompositeWalls(floorRooms, outline, plan); })();
      const visible = filterHidden(composites);
      return { floorId: floor.id, floorName: floor.name, composites: ensureMainPerimeterComposites(visible, floorCorners) };
    }).filter(f => f.composites.length > 0);
  }, [rooms, floors, plan, customCorners, cellSizeM, ensureMainPerimeterComposites]);

  // Flat list of all composite walls (for counting)
  const allCompositeWalls = useMemo(() => perFloorComposites.flatMap(f => f.composites), [perFloorComposites]);

  // Building outline for display (global, for the outline label)
  const buildingOutline = useMemo(() => computeBuildingOutline(rooms), [rooms]);

  // Gable peak height for bajo cubierta rooms
  const gablePeakHeight = useMemo(() => getGablePeakHeight(plan, rooms), [plan, rooms]);

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

      // Detect bajo cubierta gable
      const roomIsBajoCubierta = isBajoCubierta(room, plan, floors);
      const roomGablePeakH = roomIsBajoCubierta ? gablePeakHeight : 0;

      // 4 Walls (always all 4, including invisible ones)
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        let wallHeight = getWallHeight(wall, room, plan);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const fullWallLen = isHoriz ? room.width : room.length;

        // Gable walls (hastiales): wallIndex 2 (BC) and 4 (DA) in bajo cubierta
        const isGableWall = roomIsBajoCubierta && (wall.wallIndex === 2 || wall.wallIndex === 4) && !isInvisibleType(wall.wallType as string);
        if (isGableWall) {
          wallHeight = roomGablePeakH; // triangle height = peak height
        }

        // Non-gable walls of bajo cubierta rooms: calculate height from roof slope
        // If the calculated height is 0 the wall sits at the building edge where the
        // roof simply rests on the lower level — there is NO wall to render.
        let bajoCubiertaZeroHeight = false;
        if (roomIsBajoCubierta && !isGableWall) {
          const autoH = calcBajoCubiertaWallHeight(room, wall.wallIndex, plan, rooms);
          wallHeight = autoH ?? 0;
          if (wallHeight <= 0) {
            wallHeight = 0;
            bajoCubiertaZeroHeight = true;
          }
        }

        if (segments.length === 0) {
          const invisible = isInvisibleType(wall.wallType as string) || bajoCubiertaZeroHeight;
          const isExternal = isExteriorType(wall.wallType as string);
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-') && !invisible;
          const gableArea = isGableWall ? (fullWallLen * roomGablePeakH) / 2 : 0;
          const bajoCubiertaLabel = bajoCubiertaZeroHeight
            ? `${WALL_LABELS[wall.wallIndex]} (Sin pared — faldón)`
            : roomIsBajoCubierta && !isGableWall
            ? `${WALL_LABELS[wall.wallIndex]} (h=${Math.round(wallHeight * 1000)}mm)`
            : isGableWall ? `${WALL_LABELS[wall.wallIndex]} (Hastial)` : `${WALL_LABELS[wall.wallIndex]} (${wall.wallIndex})`;
          cards.push({
            id: `wall-${room.id}-${wall.wallIndex}-noseg`,
            label: bajoCubiertaLabel,
            sublabel: room.name,
            category: 'pared',
            width: fullWallLen,
            height: Math.max(wallHeight, 0.01),
            room,
            wall,
            openings: bajoCubiertaZeroHeight ? [] : wall.openings,
            wallId: wall.id,
            canAddOpenings: canAdd && wallHeight > 0,
            isInvisible: invisible,
            fill: invisible ? 'hsl(0, 0%, 96%)' : isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
            stroke: invisible ? 'hsl(0, 0%, 70%)' : isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
            badgeLabel: bajoCubiertaZeroHeight ? 'Sin pared (faldón)' : invisible ? 'Invisible' : isExternal ? (wallName ? `Ext. ${wallName}` : 'Externa') : 'Interna',
            badgeVariant: invisible ? 'outline' : isExternal ? 'default' : 'outline',
            surfaceArea: isGableWall ? gableArea : (invisible ? 0 : fullWallLen * wallHeight),
            elevationGroup: wall.elevationGroup,
            isGable: isGableWall,
            gablePeakH: isGableWall ? roomGablePeakH : undefined,
          });
          return;
        }

        segments.forEach((seg, si) => {
          const segLen = seg.endMeters - seg.startMeters;
          // Use the segment's computed type, NOT the wall's stored type
          const displayType = segments.length > 1 ? seg.segmentType : (wall.wallType as string);
          const invisible = isInvisibleType(displayType) || bajoCubiertaZeroHeight;
          const ownOpenings = wall.openings.filter(op => {
            return op.positionX >= seg.startFraction - 0.05 && op.positionX <= seg.endFraction + 0.05;
          });

          const isExternal = isExteriorType(displayType);
          const visibleSegCount = segments.filter(s => !isInvisibleType(s.segmentType)).length;
          const wallLabel = bajoCubiertaZeroHeight
            ? `${WALL_LABELS[wall.wallIndex]} (Sin pared — faldón)`
            : isGableWall
            ? `${WALL_LABELS[wall.wallIndex]} (Hastial)`
            : roomIsBajoCubierta
              ? `${WALL_LABELS[wall.wallIndex]} (h=${Math.round(wallHeight * 1000)}mm)`
              : (segments.length > 1 ? `${WALL_LABELS[wall.wallIndex]} (${wall.wallIndex}${si + 1})` : `${WALL_LABELS[wall.wallIndex]} (${wall.wallIndex})`);
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-') && !invisible && wallHeight > 0;

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

          const gableArea = isGableWall ? (segLen * roomGablePeakH) / 2 : 0;
          cards.push({
            id: `wall-${room.id}-${wall.wallIndex}-${si}`,
            label: wallLabel,
            sublabel: room.name,
            category: 'pared',
            width: segLen,
            height: Math.max(wallHeight, 0.01),
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
            surfaceArea: isGableWall ? gableArea : (invisible ? 0 : segLen * wallHeight),
            elevationGroup: wall.elevationGroup,
            isGable: isGableWall,
            gablePeakH: isGableWall ? roomGablePeakH : undefined,
          });
        });
      });

      // Faldones moved to Volúmenes tab — no longer shown in Alzados

      return { room, cards };
    });
  }, [rooms, plan, floors, wallSegmentsMap, wallClassification, externalWallNames]);

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

  // Compute Total Elevations: stack floors by building side
  const totalElevations = useMemo(() => {
    if (perFloorComposites.length < 2) return [];
    const TOTAL_SIDE_LABELS: Record<string, string> = {
      top: 'Alzado Superior', right: 'Alzado Derecha', bottom: 'Alzado Inferior', left: 'Alzado Izquierdo',
    };
    const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
    const result: Array<{
      side: 'top' | 'right' | 'bottom' | 'left';
      label: string;
      layers: Array<{ floorName: string; composites: CompositeWall[]; isGable: boolean }>;
    }> = [];
    sides.forEach(side => {
      const layers: Array<{ floorName: string; composites: CompositeWall[]; isGable: boolean }> = [];
      const sortedFloorComps = [...perFloorComposites];
      sortedFloorComps.forEach(({ floorName, composites }) => {
        // Find main perimeter wall for this side (A-B, B-C, C-D, D-A pattern)
        const sideComposites = composites.filter(cw => {
          if (cw.side !== side) return false;
          // Exclude interior cuts from total elevation (both corners have numeric suffix after letter)
          const hasNumSuffix = (lbl: string) => /[A-D]\d/.test(lbl.replace(/^\d+/, ''));
          return !(hasNumSuffix(cw.startCorner.label) && hasNumSuffix(cw.endCorner.label));
        });
        if (sideComposites.length > 0) {
          // Check if any section is a gable
          const isGable = sideComposites.some(cw => cw.sections.some(s => s.isGable));
          layers.push({ floorName, composites: sideComposites, isGable });
        }
      });
      if (layers.length >= 2) {
        result.push({ side, label: TOTAL_SIDE_LABELS[side], layers });
      }
    });
    return result;
  }, [perFloorComposites]);

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
        {allCompositeWalls.length > 0 && (
          <Button variant={viewMode === 'composite' ? 'default' : 'outline'} size="sm" className="text-xs h-7"
            onClick={() => setViewMode('composite')}>
            <MapIcon className="h-3 w-3 mr-1" /> Alzados de coordenadas ({allCompositeWalls.length})
          </Button>
        )}
        {perFloorComposites.length >= 2 && (
          <Button variant={viewMode === 'total' ? 'default' : 'outline'} size="sm" className="text-xs h-7"
            onClick={() => setViewMode('total')}>
            <ArrowUpDown className="h-3 w-3 mr-1" /> Nivel Total
          </Button>
        )}
        {viewMode === 'composite' && buildingOutline.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-2">
            Esquinas: {buildingOutline.map(v => v.label).join(' → ')} → {buildingOutline[0]?.label}
          </span>
        )}
        {/* Faldones toggle removed — now in Volúmenes tab */}
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
                      onUpdateWall={onUpdateWall}
                      onUpdateWallSegmentType={onUpdateWallSegmentType}
                      onUpdateOpening={onUpdateOpening}
                      onDeleteOpening={onDeleteOpening}
                      saving={saving}
                      budgetName={budgetName}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Composite walls view — now computed per floor */}
      {viewMode === 'composite' && allCompositeWalls.length > 0 && (
        <div className="space-y-4">
          {perFloorComposites.map(({ floorId, floorName, composites }) => {
            if (composites.length === 0) return null;

            // Group composites by side, separating perimeter from interior cuts
            const SIDE_ORDER: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
            const FACE_NAMES: Record<string, string> = { top: 'Cara Superior', right: 'Cara Derecha', bottom: 'Cara Inferior', left: 'Cara Izquierda' };
            const isInteriorCut = (cw2: CompositeWall) => !cw2.isExterior;
            const bySide = new Map<string, CompositeWall[]>();
            const interiorWalls: CompositeWall[] = [];
            composites.forEach(cw2 => {
              if (isInteriorCut(cw2)) {
                interiorWalls.push(cw2);
              } else {
                const s2 = cw2.side;
                if (!bySide.has(s2)) bySide.set(s2, []);
                bySide.get(s2)!.push(cw2);
              }
            });

            // Group interior walls into separate internal faces by shared intermediate marker
            const interiorFaceGroups: Array<{ name: string; walls: CompositeWall[] }> = [];
            if (interiorWalls.length > 0) {
              // Find shared intermediate markers to group interior cuts
              const markerToWalls = new Map<string, CompositeWall[]>();
              interiorWalls.forEach(iw => {
                // Extract intermediate markers (those with numeric suffix after letter, e.g. A1, In1, C1)
                const markers = [iw.startCorner.label, iw.endCorner.label];
                markers.forEach(m => {
                  if (!markerToWalls.has(m)) markerToWalls.set(m, []);
                  markerToWalls.get(m)!.push(iw);
                });
              });
              // Group walls that share any intermediate marker using union-find
              const wallToGroup = new Map<string, number>();
              let groupCounter = 0;
              interiorWalls.forEach(iw => {
                const markers = [iw.startCorner.label, iw.endCorner.label];
                let assignedGroup: number | null = null;
                markers.forEach(m => {
                  const related = markerToWalls.get(m) || [];
                  related.forEach(rw => {
                    const rg = wallToGroup.get(rw.id);
                    if (rg !== undefined && assignedGroup === null) assignedGroup = rg;
                  });
                });
                if (assignedGroup === null) assignedGroup = groupCounter++;
                wallToGroup.set(iw.id, assignedGroup);
                // Merge all related walls into same group
                markers.forEach(m => {
                  const related = markerToWalls.get(m) || [];
                  related.forEach(rw => {
                    const rg = wallToGroup.get(rw.id);
                    if (rg !== undefined && rg !== assignedGroup) {
                      // Reassign all walls in old group to new group
                      wallToGroup.forEach((v, k) => { if (v === rg) wallToGroup.set(k, assignedGroup!); });
                    }
                    wallToGroup.set(rw.id, assignedGroup!);
                  });
                });
              });
              // Collect groups
              const groupedWalls = new Map<number, CompositeWall[]>();
              interiorWalls.forEach(iw => {
                const g = wallToGroup.get(iw.id) ?? 0;
                if (!groupedWalls.has(g)) groupedWalls.set(g, []);
                groupedWalls.get(g)!.push(iw);
              });
              let faceIdx = 1;
              groupedWalls.forEach(walls => {
                interiorFaceGroups.push({ name: `Cara interna ${faceIdx}`, walls });
                faceIdx++;
              });
            }

            const renderCompositeCard = (cw2: CompositeWall) => (
              <CompositeWallCard
                key={cw2.id}
                compositeWall={cw2}
                plan={plan}
                onOpeningClick={handleOpeningClick}
                onAddBlockGroup={onAddBlockGroup}
                onDeleteBlockGroup={onDeleteBlockGroup}
                onDeleteOpening={onDeleteOpening}
                onUpdateOpening={onUpdateOpening}
                onUpdateWall={onUpdateWall}
                saving={saving}
                rooms={rooms}
                budgetName={budgetName}
              />
            );

            const content = (
              <div className="space-y-4">
                {SIDE_ORDER.map(side2 => {
                  const sideComps = bySide.get(side2);
                  if (!sideComps || sideComps.length === 0) return null;
                  return (
                    <Collapsible key={side2} defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors border-b border-border/30 pb-1">
                        <ChevronRight className="h-3.5 w-3.5 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <h4 className="text-xs font-bold text-foreground">{FACE_NAMES[side2]}</h4>
                        <Badge variant="outline" className="text-[9px] h-4">{sideComps.length} alzado{sideComps.length > 1 ? 's' : ''}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 mt-1 ml-2">
                        {sideComps.map(renderCompositeCard)}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
                {interiorFaceGroups.map(fg => (
                  <Collapsible key={fg.name} defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors border-b border-border/30 pb-1">
                      <ChevronRight className="h-3.5 w-3.5 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                      <h4 className="text-xs font-bold text-foreground">{fg.name}</h4>
                      <Badge variant="outline" className="text-[9px] h-4">{fg.walls.length} alzado{fg.walls.length > 1 ? 's' : ''}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-1 ml-2">
                      {fg.walls.map(renderCompositeCard)}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            );
            if (floorName) {
              return (
                <Collapsible key={floorId} defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1.5 transition-colors border-b border-border/50 mb-2">
                    <ChevronRight className="h-4 w-4 text-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <h3 className="text-sm font-bold text-foreground">{floorName}</h3>
                    <Badge variant="secondary" className="text-[10px] h-4">{composites.length} alzados</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-2">{content}</CollapsibleContent>
                </Collapsible>
              );
            }
            return <div key={floorId}>{content}</div>;
          })}
        </div>
      )}

      {/* Total Elevation view — stacked floors per building side */}
      {viewMode === 'total' && totalElevations.length > 0 && (
        <div className="space-y-4">
          {totalElevations.map(te => (
            <TotalElevationCard
              key={te.side}
              side={te.side}
              label={te.label}
              layers={te.layers}
              plan={plan}
              rooms={rooms}
              budgetName={budgetName}
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
                          onUpdateWall={onUpdateWall}
                          onUpdateWallSegmentType={onUpdateWallSegmentType}
                          onUpdateOpening={onUpdateOpening}
                          onDeleteOpening={onDeleteOpening}
                          saving={saving}
                          budgetName={budgetName}
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
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[96vh] h-[96vh] flex flex-col overflow-hidden print:!max-w-none print:!w-full print:!h-auto" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              {budgetName && <span className="font-bold print:text-lg">{budgetName} —</span>}
              Alzados — Pantalla completa
              <Button variant="outline" size="sm" className="h-7 text-xs ml-auto print:hidden" onClick={() => window.print()}>
                <Printer className="h-3 w-3 mr-1" /> Imprimir
              </Button>
            </DialogTitle>
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
                              onUpdateWall={onUpdateWall}
                              onUpdateWallSegmentType={onUpdateWallSegmentType}
                              onUpdateOpening={onUpdateOpening}
                              onDeleteOpening={onDeleteOpening}
                              saving={saving}
                              budgetName={budgetName}
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

// Inline wall type selector for elevation cards
function InlineWallTypeSelect({ wallId, currentType, onUpdateWall, onUpdateSegmentType, segmentIndex, saving, displayOnly }: {
  wallId: string;
  currentType: WallType;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType }) => Promise<void>;
  onUpdateSegmentType?: (wallId: string, segmentIndex: number, segmentType: WallType) => Promise<void>;
  segmentIndex?: number;
  saving: boolean;
  displayOnly?: boolean;
}) {
  const handleChange = async (v: string) => {
    if (displayOnly) return;
    if (onUpdateSegmentType && segmentIndex !== undefined) {
      await onUpdateSegmentType(wallId, segmentIndex, v as WallType);
    } else if (onUpdateWall) {
      await onUpdateWall(wallId, { wallType: v as WallType });
    }
  };
  const canEdit = !displayOnly && (onUpdateWall || (onUpdateSegmentType && segmentIndex !== undefined));
  const label = WALL_TYPE_OPTIONS.find(o => o.value === currentType)?.label || currentType;
  if (displayOnly) {
    return (
      <span className="text-[9px] text-muted-foreground/70 italic" title="Tipo calculado por segmento (editar desde Plano)">
        {label}
      </span>
    );
  }
  return (
    <Select value={currentType} onValueChange={handleChange} disabled={saving || !canEdit}>
      <SelectTrigger className="h-5 text-[9px] px-1.5 w-auto min-w-[90px] border-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WALL_TYPE_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Inject CAD ruler SVG elements into a cloned SVG for PDF export only */
function injectCadRulerIntoSvg(svgClone: SVGSVGElement, rx: number, ry: number, rw: number, rh: number, widthM: number, heightM: number, scale: number) {
  const ns = 'http://www.w3.org/2000/svg';
  const rulerColor = 'hsl(0, 0%, 40%)';
  const rulerFontSize = Math.max(7, Math.min(10, scale * 0.15));

  const getTickInterval = (totalM: number) => {
    if (totalM <= 1) return 0.1;
    if (totalM <= 3) return 0.25;
    if (totalM <= 8) return 0.5;
    return 1;
  };

  const hInterval = getTickInterval(widthM);
  const vInterval = getTickInterval(heightM);

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('opacity', '0.7');

  const makeLine = (x1: number, y1: number, x2: number, y2: number, sw: number) => {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', rulerColor); l.setAttribute('stroke-width', String(sw));
    return l;
  };
  const makeText = (x: number, y: number, txt: string, anchor: string, fs: number, extra?: Record<string, string>) => {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', anchor); t.setAttribute('font-size', String(fs));
    t.setAttribute('fill', rulerColor);
    if (extra) Object.entries(extra).forEach(([k, v]) => t.setAttribute(k, v));
    t.textContent = txt;
    return t;
  };

  // Horizontal ruler (top)
  const rulerHY = ry - 20;
  g.appendChild(makeLine(rx, rulerHY, rx + rw, rulerHY, 0.8));
  for (let m = 0; m <= widthM + 0.001; m += hInterval) {
    const x = rx + (m / widthM) * rw;
    if (x > rx + rw + 0.5) break;
    const isMajor = Math.abs(m - Math.round(m)) < 0.01;
    const tickH = isMajor ? 8 : 4;
    g.appendChild(makeLine(x, rulerHY - tickH, x, rulerHY, isMajor ? 0.8 : 0.4));
    if (isMajor || hInterval >= 0.25) {
      g.appendChild(makeText(x, rulerHY - tickH - 2, String(Math.round(m * 1000)), 'middle', rulerFontSize));
    }
  }

  // Vertical ruler (right)
  const rulerVX = rx + rw + 20;
  g.appendChild(makeLine(rulerVX, ry, rulerVX, ry + rh, 0.8));
  for (let m = 0; m <= heightM + 0.001; m += vInterval) {
    const y = ry + rh - (m / heightM) * rh;
    if (y < ry - 0.5) break;
    const isMajor = Math.abs(m - Math.round(m)) < 0.01;
    const tickW = isMajor ? 8 : 4;
    g.appendChild(makeLine(rulerVX, y, rulerVX + tickW, y, isMajor ? 0.8 : 0.4));
    if (isMajor || vInterval >= 0.25) {
      g.appendChild(makeText(rulerVX + tickW + 3, y + 3, String(Math.round(m * 1000)), 'start', rulerFontSize));
    }
  }

  g.appendChild(makeText(rx + rw / 2, rulerHY - 14, 'mm', 'middle', rulerFontSize - 1, { 'font-style': 'italic' }));
  g.appendChild(makeText(rulerVX + 16, ry + rh / 2, 'mm', 'middle', rulerFontSize - 1, {
    'font-style': 'italic',
    'transform': `rotate(90, ${rulerVX + 16}, ${ry + rh / 2})`,
  }));

  svgClone.appendChild(g);
}

/** CAD ruler React component for on-screen display */
function CadRuler({ rx, ry, rw, rh, widthM, heightM, scale }: {
  rx: number; ry: number; rw: number; rh: number;
  widthM: number; heightM: number; scale: number;
}) {
  const rulerColor = 'hsl(0, 0%, 40%)';
  const rulerFontSize = Math.max(7, Math.min(10, scale * 0.15));
  const getTickInterval = (totalM: number) => {
    if (totalM <= 1) return 0.1;
    if (totalM <= 3) return 0.25;
    if (totalM <= 8) return 0.5;
    return 1;
  };
  const hInterval = getTickInterval(widthM);
  const vInterval = getTickInterval(heightM);
  const hTicks: React.ReactElement[] = [];
  const vTicks: React.ReactElement[] = [];
  const rulerHY = ry - 20;
  hTicks.push(<line key="hr-base" x1={rx} y1={rulerHY} x2={rx + rw} y2={rulerHY} stroke={rulerColor} strokeWidth={0.8} />);
  for (let m = 0; m <= widthM + 0.001; m += hInterval) {
    const x = rx + (m / widthM) * rw;
    if (x > rx + rw + 0.5) break;
    const isMajor = Math.abs(m - Math.round(m)) < 0.01;
    const tickH = isMajor ? 8 : 4;
    hTicks.push(<line key={`ht-${m}`} x1={x} y1={rulerHY - tickH} x2={x} y2={rulerHY} stroke={rulerColor} strokeWidth={isMajor ? 0.8 : 0.4} />);
    if (isMajor || hInterval >= 0.25) {
      hTicks.push(<text key={`htl-${m}`} x={x} y={rulerHY - tickH - 2} textAnchor="middle" fontSize={rulerFontSize} fill={rulerColor}>{Math.round(m * 1000)}</text>);
    }
  }
  const rulerVX = rx + rw + 20;
  vTicks.push(<line key="vr-base" x1={rulerVX} y1={ry} x2={rulerVX} y2={ry + rh} stroke={rulerColor} strokeWidth={0.8} />);
  for (let m = 0; m <= heightM + 0.001; m += vInterval) {
    const y = ry + rh - (m / heightM) * rh;
    if (y < ry - 0.5) break;
    const isMajor = Math.abs(m - Math.round(m)) < 0.01;
    const tickW = isMajor ? 8 : 4;
    vTicks.push(<line key={`vt-${m}`} x1={rulerVX} y1={y} x2={rulerVX + tickW} y2={y} stroke={rulerColor} strokeWidth={isMajor ? 0.8 : 0.4} />);
    if (isMajor || vInterval >= 0.25) {
      vTicks.push(<text key={`vtl-${m}`} x={rulerVX + tickW + 3} y={y + 3} textAnchor="start" fontSize={rulerFontSize} fill={rulerColor}>{Math.round(m * 1000)}</text>);
    }
  }
  return (
    <g className="cad-ruler" pointerEvents="none" opacity={0.7}>
      {hTicks}
      {vTicks}
      <text x={rx + rw / 2} y={rulerHY - 14} textAnchor="middle" fontSize={rulerFontSize - 1} fill={rulerColor} fontStyle="italic">mm</text>
      <text x={rulerVX + 16} y={ry + rh / 2} textAnchor="middle" fontSize={rulerFontSize - 1} fill={rulerColor} fontStyle="italic"
        transform={`rotate(90, ${rulerVX + 16}, ${ry + rh / 2})`}>mm</text>
    </g>
  );
}

/** Ruler measurement lines overlay */
function RulerLinesOverlay({ lines, drawPoint, widthM, rw }: {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  drawPoint: { x1: number; y1: number } | null;
  widthM: number; rw: number;
}) {
  return (
    <g pointerEvents="none">
      {lines.map((rl, i) => {
        const dx = rl.x2 - rl.x1;
        const dy = rl.y2 - rl.y1;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distMm = Math.round(distPx / rw * widthM * 1000);
        const mx = (rl.x1 + rl.x2) / 2;
        const my = (rl.y1 + rl.y2) / 2;
        return (
          <g key={i}>
            <line x1={rl.x1} y1={rl.y1} x2={rl.x2} y2={rl.y2} stroke="hsl(350, 80%, 50%)" strokeWidth={1.5} strokeDasharray="6,3" />
            <circle cx={rl.x1} cy={rl.y1} r={3} fill="hsl(350, 80%, 50%)" />
            <circle cx={rl.x2} cy={rl.y2} r={3} fill="hsl(350, 80%, 50%)" />
            <rect x={mx - 28} y={my - 9} width={56} height={16} rx={3} fill="white" stroke="hsl(350, 80%, 50%)" strokeWidth={0.5} opacity={0.9} />
            <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="hsl(350, 80%, 50%)">{distMm}mm</text>
          </g>
        );
      })}
      {drawPoint && (
        <circle cx={drawPoint.x1} cy={drawPoint.y1} r={4} fill="hsl(350, 80%, 50%)" opacity={0.7}>
          <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// Individual elevation card
function ElevationCardView({ card, plan, onOpeningClick, onAddOpening, onCardDoubleClick, onAddBlockGroup, onDeleteBlockGroup, onUpdateWall, onUpdateWallSegmentType, onUpdateOpening, onDeleteOpening, saving, budgetName }: {
  card: ElevationCard;
  plan: FloorPlanData;
  onOpeningClick: (op: OpeningData) => void;
  onAddOpening: (wallId: string, type: string, width: number, height: number, sillHeight?: number, positionX?: number) => Promise<void>;
  onCardDoubleClick: (card: ElevationCard) => void;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType }) => Promise<void>;
  onUpdateWallSegmentType?: (wallId: string, segmentIndex: number, segmentType: WallType) => Promise<void>;
  onUpdateOpening?: (openingId: string, data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDeleteOpening?: (openingId: string) => Promise<void>;
  saving: boolean;
  budgetName?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [fsSelectedOpeningId, setFsSelectedOpeningId] = useState<string | null>(null);
  const [fsDragState, setFsDragState] = useState<{
    openingId: string; startX: number; startPosX: number; wallLength: number; opWidth: number; scale: number;
  } | null>(null);
  // Ruler tool state
  const [cardRulerMode, setCardRulerMode] = useState(false);
  const [cardRulerLines, setCardRulerLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const [cardRulerDraw, setCardRulerDraw] = useState<{ x1: number; y1: number } | null>(null);

  // Arrow key handler for pixel-by-pixel opening movement in fullscreen
  useEffect(() => {
    if (!fullscreen || !fsSelectedOpeningId || !onUpdateOpening) return;
    const handleKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Delete' && onDeleteOpening) {
        onDeleteOpening(fsSelectedOpeningId);
        setFsSelectedOpeningId(null);
        return;
      }
      const step = e.shiftKey ? 0.005 : 0.001; // 5mm or 1mm
      const isHoriz = card.wall ? (card.wall.wallIndex === 1 || card.wall.wallIndex === 3) : true;
      const fullWallLen = card.room ? (isHoriz ? card.room.width : card.room.length) : card.width;
      const op = card.openings.find(o => o.id === fsSelectedOpeningId);
      if (!op) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const deltaFraction = (step * dir) / fullWallLen;
        const halfW = (op.width / 2) / fullWallLen;
        const newPosX = Math.max(halfW, Math.min(1 - halfW, op.positionX + deltaFraction));
        onUpdateOpening(fsSelectedOpeningId, { positionX: newPosX });
      } else {
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        const newSill = Math.max(0, (op.sillHeight ?? 0) + step * dir);
        onUpdateOpening(fsSelectedOpeningId, { sillHeight: newSill });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, fsSelectedOpeningId, onUpdateOpening, onDeleteOpening, card]);

  // Drag handlers for fullscreen opening movement
  const handleFsMouseMove = (e: React.MouseEvent) => {
    if (!fsDragState || !onUpdateOpening) return;
    const deltaPixels = e.clientX - fsDragState.startX;
    const deltaMeters = deltaPixels / fsDragState.scale;
    const deltaFraction = deltaMeters / fsDragState.wallLength;
    const halfW = (fsDragState.opWidth / 2) / fsDragState.wallLength;
    const newPosX = Math.max(halfW, Math.min(1 - halfW, fsDragState.startPosX + deltaFraction));
    onUpdateOpening(fsDragState.openingId, { positionX: newPosX });
  };

  // PDF export for individual card
  const handleCardPdfExport = useCallback(() => {
    const svgEl = document.querySelector(`[data-card-pdf="${card.id}"]`) as SVGSVGElement | null;
    if (!svgEl) return;
    const label = `${card.label}${card.sublabel ? ' — ' + card.sublabel : ''}`;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(budgetName || '', margin, margin + 5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Alzado: ${label}`, margin, margin + 12);
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 2400, 600];
    const vbW = vb[2] || 2400;
    const vbH = vb[3] || 600;
    const renderW = 3000;
    const renderH = Math.round(renderW * (vbH / vbW));
    svgClone.setAttribute('width', String(renderW));
    svgClone.setAttribute('height', String(renderH));
    svgClone.removeAttribute('style');
    // Inject CAD ruler for PDF
    const rRx = parseFloat(svgEl.getAttribute('data-ruler-rx') || '0');
    const rRy = parseFloat(svgEl.getAttribute('data-ruler-ry') || '0');
    const rRw = parseFloat(svgEl.getAttribute('data-ruler-rw') || '0');
    const rRh = parseFloat(svgEl.getAttribute('data-ruler-rh') || '0');
    const rWm = parseFloat(svgEl.getAttribute('data-ruler-wm') || '0');
    const rHm = parseFloat(svgEl.getAttribute('data-ruler-hm') || '0');
    const rSc = parseFloat(svgEl.getAttribute('data-ruler-scale') || '0');
    if (rRw > 0 && rRh > 0) injectCadRulerIntoSvg(svgClone, rRx, rRy, rRw, rRh, rWm, rHm, rSc);
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, renderW, renderH);
      const imgData = canvas.toDataURL('image/png');
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2 - 20;
      const ratio = Math.min(availW / renderW, availH / renderH);
      const imgW = renderW * ratio;
      const imgH = renderH * ratio;
      doc.addImage(imgData, 'PNG', margin + (availW - imgW) / 2, margin + 18, imgW, imgH);
      doc.save(`${label.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_')}.pdf`);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [card, budgetName]);
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
    : card.category === 'faldon' ? <Layers className="h-3 w-3" />
    : null;

  const isWall = card.category === 'pared';

  // Block count calculation
  const blockCount = useMemo(() => {
    if (!isWall || card.isInvisible || plan.scaleMode !== 'bloque') return null;
    const wallIsExternal = card.wall ? isExteriorType(card.wall.wallType as string) : true;
    const dims = getBlockDimensions(plan, wallIsExternal);
    const blockW = dims.lengthMm / 1000;
    const blockH = dims.heightMm / 1000;
    if (blockW <= 0 || blockH <= 0) return null;
    const cols = Math.ceil(card.width / blockW);
    const rows = Math.ceil(card.height / blockH);
    return { cols, rows, total: cols * rows, lengthMm: dims.lengthMm, heightMm: dims.heightMm };
  }, [isWall, card.isInvisible, card.width, card.height, plan, card.wall]);

  // SVG render function shared between inline and fullscreen
  const renderSvg = (fsScale?: number) => {
    const s = fsScale || scale;
    const sw = card.width * s + CARD_PADDING * 2 + 30;
    const sh = card.height * s + CARD_PADDING * 2 + 30;
    const rx = CARD_PADDING + 20;
    const ry = CARD_PADDING;
    const rw = card.width * s;
    const rh = card.height * s;

    // Gable (triangular) rendering
    if (card.isGable && card.gablePeakH && card.gablePeakH > 0) {
      const peakX = rx + rw / 2;
      const baseY = ry + rh;
      const trianglePath = `M ${rx} ${baseY} L ${peakX} ${ry} L ${rx + rw} ${baseY} Z`;

      return (
        <svg
          width="100%"
          viewBox={`0 0 ${sw} ${sh}`}
          className="mx-auto"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '90vh' : '180px' }}
        >
          {/* Ground line */}
          <line x1={rx - 5} y1={baseY} x2={rx + rw + 5} y2={baseY}
            stroke="hsl(25, 60%, 40%)" strokeWidth={1.5} />
          {Array.from({ length: Math.ceil((rw + 10) / 6) }, (_, i) => (
            <line key={`gh-${i}`}
              x1={rx - 5 + i * 6} y1={baseY + 1.5}
              x2={rx - 5 + i * 6 - 4} y2={baseY + 5}
              stroke="hsl(25, 60%, 40%)" strokeWidth={0.4} opacity={0.5}
            />
          ))}

          {/* Triangle shape */}
          <path d={trianglePath} fill={card.fill} stroke={card.stroke} strokeWidth={1.5} />

          {/* Block pattern inside triangle (clipped) */}
          {plan.scaleMode === 'bloque' && (() => {
            const wallIsExternal = card.wall ? isExteriorType(card.wall.wallType as string) : true;
            const dims = getBlockDimensions(plan, wallIsExternal);
            const blockWPx = (dims.lengthMm / 1000) * s;
            const blockHPx = (dims.heightMm / 1000) * s;
            if (blockWPx < 3 || blockHPx < 2) return null;
            const clipId = `gable-clip-${card.id}`;
            const rows = Math.ceil(rh / blockHPx);
            const cols = Math.ceil(rw / blockWPx) + 1;
            const lines: React.ReactElement[] = [];
            for (let r = 1; r < rows; r++) {
              const y = baseY - r * blockHPx;
              if (y <= ry) break;
              lines.push(
              <line key={`bh-${r}`} x1={rx} y1={y} x2={rx + rw} y2={y}
                  stroke="hsl(210, 50%, 35%)" strokeWidth={1.2} opacity={1} pointerEvents="none" />
              );
            }
            for (let r = 0; r < rows; r++) {
              const yTop = Math.max(ry, baseY - (r + 1) * blockHPx);
              const yBot = baseY - r * blockHPx;
              const offset = r % 2 === 0 ? 0 : blockWPx / 2;
              for (let c = 1; c < cols; c++) {
                const x = rx + offset + c * blockWPx;
                if (x >= rx + rw) break;
                if (x <= rx) continue;
                lines.push(
                  <line key={`bv-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={Math.min(yBot, baseY)}
                    stroke="hsl(210, 50%, 35%)" strokeWidth={1.0} opacity={1} pointerEvents="none" />
                );
              }
            }
            return (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <path d={trianglePath} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${clipId})`}>{lines}</g>
              </>
            );
          })()}

          {/* Corner labels: CuA (left peak) and CuB (right peak) */}
          {card.wall && isExteriorType(card.wall.wallType as string) && (() => {
            const arrowY = ry - 8;
            const fs = fsScale ? 9 : 7;
            return (
              <g>
                <text x={rx} y={arrowY} textAnchor="start" fontSize={fs} fontWeight={700} fill="hsl(222, 47%, 40%)">← CuA</text>
                <text x={rx + rw} y={arrowY} textAnchor="end" fontSize={fs} fontWeight={700} fill="hsl(222, 47%, 40%)">CuB →</text>
              </g>
            );
          })()}

          {/* Half-base dimensions (left + right) */}
          {(() => {
            const halfBase = card.width / 2;
            const halfBaseMm = Math.round(halfBase * 1000);
            const dimColor = 'hsl(210, 60%, 45%)';
            const fz = fsScale ? 9 : 7;
            return (
              <g>
                {/* Left half-base */}
                <line x1={rx} y1={baseY + 12} x2={peakX} y2={baseY + 12} stroke={dimColor} strokeWidth={0.6} />
                <line x1={rx} y1={baseY + 8} x2={rx} y2={baseY + 16} stroke={dimColor} strokeWidth={0.4} />
                <line x1={peakX} y1={baseY + 8} x2={peakX} y2={baseY + 16} stroke={dimColor} strokeWidth={0.4} />
                <text x={(rx + peakX) / 2} y={baseY + 22} textAnchor="middle" fontSize={fz} fill={dimColor} fontWeight={600}>
                  {halfBaseMm} mm
                </text>
                {/* Right half-base */}
                <line x1={peakX} y1={baseY + 12} x2={rx + rw} y2={baseY + 12} stroke={dimColor} strokeWidth={0.6} />
                <line x1={rx + rw} y1={baseY + 8} x2={rx + rw} y2={baseY + 16} stroke={dimColor} strokeWidth={0.4} />
                <text x={(peakX + rx + rw) / 2} y={baseY + 22} textAnchor="middle" fontSize={fz} fill={dimColor} fontWeight={600}>
                  {halfBaseMm} mm
                </text>
              </g>
            );
          })()}
          {/* Total base dimension */}
          <line x1={rx} y1={baseY + 30} x2={rx + rw} y2={baseY + 30}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
          <line x1={rx} y1={baseY + 26} x2={rx} y2={baseY + 34} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rx + rw} y1={baseY + 26} x2={rx + rw} y2={baseY + 34} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text x={rx + rw / 2} y={baseY + 44} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}>
            {Math.round(card.width * 1000)} mm (base total)
          </text>
          {/* Vertical height line base→cumbrera */}
          <line x1={peakX} y1={ry} x2={peakX} y2={baseY}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.8} strokeDasharray="4 2" />
          <line x1={peakX - 4} y1={ry} x2={peakX + 4} y2={ry} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={peakX - 4} y1={baseY} x2={peakX + 4} y2={baseY} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text x={peakX + 6} y={ry + rh / 2} textAnchor="start" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={700}
            transform={`rotate(-90, ${peakX + 6}, ${ry + rh / 2})`}>
            {Math.round(card.gablePeakH! * 1000)} mm
          </text>
          {/* Dimensions - height / cumbrera (left side) */}
          <line x1={rx - 12} y1={ry} x2={rx - 12} y2={baseY}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
          <line x1={rx - 16} y1={ry} x2={rx - 8} y2={ry} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rx - 16} y1={baseY} x2={rx - 8} y2={baseY} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text x={rx - 18} y={ry + rh / 2} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}
            transform={`rotate(-90, ${rx - 18}, ${ry + rh / 2})`}>
            {Math.round(card.gablePeakH! * 1000)} mm (cumbrera)
          </text>
          {/* Left hypotenuse */}
          {(() => {
            const halfBase = card.width / 2;
            const slopeLen = Math.sqrt(halfBase ** 2 + card.gablePeakH! ** 2);
            return (
              <text x={rx + rw * 0.22} y={ry + rh * 0.4} textAnchor="middle"
                fontSize={fsScale ? 9 : 7} fill="hsl(15, 70%, 45%)" fontWeight={600}
                transform={`rotate(${Math.atan2(card.gablePeakH!, halfBase) * -180 / Math.PI}, ${rx + rw * 0.22}, ${ry + rh * 0.4})`}>
                {Math.round(slopeLen * 1000)} mm
              </text>
            );
          })()}
          {/* Right hypotenuse */}
          {(() => {
            const halfBase = card.width / 2;
            const slopeLen = Math.sqrt(halfBase ** 2 + card.gablePeakH! ** 2);
            return (
              <text x={rx + rw * 0.78} y={ry + rh * 0.4} textAnchor="middle"
                fontSize={fsScale ? 9 : 7} fill="hsl(15, 70%, 45%)" fontWeight={600}
                transform={`rotate(${Math.atan2(card.gablePeakH!, halfBase) * 180 / Math.PI}, ${rx + rw * 0.78}, ${ry + rh * 0.4})`}>
                {Math.round(slopeLen * 1000)} mm
              </text>
            );
          })()}
          {/* Peak marker */}
          <circle cx={peakX} cy={ry} r={3} fill="hsl(15, 70%, 45%)" />
          <text x={peakX} y={ry - 6} textAnchor="middle" fontSize={fsScale ? 8 : 6} fill="hsl(15, 70%, 45%)" fontWeight={700}>
            Cumbrera
          </text>
        </svg>
      );
    }

    // Faldón (roof slope panel) rendering
    if (card.category === 'faldon') {
      return (
        <svg
          width="100%"
          viewBox={`0 0 ${sw} ${sh}`}
          className="mx-auto"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '90vh' : '180px' }}
        >
          {/* Slope panel as parallelogram */}
          <rect x={rx} y={ry} width={rw} height={rh}
            fill={card.fill} stroke={card.stroke} strokeWidth={1.5} rx={1} />
          {/* Slope hatching */}
          {Array.from({ length: Math.ceil(rw / 12) + Math.ceil(rh / 12) }, (_, i) => {
            const x = rx + i * 12;
            return (
              <line key={`sh-${i}`} x1={x} y1={ry} x2={x - rh * 0.3} y2={ry + rh}
                stroke="hsl(15, 50%, 55%)" strokeWidth={0.4} opacity={0.3} pointerEvents="none" />
            );
          })}
          {/* Width dimension (horizontal) */}
          <line x1={rx} y1={ry + rh + 12} x2={rx + rw} y2={ry + rh + 12}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
          <line x1={rx} y1={ry + rh + 8} x2={rx} y2={ry + rh + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rx + rw} y1={ry + rh + 8} x2={rx + rw} y2={ry + rh + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text x={rx + rw / 2} y={ry + rh + 24} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}>
            {Math.round(card.width * 1000)} mm (ancho)
          </text>
          {/* Length dimension (vertical) */}
          <line x1={rx - 12} y1={ry} x2={rx - 12} y2={ry + rh}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
          <line x1={rx - 16} y1={ry} x2={rx - 8} y2={ry} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rx - 16} y1={ry + rh} x2={rx - 8} y2={ry + rh} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text x={rx - 18} y={ry + rh / 2} textAnchor="middle" fontSize={fsScale ? 10 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}
            transform={`rotate(-90, ${rx - 18}, ${ry + rh / 2})`}>
            {Math.round(card.height * 1000)} mm (largo)
          </text>
          {/* Area label */}
          <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" fontSize={fsScale ? 12 : 9} fill="hsl(15, 70%, 40%)" fontWeight={700}>
            {card.surfaceArea?.toFixed(2)} m²
          </text>
        </svg>
      );
    }

    return (
      <svg
        data-card-pdf={fsScale ? card.id : undefined}
        data-ruler-rx={rx} data-ruler-ry={ry} data-ruler-rw={rw} data-ruler-rh={rh}
        data-ruler-wm={card.width} data-ruler-hm={card.height} data-ruler-scale={s}
        width="100%"
        viewBox={`0 0 ${sw} ${sh}`}
        className="mx-auto"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '90vh' : '180px', cursor: fsDragState ? 'grabbing' : 'default' }}
        onMouseMove={fsScale ? handleFsMouseMove : undefined}
        onMouseUp={fsScale ? () => setFsDragState(null) : undefined}
        onMouseLeave={fsScale ? () => setFsDragState(null) : undefined}
        onClick={fsScale ? () => { if (!fsDragState) setFsSelectedOpeningId(null); } : undefined}
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
          const wallIsExternal = card.wall ? isExteriorType(card.wall.wallType as string) : true;
          const dims = getBlockDimensions(plan, wallIsExternal);
          const blockWPx = (dims.lengthMm / 1000) * s;
          const blockHPx = (dims.heightMm / 1000) * s;
          if (blockWPx < 3 || blockHPx < 2) return null;
          const rows = Math.ceil(rh / blockHPx);
          const cols = Math.ceil(rw / blockWPx) + 1;
          const lines: React.ReactElement[] = [];
          for (let r = 1; r < rows; r++) {
            const y = ry + rh - r * blockHPx;
            if (y <= ry) break;
            lines.push(
              <line key={`bh-${r}`} x1={rx} y1={y} x2={rx + rw} y2={y}
                stroke="hsl(210, 50%, 35%)" strokeWidth={1.2} opacity={1} pointerEvents="none" />
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
                  stroke="hsl(210, 50%, 35%)" strokeWidth={1.0} opacity={1} pointerEvents="none" />
              );
            }
          }
          return <g className="block-pattern">{lines}</g>;
        })()}

        {/* Direction arrows — walls viewed from INTERIOR */}
        {isWall && card.wall && isExteriorType(card.wall.wallType as string) && (() => {
          const wi = card.wall.wallIndex;
          // Walls viewed from INTERIOR (standing inside the room)
          const interiorCornerMap: Record<number, [string, string]> = {
            1: ['A', 'B'], // top wall from inside: left=A(TL), right=B(TR)
            2: ['B', 'C'], // right wall from inside: left=B(TR), right=C(BR)
            3: ['C', 'D'], // bottom wall from inside: left=C(BR), right=D(BL)
            4: ['D', 'A'], // left wall from inside: left=D(BL), right=A(TL)
          };
          const [leftCorner, rightCorner] = interiorCornerMap[wi] || ['?', '?'];
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
        <text x={rx - 18} y={ry + rh / 2} textAnchor="middle" fontSize={fsScale ? 13 : 10} fill="hsl(25, 95%, 45%)" fontWeight={600}
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
const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
          const isSelected = fsScale && fsSelectedOpeningId === op.id;
          return (
            <g key={op.id}
              style={{ cursor: fsScale ? (fsDragState ? 'grabbing' : 'grab') : 'pointer' }}
              onClick={e => {
                e.stopPropagation();
                if (fsScale) { setFsSelectedOpeningId(op.id); }
                else { onOpeningClick(op); }
              }}
              onMouseDown={fsScale && onUpdateOpening ? e => {
                e.preventDefault(); e.stopPropagation();
                setFsSelectedOpeningId(op.id);
                setFsDragState({
                  openingId: op.id, startX: e.clientX, startPosX: op.positionX,
                  wallLength: fullWallLen, opWidth: op.width, scale: s,
                });
              } : undefined}
            >
              {/* Selection highlight */}
              {isSelected && (
                <rect x={opX - 3} y={opY - 3} width={opWidthPx + 6} height={opHeightPx + 6}
                  fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4,2" rx={3} pointerEvents="none" />
              )}
              <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                stroke={isSelected ? 'hsl(var(--primary))' : isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                strokeWidth={isSelected ? 2 : 1.2} rx={1} />
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

              {/* Reference measurements — fullscreen only */}
              {fsScale && (
                <g pointerEvents="none" opacity={0.85}>
                  {/* Sill height — bottom of opening to floor */}
                  {sillH > 0.001 && (
                    <>
                      <line x1={opX + opWidthPx + 5} y1={opY + opHeightPx} x2={opX + opWidthPx + 5} y2={ry + rh}
                        stroke="hsl(150, 60%, 40%)" strokeWidth={0.6} strokeDasharray="2,1" />
                      <line x1={opX + opWidthPx + 2} y1={opY + opHeightPx} x2={opX + opWidthPx + 8} y2={opY + opHeightPx}
                        stroke="hsl(150, 60%, 40%)" strokeWidth={0.4} />
                      <line x1={opX + opWidthPx + 2} y1={ry + rh} x2={opX + opWidthPx + 8} y2={ry + rh}
                        stroke="hsl(150, 60%, 40%)" strokeWidth={0.4} />
                      <text x={opX + opWidthPx + 10} y={opY + opHeightPx + (ry + rh - opY - opHeightPx) / 2 + 3}
                        fontSize={7} fill="hsl(150, 60%, 40%)" fontWeight={600}>
                        {Math.round(sillH * 1000)} mm
                      </text>
                    </>
                  )}
                  {/* Top gap — top of opening to top of wall */}
                  {(() => {
                    const topGap = card.height - sillH - op.height;
                    if (topGap <= 0.001) return null;
                    return (
                      <>
                        <line x1={opX + opWidthPx + 5} y1={ry} x2={opX + opWidthPx + 5} y2={opY}
                          stroke="hsl(200, 60%, 40%)" strokeWidth={0.6} strokeDasharray="2,1" />
                        <line x1={opX + opWidthPx + 2} y1={ry} x2={opX + opWidthPx + 8} y2={ry}
                          stroke="hsl(200, 60%, 40%)" strokeWidth={0.4} />
                        <line x1={opX + opWidthPx + 2} y1={opY} x2={opX + opWidthPx + 8} y2={opY}
                          stroke="hsl(200, 60%, 40%)" strokeWidth={0.4} />
                        <text x={opX + opWidthPx + 10} y={ry + (opY - ry) / 2 + 3}
                          fontSize={7} fill="hsl(200, 60%, 40%)" fontWeight={600}>
                          {Math.round(topGap * 1000)} mm
                        </text>
                      </>
                    );
                  })()}
                  {/* Left distance — left edge of opening to left wall edge */}
                  {(() => {
                    const leftDist = (opX - rx) / s;
                    if (leftDist < 0.001) return null;
                    return (
                      <>
                        <line x1={rx} y1={opY + opHeightPx + 5} x2={opX} y2={opY + opHeightPx + 5}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.6} strokeDasharray="2,1" />
                        <line x1={rx} y1={opY + opHeightPx + 2} x2={rx} y2={opY + opHeightPx + 8}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.4} />
                        <line x1={opX} y1={opY + opHeightPx + 2} x2={opX} y2={opY + opHeightPx + 8}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.4} />
                        <text x={rx + (opX - rx) / 2} y={opY + opHeightPx + 14}
                          textAnchor="middle" fontSize={7} fill="hsl(30, 60%, 45%)" fontWeight={600}>
                          {Math.round(leftDist * 1000)} mm
                        </text>
                      </>
                    );
                  })()}
                  {/* Right distance — right edge of opening to right wall edge */}
                  {(() => {
                    const rightDist = (rx + rw - opX - opWidthPx) / s;
                    if (rightDist < 0.001) return null;
                    return (
                      <>
                        <line x1={opX + opWidthPx} y1={opY + opHeightPx + 5} x2={rx + rw} y2={opY + opHeightPx + 5}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.6} strokeDasharray="2,1" />
                        <line x1={opX + opWidthPx} y1={opY + opHeightPx + 2} x2={opX + opWidthPx} y2={opY + opHeightPx + 8}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.4} />
                        <line x1={rx + rw} y1={opY + opHeightPx + 2} x2={rx + rw} y2={opY + opHeightPx + 8}
                          stroke="hsl(30, 60%, 45%)" strokeWidth={0.4} />
                        <text x={opX + opWidthPx + (rx + rw - opX - opWidthPx) / 2} y={opY + opHeightPx + 14}
                          textAnchor="middle" fontSize={7} fill="hsl(30, 60%, 45%)" fontWeight={600}>
                          {Math.round(rightDist * 1000)} mm
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
            </g>
          );
        })}
        {/* CAD Ruler — shown in fullscreen */}
        {fsScale && (
          <CadRuler rx={rx} ry={ry} rw={rw} rh={rh} widthM={card.width} heightM={card.height} scale={s} />
        )}
        {/* Ruler measurement lines */}
        {fsScale && (cardRulerLines.length > 0 || cardRulerDraw) && (
          <RulerLinesOverlay lines={cardRulerLines} drawPoint={cardRulerDraw} widthM={card.width} rw={rw} />
        )}
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
              {isWall && card.wall && !card.wall.id.startsWith('temp-') && (
                <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                  {card.segment ? (
                    <InlineWallTypeSelect
                      wallId={card.wall.id}
                      currentType={(card.segment.segmentType as WallType)}
                      onUpdateSegmentType={onUpdateWallSegmentType}
                      segmentIndex={card.segmentIndex}
                      saving={saving}
                    />
                  ) : (
                    <InlineWallTypeSelect
                      wallId={card.wall.id}
                      currentType={(card.wall.wallType as WallType)}
                      onUpdateWall={onUpdateWall}
                      saving={saving}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[55%]">
            {blockCount && (
              <Badge variant="outline" className="text-[9px] h-4 bg-accent/30">
                {blockCount.total} bloques ({blockCount.cols}×{blockCount.rows}) · {blockCount.lengthMm}×{blockCount.heightMm}mm
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
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                onClick={e => { e.stopPropagation(); setFullscreen(true); }}
                title="Ampliar alzado a pantalla completa">
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
      <DialogContent className="!max-w-none !w-screen !h-screen !m-0 !p-4 !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 flex flex-col print:!p-2" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            {budgetName && <span className="font-bold print:text-lg">{budgetName} —</span>}
            {card.label}
            {card.sublabel && <span className="text-muted-foreground font-normal">— {card.sublabel}</span>}
            {blockCount && (
              <Badge variant="outline" className="text-xs print:hidden">
                {blockCount.total} bloques ({blockCount.cols}×{blockCount.rows}) · {blockCount.lengthMm}×{blockCount.heightMm}mm
              </Badge>
            )}
            {!card.isInvisible && (
              <Badge variant="outline" className="text-xs print:hidden">{area}m²</Badge>
            )}
            {isWall && plan.scaleMode === 'bloque' && (card.wall?.blockGroups?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs print:hidden">
                {card.wall!.blockGroups!.length} grupos
              </Badge>
            )}
            <div className="flex items-center gap-1 ml-auto print:hidden">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCardPdfExport}>
                <FileDown className="h-3 w-3 mr-1" /> PDF A4
              </Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>
                ✕ Cerrar
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Vista a pantalla completa del alzado</DialogDescription>
        </DialogHeader>
        {/* Fullscreen opening controls */}
        {fsSelectedOpeningId && (
          <div className="shrink-0 flex items-center gap-2 flex-wrap border-b border-border/50 pb-2 print:hidden">
            <span className="text-xs text-primary font-medium">
              ← → mover horizontal · ↑ ↓ altura suelo · Shift = 5mm · Supr = eliminar
            </span>
            {onDeleteOpening && (
              <Button variant="destructive" size="sm" className="h-6 text-[10px] ml-auto"
                onClick={() => { onDeleteOpening(fsSelectedOpeningId); setFsSelectedOpeningId(null); }}
                disabled={saving}>
                <Trash2 className="h-3 w-3 mr-1" /> Eliminar hueco
              </Button>
            )}
          </div>
        )}

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
                  const wallIsExt = card.wall ? isExteriorType(card.wall.wallType as string) : true;
                  const bDims = getBlockDimensions(plan, wallIsExt);
                  const blockW = bDims.lengthMm;
                  const blockH = bDims.heightMm;
                  const name = `${(spanCols * blockW).toFixed(0)}×${(spanRows * blockH).toFixed(0)}×${bDims.widthMm}mm`;
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

        {/* Ruler toolbar */}
        <div className="shrink-0 flex items-center gap-2 border-b border-border/50 pb-2 print:hidden">
          <Button size="sm" variant={cardRulerMode ? 'default' : 'outline'} className="h-7 text-xs gap-1"
            onClick={() => { setCardRulerMode(!cardRulerMode); setCardRulerDraw(null); }}>
            <Ruler className="h-3 w-3" /> {cardRulerMode ? 'Regla activa' : 'Regla'}
          </Button>
          {cardRulerLines.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{cardRulerLines.length} medida{cardRulerLines.length > 1 ? 's' : ''}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { setCardRulerLines([]); setCardRulerDraw(null); }}>
                Borrar medidas
              </Button>
            </>
          )}
          {cardRulerMode && (
            <span className="text-xs text-muted-foreground ml-2">
              Haz clic en dos puntos del alzado para medir la distancia
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center min-h-0"
          onMouseDown={cardRulerMode ? (e) => {
            const svgEl = e.currentTarget.querySelector('svg') as SVGSVGElement;
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 100, 100];
            const scaleX = vb[2] / rect.width;
            const scaleY = vb[3] / rect.height;
            const svgX = (e.clientX - rect.left) * scaleX;
            const svgY = (e.clientY - rect.top) * scaleY;
            if (cardRulerDraw) {
              setCardRulerLines(prev => [...prev, { x1: cardRulerDraw.x1, y1: cardRulerDraw.y1, x2: svgX, y2: svgY }]);
              setCardRulerDraw(null);
            } else {
              setCardRulerDraw({ x1: svgX, y1: svgY });
            }
          } : undefined}
        >
          {card.isInvisible ? (
            <p className="text-muted-foreground italic">Pared invisible</p>
          ) : isWall && plan.scaleMode === 'bloque' && blockCount && !card.isGable ? (
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
  blockCount: { cols: number; rows: number; total: number; lengthMm: number; heightMm: number };
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
  const wallIsExternal = card.wall ? isExteriorType(card.wall.wallType as string) : true;
  const dims = getBlockDimensions(plan, wallIsExternal);
  const blockWm = dims.lengthMm / 1000;
  const blockHm = dims.heightMm / 1000;
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
              stroke={isSelected ? 'hsl(210, 80%, 50%)' : 'hsl(210, 50%, 35%)'}
              strokeWidth={isSelected ? 2 : 1.2}
              opacity={1}
              rx={0.5}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onToggleBlock(key); }}
            >
              <title>Bloque [{c},{r}] — {dims.lengthMm}×{dims.heightMm}×{dims.widthMm}mm</title>
            </rect>
          );
        });
      })}

      {/* Direction arrows — walls viewed from INTERIOR */}
      {card.wall && isExteriorType(card.wall.wallType as string) && (() => {
        const wi = card.wall.wallIndex;
        const interiorCornerMap: Record<number, [string, string]> = {
          1: ['A', 'B'], 2: ['B', 'C'], 3: ['C', 'D'], 4: ['D', 'A'],
        };
        const [leftCorner, rightCorner] = interiorCornerMap[wi] || ['?', '?'];
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
const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
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

      {/* CAD Ruler */}
      <CadRuler rx={rx} ry={ry} rw={rw} rh={rh} widthM={wallWm} heightM={wallHm} scale={s} />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// Fullscreen interactive block grid for composite walls
// ──────────────────────────────────────────────────────────────────

function CompositeFullscreenBlockGrid({ compositeWall, plan, maxHeight, selectedBlocks, sectionBlockGroups, onToggleBlock, onOpeningClick, rulerLines, rulerDraw, totalLength, liveRooms }: {
  compositeWall: CompositeWall;
  plan: FloorPlanData;
  maxHeight: number;
  selectedBlocks: Set<string>;
  sectionBlockGroups: Map<number, BlockGroupData[]>;
  onToggleBlock: (key: string) => void;
  onOpeningClick: (op: OpeningData) => void;
  rulerLines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  rulerDraw?: { x1: number; y1: number } | null;
  totalLength?: number;
  liveRooms?: RoomData[];
}) {
  const cw = compositeWall;
  const allRooms = liveRooms || [];
  const blockWm = plan.blockLengthMm / 1000;
  const blockHm = plan.blockHeightMm / 1000;
  const padding = 60;
  const maxW = window.innerWidth - padding * 2;
  const maxH = window.innerHeight - 250;
  const s = Math.min(maxW / cw.totalLength, maxH / maxHeight);
  const svgW = cw.totalLength * s + padding * 2;
  const totalH = maxHeight * s;
  const svgH = totalH + padding * 2 + 30;
  const rxs = padding;
  const rys = padding / 2;
  const bwPx = blockWm * s;
  const bhPx = blockHm * s;

  // Build group cell maps per section
  const groupCellMaps = useMemo(() => {
    const maps = new Map<number, Map<string, BlockGroupData>>();
    sectionBlockGroups.forEach((groups, sIdx) => {
      const map = new Map<string, BlockGroupData>();
      groups.forEach(bg => {
        for (let c = bg.startCol; c < bg.startCol + bg.spanCols; c++) {
          for (let r = bg.startRow; r < bg.startRow + bg.spanRows; r++) {
            map.set(`${c}-${r}`, bg);
          }
        }
      });
      maps.set(sIdx, map);
    });
    return maps;
  }, [sectionBlockGroups]);

  return (
    <svg
      data-composite-pdf={cw.id}
      data-ruler-rx={rxs} data-ruler-ry={rys} data-ruler-rw={cw.totalLength * s} data-ruler-rh={totalH}
      data-ruler-wm={cw.totalLength} data-ruler-hm={maxHeight} data-ruler-scale={s}
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: '85vh' }}
    >
      {/* Ground line */}
      <line x1={rxs - 5} y1={rys + totalH} x2={rxs + cw.totalLength * s + 5} y2={rys + totalH}
        stroke="hsl(25, 60%, 40%)" strokeWidth={2} />

      {/* Ridge line (cumbrera) — dashed red line */}
      {plan.roofType === 'dos_aguas' && (() => {
        const buildMinX = Math.min(...(allRooms.length > 0 ? allRooms.map(r => r.posX) : [0]));
        const buildMaxX = Math.max(...(allRooms.length > 0 ? allRooms.map(r => r.posX + r.width) : [0]));
        const totalBuildW = (buildMaxX - buildMinX) + 2 * plan.externalWallThickness;
        const ridgeH = getEffectiveRidgeHeight(plan, totalBuildW / 2);
        if (ridgeH > 0 && ridgeH <= totalH / s * 1.2) {
          const ridgeY = rys + totalH - ridgeH * s;
          return (
            <line x1={rxs - 5} y1={ridgeY} x2={rxs + cw.totalLength * s + 5} y2={ridgeY}
              stroke="hsl(0, 70%, 55%)" strokeWidth={0.8} strokeDasharray="6 3" opacity={0.6} />
          );
        }
        return null;
      })()}

      {/* Sections with interactive blocks */}
      {cw.sections.map((section, sIdx) => {
        const sx = rxs + section.startOffset * s;
        const sw2 = section.length * s;
        const sh2 = section.height * s;
        const sy = rys + totalH - sh2;
          const isSectionInvisible = isSectionWallInvisible(section);
          const sectionFill = isSectionInvisible
            ? 'none'
            : (sIdx % 2 === 0 ? 'hsl(30, 30%, 92%)' : 'hsl(30, 25%, 88%)');
        // Calculate global cols for this section (aligned to composite wall origin)
        const globalStartCol = Math.max(0, Math.floor((section.startOffset) / blockWm));
        const globalEndCol = Math.ceil((section.startOffset + section.length) / blockWm);
        const cols = globalEndCol - globalStartCol + 1;
        const rows = Math.ceil(section.height / blockHm);
        const groupCellMap = groupCellMaps.get(sIdx) || new Map<string, BlockGroupData>();
        const blockGroups = sectionBlockGroups.get(sIdx) || [];

        // Invisible sections: render as empty with dashed outline, no blocks
        if (isSectionInvisible) {
          return (
            <g key={`section-${sIdx}`}>
              <rect x={sx} y={sy} width={sw2} height={sh2}
                fill="none" stroke="hsl(0, 0%, 75%)" strokeWidth={0.5} strokeDasharray="3 3" rx={1} />
              {sIdx > 0 && <line x1={sx} y1={rys} x2={sx} y2={rys + totalH}
                stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="3 2" />}
              <text x={sx + sw2 / 2} y={sy + 12} textAnchor="middle"
                fontSize={10} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.5} pointerEvents="none">
                {section.roomName}
              </text>
            </g>
          );
        }

        if (section.isGable) {
          // Gable sections are rendered collectively below (shared triangle), skip individual rendering
          return null;
        }

        return (
          <g key={`section-${sIdx}`}>
            {/* Background */}
            <rect x={sx} y={sy} width={sw2} height={sh2}
              fill={sectionFill} stroke={isSectionInvisible ? 'hsl(0, 0%, 75%)' : 'hsl(222, 47%, 30%)'} strokeWidth={isSectionInvisible ? 0.5 : 1.2} strokeDasharray={isSectionInvisible ? '3 3' : undefined} rx={1} />

            {/* Interactive blocks — only for non-invisible sections */}
            {!isSectionInvisible && Array.from({ length: rows }, (_, r) => {
              const yTop = sy + sh2 - (r + 1) * bhPx;
              const offset = r % 2 === 0 ? 0 : bwPx / 2;
              return Array.from({ length: cols }, (_, ci) => {
                const c = globalStartCol + ci;
                // Position block using global composite wall origin
                const xLeft = rxs + offset + c * bwPx;
                const clippedX = Math.max(sx, xLeft);
                const clippedW = Math.min(sx + sw2, xLeft + bwPx) - clippedX;
                const clippedY = Math.max(sy, yTop);
                const clippedH = Math.min(sy + sh2, yTop + bhPx) - clippedY;
                if (clippedW <= 0 || clippedH <= 0) return null;

                const cellKey = `${c}-${r}`;
                const fullKey = `${sIdx}-${c}-${r}`;
                const isSelected = selectedBlocks.has(fullKey);
                const group = groupCellMap.get(cellKey);
                const isGroupOrigin = group && group.startCol === c && group.startRow === r;

                if (group && !isGroupOrigin) return null;

                if (group && isGroupOrigin) {
                  const gx = sx + (r % 2 === 0 ? 0 : bwPx / 2) + group.startCol * bwPx;
                  const gy = sy + sh2 - (group.startRow + group.spanRows) * bhPx;
                  const gw = group.spanCols * bwPx;
                  const gh = group.spanRows * bhPx;
                  const colorIdx = blockGroups.indexOf(group) % BLOCK_GROUP_COLORS.length;
                  const color = group.color || BLOCK_GROUP_COLORS[colorIdx];
                  return (
                    <g key={`group-${sIdx}-${group.id}`}>
                      <rect
                        x={Math.max(sx, gx)} y={Math.max(sy, gy)}
                        width={Math.min(sx + sw2, gx + gw) - Math.max(sx, gx)}
                        height={Math.min(sy + sh2, gy + gh) - Math.max(sy, gy)}
                        fill={color + '25'} stroke={color} strokeWidth={2.5} rx={2} />
                      <text
                        x={Math.max(sx, gx) + (Math.min(sx + sw2, gx + gw) - Math.max(sx, gx)) / 2}
                        y={Math.max(sy, gy) + (Math.min(sy + sh2, gy + gh) - Math.max(sy, gy)) / 2 + 4}
                        textAnchor="middle" fontSize={Math.min(12, gw / 8)}
                        fill={color} fontWeight={700} pointerEvents="none">
                        {group.name || `${group.spanCols}×${group.spanRows}`}
                      </text>
                    </g>
                  );
                }

                return (
                  <rect key={fullKey}
                    x={clippedX + 0.5} y={clippedY + 0.5}
                    width={clippedW - 1} height={clippedH - 1}
                    fill={isSelected ? 'hsl(210, 80%, 60%, 0.4)' : 'transparent'}
                    stroke={isSelected ? 'hsl(210, 80%, 50%)' : 'hsl(210, 50%, 35%)'}
                    strokeWidth={isSelected ? 2 : 1.2}
                    opacity={1}
                    rx={0.5} style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onToggleBlock(fullKey); }}>
                    <title>Bloque [{c},{r}] — {section.roomName}</title>
                  </rect>
                );
              });
            })}

            {/* Section separator */}
            {sIdx > 0 && <line x1={sx} y1={rys} x2={sx} y2={rys + totalH}
              stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="3 2" />}

            {/* Room label */}
            <text x={sx + sw2 / 2} y={sy + 12} textAnchor="middle"
              fontSize={10} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.7} pointerEvents="none">
              {section.roomName}
            </text>

            {/* Openings */}
            {section.openings.map(op => {
              const isHoriz = section.wallIndex === 1 || section.wallIndex === 3;
              const fullWallLen = isHoriz ? section.length : section.length;
              const opCenterFraction = op.positionX;
              const opCenterInSection = opCenterFraction * fullWallLen;
              const opWidthPx = op.width * s;
              const opHeightPx = op.height * s;
              const sillH = op.sillHeight ?? 0;
              const opX = sx + (opCenterInSection / section.length) * sw2 - opWidthPx / 2;
              const opY = sy + sh2 - opHeightPx - sillH * s;
const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
              const distLeft = opCenterInSection - op.width / 2;
              const distRight = section.length - (opCenterInSection + op.width / 2);
              const distBottom = sillH;
              const distTop = section.height - sillH - op.height;
              const dColor = 'hsl(200, 70%, 40%)';
              const dStroke = 'hsl(200, 70%, 55%)';
              const dDash = '2 1.5';
              const opLeft = opX;
              const opRight = opX + opWidthPx;
              const opTop = opY;
              const opBottom = opY + opHeightPx;
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
                  {/* 4-edge distance annotations */}
                  <line x1={sx} y1={opTop + opHeightPx / 2} x2={opLeft} y2={opTop + opHeightPx / 2}
                    stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                  <text x={(sx + opLeft) / 2} y={opTop + opHeightPx / 2 - 2} textAnchor="middle"
                    fontSize={8} fill={dColor} fontWeight={600}>{Math.round(distLeft * 1000)}</text>
                  <line x1={opRight} y1={opTop + opHeightPx / 2} x2={sx + sw2} y2={opTop + opHeightPx / 2}
                    stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                  <text x={(opRight + sx + sw2) / 2} y={opTop + opHeightPx / 2 - 2} textAnchor="middle"
                    fontSize={8} fill={dColor} fontWeight={600}>{Math.round(distRight * 1000)}</text>
                  <line x1={opLeft + opWidthPx / 2} y1={opBottom} x2={opLeft + opWidthPx / 2} y2={sy + sh2}
                    stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                  <text x={opLeft + opWidthPx / 2 + 3} y={(opBottom + sy + sh2) / 2 + 3} textAnchor="start"
                    fontSize={8} fill={dColor} fontWeight={600}>{Math.round(distBottom * 1000)}</text>
                  <line x1={opLeft + opWidthPx / 2} y1={sy} x2={opLeft + opWidthPx / 2} y2={opTop}
                    stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                  <text x={opLeft + opWidthPx / 2 + 3} y={(sy + opTop) / 2 + 3} textAnchor="start"
                    fontSize={8} fill={dColor} fontWeight={600}>{Math.round(distTop * 1000)}</text>
                  {/* Opening size */}
                  <text x={opX + opWidthPx / 2} y={opY - 4} textAnchor="middle"
                    fontSize={8} fill="hsl(var(--primary))" fontWeight={600}>
                    {Math.round(op.width * 1000)}×{Math.round(op.height * 1000)}mm
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Shared gable triangle for all gable sections */}
      {(() => {
        const gableSections = cw.sections.filter(s => s.isGable);
        if (gableSections.length === 0) return null;
        const peakH = Math.max(...gableSections.map(s => s.gablePeakHeight ?? s.height));
        const gableStartX = rxs + gableSections[0].startOffset * s;
        const gableTotalW = gableSections.reduce((sum, gs) => sum + gs.length, 0) * s;
        const baseY = rys + totalH;
        const leftX = gableStartX;
        const rightX = gableStartX + gableTotalW;
        const leftBaseH = (cw.gableStartBaseH ?? 0) * s;
        const rightBaseH = (cw.gableEndBaseH ?? 0) * s;
        const leftBaseY = baseY - leftBaseH;
        const rightBaseY = baseY - rightBaseH;

        const buildingMinY = Math.min(...(allRooms.length > 0 ? allRooms.map(r => r.posY) : [cw.startCorner.y, cw.endCorner.y]));
        const buildingMaxY = Math.max(...(allRooms.length > 0 ? allRooms.map(r => r.posY + r.length) : [cw.startCorner.y, cw.endCorner.y]));
        const centerY = (buildingMinY + buildingMaxY) / 2;
        const y1 = cw.startCorner.y;
        const y2 = cw.endCorner.y;
        const crossesRidge = Math.abs(y2 - y1) > 1e-6 && (y1 - centerY) * (y2 - centerY) <= 0;
        const ridgeRatio = crossesRidge ? Math.max(0, Math.min(1, (centerY - y1) / (y2 - y1))) : 0.5;
        const peakX = crossesRidge
          ? leftX + gableTotalW * ridgeRatio
          : (leftBaseY <= rightBaseY ? leftX : rightX);
        const peakY = crossesRidge ? baseY - peakH * s : Math.min(leftBaseY, rightBaseY);
        const clipTopY = Math.min(leftBaseY, rightBaseY, peakY);
        const trianglePath = crossesRidge
          ? `M ${leftX} ${leftBaseY} L ${peakX} ${peakY} L ${rightX} ${rightBaseY} L ${rightX} ${baseY} L ${leftX} ${baseY} Z`
          : `M ${leftX} ${leftBaseY} L ${rightX} ${rightBaseY} L ${rightX} ${baseY} L ${leftX} ${baseY} Z`;
        const topYAtX = (x: number) => {
          if (!crossesRidge || Math.abs(rightX - leftX) < 1e-6) {
            return leftBaseY + ((x - leftX) / Math.max(1e-6, rightX - leftX)) * (rightBaseY - leftBaseY);
          }
          if (x <= peakX) {
            return leftBaseY + ((x - leftX) / Math.max(1e-6, peakX - leftX)) * (peakY - leftBaseY);
          }
          return peakY + ((x - peakX) / Math.max(1e-6, rightX - peakX)) * (rightBaseY - peakY);
        };
        const clipId = `fs-gable-clip-${cw.id}`;

        return (
          <g>
            <defs>
              <clipPath id={clipId}>
                <path d={trianglePath} />
              </clipPath>
            </defs>
            {/* Triangle outline */}
            <path d={trianglePath} fill="none" stroke="hsl(222, 47%, 30%)" strokeWidth={1.2} />

            {/* Per-section rendering within the shared triangle */}
            {gableSections.map((section, gi) => {
              const sx = rxs + section.startOffset * s;
              const sw2 = section.length * s;
              const isInv = isSectionWallInvisible(section);

              if (isInv) {
                // Invisible section: white rect clipped to triangle
                return (
                  <g key={`gable-inv-${gi}`}>
                    <rect x={sx} y={clipTopY - 5} width={sw2} height={baseY - clipTopY + 10}
                      fill="#ffffff" clipPath={`url(#${clipId})`} />
                    <rect x={sx} y={clipTopY} width={sw2} height={baseY - clipTopY}
                      fill="none" stroke="hsl(0, 0%, 75%)" strokeWidth={0.5} strokeDasharray="3 3"
                      clipPath={`url(#${clipId})`} />
                    <text x={sx + sw2 / 2} y={baseY - (baseY - clipTopY) * 0.3} textAnchor="middle"
                      fontSize={10} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.5} pointerEvents="none">
                      {section.roomName}
                    </text>
                  </g>
                );
              }

              // Visible section: fill + block pattern clipped to triangle
              const sectionFill = gi % 2 === 0 ? 'hsl(30, 30%, 92%)' : 'hsl(30, 25%, 88%)';
              return (
                <g key={`gable-vis-${gi}`}>
                  <rect x={sx} y={clipTopY - 5} width={sw2} height={baseY - clipTopY + 10}
                    fill={sectionFill} clipPath={`url(#${clipId})`} />
                  {/* Block pattern */}
                  {plan.scaleMode === 'bloque' && (() => {
                    const bDims = getBlockDimensions(plan, true);
                    const bwP = (bDims.lengthMm / 1000) * s;
                    const bhP = (bDims.heightMm / 1000) * s;
                    if (bwP < 3 || bhP < 2) return null;
                    const hPx = baseY - clipTopY;
                    const rowCount = Math.ceil(hPx / bhP);
                    const lines: React.ReactElement[] = [];
                    for (let r = 1; r < rowCount; r++) {
                      const y = baseY - r * bhP;
                      if (y <= clipTopY) break;
                      lines.push(
                        <line key={`gbh-${gi}-${r}`} x1={sx} y1={y} x2={sx + sw2} y2={y}
                          stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                      );
                    }
                    for (let r = 0; r < rowCount; r++) {
                      const yTop2 = Math.max(clipTopY, baseY - (r + 1) * bhP);
                      const yBot2 = baseY - r * bhP;
                      if (yTop2 >= yBot2) continue;
                      const off = r % 2 === 0 ? 0 : bwP / 2;
                      const startC = Math.floor((sx - rxs - off) / bwP);
                      const endC = Math.ceil((sx + sw2 - rxs - off) / bwP);
                      for (let c = startC; c <= endC; c++) {
                        const x = rxs + off + c * bwP;
                        if (x <= sx || x >= sx + sw2) continue;
                        lines.push(
                          <line key={`gbv-${gi}-${r}-${c}`} x1={x} y1={yTop2} x2={x} y2={yBot2}
                            stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                        );
                      }
                    }
                    return <g clipPath={`url(#${clipId})`}>{lines}</g>;
                  })()}
                  <text x={sx + sw2 / 2} y={baseY - (baseY - clipTopY) * 0.3} textAnchor="middle"
                    fontSize={10} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.7} pointerEvents="none">
                    {section.roomName}
                  </text>
                </g>
              );
            })}

            {/* Section separators within the gable */}
            {gableSections.slice(1).map((section, gi) => {
              const sx = rxs + section.startOffset * s;
              const sepTopY = topYAtX(sx);
              return (
                <line key={`gable-sep-${gi}`}
                  x1={sx} y1={baseY} x2={sx} y2={sepTopY}
                  stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="4 2" />
              );
            })}

            {/* Cumbrera marker */}
            {crossesRidge && <circle cx={peakX} cy={peakY} r={3} fill="hsl(15, 70%, 45%)" />}
            {crossesRidge && <text x={peakX} y={peakY - 6} textAnchor="middle"
              fontSize={9} fill="hsl(15, 70%, 45%)" fontWeight={700}>CUMBRERA</text>}

            {/* Hypotenuse dimension lines + vertical height + half-base (base corner → peak) */}
            {crossesRidge && (() => {
              const gableTotalLen = gableSections.reduce((sum, gs) => sum + gs.length, 0);
              const leftBH = cw.gableStartBaseH ?? 0;
              const rightBH = cw.gableEndBaseH ?? 0;
              const leftHorizDist = gableTotalLen * ridgeRatio;
              const rightHorizDist = gableTotalLen * (1 - ridgeRatio);
              const hypLeftM = Math.sqrt(Math.pow(leftHorizDist, 2) + Math.pow(peakH - leftBH, 2));
              const hypRightM = Math.sqrt(Math.pow(rightHorizDist, 2) + Math.pow(peakH - rightBH, 2));
              const fz = 9;
              const hColor = 'hsl(280, 60%, 45%)';
              const lMidX = (leftX + peakX) / 2;
              const lMidY = (leftBaseY + peakY) / 2;
              const rMidX = (peakX + rightX) / 2;
              const rMidY = (peakY + rightBaseY) / 2;
              const dimColor = 'hsl(210, 60%, 45%)';
              const vColor = 'hsl(25, 95%, 45%)';
              const leftHalfMm = Math.round(leftHorizDist * 1000);
              const rightHalfMm = Math.round(rightHorizDist * 1000);
              const halfBaseY = baseY + 55;
              return (
                <>
                  {/* Hypotenuse lines */}
                  <line x1={leftX} y1={leftBaseY} x2={peakX} y2={peakY}
                    stroke={hColor} strokeWidth={0.6} strokeDasharray="4 2" opacity={0.7} />
                  <text x={lMidX - 8} y={lMidY - 4} textAnchor="end"
                    fontSize={fz} fill={hColor} fontWeight={700}
                    transform={`rotate(${Math.atan2(-(peakH - leftBH) * s, leftHorizDist * s) * 180 / Math.PI}, ${lMidX - 8}, ${lMidY - 4})`}>
                    {Math.round(hypLeftM * 1000)} mm
                  </text>
                  <line x1={peakX} y1={peakY} x2={rightX} y2={rightBaseY}
                    stroke={hColor} strokeWidth={0.6} strokeDasharray="4 2" opacity={0.7} />
                  <text x={rMidX + 8} y={rMidY - 4} textAnchor="start"
                    fontSize={fz} fill={hColor} fontWeight={700}
                    transform={`rotate(${Math.atan2((peakH - rightBH) * s, rightHorizDist * s) * 180 / Math.PI}, ${rMidX + 8}, ${rMidY - 4})`}>
                    {Math.round(hypRightM * 1000)} mm
                  </text>
                  {/* Vertical height line base→cumbrera */}
                  <line x1={peakX} y1={peakY} x2={peakX} y2={baseY}
                    stroke={vColor} strokeWidth={0.8} strokeDasharray="4 2" />
                  <line x1={peakX - 5} y1={peakY} x2={peakX + 5} y2={peakY} stroke={vColor} strokeWidth={0.5} />
                  <line x1={peakX - 5} y1={baseY} x2={peakX + 5} y2={baseY} stroke={vColor} strokeWidth={0.5} />
                  <text x={peakX + 8} y={(peakY + baseY) / 2} textAnchor="start"
                    fontSize={10} fill={vColor} fontWeight={700}>
                    {Math.round(peakH * 1000)} mm
                  </text>
                  {/* Left half-base */}
                  <line x1={leftX} y1={halfBaseY} x2={peakX} y2={halfBaseY} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={leftX} y1={halfBaseY - 4} x2={leftX} y2={halfBaseY + 4} stroke={dimColor} strokeWidth={0.5} />
                  <line x1={peakX} y1={halfBaseY - 4} x2={peakX} y2={halfBaseY + 4} stroke={dimColor} strokeWidth={0.5} />
                  <text x={(leftX + peakX) / 2} y={halfBaseY - 5} textAnchor="middle"
                    fontSize={9} fill={dimColor} fontWeight={700}>
                    {leftHalfMm} mm
                  </text>
                  {/* Right half-base */}
                  <line x1={peakX} y1={halfBaseY} x2={rightX} y2={halfBaseY} stroke={dimColor} strokeWidth={0.7} />
                  <line x1={rightX} y1={halfBaseY - 4} x2={rightX} y2={halfBaseY + 4} stroke={dimColor} strokeWidth={0.5} />
                  <text x={(peakX + rightX) / 2} y={halfBaseY - 5} textAnchor="middle"
                    fontSize={9} fill={dimColor} fontWeight={700}>
                    {rightHalfMm} mm
                  </text>
                </>
              );
            })()}

            {/* Base height dimensions for partial gables */}
            {(() => {
              const leftBH = cw.gableStartBaseH ?? 0;
              const rightBH = cw.gableEndBaseH ?? 0;
              const hColor = 'hsl(160, 60%, 35%)';
              const fz = 8;
              const elements: React.ReactElement[] = [];
              if (leftBH > 0.01) {
                elements.push(
                  <g key="left-base-h">
                    <line x1={leftX - 8} y1={baseY} x2={leftX - 8} y2={leftBaseY}
                      stroke={hColor} strokeWidth={0.7} />
                    <line x1={leftX - 12} y1={baseY} x2={leftX - 4} y2={baseY}
                      stroke={hColor} strokeWidth={0.5} />
                    <line x1={leftX - 12} y1={leftBaseY} x2={leftX - 4} y2={leftBaseY}
                      stroke={hColor} strokeWidth={0.5} />
                    <text x={leftX - 14} y={(baseY + leftBaseY) / 2 + 3} textAnchor="end"
                      fontSize={fz} fill={hColor} fontWeight={700}>
                      {Math.round(leftBH * 1000)} mm
                    </text>
                  </g>
                );
              }
              if (rightBH > 0.01) {
                elements.push(
                  <g key="right-base-h">
                    <line x1={rightX + 8} y1={baseY} x2={rightX + 8} y2={rightBaseY}
                      stroke={hColor} strokeWidth={0.7} />
                    <line x1={rightX + 4} y1={baseY} x2={rightX + 12} y2={baseY}
                      stroke={hColor} strokeWidth={0.5} />
                    <line x1={rightX + 4} y1={rightBaseY} x2={rightX + 12} y2={rightBaseY}
                      stroke={hColor} strokeWidth={0.5} />
                    <text x={rightX + 14} y={(baseY + rightBaseY) / 2 + 3} textAnchor="start"
                      fontSize={fz} fill={hColor} fontWeight={700}>
                      {Math.round(rightBH * 1000)} mm
                    </text>
                  </g>
                );
              }
              return elements;
            })()}
          </g>
        );
      })()}

      {/* Individual section dimension lines */}
      {cw.sections.map((section, idx) => {
        const sx = rxs + section.startOffset * s;
        const sw2 = section.length * s;
        const dimY = rys + totalH + 12;
        const secColor = 'hsl(210, 60%, 45%)';
        return (
          <g key={`sec-dim-${idx}`}>
            <line x1={sx} y1={dimY} x2={sx + sw2} y2={dimY} stroke={secColor} strokeWidth={0.8} />
            <line x1={sx} y1={dimY - 5} x2={sx} y2={dimY + 5} stroke={secColor} strokeWidth={0.6} />
            <line x1={sx + sw2} y1={dimY - 5} x2={sx + sw2} y2={dimY + 5} stroke={secColor} strokeWidth={0.6} />
            <text x={sx + sw2 / 2} y={dimY - 5} textAnchor="middle"
              fontSize={10} fill={secColor} fontWeight={700}>
              {Math.round(section.length * 1000)} mm
            </text>
          </g>
        );
      })}

      {/* Total dimension line */}
      <line x1={rxs} y1={rys + totalH + 30} x2={rxs + cw.totalLength * s} y2={rys + totalH + 30}
        stroke="hsl(25, 95%, 45%)" strokeWidth={1} />
      <line x1={rxs} y1={rys + totalH + 24} x2={rxs} y2={rys + totalH + 36} stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
      <line x1={rxs + cw.totalLength * s} y1={rys + totalH + 24} x2={rxs + cw.totalLength * s} y2={rys + totalH + 36}
        stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
      <text x={rxs + cw.totalLength * s / 2} y={rys + totalH + 46} textAnchor="middle"
        fontSize={13} fill="hsl(25, 95%, 45%)" fontWeight={700}>
        {Math.round(cw.totalLength * 1000)} mm
      </text>

      {/* Height dimension */}
      <line x1={rxs - 15} y1={rys} x2={rxs - 15} y2={rys + totalH}
        stroke="hsl(25, 95%, 45%)" strokeWidth={0.8} />
      <line x1={rxs - 20} y1={rys} x2={rxs - 10} y2={rys} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <line x1={rxs - 20} y1={rys + totalH} x2={rxs - 10} y2={rys + totalH} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
      <text x={rxs - 22} y={rys + totalH / 2} textAnchor="middle" fontSize={14} fill="hsl(25, 95%, 45%)" fontWeight={600}
        transform={`rotate(-90, ${rxs - 22}, ${rys + totalH / 2})`}>
        {Math.round(maxHeight * 1000)} mm
      </text>

      {/* Corner labels */}
      <text x={rxs - 3} y={rys + totalH + 46} textAnchor="end"
        fontSize={13} fill="hsl(var(--primary))" fontWeight={800}>
        {cw.startCorner.label}
      </text>
      <text x={rxs + cw.totalLength * s + 3} y={rys + totalH + 46} textAnchor="start"
        fontSize={13} fill="hsl(var(--primary))" fontWeight={800}>
        {cw.endCorner.label}
      </text>
      {/* Ruler lines */}
      {rulerLines && rulerLines.map((rl, i) => {
        const dx = (rl.x2 - rl.x1);
        const dy = (rl.y2 - rl.y1);
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distM = distPx / s;
        const midX = (rl.x1 + rl.x2) / 2;
        const midY = (rl.y1 + rl.y2) / 2;
        return (
          <g key={`ruler-${i}`}>
            <line x1={rl.x1} y1={rl.y1} x2={rl.x2} y2={rl.y2}
              stroke="hsl(350, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
            <circle cx={rl.x1} cy={rl.y1} r={3} fill="hsl(350, 80%, 50%)" />
            <circle cx={rl.x2} cy={rl.y2} r={3} fill="hsl(350, 80%, 50%)" />
            <rect x={midX - 28} y={midY - 8} width={56} height={16} rx={3}
              fill="hsl(350, 80%, 50%)" opacity={0.9} />
            <text x={midX} y={midY + 4} textAnchor="middle"
              fontSize={10} fill="white" fontWeight={700}>
              {Math.round(distM * 1000)} mm
            </text>
          </g>
        );
      })}
      {/* Active ruler draw point */}
      {rulerDraw && (
        <circle cx={rulerDraw.x1} cy={rulerDraw.y1} r={4} fill="hsl(350, 80%, 50%)" opacity={0.7}>
          <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
      {/* CAD Ruler */}
      <CadRuler rx={rxs} ry={rys} rw={cw.totalLength * s} rh={totalH} widthM={cw.totalLength} heightM={maxHeight} scale={s} />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// Total Elevation Card — stacks multiple floors into one facade view
// ──────────────────────────────────────────────────────────────────

const TOTAL_SIDE_COLORS: Record<string, { fill: string; stroke: string }> = {
  top: { fill: 'hsl(30, 30%, 92%)', stroke: 'hsl(222, 47%, 30%)' },
  right: { fill: 'hsl(200, 25%, 92%)', stroke: 'hsl(222, 47%, 30%)' },
  bottom: { fill: 'hsl(30, 25%, 90%)', stroke: 'hsl(222, 47%, 30%)' },
  left: { fill: 'hsl(200, 20%, 90%)', stroke: 'hsl(222, 47%, 30%)' },
};

function TotalElevationCard({ side, label, layers, plan, rooms, budgetName }: {
  side: 'top' | 'right' | 'bottom' | 'left';
  label: string;
  layers: Array<{ floorName: string; composites: CompositeWall[]; isGable: boolean }>;
  plan: FloorPlanData;
  rooms: RoomData[];
  budgetName?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const isGableSide = side === 'right' || side === 'left';

  // Calculate total width (max across all layers) and per-layer heights
  const layerDetails = useMemo(() => {
    return layers.map((layer, layerIdx) => {
      const maxLength = Math.max(...layer.composites.map(cw => cw.totalLength), 0);
      // For gable sides on bajo cubierta layer (last layer), height = peak height of the gable triangle
      // For non-gable layers, use max section height
      let maxHeight: number;
      if (isGableSide && layer.isGable) {
        // Gable peak height: use the max section gablePeakHeight or calculate from slope
        const gph = Math.max(
          ...layer.composites.flatMap(cw => cw.sections.map(s => s.gablePeakHeight ?? s.height)),
          0
        );
        maxHeight = gph;
      } else {
        maxHeight = Math.max(
          ...layer.composites.flatMap(cw => cw.sections.map(s => s.height)),
          0
        );
      }
      return { ...layer, maxLength, maxHeight };
    });
  }, [layers, isGableSide]);

  const totalWidth = Math.max(...layerDetails.map(l => l.maxLength), 0);
  // For gable sides, total height includes the triangle
  const totalHeight = layerDetails.reduce((sum, l) => sum + l.maxHeight, 0);

  // Build corner labels
  const cornerLabels = useMemo(() => {
    if (layers.length === 0) return { bottomLeft: '', bottomRight: '', topLeft: '', topRight: '' };
    const bottomLayer = layers[0];
    const topLayer = layers[layers.length - 1];
    const bottomComps = bottomLayer.composites;
    const topComps = topLayer.composites;
    return {
      bottomLeft: bottomComps[0]?.startCorner.label || '',
      bottomRight: bottomComps[bottomComps.length - 1]?.endCorner.label || '',
      topLeft: topComps[0]?.startCorner.label || '',
      topRight: topComps[topComps.length - 1]?.endCorner.label || '',
    };
  }, [layers]);

  // Collect intermediate coordinate labels at section boundaries
  const intermediateLabels = useMemo(() => {
    const labels: Array<{ x: number; bottomLabel: string; topLabel: string }> = [];
    layers.forEach((layer, layerIdx) => {
      layer.composites.forEach(cw => {
        cw.sections.forEach((section, secIdx) => {
          if (secIdx > 0) {
            // Get end corner label of previous section or start corner label of this section
            // Use the startOffset as position
            const xPos = section.startOffset;
            const prefix = layerIdx === 0 ? 'bottom' : 'top';
            // Find if there's already a label at this x position
            const existing = labels.find(l => Math.abs(l.x - xPos) < 0.01);
            if (existing) {
              if (prefix === 'bottom') existing.bottomLabel = existing.bottomLabel || '';
              else existing.topLabel = existing.topLabel || '';
            }
          }
        });
      });
    });
    return labels;
  }, [layers]);

  // Get block dimensions for rendering
  const getBlockDims = (isExt: boolean) => getBlockDimensions(plan, isExt);

  const renderTotalSvg = (fsScale?: number) => {
    const padding = 60;
    const maxW = fsScale ? window.innerWidth * 0.9 : 600;
    const scale = fsScale || Math.min((maxW - padding * 2) / totalWidth, 80);
    const svgW = totalWidth * scale + padding * 2 + 40;
    const svgH = totalHeight * scale + padding * 2 + 50;
    const rx = padding;
    const baseY = padding / 2 + totalHeight * scale + 10;

    // Compute slope ratio for roof lines
    const halfBuildingWidth = totalWidth / 2;
    const ridgePeakH = getEffectiveRidgeHeight(plan, halfBuildingWidth);

    return (
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '85vh' : '280px' }}
      >
        {/* Ground line */}
        <line x1={rx - 5} y1={baseY} x2={rx + totalWidth * scale + 5} y2={baseY}
          stroke="hsl(25, 60%, 40%)" strokeWidth={2} />

        {/* Render layers bottom to top */}
        {(() => {
          let currentBaseY = baseY;
          const elements: React.ReactElement[] = [];

          layerDetails.forEach((layer, layerIdx) => {
            const layerTopY = currentBaseY - layer.maxHeight * scale;
            const isTopLayer = layerIdx === layers.length - 1;

            // For gable sides with bajo cubierta layer:
            // Render ONE single triangle spanning the full width, NOT per-section
            if (isGableSide && layer.isGable && isTopLayer) {
              const peakX = rx + totalWidth * scale / 2;
              const peakY = currentBaseY - layer.maxHeight * scale;
              const leftX = rx;
              const rightX = rx + totalWidth * scale;
              const trianglePath = `M ${leftX} ${currentBaseY} L ${peakX} ${peakY} L ${rightX} ${currentBaseY} Z`;
              const clipId = `total-gable-full-${layerIdx}`;

              // Render the full gable triangle
              elements.push(
                <g key={`total-gable-${layerIdx}`}>
                  <defs>
                    <clipPath id={clipId}>
                      <path d={trianglePath} />
                    </clipPath>
                  </defs>
                  {/* Fill the triangle */}
                  <path d={trianglePath} fill={TOTAL_SIDE_COLORS[side].fill}
                    stroke={TOTAL_SIDE_COLORS[side].stroke} strokeWidth={1.2} />

                  {/* Block pattern clipped to the triangle */}
                  {plan.scaleMode === 'bloque' && (() => {
                    const blockDims = getBlockDims(true);
                    const bwPx = (blockDims.lengthMm / 1000) * scale;
                    const bhPx = (blockDims.heightMm / 1000) * scale;
                    if (bwPx < 3 || bhPx < 2) return null;
                    const totalHPx = layer.maxHeight * scale;
                    const rows = Math.ceil(totalHPx / bhPx);
                    const lines: React.ReactElement[] = [];
                    // Horizontal block lines
                    for (let r = 1; r < rows; r++) {
                      const y = currentBaseY - r * bhPx;
                      if (y <= peakY) break;
                      lines.push(
                        <line key={`gbh-${r}`} x1={leftX} y1={y} x2={rightX} y2={y}
                          stroke="hsl(210, 50%, 35%)" strokeWidth={0.8} opacity={0.5} />
                      );
                    }
                    // Vertical block lines with offset per row
                    for (let r = 0; r < rows; r++) {
                      const yTop = Math.max(peakY, currentBaseY - (r + 1) * bhPx);
                      const yBot = currentBaseY - r * bhPx;
                      if (yTop >= yBot) continue;
                      const offset = r % 2 === 0 ? 0 : bwPx / 2;
                      const startCol = Math.floor((leftX - rx - offset) / bwPx);
                      const endCol = Math.ceil((rightX - rx - offset) / bwPx);
                      for (let c = startCol; c <= endCol; c++) {
                        const x = rx + offset + c * bwPx;
                        if (x <= leftX || x >= rightX) continue;
                        lines.push(
                          <line key={`gbv-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={yBot}
                            stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                        );
                      }
                    }
                    return <g clipPath={`url(#${clipId})`}>{lines}</g>;
                  })()}

                  {/* Invisible sections: render as empty (cut out) within the triangle */}
                  {layer.composites.flatMap(cw => cw.sections.map((section, secIdx) => {
                    const isSectionInvisible = isSectionWallInvisible(section);
                    if (!isSectionInvisible) return null;
                    const sx = rx + section.startOffset * scale;
                    const sw2 = section.length * scale;
                    // Draw white rect over the invisible section, clipped to triangle
                    return (
                      <rect key={`inv-${layerIdx}-${secIdx}`}
                        x={sx} y={peakY - 5} width={sw2} height={currentBaseY - peakY + 10}
                        fill="#ffffff" clipPath={`url(#${clipId})`} />
                    );
                  }))}

                  {/* Section separators within the gable */}
                  {layer.composites.flatMap(cw => cw.sections.map((section, secIdx) => {
                    if (secIdx === 0) return null;
                    const sx = rx + section.startOffset * scale;
                    // Calculate the height of the triangle at this X position
                    const fracFromCenter = Math.abs(section.startOffset - totalWidth / 2) / (totalWidth / 2);
                    const sepH = layer.maxHeight * (1 - fracFromCenter);
                    const sepTopY = currentBaseY - sepH * scale;
                    return (
                      <line key={`sep-gable-${layerIdx}-${secIdx}`}
                        x1={sx} y1={currentBaseY} x2={sx} y2={sepTopY}
                        stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="4 2" />
                    );
                  }))}

                  {/* Openings within the gable (rendered inside the triangle) */}
                  {layer.composites.flatMap(cw => cw.sections.flatMap((section, secIdx) => {
                    const isSectionInvisible = isSectionWallInvisible(section);
                    if (isSectionInvisible) return [];
                    return section.openings.map(op => {
                      const isHoriz = section.wallIndex === 1 || section.wallIndex === 3;
                      const fullWallLen = section.fullWallLength ?? section.length;
                      const opCenterInSection = (op.positionX * fullWallLen) - (section.overlapStart ?? 0);
                      const opWidthPx = op.width * scale;
                      const opHeightPx = op.height * scale;
                      const sillH = op.sillHeight ?? 0;
                      const sx = rx + section.startOffset * scale;
                      const sw2 = section.length * scale;
                      const opX = sx + (opCenterInSection / section.length) * sw2 - opWidthPx / 2;
                      const opY = currentBaseY - opHeightPx - sillH * scale;
                      const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
                      return (
                        <g key={op.id}>
                          <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                            fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                            stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                            strokeWidth={1} rx={1} />
                        </g>
                      );
                    });
                  }))}

                  {/* Ridge marker */}
                  <circle cx={peakX} cy={peakY} r={fsScale ? 5 : 3} fill="hsl(15, 70%, 45%)" />
                  <text x={peakX} y={peakY - (fsScale ? 10 : 6)} textAnchor="middle"
                    fontSize={fsScale ? 12 : 8} fill="hsl(15, 70%, 45%)" fontWeight={800}>
                    CUMBRERA
                  </text>

                  {/* Roof edge lines (faldones) */}
                  <line x1={leftX} y1={currentBaseY} x2={peakX} y2={peakY}
                    stroke="hsl(15, 50%, 35%)" strokeWidth={2} />
                  <line x1={rightX} y1={currentBaseY} x2={peakX} y2={peakY}
                    stroke="hsl(15, 50%, 35%)" strokeWidth={2} />
                </g>
              );
            } else {
              // Non-gable layer or non-gable side: render sections as rectangles
              // For bajo cubierta on top/bottom sides: sections have varying heights from slope
              layer.composites.forEach(cw => {
                cw.sections.forEach((section, secIdx) => {
                  const sx = rx + section.startOffset * scale;
                  const sw2 = section.length * scale;
                  const sh2 = section.height * scale;
                  const sy = currentBaseY - sh2;
                  const isSectionInvisible = isSectionWallInvisible(section);

                  if (isSectionInvisible) {
                    // Invisible sections: just show a thin dashed outline (empty area)
                    elements.push(
                      <g key={`total-${layerIdx}-${secIdx}`}>
                        <rect x={sx} y={layerTopY} width={sw2} height={currentBaseY - layerTopY}
                          fill="none" stroke="hsl(0, 0%, 75%)" strokeWidth={0.5} strokeDasharray="3 3" />
                        {/* Section separator */}
                        {secIdx > 0 && (
                          <line x1={sx} y1={layerTopY} x2={sx} y2={currentBaseY}
                            stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="4 2" />
                        )}
                      </g>
                    );
                  } else {
                    const sectionFill = secIdx % 2 === 0 ? TOTAL_SIDE_COLORS[side].fill : 'hsl(30, 25%, 88%)';

                    // Check if this is a bajo cubierta section on top/bottom side (sloped wall)
                    // These get a trapezoidal shape if heights differ at edges
                    elements.push(
                      <g key={`total-${layerIdx}-${secIdx}`}>
                        <rect x={sx} y={sy} width={sw2} height={sh2}
                          fill={sectionFill} stroke={TOTAL_SIDE_COLORS[side].stroke} strokeWidth={1.2} rx={1} />

                        {/* Block pattern */}
                        {plan.scaleMode === 'bloque' && sh2 > 0 && (() => {
                          const isExt = isExteriorType(section.wall.wallType as string);
                          const blockDims = getBlockDims(isExt);
                          const bwPx = (blockDims.lengthMm / 1000) * scale;
                          const bhPx = (blockDims.heightMm / 1000) * scale;
                          if (bwPx < 3 || bhPx < 2) return null;
                          const rows = Math.ceil(sh2 / bhPx);
                          const lines: React.ReactElement[] = [];
                          for (let r = 1; r < rows; r++) {
                            const y = sy + sh2 - r * bhPx;
                            if (y <= sy) break;
                            lines.push(
                              <line key={`bh-${r}`} x1={sx} y1={y} x2={sx + sw2} y2={y}
                                stroke="hsl(210, 50%, 35%)" strokeWidth={0.8} opacity={0.5} />
                            );
                          }
                          for (let r = 0; r < rows; r++) {
                            const yTop = Math.max(sy, sy + sh2 - (r + 1) * bhPx);
                            const yBot = sy + sh2 - r * bhPx;
                            if (yTop >= yBot) continue;
                            const offset = r % 2 === 0 ? 0 : bwPx / 2;
                            const globalStartCol = Math.floor((sx - rx - offset) / bwPx);
                            const globalEndCol = Math.ceil((sx + sw2 - rx - offset) / bwPx);
                            for (let c = globalStartCol; c <= globalEndCol; c++) {
                              const x = rx + offset + c * bwPx;
                              if (x <= sx || x >= sx + sw2) continue;
                              lines.push(
                                <line key={`bv-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={Math.min(yBot, sy + sh2)}
                                  stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                              );
                            }
                          }
                          return <g>{lines}</g>;
                        })()}

                        {/* Section separator */}
                        {secIdx > 0 && (
                          <line x1={sx} y1={layerTopY} x2={sx} y2={currentBaseY}
                            stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="4 2" />
                        )}

                        {/* Room label */}
                        {sh2 > 15 && (
                          <text x={sx + sw2 / 2} y={sy + 12} textAnchor="middle"
                            fontSize={fsScale ? 10 : 7} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.5}>
                            {section.roomName}
                          </text>
                        )}

                        {/* Openings */}
                        {section.openings.map(op => {
                          const fullWallLen = section.fullWallLength ?? section.length;
                          const opCenterInSection = (op.positionX * fullWallLen) - (section.overlapStart ?? 0);
                          const opWidthPx = op.width * scale;
                          const opHeightPx = op.height * scale;
                          const sillH = op.sillHeight ?? 0;
                          const opX = sx + (opCenterInSection / section.length) * sw2 - opWidthPx / 2;
                          const opY = currentBaseY - opHeightPx - sillH * scale;
                          const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
                          return (
                            <g key={op.id}>
                              <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                                fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                                stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                                strokeWidth={1} rx={1} />
                            </g>
                          );
                        })}
                      </g>
                    );
                  }
                });
              });

              // For non-gable bajo cubierta layers on top/bottom sides,
              // draw the sloping roof line
              if (isTopLayer && !isGableSide && layer.isGable) {
                // The roof slopes from edges to center
                // For top/bottom sides, the height varies per section based on X position
                // Draw the roof slope line connecting the tops of sections
                const slopeLinePoints: string[] = [];
                layer.composites.forEach(cw => {
                  cw.sections.forEach((section, secIdx) => {
                    const sx = rx + section.startOffset * scale;
                    const sh2 = section.height * scale;
                    if (secIdx === 0) slopeLinePoints.push(`${sx},${currentBaseY - sh2}`);
                    slopeLinePoints.push(`${sx + section.length * scale},${currentBaseY - sh2}`);
                  });
                });
                if (slopeLinePoints.length > 1) {
                  elements.push(
                    <polyline key={`slope-line-${layerIdx}`}
                      points={slopeLinePoints.join(' ')}
                      fill="none" stroke="hsl(15, 50%, 35%)" strokeWidth={1.5} />
                  );
                }
              }
            }

            // Floor separator line & label between layers
            if (layerIdx > 0) {
              elements.push(
                <g key={`floor-sep-${layerIdx}`}>
                  <line x1={rx - 10} y1={currentBaseY} x2={rx + totalWidth * scale + 10} y2={currentBaseY}
                    stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
                  <text x={rx - 12} y={currentBaseY + 4} textAnchor="end"
                    fontSize={fsScale ? 10 : 7} fill="hsl(var(--primary))" fontWeight={600} opacity={0.7}>
                    {layer.floorName}
                  </text>
                </g>
              );

              // Intermediate coordinate labels at section boundaries
              // Show labels at the floor boundary for each section start
              layer.composites.forEach(cw => {
                cw.sections.forEach((section, secIdx) => {
                  if (secIdx > 0) {
                    const sx = rx + section.startOffset * scale;
                    // Find corresponding label from this floor's composite corners
                    const sectionLabel = secIdx < cw.sections.length ? '' : '';
                    elements.push(
                      <g key={`coord-label-${layerIdx}-${secIdx}`}>
                        <line x1={sx} y1={currentBaseY - 3} x2={sx} y2={currentBaseY + 3}
                          stroke="hsl(var(--primary))" strokeWidth={1} />
                      </g>
                    );
                  }
                });
              });
            } else {
              // Label for the first floor
              elements.push(
                <text key={`floor-label-${layerIdx}`} x={rx - 12} y={currentBaseY - layer.maxHeight * scale / 2 + 4}
                  textAnchor="end" fontSize={fsScale ? 10 : 7} fill="hsl(var(--muted-foreground))" fontWeight={600} opacity={0.5}>
                  {layer.floorName}
                </text>
              );

              // Section boundary labels for first floor
              layer.composites.forEach(cw => {
                cw.sections.forEach((section, secIdx) => {
                  if (secIdx > 0) {
                    const sx = rx + section.startOffset * scale;
                    elements.push(
                      <line key={`base-tick-${secIdx}`}
                        x1={sx} y1={baseY - 3} x2={sx} y2={baseY + 3}
                        stroke="hsl(var(--primary))" strokeWidth={1} />
                    );
                  }
                });
              });
            }

            // Per-layer height dimension line
            if (layer.maxHeight > 0) {
              const dimX = rx + totalWidth * scale + 18 + layerIdx * 15;
              elements.push(
                <g key={`layer-h-dim-${layerIdx}`}>
                  <line x1={dimX} y1={currentBaseY} x2={dimX} y2={layerTopY}
                    stroke="hsl(var(--primary))" strokeWidth={0.7} opacity={0.5} />
                  <line x1={dimX - 3} y1={currentBaseY} x2={dimX + 3} y2={currentBaseY}
                    stroke="hsl(var(--primary))" strokeWidth={0.7} opacity={0.5} />
                  <line x1={dimX - 3} y1={layerTopY} x2={dimX + 3} y2={layerTopY}
                    stroke="hsl(var(--primary))" strokeWidth={0.7} opacity={0.5} />
                  <text x={dimX + 2} y={(currentBaseY + layerTopY) / 2 + 3} textAnchor="start"
                    fontSize={fsScale ? 12 : 9} fill="hsl(var(--primary))" fontWeight={600} opacity={0.6}
                    transform={`rotate(90, ${dimX + 2}, ${(currentBaseY + layerTopY) / 2})`}>
                    {Math.round(layer.maxHeight * 1000)} mm
                  </text>
                </g>
              );
            }

            currentBaseY = layerTopY;
          });

          return elements;
        })()}

        {/* Total dimension line (bottom) */}
        <line x1={rx} y1={baseY + 15} x2={rx + totalWidth * scale} y2={baseY + 15}
          stroke="hsl(var(--primary))" strokeWidth={1} />
        <line x1={rx} y1={baseY + 10} x2={rx} y2={baseY + 20} stroke="hsl(var(--primary))" strokeWidth={1} />
        <line x1={rx + totalWidth * scale} y1={baseY + 10} x2={rx + totalWidth * scale} y2={baseY + 20}
          stroke="hsl(var(--primary))" strokeWidth={1} />
        <text x={rx + totalWidth * scale / 2} y={baseY + 28} textAnchor="middle"
          fontSize={fsScale ? 11 : 8} fill="hsl(var(--primary))" fontWeight={700}>
          {Math.round(totalWidth * 1000)} mm
        </text>

        {/* Corner labels */}
        <text x={rx - 3} y={baseY + 42} textAnchor="end"
          fontSize={fsScale ? 14 : 10} fill="hsl(222, 47%, 25%)" fontWeight={800}>
          {cornerLabels.bottomLeft}
        </text>
        <text x={rx + totalWidth * scale + 3} y={baseY + 42} textAnchor="start"
          fontSize={fsScale ? 14 : 10} fill="hsl(222, 47%, 25%)" fontWeight={800}>
          {cornerLabels.bottomRight}
        </text>
        <text x={rx - 3} y={baseY - totalHeight * scale - 5} textAnchor="end"
          fontSize={fsScale ? 14 : 10} fill="hsl(222, 47%, 25%)" fontWeight={800}>
          {cornerLabels.topLeft}
        </text>
        <text x={rx + totalWidth * scale + 3} y={baseY - totalHeight * scale - 5} textAnchor="start"
          fontSize={fsScale ? 14 : 10} fill="hsl(222, 47%, 25%)" fontWeight={800}>
          {cornerLabels.topRight}
        </text>

        {/* Intermediate coordinate labels at section boundaries, between floors */}
        {layers.length >= 2 && (() => {
          const floorBoundaryY = baseY - layerDetails[0].maxHeight * scale;
          const elems: React.ReactElement[] = [];
          // Bottom layer section boundaries
          layers[0].composites.forEach(cw => {
            cw.sections.forEach((section, secIdx) => {
              if (secIdx > 0) {
                const sx = rx + section.startOffset * scale;
                // Try to find the section label from the composite
                // Build label from floor corners data
                elems.push(
                  <g key={`intermed-bottom-${secIdx}`}>
                    <rect x={sx - 18} y={floorBoundaryY + 2} width={36} height={14} rx={2}
                      fill="hsl(var(--background))" stroke="hsl(222, 47%, 40%)" strokeWidth={0.5} />
                  </g>
                );
              }
            });
          });
          return elems;
        })()}
      </svg>
    );
  };

  const TOTAL_SIDE_NAMES: Record<string, string> = {
    top: 'Superior (Norte)', right: 'Derecha (Este)', bottom: 'Inferior (Sur)', left: 'Izquierda (Oeste)',
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow group">
        <CardHeader className="py-2 px-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <CardTitle className="text-sm font-bold">{label}</CardTitle>
              <Badge variant="default" className="text-[9px] h-4">{TOTAL_SIDE_NAMES[side]}</Badge>
              <Badge variant="outline" className="text-[9px] h-4">{Math.round(totalWidth * 1000)} × {Math.round(totalHeight * 1000)} mm</Badge>
              <Badge variant="secondary" className="text-[9px] h-4">{layers.length} niveles</Badge>
              {cornerLabels.bottomLeft && (
                <Badge variant="outline" className="text-[9px] h-4 max-w-[120px] truncate">
                  {cornerLabels.bottomLeft} → {cornerLabels.topRight}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setFullscreen(true)} title="Ampliar">
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {renderTotalSvg()}
        </CardContent>
      </Card>

      {/* Fullscreen dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="!max-w-none !w-screen !h-screen !m-0 !p-4 !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 flex flex-col print:!p-2" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
              {budgetName && <span className="font-bold print:text-lg">{budgetName} —</span>}
              {label}
              <Badge variant="default" className="text-xs print:hidden">{TOTAL_SIDE_NAMES[side]}</Badge>
              <Badge variant="outline" className="text-xs print:hidden">{Math.round(totalWidth * 1000)} × {Math.round(totalHeight * 1000)} mm</Badge>
              <Badge variant="secondary" className="text-xs print:hidden">{layers.length} niveles</Badge>
              <Button variant="destructive" size="sm" className="h-7 text-xs ml-auto" onClick={() => setFullscreen(false)}>
                ✕ Cerrar
              </Button>
            </DialogTitle>
            <DialogDescription className="sr-only">Vista a pantalla completa del alzado total</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center min-h-0">
            {renderTotalSvg(Math.min(
              (window.innerHeight * 0.8) / totalHeight,
              (window.innerWidth * 0.9) / totalWidth
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Composite Wall Card — groups room walls along a building edge
// ──────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<string, string> = {
  top: 'Norte', right: 'Este', bottom: 'Sur', left: 'Oeste',
};

function CompositeWallCard({ compositeWall, plan, onOpeningClick, onAddBlockGroup, onDeleteBlockGroup, onDeleteOpening, onUpdateOpening, onUpdateWall, saving, rooms: liveRooms, budgetName }: {
  compositeWall: CompositeWall;
  plan: FloorPlanData;
  onOpeningClick: (op: OpeningData) => void;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  onDeleteOpening?: (openingId: string) => Promise<void>;
  onUpdateOpening?: (openingId: string, data: { width?: number; height?: number; sillHeight?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onUpdateWall?: (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number; elevationGroup?: string | null }) => Promise<void>;
  saving?: boolean;
  rooms?: RoomData[];
  budgetName?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [fsSelectedOpeningId, setFsSelectedOpeningId] = useState<string | null>(null);
  const [fsDragState, setFsDragState] = useState<{
    openingId: string; startX: number; startPosX: number; wallLength: number; opWidth: number; scale: number;
  } | null>(null);
  // Ruler tool state
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerLines, setRulerLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const [rulerDraw, setRulerDraw] = useState<{ x1: number; y1: number } | null>(null);
  const rulerSvgRef = useRef<SVGSVGElement | null>(null);
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
        data-composite-pdf={cw.id}
        data-ruler-rx={rxs} data-ruler-ry={rys} data-ruler-rw={cw.totalLength * s} data-ruler-rh={totalH}
        data-ruler-wm={cw.totalLength} data-ruler-hm={maxHeight} data-ruler-scale={s}
        width="100%"
        viewBox={`0 0 ${sw} ${sh}`}
        className="mx-auto"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: fsScale ? '85vh' : '200px', cursor: fsDragState ? 'grabbing' : 'default' }}
        onMouseMove={fsScale ? handleCompositeFsMouseMove : undefined}
        onMouseUp={fsScale ? () => setFsDragState(null) : undefined}
        onMouseLeave={fsScale ? () => setFsDragState(null) : undefined}
        onClick={fsScale ? () => { if (!fsDragState) setFsSelectedOpeningId(null); } : undefined}
      >
        {/* Ground line */}
        <line x1={rxs - 5} y1={rys + totalH} x2={rxs + cw.totalLength * s + 5} y2={rys + totalH}
          stroke="hsl(25, 60%, 40%)" strokeWidth={1.5} />

        {/* Ridge line (cumbrera) — dashed red line */}
        {plan.roofType === 'dos_aguas' && liveRooms && (() => {
          const allRooms = liveRooms;
          const buildMinX = Math.min(...allRooms.map(r => r.posX));
          const buildMaxX = Math.max(...allRooms.map(r => r.posX + r.width));
          const totalBuildW = (buildMaxX - buildMinX) + 2 * plan.externalWallThickness;
          const ridgeH = getEffectiveRidgeHeight(plan, totalBuildW / 2);
          if (ridgeH > 0 && ridgeH <= totalH * 1.2) {
            const ridgeY = rys + totalH - ridgeH * s;
            return (
              <line x1={rxs - 5} y1={ridgeY} x2={rxs + cw.totalLength * s + 5} y2={ridgeY}
                stroke="hsl(0, 70%, 55%)" strokeWidth={0.8} strokeDasharray="6 3" opacity={0.6} />
            );
          }
          return null;
        })()}

        {/* Room sections */}
        {cw.sections.map((section, idx) => {
          const sx = rxs + section.startOffset * s;
          const sw2 = section.length * s;
          const sh2 = section.height * s;
          const sy = rys + totalH - sh2;

          const isSectionInvisible = isSectionWallInvisible(section);
          const sectionFill = isSectionInvisible
            ? 'none'
            : (idx % 2 === 0 ? 'hsl(30, 30%, 92%)' : 'hsl(30, 25%, 88%)');
          const isGableSection = section.isGable && section.height > 0;

          // Gable sections are rendered collectively after the sections loop (shared triangle)
          if (isGableSection) {
            return null;
          }

          return (
            <g key={`section-${idx}`}>
              {/* Section rectangle */}
              <rect x={sx} y={sy} width={sw2} height={sh2}
                fill={sectionFill} stroke={isSectionInvisible ? 'hsl(0, 0%, 75%)' : 'hsl(222, 47%, 30%)'} strokeWidth={isSectionInvisible ? 0.5 : 1.2} strokeDasharray={isSectionInvisible ? '3 3' : undefined} rx={1} />

              {/* Block pattern — only for non-invisible walls, aligned to composite wall origin */}
              {plan.scaleMode === 'bloque' && !isSectionInvisible && (() => {
                const bwPx = (plan.blockLengthMm / 1000) * s;
                const bhPx = (plan.blockHeightMm / 1000) * s;
                if (bwPx < 3 || bhPx < 2) return null;
                const rows = Math.ceil(sh2 / bhPx);
                const lines: React.ReactElement[] = [];
                // Horizontal lines (per section)
                for (let r = 1; r < rows; r++) {
                  const y = sy + sh2 - r * bhPx;
                  if (y <= sy) break;
                  lines.push(
                    <line key={`bh-${idx}-${r}`} x1={sx} y1={y} x2={sx + sw2} y2={y}
                      stroke="hsl(210, 50%, 35%)" strokeWidth={1.2} opacity={1} pointerEvents="none" />
                  );
                }
                // Vertical lines — aligned to composite wall origin (rxs) so blocks are continuous
                for (let r = 0; r < rows; r++) {
                  const yTop = Math.max(sy, sy + sh2 - (r + 1) * bhPx);
                  const yBot = sy + sh2 - r * bhPx;
                  const offset = r % 2 === 0 ? 0 : bwPx / 2;
                  // Calculate global block columns from composite wall origin
                  const globalStartCol = Math.floor((sx - rxs - offset) / bwPx);
                  const globalEndCol = Math.ceil((sx + sw2 - rxs - offset) / bwPx);
                  for (let c = globalStartCol; c <= globalEndCol; c++) {
                    const x = rxs + offset + c * bwPx;
                    if (x <= sx || x >= sx + sw2) continue;
                    lines.push(
                      <line key={`bv-${idx}-${r}-${c}`} x1={x} y1={yTop} x2={x} y2={Math.min(yBot, sy + sh2)}
                        stroke="hsl(210, 50%, 35%)" strokeWidth={1.0} opacity={1} pointerEvents="none" />
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

              {/* Openings — hidden for invisible sections */}
              {!isSectionInvisible && (() => {
                // Use live openings from liveRooms for accurate positions
                const liveRoom = liveRooms?.find(r => r.id === section.roomId);
                const liveWall = liveRoom?.walls.find(w => w.id === section.wallId);
                const liveOpenings = liveWall?.openings || section.openings;
                // Use overlapStart/fullWallLength for precise opening positioning
                const isHoriz = section.wallIndex === 1 || section.wallIndex === 3;
                const fullWallLen = section.fullWallLength ?? (isHoriz
                  ? (liveRoom?.width || section.length)
                  : (liveRoom?.length || section.length));
                const sectionOverlapStart = section.overlapStart ?? 0;
                // Room start position to convert relative positionX to absolute coordinates
                const roomStart = isHoriz ? (liveRoom?.posX ?? 0) : (liveRoom?.posY ?? 0);
                return liveOpenings.filter(op => {
                  // Filter: only show openings that actually fall within this section's overlap range
                  // opAbsCenter must be in absolute coordinates (same space as sectionOverlapStart)
                  const opAbsCenter = roomStart + op.positionX * fullWallLen;
                  const opHalfW = op.width / 2;
                  return opAbsCenter + opHalfW > sectionOverlapStart - 0.01 &&
                         opAbsCenter - opHalfW < sectionOverlapStart + section.length + 0.01;
                }).map(op => {
                  const opAbsCenter = roomStart + op.positionX * fullWallLen;
                  // Position relative to section start
                  const opCenterInSection = opAbsCenter - sectionOverlapStart;
                  const opWidthPx = op.width * s;
                  const opHeightPx = op.height * s;
                  const sillH = op.sillHeight ?? 0;
                  const opX = sx + (opCenterInSection / section.length) * sw2 - opWidthPx / 2;
                  const opY = sy + sh2 - opHeightPx - sillH * s;
                  const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa';
                  const isSelected = fsScale && fsSelectedOpeningId === op.id;

                  return (
                    <g key={op.id}
                      style={{ cursor: fsScale ? (fsDragState ? 'grabbing' : 'grab') : 'pointer' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (fsScale) { setFsSelectedOpeningId(op.id); }
                        else { onOpeningClick(op); }
                      }}
                      onMouseDown={fsScale && onUpdateOpening ? e => {
                        e.preventDefault(); e.stopPropagation();
                        setFsSelectedOpeningId(op.id);
                        setFsDragState({
                          openingId: op.id, startX: e.clientX, startPosX: op.positionX,
                          wallLength: fullWallLen, opWidth: op.width, scale: s,
                        });
                      } : undefined}>
                      <rect x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                        fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                        stroke={isSelected ? 'hsl(var(--primary))' : (isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)')}
                        strokeWidth={isSelected ? 2 : 1} rx={1} />
                      <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 3} textAnchor="middle"
                        fontSize={fsScale ? 9 : 6} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
                        {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                      </text>
                      {/* 4-edge distance annotations */}
                      {(() => {
                        const distLeft = opCenterInSection - op.width / 2; // distance from section left to opening left (meters)
                        const distRight = section.length - (opCenterInSection + op.width / 2);
                        const distBottom = sillH;
                        const distTop = section.height - sillH - op.height;
                        const fz = fsScale ? 8 : 5.5;
                        const dColor = 'hsl(200, 70%, 40%)';
                        const dStroke = 'hsl(200, 70%, 55%)';
                        const dDash = '2 1.5';
                        const opLeft = opX;
                        const opRight = opX + opWidthPx;
                        const opTop = opY;
                        const opBottom = opY + opHeightPx;
                        return (
                          <>
                            {/* Left distance */}
                            <line x1={sx} y1={opTop + opHeightPx / 2} x2={opLeft} y2={opTop + opHeightPx / 2}
                              stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                            <text x={(sx + opLeft) / 2} y={opTop + opHeightPx / 2 - 2} textAnchor="middle"
                              fontSize={fz} fill={dColor} fontWeight={600}>{Math.round(distLeft * 1000)}</text>
                            {/* Right distance */}
                            <line x1={opRight} y1={opTop + opHeightPx / 2} x2={sx + sw2} y2={opTop + opHeightPx / 2}
                              stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                            <text x={(opRight + sx + sw2) / 2} y={opTop + opHeightPx / 2 - 2} textAnchor="middle"
                              fontSize={fz} fill={dColor} fontWeight={600}>{Math.round(distRight * 1000)}</text>
                            {/* Bottom (sill) distance */}
                            <line x1={opLeft + opWidthPx / 2} y1={opBottom} x2={opLeft + opWidthPx / 2} y2={sy + sh2}
                              stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                            <text x={opLeft + opWidthPx / 2 + 3} y={(opBottom + sy + sh2) / 2 + 3} textAnchor="start"
                              fontSize={fz} fill={dColor} fontWeight={600}>{Math.round(distBottom * 1000)}</text>
                            {/* Top distance */}
                            <line x1={opLeft + opWidthPx / 2} y1={sy} x2={opLeft + opWidthPx / 2} y2={opTop}
                              stroke={dStroke} strokeWidth={0.5} strokeDasharray={dDash} />
                            <text x={opLeft + opWidthPx / 2 + 3} y={(sy + opTop) / 2 + 3} textAnchor="start"
                              fontSize={fz} fill={dColor} fontWeight={600}>{Math.round(distTop * 1000)}</text>
                          </>
                        );
                      })()}
                      {/* Opening size label */}
                      <text x={opX + opWidthPx / 2} y={opY - 4} textAnchor="middle"
                        fontSize={fsScale ? 8 : 5.5} fill="hsl(var(--primary))" fontWeight={600}>
                        {Math.round(op.width * 1000)}×{Math.round(op.height * 1000)}mm
                      </text>
                    </g>
                  );
                });
              })()}
            </g>
          );
        })}

        {/* Shared gable triangle for all gable sections (compact view) */}
        {(() => {
          const gableSections = cw.sections.filter(sec => sec.isGable);
          if (gableSections.length === 0) return null;
          const peakH = Math.max(...gableSections.map(sec => sec.gablePeakHeight ?? sec.height));
          const gableStartX = rxs + gableSections[0].startOffset * s;
          const gableTotalW = gableSections.reduce((sum, gs) => sum + gs.length, 0) * s;
          const baseY = rys + totalH;
          const leftX = gableStartX;
          const rightX = gableStartX + gableTotalW;
          const leftBaseH = (cw.gableStartBaseH ?? 0) * s;
          const rightBaseH = (cw.gableEndBaseH ?? 0) * s;
          const leftBaseY = baseY - leftBaseH;
          const rightBaseY = baseY - rightBaseH;

          const buildingMinY = Math.min(...((liveRooms?.length || 0) > 0 ? liveRooms!.map(r => r.posY) : [cw.startCorner.y, cw.endCorner.y]));
          const buildingMaxY = Math.max(...((liveRooms?.length || 0) > 0 ? liveRooms!.map(r => r.posY + r.length) : [cw.startCorner.y, cw.endCorner.y]));
          const centerY = (buildingMinY + buildingMaxY) / 2;
          const y1 = cw.startCorner.y;
          const y2 = cw.endCorner.y;
          const crossesRidge = Math.abs(y2 - y1) > 1e-6 && (y1 - centerY) * (y2 - centerY) <= 0;
          const ridgeRatio = crossesRidge ? Math.max(0, Math.min(1, (centerY - y1) / (y2 - y1))) : 0.5;
          const peakX = crossesRidge
            ? leftX + gableTotalW * ridgeRatio
            : (leftBaseY <= rightBaseY ? leftX : rightX);
          const peakY = crossesRidge ? baseY - peakH * s : Math.min(leftBaseY, rightBaseY);
          const clipTopY = Math.min(leftBaseY, rightBaseY, peakY);
          const trianglePath = crossesRidge
            ? `M ${leftX} ${leftBaseY} L ${peakX} ${peakY} L ${rightX} ${rightBaseY} L ${rightX} ${baseY} L ${leftX} ${baseY} Z`
            : `M ${leftX} ${leftBaseY} L ${rightX} ${rightBaseY} L ${rightX} ${baseY} L ${leftX} ${baseY} Z`;
          const topYAtX = (x: number) => {
            if (!crossesRidge || Math.abs(rightX - leftX) < 1e-6) {
              return leftBaseY + ((x - leftX) / Math.max(1e-6, rightX - leftX)) * (rightBaseY - leftBaseY);
            }
            if (x <= peakX) {
              return leftBaseY + ((x - leftX) / Math.max(1e-6, peakX - leftX)) * (peakY - leftBaseY);
            }
            return peakY + ((x - peakX) / Math.max(1e-6, rightX - peakX)) * (rightBaseY - peakY);
          };
          const clipId = `comp-gable-shared-${cw.id}`;

          return (
            <g>
              <defs>
                <clipPath id={clipId}>
                  <path d={trianglePath} />
                </clipPath>
              </defs>
              {/* Triangle outline */}
              <path d={trianglePath} fill="none" stroke="hsl(222, 47%, 30%)" strokeWidth={1.2} />

              {/* Per-section rendering within the shared triangle */}
              {gableSections.map((section, gi) => {
                const sx = rxs + section.startOffset * s;
                const sw2 = section.length * s;
                const isInv = isSectionWallInvisible(section);

                if (isInv) {
                  return (
                    <g key={`gable-inv-${gi}`}>
                      {/* Use explicit white (#ffffff) instead of CSS variable for PDF serialization compatibility */}
                      <rect x={sx} y={clipTopY - 5} width={sw2} height={baseY - clipTopY + 10}
                        fill="#ffffff" clipPath={`url(#${clipId})`} />
                      <rect x={sx} y={peakY} width={sw2} height={baseY - peakY}
                        fill="none" stroke="hsl(0, 0%, 75%)" strokeWidth={0.5} strokeDasharray="3 3"
                        clipPath={`url(#${clipId})`} />
                    <text x={sx + sw2 / 2} y={baseY - (baseY - clipTopY) * 0.3} textAnchor="middle"
                        fontSize={fsScale ? 10 : 7} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.5} pointerEvents="none">
                        {section.roomName}
                      </text>
                    </g>
                  );
                }

                const sectionFill = gi % 2 === 0 ? 'hsl(30, 30%, 92%)' : 'hsl(30, 25%, 88%)';
                return (
                  <g key={`gable-vis-${gi}`}>
                  <rect x={sx} y={clipTopY - 5} width={sw2} height={baseY - clipTopY + 10}
                    fill={sectionFill} clipPath={`url(#${clipId})`} />
                  {/* Block pattern */}
                  {plan.scaleMode === 'bloque' && (() => {
                    const bwPx = (plan.blockLengthMm / 1000) * s;
                    const bhPx = (plan.blockHeightMm / 1000) * s;
                      if (bwPx < 3 || bhPx < 2) return null;
                      const hPx = peakH * s;
                      const rowCount = Math.ceil(hPx / bhPx);
                      const lines: React.ReactElement[] = [];
                      for (let r = 1; r < rowCount; r++) {
                        const y = baseY - r * bhPx;
                        if (y <= peakY) break;
                        lines.push(
                          <line key={`gbh-${gi}-${r}`} x1={sx} y1={y} x2={sx + sw2} y2={y}
                            stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                        );
                      }
                      for (let r = 0; r < rowCount; r++) {
                        const yTop2 = Math.max(peakY, baseY - (r + 1) * bhPx);
                        const yBot2 = baseY - r * bhPx;
                        if (yTop2 >= yBot2) continue;
                        const off = r % 2 === 0 ? 0 : bwPx / 2;
                        const startC = Math.floor((sx - rxs - off) / bwPx);
                        const endC = Math.ceil((sx + sw2 - rxs - off) / bwPx);
                        for (let c = startC; c <= endC; c++) {
                          const x = rxs + off + c * bwPx;
                          if (x <= sx || x >= sx + sw2) continue;
                          lines.push(
                            <line key={`gbv-${gi}-${r}-${c}`} x1={x} y1={yTop2} x2={x} y2={yBot2}
                              stroke="hsl(210, 50%, 35%)" strokeWidth={0.6} opacity={0.5} />
                          );
                        }
                      }
                      return <g clipPath={`url(#${clipId})`}>{lines}</g>;
                    })()}
                    <text x={sx + sw2 / 2} y={baseY - (baseY - peakY) * 0.3} textAnchor="middle"
                      fontSize={fsScale ? 10 : 7} fill="hsl(222, 47%, 30%)" fontWeight={600} opacity={0.7} pointerEvents="none">
                      {section.roomName}
                    </text>
                  </g>
                );
              })}

              {/* Section separators within the gable */}
              {gableSections.slice(1).map((section, gi) => {
                const sx = rxs + section.startOffset * s;
                const gTotal = gableSections.reduce((sum, gs) => sum + gs.length, 0);
                const fracFromCenter = Math.abs(section.startOffset - (gableSections[0].startOffset + gTotal / 2)) / (gTotal / 2);
                const sepH = peakH * (1 - Math.min(fracFromCenter, 1));
                const sepTopY = baseY - sepH * s;
                return (
                  <line key={`gable-sep-${gi}`}
                    x1={sx} y1={baseY} x2={sx} y2={sepTopY}
                    stroke="hsl(222, 47%, 40%)" strokeWidth={0.8} strokeDasharray="4 2" />
                );
              })}

              {/* Cumbrera marker */}
              <circle cx={peakX} cy={peakY} r={fsScale ? 3 : 2} fill="hsl(15, 70%, 45%)" />
              {fsScale && <text x={peakX} y={peakY - 6} textAnchor="middle"
                fontSize={9} fill="hsl(15, 70%, 45%)" fontWeight={700}>CUMBRERA</text>}

              {/* Hypotenuse dimension lines + vertical height + half-base (base corner → peak) */}
              {(() => {
                const gableTotalLen = gableSections.reduce((sum, gs) => sum + gs.length, 0);
                const leftBH = cw.gableStartBaseH ?? 0;
                const rightBH = cw.gableEndBaseH ?? 0;
                const leftHorizDist = gableTotalLen * ridgeRatio;
                const rightHorizDist = gableTotalLen * (1 - ridgeRatio);
                const hypLeftM = Math.sqrt(Math.pow(leftHorizDist, 2) + Math.pow(peakH - leftBH, 2));
                const hypRightM = Math.sqrt(Math.pow(rightHorizDist, 2) + Math.pow(peakH - rightBH, 2));
                const fz = fsScale ? 9 : 6.5;
                const hColor = 'hsl(280, 60%, 45%)';
                const lMidX = (leftX + peakX) / 2;
                const lMidY = (leftBaseY + peakY) / 2;
                const rMidX = (peakX + rightX) / 2;
                const rMidY = (peakY + rightBaseY) / 2;
                const dimColor = 'hsl(210, 60%, 45%)';
                const vColor = 'hsl(25, 95%, 45%)';
                const leftHalfMm = Math.round(leftHorizDist * 1000);
                const rightHalfMm = Math.round(rightHorizDist * 1000);
                const halfBaseY2 = baseY + 55;
                return (
                  <>
                    {/* Hypotenuse lines */}
                    <line x1={leftX} y1={leftBaseY} x2={peakX} y2={peakY}
                      stroke={hColor} strokeWidth={0.6} strokeDasharray="4 2" opacity={0.7} />
                    <text x={lMidX - 8} y={lMidY - 4} textAnchor="end"
                      fontSize={fz} fill={hColor} fontWeight={700}
                      transform={`rotate(${Math.atan2(-(peakH - leftBH) * s, leftHorizDist * s) * 180 / Math.PI}, ${lMidX - 8}, ${lMidY - 4})`}>
                      {Math.round(hypLeftM * 1000)} mm
                    </text>
                    <line x1={peakX} y1={peakY} x2={rightX} y2={rightBaseY}
                      stroke={hColor} strokeWidth={0.6} strokeDasharray="4 2" opacity={0.7} />
                    <text x={rMidX + 8} y={rMidY - 4} textAnchor="start"
                      fontSize={fz} fill={hColor} fontWeight={700}
                      transform={`rotate(${Math.atan2((peakH - rightBH) * s, rightHorizDist * s) * 180 / Math.PI}, ${rMidX + 8}, ${rMidY - 4})`}>
                      {Math.round(hypRightM * 1000)} mm
                    </text>
                    {/* Vertical height line base→cumbrera */}
                    <line x1={peakX} y1={peakY} x2={peakX} y2={baseY}
                      stroke={vColor} strokeWidth={0.8} strokeDasharray="4 2" />
                    <line x1={peakX - 5} y1={peakY} x2={peakX + 5} y2={peakY} stroke={vColor} strokeWidth={0.5} />
                    <line x1={peakX - 5} y1={baseY} x2={peakX + 5} y2={baseY} stroke={vColor} strokeWidth={0.5} />
                    <text x={peakX + 8} y={(peakY + baseY) / 2} textAnchor="start"
                      fontSize={fsScale ? 10 : 7} fill={vColor} fontWeight={700}>
                      {Math.round(peakH * 1000)} mm
                    </text>
                    {/* Left half-base */}
                    <line x1={leftX} y1={halfBaseY2} x2={peakX} y2={halfBaseY2} stroke={dimColor} strokeWidth={0.7} />
                    <line x1={leftX} y1={halfBaseY2 - 4} x2={leftX} y2={halfBaseY2 + 4} stroke={dimColor} strokeWidth={0.5} />
                    <line x1={peakX} y1={halfBaseY2 - 4} x2={peakX} y2={halfBaseY2 + 4} stroke={dimColor} strokeWidth={0.5} />
                    <text x={(leftX + peakX) / 2} y={halfBaseY2 - 5} textAnchor="middle"
                      fontSize={fsScale ? 9 : 6.5} fill={dimColor} fontWeight={700}>
                      {leftHalfMm} mm
                    </text>
                    {/* Right half-base */}
                    <line x1={peakX} y1={halfBaseY2} x2={rightX} y2={halfBaseY2} stroke={dimColor} strokeWidth={0.7} />
                    <line x1={rightX} y1={halfBaseY2 - 4} x2={rightX} y2={halfBaseY2 + 4} stroke={dimColor} strokeWidth={0.5} />
                    <text x={(peakX + rightX) / 2} y={halfBaseY2 - 5} textAnchor="middle"
                      fontSize={fsScale ? 9 : 6.5} fill={dimColor} fontWeight={700}>
                      {rightHalfMm} mm
                    </text>
                  </>
                );
              })()}
              {/* Base height dimensions for partial gables */}
              {(() => {
                const leftBH = cw.gableStartBaseH ?? 0;
                const rightBH = cw.gableEndBaseH ?? 0;
                const hColor2 = 'hsl(160, 60%, 35%)';
                const fz2 = fsScale ? 8 : 5.5;
                const elements: React.ReactElement[] = [];
                if (leftBH > 0.01) {
                  elements.push(
                    <g key="left-base-h">
                      <line x1={leftX - 6} y1={baseY} x2={leftX - 6} y2={leftBaseY}
                        stroke={hColor2} strokeWidth={0.6} />
                      <line x1={leftX - 9} y1={baseY} x2={leftX - 3} y2={baseY}
                        stroke={hColor2} strokeWidth={0.4} />
                      <line x1={leftX - 9} y1={leftBaseY} x2={leftX - 3} y2={leftBaseY}
                        stroke={hColor2} strokeWidth={0.4} />
                      <text x={leftX - 11} y={(baseY + leftBaseY) / 2 + 3} textAnchor="end"
                        fontSize={fz2} fill={hColor2} fontWeight={700}>
                        {Math.round(leftBH * 1000)} mm
                      </text>
                    </g>
                  );
                }
                if (rightBH > 0.01) {
                  elements.push(
                    <g key="right-base-h">
                      <line x1={rightX + 6} y1={baseY} x2={rightX + 6} y2={rightBaseY}
                        stroke={hColor2} strokeWidth={0.6} />
                      <line x1={rightX + 3} y1={baseY} x2={rightX + 9} y2={baseY}
                        stroke={hColor2} strokeWidth={0.4} />
                      <line x1={rightX + 3} y1={rightBaseY} x2={rightX + 9} y2={rightBaseY}
                        stroke={hColor2} strokeWidth={0.4} />
                      <text x={rightX + 11} y={(baseY + rightBaseY) / 2 + 3} textAnchor="start"
                        fontSize={fz2} fill={hColor2} fontWeight={700}>
                        {Math.round(rightBH * 1000)} mm
                      </text>
                    </g>
                  );
                }
                return elements;
              })()}
            </g>
          );
        })()}

        {/* Individual section dimension lines */}
        {cw.sections.map((section, idx) => {
          const sx = rxs + section.startOffset * s;
          const sw2 = section.length * s;
          const dimY = rys + totalH + 10;
          const secColor = 'hsl(210, 60%, 45%)';
          const fz = fsScale ? 10 : 7;
          return (
            <g key={`sec-dim-${idx}`}>
              <line x1={sx} y1={dimY} x2={sx + sw2} y2={dimY} stroke={secColor} strokeWidth={0.6} />
              <line x1={sx} y1={dimY - 4} x2={sx} y2={dimY + 4} stroke={secColor} strokeWidth={0.5} />
              <line x1={sx + sw2} y1={dimY - 4} x2={sx + sw2} y2={dimY + 4} stroke={secColor} strokeWidth={0.5} />
              <text x={sx + sw2 / 2} y={dimY - 4} textAnchor="middle"
                fontSize={fz} fill={secColor} fontWeight={700}>
                {Math.round(section.length * 1000)} mm
              </text>
            </g>
          );
        })}

        {/* Total dimension line */}
        <line x1={rxs} y1={rys + totalH + 26} x2={rxs + cw.totalLength * s} y2={rys + totalH + 26}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.8} />
        <line x1={rxs} y1={rys + totalH + 20} x2={rxs} y2={rys + totalH + 32} stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
        <line x1={rxs + cw.totalLength * s} y1={rys + totalH + 20} x2={rxs + cw.totalLength * s} y2={rys + totalH + 32}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.5} />
        <text x={rxs + cw.totalLength * s / 2} y={rys + totalH + 42} textAnchor="middle"
          fontSize={fsScale ? 12 : 9} fill="hsl(25, 95%, 45%)" fontWeight={700}>
          {Math.round(cw.totalLength * 1000)} mm
        </text>

        {/* Height dimension */}
        <line x1={rxs - 12} y1={rys} x2={rxs - 12} y2={rys + totalH}
          stroke="hsl(25, 95%, 45%)" strokeWidth={0.6} />
        <line x1={rxs - 16} y1={rys} x2={rxs - 8} y2={rys} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <line x1={rxs - 16} y1={rys + totalH} x2={rxs - 8} y2={rys + totalH} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
        <text x={rxs - 18} y={rys + totalH / 2} textAnchor="middle"
          fontSize={fsScale ? 11 : 8} fill="hsl(25, 95%, 45%)" fontWeight={600}
          transform={`rotate(-90, ${rxs - 18}, ${rys + totalH / 2})`}>
          {Math.round(maxHeight * 1000)} mm
        </text>

        {/* Corner labels */}
        <text x={rxs - 3} y={rys + totalH + 42} textAnchor="end"
          fontSize={fsScale ? 13 : 9} fill="hsl(var(--primary))" fontWeight={800}>
          {cw.startCorner.label}
        </text>
        <text x={rxs + cw.totalLength * s + 3} y={rys + totalH + 42} textAnchor="start"
          fontSize={fsScale ? 13 : 9} fill="hsl(var(--primary))" fontWeight={800}>
          {cw.endCorner.label}
        </text>

        {/* Ruler lines (fullscreen only) */}
        {fsScale && rulerLines.map((rl, i) => {
          const dx = (rl.x2 - rl.x1);
          const dy = (rl.y2 - rl.y1);
          const distPx = Math.sqrt(dx * dx + dy * dy);
          const distM = distPx / s;
          const midX = (rl.x1 + rl.x2) / 2;
          const midY = (rl.y1 + rl.y2) / 2;
          return (
            <g key={`ruler-${i}`}>
              <line x1={rl.x1} y1={rl.y1} x2={rl.x2} y2={rl.y2}
                stroke="hsl(350, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
              <circle cx={rl.x1} cy={rl.y1} r={3} fill="hsl(350, 80%, 50%)" />
              <circle cx={rl.x2} cy={rl.y2} r={3} fill="hsl(350, 80%, 50%)" />
              <rect x={midX - 28} y={midY - 8} width={56} height={16} rx={3}
                fill="hsl(350, 80%, 50%)" opacity={0.9} />
              <text x={midX} y={midY + 4} textAnchor="middle"
                fontSize={10} fill="white" fontWeight={700}>
                {Math.round(distM * 1000)} mm
              </text>
            </g>
          );
        })}
        {fsScale && rulerDraw && (
          <circle cx={rulerDraw.x1} cy={rulerDraw.y1} r={4} fill="hsl(350, 80%, 50%)" opacity={0.7}>
            <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite" />
          </circle>
        )}
        {/* CAD Ruler */}
        {fsScale && (
          <CadRuler rx={rxs} ry={rys} rw={cw.totalLength * s} rh={totalH} widthM={cw.totalLength} heightM={maxHeight} scale={s} />
        )}
      </svg>
    );
  };

  // Get live block groups for each section from rooms state
  const sectionBlockGroups = useMemo(() => {
    if (!liveRooms) return new Map<number, BlockGroupData[]>();
    const map = new Map<number, BlockGroupData[]>();
    cw.sections.forEach((section, idx) => {
      const room = liveRooms.find(r => r.id === section.roomId);
      const wall = room?.walls.find(w => w.id === section.wallId);
      map.set(idx, wall?.blockGroups || []);
    });
    return map;
  }, [cw.sections, liveRooms]);

  const allBlockGroups = useMemo(() => {
    const all: Array<BlockGroupData & { sectionIdx: number; wallId: string }> = [];
    sectionBlockGroups.forEach((groups, idx) => {
      groups.forEach(bg => all.push({ ...bg, sectionIdx: idx, wallId: cw.sections[idx].wallId }));
    });
    return all;
  }, [sectionBlockGroups, cw.sections]);

  // PDF export handler — landscape A4
  const handleExportPdf = useCallback(() => {
    // Use querySelectorAll and pick the LAST match to get the fullscreen SVG (not the small card behind the dialog)
    const allSvgs = document.querySelectorAll(`[data-composite-pdf="${cw.id}"]`);
    const svgEl = (allSvgs.length > 0 ? allSvgs[allSvgs.length - 1] : null) as SVGSVGElement | null;
    if (!svgEl) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;

    // Header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(budgetName || '', margin, margin + 5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Alzado de coordenadas: ${cw.label} — ${SIDE_LABELS[cw.side] || cw.side} — ${Math.round(cw.totalLength * 1000)} × ${Math.round(maxHeight * 1000)} mm`, margin, margin + 12);

    // Serialize SVG to image — use viewBox dimensions for proper aspect ratio
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 2400, 600];
    const vbW = vb[2] || 2400;
    const vbH = vb[3] || 600;
    const renderW = 3000;
    const renderH = Math.round(renderW * (vbH / vbW));
    svgClone.setAttribute('width', String(renderW));
    svgClone.setAttribute('height', String(renderH));
    svgClone.removeAttribute('style');
    // Inject CAD ruler for PDF
    const rRx = parseFloat(svgEl.getAttribute('data-ruler-rx') || '0');
    const rRy = parseFloat(svgEl.getAttribute('data-ruler-ry') || '0');
    const rRw = parseFloat(svgEl.getAttribute('data-ruler-rw') || '0');
    const rRh = parseFloat(svgEl.getAttribute('data-ruler-rh') || '0');
    const rWm = parseFloat(svgEl.getAttribute('data-ruler-wm') || '0');
    const rHm = parseFloat(svgEl.getAttribute('data-ruler-hm') || '0');
    const rSc = parseFloat(svgEl.getAttribute('data-ruler-scale') || '0');
    if (rRw > 0 && rRh > 0) injectCadRulerIntoSvg(svgClone, rRx, rRy, rRw, rRh, rWm, rHm, rSc);
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, renderW, renderH);
      const imgData = canvas.toDataURL('image/png');
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2 - 20;
      const ratio = Math.min(availW / renderW, availH / renderH);
      const imgW = renderW * ratio;
      const imgH = renderH * ratio;
      doc.addImage(imgData, 'PNG', margin + (availW - imgW) / 2, margin + 18, imgW, imgH);
      doc.save(`${cw.label}_${budgetName || 'alzado'}.pdf`);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [cw, budgetName, maxHeight]);

  // Block grouping helpers for composite wall
  const handleCompositeBlockGroup = useCallback(async () => {
    if (!onAddBlockGroup || selectedBlocks.size < 2) return;
    // Group selected blocks by section
    const bySectionIdx = new Map<number, Array<{ col: number; row: number }>>();
    selectedBlocks.forEach(key => {
      const [sIdx, c, r] = key.split('-').map(Number);
      if (!bySectionIdx.has(sIdx)) bySectionIdx.set(sIdx, []);
      bySectionIdx.get(sIdx)!.push({ col: c, row: r });
    });
    // Create one group per section
    for (const [sIdx, cells] of bySectionIdx) {
      const section = cw.sections[sIdx];
      if (!section) continue;
      const minCol = Math.min(...cells.map(c => c.col));
      const maxCol = Math.max(...cells.map(c => c.col));
      const minRow = Math.min(...cells.map(c => c.row));
      const maxRow = Math.max(...cells.map(c => c.row));
      const spanCols = maxCol - minCol + 1;
      const spanRows = maxRow - minRow + 1;
      const name = `${(spanCols * plan.blockLengthMm).toFixed(0)}×${(spanRows * plan.blockHeightMm).toFixed(0)}×${plan.blockWidthMm}mm`;
      await onAddBlockGroup(section.wallId, minCol, minRow, spanCols, spanRows, name);
    }
    setSelectedBlocks(new Set());
  }, [onAddBlockGroup, selectedBlocks, cw.sections, plan]);

  // Use liveRooms for accurate opening positions
  const rooms_cache_ref: RoomData[] | null = liveRooms || null;

  // Arrow key handler for opening movement in composite fullscreen
  useEffect(() => {
    if (!fullscreen || !fsSelectedOpeningId || !onUpdateOpening) return;
    const handleKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Delete' && onDeleteOpening) {
        onDeleteOpening(fsSelectedOpeningId);
        setFsSelectedOpeningId(null);
        return;
      }
      // Find the opening across all sections
      for (const section of cw.sections) {
        const liveRoom = liveRooms?.find(r => r.id === section.roomId);
        const liveWall = liveRoom?.walls.find(w => w.id === section.wallId);
        const op = liveWall?.openings.find(o => o.id === fsSelectedOpeningId);
        if (!op) continue;
        const isHoriz = section.wallIndex === 1 || section.wallIndex === 3;
        const fullWallLen = isHoriz ? (liveRoom!.width) : (liveRoom!.length);
        const step = e.shiftKey ? 0.005 : 0.001; // ~5mm or ~1mm
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const deltaFraction = (step * dir);
          const halfW = (op.width / 2) / fullWallLen;
          const newPosX = Math.max(halfW, Math.min(1 - halfW, op.positionX + deltaFraction));
          onUpdateOpening(fsSelectedOpeningId, { positionX: newPosX });
        } else {
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          const newSill = Math.max(0, (op.sillHeight ?? 0) + step * dir);
          onUpdateOpening(fsSelectedOpeningId, { sillHeight: newSill });
        }
        break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, fsSelectedOpeningId, onUpdateOpening, onDeleteOpening, cw.sections, liveRooms]);

  // Drag handler for composite fullscreen
  const handleCompositeFsMouseMove = useCallback((e: React.MouseEvent) => {
    if (!fsDragState || !onUpdateOpening) return;
    const deltaPixels = e.clientX - fsDragState.startX;
    const deltaMeters = deltaPixels / fsDragState.scale;
    const deltaFraction = deltaMeters / fsDragState.wallLength;
    const halfW = (fsDragState.opWidth / 2) / fsDragState.wallLength;
    const newPosX = Math.max(halfW, Math.min(1 - halfW, fsDragState.startPosX + deltaFraction));
    onUpdateOpening(fsDragState.openingId, { positionX: newPosX });
  }, [fsDragState, onUpdateOpening]);

  const isBlockMode = plan.scaleMode === 'bloque';

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow group">
        <CardHeader className="py-2 px-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm font-bold">{cw.label}</CardTitle>
              <Badge variant="default" className="text-[9px] h-4">{SIDE_LABELS[cw.side] || cw.side}</Badge>
              <Badge variant="outline" className="text-[9px] h-4">{Math.round(cw.totalLength * 1000)} mm</Badge>
              <Badge variant="secondary" className="text-[9px] h-4">{cw.sections.length} espacios</Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {cw.objectSummary.totalBlocks && (
                <Badge variant="outline" className="text-[9px] h-4 bg-accent/30">
                  {cw.objectSummary.totalBlocks.total} bloques · {plan.blockLengthMm}×{plan.blockHeightMm}mm
                </Badge>
              )}
              {cw.objectSummary.doors > 0 && (
                <Badge variant="outline" className="text-[9px] h-4">{cw.objectSummary.doors} puertas</Badge>
              )}
              {cw.objectSummary.windows > 0 && (
                <Badge variant="outline" className="text-[9px] h-4">{cw.objectSummary.windows} ventanas</Badge>
              )}
              {onUpdateWall && (
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`¿Eliminar el alzado de coordenadas "${cw.label}"? Se ocultará de la vista.`)) return;
                    for (const section of cw.sections) {
                      await onUpdateWall(section.wallId, { elevationGroup: '__hidden__' });
                    }
                  }}
                  disabled={saving}
                  title="Eliminar alzado de coordenadas">
                  <Trash2 className="h-3 w-3" />
                </Button>
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
          {/* Object summary with delete buttons */}
          {cw.objectSummary.openingDetails.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5 pt-1 border-t border-border/30">
              {cw.objectSummary.openingDetails.map(od => (
                <Badge key={od.type} variant="outline" className="text-[9px] h-4">
                  {od.count}× {od.label}
                </Badge>
              ))}
            </div>
          )}
          {/* Individual openings with delete */}
          {onDeleteOpening && cw.sections.flatMap(s => s.openings).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1 pt-1 border-t border-border/30">
              {cw.sections.flatMap(section => section.openings.map(op => (
                <div key={op.id} className="flex items-center gap-0.5 text-[9px] bg-muted/40 rounded px-1 py-0.5">
                  <span>{OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}</span>
                  <span className="text-muted-foreground">{Math.round(op.width * 1000)}×{Math.round(op.height * 1000)}</span>
                  <button className="ml-0.5 text-destructive hover:text-destructive/80"
                    onClick={e => { e.stopPropagation(); onDeleteOpening(op.id); }}
                    disabled={saving}>
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen dialog with block editing */}
      <Dialog open={fullscreen} onOpenChange={(open) => { setFullscreen(open); if (!open) { setSelectedBlocks(new Set()); setFsSelectedOpeningId(null); setFsDragState(null); } }}>
        <DialogContent className="!max-w-none !w-screen !h-screen !m-0 !p-4 !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 flex flex-col print:!p-2" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
              {budgetName && <span className="font-bold print:text-lg">{budgetName} —</span>}
              {cw.label}
              <Badge variant="default" className="text-xs print:hidden">{SIDE_LABELS[cw.side]}</Badge>
              <Badge variant="outline" className="text-xs print:hidden">{Math.round(cw.totalLength * 1000)} × {Math.round(maxHeight * 1000)} mm</Badge>
              <Badge variant="secondary" className="text-xs print:hidden">{cw.sections.length} espacios</Badge>
              {cw.objectSummary.totalBlocks && (
                <Badge variant="outline" className="text-xs print:hidden">
                  {cw.objectSummary.totalBlocks.total} bloques · {plan.blockLengthMm}×{plan.blockHeightMm}mm
                </Badge>
              )}
              {cw.objectSummary.openingDetails.map(od => (
                <Badge key={od.type} variant="outline" className="text-xs print:hidden">
                  {od.count}× {od.label}
                </Badge>
              ))}
              <div className="flex items-center gap-1 ml-auto print:hidden">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportPdf}>
                  <FileDown className="h-3 w-3 mr-1" /> PDF A4 horizontal
                </Button>
                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>
                  ✕ Cerrar
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Vista a pantalla completa de alzado de coordenadas</DialogDescription>
          </DialogHeader>

          {/* Opening movement toolbar */}
          {fsSelectedOpeningId && onUpdateOpening && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap border-b border-border/50 pb-2 print:hidden">
              <span className="text-xs text-primary font-medium">
                Hueco seleccionado — ←→ mover · ↑↓ alféizar · Shift=5mm · Supr=borrar
              </span>
              {onDeleteOpening && (
                <Button variant="destructive" size="sm" className="h-6 text-[10px] ml-auto"
                  onClick={() => { onDeleteOpening(fsSelectedOpeningId); setFsSelectedOpeningId(null); }}
                  disabled={saving}>
                  <Trash2 className="h-3 w-3 mr-1" /> Eliminar hueco
                </Button>
              )}
            </div>
          )}

          {/* Block editing toolbar */}
          {isBlockMode && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap border-b border-border/50 pb-2 print:hidden">
              <span className="text-xs text-muted-foreground">
                {selectedBlocks.size > 0
                  ? `${selectedBlocks.size} bloques seleccionados`
                  : 'Haz clic en los bloques para seleccionarlos'}
              </span>
              {selectedBlocks.size >= 2 && onAddBlockGroup && (
                <Button size="sm" variant="default" className="h-7 text-xs gap-1"
                  disabled={saving} onClick={handleCompositeBlockGroup}>
                  <Merge className="h-3 w-3" /> Agrupar ({selectedBlocks.size})
                </Button>
              )}
              {selectedBlocks.size > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setSelectedBlocks(new Set())}>
                  Limpiar selección
                </Button>
              )}
              {allBlockGroups.length > 0 && (
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                  {allBlockGroups.map((bg, i) => (
                    <Badge key={bg.id} variant="secondary"
                      className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                      style={bg.color ? { backgroundColor: bg.color + '30', borderColor: bg.color } : undefined}>
                      {bg.name || `${bg.spanCols}×${bg.spanRows}`}
                      {onDeleteBlockGroup && (
                        <button className="ml-0.5 hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDeleteBlockGroup(bg.id); }}
                          disabled={saving}>
                          <Unlink className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ruler toolbar */}
          <div className="shrink-0 flex items-center gap-2 border-b border-border/50 pb-2 print:hidden">
            <Button size="sm" variant={rulerMode ? 'default' : 'outline'} className="h-7 text-xs gap-1"
              onClick={() => { setRulerMode(!rulerMode); setRulerDraw(null); }}>
              <Ruler className="h-3 w-3" /> {rulerMode ? 'Regla activa' : 'Regla'}
            </Button>
            {rulerLines.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{rulerLines.length} medida{rulerLines.length > 1 ? 's' : ''}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setRulerLines([]); setRulerDraw(null); }}>
                  Borrar medidas
                </Button>
              </>
            )}
            {rulerMode && (
              <span className="text-xs text-muted-foreground ml-2">
                Haz clic en dos puntos del alzado para medir la distancia
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center min-h-0 relative"
            onMouseDown={rulerMode ? (e) => {
              const svgEl = rulerSvgRef.current || (e.currentTarget.querySelector('svg') as SVGSVGElement);
              if (!svgEl) return;
              rulerSvgRef.current = svgEl;
              const rect = svgEl.getBoundingClientRect();
              const viewBox = svgEl.viewBox.baseVal;
              const scaleX = viewBox.width / rect.width;
              const scaleY = viewBox.height / rect.height;
              const svgX = (e.clientX - rect.left) * scaleX;
              const svgY = (e.clientY - rect.top) * scaleY;
              if (rulerDraw) {
                setRulerLines(prev => [...prev, { x1: rulerDraw.x1, y1: rulerDraw.y1, x2: svgX, y2: svgY }]);
                setRulerDraw(null);
              } else {
                setRulerDraw({ x1: svgX, y1: svgY });
              }
            } : undefined}
          >
            {isBlockMode ? (
              <CompositeFullscreenBlockGrid
                compositeWall={cw}
                plan={plan}
                maxHeight={maxHeight}
                selectedBlocks={selectedBlocks}
                sectionBlockGroups={sectionBlockGroups}
                onToggleBlock={(key) => {
                  if (rulerMode) return;
                  setSelectedBlocks(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                }}
                onOpeningClick={onOpeningClick}
                rulerLines={rulerLines}
                rulerDraw={rulerDraw}
                totalLength={cw.totalLength}
                liveRooms={liveRooms}
              />
            ) : (
              renderCompositeSvg(Math.min(
                (window.innerHeight * 0.8) / maxHeight,
                (window.innerWidth * 0.9) / cw.totalLength
              ))
            )}
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
