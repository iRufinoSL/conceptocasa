import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, differenceInDays, differenceInWeeks, addDays, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Calendar, Clock, ZoomIn, ZoomOut, Link2, Pencil, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
  time_percent: number | null;
  parent_id: string | null;
  depends_on_phase_id: string | null;
  order_index: number | null;
}

interface BudgetGanttViewProps {
  budgetId: string;
  budgetStartDate: string | null;
  budgetEndDate: string | null;
  onBudgetDatesChange?: (startDate: string, endDate: string) => void;
  onPhaseClick?: (phase: BudgetPhase) => void;
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

export function BudgetGanttView({ budgetId, budgetStartDate, budgetEndDate, onBudgetDatesChange, onPhaseClick }: BudgetGanttViewProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('weeks');
  const [editingDates, setEditingDates] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>(budgetStartDate ? parseISO(budgetStartDate) : undefined);
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>(budgetEndDate ? parseISO(budgetEndDate) : undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('budget_phases')
          .select('id, name, code, start_date, duration_days, estimated_end_date, time_percent, parent_id, depends_on_phase_id, order_index')
          .eq('budget_id', budgetId)
          .order('order_index', { ascending: true, nullsFirst: true })
          .order('start_date', { ascending: true, nullsFirst: true })
          .order('code', { ascending: true })
          .order('created_at', { ascending: true });

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

  // Sync temp dates when props change
  useEffect(() => {
    setTempStartDate(budgetStartDate ? parseISO(budgetStartDate) : undefined);
    setTempEndDate(budgetEndDate ? parseISO(budgetEndDate) : undefined);
  }, [budgetStartDate, budgetEndDate]);

  const handleSaveDates = async () => {
    if (!tempStartDate || !tempEndDate) {
      toast.error('Ambas fechas son requeridas');
      return;
    }
    if (tempStartDate >= tempEndDate) {
      toast.error('La fecha de fin debe ser posterior a la de inicio');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          start_date: format(tempStartDate, 'yyyy-MM-dd'),
          end_date: format(tempEndDate, 'yyyy-MM-dd'),
        })
        .eq('id', budgetId);
      
      if (error) throw error;
      
      onBudgetDatesChange?.(
        format(tempStartDate, 'yyyy-MM-dd'),
        format(tempEndDate, 'yyyy-MM-dd')
      );
      setEditingDates(false);
      toast.success('Fechas actualizadas');
    } catch (err) {
      console.error('Error updating dates:', err);
      toast.error('Error al actualizar las fechas');
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate budget duration in days
  const budgetDuration = useMemo(() => {
    if (!budgetStartDate || !budgetEndDate) return 0;
    return differenceInDays(parseISO(budgetEndDate), parseISO(budgetStartDate));
  }, [budgetStartDate, budgetEndDate]);

  // Calculate phase dates based on time_percent, respecting dependencies and parent-child relationships
  const phasesWithCalculatedDates = useMemo(() => {
    // First pass: calculate basic dates from time_percent
    const basicCalculatedPhases = phases.map(phase => {
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

    // Create a map for quick lookups
    const phaseMap = new Map(basicCalculatedPhases.map(p => [p.id, p]));

    // Second pass: adjust dates based on dependencies (depends_on_phase_id)
    // For parent-child: children should start AFTER parent ends (not during parent)
    // We need multiple passes to handle cascading dependencies
    
    // Helper function to adjust a single phase
    const adjustPhase = (phase: typeof basicCalculatedPhases[0], map: Map<string, typeof basicCalculatedPhases[0]>) => {
      let adjustedStartDate = phase.calculatedStartDate;
      let adjustedEndDate = phase.calculatedEndDate;

      // Check dependency constraint (depends_on_phase_id) - phase starts after dependency ends
      if (phase.depends_on_phase_id) {
        const dependsOnPhase = map.get(phase.depends_on_phase_id);
        if (dependsOnPhase?.calculatedEndDate) {
          const dependsOnEndDate = parseISO(dependsOnPhase.calculatedEndDate);
          const currentStartDate = adjustedStartDate ? parseISO(adjustedStartDate) : null;
          
          // Phase must start at or after dependency end
          if (!currentStartDate || currentStartDate < dependsOnEndDate) {
            adjustedStartDate = format(dependsOnEndDate, 'yyyy-MM-dd');
            // Recalculate end date if we have duration
            if (phase.duration_days) {
              adjustedEndDate = format(addDays(dependsOnEndDate, phase.duration_days), 'yyyy-MM-dd');
            }
          }
        }
      }

      // Check parent constraint (parent_id) - children start AFTER parent ends
      // This ensures children don't overlap with or appear before parent
      if (phase.parent_id) {
        const parentPhase = map.get(phase.parent_id);
        if (parentPhase?.calculatedEndDate) {
          const parentEndDate = parseISO(parentPhase.calculatedEndDate);
          const currentStartDate = adjustedStartDate ? parseISO(adjustedStartDate) : null;
          
          // Child must start at or after parent ends
          if (!currentStartDate || currentStartDate < parentEndDate) {
            adjustedStartDate = format(parentEndDate, 'yyyy-MM-dd');
            // Recalculate end date if we have duration
            if (phase.duration_days) {
              adjustedEndDate = format(addDays(parentEndDate, phase.duration_days), 'yyyy-MM-dd');
            }
          }
        }
      }

      return {
        ...phase,
        calculatedStartDate: adjustedStartDate,
        calculatedEndDate: adjustedEndDate,
      };
    };

    // Multiple passes to handle cascading dependencies
    let adjustedPhases = [...basicCalculatedPhases];
    for (let pass = 0; pass < 5; pass++) {
      const currentMap = new Map(adjustedPhases.map(p => [p.id, p]));
      const newAdjusted = adjustedPhases.map(phase => adjustPhase(phase, currentMap));
      
      // Check if anything changed
      const changed = newAdjusted.some((p, i) => 
        p.calculatedStartDate !== adjustedPhases[i].calculatedStartDate ||
        p.calculatedEndDate !== adjustedPhases[i].calculatedEndDate
      );
      
      adjustedPhases = newAdjusted;
      if (!changed) break;
    }

    return adjustedPhases;
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

  // Root phases (no parent) - sorted by start date for proper Gantt display
  const rootPhases = useMemo(() => {
    const roots = phasesWithCalculatedDates.filter(p => !p.parent_id);
    
    // Sort by: order_index first, then start_date, then code
    return roots.sort((a, b) => {
      // First by order_index
      const orderA = a.order_index ?? 999;
      const orderB = b.order_index ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      
      // Then by calculated start date
      if (a.calculatedStartDate && b.calculatedStartDate) {
        const dateA = parseISO(a.calculatedStartDate);
        const dateB = parseISO(b.calculatedStartDate);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
      } else if (a.calculatedStartDate) {
        return -1;
      } else if (b.calculatedStartDate) {
        return 1;
      }
      
      // Finally by code
      const codeA = a.code || '';
      const codeB = b.code || '';
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
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

  // Render dependency arrows - uses depends_on_phase_id for sequence dependencies
  // Arrow goes FROM the end of the dependency TO the start of the dependent phase
  const renderDependencyArrow = useCallback((
    phase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null }, 
    dependsOnPhase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null } | undefined,
    rowIndex: number,
    dependsOnRowIndex: number
  ) => {
    if (!dependsOnPhase || !dependsOnPhase.calculatedEndDate || !phase.calculatedStartDate) return null;

    const dependsOnEnd = parseISO(dependsOnPhase.calculatedEndDate);
    const phaseStart = parseISO(phase.calculatedStartDate);
    
    const dependsOnEndOffset = differenceInDays(dependsOnEnd, timelineStart);
    const phaseStartOffset = differenceInDays(phaseStart, timelineStart);
    
    const dayWidth = zoomLevel === 'weeks' ? unitWidth / 7 : unitWidth;
    const dependsOnEndX = dependsOnEndOffset * dayWidth;
    const phaseStartX = phaseStartOffset * dayWidth;

    // Arrow always goes from dependency end to phase start
    // Since the phases are visually adjusted, phaseStartX should always be >= dependsOnEndX
    const arrowWidth = Math.max(phaseStartX - dependsOnEndX, 4);

    // Simple horizontal arrow from dependency end to phase start
    return (
      <svg
        className="absolute pointer-events-none z-10"
        style={{
          left: `${dependsOnEndX}px`,
          top: '50%',
          width: `${arrowWidth + 8}px`,
          height: '20px',
          transform: 'translateY(-50%)',
          overflow: 'visible'
        }}
      >
        <line
          x1="0"
          y1="10"
          x2={arrowWidth}
          y2="10"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeDasharray="4,2"
        />
        <polygon
          points={`${arrowWidth},6 ${arrowWidth + 8},10 ${arrowWidth},14`}
          fill="hsl(var(--primary))"
        />
      </svg>
    );
  }, [timelineStart, zoomLevel, unitWidth]);

  // Render phase row
  const renderPhaseRow = useCallback((
    phase: BudgetPhase & { calculatedStartDate: string | null; calculatedEndDate: string | null },
    depth: number = 0,
    rowIndex: number = 0
  ) => {
    const children = phaseChildren.get(phase.id) || [];
    const isExpanded = expandedPhases.has(phase.id);
    const colorIdx = getPhaseColorIndex(phase);
    const colorClass = COLORS[colorIdx % COLORS.length];
    const borderClass = COLORS_BORDER[colorIdx % COLORS_BORDER.length];
    const barStyle = getBarStyle(phase.calculatedStartDate, phase.calculatedEndDate, phase.duration_days);

    // Find dependency phase (sequence dependency, not hierarchy)
    const dependsOnPhase = phase.depends_on_phase_id 
      ? phasesWithCalculatedDates.find(p => p.id === phase.depends_on_phase_id)
      : undefined;

    // Calculate row index for dependency arrow positioning
    const allPhasesFlat = phasesWithCalculatedDates;
    const currentRowIndex = allPhasesFlat.findIndex(p => p.id === phase.id);
    const dependsOnRowIndex = dependsOnPhase 
      ? allPhasesFlat.findIndex(p => p.id === dependsOnPhase.id)
      : -1;

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
            {phase.depends_on_phase_id && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Depende de: {dependsOnPhase?.name || 'Fase anterior'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="relative flex-1 h-10">
            {/* Dependency arrow - uses depends_on_phase_id */}
            {phase.depends_on_phase_id && renderDependencyArrow(phase, dependsOnPhase, currentRowIndex, dependsOnRowIndex)}
            
            {/* Phase bar - clickable to open form */}
            {barStyle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute top-2 h-6 rounded shadow-sm cursor-pointer hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden",
                        colorClass,
                        depth > 0 ? "opacity-70" : "opacity-90"
                      )}
                      style={barStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPhaseClick?.(phase);
                      }}
                    >
                      <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                        {phase.code ? `${phase.code}. ` : ''}{phase.name}
                      </span>
                    </div>
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
                    {phase.depends_on_phase_id && dependsOnPhase && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        Depende de: {dependsOnPhase.name}
                      </p>
                    )}
                    {phase.parent_id && (
                      <p className="text-xs text-muted-foreground mt-1">
                        (Subfase)
                      </p>
                    )}
                    <p className="text-xs text-primary mt-1">Clic para editar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Children phases - sorted by their calculated start date */}
        {isExpanded && children
          .map(child => {
            // Find the child in phasesWithCalculatedDates to get calculated dates
            const childWithDates = phasesWithCalculatedDates.find(p => p.id === child.id);
            return childWithDates || { ...child, calculatedStartDate: null, calculatedEndDate: null };
          })
          .sort((a, b) => {
            if (a.calculatedStartDate && b.calculatedStartDate) {
              return parseISO(a.calculatedStartDate).getTime() - parseISO(b.calculatedStartDate).getTime();
            }
            return (a.order_index ?? 0) - (b.order_index ?? 0);
          })
          .map((child, idx) => renderPhaseRow(child, depth + 1, rowIndex + idx + 1))}
      </div>
    );
  }, [phaseChildren, expandedPhases, getPhaseColorIndex, getBarStyle, phasesWithCalculatedDates, renderDependencyArrow, onPhaseClick]);

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
        <div className="flex flex-wrap items-center gap-4 pt-2 text-sm">
          {editingDates ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  Inicio
                </Badge>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      {tempStartDate ? format(tempStartDate, 'dd/MM/yyyy') : 'Seleccionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tempStartDate}
                      onSelect={setTempStartDate}
                      locale={es}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                  Fin
                </Badge>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      {tempEndDate ? format(tempEndDate, 'dd/MM/yyyy') : 'Seleccionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tempEndDate}
                      onSelect={setTempEndDate}
                      locale={es}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveDates} disabled={isSaving}>
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingDates(false);
                  setTempStartDate(budgetStartDate ? parseISO(budgetStartDate) : undefined);
                  setTempEndDate(budgetEndDate ? parseISO(budgetEndDate) : undefined);
                }}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
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
              <Badge variant="secondary">
                Duración: {budgetDuration} días
              </Badge>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 text-xs"
                onClick={() => setEditingDates(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Editar fechas
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {/* Fixed header */}
          <div className="flex border-b sticky top-0 bg-background z-20">
            <div className="w-[280px] shrink-0 px-3 py-2 font-medium text-sm text-muted-foreground bg-muted/30 border-r">
              Fase
            </div>
            <ScrollArea className="flex-1">
              <div className="relative h-10 bg-muted/10" style={{ width: `${totalDays * dayWidth}px` }}>
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
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Scrollable content area - both horizontal and vertical */}
          <ScrollArea className="h-[500px]">
            <div style={{ width: `${totalDays * dayWidth + 280}px`, minWidth: '100%' }}>
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
              {phases.some(p => p.depends_on_phase_id) && (
                <div className="flex items-center gap-4 mt-4 pt-4 px-4 border-t text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-primary" />
                    <span>Indica dependencia secuencial</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="40" height="10" className="shrink-0">
                      <line x1="0" y1="5" x2="32" y2="5" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="4,2" />
                      <polygon points="32,2 38,5 32,8" fill="hsl(var(--primary))" />
                    </svg>
                    <span>Conexión: esta fase empieza cuando termina la anterior</span>
                  </div>
                </div>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
