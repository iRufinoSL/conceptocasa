import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Send, Loader2 } from 'lucide-react';

function extractEdgeFunctionError(err: any): string {
  // supabase-js wraps non-2xx function responses in a FunctionsHttpError.
  // The useful payload is typically in err.context (may be string or object).
  try {
    const ctx = err?.context;
    const body = ctx?.body ?? ctx;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        return parsed?.error || parsed?.message || parsed?.details?.message || body;
      } catch {
        return body;
      }
    }
    if (body && typeof body === 'object') {
      return body?.error || body?.message || body?.details?.message || err?.message || 'Error desconocido';
    }
  } catch {
    // ignore
  }

  return err?.message || 'No se pudo enviar el mensaje';
}

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
  const [isSending, setIsSending] = useState(false);

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

  const handleSend = async () => {
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

    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: phoneNumber,
          message: message.trim(),
          contact_id: contact.id,
          budget_id: budgetId || undefined,
        },
      });

      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || 'No se pudo enviar el mensaje');
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'SMS enviado',
        description: `Mensaje enviado a ${contact.name}${contact.surname ? ' ' + contact.surname : ''}`,
      });

      setMessage('');
      onOpenChange(false);
      onSuccess?.();

      // refrescar seguimiento unificado
      queryClient.invalidateQueries({ queryKey: ['unified-sms'] });
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
      queryClient.invalidateQueries({ queryKey: ['unified-whatsapp'] });
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      toast({
        title: 'Error al enviar SMS',
        description: extractEdgeFunctionError(error),
        variant: 'destructive',
      });

      // Aun cuando falla, el backend registra el intento en el seguimiento (estado: failed).
      // Forzamos refresh del historial para que el usuario pueda comprobarlo.
      onSuccess?.();

      queryClient.invalidateQueries({ queryKey: ['unified-sms'] });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setMessage('');
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
              <>Enviar SMS a <strong>{contactName}</strong> ({contact.phone})</>
            ) : (
              'El contacto no tiene teléfono configurado'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sms-message">Mensaje</Label>
            <Textarea
              id="sms-message"
              placeholder="Escribe tu mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={isSending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {charCount} caracteres • {smsCount} SMS
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isSending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || !contact?.phone || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar SMS
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
