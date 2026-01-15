import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Save, Send, CheckCircle2, CalendarIcon, Clock, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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
  const [taskDate, setTaskDate] = useState<Date | undefined>(undefined);
  const [taskTime, setTaskTime] = useState('');
  const [taskRepeatDaily, setTaskRepeatDaily] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);

  // Generate time options (every 30 minutes)
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      timeOptions.push(`${hour}:${minute}`);
    }
  }

  // Reset state when dialog opens or contact changes
  useEffect(() => {
    if (open) {
      setMessage('');
      setCreateTask(false);
      setTaskName('');
      setTaskDate(undefined);
      setTaskTime('');
      setTaskRepeatDaily(false);
      setSavedMessageId(null);
      setMessageCopied(false);
    }
  }, [open, contact?.id]);

  const getPhoneForWhatsApp = (phone: string | null | undefined) => {
    if (!phone) return null;

    // Remove spaces, dashes, parentheses, etc.
    let clean = phone.replace(/[\s\-\(\)\.]/g, '');

    // Convert 00 prefix to international format
    if (clean.startsWith('00')) clean = clean.slice(2);

    // If it starts with +, remove it for wa.me
    if (clean.startsWith('+')) clean = clean.slice(1);

    // If it's a Spanish local mobile/landline (9 digits starting 6/7/8/9), prepend country code
    if (/^[6789]\d{8}$/.test(clean)) return `34${clean}`;

    // If it already includes country code (e.g., 34...), keep as-is
    if (/^\d{10,15}$/.test(clean)) return clean;

    return null;
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
        // Prepare task data
        const taskData: any = {
          name: taskName.trim(),
          description: `Seguimiento de WhatsApp enviado a ${contact.name}${contact.surname ? ' ' + contact.surname : ''}${taskRepeatDaily ? '\n🔄 Repetir diariamente hasta completar' : ''}`,
          budget_id: budgetId || null,
          status: 'pending',
          created_by: user?.id
        };

        // Add date if specified
        if (taskDate) {
          taskData.target_date = format(taskDate, 'yyyy-MM-dd');
          taskData.start_date = format(taskDate, 'yyyy-MM-dd');
        }

        // Add time if specified
        if (taskTime) {
          taskData.start_time = taskTime;
        }

        const { error: taskError } = await supabase
          .from('budget_tasks')
          .insert(taskData);

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

  const copyToClipboard = async (text: string) => {
    // Primary path (modern browsers)
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback path
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!contact?.phone || !savedMessageId) return;

    const phoneNumber = getPhoneForWhatsApp(contact.phone);
    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'El contacto no tiene un teléfono válido para WhatsApp',
        variant: 'destructive',
      });
      return;
    }

    const encodedMessage = encodeURIComponent(message.trim());
    const waUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    try {
      // Copy message to clipboard as a convenience (some WhatsApp clients may ignore URL text)
      const copied = await copyToClipboard(message.trim());
      setMessageCopied(copied);

      // Update message status to sent
      await supabase
        .from('whatsapp_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', savedMessageId);

      // Open WhatsApp with the message pre-filled
      window.open(waUrl, '_blank');

      toast({
        title: 'WhatsApp abierto',
        description: copied
          ? 'El mensaje se ha copiado al portapapeles y se ha preparado en WhatsApp.'
          : 'WhatsApp se ha abierto. Si no aparece el texto, pega el mensaje (Ctrl+V).',
      });

      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      window.open(waUrl, '_blank');
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
                <div className="space-y-3 ml-6">
                  <div className="space-y-2">
                    <Label className="text-sm">Nombre de la tarea</Label>
                    <Input
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      placeholder={`Seguimiento WhatsApp - ${contactFullName}`}
                    />
                  </div>
                  
                  {/* Date and Time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-full justify-start text-left font-normal h-8",
                              !taskDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {taskDate ? format(taskDate, "d MMM", { locale: es }) : "Seleccionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={taskDate}
                            onSelect={setTaskDate}
                            initialFocus
                            locale={es}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hora</Label>
                      <Select value={taskTime} onValueChange={setTaskTime}>
                        <SelectTrigger className="h-8">
                          <Clock className="mr-2 h-3 w-3" />
                          <SelectValue placeholder="HH:MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Repeat daily option */}
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="repeatDaily"
                      checked={taskRepeatDaily}
                      onCheckedChange={(checked) => setTaskRepeatDaily(checked === true)}
                    />
                    <Label htmlFor="repeatDaily" className="cursor-pointer text-sm flex items-center gap-1">
                      <Repeat className="h-3 w-3" />
                      Repetir aviso diariamente hasta completar
                    </Label>
                  </div>
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
