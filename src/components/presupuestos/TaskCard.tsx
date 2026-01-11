import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2, Calendar, Clock, Users, Image } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { BudgetTask } from './BudgetAgendaTab';

interface TaskCardProps {
  task: BudgetTask;
  compact?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  isAdmin: boolean;
}

export function TaskCard({ task, compact, onEdit, onDelete, onToggleStatus, isAdmin }: TaskCardProps) {
  const endDate = task.start_date 
    ? addDays(new Date(task.start_date), (task.duration_days || 1) - 1)
    : null;

  if (compact) {
    return (
      <div
        className={`
          p-2 rounded-lg border cursor-pointer transition-colors
          ${task.task_status === 'realizada' 
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
            : 'bg-card border-border hover:bg-accent/50'
          }
        `}
        onClick={onEdit}
      >
        <div className="flex items-start gap-2">
          <Checkbox
            checked={task.task_status === 'realizada'}
            onCheckedChange={() => onToggleStatus()}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium truncate ${task.task_status === 'realizada' ? 'line-through text-muted-foreground' : ''}`}>
              {task.name}
            </p>
            {task.activity && (
              <p className="text-[10px] text-muted-foreground truncate">
                {task.activity.code} - {task.activity.name}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={`
      transition-colors
      ${task.task_status === 'realizada' 
        ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800' 
        : ''
      }
    `}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Checkbox
              checked={task.task_status === 'realizada'}
              onCheckedChange={onToggleStatus}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium ${task.task_status === 'realizada' ? 'line-through text-muted-foreground' : ''}`}>
                {task.name}
              </h4>
              {task.activity && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {task.activity.code} - {task.activity.name}
                </p>
              )}
              {task.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {task.description}
                </p>
              )}
              
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                {task.start_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {format(new Date(task.start_date), 'd MMM', { locale: es })}
                      {endDate && task.duration_days > 1 && (
                        <> - {format(endDate, 'd MMM', { locale: es })}</>
                      )}
                    </span>
                  </div>
                )}
                {task.duration_days > 1 && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{task.duration_days} días</span>
                  </div>
                )}
                {task.contacts && task.contacts.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{task.contacts.length}</span>
                  </div>
                )}
                {task.images && task.images.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Image className="h-3 w-3" />
                    <span>{task.images.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={task.task_status === 'realizada' ? 'default' : 'secondary'}>
              {task.task_status === 'realizada' ? 'Realizada' : 'Pendiente'}
            </Badge>
            
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
