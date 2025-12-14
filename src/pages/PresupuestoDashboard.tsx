import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calculator, ClipboardList, Building2, FileText, Settings, Calendar, Ruler, FileDown } from 'lucide-react';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { BudgetActivitiesTab } from '@/components/presupuestos/BudgetActivitiesTab';
import { BudgetPhasesTab } from '@/components/presupuestos/BudgetPhasesTab';
import { BudgetResourcesTab } from '@/components/presupuestos/BudgetResourcesTab';
import { BudgetMeasurementsTab } from '@/components/presupuestos/BudgetMeasurementsTab';
import { BudgetVisualSummary } from '@/components/presupuestos/BudgetVisualSummary';
import { BudgetVersionComparison } from '@/components/presupuestos/BudgetVersionComparison';
import { BudgetReportPreview } from '@/components/presupuestos/BudgetReportPreview';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string | null;
  project_id: string | null;
  created_at: string;
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
  const [activeTab, setActiveTab] = useState('actividades');
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);

  const isAdmin = roles.includes('administrador');

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
            <TabsTrigger value="actividades" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">QUÉ hay que hacer?</span>
            </TabsTrigger>
            <TabsTrigger value="fases" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">CUÁNDO se hace?</span>
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

          <TabsContent value="actividades" className="mt-6">
            <BudgetActivitiesTab budgetId={presupuesto.id} budgetName={presupuesto.nombre} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="fases" className="mt-6">
            <BudgetPhasesTab budgetId={presupuesto.id} isAdmin={isAdmin} />
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
                  <CardTitle>Configuración del Presupuesto</CardTitle>
                  <CardDescription>Ajustes y parámetros del presupuesto</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-center py-8">Próximamente</p>
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
    </div>
  );
}
