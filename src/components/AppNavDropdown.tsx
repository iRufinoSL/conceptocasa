import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppAccess } from '@/hooks/useAppAccess';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Building2,
  Calculator,
  Users,
  Calendar,
  FileText,
  Package,
  Settings,
  ChevronDown,
  Wallet,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';

interface NavItem {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  appName: string; // For permission check
}

const navItems: NavItem[] = [
  { title: 'Panel de control', path: '/dashboard', icon: LayoutDashboard, appName: 'dashboard' },
  { title: 'Proyectos', path: '/proyectos', icon: Building2, appName: 'presupuestos' },
  { title: 'Presupuestos', path: '/presupuestos', icon: Calculator, appName: 'presupuestos' },
  { title: 'CRM', path: '/crm', icon: Users, appName: 'crm' },
  { title: 'Agenda', path: '/agenda', icon: Calendar, appName: 'agenda' },
  { title: 'Documentos', path: '/documentos', icon: FileText, appName: 'documentos' },
  { title: 'Recursos', path: '/recursos', icon: Package, adminOnly: true, appName: 'recursos' },
  { title: 'Administración', path: '/administracion', icon: Wallet, adminOnly: true, appName: 'administracion' },
  { title: 'Usuarios', path: '/usuarios', icon: Users, adminOnly: true, appName: 'usuarios' },
  { title: 'Configuración', path: '/configuracion', icon: Settings, adminOnly: true, appName: 'configuracion' },
];

export function AppNavDropdown() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roles, isAdmin, signOut } = useAuth();
  const { hasAppAccess } = useAppAccess();

  const currentItem = navItems.find(item => location.pathname.startsWith(item.path));
  const isUserAdmin = isAdmin();

  // Filter items based on:
  // 1. Admin-only flag (if user is not admin, hide admin-only items)
  // 2. App access (for non-admins, check if they have access to the app)
  const visibleItems = navItems.filter(item => {
    // Admins see everything
    if (isUserAdmin) return true;
    
    // Non-admins cannot see admin-only items
    if (item.adminOnly) return false;
    
    // Check app-level access
    return hasAppAccess(item.appName);
  });

  const handleSignOut = async () => {
    const { error } = await signOut();
    toast.success('Sesión cerrada');
    navigate('/auth');
    if (error) {
      console.warn('[AppNavDropdown] Sign out warning:', error.message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {currentItem?.icon && <currentItem.icon className="h-4 w-4" />}
          <span className="hidden sm:inline">{currentItem?.title || 'Navegación'}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {visibleItems.map((item, index) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          const isDashboard = item.path === '/dashboard';
          
          return (
            <div key={item.path}>
              {isDashboard && index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => navigate(item.path)}
                className={isActive ? 'bg-accent text-accent-foreground' : ''}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.title}
              </DropdownMenuItem>
              {isDashboard && <DropdownMenuSeparator />}
            </div>
          );
        })}
        
        {/* Separador y botón Cerrar Aplicación */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar aplicación
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
