import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreVertical, Pencil, Trash2, Calendar, Clock, Users, MapPin } from 'lucide-react';
import { formatActividadId } from '@/lib/activity-id';
import type { BudgetTask } from './BudgetAgendaTab';

interface TaskListViewProps {
  tasks: BudgetTask[];
  onEdit: (task: BudgetTask) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (task: BudgetTask) => void;
  isAdmin: boolean;
}

export function TaskListView({ tasks, onEdit, onDelete, onToggleStatus, isAdmin }: TaskListViewProps) {
  // Group tasks by work area (through activity)
  const tasksByWorkArea = tasks.reduce((acc, task) => {
    // Get work area names from task
    const workAreaNames = task.workAreas && task.workAreas.length > 0
      ? task.workAreas.map(wa => wa.name)
      : ['Sin área de trabajo'];
    
    // A task can belong to multiple work areas, add it to each
    workAreaNames.forEach(waName => {
      if (!acc[waName]) {
        acc[waName] = {
          name: waName,
          tasks: []
        };
      }
      // Avoid duplicates if task is added to same work area
      if (!acc[waName].tasks.find(t => t.id === task.id)) {
        acc[waName].tasks.push(task);
      }
    });
    
    return acc;
  }, {} as Record<string, { name: string; tasks: BudgetTask[] }>);

  // Sort work areas: named ones first alphabetically, then "Sin área de trabajo"
  const sortedWorkAreas = Object.entries(tasksByWorkArea).sort(([a], [b]) => {
    if (a === 'Sin área de trabajo') return 1;
    if (b === 'Sin área de trabajo') return -1;
    return a.localeCompare(b, 'es');
  });

  // Calculate end date for display
  const getEndDateDisplay = (task: BudgetTask): string | null => {
    if (!task.start_date) return null;
    const endDate = addDays(new Date(task.start_date), (task.duration_days || 1) - 1);
    return format(endDate, 'd MMM yyyy', { locale: es });
  };

  const getDateRange = (task: BudgetTask): string => {
    if (!task.start_date) return 'Sin fecha';
    const start = format(new Date(task.start_date), 'd MMM', { locale: es });
    if (task.duration_days <= 1) return start;
    const endDate = addDays(new Date(task.start_date), task.duration_days - 1);
    const end = format(endDate, 'd MMM', { locale: es });
    return `${start} - ${end}`;
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            No hay tareas que mostrar
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {sortedWorkAreas.map(([workAreaKey, { name, tasks: workAreaTasks }]) => (
        <Card key={workAreaKey}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{name}</CardTitle>
              <Badge variant="outline" className="ml-2">
                {workAreaTasks.length} {workAreaTasks.length === 1 ? 'tarea' : 'tareas'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead className="text-center">Días</TableHead>
                  <TableHead className="text-center">Contactos</TableHead>
                  <TableHead>Estado</TableHead>
                  {isAdmin && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workAreaTasks.map(task => (
                  <TableRow 
                    key={task.id}
                    className={`cursor-pointer hover:bg-accent/50 ${
                      task.task_status === 'realizada' 
                        ? 'bg-green-50/50 dark:bg-green-900/10' 
                        : ''
                    }`}
                    onClick={() => onEdit(task)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={task.task_status === 'realizada'}
                        onCheckedChange={() => onToggleStatus(task)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-medium ${
                          task.task_status === 'realizada' 
                            ? 'line-through text-muted-foreground' 
                            : ''
                        }`}>
                          {task.name}
                        </span>
                        {task.description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {task.description}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.activity ? (
                        <span className="text-sm">
                          {formatActividadId({
                            phaseCode: task.activity.phase_code,
                            activityCode: task.activity.code,
                            name: task.activity.name,
                          })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin actividad</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{getDateRange(task)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {task.duration_days > 1 && (
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{task.duration_days}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {task.contacts && task.contacts.length > 0 && (
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span>{task.contacts.length}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={task.task_status === 'realizada' ? 'default' : 'secondary'}
                        className={task.task_status === 'realizada' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }
                      >
                        {task.task_status === 'realizada' ? 'Realizada' : 'Pendiente'}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(task)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => onDelete(task.id)} 
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
