import { Box } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  const totalArea = plan.width * plan.length;
  const roomCount = rooms.length;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Box className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Vista 3D — Próximamente</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            La vista 3D interactiva del plano está en desarrollo. 
            Permitirá visualizar la vivienda en 3D con paredes, puertas, ventanas y tejado,
            generados automáticamente desde los datos del plano 2D.
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <div className="text-center px-4 py-2 bg-muted rounded-lg">
              <div className="text-lg font-bold">{totalArea.toFixed(0)}m²</div>
              <div className="text-xs text-muted-foreground">Planta</div>
            </div>
            <div className="text-center px-4 py-2 bg-muted rounded-lg">
              <div className="text-lg font-bold">{roomCount}</div>
              <div className="text-xs text-muted-foreground">Estancias</div>
            </div>
            <div className="text-center px-4 py-2 bg-muted rounded-lg">
              <div className="text-lg font-bold">{plan.defaultHeight}m</div>
              <div className="text-xs text-muted-foreground">Altura</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
