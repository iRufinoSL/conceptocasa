// Floor plan calculation engine

export type ScaleMode = 'metros' | 'bloque';

export interface FloorPlanData {
  width: number;
  length: number;
  defaultHeight: number;
  externalWallThickness: number;
  internalWallThickness: number;
  roofOverhang: number;
  roofSlopePercent: number;
  roofType: 'dos_aguas' | 'cuatro_aguas' | 'plana';
  scaleMode: ScaleMode;
  blockLengthMm: number; // largo del bloque exterior en mm (default 625)
  blockHeightMm: number; // alto del bloque exterior en mm (default 250)
  blockWidthMm: number;  // ancho/espesor del bloque exterior en mm (default 300)
  intBlockLengthMm: number; // largo del bloque interior en mm (default 625)
  intBlockHeightMm: number; // alto del bloque interior en mm (default 500)
  intBlockWidthMm: number;  // ancho/espesor del bloque interior en mm (default 100)
  ridgeHeight?: number;  // altura libre base-cumbrera (metros), alternativa a roofSlopePercent
}

/** Get block dimensions based on wall type */
export function getBlockDimensions(plan: FloorPlanData, isExternal: boolean): { lengthMm: number; heightMm: number; widthMm: number } {
  if (isExternal) {
    return { lengthMm: plan.blockLengthMm, heightMm: plan.blockHeightMm, widthMm: plan.blockWidthMm };
  }
  return { lengthMm: plan.intBlockLengthMm, heightMm: plan.intBlockHeightMm, widthMm: plan.intBlockWidthMm };
}

/** Convert slope percentage to degrees */
export function slopePercentToDegrees(percent: number): number {
  return Math.atan(percent / 100) * (180 / Math.PI);
}

/** Convert degrees to slope percentage */
export function degreesToSlopePercent(degrees: number): number {
  return Math.tan(degrees * Math.PI / 180) * 100;
}

/** Calculate ridge height from slope and building half-width */
export function calcRidgeHeight(slopePercent: number, halfWidth: number): number {
  return halfWidth * (slopePercent / 100);
}

/** Calculate slope percent from ridge height and building half-width */
export function calcSlopeFromRidge(ridgeHeight: number, halfWidth: number): number {
  if (halfWidth <= 0) return 0;
  return (ridgeHeight / halfWidth) * 100;
}

/** Convert block count to meters */
export function blocksToMeters(blocks: number, blockSizeMm: number): number {
  return blocks * blockSizeMm / 1000;
}

/** Convert meters to block count (rounded) */
export function metersToBlocks(meters: number, blockSizeMm: number): number {
  return Math.round(meters / (blockSizeMm / 1000) * 100) / 100;
}

/** Get wall thickness in meters from block width */
export function blockWallThickness(plan: FloorPlanData): number {
  return plan.blockWidthMm / 1000;
}

export interface FloorLevel {
  id: string;
  name: string;
  level: string; // planta_1, planta_2, bajo_cubierta
  orderIndex: number;
}

export interface RoomData {
  id: string;
  name: string;
  posX: number;
  posY: number;
  width: number;
  length: number;
  height?: number;
  hasFloor: boolean;
  hasCeiling: boolean;
  hasRoof: boolean;
  floorId?: string;
  groupId?: string;
  groupName?: string;
  walls: WallData[];
}

// 6 wall types: exterior/interior × normal/compartida/invisible
export type WallType = 'exterior' | 'exterior_compartida' | 'exterior_invisible' | 'interior' | 'interior_compartida' | 'interior_invisible';

export function isExteriorType(t: string): boolean { return t.startsWith('exterior'); }
export function isInvisibleType(t: string): boolean { return t.endsWith('_invisible'); }
export function isCompartidaType(t: string): boolean { return t.endsWith('_compartida'); }
export function isVisibleWall(t: string): boolean { return !isInvisibleType(t); }

// Map legacy DB values to new types
export function migrateLegacyWallType(t: string): WallType {
  if (t === 'externa') return 'exterior';
  if (t === 'interna') return 'interior';
  if (t === 'invisible') return 'interior_invisible';
  if (t === 'compartida') return 'interior_compartida';
  return t as WallType;
}

export interface WallData {
  id: string;
  wallIndex: number; // 1=top, 2=right, 3=bottom, 4=left
  wallType: WallType;
  thickness?: number;
  height?: number;
  elevationGroup?: string;
  openings: OpeningData[];
  blockGroups?: BlockGroupData[];
  segmentTypeOverrides?: Record<string, WallType>; // key = segment index "0","1",etc.
}



export interface OpeningData {
  id: string;
  openingType: 'puerta' | 'puerta_externa' | 'hueco_paso' | 'ventana_grande' | 'ventana_mediana' | 'ventana_pequeña' | 'ventana_balconera';
  name?: string;
  width: number;
  height: number;
  sillHeight: number; // altura sobre el suelo en metros
  positionX: number; // 0-1 fraction along the wall
}

export interface BlockGroupData {
  id: string;
  wallId: string;
  startCol: number;
  startRow: number;
  spanCols: number;
  spanRows: number;
  name?: string;
  color?: string;
}

export interface WallSegment {
  startFraction: number; // 0-1 along the wall
  endFraction: number;   // 0-1 along the wall
  startMeters: number;
  endMeters: number;
  segmentType: WallType;
  neighborRoomId?: string;
  neighborWallIndex?: number;
}

export interface WallSegmentCalc {
  segmentIndex: number;
  segmentType: WallType;
  lengthM: number;
  grossArea: number;
  openingsArea: number;
  netArea: number;
  neighborRoomId?: string;
  neighborRoomName?: string;
}

export interface WallCalculation {
  wallIndex: number;
  wallType: WallType;
  wallLength: number;
  wallHeight: number;
  thickness: number;
  grossArea: number;
  openingsArea: number;
  netArea: number;
  baseLength: number; // length of wall base (for linear meters)
  openings: { type: string; area: number; count: number }[];
  segments?: WallSegmentCalc[];
}

export interface GableCalculation {
  side: 'front' | 'back'; // which gable end
  baseWidth: number; // width of the gable base at wall height
  peakHeight: number; // height from wall top to roof peak
  triangleArea: number; // m2 of the gable triangle
  roomPortions: { roomId: string; roomName: string; proportionalArea: number; isExternal: boolean }[];
}

export interface RoomCalculation {
  roomId: string;
  roomName: string;
  floorId?: string;
  floorArea: number; // m2 de suelo útil
  ceilingArea: number; // m2 de techo
  roomHeight: number; // altura de la estancia
  hasFloor: boolean;
  hasCeiling: boolean;
  hasRoof: boolean;
  gableExternalArea: number; // m2 of gable triangle on external walls for this room
  gableInternalArea: number; // m2 of gable triangle on internal walls (rooms without ceiling)
  walls: WallCalculation[];
  totalExternalWallArea: number;
  totalInternalWallArea: number;
  totalOpeningsArea: number;
  doorCount: number;
  windowCount: number;
}

export interface FloorSummary {
  floorId: string;
  floorName: string;
  floorLevel: string;
  totalUsableM2: number;
  totalBuiltM2: number;
  totalExternalWallM2: number;
  totalInternalWallM2: number;
  totalFloorM2: number;
  totalCeilingM2: number;
  totalDoors: number;
  totalWindows: number;
  gableExternalM2: number;
  gableInternalM2: number;
  externalPerimeterMl: number; // Perímetro paredes externas (no invisibles) en metros
  floorPerimeterMl: number;   // Perímetro total de planta en metros
  roofPerimeterMl?: number;   // Perímetro de cubierta (con alero) para bajo cubierta
  rooms: RoomCalculation[];
}

export interface FloorPlanSummary {
  // Global
  plantaTotalM2: number; // width * length
  roofM2: number;
  
  // Aggregated from rooms
  totalUsableM2: number; // sum of room floor areas
  totalBuiltM2: number; // usable + wall footprints
  totalExternalWallM2: number; // net (after subtracting openings)
  totalExternalWallGrossM2: number; // gross (before openings)
  totalExternalWallOpeningsM2: number; // total openings area in external walls
  totalInternalWallM2: number; // net
  totalInternalWallGrossM2: number;
  totalInternalWallOpeningsM2: number;
  totalFloorM2: number; // sum of all room floors
  totalCeilingM2: number; // sum of all room ceilings
  totalExternalWallBaseM: number; // linear meters of external wall bases
  totalInternalWallBaseM: number; // linear meters of internal wall bases
  totalDoors: number;
  totalWindows: number;
  
  // Gable totals
  totalGableExternalM2: number;
  totalGableInternalM2: number;
  gables: GableCalculation[];
  
  // Detailed opening counts by type
  openingsByType: Record<string, number>;
  
  // Per-floor summaries
  floorSummaries: FloorSummary[];
  
  rooms: RoomCalculation[];
}
/**
 * Calculate auto wall height for bajo cubierta rooms under dos_aguas roof.
 * Ridge runs along Y axis. Height at X = riseM - slopeRatio * |X - ridgeX|.
 * Room is bajo cubierta if height === 0 or height is undefined/null with appropriate roof type.
 */
export function calcBajoCubiertaWallHeight(
  room: RoomData, wallIndex: number, plan: FloorPlanData, allRooms: RoomData[]
): number | undefined {
  if (plan.roofType !== 'dos_aguas') return undefined;
  // Accept rooms with height 0 or undefined (bajo cubierta)
  if (room.height !== 0 && room.height !== undefined && room.height !== null) return undefined;
  let bbMinX = Infinity, bbMaxX = -Infinity;
  allRooms.forEach(r => { if (r.posX >= 0) { bbMinX = Math.min(bbMinX, r.posX); bbMaxX = Math.max(bbMaxX, r.posX + r.width); } });
  if (!isFinite(bbMinX)) return undefined;
  const buildingWidth = bbMaxX - bbMinX;
  const ridgeX = bbMinX + buildingWidth / 2;
  // Gable and wall heights are between walls (no eave overhang)
  const halfWidth = buildingWidth / 2 + plan.externalWallThickness;
  const slopeRatio = plan.roofSlopePercent / 100;
  const riseM = halfWidth * slopeRatio;
  const getH = (x: number) => Math.max(0, riseM - Math.abs(x - ridgeX) * slopeRatio);
  const EPSILON = 0.05;
  switch (wallIndex) {
    case 2: return getH(room.posX + room.width); // right wall
    case 4: return getH(room.posX); // left wall
    case 1: { // top wall — check if it's at building edge (posY == bbMinY)
      const bbMinY = Math.min(...allRooms.filter(r => r.posX >= 0).map(r => r.posY));
      if (Math.abs(room.posY - bbMinY) < EPSILON) return 0; // At building edge: roof rests on lower level
      return (getH(room.posX) + getH(room.posX + room.width)) / 2;
    }
    case 3: { // bottom wall — check if it's at building edge (posY + length == bbMaxY)
      const bbMaxY = Math.max(...allRooms.filter(r => r.posX >= 0).map(r => r.posY + r.length));
      if (Math.abs(room.posY + room.length - bbMaxY) < EPSILON) return 0; // At building edge
      return (getH(room.posX) + getH(room.posX + room.width)) / 2;
    }
    default: return undefined;
  }
}


function getWallLength(room: RoomData, wallIndex: number): number {
  // 1=top (width), 2=right (length), 3=bottom (width), 4=left (length)
  return (wallIndex === 1 || wallIndex === 3) ? room.width : room.length;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  if (wall.height != null && wall.height > 0) return wall.height;
  if (room.height != null && room.height > 0) return room.height;
  // height === 0 means bajo cubierta — return 0 so gable logic can handle it
  if (room.height === 0) return 0;
  return plan.defaultHeight;
}

function getWallThickness(wall: WallData, plan: FloorPlanData): number {
  if (wall.thickness) return wall.thickness;
  return isExteriorType(wall.wallType) ? plan.externalWallThickness : plan.internalWallThickness;
}

export function calculateRoom(room: RoomData, plan: FloorPlanData): RoomCalculation {
  const floorArea = room.width * room.length;
  const ceilingArea = floorArea;
  
  let totalExternalWallArea = 0;
  let totalInternalWallArea = 0;
  let totalOpeningsArea = 0;
  let doorCount = 0;
  let windowCount = 0;
  
  const wallCalcs: WallCalculation[] = room.walls.map(wall => {
    const wallLength = getWallLength(room, wall.wallIndex);
    const wallHeight = getWallHeight(wall, room, plan);
    const thickness = getWallThickness(wall, plan);
    const grossArea = wallLength * wallHeight;
    
    let openingsArea = 0;
    const openingsSummary: { type: string; area: number; count: number }[] = [];
    
    wall.openings.forEach(op => {
      const area = op.width * op.height;
      openingsArea += area;
      
      if (op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'hueco_paso') {
        doorCount++;
      } else {
        windowCount++;
      }
      
      const existing = openingsSummary.find(o => o.type === op.openingType);
      if (existing) {
        existing.area += area;
        existing.count++;
      } else {
        openingsSummary.push({ type: op.openingType, area, count: 1 });
      }
    });
    
    const netArea = grossArea - openingsArea;
    
    if (isInvisibleType(wall.wallType)) {
      // Invisible walls don't count as wall area
    } else if (isExteriorType(wall.wallType)) {
      totalExternalWallArea += netArea;
    } else {
      totalInternalWallArea += netArea;
    }
    totalOpeningsArea += openingsArea;
    
    return {
      wallIndex: wall.wallIndex,
      wallType: wall.wallType,
      wallLength,
      wallHeight,
      thickness,
      grossArea,
      openingsArea,
      netArea,
      baseLength: wallLength,
      openings: openingsSummary,
    };
  });
  
  return {
    roomId: room.id,
    roomName: room.name,
    floorId: room.floorId,
    floorArea,
    ceilingArea,
    roomHeight: room.height || plan.defaultHeight,
    hasFloor: room.hasFloor !== false,
    hasCeiling: room.hasCeiling !== false,
    hasRoof: room.hasRoof !== false,
    gableExternalArea: 0, // filled in by calculateGables
    gableInternalArea: 0,
    walls: wallCalcs,
    totalExternalWallArea,
    totalInternalWallArea,
    totalOpeningsArea,
    doorCount,
    windowCount,
  };
}

