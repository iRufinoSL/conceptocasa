import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Send, FileText, Paperclip, X, Plus, File, ChevronDown, Calendar, Clock } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { format, addDays } from 'date-fns';

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
  budgetId?: string; // Optional budget ID to link email to a budget
}

export function SendEmailDialog({ open, onOpenChange, contact, contacts, budgetId }: SendEmailDialogProps) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  
  // Follow-up task state - enabled by default
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpName, setFollowUpName] = useState('');
  const currentTime = format(new Date(), 'HH:mm');
  const [followUpDate, setFollowUpDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [followUpTime, setFollowUpTime] = useState(currentTime);
  

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

  // Check if content is scrollable and update indicator
  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isScrollable = scrollHeight > clientHeight;
        const isNotAtBottom = scrollTop + clientHeight < scrollHeight - 20;
        setShowScrollIndicator(isScrollable && isNotAtBottom);
      }
    };

    // Check initially and after content changes
    checkScroll();
    const timer = setTimeout(checkScroll, 100);

    return () => clearTimeout(timer);
  }, [open, templates, selectedTemplate, attachments]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isNotAtBottom = scrollTop + clientHeight < scrollHeight - 20;
      setShowScrollIndicator(isNotAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

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
          budgetId: budgetId || undefined,
        },
      });

      if (response.error) throw response.error;
      
      // Create follow-up task if enabled
      if (createFollowUp) {
        const recipientNames = recipients
          .filter(c => c.email)
          .map(c => `${c.name}${c.surname ? ' ' + c.surname : ''}`)
          .join(', ');
        
        const taskTitle = followUpName.trim() || `Seguimiento Email - ${recipientNames}`;
        const taskDescription = `Seguimiento del email "${subject}" enviado a ${recipientNames}.\n\nContenido:\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
        
        const { data: management, error: managementError } = await supabase
          .from('crm_managements')
          .insert({
            title: taskTitle,
            description: taskDescription,
            management_type: 'Tarea',
            status: 'Pendiente',
            target_date: followUpDate,
            start_time: followUpTime,
            created_by: session.user.id,
          })
          .select()
          .single();
        
        if (!managementError && management && contactIds.length === 1) {
          // Link contact to the management (only for single recipient)
          await supabase.from('crm_management_contacts').insert({
            management_id: management.id,
            contact_id: contactIds[0],
          });
        }
      }
      
      return response.data;
    },
    onSuccess: (data) => {
      const followUpMsg = createFollowUp ? ' Se ha creado seguimiento en Agenda.' : '';
      toast.success((data.message || 'Email(s) enviado(s) correctamente') + followUpMsg);
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
      queryClient.invalidateQueries({ queryKey: ['crm-managements'] });
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
    setFollowUpName('');
    setFollowUpDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    setFollowUpTime(format(new Date(), 'HH:mm'));
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


  const templateVariables = selectedTemplate 
    ? (templates.find(t => t.id === selectedTemplate)?.variables as string[] || [])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar Email
          </DialogTitle>
          <DialogDescription>
            Envía un email a los contactos seleccionados.
          </DialogDescription>
        </DialogHeader>

        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pr-2 min-h-0 relative"
        >
          <div className="space-y-4 pb-4">
            {/* Attachments - Moved to top for visibility */}
            <div className="space-y-2 border border-primary/30 rounded-lg p-3 bg-primary/5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4 text-primary" />
                  Archivos adjuntos {attachments.length > 0 && `(${attachments.length})`}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1 h-7 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Añadir
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
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-1.5 bg-background border rounded px-2 py-1"
                    >
                      <File className="h-3 w-3 flex-shrink-0 text-primary" />
                      <span className="text-xs truncate max-w-[120px]">{attachment.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({formatFileSize(attachment.size)})
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                        className="h-5 w-5 p-0 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                className="min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Puedes usar HTML para dar formato. Variables disponibles: {'{{nombre}}'}, {'{{email}}'}, {'{{empresa_nombre}}'}
              </p>
            </div>

            {/* Follow-up task section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-followup-email"
                  checked={createFollowUp}
                  onCheckedChange={(checked) => setCreateFollowUp(checked === true)}
                />
                <Label htmlFor="create-followup-email" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Crear seguimiento en Agenda
                </Label>
              </div>
              
              {createFollowUp && (
                <div className="space-y-3 pl-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="followup-name-email" className="text-xs">Nombre del seguimiento (opcional)</Label>
                    <Input
                      id="followup-name-email"
                      placeholder={`Seguimiento Email - ${recipients[0]?.name || 'Contacto'}`}
                      value={followUpName}
                      onChange={(e) => setFollowUpName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="followup-date-email" className="text-xs">Fecha</Label>
                      <Input
                        id="followup-date-email"
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label htmlFor="followup-time-email" className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Hora
                      </Label>
                      <Input
                        id="followup-time-email"
                        type="time"
                        value={followUpTime}
                        onChange={(e) => setFollowUpTime(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        {showScrollIndicator && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-full shadow-lg text-xs animate-bounce hover:bg-primary/90 transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            Más contenido
          </button>
        )}

        <DialogFooter className="flex-shrink-0 pt-4 border-t mt-2">
          <div className="flex gap-2 ml-auto">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
