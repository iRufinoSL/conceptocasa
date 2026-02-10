import { Suspense, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  const [Impl, setImpl] = useState<React.ComponentType<FloorPlan3DViewerProps> | null>(null);

  useEffect(() => {
    // Dynamic import each time component mounts (key changes force remount)
    let cancelled = false;
    import('./FloorPlan3DViewerImpl').then(m => {
      if (!cancelled) setImpl(() => m.FloorPlan3DViewer);
    });
    return () => { cancelled = true; };
  }, []);

  if (!Impl) {
    return (
      <div className="w-full h-[500px] rounded-lg border flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cargando vista 3D…</span>
        </div>
      </div>
    );
  }

  return <Impl plan={plan} rooms={rooms} />;
}