export function calculateRoof(plan: FloorPlanData, rooms?: RoomData[]): number {
  // Use actual rooms bounding box if available, otherwise plan dimensions
  let planW = plan.width;
  let planL = plan.length;
  if (rooms && rooms.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rooms.forEach(r => {
      minX = Math.min(minX, r.posX);
      minY = Math.min(minY, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxY = Math.max(maxY, r.posY + r.length);
    });
    if (isFinite(minX)) {
      planW = maxX - minX;
      planL = maxY - minY;
    }
  }

  const baseWidth = planW + 2 * plan.roofOverhang;
  const baseLength = planL + 2 * plan.roofOverhang;
  
  if (plan.roofType === 'plana') {
    return baseWidth * baseLength;
  }
  
  const slopeRatio = plan.roofSlopePercent / 100;
  
  if (plan.roofType === 'dos_aguas') {
    const halfWidth = baseWidth / 2;
    const rise = halfWidth * slopeRatio;
    const slopeLength = Math.sqrt(halfWidth * halfWidth + rise * rise);
    return 2 * slopeLength * baseLength;
  }
  
  // cuatro_aguas (hip roof)
  const halfWidth = baseWidth / 2;
  const halfLength = baseLength / 2;
  const riseW = halfWidth * slopeRatio;
  const riseL = halfLength * slopeRatio;
  const slopeLengthW = Math.sqrt(halfWidth * halfWidth + riseW * riseW);
  const slopeLengthL = Math.sqrt(halfLength * halfLength + riseL * riseL);
  return 2 * (0.5 * baseWidth * slopeLengthW) + 2 * (0.5 * baseLength * slopeLengthL);
}

// Auto-classify wall types based on geometry:
// - Walls on the outer perimeter of all rooms = 'externa'
// - Walls shared between two rooms = 'compartida'
// - Other walls = 'interna'
export function autoClassifyWalls(rooms: RoomData[], plan?: FloorPlanData): Map<string, WallType> {
  const EPSILON = 0.05;
  const classification = new Map<string, WallType>();
  const sharedWalls = detectSharedWalls(rooms);

  if (rooms.length === 0) return classification;

  // Compute bounding box to determine perimeter
  let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity;
  rooms.forEach(r => {
    bbMinX = Math.min(bbMinX, r.posX);
    bbMinY = Math.min(bbMinY, r.posY);
    bbMaxX = Math.max(bbMaxX, r.posX + r.width);
    bbMaxY = Math.max(bbMaxY, r.posY + r.length);
  });

  const isOnPerimeter = (room: RoomData, wallIdx: number): boolean => {
    switch (wallIdx) {
      case 1: return Math.abs(room.posY - bbMinY) < EPSILON;
      case 2: return Math.abs(room.posX + room.width - bbMaxX) < EPSILON;
      case 3: return Math.abs(room.posY + room.length - bbMaxY) < EPSILON;
      case 4: return Math.abs(room.posX - bbMinX) < EPSILON;
      default: return false;
    }
  };

  rooms.forEach(room => {
    [1, 2, 3, 4].forEach(wallIdx => {
      const key = `${room.id}::${wallIdx}`;
      const wall = room.walls.find(w => w.wallIndex === wallIdx);
      const onPerimeter = isOnPerimeter(room, wallIdx);

      // CRITICAL: Check shared walls FIRST to avoid double-counting.
      // When two rooms share a wall, only the "owner" counts the area;
      // the other side is always invisible, regardless of what's stored in DB.
      // Ownership prefers visible walls: if one side is invisible, the other is owner.
      if (sharedWalls.has(key)) {
        const neighborId = sharedWalls.get(key)!.neighborRoomId;
        const neighborWallIdx = sharedWalls.get(key)!.neighborWallIndex;
        const neighborRoom = rooms.find(r => r.id === neighborId);
        const neighborWall = neighborRoom?.walls.find(w => w.wallIndex === neighborWallIdx);
        const thisIsInvisible = wall && !wall.id.startsWith('temp-') && isInvisibleType(wall.wallType);
        const neighborIsInvisible = neighborWall && !neighborWall.id.startsWith('temp-') && isInvisibleType(neighborWall.wallType);
        const sameGroup = room.groupId && neighborRoom?.groupId === room.groupId;

        // For interior walls: if either side is manually set to interior_invisible,
        // it means "no physical wall" (open plan). Both sides stay invisible.
        const thisIsInteriorInvisible = thisIsInvisible && !isExteriorType(wall!?.wallType || 'interior');
        const neighborIsInteriorInvisible = neighborIsInvisible && !isExteriorType(neighborWall!?.wallType || 'interior');
        const noPhysicalWall = !onPerimeter && (thisIsInteriorInvisible || neighborIsInteriorInvisible);

        let isOwner: boolean;
        if (sameGroup || noPhysicalWall) {
          isOwner = false; // intra-group or explicitly no wall
        } else if (thisIsInvisible && neighborIsInvisible) {
          isOwner = room.id < neighborId; // both invisible exterior: fallback to ID-based
        } else if (thisIsInvisible) {
          isOwner = false;
        } else if (neighborIsInvisible) {
          isOwner = true;
        } else {
          isOwner = room.id < neighborId;
        }

        if (!isOwner) {
          // Non-owner side is ALWAYS invisible to prevent double-counting
          if (noPhysicalWall) {
            classification.set(key, 'interior_invisible');
          } else {
            classification.set(key, onPerimeter ? 'exterior_invisible' : 'interior_invisible');
          }
          return;
        }
        // Owner side: use manual type if set, otherwise auto-classify
        if (wall && !wall.id.startsWith('temp-') && wall.wallType) {
          const manualType = migrateLegacyWallType(wall.wallType as string);
          // Ensure it's the compartida variant of whatever the user chose
          if (isExteriorType(manualType) && !isInvisibleType(manualType)) {
            classification.set(key, 'exterior_compartida');
          } else if (isInvisibleType(manualType)) {
            classification.set(key, manualType);
          } else {
            classification.set(key, 'interior_compartida');
          }
        } else {
          classification.set(key, onPerimeter ? 'exterior_compartida' : 'interior_compartida');
        }
        return;
      }

      // If the user has manually set the wall type (stored in DB), respect it
      if (wall && !wall.id.startsWith('temp-') && wall.wallType) {
        classification.set(key, migrateLegacyWallType(wall.wallType as string));
        return;
      }

      // Check if any room is adjacent on that side (not shared but touching)
      const hasNeighbor = rooms.some(other => {
        if (other.id === room.id) return false;
        switch (wallIdx) {
          case 1:
            return Math.abs(other.posY + other.length - room.posY) < EPSILON &&
              Math.max(other.posX, room.posX) < Math.min(other.posX + other.width, room.posX + room.width) - EPSILON;
          case 2:
            return Math.abs(other.posX - (room.posX + room.width)) < EPSILON &&
              Math.max(other.posY, room.posY) < Math.min(other.posY + other.length, room.posY + room.length) - EPSILON;
          case 3:
            return Math.abs(other.posY - (room.posY + room.length)) < EPSILON &&
              Math.max(other.posX, room.posX) < Math.min(other.posX + other.width, room.posX + room.width) - EPSILON;
          case 4:
            return Math.abs(other.posX + other.width - room.posX) < EPSILON &&
              Math.max(other.posY, room.posY) < Math.min(other.posY + other.length, room.posY + room.length) - EPSILON;
          default: return false;
        }
      });

      if (hasNeighbor) {
        classification.set(key, 'interior');
      } else {
        classification.set(key, onPerimeter ? 'exterior' : 'interior');
      }
    });
  });

  // Bajo cubierta override: rooms with height=0 in a dos_aguas roof.
  // The ridge runs along the Y axis (length), so:
  // - Walls 1 (top/AB) & 3 (bottom/CD) are under the roof slope → exterior_invisible
  // - Walls 2 (right/BC) & 4 (left/DA) are the gable/hastial walls → remain exterior
  if (plan && plan.roofType === 'dos_aguas') {
    rooms.forEach(room => {
      if (room.height !== undefined && room.height === 0) {
        [1, 3].forEach(wallIdx => {
          const key = `${room.id}::${wallIdx}`;
          const current = classification.get(key);
          if (current && isExteriorType(current) && !isInvisibleType(current)) {
            classification.set(key, 'exterior_invisible');
          }
        });
      }
    });
  }

  return classification;
}

/**
 * Calculate gable walls (hastiales) for a gable roof (dos_aguas).
 * The gable triangle appears on the front and back walls.
 * For rooms without ceiling, internal walls extend up into the gable.
 */
export function calculateGables(plan: FloorPlanData, rooms: RoomData[], wallClassification: Map<string, WallType>): GableCalculation[] {
  if (plan.roofType === 'plana' || plan.roofSlopePercent === 0 || rooms.length === 0) return [];
  
  // For dos_aguas: ridge runs along Y (length), gables on right (wallIndex 2) and left (wallIndex 4)
  // For cuatro_aguas: no gables (hip roof has slopes on all sides)
  if (plan.roofType === 'cuatro_aguas') return [];

  // Get bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.posX);
    minY = Math.min(minY, r.posY);
    maxX = Math.max(maxX, r.posX + r.width);
    maxY = Math.max(maxY, r.posY + r.length);
  });

  const extT = plan.externalWallThickness;
  const totalWidth = (maxX - minX) + 2 * extT;
  const slope = plan.roofSlopePercent / 100;
  const halfWidth = totalWidth / 2;
  const peakHeight = halfWidth * slope;
  const gableBaseWidth = totalWidth;
  const triangleArea = (gableBaseWidth * peakHeight) / 2;

  const EPSILON = 0.05;
  const gables: GableCalculation[] = [];

  // Right gable (wallIndex 2, BC side) and Left gable (wallIndex 4, DA side)
  const sides: Array<{ side: 'front' | 'back'; wallIndex: number; edgeCoord: number }> = [
    { side: 'front', wallIndex: 2, edgeCoord: maxX },   // right edge (BC)
    { side: 'back', wallIndex: 4, edgeCoord: minX },    // left edge (DA)
  ];

  sides.forEach(({ side, wallIndex, edgeCoord }) => {
    // Find rooms touching this gable edge
    const touchingRooms = rooms.filter(r => {
      if (wallIndex === 2) return Math.abs(r.posX + r.width - edgeCoord) < EPSILON;
      return Math.abs(r.posX - edgeCoord) < EPSILON;
    });

    if (touchingRooms.length === 0) {
      gables.push({ side, baseWidth: gableBaseWidth, peakHeight, triangleArea, roomPortions: [] });
      return;
    }

    // Distribute gable area proportionally by room length (Y dimension for walls 2,4)
    const totalTouchingLen = touchingRooms.reduce((s, r) => s + r.length, 0);
    const roomPortions = touchingRooms.map(r => {
      const proportion = r.length / Math.max(totalTouchingLen, 0.01);
      const portionArea = triangleArea * proportion;
      const key = `${r.id}::${wallIndex}`;
      const wt = wallClassification.get(key) || 'interior';
      // Invisible exterior walls (e.g. open porches) should NOT contribute external gable area
      const isExternal = isExteriorType(wt) && !isInvisibleType(wt);

      return {
        roomId: r.id,
        roomName: r.name,
        proportionalArea: portionArea,
        isExternal,
      };
    });

    gables.push({ side, baseWidth: gableBaseWidth, peakHeight, triangleArea, roomPortions });
  });

  return gables;
}

/**
 * For rooms without ceiling (hasCeiling=false), internal walls extend up 
 * into the roof space. Calculate the extra wall area above standard height.
 */
export function calculateInternalGableExtension(
  room: RoomData,
  plan: FloorPlanData,
  wallIndex: number
): number {
  if (plan.roofType === 'plana' || plan.roofSlopePercent === 0) return 0;
  if (room.hasCeiling !== false) return 0; // has ceiling, walls stop at ceiling

  const slope = plan.roofSlopePercent / 100;
  const isHoriz = wallIndex === 1 || wallIndex === 3;
  const wallLen = isHoriz ? room.width : room.length;

  if (plan.roofType === 'dos_aguas') {
    // For perpendicular walls (left/right, wallIndex 2,4): rectangular extension
    // The height above the wall depends on position relative to ridge
    if (!isHoriz) {
      // Wall runs front-to-back under the ridge; average extra height
      // At center the height is max, at edges it's 0
      // For simplicity: extra area = wallLen * (peakHeight / 2) for walls parallel to slope
      // Actually these walls get a trapezoidal extension - simplified as rectangle at average height
      return 0; // These walls don't get gable extension in a simple model
    }

    // For horizontal walls (top/bottom, wallIndex 1,3): triangular cross-section
    // The gable triangle has base=room.width and height depends on room position
    // Simplified: the internal wall gets the same triangular area
    const rooms_bbox_width = plan.width; // approximate
    const halfW = (rooms_bbox_width + 2 * plan.externalWallThickness) / 2;
    const peakH = halfW * slope;
    // The wall triangle: base = wallLen, height = peakH * (wallLen / (2 * halfW))
    // For a wall centered under the ridge:
    const wallTriangleH = peakH; // max height at center
    return (wallLen * wallTriangleH) / 2;
  }

  return 0;
}

