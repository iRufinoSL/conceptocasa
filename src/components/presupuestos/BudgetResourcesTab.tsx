import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Pencil, Trash2, Package, Wrench, Truck, Briefcase, FileSpreadsheet, Check, List, FolderTree, FileDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { getActivityMeasurementUnits } from '@/lib/budget-utils';
import { BudgetResourceForm } from './BudgetResourceForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { ResourcesGroupedView } from './ResourcesGroupedView';
import { ResourcesActivityGroupedView } from './ResourcesActivityGroupedView';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface BudgetResource {
  id: string;
  budget_id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
  description: string | null;
  created_at: string | null;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface BudgetResourcesTabProps {
  budgetId: string;
  budgetName: string;
  isAdmin: boolean;
}

// Format for PDF (simpler format without symbols)
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €';
};

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
};

const resourceTypeVariants: Record<string, string> = {
  'Producto': 'default',
  'Mano de obra': 'secondary',
  'Alquiler': 'outline',
  'Servicio': 'destructive',
};

// Field options for bulk edit
const BULK_EDIT_FIELDS = [
  { value: 'resource_type', label: 'Tipo recurso' },
  { value: 'unit', label: 'Ud medida' },
  { value: 'safety_margin_percent', label: '% Margen seguridad' },
  { value: 'sales_margin_percent', label: '% Margen venta' },
  { value: 'external_unit_cost', label: '€ Coste ud ext.' },
  { value: 'activity_id', label: 'Actividad' },
];

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

