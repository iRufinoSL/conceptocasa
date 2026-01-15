import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useEmailService } from '@/hooks/useEmailService';
import { useToast } from '@/hooks/use-toast';
import { 
  Send, Mail, User, Paperclip, X, Plus, 
  FileText, ChevronDown, File, Forward, Users, FolderOpen, Loader2
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { DocumentAttachmentPicker } from './DocumentAttachmentPicker';

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
  type: string;
  isForwarded?: boolean;
  isFromDocuments?: boolean;
}

type Contact = {
  id: string;
  name: string;
  surname?: string | null;
  email: string | null;
};

type EmailTemplate = Tables<'email_templates'>;

interface BudgetComposeEmailProps {
  budgetId: string;
  projectId: string | null;
  budgetContacts: Contact[];
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

export function BudgetComposeEmail({ budgetId, projectId, budgetContacts, replyTo, onSent }: BudgetComposeEmailProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sendEmail, sending, cancelSend } = useEmailService();

  // Build initial body for forwards - include original message
  const getInitialBody = () => {
    if (replyTo?.forwardEmailId && replyTo?.originalBody) {
      const separator = '<br><br>---------- Mensaje reenviado ----------<br><br>';
      return separator + replyTo.originalBody;
    }
    return '';
  };

  const [formData, setFormData] = useState({
    to: replyTo?.email || '',
    cc: '',
    bcc: '',
    // Don't add Re: prefix if subject already starts with Fwd: or Re:
    subject: replyTo?.subject 
      ? (replyTo.subject.startsWith('Fwd:') || replyTo.subject.startsWith('Re:') 
          ? replyTo.subject 
          : `Re: ${replyTo.subject}`)
      : '',
    body: getInitialBody(),
    contactId: replyTo?.contactId || '',
  });

  const [showCcBcc, setShowCcBcc] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('__none__');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [loadingForwardAttachments, setLoadingForwardAttachments] = useState(false);
  const [loadingDocumentAttachments, setLoadingDocumentAttachments] = useState(false);
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

  // Handle documents selected from document picker
  const handleDocumentsSelected = async (documents: { id: string; name: string; file_path: string; file_type: string | null; file_size: number | null }[]) => {
    if (documents.length === 0) return;
    
    setLoadingDocumentAttachments(true);
    try {
      const downloadedFiles: AttachmentFile[] = [];
      
      for (const doc of documents) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('project-documents')
            .download(doc.file_path);
          
          if (downloadError) {
            console.error('Error downloading document:', doc.name, downloadError);
            toast({
              title: 'Error',
              description: `No se pudo cargar el documento: ${doc.name}`,
              variant: 'destructive',
            });
            continue;
          }
          
          const fileType = doc.file_type || 'application/octet-stream';
          const blob = new Blob([fileData], { type: fileType });
          // Create a file-like object for the attachment
          const fileObj = Object.assign(blob, { name: doc.name }) as unknown as File;
          
          downloadedFiles.push({
            file: fileObj,
            name: doc.name,
            size: doc.file_size || fileData.size,
            type: fileType,
            isFromDocuments: true,
          });
        } catch (e) {
          console.error('Error processing document:', doc.name, e);
        }
      }
      
      if (downloadedFiles.length > 0) {
        setAttachments(prev => [...prev, ...downloadedFiles]);
        toast({ 
          title: `${downloadedFiles.length} documento(s) añadido(s)`,
          description: 'Los documentos del proyecto se han adjuntado al email',
        });
      }
    } catch (e) {
      console.error('Error loading documents:', e);
      toast({
        title: 'Error',
        description: 'Error al cargar los documentos',
        variant: 'destructive',
      });
    } finally {
      setLoadingDocumentAttachments(false);
    }
  };

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
        const { data: emailAttachments, error } = await supabase
          .from('email_attachments')
          .select('*')
          .eq('email_id', replyTo.forwardEmailId);
        
        if (error) {
          console.error('Error fetching forward attachments:', error);
          return;
        }
        
        if (!emailAttachments || emailAttachments.length === 0) return;
        
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
  }, [selectedTemplate, templates]);

  // Find contact by email
  const matchedContact = budgetContacts.find(c => c.email === formData.to);

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
        budget_id: budgetId, // Link email to this budget
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      });

      toast({ 
        title: '✓ Email enviado correctamente',
        description: 'El email ha sido enviado y vinculado a este presupuesto.',
      });
      
      // Reset form
      setFormData({
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        body: '',
        contactId: '',
      });
      setSelectedTemplate('__none__');
      setAttachments([]);
      
      // Invalidate budget emails query
      queryClient.invalidateQueries({ queryKey: ['budget-emails', budgetId] });
      
      if (onSent) onSent();
    } catch (error: any) {
      toast({ 
        title: 'Error al enviar', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  const handleContactSelect = (contactId: string) => {
    const contact = budgetContacts.find(c => c.id === contactId);
    if (contact?.email) {
      setFormData(prev => ({
        ...prev,
        to: contact.email!,
        contactId: contact.id
      }));
    }
  };

  return (
    <Card className="flex flex-col max-h-[calc(100vh-300px)]">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Redactar Email
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Contact Selector */}
          {budgetContacts.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Seleccionar contacto del presupuesto
              </Label>
              <Select onValueChange={handleContactSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir contacto..." />
                </SelectTrigger>
                <SelectContent>
                  {budgetContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {contact.name} {contact.surname} - {contact.email}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

          {/* To field */}
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
              />
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
              rows={8}
              className="min-h-[150px]"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Archivos adjuntos
                {(loadingForwardAttachments || loadingDocumentAttachments) && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Cargando...
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                {projectId && (
                  <DocumentAttachmentPicker
                    projectId={projectId}
                    onSelectDocuments={handleDocumentsSelected}
                    disabled={loadingForwardAttachments || loadingDocumentAttachments}
                  />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                  disabled={loadingForwardAttachments || loadingDocumentAttachments}
                >
                  <Plus className="h-4 w-4" />
                  Subir archivo
                </Button>
              </div>
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
                      {attachment.isFromDocuments && (
                        <Badge variant="outline" className="gap-1 flex-shrink-0">
                          <FolderOpen className="h-3 w-3" />
                          Documento
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

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={sending} className="flex-1 gap-2">
              <Send className="h-4 w-4" />
              {sending ? 'Enviando...' : 'Enviar Email'}
            </Button>
            {sending && (
              <Button type="button" variant="outline" onClick={cancelSend}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
