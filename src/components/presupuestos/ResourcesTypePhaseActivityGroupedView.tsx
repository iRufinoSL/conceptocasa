import { useMemo, useState, Fragment, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Pencil, Trash2, Package, Wrench, Truck, Briefcase, CheckSquare, Ruler, Printer } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { InlineDatePicker } from '@/components/ui/inline-date-picker';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatActividadId } from '@/lib/activity-id';
import { OPTION_COLORS, getDisplayOptions, getAllAvailableOptions } from '@/lib/options-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  supplier_id: string | null;
  signed_subtotal: number | null;
  purchase_vat_percent?: number | null;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
  opciones?: string[];
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  measurement_id?: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface Measurement {
  id: string;
  name: string;
  manual_units?: number | null;
  measurement_unit?: string | null;
}

interface CalculatedFields {
  safetyMarginUd: number;
  internalCostUd: number;
  salesMarginUd: number;
  salesCostUd: number;
  calculatedUnits: number;
  subtotalSales: number;
  subtotalExternalCost: number;
}

interface ResourcesTypePhaseActivityGroupedViewProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  measurements?: Measurement[];
  budgetName?: string;
  permissions: any;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  onInlineUpdate: (id: string, field: string, value: any) => Promise<void>;
  onActivityDateUpdate?: (activityId: string, field: 'actual_start_date' | 'actual_end_date', value: string | null) => Promise<void>;
  calculateFields: (resource: BudgetResource) => CalculatedFields;
  getActivityId: (activityId: string | null) => string;
  canEditResource: (resource: BudgetResource) => boolean;
}

const RESOURCE_TYPES = ['Alquiler', 'Equipo', 'Mano de obra', 'Material', 'Producto', 'Servicio', 'Utiles y herramientas'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Material': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
  'Equipo': <Wrench className="h-4 w-4" />,
  'Utiles y herramientas': <Wrench className="h-4 w-4" />,
  'Herramienta': <Wrench className="h-4 w-4" />,
  'Impuestos': <Package className="h-4 w-4" />,
  'Tarea': <CheckSquare className="h-4 w-4" />,
};

