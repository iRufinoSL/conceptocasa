import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Mic, Pencil, User, CalendarDays, Send, Mail, MessageCircle, MessageSquare, Archive, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { VoiceNoteEditDialog } from './VoiceNoteEditDialog';
import { SendEmailDialog } from '@/components/crm/SendEmailDialog';
import { WhatsAppComposeDialog } from '@/components/crm/WhatsAppComposeDialog';
import { SMSComposeDialog } from '@/components/crm/SMSComposeDialog';
import { toast } from 'sonner';

interface VoiceNote {
  id: string;
  message: string;
  reminder_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
  budget_id: string | null;
  budget_name: string | null;
  status: string;
  created_at: string;
}

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  contactGroups: ContactGroup[];
}

interface ContactGroup {
  contactKey: string;
  contactLabel: string;
  notes: VoiceNote[];
}

interface ContactForSend {
  id: string;
  name: string;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
}

export function VoiceNotesSection() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editNote, setEditNote] = useState<VoiceNote | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Send dialog states
  const [emailOpen, setEmailOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [sendContact, setSendContact] = useState<ContactForSend | null>(null);
  const [sendBudgetId, setSendBudgetId] = useState<string | undefined>();

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('voice_notes')
      .select('id, message, reminder_at, contact_id, contact_name, budget_id, budget_name, status, created_at')
      .order('reminder_at', { ascending: true, nullsFirst: false });

    if (!error && data) {
      setNotes(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Filter by active / archived
  const filteredNotes = useMemo(() => {
    if (showArchived) {
      return notes.filter(n => n.status === 'archived');
    }
    return notes.filter(n => n.status !== 'archived');
  }, [notes, showArchived]);

  // Group by date, then by contact
  const grouped = useMemo((): DateGroup[] => {
    const dateMap = new Map<string, VoiceNote[]>();

    for (const note of filteredNotes) {
      const dateKey = note.reminder_at
        ? format(new Date(note.reminder_at), 'yyyy-MM-dd')
        : '__no_date__';
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
      dateMap.get(dateKey)!.push(note);
    }

    const sortedKeys = Array.from(dateMap.keys()).sort((a, b) => {
      if (a === '__no_date__') return 1;
      if (b === '__no_date__') return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((dateKey) => {
      const notesForDate = dateMap.get(dateKey)!;
      const dateLabel = dateKey === '__no_date__'
        ? 'Sin fecha de aviso'
        : format(new Date(dateKey), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

      const contactMap = new Map<string, VoiceNote[]>();
      for (const note of notesForDate) {
        const cKey = note.contact_name || '__no_contact__';
        if (!contactMap.has(cKey)) contactMap.set(cKey, []);
        contactMap.get(cKey)!.push(note);
      }

      const contactGroups: ContactGroup[] = Array.from(contactMap.entries())
        .sort(([a], [b]) => {
          if (a === '__no_contact__') return 1;
          if (b === '__no_contact__') return -1;
          return a.localeCompare(b);
        })
        .map(([cKey, cNotes]) => ({
          contactKey: cKey,
          contactLabel: cKey === '__no_contact__' ? 'Sin contacto' : cKey,
          notes: cNotes,
        }));

      return { dateKey, dateLabel, contactGroups };
    });
  }, [filteredNotes]);

  const archivedCount = useMemo(() => notes.filter(n => n.status === 'archived').length, [notes]);
  const activeCount = useMemo(() => notes.filter(n => n.status !== 'archived').length, [notes]);

  const handleArchiveToggle = async (note: VoiceNote) => {
    const newStatus = note.status === 'archived' ? 'active' : 'archived';
    const { error } = await supabase
      .from('voice_notes')
      .update({ status: newStatus })
      .eq('id', note.id);

    if (error) {
      toast.error('Error al actualizar estado');
    } else {
      toast.success(newStatus === 'archived' ? 'Nota archivada' : 'Nota reactivada');
      fetchNotes();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Activo</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">Enviado</Badge>;
      case 'dismissed':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Descartado</Badge>;
      case 'archived':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Archivado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleEdit = (note: VoiceNote) => {
    setEditNote(note);
    setEditOpen(true);
  };

  const handleSend = async (note: VoiceNote, channel: 'email' | 'whatsapp' | 'sms') => {
    setSendBudgetId(note.budget_id || undefined);

    // If no contact linked, show a toast
    if (!note.contact_id) {
      toast.error('Esta nota no tiene un contacto vinculado. Edítala para añadir uno.');
      return;
    }

    // Fetch contact details
    const { data: contact, error } = await supabase
      .from('crm_contacts')
      .select('id, name, surname, email, phone')
      .eq('id', note.contact_id)
      .single();

    if (error || !contact) {
      toast.error('No se pudo obtener los datos del contacto');
      return;
    }

    setSendContact(contact);

    switch (channel) {
      case 'email':
        if (!contact.email) {
          toast.error('El contacto no tiene email configurado');
          return;
        }
        setEmailOpen(true);
        break;
      case 'whatsapp':
        if (!contact.phone) {
          toast.error('El contacto no tiene teléfono configurado');
          return;
        }
        setWhatsappOpen(true);
        break;
      case 'sms':
        if (!contact.phone) {
          toast.error('El contacto no tiene teléfono configurado');
          return;
        }
        setSmsOpen(true);
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <Mic className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No hay notas de voz registradas</p>
          <p className="text-sm text-muted-foreground mt-1">
            Usa el botón de micrófono flotante para crear una nota
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Button
          variant={!showArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowArchived(false)}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Activos ({activeCount})
        </Button>
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowArchived(true)}
        >
          <Archive className="h-3.5 w-3.5 mr-1" />
          Archivados ({archivedCount})
        </Button>
      </div>

      {filteredNotes.length === 0 ? (
        <Card className="py-8">
          <CardContent className="text-center">
            <p className="text-muted-foreground text-sm">
              {showArchived ? 'No hay notas archivadas' : 'No hay notas activas'}
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map((dateGroup) => (
          <div key={dateGroup.dateKey} className="space-y-3">
            {/* Date header */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-primary capitalize">{dateGroup.dateLabel}</h4>
            </div>

            {dateGroup.contactGroups.map((contactGroup) => (
              <Card key={`${dateGroup.dateKey}-${contactGroup.contactKey}`}>
                {/* Contact sub-header */}
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 border-b">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{contactGroup.contactLabel}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {contactGroup.notes.length}
                  </Badge>
                </div>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {contactGroup.notes.map((note) => (
                      <div key={note.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm">{note.message}</p>
                          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                            {note.reminder_at && (
                              <span>
                                🔔 {format(new Date(note.reminder_at), "HH:mm", { locale: es })}
                              </span>
                            )}
                            {note.budget_name && (
                              <span>📁 {note.budget_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {getStatusBadge(note.status)}

                          {/* Send dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleSend(note, 'email')}>
                                <Mail className="h-4 w-4 mr-2" />
                                Email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSend(note, 'whatsapp')}>
                                <MessageCircle className="h-4 w-4 mr-2" />
                                WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSend(note, 'sms')}>
                                <MessageSquare className="h-4 w-4 mr-2" />
                                SMS
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Archive toggle */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={note.status === 'archived' ? 'Reactivar' : 'Archivar'}
                            onClick={() => handleArchiveToggle(note)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>

                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(note)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}

      <VoiceNoteEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        voiceNote={editNote}
        onSuccess={fetchNotes}
      />

      {/* Send dialogs */}
      <SendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        contact={sendContact ? { id: sendContact.id, name: sendContact.name, surname: sendContact.surname, email: sendContact.email } : undefined}
        budgetId={sendBudgetId}
      />

      <WhatsAppComposeDialog
        open={whatsappOpen}
        onOpenChange={setWhatsappOpen}
        contact={sendContact ? { id: sendContact.id, name: sendContact.name, surname: sendContact.surname, phone: sendContact.phone } : null}
        budgetId={sendBudgetId}
      />

      <SMSComposeDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        contact={sendContact ? { id: sendContact.id, name: sendContact.name, surname: sendContact.surname, phone: sendContact.phone } : null}
        budgetId={sendBudgetId}
      />
    </div>
  );
}
