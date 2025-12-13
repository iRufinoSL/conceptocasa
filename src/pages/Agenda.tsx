import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, CalendarDays, Clock, Plus } from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ManagementForm } from '@/components/crm/ManagementForm';

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

export default function Agenda() {
  const navigate = useNavigate();
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const [managements, setManagements] = useState<Management[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Completado': return 'default';
      case 'En progreso': return 'secondary';
      case 'Pendiente': return 'outline';
      case 'Cancelado': return 'destructive';
      default: return 'secondary';
    }
  };

  // Get managements for selected date
  const selectedDateManagements = managements.filter(m => 
    m.target_date && isSameDay(new Date(m.target_date), selectedDate)
  );

  // Get dates that have managements
  const datesWithEvents = managements
    .filter(m => m.target_date)
    .map(m => new Date(m.target_date!));

  const canEdit = isAdmin();

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
          {canEdit && (
            <Button onClick={() => setFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Cita</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[350px_1fr]">
          {/* Calendar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Calendario</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={es}
                className="rounded-md pointer-events-auto"
                modifiers={{
                  hasEvent: datesWithEvents
                }}
                modifiersStyles={{
                  hasEvent: {
                    fontWeight: 'bold',
                    textDecoration: 'underline',
                    textDecorationColor: 'hsl(var(--primary))',
                    textUnderlineOffset: '4px'
                  }
                }}
              />
            </CardContent>
          </Card>

          {/* Day View */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
              </h2>
              <Badge variant="outline">
                {selectedDateManagements.length} eventos
              </Badge>
            </div>

            {selectedDateManagements.length === 0 ? (
              <Card className="py-12">
                <CardContent className="text-center">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No hay eventos programados para este día
                  </p>
                  {canEdit && (
                    <Button variant="outline" onClick={() => setFormOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Añadir evento
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {selectedDateManagements.map((management) => (
                  <Card 
                    key={management.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate('/crm')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="text-2xl">{getTypeIcon(management.management_type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-medium line-clamp-1">{management.title}</h3>
                              {management.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {management.description}
                                </p>
                              )}
                            </div>
                            <Badge variant={getStatusVariant(management.status)}>
                              {management.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {management.management_type}
                            </Badge>
                            {management.start_time && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {management.start_time.slice(0, 5)}
                                  {management.end_time && ` - ${management.end_time.slice(0, 5)}`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Upcoming Events */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="text-lg">Próximos eventos</CardTitle>
              </CardHeader>
              <CardContent>
                {managements
                  .filter(m => m.target_date && new Date(m.target_date) >= new Date())
                  .slice(0, 5)
                  .length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay eventos próximos</p>
                ) : (
                  <div className="space-y-3">
                    {managements
                      .filter(m => m.target_date && new Date(m.target_date) >= new Date())
                      .slice(0, 5)
                      .map((management) => (
                        <div 
                          key={management.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => {
                            if (management.target_date) {
                              setSelectedDate(new Date(management.target_date));
                            }
                          }}
                        >
                          <span className="text-lg">{getTypeIcon(management.management_type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{management.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {management.target_date && format(new Date(management.target_date), "d 'de' MMMM", { locale: es })}
                              {management.start_time && ` · ${management.start_time.slice(0, 5)}`}
                            </p>
                          </div>
                          <Badge variant={getStatusVariant(management.status)} className="text-xs">
                            {management.status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Form */}
      <ManagementForm
        open={formOpen}
        onOpenChange={setFormOpen}
        management={null}
        onSuccess={fetchManagements}
      />
    </div>
  );
}
