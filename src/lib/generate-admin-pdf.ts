import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface GeneratePdfOptions {
  /** The HTML element to capture */
  element: HTMLElement;
  /** File name for the PDF (without extension) */
  fileName: string;
  /** 'invoice' or 'purchase_order' */
  documentType: 'invoice' | 'purchase_order';
  /** UUID of the document */
  documentId: string;
  /** Budget ID for auto-registration in project_documents */
  budgetId?: string | null;
  /** Document description for project_documents */
  description?: string;
}

export async function generateAndSaveAdminPdf(options: GeneratePdfOptions): Promise<boolean> {
  const { element, fileName, documentType, documentId, budgetId, description } = options;

  try {
    // Capture HTML to canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });

    // Convert to PDF
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const pdfWidth = 210; // A4 mm
    const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

    const doc = new jsPDF({
      orientation: pdfHeight > 297 ? 'portrait' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // If content is taller than one page, scale to fit width and let it span pages
    const pageHeight = 297;
    let yOffset = 0;
    const scaledHeight = pdfHeight;

    if (scaledHeight <= pageHeight) {
      doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, scaledHeight);
    } else {
      // Multi-page
      let remaining = scaledHeight;
      while (remaining > 0) {
        doc.addImage(imgData, 'PNG', 0, yOffset, pdfWidth, scaledHeight);
        remaining -= pageHeight;
        if (remaining > 0) {
          doc.addPage();
          yOffset -= pageHeight;
        }
      }
    }

    const pdfBlob = doc.output('blob');
    const pdfFileName = `${fileName}.pdf`;
    const filePath = `${documentType}/${documentId}/${Date.now()}_${pdfFileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('admin-document-files')
      .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

    if (uploadError) throw uploadError;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Save to admin_document_files
    const { error: dbError } = await supabase
      .from('admin_document_files')
      .insert({
        document_type: documentType,
        document_id: documentId,
        file_name: pdfFileName,
        file_path: filePath,
        file_size: pdfBlob.size,
        file_type: 'application/pdf',
        is_generated_pdf: true,
        uploaded_by: user?.id || null,
      });

    if (dbError) throw dbError;

    // Auto-register in project_documents if budget is linked
    if (budgetId) {
      // Get the project_id from the budget
      const { data: budgetData } = await supabase
        .from('presupuestos')
        .select('project_id')
        .eq('id', budgetId)
        .maybeSingle();

      const { error: projDocError } = await supabase
        .from('project_documents')
        .insert({
          name: pdfFileName,
          file_path: filePath,
          file_size: pdfBlob.size,
          file_type: 'application/pdf',
          document_type: documentType === 'invoice' ? 'factura' : 'orden_pedido',
          description: description || pdfFileName,
          budget_id: budgetId,
          project_id: budgetData?.project_id || null,
          uploaded_by: user?.id || null,
        });

      if (projDocError) {
        console.warn('Error registering in project_documents:', projDocError);
      }

      // Also link via budget_document_links if we have a project document
      // The budget_document_links table links documents to budgets
      if (!projDocError) {
        const { data: lastDoc } = await supabase
          .from('project_documents')
          .select('id')
          .eq('file_path', filePath)
          .maybeSingle();

        if (lastDoc) {
          await supabase.from('budget_document_links').insert({
            budget_id: budgetId,
            document_id: lastDoc.id,
          });
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  }
}
