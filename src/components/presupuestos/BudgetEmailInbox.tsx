import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, Inbox, Send, ChevronDown, ChevronRight, Reply, Forward,
  Paperclip, Eye, Clock, CheckCircle, XCircle, Trash2, Download, FileText, Image, File, Maximize2, FilePlus
} from 'lucide-react';
import { CreateDocumentFromEmailDialog } from '@/components/crm/CreateDocumentFromEmailDialog';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import DOMPurify from 'dompurify';

type EmailAttachment = Tables<'email_attachments'>;

type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  email_attachments?: EmailAttachment[];
};

interface BudgetEmailInboxProps {
  budgetId: string;
  onComposeReply?: (email: EmailMessage) => void;
  onComposeForward?: (email: EmailMessage) => void;
}

export function BudgetEmailInbox({ budgetId, onComposeReply, onComposeForward }: BudgetEmailInboxProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isInboxExpanded, setIsInboxExpanded] = useState(true);
  const [isOutboxExpanded, setIsOutboxExpanded] = useState(true);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [emailForDocument, setEmailForDocument] = useState<EmailMessage | null>(null);

  // Fetch emails related to this budget via junction table
  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['budget-emails', budgetId],
    queryFn: async () => {
      // First get email IDs assigned to this budget
      const { data: assignments, error: assignmentsError } = await supabase
        .from('email_budget_assignments')
        .select('email_id')
        .eq('budget_id', budgetId);
      
      if (assignmentsError) throw assignmentsError;
      
      if (!assignments || assignments.length === 0) {
        return [];
      }
      
      const emailIds = assignments.map(a => a.email_id);
      
      // Then fetch the emails
      const { data, error } = await supabase
        .from('email_messages')
        .select(`
          *,
          crm_contacts (id, name, surname, email),
          email_attachments (id, file_name, file_path, file_size, file_type)
        `)
        .in('id', emailIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as EmailMessage[];
    },
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Don't update selectedEmail here - already optimistically updated in handleSelectEmail
      queryClient.invalidateQueries({ queryKey: ['budget-emails', budgetId] });
    },
  });

  // Soft delete email mutation (move to trash)
  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Email movido a papelera' });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['budget-emails', budgetId] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error al borrar email', 
        description: error?.message || 'No se pudo borrar el email',
        variant: 'destructive' 
      });
    },
  });

  // Group emails by direction
  const inboundEmails = useMemo(() => 
    emails.filter(e => e.direction === 'inbound'), [emails]);
  const outboundEmails = useMemo(() => 
    emails.filter(e => e.direction === 'outbound'), [emails]);

  const unreadCount = inboundEmails.filter(e => !e.is_read).length;

  // Get file icon based on type
  const getFileIcon = (fileType: string | null | undefined, fileName: string) => {
    const type = fileType?.toLowerCase() || fileName.toLowerCase();
    if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
    if (type.includes('image') || type.includes('jpg') || type.includes('png') || type.includes('jpeg')) 
      return <Image className="h-4 w-4 text-blue-500" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  // Format file size
  const formatFileSize = (size: number | null | undefined) => {
    if (!size) return '';
    if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  // Download attachment
  const downloadAttachment = async (attachment: EmailAttachment) => {
    if (!attachment.file_path) {
      toast({ title: 'Error', description: 'No se encuentra la ruta del archivo', variant: 'destructive' });
      return;
    }
    
    try {
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .download(attachment.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: 'Descarga iniciada', description: attachment.file_name });
    } catch (error: any) {
      console.error('Error downloading attachment:', error);
      toast({ 
        title: 'Error al descargar', 
        description: error?.message || 'No se pudo descargar el archivo',
        variant: 'destructive' 
      });
    }
  };

  // Preview attachment (for images and PDFs)
  const previewAttachment = async (attachment: EmailAttachment) => {
    if (!attachment.file_path) {
      toast({ title: 'Error', description: 'No se encuentra la ruta del archivo', variant: 'destructive' });
      return;
    }
    
    try {
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .createSignedUrl(attachment.file_path, 3600);

      if (error) throw error;

      // Open in new tab
      window.open(data.signedUrl, '_blank');
    } catch (error: any) {
      console.error('Error previewing attachment:', error);
      toast({ 
        title: 'Error al abrir vista previa', 
        description: error?.message || 'No se pudo abrir el archivo',
        variant: 'destructive' 
      });
    }
  };

  const handleSelectEmail = (email: EmailMessage) => {
    // Optimistically mark as read so the dialog doesn't re-render mid-interaction
    const emailToShow = (!email.is_read && email.direction === 'inbound')
      ? { ...email, is_read: true, read_at: new Date().toISOString() }
      : email;
    setSelectedEmail(emailToShow);
    if (!email.is_read && email.direction === 'inbound') {
      markAsReadMutation.mutate(email.id);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      case 'pending':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      default:
        return null;
    }
  };

  const EmailListItem = ({ email }: { email: EmailMessage }) => {
    const isSelected = selectedEmail?.id === email.id;
    const isUnread = !email.is_read && email.direction === 'inbound';
    
    return (
      <div
        className={`p-3 border-b cursor-pointer transition-colors ${
          isSelected ? 'bg-accent' : 'hover:bg-accent/50'
        } ${isUnread ? 'bg-primary/5' : ''}`}
        onClick={() => handleSelectEmail(email)}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isUnread && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
              <span className={`text-sm truncate ${isUnread ? 'font-semibold' : ''}`}>
                {email.direction === 'inbound' 
                  ? (email.from_name || email.from_email)
                  : email.to_emails?.[0]}
              </span>
              {getStatusIcon(email.status)}
            </div>
            <p className={`text-sm truncate mt-0.5 ${isUnread ? 'font-medium' : 'text-muted-foreground'}`}>
              {email.subject || '(Sin asunto)'}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>
                {format(new Date(email.created_at), "d MMM HH:mm", { locale: es })}
              </span>
              {email.email_attachments && email.email_attachments.length > 0 && (
                <Paperclip className="h-3 w-3" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const EmailDetail = ({ email, isFullscreen = false }: { email: EmailMessage; isFullscreen?: boolean }) => {
    const sanitizedHtml = email.body_html 
      ? DOMPurify.sanitize(email.body_html, {
          ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img'],
          ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'src', 'alt', 'width', 'height'],
        })
      : null;

    return (
      <Card className="flex-1 flex flex-col">
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg break-words">
                {email.subject || '(Sin asunto)'}
              </CardTitle>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p className="break-all">
                  <span className="font-medium">De:</span> {email.from_name || email.from_email} 
                  {email.from_name && <span className="ml-1 text-xs">({email.from_email})</span>}
                </p>
                <p className="break-all">
                  <span className="font-medium">Para:</span> {email.to_emails?.join(', ')}
                </p>
                <p>
                  <span className="font-medium">Fecha:</span>{' '}
                  {format(new Date(email.created_at), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                </p>
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0 flex-wrap">
              {!isFullscreen && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => setIsFullscreenOpen(true)}
                  title="Ver a pantalla completa"
                  className="bg-primary text-primary-foreground"
                >
                  <Maximize2 className="h-4 w-4 mr-1" />
                  Ampliar
                </Button>
              )}
              {onComposeReply && (
                <Button variant="outline" size="sm" onClick={() => onComposeReply(email)}>
                  <Reply className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Responder</span>
                </Button>
              )}
              {onComposeForward && (
                <Button variant="outline" size="sm" onClick={() => onComposeForward(email)}>
                  <Forward className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Reenviar</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setEmailForDocument(email);
                  setShowCreateDocument(true);
                }}
              >
                <FilePlus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Documento</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => deleteEmailMutation.mutate(email.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Borrar</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden overflow-x-hidden">
          <ScrollArea className={isFullscreen ? "h-full max-h-[70vh]" : "h-full max-h-[400px]"}>
            <div className="pr-4 overflow-x-hidden">
              {(sanitizedHtml || email.body_text) ? (
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden [word-break:break-word] [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:overflow-hidden [&_*]:break-words [&_img]:max-w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:block [&_pre]:overflow-x-auto [&_pre]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sanitizedHtml || email.body_text?.replace(/\n/g, '<br>') || '') }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm break-words overflow-hidden" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  (Sin contenido)
                </div>
              )}
            </div>
          </ScrollArea>
          
          {email.email_attachments && email.email_attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Adjuntos ({email.email_attachments.length})
              </p>
              <div className="space-y-2">
                {email.email_attachments.map((att) => (
                  <div 
                    key={att.id} 
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-md border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(att.file_type, att.file_name)}
                      <span className="text-sm truncate max-w-[200px]" title={att.file_name}>
                        {att.file_name}
                      </span>
                      {att.file_size && (
                        <span className="text-xs text-muted-foreground">
                          ({formatFileSize(att.file_size)})
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => previewAttachment(att)}
                        title="Ver archivo"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadAttachment(att)}
                        title="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Email List */}
      <div className="space-y-4">
        {/* Inbox Section */}
        <Card>
          <Collapsible open={isInboxExpanded} onOpenChange={setIsInboxExpanded}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {isInboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Inbox className="h-4 w-4" />
                    Bandeja de Entrada
                    <Badge variant="secondary" className="ml-2">
                      {inboundEmails.length}
                    </Badge>
                    {unreadCount > 0 && (
                      <Badge variant="default" className="ml-1">
                        {unreadCount} sin leer
                      </Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0">
                {inboundEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay emails recibidos
                  </p>
                ) : (
                  <ScrollArea className="max-h-[300px]">
                    {inboundEmails.map((email) => (
                      <EmailListItem key={email.id} email={email} />
                    ))}
                  </ScrollArea>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Outbox Section */}
        <Card>
          <Collapsible open={isOutboxExpanded} onOpenChange={setIsOutboxExpanded}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {isOutboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Send className="h-4 w-4" />
                    Bandeja de Salida
                    <Badge variant="secondary" className="ml-2">
                      {outboundEmails.length}
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0">
                {outboundEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay emails enviados
                  </p>
                ) : (
                  <ScrollArea className="max-h-[300px]">
                    {outboundEmails.map((email) => (
                      <EmailListItem key={email.id} email={email} />
                    ))}
                  </ScrollArea>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Email Detail */}
      <div>
        {selectedEmail ? (
          <EmailDetail email={selectedEmail} />
        ) : (
          <Card className="h-full min-h-[400px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Selecciona un email para ver su contenido</p>
            </div>
          </Card>
        )}
      </div>

      {/* Fullscreen Email Dialog */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full flex flex-col p-0">
          <DialogHeader className="p-4 pb-0 flex-shrink-0">
            <DialogTitle className="break-words">
              {selectedEmail?.subject || '(Sin asunto)'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {selectedEmail && <EmailDetail email={selectedEmail} isFullscreen />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Document from Email Dialog */}
      <CreateDocumentFromEmailDialog
        open={showCreateDocument}
        onOpenChange={setShowCreateDocument}
        email={emailForDocument}
      />
    </div>
  );
}
