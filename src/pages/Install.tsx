import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Share, Plus, CheckCircle2, Smartphone, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Detect if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Detect successful installation
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isStandalone || isInstalled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">¡App Instalada!</CardTitle>
            <CardDescription>
              GestConcepto ya está instalado en tu dispositivo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Ir a GestConcepto
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10 p-4">
      <div className="max-w-md mx-auto pt-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-24 h-24 rounded-2xl overflow-hidden shadow-lg">
            <img src="/icon-512.png" alt="GestConcepto" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">GestConcepto</h1>
          <p className="text-muted-foreground">Gestión de Construcción</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Instalar en tu móvil
            </CardTitle>
            <CardDescription>
              Accede rápidamente desde la pantalla de inicio
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Android/Chrome - Direct install button */}
            {deferredPrompt && (
              <Button onClick={handleInstallClick} className="w-full gap-2" size="lg">
                <Download className="h-5 w-5" />
                Instalar Ahora
              </Button>
            )}

            {/* iOS Instructions */}
            {isIOS && !deferredPrompt && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Sigue estos pasos para instalar GestConcepto en tu iPhone:
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Pulsa el botón Compartir</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Share className="h-4 w-4" /> en la barra de Safari
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Desplázate y selecciona</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Plus className="h-4 w-4" /> "Añadir a pantalla de inicio"
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Pulsa "Añadir"</p>
                      <p className="text-sm text-muted-foreground">en la esquina superior derecha</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback for other browsers */}
            {!isIOS && !deferredPrompt && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Abre esta página en <strong>Chrome</strong> o <strong>Safari</strong> para instalar la app
                </p>
                <Button variant="outline" onClick={() => navigate('/auth')}>
                  Continuar en navegador
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ventajas de la App</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Acceso rápido desde el inicio
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Funciona sin conexión
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Pantalla completa sin barras
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Carga más rápida
              </li>
            </ul>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          La autenticación usa tu usuario y contraseña habitual.
          <br />
          Face ID/Touch ID funcionará para autocompletar credenciales.
        </p>
      </div>
    </div>
  );
}
