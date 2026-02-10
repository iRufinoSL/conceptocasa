// Floor plan calculation engine

export interface FloorPlanData {
  width: number;
  length: number;
  defaultHeight: number;
  externalWallThickness: number;
  internalWallThickness: number;
  roofOverhang: number;
  roofSlopePercent: number;
  roofType: 'dos_aguas' | 'cuatro_aguas' | 'plana';
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
  walls: WallData[];
}

export interface WallData {
  id: string;
  wallIndex: number; // 1=top, 2=right, 3=bottom, 4=left
  wallType: 'externa' | 'interna' | 'invisible';
  thickness?: number;
  height?: number;
  openings: OpeningData[];
}

export interface OpeningData {
  id: string;
  openingType: 'puerta' | 'puerta_externa' | 'ventana_grande' | 'ventana_mediana' | 'ventana_pequeña' | 'ventana_balconera';
  name?: string;
  width: number;
  height: number;
  positionX: number; // 0-1 fraction along the wall
}

export interface WallSegment {
  startFraction: number; // 0-1 along the wall
  endFraction: number;   // 0-1 along the wall
  startMeters: number;
  endMeters: number;
  segmentType: 'externa' | 'interna' | 'invisible';
  neighborRoomId?: string;
  neighborWallIndex?: number;
}

export interface WallCalculation {
  wallIndex: number;
  wallType: 'externa' | 'interna' | 'invisible';
  wallLength: number;
  wallHeight: number;
  thickness: number;
  grossArea: number;
  openingsArea: number;
  netArea: number;
  baseLength: number; // length of wall base (for linear meters)
  openings: { type: string; area: number; count: number }[];
}

export interface RoomCalculation {
  roomId: string;
  roomName: string;
  floorArea: number; // m2 de suelo útil
  ceilingArea: number; // m2 de techo
  roomHeight: number; // altura de la estancia
  hasFloor: boolean;
  hasCeiling: boolean;
  hasRoof: boolean;
  walls: WallCalculation[];
  totalExternalWallArea: number;
  totalInternalWallArea: number;
  totalOpeningsArea: number;
  doorCount: number;
  windowCount: number;
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
  
  // Detailed opening counts by type
  openingsByType: Record<string, number>;
  
  rooms: RoomCalculation[];
}

