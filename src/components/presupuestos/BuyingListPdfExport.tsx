import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface BudgetInfo {
  id: string;
  nombre: string;
  direccion?: string | null;
  poblacion?: string | null;
  provincia?: string | null;
  google_maps_url?: string | null;
}

interface SupplierInfo {
  id: string;
  name: string;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nif_dni?: string | null;
}

interface Phase {
  id: string;
  name: string;
  code: string | null;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
}

interface Resource {
  id: string;
  name: string;
  activity_id: string | null;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  unit: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_unit_cost?: number | null;
  purchase_units?: number | null;
  purchase_unit_measure?: string | null;
  purchase_vat_percent?: number | null;
}

type PrintMode = 'all' | 'activity' | 'supplier' | 'selected';

interface PrintOptions {
  mode: PrintMode;
  groupId?: string;
  groupName?: string;
  selectedResourceIds?: string[];
  supplierDetails?: Map<string, SupplierInfo>;
  isExampleMode?: boolean;
}

const calcBuyingSubtotal = (r: Resource) => {
  const calculatedUnits = r.manual_units ?? r.related_units ?? 0;
  const qty = r.purchase_units ?? calculatedUnits;
  const cost = r.purchase_unit_cost ?? r.external_unit_cost ?? 0;
  const vatPercent = r.purchase_vat_percent ?? 21;
  const vatAmount = cost * qty * (vatPercent / 100);
  return (cost * qty) + vatAmount;
};

