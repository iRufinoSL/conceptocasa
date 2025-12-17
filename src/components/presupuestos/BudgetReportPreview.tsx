import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FileDown, Printer, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BudgetReportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuesto: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
    version: string;
    poblacion: string;
    provincia: string | null;
  };
}

interface Activity {
  id: string;
  name: string;
  code: string;
  description: string | null;
  measurement_unit: string;
  phase_id: string | null;
  measurement_id: string | null;
  start_date: string | null;
  duration_days: number | null;
  tolerance_days: number | null;
  end_date: string | null;
}

interface Phase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
}

interface Resource {
  id: string;
  name: string;
  resource_type: string | null;
  unit: string | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
}

// Format for PDF
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €';
};

// Valid resource types
const VALID_RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos'];

export function BudgetReportPreview({ open, onOpenChange, presupuesto }: BudgetReportPreviewProps) {
  const { settings: companySettings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filesCountMap, setFilesCountMap] = useState<Map<string, number>>(new Map());
  const [selectedSections, setSelectedSections] = useState<string[]>(['activities']);
  const [customNotes, setCustomNotes] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, presupuesto.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [activitiesRes, phasesRes, resourcesRes, filesCountRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('id, name, code, description, measurement_unit, phase_id, measurement_id, start_date, duration_days, tolerance_days, end_date')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_phases')
          .select('id, name, code, start_date, duration_days, estimated_end_date')
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

      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
      setResources(resourcesRes.data || []);

      const filesMap = new Map<string, number>();
      (filesCountRes.data || []).forEach(f => {
        filesMap.set(f.activity_id, (filesMap.get(f.activity_id) || 0) + 1);
      });
      setFilesCountMap(filesMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos del informe');
    } finally {
      setLoading(false);
    }
  };

  // Resource calculation helper
  const calculateFields = (resource: Resource) => {
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
  const generateActivityId = (activity: Activity) => {
    const phaseInfo = getPhaseInfo(activity.phase_id);
    if (phaseInfo.code) {
      return `${phaseInfo.code} ${activity.code}.-${activity.name}`;
    }
    return `${activity.code}.-${activity.name}`;
  };

  // Calculate totals
  const totalResourcesSubtotal = resources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

  // Group resources by type (filter to valid types only)
  const byType = resources.reduce((acc, r) => {
    const type = r.resource_type || 'Sin tipo';
    // Skip invalid types like "Herramienta"
    if (type !== 'Sin tipo' && !VALID_RESOURCE_TYPES.includes(type)) return acc;
    const fields = calculateFields(r);
    if (!acc[type]) acc[type] = { count: 0, total: 0 };
    acc[type].count++;
    acc[type].total += fields.subtotalSales;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  const presupuestoId = `${presupuesto.nombre} (${presupuesto.codigo_correlativo}/${presupuesto.version}): ${presupuesto.poblacion}`;

  const handlePrint = () => {
    window.print();
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Company info
      const companyName = companySettings.name || 'Mi Empresa';
      const companyEmail = companySettings.email || '';
      const companyPhone = companySettings.phone || '';
      const companyAddress = companySettings.address || '';
      const companyWeb = companySettings.website || '';
      const companyInitials = companyName.substring(0, 2).toUpperCase();

      // Helper function for header
      const drawHeader = () => {
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
      };

      // PAGE 1: Elaborate Cover Page
      // Top gradient bar
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Decorative accent rectangles on top right
      doc.setFillColor(29, 78, 216);
      doc.rect(pageWidth - 60, 0, 60, 25, 'F');
      
      // Additional geometric decoration
      doc.setFillColor(59, 130, 246);
      doc.rect(pageWidth - 40, 0, 40, 15, 'F');
      
      // Small decorative circles
      doc.setFillColor(96, 165, 250);
      doc.circle(30, 35, 8, 'F');
      doc.setFillColor(147, 197, 253);
      doc.circle(50, 25, 5, 'F');
      doc.circle(70, 38, 3, 'F');
      
      // Company logo area - large centered
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth / 2 - 25, 60, 50, 50, 8, 8, 'F');
      
      // Shadow effect for logo
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(pageWidth / 2 - 23, 62, 50, 50, 8, 8, 'F');
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth / 2 - 25, 60, 50, 50, 8, 8, 'F');
      
      // Company initials in logo
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(pageWidth / 2 - 20, 65, 40, 40, 6, 6, 'F');
      doc.setTextColor(255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInitials, pageWidth / 2, 92, { align: 'center' });
      
      // Company name - large and prominent
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, pageWidth / 2, 130, { align: 'center' });
      
      // Company contact info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const contactLine = [companyEmail, companyPhone].filter(Boolean).join('  •  ');
      if (contactLine) doc.text(contactLine, pageWidth / 2, 140, { align: 'center' });
      const addressLine = [companyAddress, companyWeb].filter(Boolean).join('  •  ');
      if (addressLine) doc.text(addressLine, pageWidth / 2, 148, { align: 'center' });
      
      // Decorative divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2 - 40, 160, pageWidth / 2 + 40, 160);
      doc.setFillColor(37, 99, 235);
      doc.circle(pageWidth / 2, 160, 2, 'F');
      doc.setLineWidth(0.2);
      
      // Report title section
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, 175, pageWidth - 40, 50, 4, 4, 'F');
      
      // Left accent bar
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(20, 175, 4, 50, 2, 2, 'F');
      
      doc.setTextColor(37, 99, 235);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DOCUMENTO TÉCNICO', pageWidth / 2, 188, { align: 'center' });
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME DE PRESUPUESTO', pageWidth / 2, 200, { align: 'center' });
      
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(presupuesto.nombre, pageWidth / 2, 215, { align: 'center' });
      
      // Budget ID badge
      doc.setFillColor(241, 245, 249);
      const badgeWidth = doc.getTextWidth(presupuestoId) + 20;
      doc.roundedRect(pageWidth / 2 - badgeWidth / 2, 230, badgeWidth, 12, 6, 6, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(presupuestoId, pageWidth / 2, 238, { align: 'center' });
      
      // Date with icon-like element
      doc.setFillColor(34, 197, 94);
      doc.circle(pageWidth / 2 - 45, 258, 3, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(10);
      doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 260, { align: 'center' });
      
      // Bottom decorative section
      doc.setFillColor(248, 250, 252);
      doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
      
      // Bottom accent line
      doc.setFillColor(37, 99, 235);
      doc.rect(0, pageHeight - 25, pageWidth, 3, 'F');
      
      // Footer text
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.text('Documento generado automáticamente', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // PAGE 2: Index
      doc.addPage();
      
      // Page header for index
      drawHeader();

      // Index section with improved design
      let yPos = 55;
      
      // Index box background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, yPos - 6, pageWidth - 28, 75, 4, 4, 'F');
      
      // Index header with icon-like element
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(18, yPos - 2, 4, 16, 1, 1, 'F');
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('ÍNDICE DEL DOCUMENTO', 28, yPos + 8);
      doc.setTextColor(0);

      yPos += 22;
      
      // Build index items with hierarchy (page numbers updated for cover + index pages)
      const indexItems: { title: string; page: number; level: number; icon: string }[] = [
        { title: 'Resumen General', page: 3, level: 1, icon: '●' },
        { title: 'Estadísticas del presupuesto', page: 3, level: 2, icon: '○' },
        { title: 'Desglose por Tipo de Recurso', page: 3, level: 2, icon: '○' },
      ];

      if (selectedSections.includes('activities')) {
        indexItems.push({ title: 'Resumen de Actividades por Fase', page: 4, level: 1, icon: '●' });
      }
      if (selectedSections.includes('resources')) {
        indexItems.push({ title: 'Desglose de Recursos por Fase y Actividad', page: 4, level: 1, icon: '●' });
      }
      if (selectedSections.includes('time-phases')) {
        indexItems.push({ title: 'Gestión del Tiempo por Fases', page: 4, level: 1, icon: '●' });
      }
      if (selectedSections.includes('time-activities')) {
        indexItems.push({ title: 'Gestión del Tiempo por Actividades', page: 4, level: 1, icon: '●' });
      }

      let sectionNum = 1;
      let subSectionNum = 0;
      
      indexItems.forEach((item, idx) => {
        const indent = item.level === 1 ? 22 : 34;
        const fontSize = item.level === 1 ? 11 : 10;
        const fontStyle = item.level === 1 ? 'bold' : 'normal';
        
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        
        // Section numbering
        let numberText: string;
        if (item.level === 1) {
          numberText = `${sectionNum}.`;
          sectionNum++;
          subSectionNum = 0;
        } else {
          subSectionNum++;
          numberText = `${sectionNum - 1}.${subSectionNum}`;
        }
        
        // Draw bullet/icon
        if (item.level === 1) {
          doc.setFillColor(37, 99, 235);
          doc.circle(indent - 4, yPos - 1.5, 1.5, 'F');
        } else {
          doc.setDrawColor(100, 116, 139);
          doc.circle(indent - 4, yPos - 1.5, 1.2, 'S');
        }
        
        // Draw number and title
        doc.setTextColor(item.level === 1 ? 30 : 71, item.level === 1 ? 41 : 85, item.level === 1 ? 59 : 105);
        doc.text(`${numberText} ${item.title}`, indent, yPos);
        
        // Draw dotted line
        const titleWidth = doc.getTextWidth(`${numberText} ${item.title}`);
        const pageNumX = pageWidth - 24;
        const dotsStartX = indent + titleWidth + 4;
        const dotsEndX = pageNumX - 8;
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineDashPattern([1, 2], 0);
        doc.line(dotsStartX, yPos - 1, dotsEndX, yPos - 1);
        doc.setLineDashPattern([], 0);
        
        // Page number in a small circle
        doc.setFillColor(37, 99, 235);
        doc.circle(pageNumX, yPos - 1.5, 4, 'F');
        doc.setTextColor(255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(item.page.toString(), pageNumX, yPos, { align: 'center' });
        doc.setTextColor(0);
        
        yPos += item.level === 1 ? 10 : 8;
      });

      // PAGE 2: General Summary
      doc.addPage();
      yPos = 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('1. RESUMEN GENERAL', 14, yPos);
      doc.setTextColor(0);

      yPos += 12;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('1.1. Estadísticas del presupuesto', 14, yPos);
      doc.setFont('helvetica', 'normal');

      yPos += 10;
      doc.setFontSize(10);

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

      // Custom notes section
      if (customNotes.trim()) {
        yPos += 8;
        doc.setFillColor(248, 250, 252);
        
        // Calculate text height
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(customNotes, pageWidth - 40);
        const notesHeight = splitNotes.length * 5 + 16;
        
        doc.roundedRect(14, yPos - 4, pageWidth - 28, notesHeight, 2, 2, 'F');
        
        // Left accent bar
        doc.setFillColor(100, 116, 139);
        doc.roundedRect(14, yPos - 4, 3, notesHeight, 1, 1, 'F');
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('OBSERVACIONES:', 22, yPos + 4);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.text(splitNotes, 22, yPos + 12);
        
        yPos += notesHeight + 4;
      }

      yPos += 4;
      doc.setFillColor(34, 197, 94);
      doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL PRESUPUESTO:', 18, yPos + 3);
      doc.text(formatPdfCurrency(totalResourcesSubtotal), pageWidth - 18, yPos + 3, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      yPos += 20;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('1.2. Desglose por Tipo de Recurso', 14, yPos);
      doc.setFont('helvetica', 'normal');

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
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 50, halign: 'right' },
        },
      });

      // Section 2: Activities Summary (only if selected)
      if (selectedSections.includes('activities')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. RESUMEN DE ACTIVIDADES POR FASE', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const activitiesTableData: any[] = [];

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
      }

      // Section 3: Resources Detail (only if selected)
      if (selectedSections.includes('resources')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const resourcesTableData: any[] = [];

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

        phases.forEach(phase => {
          const phaseActivities = activities.filter(a => a.phase_id === phase.id);
          const phaseResources = resources.filter(r => {
            const activity = activities.find(a => a.id === r.activity_id);
            return activity?.phase_id === phase.id;
          });

          if (phaseResources.length === 0) return;

          const phaseTotal = phaseResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

          resourcesTableData.push([
            { content: `${phase.code || ''} ${phase.name}`, colSpan: 5, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
            { content: formatPdfCurrency(phaseTotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
          ]);

          phaseActivities.forEach(activity => {
            const activityResources = resources.filter(r => r.activity_id === activity.id);
            if (activityResources.length === 0) return;

            const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

            resourcesTableData.push([
              { content: `  ${activity.code}.-${activity.name}`, colSpan: 5, styles: { fillColor: [219, 234, 254], fontStyle: 'italic' } },
              { content: formatPdfCurrency(activityTotal), styles: { fillColor: [219, 234, 254], fontStyle: 'italic', halign: 'right' } }
            ]);

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
      }

      // Section: Time Management by Phases (only if selected)
      if (selectedSections.includes('time-phases')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. GESTIÓN DEL TIEMPO POR FASES', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const phasesTimeData: any[] = [];
        
        // Sort phases by start_date
        const sortedPhases = [...phases].sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });

        sortedPhases.forEach(phase => {
          const formatDate = (date: string | null) => {
            if (!date) return '-';
            try {
              return format(new Date(date), 'dd/MM/yyyy');
            } catch {
              return '-';
            }
          };
          
          phasesTimeData.push([
            `${phase.code || ''} ${phase.name}`.trim(),
            formatDate(phase.start_date),
            phase.duration_days?.toString() || '-',
            formatDate(phase.estimated_end_date)
          ]);
        });

        autoTable(doc, {
          startY: yPos,
          head: [['Fase', 'Fecha Inicio', 'Duración (días)', 'Fecha Fin Estimada']],
          body: phasesTimeData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 35, halign: 'center' },
            2: { cellWidth: 30, halign: 'center' },
            3: { cellWidth: 35, halign: 'center' },
          },
        });
      }

      // Section: Time Management by Activities (only if selected)
      if (selectedSections.includes('time-activities')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. GESTIÓN DEL TIEMPO POR ACTIVIDADES', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const activitiesTimeData: any[] = [];
        
        // Sort activities by start_date
        const sortedActivities = [...activities].sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });

        sortedActivities.forEach(activity => {
          const formatDate = (date: string | null) => {
            if (!date) return '-';
            try {
              return format(new Date(date), 'dd/MM/yyyy');
            } catch {
              return '-';
            }
          };
          
          const phaseInfo = getPhaseInfo(activity.phase_id);
          const activityId = phaseInfo.code ? `${phaseInfo.code} ${activity.code}` : activity.code;
          
          activitiesTimeData.push([
            `${activityId}.-${activity.name}`,
            formatDate(activity.start_date),
            activity.duration_days?.toString() || '-',
            activity.tolerance_days?.toString() || '-',
            formatDate(activity.end_date)
          ]);
        });

        autoTable(doc, {
          startY: yPos,
          head: [['ActividadID', 'Fecha Inicio', 'Duración', 'Tolerancia', 'Fecha Fin']],
          body: activitiesTimeData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 28, halign: 'center' },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 28, halign: 'center' },
          },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(200);
        doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
        doc.setFontSize(7);
        doc.setTextColor(120);
        const footerInfo = [companyName, companyEmail, companyPhone].filter(Boolean).join(' | ');
        doc.text(footerInfo, 14, pageHeight - 14);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 14, { align: 'right' });
      }

      const sectionSuffixes: string[] = [];
      if (selectedSections.includes('activities')) sectionSuffixes.push('actividades');
      if (selectedSections.includes('resources')) sectionSuffixes.push('recursos');
      if (selectedSections.includes('time-phases')) sectionSuffixes.push('tiempo_fases');
      if (selectedSections.includes('time-activities')) sectionSuffixes.push('tiempo_actividades');
      const sectionSuffix = sectionSuffixes.length > 0 ? sectionSuffixes.join('_') : 'informe';
      const fileName = `presupuesto_${sectionSuffix}_${presupuesto.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      toast.success('PDF exportado correctamente');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error al exportar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Vista previa del informe
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button size="sm" onClick={exportToPDF} disabled={isExporting || loading}>
                <FileDown className="h-4 w-4 mr-2" />
                {isExporting ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </div>
          </div>
          <div className="mt-4 print:hidden">
            <Label className="text-sm font-medium mb-2 block">Seleccionar secciones a incluir:</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="activities" 
                  checked={selectedSections.includes('activities')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'activities']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'activities'));
                    }
                  }}
                />
                <Label htmlFor="activities" className="cursor-pointer text-sm">Resumen de Actividades por Fase</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="resources" 
                  checked={selectedSections.includes('resources')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'resources']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'resources'));
                    }
                  }}
                />
                <Label htmlFor="resources" className="cursor-pointer text-sm">Desglose de Recursos por Fase/Actividad</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="time-phases" 
                  checked={selectedSections.includes('time-phases')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'time-phases']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'time-phases'));
                    }
                  }}
                />
                <Label htmlFor="time-phases" className="cursor-pointer text-sm">Gestión del Tiempo por Fases</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="time-activities" 
                  checked={selectedSections.includes('time-activities')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'time-activities']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'time-activities'));
                    }
                  }}
                />
                <Label htmlFor="time-activities" className="cursor-pointer text-sm">Gestión del Tiempo por Actividades</Label>
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="space-y-4 py-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div ref={printRef} className="py-6 space-y-8 print:py-0 print:space-y-4">
              {/* Header */}
              <div className="text-center border-b pb-6 print:pb-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                    {(companySettings.name || 'MI').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-primary">{companySettings.name || 'Mi Empresa'}</h2>
                    <p className="text-xs text-muted-foreground">
                      {[companySettings.email, companySettings.phone].filter(Boolean).join(' | ')}
                    </p>
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-1">INFORME DE PRESUPUESTO</h1>
                <p className="text-lg text-foreground">{presupuesto.nombre}</p>
                <p className="text-sm text-muted-foreground">{presupuestoId}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Fecha de generación: {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}
                </p>
              </div>

              {/* Section 1: General Summary */}
              <div>
                <h3 className="text-lg font-bold text-primary mb-4">1. RESUMEN GENERAL</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{activities.length}</p>
                      <p className="text-sm text-muted-foreground">Actividades</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{phases.length}</p>
                      <p className="text-sm text-muted-foreground">Fases</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{resources.length}</p>
                      <p className="text-sm text-muted-foreground">Recursos</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Custom notes textarea */}
                <div className="mt-4 print:hidden">
                  <Label className="text-sm font-medium mb-2 block">Observaciones (texto personalizado):</Label>
                  <textarea
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Escriba aquí las observaciones o notas que desea incluir en el informe antes del total..."
                    className="w-full min-h-[80px] p-3 border rounded-md bg-background text-foreground resize-y text-sm"
                  />
                </div>

                {/* Custom notes preview for print */}
                {customNotes.trim() && (
                  <Card className="bg-muted/50 border-muted hidden print:block">
                    <CardContent className="py-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">OBSERVACIONES:</p>
                      <p className="text-sm whitespace-pre-wrap">{customNotes}</p>
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-green-500/10 border-green-500/30">
                  <CardContent className="py-4 flex items-center justify-between">
                    <span className="font-semibold text-lg">TOTAL PRESUPUESTO</span>
                    <span className="text-2xl font-bold text-green-600">{formatCurrency(totalResourcesSubtotal)}</span>
                  </CardContent>
                </Card>

                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Desglose por Tipo de Recurso</h4>
                  <div className="space-y-1">
                    {Object.entries(byType).map(([type, data]) => (
                      <div key={type} className="flex justify-between items-center text-sm border-b pb-1">
                        <span>{type}: {data.count}</span>
                        <span className="font-mono text-right">{formatCurrency(data.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separator className="print:hidden" />

              {/* Section 2: Activities Summary - only if selected */}
              {selectedSections.includes('activities') && (
              <div className="print:break-before-page">
                <h3 className="text-lg font-bold text-primary mb-4">2. RESUMEN DE ACTIVIDADES POR FASE</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">ActividadID</TableHead>
                        <TableHead className="font-bold w-20">Unidad</TableHead>
                        <TableHead className="font-bold w-20 text-center">Archivos</TableHead>
                        <TableHead className="font-bold w-32 text-right">€SubTotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Unassigned activities */}
                      {activities.filter(a => !a.phase_id).length > 0 && (
                        <>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={3} className="font-semibold">Sin fase asignada</TableCell>
                            <TableCell className="font-semibold text-right">
                              {formatCurrency(activities.filter(a => !a.phase_id).reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0))}
                            </TableCell>
                          </TableRow>
                          {activities.filter(a => !a.phase_id).map(activity => (
                            <TableRow key={activity.id}>
                              <TableCell className="pl-6">{generateActivityId(activity)}</TableCell>
                              <TableCell>{activity.measurement_unit}</TableCell>
                              <TableCell className="text-center">{filesCountMap.get(activity.id) || 0}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(activityResourcesMap.get(activity.id) || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}

                      {/* Phases with activities */}
                      {phases.map(phase => {
                        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
                        if (phaseActivities.length === 0) return null;
                        
                        const phaseSubtotal = phaseActivities.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);
                        
                        return (
                          <React.Fragment key={phase.id}>
                            <TableRow className="bg-primary text-primary-foreground">
                              <TableCell colSpan={3} className="font-bold">{phase.code} {phase.name}</TableCell>
                              <TableCell className="font-bold text-right">{formatCurrency(phaseSubtotal)}</TableCell>
                            </TableRow>
                            {phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).map(activity => (
                              <TableRow key={activity.id}>
                                <TableCell className="pl-6">{generateActivityId(activity)}</TableCell>
                                <TableCell>{activity.measurement_unit}</TableCell>
                                <TableCell className="text-center">{filesCountMap.get(activity.id) || 0}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(activityResourcesMap.get(activity.id) || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })}

                      {/* Total row */}
                      <TableRow className="bg-green-500 text-white">
                        <TableCell colSpan={3} className="font-bold text-right">TOTAL ACTIVIDADES</TableCell>
                        <TableCell className="font-bold text-right">{formatCurrency(totalResourcesSubtotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {selectedSections.includes('activities') && <Separator className="print:hidden" />}

              {/* Section 3: Resources Detail - only if selected */}
              {selectedSections.includes('resources') && (
              <div className="print:break-before-page">
                <h3 className="text-lg font-bold text-primary mb-4">2. DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Recurso</TableHead>
                        <TableHead className="font-bold w-24">Tipo</TableHead>
                        <TableHead className="font-bold w-16">Ud</TableHead>
                        <TableHead className="font-bold w-24 text-right">€Coste Venta</TableHead>
                        <TableHead className="font-bold w-16 text-right">Uds</TableHead>
                        <TableHead className="font-bold w-28 text-right">€SubTotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Resources without activity */}
                      {resources.filter(r => !r.activity_id).length > 0 && (
                        <>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={5} className="font-semibold">Sin actividad asignada</TableCell>
                            <TableCell className="font-semibold text-right">
                              {formatCurrency(resources.filter(r => !r.activity_id).reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0))}
                            </TableCell>
                          </TableRow>
                          {resources.filter(r => !r.activity_id).map(resource => {
                            const fields = calculateFields(resource);
                            return (
                              <TableRow key={resource.id}>
                                <TableCell className="pl-6">{resource.name}</TableCell>
                                <TableCell>{resource.resource_type || '-'}</TableCell>
                                <TableCell>{resource.unit || '-'}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(fields.salesCostUd)}</TableCell>
                                <TableCell className="text-right font-mono">{formatNumber(fields.calculatedUnits)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(fields.subtotalSales)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </>
                      )}

                      {/* Phases with resources */}
                      {phases.map(phase => {
                        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
                        const phaseResources = resources.filter(r => {
                          const activity = activities.find(a => a.id === r.activity_id);
                          return activity?.phase_id === phase.id;
                        });
                        
                        if (phaseResources.length === 0) return null;
                        
                        const phaseTotal = phaseResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
                        
                        return (
                          <React.Fragment key={phase.id}>
                            <TableRow className="bg-primary text-primary-foreground">
                              <TableCell colSpan={5} className="font-bold">{phase.code} {phase.name}</TableCell>
                              <TableCell className="font-bold text-right">{formatCurrency(phaseTotal)}</TableCell>
                            </TableRow>
                            {phaseActivities.map(activity => {
                              const activityResources = resources.filter(r => r.activity_id === activity.id);
                              if (activityResources.length === 0) return null;
                              
                              const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
                              
                              return (
                                <React.Fragment key={activity.id}>
                                  <TableRow className="bg-primary/10">
                                    <TableCell colSpan={5} className="font-medium italic pl-4">{activity.code}.-{activity.name}</TableCell>
                                    <TableCell className="font-medium italic text-right">{formatCurrency(activityTotal)}</TableCell>
                                  </TableRow>
                                  {activityResources.sort((a, b) => a.name.localeCompare(b.name)).map(resource => {
                                    const fields = calculateFields(resource);
                                    return (
                                      <TableRow key={resource.id}>
                                        <TableCell className="pl-8">{resource.name}</TableCell>
                                        <TableCell>{resource.resource_type || '-'}</TableCell>
                                        <TableCell>{resource.unit || '-'}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(fields.salesCostUd)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatNumber(fields.calculatedUnits)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(fields.subtotalSales)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* Total row */}
                      <TableRow className="bg-green-500 text-white">
                        <TableCell colSpan={5} className="font-bold text-right">TOTAL PRESUPUESTO</TableCell>
                        <TableCell className="font-bold text-right">{formatCurrency(totalResourcesSubtotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Time Management by Phases - only if selected */}
              {selectedSections.includes('time-phases') && (
              <div className="print:break-before-page">
                <h3 className="text-lg font-bold text-primary mb-4">2. GESTIÓN DEL TIEMPO POR FASES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Fase</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Inicio</TableHead>
                        <TableHead className="font-bold w-28 text-center">Duración (días)</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Fin Estimada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...phases]
                        .sort((a, b) => {
                          if (!a.start_date && !b.start_date) return 0;
                          if (!a.start_date) return 1;
                          if (!b.start_date) return -1;
                          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                        })
                        .map(phase => {
                          const formatDate = (date: string | null) => {
                            if (!date) return '-';
                            try {
                              return format(new Date(date), 'dd/MM/yyyy');
                            } catch {
                              return '-';
                            }
                          };
                          
                          return (
                            <TableRow key={phase.id}>
                              <TableCell className="font-medium">{phase.code} {phase.name}</TableCell>
                              <TableCell className="text-center">{formatDate(phase.start_date)}</TableCell>
                              <TableCell className="text-center">{phase.duration_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{formatDate(phase.estimated_end_date)}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Time Management by Activities - only if selected */}
              {selectedSections.includes('time-activities') && (
              <div className="print:break-before-page">
                <h3 className="text-lg font-bold text-primary mb-4">2. GESTIÓN DEL TIEMPO POR ACTIVIDADES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">ActividadID</TableHead>
                        <TableHead className="font-bold w-24 text-center">Fecha Inicio</TableHead>
                        <TableHead className="font-bold w-20 text-center">Duración</TableHead>
                        <TableHead className="font-bold w-20 text-center">Tolerancia</TableHead>
                        <TableHead className="font-bold w-24 text-center">Fecha Fin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...activities]
                        .sort((a, b) => {
                          if (!a.start_date && !b.start_date) return 0;
                          if (!a.start_date) return 1;
                          if (!b.start_date) return -1;
                          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                        })
                        .map(activity => {
                          const formatDate = (date: string | null) => {
                            if (!date) return '-';
                            try {
                              return format(new Date(date), 'dd/MM/yyyy');
                            } catch {
                              return '-';
                            }
                          };
                          
                          return (
                            <TableRow key={activity.id}>
                              <TableCell className="font-medium">{generateActivityId(activity)}</TableCell>
                              <TableCell className="text-center">{formatDate(activity.start_date)}</TableCell>
                              <TableCell className="text-center">{activity.duration_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{activity.tolerance_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{formatDate(activity.end_date)}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Footer */}
              <div className="text-center text-xs text-muted-foreground pt-4 border-t print:mt-8">
                <p>{[companySettings.name, companySettings.email, companySettings.phone].filter(Boolean).join(' | ')}</p>
                <p>{[companySettings.address, companySettings.website].filter(Boolean).join(' | ')}</p>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

