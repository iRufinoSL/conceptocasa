import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, MessageSquare, Smartphone, ChevronDown, ChevronRight, 
  Reply, Forward, Trash2, ArrowDownLeft, ArrowUpRight,
  Paperclip, Eye, Clock, CheckCircle, XCircle, Search, Inbox, Send
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import DOMPurify from 'dompurify';

// Types for unified communications
type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  email_attachments?: { id: string; file_name: string }[];
};

type WhatsAppMessage = Tables<'whatsapp_messages'> & {
  crm_contacts?: { name: string; surname: string | null } | null;
  whatsapp_attachments?: { id: string; file_name: string }[];
};

interface UnifiedCommunication {
  id: string;
  type: 'email' | 'whatsapp' | 'sms';
  direction: 'inbound' | 'outbound';
  subject?: string | null;
  content: string;
  contactName: string;
  contactEmail?: string | null;
  phoneNumber?: string;
  status: string;
  createdAt: Date;
  isRead?: boolean;
  hasAttachments: boolean;
  budgetId?: string | null;
  projectId?: string | null;
  originalData: EmailMessage | WhatsAppMessage;
}

interface UnifiedCommunicationsListProps {
  budgetId?: string;
  projectId?: string;
  onComposeReply?: (communication: UnifiedCommunication) => void;
  onComposeForward?: (communication: UnifiedCommunication) => void;
  isAdmin?: boolean;
}

const typeIcons = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Smartphone,
};

const typeLabels = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

const typeColors = {
  email: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  whatsapp: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  sms: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-blue-500/10 text-blue-600' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
  failed: { label: 'Fallido', icon: XCircle, color: 'bg-red-500/10 text-red-600' },
  read: { label: 'Leído', icon: Eye, color: 'bg-purple-500/10 text-purple-600' },
  received: { label: 'Recibido', icon: Inbox, color: 'bg-green-500/10 text-green-600' },
  replied: { label: 'Respondido', icon: Reply, color: 'bg-emerald-500/10 text-emerald-600' },
};

