import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cloneBudget, cloneContentToExistingBudget } from '@/lib/clone-budget';
import { toast } from 'sonner';
import { Copy, Loader2, FileText, Files, Plus } from 'lucide-react';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string | null;
}

interface CloneBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBudgetId?: string;
  onCloneSuccess: (newBudgetId: string) => void;
}

type CloneMode = 'template' | 'complete';
type CloneTarget = 'new' | 'existing';

export function CloneBudgetDialog({ 
  open, 
  onOpenChange, 
  currentBudgetId,
  onCloneSuccess 
}: CloneBudgetDialogProps) {
  const [budgets, setBudgets] = useState<Presupuesto[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneMode, setCloneMode] = useState<CloneMode>('template');
  const [cloneTarget, setCloneTarget] = useState<CloneTarget>('new');
  const [targetBudgetId, setTargetBudgetId] = useState<string>('');
  
  // Form for new budget data
  const [form, setForm] = useState({
    nombre: "",
    version: "",
    poblacion: "",
    provincia: "",
  });

  // Fetch available budgets to clone from
  useEffect(() => {
    if (open) {
      fetchBudgets();
      // Reset state when opening
      setCloneTarget('new');
      setTargetBudgetId('');
    }
  }, [open]);

  // Auto-fill form when budget is selected (only for new budget target)
  useEffect(() => {
    if (selectedBudgetId && cloneTarget === 'new') {
      const selected = budgets.find(b => b.id === selectedBudgetId);
      if (selected) {
        setForm({
          nombre: `${selected.nombre} (copia)`,
          version: selected.version,
          poblacion: selected.poblacion,
          provincia: selected.provincia || "",
        });
      }
    }
  }, [selectedBudgetId, budgets, cloneTarget]);

  const fetchBudgets = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version, poblacion, provincia')
        .order('nombre');
      
      // Only exclude currentBudgetId if provided
      if (currentBudgetId) {
        query = query.neq('id', currentBudgetId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBudgets(data || []);
    } catch (err) {
      console.error('Error fetching budgets:', err);
      toast.error('Error al cargar presupuestos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClone = async () => {
    if (!selectedBudgetId) {
      toast.error('Selecciona un presupuesto para clonar');
      return;
    }

    if (cloneTarget === 'existing') {
      if (!targetBudgetId) {
        toast.error('Selecciona el presupuesto destino');
        return;
      }
      if (targetBudgetId === selectedBudgetId) {
        toast.error('El presupuesto origen y destino no pueden ser el mismo');
        return;
      }
    } else {
      if (!form.nombre.trim()) {
        toast.error('El nombre es obligatorio');
        return;
      }
      if (!form.poblacion.trim()) {
        toast.error('La población es obligatoria');
        return;
      }
    }

    setIsCloning(true);
    try {
      let result;
      
      if (cloneTarget === 'existing') {
        // Clone content to existing budget
        result = await cloneContentToExistingBudget(
          selectedBudgetId,
          targetBudgetId,
          { preserveMeasurementValues: cloneMode === 'complete' }
        );
      } else {
        // Create new budget with cloned content
        result = await cloneBudget(selectedBudgetId, {
          nombre: form.nombre.trim(),
          version: form.version.trim() || 'v1.0',
          poblacion: form.poblacion.trim(),
          provincia: form.provincia.trim() || undefined
        }, {
          preserveMeasurementValues: cloneMode === 'complete'
        });
      }

      if (result.success && result.newBudgetId) {
        const targetName = cloneTarget === 'existing' 
          ? budgets.find(b => b.id === targetBudgetId)?.nombre 
          : form.nombre;
        toast.success(
          `Contenido clonado a "${targetName}": ${result.stats?.phases} fases, ${result.stats?.activities} actividades, ${result.stats?.resources} recursos`
        );
        onOpenChange(false);
        onCloneSuccess(result.newBudgetId);
      } else {
        toast.error(result.error || 'Error al clonar presupuesto');
      }
    } catch (err: any) {
      console.error('Error cloning:', err);
      toast.error(err.message || 'Error al clonar');
    } finally {
      setIsCloning(false);
    }
  };

  const generatePresupuestoId = (p: Presupuesto) => {
    return `${p.nombre} (${p.codigo_correlativo}/${p.version}): ${p.poblacion}`;
  };

  // Filter budgets for target selection (exclude source budget)
  const availableTargetBudgets = budgets.filter(b => b.id !== selectedBudgetId);

  const canClone = cloneTarget === 'existing' 
    ? selectedBudgetId && targetBudgetId && targetBudgetId !== selectedBudgetId
    : selectedBudgetId && form.nombre.trim() && form.poblacion.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Presupuesto
          </DialogTitle>
          <DialogDescription>
            Selecciona un presupuesto existente y el modo de clonación.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Source budget selection */}
            <div className="space-y-2">
              <Label>Selecciona el presupuesto plantilla (origen)</Label>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : budgets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No hay otros presupuestos disponibles para clonar
                </p>
              ) : (
                <Select value={selectedBudgetId} onValueChange={setSelectedBudgetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un presupuesto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {budgets.map((budget) => (
                      <SelectItem key={budget.id} value={budget.id}>
                        {generatePresupuestoId(budget)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedBudgetId && (
              <>
                {/* Clone mode selection */}
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <Label className="text-sm font-medium">Modo de clonación</Label>
                  <RadioGroup 
                    value={cloneMode} 
                    onValueChange={(v) => setCloneMode(v as CloneMode)}
                    className="space-y-3"
                  >
                    <div className="flex items-start space-x-3">
                      <RadioGroupItem value="template" id="template" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="template" className="flex items-center gap-2 cursor-pointer font-medium">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Como plantilla
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Copia estructura sin valores de mediciones. Ideal para proyectos nuevos.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <RadioGroupItem value="complete" id="complete" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="complete" className="flex items-center gap-2 cursor-pointer font-medium">
                          <Files className="h-4 w-4 text-muted-foreground" />
                          Clon completo
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Copia todo incluyendo valores de mediciones. Ideal para versiones.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {/* Clone target selection */}
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <Label className="text-sm font-medium">Destino de la clonación</Label>
                  <RadioGroup 
                    value={cloneTarget} 
                    onValueChange={(v) => {
                      setCloneTarget(v as CloneTarget);
                      if (v === 'existing') {
                        setTargetBudgetId('');
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="flex items-start space-x-3">
                      <RadioGroupItem value="new" id="target-new" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="target-new" className="flex items-center gap-2 cursor-pointer font-medium">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                          Crear nuevo presupuesto
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Crea un presupuesto nuevo con el contenido clonado.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <RadioGroupItem value="existing" id="target-existing" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="target-existing" className="flex items-center gap-2 cursor-pointer font-medium">
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          Añadir a presupuesto existente
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Añade el contenido clonado a un presupuesto que ya existe.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {cloneTarget === 'existing' ? (
                  <div className="space-y-2">
                    <Label>Selecciona el presupuesto destino</Label>
                    <Select value={targetBudgetId} onValueChange={setTargetBudgetId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el presupuesto destino..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTargetBudgets.map((budget) => (
                          <SelectItem key={budget.id} value={budget.id}>
                            {generatePresupuestoId(budget)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      El contenido se añadirá al presupuesto existente sin eliminar su contenido actual.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium mb-3">Datos del nuevo presupuesto:</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nombre">Nombre *</Label>
                      <Input
                        id="nombre"
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        placeholder="Nombre del nuevo presupuesto"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="version">Versión</Label>
                        <Input
                          id="version"
                          value={form.version}
                          onChange={(e) => setForm({ ...form, version: e.target.value })}
                          placeholder="v1.0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="poblacion">Población *</Label>
                        <Input
                          id="poblacion"
                          value={form.poblacion}
                          onChange={(e) => setForm({ ...form, poblacion: e.target.value })}
                          placeholder="Población"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="provincia">Provincia</Label>
                      <Input
                        id="provincia"
                        value={form.provincia}
                        onChange={(e) => setForm({ ...form, provincia: e.target.value })}
                        placeholder="Provincia (opcional)"
                      />
                    </div>
                  </>
                )}

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-1">Se clonará:</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    <li>✓ Fases y su jerarquía</li>
                    <li>✓ Actividades y sus configuraciones</li>
                    <li>✓ Recursos con costes y márgenes</li>
                    <li>✓ Mediciones y relaciones {cloneMode === 'complete' ? '(con valores)' : '(sin valores)'}</li>
                    <li>✓ Ante-proyecto (textos sin imágenes)</li>
                  </ul>
                  <p className="font-medium mt-2 mb-1">NO se clonará:</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    {cloneMode === 'template' && <li>✗ Valores de mediciones (Uds manual)</li>}
                    <li>✗ Archivos/imágenes del ante-proyecto</li>
                    <li>✗ Archivos adjuntos de actividades</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCloning}>
            Cancelar
          </Button>
          <Button 
            onClick={handleClone} 
            disabled={!canClone || isCloning}
          >
            {isCloning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Clonando...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                {cloneTarget === 'existing' ? 'Clonar Contenido' : 'Clonar Presupuesto'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
