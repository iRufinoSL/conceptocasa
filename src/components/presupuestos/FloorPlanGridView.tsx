import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Link, Unlink, Undo2, Expand, Shrink, MapPin, Printer, Ruler, Trash2, Check, RefreshCw, RotateCw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move } from 'lucide-react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { RoomData, FloorLevel, WallType, ScaleMode } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, isExteriorType, isInvisibleType, isCompartidaType } from '@/lib/floor-plan-calculations';
import type { CustomCorner } from '@/hooks/useFloorPlan';

interface FloorPlanGridViewProps {
  rooms: RoomData[];
  floors: FloorLevel[];
  planWidth: number;   // plan width in meters
  planLength: number;  // plan length in meters
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onAddRoom?: (name: string, width: number, length: number, floorId?: string, gridCol?: number, gridRow?: number) => Promise<void>;
  onGroupRooms?: (roomIds: string[], groupName: string, emptyCells?: { col: number; row: number }[]) => Promise<void>;
  onUngroupRooms?: (groupId: string) => Promise<void>;
  onUndo?: () => Promise<void>;
  undoCount?: number;
  saving?: boolean;
  /** Ref to capture the grid container for PDF export */
  gridRef?: React.RefObject<HTMLDivElement | null>;
  /** Callback to report active floor name and id */
  onActiveFloorChange?: (floorName: string, floorId?: string) => void;
  /** Force switch to this floor tab (e.g. after creating a new floor) */
  forceActiveFloorId?: string;
  /** Scale mode: 'metros' (1m cells) or 'bloque' (blockLengthMm cells) */
  scaleMode?: ScaleMode;
  /** Block length in mm (default 625), used when scaleMode='bloque' */
  blockLengthMm?: number;
  /** Budget name for print headers */
  budgetName?: string;
  /** Persisted custom corners */
  customCorners?: CustomCorner[];
  /** Callback to persist custom corners */
  onCustomCornersChange?: (corners: CustomCorner[]) => void;
  /** Roof parameters for bajo cubierta slope grids */
  roofType?: 'dos_aguas' | 'cuatro_aguas' | 'plana';
  roofSlopePercent?: number;
  roofOverhang?: number;
  defaultHeight?: number;
  /** Callback to recalculate wall segments */
  onRecalculateSegments?: () => Promise<void>;
  /** Callback to manually shift the entire grid by N cols/rows */
  onShiftGrid?: (deltaCol: number, deltaRow: number) => Promise<void>;
}

export interface PositionedRoom {
  room: RoomData;
  gridCol: number;
  gridRow: number;
}

const THRESHOLD = 0.15;

/** Column label: 2-digit padded with level prefix. col=1, level="1" → "1:01" */
export function colToLabel(col: number, levelPrefix?: string): string {
  const num = String(col).padStart(2, '0');
  return levelPrefix ? `${levelPrefix}:${num}` : num;
}

/** Row label: 2-digit padded with level prefix. row=4, level="1" → "1:04" */
export function rowToLabel(row: number, levelPrefix?: string): string {
  const num = String(row).padStart(2, '0');
  return levelPrefix ? `${levelPrefix}:${num}` : num;
}

/** Parse coordinate in multiple formats:
 * - Compact: "1:1710" or "1-1710" → level 1, col 17, row 10
 * - Slash:   "1:05/04" or "1-05/04" or "05/04" → col 5, row 4
 * - Legacy letter: "A1" → col 1, row 1
 */
export function parseCoord(coord: string): { col: number; row: number } | null {
  // Strip level prefix (supports both ":" and "-" separators for backward compat)
  const levelMatch = coord.match(/^(\d+)[:|-](.+)$/);
  const body = levelMatch ? levelMatch[2] : coord;

  // Slash format: "05/04"
  const slashMatch = body.match(/^(\d+)\/(\d+)$/);
  if (slashMatch) return { col: parseInt(slashMatch[1]), row: parseInt(slashMatch[2]) };

  // Compact 4-digit format: "1710" → col 17, row 10 (CCRR)
  const compactMatch = body.match(/^(\d{4})$/);
  if (compactMatch) {
    const col = parseInt(body.substring(0, 2));
    const row = parseInt(body.substring(2, 4));
    if (col > 0 && row > 0) return { col, row };
  }

  // Single number (column only, assume row=1)
  const singleMatch = body.match(/^(\d{1,2})$/);
  if (singleMatch) return { col: parseInt(singleMatch[1]), row: 1 };

  // Legacy letter format: "A1", "B02"
  const letterMatch = body.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (letterMatch) {
    let col = 0;
    for (let i = 0; i < letterMatch[1].length; i++) col = col * 26 + (letterMatch[1].charCodeAt(i) - 64);
    return { col, row: parseInt(letterMatch[2]) };
  }
  return null;
}

/** Format coordinate: col=5, row=4, level="1" → "1:05/04" */
export function formatCoord(col: number, row: number, levelPrefix?: string): string {
  const base = `${String(col).padStart(2, '0')}/${String(row).padStart(2, '0')}`;
  return levelPrefix ? `${levelPrefix}:${base}` : base;
}

// Derive grid positions from room posX/posY based on cell size in meters
export function deriveGridPositions(floorRooms: RoomData[], cellSizeM: number = 1): PositionedRoom[] {
  return floorRooms.map(r => ({
    room: r,
    gridCol: Math.round(r.posX / cellSizeM) + 1, // 1-based col
    gridRow: Math.round(r.posY / cellSizeM) + 1, // 1-based row
  }));
}

export function computeGridRuler(positioned: PositionedRoom[]) {
  if (positioned.length === 0) return { colWidths: [], rowHeights: [], colAccum: [], rowAccum: [] };
  const cols = Math.max(...positioned.map(p => p.gridCol));
  const rows = Math.max(...positioned.map(p => p.gridRow));
  const colWidths = Array(cols).fill(1);
  const rowHeights = Array(rows).fill(1);
  const colAccum = colWidths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);
  const rowAccum = rowHeights.reduce((acc, h) => [...acc, acc[acc.length - 1] + h], [0]);
  return { colWidths, rowHeights, colAccum, rowAccum };
}

const getSpaceColor = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('salón') || n.includes('salon')) return 'bg-amber-100/70 border-amber-400 dark:bg-amber-900/30 dark:border-amber-700';
  if (n.includes('hab')) return 'bg-blue-100/70 border-blue-400 dark:bg-blue-900/30 dark:border-blue-700';
  if (n.includes('baño') || n.includes('bano')) return 'bg-cyan-100/70 border-cyan-400 dark:bg-cyan-900/30 dark:border-cyan-700';
  if (n.includes('porche')) return 'bg-green-100/70 border-green-400 dark:bg-green-900/30 dark:border-green-700';
  if (n.includes('pasillo') || n.includes('corredor')) return 'bg-gray-100/70 border-gray-400 dark:bg-gray-800/50 dark:border-gray-600';
  if (n.includes('cocina')) return 'bg-orange-100/70 border-orange-400 dark:bg-orange-900/30 dark:border-orange-700';
  return 'bg-purple-100/70 border-purple-400 dark:bg-purple-900/30 dark:border-purple-700';
};

const getGroupColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = ((hash << 5) - hash) + groupId.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 85%)`;
};

/** Predefined space sizes */
const SPACE_PRESETS = [
  { label: 'Hab. pequeña', width: 3, length: 3 },
  { label: 'Hab. mediana', width: 4, length: 3 },
  { label: 'Hab. grande', width: 5, length: 4 },
  { label: 'Baño pequeño', width: 2, length: 2 },
  { label: 'Baño mediano', width: 3, length: 2 },
  { label: 'Baño grande', width: 4, length: 2 },
  { label: 'Cocina pequeña', width: 4, length: 2 },
  { label: 'Salón grande', width: 6, length: 5 },
];

// Get wall type for each side of a room
const getWallInfo = (room: RoomData, wallClassification: Map<string, WallType>) => {
  const info = new Map<number, WallType>();
  [1, 2, 3, 4].forEach(idx => {
    const ownWall = room.walls.find(w => w.wallIndex === idx);
    const key = `${room.id}::${idx}`;
    const classified = wallClassification.get(key);
    info.set(idx, ownWall?.wallType || classified || 'interior');
  });
  return info;
};

const getWallStyle = (wt: WallType) => {
  const isExt = isExteriorType(wt);
  const isInvis = isInvisibleType(wt);
  const isComp = isCompartidaType(wt);
  const thickness = isExt ? 4 : 2;
  let color: string;
  if (isExt && isComp) color = 'hsl(210, 70%, 55%)';
  else if (isExt && isInvis) color = 'hsl(0, 0%, 30%)';
  else if (isExt) color = 'hsl(var(--foreground))';
  else if (isComp) color = 'hsl(210, 60%, 70%)';
  else if (isInvis) color = 'hsl(0, 0%, 60%)';
  else color = 'hsl(0, 0%, 50%)';
  const style = isInvis ? 'dashed' : 'solid';
  return { width: `${thickness}px`, color, style };
};

export function FloorPlanGridView({
  rooms, floors, planWidth, planLength, selectedRoomId, onSelectRoom,
  onAddRoom, onGroupRooms, onUngroupRooms, onUndo, undoCount = 0, saving = false,
  gridRef, onActiveFloorChange, forceActiveFloorId,
  scaleMode = 'metros', blockLengthMm = 625, budgetName = '',
  customCorners: externalCustomCorners, onCustomCornersChange,
  roofType, roofSlopePercent = 20, roofOverhang = 0.6, defaultHeight = 2.5,
  onRecalculateSegments,
  onShiftGrid,
}: FloorPlanGridViewProps) {
  // Cell size in meters: 1m for 'metros', blockLengthMm/1000 for 'bloque'
  const cellSizeM = scaleMode === 'bloque' ? blockLengthMm / 1000 : 1;
  const cellLabel = scaleMode === 'bloque' ? `${blockLengthMm}mm` : '1m';

  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id || '_none_');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmptyCells, setSelectedEmptyCells] = useState<Set<string>>(new Set()); // "col,row"
  const [groupNameInput, setGroupNameInput] = useState('');
  const [gridFullscreen, setGridFullscreen] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [showCorners, setShowCorners] = useState(true);
  // Use external persisted corners, with local fallback
  const customCorners = externalCustomCorners || [];
  const setCustomCorners = (updater: CustomCorner[] | ((prev: CustomCorner[]) => CustomCorner[])) => {
    const newCorners = typeof updater === 'function' ? updater(customCorners) : updater;
    onCustomCornersChange?.(newCorners);
  };
  const [newCornerLabel, setNewCornerLabel] = useState('');
  const [newCornerCoord, setNewCornerCoord] = useState('');
  const [newCornerSide, setNewCornerSide] = useState<'top' | 'right' | 'bottom' | 'left'>('top');
  // Ruler tool
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{col: number; row: number}[]>([]);
  const [cornerClickMode, setCornerClickMode] = useState(false);
  const printGridRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  // Corner edit
  const [editingCornerIdx, setEditingCornerIdx] = useState<number | null>(null);
  const [editingCornerLabel, setEditingCornerLabel] = useState('');
  const [editingCornerCoord, setEditingCornerCoord] = useState('');
  const [editingCornerSide, setEditingCornerSide] = useState<'top' | 'right' | 'bottom' | 'left'>('top');

  // Force switch to a specific floor tab when requested (e.g. after creating a new floor)
  useEffect(() => {
    if (forceActiveFloorId) {
      setActiveFloorId(forceActiveFloorId);
    }
  }, [forceActiveFloorId]);
  const CELL_SIZE = scaleMode === 'bloque' ? 30 : 48; // px per cell (normal view)
  const COL_HEADER_W = 76; // px width for row headers (left margin ~2cm)
  const ROW_HEADER_H = 52; // px height for column headers (top margin ~2cm)

  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);

  const roomsByFloor = useMemo(() => {
    const map = new Map<string, RoomData[]>();
    rooms.forEach(r => {
      const fid = r.floorId || '_none_';
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid)!.push(r);
    });
    return map;
  }, [rooms]);

  const effectiveFloors = floors.length > 0 ? floors : [{ id: '_none_', name: 'Nivel 1', level: '0', orderIndex: 0 }];
  const currentFloorId = effectiveFloors.find(f => f.id === activeFloorId) ? activeFloorId : effectiveFloors[0]?.id;
  const currentFloorRooms = floors.length > 0 ? (roomsByFloor.get(currentFloorId) || []) : rooms;
  const currentFloorName = effectiveFloors.find(f => f.id === currentFloorId)?.name || 'Nivel 1';

  // Level prefix for coordinates: floor orderIndex + 1 (e.g. "1" for Level 1, "2" for Level 2)
  const currentFloorObj = effectiveFloors.find(f => f.id === currentFloorId);
  const levelPrefix = effectiveFloors.length > 1 ? String((currentFloorObj?.orderIndex ?? 0) + 1) : undefined;

  // Detect bajo cubierta floor
  const isBajoCubierta = currentFloorObj?.level === 'bajo_cubierta' || (currentFloorObj?.name || '').toLowerCase().includes('bajo cubierta');
  const showSlopeGrids = isBajoCubierta && roofType === 'dos_aguas';

  // Ghost underlay: rooms from the floor directly below the current one
  const ghostRooms = useMemo(() => {
    if (!currentFloorObj || effectiveFloors.length <= 1) return [];
    const currentIdx = currentFloorObj.orderIndex;
    if (currentIdx <= 0) return []; // Level 1 has no underlay
    const lowerFloor = effectiveFloors.find(f => f.orderIndex === currentIdx - 1);
    if (!lowerFloor) return [];
    const lowerRooms = roomsByFloor.get(lowerFloor.id) || [];
    return lowerRooms.filter(r => r.posX >= 0 && r.posY >= 0);
  }, [currentFloorObj, effectiveFloors, roomsByFloor]);

  // Report active floor name changes
  useEffect(() => {
    onActiveFloorChange?.(currentFloorName, currentFloorId);
  }, [currentFloorName, currentFloorId, onActiveFloorChange]);

  // Rooms placed on the grid (posX >= 0 and posY >= 0)
  const placedRooms = useMemo(() => {
    return currentFloorRooms.filter(r => r.width > 0 && r.length > 0 && r.posX >= 0 && r.posY >= 0);
  }, [currentFloorRooms]);

  // Grid size: when rooms are placed, use exact room extent (no extra cells from plan dimensions)
  const totalCols = useMemo(() => {
    if (placedRooms.length === 0) return Math.max(1, Math.ceil(planWidth / cellSizeM));
    return Math.max(...placedRooms.map(r => Math.round(r.posX / cellSizeM) + Math.max(1, Math.round(r.width / cellSizeM))));
  }, [planWidth, placedRooms, cellSizeM]);

  const totalRows = useMemo(() => {
    if (placedRooms.length === 0) return Math.max(1, Math.ceil(planLength / cellSizeM));
    return Math.max(...placedRooms.map(r => Math.round(r.posY / cellSizeM) + Math.max(1, Math.round(r.length / cellSizeM))));
  }, [planLength, placedRooms, cellSizeM]);

  // Build a cell occupation map: key = "col,row" → roomId
  const cellMap = useMemo(() => {
    const map = new Map<string, { roomId: string; isOrigin: boolean }>();
    placedRooms.forEach(r => {
      const startCol = Math.round(r.posX / cellSizeM) + 1;
      const startRow = Math.round(r.posY / cellSizeM) + 1;
      const spanCols = Math.max(1, Math.round(r.width / cellSizeM));
      const spanRows = Math.max(1, Math.round(r.length / cellSizeM));
      for (let dc = 0; dc < spanCols; dc++) {
        for (let dr = 0; dr < spanRows; dr++) {
          const c = startCol + dc;
          const row = startRow + dr;
          map.set(`${c},${row}`, { roomId: r.id, isOrigin: dc === 0 && dr === 0 });
        }
      }
    });
    return map;
  }, [placedRooms, totalCols, totalRows]);

  // Unplaced rooms: posX < 0 means "not yet positioned on the grid"
  const unplacedRooms = useMemo(() => {
    return currentFloorRooms.filter(r => r.posX < 0 || r.posY < 0);
  }, [currentFloorRooms]);

  // Bounding box of placed rooms in grid coordinates
  const boundingBox = useMemo(() => {
    if (placedRooms.length === 0) return null;
    let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
    placedRooms.forEach(r => {
      const sc = Math.round(r.posX / cellSizeM) + 1;
      const sr = Math.round(r.posY / cellSizeM) + 1;
      const ec = sc + Math.max(1, Math.round(r.width / cellSizeM));
      const er = sr + Math.max(1, Math.round(r.length / cellSizeM));
      minCol = Math.min(minCol, sc);
      minRow = Math.min(minRow, sr);
      maxCol = Math.max(maxCol, ec);
      maxRow = Math.max(maxRow, er);
    });
    return { minCol, minRow, maxCol, maxRow };
  }, [placedRooms, cellSizeM]);

  // Filter corners STRICTLY by floorId — never leak corners across levels
  const floorCorners = useMemo(() => customCorners.filter(c => c.floorId === currentFloorId), [customCorners, currentFloorId]);
  const nonFloorCorners = useMemo(() => customCorners.filter(c => c.floorId !== currentFloorId), [customCorners, currentFloorId]);

  // Level label prefix for corner marks (e.g. "1" for level 1)
  const cornerLevelPrefix = effectiveFloors.length > 1 ? String((currentFloorObj?.orderIndex ?? 0) + 1) : '';

  // Migrate orphan corners (no floorId) — assign them to the first floor to prevent cross-level leaks
  const migratedOrphansRef = useRef(false);
  useEffect(() => {
    if (migratedOrphansRef.current || !onCustomCornersChange) return;
    const orphans = customCorners.filter(c => !c.floorId);
    if (orphans.length > 0) {
      // Assign orphan corners to the first available floor
      const firstFloorId = effectiveFloors[0]?.id;
      if (firstFloorId) {
        const migrated = customCorners.map(c => c.floorId ? c : { ...c, floorId: firstFloorId });
        onCustomCornersChange(migrated);
      }
    }
    migratedOrphansRef.current = true;
  }, [customCorners, effectiveFloors]);

  // Auto-sync main corners with bounding box — update on every bounding box change
  const autoInitRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!boundingBox || !onCustomCornersChange) return;
    // Only auto-create main corners if NONE exist for this floor yet
    const hasMainForFloor = customCorners.some(c => c.isMain && c.floorId === currentFloorId);
    if (hasMainForFloor) {
      autoInitRef.current.add(currentFloorId);
      return;
    }
    if (autoInitRef.current.has(currentFloorId)) return;

    const lp = cornerLevelPrefix;
    const newMainCorners: CustomCorner[] = [
      { label: `${lp}A`, col: boundingBox.minCol, row: boundingBox.minRow, side: 'top', isMain: true, mainPosition: 'TL', floorId: currentFloorId },
      { label: `${lp}B`, col: boundingBox.maxCol, row: boundingBox.minRow, side: 'top', isMain: true, mainPosition: 'TR', floorId: currentFloorId },
      { label: `${lp}C`, col: boundingBox.maxCol, row: boundingBox.maxRow, side: 'bottom', isMain: true, mainPosition: 'BR', floorId: currentFloorId },
      { label: `${lp}D`, col: boundingBox.minCol, row: boundingBox.maxRow, side: 'bottom', isMain: true, mainPosition: 'BL', floorId: currentFloorId },
    ];
    const otherCorners = customCorners.filter(c => !(c.isMain && c.floorId === currentFloorId));
    setCustomCorners([...otherCorners, ...newMainCorners]);
    autoInitRef.current.add(currentFloorId);
  }, [boundingBox, currentFloorId, cornerLevelPrefix]);

  // Auto-generate eave (alero) markers for bajo cubierta floors if missing
  const eaveInitRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isBajoCubierta || !boundingBox || !onCustomCornersChange) return;
    if (eaveInitRef.current.has(currentFloorId)) return;
    const hasEaveForFloor = customCorners.some(c => c.isEave && c.floorId === currentFloorId);
    if (hasEaveForFloor) { eaveInitRef.current.add(currentFloorId); return; }
    const hasMainForFloor = customCorners.some(c => c.isMain && c.floorId === currentFloorId);
    if (!hasMainForFloor) return;
    const lp = cornerLevelPrefix;
    const eaveCorners: CustomCorner[] = [
      { label: `Al${lp}A`, col: boundingBox.minCol - 1, row: boundingBox.minRow - 1, side: 'top', isEave: true, floorId: currentFloorId },
      { label: `Al${lp}B`, col: boundingBox.maxCol + 1, row: boundingBox.minRow - 1, side: 'top', isEave: true, floorId: currentFloorId },
      { label: `Al${lp}C`, col: boundingBox.maxCol + 1, row: boundingBox.maxRow + 1, side: 'bottom', isEave: true, floorId: currentFloorId },
      { label: `Al${lp}D`, col: boundingBox.minCol - 1, row: boundingBox.maxRow + 1, side: 'bottom', isEave: true, floorId: currentFloorId },
    ];
    setCustomCorners([...customCorners, ...eaveCorners]);
    eaveInitRef.current.add(currentFloorId);
  }, [boundingBox, currentFloorId, isBajoCubierta, customCorners]);

  const currentFloorGroups = useMemo(() => {
    const groups = new Map<string, { name: string; rooms: RoomData[] }>();
    currentFloorRooms.forEach(r => {
      if (r.groupId) {
        if (!groups.has(r.groupId)) groups.set(r.groupId, { name: r.groupName || 'Grupo', rooms: [] });
        groups.get(r.groupId)!.rooms.push(r);
      }
    });
    return groups;
  }, [currentFloorRooms]);

  const toggleMultiSelect = (roomId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const toggleEmptyCell = (col: number, row: number) => {
    const key = `${col},${row}`;
    setSelectedEmptyCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-derive group name from the first selected room
  const autoGroupName = useMemo(() => {
    if (selectedIds.size === 0) return '';
    const firstRoomId = Array.from(selectedIds)[0];
    const room = currentFloorRooms.find(r => r.id === firstRoomId);
    return room?.name || '';
  }, [selectedIds, currentFloorRooms]);

  const effectiveGroupName = groupNameInput || autoGroupName;

  const totalSelected = selectedIds.size + selectedEmptyCells.size;

  const handleGroup = async () => {
    if (!onGroupRooms || totalSelected < 2 || !effectiveGroupName.trim()) return;
    const emptyCells = Array.from(selectedEmptyCells).map(k => {
      const [c, r] = k.split(',').map(Number);
      return { col: c, row: r };
    });
    await onGroupRooms(Array.from(selectedIds), effectiveGroupName.trim(), emptyCells);
    setSelectedIds(new Set());
    setSelectedEmptyCells(new Set());
    setGroupNameInput('');
    setMultiSelectMode(false);
  };

  // Opening marks for walls — positioned proportionally using positionX and sized by opening width
  const renderOpeningMarks = (room: RoomData, wallIndex: number, side: 'top' | 'right' | 'bottom' | 'left', roomWidthPx: number, roomHeightPx: number) => {
    const wall = room.walls.find(w => w.wallIndex === wallIndex);
    if (!wall || wall.openings.length === 0) return null;
    const isHoriz = side === 'top' || side === 'bottom';
    // Wall length in meters
    const wallLenM = isHoriz ? room.width : room.length;
    // Container length in px
    const containerPx = isHoriz ? roomWidthPx : roomHeightPx;

    return wall.openings.map((op, i) => {
      const isWindow = op.openingType.startsWith('ventana');
      const borderColor = isWindow ? '#06b6d4' : '#d97706'; // cyan-500 / amber-600
      // Opening width as fraction of wall
      const opWidthFraction = wallLenM > 0 ? op.width / wallLenM : 0.2;
      const opWidthPx = Math.max(4, Math.round(opWidthFraction * containerPx));
      // Position: positionX is 0-1 fraction (center of opening along wall)
      const centerFraction = op.positionX ?? 0.5;
      const centerPx = centerFraction * containerPx;
      const MARK_THICKNESS = 6;

      if (isHoriz) {
        return (
          <div key={op.id || `o${i}`} className="absolute" style={{
            left: centerPx - opWidthPx / 2,
            ...(side === 'top' ? { top: -MARK_THICKNESS / 2 } : { bottom: -MARK_THICKNESS / 2 }),
            width: opWidthPx,
            height: MARK_THICKNESS,
            backgroundColor: 'white',
            border: `2px solid ${borderColor}`,
            borderRadius: 1,
            zIndex: 30,
          }} />
        );
      } else {
        return (
          <div key={op.id || `o${i}`} className="absolute" style={{
            top: centerPx - opWidthPx / 2,
            ...(side === 'left' ? { left: -MARK_THICKNESS / 2 } : { right: -MARK_THICKNESS / 2 }),
            width: MARK_THICKNESS,
            height: opWidthPx,
            backgroundColor: 'white',
            border: `2px solid ${borderColor}`,
            borderRadius: 1,
            zIndex: 30,
          }} />
        );
      }
    });
  };

  const renderGrid = (overrideCellSize?: number) => {
    const CS = overrideCellSize || CELL_SIZE;
    const fontScale = CS / CELL_SIZE; // 1.0 at default, >1 when enlarged
    const nameFontSize = Math.max(9, Math.round(9 * fontScale));
    const m2FontSize = Math.max(10, Math.round(10 * fontScale));
    const dimFontSize = Math.max(8, Math.round(8 * fontScale));
    const coordFontSize = Math.max(7, Math.round(7 * fontScale));
    // Render rooms as absolutely positioned overlays on the grid
    const roomOverlays = placedRooms.map(room => {
      const startCol = Math.round(room.posX / cellSizeM) + 1;
      const startRow = Math.round(room.posY / cellSizeM) + 1;
      const spanCols = Math.max(1, Math.round(room.width / cellSizeM));
      const spanRows = Math.max(1, Math.round(room.length / cellSizeM));

      const wallInfo = getWallInfo(room, wallClassification);
      const ws1 = getWallStyle(wallInfo.get(1)!);
      const ws2 = getWallStyle(wallInfo.get(2)!);
      const ws3 = getWallStyle(wallInfo.get(3)!);
      const ws4 = getWallStyle(wallInfo.get(4)!);

      const isSelected = room.id === selectedRoomId;
      const isMultiSelected = selectedIds.has(room.id);
      const m2 = (room.width * room.length).toFixed(1);
      const colorClass = getSpaceColor(room.name);
      const coord = formatCoord(startCol, startRow, levelPrefix);
      const groupColor = room.groupId ? getGroupColor(room.groupId) : undefined;

      // Position: COL_HEADER_W + (startCol-1)*CS, ROW_HEADER_H + (startRow-1)*CS
      const left = COL_HEADER_W + (startCol - 1) * CS;
      const top = ROW_HEADER_H + (startRow - 1) * CS;
      const width = spanCols * CS;
      const height = spanRows * CS;

      return (
        <div
          key={room.id}
          className={`
            absolute cursor-pointer transition-shadow z-10 flex flex-col items-center justify-center
            ${colorClass}
            ${isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-lg z-20' : 'hover:shadow-md'}
            ${isMultiSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-20' : ''}
          `}
          style={{
            left, top, width, height,
            borderTopWidth: ws1.width,
            borderRightWidth: ws2.width,
            borderBottomWidth: ws3.width,
            borderLeftWidth: ws4.width,
            borderTopColor: ws1.color,
            borderRightColor: ws2.color,
            borderBottomColor: ws3.color,
            borderLeftColor: ws4.color,
            borderTopStyle: ws1.style as any,
            borderRightStyle: ws2.style as any,
            borderBottomStyle: ws3.style as any,
            borderLeftStyle: ws4.style as any,
            ...(groupColor ? { boxShadow: `inset 0 0 0 2px ${groupColor}` } : {}),
          }}
          onClick={() => {
            if (multiSelectMode) toggleMultiSelect(room.id);
            else onSelectRoom(room.id === selectedRoomId ? null : room.id);
          }}
        >
          {renderOpeningMarks(room, 1, 'top', width, height)}
          {renderOpeningMarks(room, 2, 'right', width, height)}
          {renderOpeningMarks(room, 3, 'bottom', width, height)}
          {renderOpeningMarks(room, 4, 'left', width, height)}

          <div className="font-bold text-center max-w-full px-0.5 leading-tight break-words" style={{ fontSize: `${nameFontSize}px`, lineHeight: '1.2' }}>{room.name}</div>
          <div className="font-semibold" style={{ fontSize: `${m2FontSize}px` }}>{m2} m²</div>
          <div className="text-muted-foreground" style={{ fontSize: `${dimFontSize}px` }}>{room.width.toFixed(1)}×{room.length.toFixed(1)}</div>
          <Badge variant="outline" className="px-0.5 py-0 mt-0.5" style={{ fontSize: `${coordFontSize}px`, height: `${Math.max(12, Math.round(12 * fontScale))}px` }}>{coord}</Badge>

          {multiSelectMode && (
            <div className={`absolute top-0.5 right-0.5 w-3 h-3 rounded-full border ${isMultiSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50 bg-background'}`} />
          )}
        </div>
      );
    });

    return (
      <div className="overflow-auto border rounded-lg bg-background" ref={gridRef}>
        <div
          className="relative"
          style={{
            width: COL_HEADER_W + totalCols * CS + 200,
            height: ROW_HEADER_H + totalRows * CS + 120,
          }}
        >
          {/* Column headers — separated ~10px from grid edge for readability */}
          {Array.from({ length: totalCols }, (_, ci) => (
            <div
              key={`ch-${ci}`}
              className="absolute text-[8px] font-bold text-blue-600 dark:text-blue-400 leading-none"
              style={{
                left: COL_HEADER_W + ci * CS,
                top: 2,
                width: CS,
                height: ROW_HEADER_H - 20,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-start',
                paddingLeft: 1,
              }}
            >
              {colToLabel(ci + 1, levelPrefix)}
            </div>
          ))}

          {/* Row headers — separated ~10px from grid edge */}
          {Array.from({ length: totalRows }, (_, ri) => (
            <div
              key={`rh-${ri}`}
              className="absolute text-[8px] font-bold text-blue-600 dark:text-blue-400 text-right leading-none"
              style={{
                left: 2,
                top: ROW_HEADER_H + ri * CS,
                width: COL_HEADER_W - 10,
                height: CS,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-end',
                paddingTop: 1,
              }}
            >
              {rowToLabel(ri + 1, levelPrefix)}
            </div>
          ))}

          {/* Grid cells — each one = 1 bloque (625×625mm), with borders and alternating shading */}
          {Array.from({ length: totalCols * totalRows }, (_, i) => {
            const col = (i % totalCols);
            const row = Math.floor(i / totalCols);
            const isOdd = (col + row) % 2 === 1;
            return (
              <div
                key={`cbg-${col}-${row}`}
                className="absolute pointer-events-none"
                style={{
                  left: COL_HEADER_W + col * CS,
                  top: ROW_HEADER_H + row * CS,
                  width: CS,
                  height: CS,
                  border: '1.5px solid rgba(0,128,0,0.25)',
                  backgroundColor: isOdd ? 'rgba(0,128,0,0.06)' : 'rgba(0,128,0,0.015)',
                  zIndex: 15,
                }}
              />
            );
          })}

          {/* Ridge line (viga cumbrera) — horizontal red line at midpoint of rows (from gable to gable) for dos_aguas roofs */}
          {roofType === 'dos_aguas' && (() => {
            const ridgeRow = totalRows / 2;
            const ridgeTop = ROW_HEADER_H + ridgeRow * CS;
            return (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: COL_HEADER_W - 10,
                  top: ridgeTop - 1.25,
                  width: totalCols * CS + 20,
                  height: 0,
                  borderTop: '2.5px dashed #dc2626',
                  zIndex: 25,
                }}
              >
                <div className="absolute -top-5 right-1 text-[9px] font-bold whitespace-nowrap" style={{ color: '#dc2626' }}>
                  ▲ Cumbrera
                </div>
              </div>
            );
          })()}

          {/* Ghost underlay: faint outlines of the floor below */}
          {ghostRooms.map(room => {
            const startCol = Math.round(room.posX / cellSizeM) + 1;
            const startRow = Math.round(room.posY / cellSizeM) + 1;
            const spanCols = Math.max(1, Math.round(room.width / cellSizeM));
            const spanRows = Math.max(1, Math.round(room.length / cellSizeM));
            const left = COL_HEADER_W + (startCol - 1) * CS;
            const top = ROW_HEADER_H + (startRow - 1) * CS;
            const width = spanCols * CS;
            const height = spanRows * CS;
            return (
              <div
                key={`ghost-${room.id}`}
                className="absolute pointer-events-none z-[1]"
                style={{
                  left, top, width, height,
                  border: '1px dashed hsl(var(--muted-foreground) / 0.15)',
                  backgroundColor: 'hsl(var(--muted-foreground) / 0.03)',
                }}
              >
                <div className="text-[7px] px-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground) / 0.2)' }}>
                  {room.name}
                </div>
              </div>
            );
          })}

          {/* Empty cell click targets for multiselect grouping */}
          {multiSelectMode && Array.from({ length: totalCols * totalRows }, (_, i) => {
            const col = (i % totalCols) + 1;
            const row = Math.floor(i / totalCols) + 1;
            const cellKey = `${col},${row}`;
            const isOccupied = cellMap.has(cellKey);
            if (isOccupied) return null;
            const isEmptySelected = selectedEmptyCells.has(cellKey);
            return (
              <div
                key={`empty-${cellKey}`}
                className={`absolute cursor-pointer transition-colors z-5 ${isEmptySelected ? 'bg-blue-300/50 ring-2 ring-blue-500' : 'hover:bg-blue-100/30'}`}
                style={{
                  left: COL_HEADER_W + (col - 1) * CS,
                  top: ROW_HEADER_H + (row - 1) * CS,
                  width: CS,
                  height: CS,
                }}
                onClick={() => toggleEmptyCell(col, row)}
              >
                {isEmptySelected && (
                  <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-blue-500 border-blue-500 border" />
                )}
                <div className="text-[7px] text-muted-foreground/40 p-0.5">{formatCoord(col, row)}</div>
              </div>
            );
          })}

          {/* Room overlays */}
          {roomOverlays}

          {/* Ruler mode: click targets */}
          {rulerMode && Array.from({ length: totalCols * totalRows }, (_, i) => {
            const col = (i % totalCols) + 1;
            const row = Math.floor(i / totalCols) + 1;
            const isRulerPoint = rulerPoints.some(p => p.col === col && p.row === row);
            return (
              <div
                key={`ruler-${col}-${row}`}
                className={`absolute cursor-crosshair z-25 ${isRulerPoint ? 'bg-primary/30' : 'hover:bg-primary/10'}`}
                style={{
                  left: COL_HEADER_W + (col - 1) * CS,
                  top: ROW_HEADER_H + (row - 1) * CS,
                  width: CS,
                  height: CS,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (rulerPoints.length >= 2) setRulerPoints([{ col, row }]);
                  else setRulerPoints(prev => [...prev, { col, row }]);
                }}
              />
            );
          })}

          {/* Corner click mode: intersection targets */}
          {cornerClickMode && (() => {
            // Auto-generate name for a new corner based on edge and existing corners
            const autoCornerName = (col: number, row: number): { label: string; side: 'top' | 'right' | 'bottom' | 'left' } => {
              const lp = cornerLevelPrefix || '';
              // Determine closest edge
              const dTop = row - 1;
              const dBottom = totalRows - row + 1;
              const dLeft = col - 1;
              const dRight = totalCols - col + 1;
              const minD = Math.min(dTop, dBottom, dLeft, dRight);
              let edge: 'top' | 'right' | 'bottom' | 'left';
              if (minD === dTop) edge = 'top';
              else if (minD === dRight) edge = 'right';
              else if (minD === dBottom) edge = 'bottom';
              else edge = 'left';
              // Base letter by edge
              const baseLetter = edge === 'top' ? 'A' : edge === 'right' ? 'B' : edge === 'bottom' ? 'C' : 'D';
              // Count existing custom corners on this edge for this floor
              const existingOnEdge = floorCorners.filter(c => !c.isMain && !c.isEave && c.label.includes(baseLetter)).length;
              const seq = existingOnEdge + 1;
              return { label: `${lp}${baseLetter}${seq}`, side: edge };
            };
            // Check if a corner already exists at this intersection
            const hasCornerAt = (col: number, row: number) => floorCorners.some(c => c.col === col && c.row === row);
            
            // Render intersection points (corners of cells)
            const intersections: React.ReactNode[] = [];
            for (let ci = 0; ci <= totalCols; ci++) {
              for (let ri = 0; ri <= totalRows; ri++) {
                const col = ci + 1;
                const row = ri + 1;
                const exists = hasCornerAt(col, row);
                const px = COL_HEADER_W + ci * CS;
                const py = ROW_HEADER_H + ri * CS;
                const hitSize = Math.max(12, CS * 0.4);
                intersections.push(
                  <div
                    key={`int-${ci}-${ri}`}
                    className={`absolute cursor-crosshair z-[35] flex items-center justify-center group`}
                    style={{
                      left: px - hitSize / 2,
                      top: py - hitSize / 2,
                      width: hitSize,
                      height: hitSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (exists) return; // Don't create duplicate
                      const { label, side } = autoCornerName(col, row);
                      setCustomCorners(prev => [...prev, { label, col, row, side, floorId: currentFloorId }]);
                    }}
                  >
                    <div className={`rounded-full transition-all ${exists ? 'w-2.5 h-2.5 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/30 group-hover:w-3 group-hover:h-3 group-hover:bg-primary/60'}`} />
                  </div>
                );
              }
            }
            return intersections;
          })()}

          {/* Ruler line */}
          {rulerMode && rulerPoints.length === 2 && (() => {
            const [p1, p2] = rulerPoints;
            const x1 = COL_HEADER_W + (p1.col - 0.5) * CS;
            const y1 = ROW_HEADER_H + (p1.row - 0.5) * CS;
            const x2 = COL_HEADER_W + (p2.col - 0.5) * CS;
            const y2 = ROW_HEADER_H + (p2.row - 0.5) * CS;
            const dx = (p2.col - p1.col) * cellSizeM;
            const dy = (p2.row - p1.row) * cellSizeM;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <svg className="absolute inset-0 pointer-events-none" style={{ width: COL_HEADER_W + totalCols * CS + 1, height: ROW_HEADER_H + totalRows * CS + 1, zIndex: 35 }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 3" />
                <circle cx={x1} cy={y1} r={4} fill="hsl(var(--primary))" />
                <circle cx={x2} cy={y2} r={4} fill="hsl(var(--primary))" />
                <rect x={midX - 35} y={midY - 10} width={70} height={20} rx={4} fill="hsl(var(--primary))" />
                <text x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="white">
                  {dist.toFixed(2)} m
                </text>
              </svg>
            );
          })()}

          {/* Corner markers — filtered by floor, with edit/delete UI */}
          {showCorners && placedRooms.length > 0 && boundingBox && (() => {
            const { minCol, minRow, maxCol, maxRow } = boundingBox;

            // Get main corner labels from floor-specific corners
            const mainFromStorage = floorCorners.filter(c => c.isMain);
            const lp = cornerLevelPrefix;
            const getMainLabel = (pos: string, defaultLabel: string) => {
              const found = mainFromStorage.find(c => c.mainPosition === pos);
              const storedLabel = found?.label || defaultLabel;
              // Always ensure level prefix on main corners
              return lp && !storedLabel.startsWith(lp) ? `${lp}${storedLabel}` : storedLabel;
            };
            const getMainIdx = (pos: string) => {
              const found = mainFromStorage.find(c => c.mainPosition === pos);
              return found ? customCorners.indexOf(found) : -1;
            };

            // Use STORED main corner col/row for visual positioning (not bounding box)
            // This ensures markers stay correct after grid shifts
            const getStoredCol = (pos: string, fallback: number) => mainFromStorage.find(c => c.mainPosition === pos)?.col ?? fallback;
            const getStoredRow = (pos: string, fallback: number) => mainFromStorage.find(c => c.mainPosition === pos)?.row ?? fallback;
            const sTL_col = getStoredCol('TL', minCol), sTL_row = getStoredRow('TL', minRow);
            const sTR_col = getStoredCol('TR', maxCol), sTR_row = getStoredRow('TR', minRow);
            const sBR_col = getStoredCol('BR', maxCol), sBR_row = getStoredRow('BR', maxRow);
            const sBL_col = getStoredCol('BL', minCol), sBL_row = getStoredRow('BL', maxRow);

            const mainCorners = [
              { label: getMainLabel('TL', 'A'), left: COL_HEADER_W + (sTL_col - 1) * CS - 12, top: ROW_HEADER_H + (sTL_row - 1) * CS - 22, idx: getMainIdx('TL'), isMain: true },
              { label: getMainLabel('TR', 'B'), left: COL_HEADER_W + (sTR_col - 1) * CS + CS + 4, top: ROW_HEADER_H + (sTR_row - 1) * CS - 22, idx: getMainIdx('TR'), isMain: true },
              { label: getMainLabel('BR', 'C'), left: COL_HEADER_W + (sBR_col - 1) * CS + CS + 4, top: ROW_HEADER_H + (sBR_row - 1) * CS + CS + 6, idx: getMainIdx('BR'), isMain: true },
              { label: getMainLabel('BL', 'D'), left: COL_HEADER_W + (sBL_col - 1) * CS - 12, top: ROW_HEADER_H + (sBL_row - 1) * CS + CS + 6, idx: getMainIdx('BL'), isMain: true },
            ];

            const customMarkers = floorCorners
              .filter(c => !c.isMain)
              .map(cc => {
                // Arrow target: top-left first mm of the block at (col, row)
                const targetX = COL_HEADER_W + (cc.col - 1) * CS;
                const targetY = ROW_HEADER_H + (cc.row - 1) * CS;
                let left: number, top: number;
                switch (cc.side) {
                  case 'top':    left = targetX; top = ROW_HEADER_H + (cc.row - 1) * CS - 26; break;
                  case 'bottom': left = targetX; top = ROW_HEADER_H + cc.row * CS + 6; break;
                  case 'left':   left = COL_HEADER_W + (cc.col - 1) * CS - 26; top = targetY; break;
                  case 'right':  left = COL_HEADER_W + cc.col * CS + 6; top = targetY; break;
                }
                return { label: cc.label, left, top, idx: customCorners.indexOf(cc), isMain: false, arrowTargetX: targetX, arrowTargetY: targetY };
              });

            const allCorners = [...mainCorners, ...customMarkers];

            return allCorners.map((c, renderIdx) => {
              const isEditing = editingCornerIdx === c.idx && c.idx >= 0;
              return (
                <div
                  key={`corner-${c.label}-${renderIdx}`}
                  className={`absolute ${isEditing ? 'z-50' : 'z-30'}`}
                  style={{
                    left: c.left - (isEditing ? 40 : 10),
                    top: c.top - 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-0.5 bg-primary rounded-full px-1.5 h-6" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        className="w-10 h-4 text-[10px] text-center bg-transparent border-b border-primary-foreground outline-none text-primary-foreground"
                        value={editingCornerLabel}
                        onChange={e => setEditingCornerLabel(e.target.value)}
                        placeholder="ID"
                        onKeyDown={e => { if (e.key === 'Escape') setEditingCornerIdx(null); }}
                      />
                      <input
                        className="w-14 h-4 text-[10px] text-center bg-transparent border-b border-primary-foreground outline-none text-primary-foreground"
                        value={editingCornerCoord}
                        onChange={e => setEditingCornerCoord(e.target.value)}
                        placeholder="col/row"
                        title="Coordenada (ej: 1-0504 o 05/04)"
                        onKeyDown={e => { if (e.key === 'Escape') setEditingCornerIdx(null); }}
                      />
                      <select
                        className="h-4 text-[9px] bg-transparent border-none outline-none text-primary-foreground"
                        value={editingCornerSide}
                        onChange={e => setEditingCornerSide(e.target.value as any)}
                      >
                        <option value="top">↑</option>
                        <option value="right">→</option>
                        <option value="bottom">↓</option>
                        <option value="left">←</option>
                      </select>
                      <button
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500 hover:bg-green-600 text-white"
                        title="Guardar"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (c.idx >= 0) {
                            const parsed = parseCoord(editingCornerCoord.trim());
                            setCustomCorners(prev => prev.map((cc, i) => {
                              if (i !== c.idx) return cc;
                              const updates: Partial<CustomCorner> = {};
                              if (editingCornerLabel.trim()) updates.label = editingCornerLabel.trim();
                              if (parsed) { updates.col = parsed.col; updates.row = parsed.row; }
                              updates.side = editingCornerSide;
                              return { ...cc, ...updates };
                            }));
                          }
                          setEditingCornerIdx(null);
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      {!c.isMain && (
                        <button
                          className="flex items-center justify-center w-4 h-4 rounded-full bg-destructive hover:bg-destructive/80 text-destructive-foreground"
                          title="Borrar"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomCorners(prev => prev.filter((_, i) => i !== c.idx));
                            setEditingCornerIdx(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-[10px] cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                      style={{ width: 26, height: 20, minWidth: 26 }}
                      title={`Clic para editar ${c.label}`}
                      onClick={() => {
                        if (c.idx >= 0) {
                          const corner = customCorners[c.idx];
                          setEditingCornerIdx(c.idx);
                          setEditingCornerLabel(c.label);
                          setEditingCornerCoord(formatCoord(corner.col, corner.row, levelPrefix));
                          setEditingCornerSide(corner.side || 'top');
                        }
                      }}
                    >
                      {c.label}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* Arrow lines from custom markers to their exact target point (first mm, top-left of block) */}
          {showCorners && placedRooms.length > 0 && (() => {
            const customOnly = floorCorners.filter(c => !c.isMain);
            if (customOnly.length === 0) return null;
            return (
              <svg className="absolute inset-0 pointer-events-none" style={{
                width: COL_HEADER_W + totalCols * CS + 200,
                height: ROW_HEADER_H + totalRows * CS + 120,
                zIndex: 29,
                overflow: 'visible',
              }}>
                {customOnly.map((cc, i) => {
                  // Target depends on side:
                  // top/left → first mm (top-left of block)
                  // bottom → last mm vertically (bottom of block row)
                  // right → last mm horizontally (right of block col)
                  const targetX = cc.side === 'right'
                    ? COL_HEADER_W + cc.col * CS   // last mm of block col
                    : COL_HEADER_W + (cc.col - 1) * CS; // first mm
                  const targetY = cc.side === 'bottom'
                    ? ROW_HEADER_H + cc.row * CS   // last mm of block row
                    : ROW_HEADER_H + (cc.row - 1) * CS; // first mm
                  // Marker center position
                  let markerX: number, markerY: number;
                  switch (cc.side) {
                    case 'top':    markerX = targetX; markerY = ROW_HEADER_H + (cc.row - 1) * CS - 16; break;
                    case 'bottom': markerX = targetX; markerY = ROW_HEADER_H + cc.row * CS + 16; break;
                    case 'left':   markerX = COL_HEADER_W + (cc.col - 1) * CS - 16; markerY = targetY; break;
                    case 'right':  markerX = COL_HEADER_W + cc.col * CS + 16; markerY = targetY; break;
                  }
                  // Arrow head size
                  const dx = targetX - markerX;
                  const dy = targetY - markerY;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len < 2) return null;
                  const ux = dx / len, uy = dy / len;
                  const arrowSize = 4;
                  const tipX = targetX;
                  const tipY = targetY;
                  const baseX = tipX - ux * arrowSize;
                  const baseY = tipY - uy * arrowSize;
                  const perpX = -uy * arrowSize * 0.5;
                  const perpY = ux * arrowSize * 0.5;
                  return (
                    <g key={`arrow-${cc.label}-${i}`}>
                      <line x1={markerX} y1={markerY} x2={targetX} y2={targetY}
                        stroke="#2563eb" strokeWidth={1.2} />
                      <polygon
                        points={`${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`}
                        fill="#2563eb"
                      />
                      <circle cx={targetX} cy={targetY} r={2.5} fill="#2563eb" />
                    </g>
                  );
                })}
              </svg>
            );
          })()}

          {showCorners && placedRooms.length > 0 && boundingBox && (() => {
            const { minCol, minRow, maxCol, maxRow } = boundingBox;
            const mainFromStorage = floorCorners.filter(c => c.isMain);
            const lp = cornerLevelPrefix;
            const getMainLbl = (pos: string, def: string) => {
              const found = mainFromStorage.find(c => c.mainPosition === pos);
              const s = found?.label || def;
              return lp && !s.startsWith(lp) ? `${lp}${s}` : s;
            };

            type CP = { label: string; col: number; row: number; side?: string };
            // Classify custom corners to building edges using normalized distance.
            // This handles markers not exactly on a boundary (e.g. B1 between B and C
            // with col far from maxCol but row between minRow and maxRow).
            const nonMainCorners = floorCorners.filter(c => !c.isMain && !c.isEave);
            const colSpan = Math.max(1, maxCol - minCol);
            const rowSpan = Math.max(1, maxRow - minRow);
            const classifyToEdge = (c: { col: number; row: number }): 'top' | 'right' | 'bottom' | 'left' => {
              if (c.row === minRow) return 'top';
              if (c.col === minCol && c.row !== minRow) return 'left';
              const dTop = Math.abs(c.row - minRow) / rowSpan;
              const dBottom = Math.abs(c.row - (maxRow - 1)) / rowSpan;
              const dLeft = Math.abs(c.col - minCol) / colSpan;
              const dRight = Math.abs(c.col - (maxCol - 1)) / colSpan;
              const mn = Math.min(dTop, dBottom, dLeft, dRight);
              if (mn === dTop) return 'top';
              if (mn === dRight) return 'right';
              if (mn === dBottom) return 'bottom';
              return 'left';
            };
            const customOnTop: CP[] = [];
            const customOnBottom: CP[] = [];
            const customOnLeft: CP[] = [];
            const customOnRight: CP[] = [];
            nonMainCorners.forEach(c => {
              const edge = classifyToEdge(c);
              const cp = { label: c.label, col: c.col, row: c.row, side: c.side };
              switch (edge) {
                case 'top': customOnTop.push(cp); break;
                case 'bottom': customOnBottom.push(cp); break;
                case 'left': customOnLeft.push(cp); break;
                case 'right': customOnRight.push(cp); break;
              }
            });

            // Use STORED main corner positions (user-editable) instead of bounding box
            const storedMain = mainFromStorage.length > 0 ? mainFromStorage : [];
            const getStoredCol = (pos: string, fallback: number) => storedMain.find(c => c.mainPosition === pos)?.col ?? fallback;
            const getStoredRow = (pos: string, fallback: number) => storedMain.find(c => c.mainPosition === pos)?.row ?? fallback;
            const mColA = getStoredCol('TL', minCol);
            const mRowA = getStoredRow('TL', minRow);
            const mColB = getStoredCol('TR', maxCol);
            const mRowB = getStoredRow('TR', minRow);
            const mColC = getStoredCol('BR', maxCol);
            const mRowC = getStoredRow('BR', maxRow);
            const mColD = getStoredCol('BL', minCol);
            const mRowD = getStoredRow('BL', maxRow);

            const topAll: CP[] = [
              { label: getMainLbl('TL', 'A'), col: mColA, row: mRowA },
              ...customOnTop,
              { label: getMainLbl('TR', 'B'), col: mColB, row: mRowB },
            ].sort((a, b) => a.col - b.col);

            const bottomAll: CP[] = [
              { label: getMainLbl('BL', 'D'), col: mColD, row: mRowD },
              ...customOnBottom,
              { label: getMainLbl('BR', 'C'), col: mColC, row: mRowC },
            ].sort((a, b) => a.col - b.col);

            const leftAll: CP[] = [
              { label: getMainLbl('TL', 'A'), col: mColA, row: mRowA },
              ...customOnLeft,
              { label: getMainLbl('BL', 'D'), col: mColD, row: mRowD },
            ].sort((a, b) => a.row - b.row);

            const rightAll: CP[] = [
              { label: getMainLbl('TR', 'B'), col: mColB, row: mRowB },
              ...customOnRight,
              { label: getMainLbl('BR', 'C'), col: mColC, row: mRowC },
            ].sort((a, b) => a.row - b.row);

            const dimLines: React.ReactNode[] = [];
            const DIM_OFF_INNER = 10;
            const DIM_OFF_OUTER = 34;
            const LEVEL_STEP = 22; // vertical gap between dimension line levels
            const fmtDist = (blocks: number) => {
              const mm = blocks * blockLengthMm;
              return `${(mm / 1000).toFixed(3)}m`;
            };

            // Draw a single horizontal dimension line
            const hDimLine = (x1: number, x2: number, y: number, lbl: string, key: string) => {
              const mx = (x1 + x2) / 2;
              const tw = Math.max(50, lbl.length * 6 + 10);
              dimLines.push(
                <g key={key}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="#2563eb" strokeWidth={1} />
                  <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} stroke="#2563eb" strokeWidth={1.5} />
                  <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} stroke="#2563eb" strokeWidth={1.5} />
                  <rect x={mx - tw / 2} y={y - 8} width={tw} height={14} rx={3} fill="#2563eb" opacity={0.9} />
                  <text x={mx} y={y + 2} textAnchor="middle" fontSize={8} fontWeight="bold" fill="white">{lbl}</text>
                </g>
              );
            };

            // Draw a single vertical dimension line
            const vDimLine = (y1: number, y2: number, x: number, lbl: string, key: string) => {
              const my = (y1 + y2) / 2;
              const tw = Math.max(50, lbl.length * 6 + 10);
              dimLines.push(
                <g key={key}>
                  <line x1={x} y1={y1} x2={x} y2={y2} stroke="#2563eb" strokeWidth={1} />
                  <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} stroke="#2563eb" strokeWidth={1.5} />
                  <line x1={x - 5} y1={y2} x2={x + 5} y2={y2} stroke="#2563eb" strokeWidth={1.5} />
                  <rect x={x - tw / 2} y={my - 7} width={tw} height={14} rx={3} fill="#2563eb" opacity={0.9} />
                  <text x={x} y={my + 3} textAnchor="middle" fontSize={8} fontWeight="bold" fill="white">{lbl}</text>
                </g>
              );
            };

            // Multi-level horizontal dimensions
            // direction: -1 = upward (top side), +1 = downward (bottom side)
            const hDimsMulti = (pts: CP[], baseY: number, prefix: string, dir: number) => {
              if (pts.length < 2) return;
              // X position: match arrow rendering logic.
              // Main corners at exclusive maxCol → right edge of last col = (maxCol-1)*CS
              // side='right' → arrow targets right edge of block → col*CS
              // others → arrow targets left edge of block → (col-1)*CS
              const getX = (p: CP) => {
                if (p.col === mColB || p.col === mColC) return COL_HEADER_W + (p.col - 1) * CS;
                if (p.side === 'right') return COL_HEADER_W + p.col * CS;
                return COL_HEADER_W + (p.col - 1) * CS;
              };
              if (pts.length >= 3) {
                // Level 0 (furthest from grid): full span
                const y0 = baseY + dir * LEVEL_STEP;
                const first = pts[0], last = pts[pts.length - 1];
                const x1 = getX(first), x2 = getX(last);
                const blocks = Math.round(Math.abs(x2 - x1) / CS);
                if (blocks > 0) hDimLine(Math.min(x1, x2), Math.max(x1, x2), y0, fmtDist(blocks), `${prefix}-full`);
                // Level 1 (closer to grid): consecutive segments
                for (let i = 0; i < pts.length - 1; i++) {
                  const xa = getX(pts[i]), xb = getX(pts[i + 1]);
                  const b = Math.round(Math.abs(xb - xa) / CS);
                  if (b > 0) hDimLine(Math.min(xa, xb), Math.max(xa, xb), baseY, fmtDist(b), `${prefix}-seg-${i}`);
                }
              } else {
                const x1 = getX(pts[0]), x2 = getX(pts[1]);
                const blocks = Math.round(Math.abs(x2 - x1) / CS);
                if (blocks > 0) hDimLine(Math.min(x1, x2), Math.max(x1, x2), baseY, fmtDist(blocks), `${prefix}-0`);
              }
            };

            // Multi-level vertical dimensions
            const vDimsMulti = (pts: CP[], baseX: number, prefix: string, dir: number) => {
              if (pts.length < 2) return;
              // Y position: match arrow rendering logic.
              const getY = (p: CP) => {
                if (p.row === mRowD || p.row === mRowC) return ROW_HEADER_H + (p.row - 1) * CS;
                if (p.side === 'bottom') return ROW_HEADER_H + p.row * CS;
                return ROW_HEADER_H + (p.row - 1) * CS;
              };
              if (pts.length >= 3) {
                const x0 = baseX + dir * LEVEL_STEP;
                const first = pts[0], last = pts[pts.length - 1];
                const y1 = getY(first), y2 = getY(last);
                const blocks = Math.round(Math.abs(y2 - y1) / CS);
                if (blocks > 0) vDimLine(Math.min(y1, y2), Math.max(y1, y2), x0, fmtDist(blocks), `${prefix}-full`);
                for (let i = 0; i < pts.length - 1; i++) {
                  const ya = getY(pts[i]), yb = getY(pts[i + 1]);
                  const b = Math.round(Math.abs(yb - ya) / CS);
                  if (b > 0) vDimLine(Math.min(ya, yb), Math.max(ya, yb), baseX, fmtDist(b), `${prefix}-seg-${i}`);
                }
              } else {
                const y1 = getY(pts[0]), y2 = getY(pts[1]);
                const blocks = Math.round(Math.abs(y2 - y1) / CS);
                if (blocks > 0) vDimLine(Math.min(y1, y2), Math.max(y1, y2), baseX, fmtDist(blocks), `${prefix}-0`);
              }
            };

            hDimsMulti(topAll, ROW_HEADER_H + (minRow - 1) * CS - DIM_OFF_OUTER, 'dt', -1);
            hDimsMulti(bottomAll, ROW_HEADER_H + (maxRow - 1) * CS + CS + DIM_OFF_OUTER, 'db', 1);
            vDimsMulti(leftAll, COL_HEADER_W + (minCol - 1) * CS - DIM_OFF_OUTER, 'dl', -1);
            vDimsMulti(rightAll, COL_HEADER_W + (maxCol - 1) * CS + CS + DIM_OFF_OUTER, 'dr', 1);

            return (
              <svg className="absolute inset-0 pointer-events-none" style={{
                width: COL_HEADER_W + totalCols * CS + 200,
                height: ROW_HEADER_H + totalRows * CS + 120,
                zIndex: 28,
                overflow: 'visible',
              }}>
                {dimLines}
              </svg>
            );
          })()}
        </div>
      </div>
    );
  };

  const totalM2 = currentFloorRooms.reduce((s, r) => s + r.width * r.length, 0);

  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No hay espacios definidos. Genera el plano primero.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {effectiveFloors.length >= 1 && (
          <Tabs value={currentFloorId} onValueChange={setActiveFloorId}>
            <TabsList className="h-8">
              {effectiveFloors.map(f => (
                <TabsTrigger key={f.id} value={f.id} className="text-xs h-7">{f.name}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onGroupRooms && (
            <Button
              variant={multiSelectMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                setSelectedIds(new Set());
                setSelectedEmptyCells(new Set());
                setGroupNameInput('');
              }}
              disabled={saving}
            >
              <Link className="h-4 w-4 mr-1" />
              {multiSelectMode ? 'Cancelar' : 'Agrupar'}
            </Button>
          )}
          {onUndo && undoCount > 0 && (
            <Button variant="outline" size="sm" onClick={onUndo} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-1" /> Deshacer ({undoCount})
            </Button>
          )}
          <Button
            variant={showCorners ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowCorners(!showCorners)}
            title="Mostrar/ocultar esquinas ABCD"
          >
            <MapPin className="h-4 w-4 mr-1" />
            ABCD
          </Button>
          <Button
            variant={rulerMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setRulerMode(!rulerMode); setRulerPoints([]); if (!rulerMode) setCornerClickMode(false); }}
            title="Herramienta regla: medir distancia entre dos puntos"
          >
            <Ruler className="h-4 w-4 mr-1" />
            Regla
          </Button>
          <Button
            variant={cornerClickMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setCornerClickMode(!cornerClickMode); if (!cornerClickMode) setRulerMode(false); }}
            title="Click en intersecciones de la cuadrícula para crear coordenadas automáticas"
          >
            <Plus className="h-4 w-4 mr-1" />
            Coord
          </Button>
          {onRecalculateSegments && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await onRecalculateSegments();
              }}
              disabled={saving}
              title="Recalcular segmentos de paredes compartidas"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${saving ? 'animate-spin' : ''}`} />
              Segmentos
            </Button>
          )}
          {/* Add custom corner */}
          <div className="flex items-center gap-1">
            <Input
              value={newCornerLabel}
              onChange={e => setNewCornerLabel(e.target.value)}
              placeholder="A1"
              className="w-14 h-8 text-xs"
              title="Etiqueta del marcador"
            />
            <Input
              value={newCornerCoord}
              onChange={e => setNewCornerCoord(e.target.value)}
              placeholder="1-1704"
              className="w-20 h-8 text-xs"
              title="Coordenada de la celda (ej: R18)"
            />
            <select
              value={newCornerSide}
              onChange={e => setNewCornerSide(e.target.value as any)}
              className="h-8 text-xs border rounded px-1 bg-background text-foreground"
              title="Lado donde colocar el marcador"
            >
              <option value="top">↑ Arriba</option>
              <option value="right">→ Derecha</option>
              <option value="bottom">↓ Abajo</option>
              <option value="left">← Izquierda</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!newCornerLabel.trim() || !newCornerCoord.trim()) return;
                const parsed = parseCoord(newCornerCoord.trim());
                if (!parsed) return;
                const labelWithPrefix = cornerLevelPrefix && !newCornerLabel.trim().startsWith(cornerLevelPrefix)
                  ? `${cornerLevelPrefix}${newCornerLabel.trim()}`
                  : newCornerLabel.trim();
                setCustomCorners(prev => [...prev, { label: labelWithPrefix, col: parsed.col, row: parsed.row, side: newCornerSide, floorId: currentFloorId }]);
                setNewCornerLabel('');
                setNewCornerCoord('');
              }}
              disabled={!newCornerLabel.trim() || !newCornerCoord.trim()}
              title="Añadir esquina intermedia"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {floorCorners.filter(c => !c.isMain).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => {
                // Only remove custom (non-main) corners of this floor
                setCustomCorners(prev => prev.filter(c => c.isMain || (c.floorId && c.floorId !== currentFloorId)));
              }} className="text-xs h-8 px-2">
                Borrar todas
              </Button>
            )}
          </div>
          {onShiftGrid && (
            <div className="flex items-center gap-0.5" title="Desplazar cuadrícula completa">
              <Move className="h-3.5 w-3.5 text-muted-foreground" />
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onShiftGrid(0, -1)} disabled={saving} title="Desplazar arriba">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onShiftGrid(0, 1)} disabled={saving} title="Desplazar abajo">
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onShiftGrid(-1, 0)} disabled={saving} title="Desplazar izquierda">
                <ArrowLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onShiftGrid(1, 0)} disabled={saving} title="Desplazar derecha">
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGridFullscreen(true)}
            title="Ampliar cuadrícula a pantalla completa"
          >
            <Expand className="h-4 w-4 mr-1" />
            Pantalla completa
          </Button>
        </div>
      </div>

      {/* Multi-select grouping UI */}
      {multiSelectMode && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-2">
              Selecciona espacios y/o casillas vacías en la cuadrícula. El grupo toma el nombre del espacio seleccionado (editable).
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Nombre del grupo</Label>
                <Input value={groupNameInput || autoGroupName} onChange={e => setGroupNameInput(e.target.value)}
                  placeholder="Nombre automático del espacio" className="w-48 h-8 text-sm" />
              </div>
              <Badge variant="secondary" className="text-xs h-8 flex items-center">
                {selectedIds.size} esp. + {selectedEmptyCells.size} vacías = {totalSelected} sel.
              </Badge>
              <Button size="sm" onClick={handleGroup} disabled={saving || totalSelected < 2 || !effectiveGroupName.trim()}>
                <Link className="h-4 w-4 mr-1" /> Crear grupo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups summary */}
      {currentFloorGroups.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">Grupos:</span>
          {Array.from(currentFloorGroups.entries()).map(([gid, g]) => {
            const gm2 = g.rooms.reduce((s, r) => s + r.width * r.length, 0);
            return (
              <Badge key={gid} variant="secondary" className="text-xs gap-1"
                style={{ backgroundColor: getGroupColor(gid), color: '#333' }}>
                🔗 {g.name} — {g.rooms.length} esp. — {gm2.toFixed(1)} m²
                {onUngroupRooms && (
                  <button onClick={e => { e.stopPropagation(); onUngroupRooms(gid); }} className="ml-1 hover:text-destructive" title="Desagrupar">
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Unplaced spaces header */}
      {unplacedRooms.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Espacios sin colocar — Asigna coordenada en el formulario para posicionarlos en el plano
            </p>
            <div className="flex gap-2 flex-wrap">
              {unplacedRooms.map(r => (
                <div
                  key={r.id}
                  className={`
                    px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-center
                    ${getSpaceColor(r.name)}
                    ${r.id === selectedRoomId ? 'ring-2 ring-primary shadow-md' : 'hover:shadow'}
                  `}
                  onClick={() => onSelectRoom(r.id === selectedRoomId ? null : r.id)}
                >
                  <div className="text-xs font-semibold">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.width.toFixed(1)}×{r.length.toFixed(1)}m = {(r.width * r.length).toFixed(1)}m²
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main grid */}
      <Card>
        <CardHeader className="py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {scaleMode === 'bloque'
                ? `Plano ${totalCols}×${totalRows} bloques (${(totalCols * cellSizeM).toFixed(2)}×${(totalRows * cellSizeM).toFixed(2)}m)`
                : `Plano ${totalCols}×${totalRows}m (${totalCols * totalRows} m²)`}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {placedRooms.length} colocados · {totalM2.toFixed(1)} m²
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {renderGrid()}
        </CardContent>
      </Card>

      {/* Bajo cubierta: slope grids for dos aguas roof */}
      {showSlopeGrids && (() => {
        // Ridge runs along Y axis (length). Each slope = half the building width.
        const halfWidthM = (planWidth + 2 * roofOverhang) / 2;
        const slopeRatio = roofSlopePercent / 100;
        const riseM = halfWidthM * slopeRatio; // height of ridge above wall top
        const slopeLengthM = Math.sqrt(halfWidthM * halfWidthM + riseM * riseM);
        const slopeCols = Math.max(1, Math.ceil((planLength + 2 * roofOverhang) / cellSizeM)); // along length
        const slopeRows = Math.max(1, Math.ceil(slopeLengthM / cellSizeM));
        const sCS = Math.min(CELL_SIZE, 36); // slightly smaller cells for slope grids

        const renderSlopeGrid = (slopeName: string, slopeIdx: number) => {
          const sLevelPrefix = levelPrefix ? `${levelPrefix}` : '2';
          const slopeLabel = slopeIdx === 0 ? 'Faldón izquierdo (↗)' : 'Faldón derecho (↘)';
          return (
            <Card key={`slope-${slopeIdx}`}>
              <CardHeader className="py-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ 
                      background: slopeIdx === 0 
                        ? 'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.1))' 
                        : 'linear-gradient(225deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.1))'
                    }} />
                    {slopeLabel}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {slopeLengthM.toFixed(2)}m × {((planLength + 2 * roofOverhang)).toFixed(2)}m · pendiente {roofSlopePercent}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                <div className="overflow-auto border rounded-lg bg-muted/20">
                  <div
                    className="relative"
                    style={{
                      width: COL_HEADER_W + slopeCols * sCS + 1,
                      height: ROW_HEADER_H + slopeRows * sCS + 1,
                    }}
                  >
                    {/* Column headers */}
                    {Array.from({ length: slopeCols }, (_, ci) => (
                      <div
                        key={`sch-${slopeIdx}-${ci}`}
                        className="absolute text-[7px] font-bold text-muted-foreground text-center leading-none"
                        style={{
                          left: COL_HEADER_W + ci * sCS,
                          top: 2,
                          width: sCS,
                          height: ROW_HEADER_H - 4,
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                        }}
                      >
                        {colToLabel(ci + 1, sLevelPrefix)}
                      </div>
                    ))}
                    {/* Row headers */}
                    {Array.from({ length: slopeRows }, (_, ri) => {
                      // Show height at this row (distance from eave to ridge)
                      const heightAtRow = slopeIdx === 0 
                        ? riseM * (slopeRows - ri) / slopeRows 
                        : riseM * (slopeRows - ri) / slopeRows;
                      return (
                        <div
                          key={`srh-${slopeIdx}-${ri}`}
                          className="absolute text-[7px] font-bold text-muted-foreground text-right leading-none"
                          style={{
                            left: 2, top: ROW_HEADER_H + ri * sCS, width: COL_HEADER_W - 6, height: sCS,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                          }}
                        >
                          {rowToLabel(ri + 1, sLevelPrefix)}
                        </div>
                      );
                    })}
                    {/* Grid lines */}
                    {Array.from({ length: slopeCols + 1 }, (_, ci) => (
                      <div key={`svl-${slopeIdx}-${ci}`} className="absolute bg-muted-foreground/10"
                        style={{ left: COL_HEADER_W + ci * sCS, top: ROW_HEADER_H, width: 1, height: slopeRows * sCS }} />
                    ))}
                    {Array.from({ length: slopeRows + 1 }, (_, ri) => (
                      <div key={`shl-${slopeIdx}-${ri}`} className="absolute bg-muted-foreground/10"
                        style={{ left: COL_HEADER_W, top: ROW_HEADER_H + ri * sCS, width: slopeCols * sCS, height: 1 }} />
                    ))}
                    {/* Ridge line indicator (top row) */}
                    <div className="absolute" style={{
                      left: COL_HEADER_W,
                      top: ROW_HEADER_H,
                      width: slopeCols * sCS,
                      height: 2,
                      background: 'hsl(var(--destructive))',
                      opacity: 0.5,
                    }} />
                    <div className="absolute text-[7px] font-bold" style={{
                      left: COL_HEADER_W + slopeCols * sCS + 4,
                      top: ROW_HEADER_H - 6,
                      color: 'hsl(var(--destructive))',
                      whiteSpace: 'nowrap',
                    }}>
                      Cumbrera (+{riseM.toFixed(2)}m)
                    </div>
                    {/* Eave line indicator (bottom row) */}
                    <div className="absolute" style={{
                      left: COL_HEADER_W,
                      top: ROW_HEADER_H + slopeRows * sCS - 1,
                      width: slopeCols * sCS,
                      height: 2,
                      background: 'hsl(var(--primary))',
                      opacity: 0.3,
                    }} />
                    <div className="absolute text-[7px]" style={{
                      left: COL_HEADER_W + slopeCols * sCS + 4,
                      top: ROW_HEADER_H + slopeRows * sCS - 8,
                      color: 'hsl(var(--muted-foreground))',
                      whiteSpace: 'nowrap',
                    }}>
                      Alero
                    </div>
                    {/* Slope angle visualization - diagonal line */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ 
                      width: COL_HEADER_W + slopeCols * sCS + 1, 
                      height: ROW_HEADER_H + slopeRows * sCS + 1,
                      zIndex: 5 
                    }}>
                      {/* Slope angle indicator on the left side */}
                      <line
                        x1={COL_HEADER_W}
                        y1={ROW_HEADER_H}
                        x2={COL_HEADER_W}
                        y2={ROW_HEADER_H + slopeRows * sCS}
                        stroke="hsl(var(--primary) / 0.2)"
                        strokeWidth={1}
                        strokeDasharray="4 2"
                      />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        };

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                🏠 Bajo cubierta — Tejado a dos aguas
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Cumbrera: +{riseM.toFixed(2)}m sobre muro · Pendiente: {roofSlopePercent}% · Vuelo: {roofOverhang}m
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderSlopeGrid('left', 0)}
              {renderSlopeGrid('right', 1)}
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-muted-foreground">
        Cada celda = {scaleMode === 'bloque' ? `${blockLengthMm}×${blockLengthMm}mm (1 bloque)` : '1 m²'}. Coordenadas: formato compacto {levelPrefix || '1'}-CCRR (ej: {levelPrefix || '1'}-1704 = col 17, fila 4) o con barra {formatCoord(5, 4, levelPrefix)}. Clic en un espacio para editar.
      </p>

      {/* Fullscreen overlay via portal — bigger cells */}
      {gridFullscreen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
          {/* Toolbar — never printed */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
            <span className="text-sm font-medium">{budgetName || 'Cuadrícula'} — {currentFloorName}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintOrientation(prev => prev === 'landscape' ? 'portrait' : 'landscape')}
                title={printOrientation === 'landscape' ? 'Cambiar a vertical' : 'Cambiar a horizontal'}
              >
                <RotateCw className="h-4 w-4 mr-1" />
                {printOrientation === 'landscape' ? 'Horizontal' : 'Vertical'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPrinting}
                onClick={async () => {
                  if (!printGridRef.current) return;
                  setIsPrinting(true);
                  try {
                    const canvas = await html2canvas(printGridRef.current, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                      backgroundColor: '#ffffff',
                    });
                    const isLandscape = printOrientation === 'landscape';
                    const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4');
                    const pageW = pdf.internal.pageSize.getWidth() - 20; // 10mm margins
                    const pageH = pdf.internal.pageSize.getHeight() - 20;
                    // Header
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(`${budgetName || 'Plano'} — ${currentFloorName}`, 10, 12);
                    pdf.setFontSize(8);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`Escala: ${cellLabel}`, pdf.internal.pageSize.getWidth() - 10, 12, { align: 'right' });
                    // Image
                    const headerOffset = 18; // mm below header
                    const availH = pageH - headerOffset + 10;
                    const imgData = canvas.toDataURL('image/png');
                    const ratio = Math.min(pageW / canvas.width, availH / canvas.height);
                    const imgW = canvas.width * ratio;
                    const imgH = canvas.height * ratio;
                    const xPos = 10 + (pageW - imgW) / 2;
                    pdf.addImage(imgData, 'PNG', xPos, headerOffset, imgW, imgH);
                    pdf.save(`Plano_${(budgetName || 'plano').replace(/\s+/g, '_')}_${currentFloorName.replace(/\s+/g, '_')}.pdf`);
                  } catch (err) {
                    console.error('Error generating PDF:', err);
                  } finally {
                    setIsPrinting(false);
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-1" /> {isPrinting ? 'Generando...' : 'Imprimir PDF'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setGridFullscreen(false)}>
                <Shrink className="h-4 w-4 mr-1" /> Cerrar
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div ref={printGridRef} style={{ background: '#ffffff', display: 'inline-block', padding: '8px' }}>
              {(() => {
                const availW = window.innerWidth - 200;
                const availH = window.innerHeight - 160;
                const csW = Math.floor(availW / (totalCols + 8));
                const csH = Math.floor(availH / (totalRows + 6));
                const bigCS = Math.max(CELL_SIZE, Math.min(csW, csH, 120));
                return renderGrid(bigCS);
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
