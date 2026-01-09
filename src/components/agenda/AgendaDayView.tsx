import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarDays, Clock, Plus } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

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

interface AgendaDayViewProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  managements: Management[];
  datesWithEvents: Date[];
  canEdit: boolean;
  onAddEvent: () => void;
  onEventClick: (management: Management) => void;
  getTypeIcon: (type: string) => string;
  getStatusVariant: (status: string) => 'default' | 'secondary' | 'outline' | 'destructive';
}

// Hours from 7am to 21pm
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const HOUR_HEIGHT = 60; // pixels per hour

export function AgendaDayView({
  selectedDate,
  onSelectDate,
  managements,
  datesWithEvents,
  canEdit,
  onAddEvent,
  onEventClick,
  getTypeIcon,
  getStatusVariant,
}: AgendaDayViewProps) {
  // Filter managements for selected date
  const dayManagements = useMemo(() => 
    managements.filter(m => 
      m.target_date && isSameDay(new Date(m.target_date), selectedDate)
    ), [managements, selectedDate]);

  // Separate events with and without time
  const { timedEvents, allDayEvents } = useMemo(() => {
    const timed: Management[] = [];
    const allDay: Management[] = [];
    
    dayManagements.forEach(m => {
      if (m.start_time) {
        timed.push(m);
      } else {
        allDay.push(m);
      }
    });
    
    // Sort timed events by start time
    timed.sort((a, b) => {
      const timeA = a.start_time || '00:00';
      const timeB = b.start_time || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    return { timedEvents: timed, allDayEvents: allDay };
  }, [dayManagements]);

  // Calculate positions and columns for overlapping events
  const positionedEvents = useMemo(() => {
    const events = timedEvents.map(m => {
      const [startHour, startMin] = (m.start_time || '00:00').split(':').map(Number);
      const [endHour, endMin] = m.end_time 
        ? m.end_time.split(':').map(Number) 
        : [startHour + 1, startMin];
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const top = ((startHour - 7) * 60 + startMin) * (HOUR_HEIGHT / 60);
      const height = Math.max((endMinutes - startMinutes) * (HOUR_HEIGHT / 60), 30);
      
      return {
        ...m,
        startMinutes,
        endMinutes,
        top,
        height,
        column: 0,
        totalColumns: 1,
      };
    });

    // Find overlapping events and assign columns
    for (let i = 0; i < events.length; i++) {
      const current = events[i];
      const overlapping = events.filter((e, j) => 
        j !== i && 
        e.startMinutes < current.endMinutes && 
        e.endMinutes > current.startMinutes
      );
      
      if (overlapping.length > 0) {
        // Find the column assignment
        const usedColumns = new Set(overlapping.map(e => e.column));
        let col = 0;
        while (usedColumns.has(col)) col++;
        current.column = col;
        
        // Update total columns for all overlapping events
        const maxCol = Math.max(current.column, ...overlapping.map(e => e.column)) + 1;
        current.totalColumns = maxCol;
        overlapping.forEach(e => {
          if (events.find(ev => ev.id === e.id)) {
            e.totalColumns = Math.max(e.totalColumns, maxCol);
          }
        });
      }
    }

    // Second pass to update totalColumns
    for (let i = 0; i < events.length; i++) {
      const current = events[i];
      const overlapping = events.filter((e, j) => 
        j !== i && 
        e.startMinutes < current.endMinutes && 
        e.endMinutes > current.startMinutes
      );
      
      if (overlapping.length > 0) {
        const maxCol = Math.max(current.column, ...overlapping.map(e => e.column)) + 1;
        current.totalColumns = maxCol;
        overlapping.forEach(e => e.totalColumns = maxCol);
      }
    }

    return events;
  }, [timedEvents]);

  return (
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
            onSelect={(date) => date && onSelectDate(date)}
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

      {/* Day Schedule */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </h2>
          <Badge variant="outline">
            {dayManagements.length} eventos
          </Badge>
        </div>

        {dayManagements.length === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">
                No hay eventos programados para este día
              </p>
              {canEdit && (
                <Button variant="outline" onClick={onAddEvent}>
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir evento
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              {/* All-day events (no time) */}
              {allDayEvents.length > 0 && (
                <div className="mb-4 pb-4 border-b">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase">Sin horario</p>
                  <div className="space-y-2">
                    {allDayEvents.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => onEventClick(m)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getTypeIcon(m.management_type)}</span>
                          <span className="font-medium flex-1 truncate">{m.title}</span>
                          <Badge variant={getStatusVariant(m.status)} className="text-xs">
                            {m.status}
                          </Badge>
                        </div>
                        {m.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {m.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Time grid */}
              <ScrollArea className="h-[600px]">
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  {/* Hour lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 flex items-start"
                      style={{ top: (hour - 7) * HOUR_HEIGHT }}
                    >
                      <span className="text-xs text-muted-foreground w-12 -mt-2 pr-2 text-right">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                      <div className="flex-1 border-t border-dashed border-muted" />
                    </div>
                  ))}

                  {/* Events */}
                  <div className="absolute left-14 right-0 top-0 bottom-0">
                    {positionedEvents.map((event) => {
                      const width = `calc(${100 / event.totalColumns}% - 4px)`;
                      const left = `calc(${(event.column / event.totalColumns) * 100}%)`;
                      
                      return (
                        <div
                          key={event.id}
                          className="absolute rounded-lg p-2 bg-primary/10 border-l-4 border-primary hover:bg-primary/20 cursor-pointer transition-colors overflow-hidden"
                          style={{
                            top: event.top,
                            height: event.height,
                            width,
                            left,
                          }}
                          onClick={() => onEventClick(event)}
                        >
                          <div className="flex items-start gap-1">
                            <span className="text-sm">{getTypeIcon(event.management_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{event.title}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {event.start_time?.slice(0, 5)}
                                  {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
