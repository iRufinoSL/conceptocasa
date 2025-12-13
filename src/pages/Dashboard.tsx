import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FolderKanban, 
  Calculator, 
  Users, 
  Calendar, 
  FileText, 
  Package, 
  Wallet, 
  UserCog, 
  MessageSquare, 
  Settings,
  LogOut,
  Building2
} from 'lucide-react';

interface AppCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  available: boolean;
  adminOnly: boolean;
}

const apps: AppCard[] = [
  {
    id: 'proyectos',
    title: 'Proyectos',
    description: 'Gestión de proyectos de construcción',
    icon: FolderKanban,
    route: '/proyectos',
    available: true,
    adminOnly: false,
  },
  {
    id: 'presupuestos',
    title: 'Presupuestos',
    description: 'Gestión de presupuestos y versiones',
    icon: Calculator,
    route: '/presupuestos',
    available: true,
    adminOnly: false,
  },
  {
    id: 'crm',
    title: 'CRM',
    description: 'Gestión de contactos y clientes',
    icon: Users,
    route: '/crm',
    available: true,
    adminOnly: false,
  },
  {
    id: 'agenda',
    title: 'Agenda',
    description: 'Calendario y programación',
    icon: Calendar,
    route: '/agenda',
    available: true,
    adminOnly: false,
  },
  {
    id: 'documentos',
    title: 'Documentos',
    description: 'Gestión documental',
    icon: FileText,
    route: '/documentos',
    available: true,
    adminOnly: false,
  },
  {
    id: 'recursos',
    title: 'Recursos',
    description: 'Gestión de recursos externos',
    icon: Package,
    route: '/recursos',
    available: true,
    adminOnly: true,
  },
  {
    id: 'administracion',
    title: 'Administración',
    description: 'Contabilidad y facturación',
    icon: Wallet,
    route: '/administracion',
    available: false,
    adminOnly: true,
  },
  {
    id: 'usuarios',
    title: 'Usuarios',
    description: 'Gestión de usuarios y permisos',
    icon: UserCog,
    route: '/usuarios',
    available: true,
    adminOnly: true,
  },
  {
    id: 'comunicaciones',
    title: 'Comunicaciones',
    description: 'Mensajería y notificaciones',
    icon: MessageSquare,
    route: '/comunicaciones',
    available: false,
    adminOnly: false,
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    description: 'Ajustes del sistema y empresa',
    icon: Settings,
    route: '/configuracion',
    available: true,
    adminOnly: true,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading, rolesLoading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleAppClick = (app: AppCard) => {
    if (app.available) {
      navigate(app.route);
    }
  };

  // Filter apps based on user role
  const visibleApps = apps.filter(app => {
    if (isAdmin()) return true;
    return !app.adminOnly;
  });

  // Wait for both auth and roles to load
  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Gestión Concepto.Casa</h1>
              <p className="text-sm text-muted-foreground">
                {user?.email} {isAdmin() && <span className="text-primary font-medium">• Administrador</span>}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Aplicaciones</h2>
          <p className="text-muted-foreground">
            Selecciona una aplicación para comenzar
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleApps.map((app) => {
            const Icon = app.icon;
            return (
              <Card
                key={app.id}
                className={`group cursor-pointer transition-all duration-200 ${
                  app.available
                    ? 'hover:shadow-lg hover:border-primary/50 hover:-translate-y-1'
                    : 'opacity-60 cursor-not-allowed'
                }`}
                onClick={() => handleAppClick(app)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${
                      app.available 
                        ? 'bg-primary/10 group-hover:bg-primary/20' 
                        : 'bg-muted'
                    } transition-colors`}>
                      <Icon className={`h-6 w-6 ${
                        app.available ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                    </div>
                    {!app.available && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                        Próximamente
                      </span>
                    )}
                  </div>
                  <CardTitle className={`text-lg ${
                    !app.available && 'text-muted-foreground'
                  }`}>
                    {app.title}
                  </CardTitle>
                  <CardDescription>{app.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
