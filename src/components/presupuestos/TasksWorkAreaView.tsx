import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineDatePicker } from '@/components/ui/inline-date-picker';
import {
  ChevronDown, ChevronRight, Search, X, Layers, List, MapPin,
  Calendar, Clock, Users, MoreVertical, Pencil, Trash2, Plus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { formatActividadId } from '@/lib/activity-id';
import { searchMatch } from '@/lib/search-utils';
import { format, addDays, parseISO, isWithinInterval, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import type { BudgetTask } from './BudgetAgendaTab';

type SubView = 'alphabetical' | 'workarea';

interface TasksWorkAreaViewProps {
  budgetId: string;
  tasks: BudgetTask[];
  isAdmin: boolean;
  onEdit: (task: BudgetTask) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (task: BudgetTask) => void;
  onNavigateToActivity?: (activityId: string) => void;
}

interface WorkAreaWithTasks {
  id: string;
  name: string;
  level: string;
  work_area: string;
  tasks: TaskWithActivity[];
}

interface TaskWithActivity {
  task: BudgetTask;
  activityId: string;
  activityCode: string;
  activityName: string;
  phaseCode: string | null;
}

interface ActivityDateInfo {
  id: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

export function TasksWorkAreaView({
  budgetId,
  tasks,
  isAdmin,
  onEdit,
  onDelete,
  onToggleStatus,
  onNavigateToActivity,
}: TasksWorkAreaViewProps) {
  const [subView, setSubView] = useState<SubView>('alphabetical');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [activityDates, setActivityDates] = useState<ActivityDateInfo[]>([]);
  const [workAreas, setWorkAreas] = useState<{ id: string; name: string; level: string; work_area: string }[]>([]);
  const [workAreaLinks, setWorkAreaLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);

  // Fetch work areas and activity dates for the work area view
  const fetchWorkAreaData = useCallback(async () => {
    const [waRes, waLinksRes, actDatesRes] = await Promise.all([
      supabase
        .from('budget_work_areas')
        .select('id, name, level, work_area')
        .eq('budget_id', budgetId),
      supabase
        .from('budget_work_area_activities')
        .select('work_area_id, activity_id'),
      supabase
        .from('budget_activities')
        .select('id, actual_start_date, actual_end_date')
        .eq('budget_id', budgetId),
    ]);

    if (waRes.data) setWorkAreas(waRes.data);
    if (waLinksRes.data) {
      // Filter links to only include work areas from this budget
      const waIds = new Set((waRes.data || []).map(wa => wa.id));
      setWorkAreaLinks(waLinksRes.data.filter(l => waIds.has(l.work_area_id)));
    }
    if (actDatesRes.data) setActivityDates(actDatesRes.data);
  }, [budgetId]);

  useEffect(() => {
    fetchWorkAreaData();
  }, [fetchWorkAreaData]);

  // Filter tasks by search term
  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return tasks;
    return tasks.filter(task => {
      if (searchMatch(task.name, searchTerm)) return true;
      if (searchMatch(task.description, searchTerm)) return true;
      if (task.activity && searchMatch(task.activity.name, searchTerm)) return true;
      if (task.activity && searchMatch(task.activity.code, searchTerm)) return true;
      if (task.workAreas?.some(wa =>
        searchMatch(wa.name, searchTerm) ||
        searchMatch(wa.level, searchTerm) ||
        searchMatch(wa.work_area, searchTerm)
      )) return true;
      return false;
    });
  }, [tasks, searchTerm]);

  // Alphabetical sorted tasks
  const alphabeticalTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [filteredTasks]);

  // Build activity-to-work-areas map
  const activityWorkAreasMap = useMemo(() => {
    const map = new Map<string, string[]>();
    workAreaLinks.forEach(link => {
      if (!map.has(link.activity_id)) {
        map.set(link.activity_id, []);
      }
      map.get(link.activity_id)!.push(link.work_area_id);
    });
    return map;
  }, [workAreaLinks]);

  // Activity dates map
  const activityDatesMap = useMemo(() => {
    const map = new Map<string, ActivityDateInfo>();
    activityDates.forEach(a => map.set(a.id, a));
    return map;
  }, [activityDates]);

  // Check if an activity falls within the selected date range
  const isActivityInDateRange = useCallback((activityId: string): boolean => {
    if (!dateFrom && !dateTo) return true;

    const dateInfo = activityDatesMap.get(activityId);
    if (!dateInfo) return !dateFrom && !dateTo; // No dates: show only if no filter

    const actStart = dateInfo.actual_start_date ? parseISO(dateInfo.actual_start_date) : null;
    const actEnd = dateInfo.actual_end_date ? parseISO(dateInfo.actual_end_date) : null;

    // If activity has no actual dates, include it only when no date filter
    if (!actStart && !actEnd) return !dateFrom && !dateTo;

    const filterFrom = dateFrom ? parseISO(dateFrom) : null;
    const filterTo = dateTo ? parseISO(dateTo) : null;

    // Check overlap: activity range overlaps with filter range
    if (filterFrom && filterTo) {
      const rangeStart = actStart || actEnd!;
      const rangeEnd = actEnd || actStart!;
      return rangeStart <= filterTo && rangeEnd >= filterFrom;
    }
    if (filterFrom) {
      const rangeEnd = actEnd || actStart!;
      return rangeEnd >= filterFrom;
    }
    if (filterTo) {
      const rangeStart = actStart || actEnd!;
      return rangeStart <= filterTo;
    }

    return true;
  }, [dateFrom, dateTo, activityDatesMap]);

  // Work area grouped tasks (with date filter)
  const workAreaGroups = useMemo(() => {
    const groups: WorkAreaWithTasks[] = [];
    const waMap = new Map(workAreas.map(wa => [wa.id, wa]));

    // For each work area, find activities linked to it, then tasks linked to those activities
    workAreas.forEach(wa => {
      const activityIds = workAreaLinks
        .filter(l => l.work_area_id === wa.id)
        .map(l => l.activity_id);

      // Filter activities by date range
      const filteredActivityIds = activityIds.filter(aid => isActivityInDateRange(aid));

      // Find tasks that belong to these activities
      const tasksInArea: TaskWithActivity[] = [];
      filteredTasks.forEach(task => {
        if (task.activity_id && filteredActivityIds.includes(task.activity_id)) {
          tasksInArea.push({
            task,
            activityId: task.activity_id,
            activityCode: task.activity?.code || '',
            activityName: task.activity?.name || '',
            phaseCode: task.activity?.phase_code || null,
          });
        }
      });

      if (tasksInArea.length > 0) {
        // Sort tasks alphabetically within each area
        tasksInArea.sort((a, b) => a.task.name.localeCompare(b.task.name, 'es'));
        groups.push({
          ...wa,
          tasks: tasksInArea,
        });
      }
    });

    // Sort areas: by level, then by name
    groups.sort((a, b) => {
      if (a.level !== b.level) return a.level.localeCompare(b.level, 'es');
      return a.name.localeCompare(b.name, 'es');
    });

    // Add "Sin área de trabajo" group for tasks with activities not linked to any work area
    const allLinkedActivityIds = new Set(workAreaLinks.map(l => l.activity_id));
    const unlinkedTasks: TaskWithActivity[] = [];
    filteredTasks.forEach(task => {
      if (task.activity_id && !allLinkedActivityIds.has(task.activity_id)) {
        if (isActivityInDateRange(task.activity_id)) {
          unlinkedTasks.push({
            task,
            activityId: task.activity_id,
            activityCode: task.activity?.code || '',
            activityName: task.activity?.name || '',
            phaseCode: task.activity?.phase_code || null,
          });
        }
      }
    });

    // Tasks without activity
    const noActivityTasks: TaskWithActivity[] = [];
    filteredTasks.forEach(task => {
      if (!task.activity_id) {
        noActivityTasks.push({
          task,
          activityId: '',
          activityCode: '',
          activityName: '',
          phaseCode: null,
        });
      }
    });

    if (unlinkedTasks.length > 0) {
      unlinkedTasks.sort((a, b) => a.task.name.localeCompare(b.task.name, 'es'));
      groups.push({
        id: '__no_area__',
        name: 'Sin área de trabajo',
        level: '',
        work_area: '',
        tasks: unlinkedTasks,
      });
    }

    if (noActivityTasks.length > 0) {
      noActivityTasks.sort((a, b) => a.task.name.localeCompare(b.task.name, 'es'));
      groups.push({
        id: '__no_activity__',
        name: 'Sin actividad asignada',
        level: '',
        work_area: '',
        tasks: noActivityTasks,
      });
    }

    return groups;
  }, [filteredTasks, workAreas, workAreaLinks, isActivityInDateRange]);

  // Initialize expanded groups
  useEffect(() => {
    if (expandedGroups.has('__all__') && workAreaGroups.length > 0) {
      const allKeys = workAreaGroups.map(g => g.id);
      setExpandedGroups(new Set(allKeys));
    }
  }, [workAreaGroups.length]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.delete('__all__');
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = workAreaGroups.map(g => g.id);
    setExpandedGroups(new Set(allKeys));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const getDateRange = (task: BudgetTask): string => {
    if (!task.start_date) return 'Sin fecha';
    const start = format(new Date(task.start_date), 'd MMM', { locale: es });
    if (task.duration_days <= 1) return start;
    const endDate = addDays(new Date(task.start_date), task.duration_days - 1);
    const end = format(endDate, 'd MMM', { locale: es });
    return `${start} - ${end}`;
  };

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
  };

  const totalTaskCount = subView === 'alphabetical'
    ? alphabeticalTasks.length
    : workAreaGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  // Render task row (shared between both views)
  const renderTaskRow = (task: BudgetTask, showActivity: boolean = true) => (
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
      {showActivity && (
        <TableCell>
          {task.activity ? (
            <Button
              variant="link"
              className="p-0 h-auto text-sm text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToActivity?.(task.activity!.id);
              }}
            >
              {formatActividadId({
                phaseCode: task.activity.phase_code,
                activityCode: task.activity.code,
                name: task.activity.name,
              })}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Sin actividad</span>
          )}
        </TableCell>
      )}
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
  );

  if (tasks.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center text-muted-foreground">
          No hay tareas registradas en este presupuesto
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-view toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Vista:</span>
          <Button
            variant={subView === 'alphabetical' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubView('alphabetical')}
            className="gap-1.5"
          >
            <List className="h-4 w-4" />
            Tareas Actividad
          </Button>
          <Button
            variant={subView === 'workarea' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubView('workarea')}
            className="gap-1.5"
          >
            <MapPin className="h-4 w-4" />
            Área trabajo
          </Button>
        </div>
        <Badge variant="outline">
          {totalTaskCount} {totalTaskCount === 1 ? 'tarea' : 'tareas'}
        </Badge>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por tarea, actividad, área de trabajo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
            onClick={() => setSearchTerm('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {searchTerm && (
        <div className="text-sm text-muted-foreground">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'resultado' : 'resultados'} para "{searchTerm}"
        </div>
      )}

      {/* === ALPHABETICAL VIEW === */}
      {subView === 'alphabetical' && (
        <Card>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>ActividadID</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead className="text-center">Días</TableHead>
                  <TableHead>Estado</TableHead>
                  {isAdmin && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {alphabeticalTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      No se encontraron tareas
                    </TableCell>
                  </TableRow>
                ) : (
                  alphabeticalTasks.map(task => renderTaskRow(task, true))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* === WORK AREA VIEW === */}
      {subView === 'workarea' && (
        <div className="space-y-3">
          {/* Date range filter */}
          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Filtro fechas reales:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Desde</span>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Hasta</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-40"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                    <X className="h-4 w-4 mr-1" />
                    Limpiar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Expand/Collapse controls */}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expandir todo
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Colapsar todo
            </Button>
          </div>

          {/* Work area groups */}
          {workAreaGroups.length === 0 ? (
            <Card>
              <div className="py-8 text-center text-muted-foreground">
                {dateFrom || dateTo
                  ? 'No hay tareas en el rango de fechas seleccionado'
                  : 'No hay tareas con áreas de trabajo asignadas'}
              </div>
            </Card>
          ) : (
            workAreaGroups.map(group => {
              const isExpanded = expandedGroups.has(group.id);

              return (
                <Collapsible
                  key={group.id}
                  open={isExpanded}
                  onOpenChange={() => toggleGroup(group.id)}
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
                        <span className="font-medium">
                          {group.level ? `${group.level} - ${group.name}` : group.name}
                        </span>
                        <Badge variant="outline" className="ml-2">
                          {group.tasks.length} {group.tasks.length === 1 ? 'tarea' : 'tareas'}
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
                              <TableHead>ActividadID</TableHead>
                              <TableHead>Fechas</TableHead>
                              <TableHead className="text-center">Días</TableHead>
                              <TableHead>Estado</TableHead>
                              {isAdmin && <TableHead className="w-10"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.tasks.map(({ task }) => renderTaskRow(task, true))}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
