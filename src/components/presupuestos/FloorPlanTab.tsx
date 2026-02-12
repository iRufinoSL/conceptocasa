import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Layout, BarChart3, RefreshCw, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { FloorPlanGridView } from './FloorPlanGridView';
import { FloorPlanSpaceForm } from './FloorPlanSpaceForm';
import { FloorPlanSummaryView } from './FloorPlanSummary';
import { deriveGridPositions, computeGridRuler } from './FloorPlanGridView';
import { calculateFloorPlanSummary } from '@/lib/floor-plan-calculations';
import type { FloorPlanData } from '@/lib/floor-plan-calculations';

interface FloorPlanTabProps {
  budgetId: string;
  isAdmin: boolean;
}

interface SpaceTypeDef {
  type: string;
  name: string;
  defaultM2: number;
  qty: number;
  m2: number;
}

interface FloorDef {
  name: string;
  level: string;
  m2: number;
  spaces: SpaceTypeDef[];
  customSpaces: Array<{ name: string; m2: number }>;
}

const DEFAULT_SPACE_TYPES: SpaceTypeDef[] = [
  { type: 'salon', name: 'Salón', defaultM2: 30, qty: 1, m2: 30 },
  { type: 'hab_peq', name: 'Hab. pequeña', defaultM2: 9, qty: 2, m2: 9 },
  { type: 'hab_med', name: 'Hab. mediana', defaultM2: 12, qty: 0, m2: 12 },
  { type: 'hab_gra', name: 'Hab. grande', defaultM2: 15, qty: 0, m2: 15 },
  { type: 'bano_peq', name: 'Baño pequeño', defaultM2: 4, qty: 1, m2: 4 },
  { type: 'bano_med', name: 'Baño mediano', defaultM2: 6, qty: 0, m2: 6 },
  { type: 'bano_gra', name: 'Baño grande', defaultM2: 9, qty: 0, m2: 9 },
  { type: 'porche', name: 'Porche', defaultM2: 10, qty: 0, m2: 10 },
];

function createDefaultFloor(name: string, level: string, m2: number): FloorDef {
  return {
    name,
    level,
    m2,
    spaces: DEFAULT_SPACE_TYPES.map(s => ({ ...s })),
    customSpaces: [],
  };
}

