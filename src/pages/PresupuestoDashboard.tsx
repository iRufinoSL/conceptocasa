import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { useSignedUrl, extractFilePath } from '@/hooks/useSignedUrl';
import { useBudgetPresence } from '@/hooks/useBudgetPresence';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Calculator, ClipboardList, Building2, FileText, Settings, Calendar, Ruler, FileDown, Image, RefreshCw, Copy, GanttChart, Upload, X, Loader2, Euro, Home, MapPin, Users, FolderOpen, CalendarCheck, Mail, Landmark, PenTool, Wallet, Brain } from 'lucide-react';
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
import { BudgetUrbanismTab } from '@/components/presupuestos/BudgetUrbanismTab';
import { BudgetContactsManager } from '@/components/presupuestos/BudgetContactsManager';
import { BudgetSpacesTab } from '@/components/presupuestos/BudgetSpacesTab';
import { BudgetCostSummary } from '@/components/presupuestos/BudgetCostSummary';
import { CloneBudgetDialog } from '@/components/presupuestos/CloneBudgetDialog';
import { BudgetTimelineView } from '@/components/presupuestos/BudgetTimelineView';
import { HierarchicalGanttView } from '@/components/presupuestos/HierarchicalGanttView';
import { recalculateAllBudgetResources } from '@/lib/budget-utils';
import { BudgetWorkAreasTab } from '@/components/presupuestos/BudgetWorkAreasTab';
import { BudgetDocumentsTab } from '@/components/presupuestos/BudgetDocumentsTab';
import { BudgetAgendaTab } from '@/components/presupuestos/BudgetAgendaTab';
import { BudgetCommunicationsTab } from '@/components/presupuestos/BudgetCommunicationsTab';
import { BudgetPresenceIndicator } from '@/components/presupuestos/BudgetPresenceIndicator';
import { FloorPlanTab } from '@/components/presupuestos/FloorPlanTab';
import { toast } from 'sonner';
import { BudgetAdministracionTab } from '@/components/presupuestos/BudgetAdministracionTab';
import { TolosaBrainstormView } from '@/components/presupuestos/TolosaBrainstormView';
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
  comparativa_opciones: string | null;
  is_signed: boolean;
  signed_at: string | null;
  option_a_description: string | null;
  option_b_description: string | null;
  option_c_description: string | null;
  estimated_budget: number | null;
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
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [activityReturnTab, setActivityReturnTab] = useState<string | null>(null);
  const portadaInputRef = useRef<HTMLInputElement>(null);
  const [budgetMode, setBudgetMode] = useState<'gestconcepto' | 'tolosa'>('tolosa');
  const isAdmin = roles.includes('administrador');
  const { isTabVisible } = useTabVisibility();

  // Budget presence for real-time collaboration
  const { activeUsers, updatePresence, isEntityLocked, clearEditingState } = useBudgetPresence({
    budgetId: id || '',
    enabled: !!id && !!user,
  });

  // Update presence when tab changes
  useEffect(() => {
    if (id && user) {
      updatePresence({ active_tab: activeTab });
    }
  }, [activeTab, id, user, updatePresence]);
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

      // Delete old portada if exists (extract path from stored value)
      if (presupuesto.portada_url) {
        const oldPath = extractFilePath(presupuesto.portada_url);
        if (oldPath) {
          await supabase.storage.from('budget-covers').remove([oldPath]);
        }
      }

      // Upload new portada
      const { error: uploadError } = await supabase.storage
        .from('budget-covers')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update presupuesto with file path (not URL)
      const { error: updateError } = await supabase
        .from('presupuestos')
        .update({ portada_url: fileName })
        .eq('id', presupuesto.id);

      if (updateError) throw updateError;

      setPresupuesto({ ...presupuesto, portada_url: fileName });
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
      const filePath = extractFilePath(presupuesto.portada_url);
      if (filePath) {
        await supabase.storage.from('budget-covers').remove([filePath]);
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

  // Get signed URL for portada display
  const portadaPath = presupuesto?.portada_url ? extractFilePath(presupuesto.portada_url) : null;
  const { signedUrl: portadaDisplayUrl } = useSignedUrl(portadaPath, { bucket: 'budget-covers' });

  // Listen for edit-activity events to switch to activities tab and open the activity form
  useEffect(() => {
    const handleEditActivity = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activityData = customEvent.detail;
      if (activityData && activityData.id) {
        setSelectedActivityId(activityData.id);
        // Store return tab if provided (e.g., 'areas-trabajo' from DÓNDE?)
        if (activityData.returnTab) {
          setActivityReturnTab(activityData.returnTab);
        }
      }
      setActiveTab('actividades');
    };
    window.addEventListener('edit-activity', handleEditActivity);
    return () => window.removeEventListener('edit-activity', handleEditActivity);
  }, []);

  // Listen for activity-form-closed events to return to the previous tab
  useEffect(() => {
    const handleActivityFormClosed = (e: Event) => {
      const customEvent = e as CustomEvent;
      const returnTab = customEvent.detail?.returnTab || activityReturnTab;
      if (returnTab) {
        setActiveTab(returnTab);
        setActivityReturnTab(null);
      }
    };
    window.addEventListener('activity-form-closed', handleActivityFormClosed);
    return () => window.removeEventListener('activity-form-closed', handleActivityFormClosed);
  }, [activityReturnTab]);

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
          {/* Presence indicator */}
          {user && (
            <BudgetPresenceIndicator 
              activeUsers={activeUsers} 
              currentUserId={user.id} 
            />
          )}
          {isAdmin && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setReportPreviewOpen(true)}
              className="flex items-center gap-2"
            >
              <FileDown className="h-4 w-4" />
              Informe PDF
            </Button>
          )}
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
        {/* Mode Selector */}
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant={budgetMode === 'tolosa' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setBudgetMode('tolosa'); setActiveTab('actividades'); }}
            className="gap-2"
          >
            <Brain className="h-4 w-4" />
            TO.LO.SA.systems 2.0
          </Button>
          <Button
            variant={budgetMode === 'gestconcepto' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBudgetMode('gestconcepto')}
            className="gap-2"
          >
            <Calculator className="h-4 w-4" />
            GestConcepto 1.0
          </Button>
        </div>

        <>
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
        <Tabs value={activeTab} onValueChange={(tab) => {
          setActiveTab(tab);
          // Clear selectedPhaseId when navigating away from fases tab so next navigation can work
          if (tab !== 'fases') {
            setSelectedPhaseId(null);
          }
        }} className="w-full">
          <div className="space-y-1">
            {/* Primera línea: Pestañas principales (preguntas) */}
            <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
              {isTabVisible('cuanto-cuesta') && (
                <TabsTrigger value="cuanto-cuesta" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <Euro className="h-4 w-4" />
                  <span>CUÁNTO?</span>
                </TabsTrigger>
              )}
              {isTabVisible('actividades') && (
                <TabsTrigger value="actividades" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  <span>QUÉ?</span>
                </TabsTrigger>
              )}
              {isTabVisible('recursos') && (
                <TabsTrigger value="recursos" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <FileText className="h-4 w-4" />
                  <span>CÓMO?</span>
                </TabsTrigger>
              )}
              {isTabVisible('fases') && (
                <TabsTrigger value="fases" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <Calendar className="h-4 w-4" />
                  <span>CUÁNDO?</span>
                </TabsTrigger>
              )}
              {isTabVisible('zonas') && (
                <TabsTrigger value="areas-trabajo" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <MapPin className="h-4 w-4" />
                  <span>DÓNDE?</span>
                </TabsTrigger>
              )}
              {isTabVisible('contactos') && (
                <TabsTrigger value="contactos" className="flex items-center gap-1.5 text-xs px-3 py-2 font-semibold">
                  <Users className="h-4 w-4" />
                  <span>QUIÉN?</span>
                </TabsTrigger>
              )}
            </TabsList>

            {/* Segunda línea: Pestañas secundarias */}
            <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
              {isTabVisible('anteproyecto') && (
                <TabsTrigger value="urbanismo" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  <span>Urbanismo</span>
                </TabsTrigger>
              )}
              {isTabVisible('anteproyecto') && (
                <TabsTrigger value="anteproyecto" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Image className="h-3.5 w-3.5" />
                  <span>Ante-proyecto</span>
                </TabsTrigger>
              )}
              {isTabVisible('mediciones') && (
                <TabsTrigger value="mediciones" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Ruler className="h-3.5 w-3.5" />
                  <span>Mediciones</span>
                </TabsTrigger>
              )}
              {isTabVisible('espacios') && (
                <TabsTrigger value="espacios" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Home className="h-3.5 w-3.5" />
                  <span>Espacios</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="plano" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                <PenTool className="h-3.5 w-3.5" />
                <span>Plano</span>
              </TabsTrigger>
              {isTabVisible('documentos') && (
                <TabsTrigger value="documentos" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span>Documentos</span>
                </TabsTrigger>
              )}
              {isTabVisible('agenda') && (
                <TabsTrigger value="agenda" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>Agenda</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="comunicaciones" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                <Mail className="h-3.5 w-3.5" />
                <span>Comunicaciones</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="administracion" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Administración</span>
                </TabsTrigger>
              )}
              {isTabVisible('resumen') && (
                <TabsTrigger value="resumen" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  <span>Resumen</span>
                </TabsTrigger>
              )}
              {isTabVisible('timeline') && (
                <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <GanttChart className="h-3.5 w-3.5" />
                  <span>Timeline</span>
                </TabsTrigger>
              )}
              {isTabVisible('config') && (
                <TabsTrigger value="config" className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Config</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="urbanismo" className="mt-6">
            <BudgetUrbanismTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="anteproyecto" className="mt-6">
            <BudgetPredesignTab budgetId={presupuesto.id} isAdmin={isAdmin} projectId={presupuesto.project_id} />
          </TabsContent>

          <TabsContent value="cuanto-cuesta" className="mt-6">
            <BudgetCostSummary 
              budgetId={presupuesto.id}
              budgetName={presupuesto.nombre}
              budgetCode={presupuesto.codigo_correlativo}
              budgetVersion={presupuesto.version}
              budgetLocation={presupuesto.poblacion}
              budgetProvince={presupuesto.provincia}
              comparativaOpciones={presupuesto.comparativa_opciones}
              isAdmin={isAdmin}
              isSigned={presupuesto.is_signed}
              optionADescription={presupuesto.option_a_description}
              optionBDescription={presupuesto.option_b_description}
              optionCDescription={presupuesto.option_c_description}
              onOptionDescriptionChange={async (option, value) => {
                try {
                  const field = `option_${option.toLowerCase()}_description` as 'option_a_description' | 'option_b_description' | 'option_c_description';
                  const { error } = await supabase
                    .from('presupuestos')
                    .update({ [field]: value })
                    .eq('id', presupuesto.id);
                  if (error) throw error;
                  setPresupuesto({ ...presupuesto, [field]: value });
                } catch (err) {
                  console.error('Error updating option description:', err);
                  toast.error('Error al guardar descripción');
                }
              }}
              onSignedChange={async (signed) => {
                if (!signed) return; // Cannot unsign
                
                // First, calculate and store signed_subtotal for all resources
                const { data: resources, error: resourcesError } = await supabase
                  .from('budget_activity_resources')
                  .select('id, external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent')
                  .eq('budget_id', presupuesto.id);
                
                if (resourcesError) throw resourcesError;
                
                // Calculate and update signed_subtotal for each resource
                for (const resource of resources || []) {
                  const externalCost = resource.external_unit_cost || 0;
                  const safetyRatio = resource.safety_margin_percent !== null 
                    ? resource.safety_margin_percent 
                    : 0.15;
                  const salesRatio = resource.sales_margin_percent !== null 
                    ? resource.sales_margin_percent 
                    : 0.25;
                  
                  const safetyMarginUd = externalCost * safetyRatio;
                  const internalCostUd = externalCost + safetyMarginUd;
                  const salesMarginUd = internalCostUd * salesRatio;
                  const salesCostUd = internalCostUd + salesMarginUd;
                  
                  const calculatedUnits = resource.manual_units !== null
                    ? resource.manual_units
                    : (resource.related_units || 0);
                  
                  const subtotalSales = calculatedUnits * salesCostUd;
                  
                  const { error: updateError } = await supabase
                    .from('budget_activity_resources')
                    .update({ signed_subtotal: subtotalSales })
                    .eq('id', resource.id);
                  
                  if (updateError) {
                    console.error('Error updating signed_subtotal for resource:', resource.id, updateError);
                    throw updateError;
                  }
                }
                
                // Then mark the budget as signed
                const { error } = await supabase
                  .from('presupuestos')
                  .update({ 
                    is_signed: true,
                    signed_at: new Date().toISOString()
                  })
                  .eq('id', presupuesto.id);
                
                if (error) throw error;
                
                setPresupuesto({ 
                  ...presupuesto, 
                  is_signed: true,
                  signed_at: new Date().toISOString()
                });
              }}
              onComparativaOpcionesChange={async (value) => {
                try {
                  const { error } = await supabase
                    .from('presupuestos')
                    .update({ comparativa_opciones: value })
                    .eq('id', presupuesto.id);
                  if (error) throw error;
                  setPresupuesto({ ...presupuesto, comparativa_opciones: value });
                } catch (err) {
                  console.error('Error updating comparativa_opciones:', err);
                  toast.error('Error al guardar');
                }
              }}
              estimatedBudget={presupuesto.estimated_budget}
              onEstimatedBudgetChange={async (value) => {
                try {
                  const { error } = await supabase
                    .from('presupuestos')
                    .update({ estimated_budget: value })
                    .eq('id', presupuesto.id);
                  if (error) throw error;
                  setPresupuesto({ ...presupuesto, estimated_budget: value });
                } catch (err) {
                  console.error('Error updating estimated_budget:', err);
                  toast.error('Error al guardar presupuesto estimado');
                  throw err;
                }
              }}
            />
          </TabsContent>

          <TabsContent value="actividades" className="mt-6">
            {budgetMode === 'tolosa' ? (
              <TolosaBrainstormView budgetId={presupuesto.id} isAdmin={isAdmin} />
            ) : (
              <BudgetActivitiesTab 
                budgetId={presupuesto.id} 
                budgetName={presupuesto.nombre} 
                isAdmin={isAdmin}
                budgetStartDate={presupuesto.start_date}
                budgetEndDate={presupuesto.end_date}
                initialActivityId={selectedActivityId}
                onClearInitialActivityId={() => setSelectedActivityId(null)}
              />
            )}
          </TabsContent>

          <TabsContent value="fases" className="mt-6">
            <BudgetPhasesTab 
              budgetId={presupuesto.id} 
              isAdmin={isAdmin}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
              initialPhaseId={selectedPhaseId}
              estimatedBudget={presupuesto.estimated_budget}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-6 space-y-6">
            <HierarchicalGanttView 
              budgetId={presupuesto.id}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
              onPhaseClick={(phase) => {
                setSelectedPhaseId(phase.id);
                setActiveTab('fases');
              }}
              onActivityClick={(activity) => {
                setSelectedActivityId(activity.id);
                setActiveTab('actividades');
              }}
            />
            <BudgetTimelineView 
              budgetId={presupuesto.id}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
            />
          </TabsContent>

          <TabsContent value="recursos" className="mt-6">
            <BudgetResourcesTab budgetId={presupuesto.id} budgetName={presupuesto.nombre} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="contactos" className="mt-6">
            <BudgetContactsManager budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="areas-trabajo" className="mt-6">
            <BudgetWorkAreasTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="mediciones" className="mt-6">
            <BudgetMeasurementsTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="espacios" className="mt-6">
            <BudgetSpacesTab budgetId={presupuesto.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="plano" className="mt-6">
            <FloorPlanTab budgetId={presupuesto.id} budgetName={presupuesto.nombre} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="documentos" className="mt-6">
            <BudgetDocumentsTab 
              budgetId={presupuesto.id} 
              projectId={presupuesto.project_id} 
              projectName={project?.name || null}
              isAdmin={isAdmin} 
            />
          </TabsContent>

          <TabsContent value="agenda" className="mt-6">
            <BudgetAgendaTab 
              budgetId={presupuesto.id} 
              isAdmin={isAdmin}
              budgetStartDate={presupuesto.start_date}
              budgetEndDate={presupuesto.end_date}
              onBudgetDatesChange={(startDate, endDate) => {
                setPresupuesto(prev => prev ? { ...prev, start_date: startDate, end_date: endDate } : null);
              }}
              onNavigateToPhases={(phaseId) => {
                setSelectedPhaseId(phaseId || null);
                setActiveTab('fases');
              }}
              onNavigateToActivity={(activityId) => {
                setSelectedActivityId(activityId);
                setActiveTab('actividades');
              }}
            />
          </TabsContent>

          <TabsContent value="comunicaciones" className="mt-6">
            <BudgetCommunicationsTab 
              budgetId={presupuesto.id}
              budgetName={presupuesto.nombre}
              projectId={presupuesto.project_id}
              isAdmin={isAdmin} 
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="administracion" className="mt-6">
              <BudgetAdministracionTab budgetId={presupuesto.id} isAdmin={isAdmin} />
            </TabsContent>
          )}

          <TabsContent value="resumen" className="mt-6">
            <BudgetVisualSummary budgetId={presupuesto.id} budgetName={presupuesto.nombre} />
          </TabsContent>

          <TabsContent value="config" className="mt-6">
            <div className="space-y-6">
              {/* Client and Provider Manager */}
              <BudgetContactsManager budgetId={presupuesto.id} isAdmin={isAdmin} />
              
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
                        {portadaDisplayUrl ? (
                          <img 
                            src={portadaDisplayUrl} 
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
                            Actualiza las Uds relacionadas de todos los recursos basándose en las mediciones y el campo "Uso en Presupuesto" de cada actividad.
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
        </>
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
