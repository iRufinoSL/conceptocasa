import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Send, FileText, Paperclip, X, Plus, File } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type EmailTemplate = Tables<'email_templates'>;

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

interface ContactBasic {
  id: string;
  name: string;
  surname?: string | null;
  email?: string | null;
}

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactBasic;
  contacts?: ContactBasic[];
}

export function SendEmailDialog({ open, onOpenChange, contact, contacts }: SendEmailDialogProps) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const recipients = contacts || (contact ? [contact] : []);
  const recipientCount = recipients.filter(c => c.email).length;

  console.log('SendEmailDialog render - open:', open, 'contact:', contact?.name, 'recipients:', recipientCount);

  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: open,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newAttachments: AttachmentFile[] = Array.from(files).map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type
    }));
    
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Scroll to bottom to show attachments
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const contactIds = recipients.filter(c => c.email).map(c => c.id);

      // Convert attachments to base64
      const attachmentData = await Promise.all(
        attachments.map(async (att) => {
          const buffer = await att.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          return {
            filename: att.name,
            content: base64,
            content_type: att.type
          };
        })
      );

      const response = await supabase.functions.invoke('send-crm-email', {
        body: {
          contactIds: contactIds.length > 1 ? contactIds : undefined,
          contactId: contactIds.length === 1 ? contactIds[0] : undefined,
          subject,
          content,
          templateId: selectedTemplate || undefined,
          variables,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Email(s) enviado(s) correctamente');
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Error sending email:', error);
      toast.error(error.message || 'Error al enviar email');
    },
  });

  const resetForm = () => {
    setSubject('');
    setContent('');
    setSelectedTemplate('');
    setVariables({});
    setAttachments([]);
  };

  const handleTemplateChange = (templateId: string) => {
    if (templateId === 'none') {
      setSelectedTemplate('');
      setSubject('');
      setContent('');
      setVariables({});
      return;
    }
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
      // Parse variables from template
      const varsArray = template.variables as string[] || [];
      const initialVars: Record<string, string> = {};
      varsArray.forEach(v => { initialVars[v] = ''; });
      setVariables(initialVars);
    }
  };

  const handleSend = () => {
    if (!subject.trim() || !content.trim()) {
      toast.error('Asunto y contenido son obligatorios');
      return;
    }
    if (recipientCount === 0) {
      toast.error('No hay destinatarios con email válido');
      return;
    }
    sendEmailMutation.mutate();
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const templateVariables = selectedTemplate 
    ? (templates.find(t => t.id === selectedTemplate)?.variables as string[] || [])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar Email
          </DialogTitle>
          <DialogDescription>
            Envía un email a los contactos seleccionados.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea ref={scrollRef} className="flex-1 pr-4">
          <div className="space-y-4 pb-4">
            {/* Recipients info */}
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Destinatarios:</strong> {recipientCount} contacto(s) con email
              </p>
              {recipientCount <= 5 && (
                <div className="mt-1 text-sm">
                  {recipients.filter(c => c.email).map(c => (
                    <span key={c.id} className="inline-block mr-2 px-2 py-0.5 bg-primary/10 rounded text-xs">
                      {c.name} {c.surname ? c.surname : ''} ({c.email})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Template selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Plantilla (opcional)
              </Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plantilla..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plantilla</SelectItem>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Template variables */}
            {templateVariables.length > 0 && (
              <div className="space-y-2 p-3 border rounded-lg">
                <Label className="text-sm font-medium">Variables de la plantilla</Label>
                <div className="grid grid-cols-2 gap-2">
                  {templateVariables.filter(v => !['nombre', 'email', 'empresa_nombre'].includes(v)).map(variable => (
                    <div key={variable} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{variable}</Label>
                      <Input
                        value={variables[variable] || ''}
                        onChange={(e) => setVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                        placeholder={`{{${variable}}}`}
                        className="h-8"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Las variables nombre, email y empresa_nombre se rellenan automáticamente.
                </p>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject">Asunto *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto del email..."
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Contenido *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escribe el contenido del email (HTML permitido)..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Puedes usar HTML para dar formato. Variables disponibles: {'{{nombre}}'}, {'{{email}}'}, {'{{empresa_nombre}}'}
              </p>
            </div>

            {/* Attachments */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Archivos adjuntos
                </Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Añadir archivo
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              {attachments.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  {attachments.map((attachment, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between bg-muted/50 rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{attachment.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          ({formatFileSize(attachment.size)})
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={scrollToBottom}
              className="text-xs text-muted-foreground"
            >
              Ir al final ↓
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSend} 
                disabled={sendEmailMutation.isPending || recipientCount === 0}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendEmailMutation.isPending ? 'Enviando...' : `Enviar a ${recipientCount} contacto(s)`}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
