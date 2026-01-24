import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Copy, ExternalLink, Check, Calendar, Clock } from 'lucide-react';
import { format, addDays } from 'date-fns';
interface SMSComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    name: string;
    surname?: string | null;
    phone?: string | null;
  } | null;
  budgetId?: string | null;
  onSuccess?: () => void;
}

export function SMSComposeDialog({
  open,
  onOpenChange,
  contact,
  budgetId,
  onSuccess,
}: SMSComposeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Follow-up task state - enabled by default with next day same time
  const currentTime = format(new Date(), 'HH:mm');
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpName, setFollowUpName] = useState('');
  const [followUpDate, setFollowUpDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [followUpTime, setFollowUpTime] = useState(currentTime);

  const normalizePhone = (phone: string | null | undefined): string | null => {
    if (!phone) return null;

    let clean = phone.replace(/[\s\-\(\)\.]/g, '');

    // Convert 00 prefix to +
    if (clean.startsWith('00')) {
      clean = '+' + clean.slice(2);
    }

    // If Spanish local number (9 digits starting with 6/7/8/9), add +34
    if (/^[6789]\d{8}$/.test(clean)) {
      clean = '+34' + clean;
    }

    // Ensure + prefix
    if (!clean.startsWith('+') && /^\d{10,15}$/.test(clean)) {
      clean = '+' + clean;
    }

    return clean.startsWith('+') ? clean : null;
  };

  const handleCopyAndOpen = async () => {
    if (!contact?.phone || !message.trim()) {
      toast({
        title: 'Error',
        description: 'Debes escribir un mensaje y el contacto debe tener teléfono',
        variant: 'destructive',
      });
      return;
    }

    const phoneNumber = normalizePhone(contact.phone);
    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'El teléfono del contacto no es válido',
        variant: 'destructive',
      });
      return;
    }

    setIsRegistering(true);

    try {
      // Copy message to clipboard
      await navigator.clipboard.writeText(message.trim());
      setIsCopied(true);

      // Register SMS in crm_communications as "sent" (manual)
      const { data: userData } = await supabase.auth.getUser();
      const contactFullName = `${contact.name}${contact.surname ? ' ' + contact.surname : ''}`;
      
      await supabase.from('crm_communications').insert({
        communication_type: 'sms',
        contact_id: contact.id,
        content: message.trim(),
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: userData.user?.id || null,
        metadata: {
          phone: phoneNumber,
          budget_id: budgetId || null,
          manual_send: true,
        },
      });

      // Create follow-up task/management if enabled
      if (createFollowUp) {
        const taskTitle = followUpName.trim() || `Seguimiento SMS - ${contactFullName}`;
        const taskDescription = `Seguimiento del SMS enviado a ${contactFullName} (${phoneNumber}).\n\nContenido del mensaje:\n"${message.trim()}"`;
        
        const { data: management, error: managementError } = await supabase
          .from('crm_managements')
          .insert({
            title: taskTitle,
            description: taskDescription,
            management_type: 'Tarea',
            status: 'Pendiente',
            target_date: followUpDate,
            start_time: followUpTime,
            created_by: userData.user?.id || null,
          })
          .select()
          .single();
        
        if (!managementError && management) {
          // Link contact to the management
          await supabase.from('crm_management_contacts').insert({
            management_id: management.id,
            contact_id: contact.id,
          });
          
          console.log('Follow-up task created:', management.id);
        }
      }

      toast({
        title: 'Mensaje copiado',
        description: createFollowUp 
          ? 'SMS registrado con seguimiento en Agenda. Pega el mensaje en tu app de SMS.'
          : 'Abriendo app de SMS. Pega el mensaje y envíalo.',
      });

      // Open native SMS app with the phone number
      // Remove + for sms: URL scheme compatibility
      const smsPhone = phoneNumber.replace('+', '');
      window.open(`sms:${smsPhone}`, '_blank');

      // Reset after a short delay
      setTimeout(() => {
        setIsCopied(false);
        setMessage('');
        setFollowUpName('');
        setFollowUpDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
        setFollowUpTime(format(new Date(), 'HH:mm'));
        onOpenChange(false);
        onSuccess?.();

        // Refresh tracking queries
        queryClient.invalidateQueries({ queryKey: ['unified-sms'] });
        queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
        queryClient.invalidateQueries({ queryKey: ['contact-communications'] });
        queryClient.invalidateQueries({ queryKey: ['crm-managements'] });
      }, 500);

    } catch (error: any) {
      console.error('Error registering SMS:', error);
      toast({
        title: 'Error',
        description: 'No se pudo copiar el mensaje o registrar el SMS',
        variant: 'destructive',
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleClose = () => {
    if (!isRegistering) {
      setMessage('');
      setIsCopied(false);
      onOpenChange(false);
    }
  };

  const contactName = contact
    ? `${contact.name}${contact.surname ? ' ' + contact.surname : ''}`
    : '';

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Enviar SMS
          </DialogTitle>
          <DialogDescription>
            {contact?.phone ? (
              <>Preparar SMS para <strong>{contactName}</strong> ({contact.phone})</>
            ) : (
              'El contacto no tiene teléfono configurado'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>📋 El mensaje se copiará al portapapeles y se abrirá tu app de SMS para que lo pegues y envíes.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sms-message">Mensaje</Label>
            <Textarea
              id="sms-message"
              placeholder="Escribe tu mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={isRegistering}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {charCount} caracteres • {smsCount} SMS
            </p>
          </div>

          {/* Follow-up task section */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-followup"
                checked={createFollowUp}
                onCheckedChange={(checked) => setCreateFollowUp(checked === true)}
              />
              <Label htmlFor="create-followup" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Crear seguimiento en Agenda
              </Label>
            </div>
            
            {createFollowUp && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <Label htmlFor="followup-name" className="text-xs">Nombre del seguimiento (opcional)</Label>
                  <Input
                    id="followup-name"
                    placeholder={`Seguimiento SMS - ${contactName}`}
                    value={followUpName}
                    onChange={(e) => setFollowUpName(e.target.value)}
                    disabled={isRegistering}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="followup-date" className="text-xs">Fecha</Label>
                    <Input
                      id="followup-date"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      disabled={isRegistering}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="w-24 space-y-1.5">
                    <Label htmlFor="followup-time" className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Hora
                    </Label>
                    <Input
                      id="followup-time"
                      type="time"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      disabled={isRegistering}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isRegistering}>
              Cancelar
            </Button>
            <Button
              onClick={handleCopyAndOpen}
              disabled={!message.trim() || !contact?.phone || isRegistering}
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  ¡Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar y abrir SMS
                  <ExternalLink className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
