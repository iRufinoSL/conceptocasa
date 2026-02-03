import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { 
  Mail, MessageSquare, Search, ArrowUpRight, ArrowDownLeft, 
  Phone, Calendar, Clock, Eye, Plus, Maximize2, X, Smartphone,
  Reply, Forward, Paperclip, Download, ExternalLink, FolderOpen, FilePlus, RefreshCw, Loader2,
  FileText, Image, File as FileIcon, Trash2
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { CommunicationActionsDialog } from '@/components/communications/CommunicationActionsDialog';
import { CreateDocumentFromEmailDialog } from '@/components/crm/CreateDocumentFromEmailDialog';
import type { Tables } from '@/integrations/supabase/types';

interface ContactCommunicationsHistoryProps {
  contactId: string;
  contactPhone?: string | null;
  isAdmin?: boolean;
}

type EmailAttachment = Tables<'email_attachments'>;

interface EmailMessage {
  id: string;
  direction: string;
  from_email: string;
  to_emails: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  is_read: boolean | null;
  contact_id: string | null;
  budget_id: string | null;
  project_id: string | null;
  ticket_id: string | null;
  email_attachments?: EmailAttachment[];
}

interface WhatsAppMessage {
  id: string;
  direction: string;
  phone_number: string;
  message: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface SmsMessage {
  id: string;
  direction: string;
  subject: string | null;
  content: string;
  status: string;
  error_message: string | null;
  created_at: string;
  metadata: any;
}

export function ContactCommunicationsHistory({ contactId, contactPhone, isAdmin = false }: ContactCommunicationsHistoryProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [expandedDialogOpen, setExpandedDialogOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const queryClient = useQueryClient();

  // New state for email detail view
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [emailDetailDialogOpen, setEmailDetailDialogOpen] = useState(false);
  const [actionsDialogOpen, setActionsDialogOpen] = useState(false);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Helper functions for attachments
  const getEmailAttachmentDisplayName = (att: EmailAttachment) => {
    const name = (att.file_name || '').trim();
    if (name) return name;
    return att.file_path?.split('/').pop() || 'adjunto';
  };

  const getEmailFileIcon = (fileType: string | null | undefined, fileName: string) => {
    const type = (fileType || '').toLowerCase();
    const name = fileName.toLowerCase();
    if (type.includes('pdf') || name.endsWith('.pdf')) return <FileText className="h-4 w-4 text-primary" />;
    if (type.includes('image') || name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return <Image className="h-4 w-4 text-primary" />;
    return <FileIcon className="h-4 w-4 text-muted-foreground" />;
  };

  const formatFileSize = (size: number | null | undefined) => {
    if (!size) return '';
    return size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;
  };

  const previewEmailAttachment = async (att: EmailAttachment) => {
    if (!att.file_path) {
      toast.error('No se encuentra la ruta del archivo');
      return;
    }
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .createSignedUrl(att.file_path, 3600);
      if (error) throw error;
      setPreviewAttachment({
        url: data.signedUrl,
        name: getEmailAttachmentDisplayName(att),
        type: att.file_type || ''
      });
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo abrir el archivo');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadEmailAttachment = async (att: EmailAttachment) => {
    if (!att.file_path) {
      toast.error('No se encuentra la ruta del archivo');
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .download(att.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = getEmailAttachmentDisplayName(att);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Descarga iniciada');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo descargar el archivo');
    }
  };

  // Fetch emails for this contact with attachments
  const { data: emails = [], isLoading: loadingEmails, refetch: refetchEmails } = useQuery({
    queryKey: ['contact-emails', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select(`
          id, direction, from_email, to_emails, subject, body_text, body_html, 
          status, sent_at, received_at, created_at, is_read, contact_id, 
          budget_id, project_id, ticket_id,
          email_attachments (id, file_name, file_path, file_type, file_size)
        `)
        .eq('contact_id', contactId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as EmailMessage[];
    },
  });

  // Fetch WhatsApp messages for this contact
  const { data: whatsappMessages = [], isLoading: loadingWhatsApp, refetch: refetchWhatsApp } = useQuery({
    queryKey: ['contact-whatsapp', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, direction, phone_number, message, status, notes, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as WhatsAppMessage[];
    },
  });

  // Fetch SMS communications for this contact (stored in crm_communications)
  const { data: smsMessages = [], isLoading: loadingSms } = useQuery({
    queryKey: ['contact-sms', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_communications')
        .select('id, direction, subject, content, status, error_message, created_at, metadata')
        .eq('contact_id', contactId)
        .eq('communication_type', 'sms')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SmsMessage[];
    },
  });

  // Mutation to save received WhatsApp
  const saveReceivedWhatsApp = useMutation({
    mutationFn: async () => {
      if (!newMessage.trim()) throw new Error('El mensaje es obligatorio');
      
      const { error } = await supabase
        .from('whatsapp_messages')
        .insert({
          contact_id: contactId,
          phone_number: contactPhone || '',
          message: newMessage.trim(),
          direction: 'inbound',
          status: 'received',
          notes: newNotes.trim() || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('WhatsApp recibido registrado');
      setNewMessage('');
      setNewNotes('');
      setRegisterDialogOpen(false);
      refetchWhatsApp();
      queryClient.invalidateQueries({ queryKey: ['contact-whatsapp', contactId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al registrar WhatsApp');
    },
  });

  // Resend email mutation
  const resendEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      // Fetch the original email
      const { data: originalEmail, error: fetchError } = await supabase
        .from('email_messages')
        .select('*')
        .eq('id', emailId)
        .single();
      
      if (fetchError) throw fetchError;
      if (!originalEmail) throw new Error('Email no encontrado');

      // Call the send-crm-email edge function
      const { data, error } = await supabase.functions.invoke('send-crm-email', {
        body: {
          to: originalEmail.to_emails,
          cc: originalEmail.cc_emails || [],
          bcc: originalEmail.bcc_emails || [],
          subject: originalEmail.subject || '(Sin asunto)',
          html: originalEmail.body_html || originalEmail.body_text || '',
          contact_id: originalEmail.contact_id,
          budget_id: originalEmail.budget_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      toast.success('Email reenviado correctamente');
      refetchEmails();
    },
    onError: (error: any) => {
      toast.error(error.message || 'No se pudo reenviar el email');
    },
  });

  // Delete email mutation
  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Email movido a papelera');
      setSelectedEmail(null);
      setEmailDetailDialogOpen(false);
      refetchEmails();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar email');
    },
  });

  // Handle email click to open detail view
  const handleEmailClick = (email: EmailMessage) => {
    setSelectedEmail(email);
    setEmailDetailDialogOpen(true);
  };

  const isLoading = loadingEmails || loadingWhatsApp || loadingSms;

  // Filter messages based on search
  const filteredEmails = emails.filter(email => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(searchLower) ||
      email.body_text?.toLowerCase().includes(searchLower) ||
      email.from_email.toLowerCase().includes(searchLower)
    );
  });

  const filteredWhatsApp = whatsappMessages.filter(msg => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      msg.message.toLowerCase().includes(searchLower) ||
      msg.phone_number.includes(searchLower) ||
      msg.notes?.toLowerCase().includes(searchLower)
    );
  });

  const filteredSms = smsMessages.filter((sms) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const metaTo = sms?.metadata?.to_phone ? String(sms.metadata.to_phone) : '';
    const metaFrom = sms?.metadata?.from_phone ? String(sms.metadata.from_phone) : '';
    return (
      (sms.subject || '').toLowerCase().includes(searchLower) ||
      (sms.content || '').toLowerCase().includes(searchLower) ||
      metaTo.includes(searchLower) ||
      metaFrom.includes(searchLower) ||
      (sms.error_message || '').toLowerCase().includes(searchLower)
    );
  });

  // Combine all messages for timeline view
  const allMessages = [
    ...filteredEmails.map(e => ({ ...e, type: 'email' as const })),
    ...filteredWhatsApp.map(w => ({ ...w, type: 'whatsapp' as const })),
    ...filteredSms.map(s => ({ ...s, type: 'sms' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredAll = activeTab === 'all' 
    ? allMessages 
    : activeTab === 'email' 
      ? allMessages.filter(m => m.type === 'email')
      : activeTab === 'whatsapp'
        ? allMessages.filter(m => m.type === 'whatsapp')
        : allMessages.filter(m => m.type === 'sms');

  // Stats
  const stats = {
    totalEmails: emails.length,
    sentEmails: emails.filter(e => e.direction === 'outbound').length,
    receivedEmails: emails.filter(e => e.direction === 'inbound').length,
    totalWhatsApp: whatsappMessages.length,
    sentWhatsApp: whatsappMessages.filter(w => w.direction === 'outbound').length,
    receivedWhatsApp: whatsappMessages.filter(w => w.direction === 'inbound').length,
    totalSms: smsMessages.length,
    sentSms: smsMessages.filter(s => s.direction === 'outbound').length,
    receivedSms: smsMessages.filter(s => s.direction === 'inbound').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'delivered': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'read': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'replied': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'received': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cargando comunicaciones...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Historial de Comunicaciones
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setExpandedDialogOpen(true)}
                title="Expandir a pantalla completa"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setRegisterDialogOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Registrar WA recibido
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-0 pb-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-center">
              <div className="flex items-center justify-center gap-1 text-blue-600">
                <Mail className="h-3 w-3" />
                <span className="text-sm font-bold">{stats.totalEmails}</span>
              </div>
              <p className="text-xs text-muted-foreground">Emails</p>
              <p className="text-xs text-muted-foreground">
                ↑{stats.sentEmails} ↓{stats.receivedEmails}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
              <div className="flex items-center justify-center gap-1 text-green-600">
                <MessageSquare className="h-3 w-3" />
                <span className="text-sm font-bold">{stats.totalWhatsApp}</span>
              </div>
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <p className="text-xs text-muted-foreground">
                ↑{stats.sentWhatsApp} ↓{stats.receivedWhatsApp}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/20 text-center">
              <div className="flex items-center justify-center gap-1 text-purple-600">
                <Smartphone className="h-3 w-3" />
                <span className="text-sm font-bold">{stats.totalSms}</span>
              </div>
              <p className="text-xs text-muted-foreground">SMS</p>
              <p className="text-xs text-muted-foreground">
                ↑{stats.sentSms} ↓{stats.receivedSms}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en comunicaciones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 h-8">
              <TabsTrigger value="all" className="text-xs">Todo ({allMessages.length})</TabsTrigger>
              <TabsTrigger value="email" className="text-xs gap-1">
                <Mail className="h-3 w-3" /> Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="text-xs gap-1">
                <MessageSquare className="h-3 w-3" /> WA
              </TabsTrigger>
              <TabsTrigger value="sms" className="text-xs gap-1">
                <Smartphone className="h-3 w-3" /> SMS
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Messages list */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-4">
              {filteredAll.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay comunicaciones registradas
                </p>
              ) : (
                filteredAll.map((item) => {
                  const isEmail = item.type === 'email';
                  const isSms = item.type === 'sms';
                  const isInbound = item.direction === 'inbound';

                  const itemStatus = (item as any).status;
                  const itemCreatedAt = (item as any).created_at;
                  const messageText = isEmail
                    ? ((item as EmailMessage).subject || '(Sin asunto)')
                    : isSms
                      ? ((item as SmsMessage).content || '')
                      : ((item as WhatsAppMessage).message || '');
                  const notesText = !isEmail && !isSms ? (item as WhatsAppMessage).notes : null;
                  const errorText = isSms ? (item as SmsMessage).error_message : null;
                  const typeIconBg = isEmail
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : isSms
                      ? 'bg-purple-100 dark:bg-purple-900/30'
                      : 'bg-green-100 dark:bg-green-900/30';

                  const TypeIcon = isEmail ? Mail : isSms ? Smartphone : MessageSquare;
                  const typeIconColor = isEmail ? 'text-blue-600' : isSms ? 'text-purple-600' : 'text-green-600';
                  
                  const hasAttachments = isEmail && ((item as EmailMessage).email_attachments?.length || 0) > 0;
                  
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`p-2 rounded-lg border ${isInbound ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-blue-500'} bg-card ${isEmail ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}
                      onClick={isEmail ? () => handleEmailClick(item as EmailMessage) : undefined}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded-full ${typeIconBg}`}>
                          <TypeIcon className={`h-3 w-3 ${typeIconColor}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            {isInbound ? (
                              <ArrowDownLeft className="h-3 w-3 text-green-600" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3 text-blue-600" />
                            )}
                            <span className="text-xs font-medium">
                              {isInbound ? 'Recibido' : 'Enviado'}
                            </span>
                            <Badge className={`text-[10px] h-4 ${getStatusColor(itemStatus)}`}>
                              {itemStatus}
                            </Badge>
                            {hasAttachments && (
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          
                          {isEmail ? (
                            <p className="text-xs mt-1 truncate font-medium">{messageText}</p>
                          ) : (
                            <>
                              <p className="text-xs mt-1 line-clamp-2">{messageText}</p>
                              {notesText && (
                                <p className="text-[10px] mt-1 text-muted-foreground italic">
                                  📝 {notesText}
                                </p>
                              )}
                              {errorText && itemStatus === 'failed' && (
                                <p className="text-[10px] mt-1 text-destructive">
                                  {errorText}
                                </p>
                              )}
                            </>
                          )}
                          
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {format(new Date(itemCreatedAt), 'd MMM yy', { locale: es })}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {format(new Date(itemCreatedAt), 'HH:mm')}
                            </span>
                            {isEmail && (item as EmailMessage).is_read && (
                              <Eye className="h-2.5 w-2.5" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Register Received WhatsApp Dialog */}
      <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Registrar WhatsApp Recibido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Copia y pega aquí el mensaje de WhatsApp que has recibido de este contacto para registrarlo en el historial.
            </p>
            <div className="space-y-2">
              <Label htmlFor="message">Mensaje recibido *</Label>
              <Textarea
                id="message"
                placeholder="Pega aquí el contenido del WhatsApp..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Input
                id="notes"
                placeholder="Añade notas o contexto adicional..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>
            {contactPhone && (
              <p className="text-xs text-muted-foreground">
                Teléfono del contacto: {contactPhone}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveReceivedWhatsApp.mutate()}
              disabled={!newMessage.trim() || saveReceivedWhatsApp.isPending}
              className="gap-1"
            >
              {saveReceivedWhatsApp.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expanded Full-Screen Communications Dialog */}
      <Dialog open={expandedDialogOpen} onOpenChange={setExpandedDialogOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Historial de Comunicaciones
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col gap-4 overflow-hidden py-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 flex-shrink-0">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-center">
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <Mail className="h-4 w-4" />
                  <span className="text-lg font-bold">{stats.totalEmails}</span>
                </div>
                <p className="text-sm text-muted-foreground">Emails</p>
                <p className="text-sm text-muted-foreground">
                  ↑ {stats.sentEmails} enviados · ↓ {stats.receivedEmails} recibidos
                </p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-lg font-bold">{stats.totalWhatsApp}</span>
                </div>
                <p className="text-sm text-muted-foreground">WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  ↑ {stats.sentWhatsApp} enviados · ↓ {stats.receivedWhatsApp} recibidos
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en comunicaciones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-shrink-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">Todo ({allMessages.length})</TabsTrigger>
                <TabsTrigger value="email" className="gap-1">
                  <Mail className="h-4 w-4" /> Email ({filteredEmails.length})
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="gap-1">
                  <MessageSquare className="h-4 w-4" /> WhatsApp ({filteredWhatsApp.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Messages list - takes remaining space */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-4">
                {filteredAll.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No hay comunicaciones registradas
                  </p>
                ) : (
                  filteredAll.map((item) => {
                    const isEmail = item.type === 'email';
                    const isInbound = item.direction === 'inbound';
                    
                    return (
                      <div
                        key={`expanded-${item.type}-${item.id}`}
                        className={`p-4 rounded-lg border ${isInbound ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-blue-500'} bg-card`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full ${isEmail ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                            {isEmail ? (
                              <Mail className="h-4 w-4 text-blue-600" />
                            ) : (
                              <MessageSquare className="h-4 w-4 text-green-600" />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {isInbound ? (
                                <ArrowDownLeft className="h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4 text-blue-600" />
                              )}
                              <span className="text-sm font-medium">
                                {isInbound ? 'Recibido' : 'Enviado'}
                              </span>
                              <Badge className={`text-xs ${getStatusColor(item.status)}`}>
                                {item.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(item.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                              </span>
                            </div>
                            
                            {isEmail ? (
                              <>
                                <p className="font-medium">
                                  {(item as EmailMessage).subject || '(Sin asunto)'}
                                </p>
                                {(item as EmailMessage).body_text && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                                    {(item as EmailMessage).body_text}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-sm mt-1 whitespace-pre-wrap">
                                  {(item as WhatsAppMessage).message}
                                </p>
                                {(item as WhatsAppMessage).notes && (
                                  <p className="text-xs mt-2 text-muted-foreground italic bg-muted/50 p-2 rounded">
                                    📝 {(item as WhatsAppMessage).notes}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setRegisterDialogOpen(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Registrar WA recibido
            </Button>
            <Button onClick={() => setExpandedDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Detail Dialog */}
      <Dialog open={emailDetailDialogOpen} onOpenChange={setEmailDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Detalle del Email
            </DialogTitle>
          </DialogHeader>

          {selectedEmail && (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden py-2">
              {/* Email metadata */}
              <div className="flex-shrink-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedEmail.direction === 'inbound' ? (
                    <Badge variant="outline" className="text-green-600">
                      <ArrowDownLeft className="h-3 w-3 mr-1" />
                      Entrada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-blue-600">
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                      Salida
                    </Badge>
                  )}
                  <Badge className={getStatusColor(selectedEmail.status)}>
                    {selectedEmail.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(selectedEmail.created_at), "EEEE d 'de' MMMM yyyy, HH:mm", { locale: es })}
                  </span>
                </div>
                
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">De:</span> {selectedEmail.from_email}</p>
                  <p><span className="font-medium">Para:</span> {selectedEmail.to_emails?.join(', ')}</p>
                  {selectedEmail.subject && (
                    <p><span className="font-medium">Asunto:</span> {selectedEmail.subject}</p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap flex-shrink-0 border-y py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmailDetailDialogOpen(false);
                    setTimeout(() => setActionsDialogOpen(true), 100);
                  }}
                  className="gap-1"
                >
                  <FolderOpen className="h-4 w-4" />
                  Asociar/Tarea
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmailDetailDialogOpen(false);
                    setTimeout(() => setShowCreateDocument(true), 100);
                  }}
                  className="gap-1"
                >
                  <FilePlus className="h-4 w-4" />
                  Documento
                </Button>

                {selectedEmail.direction === 'outbound' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resendEmailMutation.mutate(selectedEmail.id)}
                    disabled={resendEmailMutation.isPending}
                    className="gap-1"
                  >
                    {resendEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Volver a enviar
                  </Button>
                )}

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    onClick={() => {
                      if (confirm('¿Estás seguro de que deseas eliminar este email?')) {
                        deleteEmailMutation.mutate(selectedEmail.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                )}
              </div>

              {/* Email body */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="overflow-x-auto pr-4">
                  {selectedEmail.body_html ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none break-words [word-break:break-word] [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_img]:max-w-full [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmail.body_html) }}
                    />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {selectedEmail.body_text}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Attachments */}
              {(selectedEmail.email_attachments?.length || 0) > 0 && (
                <div className="flex-shrink-0 border-t pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    Adjuntos ({selectedEmail.email_attachments?.length})
                  </p>
                  <div className="space-y-2">
                    {selectedEmail.email_attachments?.map((att) => {
                      const name = getEmailAttachmentDisplayName(att);
                      return (
                        <div key={att.id} className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md border">
                          <div className="flex items-center gap-2 min-w-0">
                            {getEmailFileIcon(att.file_type, name)}
                            <span className="text-sm truncate max-w-[260px]" title={name}>{name}</span>
                            {att.file_size ? (
                              <span className="text-xs text-muted-foreground">({formatFileSize(att.file_size)})</span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => previewEmailAttachment(att)} title="Ver">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => downloadEmailAttachment(att)} title="Descargar">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button onClick={() => setEmailDetailDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Communication Actions Dialog */}
      {selectedEmail && (
        <CommunicationActionsDialog
          open={actionsDialogOpen}
          onOpenChange={setActionsDialogOpen}
          communicationId={selectedEmail.id}
          communicationType="email"
          communicationSubject={selectedEmail.subject}
          communicationContent={selectedEmail.body_text || selectedEmail.body_html || ''}
          contactId={selectedEmail.contact_id}
        />
      )}

      {/* Create Document From Email Dialog */}
      {selectedEmail && (
        <CreateDocumentFromEmailDialog
          open={showCreateDocument}
          onOpenChange={(open) => {
            setShowCreateDocument(open);
            if (!open) {
              toast.success('Email marcado como documento');
            }
          }}
          email={selectedEmail as any}
        />
      )}

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {previewAttachment?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-[400px]">
            {previewAttachment && (
              previewAttachment.type.includes('image') ? (
                <img src={previewAttachment.url} alt={previewAttachment.name} className="max-w-full max-h-[70vh] object-contain mx-auto" />
              ) : previewAttachment.type.includes('pdf') ? (
                <iframe src={previewAttachment.url} className="w-full h-[70vh]" title={previewAttachment.name} />
              ) : (
                <div className="text-center py-12">
                  <FileIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Vista previa no disponible para este tipo de archivo</p>
                  <Button onClick={() => window.open(previewAttachment.url, '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir en nueva pestaña
                  </Button>
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}