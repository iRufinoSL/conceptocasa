import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatActividadId } from '@/lib/activity-id';
import type { CompanySettings } from '@/hooks/useCompanySettings';

interface AreaTask {
  id: string;
  name: string;
  activity_id: string | null;
  activity_code: string;
  activity_name: string;
  phase_code: string | null;
  task_status: string | null;
  actual_start_date: string | null;
}

interface WorkAreaGroup {
  id: string;
  name: string;
  level: string;
  work_area: string;
  tasks: AreaTask[];
}

export async function exportAreaTrabajoPdf(
  workAreaGroups: WorkAreaGroup[],
  budgetName: string,
  companySettings: CompanySettings
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const companyName = companySettings.name || 'Mi Empresa';
  const companyEmail = companySettings.email || '';
  const companyPhone = companySettings.phone || '';
  const companyWeb = companySettings.website || '';
  const companyLogo = companySettings.logo_signed_url || '';
  const companyInitials = companyName.substring(0, 2).toUpperCase();

  // Helper to load image as base64
  const loadImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  let logoBase64: string | null = null;
  if (companyLogo) {
    logoBase64 = await loadImageAsBase64(companyLogo);
  }

  // Draw header
  const drawHeader = () => {
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 25, 25);
      } catch {
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
        doc.setTextColor(255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(companyInitials, 26.5, 26, { align: 'center' });
        doc.setTextColor(0);
      }
    } else {
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
      doc.setTextColor(255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInitials, 26.5, 26, { align: 'center' });
      doc.setTextColor(0);
    }
    doc.setTextColor(0);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(companyName, 45, 18);
    doc.setTextColor(0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const contactLine = [companyEmail, companyPhone].filter(Boolean).join(' | ');
    if (contactLine) doc.text(contactLine, 45, 26);
    if (companyWeb) doc.text(companyWeb, 45, 32);
    doc.setTextColor(0);

    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TAREAS POR ÁREA DE TRABAJO', pageWidth / 2, 50, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(budgetName, pageWidth / 2, 58, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`,
      pageWidth / 2, 65, { align: 'center' }
    );
    doc.setTextColor(0);
  };

  // Draw footer
  const drawFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const footerContactParts = [companyName, companyEmail, companyPhone, companyWeb].filter(Boolean);
    doc.text(footerContactParts.join(' | '), pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth / 2, footerY + 5, { align: 'center' });
    doc.setTextColor(0);
  };

  drawHeader();

  let yPos = 78;

  // Summary
  const totalTasks = workAreaGroups.reduce((sum, g) => sum + g.tasks.length, 0);
  const pendingTasks = workAreaGroups.reduce(
    (sum, g) => sum + g.tasks.filter(t => t.task_status !== 'realizada').length, 0
  );
  const completedTasks = totalTasks - pendingTasks;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text('Resumen', 14, yPos);
  doc.setTextColor(0);

  yPos += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Total de tareas: ${totalTasks}   |   Pendientes: ${pendingTasks}   |   Realizadas: ${completedTasks}`,
    14, yPos
  );
  yPos += 6;
  doc.text(`Áreas de trabajo: ${workAreaGroups.length}`, 14, yPos);
  yPos += 12;

  // Build table data
  const tableData: any[] = [];

  workAreaGroups.forEach(group => {
    const displayName = group.level ? `${group.level} - ${group.name}` : group.name;

    // Group header row
    tableData.push([
      {
        content: `${displayName} (${group.tasks.length} ${group.tasks.length === 1 ? 'tarea' : 'tareas'})`,
        colSpan: 4,
        styles: {
          fillColor: [37, 99, 235] as [number, number, number],
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold' as const,
          fontSize: 10,
        },
      },
    ]);

    group.tasks.forEach(task => {
      const activityId = task.activity_id
        ? formatActividadId({
            phaseCode: task.phase_code,
            activityCode: task.activity_code,
            name: task.activity_name,
          })
        : 'Sin actividad';

      const fechaRealInicio = task.actual_start_date
        ? format(parseISO(task.actual_start_date), 'd MMM yyyy', { locale: es })
        : '-';

      const statusText = task.task_status === 'realizada' ? '✓ Realizada' : 'Pendiente';
      const statusStyle =
        task.task_status === 'realizada'
          ? { textColor: [34, 139, 34] as [number, number, number] }
          : { textColor: [180, 130, 0] as [number, number, number] };

      tableData.push([
        { content: task.name, styles: task.task_status === 'realizada' ? { textColor: [120, 120, 120] as [number, number, number] } : {} },
        activityId,
        fechaRealInicio,
        { content: statusText, styles: statusStyle },
      ]);
    });
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Tarea', 'ActividadID', 'Fecha real inicio', 'Estado']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 60 },
      2: { cellWidth: 35 },
      3: { cellWidth: 28 },
    },
    margin: { left: 14, right: 14, bottom: 25 },
  });

  // Add footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  const fileName = `Tareas_AreaTrabajo_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
}
