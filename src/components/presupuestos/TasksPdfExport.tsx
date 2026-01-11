import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatActividadId } from '@/lib/activity-id';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import type { BudgetTask } from './BudgetAgendaTab';

interface WorkAreaGroup {
  level: string;
  workAreaName: string;
  displayName: string;
  tasks: BudgetTask[];
}

export async function exportTasksPdf(
  tasks: BudgetTask[],
  budgetName: string,
  companySettings: CompanySettings
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Company info
  const companyName = companySettings.name || 'Mi Empresa';
  const companyEmail = companySettings.email || '';
  const companyPhone = companySettings.phone || '';
  const companyWeb = companySettings.website || '';
  const companyInitials = companyName.substring(0, 2).toUpperCase();

  // Group tasks by Level/WorkArea
  const tasksByLevelWorkArea = tasks.reduce((acc, task) => {
    const workAreas = task.workAreas && task.workAreas.length > 0
      ? task.workAreas
      : [{ name: 'Sin área de trabajo', level: '', work_area: '', id: '' }];
    
    workAreas.forEach(wa => {
      const level = wa.level || '';
      const workAreaName = wa.name || 'Sin área de trabajo';
      const groupKey = level ? `${level}/${workAreaName}` : workAreaName;
      const displayName = level ? `${level} - ${workAreaName}` : workAreaName;
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          level,
          workAreaName,
          displayName,
          tasks: []
        };
      }
      if (!acc[groupKey].tasks.find(t => t.id === task.id)) {
        acc[groupKey].tasks.push(task);
      }
    });
    
    return acc;
  }, {} as Record<string, WorkAreaGroup>);

  // Sort work areas
  const sortedWorkAreas = Object.entries(tasksByLevelWorkArea).sort(([keyA, a], [keyB, b]) => {
    if (a.workAreaName === 'Sin área de trabajo') return 1;
    if (b.workAreaName === 'Sin área de trabajo') return -1;
    if (a.level !== b.level) {
      return a.level.localeCompare(b.level, 'es');
    }
    return a.workAreaName.localeCompare(b.workAreaName, 'es');
  });

  // Helper function to get date range text
  const getDateRange = (task: BudgetTask): string => {
    if (!task.start_date) return 'Sin fecha';
    const start = format(new Date(task.start_date), 'd MMM yyyy', { locale: es });
    if (task.duration_days <= 1) return start;
    const endDate = addDays(new Date(task.start_date), task.duration_days - 1);
    const end = format(endDate, 'd MMM yyyy', { locale: es });
    return `${start} - ${end}`;
  };

  // Draw header
  const drawHeader = () => {
    // Company branding box
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInitials, 26.5, 26, { align: 'center' });
    doc.setTextColor(0);
    
    // Company name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(companyName, 45, 18);
    doc.setTextColor(0);
    
    // Company contact
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const contactLine = [companyEmail, companyPhone].filter(Boolean).join(' | ');
    if (contactLine) doc.text(contactLine, 45, 26);
    if (companyWeb) doc.text(companyWeb, 45, 32);
    doc.setTextColor(0);
    
    // Separator line
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    // Document title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LISTADO DE TAREAS', pageWidth / 2, 50, { align: 'center' });
    
    // Budget name
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(budgetName, pageWidth / 2, 58, { align: 'center' });
    
    // Generation date
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 65, { align: 'center' });
    doc.setTextColor(0);
  };

  // Draw footer with page numbers
  const drawFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 15;
    
    // Company info line
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    
    const footerContactParts = [companyName, companyEmail, companyPhone, companyWeb].filter(Boolean);
    const footerContact = footerContactParts.join(' | ');
    doc.text(footerContact, pageWidth / 2, footerY, { align: 'center' });
    
    // Page numbers
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth / 2, footerY + 5, { align: 'center' });
    doc.setTextColor(0);
  };

  // Summary section
  drawHeader();
  
  let yPos = 78;
  
  // Summary stats
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text('Resumen', 14, yPos);
  doc.setTextColor(0);
  
  yPos += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.task_status === 'pendiente').length;
  const completedTasks = tasks.filter(t => t.task_status === 'realizada').length;
  const totalGroups = sortedWorkAreas.length;
  
  const summaryData = [
    [`Total de tareas: ${totalTasks}`, `Pendientes: ${pendingTasks}`, `Realizadas: ${completedTasks}`],
    [`Áreas de trabajo: ${totalGroups}`]
  ];
  
  doc.text(`Total de tareas: ${totalTasks}   |   Pendientes: ${pendingTasks}   |   Realizadas: ${completedTasks}`, 14, yPos);
  yPos += 6;
  doc.text(`Áreas de trabajo: ${totalGroups}`, 14, yPos);
  yPos += 12;

  // Build table data grouped by work area
  const tableData: any[] = [];
  
  sortedWorkAreas.forEach(([groupKey, { displayName, tasks: groupTasks }]) => {
    // Group header row
    tableData.push([
      { 
        content: `${displayName} (${groupTasks.length} ${groupTasks.length === 1 ? 'tarea' : 'tareas'})`, 
        colSpan: 5, 
        styles: { 
          fillColor: [37, 99, 235] as [number, number, number], 
          textColor: [255, 255, 255] as [number, number, number], 
          fontStyle: 'bold' as const,
          fontSize: 10
        } 
      }
    ]);
    
    // Tasks in this group
    groupTasks.forEach(task => {
      const activityId = task.activity 
        ? formatActividadId({
            phaseCode: task.activity.phase_code,
            activityCode: task.activity.code,
            name: task.activity.name,
          })
        : 'Sin actividad';
      
      const contactCount = task.contacts?.length || 0;
      const statusText = task.task_status === 'realizada' ? 'Realizada' : 'Pendiente';
      const statusStyle = task.task_status === 'realizada' 
        ? { textColor: [34, 139, 34] as [number, number, number] }
        : { textColor: [180, 130, 0] as [number, number, number] };
      
      tableData.push([
        task.name,
        activityId,
        getDateRange(task),
        task.duration_days > 1 ? `${task.duration_days} días` : '1 día',
        { content: statusText, styles: statusStyle }
      ]);
    });
  });

  // Create the table
  autoTable(doc, {
    startY: yPos,
    head: [['Tarea', 'Actividad', 'Fechas', 'Duración', 'Estado']],
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
      0: { cellWidth: 45 },
      1: { cellWidth: 55 },
      2: { cellWidth: 40 },
      3: { cellWidth: 22 },
      4: { cellWidth: 20 },
    },
    margin: { left: 14, right: 14, bottom: 25 },
    didDrawPage: () => {
      // Footer will be added after we know total pages
    },
  });

  // Add footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // Save the PDF
  const fileName = `Tareas_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
}
