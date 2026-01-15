import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Save, Send, CheckCircle2 } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  surname?: string | null;
  phone?: string | null;
}

interface WhatsAppComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  budgetId?: string;
}

export function WhatsAppComposeDialog({ 
  open, 
  onOpenChange, 
  contact,
  budgetId 
}: WhatsAppComposeDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);

  // Reset state when dialog opens or contact changes
  useEffect(() => {
    if (open) {
      setMessage('');
      setCreateTask(false);
      setTaskName('');
      setSavedMessageId(null);
      setMessageCopied(false);
    }
  }, [open, contact?.id]);

  const getPhoneForWhatsApp = (phone: string | null | undefined) => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    return cleanPhone.startsWith('+') ? cleanPhone.replace('+', '') : `34${cleanPhone}`;
  };

  const handleSaveMessage = async () => {
    if (!contact || !message.trim()) {
      toast({
        title: 'Error',
        description: 'Debes escribir un mensaje antes de guardar',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    const phoneNumber = getPhoneForWhatsApp(contact.phone);
    
    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'El contacto no tiene un teléfono válido',
        variant: 'destructive'
      });
      setIsSaving(false);
      return;
    }

    try {
      // Save the WhatsApp message
      const { data: msgData, error: msgError } = await supabase
        .from('whatsapp_messages')
        .insert({
          contact_id: contact.id,
          budget_id: budgetId || null,
          phone_number: phoneNumber,
          direction: 'outbound',
          message: message.trim(),
          status: 'pending',
          created_by: user?.id
        })
        .select('id')
        .single();

      if (msgError) throw msgError;

      // Create task if requested
      if (createTask && taskName.trim()) {
        const { error: taskError } = await supabase
          .from('budget_tasks')
          .insert({
            name: taskName.trim(),
            description: `Seguimiento de WhatsApp enviado a ${contact.name}${contact.surname ? ' ' + contact.surname : ''}`,
            budget_id: budgetId || null,
            status: 'pending',
            created_by: user?.id
          });

        if (taskError) {
          console.error('Error creating task:', taskError);
        }
      }

      setSavedMessageId(msgData.id);
      toast({
        title: 'Mensaje guardado',
        description: 'El mensaje ha sido registrado. Ahora puedes enviarlo por WhatsApp.',
      });
    } catch (error: any) {
      console.error('Error saving message:', error);
      toast({
        title: 'Error al guardar',
        description: error.message || 'No se pudo guardar el mensaje',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!contact?.phone || !savedMessageId) return;

    try {
      // Copy message to clipboard
      await navigator.clipboard.writeText(message);
      setMessageCopied(true);

      // Update message status to sent
      await supabase
        .from('whatsapp_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', savedMessageId);

      // Open WhatsApp
      const phoneNumber = getPhoneForWhatsApp(contact.phone);
      const waUrl = `https://wa.me/${phoneNumber}`;
      window.open(waUrl, '_blank');

      toast({
        title: 'WhatsApp abierto',
        description: 'El mensaje ha sido copiado al portapapeles. Pégalo en WhatsApp.',
      });

      // Close dialog after a short delay
      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      // Fallback: just open WhatsApp
      const phoneNumber = getPhoneForWhatsApp(contact.phone);
      window.open(`https://wa.me/${phoneNumber}`, '_blank');
    }
  };

  const contactFullName = contact ? `${contact.name}${contact.surname ? ' ' + contact.surname : ''}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Enviar WhatsApp
          </DialogTitle>
          <DialogDescription>
            {contact ? (
              <>Enviar mensaje a <strong>{contactFullName}</strong> ({contact.phone})</>
            ) : (
              'Selecciona un contacto con teléfono'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Message textarea */}
          <div className="space-y-2">
            <Label>Mensaje *</Label>
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                // Invalidate saved message if content changes
                if (savedMessageId) {
                  setSavedMessageId(null);
                  setMessageCopied(false);
                }
              }}
              placeholder="Escribe tu mensaje aquí..."
              className="min-h-[120px]"
              disabled={!!savedMessageId}
            />
          </div>

          {/* Create task option */}
          {!savedMessageId && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="createTask"
                  checked={createTask}
                  onCheckedChange={(checked) => setCreateTask(checked === true)}
                />
                <Label htmlFor="createTask" className="cursor-pointer">
                  Crear tarea de seguimiento
                </Label>
              </div>

              {createTask && (
                <div className="space-y-2 ml-6">
                  <Label className="text-sm">Nombre de la tarea</Label>
                  <Input
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder={`Seguimiento WhatsApp - ${contactFullName}`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {!savedMessageId ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveMessage}
                  disabled={!message.trim() || isSaving}
                  className="flex-1 gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Guardando...' : 'Guardar mensaje'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSavedMessageId(null);
                    setMessageCopied(false);
                  }}
                  className="flex-1"
                >
                  Editar mensaje
                </Button>
                <Button
                  onClick={handleOpenWhatsApp}
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                >
                  {messageCopied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Mensaje copiado
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Abrir WhatsApp
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {savedMessageId && !messageCopied && (
            <p className="text-sm text-muted-foreground text-center">
              El mensaje se copiará automáticamente al portapapeles al abrir WhatsApp
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
