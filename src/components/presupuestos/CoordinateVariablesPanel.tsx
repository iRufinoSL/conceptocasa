import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { FloorPlanData, RoomData, FloorLevel } from '@/lib/floor-plan-calculations';

interface CoordinateVariablesPanelProps {
  planData: FloorPlanData;
  rooms: RoomData[];
  floors: FloorLevel[];
  onUpdatePlan: (data: Partial<FloorPlanData>) => Promise<void>;
  saving: boolean;
}

export function CoordinateVariablesPanel({ planData, rooms, floors, onUpdatePlan, saving }: CoordinateVariablesPanelProps) {
  const [originX, setOriginX] = useState('0');
  const [originY, setOriginY] = useState('0');
  const [originZ, setOriginZ] = useState('0');
  const [defaultHeightM, setDefaultHeightM] = useState(String(planData.defaultHeight || 2.6));
  const [scaleX, setScaleX] = useState(String(planData.blockLengthMm || 625));
  const [scaleY, setScaleY] = useState(String(planData.blockWidthMm || 625));
  const [scaleZ, setScaleZ] = useState(String(planData.blockHeightMm || 250));

  useEffect(() => {
    setDefaultHeightM(String(planData.defaultHeight || 2.6));
    setScaleX(String(planData.blockLengthMm || 625));
    setScaleY(String(planData.blockWidthMm || 625));
    setScaleZ(String(planData.blockHeightMm || 250));
  }, [planData]);

  // Compute grid bounds
  const placedRooms = rooms.filter(r => r.posX != null && r.posY != null);
  const gridInfo = placedRooms.length > 0 ? {
    minX: Math.min(...placedRooms.map(r => r.posX!)),
    maxX: Math.max(...placedRooms.map(r => r.posX! + r.width)),
    minY: Math.min(...placedRooms.map(r => r.posY!)),
    maxY: Math.max(...placedRooms.map(r => r.posY! + r.length)),
  } : null;

  const scaleXMm = parseFloat(scaleX) || 625;
  const scaleZMm = parseFloat(scaleZ) || 250;
  const defaultH = parseFloat(defaultHeightM) || 2.6;
  const defaultHeightBlocks = Math.round((defaultH * 1000) / scaleZMm);

  const handleSave = async () => {
    await onUpdatePlan({
      blockLengthMm: parseFloat(scaleX) || 625,
      blockWidthMm: parseFloat(scaleY) || 625,
      blockHeightMm: parseFloat(scaleZ) || 250,
      defaultHeight: parseFloat(defaultHeightM) || 2.6,
      scaleMode: 'bloque',
    });
    toast.success('Variables de coordenadas guardadas');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4" /> Variables de Coordenadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Origin */}
        <div>
          <Label className="text-xs font-semibold mb-2 block">Punto Origen de Coordenadas</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">X₀</Label>
              <Input type="number" className="h-8 text-xs" value={originX} onChange={e => setOriginX(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Y₀</Label>
              <Input type="number" className="h-8 text-xs" value={originY} onChange={e => setOriginY(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Z₀</Label>
              <Input type="number" className="h-8 text-xs" value={originZ} onChange={e => setOriginZ(e.target.value)} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Por defecto (X0, Y0, Z0). Las coordenadas pueden ser negativas.
          </p>
        </div>

        {/* Default height */}
        <div>
          <Label className="text-xs font-semibold mb-1 block">Altura promedio secciones verticales</Label>
          <div className="flex items-center gap-2">
            <Input type="number" step="0.1" min="0.5" className="h-8 text-xs w-24"
              value={defaultHeightM} onChange={e => setDefaultHeightM(e.target.value)} />
            <span className="text-xs text-muted-foreground">metros</span>
            <Badge variant="outline" className="text-[9px]">
              = {defaultHeightBlocks} bloques Z ({Math.round(defaultH * 1000)}mm)
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Por defecto 2,6m. Define la altura estándar de cada nivel.
          </p>
        </div>

        {/* Scales */}
        <div>
          <Label className="text-xs font-semibold mb-2 block">Escalas (definidas por el usuario)</Label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Escala X (mm)</Label>
              <Input type="number" step="1" min="1" className="h-8 text-xs"
                value={scaleX} onChange={e => setScaleX(e.target.value)} />
              <p className="text-[9px] text-muted-foreground">def. 625mm</p>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Escala Y (mm)</Label>
              <Input type="number" step="1" min="1" className="h-8 text-xs"
                value={scaleY} onChange={e => setScaleY(e.target.value)} />
              <p className="text-[9px] text-muted-foreground">def. 625mm</p>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Escala Z (mm)</Label>
              <Input type="number" step="1" min="1" className="h-8 text-xs"
                value={scaleZ} onChange={e => setScaleZ(e.target.value)} />
              <p className="text-[9px] text-muted-foreground">def. 250mm</p>
            </div>
          </div>
        </div>

        {/* Grid info */}
        {gridInfo && (
          <div className="border border-border rounded-lg p-2 bg-muted/20">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Extensión actual de la cuadrícula:</p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <Badge variant="outline" className="text-[9px]">
                X: {Math.round(gridInfo.minX / (scaleXMm / 1000))} → {Math.round(gridInfo.maxX / (scaleXMm / 1000))}
              </Badge>
              <Badge variant="outline" className="text-[9px]">
                Y: {Math.round(gridInfo.minY / (scaleXMm / 1000))} → {Math.round(gridInfo.maxY / (scaleXMm / 1000))}
              </Badge>
              <Badge variant="outline" className="text-[9px]">
                Niveles: {floors.length}
              </Badge>
              <Badge variant="outline" className="text-[9px]">
                Espacios: {rooms.length} ({placedRooms.length} colocados)
              </Badge>
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
          {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Guardar Variables
        </Button>
      </CardContent>
    </Card>
  );
}
