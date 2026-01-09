import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from 'date-fns';
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

interface AgendaMonthViewProps {
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  onDaySelect: (date: Date) => void;
  managements: Management[];
  getTypeIcon: (type: string) => string;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function AgendaMonthView({
  currentMonth,
  onMonthChange,
  onDaySelect,
  managements,
  getTypeIcon,
}: AgendaMonthViewProps) {
  // Get all days to display (including padding days from prev/next month)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Group managements by date
  const managementsByDate = useMemo(() => {
    const grouped: Record<string, Management[]> = {};
    managements.forEach(m => {
      if (m.target_date) {
        const dateKey = format(new Date(m.target_date), 'yyyy-MM-dd');
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(m);
      }
    });
    return grouped;
  }, [managements]);

  // Count events for the month
  const monthEventCount = useMemo(() => {
    return managements.filter(m => 
      m.target_date && isSameMonth(new Date(m.target_date), currentMonth)
    ).length;
  }, [managements, currentMonth]);

  const goToPreviousMonth = () => onMonthChange(subMonths(currentMonth, 1));
  const goToNextMonth = () => onMonthChange(addMonths(currentMonth, 1));
  const goToToday = () => onMonthChange(new Date());

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoy
          </Button>
        </div>
        <h2 className="text-xl font-semibold capitalize">
          {format(currentMonth, "MMMM 'de' yyyy", { locale: es })}
        </h2>
        <Badge variant="outline">
          {monthEventCount} eventos este mes
        </Badge>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-0">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayManagements = managementsByDate[dateKey] || [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isCurrentDay = isToday(day);
              
              return (
                <div
                  key={dateKey}
                  className={`
                    min-h-[100px] border-b border-r p-1 cursor-pointer
                    hover:bg-muted/50 transition-colors
                    ${!isCurrentMonth ? 'bg-muted/30' : ''}
                    ${index % 7 === 0 ? 'border-l' : ''}
                  `}
                  onClick={() => onDaySelect(day)}
                >
                  <div className="flex flex-col h-full">
                    <div className={`
                      flex items-center justify-center w-7 h-7 rounded-full mb-1
                      ${isCurrentDay ? 'bg-primary text-primary-foreground font-bold' : ''}
                      ${!isCurrentMonth ? 'text-muted-foreground' : ''}
                    `}>
                      {format(day, 'd')}
                    </div>
                    
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayManagements.slice(0, 3).map((m) => (
                        <div
                          key={m.id}
                          className="text-xs p-1 rounded bg-primary/10 truncate"
                          title={`${m.start_time?.slice(0, 5) || ''} ${m.title}`}
                        >
                          <span className="mr-1">{getTypeIcon(m.management_type)}</span>
                          {m.start_time && (
                            <span className="text-muted-foreground">{m.start_time.slice(0, 5)} </span>
                          )}
                          <span className="font-medium">{m.title}</span>
                        </div>
                      ))}
                      {dayManagements.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayManagements.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
