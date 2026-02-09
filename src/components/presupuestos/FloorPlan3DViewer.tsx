import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

const FloorPlan3DViewerImpl = lazy(() => import('./FloorPlan3DViewerImpl').then(m => ({ default: m.FloorPlan3DViewer })));

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[500px] rounded-lg border flex items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando vista 3D…</span>
          </div>
        </div>
      }
    >
      <FloorPlan3DViewerImpl plan={plan} rooms={rooms} />
    </Suspense>
  );
}