export function calculateFloorPlanSummary(plan: FloorPlanData, rooms: RoomData[], floors?: FloorLevel[]): FloorPlanSummary {
  const wallClassification = autoClassifyWalls(rooms, plan);

  // Apply auto-classification to rooms before calculating
  const classifiedRooms = rooms.map(room => ({
    ...room,
    walls: room.walls.map(wall => {
      const key = `${room.id}::${wall.wallIndex}`;
      const autoType = wallClassification.get(key);
      return {
        ...wall,
        wallType: autoType || wall.wallType,
      };
    }),
  }));

  // Use segment-based wall calculation to properly handle partial overlaps
  // and multi-neighbor walls (computeWallSegments handles deduplication correctly)
  const wallSegments = computeWallSegments(rooms);

  const roomCalcs = classifiedRooms.map(r => calculateRoom(r, plan));

  // Override room wall areas using segment-based calculation
  // This fixes double-counting when walls have multiple neighbors
  roomCalcs.forEach((rc, idx) => {
    const room = classifiedRooms[idx];
    let segExtArea = 0;
    let segIntArea = 0;

    rc.walls.forEach(wallCalc => {
      const key = `${room.id}::${wallCalc.wallIndex}`;
      const segments = wallSegments.get(key);
      if (!segments || segments.length === 0) return;

      // Calculate area per segment instead of using whole-wall type
      let wallExtArea = 0;
      let wallIntArea = 0;
      const segCalcs: import('./floor-plan-calculations').WallSegmentCalc[] = [];
      segments.forEach((seg, si) => {
        const segLength = seg.endMeters - seg.startMeters;
        const segGrossArea = segLength * wallCalc.wallHeight;
        // Distribute openings proportionally across segments
        const segFraction = segLength / Math.max(wallCalc.wallLength, 0.001);
        const segOpeningsArea = wallCalc.openingsArea * segFraction;
        const segNetArea = Math.max(0, segGrossArea - segOpeningsArea);

        const neighborRoom = seg.neighborRoomId ? rooms.find(r => r.id === seg.neighborRoomId) : undefined;
        segCalcs.push({
          segmentIndex: si,
          segmentType: seg.segmentType,
          lengthM: segLength,
          grossArea: segGrossArea,
          openingsArea: segOpeningsArea,
          netArea: segNetArea,
          neighborRoomId: seg.neighborRoomId,
          neighborRoomName: neighborRoom?.name,
        });

        if (isInvisibleType(seg.segmentType)) {
          // Don't count invisible segments
        } else if (isExteriorType(seg.segmentType)) {
          wallExtArea += segNetArea;
        } else {
          wallIntArea += segNetArea;
        }
      });

      wallCalc.segments = segCalcs;

      segExtArea += wallExtArea;
      segIntArea += wallIntArea;

      // Update wallCalc.wallType to the dominant visible segment type for display
      const visibleSegs = segments.filter(s => !isInvisibleType(s.segmentType));
      if (visibleSegs.length > 0) {
        wallCalc.wallType = visibleSegs[0].segmentType;
      } else if (segments.length > 0) {
        wallCalc.wallType = segments[0].segmentType;
      }
    });

    rc.totalExternalWallArea = segExtArea;
    rc.totalInternalWallArea = segIntArea;
  });

  const roofM2 = calculateRoof(plan, rooms);
  
  // Calculate gables
  const gables = calculateGables(plan, classifiedRooms, wallClassification);
  let totalGableExternalM2 = 0;
  let totalGableInternalM2 = 0;

  gables.forEach(g => {
    g.roomPortions.forEach(rp => {
      const rc = roomCalcs.find(r => r.roomId === rp.roomId);
      if (rc) {
        if (rp.isExternal) {
          rc.gableExternalArea += rp.proportionalArea;
          totalGableExternalM2 += rp.proportionalArea;
        } else {
          rc.gableInternalArea += rp.proportionalArea;
          totalGableInternalM2 += rp.proportionalArea;
        }
      }
    });
  });

  let totalUsableM2 = 0;
  let totalExternalWallM2 = 0;
  let totalExternalWallGrossM2 = 0;
  let totalExternalWallOpeningsM2 = 0;
  let totalInternalWallM2 = 0;
  let totalInternalWallGrossM2 = 0;
  let totalInternalWallOpeningsM2 = 0;
  let totalFloorM2 = 0;
  let totalCeilingM2 = 0;
  let totalExternalWallBaseM = 0;
  let totalInternalWallBaseM = 0;
  let totalDoors = 0;
  let totalWindows = 0;
  const openingsByType: Record<string, number> = {};

  roomCalcs.forEach((rc, idx) => {
    const room = classifiedRooms[idx];
    // Only count usable area for rooms that have a floor (e.g. Level 2 bajo cubierta has no floor)
    if (rc.hasFloor) totalUsableM2 += rc.floorArea;
    if (rc.hasFloor) totalFloorM2 += rc.floorArea;
    if (rc.hasCeiling) totalCeilingM2 += rc.ceilingArea;
    totalExternalWallM2 += rc.totalExternalWallArea;
    totalInternalWallM2 += rc.totalInternalWallArea;
    
    // Use segments for gross/base calculations too
    rc.walls.forEach(wallCalc => {
      const key = `${room.id}::${wallCalc.wallIndex}`;
      const segments = wallSegments.get(key) || [];

      segments.forEach(seg => {
        if (isInvisibleType(seg.segmentType)) return;
        const segLength = seg.endMeters - seg.startMeters;
        const segGrossArea = segLength * wallCalc.wallHeight;
        const segFraction = segLength / Math.max(wallCalc.wallLength, 0.001);
        const segOpeningsArea = wallCalc.openingsArea * segFraction;

        if (isExteriorType(seg.segmentType)) {
          totalExternalWallGrossM2 += segGrossArea;
          totalExternalWallOpeningsM2 += segOpeningsArea;
          totalExternalWallBaseM += segLength;
        } else {
          totalInternalWallGrossM2 += segGrossArea;
          totalInternalWallOpeningsM2 += segOpeningsArea;
          totalInternalWallBaseM += segLength;
        }
      });

      // Count openings (only for visible walls to avoid double-counting)
      const hasVisibleSegment = segments.some(s => !isInvisibleType(s.segmentType));
      if (hasVisibleSegment) {
        wallCalc.openings.forEach(o => {
          openingsByType[o.type] = (openingsByType[o.type] || 0) + o.count;
          if (o.type === 'puerta' || o.type === 'puerta_externa') {
            totalDoors += o.count;
          } else {
            totalWindows += o.count;
          }
        });
      }
    });
  });

  // NOTE: Gable areas are NOT added to wall totals — they have their own section in the UI.
  // Previously they were added here, causing confusing double-reporting.
  
  const externalWallFootprint = totalExternalWallBaseM * plan.externalWallThickness;
  const internalWallFootprint = totalInternalWallBaseM * plan.internalWallThickness;
  const totalBuiltM2 = totalUsableM2 + externalWallFootprint + internalWallFootprint;

  // Helper: calculate perimeters for a set of rooms on a floor
  const calcFloorPerimeters = (floorRoomData: RoomData[], floorLevel: string) => {
    if (floorRoomData.length === 0) return { externalPerimeterMl: 0, floorPerimeterMl: 0 };
    const EPSILON = 0.05;
    let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity;
    floorRoomData.forEach(r => {
      bbMinX = Math.min(bbMinX, r.posX);
      bbMinY = Math.min(bbMinY, r.posY);
      bbMaxX = Math.max(bbMaxX, r.posX + r.width);
      bbMaxY = Math.max(bbMaxY, r.posY + r.length);
    });
    const bbWidth = bbMaxX - bbMinX;
    const bbLength = bbMaxY - bbMinY;
    const floorPerimeterMl = 2 * (bbWidth + bbLength);

    // For each bounding-box side, sum lengths of rooms with non-invisible exterior walls
    const sides = [
      { wallIndex: 1, edgeCheck: (r: RoomData) => Math.abs(r.posY - bbMinY) < EPSILON, measure: (r: RoomData) => r.width },
      { wallIndex: 2, edgeCheck: (r: RoomData) => Math.abs(r.posX + r.width - bbMaxX) < EPSILON, measure: (r: RoomData) => r.length },
      { wallIndex: 3, edgeCheck: (r: RoomData) => Math.abs(r.posY + r.length - bbMaxY) < EPSILON, measure: (r: RoomData) => r.width },
      { wallIndex: 4, edgeCheck: (r: RoomData) => Math.abs(r.posX - bbMinX) < EPSILON, measure: (r: RoomData) => r.length },
    ];
    let externalPerimeterMl = 0;
    sides.forEach(side => {
      floorRoomData.filter(side.edgeCheck).forEach(r => {
        const key = `${r.id}::${side.wallIndex}`;
        const wt = wallClassification.get(key) || r.walls.find(w => w.wallIndex === side.wallIndex)?.wallType || 'exterior';
        if (isExteriorType(wt) && !isInvisibleType(wt)) {
          externalPerimeterMl += side.measure(r);
        }
      });
    });

    // Roof perimeter for bajo cubierta (bounding box + eave overhang on all sides)
    let roofPerimeterMl: number | undefined;
    if (floorLevel === 'bajo_cubierta' && plan.roofOverhang > 0) {
      roofPerimeterMl = 2 * ((bbWidth + 2 * plan.roofOverhang) + (bbLength + 2 * plan.roofOverhang));
    }
    return { externalPerimeterMl, floorPerimeterMl, roofPerimeterMl };
  };

  // Build per-floor summaries
  const floorSummaries: FloorSummary[] = [];
  if (floors && floors.length > 0) {
    const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);
    sortedFloors.forEach(floor => {
      const floorRooms = roomCalcs.filter(rc => rc.floorId === floor.id);
      const floorRoomData = classifiedRooms.filter(r => r.floorId === floor.id);
      const perimeters = calcFloorPerimeters(floorRoomData, floor.level);
      const fs: FloorSummary = {
        floorId: floor.id,
        floorName: floor.name,
        floorLevel: floor.level,
        totalUsableM2: floorRooms.filter(r => r.hasFloor).reduce((s, r) => s + r.floorArea, 0),
        totalBuiltM2: 0,
        totalExternalWallM2: floorRooms.reduce((s, r) => s + r.totalExternalWallArea + r.gableExternalArea, 0),
        totalInternalWallM2: floorRooms.reduce((s, r) => s + r.totalInternalWallArea + r.gableInternalArea, 0),
        totalFloorM2: floorRooms.filter(r => r.hasFloor).reduce((s, r) => s + r.floorArea, 0),
        totalCeilingM2: floorRooms.filter(r => r.hasCeiling).reduce((s, r) => s + r.ceilingArea, 0),
        totalDoors: floorRooms.reduce((s, r) => s + r.doorCount, 0),
        totalWindows: floorRooms.reduce((s, r) => s + r.windowCount, 0),
        gableExternalM2: floorRooms.reduce((s, r) => s + r.gableExternalArea, 0),
        gableInternalM2: floorRooms.reduce((s, r) => s + r.gableInternalArea, 0),
        externalPerimeterMl: perimeters.externalPerimeterMl,
        floorPerimeterMl: perimeters.floorPerimeterMl,
        roofPerimeterMl: perimeters.roofPerimeterMl,
        rooms: floorRooms,
      };
      fs.totalBuiltM2 = fs.totalUsableM2;
      floorSummaries.push(fs);
    });

    // Add unassigned rooms
    const unassigned = roomCalcs.filter(rc => !rc.floorId || !floors.some(f => f.id === rc.floorId));
    if (unassigned.length > 0) {
      const unassignedRoomData = classifiedRooms.filter(r => !r.floorId || !floors.some(f => f.id === r.floorId));
      const perimeters = calcFloorPerimeters(unassignedRoomData, 'unassigned');
      floorSummaries.push({
        floorId: 'unassigned',
        floorName: 'Sin nivel asignado',
        floorLevel: 'unassigned',
        totalUsableM2: unassigned.filter(r => r.hasFloor).reduce((s, r) => s + r.floorArea, 0),
        totalBuiltM2: unassigned.filter(r => r.hasFloor).reduce((s, r) => s + r.floorArea, 0),
        totalExternalWallM2: unassigned.reduce((s, r) => s + r.totalExternalWallArea + r.gableExternalArea, 0),
        totalInternalWallM2: unassigned.reduce((s, r) => s + r.totalInternalWallArea + r.gableInternalArea, 0),
        totalFloorM2: unassigned.filter(r => r.hasFloor).reduce((s, r) => s + r.floorArea, 0),
        totalCeilingM2: unassigned.filter(r => r.hasCeiling).reduce((s, r) => s + r.ceilingArea, 0),
        totalDoors: unassigned.reduce((s, r) => s + r.doorCount, 0),
        totalWindows: unassigned.reduce((s, r) => s + r.windowCount, 0),
        gableExternalM2: unassigned.reduce((s, r) => s + r.gableExternalArea, 0),
        gableInternalM2: unassigned.reduce((s, r) => s + r.gableInternalArea, 0),
        externalPerimeterMl: perimeters.externalPerimeterMl,
        floorPerimeterMl: perimeters.floorPerimeterMl,
        roofPerimeterMl: perimeters.roofPerimeterMl,
        rooms: unassigned,
      });
    }
  }
  
  return {
    plantaTotalM2: plan.width * plan.length,
    roofM2,
    totalUsableM2,
    totalBuiltM2,
    totalExternalWallM2,
    totalExternalWallGrossM2,
    totalExternalWallOpeningsM2,
    totalInternalWallM2,
    totalInternalWallGrossM2,
    totalInternalWallOpeningsM2,
    totalFloorM2,
    totalCeilingM2,
    totalExternalWallBaseM,
    totalInternalWallBaseM,
    totalDoors,
    totalWindows,
    totalGableExternalM2,
    totalGableInternalM2,
    gables,
    openingsByType,
    floorSummaries,
    rooms: roomCalcs,
  };
}

// Default opening presets with standard dimensions
export const OPENING_PRESETS = {
  ventana_balconera: { width: 1.875, height: 2.25, sillHeight: 0, label: 'Ventana balconera' },
  ventana_grande: { width: 1.875, height: 1.25, sillHeight: 1.0, label: 'Ventana grande' },
  ventana_mediana: { width: 1.25, height: 1.25, sillHeight: 1.0, label: 'Ventana mediana' },
  ventana_pequeña: { width: 0.625, height: 1.25, sillHeight: 1.0, label: 'Ventana pequeña' },
  hueco_paso: { width: 1.875, height: 2.25, sillHeight: 0, label: 'Hueco de paso' },
  puerta_externa: { width: 1.25, height: 2.25, sillHeight: 0, label: 'Puerta exterior' },
  puerta: { width: 0.93, height: 2.06, sillHeight: 0, label: 'Puerta interior' },
} as const;

export const WALL_LABELS: Record<number, string> = {
  1: 'Pared Superior',
  2: 'Pared Derecha',
  3: 'Pared Inferior',
  4: 'Pared Izquierda',
};

// Corner-based wall side naming:
// A=top-left, B=top-right, C=bottom-right, D=bottom-left
// Top wall (1) runs A→B, Right wall (2) runs B→C, Bottom wall (3) runs C→D, Left wall (4) runs D→A
export const WALL_SIDE_LETTERS: Record<number, string> = {
  1: 'A', // top side starts at corner A
  2: 'B', // right side starts at corner B
  3: 'C', // bottom side starts at corner C
  4: 'D', // left side starts at corner D
};

// Next corner clockwise: A→B, B→C, C→D, D→A
export const WALL_SIDE_END_LETTERS: Record<number, string> = {
  1: 'B', // top ends at B
  2: 'C', // right ends at C
  3: 'D', // bottom ends at D
  4: 'A', // left ends at A
};

/**
 * Generate named wall segments for external walls.
 * Convention: single segment on top = "AB", two segments = "A1B", "A2B"
 * The letter is the side letter, the suffix is the next side letter clockwise.
 */
