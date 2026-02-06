import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { BudgetMessageForm } from './BudgetMessageForm';
import { formatActividadId } from '@/lib/activity-id';
import { searchMatch } from '@/lib/search-utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, X, MessageSquare, ChevronDown, ChevronRight,
  ClipboardList, Package, Users, Calendar, Clock, Pencil, Trash2,
  Mail, MessageCircle, Smartphone, FileText
} from 'lucide-react';

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
}

interface Phase {
  id: string;
  name: string;
  code: string | null;
}

interface Resource {
  id: string;
  name: string;
  activity_id: string | null;
  resource_type: string | null;
}

interface MessageRow {
  id: string;
  budget_id: string;
  title: string;
  status: string;
  target_date: string | null;
  start_time: string | null;
  end_time: string | null;
  sent_via: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  // Loaded relations
  recipients?: { id: string; name: string; surname: string | null }[];
  messageActivities?: { activity_id: string; comment: string | null }[];
  messageResources?: { resource_id: string; comment: string | null }[];
}

interface BudgetMessagesListProps {
  budgetId: string;
  activities: Activity[];
  phases: Phase[];
  resources: Resource[];
}

const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  en_progreso: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completado: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-3 w-3" />,
  whatsapp: <MessageCircle className="h-3 w-3" />,
  sms: <Smartphone className="h-3 w-3" />,
};

