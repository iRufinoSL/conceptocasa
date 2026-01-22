import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Bell, Mail, Phone, Loader2 } from 'lucide-react';

interface NotificationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettingsDialog({ open, onOpenChange }: NotificationSettingsDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationPhone, setNotificationPhone] = useState('');
  const [notificationType, setNotificationType] = useState<string>('email');

  useEffect(() => {
    if (open && user) {
      loadSettings();
    }
  }, [open, user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('personal_notification_email, personal_notification_phone, personal_notification_type')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setNotificationEmail(data?.personal_notification_email || '');
      setNotificationPhone(data?.personal_notification_phone || '');
      setNotificationType(data?.personal_notification_type || 'email');
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          personal_notification_email: notificationEmail || null,
          personal_notification_phone: notificationPhone || null,
          personal_notification_type: notificationType,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Preferencias de notificación guardadas');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving notification settings:', error);
      toast.error(error.message || 'Error al guardar las preferencias');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificaciones de Tareas
          </DialogTitle>
          <DialogDescription>
            Configura cómo quieres recibir recordatorios de tus tareas pendientes (8:00h y 18:00h).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email para notificaciones
              </Label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recibirás un listado de tareas pendientes y vencidas a las 8:00h y 18:00h
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Teléfono (opcional)
              </Label>
              <Input
                type="tel"
                placeholder="+34 600 000 000"
                value={notificationPhone}
                onChange={(e) => setNotificationPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de notificación</Label>
              <Select value={notificationType} onValueChange={setNotificationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Solo email</SelectItem>
                  <SelectItem value="sms">Solo SMS</SelectItem>
                  <SelectItem value="both">Email y SMS</SelectItem>
                  <SelectItem value="none">Desactivadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
