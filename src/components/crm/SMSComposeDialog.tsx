import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Copy, ExternalLink, Check } from 'lucide-react';

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

      toast({
        title: 'Mensaje copiado',
        description: 'Abriendo app de SMS. Pega el mensaje y envíalo.',
      });

      // Open native SMS app with the phone number
      // Remove + for sms: URL scheme compatibility
      const smsPhone = phoneNumber.replace('+', '');
      window.open(`sms:${smsPhone}`, '_blank');

      // Reset after a short delay
      setTimeout(() => {
        setIsCopied(false);
        setMessage('');
        onOpenChange(false);
        onSuccess?.();

        // Refresh tracking queries
        queryClient.invalidateQueries({ queryKey: ['unified-sms'] });
        queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
        queryClient.invalidateQueries({ queryKey: ['contact-communications'] });
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
