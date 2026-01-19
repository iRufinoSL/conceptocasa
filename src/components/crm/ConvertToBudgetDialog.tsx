import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calculator, FilePlus, Copy, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cloneBudget } from '@/lib/clone-budget';

interface ProjectProfile {
  id: string;
  project_id: string;
  contact_name: string;
  contact_surname: string | null;
  contact_email: string;
  contact_phone: string | null;
  num_plantas: string | null;
  m2_por_planta: string | null;
  forma_geometrica: string | null;
  tipo_tejado: string | null;
  num_habitaciones_total: string | null;
  num_habitaciones_con_bano: string | null;
  num_banos_total: string | null;
  num_habitaciones_con_vestidor: string | null;
  tipo_salon: string | null;
  tipo_cocina: string | null;
  lavanderia: string | null;
  despensa: string | null;
  porche_cubierto: string | null;
  patio_descubierto: string | null;
  garaje: string | null;
  tiene_terreno: string | null;
  poblacion: string | null;
  provincia: string | null;
  coordenadas_google_maps: string | null;
  google_maps_url: string | null;
  presupuesto_global: string | null;
  estilo_constructivo: string[] | null;
  mensaje_adicional: string | null;
  fecha_ideal_finalizacion: string | null;
  created_at: string;
}

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia?: string;
}

interface ConvertToBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityName: string;
  projectId: string;
  onSuccess?: () => void;
}

type CreateMode = 'new' | 'clone';
type CloneMode = 'template' | 'complete';

