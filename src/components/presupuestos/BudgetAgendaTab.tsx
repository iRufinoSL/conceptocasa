import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { TaskForm } from './TaskForm';
import { TaskCard } from './TaskCard';
import { TaskListView } from './TaskListView';

export interface BudgetTask {
  id: string;
  activity_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  duration_days: number;
  status: 'pendiente' | 'realizada';
  created_at: string;
  updated_at: string;
  activity?: {
    id: string;
    name: string;
    code: string;
  };
  contacts?: {
    id: string;
    contact_id: string;
    contact?: {
      id: string;
      name: string;
      surname: string | null;
    };
  }[];
  images?: {
    id: string;
    file_name: string;
    file_path: string;
  }[];
}

interface BudgetAgendaTabProps {
  budgetId: string;
  isAdmin: boolean;
}

type ViewMode = 'month' | 'week' | 'day' | 'list';
type FilterMode = 'all' | 'pendiente' | 'realizada';

export function BudgetAgendaTab({ budgetId, isAdmin }: BudgetAgendaTabProps) {
  const [tasks, setTasks] = useState<BudgetTask[]>([]);
  const [activities, setActivities] = useState<{ id: string; name: string; code: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<BudgetTask | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('budget_activities')
      .select('id, name, code')
      .eq('budget_id', budgetId)
      .order('code');

    if (error) {
      console.error('Error fetching activities:', error);
      return;
    }

    setActivities(data || []);
  }, [budgetId]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      // First get all activity IDs for this budget
      const { data: activityIds, error: activityError } = await supabase
        .from('budget_activities')
        .select('id')
        .eq('budget_id', budgetId);

      if (activityError) throw activityError;

      if (!activityIds || activityIds.length === 0) {
        setTasks([]);
        setIsLoading(false);
        return;
      }

      const ids = activityIds.map(a => a.id);

      // Fetch tasks for these activities
      const { data: tasksData, error: tasksError } = await supabase
        .from('budget_tasks')
        .select(`
          *,
          activity:budget_activities(id, name, code),
          contacts:budget_task_contacts(
            id,
            contact_id,
            contact:crm_contacts(id, name, surname)
          ),
          images:budget_task_images(id, file_name, file_path)
        `)
        .in('activity_id', ids)
        .order('start_date', { ascending: true, nullsFirst: false });

      if (tasksError) throw tasksError;

      setTasks(tasksData as BudgetTask[] || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Error al cargar las tareas');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchActivities();
    fetchTasks();
  }, [fetchActivities, fetchTasks]);

  const filteredTasks = tasks.filter(task => {
    if (filterMode === 'all') return true;
    return task.status === filterMode;
  });

  const getTasksForDate = (date: Date) => {
    return filteredTasks.filter(task => {
      if (!task.start_date) return false;
      const taskStart = new Date(task.start_date);
      const taskEnd = addDays(taskStart, (task.duration_days || 1) - 1);
      return date >= taskStart && date <= taskEnd;
    });
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (task: BudgetTask) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('budget_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      toast.success('Tarea eliminada');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Error al eliminar la tarea');
    }
  };

  const handleToggleStatus = async (task: BudgetTask) => {
    const newStatus = task.status === 'pendiente' ? 'realizada' : 'pendiente';
    try {
      const { error } = await supabase
        .from('budget_tasks')
        .update({ status: newStatus })
        .eq('id', task.id);

      if (error) throw error;

      toast.success(newStatus === 'realizada' ? 'Tarea completada' : 'Tarea reabierta');
      fetchTasks();
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Error al actualizar el estado');
    }
  };

  const handleTaskSaved = () => {
    setShowTaskForm(false);
    setEditingTask(null);
    fetchTasks();
  };

  const navigatePrevious = () => {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (viewMode === 'day') {
      setCurrentDate(subDays(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (viewMode === 'day') {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const dayTasks = getTasksForDate(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            
            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={`
                  min-h-[80px] p-1 border rounded-lg cursor-pointer transition-colors
                  ${!isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-card'}
                  ${isToday(day) ? 'border-primary' : 'border-border'}
                  ${isSelected ? 'ring-2 ring-primary' : ''}
                  hover:bg-accent/50
                `}
              >
                <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(task => (
                    <div
                      key={task.id}
                      className={`text-[10px] px-1 py-0.5 rounded truncate ${
                        task.status === 'realizada' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-primary/10 text-primary'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTask(task);
                      }}
                    >
                      {task.name}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{dayTasks.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dayTasks = getTasksForDate(day);
          
          return (
            <div
              key={day.toISOString()}
              className={`
                min-h-[200px] p-2 border rounded-lg
                ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border'}
              `}
            >
              <div className={`text-sm font-medium mb-2 ${isToday(day) ? 'text-primary' : ''}`}>
                {format(day, 'EEE d', { locale: es })}
              </div>
              <div className="space-y-1">
                {dayTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    compact
                    onEdit={() => handleEditTask(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onToggleStatus={() => handleToggleStatus(task)}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDayView = () => {
    const dayTasks = getTasksForDate(currentDate);

    return (
      <div className="space-y-4">
        <div className={`text-lg font-medium ${isToday(currentDate) ? 'text-primary' : ''}`}>
          {format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>
        {dayTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay tareas para este día
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dayTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => handleEditTask(task)}
                onDelete={() => handleDeleteTask(task.id)}
                onToggleStatus={() => handleToggleStatus(task)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const getDateRangeLabel = () => {
    if (viewMode === 'month') {
      return format(currentDate, "MMMM 'de' yyyy", { locale: es });
    } else if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, 'd MMM', { locale: es })} - ${format(weekEnd, 'd MMM yyyy', { locale: es })}`;
    } else if (viewMode === 'day') {
      return format(currentDate, "d 'de' MMMM 'de' yyyy", { locale: es });
    }
    return '';
  };

  const pendingCount = tasks.filter(t => t.status === 'pendiente').length;
  const completedCount = tasks.filter(t => t.status === 'realizada').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Agenda de Tareas</h2>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              {pendingCount} pendientes
            </Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              {completedCount} realizadas
            </Badge>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={handleAddTask} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        )}
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="month" className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Mes
            </TabsTrigger>
            <TabsTrigger value="week" className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Semana
            </TabsTrigger>
            <TabsTrigger value="day" className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Día
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-1.5">
              <List className="h-4 w-4" />
              Listado
            </TabsTrigger>
          </TabsList>

          {viewMode !== 'list' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={navigatePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoy
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center">
                {getDateRangeLabel()}
              </span>
              <Button variant="outline" size="icon" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {viewMode === 'list' && (
            <div className="flex items-center gap-2">
              <Button
                variant={filterMode === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('all')}
              >
                Todas
              </Button>
              <Button
                variant={filterMode === 'pendiente' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('pendiente')}
              >
                Pendientes
              </Button>
              <Button
                variant={filterMode === 'realizada' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('realizada')}
              >
                Realizadas
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="month" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {renderMonthView()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="week" className="mt-4">
          {renderWeekView()}
        </TabsContent>

        <TabsContent value="day" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {renderDayView()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <TaskListView
            tasks={filteredTasks}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
            onToggleStatus={handleToggleStatus}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>

      {/* Selected Day Panel */}
      {selectedDay && viewMode === 'month' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {format(selectedDay, "EEEE, d 'de' MMMM", { locale: es })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getTasksForDate(selectedDay).length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tareas para este día</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getTasksForDate(selectedDay).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={() => handleEditTask(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onToggleStatus={() => handleToggleStatus(task)}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Task Form Dialog */}
      {showTaskForm && (
        <TaskForm
          budgetId={budgetId}
          activities={activities}
          task={editingTask}
          open={showTaskForm}
          onClose={() => {
            setShowTaskForm(false);
            setEditingTask(null);
          }}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}
