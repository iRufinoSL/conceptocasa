import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Smartphone, RefreshCw } from 'lucide-react';

interface TwoFactorVerificationProps {
  userId: string;
  phoneNumber: string;
  onVerified: () => void;
  onCancel: () => void;
}

export function TwoFactorVerification({ 
  userId, 
  phoneNumber, 
  onVerified, 
  onCancel 
}: TwoFactorVerificationProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Mask phone number for display
  const maskedPhone = phoneNumber.replace(/(\+\d{2})(\d{3})(\d+)(\d{2})/, '$1 $2 *** $4');

  // Send initial code on mount
  useEffect(() => {
    sendCode();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCode = async () => {
    setIsSending(true);
    setError(null);
    
    try {
      const response = await supabase.functions.invoke('send-2fa-code/send', {
        body: { userId, phoneNumber }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setCountdown(60); // 60 second cooldown
      toast.success('Código enviado a tu teléfono');
    } catch (error: any) {
      console.error('Error sending 2FA code:', error);
      toast.error('Error al enviar el código');
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Take only last character
    setCode(newCode);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (newCode.every(d => d !== '') && newCode.join('').length === 6) {
      verifyCode(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      verifyCode(pastedData);
    }
  };

  const verifyCode = async (codeToVerify: string) => {
    setIsVerifying(true);
    setError(null);

    try {
      const response = await supabase.functions.invoke('send-2fa-code/verify', {
        body: { userId, code: codeToVerify }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;

      if (data.success) {
        toast.success('Verificación completada');
        onVerified();
      } else {
        setError(data.error || 'Código incorrecto');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      console.error('Error verifying 2FA code:', error);
      setError('Error al verificar el código');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            Verificación en Dos Pasos
          </CardTitle>
          <CardDescription className="flex items-center justify-center gap-2">
            <Smartphone className="h-4 w-4" />
            Hemos enviado un código a {maskedPhone}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OTP Input */}
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <Input
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold"
                disabled={isVerifying}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* Resend code */}
          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-sm text-muted-foreground">
                Puedes solicitar un nuevo código en {countdown}s
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={sendCode}
                disabled={isSending}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isSending ? 'animate-spin' : ''}`} />
                Reenviar código
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={isVerifying}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={() => verifyCode(code.join(''))}
              disabled={isVerifying || code.some(d => d === '')}
            >
              {isVerifying ? 'Verificando...' : 'Verificar'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            El código expira en 5 minutos. Si no lo recibes, verifica que tu número esté correcto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
