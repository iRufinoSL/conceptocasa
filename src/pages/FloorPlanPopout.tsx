import { useSearchParams } from 'react-router-dom';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { FloorPlanCanvas2D } from '@/components/presupuestos/FloorPlanCanvas2D';
import { detectSharedWalls, autoClassifyWalls, computeWallSegments } from '@/lib/floor-plan-calculations';
import { useMemo, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function FloorPlanPopout() {
  const [searchParams] = useSearchParams();
  const budgetId = searchParams.get('floorplan-popout') || '';

  const {
    floorPlan, rooms, loading, saving,
    updateRoom, classifyPerimeterWalls, getPlanData,
  } = useFloorPlan(budgetId);

  const [selectedRoomId, setSelectedRoomId] = useState<string>();
  const [selectedWallKey, setSelectedWallKey] = useState<string | null>(null);

  const undoStackRef = useRef<Array<{ rooms: Array<{ id: string; posX: number; posY: number; width: number; length: number }> }>>([]);

  const pushUndo = useCallback(() => {
    const snapshot = rooms.map(r => ({ id: r.id, posX: r.posX, posY: r.posY, width: r.width, length: r.length }));
    undoStackRef.current = [...undoStackRef.current.slice(-19), { rooms: snapshot }];
  }, [rooms]);

  const planData = getPlanData();
  const sharedWallMap = useMemo(() => detectSharedWalls(rooms), [rooms]);
  const sharedWallKeys = useMemo(() => new Set(sharedWallMap.keys()), [sharedWallMap]);

  const handleMoveRoom = useCallback(async (roomId: string, posX: number, posY: number) => {
    pushUndo();
    await updateRoom(roomId, { posX, posY });
    classifyPerimeterWalls();
  }, [updateRoom, pushUndo, classifyPerimeterWalls]);

  const handleResizeWall = useCallback(async (roomId: string, wallIndex: number, delta: number) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || delta === 0) return;
    const applyResize = (r: { posX: number; posY: number; width: number; length: number }, wIdx: number, d: number) => {
      switch (wIdx) {
        case 1: return { posY: r.posY + d, length: Math.max(0.5, r.length - d) };
        case 2: return { width: Math.max(0.5, r.width + d) };
        case 3: return { length: Math.max(0.5, r.length + d) };
        case 4: return { posX: r.posX + d, width: Math.max(0.5, r.width - d) };
        default: return {};
      }
    };
    pushUndo();
    await updateRoom(roomId, applyResize(room, wallIndex, delta));
    const neighbor = sharedWallMap.get(`${roomId}::${wallIndex}`);
    if (neighbor) {
      const nRoom = rooms.find(r => r.id === neighbor.neighborRoomId);
      if (nRoom) {
        await updateRoom(neighbor.neighborRoomId, applyResize(nRoom, neighbor.neighborWallIndex, delta));
      }
    }
    classifyPerimeterWalls();
  }, [rooms, updateRoom, sharedWallMap, classifyPerimeterWalls]);

  if (!budgetId) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">No se especificó presupuesto</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!planData) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">No hay plano creado para este presupuesto</div>;
  }

  return (
    <div className="h-screen w-screen overflow-auto bg-background p-2">
      <div className="text-xs text-muted-foreground mb-1 px-2">
        Plano 2D — Ventana externa (los cambios se guardan automáticamente)
      </div>
      <FloorPlanCanvas2D
        plan={planData}
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        selectedWallKey={selectedWallKey ?? undefined}
        sharedWallKeys={sharedWallKeys}
        onSelectRoom={setSelectedRoomId}
        onSelectWall={setSelectedWallKey}
        onMoveRoom={handleMoveRoom}
        onResizeWall={handleResizeWall}
      />
    </div>
  );
}
