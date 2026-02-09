import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Save, Layout, Box, BarChart3, Loader2, AlertTriangle, Trash2, DoorOpen } from 'lucide-react';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { calculateFloorPlanSummary, detectSharedWalls, WALL_LABELS, OPENING_PRESETS } from '@/lib/floor-plan-calculations';
import { FloorPlanCanvas2D } from './FloorPlanCanvas2D';
import { FloorPlanRoomEditor } from './FloorPlanRoomEditor';
import { FloorPlanSummaryView } from './FloorPlanSummary';
import { FloorPlan3DViewer } from './FloorPlan3DViewer';
import type { FloorPlanData } from '@/lib/floor-plan-calculations';

interface FloorPlanTabProps {
  budgetId: string;
  isAdmin: boolean;
}

export function FloorPlanTab({ budgetId, isAdmin }: FloorPlanTabProps) {
  const {
    floorPlan, rooms, loading, saving,
    createFloorPlan, updateFloorPlan,
    addRoom, updateRoom, deleteRoom,
    updateWall, addOpening, deleteOpening,
    syncToMeasurements, getPlanData,
  } = useFloorPlan(budgetId);

  const [selectedRoomId, setSelectedRoomId] = useState<string>();
  const [selectedWallKey, setSelectedWallKey] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState('plano');

  // Local form state for plan dimensions
  const [planForm, setPlanForm] = useState({
    m2: 108,
    width: 12, length: 9, defaultHeight: 2.7,
    externalWallThickness: 0.3, internalWallThickness: 0.15,
    roofOverhang: 0.6, roofSlopePercent: 20,
    roofType: 'dos_aguas' as FloorPlanData['roofType'],
  });

  // Auto-deduce sides from m2
  const handleM2Change = (m2: number) => {
    const side = Math.round(Math.sqrt(m2) * 10) / 10;
    const length = Math.round((m2 / side) * 10) / 10;
    setPlanForm(prev => ({ ...prev, m2, width: side, length }));
  };

  // Validate manual side changes vs m2
  const handleSideChange = (field: 'width' | 'length', value: number) => {
    setPlanForm(prev => {
      const other = field === 'width' ? prev.length : prev.width;
      const product = value * other;
      // If product exceeds m2, cap the value
      if (product > prev.m2 * 1.001) {
        const capped = Math.round((prev.m2 / other) * 10) / 10;
        return { ...prev, [field]: capped };
      }
      return { ...prev, [field]: value };
    });
  };

  // Sync form when floorPlan loads
  const planData = getPlanData();

  const summary = useMemo(() => {
    const pd = planData || planForm;
    return calculateFloorPlanSummary(pd as FloorPlanData, rooms);
  }, [planData, planForm, rooms]);

  const planArea = planData ? planData.width * planData.length : planForm.m2;
  const roomsAreaSum = rooms.reduce((sum, r) => sum + r.width * r.length, 0);
  const areaExceeded = roomsAreaSum > planArea * 1.001;

  const sharedWallMap = useMemo(() => detectSharedWalls(rooms), [rooms]);
  const sharedWallKeys = useMemo(() => new Set(sharedWallMap.keys()), [sharedWallMap]);

  const handleMoveRoom = useCallback((roomId: string, posX: number, posY: number) => {
    updateRoom(roomId, { posX, posY });
  }, [updateRoom]);

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
    await updateRoom(roomId, applyResize(room, wallIndex, delta));
    const wallKey = `${roomId}::${wallIndex}`;
    const neighbor = sharedWallMap.get(wallKey);
    if (neighbor) {
      const nRoom = rooms.find(r => r.id === neighbor.neighborRoomId);
      if (nRoom) {
        await updateRoom(neighbor.neighborRoomId, applyResize(nRoom, neighbor.neighborWallIndex, delta));
      }
    }
  }, [rooms, updateRoom, sharedWallMap]);

  // Handle live plan dimension changes with m2 validation
  const handlePlanWidthChange = (value: number) => {
    if (!planData) return;
    const maxForM2 = planData.width * planData.length; // current area is the limit
    const product = value * planData.length;
    if (product <= maxForM2 * 1.001 || value <= planData.width) {
      updateFloorPlan({ width: value });
    }
  };

  const handlePlanLengthChange = (value: number) => {
    if (!planData) return;
    const maxForM2 = planData.width * planData.length;
    const product = planData.width * value;
    if (product <= maxForM2 * 1.001 || value <= planData.length) {
      updateFloorPlan({ length: value });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No floor plan yet - show creation form
  if (!floorPlan) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-lg">Crear Plano de Planta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Introduce los m² de la planta y se deducirán automáticamente las dimensiones de cada lado. Puedes ajustarlas manualmente.
          </p>

          {/* M2 input */}
          <div>
            <Label className="text-xs font-semibold">Superficie planta (m²)</Label>
            <Input
              type="number"
              step="1"
              value={planForm.m2}
              onChange={e => handleM2Change(Number(e.target.value))}
              className="text-lg font-semibold"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se calculan automáticamente largo y ancho (√m² ≈ {Math.sqrt(planForm.m2).toFixed(1)}m por lado)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Largo (m)</Label>
              <Input type="number" step="0.1" value={planForm.width}
                onChange={e => handleSideChange('width', Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Ancho (m)</Label>
              <Input type="number" step="0.1" value={planForm.length}
                onChange={e => handleSideChange('length', Number(e.target.value))} />
            </div>
          </div>

          {planForm.width * planForm.length > planForm.m2 * 1.001 && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Largo × Ancho ({(planForm.width * planForm.length).toFixed(1)}m²) supera los m² definidos ({planForm.m2}m²)
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Altura estándar (m)</Label>
              <Input type="number" step="0.1" value={planForm.defaultHeight}
                onChange={e => setPlanForm({ ...planForm, defaultHeight: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Tipo tejado</Label>
              <Select value={planForm.roofType}
                onValueChange={v => setPlanForm({ ...planForm, roofType: v as any })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dos_aguas">Dos aguas</SelectItem>
                  <SelectItem value="cuatro_aguas">Cuatro aguas</SelectItem>
                  <SelectItem value="plana">Plana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Espesor pared ext. (m)</Label>
              <Input type="number" step="0.01" value={planForm.externalWallThickness}
                onChange={e => setPlanForm({ ...planForm, externalWallThickness: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Espesor pared int. (m)</Label>
              <Input type="number" step="0.01" value={planForm.internalWallThickness}
                onChange={e => setPlanForm({ ...planForm, internalWallThickness: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Alero (m)</Label>
              <Input type="number" step="0.1" value={planForm.roofOverhang}
                onChange={e => setPlanForm({ ...planForm, roofOverhang: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Pendiente tejado (%)</Label>
              <Input type="number" step="1" value={planForm.roofSlopePercent}
                onChange={e => setPlanForm({ ...planForm, roofSlopePercent: Number(e.target.value) })} />
            </div>
          </div>
          <Button onClick={() => createFloorPlan(planForm)} disabled={saving} className="w-full">
            <Layout className="h-4 w-4 mr-2" />
            Crear Plano
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={viewTab} onValueChange={setViewTab}>
           <TabsList className="h-8">
            <TabsTrigger value="plano" className="text-xs h-7 px-3">
              <Layout className="h-3.5 w-3.5 mr-1" /> Plano 2D
            </TabsTrigger>
            <TabsTrigger value="3d" className="text-xs h-7 px-3">
              <Box className="h-3.5 w-3.5 mr-1" /> Vista 3D
            </TabsTrigger>
            <TabsTrigger value="resumen" className="text-xs h-7 px-3">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Resumen m²
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Area indicator */}
          <Badge variant={areaExceeded ? 'destructive' : 'secondary'} className="text-xs">
            {areaExceeded && <AlertTriangle className="h-3 w-3 mr-1" />}
            Estancias: {roomsAreaSum.toFixed(1)}m² / {planArea.toFixed(1)}m² planta
          </Badge>
          <Button variant="outline" size="sm" onClick={syncToMeasurements} disabled={saving}>
            <RefreshCw className={`h-4 w-4 mr-1 ${saving ? 'animate-spin' : ''}`} />
            Sincronizar mediciones
          </Button>
        </div>
      </div>

      {areaExceeded && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            La suma de las estancias ({roomsAreaSum.toFixed(1)}m²) supera los m² de la planta ({planArea.toFixed(1)}m²).
            Ajusta las dimensiones de la planta o reduce el tamaño de alguna estancia.
          </span>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Canvas / Summary */}
        <div className="lg:col-span-2">
          {viewTab === 'plano' && planData && (
            <>
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
              {selectedWallKey && (() => {
                const parts = selectedWallKey.split('::');
                const roomId = parts[0];
                const wallIdx = parseInt(parts[1]);
                const room = rooms.find(r => r.id === roomId);
                if (!room) return null;
                const wall = room.walls.find(w => w.wallIndex === wallIdx);
                if (!wall) return null;
                const isShared = sharedWallKeys.has(selectedWallKey);
                const neighborInfo = sharedWallMap.get(selectedWallKey);
                const neighborRoom = neighborInfo ? rooms.find(r => r.id === neighborInfo.neighborRoomId) : null;
                return (
                  <Card className="mt-2">
                    <CardHeader className="pb-2 py-2 px-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xs">{WALL_LABELS[wallIdx]} — {room.name}</CardTitle>
                        {isShared && neighborRoom && (
                          <Badge variant="outline" className="text-[10px] h-4">Compartida con {neighborRoom.name}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-2 space-y-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Label className="text-[10px]">Tipo</Label>
                          <Select value={wall.wallType}
                            onValueChange={v => { if (!wall.id.startsWith('temp-')) updateWall(wall.id, { wallType: v as any }); }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="externa">Externa</SelectItem>
                              <SelectItem value="interna">Interna</SelectItem>
                              <SelectItem value="compartida">Compartida</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-20">
                          <Label className="text-[10px]">Espesor (m)</Label>
                          <Input type="number" step="0.01" className="h-7 text-xs"
                            value={wall.thickness || ''} placeholder="Auto"
                            onChange={e => { if (!wall.id.startsWith('temp-')) updateWall(wall.id, { thickness: Number(e.target.value) || undefined }); }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold">Aberturas ({wall.openings.length})</Label>
                        {wall.openings.map(op => (
                          <div key={op.id} className="flex items-center gap-2 text-xs bg-muted/50 p-1.5 rounded">
                            <DoorOpen className="h-3 w-3 text-muted-foreground" />
                            <span className="flex-1">
                              {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                              {' '}({op.width}×{op.height}m)
                            </span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive"
                              onClick={() => deleteOpening(op.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {!wall.id.startsWith('temp-') && (
                          <div className="flex gap-1 flex-wrap">
                            {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
                              <Button key={key} variant="outline" size="sm" className="text-[10px] h-6"
                                onClick={() => addOpening(wall.id, key, preset.width, preset.height)} disabled={saving}>
                                + {preset.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}
          {viewTab === '3d' && planData && (
            <FloorPlan3DViewer plan={planData} rooms={rooms} />
          )}
          {viewTab === 'resumen' && (
            <FloorPlanSummaryView summary={summary} />
          )}

          {/* Plan settings */}
          {planData && (
            <div className="mt-4">
              <Card>
                <CardHeader className="pb-2 py-2 px-3">
                  <CardTitle className="text-xs text-muted-foreground">
                    Planta: {(planData.width * planData.length).toFixed(1)}m² ({planData.width}×{planData.length}m) · Altura: {planData.defaultHeight}m · Tejado: {planData.roofType}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 pb-2">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Largo (m)</Label>
                      <Input type="number" step="0.1" className="h-7 text-xs"
                        defaultValue={planData.width}
                        onBlur={e => handlePlanWidthChange(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Ancho (m)</Label>
                      <Input type="number" step="0.1" className="h-7 text-xs"
                        defaultValue={planData.length}
                        onBlur={e => handlePlanLengthChange(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Altura (m)</Label>
                      <Input type="number" step="0.1" className="h-7 text-xs"
                        defaultValue={planData.defaultHeight}
                        onBlur={e => updateFloorPlan({ defaultHeight: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Pendiente (%)</Label>
                      <Input type="number" step="1" className="h-7 text-xs"
                        defaultValue={planData.roofSlopePercent}
                        onBlur={e => updateFloorPlan({ roofSlopePercent: Number(e.target.value) })} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Right: Room editor */}
        <div className="space-y-4">
          <FloorPlanRoomEditor
            rooms={rooms}
            planArea={planArea}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            onAddRoom={addRoom}
            onUpdateRoom={updateRoom}
            onDeleteRoom={deleteRoom}
            onUpdateWall={updateWall}
            onAddOpening={addOpening}
            onDeleteOpening={deleteOpening}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