export function FloorPlanTab({ budgetId, isAdmin }: FloorPlanTabProps) {
  const {
    floorPlan, rooms, floors, loading, saving,
    updateRoom, updateWall, deleteRoom,
    classifyPerimeterWalls, syncToMeasurements, getPlanData, refetch,
    generateFromTemplate, deleteFloorPlan,
  } = useFloorPlan(budgetId);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState('cuadricula');
  const [activeFloorTab, setActiveFloorTab] = useState('0');

  // Wizard state
  const [planConfig, setPlanConfig] = useState({
    defaultHeight: 2.7,
    externalWallThickness: 0.30,
    internalWallThickness: 0.15,
    roofOverhang: 0.6,
    roofSlopePercent: 20,
    roofType: 'dos_aguas',
  });
  const [floorDefs, setFloorDefs] = useState<FloorDef[]>([
    createDefaultFloor('Planta 1', 'planta_1', 100),
  ]);

  const planData = getPlanData();
  const summary = useMemo(() => {
    if (!planData) return null;
    return calculateFloorPlanSummary(planData, rooms, floors);
  }, [planData, rooms, floors]);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || null;

  // Floor def handlers
  const addFloorDef = () => {
    const idx = floorDefs.length + 1;
    setFloorDefs([...floorDefs, createDefaultFloor(`Planta ${idx}`, `planta_${idx}`, 80)]);
  };

  const removeFloorDef = (idx: number) => {
    setFloorDefs(floorDefs.filter((_, i) => i !== idx));
  };

  const updateFloorDef = (idx: number, updates: Partial<FloorDef>) => {
    setFloorDefs(floorDefs.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const updateSpaceType = (floorIdx: number, spaceIdx: number, field: 'qty' | 'm2', value: number) => {
    setFloorDefs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      return { ...f, spaces: f.spaces.map((s, si) => si === spaceIdx ? { ...s, [field]: value } : s) };
    }));
  };

  const addCustomSpace = (floorIdx: number) => {
    setFloorDefs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      return { ...f, customSpaces: [...f.customSpaces, { name: 'Nuevo espacio', m2: 10 }] };
    }));
  };

  const updateCustomSpace = (floorIdx: number, csIdx: number, field: 'name' | 'm2', value: string | number) => {
    setFloorDefs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      return { ...f, customSpaces: f.customSpaces.map((cs, i) => i === csIdx ? { ...cs, [field]: value } : cs) };
    }));
  };

  const removeCustomSpace = (floorIdx: number, csIdx: number) => {
    setFloorDefs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      return { ...f, customSpaces: f.customSpaces.filter((_, i) => i !== csIdx) };
    }));
  };

  const getFloorTotalM2 = (f: FloorDef) => {
    return f.spaces.reduce((sum, s) => sum + s.m2 * s.qty, 0) + f.customSpaces.reduce((sum, cs) => sum + cs.m2, 0);
  };

  const handleGenerate = async () => {
    const defs = floorDefs.map(f => {
      const expandedSpaces: Array<{ name: string; m2: number; gridCol: number; gridRow: number }> = [];

      f.spaces.forEach(s => {
        for (let i = 0; i < s.qty; i++) {
          expandedSpaces.push({
            name: s.qty > 1 ? `${s.name} ${i + 1}` : s.name,
            m2: s.m2,
            gridCol: 0, gridRow: 0,
          });
        }
      });

      f.customSpaces.forEach(cs => {
        expandedSpaces.push({ name: cs.name, m2: cs.m2, gridCol: 0, gridRow: 0 });
      });

      // Auto-assign grid positions
      const maxRows = Math.max(2, Math.ceil(Math.sqrt(expandedSpaces.length)));
      let col = 1, row = 1;
      expandedSpaces.forEach(sp => {
        sp.gridCol = col;
        sp.gridRow = row;
        row++;
        if (row > maxRows) { row = 1; col++; }
      });

      return { name: f.name, level: f.level, spaces: expandedSpaces };
    });

    await generateFromTemplate(planConfig, defs);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Wizard Mode ──────────────────────────────────────────────
  if (!floorPlan) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layout className="h-5 w-5" /> Crear Plano — Definir Plantas y Espacios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plan properties */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Propiedades generales</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Altura (m)</Label>
                  <Input type="number" step="0.1" value={planConfig.defaultHeight}
                    onChange={e => setPlanConfig({ ...planConfig, defaultHeight: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Espesor ext. (m)</Label>
                  <Input type="number" step="0.01" value={planConfig.externalWallThickness}
                    onChange={e => setPlanConfig({ ...planConfig, externalWallThickness: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Espesor int. (m)</Label>
                  <Input type="number" step="0.01" value={planConfig.internalWallThickness}
                    onChange={e => setPlanConfig({ ...planConfig, internalWallThickness: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Tipo tejado</Label>
                  <Select value={planConfig.roofType}
                    onValueChange={v => setPlanConfig({ ...planConfig, roofType: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dos_aguas">Dos aguas</SelectItem>
                      <SelectItem value="cuatro_aguas">Cuatro aguas</SelectItem>
                      <SelectItem value="plana">Plana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Alero (m)</Label>
                  <Input type="number" step="0.1" value={planConfig.roofOverhang}
                    onChange={e => setPlanConfig({ ...planConfig, roofOverhang: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Pendiente (%)</Label>
                  <Input type="number" step="1" value={planConfig.roofSlopePercent}
                    onChange={e => setPlanConfig({ ...planConfig, roofSlopePercent: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            {/* Floors */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Plantas</h3>
                <Button variant="outline" size="sm" onClick={addFloorDef}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Añadir planta
                </Button>
              </div>
              <div className="space-y-2">
                {floorDefs.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                    <Input className="w-32 h-8 text-sm" value={f.name}
                      onChange={e => updateFloorDef(fi, { name: e.target.value })} />
                    <Input type="number" className="w-20 h-8 text-sm text-center" value={f.m2}
                      onChange={e => updateFloorDef(fi, { m2: Number(e.target.value) })} />
                    <span className="text-xs text-muted-foreground">m²</span>
                    <Badge variant={getFloorTotalM2(f) > f.m2 ? 'destructive' : 'secondary'} className="text-xs ml-auto">
                      {getFloorTotalM2(f).toFixed(0)}/{f.m2}m²
                    </Badge>
                    {floorDefs.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeFloorDef(fi)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Spaces per floor */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Espacios por planta</h3>
              <Tabs value={activeFloorTab} onValueChange={setActiveFloorTab}>
                <TabsList className="h-8">
                  {floorDefs.map((f, fi) => (
                    <TabsTrigger key={fi} value={String(fi)} className="text-xs h-7">{f.name}</TabsTrigger>
                  ))}
                </TabsList>
                {floorDefs.map((f, fi) => (
                  <TabsContent key={fi} value={String(fi)} className="mt-3">
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_70px_70px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                        <span>Tipo</span>
                        <span className="text-center">m²</span>
                        <span className="text-center">Cantidad</span>
                      </div>
                      {f.spaces.map((s, si) => (
                        <div key={si} className="grid grid-cols-[1fr_70px_70px] gap-2 items-center">
                          <span className="text-sm">{s.name}</span>
                          <Input type="number" className="h-8 text-center text-sm" value={s.m2}
                            onChange={e => updateSpaceType(fi, si, 'm2', Number(e.target.value))} />
                          <Input type="number" className="h-8 text-center text-sm" min={0} value={s.qty}
                            onChange={e => updateSpaceType(fi, si, 'qty', Math.max(0, parseInt(e.target.value) || 0))} />
                        </div>
                      ))}
                      {f.customSpaces.map((cs, ci) => (
                        <div key={`c${ci}`} className="grid grid-cols-[1fr_70px_70px] gap-2 items-center">
                          <Input className="h-8 text-sm" value={cs.name}
                            onChange={e => updateCustomSpace(fi, ci, 'name', e.target.value)} />
                          <Input type="number" className="h-8 text-center text-sm" value={cs.m2}
                            onChange={e => updateCustomSpace(fi, ci, 'm2', Number(e.target.value))} />
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mx-auto" onClick={() => removeCustomSpace(fi, ci)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => addCustomSpace(fi)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Otro espacio
                      </Button>
                    </div>

                    {getFloorTotalM2(f) > f.m2 && (
                      <p className="text-xs text-destructive mt-2">
                        ⚠ Los espacios ({getFloorTotalM2(f).toFixed(0)}m²) superan los m² de la planta ({f.m2}m²)
                      </p>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Generate */}
            <Button onClick={handleGenerate} disabled={saving} className="w-full" size="lg">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generar Plano
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Grid View Mode ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList className="h-8">
            <TabsTrigger value="cuadricula" className="text-xs h-7 px-3">
              <Layout className="h-3.5 w-3.5 mr-1" /> Cuadrícula
            </TabsTrigger>
            <TabsTrigger value="resumen" className="text-xs h-7 px-3">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Resumen m²
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={classifyPerimeterWalls} disabled={saving || rooms.length === 0}
            title="Clasificar paredes del perímetro como externas">
            <Wand2 className="h-4 w-4 mr-1" /> Auto ext.
          </Button>
          <Button variant="outline" size="sm" onClick={syncToMeasurements} disabled={saving}>
            <Save className={`h-4 w-4 mr-1 ${saving ? 'animate-spin' : ''}`} /> Sincronizar
          </Button>
          <Button variant="outline" size="sm" onClick={async () => { await refetch(); toast.success('Plano actualizado'); }} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
          </Button>
          <Button variant="destructive" size="sm" onClick={async () => {
            if (confirm('¿Eliminar el plano completo? Se perderán todos los espacios.')) {
              await deleteFloorPlan();
            }
          }} disabled={saving}>
            <Trash2 className="h-4 w-4 mr-1" /> Eliminar plano
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewTab === 'cuadricula' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <FloorPlanGridView
              rooms={rooms}
              floors={floors}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          </div>
          <div>
            {selectedRoom && planData ? (() => {
              // Compute coordinate for selected room
              const roomFloorId = selectedRoom.floorId || '_none_';
              const floorRooms = rooms.filter(r => (r.floorId || '_none_') === roomFloorId);
              const positioned = deriveGridPositions(floorRooms);
              const pos = positioned.find(p => p.room.id === selectedRoom.id);
              const coordinate = pos ? `${pos.gridCol}.${pos.gridRow}` : undefined;
              const floorObj = floors.find(f => f.id === selectedRoom.floorId);
              const floorName = floorObj?.name;

              const handleChangeCoordinate = async (targetCol: number, targetRow: number) => {
                const { colWidths, rowHeights, colAccum, rowAccum } = computeGridRuler(positioned);
                // Compute target posX as accumulated width up to targetCol
                let posX = 0;
                for (let c = 1; c < targetCol; c++) posX += (colWidths[c - 1] || selectedRoom.width);
                // Compute target posY as accumulated height up to targetRow
                let posY = 0;
                for (let r = 1; r < targetRow; r++) posY += (rowHeights[r - 1] || selectedRoom.length);
                // If there's a room at the target, swap positions
                const occupant = positioned.find(p => p.gridCol === targetCol && p.gridRow === targetRow && p.room.id !== selectedRoom.id);
                if (occupant) {
                  await updateRoom(occupant.room.id, { posX: selectedRoom.posX, posY: selectedRoom.posY });
                }
                await updateRoom(selectedRoom.id, { posX: Math.round(posX * 100) / 100, posY: Math.round(posY * 100) / 100 });
              };

              return (
                <FloorPlanSpaceForm
                  room={selectedRoom}
                  planData={planData}
                  coordinate={coordinate}
                  floorName={floorName}
                  onUpdateRoom={(data) => updateRoom(selectedRoom.id, data)}
                  onUpdateWall={(wallId, data) => updateWall(wallId, data)}
                  onChangeCoordinate={handleChangeCoordinate}
                  onDeleteRoom={() => { deleteRoom(selectedRoom.id); setSelectedRoomId(null); }}
                  saving={saving}
                />
              );
            })() : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Haz clic en un espacio de la cuadrícula para editar sus propiedades y paredes
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {viewTab === 'resumen' && planData && summary && (
        <FloorPlanSummaryView summary={summary} />
      )}
    </div>
  );
}
