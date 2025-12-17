import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Calculator, ClipboardList, Building2, FileText, Settings, Calendar, Ruler, FileDown, Image, RefreshCw, Copy, GanttChart, Upload, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { BudgetActivitiesTab } from '@/components/presupuestos/BudgetActivitiesTab';
import { BudgetPhasesTab } from '@/components/presupuestos/BudgetPhasesTab';
import { BudgetResourcesTab } from '@/components/presupuestos/BudgetResourcesTab';
import { BudgetMeasurementsTab } from '@/components/presupuestos/BudgetMeasurementsTab';
import { BudgetVisualSummary } from '@/components/presupuestos/BudgetVisualSummary';
import { BudgetVersionComparison } from '@/components/presupuestos/BudgetVersionComparison';
import { BudgetReportPreview } from '@/components/presupuestos/BudgetReportPreview';
import { BudgetPredesignTab } from '@/components/presupuestos/BudgetPredesignTab';
import { CloneBudgetDialog } from '@/components/presupuestos/CloneBudgetDialog';
import { BudgetTimelineView } from '@/components/presupuestos/BudgetTimelineView';
import { recalculateAllBudgetResources } from '@/lib/budget-utils';
import { toast } from 'sonner';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string | null;
  project_id: string | null;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  portada_url: string | null;
  portada_text_color: string | null;
  portada_text_position: string | null;
  portada_overlay_opacity: number | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

