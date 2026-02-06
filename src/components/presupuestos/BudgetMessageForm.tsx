import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { searchMatch } from '@/lib/search-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';
import { 
  ChevronDown, ChevronRight, ClipboardList, Package, Users, 
  Plus, Search, X, MessageSquare, Send, Save
} from 'lucide-react';
import { ContactSelectWithCreate } from '@/components/crm/ContactSelectWithCreate';

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

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface BudgetMessage {
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
}

interface ActivityComment {
  activityId: string;
  comment: string;
}

interface ResourceComment {
  resourceId: string;
  comment: string;
}

interface BudgetMessageFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  activities: Activity[];
  phases: Phase[];
  resources: Resource[];
  message?: BudgetMessage | null;
  onSuccess: () => void;
}

export function BudgetMessageForm({
  open,
  onOpenChange,
  budgetId,
  activities,
  phases,
  resources,
  message,
  onSuccess,
}: BudgetMessageFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('pendiente');
  const [targetDate, setTargetDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sentVia, setSentVia] = useState<string>('');

  // Selected contacts
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [budgetContacts, setBudgetContacts] = useState<Contact[]>([]);

  // Selected activities & resources with comments
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [activityComments, setActivityComments] = useState<Map<string, string>>(new Map());
  const [resourceComments, setResourceComments] = useState<Map<string, string>>(new Map());

  // Search
  const [activitySearch, setActivitySearch] = useState('');
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  // Load budget contacts (from QUIÉN?)
  useEffect(() => {
    if (!open) return;
    const fetchContacts = async () => {
      const { data } = await supabase
        .from('budget_contacts')
        .select('contact_id, crm_contacts(id, name, surname, email, phone)')
        .eq('budget_id', budgetId);

      if (data) {
        const contacts = data
          .map((bc: any) => bc.crm_contacts)
          .filter(Boolean) as Contact[];
        setBudgetContacts(contacts);
      }
    };
    fetchContacts();
  }, [budgetId, open]);

  // Load existing message data
  useEffect(() => {
    if (!open) {
      // Reset form
      setTitle('');
      setStatus('pendiente');
      setTargetDate('');
      setStartTime('');
      setEndTime('');
      setSentVia('');
      setSelectedContacts([]);
      setSelectedActivityIds(new Set());
      setSelectedResourceIds(new Set());
      setActivityComments(new Map());
      setResourceComments(new Map());
      return;
    }

    if (message) {
      setTitle(message.title);
      setStatus(message.status);
      setTargetDate(message.target_date || '');
      setStartTime(message.start_time || '');
      setEndTime(message.end_time || '');
      setSentVia(message.sent_via || '');

      // Load related data
      const loadRelated = async () => {
        const [recipientsRes, activitiesRes, resourcesRes] = await Promise.all([
          supabase
            .from('budget_message_recipients')
            .select('contact_id, crm_contacts(id, name, surname, email, phone)')
            .eq('message_id', message.id),
          supabase
            .from('budget_message_activities')
            .select('activity_id, comment')
            .eq('message_id', message.id),
          supabase
            .from('budget_message_resources')
            .select('resource_id, comment')
            .eq('message_id', message.id),
        ]);

        if (recipientsRes.data) {
          setSelectedContacts(
            recipientsRes.data
              .map((r: any) => r.crm_contacts)
              .filter(Boolean) as Contact[]
          );
        }

        if (activitiesRes.data) {
          const ids = new Set(activitiesRes.data.map((a: any) => a.activity_id));
          setSelectedActivityIds(ids);
          const comments = new Map<string, string>();
          activitiesRes.data.forEach((a: any) => {
            if (a.comment) comments.set(a.activity_id, a.comment);
          });
          setActivityComments(comments);
          setExpandedActivities(ids);
        }

        if (resourcesRes.data) {
          const ids = new Set(resourcesRes.data.map((r: any) => r.resource_id));
          setSelectedResourceIds(ids);
          const comments = new Map<string, string>();
          resourcesRes.data.forEach((r: any) => {
            if (r.comment) comments.set(r.resource_id, r.comment);
          });
          setResourceComments(comments);
        }
      };
      loadRelated();
    }
  }, [message, open]);

  const formatActivityLabel = (activity: Activity) => {
    const phase = phases.find(p => p.id === activity.phase_id);
    return formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name,
    });
  };

  const filteredActivities = useMemo(() => {
    if (!activitySearch.trim()) return activities;
    return activities.filter(a =>
      searchMatch(formatActivityLabel(a), activitySearch) ||
      searchMatch(a.name, activitySearch)
    );
  }, [activities, activitySearch, phases]);

  const toggleActivity = (activityId: string) => {
    setSelectedActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
        // Also remove resources under this activity
        resources.filter(r => r.activity_id === activityId).forEach(r => {
          setSelectedResourceIds(prevRes => {
            const nextRes = new Set(prevRes);
            nextRes.delete(r.id);
            return nextRes;
          });
        });
      } else {
        next.add(activityId);
        setExpandedActivities(prev => new Set(prev).add(activityId));
      }
      return next;
    });
  };

  const toggleResource = (resourceId: string) => {
    setSelectedResourceIds(prev => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const addContact = (contact: Contact) => {
    if (!selectedContacts.find(c => c.id === contact.id)) {
      setSelectedContacts(prev => [...prev, contact]);
    }
  };

  const removeContact = (contactId: string) => {
    setSelectedContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const handleSubmit = async (sendNow = false) => {
    if (!title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    if (selectedContacts.length === 0) {
      toast.error('Selecciona al menos un receptor');
      return;
    }
    if (selectedActivityIds.size === 0) {
      toast.error('Selecciona al menos una actividad');
      return;
    }

    setIsLoading(true);
    try {
      const messageData = {
        budget_id: budgetId,
        title: title.trim(),
        status,
        target_date: targetDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        sent_via: sendNow && sentVia ? sentVia : null,
        sent_at: sendNow ? new Date().toISOString() : null,
      };

      let messageId: string;

      if (message) {
        const { error } = await supabase
          .from('budget_messages')
          .update(messageData)
          .eq('id', message.id);
        if (error) throw error;
        messageId = message.id;

        // Clear old relations
        await Promise.all([
          supabase.from('budget_message_recipients').delete().eq('message_id', messageId),
          supabase.from('budget_message_activities').delete().eq('message_id', messageId),
          supabase.from('budget_message_resources').delete().eq('message_id', messageId),
        ]);
      } else {
        const { data: newMsg, error } = await supabase
          .from('budget_messages')
          .insert(messageData)
          .select('id')
          .single();
        if (error) throw error;
        messageId = newMsg.id;
      }

      // Insert recipients
      if (selectedContacts.length > 0) {
        await supabase.from('budget_message_recipients').insert(
          selectedContacts.map(c => ({ message_id: messageId, contact_id: c.id }))
        );
      }

      // Insert activities with comments
      if (selectedActivityIds.size > 0) {
        await supabase.from('budget_message_activities').insert(
          Array.from(selectedActivityIds).map(actId => ({
            message_id: messageId,
            activity_id: actId,
            comment: activityComments.get(actId) || null,
          }))
        );
      }

      // Insert resources with comments
      if (selectedResourceIds.size > 0) {
        await supabase.from('budget_message_resources').insert(
          Array.from(selectedResourceIds).map(resId => ({
            message_id: messageId,
            resource_id: resId,
            comment: resourceComments.get(resId) || null,
          }))
        );
      }

      toast.success(message ? 'Mensaje actualizado' : 'Mensaje creado');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving message:', error);
      toast.error(error.message || 'Error al guardar');
    } finally {
      setIsLoading(false);
    }
  };

  // Available contacts: budget contacts + filtered
  const availableContacts = useMemo(() => {
    const alreadySelected = new Set(selectedContacts.map(c => c.id));
    return budgetContacts.filter(c => {
      if (alreadySelected.has(c.id)) return false;
      if (!contactSearch.trim()) return true;
      const fullName = c.surname ? `${c.name} ${c.surname}` : c.name;
      return searchMatch(fullName, contactSearch) || searchMatch(c.email || '', contactSearch);
    });
  }, [budgetContacts, selectedContacts, contactSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {message ? 'Editar Mensaje' : 'Nuevo Mensaje'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="msg-title">Título del mensaje *</Label>
            <Input
              id="msg-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título del mensaje..."
              maxLength={200}
            />
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Receptores *
            </Label>
            {selectedContacts.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedContacts.map(c => (
                  <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
                    {c.surname ? `${c.name} ${c.surname}` : c.name}
                    <button
                      onClick={() => removeContact(c.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar contacto del presupuesto..."
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            {contactSearch && availableContacts.length > 0 && (
              <div className="border rounded-md max-h-32 overflow-y-auto">
                {availableContacts.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-1.5 hover:bg-muted/50 text-sm flex items-center justify-between"
                    onClick={() => { addContact(c); setContactSearch(''); }}
                  >
                    <span>{c.surname ? `${c.name} ${c.surname}` : c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.email || c.phone || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Activities & Resources Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <ClipboardList className="h-4 w-4" />
              Actividades y Recursos *
            </Label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar actividad..."
                value={activitySearch}
                onChange={e => setActivitySearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-1">
                {filteredActivities.map(activity => {
                  const isSelected = selectedActivityIds.has(activity.id);
                  const isExpanded = expandedActivities.has(activity.id);
                  const actResources = resources.filter(r => r.activity_id === activity.id);

                  return (
                    <div key={activity.id} className="border rounded-md">
                      <div className="flex items-center gap-2 p-2 hover:bg-muted/30">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleActivity(activity.id)}
                        />
                        <button
                          className="flex items-center gap-1 flex-1 min-w-0 text-left"
                          onClick={() => {
                            setExpandedActivities(prev => {
                              const next = new Set(prev);
                              if (next.has(activity.id)) next.delete(activity.id);
                              else next.add(activity.id);
                              return next;
                            });
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-mono text-xs truncate">
                            {formatActivityLabel(activity)}
                          </span>
                          <Badge variant="outline" className="text-[9px] ml-auto flex-shrink-0">
                            {actResources.length}
                          </Badge>
                        </button>
                      </div>

                      {/* Activity comment */}
                      {isSelected && (
                        <div className="px-3 pb-2">
                          <Textarea
                            placeholder="Comentario sobre esta actividad..."
                            value={activityComments.get(activity.id) || ''}
                            onChange={e => {
                              setActivityComments(prev => new Map(prev).set(activity.id, e.target.value));
                            }}
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      )}

                      {/* Resources under activity */}
                      {isExpanded && isSelected && actResources.length > 0 && (
                        <div className="border-t bg-muted/10 px-2 pb-2 space-y-1">
                          {actResources.map(resource => {
                            const resSelected = selectedResourceIds.has(resource.id);
                            return (
                              <div key={resource.id}>
                                <div className="flex items-center gap-2 py-1 pl-6">
                                  <Checkbox
                                    checked={resSelected}
                                    onCheckedChange={() => toggleResource(resource.id)}
                                  />
                                  <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-xs truncate">{resource.name}</span>
                                  {resource.resource_type && (
                                    <Badge variant="outline" className="text-[8px] px-1">
                                      {resource.resource_type}
                                    </Badge>
                                  )}
                                </div>
                                {resSelected && (
                                  <div className="pl-12 pr-2 pb-1">
                                    <Textarea
                                      placeholder="Comentario sobre este recurso..."
                                      value={resourceComments.get(resource.id) || ''}
                                      onChange={e => {
                                        setResourceComments(prev => new Map(prev).set(resource.id, e.target.value));
                                      }}
                                      rows={1}
                                      className="text-xs"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Follow-up (same as Gestiones CRM) */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-medium">Seguimiento</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="msg-status">Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_progreso">En progreso</SelectItem>
                    <SelectItem value="completado">Completado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-target-date">Fecha objetivo</Label>
                <Input
                  id="msg-target-date"
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="msg-start-time">Hora inicio</Label>
                <Input
                  id="msg-start-time"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-end-time">Hora fin</Label>
                <Input
                  id="msg-end-time"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Send via channel */}
          <div className="space-y-2 border-t pt-4">
            <Label>Canal de envío (opcional)</Label>
            <Select value={sentVia} onValueChange={setSentVia}>
              <SelectTrigger>
                <SelectValue placeholder="Solo registro interno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interno">Solo registro interno</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              disabled={isLoading}
              variant="secondary"
              className="gap-1"
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Guardando...' : 'Guardar'}
            </Button>
            {sentVia && sentVia !== 'interno' && (
              <Button
                onClick={() => handleSubmit(true)}
                disabled={isLoading}
                className="gap-1"
              >
                <Send className="h-4 w-4" />
                Guardar y Enviar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
