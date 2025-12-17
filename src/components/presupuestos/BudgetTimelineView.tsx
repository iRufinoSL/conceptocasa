import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, differenceInDays, addDays, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  start_date: string | null;
  duration_days: number | null;
  tolerance_days: number | null;
  end_date: string | null;
}

interface BudgetTimelineViewProps {
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

export function BudgetTimelineView({ budgetId, budgetStartDate, budgetEndDate }: BudgetTimelineViewProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [phasesRes, activitiesRes] = await Promise.all([
          supabase
            .from('budget_phases')
            .select('id, name, code, start_date, duration_days, estimated_end_date')
            .eq('budget_id', budgetId)
            .order('start_date', { ascending: true, nullsFirst: false }),
          supabase
            .from('budget_activities')
            .select('id, name, code, phase_id, start_date, duration_days, tolerance_days, end_date')
            .eq('budget_id', budgetId)
            .order('start_date', { ascending: true, nullsFirst: false })
        ]);

        if (phasesRes.data) setPhases(phasesRes.data);
        if (activitiesRes.data) setActivities(activitiesRes.data);
      } catch (err) {
        console.error('Error fetching timeline data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [budgetId]);

  // Calculate timeline range
  const { timelineStart, timelineEnd, totalDays, dayWidth } = useMemo(() => {
    let minDate: Date | null = budgetStartDate ? parseISO(budgetStartDate) : null;
    let maxDate: Date | null = budgetEndDate ? parseISO(budgetEndDate) : null;

    // Find min/max from phases
    phases.forEach(phase => {
      if (phase.start_date) {
        const start = parseISO(phase.start_date);
        if (!minDate || start < minDate) minDate = start;
      }
      if (phase.estimated_end_date) {
        const end = parseISO(phase.estimated_end_date);
        if (!maxDate || end > maxDate) maxDate = end;
      }
    });

    // Find min/max from activities
    activities.forEach(activity => {
      if (activity.start_date) {
        const start = parseISO(activity.start_date);
        if (!minDate || start < minDate) minDate = start;
      }
      if (activity.end_date) {
        const end = parseISO(activity.end_date);
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
    const width = Math.max(30, Math.min(50, 1200 / days)); // Responsive day width

    return {
      timelineStart: minDate,
      timelineEnd: maxDate,
      totalDays: days,
      dayWidth: width
    };
  }, [phases, activities, budgetStartDate, budgetEndDate]);

  // Generate month markers
  const monthMarkers = useMemo(() => {
    const markers: { date: Date; label: string; offset: number }[] = [];
    let current = new Date(timelineStart);
    current.setDate(1);
    
    while (current <= timelineEnd) {
      const offset = differenceInDays(current, timelineStart);
      if (offset >= 0) {
        markers.push({
          date: new Date(current),
          label: format(current, 'MMM yyyy', { locale: es }),
          offset
        });
      }
      current.setMonth(current.getMonth() + 1);
    }
    return markers;
  }, [timelineStart, timelineEnd]);

  // Calculate bar position and width
  const getBarStyle = (startDate: string | null, endDate: string | null, duration: number | null) => {
    if (!startDate) return null;
    
    const start = parseISO(startDate);
    const offsetDays = differenceInDays(start, timelineStart);
    
    let widthDays = 1;
    if (endDate) {
      widthDays = differenceInDays(parseISO(endDate), start) + 1;
    } else if (duration) {
      widthDays = duration;
    }

    return {
      left: `${offsetDays * dayWidth}px`,
      width: `${Math.max(widthDays * dayWidth - 4, dayWidth - 4)}px`
    };
  };

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

  // Group activities by phase
  const activitiesByPhase = useMemo(() => {
    const map = new Map<string | null, BudgetActivity[]>();
    activities.forEach(activity => {
      const key = activity.phase_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(activity);
    });
    return map;
  }, [activities]);

  // Check if we have date data to show
  const hasDateData = phases.some(p => p.start_date) || activities.some(a => a.start_date);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (!hasDateData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timeline del Proyecto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Sin datos de fechas</p>
            <p className="text-sm">
              Configure las fechas de inicio en las fases y actividades para ver el timeline.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Timeline del Proyecto
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div style={{ width: `${totalDays * dayWidth + 250}px`, minWidth: '100%' }}>
            {/* Header with months */}
            <div className="flex border-b">
              <div className="w-[250px] shrink-0 px-3 py-2 font-medium text-sm text-muted-foreground bg-muted/30">
                Fase / Actividad
              </div>
              <div className="relative flex-1 h-10 bg-muted/10">
                {monthMarkers.map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 h-full border-l border-border/50 px-2 text-xs text-muted-foreground flex items-center"
                    style={{ left: `${marker.offset * dayWidth}px` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Budget range indicator */}
            {(budgetStartDate || budgetEndDate) && (
              <div className="flex border-b bg-primary/5">
                <div className="w-[250px] shrink-0 px-3 py-2 text-sm font-medium flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Presupuesto</Badge>
                </div>
                <div className="relative flex-1 h-8">
                  {budgetStartDate && budgetEndDate && (
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
                            {format(parseISO(budgetStartDate), 'dd/MM/yyyy', { locale: es })} - {format(parseISO(budgetEndDate), 'dd/MM/yyyy', { locale: es })}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            )}

            {/* Phases and Activities */}
            <TooltipProvider>
              {phases.map((phase, phaseIdx) => {
                const phaseActivities = activitiesByPhase.get(phase.id) || [];
                const isExpanded = expandedPhases.has(phase.id);
                const colorClass = COLORS[phaseIdx % COLORS.length];
                const phaseBarStyle = getBarStyle(phase.start_date, phase.estimated_end_date, phase.duration_days);

                return (
                  <div key={phase.id}>
                    {/* Phase row */}
                    <div 
                      className={cn(
                        "flex border-b hover:bg-muted/30 cursor-pointer transition-colors",
                        isExpanded && "bg-muted/20"
                      )}
                      onClick={() => togglePhase(phase.id)}
                    >
                      <div className="w-[250px] shrink-0 px-3 py-2 flex items-center gap-2">
                        {phaseActivities.length > 0 ? (
                          isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        ) : (
                          <div className="w-4" />
                        )}
                        <div className={cn("w-3 h-3 rounded-full", colorClass)} />
                        <span className="text-sm font-medium truncate">
                          {phase.code ? `${phase.code}. ` : ''}{phase.name}
                        </span>
                      </div>
                      <div className="relative flex-1 h-10">
                        {phaseBarStyle && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn("absolute top-2 h-6 rounded shadow-sm", colorClass, "opacity-80")}
                                style={phaseBarStyle}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{phase.name}</p>
                              {phase.start_date && (
                                <p className="text-xs">Inicio: {format(parseISO(phase.start_date), 'dd/MM/yyyy', { locale: es })}</p>
                              )}
                              {phase.duration_days && (
                                <p className="text-xs">Duración: {phase.duration_days} días</p>
                              )}
                              {phase.estimated_end_date && (
                                <p className="text-xs">Fin: {format(parseISO(phase.estimated_end_date), 'dd/MM/yyyy', { locale: es })}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Activities rows */}
                    {isExpanded && phaseActivities.map(activity => {
                      const activityBarStyle = getBarStyle(activity.start_date, activity.end_date, activity.duration_days);
                      
                      return (
                        <div 
                          key={activity.id}
                          className="flex border-b hover:bg-muted/20 transition-colors"
                        >
                          <div className="w-[250px] shrink-0 px-3 py-1.5 pl-10 flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", colorClass, "opacity-60")} />
                            <span className="text-xs text-muted-foreground truncate">
                              {activity.code}. {activity.name}
                            </span>
                          </div>
                          <div className="relative flex-1 h-7">
                            {activityBarStyle && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "absolute top-1.5 h-4 rounded-sm",
                                      colorClass,
                                      "opacity-50"
                                    )}
                                    style={activityBarStyle}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{activity.name}</p>
                                  {activity.start_date && (
                                    <p className="text-xs">Inicio: {format(parseISO(activity.start_date), 'dd/MM/yyyy', { locale: es })}</p>
                                  )}
                                  {activity.duration_days && (
                                    <p className="text-xs">Duración: {activity.duration_days} días</p>
                                  )}
                                  {activity.tolerance_days && (
                                    <p className="text-xs">Tolerancia: +{activity.tolerance_days} días</p>
                                  )}
                                  {activity.end_date && (
                                    <p className="text-xs">Fin: {format(parseISO(activity.end_date), 'dd/MM/yyyy', { locale: es })}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Orphan activities (no phase) */}
              {activitiesByPhase.get(null)?.map(activity => {
                const activityBarStyle = getBarStyle(activity.start_date, activity.end_date, activity.duration_days);
                
                return (
                  <div 
                    key={activity.id}
                    className="flex border-b hover:bg-muted/20 transition-colors"
                  >
                    <div className="w-[250px] shrink-0 px-3 py-1.5 flex items-center gap-2">
                      <div className="w-4" />
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-xs text-muted-foreground truncate">
                        {activity.code}. {activity.name}
                      </span>
                    </div>
                    <div className="relative flex-1 h-7">
                      {activityBarStyle && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1.5 h-4 rounded-sm bg-gray-400 opacity-50"
                              style={activityBarStyle}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{activity.name}</p>
                            <p className="text-xs text-muted-foreground">Sin fase asignada</p>
                            {activity.start_date && (
                              <p className="text-xs">Inicio: {format(parseISO(activity.start_date), 'dd/MM/yyyy', { locale: es })}</p>
                            )}
                            {activity.duration_days && (
                              <p className="text-xs">Duración: {activity.duration_days} días</p>
                            )}
                            {activity.end_date && (
                              <p className="text-xs">Fin: {format(parseISO(activity.end_date), 'dd/MM/yyyy', { locale: es })}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary/20 border-2 border-primary/40 rounded" />
            <span>Rango Presupuesto</span>
          </div>
          {phases.slice(0, 6).map((phase, idx) => (
            <div key={phase.id} className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", COLORS[idx % COLORS.length])} />
              <span className="truncate max-w-[100px]">{phase.name}</span>
            </div>
          ))}
          {phases.length > 6 && (
            <span className="text-muted-foreground">+{phases.length - 6} más</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