export function generateExternalWallNames(
  rooms: RoomData[],
  wallClassification: Map<string, WallType>
): Map<string, string> {
  const names = new Map<string, string>();
  
  // Group external walls by side (wallIndex)
  const sideWalls: Record<number, Array<{ roomId: string; wallIndex: number; key: string }>> = {
    1: [], 2: [], 3: [], 4: [],
  };
  
  rooms.forEach(room => {
    [1, 2, 3, 4].forEach(wallIdx => {
      const key = `${room.id}::${wallIdx}`;
      if (isExteriorType(wallClassification.get(key) || '')) {
        sideWalls[wallIdx].push({ roomId: room.id, wallIndex: wallIdx, key });
      }
    });
  });
  
  // Sort walls on each side by position
  const sortByPosition = (side: number) => {
    return sideWalls[side].sort((a, b) => {
      const ra = rooms.find(r => r.id === a.roomId)!;
      const rb = rooms.find(r => r.id === b.roomId)!;
      // For top/bottom walls, sort by X position
      if (side === 1 || side === 3) return ra.posX - rb.posX;
      // For right/left walls, sort by Y position
      return ra.posY - rb.posY;
    });
  };
  
  [1, 2, 3, 4].forEach(side => {
    const sorted = sortByPosition(side);
    const letter = WALL_SIDE_LETTERS[side];
    const nextLetter = WALL_SIDE_END_LETTERS[side];
    
    if (sorted.length === 1) {
      names.set(sorted[0].key, `${letter}${nextLetter}`);
    } else {
      sorted.forEach((w, i) => {
        names.set(w.key, `${letter}${i + 1}${nextLetter}`);
      });
    }
  });
  
  return names;
}

export const ROOM_PRESETS = [
  { name: 'Salón', width: 5, length: 4 },
  { name: 'Cocina', width: 4, length: 3.5 },
  { name: 'Habitación principal', width: 4, length: 3.5 },
  { name: 'Habitación', width: 4, length: 3 },
  { name: 'Baño', width: 2.5, length: 2 },
  { name: 'Despensa', width: 2, length: 1.5 },
  { name: 'Pasillo', width: 5, length: 1.2 },
  { name: 'Entrada', width: 2.5, length: 2 },
  { name: 'Patio', width: 4, length: 4 },
];

// Detect shared walls between adjacent rooms
export function detectSharedWalls(rooms: RoomData[]): Map<string, { neighborRoomId: string; neighborWallIndex: number }> {
  const EPSILON = 0.05;
  const shared = new Map<string, { neighborRoomId: string; neighborWallIndex: number }>();

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];

      // A's right edge = B's left edge
      if (Math.abs((a.posX + a.width) - b.posX) < EPSILON) {
        const os = Math.max(a.posY, b.posY);
        const oe = Math.min(a.posY + a.length, b.posY + b.length);
        if (oe - os > EPSILON) {
          shared.set(`${a.id}::2`, { neighborRoomId: b.id, neighborWallIndex: 4 });
          shared.set(`${b.id}::4`, { neighborRoomId: a.id, neighborWallIndex: 2 });
        }
      }

      // A's left edge = B's right edge
      if (Math.abs(a.posX - (b.posX + b.width)) < EPSILON) {
        const os = Math.max(a.posY, b.posY);
        const oe = Math.min(a.posY + a.length, b.posY + b.length);
        if (oe - os > EPSILON) {
          shared.set(`${a.id}::4`, { neighborRoomId: b.id, neighborWallIndex: 2 });
          shared.set(`${b.id}::2`, { neighborRoomId: a.id, neighborWallIndex: 4 });
        }
      }

      // A's bottom edge = B's top edge
      if (Math.abs((a.posY + a.length) - b.posY) < EPSILON) {
        const os = Math.max(a.posX, b.posX);
        const oe = Math.min(a.posX + a.width, b.posX + b.width);
        if (oe - os > EPSILON) {
          shared.set(`${a.id}::3`, { neighborRoomId: b.id, neighborWallIndex: 1 });
          shared.set(`${b.id}::1`, { neighborRoomId: a.id, neighborWallIndex: 3 });
        }
      }

      // A's top edge = B's bottom edge
      if (Math.abs(a.posY - (b.posY + b.length)) < EPSILON) {
        const os = Math.max(a.posX, b.posX);
        const oe = Math.min(a.posX + a.width, b.posX + b.width);
        if (oe - os > EPSILON) {
          shared.set(`${a.id}::1`, { neighborRoomId: b.id, neighborWallIndex: 3 });
          shared.set(`${b.id}::3`, { neighborRoomId: a.id, neighborWallIndex: 1 });
        }
      }
    }
  }

  return shared;
}

/**
 * Compute wall segments for each wall, splitting at intersection points with other rooms.
 * A wall may be partially shared with one room and partially external/internal.
 * Returns a map from wallKey ("roomId::wallIndex") to an array of segments.
 */
export function computeWallSegments(rooms: RoomData[]): Map<string, WallSegment[]> {
  const EPSILON = 0.05;
  const result = new Map<string, WallSegment[]>();

  rooms.forEach(room => {
    [1, 2, 3, 4].forEach(wallIdx => {
      const key = `${room.id}::${wallIdx}`;
      const isHoriz = wallIdx === 1 || wallIdx === 3;
      const wallLen = isHoriz ? room.width : room.length;

      // Wall line in absolute coordinates
      // wallStart/wallEnd = the range along the axis parallel to the wall
      let wallStart: number, wallEnd: number, wallEdge: number;
      if (wallIdx === 1) { // top
        wallStart = room.posX; wallEnd = room.posX + room.width; wallEdge = room.posY;
      } else if (wallIdx === 2) { // right
        wallStart = room.posY; wallEnd = room.posY + room.length; wallEdge = room.posX + room.width;
      } else if (wallIdx === 3) { // bottom
        wallStart = room.posX; wallEnd = room.posX + room.width; wallEdge = room.posY + room.length;
      } else { // left
        wallStart = room.posY; wallEnd = room.posY + room.length; wallEdge = room.posX;
      }

      // Find all neighbor overlaps on this wall edge
      interface Overlap {
        overlapStart: number; // absolute coord
        overlapEnd: number;
        neighborRoomId: string;
        neighborWallIndex: number;
      }
      const overlaps: Overlap[] = [];

      rooms.forEach(other => {
        if (other.id === room.id) return;

        let otherEdge: number, otherStart: number, otherEnd: number, otherWallIdx: number;

        if (wallIdx === 1) { // room top — look for other.bottom
          otherEdge = other.posY + other.length;
          otherStart = other.posX; otherEnd = other.posX + other.width;
          otherWallIdx = 3;
        } else if (wallIdx === 2) { // room right — look for other.left
          otherEdge = other.posX;
          otherStart = other.posY; otherEnd = other.posY + other.length;
          otherWallIdx = 4;
        } else if (wallIdx === 3) { // room bottom — look for other.top
          otherEdge = other.posY;
          otherStart = other.posX; otherEnd = other.posX + other.width;
          otherWallIdx = 1;
        } else { // room left — look for other.right
          otherEdge = other.posX + other.width;
          otherStart = other.posY; otherEnd = other.posY + other.length;
          otherWallIdx = 2;
        }

        if (Math.abs(otherEdge - wallEdge) < EPSILON) {
          const oStart = Math.max(wallStart, otherStart);
          const oEnd = Math.min(wallEnd, otherEnd);
          if (oEnd - oStart > EPSILON) {
            overlaps.push({
              overlapStart: oStart,
              overlapEnd: oEnd,
              neighborRoomId: other.id,
              neighborWallIndex: otherWallIdx,
            });
          }
        }
      });

      // Sort overlaps by start position
      overlaps.sort((a, b) => a.overlapStart - b.overlapStart);

      // Build segments
      const segments: WallSegment[] = [];
      let cursor = wallStart;

      // Check if this wall side has any room on the outer perimeter
      const isOnPerimeter = (absStart: number, absEnd: number): boolean => {
        // Check if any other room is adjacent on the other side of this edge (not sharing, but blocking)
        // For simplicity: if no overlap → check if on bounding box perimeter
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        rooms.forEach(r => {
          minX = Math.min(minX, r.posX);
          minY = Math.min(minY, r.posY);
          maxX = Math.max(maxX, r.posX + r.width);
          maxY = Math.max(maxY, r.posY + r.length);
        });
        if (wallIdx === 1) return Math.abs(wallEdge - minY) < EPSILON;
        if (wallIdx === 3) return Math.abs(wallEdge - maxY) < EPSILON;
        if (wallIdx === 4) return Math.abs(wallEdge - minX) < EPSILON;
        if (wallIdx === 2) return Math.abs(wallEdge - maxX) < EPSILON;
        return false;
      };

      // Check if the DB wall has a manual override
      const wall = room.walls.find(w => w.wallIndex === wallIdx);
      const hasManualType = wall && !wall.id.startsWith('temp-');

      overlaps.forEach(ol => {
        // Gap before this overlap
        if (ol.overlapStart - cursor > EPSILON) {
          const startF = (cursor - wallStart) / wallLen;
          const endF = (ol.overlapStart - wallStart) / wallLen;
          const onPeri = isOnPerimeter(cursor, ol.overlapStart);
          const gapType: WallType = hasManualType
            ? wall!.wallType
            : (onPeri ? 'exterior' : 'interior');
          segments.push({
            startFraction: startF,
            endFraction: endF,
            startMeters: cursor - wallStart,
            endMeters: ol.overlapStart - wallStart,
            segmentType: gapType,
          });
        }

        // The overlap itself — one side is compartida (visible), the other is invisible
        const startF = (Math.max(cursor, ol.overlapStart) - wallStart) / wallLen;
        const endF = (ol.overlapEnd - wallStart) / wallLen;
        const onPeri = isOnPerimeter(Math.max(cursor, ol.overlapStart), ol.overlapEnd);

        // Determine effective ownership: prefer visible walls over invisible ones.
        // If this wall is invisible, it should always stay invisible (non-owner).
        // If neighbor wall is invisible, this side should be the visible owner.
        const neighborRoom = rooms.find(r => r.id === ol.neighborRoomId);
        const neighborWall = neighborRoom?.walls.find(w => w.wallIndex === ol.neighborWallIndex);
        const neighborHasManualType = neighborWall && !neighborWall.id.startsWith('temp-');
        const neighborIsInvisible = neighborHasManualType && isInvisibleType(neighborWall!.wallType);
        const thisIsInvisible = hasManualType && isInvisibleType(wall!.wallType);

        // Check if rooms belong to the same group (same logical room)
        const sameGroup = room.groupId && neighborRoom?.groupId === room.groupId;

        // For INTERIOR walls: if either side has a manually-set _invisible type,
        // it means "no physical wall here" (e.g. open plan). Both sides stay invisible.
        // For EXTERIOR walls: _invisible means "this side doesn't own the wall" (porches),
        // so the visible side should still be the owner.
        const thisIsInteriorInvisible = thisIsInvisible && !isExteriorType(wall!?.wallType || 'interior');
        const neighborIsInteriorInvisible = neighborIsInvisible && !isExteriorType(neighborWall!?.wallType || 'interior');
        const noPhysicalWall = !onPeri && (thisIsInteriorInvisible || neighborIsInteriorInvisible);

        let effectiveOwner: boolean;
        if (sameGroup || noPhysicalWall) {
          // Intra-group walls or explicitly invisible interior walls: no wall exists
          effectiveOwner = false;
        } else if (thisIsInvisible && neighborIsInvisible) {
          // Both sides invisible (exterior): fall back to ID-based so one side still counts
          effectiveOwner = room.id < ol.neighborRoomId;
        } else if (thisIsInvisible) {
          effectiveOwner = false;
        } else if (neighborIsInvisible) {
          effectiveOwner = true;
        } else {
          effectiveOwner = room.id < ol.neighborRoomId;
        }

        let segType: WallType;
        if (sameGroup) {
          segType = onPeri ? 'exterior_invisible' : 'interior_invisible';
        } else if (noPhysicalWall) {
          segType = 'interior_invisible';
        } else if (thisIsInvisible && !effectiveOwner) {
          segType = wall!.wallType; // keep invisible
        } else if (thisIsInvisible && effectiveOwner) {
          // Both-sides-invisible fallback: this side becomes the visible owner
          segType = onPeri ? 'exterior_compartida' : 'interior_compartida';
        } else if (hasManualType && isExteriorType(wall!.wallType)) {
          segType = effectiveOwner ? 'exterior_compartida' : 'exterior_invisible';
        } else if (effectiveOwner) {
          segType = onPeri ? 'exterior_compartida' : 'interior_compartida';
        } else {
          segType = onPeri ? 'exterior_invisible' : 'interior_invisible';
        }
        segments.push({
          startFraction: startF,
          endFraction: endF,
          startMeters: Math.max(cursor, ol.overlapStart) - wallStart,
          endMeters: ol.overlapEnd - wallStart,
          segmentType: segType,
          neighborRoomId: ol.neighborRoomId,
          neighborWallIndex: ol.neighborWallIndex,
        });

        cursor = ol.overlapEnd;
      });

      // Remaining gap after all overlaps
      if (wallEnd - cursor > EPSILON) {
        const startF = (cursor - wallStart) / wallLen;
        const onPeri = isOnPerimeter(cursor, wallEnd);
        const gapType: WallType = hasManualType
          ? wall!.wallType
          : (onPeri ? 'exterior' : 'interior');
        segments.push({
          startFraction: startF,
          endFraction: 1,
          startMeters: cursor - wallStart,
          endMeters: wallLen,
          segmentType: gapType,
        });
      }

      // If no segments created (no overlaps and wall is full length)
      if (segments.length === 0) {
        const onPeri = isOnPerimeter(wallStart, wallEnd);
        const fullType: WallType = hasManualType
          ? wall!.wallType
          : (onPeri ? 'exterior' : 'interior');
        segments.push({
          startFraction: 0,
          endFraction: 1,
          startMeters: 0,
          endMeters: wallLen,
          segmentType: fullType,
        });
      }

      // Apply per-segment type overrides from the wall's stored overrides
      const wall2 = room.walls.find(w => w.wallIndex === wallIdx);
      if (wall2?.segmentTypeOverrides && segments.length > 1) {
        segments.forEach((seg, idx) => {
          const override = wall2.segmentTypeOverrides?.[String(idx)];
          if (override) {
            seg.segmentType = override;
          }
        });
      }

      result.set(key, segments);
    });
  });

  return result;
}

// === Perimeter Wall System for Non-Rectangular Grouped Spaces ===

export interface PerimeterWallCellSegment {
  roomId: string;
  wallIndex: number;
  wallId: string;
  segStart: number;
  segEnd: number;
  startInPerimeter: number;
  endInPerimeter: number;
}

