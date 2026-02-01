import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, List, ChevronLeft, ChevronRight, FileText, BarChart3, ClipboardList, CalendarClock, Hammer, ShoppingCart } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { TaskForm, type EntryType } from './TaskForm';
import { TaskCard } from './TaskCard';
import { TaskListView } from './TaskListView';
import { exportTasksPdf } from './TasksPdfExport';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { BudgetGanttView } from './BudgetGanttView';
import { ResourcesGestionesView } from './ResourcesGestionesView';
import { WorkReportsList } from './WorkReportsList';
import { BuyingListUnified } from './BuyingListUnified';
import { BudgetResourceForm } from './BudgetResourceForm';

// A Task is a resource with resource_type = 'Tarea' or 'Cita'
export interface BudgetTask {
  id: string;
  budget_id: string;
  activity_id: string | null;
  name: string;
  description: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_days: number;
  task_status: 'pendiente' | 'realizada';
  resource_type: 'Tarea' | 'Cita';
  created_at: string;
  updated_at: string;
  activity?: {
    id: string;
    name: string;
    code: string;
    phase_code?: string | null;
  } | null;
  workAreas?: {
    id: string;
    name: string;
    level: string;
    work_area: string;
  }[];
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
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  onBudgetDatesChange?: (startDate: string, endDate: string) => void;
  onNavigateToPhases?: (phaseId?: string) => void;
  onNavigateToActivity?: (activityId: string) => void;
}

type MainViewMode = 'agenda' | 'gantt' | 'gestiones' | 'partes' | 'listacompra';
type ViewMode = 'month' | 'week' | 'day' | 'list';
type FilterMode = 'all' | 'pendiente' | 'realizada';

