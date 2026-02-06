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
import { useEmailService } from '@/hooks/useEmailService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { searchMatch } from '@/lib/search-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';
import { parseISO, isValid, isBefore, isAfter } from 'date-fns';
import { 
  ChevronDown, ChevronRight, ClipboardList, Package, Users, 
  Plus, Search, X, MessageSquare, Send, Save, Mail, MessageCircle, Smartphone, Loader2
} from 'lucide-react';
import { ContactSelectWithCreate } from '@/components/crm/ContactSelectWithCreate';

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  uses_measurement?: boolean;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
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

interface BudgetMessageFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  activities: Activity[];
  phases: Phase[];
  resources: Resource[];
  message?: BudgetMessage | null;
  onSuccess: () => void;
  filterStartDate?: string;
  filterEndDate?: string;
}

// Build plain text body from message data
function buildMessageBody(
  title: string,
  activities: Activity[],
  phases: Phase[],
  resources: Resource[],
  selectedActivityIds: Set<string>,
  selectedResourceIds: Set<string>,
  activityComments: Map<string, string>,
  resourceComments: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`📋 ${title}`);
  lines.push('');

  for (const actId of selectedActivityIds) {
    const activity = activities.find(a => a.id === actId);
    if (!activity) continue;
    const phase = phases.find(p => p.id === activity.phase_id);
    const label = formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name,
    });
    lines.push(`▸ ${label}`);
    const actComment = activityComments.get(actId);
    if (actComment) lines.push(`  ${actComment}`);

    // Resources under this activity
    const relatedResources = Array.from(selectedResourceIds)
      .map(rId => resources.find(r => r.id === rId))
      .filter(r => r && r.activity_id === actId);

    for (const resource of relatedResources) {
      if (!resource) continue;
      lines.push(`    • ${resource.name}`);
      const resComment = resourceComments.get(resource.id);
      if (resComment) lines.push(`      ${resComment}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Build HTML body from message data
function buildMessageHtml(
  title: string,
  activities: Activity[],
  phases: Phase[],
  resources: Resource[],
  selectedActivityIds: Set<string>,
  selectedResourceIds: Set<string>,
  activityComments: Map<string, string>,
  resourceComments: Map<string, string>,
): string {
  let html = `<h2 style="margin-bottom:12px;">${title}</h2>`;

  for (const actId of selectedActivityIds) {
    const activity = activities.find(a => a.id === actId);
    if (!activity) continue;
    const phase = phases.find(p => p.id === activity.phase_id);
    const label = formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name,
    });
    html += `<div style="margin-bottom:12px;padding:8px 12px;border:1px solid #ddd;border-radius:6px;">`;
    html += `<strong style="font-family:monospace;">▸ ${label}</strong>`;
    const actComment = activityComments.get(actId);
    if (actComment) html += `<p style="color:#555;margin:4px 0 0 12px;">${actComment.replace(/\n/g, '<br>')}</p>`;

    const relatedResources = Array.from(selectedResourceIds)
      .map(rId => resources.find(r => r.id === rId))
      .filter(r => r && r.activity_id === actId);

    if (relatedResources.length > 0) {
      html += `<ul style="margin:8px 0 0 20px;padding-left:0;">`;
      for (const resource of relatedResources) {
        if (!resource) continue;
        html += `<li style="margin-bottom:4px;"><strong>${resource.name}</strong>`;
        const resComment = resourceComments.get(resource.id);
        if (resComment) html += `<br><span style="color:#666;font-size:0.9em;">${resComment.replace(/\n/g, '<br>')}</span>`;
        html += `</li>`;
      }
      html += `</ul>`;
    }
    html += `</div>`;
  }

  return html;
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
  filterStartDate,
  filterEndDate,
}: BudgetMessageFormProps) {
  const { user } = useAuth();
  const { sendEmail, sending: emailSending } = useEmailService();
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

  // Filter activities: only uses_measurement=true and within date range, then sort by ActividadID
  const dateFilteredActivities = useMemo(() => {
    // First filter by uses_measurement
    let result = activities.filter(a => a.uses_measurement !== false);

    // Apply date range filter (same logic as BuyingListUnified)
    if (filterStartDate || filterEndDate) {
      result = result.filter(activity => {
        const actStart = activity.actual_start_date;
        const actEnd = activity.actual_end_date;
        if (!actStart && !actEnd) return false;
        try {
          const fStart = filterStartDate ? parseISO(filterStartDate) : null;
          const fEnd = filterEndDate ? parseISO(filterEndDate) : null;
          const aStart = actStart ? parseISO(actStart) : null;
          const aEnd = actEnd ? parseISO(actEnd) : null;
          if (fStart && aEnd && isValid(fStart) && isValid(aEnd) && isBefore(aEnd, fStart)) return false;
          if (fEnd && aStart && isValid(fEnd) && isValid(aStart) && isAfter(aStart, fEnd)) return false;
          return true;
        } catch {
          return false;
        }
      });
    }

    // Sort alphabetically by ActividadID
    return result.sort((a, b) => {
      const labelA = formatActivityLabel(a);
      const labelB = formatActivityLabel(b);
      return labelA.localeCompare(labelB, 'es');
    });
  }, [activities, filterStartDate, filterEndDate, phases]);

  const filteredActivities = useMemo(() => {
    if (!activitySearch.trim()) return dateFilteredActivities;
    return dateFilteredActivities.filter(a =>
      searchMatch(formatActivityLabel(a), activitySearch) ||
      searchMatch(a.name, activitySearch)
    );
  }, [dateFilteredActivities, activitySearch]);

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

  // Send message via the selected channel
  const sendViaChannel = async (channel: string, messageId: string) => {
    const plainText = buildMessageBody(
      title, activities, phases, resources,
      selectedActivityIds, selectedResourceIds,
      activityComments, resourceComments
    );
    const htmlBody = buildMessageHtml(
      title, activities, phases, resources,
      selectedActivityIds, selectedResourceIds,
      activityComments, resourceComments
    );

    if (channel === 'email') {
      // Send email to all recipients that have email
      const emailRecipients = selectedContacts.filter(c => c.email);
      if (emailRecipients.length === 0) {
        toast.error('Ningún receptor tiene email configurado');
        return false;
      }

      const result = await sendEmail({
        to: emailRecipients.map(c => c.email!),
        subject: title,
        body_html: htmlBody,
        body_text: plainText,
        budget_id: budgetId,
        contact_id: emailRecipients[0]?.id,
      });

      if (!result.success) return false;

      // Log in crm_communications for each contact
      for (const contact of emailRecipients) {
        await supabase.from('crm_communications').insert({
          communication_type: 'email',
          contact_id: contact.id,
          content: plainText,
          subject: title,
          direction: 'outbound',
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: user?.id || null,
          metadata: { budget_id: budgetId, message_id: messageId },
        });
      }

      // Create follow-up gestión
      await createFollowUpGestion(emailRecipients, 'Email', messageId);
      return true;
    }

    if (channel === 'whatsapp') {
      const phoneContacts = selectedContacts.filter(c => c.phone);
      if (phoneContacts.length === 0) {
        toast.error('Ningún receptor tiene teléfono configurado');
        return false;
      }

      // Save to whatsapp_messages for the first contact
      const firstContact = phoneContacts[0];
      const phone = normalizePhone(firstContact.phone);

      if (phone) {
        await supabase.from('whatsapp_messages').insert({
          contact_id: firstContact.id,
          budget_id: budgetId,
          phone_number: phone,
          direction: 'outbound',
          message: plainText,
          status: 'sent',
          created_by: user?.id,
        });

        // Log in crm_communications
        await supabase.from('crm_communications').insert({
          communication_type: 'whatsapp',
          contact_id: firstContact.id,
          content: plainText,
          subject: title,
          direction: 'outbound',
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: user?.id || null,
          metadata: { budget_id: budgetId, message_id: messageId },
        });

        // Copy to clipboard
        try {
          await navigator.clipboard.writeText(plainText);
          toast.success('Mensaje copiado al portapapeles');
        } catch {
          // Silently fail
        }

        // Open WhatsApp
        const waPhone = phone.replace(/^\+/, '');
        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(plainText)}`;
        window.open(waUrl, '_blank');
      }

      // Create follow-up gestión
      await createFollowUpGestion(phoneContacts, 'WhatsApp', messageId);
      return true;
    }

    if (channel === 'sms') {
      const phoneContacts = selectedContacts.filter(c => c.phone);
      if (phoneContacts.length === 0) {
        toast.error('Ningún receptor tiene teléfono configurado');
        return false;
      }

      const firstContact = phoneContacts[0];
      const phone = normalizePhone(firstContact.phone);

      if (phone) {
        // Log in crm_communications
        await supabase.from('crm_communications').insert({
          communication_type: 'sms',
          contact_id: firstContact.id,
          content: plainText,
          subject: title,
          direction: 'outbound',
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: user?.id || null,
          metadata: { budget_id: budgetId, message_id: messageId, manual_send: true },
        });

        // Copy to clipboard
        try {
          await navigator.clipboard.writeText(plainText);
          toast.success('Mensaje copiado al portapapeles');
        } catch {
          // Silently fail
        }

        // Open SMS app
        const smsPhone = phone.replace('+', '');
        window.open(`sms:${smsPhone}`, '_blank');
      }

      // Create follow-up gestión
      await createFollowUpGestion(phoneContacts, 'SMS', messageId);
      return true;
    }

    return false;
  };

  const normalizePhone = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    let clean = phone.replace(/[\s\-\(\)\.]/g, '');
    if (clean.startsWith('00')) clean = '+' + clean.slice(2);
    if (/^[6789]\d{8}$/.test(clean)) clean = '+34' + clean;
    if (!clean.startsWith('+') && /^\d{10,15}$/.test(clean)) clean = '+' + clean;
    return clean.startsWith('+') ? clean : null;
  };

  const createFollowUpGestion = async (contacts: Contact[], channel: string, messageId: string) => {
    try {
      const contactNames = contacts.map(c => c.surname ? `${c.name} ${c.surname}` : c.name).join(', ');
      const { data: management } = await supabase
        .from('crm_managements')
        .insert({
          title: `Seguimiento ${channel} - ${title}`,
          description: `Seguimiento del mensaje enviado por ${channel} a: ${contactNames}`,
          management_type: 'Tarea',
          status: 'Pendiente',
          target_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          start_time: new Date().toTimeString().slice(0, 5),
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (management) {
        // Link contacts to the management
        const inserts = contacts.map(c => ({
          management_id: management.id,
          contact_id: c.id,
        }));
        await supabase.from('crm_management_contacts').insert(inserts);
      }
    } catch (error) {
      console.error('Error creating follow-up:', error);
    }
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
    if (sendNow && sentVia && sentVia !== 'interno') {
      // Validate channel requirements
      if (sentVia === 'email' && !selectedContacts.some(c => c.email)) {
        toast.error('Ningún receptor tiene email. Añade contactos con email.');
        return;
      }
      if ((sentVia === 'whatsapp' || sentVia === 'sms') && !selectedContacts.some(c => c.phone)) {
        toast.error('Ningún receptor tiene teléfono. Añade contactos con teléfono.');
        return;
      }
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
        sent_via: sendNow && sentVia && sentVia !== 'interno' ? sentVia : (sentVia === 'interno' ? 'interno' : null),
        sent_at: sendNow && sentVia && sentVia !== 'interno' ? new Date().toISOString() : null,
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

      // Send via channel if requested
      if (sendNow && sentVia && sentVia !== 'interno') {
        const sent = await sendViaChannel(sentVia, messageId);
        if (sent) {
          toast.success(`Mensaje ${message ? 'actualizado' : 'creado'} y enviado por ${sentVia}`);
        } else {
          toast.warning('Mensaje guardado, pero hubo un problema al enviar');
        }
      } else {
        toast.success(message ? 'Mensaje actualizado' : 'Mensaje creado');
      }

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

  const isBusy = isLoading || emailSending;

  // Channel-specific icons for the send button
  const channelIcon = sentVia === 'email' ? <Mail className="h-4 w-4" /> :
    sentVia === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> :
    sentVia === 'sms' ? <Smartphone className="h-4 w-4" /> :
    <Send className="h-4 w-4" />;

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
                    {c.email && <Mail className="h-2.5 w-2.5 text-muted-foreground" />}
                    {c.phone && <Smartphone className="h-2.5 w-2.5 text-muted-foreground" />}
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
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </span>
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
                  const actResources = resources
                    .filter(r => r.activity_id === activity.id)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));

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
            <Label>Canal de envío</Label>
            <Select value={sentVia} onValueChange={setSentVia}>
              <SelectTrigger>
                <SelectValue placeholder="Solo registro interno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interno">Solo registro interno</SelectItem>
                <SelectItem value="email">
                  <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                </SelectItem>
                <SelectItem value="whatsapp">
                  <span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</span>
                </SelectItem>
                <SelectItem value="sms">
                  <span className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5" /> SMS</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {sentVia === 'email' && !selectedContacts.some(c => c.email) && selectedContacts.length > 0 && (
              <p className="text-xs text-destructive">⚠ Ningún receptor seleccionado tiene email</p>
            )}
            {(sentVia === 'whatsapp' || sentVia === 'sms') && !selectedContacts.some(c => c.phone) && selectedContacts.length > 0 && (
              <p className="text-xs text-destructive">⚠ Ningún receptor seleccionado tiene teléfono</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              disabled={isBusy}
              variant="secondary"
              className="gap-1"
            >
              <Save className="h-4 w-4" />
              {isBusy ? 'Guardando...' : 'Guardar'}
            </Button>
            {sentVia && sentVia !== 'interno' && (
              <Button
                onClick={() => handleSubmit(true)}
                disabled={isBusy}
                className="gap-1"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : channelIcon}
                {isBusy ? 'Enviando...' : `Guardar y Enviar`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
