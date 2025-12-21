import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calculator, Plus, X, LinkIcon, FilePlus, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cloneBudget } from '@/lib/clone-budget';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia?: string;
  project_id: string | null;
}

interface ProjectBudgetsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

type ViewMode = 'main' | 'create' | 'clone';
type CloneMode = 'template' | 'complete';

export function ProjectBudgetsManager({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ProjectBudgetsManagerProps) {
  const [linkedBudgets, setLinkedBudgets] = useState<Presupuesto[]>([]);
  const [availableBudgets, setAvailableBudgets] = useState<Presupuesto[]>([]);
  const [allBudgets, setAllBudgets] = useState<Presupuesto[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('main');

  // Create new budget form
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetVersion, setNewBudgetVersion] = useState('1.0');
  const [newBudgetPoblacion, setNewBudgetPoblacion] = useState('');
  const [creating, setCreating] = useState(false);

  // Clone budget form
  const [cloneSourceBudgetId, setCloneSourceBudgetId] = useState<string>('');
  const [cloneMode, setCloneMode] = useState<CloneMode>('complete');
  const [cloneName, setCloneName] = useState('');
  const [cloneVersion, setCloneVersion] = useState('1.0');
  const [clonePoblacion, setClonePoblacion] = useState('');
  const [cloneProvincia, setCloneProvincia] = useState('');
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (open) {
      fetchBudgets();
      setViewMode('main');
    }
  }, [open, projectId]);

  // Auto-fill clone form when source budget is selected
  useEffect(() => {
    if (cloneSourceBudgetId) {
      const sourceBudget = allBudgets.find(b => b.id === cloneSourceBudgetId);
      if (sourceBudget) {
        setCloneName(`${sourceBudget.nombre} (copia)`);
        setCloneVersion('1.0');
        setClonePoblacion(sourceBudget.poblacion);
        setCloneProvincia(sourceBudget.provincia || '');
      }
    }
  }, [cloneSourceBudgetId, allBudgets]);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      // Fetch budgets linked to this project
      const { data: linked, error: linkedError } = await supabase
        .from('presupuestos')
        .select('*')
        .eq('project_id', projectId)
        .order('codigo_correlativo');

      if (linkedError) throw linkedError;
      setLinkedBudgets(linked || []);

      // Fetch budgets not linked to any project (available)
      const { data: available, error: availableError } = await supabase
        .from('presupuestos')
        .select('*')
        .is('project_id', null)
        .order('codigo_correlativo');

      if (availableError) throw availableError;
      setAvailableBudgets(available || []);

      // Fetch all budgets (for cloning source)
      const { data: all, error: allError } = await supabase
        .from('presupuestos')
        .select('*')
        .order('codigo_correlativo');

      if (allError) throw allError;
      setAllBudgets(all || []);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      toast.error('Error al cargar los presupuestos');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkBudget = async () => {
    if (!selectedBudgetId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: projectId })
        .eq('id', selectedBudgetId);

      if (error) throw error;

      toast.success('Presupuesto vinculado correctamente');
      setSelectedBudgetId('');
      fetchBudgets();
    } catch (error) {
      console.error('Error linking budget:', error);
      toast.error('Error al vincular el presupuesto');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkBudget = async (budgetId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: null })
        .eq('id', budgetId);

      if (error) throw error;

      toast.success('Presupuesto desvinculado');
      fetchBudgets();
    } catch (error) {
      console.error('Error unlinking budget:', error);
      toast.error('Error al desvincular el presupuesto');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBudget = async () => {
    if (!newBudgetName.trim() || !newBudgetPoblacion.trim()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setCreating(true);
    try {
      const { data: maxCodeData } = await supabase
        .from('presupuestos')
        .select('codigo_correlativo')
        .order('codigo_correlativo', { ascending: false })
        .limit(1);

      const nextCode = (maxCodeData?.[0]?.codigo_correlativo || 0) + 1;

      const { error } = await supabase.from('presupuestos').insert({
        nombre: newBudgetName.trim(),
        codigo_correlativo: nextCode,
        version: newBudgetVersion.trim() || '1.0',
        poblacion: newBudgetPoblacion.trim(),
        project_id: projectId,
      });

      if (error) throw error;

      toast.success('Presupuesto creado y vinculado');
      setViewMode('main');
      resetCreateForm();
      fetchBudgets();
    } catch (error) {
      console.error('Error creating budget:', error);
      toast.error('Error al crear el presupuesto');
    } finally {
      setCreating(false);
    }
  };

  const handleCloneBudget = async () => {
    if (!cloneSourceBudgetId || !cloneName.trim() || !clonePoblacion.trim()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setCloning(true);
    try {
      const result = await cloneBudget(
        cloneSourceBudgetId,
        {
          nombre: cloneName.trim(),
          version: cloneVersion.trim() || '1.0',
          poblacion: clonePoblacion.trim(),
          provincia: cloneProvincia.trim() || undefined,
          project_id: projectId
        },
        {
          preserveMeasurementValues: cloneMode === 'complete'
        }
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      const statsMsg = result.stats
        ? `Clonados: ${result.stats.phases} fases, ${result.stats.activities} actividades, ${result.stats.resources} recursos, ${result.stats.measurements} mediciones, ${result.stats.spaces} espacios, ${result.stats.workAreas} zonas de trabajo`
        : '';

      toast.success(`Presupuesto clonado y vinculado al proyecto. ${statsMsg}`);
      setViewMode('main');
      resetCloneForm();
      fetchBudgets();
    } catch (error: any) {
      console.error('Error cloning budget:', error);
      toast.error(error.message || 'Error al clonar el presupuesto');
    } finally {
      setCloning(false);
    }
  };

  const resetCreateForm = () => {
    setNewBudgetName('');
    setNewBudgetVersion('1.0');
    setNewBudgetPoblacion('');
  };

  const resetCloneForm = () => {
    setCloneSourceBudgetId('');
    setCloneMode('complete');
    setCloneName('');
    setCloneVersion('1.0');
    setClonePoblacion('');
    setCloneProvincia('');
  };

  const renderMainView = () => (
    <div className="space-y-6 py-4">
      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setViewMode('create')}
        >
          <FilePlus className="h-4 w-4" />
          Crear nuevo
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setViewMode('clone')}
        >
          <Copy className="h-4 w-4" />
          Clonar existente
        </Button>
      </div>

      {/* Link Existing Budget Section */}
      {availableBudgets.length > 0 && (
        <div className="space-y-3">
          <label className="text-sm font-medium">Vincular presupuesto existente</label>
          <div className="flex gap-2">
            <Select value={selectedBudgetId} onValueChange={setSelectedBudgetId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar presupuesto" />
              </SelectTrigger>
              <SelectContent>
                {availableBudgets.map((budget) => (
                  <SelectItem key={budget.id} value={budget.id}>
                    {budget.codigo_correlativo} - {budget.nombre} (v{budget.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleLinkBudget}
              disabled={!selectedBudgetId || saving}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Linked Budgets List */}
      <div className="space-y-3">
        <label className="text-sm font-medium">
          Presupuestos vinculados ({linkedBudgets.length})
        </label>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : linkedBudgets.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <LinkIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay presupuestos vinculados a este proyecto
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {linkedBudgets.map((budget) => (
              <div
                key={budget.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calculator className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{budget.nombre}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Código: {budget.codigo_correlativo}</span>
                      <Badge variant="outline" className="text-xs">
                        v{budget.version}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleUnlinkBudget(budget.id)}
                  disabled={saving}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCreateView = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Nombre del presupuesto *</Label>
        <Input
          value={newBudgetName}
          onChange={(e) => setNewBudgetName(e.target.value)}
          placeholder="Ej: Reforma integral vivienda"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Versión</Label>
          <Input
            value={newBudgetVersion}
            onChange={(e) => setNewBudgetVersion(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div className="space-y-2">
          <Label>Población *</Label>
          <Input
            value={newBudgetPoblacion}
            onChange={(e) => setNewBudgetPoblacion(e.target.value)}
            placeholder="Ej: Madrid"
          />
        </div>
      </div>
      <DialogFooter className="pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setViewMode('main');
            resetCreateForm();
          }}
        >
          Cancelar
        </Button>
        <Button onClick={handleCreateBudget} disabled={creating}>
          {creating ? 'Creando...' : 'Crear presupuesto'}
        </Button>
      </DialogFooter>
    </div>
  );

  const renderCloneView = () => (
    <div className="space-y-4 py-4">
      {/* Source Budget Selection */}
      <div className="space-y-2">
        <Label>Presupuesto origen *</Label>
        <Select value={cloneSourceBudgetId} onValueChange={setCloneSourceBudgetId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar presupuesto a clonar" />
          </SelectTrigger>
          <SelectContent>
            {allBudgets.map((budget) => (
              <SelectItem key={budget.id} value={budget.id}>
                {budget.codigo_correlativo} - {budget.nombre} (v{budget.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clone Mode */}
      <div className="space-y-3">
        <Label>Modo de clonación</Label>
        <RadioGroup value={cloneMode} onValueChange={(v) => setCloneMode(v as CloneMode)}>
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
            <RadioGroupItem value="complete" id="complete" className="mt-0.5" />
            <div className="flex-1">
              <label htmlFor="complete" className="text-sm font-medium cursor-pointer">
                Clonar completo
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Copia todo: fases, actividades, recursos, mediciones con valores, espacios, zonas de trabajo. Sin imágenes del ante-proyecto.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
            <RadioGroupItem value="template" id="template" className="mt-0.5" />
            <div className="flex-1">
              <label htmlFor="template" className="text-sm font-medium cursor-pointer">
                Clonar como plantilla
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Copia estructura sin valores de mediciones ni m² de espacios.
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* New Budget Details */}
      <div className="space-y-2">
        <Label>Nombre del nuevo presupuesto *</Label>
        <Input
          value={cloneName}
          onChange={(e) => setCloneName(e.target.value)}
          placeholder="Ej: Reforma integral vivienda"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Versión</Label>
          <Input
            value={cloneVersion}
            onChange={(e) => setCloneVersion(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div className="space-y-2">
          <Label>Población *</Label>
          <Input
            value={clonePoblacion}
            onChange={(e) => setClonePoblacion(e.target.value)}
            placeholder="Ej: Madrid"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Provincia</Label>
        <Input
          value={cloneProvincia}
          onChange={(e) => setCloneProvincia(e.target.value)}
          placeholder="Ej: Madrid"
        />
      </div>

      <DialogFooter className="pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setViewMode('main');
            resetCloneForm();
          }}
        >
          Cancelar
        </Button>
        <Button 
          onClick={handleCloneBudget} 
          disabled={cloning || !cloneSourceBudgetId || !cloneName.trim() || !clonePoblacion.trim()}
        >
          {cloning ? 'Clonando...' : 'Clonar presupuesto'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {viewMode === 'main' && `Presupuestos de ${projectName}`}
            {viewMode === 'create' && 'Crear nuevo presupuesto'}
            {viewMode === 'clone' && 'Clonar presupuesto'}
          </DialogTitle>
        </DialogHeader>

        {viewMode === 'main' && renderMainView()}
        {viewMode === 'create' && renderCreateView()}
        {viewMode === 'clone' && renderCloneView()}
      </DialogContent>
    </Dialog>
  );
}
