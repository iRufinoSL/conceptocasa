import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Shield, Smartphone, Check, AlertTriangle } from 'lucide-react';

interface TwoFactorSettingsProps {
  userId: string;
  currentEnabled: boolean;
  currentPhone: string | null;
  onUpdate: () => void;
}

export function TwoFactorSettings({ 
  userId, 
  currentEnabled, 
  currentPhone,
  onUpdate 
}: TwoFactorSettingsProps) {
  const [enabled, setEnabled] = useState(currentEnabled);
  const [phone, setPhone] = useState(currentPhone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [showTestInput, setShowTestInput] = useState(false);

  const formatPhone = (value: string) => {
    // Remove non-digits except leading +
    let cleaned = value.replace(/[^\d+]/g, '');
    
    // Ensure + is only at the beginning
    if (cleaned.includes('+') && !cleaned.startsWith('+')) {
      cleaned = cleaned.replace(/\+/g, '');
    }
    
    return cleaned;
  };

  const handlePhoneChange = (value: string) => {
    setPhone(formatPhone(value));
  };

  const handleSave = async () => {
    if (enabled && !phone) {
      toast.error('Debes introducir un número de teléfono para activar 2FA');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: enabled,
          two_factor_phone: enabled ? phone : null
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success(enabled ? '2FA activado correctamente' : '2FA desactivado');
      onUpdate();
    } catch (error: any) {
      console.error('Error saving 2FA settings:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSMS = async () => {
    if (!phone) {
      toast.error('Introduce un número de teléfono primero');
      return;
    }

    setIsTesting(true);
    try {
      const response = await supabase.functions.invoke('send-2fa-code/send', {
        body: { userId, phoneNumber: phone }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setShowTestInput(true);
      toast.success('Código de prueba enviado');
    } catch (error: any) {
      console.error('Error sending test SMS:', error);
      toast.error('Error al enviar el SMS de prueba');
    } finally {
      setIsTesting(false);
    }
  };

  const handleVerifyTest = async () => {
    if (!testCode || testCode.length !== 6) {
      toast.error('Introduce el código de 6 dígitos');
      return;
    }

    setIsTesting(true);
    try {
      const response = await supabase.functions.invoke('send-2fa-code/verify', {
        body: { userId, code: testCode }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (data.success) {
        toast.success('¡Verificación exitosa! El 2FA está configurado correctamente.');
        setShowTestInput(false);
        setTestCode('');
      } else {
        toast.error(data.error || 'Código incorrecto');
      }
    } catch (error: any) {
      console.error('Error verifying test code:', error);
      toast.error('Error al verificar el código');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Autenticación en Dos Pasos (2FA)
        </CardTitle>
        <CardDescription>
          Añade una capa extra de seguridad a tu cuenta. Recibirás un código por SMS cada vez que inicies sesión.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="2fa-toggle">Activar 2FA por SMS</Label>
            <p className="text-sm text-muted-foreground">
              Recibe un código de verificación en tu móvil
            </p>
          </div>
          <Switch
            id="2fa-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Phone number input */}
        {enabled && (
          <div className="space-y-2">
            <Label htmlFor="2fa-phone">Número de Teléfono</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="2fa-phone"
                  type="tel"
                  placeholder="+34 612 345 678"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleTestSMS}
                disabled={isTesting || !phone}
              >
                {isTesting ? 'Enviando...' : 'Probar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato internacional recomendado: +34 seguido de tu número
            </p>
          </div>
        )}

        {/* Test verification */}
        {showTestInput && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertDescription className="space-y-3">
              <p className="font-medium">Introduce el código recibido para verificar:</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="123456"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="font-mono text-center"
                />
                <Button onClick={handleVerifyTest} disabled={isTesting}>
                  <Check className="h-4 w-4 mr-1" />
                  Verificar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Warning for disabling */}
        {currentEnabled && !enabled && (
          <Alert className="border-warning bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning-foreground">
              Desactivar 2FA reduce la seguridad de tu cuenta. Solo hazlo si es necesario.
            </AlertDescription>
          </Alert>
        )}

        {/* Save button */}
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </CardContent>
    </Card>
  );
}
