import { Home, Mail } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { NotificationsDropdown } from './NotificationsDropdown';
import { useUnreadEmailCount } from '@/hooks/useUnreadEmailCount';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Header() {
  const unreadCount = useUnreadEmailCount();
  const navigate = useNavigate();

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
            {unreadCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    onClick={() => navigate('/crm?tab=communications&filter=unread')}
                  >
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{unreadCount} email{unreadCount !== 1 ? 's' : ''} sin leer</p>
                </TooltipContent>
              </Tooltip>
            )}
            <NotificationsDropdown />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
