import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreVertical, Pencil, Trash2, Calendar, Clock, Users, MapPin, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { formatActividadId } from '@/lib/activity-id';
import type { BudgetTask } from './BudgetAgendaTab';

interface TaskListViewProps {
  tasks: BudgetTask[];
  onEdit: (task: BudgetTask) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (task: BudgetTask) => void;
  isAdmin: boolean;
}

interface WorkAreaGroup {
  level: string;
  workAreaName: string;
  displayName: string;
  tasks: BudgetTask[];
}

export function TaskListView({ tasks, onEdit, onDelete, onToggleStatus, isAdmin }: TaskListViewProps) {
  // Start with all groups expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));

  // Group tasks by Level/WorkArea (through activity)
  const tasksByLevelWorkArea = tasks.reduce((acc, task) => {
    // Get work areas from task
    const workAreas = task.workAreas && task.workAreas.length > 0
      ? task.workAreas
      : [{ name: 'Sin área de trabajo', level: '', work_area: '' }];
    
    // A task can belong to multiple work areas, add it to each
    workAreas.forEach(wa => {
      const level = wa.level || '';
      const workAreaName = wa.name || 'Sin área de trabajo';
      const groupKey = level ? `${level}/${workAreaName}` : workAreaName;
      const displayName = level ? `${level} - ${workAreaName}` : workAreaName;
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          level,
          workAreaName,
          displayName,
          tasks: []
        };
      }
      // Avoid duplicates if task is added to same work area
      if (!acc[groupKey].tasks.find(t => t.id === task.id)) {
        acc[groupKey].tasks.push(task);
      }
    });
    
    return acc;
  }, {} as Record<string, WorkAreaGroup>);

  // Sort work areas: by level first, then by name, "Sin área de trabajo" at the end
  const sortedWorkAreas = Object.entries(tasksByLevelWorkArea).sort(([keyA, a], [keyB, b]) => {
    if (a.workAreaName === 'Sin área de trabajo') return 1;
    if (b.workAreaName === 'Sin área de trabajo') return -1;
    // Sort by level first
    if (a.level !== b.level) {
      return a.level.localeCompare(b.level, 'es');
    }
    // Then by work area name
    return a.workAreaName.localeCompare(b.workAreaName, 'es');
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = sortedWorkAreas.map(([key]) => key);
    setExpandedGroups(new Set(['__all__', ...allKeys]));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Initialize all groups as expanded on first render
  if (expandedGroups.has('__all__') && sortedWorkAreas.length > 0) {
    const allKeys = sortedWorkAreas.map(([key]) => key);
    if (!allKeys.every(key => expandedGroups.has(key))) {
      setExpandedGroups(new Set(allKeys));
    }
  }

  // Calculate end date for display
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
        <div className="py-12">
          <div className="text-center text-muted-foreground">
            No hay tareas que mostrar
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse controls */}
      <div className="flex justify-end gap-2 mb-2">
        <Button variant="ghost" size="sm" onClick={expandAll}>
          Expandir todo
        </Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>
          Colapsar todo
        </Button>
      </div>

      {sortedWorkAreas.map(([groupKey, { displayName, tasks: groupTasks }]) => {
        const isExpanded = expandedGroups.has(groupKey);
        
        return (
          <Collapsible
            key={groupKey}
            open={isExpanded}
            onOpenChange={() => toggleGroup(groupKey)}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-medium">{displayName}</span>
                  <Badge variant="outline" className="ml-2">
                    {groupTasks.length} {groupTasks.length === 1 ? 'tarea' : 'tareas'}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t">
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
                      {groupTasks.map(task => (
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
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