// Get wall length based on room dimensions and wall index
function getWallLength(room: RoomData, wallIndex: number): number {
  // 1=top (width), 2=right (length), 3=bottom (width), 4=left (length)
  return (wallIndex === 1 || wallIndex === 3) ? room.width : room.length;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

function getWallThickness(wall: WallData, plan: FloorPlanData): number {
  if (wall.thickness) return wall.thickness;
  return wall.wallType === 'externa' ? plan.externalWallThickness : plan.internalWallThickness;
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
      
      if (op.openingType === 'puerta' || op.openingType === 'puerta_externa') {
        doorCount++;
      } else {
        // ventana_grande, ventana_mediana, ventana_pequeña, ventana_balconera
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
    
    if (wall.wallType === 'invisible') {
      // Invisible walls don't count as wall area
    } else if (wall.wallType === 'externa') {
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
    floorArea,
    ceilingArea,
    roomHeight: room.height || plan.defaultHeight,
    hasFloor: room.hasFloor !== false,
    hasCeiling: room.hasCeiling !== false,
    hasRoof: room.hasRoof !== false,
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
export function autoClassifyWalls(rooms: RoomData[]): Map<string, 'externa' | 'interna' | 'invisible'> {
  const EPSILON = 0.05;
  const classification = new Map<string, 'externa' | 'interna' | 'invisible'>();
  const sharedWalls = detectSharedWalls(rooms);

  if (rooms.length === 0) return classification;

  rooms.forEach(room => {
    [1, 2, 3, 4].forEach(wallIdx => {
      const key = `${room.id}::${wallIdx}`;
      const wall = room.walls.find(w => w.wallIndex === wallIdx);

      // If the user has manually set the wall type (stored in DB), always respect it
      if (wall && !wall.id.startsWith('temp-') && wall.wallType) {
        const type = (wall.wallType as string) === 'compartida' ? 'invisible' : wall.wallType;
        classification.set(key, type as 'externa' | 'interna' | 'invisible');
        return;
      }
      
      // Check if shared (auto-classify as invisible)
      if (sharedWalls.has(key)) {
        classification.set(key, 'invisible');
        return;
      }

      // Check if any room is adjacent on that side (not shared but touching)
      const hasNeighbor = rooms.some(other => {
        if (other.id === room.id) return false;
        switch (wallIdx) {
          case 1: // top
            return Math.abs(other.posY + other.length - room.posY) < EPSILON &&
              Math.max(other.posX, room.posX) < Math.min(other.posX + other.width, room.posX + room.width) - EPSILON;
          case 2: // right
            return Math.abs(other.posX - (room.posX + room.width)) < EPSILON &&
              Math.max(other.posY, room.posY) < Math.min(other.posY + other.length, room.posY + room.length) - EPSILON;
          case 3: // bottom
            return Math.abs(other.posY - (room.posY + room.length)) < EPSILON &&
              Math.max(other.posX, room.posX) < Math.min(other.posX + other.width, room.posX + room.width) - EPSILON;
          case 4: // left
            return Math.abs(other.posX + other.width - room.posX) < EPSILON &&
              Math.max(other.posY, room.posY) < Math.min(other.posY + other.length, room.posY + room.length) - EPSILON;
          default: return false;
        }
      });

      // If no neighbor, it's an external wall
      classification.set(key, hasNeighbor ? 'interna' : 'externa');
    });
  });

  return classification;
}

export function calculateFloorPlanSummary(plan: FloorPlanData, rooms: RoomData[]): FloorPlanSummary {
  const sharedWalls = detectSharedWalls(rooms);
  const wallClassification = autoClassifyWalls(rooms);

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

  const roomCalcs = classifiedRooms.map(r => calculateRoom(r, plan));
  const roofM2 = calculateRoof(plan, rooms);
  
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
    totalUsableM2 += rc.floorArea;
    if (rc.hasFloor) totalFloorM2 += rc.floorArea;
    if (rc.hasCeiling) totalCeilingM2 += rc.ceilingArea;
    totalExternalWallM2 += rc.totalExternalWallArea;
    totalInternalWallM2 += rc.totalInternalWallArea;
    
    rc.walls.forEach(w => {
      // Invisible walls: no wall area, no openings counted
      if (w.wallType === 'invisible') return;

      const countOpenings = () => {
        w.openings.forEach(o => {
          openingsByType[o.type] = (openingsByType[o.type] || 0) + o.count;
          if (o.type === 'puerta' || o.type === 'puerta_externa') {
            totalDoors += o.count;
          } else {
            totalWindows += o.count;
          }
        });
      };

      if (w.wallType === 'externa') {
        totalExternalWallGrossM2 += w.grossArea;
        totalExternalWallOpeningsM2 += w.openingsArea;
        totalExternalWallBaseM += w.baseLength;
        countOpenings();
      } else {
        totalInternalWallGrossM2 += w.grossArea;
        totalInternalWallOpeningsM2 += w.openingsArea;
        totalInternalWallBaseM += w.baseLength;
        countOpenings();
      }
    });
  });
  
  const externalWallFootprint = totalExternalWallBaseM * plan.externalWallThickness;
  const internalWallFootprint = totalInternalWallBaseM * plan.internalWallThickness;
  const totalBuiltM2 = totalUsableM2 + externalWallFootprint + internalWallFootprint;
  
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
    openingsByType,
    rooms: roomCalcs,
  };
}

// Default opening presets
export const OPENING_PRESETS = {
  puerta: { width: 0.925, height: 2.15, label: 'Puerta interior' },
  puerta_externa: { width: 1.0, height: 2.20, label: 'Puerta externa' },
  ventana_grande: { width: 1.5, height: 1.2, label: 'Ventana grande' },
  ventana_mediana: { width: 1.2, height: 1.0, label: 'Ventana mediana' },
  ventana_pequeña: { width: 0.6, height: 0.6, label: 'Ventana pequeña' },
  ventana_balconera: { width: 1.5, height: 2.10, label: 'Ventana balconera' },
} as const;

export const WALL_LABELS: Record<number, string> = {
  1: 'Pared Superior',
  2: 'Pared Derecha',
  3: 'Pared Inferior',
  4: 'Pared Izquierda',
};

// Side letters for external wall naming: A=top, B=right, C=bottom, D=left
export const WALL_SIDE_LETTERS: Record<number, string> = {
  1: 'A', // top
  2: 'B', // right
  3: 'C', // bottom
  4: 'D', // left
};

/**
 * Generate named wall segments for external walls.
 * Convention: single segment on top = "AB", two segments = "A1B", "A2B"
 * The letter is the side letter, the suffix is the next side letter clockwise.
 */
export function generateExternalWallNames(
  rooms: RoomData[],
  wallClassification: Map<string, 'externa' | 'interna' | 'invisible'>
): Map<string, string> {
  const names = new Map<string, string>();
  
  // Group external walls by side (wallIndex)
  const sideWalls: Record<number, Array<{ roomId: string; wallIndex: number; key: string }>> = {
    1: [], 2: [], 3: [], 4: [],
  };
  
  rooms.forEach(room => {
    [1, 2, 3, 4].forEach(wallIdx => {
      const key = `${room.id}::${wallIdx}`;
      if (wallClassification.get(key) === 'externa') {
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
    const nextLetter = WALL_SIDE_LETTERS[side === 4 ? 1 : side + 1];
    
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
          const gapType = hasManualType && wall!.wallType !== 'invisible'
            ? wall!.wallType
            : (isOnPerimeter(cursor, ol.overlapStart) ? 'externa' : 'interna');
          segments.push({
            startFraction: startF,
            endFraction: endF,
            startMeters: cursor - wallStart,
            endMeters: ol.overlapStart - wallStart,
            segmentType: gapType as 'externa' | 'interna',
          });
        }

        // The overlap itself — show as 'interna' on one side (lower room id wins), 'invisible' on the other
        const startF = (Math.max(cursor, ol.overlapStart) - wallStart) / wallLen;
        const endF = (ol.overlapEnd - wallStart) / wallLen;
        const isOwner = room.id < ol.neighborRoomId;
        segments.push({
          startFraction: startF,
          endFraction: endF,
          startMeters: Math.max(cursor, ol.overlapStart) - wallStart,
          endMeters: ol.overlapEnd - wallStart,
          segmentType: isOwner ? 'interna' : 'invisible',
          neighborRoomId: ol.neighborRoomId,
          neighborWallIndex: ol.neighborWallIndex,
        });

        cursor = ol.overlapEnd;
      });

      // Remaining gap after all overlaps
      if (wallEnd - cursor > EPSILON) {
        const startF = (cursor - wallStart) / wallLen;
        const gapType = hasManualType && wall!.wallType !== 'invisible'
          ? wall!.wallType
          : (isOnPerimeter(cursor, wallEnd) ? 'externa' : 'interna');
        segments.push({
          startFraction: startF,
          endFraction: 1,
          startMeters: cursor - wallStart,
          endMeters: wallLen,
          segmentType: gapType as 'externa' | 'interna',
        });
      }

      // If no segments created (no overlaps and wall is full length)
      if (segments.length === 0) {
        const fullType = hasManualType
          ? wall!.wallType
          : (isOnPerimeter(wallStart, wallEnd) ? 'externa' : 'interna');
        segments.push({
          startFraction: 0,
          endFraction: 1,
          startMeters: 0,
          endMeters: wallLen,
          segmentType: fullType as 'externa' | 'interna' | 'invisible',
        });
      }

      result.set(key, segments);
    });
  });

  return result;
}