export function BudgetAgendaTab({ budgetId, isAdmin, budgetStartDate, budgetEndDate, onBudgetDatesChange, onNavigateToPhases, onNavigateToActivity }: BudgetAgendaTabProps) {
  const [tasks, setTasks] = useState<BudgetTask[]>([]);
  const [activities, setActivities] = useState<{ id: string; name: string; code: string; phase_code?: string | null }[]>([]);
  const [budgetName, setBudgetName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [mainViewMode, setMainViewMode] = useState<MainViewMode>('agenda');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<BudgetTask | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [newEntryType, setNewEntryType] = useState<EntryType>('Tarea');
  const { settings: companySettings } = useCompanySettings();
  
  // State for Buying List view
  const [buyingPhases, setBuyingPhases] = useState<any[]>([]);
  const [buyingActivities, setBuyingActivities] = useState<any[]>([]);
  const [buyingResources, setBuyingResources] = useState<any[]>([]);
  
  // State for editing a resource from buying list
  const [editingResource, setEditingResource] = useState<any | null>(null);

  // Fetch budget name
  const fetchBudgetName = useCallback(async () => {
    const { data } = await supabase
      .from('presupuestos')
      .select('nombre')
      .eq('id', budgetId)
      .single();
    
    if (data) {
      setBudgetName(data.nombre);
    }
  }, [budgetId]);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('budget_activities')
      .select('id, name, code, phase_id, budget_phases(code)')
      .eq('budget_id', budgetId)
      .order('code');

    if (error) {
      console.error('Error fetching activities:', error);
      return;
    }

    const mapped = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      phase_code: a.budget_phases?.code || null,
    }));

    setActivities(mapped);
  }, [budgetId]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch resources with type 'Tarea' or 'Cita' for this budget
      const [tasksRes, workAreasRes, workAreaLinksRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select(`
            id,
            budget_id,
            activity_id,
            name,
            description,
            start_date,
            start_time,
            end_time,
            duration_days,
            task_status,
            resource_type,
            created_at,
            updated_at
          `)
          .eq('budget_id', budgetId)
          .in('resource_type', ['Tarea', 'Cita'])
          .order('start_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('budget_work_areas')
          .select('id, name, level, work_area')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_work_area_activities')
          .select('work_area_id, activity_id')
      ]);

      if (tasksRes.error) throw tasksRes.error;

      const tasksData = tasksRes.data || [];
      const workAreasData = workAreasRes.data || [];
      const workAreaLinksData = workAreaLinksRes.data || [];

      // Build work area map
      const workAreaMap = new Map(workAreasData.map(wa => [wa.id, wa]));
      
      // Build activity to work areas map
      const activityWorkAreasMap = new Map<string, string[]>();
      workAreaLinksData.forEach(link => {
        if (!activityWorkAreasMap.has(link.activity_id)) {
          activityWorkAreasMap.set(link.activity_id, []);
        }
        activityWorkAreasMap.get(link.activity_id)!.push(link.work_area_id);
      });

      // Get additional data for each task (activity, contacts, images)
      const tasksWithRelations: BudgetTask[] = [];

      for (const task of tasksData) {
        // Fetch activity info if linked
        let activity = null;
        let workAreas: { id: string; name: string; level: string; work_area: string }[] = [];

        if (task.activity_id) {
          const { data: activityData } = await supabase
            .from('budget_activities')
            .select('id, name, code, phase_id, budget_phases(code)')
            .eq('id', task.activity_id)
            .single();

          activity = activityData
            ? {
                id: activityData.id,
                name: activityData.name,
                code: activityData.code,
                phase_code: (activityData as any).budget_phases?.code || null,
              }
            : null;

          // Get work areas for this activity
          const workAreaIds = activityWorkAreasMap.get(task.activity_id) || [];
          workAreas = workAreaIds
            .map(id => workAreaMap.get(id))
            .filter((wa): wa is { id: string; name: string; level: string; work_area: string } => wa !== undefined);
        }

        // Fetch contacts
        const { data: contactsData } = await supabase
          .from('budget_resource_contacts')
          .select(`
            id,
            contact_id,
            contact:crm_contacts(id, name, surname)
          `)
          .eq('resource_id', task.id);

        // Fetch images
        const { data: imagesData } = await supabase
          .from('budget_resource_images')
          .select('id, file_name, file_path')
          .eq('resource_id', task.id);

        tasksWithRelations.push({
          ...task,
          duration_days: task.duration_days || 1,
          start_time: task.start_time || null,
          end_time: task.end_time || null,
          task_status: (task.task_status as 'pendiente' | 'realizada') || 'pendiente',
          resource_type: (task.resource_type as 'Tarea' | 'Cita') || 'Tarea',
          activity,
          workAreas,
          contacts: contactsData || [],
          images: imagesData || [],
        });
      }

      setTasks(tasksWithRelations);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Error al cargar las tareas');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  // Fetch data for Buying List view
  const fetchBuyingListData = useCallback(async () => {
    try {
      const [phasesRes, activitiesRes, resourcesRes, contactsRes] = await Promise.all([
        supabase
          .from('budget_phases')
          .select('id, name, code, actual_start_date, actual_end_date')
          .eq('budget_id', budgetId)
          .order('code'),
        supabase
          .from('budget_activities')
          .select('id, name, code, phase_id, uses_measurement, actual_start_date, actual_end_date')
          .eq('budget_id', budgetId)
          .order('code'),
        supabase
          .from('budget_activity_resources')
          .select(`
            id,
            name,
            activity_id,
            resource_type,
            external_unit_cost,
            manual_units,
            related_units,
            unit,
            supplier_id,
            purchase_unit,
            purchase_unit_quantity,
            purchase_unit_cost,
            conversion_factor
          `)
          .eq('budget_id', budgetId)
          .not('resource_type', 'in', '("Tarea","Cita")'),
        supabase
          .from('crm_contacts')
          .select('id, name')
      ]);

      if (phasesRes.error) throw phasesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (resourcesRes.error) throw resourcesRes.error;

      // Map supplier names to resources
      const contactMap = new Map((contactsRes.data || []).map(c => [c.id, c.name]));
      const resourcesWithSupplier = (resourcesRes.data || []).map(r => ({
        ...r,
        supplier_name: r.supplier_id ? contactMap.get(r.supplier_id) || null : null
      }));

      setBuyingPhases(phasesRes.data || []);
      setBuyingActivities(activitiesRes.data || []);
      setBuyingResources(resourcesWithSupplier);
    } catch (error) {
      console.error('Error fetching buying list data:', error);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchActivities();
    fetchTasks();
    fetchBudgetName();
  }, [fetchActivities, fetchTasks, fetchBudgetName]);

  // Fetch buying list data when switching to that view
  useEffect(() => {
    if (mainViewMode === 'listacompra') {
      fetchBuyingListData();
    }
  }, [mainViewMode, fetchBuyingListData]);

  // Calculate end date from start date and duration
  const getEndDate = (startDate: string, durationDays: number): Date => {
    return addDays(new Date(startDate), durationDays - 1);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterMode === 'all') return true;
      return task.task_status === filterMode;
    });
  }, [tasks, filterMode]);

  // For calendar views: only tasks with dates
  const tasksWithDates = useMemo(() => {
    return filteredTasks.filter(task => task.start_date);
  }, [filteredTasks]);

  const getTasksForDate = useCallback((date: Date) => {
    return tasksWithDates.filter(task => {
      if (!task.start_date) return false;
      const taskStart = new Date(task.start_date);
      const taskEnd = getEndDate(task.start_date, task.duration_days);
      return date >= taskStart && date <= taskEnd;
    });
  }, [tasksWithDates]);

  const handleAddTask = () => {
    setNewEntryType('Tarea');
    setEditingTask(null);
    setShowTaskForm(true);
  };

  const handleAddCita = () => {
    setNewEntryType('Cita');
    setEditingTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (task: BudgetTask) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      // Delete related contacts and images first
      await supabase
        .from('budget_resource_contacts')
        .delete()
        .eq('resource_id', taskId);

      await supabase
        .from('budget_resource_images')
        .delete()
        .eq('resource_id', taskId);

      // Delete the task (resource)
      const { error } = await supabase
        .from('budget_activity_resources')
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
    const newStatus = task.task_status === 'pendiente' ? 'realizada' : 'pendiente';
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ task_status: newStatus })
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
                      className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer ${
                        task.task_status === 'realizada' 
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

  const pendingCount = tasks.filter(t => t.task_status === 'pendiente').length;
  const completedCount = tasks.filter(t => t.task_status === 'realizada').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main View Toggle - Agenda vs Gantt */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Tabs value={mainViewMode} onValueChange={(v) => setMainViewMode(v as MainViewMode)} className="w-auto">
            <TabsList>
              <TabsTrigger value="agenda" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Agenda
              </TabsTrigger>
              <TabsTrigger value="gantt" className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Gantt
              </TabsTrigger>
              <TabsTrigger value="gestiones" className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Gestiones
              </TabsTrigger>
              <TabsTrigger value="partes" className="flex items-center gap-1.5">
                <Hammer className="h-4 w-4" />
                Partes
              </TabsTrigger>
              <TabsTrigger value="listacompra" className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" />
                Lista compra
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {mainViewMode === 'agenda' && (
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-secondary text-primary border-primary/20">
                {pendingCount} pendientes
              </Badge>
              <Badge variant="outline" className="bg-secondary text-muted-foreground border-border">
                {completedCount} realizadas
              </Badge>
            </div>
          )}
        </div>
        
        {mainViewMode === 'agenda' && (
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => exportTasksPdf(filteredTasks, budgetName || 'Presupuesto', companySettings)}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Informe PDF
              </Button>
            )}
            {isAdmin && (
              <>
                <Button onClick={handleAddCita} variant="outline" className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Nueva Cita
                </Button>
                <Button onClick={handleAddTask} className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Nueva Tarea
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Gantt View */}
      {mainViewMode === 'gantt' && (
        <BudgetGanttView
          budgetId={budgetId}
          budgetStartDate={budgetStartDate || null}
          budgetEndDate={budgetEndDate || null}
          onBudgetDatesChange={onBudgetDatesChange}
          onPhaseClick={(phase) => {
            if (onNavigateToPhases) {
              onNavigateToPhases(phase.id);
            } else {
              toast.info('Vaya a la pestaña "Fases" para editar esta fase');
            }
          }}
        />
      )}

      {/* Gestiones View */}
      {mainViewMode === 'gestiones' && (
        <Card>
          <CardContent className="pt-6">
            <ResourcesGestionesView
              budgetId={budgetId}
              budgetName={budgetName}
              isAdmin={isAdmin}
              onEditActivity={onNavigateToActivity}
              onEditTask={(taskId) => {
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                  handleEditTask(task);
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Partes de Trabajo View */}
      {mainViewMode === 'partes' && (
        <Card>
          <CardContent className="pt-6">
            <WorkReportsList budgetId={budgetId} isAdmin={isAdmin} />
          </CardContent>
        </Card>
      )}

      {/* Lista Compra View */}
      {mainViewMode === 'listacompra' && (
        <Card>
          <CardContent className="pt-6">
            <BuyingListUnified
              budgetId={budgetId}
              phases={buyingPhases}
              activities={buyingActivities}
              resources={buyingResources}
              onEditResource={(resource) => {
                // Find full resource from buyingResources
                const fullResource = buyingResources.find(r => r.id === resource.id);
                if (fullResource) {
                  setEditingResource(fullResource);
                }
              }}
              onRefresh={fetchBuyingListData}
            />
          </CardContent>
        </Card>
      )}

      {/* Resource Edit Form (for Buying List) */}
      <BudgetResourceForm
        open={!!editingResource}
        onOpenChange={(open) => !open && setEditingResource(null)}
        budgetId={budgetId}
        resource={editingResource}
        activities={buyingActivities}
        phases={buyingPhases}
        onSave={() => {
          setEditingResource(null);
          fetchBuyingListData();
        }}
      />

      {/* Agenda View */}
      {mainViewMode === 'agenda' && (
        <>
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

          {/* Task Form Dialog */}
          <TaskForm
            open={showTaskForm}
            onOpenChange={setShowTaskForm}
            budgetId={budgetId}
            activities={activities}
            task={editingTask}
            onSuccess={handleTaskSaved}
            initialType={newEntryType}
          />
        </>
      )}
    </div>
  );
}
