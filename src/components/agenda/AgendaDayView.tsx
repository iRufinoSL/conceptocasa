import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarDays, Clock, Plus, CheckCircle2 } from 'lucide-react';
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

interface AgendaDayViewProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  managements: Management[];
  budgetTasks?: BudgetTask[];
  datesWithEvents: Date[];
  canEdit: boolean;
  onAddEvent: () => void;
  onEventClick: (management: Management) => void;
  onTaskClick?: (task: BudgetTask) => void;
  onTaskToggle?: (task: BudgetTask) => void;
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
  budgetTasks = [],
  datesWithEvents,
  canEdit,
  onAddEvent,
  onEventClick,
  onTaskClick,
  onTaskToggle,
  getTypeIcon,
  getStatusVariant,
}: AgendaDayViewProps) {
  // Filter managements for selected date
  const dayManagements = useMemo(() => 
    managements.filter(m => 
      m.target_date && isSameDay(new Date(m.target_date), selectedDate)
    ), [managements, selectedDate]);

  // Filter budget tasks for selected date
  const dayTasks = useMemo(() => 
    budgetTasks.filter(t => {
      const taskDate = t.target_date || t.start_date;
      return taskDate && isSameDay(new Date(taskDate), selectedDate);
    }), [budgetTasks, selectedDate]);

  // Separate events with and without time
  const { timedEvents, allDayEvents, timedTasks, allDayTasks } = useMemo(() => {
    const timedEvts: Management[] = [];
    const allDayEvts: Management[] = [];
    const timedTsks: BudgetTask[] = [];
    const allDayTsks: BudgetTask[] = [];
    
    dayManagements.forEach(m => {
      if (m.start_time) {
        timedEvts.push(m);
      } else {
        allDayEvts.push(m);
      }
    });

    dayTasks.forEach(t => {
      if (t.start_time) {
        timedTsks.push(t);
      } else {
        allDayTsks.push(t);
      }
    });
    
    // Sort timed events by start time
    timedEvts.sort((a, b) => {
      const timeA = a.start_time || '00:00';
      const timeB = b.start_time || '00:00';
      return timeA.localeCompare(timeB);
    });

    timedTsks.sort((a, b) => {
      const timeA = a.start_time || '00:00';
      const timeB = b.start_time || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    return { timedEvents: timedEvts, allDayEvents: allDayEvts, timedTasks: timedTsks, allDayTasks: allDayTsks };
  }, [dayManagements, dayTasks]);

  // Combined type for positioned items
  type PositionedItem = {
    id: string;
    title: string;
    description: string | null;
    start_time: string | null;
    end_time: string | null;
    type: 'management' | 'task';
    original: Management | BudgetTask;
    startMinutes: number;
    endMinutes: number;
    top: number;
    height: number;
    column: number;
    totalColumns: number;
  };

  // Calculate positions and columns for overlapping events (both managements and tasks)
  const positionedItems = useMemo(() => {
    const items: PositionedItem[] = [];

    // Add managements
    timedEvents.forEach(m => {
      const [startHour, startMin] = (m.start_time || '00:00').split(':').map(Number);
      const [endHour, endMin] = m.end_time 
        ? m.end_time.split(':').map(Number) 
        : [startHour + 1, startMin];
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const top = ((startHour - 7) * 60 + startMin) * (HOUR_HEIGHT / 60);
      const height = Math.max((endMinutes - startMinutes) * (HOUR_HEIGHT / 60), 30);
      
      items.push({
        id: m.id,
        title: m.title,
        description: m.description,
        start_time: m.start_time,
        end_time: m.end_time,
        type: 'management',
        original: m,
        startMinutes,
        endMinutes,
        top,
        height,
        column: 0,
        totalColumns: 1,
      });
    });

    // Add tasks
    timedTasks.forEach(t => {
      const [startHour, startMin] = (t.start_time || '00:00').split(':').map(Number);
      const [endHour, endMin] = t.end_time 
        ? t.end_time.split(':').map(Number) 
        : [startHour + 1, startMin];
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const top = ((startHour - 7) * 60 + startMin) * (HOUR_HEIGHT / 60);
      const height = Math.max((endMinutes - startMinutes) * (HOUR_HEIGHT / 60), 30);
      
      items.push({
        id: t.id,
        title: t.name,
        description: t.description,
        start_time: t.start_time,
        end_time: t.end_time,
        type: 'task',
        original: t,
        startMinutes,
        endMinutes,
        top,
        height,
        column: 0,
        totalColumns: 1,
      });
    });

    // Find overlapping items and assign columns
    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      const overlapping = items.filter((e, j) => 
        j !== i && 
        e.startMinutes < current.endMinutes && 
        e.endMinutes > current.startMinutes
      );
      
      if (overlapping.length > 0) {
        const usedColumns = new Set(overlapping.map(e => e.column));
        let col = 0;
        while (usedColumns.has(col)) col++;
        current.column = col;
        
        const maxCol = Math.max(current.column, ...overlapping.map(e => e.column)) + 1;
        current.totalColumns = maxCol;
        overlapping.forEach(e => {
          e.totalColumns = Math.max(e.totalColumns, maxCol);
        });
      }
    }

    // Second pass to update totalColumns
    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      const overlapping = items.filter((e, j) => 
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

    return items;
  }, [timedEvents, timedTasks]);

  const totalDayEvents = dayManagements.length + dayTasks.length;

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
          <div className="flex gap-2">
            <Badge variant="outline">
              {dayManagements.length} citas
            </Badge>
            <Badge variant="secondary">
              {dayTasks.length} tareas
            </Badge>
          </div>
        </div>

        {totalDayEvents === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">
                No hay eventos ni tareas programados para este día
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
              {/* All-day events and tasks (no time) */}
              {(allDayEvents.length > 0 || allDayTasks.length > 0) && (
                <div className="mb-4 pb-4 border-b">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase">Sin horario</p>
                  <div className="space-y-2">
                    {/* All-day managements */}
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
                    {/* All-day tasks */}
                    {allDayTasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer transition-colors border-l-4 border-blue-500"
                        onClick={() => onTaskClick?.(t)}
                      >
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTaskToggle?.(t);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 text-blue-500 hover:text-green-500" />
                          </Button>
                          <span className="font-medium flex-1 truncate text-blue-900 dark:text-blue-100">{t.name}</span>
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            Pendiente
                          </Badge>
                        </div>
                        {(t.description || t.budget_name) && (
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 ml-8 line-clamp-1">
                            {t.budget_name && <span className="mr-2">📁 {t.budget_name}</span>}
                            {t.description}
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

                  {/* Events and Tasks */}
                  <div className="absolute left-14 right-0 top-0 bottom-0">
                    {positionedItems.map((item) => {
                      const width = `calc(${100 / item.totalColumns}% - 4px)`;
                      const left = `calc(${(item.column / item.totalColumns) * 100}%)`;
                      
                      const isTask = item.type === 'task';
                      const bgClass = isTask 
                        ? 'bg-blue-100/80 dark:bg-blue-900/30 border-blue-500 hover:bg-blue-200/80 dark:hover:bg-blue-900/50'
                        : 'bg-primary/10 border-primary hover:bg-primary/20';
                      
                      return (
                        <div
                          key={item.id}
                          className={`absolute rounded-lg p-2 border-l-4 cursor-pointer transition-colors overflow-hidden ${bgClass}`}
                          style={{
                            top: item.top,
                            height: item.height,
                            width,
                            left,
                          }}
                          onClick={() => {
                            if (isTask) {
                              onTaskClick?.(item.original as BudgetTask);
                            } else {
                              onEventClick(item.original as Management);
                            }
                          }}
                        >
                          <div className="flex items-start gap-1">
                            {isTask ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTaskToggle?.(item.original as BudgetTask);
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 text-blue-500 hover:text-green-500" />
                              </Button>
                            ) : (
                              <span className="text-sm">{getTypeIcon((item.original as Management).management_type)}</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium text-sm truncate ${isTask ? 'text-blue-900 dark:text-blue-100' : ''}`}>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {item.start_time?.slice(0, 5)}
                                  {item.end_time && ` - ${item.end_time.slice(0, 5)}`}
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
