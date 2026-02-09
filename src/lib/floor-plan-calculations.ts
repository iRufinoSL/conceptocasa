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
  walls: WallData[];
}

export interface WallData {
  id: string;
  wallIndex: number; // 1=top, 2=right, 3=bottom, 4=left
  wallType: 'externa' | 'interna';
  thickness?: number;
  height?: number;
  openings: OpeningData[];
}

export interface OpeningData {
  id: string;
  openingType: 'puerta' | 'ventana_grande' | 'ventana_mediana' | 'ventana_pequeña';
  name?: string;
  width: number;
  height: number;
  positionX: number;
}

export interface WallCalculation {
  wallIndex: number;
  wallType: 'externa' | 'interna';
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
  totalExternalWallM2: number;
  totalInternalWallM2: number;
  totalFloorM2: number; // sum of all room floors
  totalCeilingM2: number; // sum of all room ceilings
  totalExternalWallBaseM: number; // linear meters of external wall bases
  totalInternalWallBaseM: number; // linear meters of internal wall bases
  totalDoors: number;
  totalWindows: number;
  
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
      
      if (op.openingType === 'puerta') {
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
    
    if (wall.wallType === 'externa') {
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
    walls: wallCalcs,
    totalExternalWallArea,
    totalInternalWallArea,
    totalOpeningsArea,
    doorCount,
    windowCount,
  };
}

export function calculateRoof(plan: FloorPlanData): number {
  const baseWidth = plan.width + 2 * plan.roofOverhang;
  const baseLength = plan.length + 2 * plan.roofOverhang;
  
  if (plan.roofType === 'plana') {
    return baseWidth * baseLength;
  }
  
  const slopeRatio = plan.roofSlopePercent / 100;
  
  if (plan.roofType === 'dos_aguas') {
    // Two slopes along the width, ridge along the length
    const halfWidth = baseWidth / 2;
    const rise = halfWidth * slopeRatio;
    const slopeLength = Math.sqrt(halfWidth * halfWidth + rise * rise);
    return 2 * slopeLength * baseLength;
  }
  
  // cuatro_aguas (hip roof) - approximate
  const halfWidth = baseWidth / 2;
  const halfLength = baseLength / 2;
  const riseW = halfWidth * slopeRatio;
  const riseL = halfLength * slopeRatio;
  const slopeLengthW = Math.sqrt(halfWidth * halfWidth + riseW * riseW);
  const slopeLengthL = Math.sqrt(halfLength * halfLength + riseL * riseL);
  // Two triangular ends + two trapezoidal sides (approximate)
  return 2 * (0.5 * baseWidth * slopeLengthW) + 2 * (0.5 * baseLength * slopeLengthL);
}

export function calculateFloorPlanSummary(plan: FloorPlanData, rooms: RoomData[]): FloorPlanSummary {
  const roomCalcs = rooms.map(r => calculateRoom(r, plan));
  const roofM2 = calculateRoof(plan);
  
  let totalUsableM2 = 0;
  let totalExternalWallM2 = 0;
  let totalInternalWallM2 = 0;
  let totalFloorM2 = 0;
  let totalCeilingM2 = 0;
  let totalExternalWallBaseM = 0;
  let totalInternalWallBaseM = 0;
  let totalDoors = 0;
  let totalWindows = 0;
  
  roomCalcs.forEach(rc => {
    totalUsableM2 += rc.floorArea;
    totalFloorM2 += rc.floorArea;
    totalCeilingM2 += rc.ceilingArea;
    totalExternalWallM2 += rc.totalExternalWallArea;
    totalInternalWallM2 += rc.totalInternalWallArea;
    totalDoors += rc.doorCount;
    totalWindows += rc.windowCount;
    
    rc.walls.forEach(w => {
      if (w.wallType === 'externa') {
        totalExternalWallBaseM += w.baseLength;
      } else {
        totalInternalWallBaseM += w.baseLength;
      }
    });
  });
  
  // Calculate wall footprint area for built m2
  const externalWallFootprint = totalExternalWallBaseM * plan.externalWallThickness;
  const internalWallFootprint = totalInternalWallBaseM * plan.internalWallThickness;
  const totalBuiltM2 = totalUsableM2 + externalWallFootprint + internalWallFootprint;
  
  return {
    plantaTotalM2: plan.width * plan.length,
    roofM2,
    totalUsableM2,
    totalBuiltM2,
    totalExternalWallM2,
    totalInternalWallM2,
    totalFloorM2,
    totalCeilingM2,
    totalExternalWallBaseM,
    totalInternalWallBaseM,
    totalDoors,
    totalWindows,
    rooms: roomCalcs,
  };
}

// Default opening presets
export const OPENING_PRESETS = {
  puerta: { width: 0.925, height: 2.15, label: 'Puerta estándar' },
  ventana_grande: { width: 1.5, height: 1.2, label: 'Ventana grande' },
  ventana_mediana: { width: 1.2, height: 1.0, label: 'Ventana mediana' },
  ventana_pequeña: { width: 0.6, height: 0.6, label: 'Ventana pequeña' },
} as const;

export const WALL_LABELS: Record<number, string> = {
  1: 'Pared Superior',
  2: 'Pared Derecha',
  3: 'Pared Inferior',
  4: 'Pared Izquierda',
};

export const ROOM_PRESETS = [
  { name: 'Salón', width: 5, length: 4 },
  { name: 'Cocina', width: 4, length: 3.5 },
  { name: 'Habitación principal', width: 4, length: 3.5 },
  { name: 'Habitación', width: 4, length: 3 },
  { name: 'Baño', width: 2.5, length: 2 },
  { name: 'Despensa', width: 2, length: 1.5 },
  { name: 'Pasillo', width: 5, length: 1.2 },
  { name: 'Entrada', width: 2.5, length: 2 },
];
