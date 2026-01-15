import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CalendarDays, Clock, Plus, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { format, isSameDay, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isToday, addDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ManagementForm } from '@/components/crm/ManagementForm';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { AgendaDayView } from '@/components/agenda/AgendaDayView';
import { AgendaMonthView } from '@/components/agenda/AgendaMonthView';
import { toast } from 'sonner';

interface Management {
  id: string;
  title: string;
  description: string | null;
  management_type: string;
  status: string;
  target_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
}

interface BudgetTask {
  id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  task_status: string | null;
  budget_id: string | null;
  budget_name?: string | null;
  source: 'budget_tasks' | 'budget_activity_resources';
}

type ViewMode = 'month' | 'week' | 'day' | 'list';

export default function Agenda() {
  const navigate = useNavigate();
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const [managements, setManagements] = useState<Management[]>([]);
  const [budgetTasks, setBudgetTasks] = useState<BudgetTask[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedManagement, setSelectedManagement] = useState<Management | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('agenda-view-mode');
    return (saved === 'month' || saved === 'week' || saved === 'day' || saved === 'list') ? saved : 'week';
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchManagements = async () => {
    const { data, error } = await supabase
      .from('crm_managements')
      .select('*')
      .order('target_date', { ascending: true });

    if (!error && data) {
      setManagements(data);
    }
  };

  const fetchBudgetTasks = useCallback(async () => {
    // Fetch from new budget_tasks table
    const { data: tasksData, error: tasksError } = await supabase
      .from('budget_tasks')
      .select(`
        id,
        name,
        description,
        target_date,
        start_date,
        start_time,
        end_time,
        status,
        budget_id
      `)
      .eq('status', 'pendiente')
      .order('target_date', { ascending: true });

    if (tasksError) {
      console.error('Error fetching budget_tasks:', tasksError);
    }

    // Fetch from budget_activity_resources (Tarea type)
    const { data: resourceTasks, error: resourceError } = await supabase
      .from('budget_activity_resources')
      .select(`
        id,
        name,
        description,
        start_date,
        task_status,
        budget_id
      `)
      .eq('resource_type', 'Tarea')
      .eq('task_status', 'pendiente')
      .order('start_date', { ascending: true });

    if (resourceError) {
      console.error('Error fetching resource tasks:', resourceError);
    }

    const allTasks: BudgetTask[] = [];

    // Process budget_tasks
    for (const task of tasksData || []) {
      let budgetName = null;
      if (task.budget_id) {
        const { data: budget } = await supabase
          .from('presupuestos')
          .select('nombre')
          .eq('id', task.budget_id)
          .single();
        budgetName = budget?.nombre;
      }
      allTasks.push({
        ...task,
        task_status: null,
        budget_name: budgetName,
        source: 'budget_tasks'
      });
    }

    // Process resource tasks
    for (const task of resourceTasks || []) {
      let budgetName = null;
      if (task.budget_id) {
        const { data: budget } = await supabase
          .from('presupuestos')
          .select('nombre')
          .eq('id', task.budget_id)
          .single();
        budgetName = budget?.nombre;
      }
      allTasks.push({
        id: task.id,
        name: task.name,
        description: task.description,
        target_date: task.start_date,
        start_date: task.start_date,
        start_time: null,
        end_time: null,
        status: 'pendiente',
        task_status: task.task_status,
        budget_id: task.budget_id,
        budget_name: budgetName,
        source: 'budget_activity_resources'
      });
    }

    setBudgetTasks(allTasks);
  }, []);

  useEffect(() => {
    if (user) {
      Promise.all([fetchManagements(), fetchBudgetTasks()]).finally(() => {
        setIsLoading(false);
      });
    }
  }, [user, fetchBudgetTasks]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('agenda-view-mode', mode);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Reunión': return '🤝';
      case 'Llamada': return '📞';
      case 'Email': return '📧';
      case 'Visita': return '🏠';
      case 'Tarea': return '✅';
      default: return '📋';
    }
  };

  const getStatusVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (status) {
      case 'Completado': return 'default';
      case 'En progreso': return 'secondary';
      case 'Pendiente': return 'outline';
      case 'Cancelado': return 'destructive';
      default: return 'secondary';
    }
  };

  // Get week days
  const weekDays = useMemo(() => {
    const end = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: currentWeekStart, end });
  }, [currentWeekStart]);

  // Get managements grouped by day for week view
  const weekManagements = useMemo(() => {
    const grouped: Record<string, Management[]> = {};
    weekDays.forEach(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      grouped[dateKey] = managements.filter(m => 
        m.target_date && isSameDay(new Date(m.target_date), day)
      );
    });
    return grouped;
  }, [managements, weekDays]);

  // Get budget tasks grouped by day for week view
  const weekTasks = useMemo(() => {
    const grouped: Record<string, BudgetTask[]> = {};
    weekDays.forEach(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      grouped[dateKey] = budgetTasks.filter(t => {
        const taskDate = t.target_date || t.start_date;
        return taskDate && isSameDay(new Date(taskDate), day);
      });
    });
    return grouped;
  }, [budgetTasks, weekDays]);

  // Get dates that have managements or tasks
  const datesWithEvents = useMemo(() => {
    const managementDates = managements
      .filter(m => m.target_date)
      .map(m => new Date(m.target_date!));
    const taskDates = budgetTasks
      .filter(t => t.target_date || t.start_date)
      .map(t => new Date((t.target_date || t.start_date)!));
    return [...managementDates, ...taskDates];
  }, [managements, budgetTasks]);

  // Handle task toggle status
  const handleTaskToggle = async (task: BudgetTask) => {
    try {
      if (task.source === 'budget_tasks') {
        await supabase
          .from('budget_tasks')
          .update({ status: 'realizada' })
          .eq('id', task.id);
      } else {
        await supabase
          .from('budget_activity_resources')
          .update({ task_status: 'realizada' })
          .eq('id', task.id);
      }
      toast.success('Tarea completada');
      fetchBudgetTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Error al actualizar la tarea');
    }
  };

  // Navigate to task in budget
  const handleTaskClick = (task: BudgetTask) => {
    if (task.budget_id) {
      navigate(`/presupuestos/${task.budget_id}?tab=agenda&task=${task.id}`);
    }
  };

  const canEdit = isAdmin();

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setSelectedDate(new Date());
    setCurrentMonth(startOfMonth(new Date()));
  };

  const handleEventClick = (management: Management) => {
    setSelectedManagement(management);
    setFormOpen(true);
  };

  const handleDaySelectFromMonth = (date: Date) => {
    setSelectedDate(date);
    setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    handleViewModeChange('day');
  };

  if (loading || rolesLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <AppNavDropdown />
            <div className="p-2 rounded-lg bg-primary/10">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Agenda</h1>
              <p className="text-sm text-muted-foreground">
                Calendario y programación
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-lg">
              <Button
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('month')}
                className="rounded-r-none"
              >
                Mes
              </Button>
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('week')}
                className="rounded-none border-x"
              >
                Semana
              </Button>
              <Button
                variant={viewMode === 'day' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('day')}
                className="rounded-none border-r"
              >
                Día
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
                className="rounded-l-none"
              >
                Lista
              </Button>
            </div>
            {canEdit && (
              <Button onClick={() => { setSelectedManagement(null); setFormOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nueva Cita</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {viewMode === 'month' && (
          <AgendaMonthView
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            onDaySelect={handleDaySelectFromMonth}
            managements={managements}
            getTypeIcon={getTypeIcon}
          />
        )}

        {viewMode === 'week' && (
          <div className="space-y-4">
            {/* Week Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={goToNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Hoy
                </Button>
              </div>
              <h2 className="text-xl font-semibold">
                {format(currentWeekStart, "d 'de' MMMM", { locale: es })} - {format(addDays(currentWeekStart, 6), "d 'de' MMMM 'de' yyyy", { locale: es })}
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {managements.filter(m => m.target_date && weekDays.some(day => isSameDay(new Date(m.target_date!), day))).length} citas
                </Badge>
                <Badge variant="secondary">
                  {budgetTasks.filter(t => (t.target_date || t.start_date) && weekDays.some(day => isSameDay(new Date((t.target_date || t.start_date)!), day))).length} tareas
                </Badge>
              </div>
            </div>

            {/* Week Grid */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayManagements = weekManagements[dateKey] || [];
                const dayTasks = weekTasks[dateKey] || [];
                const isCurrentDay = isToday(day);
                const totalItems = dayManagements.length + dayTasks.length;
                
                return (
                  <Card 
                    key={dateKey}
                    className={`min-h-[200px] cursor-pointer transition-all hover:shadow-md ${isCurrentDay ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => {
                      setSelectedDate(day);
                      handleViewModeChange('day');
                    }}
                  >
                    <div className="pb-2 px-3 pt-3">
                      <div className={`text-center ${isCurrentDay ? 'text-primary font-bold' : ''}`}>
                        <p className="text-xs text-muted-foreground uppercase">
                          {format(day, 'EEE', { locale: es })}
                        </p>
                        <p className={`text-lg font-semibold ${isCurrentDay ? 'bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}`}>
                          {format(day, 'd')}
                        </p>
                      </div>
                    </div>
                    <div className="px-2 pb-2 space-y-1">
                      {/* Show managements */}
                      {dayManagements.slice(0, 2).map((m) => (
                        <div 
                          key={m.id}
                          className="text-xs p-1.5 rounded bg-muted/50 truncate"
                          title={m.title}
                        >
                          <span className="mr-1">{getTypeIcon(m.management_type)}</span>
                          {m.start_time && <span className="text-muted-foreground">{m.start_time.slice(0, 5)} </span>}
                          {m.title}
                        </div>
                      ))}
                      {/* Show budget tasks */}
                      {dayTasks.slice(0, 2 - Math.min(dayManagements.length, 2)).map((t) => (
                        <div 
                          key={t.id}
                          className="text-xs p-1.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 truncate border-l-2 border-blue-500"
                          title={`${t.name}${t.budget_name ? ` - ${t.budget_name}` : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTaskClick(t);
                          }}
                        >
                          <span className="mr-1">📋</span>
                          {t.start_time && <span className="opacity-70">{t.start_time.slice(0, 5)} </span>}
                          {t.name}
                        </div>
                      ))}
                      {totalItems > 2 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{totalItems - 2} más
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'day' && (
          <AgendaDayView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            managements={managements}
            datesWithEvents={datesWithEvents}
            canEdit={canEdit}
            onAddEvent={() => { setSelectedManagement(null); setFormOpen(true); }}
            onEventClick={handleEventClick}
            getTypeIcon={getTypeIcon}
            getStatusVariant={getStatusVariant}
          />
        )}

        {viewMode === 'list' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Próximos eventos y tareas</h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {managements.filter(m => m.target_date && new Date(m.target_date) >= new Date()).length} citas
                </Badge>
                <Badge variant="secondary">
                  {budgetTasks.filter(t => (t.target_date || t.start_date) && new Date((t.target_date || t.start_date)!) >= new Date()).length} tareas
                </Badge>
              </div>
            </div>
            
            {/* Budget Tasks Section */}
            {budgetTasks.filter(t => (t.target_date || t.start_date) && new Date((t.target_date || t.start_date)!) >= new Date()).length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                  Tareas de Presupuestos
                </h3>
                <Card>
                  <CardContent className="divide-y p-0">
                    {budgetTasks
                      .filter(t => (t.target_date || t.start_date) && new Date((t.target_date || t.start_date)!) >= new Date())
                      .sort((a, b) => {
                        const dateA = new Date((a.target_date || a.start_date)!);
                        const dateB = new Date((b.target_date || b.start_date)!);
                        return dateA.getTime() - dateB.getTime();
                      })
                      .map((task) => (
                        <div 
                          key={task.id}
                          className="flex items-center gap-4 py-4 hover:bg-muted/50 cursor-pointer transition-colors px-6"
                          onClick={() => handleTaskClick(task)}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaskToggle(task);
                            }}
                          >
                            <CheckCircle2 className="h-5 w-5 text-muted-foreground hover:text-green-500" />
                          </Button>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{task.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(task.target_date || task.start_date) && format(new Date((task.target_date || task.start_date)!), "EEEE, d 'de' MMMM", { locale: es })}
                              {task.start_time && ` · ${task.start_time.slice(0, 5)}`}
                              {task.budget_name && ` · 📁 ${task.budget_name}`}
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            Pendiente
                          </Badge>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Managements Section */}
            <div>
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Citas y Gestiones
              </h3>
              {managements
                .filter(m => m.target_date && new Date(m.target_date) >= new Date())
                .length === 0 ? (
                <Card className="py-12">
                  <CardContent className="text-center">
                    <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No hay citas próximas</p>
                    {canEdit && (
                      <Button variant="outline" onClick={() => { setSelectedManagement(null); setFormOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Añadir cita
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="divide-y p-0">
                    {managements
                      .filter(m => m.target_date && new Date(m.target_date) >= new Date())
                      .map((management) => (
                        <div 
                          key={management.id}
                          className="flex items-center gap-4 py-4 hover:bg-muted/50 cursor-pointer transition-colors px-6"
                          onClick={() => handleEventClick(management)}
                        >
                          <span className="text-2xl">{getTypeIcon(management.management_type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{management.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {management.target_date && format(new Date(management.target_date), "EEEE, d 'de' MMMM", { locale: es })}
                              {management.start_time && ` · ${management.start_time.slice(0, 5)}`}
                            </p>
                          </div>
                          <Badge variant={getStatusVariant(management.status)}>
                            {management.status}
                          </Badge>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Form */}
      <ManagementForm
        open={formOpen}
        onOpenChange={setFormOpen}
        management={selectedManagement}
        onSuccess={fetchManagements}
      />
    </div>
  );
}
