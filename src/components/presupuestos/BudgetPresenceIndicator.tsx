import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresenceUser {
  user_id: string;
  user_name: string;
  user_email: string;
  active_tab: string | null;
  editing_entity_type: 'activity' | 'resource' | 'phase' | 'work_area' | null;
  editing_entity_id: string | null;
}

interface BudgetPresenceIndicatorProps {
  activeUsers: PresenceUser[];
  currentUserId: string;
  className?: string;
}

const TAB_LABELS: Record<string, string> = {
  'cuanto-cuesta': 'CUÁNTO?',
  'actividades': 'QUÉ?',
  'recursos': 'CÓMO?',
  'fases': 'CUÁNDO?',
  'areas-trabajo': 'DÓNDE?',
  'contactos': 'QUIÉN?',
};

const ENTITY_LABELS: Record<string, string> = {
  'activity': 'actividad',
  'resource': 'recurso',
  'phase': 'fase',
  'work_area': 'área de trabajo',
};

// Generate consistent color from user name using design tokens
function getUserColorClass(name: string): string {
  const colors = [
    'bg-primary',
    'bg-secondary',
    'bg-accent',
    'bg-muted',
    'bg-destructive',
    'bg-chart-1',
    'bg-chart-2',
    'bg-chart-3',
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function BudgetPresenceIndicator({ activeUsers, currentUserId, className }: BudgetPresenceIndicatorProps) {
  const otherUsers = activeUsers.filter(u => u.user_id !== currentUserId);

  if (otherUsers.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="text-xs">{otherUsers.length + 1}</span>
        </div>
        
        <div className="flex -space-x-2">
          {otherUsers.slice(0, 5).map((user) => (
            <Tooltip key={user.user_id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium border-2 border-background cursor-default",
                    getUserColorClass(user.user_name)
                  )}
                >
                  {getInitials(user.user_name)}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{user.user_name}</p>
                  {user.active_tab && (
                    <p className="text-muted-foreground text-xs">
                      En: {TAB_LABELS[user.active_tab] || user.active_tab}
                    </p>
                  )}
                  {user.editing_entity_type && (
                    <p className="text-destructive text-xs flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Editando {ENTITY_LABELS[user.editing_entity_type] || user.editing_entity_type}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          
          {otherUsers.length > 5 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-7 w-7 rounded-full flex items-center justify-center bg-muted text-muted-foreground text-xs font-medium border-2 border-background">
                  +{otherUsers.length - 5}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  {otherUsers.slice(5).map(u => (
                    <p key={u.user_id}>{u.user_name}</p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

interface EntityLockIndicatorProps {
  lockedBy?: {
    user_name: string;
    user_email: string;
  };
  className?: string;
}

export function EntityLockIndicator({ lockedBy, className }: EntityLockIndicatorProps) {
  if (!lockedBy) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 text-destructive border-destructive/30 bg-destructive/10", className)}>
            <Lock className="h-3 w-3" />
            Bloqueado
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">
            <span className="font-medium">{lockedBy.user_name}</span> está editando esto
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