export interface PerimeterWall {
  id: string;
  groupId: string;
  groupName: string;
  direction: 'horizontal' | 'vertical';
  fixedCoord: number;
  start: number;
  end: number;
  length: number;
  wallType: WallType;
  side: 'top' | 'right' | 'bottom' | 'left';
  cellSegments: PerimeterWallCellSegment[];
  openings: Array<OpeningData & { perimeterPositionX: number }>;
}

/**
 * Compute merged perimeter walls for grouped rooms.
 * Groups of 1×1m cells form non-rectangular shapes; this function
 * traces the outer perimeter and merges collinear adjacent cell walls
 * into continuous "perimeter walls" that can span multiple cells.
 */
export function computeGroupPerimeterWalls(rooms: RoomData[]): PerimeterWall[] {
  const EPSILON = 0.05;
  const wallSegmentsMap = computeWallSegments(rooms);
  const result: PerimeterWall[] = [];

  const groups = new Map<string, RoomData[]>();
  rooms.forEach(r => {
    if (r.groupId) {
      if (!groups.has(r.groupId)) groups.set(r.groupId, []);
      groups.get(r.groupId)!.push(r);
    }
  });

  const sideMap: Record<number, 'top' | 'right' | 'bottom' | 'left'> = {
    1: 'top', 2: 'right', 3: 'bottom', 4: 'left',
  };

  groups.forEach((groupRooms, groupId) => {
    const groupRoomIds = new Set(groupRooms.map(r => r.id));
    const groupName = groupRooms[0]?.groupName || groupId;

    interface AbsEdge {
      roomId: string;
      wallIndex: number;
      wallId: string;
      direction: 'horizontal' | 'vertical';
      fixedCoord: number;
      start: number;
      end: number;
      wallType: WallType;
      side: 'top' | 'right' | 'bottom' | 'left';
      openings: OpeningData[];
      cellWallLength: number;
    }

    const edges: AbsEdge[] = [];

    groupRooms.forEach(room => {
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const cellWallLength = isHoriz ? room.width : room.length;

        segments.forEach(seg => {
          if (seg.neighborRoomId && groupRoomIds.has(seg.neighborRoomId)) return;
          if (isInvisibleType(seg.segmentType)) return;

          let fixedCoord: number, start: number, end: number;
          switch (wall.wallIndex) {
            case 1: fixedCoord = room.posY; start = room.posX + seg.startMeters; end = room.posX + seg.endMeters; break;
            case 2: fixedCoord = room.posX + room.width; start = room.posY + seg.startMeters; end = room.posY + seg.endMeters; break;
            case 3: fixedCoord = room.posY + room.length; start = room.posX + seg.startMeters; end = room.posX + seg.endMeters; break;
            default: fixedCoord = room.posX; start = room.posY + seg.startMeters; end = room.posY + seg.endMeters; break;
          }

          const segOpenings = wall.openings.filter(op =>
            op.positionX >= seg.startFraction - 0.01 && op.positionX <= seg.endFraction + 0.01
          );

          edges.push({
            roomId: room.id, wallIndex: wall.wallIndex, wallId: wall.id,
            direction: isHoriz ? 'horizontal' : 'vertical',
            fixedCoord, start, end,
            wallType: seg.segmentType,
            side: sideMap[wall.wallIndex],
            openings: segOpenings,
            cellWallLength,
          });
        });
      });
    });

    const edgeGroups = new Map<string, AbsEdge[]>();
    edges.forEach(e => {
      const gk = `${e.direction}::${Math.round(e.fixedCoord * 1000)}::${e.side}`;
      if (!edgeGroups.has(gk)) edgeGroups.set(gk, []);
      edgeGroups.get(gk)!.push(e);
    });

    edgeGroups.forEach(groupEdges => {
      groupEdges.sort((a, b) => a.start - b.start);

      let mStart = groupEdges[0].start;
      let mEnd = groupEdges[0].end;
      let cells: AbsEdge[] = [groupEdges[0]];

      const emit = () => {
        const totalLen = mEnd - mStart;
        if (totalLen < EPSILON) return;

        const cellSegs: PerimeterWallCellSegment[] = cells.map(c => ({
          roomId: c.roomId, wallIndex: c.wallIndex, wallId: c.wallId,
          segStart: c.start, segEnd: c.end,
          startInPerimeter: (c.start - mStart) / totalLen,
          endInPerimeter: (c.end - mStart) / totalLen,
        }));

        const allOpenings: Array<OpeningData & { perimeterPositionX: number }> = [];
        cells.forEach(c => {
          const room = rooms.find(r => r.id === c.roomId)!;
          c.openings.forEach(op => {
            const isH = c.wallIndex === 1 || c.wallIndex === 3;
            const cellStart = isH ? room.posX : room.posY;
            const absCenter = cellStart + op.positionX * c.cellWallLength;
            allOpenings.push({
              ...op,
              perimeterPositionX: Math.max(0, Math.min(1, (absCenter - mStart) / totalLen)),
            });
          });
        });

        result.push({
          id: `pw-${groupId}-${cells[0].side}-${Math.round(cells[0].fixedCoord * 100)}-${Math.round(mStart * 100)}`,
          groupId, groupName,
          direction: cells[0].direction,
          fixedCoord: cells[0].fixedCoord,
          start: mStart, end: mEnd, length: totalLen,
          wallType: cells[0].wallType,
          side: cells[0].side,
          cellSegments: cellSegs,
          openings: allOpenings,
        });
      };

      for (let i = 1; i < groupEdges.length; i++) {
        const next = groupEdges[i];
        if (Math.abs(next.start - mEnd) < EPSILON) {
          mEnd = next.end;
          cells.push(next);
        } else {
          emit();
          mStart = next.start;
          mEnd = next.end;
          cells = [next];
        }
      }
      emit();
    });
  });

  return result;
}

/**
 * Convert a perimeter wall position (0-1) to the corresponding cell wall and positionX for DB storage.
 */
export function perimeterPositionToCell(
  pw: PerimeterWall,
  perimeterPos: number,
  rooms: RoomData[]
): { wallId: string; positionX: number; roomId: string } | null {
  for (const seg of pw.cellSegments) {
    if (perimeterPos >= seg.startInPerimeter - 0.01 && perimeterPos <= seg.endInPerimeter + 0.01) {
      const room = rooms.find(r => r.id === seg.roomId);
      if (!room) continue;
      const isH = seg.wallIndex === 1 || seg.wallIndex === 3;
      const cellWallLen = isH ? room.width : room.length;
      const cellStart = isH ? room.posX : room.posY;
      const absPos = pw.start + perimeterPos * pw.length;
      const positionX = (absPos - cellStart) / cellWallLen;
      return { wallId: seg.wallId, positionX: Math.max(0, Math.min(1, positionX)), roomId: seg.roomId };
    }
  }
  if (pw.cellSegments.length > 0) {
    return { wallId: pw.cellSegments[0].wallId, positionX: 0.5, roomId: pw.cellSegments[0].roomId };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Building Outline & Composite Walls
// ═══════════════════════════════════════════════════════════════════

export interface OutlineVertex {
  x: number;
  y: number;
  label: string; // A, B, C, D... or B1, B2 for sub-corners
}

export interface CompositeWallSection {
  roomId: string;
  roomName: string;
  wallIndex: number;
  wallId: string;
  length: number;
  height: number;
  wall: WallData;
  openings: OpeningData[];
  startOffset: number; // meters from start of composite wall
  isGable?: boolean; // triangular gable wall (bajo cubierta)
  overlapStart?: number; // absolute start position of this section along the room's wall axis
  fullWallLength?: number; // full length of the room's wall (for opening position calculation)
  gablePeakHeight?: number; // peak height of the full gable for partial rendering
  gableTotalLength?: number; // total length of the full gable span
  gableSectionStart?: number; // where this section starts within the full gable
}

export interface CompositeWall {
  id: string;
  label: string; // "AB", "BC", etc.
  startCorner: OutlineVertex;
  endCorner: OutlineVertex;
  side: 'top' | 'right' | 'bottom' | 'left';
  totalLength: number;
  sections: CompositeWallSection[];
  isExterior: boolean;
  objectSummary: {
    totalBlocks?: { cols: number; rows: number; total: number };
    doors: number;
    windows: number;
    openingDetails: Array<{ type: string; count: number; label: string }>;
  };
}

function round4(n: number): number { return Math.round(n * 10000) / 10000; }

/**
 * Compute the building outline polygon by tracing the boundary of the union of all rooms.
 * Returns clockwise-ordered vertices with labels (A, B, C, D...).
 */
export function computeBuildingOutline(rooms: RoomData[]): OutlineVertex[] {
  if (rooms.length === 0) return [];

  const EPSILON = 0.02;

  // Collect unique x/y coords
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  rooms.forEach(r => {
    xSet.add(round4(r.posX));
    xSet.add(round4(r.posX + r.width));
    ySet.add(round4(r.posY));
    ySet.add(round4(r.posY + r.length));
  });

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2) return [];

  const ncols = xs.length - 1;
  const nrows = ys.length - 1;

  // Build occupancy grid
  const grid: boolean[][] = Array.from({ length: ncols }, () => Array(nrows).fill(false));
  for (let i = 0; i < ncols; i++) {
    for (let j = 0; j < nrows; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      grid[i][j] = rooms.some(r =>
        cx >= r.posX - EPSILON && cx <= r.posX + r.width + EPSILON &&
        cy >= r.posY - EPSILON && cy <= r.posY + r.length + EPSILON
      );
    }
  }

  // Extract clockwise boundary edges (filled cell on right side of direction)
  interface DirEdge { x1: number; y1: number; x2: number; y2: number; dx: number; dy: number; }
  const boundaryEdges: DirEdge[] = [];

  for (let i = 0; i < ncols; i++) {
    for (let j = 0; j < nrows; j++) {
      if (!grid[i][j]) continue;
      if (j === 0 || !grid[i][j - 1])
        boundaryEdges.push({ x1: xs[i], y1: ys[j], x2: xs[i + 1], y2: ys[j], dx: 1, dy: 0 });
      if (i === ncols - 1 || !grid[i + 1][j])
        boundaryEdges.push({ x1: xs[i + 1], y1: ys[j], x2: xs[i + 1], y2: ys[j + 1], dx: 0, dy: 1 });
      if (j === nrows - 1 || !grid[i][j + 1])
        boundaryEdges.push({ x1: xs[i + 1], y1: ys[j + 1], x2: xs[i], y2: ys[j + 1], dx: -1, dy: 0 });
      if (i === 0 || !grid[i - 1][j])
        boundaryEdges.push({ x1: xs[i], y1: ys[j + 1], x2: xs[i], y2: ys[j], dx: 0, dy: -1 });
    }
  }

  if (boundaryEdges.length === 0) return [];

  // Build adjacency map
  const ptKey = (x: number, y: number) => `${round4(x)},${round4(y)}`;
  const startMap = new Map<string, DirEdge[]>();
  boundaryEdges.forEach(e => {
    const k = ptKey(e.x1, e.y1);
    if (!startMap.has(k)) startMap.set(k, []);
    startMap.get(k)!.push(e);
  });

  // Find starting edge: topmost row, then leftmost
  let startEdge = boundaryEdges[0];
  for (const e of boundaryEdges) {
    if (e.y1 < startEdge.y1 - EPSILON ||
        (Math.abs(e.y1 - startEdge.y1) < EPSILON && e.x1 < startEdge.x1 - EPSILON)) {
      startEdge = e;
    }
  }

  // Chain edges into polygon
  const polygon: Array<{ x: number; y: number }> = [];
  const used = new Set<DirEdge>();
  let current = startEdge;

  for (let iter = 0; iter < boundaryEdges.length + 1; iter++) {
    used.add(current);
    polygon.push({ x: current.x1, y: current.y1 });

    const nextKey = ptKey(current.x2, current.y2);
    const candidates = (startMap.get(nextKey) || []).filter(e => !used.has(e));
    if (candidates.length === 0) break;

    if (candidates.length === 1) {
      current = candidates[0];
    } else {
      // Pick rightmost turn (smallest clockwise angle)
      let best = candidates[0];
      let bestAngle = Infinity;
      for (const c of candidates) {
        const cross = current.dx * c.dy - current.dy * c.dx;
        const dot = current.dx * c.dx + current.dy * c.dy;
        let angle = Math.atan2(cross, dot);
        if (angle < bestAngle) { bestAngle = angle; best = c; }
      }
      current = best;
    }
  }

  // Remove collinear vertices
  const simplified: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (Math.abs(cross) > EPSILON * EPSILON) {
      simplified.push(curr);
    }
  }

  if (simplified.length < 3) return [];

  // ── Label corners ──
  // Determine bounding box corners
  const minX = Math.min(...simplified.map(v => v.x));
  const maxX = Math.max(...simplified.map(v => v.x));
  const minY = Math.min(...simplified.map(v => v.y));
  const maxY = Math.max(...simplified.map(v => v.y));

  // Find which simplified vertex is closest to each bbox corner
  const bboxCorners = [
    { x: minX, y: minY, letter: 'A' }, // top-left
    { x: maxX, y: minY, letter: 'B' }, // top-right
    { x: maxX, y: maxY, letter: 'C' }, // bottom-right
    { x: minX, y: maxY, letter: 'D' }, // bottom-left
  ];

  // Assign primary corner indices
  const primaryIndices = new Map<number, string>();
  for (const bc of bboxCorners) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < simplified.length; i++) {
      const d = Math.abs(simplified[i].x - bc.x) + Math.abs(simplified[i].y - bc.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    primaryIndices.set(bestIdx, bc.letter);
  }

  // Build ordered primary corners list sorted by polygon index
  const primaryList = Array.from(primaryIndices.entries()).sort((a, b) => a[0] - b[0]);

  // Assign labels: primary corners get their letter, intermediate corners get sub-labels
  const labels: string[] = new Array(simplified.length).fill('');
  for (const [idx, letter] of primaryList) {
    labels[idx] = letter;
  }

  // For corners between two primary corners, assign sub-labels
  for (let p = 0; p < primaryList.length; p++) {
    const [startIdx, startLetter] = primaryList[p];
    const [endIdx] = primaryList[(p + 1) % primaryList.length];

    // Collect intermediate indices between startIdx and endIdx (wrapping)
    const intermediates: number[] = [];
    let i = (startIdx + 1) % simplified.length;
    while (i !== endIdx) {
      intermediates.push(i);
      i = (i + 1) % simplified.length;
    }

    if (intermediates.length > 0) {
      // This primary corner has sub-corners → rename primary as letter+"1"
      // and intermediates get letter+"2", letter+"3", etc.
      // But the END primary also might need renaming
      const nextLetter = primaryList[(p + 1) % primaryList.length][1];
      labels[startIdx] = startLetter + '1';
      intermediates.forEach((idx, i) => {
        labels[idx] = startLetter + String(i + 2);
      });
      // If the next primary hasn't been relabeled yet, keep it
      // (it will be relabeled when processing its own segment if needed)
    }
  }

  // Ensure primary corners that weren't relabeled keep their letter
  for (const [idx, letter] of primaryList) {
    if (!labels[idx] || labels[idx] === '') labels[idx] = letter;
  }

  return simplified.map((v, i) => ({
    x: v.x,
    y: v.y,
    label: labels[i] || String.fromCharCode(65 + (i % 26)),
  }));
}

