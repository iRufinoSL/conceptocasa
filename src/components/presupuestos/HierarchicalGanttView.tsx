import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format, differenceInDays, addDays, parseISO, eachWeekOfInterval, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Calendar, ZoomIn, ZoomOut, ArrowLeft, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  time_percent: number | null;
  parent_id: string | null;
  depends_on_phase_id: string | null;
  order_index: number | null;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface HierarchicalGanttViewProps {
  budgetId: string;
  budgetStartDate: string | null;
  budgetEndDate: string | null;
  onPhaseClick?: (phase: BudgetPhase) => void;
  onActivityClick?: (activity: BudgetActivity) => void;
}

const PHASE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
];

const PHASE_COLORS_LIGHT = [
  'bg-blue-300',
  'bg-emerald-300',
  'bg-amber-300',
  'bg-violet-300',
  'bg-rose-300',
  'bg-cyan-300',
  'bg-orange-300',
  'bg-teal-300',
];

type ZoomLevel = 'days' | 'weeks';
type ViewMode = 'phases' | 'activities';

export function HierarchicalGanttView({ 
  budgetId, 
  budgetStartDate, 
  budgetEndDate, 
  onPhaseClick, 
  onActivityClick 
}: HierarchicalGanttViewProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('weeks');
  const [viewMode, setViewMode] = useState<ViewMode>('phases');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [phasesRes, activitiesRes] = await Promise.all([
          supabase
            .from('budget_phases')
            .select('id, name, code, start_date, duration_days, estimated_end_date, actual_start_date, actual_end_date, time_percent, parent_id, depends_on_phase_id, order_index')
            .eq('budget_id', budgetId)
            .order('code', { ascending: true }),
          supabase
            .from('budget_activities')
            .select('id, name, code, phase_id, start_date, end_date, duration_days, actual_start_date, actual_end_date')
            .eq('budget_id', budgetId)
            .order('code', { ascending: true })
        ]);

        if (phasesRes.error) throw phasesRes.error;
        if (activitiesRes.error) throw activitiesRes.error;
        
        setPhases(phasesRes.data || []);
        setActivities(activitiesRes.data || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        toast.error('Error al cargar los datos');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [budgetId]);

  // Budget duration in days
  const budgetDuration = useMemo(() => {
    if (!budgetStartDate || !budgetEndDate) return 0;
    return differenceInDays(parseISO(budgetEndDate), parseISO(budgetStartDate));
  }, [budgetStartDate, budgetEndDate]);

  // Calculate phase dates based on time_percent
  const phasesWithCalculatedDates = useMemo(() => {
    return phases.map(phase => {
      let calculatedStartDate = phase.start_date;
      let calculatedEndDate = phase.estimated_end_date;

      if (phase.time_percent !== null && budgetStartDate && budgetDuration > 0) {
        const daysOffset = Math.floor((phase.time_percent / 100) * budgetDuration);
        const startDate = addDays(parseISO(budgetStartDate), daysOffset);
        calculatedStartDate = format(startDate, 'yyyy-MM-dd');

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

  // Activities for selected phase
  const selectedPhaseActivities = useMemo(() => {
    if (!selectedPhaseId) return [];
    return activities
      .filter(a => a.phase_id === selectedPhaseId)
      .sort((a, b) => a.code.localeCompare(b.code, 'es'));
  }, [activities, selectedPhaseId]);

  // Root phases (no parent)
  const rootPhases = useMemo(() => {
    return phasesWithCalculatedDates
      .filter(p => !p.parent_id)
      .sort((a, b) => {
        const codeA = a.code || '';
        const codeB = b.code || '';
        return codeA.localeCompare(codeB, 'es', { numeric: true });
      });
  }, [phasesWithCalculatedDates]);

  // Phase children map
  const phaseChildren = useMemo(() => {
    const map = new Map<string, typeof phasesWithCalculatedDates>();
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

  // Timeline calculation
  const { timelineStart, timelineEnd, totalDays, unitWidth, timeUnits } = useMemo(() => {
    let itemsToConsider: { start: string | null; end: string | null }[] = [];
    
    if (viewMode === 'activities' && selectedPhaseId) {
      itemsToConsider = selectedPhaseActivities.map(a => ({
        start: a.actual_start_date || a.start_date,
        end: a.actual_end_date || a.end_date
      }));
    } else {
      itemsToConsider = phasesWithCalculatedDates.map(p => ({
        start: p.actual_start_date || p.calculatedStartDate,
        end: p.actual_end_date || p.calculatedEndDate
      }));
    }

    let minDate: Date | null = budgetStartDate ? parseISO(budgetStartDate) : null;
    let maxDate: Date | null = budgetEndDate ? parseISO(budgetEndDate) : null;

    itemsToConsider.forEach(item => {
      if (item.start) {
        const start = parseISO(item.start);
        if (!minDate || start < minDate) minDate = start;
      }
      if (item.end) {
        const end = parseISO(item.end);
        if (!maxDate || end > maxDate) maxDate = end;
      }
    });

    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = addDays(minDate, 90);

    minDate = addDays(minDate, -7);
    maxDate = addDays(maxDate, 7);

    const days = differenceInDays(maxDate, minDate) + 1;
    
    let width: number;
    let units: { date: Date; label: string; offset: number }[] = [];

    if (zoomLevel === 'weeks') {
      width = Math.max(80, Math.min(150, 1400 / Math.ceil(days / 7)));
      const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
      units = weeks.map(week => ({
        date: week,
        label: `Sem ${format(week, 'w')} - ${format(week, 'MMM', { locale: es })}`,
        offset: differenceInDays(week, minDate!)
      }));
    } else {
      width = Math.max(30, Math.min(60, 1400 / days));
      const allDays = eachDayOfInterval({ start: minDate, end: maxDate });
      units = allDays.map(day => ({
        date: day,
        label: format(day, 'd', { locale: es }),
        offset: differenceInDays(day, minDate!)
      }));
    }

    return {
      timelineStart: minDate,
      timelineEnd: maxDate,
      totalDays: days,
      unitWidth: width,
      timeUnits: units
    };
  }, [phasesWithCalculatedDates, selectedPhaseActivities, budgetStartDate, budgetEndDate, zoomLevel, viewMode, selectedPhaseId]);

  // Bar style calculation
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

  const handlePhaseBarClick = (phase: typeof phasesWithCalculatedDates[0]) => {
    const phaseActivities = activities.filter(a => a.phase_id === phase.id);
    if (phaseActivities.length > 0) {
      setSelectedPhaseId(phase.id);
      setViewMode('activities');
    } else {
      onPhaseClick?.(phase);
    }
  };

  const handleBackToPhases = () => {
    setViewMode('phases');
    setSelectedPhaseId(null);
  };

  // Get phase color index
  const getPhaseColorIndex = useCallback((phase: BudgetPhase): number => {
    const idx = rootPhases.findIndex(p => p.id === phase.id || p.id === phase.parent_id);
    return idx >= 0 ? idx : 0;
  }, [rootPhases]);

  // Format date for display
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(parseISO(date), 'dd/MM/yyyy', { locale: es });
  };

  // Render phase row
  const renderPhaseRow = useCallback((
    phase: typeof phasesWithCalculatedDates[0],
    depth: number = 0
  ) => {
    const children = phaseChildren.get(phase.id) || [];
    const isExpanded = expandedPhases.has(phase.id);
    const colorIdx = getPhaseColorIndex(phase);
    const plannedBarStyle = getBarStyle(phase.calculatedStartDate, phase.calculatedEndDate, phase.duration_days);
    const actualBarStyle = getBarStyle(phase.actual_start_date, phase.actual_end_date, null);
    const phaseActivitiesCount = activities.filter(a => a.phase_id === phase.id).length;
    const hasActualDates = phase.actual_start_date || phase.actual_end_date;

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
            className="w-[300px] shrink-0 px-3 py-2 flex items-center gap-2"
            style={{ paddingLeft: `${12 + depth * 20}px` }}
          >
            {children.length > 0 ? (
              isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <div className="w-4 shrink-0" />
            )}
            <div className={cn("w-3 h-3 rounded-full shrink-0", PHASE_COLORS[colorIdx % PHASE_COLORS.length])} />
            <span className="text-sm font-medium truncate flex-1">
              {phase.code ? `${phase.code}. ` : ''}{phase.name}
            </span>
            {phaseActivitiesCount > 0 && (
              <Badge variant="outline" className="text-xs shrink-0">
                {phaseActivitiesCount} act.
              </Badge>
            )}
            {hasActualDates && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            )}
          </div>
          <div className="relative flex-1 h-12">
            {/* Planned bar (lighter color) */}
            {plannedBarStyle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute top-1 h-4 rounded opacity-40",
                        PHASE_COLORS_LIGHT[colorIdx % PHASE_COLORS_LIGHT.length]
                      )}
                      style={plannedBarStyle}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Planificado</p>
                    <p className="text-xs">Inicio: {formatDate(phase.calculatedStartDate)}</p>
                    <p className="text-xs">Fin: {formatDate(phase.calculatedEndDate)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Actual bar (full color) or clickable planned bar */}
            {actualBarStyle ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute top-6 h-5 rounded shadow-sm cursor-pointer hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden",
                        PHASE_COLORS[colorIdx % PHASE_COLORS.length],
                        "opacity-90"
                      )}
                      style={actualBarStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhaseBarClick(phase);
                      }}
                    >
                      <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                        Real
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{phase.name}</p>
                    <p className="text-xs text-emerald-400">Ejecución Real</p>
                    <p className="text-xs">Inicio: {formatDate(phase.actual_start_date)}</p>
                    <p className="text-xs">Fin: {formatDate(phase.actual_end_date)}</p>
                    {phaseActivitiesCount > 0 && (
                      <p className="text-xs text-primary mt-1">Clic para ver actividades</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : plannedBarStyle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute top-6 h-5 rounded shadow-sm cursor-pointer hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden border-2 border-dashed",
                        PHASE_COLORS[colorIdx % PHASE_COLORS.length],
                        "opacity-70"
                      )}
                      style={plannedBarStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhaseBarClick(phase);
                      }}
                    >
                      <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                        {phase.code || phase.name.slice(0, 10)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{phase.name}</p>
                    <p className="text-xs text-muted-foreground">Planificado (sin fechas reales)</p>
                    <p className="text-xs">Inicio: {formatDate(phase.calculatedStartDate)}</p>
                    <p className="text-xs">Fin: {formatDate(phase.calculatedEndDate)}</p>
                    {phaseActivitiesCount > 0 && (
                      <p className="text-xs text-primary mt-1">Clic para ver actividades</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Child phases */}
        {isExpanded && children
          .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'es', { numeric: true }))
          .map(child => renderPhaseRow(child, depth + 1))}
      </div>
    );
  }, [phaseChildren, expandedPhases, getPhaseColorIndex, getBarStyle, activities]);

  // Render activity row
  const renderActivityRow = useCallback((activity: BudgetActivity, colorIdx: number) => {
    const plannedBarStyle = getBarStyle(activity.start_date, activity.end_date, activity.duration_days);
    const actualBarStyle = getBarStyle(activity.actual_start_date, activity.actual_end_date, null);
    const hasActualDates = activity.actual_start_date || activity.actual_end_date;

    return (
      <div 
        key={activity.id}
        className="flex border-b hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => onActivityClick?.(activity)}
      >
        <div className="w-[300px] shrink-0 px-3 py-2 flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full shrink-0", PHASE_COLORS[colorIdx % PHASE_COLORS.length])} />
          <span className="text-sm font-medium truncate flex-1">
            {activity.code}.-{activity.name}
          </span>
          {hasActualDates && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          )}
        </div>
        <div className="relative flex-1 h-12">
          {/* Planned bar */}
          {plannedBarStyle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "absolute top-1 h-4 rounded opacity-40",
                      PHASE_COLORS_LIGHT[colorIdx % PHASE_COLORS_LIGHT.length]
                    )}
                    style={plannedBarStyle}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Planificado</p>
                  <p className="text-xs">Inicio: {formatDate(activity.start_date)}</p>
                  <p className="text-xs">Fin: {formatDate(activity.end_date)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Actual bar */}
          {actualBarStyle ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "absolute top-6 h-5 rounded shadow-sm opacity-90 flex items-center px-2 overflow-hidden",
                      PHASE_COLORS[colorIdx % PHASE_COLORS.length]
                    )}
                    style={actualBarStyle}
                  >
                    <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                      Real
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{activity.code}.-{activity.name}</p>
                  <p className="text-xs text-emerald-400">Ejecución Real</p>
                  <p className="text-xs">Inicio: {formatDate(activity.actual_start_date)}</p>
                  <p className="text-xs">Fin: {formatDate(activity.actual_end_date)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : plannedBarStyle && (
            <div
              className={cn(
                "absolute top-6 h-5 rounded shadow-sm opacity-70 flex items-center px-2 overflow-hidden border-2 border-dashed",
                PHASE_COLORS[colorIdx % PHASE_COLORS.length]
              )}
              style={plannedBarStyle}
            >
              <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                {activity.code}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }, [getBarStyle, onActivityClick]);

  // Selected phase for activities view
  const selectedPhase = useMemo(() => {
    if (!selectedPhaseId) return null;
    return phasesWithCalculatedDates.find(p => p.id === selectedPhaseId);
  }, [selectedPhaseId, phasesWithCalculatedDates]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (!budgetStartDate || !budgetEndDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Diagrama de Gantt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Configure las fechas de inicio y fin del presupuesto para ver el diagrama de Gantt.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {viewMode === 'activities' && (
              <Button variant="ghost" size="sm" onClick={handleBackToPhases}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
            )}
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5" />
              {viewMode === 'phases' ? 'Fases Constructivas' : `Actividades: ${selectedPhase?.name || ''}`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="w-4 h-3 rounded opacity-40 bg-blue-300" />
              <span>Planificado</span>
              <div className="w-4 h-3 rounded bg-blue-500 ml-2" />
              <span>Real</span>
            </div>
            <ToggleGroup 
              type="single" 
              value={zoomLevel} 
              onValueChange={(v) => v && setZoomLevel(v as ZoomLevel)}
              size="sm"
            >
              <ToggleGroupItem value="weeks" aria-label="Vista semanal">
                <Clock className="h-4 w-4 mr-1" />
                Semanas
              </ToggleGroupItem>
              <ToggleGroupItem value="days" aria-label="Vista diaria">
                <Calendar className="h-4 w-4 mr-1" />
                Días
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex border-t">
          {/* Fixed left column header */}
          <div className="w-[300px] shrink-0 border-r bg-muted/30 px-3 py-2">
            <span className="text-sm font-medium">
              {viewMode === 'phases' ? 'Fase' : 'Actividad'}
            </span>
          </div>
          
          {/* Timeline header */}
          <ScrollArea className="flex-1">
            <div 
              className="flex border-b"
              style={{ width: `${timeUnits.length * unitWidth}px` }}
            >
              {timeUnits.map((unit, idx) => (
                <div
                  key={idx}
                  className="shrink-0 px-1 py-2 text-xs text-center text-muted-foreground border-r truncate"
                  style={{ width: `${unitWidth}px` }}
                >
                  {unit.label}
                </div>
              ))}
            </div>
            
            {/* Rows */}
            <div style={{ width: `${timeUnits.length * unitWidth}px` }}>
              {viewMode === 'phases' ? (
                rootPhases.length > 0 ? (
                  rootPhases.map(phase => renderPhaseRow(phase))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No hay fases definidas
                  </div>
                )
              ) : (
                selectedPhaseActivities.length > 0 ? (
                  selectedPhaseActivities.map(activity => 
                    renderActivityRow(activity, getPhaseColorIndex(selectedPhase!))
                  )
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    Esta fase no tiene actividades
                  </div>
                )
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
