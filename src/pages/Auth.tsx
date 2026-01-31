import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { z } from 'zod';
import { Building2, Mail, Lock, Eye, EyeOff, RefreshCw, ArrowLeft, CheckCircle } from 'lucide-react';
import { TwoFactorVerification } from '@/components/TwoFactorVerification';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede exceder 128 caracteres');

type AuthMode = 'login' | 'forgot-password' | 'reset-password' | '2fa-verification';

interface Pending2FA {
  userId: string;
  phoneNumber: string;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user, loading, signIn, signOut, resetPasswordForEmail, updatePassword } = useAuth();
  const { hasUpdate, updateApp } = useVersionCheck(true);
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [pending2FA, setPending2FA] = useState<Pending2FA | null>(null);

  // Check if coming from reset email link
  useEffect(() => {
    const isReset = searchParams.get('reset') === 'true';
    const accessToken = searchParams.get('access_token');
    const type = searchParams.get('type');
    
    if (isReset || type === 'recovery' || accessToken) {
      setMode('reset-password');
    }
  }, [searchParams]);

  useEffect(() => {
    // Only redirect if logged in AND not in reset-password or 2FA mode
    if (user && !loading && mode !== 'reset-password' && mode !== '2fa-verification') {
      // Check if there's a saved location to redirect to
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      navigate(from || '/dashboard', { replace: true });
    }
  }, [user, loading, navigate, mode, location.state]);

  const validateEmail = () => {
    try {
      emailSchema.parse(email);
      setErrors(prev => ({ ...prev, email: undefined }));
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setErrors(prev => ({ ...prev, email: e.errors[0].message }));
      }
      return false;
    }
  };

  const validatePassword = () => {
    const newErrors: typeof errors = {};
    
    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.password = e.errors[0].message;
      }
    }
    
    if (mode === 'reset-password' && password !== confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    
    setErrors(prev => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail() || !validatePassword()) return;
    
    setIsSubmitting(true);
    
    const { error } = await signIn(email, password);
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Credenciales inválidas. Verifica tu email y contraseña.');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Debes confirmar tu email antes de iniciar sesión.');
      } else {
        toast.error(error.message);
      }
      setIsSubmitting(false);
      return;
    }
    
    // Check if user has 2FA enabled
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('two_factor_enabled, two_factor_phone')
          .eq('id', session.session.user.id)
          .single();
        
        if (profile?.two_factor_enabled && profile?.two_factor_phone) {
          // User has 2FA enabled, show verification
          setPending2FA({
            userId: session.session.user.id,
            phoneNumber: profile.two_factor_phone
          });
          setMode('2fa-verification');
          setIsSubmitting(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking 2FA status:', error);
    }
    
    toast.success('Sesión iniciada correctamente');
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    navigate(from || '/dashboard', { replace: true });
    setIsSubmitting(false);
  };

  const handle2FAVerified = () => {
    toast.success('Verificación completada. Bienvenido!');
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    navigate(from || '/dashboard', { replace: true });
  };

  const handle2FACancel = async () => {
    // Sign out the user since 2FA wasn't completed
    await signOut();
    setPending2FA(null);
    setMode('login');
    toast.info('Inicio de sesión cancelado');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail()) return;
    
    setIsSubmitting(true);
    
    const { error } = await resetPasswordForEmail(email);
    
    if (error) {
      toast.error(error.message);
    } else {
      setEmailSent(true);
      toast.success('Se ha enviado un enlace de recuperación a tu email');
    }
    
    setIsSubmitting(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePassword()) return;
    
    setIsSubmitting(true);
    
    const { error } = await updatePassword(password);
    
    if (error) {
      toast.error(error.message);
    } else {
      setPasswordReset(true);
      toast.success('Contraseña actualizada correctamente');
      // Clear URL params
      window.history.replaceState({}, document.title, '/auth');
    }
    
    setIsSubmitting(false);
  };

  const resetForm = () => {
    setMode('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setEmailSent(false);
    setPasswordReset(false);
    setErrors({});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show 2FA verification screen
  if (mode === '2fa-verification' && pending2FA) {
    return (
      <TwoFactorVerification
        userId={pending2FA.userId}
        phoneNumber={pending2FA.phoneNumber}
        onVerified={handle2FAVerified}
        onCancel={handle2FACancel}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {mode === 'login' && 'Gestión Concepto.Casa'}
            {mode === 'forgot-password' && 'Recuperar Contraseña'}
            {mode === 'reset-password' && 'Nueva Contraseña'}
          </CardTitle>
          <CardDescription>
            {mode === 'login' && 'Accede a tu cuenta para gestionar tus proyectos de construcción'}
            {mode === 'forgot-password' && 'Te enviaremos un enlace para restablecer tu contraseña'}
            {mode === 'reset-password' && 'Introduce tu nueva contraseña'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasUpdate && mode === 'login' && (
            <Alert className="mb-4 border-warning bg-warning/10">
              <RefreshCw className="h-4 w-4 text-warning" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-warning-foreground">
                  Hay una nueva versión disponible
                </span>
                <Button 
                  variant="outline"
                  size="sm" 
                  onClick={updateApp}
                  className="ml-2 border-warning text-warning hover:bg-warning/20"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Actualizar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot-password' && !emailSent && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar Enlace de Recuperación'}
              </Button>
            </form>
          )}

          {/* Email Sent Success */}
          {mode === 'forgot-password' && emailSent && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-3 rounded-full bg-success/10">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-foreground">¡Enlace enviado!</p>
                <p className="text-sm text-muted-foreground">
                  Hemos enviado un enlace de recuperación a <strong>{email}</strong>.
                  Revisa tu bandeja de entrada y sigue las instrucciones.
                </p>
              </div>
              <Button variant="outline" onClick={resetForm} className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver al Inicio de Sesión
              </Button>
            </div>
          )}

          {/* Reset Password Form */}
          {mode === 'reset-password' && !passwordReset && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Actualizando...' : 'Actualizar Contraseña'}
              </Button>
            </form>
          )}

          {/* Password Reset Success */}
          {mode === 'reset-password' && passwordReset && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-3 rounded-full bg-success/10">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-foreground">¡Contraseña actualizada!</p>
                <p className="text-sm text-muted-foreground">
                  Tu contraseña se ha actualizado correctamente. Ahora puedes iniciar sesión.
                </p>
              </div>
              <Button onClick={resetForm} className="w-full">
                Iniciar Sesión
              </Button>
            </div>
          )}
        </CardContent>

        {/* Footer with Forgot Password link */}
        {mode === 'login' && (
          <CardFooter className="flex justify-center">
            <button
              type="button"
              onClick={() => setMode('forgot-password')}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </CardFooter>
        )}

        {/* Back to login link for forgot-password mode */}
        {mode === 'forgot-password' && !emailSent && (
          <CardFooter className="flex justify-center">
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Volver al Inicio de Sesión
            </button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