/**
 * Compute composite walls from user-defined corners (ABCD + custom corners).
 * Instead of using the auto-outline, this builds composite walls only from
 * the corners the user has explicitly defined, avoiding phantom walls.
 */
export function computeCompositeWallsFromCorners(
  rooms: RoomData[],
  plan: FloorPlanData,
  userCorners: Array<{ label: string; col: number; row: number; side: 'top' | 'right' | 'bottom' | 'left' }>,
  cellSizeM: number = 1,
): CompositeWall[] {
  if (rooms.length === 0) return [];

  const EPSILON = 0.05;

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.posX);
    minY = Math.min(minY, r.posY);
    maxX = Math.max(maxX, r.posX + r.width);
    maxY = Math.max(maxY, r.posY + r.length);
  });

  const ewt = plan.externalWallThickness;

  // Detect bajo cubierta level: all rooms have height 0
  const isBajoCubiertaLevel = rooms.length > 0 && rooms.every(r => r.height === 0);

  // Derive level prefix from user corners (e.g. "1A1" → "1")
  const levelPrefix = (() => {
    for (const uc of userCorners) {
      const m = uc.label.match(/^(\d+)[A-Z]/i);
      if (m) return m[1];
    }
    return '';
  })();

  // Main ABCD corners (interior room boundary coordinates) — with full coordinate ID
  const mainCorners: Array<{ label: string; x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' }> = [
    { label: `${levelPrefix}A`, x: minX, y: minY, side: 'top' },
    { label: `${levelPrefix}B`, x: maxX, y: minY, side: 'right' },
    { label: `${levelPrefix}C`, x: maxX, y: maxY, side: 'bottom' },
    { label: `${levelPrefix}D`, x: minX, y: maxY, side: 'left' },
  ];

  // Compute grid bounding box (exclusive, matching FloorPlanGridView)
  const gridMinCol = Math.min(...rooms.map(r => Math.round(r.posX / cellSizeM) + 1));
  const gridMinRow = Math.min(...rooms.map(r => Math.round(r.posY / cellSizeM) + 1));
  const gridMaxCol = Math.max(...rooms.map(r => Math.round(r.posX / cellSizeM) + 1 + Math.max(1, Math.round(r.width / cellSizeM))));
  const gridMaxRow = Math.max(...rooms.map(r => Math.round(r.posY / cellSizeM) + 1 + Math.max(1, Math.round(r.length / cellSizeM))));

  // Filter out eave markers — they should NOT participate in perimeter or cross-side elevation generation
  const filteredUserCorners = userCorners.filter(c => !(c as any).isEave);

  // Classify custom corners using normalized distance to each edge.
  // This handles markers not exactly on a boundary (e.g. B1 at col=17 but meant for right edge).
  const colSpan = Math.max(1, gridMaxCol - gridMinCol);
  const rowSpan = Math.max(1, gridMaxRow - gridMinRow);
  const classifyEdge = (cc: { col: number; row: number; side: string }): 'top' | 'right' | 'bottom' | 'left' => {
    if (cc.row === gridMinRow) return 'top';
    if (cc.col === gridMinCol && cc.row !== gridMinRow) return 'left';
    const dTop = Math.abs(cc.row - gridMinRow) / rowSpan;
    const dBottom = Math.abs(cc.row - (gridMaxRow - 1)) / rowSpan;
    const dLeft = Math.abs(cc.col - gridMinCol) / colSpan;
    const dRight = Math.abs(cc.col - (gridMaxCol - 1)) / colSpan;
    const mn = Math.min(dTop, dBottom, dLeft, dRight);
    if (mn === dTop) return 'top';
    if (mn === dRight) return 'right';
    if (mn === dBottom) return 'bottom';
    return 'left';
  };

  // Convert user custom corners to absolute coordinates based on their PHYSICAL edge.
  // CRITICAL: Markers with side='right'/'bottom' point to the LAST mm of their cell
  // (col*cellSizeM / row*cellSizeM), while 'top'/'left' point to the FIRST mm
  // ((col-1)*cellSizeM / (row-1)*cellSizeM). Using the original side property ensures
  // measurements match the grid's block-counting precision.
  const customAbsolute = filteredUserCorners.map(cc => {
    const edge = classifyEdge(cc);
    const isLastMm = cc.side === 'right' || cc.side === 'bottom';
    const xFromCol = isLastMm ? cc.col * cellSizeM : (cc.col - 1) * cellSizeM;
    const yFromRow = isLastMm ? cc.row * cellSizeM : (cc.row - 1) * cellSizeM;
    let x: number, y: number;
    switch (edge) {
      case 'top': x = xFromCol; y = minY; break;
      case 'bottom': x = xFromCol; y = maxY; break;
      case 'left': x = minX; y = yFromRow; break;
      case 'right': x = maxX; y = yFromRow; break;
    }
    return { label: cc.label, x, y, side: edge };
  });

  // Group corners by physical edge
  const sideCorners: Record<string, Array<{ label: string; x: number; y: number }>> = {
    top: [], right: [], bottom: [], left: [],
  };

  // Add custom corners to their physical edges
  // Skip corners marked as isMain — they duplicate the hardcoded ABCD corners
  customAbsolute.forEach((cc, idx) => {
    if ((filteredUserCorners[idx] as any).isMain) return;
    sideCorners[cc.side].push(cc);
  });

  // Build ordered corner lists per side (including start/end main corners)
  // Top: A → ... → B (sort by X ascending)
  // Right: B → ... → C (sort by Y ascending)
  // Bottom: C → ... → D (sort by X descending)
  // Left: D → ... → A (sort by Y descending)
  const sides: Array<{
    side: 'top' | 'right' | 'bottom' | 'left';
    wallIndex: number;
    startCorner: { label: string; x: number; y: number };
    endCorner: { label: string; x: number; y: number };
    sortFn: (a: { x: number; y: number }, b: { x: number; y: number }) => number;
  }> = [
    { side: 'top', wallIndex: 1, startCorner: mainCorners[0], endCorner: mainCorners[1], sortFn: (a, b) => a.x - b.x },
    { side: 'right', wallIndex: 2, startCorner: mainCorners[1], endCorner: mainCorners[2], sortFn: (a, b) => a.y - b.y },
    { side: 'bottom', wallIndex: 3, startCorner: mainCorners[2], endCorner: mainCorners[3], sortFn: (a, b) => b.x - a.x },
    { side: 'left', wallIndex: 4, startCorner: mainCorners[3], endCorner: mainCorners[0], sortFn: (a, b) => b.y - a.y },
  ];

  const composites: CompositeWall[] = [];

  sides.forEach(({ side, wallIndex, startCorner, endCorner, sortFn }) => {
    const intermediates = [...sideCorners[side]].sort(sortFn);
    const ordered = [startCorner, ...intermediates, endCorner];

    for (let i = 0; i < ordered.length - 1; i++) {
      const v1 = ordered[i];
      const v2 = ordered[i + 1];
      const isHoriz = side === 'top' || side === 'bottom';
      const interiorLength = isHoriz ? Math.abs(v2.x - v1.x) : Math.abs(v2.y - v1.y);
      if (interiorLength < EPSILON) continue;
      // Exterior edge length: add wall thickness at each end (perpendicular walls)
      // Only add thickness at corners that are main ABCD corners (not custom intermediate ones)
      const isV1Main = /^(\d*)([A-D])$/i.test(v1.label);
      const isV2Main = /^(\d*)([A-D])$/i.test(v2.label);
      let edgeLength = interiorLength + (isV1Main && !isBajoCubiertaLevel ? ewt : 0) + (isV2Main && !isBajoCubiertaLevel ? ewt : 0);
      // In block mode, snap to exact block count so measurements match the grid
      if (plan.scaleMode === 'bloque') {
        const blockW = plan.blockLengthMm / 1000;
        if (blockW > 0) {
          const numBlocks = Math.round(edgeLength / blockW);
          edgeLength = numBlocks * blockW;
        }
      }

      const fixedCoord = isHoriz ? v1.y : v1.x;
      const edgeStart = isHoriz ? Math.min(v1.x, v2.x) : Math.min(v1.y, v2.y);
      const edgeEnd = isHoriz ? Math.max(v1.x, v2.x) : Math.max(v1.y, v2.y);

      // Find rooms on this edge
      const matchingRooms: Array<{
        room: RoomData;
        wall: WallData;
        overlapStart: number;
        overlapEnd: number;
      }> = [];

      rooms.forEach(room => {
        let roomEdge: number, roomStart: number, roomEnd: number;
        switch (wallIndex) {
          case 1: roomEdge = room.posY; roomStart = room.posX; roomEnd = room.posX + room.width; break;
          case 2: roomEdge = room.posX + room.width; roomStart = room.posY; roomEnd = room.posY + room.length; break;
          case 3: roomEdge = room.posY + room.length; roomStart = room.posX; roomEnd = room.posX + room.width; break;
          case 4: roomEdge = room.posX; roomStart = room.posY; roomEnd = room.posY + room.length; break;
          default: return;
        }

        if (Math.abs(roomEdge - fixedCoord) > EPSILON) return;
        const oStart = Math.max(edgeStart, roomStart);
        const oEnd = Math.min(edgeEnd, roomEnd);
        if (oEnd - oStart <= EPSILON) return;

        const wall = room.walls.find(w => w.wallIndex === wallIndex);
        if (!wall) return;
        matchingRooms.push({ room, wall, overlapStart: oStart, overlapEnd: oEnd });
      });

      if (matchingRooms.length === 0) continue;

      // Sort by position along edge
      switch (side) {
        case 'top': matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart); break;
        case 'right': matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart); break;
        case 'bottom': matchingRooms.sort((a, b) => b.overlapStart - a.overlapStart); break;
        case 'left': matchingRooms.sort((a, b) => b.overlapStart - a.overlapStart); break;
      }

      let offset = 0;
      const sections: CompositeWallSection[] = [];
      let totalDoors = 0, totalWindows = 0;
      const openingCounts: Record<string, number> = {};

      // Compute raw section lengths first
      const rawSections: Array<{ room: RoomData; wall: WallData; sectionLen: number; wallH: number; sectionOpenings: OpeningData[]; isGableWall: boolean; overlapStart: number }> = [];

      matchingRooms.forEach(({ room, wall, overlapStart, overlapEnd }) => {
        // Include invisible walls as sections (with zero height visual) to preserve elevation integrity

        const sectionLen = overlapEnd - overlapStart;
        let wallH: number;
        const isBajoCub = room.height === 0 && plan.roofType === 'dos_aguas';
        const isGableWall = isBajoCub && (wallIndex === 2 || wallIndex === 4);
        if (isGableWall) {
          const totalW = (maxX - minX) + 2 * plan.externalWallThickness;
          wallH = (totalW / 2) * (plan.roofSlopePercent / 100);
        } else if (wall.height && wall.height > 0) {
          wallH = wall.height;
        } else if (room.height && room.height > 0) {
          wallH = room.height;
        } else if (room.height === 0) {
          // Bajo cubierta non-gable wall: calculate height from roof slope
          const autoH = calcBajoCubiertaWallHeight(room, wallIndex, plan, rooms);
          wallH = autoH ?? 0;
          // If height is 0 (wall at building edge), still include it for completeness
        } else {
          wallH = plan.defaultHeight;
        }

        const fullWallLen = isHoriz ? room.width : room.length;
        const sectionOpenings = wall.openings.filter(op => {
          const opAbsPos = (isHoriz ? room.posX : room.posY) + op.positionX * fullWallLen;
          return opAbsPos >= overlapStart - EPSILON && opAbsPos <= overlapEnd + EPSILON;
        });

        rawSections.push({ room, wall, sectionLen, wallH, sectionOpenings, isGableWall, overlapStart });
      });

      if (rawSections.length === 0) continue;

      // Merge multiple gable sections into one to avoid rendering multiple independent triangles
      const allGable = rawSections.length > 1 && rawSections.every(s => s.isGableWall);
      const effectiveSections = allGable
        ? [{
            ...rawSections[0],
            sectionLen: rawSections.reduce((sum, s) => sum + s.sectionLen, 0),
            wallH: Math.max(...rawSections.map(s => s.wallH)),
            sectionOpenings: rawSections.flatMap(s => s.sectionOpenings),
          }]
        : rawSections;

      // Distribute edgeLength proportionally across sections so they sum to edgeLength
      const rawTotal = effectiveSections.reduce((sum, s) => sum + s.sectionLen, 0);
      const scale = rawTotal > 0 ? edgeLength / rawTotal : 1;

      effectiveSections.forEach(({ room, wall, sectionLen, wallH, sectionOpenings, isGableWall, overlapStart }) => {
        let adjustedLen = sectionLen * scale;
        // In block mode, snap individual section to whole blocks
        if (plan.scaleMode === 'bloque') {
          const blockW = plan.blockLengthMm / 1000;
          if (blockW > 0) {
            adjustedLen = Math.round(adjustedLen / blockW) * blockW;
          }
        }

        sectionOpenings.forEach(op => {
          const key = op.openingType;
          openingCounts[key] = (openingCounts[key] || 0) + 1;
          if (key === 'puerta' || key === 'puerta_externa' || key === 'hueco_paso') totalDoors++;
          else totalWindows++;
        });

        const isHorizSec = side === 'top' || side === 'bottom';
        const roomWallStart = isHorizSec ? room.posX : room.posY;
        const roomFullWallLen = isHorizSec ? room.width : room.length;

        sections.push({
          roomId: room.id, roomName: room.name, wallIndex,
          wallId: wall.id, length: adjustedLen, height: wallH,
          wall, openings: sectionOpenings, startOffset: offset,
          isGable: isGableWall,
          overlapStart: overlapStart,
          fullWallLength: roomFullWallLen,
        });
        offset += adjustedLen;
      });

      // Skip composite walls where no sections remain (all were bajo cubierta non-gable)
      if (sections.length === 0) continue;

      let totalBlocks: { cols: number; rows: number; total: number } | undefined;
      if (plan.scaleMode === 'bloque') {
        const blockW = plan.blockLengthMm / 1000;
        const blockH = plan.blockHeightMm / 1000;
        if (blockW > 0 && blockH > 0) {
          const maxH = Math.max(...sections.map(s => s.height));
          totalBlocks = { cols: Math.ceil(edgeLength / blockW), rows: Math.ceil(maxH / blockH), total: Math.ceil(edgeLength / blockW) * Math.ceil(maxH / blockH) };
        }
      }

      const openingDetails = Object.entries(openingCounts).map(([type, count]) => ({
        type, count,
        label: OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type,
      }));

      composites.push({
        id: `cw-${v1.label}-${v2.label}`,
        label: `${v1.label}-${v2.label}`,
        startCorner: { x: v1.x, y: v1.y, label: v1.label },
        endCorner: { x: v2.x, y: v2.y, label: v2.label },
        side,
        totalLength: edgeLength,
        sections,
        isExterior: true,
        objectSummary: { totalBlocks, doors: totalDoors, windows: totalWindows, openingDetails },
      });
    }
  });

  // ── Cross-side composite walls: markers sharing the same absolute X or Y ──
  // Compute absolute metric position for each marker:
  //   X: side='right' → col * cellSize (right edge), else (col-1) * cellSize (left edge)
  //   Y: side='bottom' → row * cellSize (bottom edge), else (row-1) * cellSize (top edge)
  const allMarkersAbs: Array<{ label: string; col: number; row: number; side: string; isMain: boolean; absX: number; absY: number }> = [];
  const mainGridPositions: Array<{ label: string; col: number; row: number; side: string }> = [
    { label: mainCorners[0].label, col: gridMinCol, row: gridMinRow, side: 'top' },    // A
    { label: mainCorners[1].label, col: gridMaxCol, row: gridMinRow, side: 'right' },   // B
    { label: mainCorners[2].label, col: gridMaxCol, row: gridMaxRow, side: 'bottom' },  // C
    { label: mainCorners[3].label, col: gridMinCol, row: gridMaxRow, side: 'left' },    // D
  ];
  const markerAbsX = (col: number, side: string) => side === 'right' ? col * cellSizeM : (col - 1) * cellSizeM;
  const markerAbsY = (row: number, side: string) => side === 'bottom' ? row * cellSizeM : (row - 1) * cellSizeM;
  mainGridPositions.forEach(mg => allMarkersAbs.push({ ...mg, isMain: true, absX: markerAbsX(mg.col, mg.side), absY: markerAbsY(mg.row, mg.side) }));
  filteredUserCorners.forEach(c => {
    if ((c as any).isMain) return;
    allMarkersAbs.push({ label: c.label, col: c.col, row: c.row, side: c.side, isMain: false, absX: markerAbsX(c.col, c.side), absY: markerAbsY(c.row, c.side) });
  });

  // Track perimeter edge labels to avoid duplicating them as cross-side
  const perimeterLabels = new Set<string>();
  composites.forEach(cw => perimeterLabels.add(cw.label));

  // Group markers by absolute X position (tolerance = half a block) for vertical pairs
  const CROSS_TOL = cellSizeM * 0.5;
  const verticalPairs: Array<{ top: typeof allMarkersAbs[0]; bottom: typeof allMarkersAbs[0] }> = [];
  for (let i = 0; i < allMarkersAbs.length; i++) {
    for (let j = i + 1; j < allMarkersAbs.length; j++) {
      const a = allMarkersAbs[i], b = allMarkersAbs[j];
      if (Math.abs(a.absX - b.absX) <= CROSS_TOL) {
        if (Math.abs(a.absY - b.absY) < EPSILON) continue; // same point
        // Cross-side pairs: only pair markers where BOTH are non-main (interior markers)
        // Main corners (A, B, C, D) are already connected by perimeter composites
        if (a.isMain || b.isMain) continue;
        const [top, bottom] = a.absY <= b.absY ? [a, b] : [b, a];
        verticalPairs.push({ top, bottom });
      }
    }
  }

  verticalPairs.forEach(({ top: tc, bottom: bc }) => {
    // Enforce top-to-bottom label ordering (top marker first)
    const pairLabel = `${tc.label}-${bc.label}`;
    const pairLabelRev = `${bc.label}-${tc.label}`;
    if (perimeterLabels.has(pairLabel) || perimeterLabels.has(pairLabelRev)) return;
    // Also skip if reverse was already added as cross-side
    const existingLabels = new Set(composites.map(c => c.label));
    if (existingLabels.has(pairLabel) || existingLabels.has(pairLabelRev)) return;

    const wallX = (tc.absX + bc.absX) / 2; // average (they should be nearly identical)
    const edgeStartY = tc.absY;
    const edgeEndY = bc.absY;
    let edgeLength = edgeEndY - edgeStartY;
    if (edgeLength < EPSILON) return;

    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      if (blockW > 0) edgeLength = Math.round(edgeLength / blockW) * blockW;
    }

    // Find rooms whose RIGHT or LEFT edge touches this vertical line
    // Use a generous tolerance for matching room edges to the cut line.
    // Room metric positions may not align exactly with grid-derived marker positions
    // (e.g. Hab. mediana 2 bottom=6.75 vs marker at row 11 = 6.875, diff=0.125m).
    const ROOM_EDGE_TOL = cellSizeM * 0.4;

    const matchRight: Array<{ room: RoomData; wall: WallData; overlapStart: number; overlapEnd: number }> = [];
    const matchLeft: Array<{ room: RoomData; wall: WallData; overlapStart: number; overlapEnd: number }> = [];

    rooms.forEach(room => {
      const rRight = room.posX + room.width;
      const rLeft = room.posX;
      const rStart = room.posY;
      const rEnd = room.posY + room.length;

      if (Math.abs(rRight - wallX) <= ROOM_EDGE_TOL) {
        const oS = Math.max(edgeStartY, rStart);
        const oE = Math.min(edgeEndY, rEnd);
        if (oE - oS > EPSILON) {
          const wall = room.walls.find(w => w.wallIndex === 2);
          if (wall) matchRight.push({ room, wall, overlapStart: oS, overlapEnd: oE });
        }
      }
      if (Math.abs(rLeft - wallX) <= ROOM_EDGE_TOL) {
        const oS = Math.max(edgeStartY, rStart);
        const oE = Math.min(edgeEndY, rEnd);
        if (oE - oS > EPSILON) {
          const wall = room.walls.find(w => w.wallIndex === 4);
          if (wall) matchLeft.push({ room, wall, overlapStart: oS, overlapEnd: oE });
        }
      }
    });

    const matchingRooms = matchRight.length >= matchLeft.length ? matchRight : matchLeft;
    if (matchingRooms.length === 0) return;

    matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart);

    const rawSecs: Array<{ room: RoomData; wall: WallData; sectionLen: number; wallH: number; sectionOpenings: OpeningData[]; isGableWall: boolean; overlapStart: number; fullWallLen: number }> = [];

    // Determine if this vertical cut is on the building perimeter (true gable)
    const perimeterEPSILON = cellSizeM * 0.5;
    const buildingMinX = Math.min(...rooms.map(r => r.posX));
    const buildingMaxX = Math.max(...rooms.map(r => r.posX + r.width));
    const isOnPerimeterGable = Math.abs(wallX - buildingMinX) <= perimeterEPSILON || Math.abs(wallX - buildingMaxX) <= perimeterEPSILON;

    // For interior vertical cuts in bajo cubierta, compute a single uniform height
    // based on the roof slope at this X position (the faldón is continuous)
    const bajoCubiertaCutHeight = (() => {
      const allBajoCub = rooms.length > 0 && rooms.every(r => r.height === 0) && plan.roofType === 'dos_aguas';
      if (!allBajoCub || isOnPerimeterGable) return undefined;
      // Height at wallX under the roof slope
      const halfWidth = (buildingMaxX - buildingMinX) / 2 + plan.externalWallThickness;
      const ridgeX = buildingMinX + (buildingMaxX - buildingMinX) / 2;
      const slopeRatio = plan.roofSlopePercent / 100;
      const riseM = halfWidth * slopeRatio;
      return Math.max(0, riseM - Math.abs(wallX - ridgeX) * slopeRatio);
    })();

    matchingRooms.forEach(({ room, wall, overlapStart, overlapEnd }) => {
      const sectionLen = overlapEnd - overlapStart;
      let wallH: number;
      const isBajoCub = room.height === 0 && plan.roofType === 'dos_aguas';
      // Vertical cross-side: wallIndex comes from matchRight (2) or matchLeft (4)
      const crossWallIndex = matchRight.includes(matchingRooms.find(m => m.room === room && m.wall === wall)!) ? 2 : 4;
      const isGableWall = isBajoCub && isOnPerimeterGable && (crossWallIndex === 2 || crossWallIndex === 4);
      if (bajoCubiertaCutHeight !== undefined) {
        // Interior cut: uniform height from roof slope at this X
        wallH = bajoCubiertaCutHeight;
      } else if (isGableWall) {
        const totalW = (buildingMaxX - buildingMinX) + 2 * plan.externalWallThickness;
        wallH = (totalW / 2) * (plan.roofSlopePercent / 100);
      } else if (wall.height && wall.height > 0) wallH = wall.height;
      else if (room.height && room.height > 0) wallH = room.height;
      else if (room.height === 0) {
        const autoH = calcBajoCubiertaWallHeight(room, crossWallIndex, plan, rooms);
        wallH = autoH ?? 0;
      } else wallH = plan.defaultHeight;

      const fullWallLen = room.length;
      const sectionOpenings = wall.openings.filter(op => {
        const opAbsPos = room.posY + op.positionX * fullWallLen;
        return opAbsPos >= overlapStart - EPSILON && opAbsPos <= overlapEnd + EPSILON;
      });

      rawSecs.push({ room, wall, sectionLen, wallH, sectionOpenings, isGableWall, overlapStart, fullWallLen });
    });

    if (rawSecs.length === 0) return;

    // Merge multiple gable sections into one for cross-side vertical elevations
    const allGableV = rawSecs.length > 1 && rawSecs.every(s => s.isGableWall);
    const effectiveSecsV = allGableV
      ? [{
          ...rawSecs[0],
          sectionLen: rawSecs.reduce((sum, s) => sum + s.sectionLen, 0),
          wallH: Math.max(...rawSecs.map(s => s.wallH)),
          sectionOpenings: rawSecs.flatMap(s => s.sectionOpenings),
          isGableWall: true,
        }]
      : rawSecs;

    const rawTotal = effectiveSecsV.reduce((sum, s) => sum + s.sectionLen, 0);
    const scale = rawTotal > 0 ? edgeLength / rawTotal : 1;

    let offset = 0;
    const sections: CompositeWallSection[] = [];
    let totalDoors = 0, totalWindows = 0;
    const openingCounts: Record<string, number> = {};

    effectiveSecsV.forEach(({ room, wall, sectionLen, wallH, sectionOpenings, isGableWall, overlapStart, fullWallLen }) => {
      let adjustedLen = sectionLen * scale;
      if (plan.scaleMode === 'bloque') {
        const blockW = plan.blockLengthMm / 1000;
        if (blockW > 0) adjustedLen = Math.round(adjustedLen / blockW) * blockW;
      }

      sectionOpenings.forEach(op => {
        const key = op.openingType;
        openingCounts[key] = (openingCounts[key] || 0) + 1;
        if (key === 'puerta' || key === 'puerta_externa' || key === 'hueco_paso') totalDoors++;
        else totalWindows++;
      });

      sections.push({
        roomId: room.id, roomName: room.name, wallIndex: wall.wallIndex,
        wallId: wall.id, length: adjustedLen, height: wallH,
        wall, openings: sectionOpenings, startOffset: offset,
        isGable: isGableWall,
        overlapStart: overlapStart,
        fullWallLength: fullWallLen,
      });
      offset += adjustedLen;
    });

    if (sections.length === 0) return;

    let totalBlocks: { cols: number; rows: number; total: number } | undefined;
    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      const blockH = plan.blockHeightMm / 1000;
      if (blockW > 0 && blockH > 0) {
        const maxH = Math.max(...sections.map(s => s.height));
        totalBlocks = { cols: Math.ceil(edgeLength / blockW), rows: Math.ceil(maxH / blockH), total: Math.ceil(edgeLength / blockW) * Math.ceil(maxH / blockH) };
      }
    }

    const openingDetails = Object.entries(openingCounts).map(([type, count]) => ({
      type, count,
      label: OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type,
    }));

    // Determine correct side: left or right based on position relative to building center
    const buildingMidX = (buildingMinX + buildingMaxX) / 2;
    const detectedVerticalSide: 'left' | 'right' = wallX <= buildingMidX ? 'left' : 'right';

    composites.push({
      id: `cw-${tc.label}-${bc.label}`,
      label: `${tc.label}-${bc.label}`,
      startCorner: { x: wallX, y: edgeStartY, label: tc.label },
      endCorner: { x: wallX, y: edgeEndY, label: bc.label },
      side: detectedVerticalSide,
      totalLength: edgeLength,
      sections,
      isExterior: false,
      objectSummary: { totalBlocks, doors: totalDoors, windows: totalWindows, openingDetails },
    });
  });

  // Horizontal interior walls: pairs of markers sharing the same absolute Y
  const horizontalPairs: Array<{ left: typeof allMarkersAbs[0]; right: typeof allMarkersAbs[0] }> = [];
  for (let i = 0; i < allMarkersAbs.length; i++) {
    for (let j = i + 1; j < allMarkersAbs.length; j++) {
      const a = allMarkersAbs[i], b = allMarkersAbs[j];
      if (Math.abs(a.absY - b.absY) <= CROSS_TOL) {
        if (Math.abs(a.absX - b.absX) < EPSILON) continue; // same point
        // Cross-side pairs: only pair markers where BOTH are non-main (interior markers)
        if (a.isMain || b.isMain) continue;
        const [left, right] = a.absX <= b.absX ? [a, b] : [b, a];
        horizontalPairs.push({ left, right });
      }
    }
  }

  horizontalPairs.forEach(({ left: lc, right: rc }) => {
    // Enforce left-to-right label ordering
    const pairLabel = `${lc.label}-${rc.label}`;
    const pairLabelRev = `${rc.label}-${lc.label}`;
    if (perimeterLabels.has(pairLabel) || perimeterLabels.has(pairLabelRev)) return;
    const existingLabels = new Set(composites.map(c => c.label));
    if (existingLabels.has(pairLabel) || existingLabels.has(pairLabelRev)) return;

    const wallY = (lc.absY + rc.absY) / 2;
    const edgeStartX = lc.absX;
    const edgeEndX = rc.absX;
    let edgeLength = edgeEndX - edgeStartX;
    if (edgeLength < EPSILON) return;

    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      if (blockW > 0) edgeLength = Math.round(edgeLength / blockW) * blockW;
    }

    const matchBottom: Array<{ room: RoomData; wall: WallData; overlapStart: number; overlapEnd: number }> = [];
    const matchTop: Array<{ room: RoomData; wall: WallData; overlapStart: number; overlapEnd: number }> = [];

    const ROOM_EDGE_TOL_H = cellSizeM * 0.4;

    rooms.forEach(room => {
      const rBottom = room.posY + room.length;
      const rTop = room.posY;
      const rStart = room.posX;
      const rEnd = room.posX + room.width;

      if (Math.abs(rBottom - wallY) <= ROOM_EDGE_TOL_H) {
        const oS = Math.max(edgeStartX, rStart);
        const oE = Math.min(edgeEndX, rEnd);
        if (oE - oS > EPSILON) {
          const wall = room.walls.find(w => w.wallIndex === 3);
          if (wall) matchBottom.push({ room, wall, overlapStart: oS, overlapEnd: oE });
        }
      }
      if (Math.abs(rTop - wallY) <= ROOM_EDGE_TOL_H) {
        const oS = Math.max(edgeStartX, rStart);
        const oE = Math.min(edgeEndX, rEnd);
        if (oE - oS > EPSILON) {
          const wall = room.walls.find(w => w.wallIndex === 1);
          if (wall) matchTop.push({ room, wall, overlapStart: oS, overlapEnd: oE });
        }
      }
    });

    const matchingRooms = matchBottom.length >= matchTop.length ? matchBottom : matchTop;
    if (matchingRooms.length === 0) return;

    matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart);

    const rawSecs2: Array<{ room: RoomData; wall: WallData; sectionLen: number; wallH: number; sectionOpenings: OpeningData[]; isGableWall: boolean; overlapStart: number; fullWallLen: number }> = [];

    matchingRooms.forEach(({ room, wall, overlapStart, overlapEnd }) => {
      const sectionLen = overlapEnd - overlapStart;
      let wallH: number;
      const isBajoCub = room.height === 0 && plan.roofType === 'dos_aguas';
      // Horizontal cross-side: wallIndex comes from matchBottom (3) or matchTop (1)
      const crossWallIndex = matchBottom.includes(matchingRooms.find(m => m.room === room && m.wall === wall)!) ? 3 : 1;
      if (wall.height && wall.height > 0) wallH = wall.height;
      else if (room.height && room.height > 0) wallH = room.height;
      else if (room.height === 0) {
        const autoH = calcBajoCubiertaWallHeight(room, crossWallIndex, plan, rooms);
        wallH = autoH ?? 0;
      } else wallH = plan.defaultHeight;

      const fullWallLen = room.width;
      const sectionOpenings = wall.openings.filter(op => {
        const opAbsPos = room.posX + op.positionX * fullWallLen;
        return opAbsPos >= overlapStart - EPSILON && opAbsPos <= overlapEnd + EPSILON;
      });

      rawSecs2.push({ room, wall, sectionLen, wallH, sectionOpenings, isGableWall: false, overlapStart, fullWallLen });
    });

    if (rawSecs2.length === 0) return;

    const rawTotal = rawSecs2.reduce((sum, s) => sum + s.sectionLen, 0);
    const scale = rawTotal > 0 ? edgeLength / rawTotal : 1;

    let offset = 0;
    const sections: CompositeWallSection[] = [];
    let totalDoors = 0, totalWindows = 0;
    const openingCounts: Record<string, number> = {};

    rawSecs2.forEach(({ room, wall, sectionLen, wallH, sectionOpenings, overlapStart, fullWallLen }) => {
      let adjustedLen = sectionLen * scale;
      if (plan.scaleMode === 'bloque') {
        const blockW = plan.blockLengthMm / 1000;
        if (blockW > 0) adjustedLen = Math.round(adjustedLen / blockW) * blockW;
      }

      sectionOpenings.forEach(op => {
        const key = op.openingType;
        openingCounts[key] = (openingCounts[key] || 0) + 1;
        if (key === 'puerta' || key === 'puerta_externa' || key === 'hueco_paso') totalDoors++;
        else totalWindows++;
      });

      sections.push({
        roomId: room.id, roomName: room.name, wallIndex: wall.wallIndex,
        wallId: wall.id, length: adjustedLen, height: wallH,
        wall, openings: sectionOpenings, startOffset: offset,
        isGable: false,
        overlapStart: overlapStart,
        fullWallLength: fullWallLen,
      });
      offset += adjustedLen;
    });

    if (sections.length === 0) return;

    let totalBlocks: { cols: number; rows: number; total: number } | undefined;
    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      const blockH = plan.blockHeightMm / 1000;
      if (blockW > 0 && blockH > 0) {
        const maxH = Math.max(...sections.map(s => s.height));
        totalBlocks = { cols: Math.ceil(edgeLength / blockW), rows: Math.ceil(maxH / blockH), total: Math.ceil(edgeLength / blockW) * Math.ceil(maxH / blockH) };
      }
    }

    const openingDetails = Object.entries(openingCounts).map(([type, count]) => ({
      type, count,
      label: OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type,
    }));

    // Determine correct side: top or bottom based on position relative to building center
    const buildingMinY2 = Math.min(...rooms.map(r => r.posY));
    const buildingMaxY2 = Math.max(...rooms.map(r => r.posY + r.length));
    const buildingMidY2 = (buildingMinY2 + buildingMaxY2) / 2;
    const detectedHorizSide: 'top' | 'bottom' = wallY <= buildingMidY2 ? 'top' : 'bottom';

    composites.push({
      id: `cw-${lc.label}-${rc.label}`,
      label: `${lc.label}-${rc.label}`,
      startCorner: { x: edgeStartX, y: wallY, label: lc.label },
      endCorner: { x: edgeEndX, y: wallY, label: rc.label },
      side: detectedHorizSide,
      totalLength: edgeLength,
      sections,
      isExterior: false,
      objectSummary: { totalBlocks, doors: totalDoors, windows: totalWindows, openingDetails },
    });
  });

  return composites;
}

