import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Save, Layout, Box, BarChart3, Loader2 } from 'lucide-react';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { calculateFloorPlanSummary } from '@/lib/floor-plan-calculations';
import { FloorPlanCanvas2D } from './FloorPlanCanvas2D';
import { FloorPlanRoomEditor } from './FloorPlanRoomEditor';
import { FloorPlanSummaryView } from './FloorPlanSummary';
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
  const [viewTab, setViewTab] = useState('plano');

  // Local form state for plan dimensions
  const [planForm, setPlanForm] = useState({
    width: 12, length: 9, defaultHeight: 2.7,
    externalWallThickness: 0.3, internalWallThickness: 0.15,
    roofOverhang: 0.6, roofSlopePercent: 20,
    roofType: 'dos_aguas' as FloorPlanData['roofType'],
  });

  // Sync form when floorPlan loads
  const planData = getPlanData();

  const summary = useMemo(() => {
    const pd = planData || planForm;
    return calculateFloorPlanSummary(pd as FloorPlanData, rooms);
  }, [planData, planForm, rooms]);

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
            Define las dimensiones generales de la planta para comenzar a diseñar las habitaciones.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Largo (m)</Label>
              <Input type="number" step="0.1" value={planForm.width}
                onChange={e => setPlanForm({ ...planForm, width: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Ancho (m)</Label>
              <Input type="number" step="0.1" value={planForm.length}
                onChange={e => setPlanForm({ ...planForm, length: Number(e.target.value) })} />
            </div>
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
      <div className="flex items-center justify-between">
        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList className="h-8">
            <TabsTrigger value="plano" className="text-xs h-7 px-3">
              <Layout className="h-3.5 w-3.5 mr-1" /> Plano 2D
            </TabsTrigger>
            <TabsTrigger value="resumen" className="text-xs h-7 px-3">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Resumen m²
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncToMeasurements} disabled={saving}>
            <RefreshCw className={`h-4 w-4 mr-1 ${saving ? 'animate-spin' : ''}`} />
            Sincronizar mediciones
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Canvas / Summary */}
        <div className="lg:col-span-2">
          {viewTab === 'plano' && planData && (
            <FloorPlanCanvas2D
              plan={planData}
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          )}
          {viewTab === 'resumen' && (
            <FloorPlanSummaryView summary={summary} />
          )}

          {/* Plan settings (collapsible) */}
          {planData && (
            <div className="mt-4">
              <Card>
                <CardHeader className="pb-2 py-2 px-3">
                  <CardTitle className="text-xs text-muted-foreground">Dimensiones planta: {planData.width}×{planData.length}m · Altura: {planData.defaultHeight}m · Tejado: {planData.roofType}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 pb-2">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Largo (m)</Label>
                      <Input type="number" step="0.1" className="h-7 text-xs"
                        defaultValue={planData.width}
                        onBlur={e => updateFloorPlan({ width: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Ancho (m)</Label>
                      <Input type="number" step="0.1" className="h-7 text-xs"
                        defaultValue={planData.length}
                        onBlur={e => updateFloorPlan({ length: Number(e.target.value) })} />
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
