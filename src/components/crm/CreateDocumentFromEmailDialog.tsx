import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, Paperclip, FolderOpen, Building2, Mail, Info } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type EmailAttachment = Tables<'email_attachments'>;

type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  email_attachments?: EmailAttachment[];
};

interface CreateDocumentFromEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailMessage | null;
}

const DEFAULT_DOCUMENT_TYPES = [
  'Plano', 'Presupuesto', 'Contrato', 'Factura', 'Informe',
  'Fotografía', 'Certificado', 'Licencia', 'Memoria', 'Email', 'Otro'
];

export function CreateDocumentFromEmailDialog({ 
  open, 
  onOpenChange, 
  email 
}: CreateDocumentFromEmailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [docType, setDocType] = useState('Email');
  const [projectId, setProjectId] = useState<string>('__none__');
  const [budgetId, setBudgetId] = useState<string>('__none__');
  const [saving, setSaving] = useState(false);

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-document'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch budgets
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets-for-document'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo')
        .eq('archived', false)
        .order('codigo_correlativo', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Initialize form when email changes
  useEffect(() => {
    if (email && open) {
      // Pre-select project/budget if email has one
      if (email.project_id) {
        setProjectId(email.project_id);
      } else {
        setProjectId('__none__');
      }
      
      if (email.budget_id) {
        setBudgetId(email.budget_id);
      } else {
        setBudgetId('__none__');
      }
      
      setDocType('Email');
    }
  }, [email, open]);

  const handleSave = async () => {
    if (!email) {
      toast({ title: 'Error', description: 'No hay email seleccionado', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Mark email as document by updating it
      const { error } = await supabase
        .from('email_messages')
        .update({
          is_document: true,
          document_type: docType,
          project_id: projectId !== '__none__' ? projectId : email.project_id,
          budget_id: budgetId !== '__none__' ? budgetId : email.budget_id,
        })
        .eq('id', email.id);

      if (error) throw error;

      toast({ 
        title: 'Email marcado como documento',
        description: 'Ahora aparece también en la pestaña Documentos'
      });
      
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      queryClient.invalidateQueries({ queryKey: ['email-documents'] });
      queryClient.invalidateQueries({ queryKey: ['budget-emails'] });
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error marking email as document:', error);
      toast({ 
        title: 'Error al marcar como documento', 
        description: error?.message || 'Error desconocido',
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '?';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const attachmentCount = email?.email_attachments?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Marcar email como documento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info message */}
          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
            <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p>Este email aparecerá en el listado de Documentos junto con sus adjuntos.</p>
              <p className="mt-1">No se duplican archivos: se referencia el email original.</p>
            </div>
          </div>

          {/* Email preview */}
          <div className="space-y-2">
            <Label>Email seleccionado</Label>
            <div className="p-3 border rounded-md bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{email?.subject || 'Sin asunto'}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>De: {email?.from_name || email?.from_email}</p>
                {email?.received_at && (
                  <p>Fecha: {new Date(email.received_at).toLocaleDateString('es-ES', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                  })}</p>
                )}
              </div>
            </div>
          </div>

          {/* Attachments info */}
          {attachmentCount > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Adjuntos incluidos ({attachmentCount})
              </Label>
              <div className="space-y-1 max-h-[120px] overflow-y-auto border rounded-md p-2">
                {email?.email_attachments?.map(attachment => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/50 rounded text-sm"
                  >
                    <span className="truncate">{attachment.file_name}</span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {formatFileSize(attachment.file_size)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Type */}
          <div className="space-y-2">
            <Label>Tipo de documento</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_DOCUMENT_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Project */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Proyecto
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin proyecto</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Presupuesto
              </Label>
              <Select value={budgetId} onValueChange={setBudgetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin presupuesto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin presupuesto</SelectItem>
                  {budgets.map(budget => (
                    <SelectItem key={budget.id} value={budget.id}>
                      #{budget.codigo_correlativo} - {budget.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Marcar como documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
