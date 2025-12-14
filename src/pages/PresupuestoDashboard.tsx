import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calculator, ClipboardList, Building2, FileText, Settings, Calendar, Ruler, BarChart3, FileDown } from 'lucide-react';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { BudgetActivitiesTab } from '@/components/presupuestos/BudgetActivitiesTab';
import { BudgetPhasesTab } from '@/components/presupuestos/BudgetPhasesTab';
import { BudgetResourcesTab } from '@/components/presupuestos/BudgetResourcesTab';
import { BudgetMeasurementsTab } from '@/components/presupuestos/BudgetMeasurementsTab';
import { BudgetVisualSummary } from '@/components/presupuestos/BudgetVisualSummary';
import { BudgetVersionComparison } from '@/components/presupuestos/BudgetVersionComparison';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { formatNumber } from '@/lib/format-utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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

// Format for PDF (simpler format without symbols)
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €';
};

export default function PresupuestoDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading, roles } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('actividades');
  const [isExporting, setIsExporting] = useState(false);

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

  // Combined PDF export function
  const exportCombinedPDF = useCallback(async () => {
    if (!presupuesto) return;
    
    setIsExporting(true);
    try {
      // Fetch all required data
      const [activitiesRes, phasesRes, resourcesRes, filesCountRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('id, name, code, description, measurement_unit, phase_id, measurement_id')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_phases')
          .select('id, name, code')
          .eq('budget_id', presupuesto.id)
          .order('code'),
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_activity_files')
          .select('activity_id'),
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (resourcesRes.error) throw resourcesRes.error;

      const activities = activitiesRes.data || [];
      const phases = phasesRes.data || [];
      const resources = resourcesRes.data || [];
      const filesData = filesCountRes.data || [];

      // Calculate files count per activity
      const filesCountMap = new Map<string, number>();
      filesData.forEach(f => {
        filesCountMap.set(f.activity_id, (filesCountMap.get(f.activity_id) || 0) + 1);
      });

      // Resource calculation helper
      const calculateFields = (resource: any) => {
        const externalCost = resource.external_unit_cost ?? 0;
        const safetyMargin = resource.safety_margin_percent ?? 0.15;
        const salesMargin = resource.sales_margin_percent ?? 0.25;
        const safetyMarginUd = externalCost * safetyMargin;
        const internalCostUd = externalCost + safetyMarginUd;
        const salesMarginUd = internalCostUd * salesMargin;
        const salesCostUd = internalCostUd + salesMarginUd;
        const manualUnits = resource.manual_units;
        const relatedUnits = resource.related_units ?? 0;
        const calculatedUnits = manualUnits !== null && manualUnits !== undefined ? manualUnits : relatedUnits;
        const subtotalSales = salesCostUd * calculatedUnits;
        return { salesCostUd, calculatedUnits, subtotalSales };
      };

      // Calculate activity resources subtotals
      const activityResourcesMap = new Map<string, number>();
      resources.forEach(r => {
        if (r.activity_id) {
          const fields = calculateFields(r);
          activityResourcesMap.set(r.activity_id, (activityResourcesMap.get(r.activity_id) || 0) + fields.subtotalSales);
        }
      });

      // Get phase info for activity
      const getPhaseInfo = (phaseId: string | null) => {
        if (!phaseId) return { code: '', name: '' };
        const phase = phases.find(p => p.id === phaseId);
        return { code: phase?.code || '', name: phase?.name || '' };
      };

      // Generate ActivityID
      const generateActivityId = (activity: any) => {
        const phaseInfo = getPhaseInfo(activity.phase_id);
        if (phaseInfo.code) {
          return `${phaseInfo.code} ${activity.code}.-${activity.name}`;
        }
        return `${activity.code}.-${activity.name}`;
      };

      // Calculate totals
      const totalResourcesSubtotal = resources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

      // Group resources by type
      const byType = resources.reduce((acc, r) => {
        const type = r.resource_type || 'Sin tipo';
        const fields = calculateFields(r);
        if (!acc[type]) acc[type] = { count: 0, total: 0 };
        acc[type].count++;
        acc[type].total += fields.subtotalSales;
        return acc;
      }, {} as Record<string, { count: number; total: number }>);

      // Create PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Company info
      const companyName = companySettings.name || 'Mi Empresa';
      const companyEmail = companySettings.email || '';
      const companyPhone = companySettings.phone || '';
      const companyAddress = companySettings.address || '';
      const companyWeb = companySettings.website || '';
      const companyInitials = companyName.substring(0, 2).toUpperCase();

      // Header with company branding
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
      doc.setTextColor(255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInitials, 26.5, 26, { align: 'center' });
      doc.setTextColor(0);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(companyName, 45, 18);
      doc.setTextColor(0);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      const contactLine = [companyEmail, companyPhone].filter(Boolean).join('  |  ');
      const addressLine = [companyAddress, companyWeb].filter(Boolean).join('  |  ');
      if (contactLine) doc.text(contactLine, 45, 24);
      if (addressLine) doc.text(addressLine, 45, 30);
      doc.setTextColor(0);

      // Separator line
      doc.setDrawColor(200);
      doc.line(14, 40, pageWidth - 14, 40);

      // Document title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME COMPLETO DE PRESUPUESTO', pageWidth / 2, 50, { align: 'center' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(presupuesto.nombre, pageWidth / 2, 58, { align: 'center' });

      const presupuestoId = `${presupuesto.nombre} (${presupuesto.codigo_correlativo}/${presupuesto.version}): ${presupuesto.poblacion}`;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(presupuestoId, pageWidth / 2, 65, { align: 'center' });
      doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 72, { align: 'center' });
      doc.setTextColor(0);

      // ======== SECTION 1: General Summary ========
      let yPos = 85;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('1. RESUMEN GENERAL', 14, yPos);
      doc.setTextColor(0);

      yPos += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const summaryData = [
        ['Total de actividades:', activities.length.toString()],
        ['Total de fases:', phases.length.toString()],
        ['Total de recursos:', resources.length.toString()],
      ];

      summaryData.forEach(([label, value]) => {
        doc.text(label, 14, yPos);
        doc.text(value, 80, yPos);
        yPos += 6;
      });

      // Total highlighted
      yPos += 4;
      doc.setFillColor(34, 197, 94);
      doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL PRESUPUESTO:', 18, yPos + 3);
      doc.text(formatPdfCurrency(totalResourcesSubtotal), pageWidth - 18, yPos + 3, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      // Breakdown by type
      yPos += 20;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('Desglose por Tipo de Recurso', 14, yPos);
      doc.setTextColor(0);

      yPos += 8;
      const typeData = Object.entries(byType).map(([type, data]) => [
        type,
        data.count.toString(),
        formatPdfCurrency(data.total)
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Tipo', 'Cantidad', 'Total']],
        body: typeData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });

      // ======== SECTION 2: Activities Summary ========
      doc.addPage();
      yPos = 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('2. RESUMEN DE ACTIVIDADES POR FASE', 14, yPos);
      doc.setTextColor(0);

      yPos += 10;

      // Build activities table data grouped by phase
      const activitiesTableData: any[] = [];

      // Unassigned activities first
      const unassigned = activities.filter(a => !a.phase_id);
      if (unassigned.length > 0) {
        const unassignedSubtotal = unassigned.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);
        activitiesTableData.push([
          { content: 'Sin fase asignada', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
          { content: formatPdfCurrency(unassignedSubtotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
        ]);
        unassigned.forEach(activity => {
          activitiesTableData.push([
            `  ${generateActivityId(activity)}`,
            activity.measurement_unit,
            (filesCountMap.get(activity.id) || 0).toString(),
            formatPdfCurrency(activityResourcesMap.get(activity.id) || 0)
          ]);
        });
      }

      // Phases with their activities
      phases.forEach(phase => {
        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
        if (phaseActivities.length === 0) return;

        const phaseSubtotal = phaseActivities.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);

        activitiesTableData.push([
          { content: `${phase.code || ''} ${phase.name}`, colSpan: 3, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: formatPdfCurrency(phaseSubtotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]);

        phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).forEach(activity => {
          activitiesTableData.push([
            `  ${generateActivityId(activity)}`,
            activity.measurement_unit,
            (filesCountMap.get(activity.id) || 0).toString(),
            formatPdfCurrency(activityResourcesMap.get(activity.id) || 0)
          ]);
        });
      });

      // Total row
      activitiesTableData.push([
        { content: 'TOTAL ACTIVIDADES', colSpan: 3, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
        { content: formatPdfCurrency(totalResourcesSubtotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['ActividadID', 'Unidad', 'Archivos', '€SubTotal']],
        body: activitiesTableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // ======== SECTION 3: Resources Detail ========
      doc.addPage();
      yPos = 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('3. DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD', 14, yPos);
      doc.setTextColor(0);

      yPos += 10;

      // Build resources table data
      const resourcesTableData: any[] = [];

      // Resources without activity
      const unassignedResources = resources.filter(r => !r.activity_id);
      if (unassignedResources.length > 0) {
        const unassignedTotal = unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
        resourcesTableData.push([
          { content: 'Sin actividad asignada', colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
          { content: formatPdfCurrency(unassignedTotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
        ]);
        unassignedResources.forEach(resource => {
          const fields = calculateFields(resource);
          resourcesTableData.push([
            `  ${resource.name}`,
            resource.resource_type || '-',
            resource.unit || '-',
            formatPdfCurrency(fields.salesCostUd),
            formatNumber(fields.calculatedUnits),
            formatPdfCurrency(fields.subtotalSales)
          ]);
        });
      }

      // Group by phase then activity
      phases.forEach(phase => {
        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
        const phaseResources = resources.filter(r => {
          const activity = activities.find(a => a.id === r.activity_id);
          return activity?.phase_id === phase.id;
        });

        if (phaseResources.length === 0) return;

        const phaseTotal = phaseResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

        // Phase header
        resourcesTableData.push([
          { content: `${phase.code || ''} ${phase.name}`, colSpan: 5, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: formatPdfCurrency(phaseTotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]);

        // Activities within phase
        phaseActivities.forEach(activity => {
          const activityResources = resources.filter(r => r.activity_id === activity.id);
          if (activityResources.length === 0) return;

          const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

          // Activity header
          resourcesTableData.push([
            { content: `  ${activity.code}.-${activity.name}`, colSpan: 5, styles: { fillColor: [219, 234, 254], fontStyle: 'italic' } },
            { content: formatPdfCurrency(activityTotal), styles: { fillColor: [219, 234, 254], fontStyle: 'italic', halign: 'right' } }
          ]);

          // Resources
          activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
            const fields = calculateFields(resource);
            resourcesTableData.push([
              `    ${resource.name}`,
              resource.resource_type || '-',
              resource.unit || '-',
              formatPdfCurrency(fields.salesCostUd),
              formatNumber(fields.calculatedUnits),
              formatPdfCurrency(fields.subtotalSales)
            ]);
          });
        });
      });

      // Activities without phase
      const activitiesWithoutPhase = activities.filter(a => !a.phase_id);
      activitiesWithoutPhase.forEach(activity => {
        const activityResources = resources.filter(r => r.activity_id === activity.id);
        if (activityResources.length === 0) return;

        const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

        resourcesTableData.push([
          { content: `${activity.code}.-${activity.name} (sin fase)`, colSpan: 5, styles: { fillColor: [254, 243, 199], fontStyle: 'italic' } },
          { content: formatPdfCurrency(activityTotal), styles: { fillColor: [254, 243, 199], fontStyle: 'italic', halign: 'right' } }
        ]);

        activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
          const fields = calculateFields(resource);
          resourcesTableData.push([
            `  ${resource.name}`,
            resource.resource_type || '-',
            resource.unit || '-',
            formatPdfCurrency(fields.salesCostUd),
            formatNumber(fields.calculatedUnits),
            formatPdfCurrency(fields.subtotalSales)
          ]);
        });
      });

      // Total row
      resourcesTableData.push([
        { content: 'TOTAL PRESUPUESTO', colSpan: 5, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
        { content: formatPdfCurrency(totalResourcesSubtotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Recurso', 'Tipo', 'Ud', '€Coste Venta', 'Uds', '€SubTotal']],
        body: resourcesTableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 25 },
          2: { cellWidth: 15 },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
        },
      });

      // Footer with company info on all pages
      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        doc.setDrawColor(200);
        doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);

        doc.setFontSize(7);
        doc.setTextColor(120);
        const footerInfo = [companyName, companyEmail, companyPhone].filter(Boolean).join(' | ');
        doc.text(footerInfo, 14, pageHeight - 14);

        doc.text(
          `Página ${i} de ${pageCount}`,
          pageWidth - 14,
          pageHeight - 14,
          { align: 'right' }
        );
      }

      // Save
      const fileName = `presupuesto_completo_${presupuesto.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      toast.success('Informe completo exportado correctamente');
    } catch (error) {
      console.error('Error exporting combined PDF:', error);
      toast.error('Error al exportar el informe');
    } finally {
      setIsExporting(false);
    }
  }, [presupuesto, companySettings]);

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
            onClick={exportCombinedPDF}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Informe PDF'}
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
    </div>
  );
}
