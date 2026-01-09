import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CalendarDays, Clock, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isSameDay, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isToday, addDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ManagementForm } from '@/components/crm/ManagementForm';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { AgendaDayView } from '@/components/agenda/AgendaDayView';
import { AgendaMonthView } from '@/components/agenda/AgendaMonthView';

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

type ViewMode = 'month' | 'week' | 'day' | 'list';

export default function Agenda() {
  const navigate = useNavigate();
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const [managements, setManagements] = useState<Management[]>([]);
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
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchManagements();
    }
  }, [user]);

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

  // Get dates that have managements
  const datesWithEvents = managements
    .filter(m => m.target_date)
    .map(m => new Date(m.target_date!));

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
              <Badge variant="outline">
                {managements.filter(m => m.target_date && weekDays.some(day => isSameDay(new Date(m.target_date!), day))).length} eventos esta semana
              </Badge>
            </div>

            {/* Week Grid */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayManagements = weekManagements[dateKey] || [];
                const isCurrentDay = isToday(day);
                
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
                      {dayManagements.slice(0, 3).map((m) => (
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
                      {dayManagements.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{dayManagements.length - 3} más
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Próximos eventos</h2>
              <Badge variant="outline">
                {managements.filter(m => m.target_date && new Date(m.target_date) >= new Date()).length} eventos
              </Badge>
            </div>
            
            {managements
              .filter(m => m.target_date && new Date(m.target_date) >= new Date())
              .length === 0 ? (
              <Card className="py-12">
                <CardContent className="text-center">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No hay eventos próximos</p>
                  {canEdit && (
                    <Button variant="outline" onClick={() => { setSelectedManagement(null); setFormOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Añadir evento
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y">
                  {managements
                    .filter(m => m.target_date && new Date(m.target_date) >= new Date())
                    .map((management) => (
                      <div 
                        key={management.id}
                        className="flex items-center gap-4 py-4 hover:bg-muted/50 cursor-pointer transition-colors -mx-6 px-6"
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
