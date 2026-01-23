import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, MessageSquare, Smartphone, ChevronDown, ChevronRight, 
  Reply, Forward, Trash2, ArrowDownLeft, ArrowUpRight,
  Paperclip, Eye, Clock, CheckCircle, XCircle, Search, Inbox, Send,
  ArrowLeft, Maximize2, FolderOpen, ClipboardList, Building2,
  FileText, Image, File as FileIcon, Download, ExternalLink, X, RefreshCw, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import DOMPurify from 'dompurify';
import { CommunicationActionsDialog } from './CommunicationActionsDialog';

// Types for unified communications
type EmailAttachment = {
  id: string;
  file_name: string;
  file_path?: string;
  file_type?: string | null;
  file_size?: number | null;
};

type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  email_attachments?: EmailAttachment[];
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
  const [fullscreenFolder, setFullscreenFolder] = useState<'inbox' | 'outbox' | null>(null);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [actionsDialogOpen, setActionsDialogOpen] = useState(false);
  const [actionsCommunication, setActionsCommunication] = useState<UnifiedCommunication | null>(null);
  const [communicationAssignments, setCommunicationAssignments] = useState<{budgetIds: string[], projectIds: string[]}>({budgetIds: [], projectIds: []});
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fullscreenCommunication, setFullscreenCommunication] = useState<UnifiedCommunication | null>(null);

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
      toast({ title: 'Error', description: 'No se encuentra la ruta del archivo', variant: 'destructive' });
      return;
    }

    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .createSignedUrl(att.file_path, 3600);
      if (error) throw error;
      
      const fileType = att.file_type || '';
      const fileName = getEmailAttachmentDisplayName(att);
      
      setPreviewAttachment({
        url: data.signedUrl,
        name: fileName,
        type: fileType
      });
    } catch (error: any) {
      console.error('Error previewing attachment:', error);
      toast({
        title: 'Error al abrir adjunto',
        description: error?.message || 'No se pudo abrir el archivo',
        variant: 'destructive',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadEmailAttachment = async (att: EmailAttachment) => {
    if (!att.file_path) {
      toast({ title: 'Error', description: 'No se encuentra la ruta del archivo', variant: 'destructive' });
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

      toast({ title: 'Descarga iniciada', description: getEmailAttachmentDisplayName(att) });
    } catch (error: any) {
      console.error('Error downloading attachment:', error);
      toast({
        title: 'Error al descargar adjunto',
        description: error?.message || 'No se pudo descargar el archivo',
        variant: 'destructive',
      });
    }
  };

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
          email_attachments (id, file_name, file_path, file_type, file_size)
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

  // Mark all emails as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async (emailIds: string[]) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', emailIds);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Todos los emails marcados como leídos' });
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
      setFilterUnreadOnly(false);
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
      toast({ title: 'Email reenviado correctamente' });
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error al reenviar email', 
        description: error.message || 'No se pudo reenviar el email',
        variant: 'destructive' 
      });
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

  // Separate inbound and outbound (with optional unread filter)
  const inboundCommunications = useMemo(() => {
    let comms = filteredCommunications.filter(c => c.direction === 'inbound');
    if (filterUnreadOnly) {
      comms = comms.filter(c => c.type === 'email' && !c.isRead);
    }
    return comms;
  }, [filteredCommunications, filterUnreadOnly]);
  
  const outboundCommunications = useMemo(() => {
    return filteredCommunications.filter(c => c.direction === 'outbound');
  }, [filteredCommunications]);
  
  // Get unread email IDs for "mark all as read" functionality (only inbound emails count as unread)
  const unreadEmailIds = useMemo(() => {
    return filteredCommunications
      .filter(c => c.type === 'email' && !c.isRead && c.direction === 'inbound')
      .map(c => c.id);
  }, [filteredCommunications]);

  // Stats - only count unread emails from inbound (outbound emails don't have "unread" concept)
  const stats = {
    total: filteredCommunications.length,
    inbound: filterUnreadOnly ? inboundCommunications.length : filteredCommunications.filter(c => c.direction === 'inbound').length,
    outbound: outboundCommunications.length,
    emails: filteredCommunications.filter(c => c.type === 'email').length,
    whatsapp: filteredCommunications.filter(c => c.type === 'whatsapp').length,
    unread: unreadEmailIds.length,
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

  // Open actions dialog with current assignments
  const handleOpenActionsDialog = async (comm: UnifiedCommunication) => {
    setActionsCommunication(comm);
    
    // Fetch current assignments
    let budgetIds: string[] = [];
    let projectIds: string[] = [];
    
    if (comm.type === 'email') {
      const [budgetAssignments, projectAssignments] = await Promise.all([
        supabase.from('email_budget_assignments').select('budget_id').eq('email_id', comm.id),
        supabase.from('email_project_assignments').select('project_id').eq('email_id', comm.id),
      ]);
      budgetIds = budgetAssignments.data?.map(a => a.budget_id) || [];
      projectIds = projectAssignments.data?.map(a => a.project_id) || [];
    } else {
      const [budgetAssignments, projectAssignments] = await Promise.all([
        supabase.from('whatsapp_budget_assignments').select('budget_id').eq('message_id', comm.id),
        supabase.from('whatsapp_project_assignments').select('project_id').eq('message_id', comm.id),
      ]);
      budgetIds = budgetAssignments.data?.map(a => a.budget_id) || [];
      projectIds = projectAssignments.data?.map(a => a.project_id) || [];
    }
    
    setCommunicationAssignments({ budgetIds, projectIds });
    setActionsDialogOpen(true);
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
  const CommunicationDetail = ({
    comm,
    isFullscreen = false,
  }: {
    comm: UnifiedCommunication;
    isFullscreen?: boolean;
  }) => {
    const TypeIcon = typeIcons[comm.type];
    const status = statusConfig[comm.status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = status.icon;

    // State for assigned budgets and projects
    const [assignedBudgets, setAssignedBudgets] = useState<{id: string, nombre: string}[]>([]);
    const [assignedProjects, setAssignedProjects] = useState<{id: string, project_number: number, name: string}[]>([]);

    // Fetch assigned budgets and projects for this communication
    useEffect(() => {
      const fetchAssignments = async () => {
        let budgetIds: string[] = [];
        let projectIds: string[] = [];

        if (comm.type === 'email') {
          const [budgetAssignments, projectAssignments] = await Promise.all([
            supabase.from('email_budget_assignments').select('budget_id').eq('email_id', comm.id),
            supabase.from('email_project_assignments').select('project_id').eq('email_id', comm.id),
          ]);
          budgetIds = budgetAssignments.data?.map(a => a.budget_id) || [];
          projectIds = projectAssignments.data?.map(a => a.project_id) || [];
        } else {
          const [budgetAssignments, projectAssignments] = await Promise.all([
            supabase.from('whatsapp_budget_assignments').select('budget_id').eq('message_id', comm.id),
            supabase.from('whatsapp_project_assignments').select('project_id').eq('message_id', comm.id),
          ]);
          budgetIds = budgetAssignments.data?.map(a => a.budget_id) || [];
          projectIds = projectAssignments.data?.map(a => a.project_id) || [];
        }

        // Fetch budget details
        if (budgetIds.length > 0) {
          const { data: budgets } = await supabase
            .from('presupuestos')
            .select('id, nombre')
            .in('id', budgetIds);
          setAssignedBudgets(budgets || []);
        } else {
          setAssignedBudgets([]);
        }

        // Fetch project details
        if (projectIds.length > 0) {
          const { data: projects } = await supabase
            .from('projects')
            .select('id, project_number, name')
            .in('id', projectIds);
          setAssignedProjects(projects || []);
        } else {
          setAssignedProjects([]);
        }
      };

      fetchAssignments();
    }, [comm.id, comm.type]);

    const renderContent = () => {
      if (comm.type === 'email') {
        const email = comm.originalData as EmailMessage;
        if (email.body_html) {
          return (
            <div className="overflow-x-auto">
              <div
                className="prose prose-sm dark:prose-invert max-w-none break-words [word-break:break-word] [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_img]:max-w-full [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
              />
            </div>
          );
        }
      }

      return (
        <div className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {comm.content}
        </div>
      );
    };

    return (
      <Card className="h-full">
        <CardContent className="p-4 space-y-4">
          {/* Assigned Budgets and Projects Header */}
          {(assignedBudgets.length > 0 || assignedProjects.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 pb-3 border-b">
              {assignedBudgets.map(budget => (
                <a
                  key={budget.id}
                  href={`/presupuestos/${budget.id}?tab=agenda`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-sm font-medium transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/presupuestos/${budget.id}?tab=agenda`;
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {budget.nombre}
                </a>
              ))}
              {assignedProjects.map(project => (
                <a
                  key={project.id}
                  href={`/proyectos/${project.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded-full text-sm font-medium transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/proyectos/${project.id}`;
                  }}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  P{project.project_number} - {project.name}
                </a>
              ))}
            </div>
          )}
          
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
            <div className="flex items-center gap-2 flex-wrap">
              {/* Action buttons for assign and task */}
              {!isFullscreen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFullscreenCommunication(comm)}
                  className="gap-1"
                  title="Ver a pantalla completa"
                >
                  <Maximize2 className="h-4 w-4" />
                  Ampliar
                </Button>
              )}

              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleOpenActionsDialog(comm)}
                className="gap-1"
              >
                <FolderOpen className="h-4 w-4" />
                Asociar/Tarea
              </Button>
              
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
              {/* Resend button for outbound emails */}
              {comm.type === 'email' && comm.direction === 'outbound' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => resendEmailMutation.mutate(comm.id)}
                  disabled={resendEmailMutation.isPending}
                >
                  {resendEmailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Volver a enviar
                </Button>
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
              {comm.type === 'email' ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    Adjuntos
                  </p>
                  {(((comm.originalData as EmailMessage).email_attachments) || []).map((att) => {
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
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  Este mensaje tiene adjuntos
                </p>
              )}
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

  // Fullscreen folder view
  if (fullscreenFolder) {
    const isInbox = fullscreenFolder === 'inbox';
    const communications = isInbox ? inboundCommunications : outboundCommunications;
    const FolderIcon = isInbox ? Inbox : Send;
    const folderLabel = isInbox ? 'Entrada' : 'Salida';
    const folderColor = isInbox ? 'text-green-600' : 'text-blue-600';

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setFullscreenFolder(null);
              setSelectedCommunication(null);
              setFilterUnreadOnly(false);
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="flex items-center gap-2">
            <FolderIcon className={`h-5 w-5 ${folderColor}`} />
            <h2 className="font-semibold text-lg">{folderLabel}</h2>
            <Badge variant="secondary">{communications.length}</Badge>
            {filterUnreadOnly && (
              <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Solo no leídos
              </Badge>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Toggle unread filter */}
            <Button
              variant={filterUnreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
              className="gap-1"
            >
              <Eye className="h-4 w-4" />
              {filterUnreadOnly ? 'Mostrar todos' : 'Solo no leídos'}
            </Button>
            
            {/* Mark all as read */}
            {unreadEmailIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate(unreadEmailIds)}
                disabled={markAllAsReadMutation.isPending}
                className="gap-1"
              >
                <CheckCircle className="h-4 w-4" />
                {markAllAsReadMutation.isPending ? 'Marcando...' : `Marcar ${unreadEmailIds.length} como leídos`}
              </Button>
            )}
          </div>
          
          {/* Search in fullscreen */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* List */}
          <ScrollArea className="h-full border-r">
            <div className="p-4 space-y-2">
              {communications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay comunicaciones de {folderLabel.toLowerCase()}</p>
                </div>
              ) : (
                communications.map(comm => (
                  <CommunicationListItem key={comm.id} comm={comm} />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Detail */}
          <div className="h-full overflow-auto">
            {selectedCommunication ? (
              <CommunicationDetail comm={selectedCommunication} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground py-8">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecciona una comunicación para ver los detalles</p>
                </div>
              </div>
            )}
          </div>
        </div>
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
        <Card 
          className={`p-3 cursor-pointer transition-colors hover:bg-accent ${filterUnreadOnly ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/20' : ''}`}
          onClick={() => {
            if (stats.unread > 0) {
              setFilterUnreadOnly(true);
              // Unread emails are only in inbox (inbound)
              setFullscreenFolder('inbox');
            }
          }}
        >
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
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenFolder('inbox');
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  {isInboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
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
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenFolder('outbox');
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  {isOutboxExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
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

      {/* Actions Dialog */}
      {actionsCommunication && (
        <CommunicationActionsDialog
          open={actionsDialogOpen}
          onOpenChange={setActionsDialogOpen}
          communicationId={actionsCommunication.id}
          communicationType={actionsCommunication.type as 'email' | 'whatsapp'}
          communicationSubject={actionsCommunication.subject}
          communicationContent={actionsCommunication.content}
          contactId={(actionsCommunication.originalData as any)?.contact_id}
          contactName={actionsCommunication.contactName}
          currentBudgetIds={communicationAssignments.budgetIds}
          currentProjectIds={communicationAssignments.projectIds}
        />
      )}

      {/* Fullscreen communication dialog */}
      <Dialog open={!!fullscreenCommunication} onOpenChange={(open) => !open && setFullscreenCommunication(null)}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full flex flex-col p-0">
          <DialogHeader className="p-4 pb-0 flex-shrink-0">
            <DialogTitle className="break-words">
              {fullscreenCommunication?.subject || 'Comunicación'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {fullscreenCommunication && (
              <CommunicationDetail comm={fullscreenCommunication} isFullscreen />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de vista previa de adjuntos */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden [&>button]:hidden">
          <div className="flex items-center justify-between p-4 border-b bg-background">
            <DialogTitle className="text-base font-medium truncate flex-1 pr-4">
              {previewAttachment?.name}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewAttachment(null)}
              className="gap-2 shrink-0"
            >
              <X className="h-4 w-4" />
              Cerrar
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-muted/30 min-h-[400px] max-h-[calc(90vh-80px)]">
            {previewAttachment && (
              <>
                {previewAttachment.type.includes('image') ? (
                  <img 
                    src={previewAttachment.url} 
                    alt={previewAttachment.name}
                    className="max-w-full h-auto mx-auto rounded-lg shadow-sm"
                  />
                ) : previewAttachment.type.includes('pdf') ? (
                  <iframe
                    src={previewAttachment.url}
                    className="w-full h-full min-h-[500px] rounded-lg border"
                    title={previewAttachment.name}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                    <FileIcon className="h-16 w-16" />
                    <p>Vista previa no disponible para este tipo de archivo</p>
                    <Button
                      variant="outline"
                      onClick={() => window.open(previewAttachment.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir en nueva pestaña
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