export function BudgetMessagesList({ budgetId, activities, phases, resources }: BudgetMessagesListProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<MessageRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<MessageRow | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('budget_messages')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const messagesData = (data || []) as MessageRow[];

      // Load relations for each message
      if (messagesData.length > 0) {
        const messageIds = messagesData.map(m => m.id);

        const [recipientsRes, activitiesRes, resourcesRes] = await Promise.all([
          supabase
            .from('budget_message_recipients')
            .select('message_id, contact_id, crm_contacts(id, name, surname)')
            .in('message_id', messageIds),
          supabase
            .from('budget_message_activities')
            .select('message_id, activity_id, comment')
            .in('message_id', messageIds),
          supabase
            .from('budget_message_resources')
            .select('message_id, resource_id, comment')
            .in('message_id', messageIds),
        ]);

        const recipientsByMsg = new Map<string, any[]>();
        (recipientsRes.data || []).forEach((r: any) => {
          const list = recipientsByMsg.get(r.message_id) || [];
          if (r.crm_contacts) list.push(r.crm_contacts);
          recipientsByMsg.set(r.message_id, list);
        });

        const activitiesByMsg = new Map<string, any[]>();
        (activitiesRes.data || []).forEach((a: any) => {
          const list = activitiesByMsg.get(a.message_id) || [];
          list.push({ activity_id: a.activity_id, comment: a.comment });
          activitiesByMsg.set(a.message_id, list);
        });

        const resourcesByMsg = new Map<string, any[]>();
        (resourcesRes.data || []).forEach((r: any) => {
          const list = resourcesByMsg.get(r.message_id) || [];
          list.push({ resource_id: r.resource_id, comment: r.comment });
          resourcesByMsg.set(r.message_id, list);
        });

        messagesData.forEach(msg => {
          msg.recipients = recipientsByMsg.get(msg.id) || [];
          msg.messageActivities = activitiesByMsg.get(msg.id) || [];
          msg.messageResources = resourcesByMsg.get(msg.id) || [];
        });
      }

      setMessages(messagesData);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Error al cargar mensajes');
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleDelete = async () => {
    if (!messageToDelete) return;
    try {
      const { error } = await supabase
        .from('budget_messages')
        .delete()
        .eq('id', messageToDelete.id);
      if (error) throw error;
      toast.success('Mensaje eliminado');
      fetchMessages();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    } finally {
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    }
  };

  const toggleMessage = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getActivityLabel = (activityId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return activityId;
    const phase = phases.find(p => p.id === activity.phase_id);
    return formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name,
    });
  };

  const getResourceName = (resourceId: string) => {
    return resources.find(r => r.id === resourceId)?.name || resourceId;
  };

  const filteredMessages = searchTerm.trim()
    ? messages.filter(m =>
        searchMatch(m.title, searchTerm) ||
        m.recipients?.some(r => searchMatch(r.name, searchTerm) || searchMatch(r.surname || '', searchTerm))
      )
    : messages;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar mensaje..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Badge variant="secondary">{filteredMessages.length} mensaje{filteredMessages.length !== 1 ? 's' : ''}</Badge>
        </div>
        <Button onClick={() => { setEditingMessage(null); setFormOpen(true); }} className="gap-1">
          <Plus className="h-4 w-4" />
          Nuevo Mensaje
        </Button>
      </div>

      {/* Messages list */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando mensajes...</div>
      ) : filteredMessages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{searchTerm ? 'No se encontraron mensajes' : 'No hay mensajes en este presupuesto'}</p>
          <p className="text-xs mt-1">Crea un mensaje para comunicar actividades y recursos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMessages.map(msg => {
            const isExpanded = expandedMessages.has(msg.id);
            const createdDate = format(parseISO(msg.created_at), "dd MMM yyyy, HH:mm", { locale: es });

            return (
              <Collapsible key={msg.id} open={isExpanded} onOpenChange={() => toggleMessage(msg.id)}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{msg.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{createdDate}</span>
                          {msg.recipients && msg.recipients.length > 0 && (
                            <>
                              <span>•</span>
                              <Users className="h-3 w-3" />
                              <span>
                                {msg.recipients.map(r => r.surname ? `${r.name} ${r.surname}` : r.name).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {msg.sent_via && CHANNEL_ICONS[msg.sent_via] && (
                          <Badge variant="outline" className="text-[9px] gap-1">
                            {CHANNEL_ICONS[msg.sent_via]}
                            {msg.sent_via}
                          </Badge>
                        )}
                        <Badge className={cn("text-[10px]", STATUS_COLORS[msg.status] || '')}>
                          {STATUS_LABELS[msg.status] || msg.status}
                        </Badge>
                        {msg.target_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(msg.target_date), 'dd/MM/yy')}
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-3 bg-muted/5">
                      {/* Activities & Resources with comments */}
                      {msg.messageActivities && msg.messageActivities.length > 0 && (
                        <div className="space-y-2">
                          {msg.messageActivities.map(ma => {
                            const relatedResources = msg.messageResources?.filter(mr => {
                              const resource = resources.find(r => r.id === mr.resource_id);
                              return resource?.activity_id === ma.activity_id;
                            }) || [];

                            return (
                              <div key={ma.activity_id} className="border rounded-md bg-background p-3">
                                {/* Activity header */}
                                <div className="flex items-center gap-2 mb-1">
                                  <ClipboardList className="h-4 w-4 text-primary flex-shrink-0" />
                                  <span className="font-mono text-sm font-medium">
                                    {getActivityLabel(ma.activity_id)}
                                  </span>
                                </div>
                                {ma.comment && (
                                  <p className="text-sm text-muted-foreground ml-6 mb-2 whitespace-pre-wrap">{ma.comment}</p>
                                )}

                                {/* Resources under this activity */}
                                {relatedResources.length > 0 && (
                                  <div className="ml-6 space-y-1.5 border-l-2 border-muted pl-3">
                                    {relatedResources.map(mr => (
                                      <div key={mr.resource_id}>
                                        <div className="flex items-center gap-2">
                                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-sm">{getResourceName(mr.resource_id)}</span>
                                        </div>
                                        {mr.comment && (
                                          <p className="text-xs text-muted-foreground ml-6 whitespace-pre-wrap">{mr.comment}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Follow-up info */}
                      {(msg.target_date || msg.start_time || msg.end_time) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
                          {msg.target_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Fecha: {format(parseISO(msg.target_date), 'dd/MM/yyyy')}
                            </div>
                          )}
                          {msg.start_time && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {msg.start_time}{msg.end_time ? ` - ${msg.end_time}` : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 border-t pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => { setEditingMessage(msg); setFormOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => { setMessageToDelete(msg); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <BudgetMessageForm
        open={formOpen}
        onOpenChange={setFormOpen}
        budgetId={budgetId}
        activities={activities}
        phases={phases}
        resources={resources}
        message={editingMessage}
        onSuccess={fetchMessages}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar mensaje"
        description={`¿Estás seguro de que deseas eliminar el mensaje "${messageToDelete?.title}"?`}
      />
    </div>
  );
}
