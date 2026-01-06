import { HardHat } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { NotificationsDropdown } from './NotificationsDropdown';

export function Header() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="gradient-accent p-2 rounded-lg">
              <HardHat className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">BuildManager</h1>
              <p className="text-sm text-muted-foreground">Gestión de Proyectos de Construcción</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
