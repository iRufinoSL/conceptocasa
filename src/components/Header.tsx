import { Home } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { NotificationsDropdown } from './NotificationsDropdown';

export function Header() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="gradient-primary p-2 rounded-lg">
              <Home className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Concepto.Casa <span className="text-primary font-display italic">To.Lo.Sa.systems</span></h1>
              <p className="text-sm text-muted-foreground">Tu hogar cuida de ti</p>
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
