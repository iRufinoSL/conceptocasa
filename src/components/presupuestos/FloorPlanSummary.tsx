import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, RefreshCw } from 'lucide-react';
import type { FloorPlanSummary as Summary, WallCalculation } from '@/lib/floor-plan-calculations';
import { OPENING_PRESETS, isInvisibleType } from '@/lib/floor-plan-calculations';

interface FloorPlanSummaryProps {
  summary: Summary;
  onRecalculate?: () => void;
  recalculating?: boolean;
}

function fmt(n: number, unit = 'm²'): string {
  return `${n.toFixed(2)} ${unit}`;
}

function SummaryGrid({ label, data }: { label: string; data: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {data.map(d => (
            <div key={d.label}>
              <span className="text-muted-foreground">{d.label}</span>
              <p className={`font-semibold ${d.color || 'text-foreground'}`}>{d.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FloorPlanSummaryView({ summary, onRecalculate, recalculating }: FloorPlanSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Recalculate button */}
      {onRecalculate && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onRecalculate} disabled={recalculating}>
            <RefreshCw className={`h-4 w-4 mr-1 ${recalculating ? 'animate-spin' : ''}`} />
            Recalcular segmentos
          </Button>
        </div>
      )}
      {/* Global summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Resumen General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Huella en planta</span>
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
              <span className="text-muted-foreground">Suelos útiles</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalFloorM2)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Techos</span>
              <p className="font-semibold text-foreground">{fmt(summary.totalCeilingM2)}</p>
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

          {/* Gable info */}
          {(summary.totalGableExternalM2 > 0 || summary.totalGableInternalM2 > 0) && (
            <div className="mt-3 pt-3 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground mb-2 block">Hastiales (triángulos bajo cubierta)</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {summary.totalGableExternalM2 > 0 && (
                  <div>
                    <span className="text-muted-foreground">Hastiales ext.</span>
                    <p className="font-semibold text-foreground">{fmt(summary.totalGableExternalM2)}</p>
                  </div>
                )}
                {summary.totalGableInternalM2 > 0 && (
                  <div>
                    <span className="text-muted-foreground">Hastiales int.</span>
                    <p className="font-semibold text-foreground">{fmt(summary.totalGableInternalM2)}</p>
                  </div>
                )}
                {summary.gables.map((g, i) => (
                  <div key={i}>
                    <span className="text-muted-foreground">
                      {g.side === 'front' ? 'Hastial frontal' : 'Hastial trasero'}
                    </span>
                    <p className="font-semibold text-foreground">
                      {fmt(g.triangleArea)} (h={g.peakHeight.toFixed(2)}m)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opening breakdown */}
          {Object.keys(summary.openingsByType).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground mb-2 block">Desglose por tipo</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {Object.entries(summary.openingsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
                    <span className="text-xs text-muted-foreground">
                      {OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4">{count} ud</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* External walls breakdown */}
      <SummaryGrid
        label="Paredes Externas"
        data={[
          { label: 'Total bruto', value: fmt(summary.totalExternalWallGrossM2) },
          { label: 'Huecos', value: `-${fmt(summary.totalExternalWallOpeningsM2)}`, color: 'text-destructive' },
          { label: 'Superficie neta', value: fmt(summary.totalExternalWallM2), color: 'text-primary' },
          { label: 'Base (ml)', value: fmt(summary.totalExternalWallBaseM, 'ml') },
        ]}
      />

      {/* Internal walls breakdown */}
      <SummaryGrid
        label="Paredes Internas"
        data={[
          { label: 'Total bruto', value: fmt(summary.totalInternalWallGrossM2) },
          { label: 'Huecos', value: `-${fmt(summary.totalInternalWallOpeningsM2)}`, color: 'text-destructive' },
          { label: 'Superficie neta', value: fmt(summary.totalInternalWallM2), color: 'text-primary' },
          { label: 'Base (ml)', value: fmt(summary.totalInternalWallBaseM, 'ml') },
        ]}
      />

      {/* Per-floor summaries */}
      {summary.floorSummaries.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Resumen por Nivel</h3>
          {summary.floorSummaries.map(fs => (
            <Collapsible key={fs.floorId} defaultOpen={true}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-sm font-semibold">{fs.floorName}</span>
                <Badge variant="outline" className="text-[10px] h-4">{fs.rooms.length} espacios</Badge>
                <Badge variant="secondary" className="text-[10px] h-4">{fmt(fs.totalUsableM2)}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="mt-1">
                  <CardContent className="pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Superficie útil</span>
                        <p className="font-semibold text-primary">{fmt(fs.totalUsableM2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Paredes ext.</span>
                        <p className="font-semibold text-foreground">{fmt(fs.totalExternalWallM2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Paredes int.</span>
                        <p className="font-semibold text-foreground">{fmt(fs.totalInternalWallM2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Suelos</span>
                        <p className="font-semibold text-foreground">{fmt(fs.totalFloorM2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Techos</span>
                        <p className="font-semibold text-foreground">{fmt(fs.totalCeilingM2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Puertas / Ventanas</span>
                        <p className="font-semibold text-foreground">{fs.totalDoors}P / {fs.totalWindows}V</p>
                      </div>
                      {(fs.gableExternalM2 > 0 || fs.gableInternalM2 > 0) && (
                        <div>
                          <span className="text-muted-foreground">Hastiales</span>
                          <p className="font-semibold text-foreground">
                            {fmt(fs.gableExternalM2 + fs.gableInternalM2)}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Per room */}
      {summary.rooms.map((rc) => (
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
              <span className="font-semibold text-muted-foreground">8 elementos de la estancia:</span>
              {rc.walls.map(w => {
                const WALL_NAMES: Record<number, string> = { 1: 'Pared Superior', 2: 'Pared Derecha', 3: 'Pared Inferior', 4: 'Pared Izquierda' };
                const hasMultipleSegments = w.segments && w.segments.length > 1;
                
                if (hasMultipleSegments) {
                  return w.segments!.map((seg, si) => (
                    <div key={`${w.wallIndex}-${si}`} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {WALL_NAMES[w.wallIndex]} ({w.wallIndex}{si + 1})
                        {' '}({seg.segmentType})
                        {seg.neighborRoomName && (
                          <span className="ml-1 text-accent-foreground text-[10px]">↔ {seg.neighborRoomName}</span>
                        )}
                      </span>
                      <span>
                        {isInvisibleType(seg.segmentType)
                          ? <span className="text-muted-foreground italic">0.00 m² (invisible)</span>
                          : fmt(seg.netArea)}
                        {seg.openingsArea > 0 && !isInvisibleType(seg.segmentType) && (
                          <span className="text-muted-foreground ml-1">
                            (bruto: {fmt(seg.grossArea)}, huecos: -{fmt(seg.openingsArea)})
                          </span>
                        )}
                      </span>
                    </div>
                  ));
                }
                
                return (
                  <div key={w.wallIndex} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {WALL_NAMES[w.wallIndex]} ({w.wallIndex})
                      {' '}({w.wallType})
                      {w.openings.length > 0 && (
                        <span className="ml-1 text-primary">
                          ({w.openings.map(o => `${o.count}×${OPENING_PRESETS[o.type as keyof typeof OPENING_PRESETS]?.label || o.type}`).join(', ')})
                        </span>
                      )}
                    </span>
                    <span>
                      {w.wallType.endsWith('_invisible') ? <span className="text-muted-foreground italic">0.00 m² (invisible)</span> : fmt(w.netArea)}
                      {w.openingsArea > 0 && !w.wallType.endsWith('_invisible') && (
                        <span className="text-muted-foreground ml-1">
                          (bruto: {fmt(w.grossArea)}, huecos: -{fmt(w.openingsArea)})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              {/* Gable areas */}
              {(rc.gableExternalArea > 0 || rc.gableInternalArea > 0) && (
                <div className="flex justify-between text-primary">
                  <span>Hastial (bajo cubierta)</span>
                  <span>{fmt(rc.gableExternalArea + rc.gableInternalArea)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">5. Suelo</span>
                <span>{rc.hasFloor !== false ? fmt(rc.floorArea) : <span className="italic text-muted-foreground">Sin suelo</span>}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">6. Techo</span>
                <span>{rc.hasCeiling !== false ? fmt(rc.ceilingArea) : <span className="italic text-muted-foreground">Sin techo</span>}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">7. Tejado</span>
                <span>{rc.hasRoof !== false ? <span className="text-primary">Sí</span> : <span className="italic text-muted-foreground">Sin tejado</span>}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">8. Espacio</span>
                <span>{fmt(rc.floorArea)} (volumen: {fmt(rc.floorArea * (rc.roomHeight || 2.7), 'm³')})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}