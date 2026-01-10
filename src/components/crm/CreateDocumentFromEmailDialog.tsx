import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, Paperclip, User, FolderOpen, Building2 } from 'lucide-react';
import { ContactSelectWithCreate } from '@/components/crm/ContactSelectWithCreate';
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
  
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('Email');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('__none__');
  const [budgetId, setBudgetId] = useState<string>('__none__');
  const [contactId, setContactId] = useState<string>('__none__');
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
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
      // Set document name from email subject
      setDocName(email.subject || 'Email sin asunto');
      
      // Build description from email body with metadata
      let fullDescription = '';
      
      // Add email metadata header
      const fromInfo = email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email;
      const toInfo = email.to_emails?.join(', ') || '';
      const dateInfo = email.received_at || email.created_at;
      
      fullDescription += `<p><strong>De:</strong> ${fromInfo}</p>`;
      fullDescription += `<p><strong>Para:</strong> ${toInfo}</p>`;
      if (dateInfo) {
        const formattedDate = new Date(dateInfo).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        fullDescription += `<p><strong>Fecha:</strong> ${formattedDate}</p>`;
      }
      fullDescription += `<p><strong>Asunto:</strong> ${email.subject || 'Sin asunto'}</p>`;
      fullDescription += '<hr/>';
      
      // Add email body content
      const bodyContent = email.body_html || email.body_text || '';
      if (bodyContent) {
        fullDescription += bodyContent;
      }
      
      setDescription(fullDescription);
      
      // Set contact from email sender
      if (email.contact_id) {
        setContactId(email.contact_id);
      } else {
        setContactId('__none__');
      }
      
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
      
      // Select all attachments by default
      if (email.email_attachments && email.email_attachments.length > 0) {
        setSelectedAttachments(new Set(email.email_attachments.map(a => a.id)));
      } else {
        setSelectedAttachments(new Set());
      }
      
      setDocType('Email');
    }
  }, [email, open]);

  const toggleAttachment = (attachmentId: string) => {
    setSelectedAttachments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(attachmentId)) {
        newSet.delete(attachmentId);
      } else {
        newSet.add(attachmentId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!email || !docName.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Get selected attachments
      const attachmentsToCopy = email.email_attachments?.filter(a => selectedAttachments.has(a.id)) || [];
      
      // Variables for the main document file
      let mainFilePath: string | null = null;
      let mainFileType: string | null = null;
      let mainFileSize: number | null = null;
      
      // Build final description with email content and attachment info
      let finalDescription = description;
      
      // If there are attachments, copy them and track info
      const copiedAttachments: { name: string; path: string; size: number | null }[] = [];
      
      for (const attachment of attachmentsToCopy) {
        try {
          // Download from email-attachments bucket
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('email-attachments')
            .download(attachment.file_path);

          if (downloadError) {
            console.error('Error downloading attachment:', downloadError);
            continue;
          }

          // Generate new path for project-documents
          const fileName = attachment.file_name || attachment.file_path.split('/').pop() || 'adjunto';
          const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
          const docFolderId = crypto.randomUUID();
          const newPath = `email-docs/${docFolderId}/${Date.now()}-${safeFileName}`;

          // Upload to project-documents bucket
          const { error: uploadError } = await supabase.storage
            .from('project-documents')
            .upload(newPath, fileData);

          if (uploadError) {
            console.error('Error uploading to project-documents:', uploadError);
            continue;
          }

          copiedAttachments.push({
            name: fileName,
            path: newPath,
            size: attachment.file_size
          });
          
          // Use first attachment as the main document file
          if (!mainFilePath) {
            mainFilePath = newPath;
            mainFileType = attachment.file_type;
            mainFileSize = attachment.file_size;
          }
        } catch (err) {
          console.error('Error processing attachment:', err);
        }
      }
      
      // Add attachments info to description if there are multiple
      if (copiedAttachments.length > 1) {
        finalDescription += '<hr/><p><strong>Adjuntos incluidos:</strong></p><ul>';
        for (const att of copiedAttachments) {
          const sizeStr = att.size ? ` (${formatFileSize(att.size)})` : '';
          finalDescription += `<li>${att.name}${sizeStr}</li>`;
        }
        finalDescription += '</ul>';
      } else if (copiedAttachments.length === 1) {
        finalDescription += `<hr/><p><strong>Archivo adjunto:</strong> ${copiedAttachments[0].name}</p>`;
      }
      
      // Create the unified document
      const { error: docError } = await supabase
        .from('project_documents')
        .insert({
          name: docName.trim(),
          description: finalDescription || null,
          document_type: docType,
          project_id: projectId !== '__none__' ? projectId : null,
          budget_id: budgetId !== '__none__' ? budgetId : null,
          contact_id: contactId !== '__none__' ? contactId : null,
          email_id: email.id,
          file_path: mainFilePath,
          file_type: mainFileType,
          file_size: mainFileSize,
          uploaded_by: userData.user?.id,
        });

      if (docError) throw docError;

      toast({ title: 'Documento creado correctamente' });
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating document:', error);
      toast({ 
        title: 'Error al crear documento', 
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Crear documento desde email
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 py-4 pr-2">
            {/* Document Name */}
            <div className="space-y-2">
              <Label>Nombre del documento *</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Nombre del documento"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              {/* Contact */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contacto
                </Label>
                <ContactSelectWithCreate
                  value={contactId !== '__none__' ? contactId : null}
                  onChange={(val) => setContactId(val || '__none__')}
                  placeholder="Sin contacto"
                  clearLabel="Sin contacto"
                />
              </div>
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

            {/* Description */}
            <div className="space-y-2">
              <Label>Descripción (contenido del email)</Label>
              <div className="h-[200px] overflow-hidden border rounded-md">
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Descripción del documento..."
                  minHeight="180px"
                  className="h-full"
                />
              </div>
            </div>

            {/* Attachments */}
            {email?.email_attachments && email.email_attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Adjuntos a incluir ({selectedAttachments.size} de {email.email_attachments.length})
                </Label>
                <div className="space-y-2 max-h-[150px] overflow-y-auto border rounded-md p-2">
                  {email.email_attachments.map(attachment => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 p-2 bg-muted/50 rounded hover:bg-muted transition-colors"
                    >
                      <Checkbox
                        checked={selectedAttachments.has(attachment.id)}
                        onCheckedChange={() => toggleAttachment(attachment.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {attachment.file_name || attachment.file_path.split('/').pop()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.file_size)}
                        </p>
                      </div>
                      {selectedAttachments.has(attachment.id) && (
                        <Badge variant="secondary" className="text-xs">Incluido</Badge>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Los adjuntos seleccionados se incluirán en el documento. El primero será el archivo principal.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !docName.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Crear documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
