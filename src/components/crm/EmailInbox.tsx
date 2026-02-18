import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isYesterday, isThisWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Mail, Search, ArrowUpRight, ArrowDownLeft, 
  CheckCircle, XCircle, Clock, Eye, Inbox, Send,
  Reply, Forward, UserPlus, AlertCircle,
  ChevronDown, ChevronRight, User, Calendar, FolderOpen,
  Ticket, AlarmClock, MailOpen, Maximize2, Minimize2, X,
  RefreshCw, Trash2, Paperclip, Download, Undo2, Bell, Building2,
  FileText, Image, FileSpreadsheet, FileIcon, ExternalLink, FilePlus
} from 'lucide-react';
import { CreateDocumentFromEmailDialog } from './CreateDocumentFromEmailDialog';
import { useToast } from '@/hooks/use-toast';
import type { Tables, Json } from '@/integrations/supabase/types';

type EmailAttachment = Tables<'email_attachments'>;

type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  tickets?: { id: string; subject: string; ticket_number: number } | null;
  presupuestos?: { id: string; nombre: string; codigo_correlativo: number } | null;
  projects?: { id: string; name: string; project_number: number | null } | null;
  email_attachments?: EmailAttachment[];
};

interface EmailMetadata {
  unknown_sender?: boolean;
  headers?: Record<string, string>;
  has_attachments?: boolean;
}

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  failed: { label: 'Fallido', icon: XCircle, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  read: { label: 'Leído', icon: Eye, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  received: { label: 'Recibido', icon: Inbox, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
};

type GroupMode = 'date' | 'sender' | 'folder';

interface EmailInboxProps {
  onComposeReply?: (email: EmailMessage) => void;
  onComposeForward?: (email: EmailMessage) => void;
}

export function EmailInbox({ onComposeReply, onComposeForward }: EmailInboxProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [budgetFilter, setBudgetFilter] = useState<string>('all');
  const [contactFilter, setContactFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('date');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [folderTargetEmail, setFolderTargetEmail] = useState<EmailMessage | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showCreateReminder, setShowCreateReminder] = useState(false);
  const [showSnoozeDialog, setShowSnoozeDialog] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Hoy', 'Sin clasificar']));
  const [isInboxExpanded, setIsInboxExpanded] = useState(true);
  const [isOutboxExpanded, setIsOutboxExpanded] = useState(true);
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    contact_type: 'Persona',
  });
  const [ticketFormData, setTicketFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    dueDate: '',
  });
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozeTime, setSnoozeTime] = useState('09:00');
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [reminderFormData, setReminderFormData] = useState({
    title: '',
    description: '',
    reminder_type: 'reminder',
    reminder_date: '',
    reminder_time: '09:00',
  });
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [emailForDocument, setEmailForDocument] = useState<EmailMessage | null>(null);

  // Fetch budgets for folder assignment
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets-for-email'],
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

  // Fetch projects for assignment
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-email'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_number')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch contacts for filtering
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-for-email-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: emails = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['email-messages', directionFilter, statusFilter, showDeleted],
    queryFn: async () => {
      let query = supabase
        .from('email_messages')
        .select(`
          *,
          crm_contacts (
            id,
            name,
            surname,
            email
          ),
          tickets (
            id,
            subject,
            ticket_number
          ),
          presupuestos (
            id,
            nombre,
            codigo_correlativo
          ),
          projects (
            id,
            name,
            project_number
          ),
          email_attachments (
            id,
            file_name,
            file_path,
            file_type,
            file_size
          )
        `)
        .order('created_at', { ascending: false });

      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      // Filter by deleted_at
      if (showDeleted) {
        query = query.not('deleted_at', 'is', null);
      } else {
        query = query.is('deleted_at', null);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      
      // Filter out duplicates based on external_id (keeping only the first occurrence)
      const seen = new Set<string>();
      const uniqueEmails = (data as EmailMessage[]).filter(email => {
        if (!email.external_id) return true;
        if (seen.has(email.external_id)) return false;
        seen.add(email.external_id);
        return true;
      });
      
      return uniqueEmails;
    },
  });

  // Mark email as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Don't update selectedEmail here - it's already optimistically updated in handleEmailClick
      // Updating it again here causes a re-render that can break button interactions
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
    },
  });

  // Snooze email mutation
  const snoozeEmailMutation = useMutation({
    mutationFn: async ({ emailId, snoozedUntil }: { emailId: string; snoozedUntil: string }) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ snoozed_until: snoozedUntil })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Email pospuesto correctamente' });
      setShowSnoozeDialog(false);
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
    },
  });

  // Assign budgets mutation (multiple)
  const assignBudgetsMutation = useMutation({
    mutationFn: async ({ emailId, budgetIds }: { emailId: string; budgetIds: string[] }) => {
      // Delete existing assignments for this email
      const { error: deleteError } = await supabase
        .from('email_budget_assignments')
        .delete()
        .eq('email_id', emailId);
      if (deleteError) throw deleteError;
      
      // Insert new assignments
      if (budgetIds.length > 0) {
        const insertData = budgetIds.map(budgetId => ({
          email_id: emailId,
          budget_id: budgetId,
        }));
        const { error: insertError } = await supabase
          .from('email_budget_assignments')
          .insert(insertData);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast({ title: 'Presupuestos asignados correctamente' });
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
      queryClient.invalidateQueries({ queryKey: ['email-budget-assignments'] });
    },
  });

  // Soft delete email mutation (move to trash)
  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      console.log('Deleting email:', emailId);
      const { error, data } = await supabase
        .from('email_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', emailId)
        .select();
      if (error) {
        console.error('Error deleting email:', error);
        throw error;
      }
      console.log('Email deleted successfully:', data);
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Email movido a papelera' });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
    },
    onError: (error: any) => {
      console.error('Delete mutation error:', error);
      toast({ 
        title: 'Error al borrar email', 
        description: error?.message || 'No se pudo borrar el email',
        variant: 'destructive' 
      });
    },
  });

  // Restore email mutation
  const restoreEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('email_messages')
        .update({ deleted_at: null })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Email restaurado correctamente' });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
    },
  });

  const getAttachmentDisplayName = (attachment: EmailAttachment): string => {
    const name = (attachment.file_name || '').trim();
    if (name) return name;
    const fromPath = attachment.file_path?.split('/').pop();
    return fromPath || 'adjunto';
  };

  // Get file icon based on file type
  const getFileIcon = (fileType: string | null, displayName: string) => {
    const type = fileType?.toLowerCase() || '';
    const name = displayName.toLowerCase();

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="h-5 w-5 text-primary" />;
    }
    if (type.includes('image') || name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
      return <Image className="h-5 w-5 text-primary" />;
    }
    if (type.includes('spreadsheet') || type.includes('excel') || name.match(/\.(xlsx?|csv)$/)) {
      return <FileSpreadsheet className="h-5 w-5 text-primary" />;
    }
    if (type.includes('word') || name.match(/\.(docx?|rtf)$/)) {
      return <FileText className="h-5 w-5 text-primary" />;
    }
    return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  };

  // Check if file is previewable
  const isPreviewable = (_fileType: string | null, _displayName: string): boolean => {
    // Always allow opening a preview dialog; if the browser can't render it,
    // we still provide a download button from the same dialog.
    return true;
  };

  // Get signed URL for preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewingAttachment, setPreviewingAttachment] = useState<EmailAttachment | null>(null);

  const previewAttachment = async (attachment: EmailAttachment) => {
    try {
      console.log('Previewing attachment:', attachment.file_path);
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .createSignedUrl(attachment.file_path, 3600); // 1 hour

      if (error) {
        console.error('Storage signed URL error:', error);
        throw error;
      }

      console.log('Got signed URL:', data.signedUrl ? 'success' : 'empty');
      setPreviewUrl(data.signedUrl);
      setPreviewingAttachment(attachment);
    } catch (error: any) {
      console.error('Error previewing attachment:', error);
      toast({
        title: 'Error al previsualizar',
        description: error?.message || 'No se pudo obtener el archivo',
        variant: 'destructive',
      });
    }
  };

  // Download attachment function
  const downloadAttachment = async (attachment: EmailAttachment) => {
    try {
      console.log('Downloading attachment:', attachment.file_path);
      const { data, error } = await supabase.storage
        .from('email-attachments')
        .download(attachment.file_path);

      if (error) {
        console.error('Storage download error:', error);
        throw error;
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = getAttachmentDisplayName(attachment);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'Descarga iniciada', description: getAttachmentDisplayName(attachment) });
    } catch (error: any) {
      console.error('Error downloading attachment:', error);
      toast({
        title: 'Error al descargar adjunto',
        description: error?.message || 'No se pudo descargar el archivo',
        variant: 'destructive',
      });
    }
  };

  // Render attachment item with preview and download
  const renderAttachmentItem = (attachment: EmailAttachment) => {
    const displayName = getAttachmentDisplayName(attachment);
    const canPreview = isPreviewable(attachment.file_type, displayName);
    const fileIcon = getFileIcon(attachment.file_type, displayName);
    const fileSize = attachment.file_size
      ? attachment.file_size > 1024 * 1024
        ? `${(attachment.file_size / (1024 * 1024)).toFixed(1)} MB`
        : `${(attachment.file_size / 1024).toFixed(1)} KB`
      : '?';

    return (
      <div
        key={attachment.id}
        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border hover:border-primary/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0">{fileIcon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">{fileSize}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canPreview && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8"
              onClick={() => previewAttachment(attachment)}
              title="Previsualizar"
            >
              <ExternalLink className="h-4 w-4" />
              Previsualizar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-8"
            onClick={() => downloadAttachment(attachment)}
            title="Descargar"
          >
            <Download className="h-4 w-4" />
            Descargar
          </Button>
        </div>
      </div>
    );
  };

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (data: { subject: string; description: string; priority: string; dueDate?: string; emailId: string; contactId?: string }) => {
      const { data: newTicket, error } = await supabase
        .from('tickets')
        .insert({
          subject: data.subject,
          description: data.description,
          priority: data.priority,
          status: 'open',
          category: 'Email',
          contact_id: data.contactId || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Link email to ticket
      await supabase
        .from('email_messages')
        .update({ ticket_id: newTicket.id })
        .eq('id', data.emailId);
      
      return newTicket;
    },
    onSuccess: (newTicket) => {
      toast({ title: `Ticket #${newTicket.ticket_number} creado correctamente` });
      setShowCreateTicket(false);
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  // Create reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      description?: string; 
      reminder_at: string; 
      reminder_type: string;
      emailId: string; 
      contactId?: string;
      projectId?: string;
      budgetId?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      const { data: newReminder, error } = await supabase
        .from('reminders')
        .insert({
          title: data.title,
          description: data.description || null,
          reminder_at: data.reminder_at,
          reminder_type: data.reminder_type,
          email_id: data.emailId,
          contact_id: data.contactId || null,
          project_id: data.projectId || null,
          budget_id: data.budgetId || null,
          created_by: session?.session?.user?.id || null,
          assigned_to: session?.session?.user?.id || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return newReminder;
    },
    onSuccess: () => {
      toast({ title: 'Recordatorio creado correctamente' });
      setShowCreateReminder(false);
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error al crear recordatorio', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Assign projects mutation (multiple)
  const assignProjectsMutation = useMutation({
    mutationFn: async ({ emailId, projectIds }: { emailId: string; projectIds: string[] }) => {
      // Delete existing assignments for this email
      const { error: deleteError } = await supabase
        .from('email_project_assignments')
        .delete()
        .eq('email_id', emailId);
      if (deleteError) throw deleteError;
      
      // Insert new assignments
      if (projectIds.length > 0) {
        const insertData = projectIds.map(projectId => ({
          email_id: emailId,
          project_id: projectId,
        }));
        const { error: insertError } = await supabase
          .from('email_project_assignments')
          .insert(insertData);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast({ title: 'Proyectos asignados correctamente' });
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
      queryClient.invalidateQueries({ queryKey: ['email-project-assignments'] });
    },
  });

  const filteredEmails = useMemo(() => {
    let result = emails;
    
    // Filter out snoozed emails that haven't reached their snooze time
    const now = new Date();
    result = result.filter(email => {
      if (!email.snoozed_until) return true;
      return new Date(email.snoozed_until) <= now;
    });
    
    // Filter by budget
    if (budgetFilter !== 'all') {
      if (budgetFilter === 'none') {
        result = result.filter(email => !email.budget_id);
      } else {
        result = result.filter(email => email.budget_id === budgetFilter);
      }
    }
    
    // Filter by contact
    if (contactFilter !== 'all') {
      if (contactFilter === 'none') {
        result = result.filter(email => !email.contact_id);
      } else {
        result = result.filter(email => email.contact_id === contactFilter);
      }
    }
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(email => {
        const contactName = email.crm_contacts 
          ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.toLowerCase()
          : '';
        return (
          contactName.includes(searchLower) ||
          email.from_email?.toLowerCase().includes(searchLower) ||
          email.to_emails?.some(e => e.toLowerCase().includes(searchLower)) ||
          email.subject?.toLowerCase().includes(searchLower) ||
          email.body_text?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    return result;
  }, [emails, search, budgetFilter, contactFilter]);
  // Separate inbound and outbound emails for the two mailboxes
  const inboundEmails = useMemo(() => filteredEmails.filter(e => e.direction === 'inbound'), [filteredEmails]);
  const outboundEmails = useMemo(() => filteredEmails.filter(e => e.direction === 'outbound'), [filteredEmails]);

  // Group emails by mode - for inbound
  const groupedInboundEmails = useMemo(() => {
    const groups: Record<string, { emails: EmailMessage[]; label: string; icon: any }> = {};
    
    inboundEmails.forEach(email => {
      let groupKey: string;
      let groupLabel: string;
      let groupIcon: any;
      
      if (groupMode === 'date') {
        const emailDate = new Date(email.created_at);
        if (isToday(emailDate)) {
          groupKey = 'today';
          groupLabel = 'Hoy';
        } else if (isYesterday(emailDate)) {
          groupKey = 'yesterday';
          groupLabel = 'Ayer';
        } else if (isThisWeek(emailDate)) {
          groupKey = 'thisweek';
          groupLabel = 'Esta semana';
        } else {
          const monthKey = format(emailDate, 'yyyy-MM');
          groupKey = monthKey;
          groupLabel = format(emailDate, 'MMMM yyyy', { locale: es });
        }
        groupIcon = Calendar;
      } else if (groupMode === 'sender') {
        const senderEmail = email.from_email;
        const senderName = email.crm_contacts 
          ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.trim() 
          : email.from_name || email.from_email;
        groupKey = senderEmail;
        groupLabel = senderName;
        groupIcon = User;
      } else {
        // folder mode
        if (email.budget_id && email.presupuestos) {
          groupKey = email.budget_id;
          groupLabel = `${email.presupuestos.codigo_correlativo} - ${email.presupuestos.nombre}`;
        } else {
          groupKey = 'unclassified';
          groupLabel = 'Sin clasificar';
        }
        groupIcon = FolderOpen;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = { emails: [], label: groupLabel, icon: groupIcon };
      }
      groups[groupKey].emails.push(email);
    });
    
    // Sort groups
    const sortedEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (groupMode === 'date') {
        const order = ['today', 'yesterday', 'thisweek'];
        const indexA = order.indexOf(keyA);
        const indexB = order.indexOf(keyB);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return keyB.localeCompare(keyA);
      }
      return keyA.localeCompare(keyB);
    });
    
    return sortedEntries;
  }, [inboundEmails, groupMode]);

  // Group emails by mode - for outbound
  const groupedOutboundEmails = useMemo(() => {
    const groups: Record<string, { emails: EmailMessage[]; label: string; icon: any }> = {};
    
    outboundEmails.forEach(email => {
      let groupKey: string;
      let groupLabel: string;
      let groupIcon: any;
      
      if (groupMode === 'date') {
        const emailDate = new Date(email.created_at);
        if (isToday(emailDate)) {
          groupKey = 'today';
          groupLabel = 'Hoy';
        } else if (isYesterday(emailDate)) {
          groupKey = 'yesterday';
          groupLabel = 'Ayer';
        } else if (isThisWeek(emailDate)) {
          groupKey = 'thisweek';
          groupLabel = 'Esta semana';
        } else {
          const monthKey = format(emailDate, 'yyyy-MM');
          groupKey = monthKey;
          groupLabel = format(emailDate, 'MMMM yyyy', { locale: es });
        }
        groupIcon = Calendar;
      } else if (groupMode === 'sender') {
        const recipientEmail = email.to_emails?.[0] || 'desconocido';
        groupKey = recipientEmail;
        groupLabel = recipientEmail;
        groupIcon = User;
      } else {
        // folder mode
        if (email.budget_id && email.presupuestos) {
          groupKey = email.budget_id;
          groupLabel = `${email.presupuestos.codigo_correlativo} - ${email.presupuestos.nombre}`;
        } else {
          groupKey = 'unclassified';
          groupLabel = 'Sin clasificar';
        }
        groupIcon = FolderOpen;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = { emails: [], label: groupLabel, icon: groupIcon };
      }
      groups[groupKey].emails.push(email);
    });
    
    // Sort groups
    const sortedEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
      if (groupMode === 'date') {
        const order = ['today', 'yesterday', 'thisweek'];
        const indexA = order.indexOf(keyA);
        const indexB = order.indexOf(keyB);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return keyB.localeCompare(keyA);
      }
      return keyA.localeCompare(keyB);
    });
    
    return sortedEntries;
  }, [outboundEmails, groupMode]);

  const stats = useMemo(() => {
    const total = emails.length;
    const inbox = emails.filter(e => e.direction === 'inbound').length;
    const sent = emails.filter(e => e.direction === 'outbound').length;
    const unread = emails.filter(e => !e.is_read && e.direction === 'inbound').length;
    const snoozed = emails.filter(e => e.snoozed_until && new Date(e.snoozed_until) > new Date()).length;
    
    return { total, inbox, sent, unread, snoozed };
  }, [emails]);

  const handleEmailClick = async (email: EmailMessage) => {
    // Optimistically mark as read in the local state immediately so the dialog
    // doesn't re-render mid-interaction when the mutation completes
    const emailToShow = (!email.is_read && email.direction === 'inbound')
      ? { ...email, is_read: true, read_at: new Date().toISOString() }
      : email;
    setSelectedEmail(emailToShow);
    
    // Persist to DB
    if (!email.is_read && email.direction === 'inbound') {
      markAsReadMutation.mutate(email.id);
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const isUnknownSender = (email: EmailMessage): boolean => {
    if (email.crm_contacts) return false;
    if (email.direction !== 'inbound') return false;
    const metadata = email.metadata as EmailMetadata | null;
    return metadata?.unknown_sender === true || !email.contact_id;
  };

  const openCreateContactDialog = (email: EmailMessage) => {
    const nameParts = (email.from_name || '').split(' ');
    setContactFormData({
      name: nameParts[0] || '',
      surname: nameParts.slice(1).join(' ') || '',
      email: email.from_email,
      phone: '',
      contact_type: 'Persona',
    });
    setShowCreateContact(true);
  };

  const openCreateTicketDialog = (email: EmailMessage) => {
    setTicketFormData({
      subject: email.subject || 'Nuevo ticket desde email',
      description: email.body_text?.substring(0, 500) || '',
      priority: 'medium',
      dueDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    });
    setShowCreateTicket(true);
  };

  const openSnoozeDialog = () => {
    setSnoozeDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    setSnoozeTime('09:00');
    setShowSnoozeDialog(true);
  };

  const openFolderDialog = async (email: EmailMessage) => {
    // Avoid nested dialogs (email detail dialog + folder dialog) which can blank the UI.
    setFolderTargetEmail(email);
    
    // Fetch existing assignments
    const [budgetAssignments, projectAssignments] = await Promise.all([
      supabase.from('email_budget_assignments').select('budget_id').eq('email_id', email.id),
      supabase.from('email_project_assignments').select('project_id').eq('email_id', email.id),
    ]);
    
    setSelectedBudgetIds(budgetAssignments.data?.map(a => a.budget_id) || []);
    setSelectedProjectIds(projectAssignments.data?.map(a => a.project_id) || []);
    setShowFolderDialog(true);
  };

  const openCreateReminderDialog = (email: EmailMessage) => {
    setReminderFormData({
      title: `Seguimiento: ${email.subject || 'Email'}`,
      description: email.body_text?.substring(0, 200) || '',
      reminder_type: 'reminder',
      reminder_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      reminder_time: '09:00',
    });
    setShowCreateReminder(true);
  };

  const handleSnooze = () => {
    if (!selectedEmail || !snoozeDate) return;
    const snoozedUntil = new Date(`${snoozeDate}T${snoozeTime}:00`).toISOString();
    snoozeEmailMutation.mutate({ emailId: selectedEmail.id, snoozedUntil });
  };

  const handleAssignFolder = async () => {
    if (!folderTargetEmail) return;

    // Assign budgets and projects in parallel
    await Promise.all([
      assignBudgetsMutation.mutateAsync({
        emailId: folderTargetEmail.id,
        budgetIds: selectedBudgetIds,
      }),
      assignProjectsMutation.mutateAsync({
        emailId: folderTargetEmail.id,
        projectIds: selectedProjectIds,
      }),
    ]);

    setShowFolderDialog(false);
    setFolderTargetEmail(null);
  };

  const handleCreateReminder = () => {
    if (!selectedEmail || !reminderFormData.title || !reminderFormData.reminder_date) return;
    const reminderAt = new Date(`${reminderFormData.reminder_date}T${reminderFormData.reminder_time}:00`).toISOString();
    createReminderMutation.mutate({
      title: reminderFormData.title,
      description: reminderFormData.description,
      reminder_at: reminderAt,
      reminder_type: reminderFormData.reminder_type,
      emailId: selectedEmail.id,
      contactId: selectedEmail.contact_id || undefined,
      projectId: selectedEmail.project_id || undefined,
      budgetId: selectedEmail.budget_id || undefined,
    });
  };

  const handleCreateTicket = () => {
    if (!selectedEmail || !ticketFormData.subject) return;
    createTicketMutation.mutate({
      subject: ticketFormData.subject,
      description: ticketFormData.description,
      priority: ticketFormData.priority,
      dueDate: ticketFormData.dueDate,
      emailId: selectedEmail.id,
      contactId: selectedEmail.contact_id || undefined,
    });
  };

  const handleCreateContact = async () => {
    if (!contactFormData.name || !contactFormData.email) {
      toast({ 
        title: 'Error', 
        description: 'Nombre y email son obligatorios',
        variant: 'destructive' 
      });
      return;
    }

    setCreatingContact(true);
    try {
      const { data: newContact, error: contactError } = await supabase
        .from('crm_contacts')
        .insert({
          name: contactFormData.name,
          surname: contactFormData.surname || null,
          email: contactFormData.email,
          phone: contactFormData.phone || null,
          contact_type: contactFormData.contact_type,
          status: 'Prospecto',
        })
        .select()
        .single();

      if (contactError) throw contactError;

      if (selectedEmail) {
        await supabase
          .from('email_messages')
          .update({ contact_id: newContact.id })
          .eq('id', selectedEmail.id);

        if (selectedEmail.ticket_id) {
          await supabase
            .from('tickets')
            .update({ contact_id: newContact.id })
            .eq('id', selectedEmail.ticket_id);
        }
      }

      toast({ title: 'Contacto creado correctamente' });
      setShowCreateContact(false);
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      refetch();
    } catch (error: any) {
      console.error('Error creating contact:', error);
      toast({ 
        title: 'Error al crear contacto', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setCreatingContact(false);
    }
  };

  const renderEmailItem = (email: EmailMessage) => {
    const status = statusConfig[email.status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = status.icon;
    const isInbound = email.direction === 'inbound';
    const isRead = email.is_read;
    const hasAttachments = email.email_attachments && email.email_attachments.length > 0;
    
    return (
      <div
        key={email.id}
        className={`py-3 px-3 cursor-pointer transition-all rounded-lg -mx-2 border-l-4 ${
          isRead 
            ? 'hover:bg-accent/50 bg-transparent border-l-transparent opacity-75' 
            : 'hover:bg-primary/10 bg-primary/5 border-l-primary shadow-sm'
        }`}
        onClick={() => handleEmailClick(email)}
      >
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 p-2 rounded-lg ${
            isInbound 
              ? isRead ? 'bg-muted' : 'bg-green-500/20 ring-2 ring-green-500/30' 
              : isRead ? 'bg-blue-500/10' : 'bg-blue-500/20 ring-2 ring-blue-500/30'
          }`}>
            {isInbound ? (
              isRead ? (
                <MailOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-green-600" />
              )
            ) : (
              <ArrowUpRight className={`h-4 w-4 ${isRead ? 'text-blue-500' : 'text-blue-600'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {!isRead && (
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              )}
              <span className={`text-sm truncate ${isRead ? 'text-muted-foreground' : 'font-bold text-foreground'}`}>
                {isInbound 
                  ? (email.from_name || email.from_email)
                  : email.to_emails?.[0]}
              </span>
              <Badge variant="outline" className={`${status.color} gap-1 text-xs`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
              {hasAttachments && (
                <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
              {email.tickets && (
                <Badge variant="secondary" className="text-xs">
                  Ticket #{email.tickets.ticket_number}
                </Badge>
              )}
              {email.snoozed_until && new Date(email.snoozed_until) > new Date() && (
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <AlarmClock className="h-3 w-3 mr-1" />
                  Pospuesto
                </Badge>
              )}
            </div>
            <p className={`text-sm mt-0.5 truncate ${isRead ? 'text-muted-foreground font-normal' : 'font-semibold text-foreground'}`}>
              {email.subject || '(Sin asunto)'}
            </p>
            <p className={`text-xs mt-0.5 line-clamp-1 ${isRead ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
              {email.body_text?.substring(0, 100) || 'Sin contenido'}
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>
                {format(new Date(email.created_at), "d MMM, HH:mm", { locale: es })}
              </span>
              {!isInbound && (
                (() => {
                  const ds = (email as any).delivery_status || 'pending';
                  const icons: Record<string, string> = {
                    pending: '⏳', sent: '📤', delivered: '✅', opened: '👁️',
                    clicked: '🔗', bounced: '❌', complained: '⚠️', delayed: '⏱️',
                  };
                  return <span title={`Entrega: ${ds}`}>{icons[ds] || '❓'}</span>;
                })()
              )}
              {email.presupuestos && (
                <span className="flex items-center gap-1 text-primary">
                  <FolderOpen className="h-3 w-3" />
                  {email.presupuestos.nombre}
                </span>
              )}
              {email.crm_contacts ? (
                <span className="text-primary">
                  {email.crm_contacts.name}
                </span>
              ) : isUnknownSender(email) ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Remitente desconocido
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total emails</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">{stats.inbox}</div>
          <div className="text-xs text-muted-foreground">Recibidos</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
          <div className="text-xs text-muted-foreground">Enviados</div>
        </Card>
        <Card className={`p-3 ${stats.unread > 0 ? 'ring-2 ring-primary/50' : ''}`}>
          <div className="text-2xl font-bold text-primary">{stats.unread}</div>
          <div className="text-xs text-muted-foreground">Sin leer</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-amber-600">{stats.snoozed}</div>
          <div className="text-xs text-muted-foreground">Pospuestos</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por remitente, destinatario o asunto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Dirección" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="inbound">Recibidos</SelectItem>
                <SelectItem value="outbound">Enviados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="delivered">Entregado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="read">Leído</SelectItem>
              </SelectContent>
            </Select>
            <Select value={budgetFilter} onValueChange={setBudgetFilter}>
              <SelectTrigger className="w-[160px]">
                <FolderOpen className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Presupuesto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los presupuestos</SelectItem>
                <SelectItem value="none">Sin presupuesto</SelectItem>
                {budgets.map(budget => (
                  <SelectItem key={budget.id} value={budget.id}>
                    {budget.codigo_correlativo} - {budget.nombre.substring(0, 20)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger className="w-[160px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Contacto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los contactos</SelectItem>
                <SelectItem value="none">Sin contacto</SelectItem>
                {contacts.map(contact => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name} {contact.surname || ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Agrupar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Por fecha</SelectItem>
                <SelectItem value="sender">Por emisor</SelectItem>
                <SelectItem value="folder">Por carpeta</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refrescar
            </Button>
            <Button 
              variant={showDeleted ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowDeleted(!showDeleted)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {showDeleted ? 'Bandeja' : 'Papelera'}
            </Button>
            {(budgetFilter !== 'all' || contactFilter !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setBudgetFilter('all');
                  setContactFilter('all');
                }}
                className="gap-1 text-muted-foreground"
              >
                <X className="h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Lists - Inbox and Outbox */}
      <div className="space-y-4">
        {/* Inbox - Bandeja de Entrada */}
        <Card>
          <Collapsible open={isInboxExpanded} onOpenChange={setIsInboxExpanded}>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="w-full">
                <CardTitle className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
                  {isInboxExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  {showDeleted ? <Trash2 className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
                  {showDeleted ? 'Papelera - Entrada' : 'Bandeja de Entrada'}
                  <Badge variant="secondary" className="ml-2">
                    {inboundEmails.length}
                  </Badge>
                  {!showDeleted && stats.unread > 0 && (
                    <Badge className="ml-1 bg-primary">
                      {stats.unread} sin leer
                    </Badge>
                  )}
                </CardTitle>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : inboundEmails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No hay emails recibidos</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedInboundEmails.map(([groupKey, group]) => {
                      const GroupIcon = group.icon;
                      const isExpanded = expandedGroups.has(`inbox-${group.label}`);
                      const unreadInGroup = group.emails.filter(e => !e.is_read).length;
                      
                      return (
                        <Collapsible 
                          key={groupKey} 
                          open={isExpanded} 
                          onOpenChange={() => toggleGroup(`inbox-${group.label}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-accent/50 rounded-lg transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <GroupIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{group.label}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {group.emails.length}
                            </Badge>
                            {unreadInGroup > 0 && (
                              <Badge className="bg-primary text-xs">
                                {unreadInGroup}
                              </Badge>
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="ml-6 border-l pl-4 mt-1">
                            <div className="divide-y">
                              {group.emails.map(email => renderEmailItem(email))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Outbox - Bandeja de Salida */}
        <Card>
          <Collapsible open={isOutboxExpanded} onOpenChange={setIsOutboxExpanded}>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="w-full">
                <CardTitle className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
                  {isOutboxExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  {showDeleted ? <Trash2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                  {showDeleted ? 'Papelera - Salida' : 'Bandeja de Salida'}
                  <Badge variant="secondary" className="ml-2">
                    {outboundEmails.length}
                  </Badge>
                </CardTitle>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : outboundEmails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No hay emails enviados</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedOutboundEmails.map(([groupKey, group]) => {
                      const GroupIcon = group.icon;
                      const isExpanded = expandedGroups.has(`outbox-${group.label}`);
                      
                      return (
                        <Collapsible 
                          key={groupKey} 
                          open={isExpanded} 
                          onOpenChange={() => toggleGroup(`outbox-${group.label}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-accent/50 rounded-lg transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <GroupIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{group.label}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {group.emails.length}
                            </Badge>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="ml-6 border-l pl-4 mt-1">
                            <div className="divide-y">
                              {group.emails.map(email => renderEmailItem(email))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Email Detail Dialog - Normal or Fullscreen */}
      {!isFullscreen ? (
        <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 pr-8">
                <Mail className="h-5 w-5 flex-shrink-0" />
                <span className="truncate">{selectedEmail?.subject || '(Sin asunto)'}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 flex-shrink-0"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            
            {selectedEmail && (
              <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
                <div className="px-6 pb-6">
                {/* Email metadata */}
                <div className="border-b pb-4 mb-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">De: </span>
                      <span className="font-medium">{selectedEmail.from_name || selectedEmail.from_email}</span>
                      {selectedEmail.from_name && (
                        <span className="text-muted-foreground ml-1">&lt;{selectedEmail.from_email}&gt;</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(selectedEmail.created_at), "d MMMM yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Para: </span>
                    <span>{selectedEmail.to_emails?.join(', ')}</span>
                  </div>
                  {selectedEmail.cc_emails && selectedEmail.cc_emails.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">CC: </span>
                      <span>{selectedEmail.cc_emails.join(', ')}</span>
                    </div>
                  )}
                  {selectedEmail.tickets && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Ticket: </span>
                      <Badge variant="outline">#{selectedEmail.tickets.ticket_number} - {selectedEmail.tickets.subject}</Badge>
                    </div>
                  )}
                  {selectedEmail.presupuestos && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Presupuesto: </span>
                      <Badge variant="outline" className="bg-primary/10">
                        <FolderOpen className="h-3 w-3 mr-1" />
                        {selectedEmail.presupuestos.codigo_correlativo} - {selectedEmail.presupuestos.nombre}
                      </Badge>
                    </div>
                  )}
                  {selectedEmail.projects && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Proyecto: </span>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                        <Building2 className="h-3 w-3 mr-1" />
                        {selectedEmail.projects.project_number ? `#${selectedEmail.projects.project_number} - ` : ''}{selectedEmail.projects.name}
                      </Badge>
                    </div>
                  )}
                  {selectedEmail.crm_contacts ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Contacto CRM: </span>
                      <span className="text-primary font-medium">
                        {selectedEmail.crm_contacts.name} {selectedEmail.crm_contacts.surname}
                      </span>
                    </div>
                  ) : isUnknownSender(selectedEmail) ? (
                    <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        Remitente no registrado como contacto
                      </span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="ml-auto gap-1"
                        onClick={() => openCreateContactDialog(selectedEmail)}
                      >
                        <UserPlus className="h-4 w-4" />
                        Registrar como contacto
                      </Button>
                    </div>
                  ) : null}

                  {/* Delivery tracking status for outbound emails */}
                  {selectedEmail.direction === 'outbound' && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Send className="h-3.5 w-3.5" />
                        Estado de entrega
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Estado:</span>
                          {(() => {
                            const ds = (selectedEmail as any).delivery_status || 'pending';
                            const deliveryLabels: Record<string, { label: string; className: string }> = {
                              pending: { label: '⏳ Pendiente', className: 'text-yellow-600' },
                              sent: { label: '📤 Enviado', className: 'text-blue-600' },
                              delivered: { label: '✅ Entregado al servidor', className: 'text-green-600' },
                              opened: { label: '👁️ Abierto/Leído', className: 'text-purple-600' },
                              clicked: { label: '🔗 Enlace clickeado', className: 'text-indigo-600' },
                              bounced: { label: '❌ Rebotado', className: 'text-red-600' },
                              complained: { label: '⚠️ Marcado spam', className: 'text-red-600' },
                              delayed: { label: '⏱️ Retrasado', className: 'text-orange-600' },
                            };
                            const info = deliveryLabels[ds] || { label: ds, className: '' };
                            return <span className={`font-medium ${info.className}`}>{info.label}</span>;
                          })()}
                        </div>
                        {(selectedEmail as any).delivery_updated_at && (
                          <div>
                            <span className="text-muted-foreground">Actualizado: </span>
                            <span>{format(new Date((selectedEmail as any).delivery_updated_at), "d MMM yyyy HH:mm", { locale: es })}</span>
                          </div>
                        )}
                        {(selectedEmail as any).read_receipt_at && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Confirmación de lectura: </span>
                            <span className="text-purple-600 font-medium">
                              {format(new Date((selectedEmail as any).read_receipt_at), "d MMM yyyy HH:mm", { locale: es })}
                            </span>
                          </div>
                        )}
                        {(selectedEmail as any).request_read_receipt && !(selectedEmail as any).read_receipt_at && (
                          <div className="col-span-2 flex items-center gap-1.5 text-amber-600">
                            <Bell className="h-3 w-3" />
                            <span>Confirmación de lectura solicitada - pendiente</span>
                          </div>
                        )}
                        {(selectedEmail as any).receipt_reminder_sent && (
                          <div className="col-span-2 flex items-center gap-1.5 text-orange-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>
                              SMS de aviso enviado
                              {(selectedEmail as any).receipt_reminder_sent_at && (
                                <> el {format(new Date((selectedEmail as any).receipt_reminder_sent_at), "d MMM HH:mm", { locale: es })}</>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Email body - Preview */}
                <div className="py-4">
                  {selectedEmail.body_html || selectedEmail.body_text ? (
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ 
                        __html: DOMPurify.sanitize(
                          selectedEmail.body_html || selectedEmail.body_text?.replace(/\n/g, '<br>') || ''
                        )
                      }}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Sin contenido de texto</p>
                      <p className="text-sm mt-1">El email puede contener solo adjuntos.</p>
                    </div>
                  )}
                  
                  {/* Attachments Section - Dialog */}
                  {selectedEmail.email_attachments && selectedEmail.email_attachments.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Paperclip className="h-4 w-4" />
                        <span className="font-medium text-sm">Adjuntos ({selectedEmail.email_attachments.length})</span>
                      </div>
                      <div className="grid gap-2">
                        {selectedEmail.email_attachments.map((attachment) =>
                          renderAttachmentItem(attachment)
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="border-t pt-4 mt-4 flex flex-wrap gap-2">
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => setIsFullscreen(true)}
                  >
                    <Maximize2 className="h-4 w-4 mr-2" />
                    Ampliar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (onComposeReply) {
                        onComposeReply(selectedEmail);
                        setSelectedEmail(null);
                      }
                    }}
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    Responder
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (onComposeForward) {
                        onComposeForward(selectedEmail);
                        setSelectedEmail(null);
                      }
                    }}
                    disabled={!onComposeForward}
                  >
                    <Forward className="h-4 w-4 mr-2" />
                    Reenviar
                  </Button>
                  {!selectedEmail.deleted_at && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const email = selectedEmail;
                        setSelectedEmail(null);
                        setIsFullscreen(false);
                        openFolderDialog(email);
                      }}
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Asociar/Tarea
                    </Button>
                  )}
                  {!selectedEmail.deleted_at && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const email = selectedEmail;
                        setSelectedEmail(null);
                        setEmailForDocument(email);
                        setTimeout(() => setShowCreateDocument(true), 100);
                      }}
                    >
                      <FilePlus className="h-4 w-4 mr-2" />
                      Documento
                    </Button>
                  )}
                  {!selectedEmail.ticket_id && !selectedEmail.deleted_at && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openCreateTicketDialog(selectedEmail)}
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Crear Ticket
                    </Button>
                  )}
                  {!selectedEmail.deleted_at && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openCreateReminderDialog(selectedEmail)}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Crear Recordatorio
                    </Button>
                  )}
                  {!selectedEmail.deleted_at && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={openSnoozeDialog}
                      >
                        <AlarmClock className="h-4 w-4 mr-2" />
                        Posponer
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Borrar
                      </Button>
                    </>
                  )}
                  {selectedEmail.deleted_at && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => restoreEmailMutation.mutate(selectedEmail.id)}
                    >
                      <Undo2 className="h-4 w-4 mr-2" />
                      Restaurar
                    </Button>
                  )}
                </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      ) : (
        /* Fullscreen Email View */
        <Sheet open={!!selectedEmail && isFullscreen} onOpenChange={(open) => {
          if (!open) {
            setIsFullscreen(false);
          }
        }}>
          <SheetContent side="right" className="w-full sm:max-w-full p-0 flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b flex-shrink-0">
              <SheetTitle className="flex items-center gap-3">
                <Mail className="h-6 w-6 flex-shrink-0" />
                <span className="flex-1 truncate text-left">{selectedEmail?.subject || '(Sin asunto)'}</span>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsFullscreen(false)}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setIsFullscreen(false);
                      setSelectedEmail(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </SheetTitle>
            </SheetHeader>
            
            {selectedEmail && (
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Email metadata */}
                <div className="p-6 border-b space-y-3 flex-shrink-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-muted-foreground">De: </span>
                      <span className="font-medium">{selectedEmail.from_name || selectedEmail.from_email}</span>
                      {selectedEmail.from_name && (
                        <span className="text-muted-foreground ml-1">&lt;{selectedEmail.from_email}&gt;</span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(selectedEmail.created_at), "EEEE, d MMMM yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Para: </span>
                    <span>{selectedEmail.to_emails?.join(', ')}</span>
                  </div>
                  {selectedEmail.cc_emails && selectedEmail.cc_emails.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">CC: </span>
                      <span>{selectedEmail.cc_emails.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedEmail.tickets && (
                      <Badge variant="outline">
                        <Ticket className="h-3 w-3 mr-1" />
                        Ticket #{selectedEmail.tickets.ticket_number}
                      </Badge>
                    )}
                    {selectedEmail.presupuestos && (
                      <Badge variant="outline" className="bg-primary/10">
                        <FolderOpen className="h-3 w-3 mr-1" />
                        {selectedEmail.presupuestos.codigo_correlativo} - {selectedEmail.presupuestos.nombre}
                      </Badge>
                    )}
                    {selectedEmail.crm_contacts && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600">
                        <User className="h-3 w-3 mr-1" />
                        {selectedEmail.crm_contacts.name} {selectedEmail.crm_contacts.surname}
                      </Badge>
                    )}
                    {(selectedEmail.metadata as EmailMetadata)?.has_attachments && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                        Tiene adjuntos
                      </Badge>
                    )}
                  </div>
                  {isUnknownSender(selectedEmail) && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        Remitente no registrado como contacto
                      </span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="ml-auto gap-1"
                        onClick={() => openCreateContactDialog(selectedEmail)}
                      >
                        <UserPlus className="h-4 w-4" />
                        Registrar
                      </Button>
                    </div>
                  )}

                  {/* Delivery tracking status for outbound emails - Fullscreen */}
                  {selectedEmail.direction === 'outbound' && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Send className="h-3.5 w-3.5" />
                        Estado de entrega
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Estado:</span>
                          {(() => {
                            const ds = (selectedEmail as any).delivery_status || 'pending';
                            const deliveryLabels: Record<string, { label: string; className: string }> = {
                              pending: { label: '⏳ Pendiente', className: 'text-yellow-600' },
                              sent: { label: '📤 Enviado', className: 'text-blue-600' },
                              delivered: { label: '✅ Entregado al servidor', className: 'text-green-600' },
                              opened: { label: '👁️ Abierto/Leído', className: 'text-purple-600' },
                              clicked: { label: '🔗 Enlace clickeado', className: 'text-indigo-600' },
                              bounced: { label: '❌ Rebotado', className: 'text-red-600' },
                              complained: { label: '⚠️ Marcado spam', className: 'text-red-600' },
                              delayed: { label: '⏱️ Retrasado', className: 'text-orange-600' },
                            };
                            const info = deliveryLabels[ds] || { label: ds, className: '' };
                            return <span className={`font-medium ${info.className}`}>{info.label}</span>;
                          })()}
                        </div>
                        {(selectedEmail as any).delivery_updated_at && (
                          <div>
                            <span className="text-muted-foreground">Actualizado: </span>
                            <span>{format(new Date((selectedEmail as any).delivery_updated_at), "d MMM yyyy HH:mm", { locale: es })}</span>
                          </div>
                        )}
                        {(selectedEmail as any).read_receipt_at && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Confirmación de lectura: </span>
                            <span className="text-purple-600 font-medium">
                              {format(new Date((selectedEmail as any).read_receipt_at), "d MMM yyyy HH:mm", { locale: es })}
                            </span>
                          </div>
                        )}
                        {(selectedEmail as any).request_read_receipt && !(selectedEmail as any).read_receipt_at && (
                          <div className="col-span-2 flex items-center gap-1.5 text-amber-600">
                            <Bell className="h-3 w-3" />
                            <span>Confirmación de lectura solicitada - pendiente</span>
                          </div>
                        )}
                        {(selectedEmail as any).receipt_reminder_sent && (
                          <div className="col-span-2 flex items-center gap-1.5 text-orange-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>
                              SMS de aviso enviado
                              {(selectedEmail as any).receipt_reminder_sent_at && (
                                <> el {format(new Date((selectedEmail as any).receipt_reminder_sent_at), "d MMM HH:mm", { locale: es })}</>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Email body - Fullscreen */}
                <ScrollArea className="flex-1 min-h-0 p-6">
                  {selectedEmail.body_html || selectedEmail.body_text ? (
                    <div 
                      className="prose prose-lg max-w-4xl mx-auto dark:prose-invert"
                      dangerouslySetInnerHTML={{ 
                        __html: DOMPurify.sanitize(
                          selectedEmail.body_html || selectedEmail.body_text?.replace(/\n/g, '<br>') || ''
                        )
                      }}
                    />
                  ) : (
                    <div className="text-center py-16 text-muted-foreground">
                      <Mail className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Sin contenido de texto</p>
                      <p className="mt-2">El email puede contener solo archivos adjuntos.</p>
                    </div>
                  )}
                  
                  {/* Attachments Section - Fullscreen */}
                  {selectedEmail.email_attachments && selectedEmail.email_attachments.length > 0 && (
                    <div className="mt-8 max-w-4xl mx-auto border-t pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Paperclip className="h-5 w-5" />
                        <span className="font-medium">Adjuntos ({selectedEmail.email_attachments.length})</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedEmail.email_attachments.map((attachment) =>
                          renderAttachmentItem(attachment)
                        )}
                      </div>
                    </div>
                  )}
                </ScrollArea>

                {/* Actions - Fullscreen */}
                <div className="p-6 border-t flex-shrink-0 flex flex-wrap gap-3 bg-muted/30">
                  <Button 
                    onClick={() => {
                      if (onComposeReply) {
                        onComposeReply(selectedEmail);
                        setSelectedEmail(null);
                        setIsFullscreen(false);
                      }
                    }}
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    Responder
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      if (onComposeForward) {
                        onComposeForward(selectedEmail);
                        setSelectedEmail(null);
                        setIsFullscreen(false);
                      }
                    }}
                    disabled={!onComposeForward}
                  >
                    <Forward className="h-4 w-4 mr-2" />
                    Reenviar
                  </Button>
                  {!selectedEmail.ticket_id && !selectedEmail.deleted_at && (
                    <Button 
                      variant="outline"
                      onClick={() => openCreateTicketDialog(selectedEmail)}
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Crear Ticket
                    </Button>
                  )}
                  {!selectedEmail.deleted_at && (
                    <>
                      <Button 
                        variant="outline"
                        onClick={() => openCreateReminderDialog(selectedEmail)}
                      >
                        <Bell className="h-4 w-4 mr-2" />
                        Recordatorio
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setEmailForDocument(selectedEmail);
                          setShowCreateDocument(true);
                        }}
                      >
                        <FilePlus className="h-4 w-4 mr-2" />
                        Crear Documento
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={openSnoozeDialog}
                      >
                        <AlarmClock className="h-4 w-4 mr-2" />
                        Posponer
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          const email = selectedEmail;
                          setSelectedEmail(null);
                          setIsFullscreen(false);
                          openFolderDialog(email);
                        }}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Asignar carpeta
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Borrar
                      </Button>
                    </>
                  )}
                  {selectedEmail.deleted_at && (
                    <Button 
                      variant="outline"
                      onClick={() => restoreEmailMutation.mutate(selectedEmail.id)}
                    >
                      <Undo2 className="h-4 w-4 mr-2" />
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}

      {/* Create Contact Dialog */}
      <Dialog open={showCreateContact} onOpenChange={setShowCreateContact}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Registrar como Contacto
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={contactFormData.name}
                  onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surname">Apellidos</Label>
                <Input
                  id="surname"
                  value={contactFormData.surname}
                  onChange={(e) => setContactFormData({ ...contactFormData, surname: e.target.value })}
                  placeholder="Apellidos"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                placeholder="email@ejemplo.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de contacto</Label>
              <Select 
                value={contactFormData.contact_type} 
                onValueChange={(v) => setContactFormData({ ...contactFormData, contact_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Persona">Persona</SelectItem>
                  <SelectItem value="Empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContact(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContact} disabled={creatingContact}>
              {creatingContact ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateTicket} onOpenChange={setShowCreateTicket}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Crear Ticket desde Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Asunto del ticket *</Label>
              <Input
                id="ticket-subject"
                value={ticketFormData.subject}
                onChange={(e) => setTicketFormData({ ...ticketFormData, subject: e.target.value })}
                placeholder="Asunto del ticket"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ticket-description">Descripción</Label>
              <Textarea
                id="ticket-description"
                value={ticketFormData.description}
                onChange={(e) => setTicketFormData({ ...ticketFormData, description: e.target.value })}
                placeholder="Descripción del ticket..."
                rows={4}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select 
                  value={ticketFormData.priority} 
                  onValueChange={(v) => setTicketFormData({ ...ticketFormData, priority: v })}
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
              
              <div className="space-y-2">
                <Label htmlFor="ticket-due-date">Fecha vencimiento</Label>
                <Input
                  id="ticket-due-date"
                  type="date"
                  value={ticketFormData.dueDate}
                  onChange={(e) => setTicketFormData({ ...ticketFormData, dueDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTicket(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateTicket} 
              disabled={createTicketMutation.isPending || !ticketFormData.subject}
            >
              {createTicketMutation.isPending ? 'Creando...' : 'Crear Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snooze Dialog */}
      <Dialog open={showSnoozeDialog} onOpenChange={setShowSnoozeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlarmClock className="h-5 w-5" />
              Posponer Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              El email volverá a aparecer en la bandeja de entrada en la fecha y hora seleccionadas.
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="snooze-date">Fecha</Label>
                <Input
                  id="snooze-date"
                  type="date"
                  value={snoozeDate}
                  onChange={(e) => setSnoozeDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="snooze-time">Hora</Label>
                <Input
                  id="snooze-time"
                  type="time"
                  value={snoozeTime}
                  onChange={(e) => setSnoozeTime(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  setSnoozeDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
                  setSnoozeTime('09:00');
                }}
              >
                Mañana
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  const nextWeek = addDays(new Date(), 7);
                  setSnoozeDate(format(nextWeek, 'yyyy-MM-dd'));
                  setSnoozeTime('09:00');
                }}
              >
                En 1 semana
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnoozeDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSnooze} 
              disabled={snoozeEmailMutation.isPending || !snoozeDate}
            >
              {snoozeEmailMutation.isPending ? 'Guardando...' : 'Posponer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Assignment Dialog */}
      <Dialog
        open={showFolderDialog}
        onOpenChange={(open) => {
          setShowFolderDialog(open);
          if (!open) setFolderTargetEmail(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Asignar a Proyecto/Presupuesto
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Vincula este email a uno o más proyectos y/o presupuestos para organizarlo.
            </p>
            
            <div className="space-y-2">
              <Label>Proyectos ({selectedProjectIds.length} seleccionados)</Label>
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-2">
                  {projects.map(project => (
                    <label key={project.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjectIds([...selectedProjectIds, project.id]);
                          } else {
                            setSelectedProjectIds(selectedProjectIds.filter(id => id !== project.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                      />
                      <span className="text-sm">
                        {project.project_number ? `#${project.project_number} - ` : ''}{project.name}
                      </span>
                    </label>
                  ))}
                  {projects.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No hay proyectos disponibles</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label>Presupuestos ({selectedBudgetIds.length} seleccionados)</Label>
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-2">
                  {budgets.map(budget => (
                    <label key={budget.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedBudgetIds.includes(budget.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBudgetIds([...selectedBudgetIds, budget.id]);
                          } else {
                            setSelectedBudgetIds(selectedBudgetIds.filter(id => id !== budget.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                      />
                      <span className="text-sm">
                        {budget.codigo_correlativo} - {budget.nombre}
                      </span>
                    </label>
                  ))}
                  {budgets.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No hay presupuestos disponibles</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAssignFolder} 
              disabled={assignBudgetsMutation.isPending || assignProjectsMutation.isPending}
            >
              {(assignBudgetsMutation.isPending || assignProjectsMutation.isPending) ? 'Guardando...' : 'Asignar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Reminder Dialog */}
      <Dialog open={showCreateReminder} onOpenChange={setShowCreateReminder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Crear Recordatorio desde Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reminder-title">Título *</Label>
              <Input
                id="reminder-title"
                value={reminderFormData.title}
                onChange={(e) => setReminderFormData({ ...reminderFormData, title: e.target.value })}
                placeholder="Título del recordatorio"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reminder-description">Descripción</Label>
              <Textarea
                id="reminder-description"
                value={reminderFormData.description}
                onChange={(e) => setReminderFormData({ ...reminderFormData, description: e.target.value })}
                placeholder="Descripción opcional..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select 
                value={reminderFormData.reminder_type} 
                onValueChange={(v) => setReminderFormData({ ...reminderFormData, reminder_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Recordatorio</SelectItem>
                  <SelectItem value="appointment">Cita</SelectItem>
                  <SelectItem value="deadline">Fecha límite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reminder-date">Fecha *</Label>
                <Input
                  id="reminder-date"
                  type="date"
                  value={reminderFormData.reminder_date}
                  onChange={(e) => setReminderFormData({ ...reminderFormData, reminder_date: e.target.value })}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reminder-time">Hora</Label>
                <Input
                  id="reminder-time"
                  type="time"
                  value={reminderFormData.reminder_time}
                  onChange={(e) => setReminderFormData({ ...reminderFormData, reminder_time: e.target.value })}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  setReminderFormData({
                    ...reminderFormData,
                    reminder_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
                    reminder_time: '09:00'
                  });
                }}
              >
                Mañana
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  setReminderFormData({
                    ...reminderFormData,
                    reminder_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
                    reminder_time: '09:00'
                  });
                }}
              >
                En 1 semana
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateReminder(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateReminder} 
              disabled={createReminderMutation.isPending || !reminderFormData.title || !reminderFormData.reminder_date}
            >
              {createReminderMutation.isPending ? 'Creando...' : 'Crear Recordatorio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <Dialog
        open={!!previewingAttachment}
        onOpenChange={() => {
          setPreviewingAttachment(null);
          setPreviewUrl(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewingAttachment &&
                getFileIcon(previewingAttachment.file_type, getAttachmentDisplayName(previewingAttachment))}
              <span className="truncate">
                {previewingAttachment ? getAttachmentDisplayName(previewingAttachment) : ''}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {previewUrl && previewingAttachment && (
              <>
                {(
                  previewingAttachment.file_type?.toLowerCase().includes('pdf') ||
                  getAttachmentDisplayName(previewingAttachment).toLowerCase().endsWith('.pdf')
                ) ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-[70vh] border rounded-lg"
                    title={getAttachmentDisplayName(previewingAttachment)}
                  />
                ) : previewingAttachment.file_type?.toLowerCase().includes('image') ||
                  getAttachmentDisplayName(previewingAttachment)
                    .toLowerCase()
                    .match(/\.(jpg|jpeg|png|gif|webp|svg)$/) ? (
                  <div className="flex items-center justify-center h-[70vh] bg-muted/30 rounded-lg">
                    <img
                      src={previewUrl}
                      alt={getAttachmentDisplayName(previewingAttachment)}
                      className="max-w-full max-h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[40vh] text-muted-foreground">
                    <p>Vista previa no disponible para este tipo de archivo</p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setPreviewingAttachment(null);
                setPreviewUrl(null);
              }}
            >
              Cerrar
            </Button>
            {previewingAttachment && (
              <Button onClick={() => downloadAttachment(previewingAttachment)} className="gap-2">
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            )}
          </DialogFooter>
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