export function ConvertToBudgetDialog({
  open,
  onOpenChange,
  opportunityId,
  opportunityName,
  projectId,
  onSuccess,
}: ConvertToBudgetDialogProps) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [allBudgets, setAllBudgets] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Mode selection
  const [createMode, setCreateMode] = useState<CreateMode>('clone');

  // Create new form
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetVersion, setNewBudgetVersion] = useState('1.0');
  const [newBudgetPoblacion, setNewBudgetPoblacion] = useState('');

  // Clone form
  const [cloneSourceBudgetId, setCloneSourceBudgetId] = useState<string>('');
  const [cloneMode, setCloneMode] = useState<CloneMode>('template');
  const [cloneName, setCloneName] = useState('');
  const [cloneVersion, setCloneVersion] = useState('1.0');
  const [clonePoblacion, setClonePoblacion] = useState('');
  const [cloneProvincia, setCloneProvincia] = useState('');

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, projectId]);

  // Auto-fill form when profile is loaded
  useEffect(() => {
    if (profile) {
      setNewBudgetName(opportunityName);
      setNewBudgetPoblacion(profile.poblacion || '');
      setCloneName(opportunityName);
      setClonePoblacion(profile.poblacion || '');
      setCloneProvincia(profile.provincia || '');
    }
  }, [profile, opportunityName]);

  // Auto-fill clone form when source budget is selected
  useEffect(() => {
    if (cloneSourceBudgetId && profile) {
      setCloneName(opportunityName);
      setCloneVersion('1.0');
      setClonePoblacion(profile.poblacion || '');
      setCloneProvincia(profile.provincia || '');
    }
  }, [cloneSourceBudgetId, profile, opportunityName]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('project_profiles')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      setProfile(profileData);

      // Fetch all budgets for cloning
      const { data: budgets } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version, poblacion, provincia')
        .order('codigo_correlativo');

      setAllBudgets(budgets || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProfileAsPredesign = async (budgetId: string) => {
    if (!profile) return;

    // Build the profile content as HTML for better display
    const profileContent = `
PERFIL INICIAL DE VIVIENDA
========================

DATOS DE CONTACTO:
- Nombre: ${profile.contact_name} ${profile.contact_surname || ''}
- Email: ${profile.contact_email}
- Teléfono: ${profile.contact_phone || 'No especificado'}

CARACTERÍSTICAS DE LA VIVIENDA:
- Número de plantas: ${profile.num_plantas || 'No especificado'}
- M² habitables por planta: ${profile.m2_por_planta || 'No especificado'}
- Forma geométrica de la planta: ${profile.forma_geometrica || 'No especificado'}
- Tipo de tejado: ${profile.tipo_tejado || 'No especificado'}

DISTRIBUCIÓN:
- Nº habitaciones total: ${profile.num_habitaciones_total || 'No especificado'}
- Nº habitaciones con baño: ${profile.num_habitaciones_con_bano || 'No especificado'}
- Nº baños en total: ${profile.num_banos_total || 'No especificado'}
- Nº habitaciones con vestidor: ${profile.num_habitaciones_con_vestidor || 'No especificado'}
- Salón: ${profile.tipo_salon || 'No especificado'}
- Cocina: ${profile.tipo_cocina || 'No especificado'}
- Lavandería: ${profile.lavanderia || 'No especificado'}
- Despensa: ${profile.despensa || 'No especificado'}

ESPACIOS EXTERIORES:
- Porche cubierto: ${profile.porche_cubierto || 'No especificado'}
- Patio descubierto: ${profile.patio_descubierto || 'No especificado'}
- Garaje: ${profile.garaje || 'No especificado'}
- Tiene terreno: ${profile.tiene_terreno || 'No especificado'}

UBICACIÓN Y PRESUPUESTO:
- Población: ${profile.poblacion || 'No especificado'}
- Provincia: ${profile.provincia || 'No especificado'}
- Coordenadas: ${profile.coordenadas_google_maps || 'No especificado'}
- URL Google Maps: ${profile.google_maps_url || 'No especificado'}
- Presupuesto global: ${profile.presupuesto_global || 'No especificado'}
- Fecha ideal finalización: ${profile.fecha_ideal_finalizacion || 'No especificado'}

ESTILO CONSTRUCTIVO PREFERIDO:
${profile.estilo_constructivo?.join(', ') || 'No especificado'}

MENSAJE ADICIONAL:
${profile.mensaje_adicional || 'Ninguno'}
    `.trim();

    const { error } = await supabase.from('budget_predesigns').insert({
      budget_id: budgetId,
      content: 'Perfil inicial del cliente',
      description: profileContent,
      content_type: 'Perfil inicial',
    });

    if (error) {
      console.error('Error creating predesign from profile:', error);
    }
  };

  const updateProjectStatus = async () => {
    const { error } = await supabase
      .from('projects')
      .update({ status: 'activo' })
      .eq('id', projectId);

    if (error) {
      console.error('Error updating project status:', error);
    }
  };

  const handleCreateNew = async () => {
    if (!newBudgetName.trim() || !newBudgetPoblacion.trim()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setCreating(true);
    try {
      // Get next correlative code
      const { data: maxCodeData } = await supabase
        .from('presupuestos')
        .select('codigo_correlativo')
        .order('codigo_correlativo', { ascending: false })
        .limit(1);

      const nextCode = (maxCodeData?.[0]?.codigo_correlativo || 0) + 1;

      // Create budget
      const { data: newBudget, error } = await supabase
        .from('presupuestos')
        .insert({
          nombre: newBudgetName.trim(),
          codigo_correlativo: nextCode,
          version: newBudgetVersion.trim() || '1.0',
          poblacion: newBudgetPoblacion.trim(),
          project_id: projectId,
        })
        .select()
        .single();

      if (error) throw error;

      // Create profile as predesign
      if (profile && newBudget) {
        await createProfileAsPredesign(newBudget.id);
      }

      // Update project status to "activo"
      await updateProjectStatus();

      toast.success('Presupuesto creado correctamente. El proyecto ahora está activo.');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating budget:', error);
      toast.error('Error al crear el presupuesto');
    } finally {
      setCreating(false);
    }
  };

  const handleClone = async () => {
    if (!cloneSourceBudgetId || !cloneName.trim() || !clonePoblacion.trim()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setCreating(true);
    try {
      console.log('Starting clone with params:', {
        sourceBudgetId: cloneSourceBudgetId,
        cloneMode,
        preserveMeasurementValues: cloneMode === 'complete',
      });

      const result = await cloneBudget(
        cloneSourceBudgetId,
        {
          nombre: cloneName.trim(),
          version: cloneVersion.trim() || '1.0',
          poblacion: clonePoblacion.trim(),
          provincia: cloneProvincia.trim() || undefined,
          project_id: projectId,
        },
        {
          preserveMeasurementValues: cloneMode === 'complete',
        }
      );

      console.log('Clone result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Error desconocido al clonar el presupuesto');
      }

      // Create profile as predesign
      if (profile && result.newBudgetId) {
        await createProfileAsPredesign(result.newBudgetId);
      }

      // Update project status to "activo"
      await updateProjectStatus();

      const statsMsg = result.stats
        ? `Clonados: ${result.stats.phases} fases, ${result.stats.activities} actividades, ${result.stats.resources} recursos`
        : '';

      toast.success(`Presupuesto creado y vinculado. El proyecto ahora está activo. ${statsMsg}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error cloning budget:', error);
      toast.error(error.message || 'Error al clonar el presupuesto');
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Convertir en Presupuesto
          </DialogTitle>
          <DialogDescription>
            Crear un presupuesto para "{opportunityName}". El proyecto pasará a estado "Activo" y el perfil del cliente se guardará en el Ante-proyecto.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6 py-4 overflow-y-auto flex-1">
            {/* Mode Selection */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={createMode === 'clone' ? 'default' : 'outline'}
                className="gap-2 h-auto py-3"
                onClick={() => setCreateMode('clone')}
              >
                <Copy className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Clonar existente</div>
                  <div className="text-xs opacity-80">Basado en otro presupuesto</div>
                </div>
              </Button>
              <Button
                variant={createMode === 'new' ? 'default' : 'outline'}
                className="gap-2 h-auto py-3"
                onClick={() => setCreateMode('new')}
              >
                <FilePlus className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Crear vacío</div>
                  <div className="text-xs opacity-80">Empezar desde cero</div>
                </div>
              </Button>
            </div>

            {createMode === 'clone' ? (
              <>
                {/* Source Budget Selection */}
                <div className="space-y-2">
                  <Label>Presupuesto modelo a clonar *</Label>
                  <Select value={cloneSourceBudgetId} onValueChange={setCloneSourceBudgetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar presupuesto modelo" />
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
                      <RadioGroupItem value="template" id="template" className="mt-0.5" />
                      <div className="flex-1">
                        <label htmlFor="template" className="text-sm font-medium cursor-pointer">
                          Solo estructura (recomendado)
                        </label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Copia fases, actividades y recursos sin valores de mediciones.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value="complete" id="complete" className="mt-0.5" />
                      <div className="flex-1">
                        <label htmlFor="complete" className="text-sm font-medium cursor-pointer">
                          Clonar completo
                        </label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Copia todo incluyendo valores de mediciones.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {/* New Budget Details */}
                <div className="space-y-2">
                  <Label>Nombre del presupuesto *</Label>
                  <Input
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="Ej: Vivienda unifamiliar García"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
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
                  <div className="space-y-2">
                    <Label>Provincia</Label>
                    <Input
                      value={cloneProvincia}
                      onChange={(e) => setCloneProvincia(e.target.value)}
                      placeholder="Ej: Madrid"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Create New Form */}
                <div className="space-y-2">
                  <Label>Nombre del presupuesto *</Label>
                  <Input
                    value={newBudgetName}
                    onChange={(e) => setNewBudgetName(e.target.value)}
                    placeholder="Ej: Vivienda unifamiliar García"
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
              </>
            )}

            {/* Info about what will happen */}
            <div className="bg-muted/50 p-4 rounded-lg border">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Al convertir:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Se creará el presupuesto vinculado al proyecto</li>
                <li>• El proyecto pasará a estado <span className="font-medium text-primary">"Activo"</span></li>
                {profile && (
                  <li>• El perfil del cliente se guardará en el <span className="font-medium">Ante-proyecto</span> como "Perfil inicial"</li>
                )}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={createMode === 'clone' ? handleClone : handleCreateNew}
            disabled={creating || loading}
            className="gap-2"
          >
            {creating ? (
              'Creando...'
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                Crear Presupuesto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
