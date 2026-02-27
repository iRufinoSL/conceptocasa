import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FloorPlanData, RoomData, calculateRoofSlopes, RoofSlopeDetail } from '@/lib/floor-plan-calculations';
import { Box } from 'lucide-react';

interface FloorPlanVolumesViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  floors: { id: string; name: string; level: string; orderIndex: number }[];
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function SlopeCard({ slope }: { slope: RoofSlopeDetail }) {
  return (
    <Card className="border">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{slope.name} ({slope.side === 'superior' ? 'Faldón superior' : 'Faldón inferior'})</span>
          <Badge variant={slope.includesEaves ? 'default' : 'secondary'} className="text-xs">
            {slope.includesEaves ? 'Con aleros' : 'Sin aleros'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base (largo):</span>
            <span className="font-mono font-medium">{fmt(slope.baseLength)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proyección (ancho):</span>
            <span className="font-mono font-medium">{fmt(slope.projectedWidth)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Altura cumbrera:</span>
            <span className="font-mono font-medium">{fmt(slope.ridgeHeight)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hipotenusa:</span>
            <span className="font-mono font-medium">{fmt(slope.hypotenuse)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Superficie proyectada:</span>
            <span className="font-mono font-medium">{fmt(slope.projectedArea)} m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-semibold">Superficie real:</span>
            <span className="font-mono font-bold text-primary">{fmt(slope.slopeArea)} m²</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FloorPlanVolumesView({ plan, rooms, floors }: FloorPlanVolumesViewProps) {
  const slopes = calculateRoofSlopes(plan, rooms);
  const totalRoofArea = slopes.reduce((sum, s) => sum + s.slopeArea, 0);

  // Find the "Tejado" / roof floor
  const roofFloor = floors.find(f => f.level === 'bajo_cubierta' || f.name.toLowerCase().includes('tejado') || f.name.toLowerCase().includes('cubierta'));

  return (
    <div className="space-y-4">
      {/* Nivel 2 - Cubierta */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Box className="h-4 w-4" />
            {roofFloor ? roofFloor.name : 'Nivel 2 – Cubierta'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {slopes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cubierta inclinada configurada (tipo: {plan.roofType}).</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {slopes.map((slope, i) => (
                  <SlopeCard key={i} slope={slope} />
                ))}
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm font-medium">
                <span>Total superficie tejado (real):</span>
                <span className="font-mono text-lg font-bold text-primary">{fmt(totalRoofArea)} m²</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