export function exportBuyingListPdf(
  budget: BudgetInfo,
  resources: Resource[],
  activities: Activity[],
  phases: Phase[],
  options: PrintOptions
) {
  // Filter resources based on print mode
  let filteredResources = resources;
  let title = 'Orden de compra';
  
  if (options.mode === 'activity' && options.groupId) {
    filteredResources = resources.filter(r => r.activity_id === options.groupId);
    title = `Orden de compra - ${options.groupName || 'Actividad'}`;
  } else if (options.mode === 'supplier' && options.groupId) {
    const isNoSupplier = options.groupId === '__no_supplier__';
    filteredResources = resources.filter(r => 
      isNoSupplier 
        ? !r.supplier_id 
        : r.supplier_id === options.groupId
    );
    title = `Orden de compra - ${options.groupName || 'Proveedor'}`;
  } else if (options.mode === 'selected' && options.selectedResourceIds) {
    filteredResources = resources.filter(r => options.selectedResourceIds!.includes(r.id));
    title = 'Orden de compra - Selección';
  }

  if (filteredResources.length === 0) {
    return;
  }

  // Create PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Header - Budget info
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Presupuesto: ${budget.nombre}`, margin, yPos);
  yPos += 6;

  // Address
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const addressParts = [
    budget.direccion,
    budget.poblacion,
    budget.provincia
  ].filter(Boolean);
  
  if (addressParts.length > 0) {
    doc.text(`Dirección: ${addressParts.join(', ')}`, margin, yPos);
    yPos += 5;
  }

  // Google Maps URL
  if (budget.google_maps_url) {
    doc.setTextColor(0, 102, 204);
    doc.textWithLink(`Ver en Google Maps`, margin, yPos, {
      url: budget.google_maps_url
    });
    doc.setTextColor(0, 0, 0);
    yPos += 5;
  }

  yPos += 3;

  // Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, yPos);
  yPos += 4;

  // Date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, margin, yPos);
  yPos += 8;

  // Supplier details section - only for supplier-specific prints
  if (options.mode === 'supplier' && options.groupId && options.groupId !== '__no_supplier__' && options.supplierDetails) {
    const supplier = options.supplierDetails.get(options.groupId);
    if (supplier) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Datos del Proveedor:', margin, yPos);
      yPos += 5;
      
      doc.setFont('helvetica', 'normal');
      if (options.isExampleMode) {
        doc.text('Nombre: Ejemplo', margin, yPos);
        yPos += 4;
      } else {
        const supplierName = supplier.surname ? `${supplier.name} ${supplier.surname}` : supplier.name;
        doc.text(`Nombre: ${supplierName}`, margin, yPos);
        yPos += 4;
        
        if (supplier.nif_dni) {
          doc.text(`NIF/CIF: ${supplier.nif_dni}`, margin, yPos);
          yPos += 4;
        }
        if (supplier.email) {
          doc.text(`Email: ${supplier.email}`, margin, yPos);
          yPos += 4;
        }
        if (supplier.phone) {
          doc.text(`Teléfono: ${supplier.phone}`, margin, yPos);
          yPos += 4;
        }
        if (supplier.address) {
          doc.text(`Dirección: ${supplier.address}`, margin, yPos);
          yPos += 4;
        }
      }
      
      yPos += 4;
    }
  }

  // Helper to get activity info
  const getActivityInfo = (activityId: string | null) => {
    if (!activityId) return '';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '';
    const phase = phases.find(p => p.id === activity.phase_id);
    return formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name
    });
  };

  // Calculate grand total
  const grandTotal = filteredResources.reduce((sum, r) => sum + calcBuyingSubtotal(r), 0);

  // Table data
  const tableData = filteredResources.map(resource => {
    const calculatedUnits = resource.manual_units ?? resource.related_units ?? 0;
    const qty = resource.purchase_units ?? calculatedUnits;
    const cost = resource.purchase_unit_cost ?? resource.external_unit_cost ?? 0;
    const vatPercent = resource.purchase_vat_percent ?? 21;
    const unitMeasure = resource.purchase_unit_measure ?? resource.unit ?? 'ud';
    const vatAmount = cost * qty * (vatPercent / 100);
    const subtotal = calcBuyingSubtotal(resource);

    return [
      resource.name,
      resource.resource_type || '-',
      options.isExampleMode ? 'Ejemplo' : (resource.supplier_name || 'Sin proveedor'),
      getActivityInfo(resource.activity_id) || '-',
      formatCurrency(cost),
      unitMeasure,
      formatNumber(qty),
      `${formatNumber(vatPercent)}%`,
      formatCurrency(vatAmount),
      formatCurrency(subtotal)
    ];
  });

  // Add total row
  tableData.push([
    { content: 'TOTAL', colSpan: 9, styles: { fontStyle: 'bold', halign: 'right' } } as any,
    { content: formatCurrency(grandTotal), styles: { fontStyle: 'bold', halign: 'right' } } as any
  ]);

  // Generate table
  autoTable(doc, {
    startY: yPos,
    head: [[
      'Recurso',
      'Tipo',
      'Proveedor',
      'Actividad',
      '€Coste ud',
      'Ud medida',
      'Uds compra',
      '%IVA',
      '€IVA',
      '€SubTotal'
    ]],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 50, halign: 'left' },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 35, halign: 'left' },
      3: { cellWidth: 45, halign: 'left' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 15, halign: 'center' },
      8: { cellWidth: 20, halign: 'right' },
      9: { cellWidth: 24, halign: 'right' }
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer with page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageWidth - margin,
        pageHeight - 10,
        { align: 'right' }
      );
    }
  });

  // Save the PDF
  const fileName = options.mode === 'all' 
    ? `Orden_Compra_${budget.nombre.replace(/\s+/g, '_')}.pdf`
    : options.mode === 'selected'
    ? `Orden_Compra_Seleccion_${budget.nombre.replace(/\s+/g, '_')}.pdf`
    : `Orden_Compra_${options.groupName?.replace(/\s+/g, '_') || 'Filtrada'}.pdf`;
  
  doc.save(fileName);
}

export function exportBuyingListBySupplierPdf(
  budget: BudgetInfo,
  resources: Resource[],
  activities: Activity[],
  phases: Phase[],
  supplierId: string,
  supplierName: string,
  supplierDetails?: Map<string, SupplierInfo>
) {
  exportBuyingListPdf(budget, resources, activities, phases, {
    mode: 'supplier',
    groupId: supplierId,
    groupName: supplierName,
    supplierDetails
  });
}

export function exportBuyingListByActivityPdf(
  budget: BudgetInfo,
  resources: Resource[],
  activities: Activity[],
  phases: Phase[],
  activityId: string,
  activityName: string
) {
  exportBuyingListPdf(budget, resources, activities, phases, {
    mode: 'activity',
    groupId: activityId,
    groupName: activityName
  });
}

export function exportBuyingListAllPdf(
  budget: BudgetInfo,
  resources: Resource[],
  activities: Activity[],
  phases: Phase[]
) {
  exportBuyingListPdf(budget, resources, activities, phases, {
    mode: 'all'
  });
}

export function exportBuyingListSelectedPdf(
  budget: BudgetInfo,
  resources: Resource[],
  activities: Activity[],
  phases: Phase[],
  selectedResourceIds: string[]
) {
  exportBuyingListPdf(budget, resources, activities, phases, {
    mode: 'selected',
    selectedResourceIds
  });
}