export default function PresupuestoDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading, roles } = useAuth();
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('anteproyecto');
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [uploadingPortada, setUploadingPortada] = useState(false);
  const portadaInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = roles.includes('administrador');

  const handleRecalculateAll = async () => {
    if (!id) return;
    
    setIsRecalculating(true);
    try {
      const result = await recalculateAllBudgetResources(id);
      if (result.errors === 0) {
        toast.success(`Recálculo completado: ${result.updated} actividades actualizadas`);
      } else {
        toast.warning(`Recálculo con errores: ${result.updated} actualizadas, ${result.errors} errores`);
      }
      // Dispatch event to refresh data in all tabs
      window.dispatchEvent(new CustomEvent('budget-recalculated'));
    } catch (err) {
      console.error('Error recalculating:', err);
      toast.error('Error al recalcular');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handlePortadaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !presupuesto) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }

    setUploadingPortada(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `portada-${presupuesto.id}-${Date.now()}.${fileExt}`;

      // Delete old portada if exists
      if (presupuesto.portada_url) {
        const oldPath = presupuesto.portada_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('budget-covers').remove([oldPath]);
        }
      }

      // Upload new portada
      const { error: uploadError } = await supabase.storage
        .from('budget-covers')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('budget-covers')
        .getPublicUrl(fileName);

      // Update presupuesto
      const { error: updateError } = await supabase
        .from('presupuestos')
        .update({ portada_url: urlData.publicUrl })
        .eq('id', presupuesto.id);

      if (updateError) throw updateError;

      setPresupuesto({ ...presupuesto, portada_url: urlData.publicUrl });
      toast.success('Portada subida correctamente');
    } catch (error) {
      console.error('Error uploading portada:', error);
      toast.error('Error al subir la portada');
    } finally {
      setUploadingPortada(false);
    }
  };

  const handleRemovePortada = async () => {
    if (!presupuesto?.portada_url) return;

    try {
      const oldPath = presupuesto.portada_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('budget-covers').remove([oldPath]);
      }

      const { error } = await supabase
        .from('presupuestos')
        .update({ portada_url: null })
        .eq('id', presupuesto.id);

      if (error) throw error;

      setPresupuesto({ ...presupuesto, portada_url: null });
      toast.success('Portada eliminada');
    } catch (error) {
      console.error('Error removing portada:', error);
      toast.error('Error al eliminar la portada');
    }
  };

  // Listen for edit-activity events to switch to activities tab
  useEffect(() => {
    const handleEditActivity = () => {
      setActiveTab('actividades');
    };
    window.addEventListener('edit-activity', handleEditActivity);
    return () => window.removeEventListener('edit-activity', handleEditActivity);
  }, []);

  // Listen for navigate-to-resources events to switch to resources tab
  useEffect(() => {
    const handleNavigateToResources = () => {
      setActiveTab('recursos');
    };
    window.addEventListener('navigate-to-resources', handleNavigateToResources);
    return () => window.removeEventListener('navigate-to-resources', handleNavigateToResources);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !id) {
        setIsLoading(false);
        return;
      }

      try {
        // Fetch presupuesto
        const { data: presupuestoData, error: presupuestoError } = await supabase
          .from('presupuestos')
          .select('*')
          .eq('id', id)
          .single();

        if (presupuestoError) {
          console.error('Error fetching presupuesto:', presupuestoError);
          navigate('/presupuestos');
          return;
        }

        setPresupuesto(presupuestoData);

        // Fetch linked project if exists
        if (presupuestoData.project_id) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, status')
            .eq('id', presupuestoData.project_id)
            .single();

          if (projectData) {
            setProject(projectData);
          }
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!loading) {
      fetchData();
    }
  }, [user, loading, id, navigate]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!presupuesto) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Presupuesto no encontrado</h2>
          <Button onClick={() => navigate('/presupuestos')}>Volver a Presupuestos</Button>
        </div>
      </div>
    );
  }

  const generatePresupuestoId = () => {
    return `${presupuesto.nombre} (${presupuesto.codigo_correlativo}/${presupuesto.version}): ${presupuesto.poblacion}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/presupuestos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <AppNavDropdown />
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{presupuesto.nombre}</h1>
              <p className="text-xs text-muted-foreground">{generatePresupuestoId()}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setReportPreviewOpen(true)}
            className="flex items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            Informe PDF
          </Button>
          {project && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/proyectos')}
              className="flex items-center gap-2"
            >
              <Building2 className="h-4 w-4" />
              {project.name}
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Código</CardDescription>
              <CardTitle className="text-2xl">{presupuesto.codigo_correlativo}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Versión</CardDescription>
              <CardTitle className="text-2xl">{presupuesto.version}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Población</CardDescription>
              <CardTitle className="text-2xl">{presupuesto.poblacion}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Proyecto</CardDescription>
              <CardTitle className="text-2xl">{project?.name || 'Sin proyecto'}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fecha Inicio</CardDescription>
              <CardTitle className="text-lg">
                {presupuesto.start_date 
                  ? format(new Date(presupuesto.start_date), 'dd/MM/yyyy', { locale: es })
                  : 'Sin definir'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fecha Fin</CardDescription>
              <CardTitle className="text-lg">
                {presupuesto.end_date 
                  ? format(new Date(presupuesto.end_date), 'dd/MM/yyyy', { locale: es })
                  : 'Sin definir'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-8 lg:w-auto lg:inline-grid">
            <TabsTrigger value="anteproyecto" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Ante-proyecto</span>
            </TabsTrigger>
            <TabsTrigger value="actividades" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">QUÉ hay que hacer?</span>
            </TabsTrigger>
            <TabsTrigger value="fases" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">CUÁNDO se hace?</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <GanttChart className="h-4 w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="recursos" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">CÓMO hacer?</span>
            </TabsTrigger>
            <TabsTrigger value="mediciones" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              <span className="hidden sm:inline">Mediciones Presupuesto</span>
            </TabsTrigger>
            <TabsTrigger value="resumen" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Resumen</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configuración</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="anteproyecto" className="mt-6">
            <BudgetPredesignTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="actividades" className="mt-6">
            <BudgetActivitiesTab 
              budgetId={presupuesto.id} 
              budgetName={presupuesto.nombre} 
              isAdmin={isAdmin}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
            />
          </TabsContent>

          <TabsContent value="fases" className="mt-6">
            <BudgetPhasesTab 
              budgetId={presupuesto.id} 
              isAdmin={isAdmin}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <BudgetTimelineView 
              budgetId={presupuesto.id}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
            />
          </TabsContent>

          <TabsContent value="recursos" className="mt-6">
            <BudgetResourcesTab budgetId={presupuesto.id} budgetName={presupuesto.nombre} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="mediciones" className="mt-6">
            <BudgetMeasurementsTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="resumen" className="mt-6">
            <BudgetVisualSummary budgetId={presupuesto.id} budgetName={presupuesto.nombre} />
          </TabsContent>

          <TabsContent value="config" className="mt-6">
            <div className="space-y-6">
              <BudgetVersionComparison 
                currentBudgetId={presupuesto.id}
                currentBudgetName={presupuesto.nombre}
                currentVersion={presupuesto.version}
              />
              
              <Card>
                <CardHeader>
                  <CardTitle>Fechas del Presupuesto</CardTitle>
                  <CardDescription>Configure las fechas de inicio y fin del proyecto</CardDescription>
                </CardHeader>
                <CardContent>
                  {isAdmin ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="budget-start-date">Fecha de Inicio</Label>
                        <Input
                          id="budget-start-date"
                          type="date"
                          value={presupuesto.start_date || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value || null;
                            const { error } = await supabase
                              .from('presupuestos')
                              .update({ start_date: newDate })
                              .eq('id', presupuesto.id);
                            if (error) {
                              toast.error('Error al guardar fecha');
                            } else {
                              setPresupuesto({ ...presupuesto, start_date: newDate });
                              toast.success('Fecha de inicio actualizada');
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="budget-end-date">Fecha de Fin</Label>
                        <Input
                          id="budget-end-date"
                          type="date"
                          value={presupuesto.end_date || ''}
                          min={presupuesto.start_date || undefined}
                          onChange={async (e) => {
                            const newDate = e.target.value || null;
                            const { error } = await supabase
                              .from('presupuestos')
                              .update({ end_date: newDate })
                              .eq('id', presupuesto.id);
                            if (error) {
                              toast.error('Error al guardar fecha');
                            } else {
                              setPresupuesto({ ...presupuesto, end_date: newDate });
                              toast.success('Fecha de fin actualizada');
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Fecha de Inicio</p>
                        <p className="font-medium">
                          {presupuesto.start_date 
                            ? format(new Date(presupuesto.start_date), 'dd/MM/yyyy', { locale: es })
                            : 'Sin definir'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Fecha de Fin</p>
                        <p className="font-medium">
                          {presupuesto.end_date 
                            ? format(new Date(presupuesto.end_date), 'dd/MM/yyyy', { locale: es })
                            : 'Sin definir'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Portada Upload Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    Portada del Presupuesto
                  </CardTitle>
                  <CardDescription>
                    Esta imagen aparecerá como portada en los informes PDF del presupuesto.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isAdmin ? (
                    <div className="flex items-start gap-4">
                      <div className="w-48 h-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/30">
                        {presupuesto.portada_url ? (
                          <img 
                            src={presupuesto.portada_url} 
                            alt="Portada del presupuesto" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Image className="h-12 w-12 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={portadaInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePortadaUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => portadaInputRef.current?.click()}
                          disabled={uploadingPortada}
                          className="gap-2"
                        >
                          {uploadingPortada ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {presupuesto.portada_url ? 'Cambiar portada' : 'Subir portada'}
                        </Button>
                        {presupuesto.portada_url && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemovePortada}
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                            Eliminar
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Formato JPG o PNG. Máximo 5MB.
                        </p>
                      </div>
                      
                      {/* Cover style configuration */}
                      {presupuesto.portada_url && (
                        <div className="border-l pl-4 ml-4 space-y-3">
                          <p className="text-sm font-medium">Estilo del texto</p>
                          
                          <div className="space-y-2">
                            <Label htmlFor="text-color" className="text-xs">Color del texto</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="text-color"
                                type="color"
                                value={presupuesto.portada_text_color || '#FFFFFF'}
                                onChange={async (e) => {
                                  const newColor = e.target.value;
                                  const { error } = await supabase
                                    .from('presupuestos')
                                    .update({ portada_text_color: newColor })
                                    .eq('id', presupuesto.id);
                                  if (!error) {
                                    setPresupuesto({ ...presupuesto, portada_text_color: newColor });
                                  }
                                }}
                                className="w-12 h-8 p-1 cursor-pointer"
                              />
                              <span className="text-xs text-muted-foreground">
                                {presupuesto.portada_text_color || '#FFFFFF'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="text-position" className="text-xs">Posición del texto</Label>
                            <select
                              id="text-position"
                              value={presupuesto.portada_text_position || 'center'}
                              onChange={async (e) => {
                                const newPosition = e.target.value;
                                const { error } = await supabase
                                  .from('presupuestos')
                                  .update({ portada_text_position: newPosition })
                                  .eq('id', presupuesto.id);
                                if (!error) {
                                  setPresupuesto({ ...presupuesto, portada_text_position: newPosition });
                                }
                              }}
                              className="w-full h-8 px-2 text-sm border rounded-md bg-background"
                            >
                              <option value="top">Arriba</option>
                              <option value="center">Centro</option>
                              <option value="bottom">Abajo</option>
                            </select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="overlay-opacity" className="text-xs">
                              Opacidad del fondo ({Math.round((presupuesto.portada_overlay_opacity || 0.4) * 100)}%)
                            </Label>
                            <Input
                              id="overlay-opacity"
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={presupuesto.portada_overlay_opacity || 0.4}
                              onChange={async (e) => {
                                const newOpacity = parseFloat(e.target.value);
                                const { error } = await supabase
                                  .from('presupuestos')
                                  .update({ portada_overlay_opacity: newOpacity })
                                  .eq('id', presupuesto.id);
                                if (!error) {
                                  setPresupuesto({ ...presupuesto, portada_overlay_opacity: newOpacity });
                                }
                              }}
                              className="w-full h-2 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-48 h-32 rounded-lg border overflow-hidden bg-muted/30">
                      {presupuesto.portada_url ? (
                        <img 
                          src={presupuesto.portada_url} 
                          alt="Portada del presupuesto" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-muted-foreground text-sm">Sin portada</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Configuración del Presupuesto</CardTitle>
                  <CardDescription>Ajustes y parámetros del presupuesto</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isAdmin && (
                    <>
                      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                        <div>
                          <h4 className="font-medium">Clonar un Presupuesto</h4>
                          <p className="text-sm text-muted-foreground">
                            Crea un nuevo presupuesto clonando la estructura de otro existente (fases, actividades, recursos).
                          </p>
                        </div>
                        <Button 
                          onClick={() => setCloneDialogOpen(true)}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Clonar Presupuesto
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                        <div>
                          <h4 className="font-medium">Recalcular Unidades Relacionadas</h4>
                          <p className="text-sm text-muted-foreground">
                            Actualiza las Uds relacionadas de todos los recursos basándose en las mediciones y el flag "Usa Medición" de cada actividad.
                          </p>
                        </div>
                        <Button 
                          onClick={handleRecalculateAll} 
                          disabled={isRecalculating}
                          className="flex items-center gap-2"
                        >
                          <RefreshCw className={`h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
                          {isRecalculating ? 'Recalculando...' : 'Recalcular Todo'}
                        </Button>
                      </div>
                    </>
                  )}
                  <p className="text-muted-foreground text-center py-4">Más opciones próximamente</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Report Preview Dialog */}
      <BudgetReportPreview
        open={reportPreviewOpen}
        onOpenChange={setReportPreviewOpen}
        presupuesto={presupuesto}
      />

      {/* Clone Budget Dialog */}
      <CloneBudgetDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        currentBudgetId={presupuesto.id}
        onCloneSuccess={(newBudgetId) => {
          navigate(`/presupuestos/${newBudgetId}`);
        }}
      />
    </div>
  );
}