const resourceTypeColors: Record<string, string> = {
  'Producto': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Material': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Mano de obra': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Alquiler': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Servicio': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'Equipo': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Utiles y herramientas': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Herramienta': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Impuestos': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Tarea': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Sin tipo': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export function ResourcesTypePhaseActivityGroupedView({
  resources,
  activities,
  phases,
  measurements = [],
  budgetName,
  permissions,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onInlineUpdate,
  onActivityDateUpdate,
  calculateFields,
  getActivityId,
  canEditResource,
}: ResourcesTypePhaseActivityGroupedViewProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(RESOURCE_TYPES));
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [selectedOption, setSelectedOption] = useState<string>('A');

  const isAdmin = permissions?.isAdmin;

  // Get all available options from activities
  const availableOptions = useMemo(() => {
    return getAllAvailableOptions(activities as { opciones?: string[] | null }[]);
  }, [activities]);

  // Filter resources by selected option: only resources whose activity includes the selected option
  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      // Exclude resources without activity
      if (!r.activity_id) return false;
      const activity = activities.find(a => a.id === r.activity_id);
      if (!activity) return false;
      const opts = activity.opciones || ['A', 'B', 'C'];
      return opts.includes(selectedOption);
    });
  }, [resources, activities, selectedOption]);

  // Measurement lookup
  const measurementMap = useMemo(() => {
    const map: Record<string, Measurement> = {};
    measurements.forEach(m => { map[m.id] = m; });
    return map;
  }, [measurements]);

  // Build hierarchical structure: Type -> Phase -> Activity -> Resources
  const hierarchicalData = useMemo(() => {
    const structure: Record<string, Record<string, Record<string, BudgetResource[]>>> = {};

    filteredResources.forEach(resource => {
      const type = resource.resource_type || 'Sin tipo';
      if (!structure[type]) structure[type] = {};

      const activity = resource.activity_id ? activities.find(a => a.id === resource.activity_id) : null;
      const phaseId = activity?.phase_id || '__no_phase__';
      const activityId = resource.activity_id || '__no_activity__';

      if (!structure[type][phaseId]) structure[type][phaseId] = {};
      if (!structure[type][phaseId][activityId]) structure[type][phaseId][activityId] = [];

      structure[type][phaseId][activityId].push(resource);
    });

    // Sort resources alphabetically within each activity
    Object.keys(structure).forEach(type => {
      Object.keys(structure[type]).forEach(phaseId => {
        Object.keys(structure[type][phaseId]).forEach(activityId => {
          structure[type][phaseId][activityId].sort((a, b) =>
            a.name.localeCompare(b.name, 'es')
          );
        });
      });
    });

    return structure;
  }, [filteredResources, activities]);

  // Auto-expand on load
  useEffect(() => {
    if (filteredResources.length === 0) return;
    if (expandedPhases.size > 0 || expandedActivities.size > 0) return;

    const typesWithResources = Object.entries(hierarchicalData)
      .filter(([, phasesById]) =>
        Object.values(phasesById).some(activitiesById =>
          Object.values(activitiesById).some(list => list.length > 0)
        )
      )
      .map(([type]) => type);

    const realTypes = typesWithResources.filter(t => t !== 'Sin tipo');
    setExpandedTypes(new Set(realTypes));

    const phaseKeys: string[] = [];
    const activityKeys: string[] = [];
    realTypes.forEach(type => {
      const typePhases = hierarchicalData[type] || {};
      Object.keys(typePhases).forEach(phaseId => {
        if (phaseId === '__no_phase__') return;
        phaseKeys.push(`${type}-${phaseId}`);
        Object.keys(typePhases[phaseId]).forEach(activityId => {
          if (activityId === '__no_activity__') return;
          activityKeys.push(`${type}-${phaseId}-${activityId}`);
        });
      });
    });

    setExpandedPhases(new Set(phaseKeys));
    setExpandedActivities(new Set(activityKeys));
  }, [filteredResources.length, hierarchicalData, expandedPhases.size, expandedActivities.size]);

  // Totals
  const typeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(hierarchicalData).forEach(([type, phaseMap]) => {
      let total = 0;
      Object.values(phaseMap).forEach(actMap => {
        Object.values(actMap).forEach(list => {
          list.forEach(r => { total += calculateFields(r).subtotalSales; });
        });
      });
      totals[type] = total;
    });
    return totals;
  }, [hierarchicalData, calculateFields]);

  const phaseTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    Object.entries(hierarchicalData).forEach(([type, phaseMap]) => {
      totals[type] = {};
      Object.entries(phaseMap).forEach(([phaseId, actMap]) => {
        let t = 0;
        Object.values(actMap).forEach(list => { list.forEach(r => { t += calculateFields(r).subtotalSales; }); });
        totals[type][phaseId] = t;
      });
    });
    return totals;
  }, [hierarchicalData, calculateFields]);

  const activityTotals = useMemo(() => {
    const totals: Record<string, Record<string, Record<string, number>>> = {};
    Object.entries(hierarchicalData).forEach(([type, phaseMap]) => {
      totals[type] = {};
      Object.entries(phaseMap).forEach(([phaseId, actMap]) => {
        totals[type][phaseId] = {};
        Object.entries(actMap).forEach(([actId, list]) => {
          totals[type][phaseId][actId] = list.reduce((s, r) => s + calculateFields(r).subtotalSales, 0);
        });
      });
    });
    return totals;
  }, [hierarchicalData, calculateFields]);

  const typeResourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(hierarchicalData).forEach(([type, phaseMap]) => {
      let count = 0;
      Object.values(phaseMap).forEach(actMap => {
        Object.values(actMap).forEach(list => { count += list.length; });
      });
      counts[type] = count;
    });
    return counts;
  }, [hierarchicalData]);

  const toggleType = (type: string) => {
    const n = new Set(expandedTypes);
    n.has(type) ? n.delete(type) : n.add(type);
    setExpandedTypes(n);
  };
  const togglePhase = (key: string) => {
    const n = new Set(expandedPhases);
    n.has(key) ? n.delete(key) : n.add(key);
    setExpandedPhases(n);
  };
  const toggleActivity = (key: string) => {
    const n = new Set(expandedActivities);
    n.has(key) ? n.delete(key) : n.add(key);
    setExpandedActivities(n);
  };

  const getPhaseName = (phaseId: string) => {
    if (phaseId === '__no_phase__') return 'Sin fase';
    const phase = phases.find(p => p.id === phaseId);
    return phase ? `${phase.code || ''} ${phase.name}` : 'Sin fase';
  };

  const getActivityDisplayName = (activityId: string) => {
    if (activityId === '__no_activity__') return 'Sin actividad';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return 'Sin actividad';
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    return formatActividadId({
      phaseCode: phase?.code,
      activityCode: activity.code,
      name: activity.name,
    });
  };

  const getActivityMeasurementId = (activityId: string): string | null => {
    if (activityId === '__no_activity__') return null;
    const activity = activities.find(a => a.id === activityId);
    if (!activity?.measurement_id) return null;
    const measurement = measurementMap[activity.measurement_id];
    if (!measurement) return null;
    // MediciónID format: Unidades/Tipo unidad/ActividadID
    const units = measurement.manual_units != null ? String(measurement.manual_units) : '0';
    const unitType = measurement.measurement_unit || '-';
    const actDisplayName = formatActividadId({
      phaseCode: activity.phase_id ? phases.find(p => p.id === activity.phase_id)?.code : null,
      activityCode: activity.code,
      name: activity.name,
    });
    return `${units}/${unitType}/${actDisplayName}`;
  };

  // Ordered types: alphabetical among those with resources, "Sin tipo" last
  const orderedTypes = useMemo(() => {
    const typesWithResources = Object.keys(typeResourceCounts).filter(t => (typeResourceCounts[t] || 0) > 0);
    const known = RESOURCE_TYPES.filter(t => typesWithResources.includes(t));
    const extra = typesWithResources.filter(t => !RESOURCE_TYPES.includes(t) && t !== 'Sin tipo').sort((a, b) => a.localeCompare(b, 'es'));
    const result = [...known, ...extra];
    if (typesWithResources.includes('Sin tipo')) result.push('Sin tipo');
    return result;
  }, [typeResourceCounts]);

  const grandTotal = useMemo(() => {
    return filteredResources.reduce((s, r) => s + calculateFields(r).subtotalSales, 0);
  }, [filteredResources, calculateFields]);

  const formatPdfCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value) + ' €';
  };

  const handlePrint = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const headerHeight = 25;
    const footerHeight = 12;
    const contentBottom = pageHeight - footerHeight - 5;

    const drawHeader = () => {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`Presupuesto: ${budgetName || ''}`, marginX, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Recursos por Tipo — Opción ${selectedOption}`, marginX, 22);
      doc.text(`Total: ${formatPdfCurrency(grandTotal)}`, pageWidth - marginX, 22, { align: 'right' });
    };

    const drawFooter = (pageNum: number, totalPages: number) => {
      const footerY = pageHeight - 8;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text('www.concepto.casa  |  organiza@concepto.casa  |  +34 690 123 533', marginX, footerY);
      doc.text(`${pageNum}/${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
    };

    let y = headerHeight + 5;
    drawHeader();

    const checkNewPage = () => {
      if (y > contentBottom) {
        doc.addPage('a4', 'landscape');
        drawHeader();
        y = headerHeight + 5;
      }
    };

    orderedTypes.forEach(type => {
      const typePhases = hierarchicalData[type] || {};
      const typeCount = typeResourceCounts[type] || 0;
      if (typeCount === 0) return;
      const typeTotal = typeTotals[type] || 0;

      checkNewPage();
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(`${type} (${typeCount} recursos) — ${formatPdfCurrency(typeTotal)}`, marginX, y);
      y += 5;

      const sortedPhaseIds = Object.keys(typePhases).sort((a, b) => {
        if (a === '__no_phase__') return 1;
        if (b === '__no_phase__') return -1;
        const phaseA = phases.find(p => p.id === a);
        const phaseB = phases.find(p => p.id === b);
        return (phaseA?.code || '').localeCompare(phaseB?.code || '', 'es');
      });

      sortedPhaseIds.forEach(phaseId => {
        const phaseActivitiesMap = typePhases[phaseId] || {};
        const phaseName = getPhaseName(phaseId);
        const phaseTotal = phaseTotals[type]?.[phaseId] || 0;

        checkNewPage();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(`  ${phaseName} — ${formatPdfCurrency(phaseTotal)}`, marginX, y);
        y += 4;

        const sortedActivityIds = Object.keys(phaseActivitiesMap).sort((a, b) => {
          if (a === '__no_activity__') return 1;
          if (b === '__no_activity__') return -1;
          const actA = activities.find(act => act.id === a);
          const actB = activities.find(act => act.id === b);
          const phA = actA?.phase_id ? phases.find(p => p.id === actA.phase_id) : null;
          const phB = actB?.phase_id ? phases.find(p => p.id === actB.phase_id) : null;
          const idA = formatActividadId({ phaseCode: phA?.code, activityCode: actA?.code, name: actA?.name });
          const idB = formatActividadId({ phaseCode: phB?.code, activityCode: actB?.code, name: actB?.name });
          return idA.localeCompare(idB, 'es');
        });

        sortedActivityIds.forEach(activityId => {
          const activityResources = phaseActivitiesMap[activityId] || [];
          const activityDisplayName = getActivityDisplayName(activityId);
          const measurementName = getActivityMeasurementId(activityId);
          const activityTotal = activityTotals[type]?.[phaseId]?.[activityId] || 0;

          checkNewPage();
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(80, 80, 80);
          const actLabel = measurementName ? `    ${activityDisplayName} [${measurementName}]` : `    ${activityDisplayName}`;
          doc.text(`${actLabel} — ${formatPdfCurrency(activityTotal)}`, marginX, y);
          y += 3;

          const tableData = activityResources.map(r => {
            const f = calculateFields(r);
            return [
              r.name,
              formatPdfCurrency(r.external_unit_cost || 0),
              r.unit || '-',
              formatPdfCurrency(f.internalCostUd),
              formatPdfCurrency(f.salesCostUd),
              f.calculatedUnits.toFixed(2),
              formatPdfCurrency(f.subtotalSales),
            ];
          });

          autoTable(doc, {
            startY: y,
            head: [['Recurso', '€Coste ud', 'Ud', '€Coste int.', '€Coste venta', 'Uds', '€Subtotal']],
            body: tableData,
            margin: { left: marginX + 6, right: marginX },
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: {
              fillColor: [255, 255, 255],
              textColor: [40, 40, 40],
              fontStyle: 'bold',
              fontSize: 7,
              lineWidth: { bottom: 0.4 },
              lineColor: [80, 80, 80],
            },
            columnStyles: {
              0: { cellWidth: 60 },
              1: { halign: 'right' },
              2: { halign: 'center', cellWidth: 15 },
              3: { halign: 'right' },
              4: { halign: 'right' },
              5: { halign: 'right', cellWidth: 18 },
              6: { halign: 'right' },
            },
            didDrawPage: () => {
              drawHeader();
              y = headerHeight + 5;
            },
          });
          y = (doc as any).lastAutoTable.finalY + 4;
        });
      });

      y += 3;
    });

    // Draw footers on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    doc.save(`Recursos_Tipo_Opcion${selectedOption}_${budgetName || 'presupuesto'}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Option selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Opción:</span>
        {availableOptions.map(opt => {
          const colors = OPTION_COLORS[opt];
          const isSelected = selectedOption === opt;
          return (
            <Button
              key={opt}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              className={isSelected && colors ? `${colors.bg} ${colors.hover} text-white border-0` : ''}
              onClick={() => setSelectedOption(opt)}
            >
              Opción {opt}
            </Button>
          );
        })}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <span className="text-sm font-semibold">
            Total Opción {selectedOption}: {formatCurrency(grandTotal)}
          </span>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === filteredResources.length && filteredResources.length > 0}
                    onCheckedChange={onToggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[180px]">Recurso</TableHead>
              <TableHead className="text-right w-[90px]">€Coste ud</TableHead>
              <TableHead className="text-right w-[55px]">%IVA</TableHead>
              <TableHead className="w-[50px]">Ud</TableHead>
              <TableHead className="text-right w-[55px]">%Seg.</TableHead>
              <TableHead className="text-right w-[75px]">€Coste int.</TableHead>
              <TableHead className="text-right w-[55px]">%Venta</TableHead>
              <TableHead className="text-right w-[90px]">€Coste venta</TableHead>
              <TableHead className="text-right w-[70px]">Uds calc.</TableHead>
              <TableHead className="text-right w-[100px]">€Subtotal</TableHead>
              {isAdmin && <TableHead className="w-[70px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderedTypes.map(type => {
              const typePhases = hierarchicalData[type] || {};
              const typeCount = typeResourceCounts[type] || 0;
              if (typeCount === 0) return null;

              const isTypeExpanded = expandedTypes.has(type);
              const typeTotal = typeTotals[type] || 0;
              const colorClass = resourceTypeColors[type] || resourceTypeColors['Sin tipo'];

              // Sort phases by code
              const sortedPhaseIds = Object.keys(typePhases).sort((a, b) => {
                if (a === '__no_phase__') return 1;
                if (b === '__no_phase__') return -1;
                const phaseA = phases.find(p => p.id === a);
                const phaseB = phases.find(p => p.id === b);
                return (phaseA?.code || '').localeCompare(phaseB?.code || '', 'es');
              });

              return (
                <Fragment key={`type-${type}`}>
                  {/* Type Header */}
                  <TableRow className="cursor-pointer hover:bg-muted/50 bg-muted/30">
                    {isAdmin && <TableCell className="py-2" />}
                    <TableCell
                      colSpan={isAdmin ? 10 : 11}
                      className="py-2"
                      onClick={() => toggleType(type)}
                    >
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          {isTypeExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                        <Badge className={`${colorClass} gap-1.5`}>
                          {resourceTypeIcons[type]}
                          {type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {typeCount} recursos
                        </span>
                        <span className="ml-auto font-semibold">
                          {formatCurrency(typeTotal)}
                        </span>
                      </div>
                    </TableCell>
                    {isAdmin && <TableCell className="py-2" />}
                  </TableRow>

                  {/* Phases within type */}
                  {isTypeExpanded && sortedPhaseIds.map(phaseId => {
                    const phaseActivitiesMap = typePhases[phaseId] || {};
                    const phaseKey = `${type}-${phaseId}`;
                    const isPhaseExpanded = expandedPhases.has(phaseKey);
                    const phaseTotal = phaseTotals[type]?.[phaseId] || 0;
                    const phaseName = getPhaseName(phaseId);
                    const phaseResourceCount = Object.values(phaseActivitiesMap).reduce((s, l) => s + l.length, 0);

                    // Sort activities by ActividadID
                    const sortedActivityIds = Object.keys(phaseActivitiesMap).sort((a, b) => {
                      if (a === '__no_activity__') return 1;
                      if (b === '__no_activity__') return -1;
                      const actA = activities.find(act => act.id === a);
                      const actB = activities.find(act => act.id === b);
                      const phA = actA?.phase_id ? phases.find(p => p.id === actA.phase_id) : null;
                      const phB = actB?.phase_id ? phases.find(p => p.id === actB.phase_id) : null;
                      const idA = formatActividadId({ phaseCode: phA?.code, activityCode: actA?.code, name: actA?.name });
                      const idB = formatActividadId({ phaseCode: phB?.code, activityCode: actB?.code, name: actB?.name });
                      return idA.localeCompare(idB, 'es');
                    });

                    return (
                      <Fragment key={phaseKey}>
                        {/* Phase Header */}
                        <TableRow className="cursor-pointer hover:bg-accent/50 bg-accent/20">
                          {isAdmin && <TableCell className="py-1.5" />}
                          <TableCell
                            colSpan={isAdmin ? 10 : 11}
                            className="py-1.5 pl-12"
                            onClick={() => togglePhase(phaseKey)}
                          >
                            <div className="flex items-center gap-3">
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                                {isPhaseExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </Button>
                              <span className="font-medium text-sm">{phaseName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({phaseResourceCount} recursos)
                              </span>
                              <span className="ml-auto font-medium text-sm">
                                Subtotal: {formatCurrency(phaseTotal)}
                              </span>
                            </div>
                          </TableCell>
                          {isAdmin && <TableCell className="py-1.5" />}
                        </TableRow>

                        {/* Activities within phase */}
                        {isPhaseExpanded && sortedActivityIds.map(activityId => {
                          const activityResources = phaseActivitiesMap[activityId] || [];
                          const activityKey = `${type}-${phaseId}-${activityId}`;
                          const isActivityExpanded = expandedActivities.has(activityKey);
                          const activityTotal = activityTotals[type]?.[phaseId]?.[activityId] || 0;
                          const activityDisplayName = getActivityDisplayName(activityId);
                          const measurementName = getActivityMeasurementId(activityId);
                          const activityData = activityId !== '__no_activity__' ? activities.find(a => a.id === activityId) : null;

                          const formatDateDisplay = (dateStr: string | null | undefined) => {
                            if (!dateStr) return '-';
                            const parsed = parseISO(dateStr);
                            return isValid(parsed) ? format(parsed, 'dd/MM/yy', { locale: es }) : '-';
                          };

                          return (
                            <Fragment key={activityKey}>
                              {/* Activity Header */}
                              <TableRow className="cursor-pointer hover:bg-primary/5 bg-primary/10">
                                {isAdmin && <TableCell className="py-1" />}
                                <TableCell
                                  className="py-1 pl-20"
                                  onClick={() => toggleActivity(activityKey)}
                                >
                                  <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                                      {isActivityExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </Button>
                                    <span className="text-sm font-medium">{activityDisplayName}</span>
                                    {measurementName && (
                                      <Badge variant="outline" className="text-[10px] gap-1 py-0 h-5">
                                        <Ruler className="h-3 w-3" />
                                        {measurementName}
                                      </Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      ({activityResources.length} rec.)
                                    </span>
                                  </div>
                                </TableCell>
                                {/* Fecha Real Inicio */}
                                <TableCell className="py-1" colSpan={2} onClick={(e) => e.stopPropagation()}>
                                  {activityData && onActivityDateUpdate ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground">Inicio:</span>
                                      <InlineDatePicker
                                        value={activityData.actual_start_date || null}
                                        onChange={(value) => onActivityDateUpdate(activityId, 'actual_start_date', value)}
                                        placeholder="--/--/--"
                                        className="h-6 w-24 text-[10px]"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{formatDateDisplay(activityData?.actual_start_date)}</span>
                                  )}
                                </TableCell>
                                {/* Fecha Real Final */}
                                <TableCell className="py-1" colSpan={2} onClick={(e) => e.stopPropagation()}>
                                  {activityData && onActivityDateUpdate ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground">Final:</span>
                                      <InlineDatePicker
                                        value={activityData.actual_end_date || null}
                                        onChange={(value) => onActivityDateUpdate(activityId, 'actual_end_date', value)}
                                        placeholder="--/--/--"
                                        className="h-6 w-24 text-[10px]"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{formatDateDisplay(activityData?.actual_end_date)}</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-1" colSpan={isAdmin ? 4 : 5}>
                                  <span className="font-medium text-sm text-primary">
                                    Subtotal: {formatCurrency(activityTotal)}
                                  </span>
                                </TableCell>
                                {isAdmin && <TableCell className="py-1" />}
                              </TableRow>

                              {/* Resources within activity */}
                              {isActivityExpanded && activityResources.map(resource => {
                                const fields = calculateFields(resource);
                                const canEdit = canEditResource(resource);
                                const unitOptions = UNITS.map(u => ({ value: u, label: u }));

                                return (
                                  <TableRow key={resource.id} className={selectedIds.has(resource.id) ? 'bg-muted/50' : ''}>
                                    {isAdmin && (
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedIds.has(resource.id)}
                                          onCheckedChange={() => onToggleSelect(resource.id)}
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="font-medium pl-28">
                                      <ResourceInlineEdit
                                        value={resource.name}
                                        displayValue={resource.name}
                                        onSave={(v) => onInlineUpdate(resource.id, 'name', v)}
                                        type="text"
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.external_unit_cost}
                                        displayValue={formatCurrency(resource.external_unit_cost || 0)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'external_unit_cost', v)}
                                        type="number"
                                        decimals={2}
                                        numericInputMode="raw"
                                        clearOnEdit={true}
                                        allowNull={true}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.purchase_vat_percent}
                                        displayValue={resource.purchase_vat_percent != null ? `${resource.purchase_vat_percent}%` : '-'}
                                        onSave={(v) => onInlineUpdate(resource.id, 'purchase_vat_percent', v)}
                                        type="number"
                                        decimals={0}
                                        allowNull={true}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <ResourceInlineEdit
                                        value={resource.unit}
                                        displayValue={resource.unit || '-'}
                                        onSave={(v) => onInlineUpdate(resource.id, 'unit', v)}
                                        type="select"
                                        options={unitOptions}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.safety_margin_percent}
                                        displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'safety_margin_percent', v)}
                                        type="percent"
                                        numericInputMode="raw"
                                        clearOnEdit={true}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">
                                      {formatCurrency(fields.internalCostUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.sales_margin_percent}
                                        displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'sales_margin_percent', v)}
                                        type="percent"
                                        numericInputMode="raw"
                                        clearOnEdit={true}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold">
                                      {formatCurrency(fields.salesCostUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatNumber(fields.calculatedUnits)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-primary">
                                      {formatCurrency(fields.subtotalSales)}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button variant="ghost" size="icon" onClick={() => onEdit(resource)} className="h-8 w-8">
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button variant="ghost" size="icon" onClick={() => onDelete(resource)} className="h-8 w-8 text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            {filteredResources.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 12 : 11} className="text-center text-muted-foreground py-8">
                  No hay recursos para la Opción {selectedOption}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
