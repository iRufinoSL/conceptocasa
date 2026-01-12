import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useEmailService } from '@/hooks/useEmailService';
import { useToast } from '@/hooks/use-toast';
import { 
  Send, Mail, User, Paperclip, X, Plus, 
  FileText, ChevronDown, Ticket as TicketIcon, File, Forward
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
  type: string;
  isForwarded?: boolean; // Flag to identify forwarded attachments
}

type Contact = Tables<'crm_contacts'>;
type EmailTemplate = Tables<'email_templates'>;

interface ForwardAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
}

interface ComposeEmailProps {
  replyTo?: {
    email: string;
    subject?: string;
    contactId?: string;
    ticketId?: string;
    forwardEmailId?: string;
    originalBody?: string;
  };
  onSent?: () => void;
}

export function ComposeEmail({ replyTo, onSent }: ComposeEmailProps) {
  const { toast } = useToast();
  const { sendEmail, sending, cancelSend } = useEmailService();

  const [formData, setFormData] = useState({
    to: replyTo?.email || '',
    cc: '',
    bcc: '',
    subject: replyTo?.subject ? `Re: ${replyTo.subject}` : '',
    body: '',
    contactId: replyTo?.contactId || '',
    ticketId: replyTo?.ticketId || '',
    createTicket: false,
    ticketSubject: '',
    ticketPriority: 'medium',
  });

  const [showCcBcc, setShowCcBcc] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('__none__');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [loadingForwardAttachments, setLoadingForwardAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Reset input to allow selecting the same file again
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

  // Fetch contacts for autocomplete
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-for-email'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email')
        .not('email', 'is', null)
        .order('name');
      return data || [];
    },
  });

  // Fetch email templates
  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  // Load forwarded email attachments
  useEffect(() => {
    const loadForwardAttachments = async () => {
      if (!replyTo?.forwardEmailId) return;
      
      setLoadingForwardAttachments(true);
      try {
        // Fetch attachments for the forwarded email
        const { data: emailAttachments, error } = await supabase
          .from('email_attachments')
          .select('*')
          .eq('email_id', replyTo.forwardEmailId);
        
        if (error) {
          console.error('Error fetching forward attachments:', error);
          return;
        }
        
        if (!emailAttachments || emailAttachments.length === 0) return;
        
        // Download each attachment and convert to File
        const forwardedFiles: AttachmentFile[] = [];
        
        for (const att of emailAttachments) {
          try {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('email-attachments')
              .download(att.file_path);
            
            if (downloadError) {
              console.error('Error downloading attachment:', downloadError);
              continue;
            }
            
            const fileType = att.file_type || 'application/octet-stream';
            const fileName = att.file_name;
            const blob = new Blob([fileData], { type: fileType });
            const file = Object.assign(blob, { name: fileName }) as unknown as File;
            
            forwardedFiles.push({
              file,
              name: att.file_name,
              size: att.file_size || fileData.size,
              type: att.file_type || 'application/octet-stream',
              isForwarded: true,
            });
          } catch (e) {
            console.error('Error processing attachment:', e);
          }
        }
        
        if (forwardedFiles.length > 0) {
          setAttachments(prev => [...prev, ...forwardedFiles]);
          toast({ 
            title: `${forwardedFiles.length} adjunto(s) cargado(s)`,
            description: 'Los adjuntos del email original se han añadido'
          });
        }
      } catch (e) {
        console.error('Error loading forward attachments:', e);
      } finally {
        setLoadingForwardAttachments(false);
      }
    };
    
    loadForwardAttachments();
  }, [replyTo?.forwardEmailId]);

  // Apply template
  useEffect(() => {
    if (selectedTemplate && selectedTemplate !== '__none__') {
      const template = templates.find(t => t.id === selectedTemplate);
      if (template) {
        setFormData(prev => ({
          ...prev,
          subject: template.subject,
          body: template.content,
        }));
      }
    }

    if (selectedTemplate === '__none__') {
      // keep current content; users can still manually edit
    }
  }, [selectedTemplate, templates]);

  // Find contact by email
  const matchedContact = contacts.find(c => c.email === formData.to);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.to || !formData.subject) {
      toast({ 
        title: 'Error', 
        description: 'El destinatario y asunto son obligatorios',
        variant: 'destructive' 
      });
      return;
    }

    try {
      // Convert attachments to base64 for sending
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

      await sendEmail({
        to: formData.to,
        subject: formData.subject,
        body_html: formData.body.replace(/\n/g, '<br>'),
        body_text: formData.body,
        cc: formData.cc ? formData.cc.split(',').map(e => e.trim()) : undefined,
        bcc: formData.bcc ? formData.bcc.split(',').map(e => e.trim()) : undefined,
        contact_id: formData.contactId || matchedContact?.id,
        ticket_id: formData.ticketId || undefined,
        create_ticket: formData.createTicket,
        ticket_subject: formData.createTicket ? formData.ticketSubject || formData.subject : undefined,
        ticket_priority: formData.createTicket ? formData.ticketPriority : undefined,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      });

      toast({ 
        title: '✓ Email enviado correctamente',
        description: 'El email ha sido entregado al servidor de correo. Recibirás una notificación si hay algún problema de entrega.',
      });
      
      // Reset form
      setFormData({
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        body: '',
        contactId: '',
        ticketId: '',
        createTicket: false,
        ticketSubject: '',
        ticketPriority: 'medium',
      });
      setSelectedTemplate('');
      setAttachments([]);
      
      if (onSent) onSent();
    } catch (error: any) {
      toast({ 
        title: 'Error al enviar', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  return (
    <Card className="flex flex-col max-h-[calc(100vh-200px)]">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Redactar Email
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template selector */}
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Plantilla:</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar plantilla..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin plantilla</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {template.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To field with contact autocomplete */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Para *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCcBcc(!showCcBcc)}
                className="text-xs"
              >
                {showCcBcc ? 'Ocultar' : 'Mostrar'} CC/BCC
                <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showCcBcc ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className="relative">
              <Input
                type="email"
                value={formData.to}
                onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                placeholder="email@ejemplo.com"
                list="contacts-list"
              />
              <datalist id="contacts-list">
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.email || ''}>
                    {contact.name} {contact.surname}
                  </option>
                ))}
              </datalist>
              {matchedContact && (
                <Badge className="absolute right-2 top-1/2 -translate-y-1/2 gap-1" variant="secondary">
                  <User className="h-3 w-3" />
                  {matchedContact.name}
                </Badge>
              )}
            </div>
          </div>

          {/* CC/BCC fields */}
          {showCcBcc && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CC</Label>
                <Input
                  value={formData.cc}
                  onChange={(e) => setFormData({ ...formData, cc: e.target.value })}
                  placeholder="emails separados por coma"
                />
              </div>
              <div className="space-y-2">
                <Label>BCC</Label>
                <Input
                  value={formData.bcc}
                  onChange={(e) => setFormData({ ...formData, bcc: e.target.value })}
                  placeholder="emails separados por coma"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label>Asunto *</Label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Asunto del email"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Escribe tu mensaje aquí..."
              rows={10}
              className="min-h-[200px]"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Archivos adjuntos
                {loadingForwardAttachments && (
                  <span className="text-xs text-muted-foreground">(Cargando adjuntos...)</span>
                )}
              </Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                disabled={loadingForwardAttachments}
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
                      {attachment.isForwarded && (
                        <Badge variant="secondary" className="gap-1 flex-shrink-0">
                          <Forward className="h-3 w-3" />
                          Reenviado
                        </Badge>
                      )}
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

          {/* Create ticket option */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TicketIcon className="h-4 w-4 text-muted-foreground" />
                <Label>Crear ticket de soporte</Label>
              </div>
              <Switch
                checked={formData.createTicket}
                onCheckedChange={(checked) => setFormData({ ...formData, createTicket: checked })}
              />
            </div>
            
            {formData.createTicket && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Asunto del ticket</Label>
                  <Input
                    value={formData.ticketSubject}
                    onChange={(e) => setFormData({ ...formData, ticketSubject: e.target.value })}
                    placeholder="Usar asunto del email si vacío"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Prioridad</Label>
                  <Select 
                    value={formData.ticketPriority} 
                    onValueChange={(v) => setFormData({ ...formData, ticketPriority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="medium">Media</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Submit buttons */}
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (sending) {
                  cancelSend();
                } else {
                  // Reset form
                  setFormData({
                    to: '',
                    cc: '',
                    bcc: '',
                    subject: '',
                    body: '',
                    contactId: '',
                    ticketId: '',
                    createTicket: false,
                    ticketSubject: '',
                    ticketPriority: 'medium',
                  });
                  setSelectedTemplate('__none__');
                  setAttachments([]);
                }
              }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              {sending ? 'Cancelar envío' : 'Limpiar'}
            </Button>
            <Button type="submit" disabled={sending} className="gap-2">
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Email
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
