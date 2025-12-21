import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { cloneBudget } from '@/lib/clone-budget';
import { toast } from 'sonner';
import { Copy, Loader2, FileText, Files } from 'lucide-react';

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
  currentBudgetId?: string; // Optional - if provided, excludes this budget from the list
  onCloneSuccess: (newBudgetId: string) => void;
}

type CloneMode = 'template' | 'complete';

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
    }
  }, [open]);

  // Auto-fill form when budget is selected
  useEffect(() => {
    if (selectedBudgetId) {
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
  }, [selectedBudgetId, budgets]);

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
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.poblacion.trim()) {
      toast.error('La población es obligatoria');
      return;
    }

    setIsCloning(true);
    try {
      const result = await cloneBudget(selectedBudgetId, {
        nombre: form.nombre.trim(),
        version: form.version.trim() || 'v1.0',
        poblacion: form.poblacion.trim(),
        provincia: form.provincia.trim() || undefined
      }, {
        preserveMeasurementValues: cloneMode === 'complete'
      });

      if (result.success && result.newBudgetId) {
        toast.success(
          `Presupuesto clonado: ${result.stats?.phases} fases, ${result.stats?.activities} actividades, ${result.stats?.resources} recursos, ${result.stats?.measurements} mediciones`
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Presupuesto
          </DialogTitle>
          <DialogDescription>
            Selecciona un presupuesto existente y el modo de clonación.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCloning}>
            Cancelar
          </Button>
          <Button 
            onClick={handleClone} 
            disabled={!selectedBudgetId || isCloning || !form.nombre.trim() || !form.poblacion.trim()}
          >
            {isCloning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Clonando...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Clonar Presupuesto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
