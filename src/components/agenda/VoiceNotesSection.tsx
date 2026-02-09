import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, Pencil, User, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { VoiceNoteEditDialog } from './VoiceNoteEditDialog';

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

export function VoiceNotesSection() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editNote, setEditNote] = useState<VoiceNote | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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

  // Group by date, then by contact
  const grouped = useMemo((): DateGroup[] => {
    const dateMap = new Map<string, VoiceNote[]>();

    for (const note of notes) {
      const dateKey = note.reminder_at
        ? format(new Date(note.reminder_at), 'yyyy-MM-dd')
        : '__no_date__';
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
      dateMap.get(dateKey)!.push(note);
    }

    // Sort date keys
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

      // Group by contact
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
  }, [notes]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Activo</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">Enviado</Badge>;
      case 'dismissed':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Descartado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleEdit = (note: VoiceNote) => {
    setEditNote(note);
    setEditOpen(true);
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
    <div className="space-y-6">
      {grouped.map((dateGroup) => (
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
                      <div className="flex items-center gap-2 shrink-0">
                        {getStatusBadge(note.status)}
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
      ))}

      <VoiceNoteEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        voiceNote={editNote}
        onSuccess={fetchNotes}
      />
    </div>
  );
}
