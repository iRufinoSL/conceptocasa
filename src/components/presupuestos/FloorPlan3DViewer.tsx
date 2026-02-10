import { useState } from 'react';
import { Loader2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  const [Impl, setImpl] = useState<React.ComponentType<FloorPlan3DViewerProps> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    setLoading(true);
    setImpl(null);
    import('./FloorPlan3DViewerImpl').then(m => {
      setImpl(() => m.FloorPlan3DViewer);
      setLoading(false);
    });
  };

  if (!Impl) {
    return (
      <div className="w-full h-[500px] rounded-lg border flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          {loading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Cargando vista 3D…</span>
            </>
          ) : (
            <>
              <Box className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pulsa el botón para generar la vista 3D</p>
              <Button onClick={handleGenerate} variant="default" size="sm">
                <Box className="h-4 w-4 mr-2" />
                Generar Vista 3D
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button onClick={handleGenerate} variant="outline" size="sm">
          <Box className="h-4 w-4 mr-2" />
          Regenerar Vista 3D
        </Button>
      </div>
      <Impl plan={plan} rooms={rooms} />
    </div>
  );
}