export function UnifiedCommunicationsList({ 
  budgetId, 
  projectId, 
  onComposeReply, 
  onComposeForward,
  isAdmin = false 
}: UnifiedCommunicationsListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCommunication, setSelectedCommunication] = useState<UnifiedCommunication | null>(null);
  const [isInboxExpanded, setIsInboxExpanded] = useState(true);
  const [isOutboxExpanded, setIsOutboxExpanded] = useState(true);

  // Fetch emails
  const { data: emails = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['unified-emails', budgetId, projectId],
    queryFn: async () => {
      let emailIds: string[] = [];
      
      // If budgetId, get emails via junction table
      if (budgetId) {
        const { data: assignments, error: assignmentsError } = await supabase
          .from('email_budget_assignments')
          .select('email_id')
          .eq('budget_id', budgetId);
        
        if (assignmentsError) throw assignmentsError;
        if (!assignments || assignments.length === 0) return [];
        emailIds = assignments.map(a => a.email_id);
      }

      let query = supabase
        .from('email_messages')
        .select(`
          *,
          crm_contacts (id, name, surname, email),
          email_attachments (id, file_name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (emailIds.length > 0) {
        query = query.in('id', emailIds);
      } else if (projectId) {
        query = query.eq('project_id', projectId);
      } else if (!budgetId && !projectId) {
        // Global view - get all emails
        query = query.limit(500);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EmailMessage[];
    },
  });

  // Fetch WhatsApp messages
  const { data: whatsappMessages = [], isLoading: loadingWhatsApp } = useQuery({
    queryKey: ['unified-whatsapp', budgetId, projectId],
    queryFn: async () => {
      let query = supabase
        .from('whatsapp_messages')
        .select(`
          *,
          crm_contacts (name, surname)
        `)
        .order('created_at', { ascending: false });

      if (budgetId) {
        query = query.eq('budget_id', budgetId);
      } else if (projectId) {
        query = query.eq('project_id', projectId);
      } else {
        query = query.limit(500);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch attachments for each message
      const messagesWithAttachments = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: attachments } = await supabase
            .from('whatsapp_attachments')
            .select('id, file_name')
            .eq('message_id', msg.id);
          return { ...msg, whatsapp_attachments: attachments || [] };
        })
      );
      
      return messagesWithAttachments as WhatsAppMessage[];
    },
  });

  // Mark email as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
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
      toast({ title: 'Email movido a papelera' });
      setSelectedCommunication(null);
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
    },
  });

  // Delete WhatsApp mutation
  const deleteWhatsAppMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Mensaje eliminado' });
      setSelectedCommunication(null);
      queryClient.invalidateQueries({ queryKey: ['unified-whatsapp'] });
    },
  });

  // Unify communications
  const unifiedCommunications = useMemo(() => {
    const communications: UnifiedCommunication[] = [];

    // Add emails
    emails.forEach(email => {
      communications.push({
        id: email.id,
        type: 'email',
        direction: email.direction as 'inbound' | 'outbound',
        subject: email.subject,
        content: email.body_text || email.body_html || '',
        contactName: email.crm_contacts 
          ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.trim()
          : (email.direction === 'inbound' ? email.from_name || email.from_email : email.to_emails?.[0] || 'Desconocido'),
        contactEmail: email.crm_contacts?.email || (email.direction === 'inbound' ? email.from_email : email.to_emails?.[0]),
        status: email.status,
        createdAt: new Date(email.created_at),
        isRead: email.is_read ?? false,
        hasAttachments: (email.email_attachments?.length || 0) > 0,
        budgetId: email.budget_id,
        projectId: email.project_id,
        originalData: email,
      });
    });

    // Add WhatsApp messages
    whatsappMessages.forEach(msg => {
      communications.push({
        id: msg.id,
        type: 'whatsapp',
        direction: msg.direction as 'inbound' | 'outbound',
        content: msg.message,
        contactName: msg.crm_contacts 
          ? `${msg.crm_contacts.name} ${msg.crm_contacts.surname || ''}`.trim()
          : 'Número externo',
        phoneNumber: msg.phone_number,
        status: msg.status,
        createdAt: new Date(msg.created_at),
        hasAttachments: (msg.whatsapp_attachments?.length || 0) > 0,
        budgetId: msg.budget_id,
        projectId: msg.project_id,
        originalData: msg,
      });
    });

    // Sort by date, most recent first
    return communications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [emails, whatsappMessages]);

  // Filter by search
  const filteredCommunications = useMemo(() => {
    if (!search) return unifiedCommunications;
    const searchLower = search.toLowerCase();
    return unifiedCommunications.filter(comm => 
      comm.contactName.toLowerCase().includes(searchLower) ||
      comm.subject?.toLowerCase().includes(searchLower) ||
      comm.content.toLowerCase().includes(searchLower) ||
      comm.contactEmail?.toLowerCase().includes(searchLower) ||
      comm.phoneNumber?.includes(searchLower)
    );
  }, [unifiedCommunications, search]);

  // Separate inbound and outbound
  const inboundCommunications = filteredCommunications.filter(c => c.direction === 'inbound');
  const outboundCommunications = filteredCommunications.filter(c => c.direction === 'outbound');

  // Stats
  const stats = {
    total: filteredCommunications.length,
    inbound: inboundCommunications.length,
    outbound: outboundCommunications.length,
    emails: filteredCommunications.filter(c => c.type === 'email').length,
    whatsapp: filteredCommunications.filter(c => c.type === 'whatsapp').length,
    unread: filteredCommunications.filter(c => c.type === 'email' && !c.isRead).length,
  };

  const handleSelectCommunication = (comm: UnifiedCommunication) => {
    setSelectedCommunication(comm);
    if (comm.type === 'email' && !comm.isRead) {
      markAsReadMutation.mutate(comm.id);
    }
  };

  const handleDelete = (comm: UnifiedCommunication) => {
    if (comm.type === 'email') {
      deleteEmailMutation.mutate(comm.id);
    } else {
      deleteWhatsAppMutation.mutate(comm.id);
    }
  };

  const handleReply = () => {
    if (selectedCommunication && onComposeReply) {
      onComposeReply(selectedCommunication);
    }
  };

  const handleForward = () => {
    if (selectedCommunication && onComposeForward) {
      onComposeForward(selectedCommunication);
    }
  };

  const isLoading = loadingEmails || loadingWhatsApp;

  // Communication list item component
  const CommunicationListItem = ({ comm }: { comm: UnifiedCommunication }) => {
    const TypeIcon = typeIcons[comm.type];
    const isSelected = selectedCommunication?.id === comm.id;
    const isUnread = comm.type === 'email' && !comm.isRead;
    
    return (
      <div 
        className={`p-3 rounded-lg cursor-pointer transition-colors border ${
          isSelected 
            ? 'bg-primary/10 border-primary/30' 
            : isUnread 
              ? 'bg-accent/50 border-accent hover:bg-accent' 
              : 'hover:bg-accent/50 border-transparent'
        }`}
        onClick={() => handleSelectCommunication(comm)}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full flex-shrink-0 ${typeColors[comm.type]}`}>
            <TypeIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium text-sm truncate ${isUnread ? 'font-semibold' : ''}`}>
                {comm.contactName}
              </span>
              <Badge variant="outline" className={`text-xs ${typeColors[comm.type]}`}>
                {typeLabels[comm.type]}
              </Badge>
              {comm.hasAttachments && (
                <Paperclip className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            {comm.subject && (
              <p className={`text-sm truncate mt-0.5 ${isUnread ? 'font-medium' : 'text-muted-foreground'}`}>
                {comm.subject}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {comm.content.replace(/<[^>]*>/g, '').substring(0, 100)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(comm.createdAt, "d MMM yyyy, HH:mm", { locale: es })}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Communication detail component
  const CommunicationDetail = ({ comm }: { comm: UnifiedCommunication }) => {
    const TypeIcon = typeIcons[comm.type];
    const status = statusConfig[comm.status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = status.icon;

    const renderContent = () => {
      if (comm.type === 'email') {
        const email = comm.originalData as EmailMessage;
        if (email.body_html) {
          return (
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
            />
          );
        }
      }
      return <p className="whitespace-pre-wrap text-sm">{comm.content}</p>;
    };

    return (
      <Card className="h-full">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${typeColors[comm.type]}`}>
                <TypeIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{comm.contactName}</h3>
                  <Badge variant="outline" className={typeColors[comm.type]}>
                    {typeLabels[comm.type]}
                  </Badge>
                  <Badge variant="outline" className={status.color}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {status.label}
                  </Badge>
                  {comm.direction === 'inbound' ? (
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
                </div>
                <p className="text-sm text-muted-foreground">
                  {comm.contactEmail || comm.phoneNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(comm.createdAt, "EEEE d 'de' MMMM yyyy, HH:mm", { locale: es })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {comm.type === 'email' && onComposeReply && (
                <>
                  <Button variant="outline" size="sm" onClick={handleReply}>
                    <Reply className="h-4 w-4 mr-1" />
                    Responder
                  </Button>
                  {onComposeForward && (
                    <Button variant="outline" size="sm" onClick={handleForward}>
                      <Forward className="h-4 w-4 mr-1" />
                      Reenviar
                    </Button>
                  )}
                </>
              )}
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive"
                  onClick={() => handleDelete(comm)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {comm.subject && (
            <div className="border-t pt-3">
              <h4 className="font-medium">{comm.subject}</h4>
            </div>
          )}

          <ScrollArea className="flex-1 border-t pt-3">
            {renderContent()}
          </ScrollArea>

          {comm.hasAttachments && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Este mensaje tiene adjuntos
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Card className="p-3">
          <div className="text-xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-green-600">{stats.inbound}</div>
          <div className="text-xs text-muted-foreground">Entrada</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-blue-600">{stats.outbound}</div>
          <div className="text-xs text-muted-foreground">Salida</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-blue-500">{stats.emails}</div>
          <div className="text-xs text-muted-foreground">Emails</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-green-500">{stats.whatsapp}</div>
          <div className="text-xs text-muted-foreground">WhatsApp</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-amber-600">{stats.unread}</div>
          <div className="text-xs text-muted-foreground">No leídos</div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por contacto, asunto, contenido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[500px]">
        {/* Left column - Lists */}
        <div className="space-y-4">
          {/* Inbox - Entrada */}
          <Collapsible open={isInboxExpanded} onOpenChange={setIsInboxExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Entrada</span>
                  <Badge variant="secondary">{inboundCommunications.length}</Badge>
                </div>
                {isInboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[250px] mt-2">
                <div className="space-y-2 pr-4">
                  {inboundCommunications.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay comunicaciones de entrada
                    </p>
                  ) : (
                    inboundCommunications.map(comm => (
                      <CommunicationListItem key={comm.id} comm={comm} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* Outbox - Salida */}
          <Collapsible open={isOutboxExpanded} onOpenChange={setIsOutboxExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Salida</span>
                  <Badge variant="secondary">{outboundCommunications.length}</Badge>
                </div>
                {isOutboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[250px] mt-2">
                <div className="space-y-2 pr-4">
                  {outboundCommunications.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay comunicaciones de salida
                    </p>
                  ) : (
                    outboundCommunications.map(comm => (
                      <CommunicationListItem key={comm.id} comm={comm} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Right column - Detail */}
        <div className="min-h-[500px]">
          {selectedCommunication ? (
            <CommunicationDetail comm={selectedCommunication} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground py-8">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecciona una comunicación para ver los detalles</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