export function BudgetResourcesTab({ budgetId, budgetName, isAdmin }: BudgetResourcesTabProps) {
  const { settings: companySettings } = useCompanySettings();
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<BudgetResource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<BudgetResource | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grouped' | 'activity'>('list');
  
  // Expanded state for grouped views (lifted up to preserve state after edit)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  
  // Bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState<string | number>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch resources, activities, and phases in parallel
      const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name'),
        supabase
          .from('budget_activities')
          .select('id, code, name, phase_id')
          .eq('budget_id', budgetId)
          .order('code'),
        supabase
          .from('budget_phases')
          .select('id, code, name')
          .eq('budget_id', budgetId)
          .order('code'),
      ]);

      if (resourcesRes.error) throw resourcesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;

      setResources(resourcesRes.data || []);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los recursos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  // Real-time sync: Listen for measurement changes and update related_units
  useEffect(() => {
    // Subscribe to measurement changes
    const measurementsChannel = supabase
      .channel('measurements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_measurements'
        },
        async (payload) => {
          console.log('Measurement changed:', payload);
          
          // Find activities linked to this measurement
          const newRecord = payload.new as Record<string, any> | null;
          const oldRecord = payload.old as Record<string, any> | null;
          const measurementId = newRecord?.id || oldRecord?.id;
          if (!measurementId) return;
          
          const { data: affectedActivities } = await supabase
            .from('budget_activities')
            .select('id')
            .eq('measurement_id', measurementId)
            .eq('budget_id', budgetId);
          
          if (!affectedActivities || affectedActivities.length === 0) return;
          
          const activityIds = affectedActivities.map(a => a.id);
          
          // Update related_units for all resources linked to these activities
          for (const activityId of activityIds) {
            const relatedUnits = await getActivityMeasurementUnits(activityId);
            
            // Update in database
            await supabase
              .from('budget_activity_resources')
              .update({ related_units: relatedUnits })
              .eq('activity_id', activityId)
              .eq('budget_id', budgetId);
          }
          
          // Refresh local state
          fetchData();
          toast.info('Uds relacionadas actualizadas automáticamente');
        }
      )
      .subscribe();

    // Subscribe to measurement relations changes
    const relationsChannel = supabase
      .channel('measurement-relations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_measurement_relations'
        },
        async (payload) => {
          console.log('Measurement relation changed:', payload);
          
          // Get the measurement_id from the relation
          const newRecord = payload.new as Record<string, any> | null;
          const oldRecord = payload.old as Record<string, any> | null;
          const measurementId = newRecord?.measurement_id || oldRecord?.measurement_id;
          if (!measurementId) return;
          
          // Find activities linked to this measurement
          const { data: affectedActivities } = await supabase
            .from('budget_activities')
            .select('id')
            .eq('measurement_id', measurementId)
            .eq('budget_id', budgetId);
          
          if (!affectedActivities || affectedActivities.length === 0) return;
          
          const activityIds = affectedActivities.map(a => a.id);
          
          // Update related_units for all resources linked to these activities
          for (const activityId of activityIds) {
            const relatedUnits = await getActivityMeasurementUnits(activityId);
            
            await supabase
              .from('budget_activity_resources')
              .update({ related_units: relatedUnits })
              .eq('activity_id', activityId)
              .eq('budget_id', budgetId);
          }
          
          // Refresh local state
          fetchData();
          toast.info('Uds relacionadas actualizadas automáticamente');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(measurementsChannel);
      supabase.removeChannel(relationsChannel);
    };
  }, [budgetId]);

  // Listen for navigation events from Activities tab
  useEffect(() => {
    const handleNavigateToResources = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      
      if (detail?.action === 'new' && detail?.activityId) {
        // Open form with pre-selected activity
        setEditingResource(null);
        setFormOpen(true);
        // Store the pre-selected activity ID for the form
        window.sessionStorage.setItem('preselectedActivityId', detail.activityId);
      } else if (detail?.action === 'edit' && detail?.resourceId) {
        // Find and edit the resource - check local state first, then fetch if not found
        let resource = resources.find(r => r.id === detail.resourceId);
        
        if (!resource) {
          // Resource not in state yet - fetch it directly from DB
          const { data, error } = await supabase
            .from('budget_activity_resources')
            .select('*')
            .eq('id', detail.resourceId)
            .single();
          
          if (!error && data) {
            resource = data as BudgetResource;
          }
        }
        
        if (resource) {
          setEditingResource(resource);
          setFormOpen(true);
        } else {
          toast.error('Recurso no encontrado');
        }
      }
    };
    
    window.addEventListener('navigate-to-resources', handleNavigateToResources);
    return () => window.removeEventListener('navigate-to-resources', handleNavigateToResources);
  }, [resources]);

  // Listen for budget recalculation events
  useEffect(() => {
    const handleRecalculated = () => {
      fetchData();
    };
    window.addEventListener('budget-recalculated', handleRecalculated);
    return () => window.removeEventListener('budget-recalculated', handleRecalculated);
  }, []);

  // Get ActivityID for display
  const getActivityId = (activityId: string | null) => {
    if (!activityId) return '';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '';
    
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.-${activity.name}`;
  };

  // Calculate derived fields for a resource
  // Note: This uses the stored related_units from the database. For consistency with
  // BudgetActivitiesTab, make sure to recalculate via the "Recalcular" button if values seem stale.
  const calculateFields = useCallback((resource: BudgetResource) => {
    const externalCost = resource.external_unit_cost || 0;
    const safetyPercent = resource.safety_margin_percent ?? 0.15;
    const salesPercent = resource.sales_margin_percent ?? 0.25;
    
    const safetyMarginUd = externalCost * safetyPercent;
    const internalCostUd = externalCost + safetyMarginUd;
    const salesMarginUd = internalCostUd * salesPercent;
    const salesCostUd = internalCostUd + salesMarginUd;
    
    // Calculated units: if manual_units is defined (including 0), use it; otherwise use related_units
    const calculatedUnits = resource.manual_units !== null 
      ? resource.manual_units 
      : (resource.related_units || 0);
    
    const subtotalSales = calculatedUnits * salesCostUd;
    
    return {
      safetyMarginUd,
      internalCostUd,
      salesMarginUd,
      salesCostUd,
      calculatedUnits,
      subtotalSales,
    };
  }, []);

  // Filter resources by search term
  const filteredResources = useMemo(() => {
    if (!searchTerm) return resources;
    
    return resources.filter(resource => {
      const activityId = getActivityId(resource.activity_id);
      return (
        searchMatch(resource.name, searchTerm) ||
        searchMatch(resource.resource_type, searchTerm) ||
        searchMatch(resource.unit, searchTerm) ||
        searchMatch(activityId, searchTerm)
      );
    });
  }, [resources, searchTerm, activities, phases]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredResources.reduce((acc, resource) => {
      const fields = calculateFields(resource);
      return {
        subtotal: acc.subtotal + fields.subtotalSales,
        count: acc.count + 1,
      };
    }, { subtotal: 0, count: 0 });
  }, [filteredResources]);

  // Export resources to PDF with detailed cost breakdown
  const exportResourcesPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Company info from settings
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
    doc.text('DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD', pageWidth / 2, 50, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(budgetName, pageWidth / 2, 58, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 65, { align: 'center' });
    doc.setTextColor(0);

    // Summary section
    let yPos = 80;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('Resumen General', 14, yPos);
    doc.setTextColor(0);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Group by type
    const byType = resources.reduce((acc, r) => {
      const type = r.resource_type || 'Sin tipo';
      const fields = calculateFields(r);
      if (!acc[type]) acc[type] = { count: 0, total: 0 };
      acc[type].count++;
      acc[type].total += fields.subtotalSales;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);
    
    const summaryData = [
      ['Total de recursos:', resources.length.toString()],
      ['Total de actividades:', activities.length.toString()],
      ['Total de fases:', phases.length.toString()],
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
    doc.text('TOTAL €SubTotal Recursos:', 18, yPos + 3);
    doc.text(formatPdfCurrency(totals.subtotal), pageWidth - 18, yPos + 3, { align: 'right' });
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
    
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Detailed breakdown by phase and activity
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('Detalle por Fase y Actividad', 14, yPos);
    doc.setTextColor(0);
    
    yPos += 5;
    
    // Build table data
    const tableData: any[] = [];
    
    // Resources without activity
    const unassignedResources = resources.filter(r => !r.activity_id);
    if (unassignedResources.length > 0) {
      const unassignedTotal = unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
      tableData.push([
        { content: 'Sin actividad asignada', colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: formatPdfCurrency(unassignedTotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
      ]);
      unassignedResources.forEach(resource => {
        const fields = calculateFields(resource);
        tableData.push([
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
      tableData.push([
        { content: `${phase.code || ''} ${phase.name}`, colSpan: 5, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: formatPdfCurrency(phaseTotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
      ]);
      
      // Activities within phase
      phaseActivities.forEach(activity => {
        const activityResources = resources.filter(r => r.activity_id === activity.id);
        if (activityResources.length === 0) return;
        
        const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
        
        // Activity header
        tableData.push([
          { content: `  ${activity.code}.-${activity.name}`, colSpan: 5, styles: { fillColor: [219, 234, 254], fontStyle: 'italic' } },
          { content: formatPdfCurrency(activityTotal), styles: { fillColor: [219, 234, 254], fontStyle: 'italic', halign: 'right' } }
        ]);
        
        // Resources
        activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
          const fields = calculateFields(resource);
          tableData.push([
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
      
      tableData.push([
        { content: `${activity.code}.-${activity.name} (sin fase)`, colSpan: 5, styles: { fillColor: [254, 243, 199], fontStyle: 'italic' } },
        { content: formatPdfCurrency(activityTotal), styles: { fillColor: [254, 243, 199], fontStyle: 'italic', halign: 'right' } }
      ]);
      
      activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
        const fields = calculateFields(resource);
        tableData.push([
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
    tableData.push([
      { content: 'TOTAL PRESUPUESTO', colSpan: 5, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
      { content: formatPdfCurrency(totals.subtotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Recurso', 'Tipo', 'Ud', '€Coste Venta', 'Uds', '€SubTotal']],
      body: tableData,
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

    // Footer with company info
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
    const fileName = `recursos_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
    toast.success('PDF exportado correctamente');
  };

  const handleEdit = (resource: BudgetResource) => {
    setEditingResource(resource);
    setFormOpen(true);
  };

  const handleDelete = (resource: BudgetResource) => {
    setResourceToDelete(resource);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!resourceToDelete) return;
    
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .delete()
        .eq('id', resourceToDelete.id);
      
      if (error) throw error;
      
      toast.success('Recurso eliminado correctamente');
      fetchData();
    } catch (error) {
      console.error('Error deleting resource:', error);
      toast.error('Error al eliminar el recurso');
    } finally {
      setDeleteDialogOpen(false);
      setResourceToDelete(null);
    }
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingResource(null);
  };

  const handleFormSave = () => {
    fetchData();
    handleFormClose();
  };

  // Inline update handler
  const handleInlineUpdate = useCallback(async (id: string, field: string, value: any) => {
    try {
      // If changing activity_id, also update related_units from the activity's measurement
      if (field === 'activity_id') {
        const relatedUnits = value ? await getActivityMeasurementUnits(value) : null;
        
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({ 
            [field]: value,
            related_units: relatedUnits
          })
          .eq('id', id);
        
        if (error) throw error;
        
        // Update local state
        setResources(prev => prev.map(r => 
          r.id === id ? { ...r, [field]: value, related_units: relatedUnits } : r
        ));
      } else {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({ [field]: value })
          .eq('id', id);
        
        if (error) throw error;
        
        // Update local state
        setResources(prev => prev.map(r => 
          r.id === id ? { ...r, [field]: value } : r
        ));
      }
    } catch (error) {
      console.error('Error updating resource:', error);
      toast.error('Error al actualizar');
      throw error;
    }
  }, []);

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResources.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Bulk update handler
  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !bulkEditField) {
      toast.error('Selecciona filas y un campo a editar');
      return;
    }

    setIsBulkUpdating(true);
    try {
      let updateValue: any = bulkEditValue;
      
      // Handle percentage fields
      if (bulkEditField === 'safety_margin_percent' || bulkEditField === 'sales_margin_percent') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : (numVal > 1 ? numVal / 100 : numVal);
      } else if (bulkEditField === 'external_unit_cost') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : numVal;
      } else if (bulkEditField === 'activity_id' && bulkEditValue === '__none__') {
        updateValue = null;
      }

      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ [bulkEditField]: updateValue })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`${selectedIds.size} recursos actualizados`);
      setSelectedIds(new Set());
      setBulkEditField('');
      setBulkEditValue('');
      fetchData();
    } catch (error) {
      console.error('Error bulk updating:', error);
      toast.error('Error al actualizar recursos');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Bulk delete handler
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBulkUpdating(true);
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`${selectedIds.size} recursos eliminados`);
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Error al eliminar recursos');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Parse numbers - handles European (1.234,56) and standard (1234.56) formats, and currency symbols
  const parseNumber = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    
    // If already a number, return it directly
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }
    
    if (typeof val !== 'string' || val.trim() === '') return null;
    
    // Remove quotes, currency symbols, and whitespace
    let cleaned = val.replace(/^"|"$/g, '').replace(/[€$£¥]/g, '').trim();
    
    if (cleaned === '' || cleaned === '0') return cleaned === '0' ? 0 : null;
    
    // Detect format: if has comma as last separator, it's European
    const hasEuropeanFormat = /\d,\d{1,2}$/.test(cleaned);
    
    if (hasEuropeanFormat) {
      // European: 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Otherwise keep as is (standard format: 1234.56 or 15.00 €)
    
    // Remove any remaining non-numeric characters except . and -
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Find activity by its display ID (exact match or partial match)
  const findActivityId = (activityIdField: string | null | undefined): string | null => {
    if (!activityIdField || typeof activityIdField !== 'string') return null;
    
    const cleanField = activityIdField.trim();
    // If empty or "0", return null (no activity)
    if (!cleanField || cleanField === '0') return null;
    
    // Try exact match first
    const matchingActivity = activities.find(a => {
      const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
      const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
      return fullId === cleanField || fullId.toLowerCase() === cleanField.toLowerCase();
    });
    
    if (matchingActivity) return matchingActivity.id;
    
    // Try partial match on name or code
    const partialMatch = activities.find(a => {
      const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
      const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
      return fullId.toLowerCase().includes(cleanField.toLowerCase()) ||
             cleanField.toLowerCase().includes(a.name.toLowerCase());
    });
    
    return partialMatch?.id || null;
  };

  // Process row data (from CSV or Excel)
  const processRowData = (
    row: Record<string, any>,
    existingNames: Set<string>
  ): {
    budget_id: string;
    name: string;
    external_unit_cost: number | null;
    unit: string | null;
    resource_type: string | null;
    safety_margin_percent: number;
    sales_margin_percent: number;
    manual_units: number | null;
    related_units: number | null;
    activity_id: string | null;
  } | null => {
    // Try to get value by multiple possible column names
    const getValue = (keys: string[]) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') {
          return row[key];
        }
      }
      return null;
    };
    
    // Column names match exactly the user's Excel headers
    const name = String(getValue(['Recurso']) || '').replace(/^"|"$/g, '').trim();
    
    // Debug: log first row to see column names
    if (existingNames.size === 0) {
      console.log('Import - First row data:', row);
      console.log('Import - Available columns:', Object.keys(row));
    }
    
    if (!name) {
      console.log('Import - Skipping row with empty name:', row);
      return null;
    }
    
    // Skip duplicates
    const nameLower = name.toLowerCase();
    if (existingNames.has(nameLower)) return null;
    existingNames.add(nameLower);
    
    const externalCost = parseNumber(getValue(['€Coste ud']));
    const unit = String(getValue(['Ud medida']) || '').replace(/^"|"$/g, '').trim() || null;
    const resourceType = String(getValue(['Tipo recurso']) || '').replace(/^"|"$/g, '').trim() || null;
    
    // Default percentages (these fields are not in the import)
    const safetyPercent = 0.15;
    const salesPercent = 0.25;
    
    const manualUnits = parseNumber(getValue(['Uds manual']));
    const relatedUnits = parseNumber(getValue(['Uds relacionadas']));
    const activityIdField = String(getValue(['ActividadID']) || '').replace(/^"|"$/g, '').trim();
    
    return {
      budget_id: budgetId,
      name,
      external_unit_cost: externalCost,
      unit,
      resource_type: resourceType,
      safety_margin_percent: safetyPercent,
      sales_margin_percent: salesPercent,
      manual_units: manualUnits,
      related_units: relatedUnits,
      activity_id: findActivityId(activityIdField),
    };
  };

  // Import resources from parsed data
  const importResources = async (
    resourcesData: Array<{
      budget_id: string;
      name: string;
      external_unit_cost: number | null;
      unit: string | null;
      resource_type: string | null;
      safety_margin_percent: number;
      sales_margin_percent: number;
      manual_units: number | null;
      related_units: number | null;
      activity_id: string | null;
    }>,
    totalRows: number
  ) => {
    if (resourcesData.length === 0) {
      toast.info('No se encontraron recursos nuevos para importar (posibles duplicados)');
      return;
    }
    
    const skipped = totalRows - resourcesData.length;
    const batchSize = 50;
    let imported = 0;
    
    for (let i = 0; i < resourcesData.length; i += batchSize) {
      const batch = resourcesData.slice(i, i + batchSize);
      const { error } = await supabase
        .from('budget_activity_resources')
        .insert(batch);
      
      if (error) throw error;
      imported += batch.length;
    }
    
    const skippedMsg = skipped > 0 ? ` (${skipped} duplicados omitidos)` : '';
    toast.success(`${imported} recursos importados correctamente${skippedMsg}`);
    fetchData();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const existingNames = new Set(resources.map(r => r.name.toLowerCase().trim()));

    try {
      if (isExcel) {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        
        const resourcesData: Array<ReturnType<typeof processRowData>> = [];
        
        for (const row of jsonData) {
          const processed = processRowData(row, existingNames);
          if (processed) resourcesData.push(processed);
        }
        
        await importResources(
          resourcesData.filter((r): r is NonNullable<typeof r> => r !== null),
          jsonData.length
        );
      } else {
        // Handle CSV file
        const text = await file.text();
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split('\n');
        
        if (lines.length < 2) {
          toast.error('El archivo CSV está vacío o no tiene datos');
          return;
        }
        
        // Parse header row to get column positions
        const headerLine = lines[0];
        const headers: string[] = [];
        let current = '';
        let inQuotes = false;
        
        // Detect delimiter: semicolon or comma
        const delimiter = headerLine.includes(';') ? ';' : ',';
        
        for (const char of headerLine) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            headers.push(current.replace(/^"|"$/g, '').trim());
            current = '';
          } else {
            current += char;
          }
        }
        headers.push(current.replace(/^"|"$/g, '').trim());
        
        const resourcesData: Array<ReturnType<typeof processRowData>> = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Parse CSV line with proper handling of quoted fields
          const values: string[] = [];
          current = '';
          inQuotes = false;
          
          for (const char of line) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          
          // Create row object from values
          const row: Record<string, string> = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });
          
          const processed = processRowData(row, existingNames);
          if (processed) resourcesData.push(processed);
        }
        
        await importResources(
          resourcesData.filter((r): r is NonNullable<typeof r> => r !== null),
          lines.filter((l, i) => i > 0 && l.trim()).length
        );
      }
    } catch (error) {
      console.error('Error importing file:', error);
      toast.error(`Error al importar el archivo ${isExcel ? 'Excel' : 'CSV'}`);
    }
    
    // Reset input
    event.target.value = '';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>CÓMO hacer? - Recursos</CardTitle>
            <CardDescription>
              Gestión de recursos del presupuesto ({resources.length} recursos)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportResourcesPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            {isAdmin && (
              <>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Importar CSV/Excel
                    </span>
                  </Button>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Recurso
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Summary */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar recursos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => setViewMode('list')}
                  title="Lista alfabética"
                >
                  <List className="h-4 w-4 mr-1" />
                  Lista
                </Button>
                <Button
                  variant={viewMode === 'activity' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-none border-x"
                  onClick={() => setViewMode('activity')}
                  title="Agrupado por Actividad"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Actividad
                </Button>
                <Button
                  variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setViewMode('grouped')}
                  title="Agrupado por Fase y Actividad"
                >
                  <FolderTree className="h-4 w-4 mr-1" />
                  Fase
                </Button>
              </div>
              <Badge variant="secondary" className="text-sm">
                {filteredResources.length} recursos
              </Badge>
              <Badge variant="default" className="text-sm">
                Total: {formatCurrency(totals.subtotal)}
              </Badge>
            </div>
          </div>

          {/* Bulk Edit Bar */}
          {isAdmin && selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg border">
              <Badge variant="secondary">
                {selectedIds.size} seleccionados
              </Badge>
              <div className="flex items-center gap-2">
                <Select value={bulkEditField} onValueChange={setBulkEditField}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Campo a editar" />
                  </SelectTrigger>
                  <SelectContent>
                    {BULK_EDIT_FIELDS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {bulkEditField === 'resource_type' && (
                  <Select value={String(bulkEditValue)} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {bulkEditField === 'unit' && (
                  <Select value={String(bulkEditValue)} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue placeholder="Ud" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {bulkEditField === 'activity_id' && (
                  <Select value={String(bulkEditValue || '__none__')} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue placeholder="Actividad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin actividad</SelectItem>
                      {activities.map(a => {
                        const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            {phase?.code || ''} {a.code}.-{a.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                
                {(bulkEditField === 'safety_margin_percent' || bulkEditField === 'sales_margin_percent') && (
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={typeof bulkEditValue === 'number' ? bulkEditValue * 100 : 0}
                      onChange={(v) => setBulkEditValue(v / 100)}
                      decimals={1}
                      className="w-[80px] h-9"
                      placeholder="%"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                )}
                
                {bulkEditField === 'external_unit_cost' && (
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={typeof bulkEditValue === 'number' ? bulkEditValue : 0}
                      onChange={(v) => setBulkEditValue(v)}
                      decimals={2}
                      className="w-[100px] h-9"
                      placeholder="€"
                    />
                    <span className="text-muted-foreground text-sm">€</span>
                  </div>
                )}
              </div>
              
              <Button 
                size="sm" 
                onClick={handleBulkUpdate} 
                disabled={!bulkEditField || isBulkUpdating}
              >
                <Check className="h-4 w-4 mr-1" />
                Aplicar
              </Button>
              
              <div className="h-6 w-px bg-border mx-1" />
              
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={isBulkUpdating}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar ({selectedIds.size})
              </Button>
              
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkEditField('');
                  setBulkEditValue('');
                }}
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* Resources View */}
          {viewMode === 'grouped' ? (
            <ResourcesGroupedView
              resources={filteredResources}
              activities={activities}
              phases={phases}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onInlineUpdate={handleInlineUpdate}
              calculateFields={calculateFields}
              getActivityId={getActivityId}
              expandedPhases={expandedPhases}
              expandedActivities={expandedActivities}
              onExpandedPhasesChange={setExpandedPhases}
              onExpandedActivitiesChange={setExpandedActivities}
            />
          ) : viewMode === 'activity' ? (
            <ResourcesActivityGroupedView
              resources={filteredResources}
              activities={activities}
              phases={phases}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onInlineUpdate={handleInlineUpdate}
              calculateFields={calculateFields}
              getActivityId={getActivityId}
              expandedActivities={expandedActivities}
              onExpandedActivitiesChange={setExpandedActivities}
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedIds.size === filteredResources.length && filteredResources.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="min-w-[200px]">Recurso</TableHead>
                    <TableHead className="text-right">€Coste ud ext.</TableHead>
                    <TableHead>Ud</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">%Seg.</TableHead>
                    <TableHead className="text-right">€Seg.</TableHead>
                    <TableHead className="text-right">€Coste int.</TableHead>
                    <TableHead className="text-right">%Venta</TableHead>
                    <TableHead className="text-right">€Venta</TableHead>
                    <TableHead className="text-right">€Coste venta</TableHead>
                    <TableHead className="text-right">Uds man.</TableHead>
                    <TableHead className="text-right">Uds rel.</TableHead>
                    <TableHead className="text-right">Uds calc.</TableHead>
                    <TableHead className="text-right">€Subtotal</TableHead>
                    <TableHead className="min-w-[200px]">Actividad</TableHead>
                    {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 18 : 15} className="text-center text-muted-foreground py-8">
                        {searchTerm ? 'No se encontraron recursos' : 'No hay recursos. Añade uno nuevo o importa desde CSV/Excel.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResources.map((resource) => {
                      const fields = calculateFields(resource);
                      const activityDisplay = getActivityId(resource.activity_id);
                      
                      const unitOptions = UNITS.map(u => ({ value: u, label: u }));
                      const typeOptions = RESOURCE_TYPES.map(t => ({ value: t, label: t }));
                      const activityOptions = activities.map(a => {
                        const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
                        return {
                          value: a.id,
                          label: `${phase?.code || ''} ${a.code}.-${a.name}`,
                        };
                      });
                      
                      return (
                        <TableRow key={resource.id} className={selectedIds.has(resource.id) ? 'bg-muted/50' : ''}>
                          {isAdmin && (
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(resource.id)}
                                onCheckedChange={() => toggleSelect(resource.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            <ResourceInlineEdit
                              value={resource.name}
                              displayValue={resource.name}
                              onSave={(v) => handleInlineUpdate(resource.id, 'name', v)}
                              type="text"
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.external_unit_cost}
                              displayValue={formatCurrency(resource.external_unit_cost || 0)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'external_unit_cost', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell>
                            <ResourceInlineEdit
                              value={resource.unit}
                              displayValue={resource.unit || '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'unit', v)}
                              type="select"
                              options={unitOptions}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell>
                            <ResourceInlineEdit
                              value={resource.resource_type}
                              displayValue={
                                resource.resource_type ? (
                                  <Badge variant={resourceTypeVariants[resource.resource_type] as any || 'secondary'}>
                                    {resourceTypeIcons[resource.resource_type]}
                                    <span className="ml-1">{resource.resource_type}</span>
                                  </Badge>
                                ) : '-'
                              }
                              onSave={(v) => handleInlineUpdate(resource.id, 'resource_type', v)}
                              type="select"
                              options={typeOptions}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={(resource.safety_margin_percent ?? 0.15) * 100}
                              displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'safety_margin_percent', Math.max(0, v) / 100)}
                              type="percent"
                              decimals={1}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.safetyMarginUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.internalCostUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={(resource.sales_margin_percent ?? 0.25) * 100}
                              displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'sales_margin_percent', Math.max(0, v) / 100)}
                              type="percent"
                              decimals={1}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.salesMarginUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(fields.salesCostUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.manual_units}
                              displayValue={resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'manual_units', v)}
                              type="number"
                              decimals={2}
                              allowNull={true}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.related_units}
                              displayValue={resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'related_units', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatNumber(fields.calculatedUnits)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-primary">
                            {formatCurrency(fields.subtotalSales)}
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px]">
                            <ResourceInlineEdit
                              value={resource.activity_id}
                              displayValue={activityDisplay || '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'activity_id', v)}
                              type="select"
                              options={activityOptions}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(resource)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(resource)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resource Form Dialog */}
      <BudgetResourceForm
        open={formOpen}
        onOpenChange={handleFormClose}
        budgetId={budgetId}
        resource={editingResource}
        activities={activities}
        phases={phases}
        onSave={handleFormSave}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Eliminar recurso"
        description={`¿Estás seguro de que deseas eliminar el recurso "${resourceToDelete?.name}"? Esta acción no se puede deshacer.`}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={handleBulkDelete}
        title="Eliminar recursos seleccionados"
        description={`¿Estás seguro de que deseas eliminar ${selectedIds.size} recursos seleccionados? Esta acción no se puede deshacer.`}
      />
    </>
  );
}