/**
 * Compute composite walls from the building outline.
 * Each outline edge becomes a composite wall containing the room wall sections that form it.
 * All walls are viewed from the INTERIOR perspective.
 */
export function computeCompositeWalls(
  rooms: RoomData[],
  outline: OutlineVertex[],
  plan: FloorPlanData,
): CompositeWall[] {
  if (outline.length < 3 || rooms.length === 0) return [];

  const EPSILON = 0.05;
  const ewt = plan.externalWallThickness;
  const composites: CompositeWall[] = [];

  for (let i = 0; i < outline.length; i++) {
    const v1 = outline[i];
    const v2 = outline[(i + 1) % outline.length];
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const interiorLength = Math.sqrt(dx * dx + dy * dy);
    if (interiorLength < EPSILON) continue;
    // Add wall thickness at convex (exterior) corners
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const next = outline[(i + 2) % outline.length];
    // Cross product to detect convexity (clockwise outline: cross < 0 = convex)
    const cross1 = (v1.x - prev.x) * (v2.y - v1.y) - (v1.y - prev.y) * (v2.x - v1.x);
    const cross2 = (v2.x - v1.x) * (next.y - v2.y) - (v2.y - v1.y) * (next.x - v2.x);
    const v1Convex = cross1 <= 0;
    const v2Convex = cross2 <= 0;
    let edgeLength = interiorLength + (v1Convex ? ewt : 0) + (v2Convex ? ewt : 0);
    // In block mode, snap to exact block count so measurements match the grid
    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      if (blockW > 0) {
        const numBlocks = Math.round(edgeLength / blockW);
        edgeLength = numBlocks * blockW;
      }
    }

    // Determine side
    let side: 'top' | 'right' | 'bottom' | 'left';
    let wallIndex: number;
    let fixedCoord: number;
    let edgeStart: number;
    let edgeEnd: number;

    if (Math.abs(dy) < EPSILON && dx > 0) {
      side = 'top'; wallIndex = 1; fixedCoord = v1.y;
      edgeStart = v1.x; edgeEnd = v2.x;
    } else if (Math.abs(dx) < EPSILON && dy > 0) {
      side = 'right'; wallIndex = 2; fixedCoord = v1.x;
      edgeStart = v1.y; edgeEnd = v2.y;
    } else if (Math.abs(dy) < EPSILON && dx < 0) {
      side = 'bottom'; wallIndex = 3; fixedCoord = v1.y;
      edgeStart = v2.x; edgeEnd = v1.x;
    } else if (Math.abs(dx) < EPSILON && dy < 0) {
      side = 'left'; wallIndex = 4; fixedCoord = v1.x;
      edgeStart = v2.y; edgeEnd = v1.y;
    } else continue; // diagonal edge, skip

    // Find rooms that have a wall on this edge
    const matchingRooms: Array<{
      room: RoomData;
      wall: WallData;
      overlapStart: number;
      overlapEnd: number;
    }> = [];

    rooms.forEach(room => {
      let roomEdge: number;
      let roomStart: number;
      let roomEnd: number;

      switch (wallIndex) {
        case 1: roomEdge = room.posY; roomStart = room.posX; roomEnd = room.posX + room.width; break;
        case 2: roomEdge = room.posX + room.width; roomStart = room.posY; roomEnd = room.posY + room.length; break;
        case 3: roomEdge = room.posY + room.length; roomStart = room.posX; roomEnd = room.posX + room.width; break;
        case 4: roomEdge = room.posX; roomStart = room.posY; roomEnd = room.posY + room.length; break;
        default: return;
      }

      if (Math.abs(roomEdge - fixedCoord) > EPSILON) return;

      const oStart = Math.max(edgeStart, roomStart);
      const oEnd = Math.min(edgeEnd, roomEnd);
      if (oEnd - oStart <= EPSILON) return;

      const wall = room.walls.find(w => w.wallIndex === wallIndex);
      if (!wall) return;

      matchingRooms.push({ room, wall, overlapStart: oStart, overlapEnd: oEnd });
    });

    if (matchingRooms.length === 0) continue;

    // Sort by position along the edge
    // For INTERIOR view: sort depends on side (viewed from inside)
    // Top: standing inside looking north → left=A(minX), right=B(maxX) → ascending X
    // Right: standing inside looking east → left=B(minY), right=C(maxY) → ascending Y
    // Bottom: standing inside looking south → left=C(maxX), right=D(minX) → descending X
    // Left: standing inside looking west → left=D(maxY), right=A(minY) → descending Y
    switch (side) {
      case 'top': matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart); break; // ascending X
      case 'right': matchingRooms.sort((a, b) => a.overlapStart - b.overlapStart); break; // ascending Y
      case 'bottom': matchingRooms.sort((a, b) => b.overlapStart - a.overlapStart); break; // descending X
      case 'left': matchingRooms.sort((a, b) => b.overlapStart - a.overlapStart); break; // descending Y
    }

    // Build sections
    let offset = 0;
    const sections: CompositeWallSection[] = [];
    let totalDoors = 0;
    let totalWindows = 0;
    const openingCounts: Record<string, number> = {};

    matchingRooms.forEach(({ room, wall, overlapStart, overlapEnd }) => {
      const sectionLen = overlapEnd - overlapStart;
      // For bajo cubierta gable walls (height=0, wallIndex 2 or 4): use gable peak height
      let wallH: number;
      const isBajoCub = room.height === 0 && plan.roofType === 'dos_aguas';
      const isGableWall = isBajoCub && (wallIndex === 2 || wallIndex === 4);
      if (isGableWall) {
        const totalW = (rooms.reduce((mx, r) => Math.max(mx, r.posX + r.width), -Infinity) - rooms.reduce((mn, r) => Math.min(mn, r.posX), Infinity)) + 2 * plan.externalWallThickness;
        wallH = (totalW / 2) * (plan.roofSlopePercent / 100);
      } else if (wall.height && wall.height > 0) {
        wallH = wall.height;
      } else if (room.height && room.height > 0) {
        wallH = room.height;
      } else if (room.height === 0) {
        // Bajo cubierta non-gable wall: calculate height from roof slope
        const autoH = calcBajoCubiertaWallHeight(room, wallIndex, plan, rooms);
        wallH = autoH ?? 0;
      } else {
        wallH = plan.defaultHeight;
      }

      // Filter openings to this section
      const isHoriz = wallIndex === 1 || wallIndex === 3;
      const fullWallLen = isHoriz ? room.width : room.length;
      const sectionOpenings = wall.openings.filter(op => {
        const opAbsPos = (isHoriz ? room.posX : room.posY) + op.positionX * fullWallLen;
        return opAbsPos >= overlapStart - EPSILON && opAbsPos <= overlapEnd + EPSILON;
      });

      sectionOpenings.forEach(op => {
        const key = op.openingType;
        openingCounts[key] = (openingCounts[key] || 0) + 1;
        if (key === 'puerta' || key === 'puerta_externa' || key === 'hueco_paso') {
          totalDoors++;
        } else {
          totalWindows++;
        }
      });

      sections.push({
        roomId: room.id,
        roomName: room.name,
        wallIndex,
        wallId: wall.id,
        length: sectionLen,
        height: wallH,
        wall,
        openings: sectionOpenings,
        startOffset: offset,
        isGable: isGableWall,
      });
      offset += sectionLen;
    });

    // Skip composite walls where no sections remain
    if (sections.length === 0) continue;

    // Block count
    let totalBlocks: { cols: number; rows: number; total: number } | undefined;
    if (plan.scaleMode === 'bloque') {
      const blockW = plan.blockLengthMm / 1000;
      const blockH = plan.blockHeightMm / 1000;
      if (blockW > 0 && blockH > 0) {
        const maxH = Math.max(...sections.map(s => s.height));
        const cols = Math.ceil(edgeLength / blockW);
        const rows = Math.ceil(maxH / blockH);
        totalBlocks = { cols, rows, total: cols * rows };
      }
    }

    const openingDetails = Object.entries(openingCounts).map(([type, count]) => ({
      type,
      count,
      label: OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type,
    }));

    composites.push({
      id: `cw-${v1.label}-${v2.label}`,
      label: `Pared ${v1.label}${v2.label}`,
      startCorner: v1,
      endCorner: v2,
      side,
      totalLength: edgeLength,
      sections,
      isExterior: true,
      objectSummary: {
        totalBlocks,
        doors: totalDoors,
        windows: totalWindows,
        openingDetails,
      },
    });
  }

  return composites;
}
