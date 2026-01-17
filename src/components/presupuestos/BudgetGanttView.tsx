import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format, differenceInDays, differenceInWeeks, addDays, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Calendar, Clock, ZoomIn, ZoomOut, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
  time_percent: number | null;
  parent_id: string | null;
  order_index: number | null;
}

interface BudgetGanttViewProps {
  budgetId: string;
  budgetStartDate: string | null;
  budgetEndDate: string | null;
}

const COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
];

const COLORS_BORDER = [
  'border-blue-500',
  'border-emerald-500',
  'border-amber-500',
  'border-violet-500',
  'border-rose-500',
  'border-cyan-500',
  'border-orange-500',
  'border-teal-500',
];

type ZoomLevel = 'days' | 'weeks';

export function BudgetGanttView({ budgetId, budgetStartDate, budgetEndDate }: BudgetGanttViewProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('weeks');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('budget_phases')
          .select('id, name, code, start_date, duration_days, estimated_end_date, time_percent, parent_id, order_index')
          .eq('budget_id', budgetId)
          .order('order_index', { ascending: true, nullsFirst: false })
          .order('code', { ascending: true });

        if (error) throw error;
        if (data) setPhases(data);
      } catch (err) {
        console.error('Error fetching phases:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [budgetId]);

  // Calculate budget duration in days
  const budgetDuration = useMemo(() => {
    if (!budgetStartDate || !budgetEndDate) return 0;
    return differenceInDays(parseISO(budgetEndDate), parseISO(budgetStartDate));
  }, [budgetStartDate, budgetEndDate]);

  // Calculate phase dates based on time_percent
  const phasesWithCalculatedDates = useMemo(() => {
    return phases.map(phase => {
      let calculatedStartDate = phase.start_date;
      let calculatedEndDate = phase.estimated_end_date;

      // If time_percent is set and budget dates exist, calculate start date from percentage
      if (phase.time_percent !== null && budgetStartDate && budgetDuration > 0) {
        const daysOffset = Math.floor((phase.time_percent / 100) * budgetDuration);
        const startDate = addDays(parseISO(budgetStartDate), daysOffset);
        calculatedStartDate = format(startDate, 'yyyy-MM-dd');

        // Calculate end date from duration
        if (phase.duration_days) {
          calculatedEndDate = format(addDays(startDate, phase.duration_days), 'yyyy-MM-dd');
        }
      }

      return {
        ...phase,
        calculatedStartDate,
        calculatedEndDate,
      };
    });
  }, [phases, budgetStartDate, budgetDuration]);

  // Build parent-child relationships
  const phaseChildren = useMemo(() => {
    const map = new Map<string, BudgetPhase[]>();
    phasesWithCalculatedDates.forEach(phase => {
      if (phase.parent_id) {
        if (!map.has(phase.parent_id)) {
          map.set(phase.parent_id, []);
        }
        map.get(phase.parent_id)!.push(phase);
      }
    });
    return map;
  }, [phasesWithCalculatedDates]);

  // Root phases (no parent)
  const rootPhases = useMemo(() => {
    return phasesWithCalculatedDates.filter(p => !p.parent_id);
  }, [phasesWithCalculatedDates]);

  // Calculate timeline range
  const { timelineStart, timelineEnd, totalDays, unitWidth, timeUnits } = useMemo(() => {
    let minDate: Date | null = budgetStartDate ? parseISO(budgetStartDate) : null;
    let maxDate: Date | null = budgetEndDate ? parseISO(budgetEndDate) : null;

    // Find min/max from phases
    phasesWithCalculatedDates.forEach(phase => {
      if (phase.calculatedStartDate) {
        const start = parseISO(phase.calculatedStartDate);
        if (!minDate || start < minDate) minDate = start;
      }
      if (phase.calculatedEndDate) {
        const end = parseISO(phase.calculatedEndDate);
        if (!maxDate || end > maxDate) maxDate = end;
      }
    });

    // Default to current month if no dates
    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = addDays(minDate, 90);

    // Add padding
    minDate = addDays(minDate, -7);
    maxDate = addDays(maxDate, 7);

    const days = differenceInDays(maxDate, minDate) + 1;
    
    // Calculate unit width based on zoom level
    let width: number;
    let units: { date: Date; label: string; offset: number }[] = [];

    if (zoomLevel === 'weeks') {
      width = Math.max(80, Math.min(150, 1400 / Math.ceil(days / 7)));
      const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
      units = weeks.map(week => ({
        date: week,
        label: `Sem ${format(week, 'w')} - ${format(week, 'MMM', { locale: es })}`,
        offset: differenceInDays(week, minDate)
      }));
    } else {
      width = Math.max(30, Math.min(60, 1400 / days));
      const allDays = eachDayOfInterval({ start: minDate, end: maxDate });
      units = allDays.map(day => ({
        date: day,
        label: format(day, 'd', { locale: es }),
        offset: differenceInDays(day, minDate)
      }));
    }

    return {
      timelineStart: minDate,
      timelineEnd: maxDate,
      totalDays: days,
      unitWidth: width,
      timeUnits: units
    };
  }, [phasesWithCalculatedDates, budgetStartDate, budgetEndDate, zoomLevel]);

  // Calculate bar position and width
  const getBarStyle = useCallback((startDate: string | null, endDate: string | null, duration: number | null) => {
    if (!startDate) return null;
    
    const start = parseISO(startDate);
    const offsetDays = differenceInDays(start, timelineStart);
    
    let widthDays = 1;
    if (endDate) {
      widthDays = differenceInDays(parseISO(endDate), start) + 1;
    } else if (duration) {
      widthDays = duration;
    }

    const dayWidth = zoomLevel === 'weeks' ? unitWidth / 7 : unitWidth;

    return {
      left: `${offsetDays * dayWidth}px`,
      width: `${Math.max(widthDays * dayWidth - 4, dayWidth - 4)}px`
    };
  }, [timelineStart, zoomLevel, unitWidth]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  // Get phase color index
  const getPhaseColorIndex = useCallback((phase: BudgetPhase): number => {
    const idx = rootPhases.findIndex(p => p.id === phase.id || p.id === phase.parent_id);
    return idx >= 0 ? idx : 0;
  }, [rootPhases]);

  // Check if we have date data to show
  const hasDateData = phasesWithCalculatedDates.some(p => p.calculatedStartDate);
  const hasBudgetDates = budgetStartDate && budgetEndDate;

  // Render dependency arrows
  const renderDependencyArrow = useCallback((phase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null }, parentPhase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null } | undefined) => {
    if (!parentPhase || !parentPhase.calculatedEndDate || !phase.calculatedStartDate) return null;

    const parentEnd = parseISO(parentPhase.calculatedEndDate);
    const childStart = parseISO(phase.calculatedStartDate);
    
    const parentEndOffset = differenceInDays(parentEnd, timelineStart);
    const childStartOffset = differenceInDays(childStart, timelineStart);
    
    const dayWidth = zoomLevel === 'weeks' ? unitWidth / 7 : unitWidth;
    const parentEndX = parentEndOffset * dayWidth;
    const childStartX = childStartOffset * dayWidth;

    if (childStartX <= parentEndX) return null; // Overlapping, no arrow needed

    return (
      <svg
        className="absolute pointer-events-none"
        style={{
          left: `${parentEndX}px`,
          top: '50%',
          width: `${childStartX - parentEndX}px`,
          height: '20px',
          transform: 'translateY(-50%)',
          overflow: 'visible'
        }}
      >
        <line
          x1="0"
          y1="10"
          x2={childStartX - parentEndX - 6}
          y2="10"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground"
          strokeDasharray="4,2"
        />
        <polygon
          points={`${childStartX - parentEndX - 6},6 ${childStartX - parentEndX},10 ${childStartX - parentEndX - 6},14`}
          fill="currentColor"
          className="text-muted-foreground"
        />
      </svg>
    );
  }, [timelineStart, zoomLevel, unitWidth]);

  // Render phase row
  const renderPhaseRow = useCallback((
    phase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null },
    depth: number = 0
  ) => {
    const children = phaseChildren.get(phase.id) || [];
    const isExpanded = expandedPhases.has(phase.id);
    const colorIdx = getPhaseColorIndex(phase);
    const colorClass = COLORS[colorIdx % COLORS.length];
    const borderClass = COLORS_BORDER[colorIdx % COLORS_BORDER.length];
    const barStyle = getBarStyle(phase.calculatedStartDate, phase.calculatedEndDate, phase.duration_days);

    // Find parent phase for dependency arrow
    const parentPhase = phase.parent_id 
      ? phasesWithCalculatedDates.find(p => p.id === phase.parent_id)
      : undefined;

    return (
      <div key={phase.id}>
        <div 
          className={cn(
            "flex border-b hover:bg-muted/30 cursor-pointer transition-colors",
            isExpanded && "bg-muted/20"
          )}
          onClick={() => children.length > 0 && togglePhase(phase.id)}
        >
          <div 
            className="w-[280px] shrink-0 px-3 py-2 flex items-center gap-2"
            style={{ paddingLeft: `${12 + depth * 20}px` }}
          >
            {children.length > 0 ? (
              isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <div className="w-4 shrink-0" />
            )}
            <div className={cn("w-3 h-3 rounded-full shrink-0", colorClass)} />
            <span className="text-sm font-medium truncate">
              {phase.code ? `${phase.code}. ` : ''}{phase.name}
            </span>
            {phase.parent_id && (
              <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
          <div className="relative flex-1 h-10">
            {/* Dependency arrow */}
            {phase.parent_id && renderDependencyArrow(phase, parentPhase)}
            
            {/* Phase bar */}
            {barStyle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute top-2 h-6 rounded shadow-sm",
                        colorClass,
                        depth > 0 ? "opacity-70" : "opacity-90"
                      )}
                      style={barStyle}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{phase.name}</p>
                    {phase.time_percent !== null && (
                      <p className="text-xs text-muted-foreground">Tiempo %: {phase.time_percent}%</p>
                    )}
                    {phase.calculatedStartDate && (
                      <p className="text-xs">Inicio: {format(parseISO(phase.calculatedStartDate), 'dd/MM/yyyy', { locale: es })}</p>
                    )}
                    {phase.duration_days && (
                      <p className="text-xs">Duración: {phase.duration_days} días</p>
                    )}
                    {phase.calculatedEndDate && (
                      <p className="text-xs">Fin: {format(parseISO(phase.calculatedEndDate), 'dd/MM/yyyy', { locale: es })}</p>
                    )}
                    {phase.parent_id && parentPhase && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Depende de: {parentPhase.name}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Children phases */}
        {isExpanded && children.map(child => renderPhaseRow(child as any, depth + 1))}
      </div>
    );
  }, [phaseChildren, expandedPhases, getPhaseColorIndex, getBarStyle, phasesWithCalculatedDates, renderDependencyArrow]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (!hasBudgetDates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Diagrama de Gantt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Fechas del proyecto no configuradas</p>
            <p className="text-sm">
              Configure las fechas de inicio y fin del presupuesto para ver el diagrama de Gantt.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dayWidth = zoomLevel === 'weeks' ? unitWidth / 7 : unitWidth;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Diagrama de Gantt - Fases de Gestión
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Zoom:</span>
            <ToggleGroup type="single" value={zoomLevel} onValueChange={(v) => v && setZoomLevel(v as ZoomLevel)}>
              <ToggleGroupItem value="weeks" size="sm" className="text-xs">
                <ZoomOut className="h-3 w-3 mr-1" />
                Semanas
              </ToggleGroupItem>
              <ToggleGroupItem value="days" size="sm" className="text-xs">
                <ZoomIn className="h-3 w-3 mr-1" />
                Días
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        
        {/* Project dates header */}
        <div className="flex items-center gap-6 pt-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              Inicio del Proyecto
            </Badge>
            <span className="font-medium">
              {format(parseISO(budgetStartDate!), "d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
              Fin del Proyecto
            </Badge>
            <span className="font-medium">
              {format(parseISO(budgetEndDate!), "d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              Duración: {budgetDuration} días
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div style={{ width: `${totalDays * dayWidth + 280}px`, minWidth: '100%' }}>
            {/* Header with time units */}
            <div className="flex border-b sticky top-0 bg-background z-10">
              <div className="w-[280px] shrink-0 px-3 py-2 font-medium text-sm text-muted-foreground bg-muted/30">
                Fase
              </div>
              <div className="relative flex-1 h-10 bg-muted/10">
                {timeUnits.map((unit, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "absolute top-0 h-full border-l border-border/50 px-1 text-xs text-muted-foreground flex items-center",
                      zoomLevel === 'days' && "text-[10px]"
                    )}
                    style={{ left: `${unit.offset * dayWidth}px` }}
                  >
                    {unit.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Budget range indicator */}
            <div className="flex border-b bg-primary/5">
              <div className="w-[280px] shrink-0 px-3 py-2 text-sm font-medium flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Presupuesto</Badge>
              </div>
              <div className="relative flex-1 h-8">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-1 h-6 bg-primary/20 border-2 border-primary/40 rounded"
                        style={getBarStyle(budgetStartDate, budgetEndDate, null) || undefined}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Rango del Presupuesto</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(budgetStartDate!), 'dd/MM/yyyy', { locale: es })} - {format(parseISO(budgetEndDate!), 'dd/MM/yyyy', { locale: es })}
                      </p>
                      <p className="text-xs">{budgetDuration} días</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Phases */}
            {rootPhases.map(phase => renderPhaseRow(phase as any))}

            {/* Legend */}
            {phases.some(p => p.parent_id) && (
              <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  <span>Indica dependencia de otra fase</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-0.5 border-t border-dashed border-muted-foreground" />
                  <span>→</span>
                  <span>Conexión entre fases dependientes</span>
                </div>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
