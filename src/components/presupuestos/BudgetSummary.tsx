import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { percentToRatio } from '@/lib/budget-pricing';
import { Calculator, TrendingUp, Percent, Euro, Package, FileDown, ChevronDown, List, Layers, MapPin, LayoutGrid } from 'lucide-react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface BudgetResource {
  id: string;
  name: string;
  description: string | null;
  resource_type: string | null;
  unit: string | null;
  manual_units: number | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  activity_id: string | null;
}

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  opciones: string[];
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface ActivityLink {
  work_area_id: string;
  activity_id: string;
}

interface BudgetSummaryProps {
  budgetId: string;
  budgetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format for PDF (simpler format without symbols)
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value) + ' €';
};

const OPCIONES = ['A', 'B', 'C'];
const LEVEL_ORDER = [
  'Cota 0 terreno',
  'Nivel 1',
  'Nivel 2',
  'Nivel 3',
  'Terrazas',
  'Cubiertas',
  'Vivienda'
];

export function BudgetSummary({ budgetId, budgetName, open, onOpenChange }: BudgetSummaryProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [activityLinks, setActivityLinks] = useState<ActivityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings: companySettings } = useCompanySettings();

  useEffect(() => {
    if (open && budgetId) {
      fetchData();
    }
  }, [open, budgetId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resourcesRes, workAreasRes, activitiesRes, phasesRes, linksRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name'),
        supabase
          .from('budget_work_areas')
          .select('id, name, level, work_area')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_activities')
          .select('id, name, code, opciones, phase_id')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_phases')
          .select('id, code, name')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_work_area_activities')
          .select('work_area_id, activity_id')
      ]);

      if (resourcesRes.error) throw resourcesRes.error;
      if (workAreasRes.error) throw workAreasRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (linksRes.error) throw linksRes.error;

      setResources(resourcesRes.data || []);
      setWorkAreas(workAreasRes.data || []);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
      
      // Filter links to only include work areas from this budget
      const workAreaIds = new Set((workAreasRes.data || []).map(wa => wa.id));
      setActivityLinks((linksRes.data || []).filter(l => workAreaIds.has(l.work_area_id)));
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const calculations = useMemo(() => {
    let totalBaseCost = 0;
    let totalWithSafety = 0;
    let totalWithMargins = 0;

    const resourceDetails = resources.map(resource => {
      const units = resource.manual_units || 0;
      const unitCost = resource.external_unit_cost || 0;

      const safetyRatio = percentToRatio(resource.safety_margin_percent, 0.15);
      const salesRatio = percentToRatio(resource.sales_margin_percent, 0.25);

      const baseCost = units * unitCost;
      const withSafety = baseCost * (1 + safetyRatio);
      const withMargins = withSafety * (1 + salesRatio);

      totalBaseCost += baseCost;
      totalWithSafety += withSafety;
      totalWithMargins += withMargins;

      return {
        ...resource,
        units,
        unitCost,
        safetyPercent: safetyRatio * 100,
        salesPercent: salesRatio * 100,
        baseCost,
        withSafety,
        withMargins
      };
    });

    // Group by resource type
    const byType = resourceDetails.reduce((acc, r) => {
      const type = r.resource_type || 'Sin tipo';
      if (!acc[type]) {
        acc[type] = { count: 0, total: 0 };
      }
      acc[type].count++;
      acc[type].total += r.withMargins;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return {
      resources: resourceDetails,
      totalBaseCost,
      totalWithSafety,
      totalWithMargins,
      totalSafetyMargin: totalWithSafety - totalBaseCost,
      totalSalesMargin: totalWithMargins - totalWithSafety,
      byType,
      resourceCount: resources.length
    };
  }, [resources]);

  // Calculate activity subtotals from resources
  const activitySubtotals = useMemo(() => {
    const subtotals = new Map<string, number>();
    resources.forEach(resource => {
      if (!resource.activity_id) return;
      const units = resource.manual_units || 0;
      const unitCost = resource.external_unit_cost || 0;
      const safetyRatio = percentToRatio(resource.safety_margin_percent, 0.15);
      const salesRatio = percentToRatio(resource.sales_margin_percent, 0.25);
      const total = units * unitCost * (1 + safetyRatio) * (1 + salesRatio);
      subtotals.set(resource.activity_id, (subtotals.get(resource.activity_id) || 0) + total);
    });
    return subtotals;
  }, [resources]);

  // Calculate hierarchical data by option
  const hierarchicalData = useMemo(() => {
    const result: Record<string, {
      levels: Record<string, {
        workAreas: {
          workArea: WorkArea;
          activities: { activity: Activity; subtotal: number }[];
          subtotal: number;
        }[];
        subtotal: number;
      }>;
      activitiesWithoutWorkArea: { activity: Activity; subtotal: number }[];
      subtotal: number;
    }> = {};

    const activityMap = new Map(activities.map(a => [a.id, a]));
    const activityWorkAreaMap = new Map<string, string[]>();
    activityLinks.forEach(link => {
      if (!activityWorkAreaMap.has(link.activity_id)) {
        activityWorkAreaMap.set(link.activity_id, []);
      }
      activityWorkAreaMap.get(link.activity_id)!.push(link.work_area_id);
    });

    // Find activities without work areas
    const allLinkedActivityIds = new Set(activityLinks.map(l => l.activity_id));
    const activitiesWithoutWorkArea = activities.filter(a => !allLinkedActivityIds.has(a.id));

    OPCIONES.forEach(option => {
      const levels: Record<string, {
        workAreas: {
          workArea: WorkArea;
          activities: { activity: Activity; subtotal: number }[];
          subtotal: number;
        }[];
        subtotal: number;
      }> = {};

      let totalOptionSubtotal = 0;

      workAreas.forEach(area => {
        const linkedActivityIds = activityLinks
          .filter(l => l.work_area_id === area.id)
          .map(l => l.activity_id);
        
        const activitiesForOption = linkedActivityIds
          .map(id => activityMap.get(id))
          .filter((a): a is Activity => a !== undefined && (a.opciones || []).includes(option));

        if (activitiesForOption.length === 0) return;

        const activitiesWithSubtotals = activitiesForOption.map(a => ({
          activity: a,
          subtotal: activitySubtotals.get(a.id) || 0
        }));
        const areaSubtotal = activitiesWithSubtotals.reduce((sum, a) => sum + a.subtotal, 0);
        totalOptionSubtotal += areaSubtotal;

        if (!levels[area.level]) {
          levels[area.level] = { workAreas: [], subtotal: 0 };
        }

        levels[area.level].workAreas.push({
          workArea: area,
          activities: activitiesWithSubtotals,
          subtotal: areaSubtotal,
        });
        levels[area.level].subtotal += areaSubtotal;
      });

      // Sort work areas alphabetically
      Object.values(levels).forEach(level => {
        level.workAreas.sort((a, b) => a.workArea.name.localeCompare(b.workArea.name));
      });

      // Activities without work area for this option
      const unassignedForOption = activitiesWithoutWorkArea
        .filter(a => (a.opciones || []).includes(option))
        .map(a => ({
          activity: a,
          subtotal: activitySubtotals.get(a.id) || 0
        }));
      const unassignedSubtotal = unassignedForOption.reduce((sum, a) => sum + a.subtotal, 0);
      totalOptionSubtotal += unassignedSubtotal;

      result[option] = {
        levels,
        activitiesWithoutWorkArea: unassignedForOption,
        subtotal: totalOptionSubtotal,
      };
    });

    return result;
  }, [workAreas, activities, activityLinks, activitySubtotals]);

  const exportToPDF = () => {
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
    // Logo placeholder (colored rectangle with initials)
    doc.setFillColor(37, 99, 235); // Primary blue
    doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInitials, 26.5, 26, { align: 'center' });
    doc.setTextColor(0);
    
    // Company name and contact
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
    doc.text('RESUMEN DE PRESUPUESTO', pageWidth / 2, 50, { align: 'center' });
    
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
    
    const summaryData = [
      ['Total de recursos:', calculations.resourceCount.toString()],
      ['Coste base:', formatPdfCurrency(calculations.totalBaseCost)],
      ['Margen de seguridad:', formatPdfCurrency(calculations.totalSafetyMargin)],
      ['Margen comercial:', formatPdfCurrency(calculations.totalSalesMargin)],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total PVP highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94); // Green
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PVP:', 18, yPos + 3);
    doc.text(formatPdfCurrency(calculations.totalWithMargins), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0)
    doc.setFont('helvetica', 'normal');

    // Breakdown by type
    if (Object.keys(calculations.byType).length > 0) {
      yPos += 20;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('Desglose por Tipo de Recurso', 14, yPos);
      doc.setTextColor(0);
      
      yPos += 8;
      const typeData = Object.entries(calculations.byType).map(([type, data]) => [
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
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Resource details table
    if (calculations.resources.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('Detalle de Recursos', 14, yPos);
      doc.setTextColor(0);
      
      const tableData = calculations.resources.map(r => [
        r.name,
        r.resource_type || '-',
        `${formatNumber(r.units)} ${r.unit || ''}`.trim(),
        formatPdfCurrency(r.unitCost),
        `${formatNumber(r.safetyPercent, 0)}%`,
        `${formatNumber(r.salesPercent, 0)}%`,
        formatPdfCurrency(r.withMargins)
      ]);
      
      // Add total row
      tableData.push([
        { content: 'TOTAL PVP', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } } as any,
        { content: formatPdfCurrency(calculations.totalWithMargins), styles: { fontStyle: 'bold' } } as any
      ]);
      
      autoTable(doc, {
        startY: yPos + 5,
        head: [['Recurso', 'Tipo', 'Uds.', 'Coste/Ud.', 'Seg.', 'Margen', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 25 },
          2: { cellWidth: 20, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 15, halign: 'right' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 30, halign: 'right' },
        },
      });
    }

    // Footer with company info
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Footer line
      doc.setDrawColor(200);
      doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
      
      // Company info in footer
      doc.setFontSize(7);
      doc.setTextColor(120);
      const footerInfo = [companyName, companyEmail, companyPhone].filter(Boolean).join(' | ');
      doc.text(footerInfo, 14, pageHeight - 14);
      
      // Page number
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - 14,
        pageHeight - 14,
        { align: 'right' }
      );
    }

    // Save
    const fileName = `presupuesto_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_recursos_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  };

  const exportHierarchicalPDF = () => {
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
    
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE PRESUPUESTO - JERARQUÍA POR OPCIONES', pageWidth / 2, 50, { align: 'center' });
    
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
    
    const summaryData = [
      ['Total de recursos:', calculations.resourceCount.toString()],
      ['Coste base:', formatPdfCurrency(calculations.totalBaseCost)],
      ['Margen de seguridad:', formatPdfCurrency(calculations.totalSafetyMargin)],
      ['Margen comercial:', formatPdfCurrency(calculations.totalSalesMargin)],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total PVP highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PVP:', 18, yPos + 3);
    doc.text(formatPdfCurrency(calculations.totalWithMargins), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    yPos += 20;

    // Option colors for PDF
    const optionColors: Record<string, [number, number, number]> = {
      'A': [59, 130, 246], // blue
      'B': [168, 85, 247], // purple
      'C': [34, 197, 94],  // green
    };

    // Iterate through each option
    OPCIONES.forEach(option => {
      const optionData = hierarchicalData[option];
      if (optionData.subtotal === 0) return; // Skip empty options

      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // Option header
      doc.setFillColor(...optionColors[option]);
      doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`OPCIÓN ${option}`, 18, yPos + 3);
      doc.text(formatPdfCurrency(optionData.subtotal), pageWidth - 18, yPos + 3, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      yPos += 15;

      // Levels within option
      const levelKeys = LEVEL_ORDER.filter(l => optionData.levels[l]);
      levelKeys.forEach(level => {
        const levelData = optionData.levels[level];
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }

        // Level header
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos - 4, pageWidth - 28, 8, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${level}`, 18, yPos + 2);
        doc.text(formatPdfCurrency(levelData.subtotal), pageWidth - 18, yPos + 2, { align: 'right' });
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        
        yPos += 10;

        // Work areas within level
        levelData.workAreas.forEach(({ workArea, activities: waActivities, subtotal: waSubtotal }) => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          // Work area header
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`  ${workArea.name} (${workArea.work_area})`, 18, yPos);
          doc.text(formatPdfCurrency(waSubtotal), pageWidth - 18, yPos, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          
          yPos += 6;

          // Activities table for this work area
          if (waActivities.length > 0) {
            const activityData = waActivities.map(({ activity, subtotal }) => [
              `    ${activity.code}`,
              activity.name,
              formatPdfCurrency(subtotal)
            ]);

            autoTable(doc, {
              startY: yPos,
              head: [['Código', 'Actividad', 'SubTotal']],
              body: activityData,
              theme: 'plain',
              headStyles: { 
                fillColor: [255, 255, 255], 
                textColor: [100, 100, 100],
                fontSize: 7,
                fontStyle: 'bold'
              },
              bodyStyles: { fontSize: 7 },
              margin: { left: 24, right: 14 },
              columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 30, halign: 'right' },
              },
            });

            yPos = (doc as any).lastAutoTable.finalY + 5;
          }
        });
      });

      // Activities without work area
      if (optionData.activitiesWithoutWorkArea.length > 0) {
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }

        const unassignedSubtotal = optionData.activitiesWithoutWorkArea.reduce((sum, a) => sum + a.subtotal, 0);
        
        doc.setFillColor(254, 243, 199);
        doc.rect(14, yPos - 4, pageWidth - 28, 8, 'F');
        doc.setTextColor(146, 64, 14);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Sin Área de Trabajo', 18, yPos + 2);
        doc.text(formatPdfCurrency(unassignedSubtotal), pageWidth - 18, yPos + 2, { align: 'right' });
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        
        yPos += 10;

        const activityData = optionData.activitiesWithoutWorkArea.map(({ activity, subtotal }) => [
          activity.code,
          activity.name,
          formatPdfCurrency(subtotal)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Código', 'Actividad', 'SubTotal']],
          body: activityData,
          theme: 'plain',
          headStyles: { 
            fillColor: [255, 255, 255], 
            textColor: [100, 100, 100],
            fontSize: 7,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 7 },
          margin: { left: 24, right: 14 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 30, halign: 'right' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      yPos += 10;
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

    const fileName = `presupuesto_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_jerarquia_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  };

  // Helper function to generate activity label with format: PhaseCode ActivityCode.- ActivityName
  const getActivityLabel = (activity: Activity): string => {
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code || ''}.- ${activity.name || ''}`.trim();
  };

  const exportDondePDF = () => {
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
    
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DÓNDE? - LISTADO POR OPCIONES', pageWidth / 2, 50, { align: 'center' });
    
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
    
    const summaryData = [
      ['Total de recursos:', calculations.resourceCount.toString()],
      ['Coste base:', formatPdfCurrency(calculations.totalBaseCost)],
      ['Margen de seguridad:', formatPdfCurrency(calculations.totalSafetyMargin)],
      ['Margen comercial:', formatPdfCurrency(calculations.totalSalesMargin)],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total PVP highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PVP:', 18, yPos + 3);
    doc.text(formatPdfCurrency(calculations.totalWithMargins), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    yPos += 20;

    // Option colors for PDF
    const optionColors: Record<string, [number, number, number]> = {
      'A': [59, 130, 246], // blue
      'B': [168, 85, 247], // purple
      'C': [34, 197, 94],  // green
    };

    // Build table data for each option with expanded hierarchy
    OPCIONES.forEach(option => {
      const optionData = hierarchicalData[option];
      if (optionData.subtotal === 0) return; // Skip empty options

      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // Option header
      doc.setFillColor(...optionColors[option]);
      doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`OPCIÓN ${option}`, 18, yPos + 3);
      doc.text(formatPdfCurrency(optionData.subtotal), pageWidth - 18, yPos + 3, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      yPos += 15;

      // Build table data: Opción | Nivel | Área de Trabajo | Actividad | SubTotal
      const tableData: (string | { content: string; styles?: object })[][] = [];

      const levelKeys = LEVEL_ORDER.filter(l => optionData.levels[l]);
      levelKeys.forEach(level => {
        const levelData = optionData.levels[level];
        
        // Sort activities within each work area by their label
        levelData.workAreas.forEach(({ workArea, activities: waActivities, subtotal: waSubtotal }) => {
          const sortedActivities = [...waActivities].sort((a, b) => {
            const labelA = getActivityLabel(a.activity);
            const labelB = getActivityLabel(b.activity);
            return labelA.localeCompare(labelB, 'es', { numeric: true });
          });

          sortedActivities.forEach(({ activity, subtotal }, index) => {
            tableData.push([
              index === 0 ? level : '',
              index === 0 ? `${workArea.name} (${workArea.work_area})` : '',
              getActivityLabel(activity),
              formatPdfCurrency(subtotal)
            ]);
          });

          // Add work area subtotal row
          tableData.push([
            { content: '', styles: {} },
            { content: `SubTotal ${workArea.name}`, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } },
            { content: '', styles: { fillColor: [245, 245, 245] } },
            { content: formatPdfCurrency(waSubtotal), styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }
          ]);
        });

        // Add level subtotal row
        tableData.push([
          { content: `SubTotal ${level}`, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } },
          { content: '', styles: { fillColor: [230, 230, 230] } },
          { content: '', styles: { fillColor: [230, 230, 230] } },
          { content: formatPdfCurrency(levelData.subtotal), styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }
        ]);
      });

      // Activities without work area
      if (optionData.activitiesWithoutWorkArea.length > 0) {
        const unassignedSubtotal = optionData.activitiesWithoutWorkArea.reduce((sum, a) => sum + a.subtotal, 0);
        
        const sortedUnassigned = [...optionData.activitiesWithoutWorkArea].sort((a, b) => {
          const labelA = getActivityLabel(a.activity);
          const labelB = getActivityLabel(b.activity);
          return labelA.localeCompare(labelB, 'es', { numeric: true });
        });

        sortedUnassigned.forEach(({ activity, subtotal }, index) => {
          tableData.push([
            index === 0 ? 'Sin Área' : '',
            index === 0 ? 'Sin Área de Trabajo' : '',
            getActivityLabel(activity),
            formatPdfCurrency(subtotal)
          ]);
        });

        tableData.push([
          { content: 'SubTotal Sin Área', styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
          { content: '', styles: { fillColor: [254, 243, 199] } },
          { content: '', styles: { fillColor: [254, 243, 199] } },
          { content: formatPdfCurrency(unassignedSubtotal), styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } }
        ]);
      }

      if (tableData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [['Nivel', 'Área de Trabajo', 'Actividad', 'SubTotal']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: optionColors[option],
            fontSize: 8,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 7 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 45 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 25, halign: 'right' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
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

    const fileName = `presupuesto_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_donde_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  };

  const exportDondeAreasPDF = () => {
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
    
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DÓNDE? - LISTADO POR ÁREAS DE TRABAJO', pageWidth / 2, 50, { align: 'center' });
    
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
    
    const summaryData = [
      ['Total de recursos:', calculations.resourceCount.toString()],
      ['Coste base:', formatPdfCurrency(calculations.totalBaseCost)],
      ['Margen de seguridad:', formatPdfCurrency(calculations.totalSafetyMargin)],
      ['Margen comercial:', formatPdfCurrency(calculations.totalSalesMargin)],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total PVP highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PVP:', 18, yPos + 3);
    doc.text(formatPdfCurrency(calculations.totalWithMargins), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    yPos += 20;

    // Option colors for PDF
    const optionColors: Record<string, [number, number, number]> = {
      'A': [59, 130, 246], // blue
      'B': [168, 85, 247], // purple
      'C': [34, 197, 94],  // green
    };

    // Build data structure: Option > Level > Work Area > Activities
    OPCIONES.forEach(option => {
      const optionData = hierarchicalData[option];
      if (optionData.subtotal === 0) return; // Skip empty options

      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // Option header
      doc.setFillColor(...optionColors[option]);
      doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`OPCIÓN ${option}`, 18, yPos + 3);
      doc.text(formatPdfCurrency(optionData.subtotal), pageWidth - 18, yPos + 3, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      yPos += 15;

      // Build table data grouped by Work Area: Opción | Nivel | Área de Trabajo | Actividad | SubTotal
      const tableData: (string | { content: string; styles?: object })[][] = [];

      const levelKeys = LEVEL_ORDER.filter(l => optionData.levels[l]);
      levelKeys.forEach((level, levelIndex) => {
        const levelData = optionData.levels[level];
        
        // Level header row
        if (levelIndex > 0 || tableData.length > 0) {
          tableData.push([
            { content: `NIVEL: ${level}`, styles: { fontStyle: 'bold', fillColor: [220, 220, 220], colSpan: 3 } },
            { content: '', styles: { fillColor: [220, 220, 220] } },
            { content: formatPdfCurrency(levelData.subtotal), styles: { fontStyle: 'bold', fillColor: [220, 220, 220], halign: 'right' } }
          ]);
        } else {
          tableData.push([
            { content: `NIVEL: ${level}`, styles: { fontStyle: 'bold', fillColor: [220, 220, 220] } },
            { content: '', styles: { fillColor: [220, 220, 220] } },
            { content: '', styles: { fillColor: [220, 220, 220] } },
            { content: formatPdfCurrency(levelData.subtotal), styles: { fontStyle: 'bold', fillColor: [220, 220, 220], halign: 'right' } }
          ]);
        }

        // Sort activities within each work area by their label
        levelData.workAreas.forEach(({ workArea, activities: waActivities, subtotal: waSubtotal }) => {
          // Work area header
          tableData.push([
            '',
            { content: `${workArea.name} (${workArea.work_area})`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
            { content: '', styles: { fillColor: [240, 240, 240] } },
            { content: formatPdfCurrency(waSubtotal), styles: { fontStyle: 'bold', fillColor: [240, 240, 240], halign: 'right' } }
          ]);

          const sortedActivities = [...waActivities].sort((a, b) => {
            const labelA = getActivityLabel(a.activity);
            const labelB = getActivityLabel(b.activity);
            return labelA.localeCompare(labelB, 'es', { numeric: true });
          });

          sortedActivities.forEach(({ activity, subtotal }) => {
            tableData.push([
              '',
              '',
              getActivityLabel(activity),
              formatPdfCurrency(subtotal)
            ]);
          });
        });
      });

      // Activities without work area
      if (optionData.activitiesWithoutWorkArea.length > 0) {
        const unassignedSubtotal = optionData.activitiesWithoutWorkArea.reduce((sum, a) => sum + a.subtotal, 0);
        
        tableData.push([
          { content: 'SIN ÁREA DE TRABAJO', styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
          { content: '', styles: { fillColor: [254, 243, 199] } },
          { content: '', styles: { fillColor: [254, 243, 199] } },
          { content: formatPdfCurrency(unassignedSubtotal), styles: { fontStyle: 'bold', fillColor: [254, 243, 199], halign: 'right' } }
        ]);

        const sortedUnassigned = [...optionData.activitiesWithoutWorkArea].sort((a, b) => {
          const labelA = getActivityLabel(a.activity);
          const labelB = getActivityLabel(b.activity);
          return labelA.localeCompare(labelB, 'es', { numeric: true });
        });

        sortedUnassigned.forEach(({ activity, subtotal }) => {
          tableData.push([
            '',
            '',
            getActivityLabel(activity),
            formatPdfCurrency(subtotal)
          ]);
        });
      }

      if (tableData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [['Nivel', 'Área de Trabajo', 'Actividad', 'SubTotal']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: optionColors[option],
            fontSize: 8,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 7 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 45 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 25, halign: 'right' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
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

    const fileName = `presupuesto_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_donde_areas_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Resumen de Presupuesto: {budgetName}
            </DialogTitle>
            {!loading && calculations.resourceCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <FileDown className="h-4 w-4" />
                    Exportar PDF
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToPDF} className="gap-2">
                    <List className="h-4 w-4" />
                    Detalle por Recursos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportHierarchicalPDF} className="gap-2">
                    <Layers className="h-4 w-4" />
                    Jerarquía por Opciones
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportDondePDF} className="gap-2">
                    <MapPin className="h-4 w-4" />
                    DÓNDE? por Opciones
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportDondeAreasPDF} className="gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    DÓNDE? por Áreas de Trabajo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{calculations.resourceCount}</p>
                      <p className="text-xs text-muted-foreground">Recursos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-500/5 border-slate-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-500/10">
                      <Euro className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                      <p className="text-xs text-muted-foreground">Coste base</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Percent className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalSafetyMargin + calculations.totalSalesMargin)}</p>
                      <p className="text-xs text-muted-foreground">Márgenes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalWithMargins)}</p>
                      <p className="text-xs text-muted-foreground">Total PVP</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by Type */}
            {Object.keys(calculations.byType).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose por tipo de recurso</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calculations.byType).map(([type, data]) => (
                      <Badge key={type} variant="outline" className="text-sm py-1 px-3">
                        {type}: {data.count} ({formatCurrency(data.total)})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resource Details Table */}
            {calculations.resources.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Detalle de recursos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recurso</TableHead>
                          <TableHead className="text-right">Uds.</TableHead>
                          <TableHead className="text-right">Coste/Ud.</TableHead>
                          <TableHead className="text-right">Seguridad</TableHead>
                          <TableHead className="text-right">Margen</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculations.resources.map((resource) => (
                          <TableRow key={resource.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{resource.name}</p>
                                {resource.resource_type && (
                                  <p className="text-xs text-muted-foreground">{resource.resource_type}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.units)} {resource.unit || ''}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(resource.unitCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.safetyPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.salesPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(resource.withMargins)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={5} className="text-right">
                            TOTAL PVP
                          </TableCell>
                          <TableCell className="text-right font-mono text-lg">
                            {formatCurrency(calculations.totalWithMargins)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Este presupuesto no tiene recursos definidos
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Margin Breakdown */}
            {calculations.resourceCount > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose de márgenes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Coste base (sin márgenes)</p>
                      <p className="text-xl font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen de seguridad</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatCurrency(calculations.totalSafetyMargin)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen comercial</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(calculations.totalSalesMargin)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Precio de venta total (PVP)</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(calculations.totalWithMargins)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
