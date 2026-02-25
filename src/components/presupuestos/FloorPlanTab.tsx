import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Layout, BarChart3, RefreshCw, Save, Wand2, Settings2, Layers, Pencil, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { FloorPlanGridView } from './FloorPlanGridView';
import { FloorPlanSpaceForm } from './FloorPlanSpaceForm';
import { ArrowLeft } from 'lucide-react';
import { FloorPlanSummaryView } from './FloorPlanSummary';
import { ElevationsGridViewer } from './ElevationsGridViewer';
import { deriveGridPositions, computeGridRuler, formatCoord, parseCoord } from './FloorPlanGridView';
import { calculateFloorPlanSummary, slopePercentToDegrees, degreesToSlopePercent, calcRidgeHeight, calcSlopeFromRidge } from '@/lib/floor-plan-calculations';
import { FloorPlanPdfExport } from './FloorPlanPdfExport';
import { SnapshotRestoreButton } from './SnapshotRestoreButton';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

interface FloorPlanTabProps {
  budgetId: string;
  budgetName?: string;
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
  customSpaces: Array<{ name: string; m2: number; qty: number }>;
}

const DEFAULT_SPACE_TYPES: SpaceTypeDef[] = [
  { type: 'salon', name: 'Salón grande', defaultM2: 30, qty: 1, m2: 30 },
  { type: 'hab_peq', name: 'Hab. pequeña', defaultM2: 9, qty: 2, m2: 9 },
  { type: 'hab_med', name: 'Hab. mediana', defaultM2: 12, qty: 0, m2: 12 },
  { type: 'hab_gra', name: 'Hab. grande', defaultM2: 20, qty: 0, m2: 20 },
  { type: 'bano_peq', name: 'Baño pequeño', defaultM2: 4, qty: 1, m2: 4 },
  { type: 'bano_med', name: 'Baño mediano', defaultM2: 6, qty: 0, m2: 6 },
  { type: 'bano_gra', name: 'Baño grande', defaultM2: 8, qty: 0, m2: 8 },
  { type: 'cocina_peq', name: 'Cocina pequeña', defaultM2: 8, qty: 1, m2: 8 },
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

// Level manager panel shown after plan creation
function NewLevelWizardDialog({ open, onOpenChange, floors, onAdd, saving, onFloorCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  floors: Array<{ id: string; name: string; level: string; orderIndex: number }>;
  onAdd: (name: string, level: string, opts?: {
    copyFromFloorId?: string;
    wallHeight?: number;
    roofSlopes?: number;
    roofSlopePercent?: number;
  }) => Promise<string | undefined>;
  saving: boolean;
  onFloorCreated?: (floorId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [levelName, setLevelName] = useState('');
  const [sameFootprint, setSameFootprint] = useState<boolean | null>(null);
  const [wallHeight, setWallHeight] = useState('2.5');
  const [isRoof, setIsRoof] = useState(false);
  const [roofSlopes, setRoofSlopes] = useState('2');
  const [roofSlopePercent, setRoofSlopePercent] = useState('20');

  const reset = () => {
    setStep(0);
    setLevelName('');
    setSameFootprint(null);
    setWallHeight('2.5');
    setIsRoof(false);
    setRoofSlopes('2');
    setRoofSlopePercent('20');
  };

  useEffect(() => {
    if (open) {
      reset();
      const idx = floors.length + 1;
      setLevelName(`Nivel ${idx}`);
    }
  }, [open, floors.length]);

  // The lowest existing floor to copy from (last one by order)
  const sourceFloor = floors.length > 0 ? floors[floors.length - 1] : null;

  const handleCreate = async () => {
    const level = isRoof ? 'bajo_cubierta' : `nivel_${floors.length}`;
    const opts: any = {};
    if (sameFootprint && sourceFloor) {
      opts.copyFromFloorId = sourceFloor.id;
    }
    // For bajo cubierta, wall height is 0 (walls follow slope)
    opts.wallHeight = isRoof ? 0 : (parseFloat(wallHeight) || 2.5);
    if (isRoof) {
      opts.roofSlopes = parseInt(roofSlopes) || 2;
      // Convert degrees to percentage for storage
      const deg = parseFloat(roofSlopePercent) || 20;
      opts.roofSlopePercent = Math.round(degreesToSlopePercent(deg) * 10) / 10;
    }
    const newFloorId = await onAdd(levelName.trim(), level, opts);
    if (newFloorId) {
      onFloorCreated?.(newFloorId);
    }
    onOpenChange(false);
  };

  const totalSteps = isRoof ? 5 : 3;
  const canNext = () => {
    if (step === 0) return levelName.trim().length > 0;
    if (step === 1) return sameFootprint !== null;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Nuevo Nivel — Paso {step + 1}/{totalSteps}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <div className="space-y-2">
              <Label>Nombre del nivel</Label>
              <Input value={levelName} onChange={e => setLevelName(e.target.value)} placeholder="Ej: Nivel 2, Bajo cubierta" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label>¿Ocupa la misma planta que el nivel inferior ({sourceFloor?.name || 'Nivel 1'})?</Label>
              <div className="flex gap-3">
                <Button variant={sameFootprint === true ? 'default' : 'outline'} className="flex-1"
                  onClick={() => setSameFootprint(true)}>
                  Sí — Copiar perímetro
                </Button>
                <Button variant={sameFootprint === false ? 'default' : 'outline'} className="flex-1"
                  onClick={() => setSameFootprint(false)}>
                  No — Definir manualmente
                </Button>
              </div>
              {sameFootprint === true && (
                <p className="text-xs text-muted-foreground">Se copiarán todos los espacios y muros del nivel inferior.</p>
              )}
              {sameFootprint === false && (
                <p className="text-xs text-muted-foreground">Deberás definir cada espacio y sus dimensiones después de crear el nivel.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label>Altura de las paredes externas (m)</Label>
              <Input type="number" step="0.1" min="0.5" value={wallHeight} onChange={e => setWallHeight(e.target.value)} />
              <div className="flex items-center gap-2 pt-2">
                <Checkbox id="is-roof" checked={isRoof} onCheckedChange={(v) => setIsRoof(v === true)} />
                <Label htmlFor="is-roof" className="text-sm cursor-pointer">Es un nivel bajo cubierta (tejado)</Label>
              </div>
            </div>
          )}

          {step === 3 && isRoof && (
            <div className="space-y-3">
              <Label>¿Cuántos faldones tendrá el tejado?</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: '0', label: '0 — Cubierta plana' },
                  { val: '2', label: '2 — Dos aguas' },
                  { val: '4', label: '4 — Cuatro aguas' },
                ].map(opt => (
                  <Button key={opt.val} variant={roofSlopes === opt.val ? 'default' : 'outline'}
                    className="text-xs h-auto py-2 px-2" onClick={() => setRoofSlopes(opt.val)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && isRoof && (
            <div className="space-y-3">
              <Label>Definir la cubierta por:</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  variant={roofSlopePercent !== '' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setRoofSlopePercent('20')}
                >
                  Pendiente (º)
                </Button>
                <Button
                  variant={roofSlopePercent === '' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setRoofSlopePercent('')}
                >
                  Altura libre (m)
                </Button>
              </div>
              {roofSlopePercent !== '' ? (
                <>
                  <Label>Pendiente del tejado (º)</Label>
                  <Input type="number" step="0.5" min="0" max="89" value={roofSlopePercent}
                    onChange={e => setRoofSlopePercent(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Ej: 15º = pendiente suave, 30º = pendiente pronunciada.
                    = {(Math.round(degreesToSlopePercent(parseFloat(roofSlopePercent) || 0) * 10) / 10)}%
                  </p>
                </>
              ) : (
                <>
                  <Label>Altura libre base→cumbre (m)</Label>
                  <Input type="number" step="0.1" min="0.5"
                    placeholder="Ej: 3.5"
                    onChange={e => {
                      // Will be converted to slope after creation
                      const h = parseFloat(e.target.value);
                      if (!isNaN(h) && h > 0) {
                        // Approximate with plan width (will recalc after rooms placed)
                        setRoofSlopePercent(String(Math.round(slopePercentToDegrees(h / 5 * 100) * 10) / 10));
                      }
                    }} />
                  <p className="text-xs text-muted-foreground">
                    La pendiente se calculará automáticamente según el ancho del edificio.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)}>← Anterior</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < totalSteps - 1 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Siguiente →
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving || !canNext()}>
                {saving ? 'Creando...' : 'Crear nivel'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LevelManagerPanel({ floors, onAdd, onUpdate, onDelete, saving, onClose, onFloorCreated }: {
  floors: Array<{ id: string; name: string; level: string; orderIndex: number }>;
  onAdd: (name: string, level: string, opts?: any) => Promise<string | undefined>;
  onUpdate: (floorId: string, data: { name?: string }) => Promise<void>;
  onDelete: (floorId: string) => Promise<void>;
  saving: boolean;
  onClose: () => void;
  onFloorCreated?: (floorId: string) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    await onUpdate(editId, { name: editName.trim() });
    setEditId(null);
    setEditName('');
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" /> Gestionar Niveles
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-xs">Cerrar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Existing levels */}
        {floors.map(f => (
          <div key={f.id} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
            {editId === f.id ? (
              <>
                <Input className="h-8 text-sm flex-1" value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} />
                <Button size="sm" className="h-8" onClick={handleSaveEdit} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditId(null)}>✕</Button>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="text-xs">{f.orderIndex}</Badge>
                <span className="text-sm font-medium flex-1">{f.name}</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => { setEditId(f.id); setEditName(f.name); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`¿Eliminar el nivel "${f.name}"? Los espacios asignados quedarán sin nivel.`)) {
                      onDelete(f.id);
                    }
                  }} disabled={saving}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
        {/* Add new level button */}
        <Button size="sm" className="w-full" onClick={() => setShowWizard(true)} disabled={saving}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Añadir nivel
        </Button>
        <NewLevelWizardDialog
          open={showWizard}
          onOpenChange={setShowWizard}
          floors={floors}
          onAdd={onAdd}
          saving={saving}
          onFloorCreated={onFloorCreated}
        />
      </CardContent>
    </Card>
  );
}

function FloorPlanSettingsPanel({ planData, onUpdate, rooms, floors, onUpdateRoom, onUpdateWall, onClassifyWalls, saving, onClose }: {
  planData: FloorPlanData;
  onUpdate: (data: Partial<FloorPlanData>) => Promise<void>;
  rooms: RoomData[];
  floors: Array<{ id: string; name: string; level: string; orderIndex: number }>;
  onUpdateRoom: (roomId: string, data: any) => Promise<void>;
  onUpdateWall: (wallId: string, data: any) => Promise<void>;
  onClassifyWalls: () => Promise<void>;
  saving: boolean;
  onClose: () => void;
}) {
  const [height, setHeight] = useState(String(planData.defaultHeight));
  const [extThick, setExtThick] = useState(String(planData.externalWallThickness));
  const [intThick, setIntThick] = useState(String(planData.internalWallThickness));
  const [roofType, setRoofType] = useState<string>(planData.roofType || 'dos_aguas');
  const [overhang, setOverhang] = useState(String(planData.roofOverhang));
  const [slope, setSlope] = useState(String(planData.roofSlopePercent));
  const [slopeDeg, setSlopeDeg] = useState(String(Math.round(slopePercentToDegrees(planData.roofSlopePercent) * 10) / 10));
  const [ridgeHeight, setRidgeHeight] = useState(String(planData.ridgeHeight || ''));
  const [roofEditMode, setRoofEditMode] = useState<'degrees' | 'height'>(planData.ridgeHeight ? 'height' : 'degrees');
  const [scaleMode, setScaleMode] = useState<string>(planData.scaleMode || 'metros');
  const [blockLenMm, setBlockLenMm] = useState(String(planData.blockLengthMm || 625));
  const [blockHMm, setBlockHMm] = useState(String(planData.blockHeightMm || 250));
  const [blockWMm, setBlockWMm] = useState(String(planData.blockWidthMm || 300));

  // Compute building half-width for ridge height calculations
  const buildingHalfWidth = useMemo(() => {
    const placedRooms = rooms.filter(r => r.posX >= 0 && r.posY >= 0);
    if (placedRooms.length === 0) return planData.width / 2;
    const minX = Math.min(...placedRooms.map(r => r.posX));
    const maxX = Math.max(...placedRooms.map(r => r.posX + r.width));
    return ((maxX - minX) + 2 * planData.externalWallThickness) / 2 + (parseFloat(overhang) || planData.roofOverhang);
  }, [rooms, planData, overhang]);

  // Auto-calc ridge height when slope changes
  const handleSlopeDegreesChange = (val: string) => {
    setSlopeDeg(val);
    const deg = parseFloat(val);
    if (!isNaN(deg) && deg >= 0) {
      const pct = degreesToSlopePercent(deg);
      setSlope(String(Math.round(pct * 10) / 10));
      setRidgeHeight(String(Math.round(calcRidgeHeight(pct, buildingHalfWidth) * 1000) / 1000));
    }
  };

  // Auto-calc slope when ridge height changes
  const handleRidgeHeightChange = (val: string) => {
    setRidgeHeight(val);
    const rh = parseFloat(val);
    if (!isNaN(rh) && rh > 0 && buildingHalfWidth > 0) {
      const pct = calcSlopeFromRidge(rh, buildingHalfWidth);
      setSlope(String(Math.round(pct * 10) / 10));
      setSlopeDeg(String(Math.round(slopePercentToDegrees(pct) * 10) / 10));
    }
  };

  const hasChanges =
    parseFloat(height) !== planData.defaultHeight ||
    parseFloat(extThick) !== planData.externalWallThickness ||
    parseFloat(intThick) !== planData.internalWallThickness ||
    roofType !== (planData.roofType || 'dos_aguas') ||
    parseFloat(overhang) !== planData.roofOverhang ||
    parseFloat(slope) !== planData.roofSlopePercent ||
    scaleMode !== (planData.scaleMode || 'metros') ||
    parseFloat(blockLenMm) !== (planData.blockLengthMm || 625) ||
    parseFloat(blockHMm) !== (planData.blockHeightMm || 250) ||
    parseFloat(blockWMm) !== (planData.blockWidthMm || 300) ||
    (ridgeHeight !== '' && parseFloat(ridgeHeight) !== (planData.ridgeHeight || 0));

  // Per-level height overrides
  const [levelHeights, setLevelHeights] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    floors.forEach(f => {
      const floorRooms = rooms.filter(r => r.floorId === f.id);
      const firstHeight = floorRooms[0]?.height;
      map[f.id] = firstHeight !== undefined ? String(firstHeight) : '';
    });
    return map;
  });

  const scaleUpdate = {
    scaleMode: scaleMode as any,
    blockLengthMm: parseFloat(blockLenMm) || 625,
    blockHeightMm: parseFloat(blockHMm) || 250,
    blockWidthMm: parseFloat(blockWMm) || 300,
  };

  const handleSave = async () => {
    const updates: Partial<FloorPlanData> = {
      defaultHeight: parseFloat(height) || planData.defaultHeight,
      externalWallThickness: parseFloat(extThick) || planData.externalWallThickness,
      internalWallThickness: parseFloat(intThick) || planData.internalWallThickness,
      roofType: roofType as any,
      roofOverhang: parseFloat(overhang) || planData.roofOverhang,
      roofSlopePercent: parseFloat(slope) || planData.roofSlopePercent,
      ridgeHeight: ridgeHeight ? parseFloat(ridgeHeight) : undefined,
      ...scaleUpdate,
    };
    // When in block mode, auto-set ext wall thickness from block width
    if (scaleMode === 'bloque') {
      updates.externalWallThickness = (parseFloat(blockWMm) || 300) / 1000;
    }
    await onUpdate(updates);
    toast.success('Parámetros actualizados');
  };

  // Apply defaults to ALL rooms: height, wall thickness, and re-classify walls
  const handleApplyAll = async () => {
    const newHeight = parseFloat(height) || planData.defaultHeight;
    const newExtThick = parseFloat(extThick) || planData.externalWallThickness;
    const newIntThick = parseFloat(intThick) || planData.internalWallThickness;

    // Save plan-level defaults first
    const extThickness = scaleMode === 'bloque' ? (parseFloat(blockWMm) || 300) / 1000 : newExtThick;
    await onUpdate({
      defaultHeight: newHeight,
      externalWallThickness: extThickness,
      internalWallThickness: newIntThick,
      roofType: roofType as any,
      roofOverhang: parseFloat(overhang) || planData.roofOverhang,
      roofSlopePercent: parseFloat(slope) || planData.roofSlopePercent,
      ridgeHeight: ridgeHeight ? parseFloat(ridgeHeight) : undefined,
      ...scaleUpdate,
    });

    // Apply per-level heights
    for (const floor of floors) {
      const levelH = levelHeights[floor.id];
      const floorRooms = rooms.filter(r => r.floorId === floor.id);
      if (levelH !== undefined && levelH !== '') {
        const h = parseFloat(levelH);
        for (const room of floorRooms) {
          if (room.height !== h) {
            await onUpdateRoom(room.id, { height: h });
          }
        }
      } else {
        // Clear per-room height overrides → use plan default
        for (const room of floorRooms) {
          if (room.height !== undefined) {
            await onUpdateRoom(room.id, { height: null });
          }
        }
      }
    }

    // Update wall thicknesses
    for (const room of rooms) {
      for (const wall of room.walls) {
        if (wall.id.startsWith('temp-')) continue;
        const isExt = wall.wallType.startsWith('exterior');
        const targetThickness = isExt ? newExtThick : newIntThick;
        if (wall.thickness !== undefined && wall.thickness !== targetThickness) {
          await onUpdateWall(wall.id, { thickness: targetThickness });
        }
      }
    }

    // Re-classify walls (fixes bajo cubierta external walls issue)
    await onClassifyWalls();

    toast.success('Todos los parámetros actualizados en todos los espacios');
  };

  // Check if level is bajo cubierta (height 0 or very small)
  const isBajoCubierta = (floorId: string) => {
    const h = levelHeights[floorId];
    return h !== undefined && h !== '' && parseFloat(h) === 0;
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Parámetros generales del plano
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-xs">Cerrar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan-wide defaults */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Valores por defecto</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Altura espacios (m)</Label>
              <Input type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)} disabled={saving} />
            </div>
            <div>
              <Label className="text-xs">Espesor ext. (m)</Label>
              <Input type="number" step="0.01" value={extThick} onChange={e => setExtThick(e.target.value)} disabled={saving} />
            </div>
            <div>
              <Label className="text-xs">Espesor int. (m)</Label>
              <Input type="number" step="0.01" value={intThick} onChange={e => setIntThick(e.target.value)} disabled={saving} />
            </div>
            <div>
              <Label className="text-xs">Tipo tejado</Label>
              <Select value={roofType} onValueChange={setRoofType}>
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
              <Input type="number" step="0.1" value={overhang} onChange={e => setOverhang(e.target.value)} disabled={saving} />
            </div>
          </div>

          {/* Roof slope / ridge height dual editor */}
          {roofType !== 'plana' && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <h5 className="text-xs font-semibold">Definir cubierta por:</h5>
                <div className="flex gap-1">
                  <Button
                    variant={roofEditMode === 'degrees' ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setRoofEditMode('degrees')}
                  >
                    Pendiente (º)
                  </Button>
                  <Button
                    variant={roofEditMode === 'height' ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setRoofEditMode('height')}
                  >
                    Altura libre (m)
                  </Button>
                </div>
              </div>

              {roofEditMode === 'degrees' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Pendiente (º)</Label>
                    <Input type="number" step="0.5" min="0" max="89" value={slopeDeg}
                      onChange={e => handleSlopeDegreesChange(e.target.value)} disabled={saving} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">= Pendiente (%)</Label>
                    <Input type="number" value={slope} disabled className="bg-muted/50" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Altura libre base→cumbre (m)</Label>
                    <Input type="number" step="0.01" min="0" value={ridgeHeight}
                      onChange={e => handleRidgeHeightChange(e.target.value)} disabled={saving}
                      placeholder="Ej: 3.5" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">= Pendiente (º)</Label>
                    <Input type="number" value={slopeDeg} disabled className="bg-muted/50" />
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                {ridgeHeight ? `Altura cumbre: ${ridgeHeight}m` : ''} · Pendiente: {slopeDeg}º ({slope}%) · Semi-ancho: {buildingHalfWidth.toFixed(3)}m
              </p>
            </div>
          )}
        </div>

        {/* Scale / Block configuration */}
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Escala de trabajo</h4>
          <div className="flex gap-2 mb-3">
            <Button
              variant={scaleMode === 'metros' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setScaleMode('metros')}
            >
              Metros (1m)
            </Button>
            <Button
              variant={scaleMode === 'bloque' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setScaleMode('bloque')}
            >
              Bloque625
            </Button>
          </div>
          {scaleMode === 'bloque' && (
            <div className="space-y-2 p-2 border rounded-lg bg-muted/30">
              <p className="text-[10px] text-muted-foreground mb-2">
                Dimensiones del bloque. Largo×Alto×Ancho (espesor pared).
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px]">Largo (mm)</Label>
                  <Input type="number" step="1" value={blockLenMm} onChange={e => setBlockLenMm(e.target.value)} disabled={saving} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Alto (mm)</Label>
                  <Input type="number" step="1" value={blockHMm} onChange={e => setBlockHMm(e.target.value)} disabled={saving} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Ancho (mm)</Label>
                  <Input type="number" step="1" value={blockWMm} onChange={e => setBlockWMm(e.target.value)} disabled={saving} className="h-8 text-xs" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Bloque {blockLenMm}×{blockHMm}×{blockWMm} mm → Espesor ext. = {blockWMm} mm ({(parseFloat(blockWMm) / 1000).toFixed(3)} m)
              </p>
              <p className="text-[10px] text-muted-foreground">
                Ej: 6 bloques ancho = {((parseFloat(blockLenMm) || 625) * 6 / 1000).toFixed(3)} m · 10 bloques alto = {((parseFloat(blockHMm) || 250) * 10 / 1000).toFixed(3)} m
              </p>
            </div>
          )}
        </div>

        {floors.length > 0 && (
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Altura por nivel</h4>
            <div className="space-y-2">
              {floors.map(f => {
                const floorRooms = rooms.filter(r => r.floorId === f.id);
                const roomCount = floorRooms.length;
                const hasFloorRooms = floorRooms.some(r => r.hasFloor);
                return (
                  <div key={f.id} className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <span className="text-sm font-medium">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{roomCount} espacios</span>
                      {isBajoCubierta(f.id) && (
                        <Badge variant="outline" className="ml-2 text-[9px] h-4">Bajo cubierta</Badge>
                      )}
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={levelHeights[f.id] || ''}
                        placeholder={height || '2.5'}
                        onChange={e => setLevelHeights(prev => ({ ...prev, [f.id]: e.target.value }))}
                        disabled={saving}
                        className="h-8 text-sm text-center"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6">m</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Altura 0m = bajo cubierta (solo hastiales como paredes externas). Vacío = usa valor por defecto.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="flex-1" size="sm" variant="outline">
            <Save className="h-4 w-4 mr-1" /> Guardar parámetros
          </Button>
          <Button onClick={handleApplyAll} disabled={saving} className="flex-1" size="sm">
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar todo
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          «Guardar parámetros» guarda solo los valores por defecto. «Actualizar todo» aplica las alturas, espesores y reclasifica las paredes de todos los espacios.
        </p>
      </CardContent>
    </Card>
  );
}

export function FloorPlanTab({ budgetId, budgetName = '', isAdmin }: FloorPlanTabProps) {
  const {
    floorPlan, rooms, floors, customCorners, updateCustomCorners, loading, saving,
    addRoom, updateRoom, updateWall, updateWallSegmentType, deleteRoom, duplicateRoom,
    addOpening, updateOpening, deleteOpening, updateFloorPlan,
    classifyPerimeterWalls, syncToMeasurements, getPlanData, refetch,
    generateFromTemplate, deleteFloorPlan, groupRooms, ungroupRooms,
    undoLastChange, undoCount,
    addFloor, updateFloor, deleteFloor,
    addBlockGroup, deleteBlockGroup, updateBlockGroup,
  } = useFloorPlan(budgetId);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState('cuadricula');
  const [elevationReturnContext, setElevationReturnContext] = useState<{ roomId: string; wallId: string } | null>(null);
  const [activeFloorTab, setActiveFloorTab] = useState('0');
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceWidth, setNewSpaceWidth] = useState(4);
  const [newSpaceLength, setNewSpaceLength] = useState(3);
  const [newSpaceFloorId, setNewSpaceFloorId] = useState<string>('');
  const [newSpaceCoord, setNewSpaceCoord] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showLevelManager, setShowLevelManager] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editingFloorName, setEditingFloorName] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeFloorName, setActiveFloorName] = useState('Nivel 1');
  const [activeGridFloorId, setActiveGridFloorId] = useState<string | undefined>(undefined);
  const [forceActiveFloorId, setForceActiveFloorId] = useState<string | undefined>(undefined);
  const handleActiveFloorChange = useCallback((name: string, floorId?: string) => {
    setActiveFloorName(name);
    if (floorId) setActiveGridFloorId(floorId);
  }, []);

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
    createDefaultFloor('Nivel 1', 'nivel_1', 100),
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
    setFloorDefs([...floorDefs, createDefaultFloor(`Nivel ${idx}`, `nivel_${idx}`, 80)]);
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
      return { ...f, customSpaces: [...f.customSpaces, { name: 'Nuevo espacio', m2: 10, qty: 1 }] };
    }));
  };

  const updateCustomSpace = (floorIdx: number, csIdx: number, field: 'name' | 'm2' | 'qty', value: string | number) => {
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
    return f.spaces.reduce((sum, s) => sum + s.m2 * s.qty, 0) + f.customSpaces.reduce((sum, cs) => sum + cs.m2 * (cs.qty || 1), 0);
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
        for (let i = 0; i < (cs.qty || 1); i++) {
          expandedSpaces.push({
            name: cs.qty > 1 ? `${cs.name} ${i + 1}` : cs.name,
            m2: cs.m2,
            gridCol: 0, gridRow: 0,
          });
        }
      });

      // All spaces start unplaced (gridCol=0, gridRow=0) → they appear in the staging header
      return { name: f.name, level: f.level, m2: f.m2, spaces: expandedSpaces };
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
              <Layout className="h-5 w-5" /> Crear Plano — Definir Niveles y Espacios
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
                <h3 className="text-sm font-semibold">Niveles</h3>
                <Button variant="outline" size="sm" onClick={addFloorDef}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Añadir nivel
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
              <h3 className="text-sm font-semibold mb-2">Espacios por nivel</h3>
              <Tabs value={activeFloorTab} onValueChange={setActiveFloorTab}>
                <TabsList className="h-8">
                  {floorDefs.map((f, fi) => (
                    <TabsTrigger key={fi} value={String(fi)} className="text-xs h-7">{f.name}</TabsTrigger>
                  ))}
                </TabsList>
                {floorDefs.map((f, fi) => (
                  <TabsContent key={fi} value={String(fi)} className="mt-3">
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_70px_70px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                        <span>Tipo</span>
                        <span className="text-center">m²</span>
                        <span className="text-center">Cant.</span>
                        <span></span>
                      </div>
                      {f.spaces.map((s, si) => (
                        <div key={si} className="grid grid-cols-[1fr_70px_70px_32px] gap-2 items-center">
                          <span className="text-sm">{s.name}</span>
                          <Input type="number" className="h-8 text-center text-sm" value={s.m2}
                            onChange={e => updateSpaceType(fi, si, 'm2', Number(e.target.value))} />
                          <Input type="number" className="h-8 text-center text-sm" min={0} value={s.qty}
                            onChange={e => updateSpaceType(fi, si, 'qty', Math.max(0, parseInt(e.target.value) || 0))} />
                          <span></span>
                        </div>
                      ))}
                      {f.customSpaces.map((cs, ci) => (
                        <div key={`c${ci}`} className="grid grid-cols-[1fr_70px_70px_32px] gap-2 items-center">
                          <Input className="h-8 text-sm" value={cs.name}
                            onChange={e => updateCustomSpace(fi, ci, 'name', e.target.value)} />
                          <Input type="number" className="h-8 text-center text-sm" value={cs.m2}
                            onChange={e => updateCustomSpace(fi, ci, 'm2', Number(e.target.value))} />
                          <Input type="number" className="h-8 text-center text-sm" min={1} value={cs.qty}
                            onChange={e => updateCustomSpace(fi, ci, 'qty', Math.max(1, parseInt(e.target.value) || 1))} />
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeCustomSpace(fi, ci)}>
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
                        ⚠ Los espacios ({getFloorTotalM2(f).toFixed(0)}m²) superan los m² del nivel ({f.m2}m²)
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
        <div className="flex items-center gap-2">
          {elevationReturnContext && viewTab === 'alzados' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedRoomId(elevationReturnContext.roomId);
                setViewTab('cuadricula');
                setElevationReturnContext(null);
              }}
              className="gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al espacio
            </Button>
          )}
          <Tabs value={viewTab} onValueChange={(v) => {
            setViewTab(v);
            if (v !== 'alzados') setElevationReturnContext(null);
          }}>
            <TabsList className="h-8">
              <TabsTrigger value="cuadricula" className="text-xs h-7 px-3">
                <Layout className="h-3.5 w-3.5 mr-1" /> Cuadrícula
              </TabsTrigger>
              <TabsTrigger value="alzados" className="text-xs h-7 px-3">
                <Layers className="h-3.5 w-3.5 mr-1" /> Alzados
              </TabsTrigger>
              <TabsTrigger value="resumen" className="text-xs h-7 px-3">
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Resumen m²
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {planData && (
            <Badge variant="outline" className="text-xs font-mono h-7 flex items-center gap-1">
              📐 {planData.scaleMode === 'bloque' ? `Bloque ${planData.blockLengthMm}×${planData.blockHeightMm}mm` : 'Metros (1m)'}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={showLevelManager ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setShowLevelManager(!showLevelManager); if (showSettings) setShowSettings(false); }}
          >
            <Layers className="h-4 w-4 mr-1" /> Niveles
          </Button>
          <Button
            variant={showSettings ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setShowSettings(!showSettings); if (showLevelManager) setShowLevelManager(false); }}
          >
            <Settings2 className="h-4 w-4 mr-1" /> Parámetros
          </Button>
          <Button variant="outline" size="sm" onClick={classifyPerimeterWalls} disabled={saving || rooms.length === 0}
            title="Clasificar paredes del perímetro como externas">
            <Wand2 className="h-4 w-4 mr-1" /> Auto ext.
          </Button>
          <FloorPlanPdfExport
            budgetName={budgetName}
            floorName={activeFloorName}
            containerRef={gridRef}
          />
          <Button variant="outline" size="sm" onClick={syncToMeasurements} disabled={saving}>
            <Save className={`h-4 w-4 mr-1 ${saving ? 'animate-spin' : ''}`} /> Sincronizar
          </Button>
          <SnapshotRestoreButton budgetId={budgetId} module="plano" onRestored={() => refetch()} />
          <Button variant="outline" size="sm" onClick={async () => { await refetch(); toast.success('Plano actualizado'); }} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
          </Button>
          <Button variant="destructive" size="sm" onClick={async () => {
            if (floors.length > 1) {
              const floorToDelete = floors.find(f => f.id === activeGridFloorId) || floors[floors.length - 1];
              if (floorToDelete && confirm(`¿Eliminar el nivel "${floorToDelete.name}" y sus espacios? Los demás niveles se mantendrán.`)) {
                const floorRooms = rooms.filter(r => r.floorId === floorToDelete.id);
                for (const r of floorRooms) {
                  await deleteRoom(r.id);
                }
                await deleteFloor(floorToDelete.id);
                toast.success(`Nivel "${floorToDelete.name}" eliminado`);
              }
            } else {
              if (confirm('¿Eliminar el plano completo? Se perderán todos los espacios.')) {
                await deleteFloorPlan();
              }
            }
          }} disabled={saving}>
            <Trash2 className="h-4 w-4 mr-1" /> {floors.length > 1 ? 'Eliminar nivel' : 'Eliminar plano'}
          </Button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && planData && (
        <FloorPlanSettingsPanel
          planData={planData}
          onUpdate={updateFloorPlan}
          rooms={rooms}
          floors={floors}
          onUpdateRoom={updateRoom}
          onUpdateWall={updateWall}
          onClassifyWalls={classifyPerimeterWalls}
          saving={saving}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Level manager panel */}
      {showLevelManager && (
        <LevelManagerPanel
          floors={floors}
          onAdd={addFloor}
          onUpdate={updateFloor}
          onDelete={deleteFloor}
          saving={saving}
          onClose={() => setShowLevelManager(false)}
          onFloorCreated={(floorId) => setForceActiveFloorId(floorId)}
        />
      )}

      {/* Content */}
      {viewTab === 'cuadricula' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <FloorPlanGridView
              rooms={rooms}
              floors={floors}
              planWidth={planData?.width || 12}
              planLength={planData?.length || 9}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
              onAddRoom={addRoom}
              onGroupRooms={groupRooms}
              onUngroupRooms={ungroupRooms}
              onUndo={undoLastChange}
              undoCount={undoCount}
              saving={saving}
              gridRef={gridRef}
              onActiveFloorChange={handleActiveFloorChange}
              forceActiveFloorId={forceActiveFloorId}
              scaleMode={planData?.scaleMode}
              blockLengthMm={planData?.blockLengthMm}
              budgetName={budgetName}
              customCorners={customCorners}
              onCustomCornersChange={updateCustomCorners}
              roofType={planData?.roofType}
              roofSlopePercent={planData?.roofSlopePercent}
              roofOverhang={planData?.roofOverhang}
              defaultHeight={planData?.defaultHeight}
              onRecalculateSegments={async () => {
                await classifyPerimeterWalls();
                await refetch();
                toast.success('Segmentos recalculados');
              }}
            />
          </div>
          <div className="space-y-4">
            {selectedRoom && planData ? (() => {
              // Compute coordinate for selected room
              const cellSizeM = planData.scaleMode === 'bloque' ? planData.blockLengthMm / 1000 : 1;
              const isUnplaced = selectedRoom.posX < 0 || selectedRoom.posY < 0;
              const coordCol = isUnplaced ? undefined : Math.round(selectedRoom.posX / cellSizeM) + 1;
              const coordRow = isUnplaced ? undefined : Math.round(selectedRoom.posY / cellSizeM) + 1;
              const floorObj = floors.find(f => f.id === selectedRoom.floorId);
              const floorName = floorObj?.name;

              const handleChangeCoordinate = async (targetCol: number, targetRow: number) => {
                const posX = (targetCol - 1) * cellSizeM;
                const posY = (targetRow - 1) * cellSizeM;
                await updateRoom(selectedRoom.id, { posX: Math.round(posX * 1000) / 1000, posY: Math.round(posY * 1000) / 1000 });
                toast.success(`${selectedRoom.name} movido a ${formatCoord(targetCol, targetRow)}`);
              };

              return (
                <FloorPlanSpaceForm
                  room={selectedRoom}
                  allRooms={rooms}
                  planData={planData}
                  coordCol={coordCol}
                  coordRow={coordRow}
                  floorName={floorName}
                  onUpdateRoom={(data) => updateRoom(selectedRoom.id, data)}
                  onUpdateWall={(wallId, data) => updateWall(wallId, data)}
                  onUpdateWallSegmentType={(wallId, segIdx, segType) => updateWallSegmentType(wallId, segIdx, segType)}
                  onAddOpening={(wallId, type, w, h, sh, px) => addOpening(wallId, type, w, h, sh, px)}
                  onDeleteOpening={(openingId) => deleteOpening(openingId)}
                  onDuplicateRoom={async (direction) => {
                    const newId = await duplicateRoom(selectedRoom.id, direction, true);
                    if (newId) setSelectedRoomId(newId);
                  }}
                  onChangeCoordinate={handleChangeCoordinate}
                  onUngroupRoom={selectedRoom.groupId ? () => ungroupRooms(selectedRoom.groupId!) : undefined}
                  onDeleteRoom={() => { deleteRoom(selectedRoom.id); setSelectedRoomId(null); }}
                  onNavigateToElevation={(wallId, _wallIndex) => {
                    setElevationReturnContext({ roomId: selectedRoom.id, wallId });
                    setViewTab('alzados');
                  }}
                  saving={saving}
                />
              );
            })() : null}

            {/* Add new space section - always visible */}
            <Card>
              <CardContent className="py-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Añadir espacio
                </h4>
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    value={newSpaceName}
                    onChange={e => setNewSpaceName(e.target.value)}
                    placeholder="Ej: Habitación 3"
                    disabled={saving}
                  />
                </div>
                {floors.length > 0 && (
                  <div>
                    <Label className="text-xs">Nivel</Label>
                    <Select value={newSpaceFloorId || activeGridFloorId || floors[0]?.id || ''} onValueChange={setNewSpaceFloorId}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {floors.map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Coordenada inicio (ej: 01/01, A1)</Label>
                  <input
                    type="text"
                    value={newSpaceCoord}
                    onChange={e => setNewSpaceCoord(e.target.value.toUpperCase())}
                    placeholder="01/01"
                    disabled={saving}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-[10px] text-muted-foreground">Esquina superior-izquierda del espacio. Dejar vacío para crear sin colocar.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{planData?.scaleMode === 'bloque' ? `Ancho (bloques ${planData.blockLengthMm}mm)` : 'Ancho (m)'}</Label>
                    <Input type="number" step={planData?.scaleMode === 'bloque' ? '1' : '0.1'} value={newSpaceWidth}
                      onChange={e => setNewSpaceWidth(Number(e.target.value))} disabled={saving} />
                    {planData?.scaleMode === 'bloque' && (
                      <span className="text-[10px] text-muted-foreground">= {(newSpaceWidth * (planData.blockLengthMm || 625) / 1000).toFixed(3)} m</span>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">{planData?.scaleMode === 'bloque' ? `Largo (bloques ${planData.blockLengthMm}mm)` : 'Largo (m)'}</Label>
                    <Input type="number" step={planData?.scaleMode === 'bloque' ? '1' : '0.1'} value={newSpaceLength}
                      onChange={e => setNewSpaceLength(Number(e.target.value))} disabled={saving} />
                    {planData?.scaleMode === 'bloque' && (
                      <span className="text-[10px] text-muted-foreground">= {(newSpaceLength * (planData.blockLengthMm || 625) / 1000).toFixed(3)} m</span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Presets: Hab.peq 3×3 · Hab.med 4×3 · Hab.gra 5×4 · Baño.peq 2×2 · Cocina 4×2 · Salón 6×5
                </p>
                <Button
                  onClick={async () => {
                    if (!newSpaceName.trim()) { toast.error('Indica un nombre'); return; }
                    const targetFloor = newSpaceFloorId || activeGridFloorId || floors[0]?.id;
                    const w = planData?.scaleMode === 'bloque' ? newSpaceWidth * (planData.blockLengthMm || 625) / 1000 : newSpaceWidth;
                    const l = planData?.scaleMode === 'bloque' ? newSpaceLength * (planData.blockLengthMm || 625) / 1000 : newSpaceLength;
                    const parsedC = newSpaceCoord.trim() ? parseCoord(newSpaceCoord.trim()) : null;
                    const gridCol = parsedC?.col;
                    const gridRow = parsedC?.row;
                    await addRoom(newSpaceName.trim(), w, l, targetFloor, gridCol, gridRow);
                    setNewSpaceName('');
                    setNewSpaceCoord('');
                    if (gridCol && gridRow) {
                      toast.success(`Espacio "${newSpaceName.trim()}" creado en coordenada ${formatCoord(gridCol, gridRow)}`);
                    } else {
                      toast.success('Espacio añadido a la cabecera (sin colocar)');
                    }
                  }}
                  disabled={saving || !newSpaceName.trim()}
                  size="sm"
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" /> {newSpaceCoord.trim() ? 'Crear y colocar' : 'Crear en cabecera'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {viewTab === 'alzados' && planData && (
        <ElevationsGridViewer
          plan={planData}
          rooms={rooms}
          floors={floors}
          onUpdateOpening={updateOpening}
          onAddOpening={(wallId, type, w, h, sh) => addOpening(wallId, type, w, h, sh)}
          onDeleteOpening={deleteOpening}
          onUpdateWall={updateWall}
          onUpdateWallSegmentType={updateWallSegmentType}
          onAddBlockGroup={addBlockGroup}
          onDeleteBlockGroup={deleteBlockGroup}
          onUpdateBlockGroup={updateBlockGroup}
          saving={saving}
          focusWallId={elevationReturnContext?.wallId}
          budgetName={budgetName}
          customCorners={customCorners}
        />
      )}

      {viewTab === 'resumen' && planData && summary && (
        <FloorPlanSummaryView
          summary={summary}
          onRecalculate={async () => {
            await classifyPerimeterWalls();
            await refetch();
          }}
          recalculating={saving}
        />
      )}
    </div>
  );
}
