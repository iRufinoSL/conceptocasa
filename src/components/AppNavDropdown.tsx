import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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
} from 'lucide-react';

interface NavItem {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { title: 'Proyectos', path: '/proyectos', icon: Building2 },
  { title: 'Presupuestos', path: '/presupuestos', icon: Calculator },
  { title: 'CRM', path: '/crm', icon: Users },
  { title: 'Agenda', path: '/agenda', icon: Calendar },
  { title: 'Documentos', path: '/documentos', icon: FileText },
  { title: 'Recursos', path: '/recursos', icon: Package, adminOnly: true },
  { title: 'Administración', path: '/administracion', icon: Wallet, adminOnly: true },
  { title: 'Usuarios', path: '/usuarios', icon: Users, adminOnly: true },
  { title: 'Configuración', path: '/configuracion', icon: Settings, adminOnly: true },
];

export function AppNavDropdown() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roles } = useAuth();

  const currentItem = navItems.find(item => item.path === location.pathname);
  const isUserAdmin = roles.includes('administrador');

  const visibleItems = navItems.filter(item => !item.adminOnly || isUserAdmin);

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
          const isActive = location.pathname === item.path;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
