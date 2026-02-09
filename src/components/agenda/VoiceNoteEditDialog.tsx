import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
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
}

interface VoiceNoteEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voiceNote: VoiceNote | null;
  onSuccess: () => void;
}

export function VoiceNoteEditDialog({ open, onOpenChange, voiceNote, onSuccess }: VoiceNoteEditDialogProps) {
  const [message, setMessage] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [contactName, setContactName] = useState('');
  const [budgetName, setBudgetName] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (voiceNote) {
      setMessage(voiceNote.message || '');
      setReminderAt(voiceNote.reminder_at ? voiceNote.reminder_at.slice(0, 16) : '');
      setContactName(voiceNote.contact_name || '');
      setBudgetName(voiceNote.budget_name || '');
      setStatus(voiceNote.status || 'active');
    }
  }, [voiceNote]);

  const handleSave = async () => {
    if (!voiceNote) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('voice_notes')
        .update({
          message,
          reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
          contact_name: contactName || null,
          budget_name: budgetName || null,
          status,
        })
        .eq('id', voiceNote.id);

      if (error) throw error;
      toast.success('Nota de voz actualizada');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating voice note:', error);
      toast.error('Error al actualizar la nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Nota de Voz</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="vn-message">Mensaje</Label>
            <Textarea
              id="vn-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vn-reminder">Fecha/Hora de aviso</Label>
            <Input
              id="vn-reminder"
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vn-contact">Contacto</Label>
              <Input
                id="vn-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Sin contacto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vn-budget">Presupuesto</Label>
              <Input
                id="vn-budget"
                value={budgetName}
                onChange={(e) => setBudgetName(e.target.value)}
                placeholder="Sin presupuesto"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vn-status">Estado</Label>
            <select
              id="vn-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Activo</option>
              <option value="sent">Enviado</option>
              <option value="dismissed">Descartado</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
