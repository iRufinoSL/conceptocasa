import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FloorPlanSummary as Summary } from '@/lib/floor-plan-calculations';

interface FloorPlanSummaryProps {
  summary: Summary;
}

function fmt(n: number, unit = 'm²'): string {
  return `${n.toFixed(2)} ${unit}`;
}

export function FloorPlanSummaryView({ summary }: FloorPlanSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Global summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Resumen General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Planta total</span>
              <p className="font-semibold text-foreground">{fmt(summary.plantaTotalM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Superficie útil</span>
              <p className="font-semibold text-primary">{fmt(summary.totalUsableM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Superficie construida</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalBuiltM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tejado</span>
              <p className="font-semibold text-foreground">{fmt(summary.roofM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Paredes externas</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalExternalWallM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Paredes internas</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalInternalWallM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Suelos útiles</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalFloorM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Techos</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalCeilingM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Base paredes ext.</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalExternalWallBaseM, 'ml')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Base paredes int.</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalInternalWallBaseM, 'ml')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Puertas</span>
              <p className="font-semibold text-foreground">{summary.totalDoors} ud</p>
            </div>
            <div>
              <span className="text-muted-foreground">Ventanas</span>
              <p className="font-semibold text-foreground">{summary.totalWindows} ud</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per room */}
      {summary.rooms.map(rc => (
        <Card key={rc.roomId}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{rc.roomName}</CardTitle>
              <Badge variant="secondary" className="text-xs">{fmt(rc.floorArea)}</Badge>
              <Badge variant="outline" className="text-xs">{rc.doorCount}P / {rc.windowCount}V</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Suelo / Techo</span>
                <span>{fmt(rc.floorArea)} / {fmt(rc.ceilingArea)}</span>
              </div>
              {rc.walls.map(w => (
                <div key={w.wallIndex} className="flex justify-between">
                  <span className="text-muted-foreground">
                    Pared {w.wallIndex} ({w.wallType})
                    {w.openings.length > 0 && (
                      <span className="ml-1 text-primary">
                        ({w.openings.map(o => `${o.count}×${o.type}`).join(', ')})
                      </span>
                    )}
                  </span>
                  <span>
                    {fmt(w.netArea)}
                    {w.openingsArea > 0 && (
                      <span className="text-muted-foreground ml-1">
                        (bruto: {fmt(w.grossArea)}, huecos: -{fmt(w.openingsArea)})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
