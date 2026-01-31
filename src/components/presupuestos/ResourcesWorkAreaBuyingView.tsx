import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, ChevronDown, Package, MapPin, ClipboardList, Calendar, ShoppingCart, Building2, Pencil, CalendarCheck } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { InlineDatePicker } from '@/components/ui/inline-date-picker';
import { toast } from 'sonner';

interface Phase {
  id: string;
  name: string;
  code: string | null;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  uses_measurement: boolean;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
}

interface Resource {
  id: string;
  name: string;
  activity_id: string | null;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  unit: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  purchase_unit_cost?: number | null;
  conversion_factor?: number | null;
}

interface ResourcesWorkAreaBuyingViewProps {
  budgetId: string;
  resources: Resource[];
  activities: Activity[];
  phases: Phase[];
  onEditResource?: (resource: Resource) => void;
  onRefresh?: () => void;
}

export function ResourcesWorkAreaBuyingView({ 
  budgetId,
  resources, 
  activities: initialActivities, 
  phases,
  onEditResource,
  onRefresh
}: ResourcesWorkAreaBuyingViewProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  
  // Local copy of activities for inline date editing
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  
  // Date range filter
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Work areas and their activity associations
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workAreaActivityLinks, setWorkAreaActivityLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync activities when props change
  useEffect(() => {
    setActivities(initialActivities);
  }, [initialActivities]);

  // Fetch work areas and their activity links
  useEffect(() => {
    const fetchWorkAreaData = async () => {
      setLoading(true);
      try {
        const [workAreasRes, linksRes] = await Promise.all([
          supabase
            .from('budget_work_areas')
            .select('id, name, level, work_area')
            .eq('budget_id', budgetId)
            .order('level')
            .order('name'),
          supabase
            .from('budget_work_area_activities')
            .select('work_area_id, activity_id, budget_activities!inner(budget_id)')
            .eq('budget_activities.budget_id', budgetId)
        ]);

        if (workAreasRes.data) setWorkAreas(workAreasRes.data);
        if (linksRes.data) {
          setWorkAreaActivityLinks(
            linksRes.data.map((r: any) => ({ 
              work_area_id: r.work_area_id, 
              activity_id: r.activity_id 
            }))
          );
        }
      } catch (error) {
        console.error('Error fetching work area data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkAreaData();
  }, [budgetId]);

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const toggleWorkArea = (id: string) => {
    setExpandedWorkAreas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleActivity = (id: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle inline date change for activities
  const handleActivityDateChange = useCallback(async (
    activityId: string, 
    field: 'actual_start_date' | 'actual_end_date', 
    value: string | null
  ) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ [field]: value })
        .eq('id', activityId);

      if (error) throw error;

      // Update local state
      setActivities(prev => prev.map(a => 
        a.id === activityId ? { ...a, [field]: value } : a
      ));

      toast.success('Fecha actualizada');
      onRefresh?.();
    } catch (error) {
      console.error('Error updating date:', error);
      toast.error('Error al actualizar la fecha');
    }
  }, [onRefresh]);

  // Map activity_id to work areas
  const activityToWorkAreas = useMemo(() => {
    const map = new Map<string, string[]>();
    workAreaActivityLinks.forEach(link => {
      const existing = map.get(link.activity_id) || [];
      existing.push(link.work_area_id);
      map.set(link.activity_id, existing);
    });
    return map;
  }, [workAreaActivityLinks]);

  // Filter activities: only those with uses_measurement = true, then by date range
  const filteredActivities = useMemo(() => {
    // First filter out activities where uses_measurement is false or null/undefined
    // Only include activities explicitly marked as uses_measurement = true
    const measurementActivities = activities.filter(activity => activity.uses_measurement === true);
    
    if (!startDate && !endDate) return measurementActivities;
    
    return measurementActivities.filter(activity => {
      const actStart = activity.actual_start_date;
      if (!actStart) return false;
      
      try {
        const actStartDate = parseISO(actStart);
        
        // Check if within range
        if (startDate && endDate) {
          return isWithinInterval(actStartDate, {
            start: parseISO(startDate),
            end: parseISO(endDate)
          });
        } else if (startDate) {
          return actStartDate >= parseISO(startDate);
        } else if (endDate) {
          return actStartDate <= parseISO(endDate);
        }
        return true;
      } catch {
        return false;
      }
    });
  }, [activities, startDate, endDate]);

  // Create set of filtered activity IDs
  const filteredActivityIds = useMemo(() => {
    return new Set(filteredActivities.map(a => a.id));
  }, [filteredActivities]);

  // Build hierarchical structure: Level → WorkArea → Activity → Resources
  const hierarchicalData = useMemo(() => {
    // Group resources by activity
    const resourcesByActivity = new Map<string, Resource[]>();
    resources.forEach(resource => {
      if (resource.activity_id && filteredActivityIds.has(resource.activity_id)) {
        const existing = resourcesByActivity.get(resource.activity_id) || [];
        existing.push(resource);
        resourcesByActivity.set(resource.activity_id, existing);
      }
    });

    // Create level groups
    const levelGroups = new Map<string, {
      level: string;
      workAreas: Map<string, {
        workArea: WorkArea;
        activities: Map<string, {
          activity: Activity;
          resources: Resource[];
        }>;
        resourceCount: number;
        total: number;
      }>;
      resourceCount: number;
      total: number;
    }>();

    // Group activities under their work areas, then under levels
    filteredActivities.forEach(activity => {
      const activityResources = resourcesByActivity.get(activity.id) || [];
      if (activityResources.length === 0) return;

      const workAreaIds = activityToWorkAreas.get(activity.id) || [];
      if (workAreaIds.length === 0) {
        // Use a synthetic "Sin área" group
        workAreaIds.push('__unassigned__');
      }

      workAreaIds.forEach(waId => {
        const wa = workAreas.find(w => w.id === waId) || {
          id: '__unassigned__',
          name: 'Sin área de trabajo',
          level: 'Sin nivel',
          work_area: ''
        };

        const levelKey = wa.level || 'Sin nivel';

        // Initialize level if needed
        if (!levelGroups.has(levelKey)) {
          levelGroups.set(levelKey, {
            level: levelKey,
            workAreas: new Map(),
            resourceCount: 0,
            total: 0
          });
        }

        const levelGroup = levelGroups.get(levelKey)!;

        // Initialize work area if needed
        if (!levelGroup.workAreas.has(waId)) {
          levelGroup.workAreas.set(waId, {
            workArea: wa,
            activities: new Map(),
            resourceCount: 0,
            total: 0
          });
        }

        const waGroup = levelGroup.workAreas.get(waId)!;
        
        if (!waGroup.activities.has(activity.id)) {
          waGroup.activities.set(activity.id, {
            activity,
            resources: []
          });
        }

        const actGroup = waGroup.activities.get(activity.id)!;
        activityResources.forEach(r => {
          actGroup.resources.push(r);
          const units = r.manual_units ?? r.related_units ?? 0;
          const subtotal = (r.external_unit_cost ?? 0) * units;
          waGroup.resourceCount++;
          waGroup.total += subtotal;
          levelGroup.resourceCount++;
          levelGroup.total += subtotal;
        });
      });
    });

    return levelGroups;
  }, [filteredActivities, resources, workAreas, activityToWorkAreas, filteredActivityIds]);

  const getResourceTypeBadgeColor = (type: string | null) => {
    switch (type) {
      case 'Material':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Mano de obra':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Maquinaria':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'Subcontrata':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const formatActivityId = (activity: Activity) => {
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    return formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name
    });
  };

  const formatDateDisplay = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(parseISO(dateStr), "d MMM yy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  // Sort levels
  const sortedLevelGroups = useMemo(() => {
    return Array.from(hierarchicalData.entries())
      .sort(([a], [b]) => {
        if (a === 'Sin nivel') return 1;
        if (b === 'Sin nivel') return -1;
        return a.localeCompare(b);
      });
  }, [hierarchicalData]);

  // Calculate grand total from ALL resources (not just filtered)
  const grandTotal = useMemo(() => {
    let total = 0;
    sortedLevelGroups.forEach(([, levelGroup]) => {
      total += levelGroup.total;
    });
    return total;
  }, [sortedLevelGroups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date Range Filter */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium text-sm">Filtrar por rango de fechas:</span>
            <span className="text-xs text-muted-foreground">
              Solo actividades con <span className="font-medium">Uso en Presupuesto</span>: <span className="font-medium">Sí</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <Label htmlFor="startDate" className="text-xs text-muted-foreground">Desde</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endDate" className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="mt-5"
            >
              Limpiar
            </Button>
          )}
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="h-7">
          Total: {formatCurrency(grandTotal)}
        </Badge>
      </div>

      {/* Empty State */}
      {sortedLevelGroups.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>
            {startDate || endDate
              ? 'No hay recursos en el rango de fechas seleccionado'
              : 'No hay recursos con actividades asignadas a áreas de trabajo'}
          </p>
        </div>
      )}

      {/* Hierarchical List: Level → WorkArea → Activity → Resources */}
      <div className="space-y-2">
        {sortedLevelGroups.map(([levelKey, levelGroup]) => {
          const isLevelExpanded = expandedLevels.has(levelKey);
          const isUnassignedLevel = levelKey === 'Sin nivel';

          // Sort work areas by name
          const sortedWorkAreas = Array.from(levelGroup.workAreas.values()).sort((a, b) => {
            if (a.workArea.id === '__unassigned__') return 1;
            if (b.workArea.id === '__unassigned__') return -1;
            return a.workArea.name.localeCompare(b.workArea.name);
          });

          return (
            <Collapsible key={levelKey} open={isLevelExpanded} onOpenChange={() => toggleLevel(levelKey)}>
              <div className={cn("border rounded-lg", isUnassignedLevel && "border-dashed")}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors bg-muted/20">
                    {isLevelExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className={cn(
                      "h-6 w-6 rounded flex items-center justify-center text-xs font-bold",
                      isUnassignedLevel ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"
                    )}>
                      {levelKey.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-bold truncate", isUnassignedLevel && "text-muted-foreground")}>
                        {levelKey}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {levelGroup.workAreas.size} área{levelGroup.workAreas.size !== 1 ? 's' : ''} • {levelGroup.resourceCount} recurso{levelGroup.resourceCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatCurrency(levelGroup.total)}</p>
                      <p className="text-[10px] text-muted-foreground">Coste Base</p>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t p-2 space-y-2">
                    {sortedWorkAreas.map(waGroup => {
                      const waKey = `${levelKey}-${waGroup.workArea.id}`;
                      const isWaExpanded = expandedWorkAreas.has(waKey);
                      const isUnassignedWa = waGroup.workArea.id === '__unassigned__';

                      // Sort activities by actual_start_date then by code
                      const sortedActivities = Array.from(waGroup.activities.values()).sort((a, b) => {
                        const dateA = a.activity.actual_start_date || '';
                        const dateB = b.activity.actual_start_date || '';
                        if (dateA !== dateB) return dateA.localeCompare(dateB);
                        return a.activity.code.localeCompare(b.activity.code);
                      });

                      return (
                        <Collapsible key={waKey} open={isWaExpanded} onOpenChange={() => toggleWorkArea(waKey)}>
                          <div className={cn("border rounded-md", isUnassignedWa && "border-dashed")}>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                                {isWaExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                )}
                                <MapPin className={cn("h-4 w-4 flex-shrink-0", isUnassignedWa ? "text-muted-foreground" : "text-primary")} />
                                <div className="flex-1 min-w-0">
                                  <p className={cn("font-semibold truncate", isUnassignedWa && "text-muted-foreground")}>
                                    {waGroup.workArea.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {waGroup.activities.size} actividad{waGroup.activities.size !== 1 ? 'es' : ''} • {waGroup.resourceCount} recurso{waGroup.resourceCount !== 1 ? 's' : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-sm">{formatCurrency(waGroup.total)}</p>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t bg-muted/10 p-2 space-y-1">
                                {sortedActivities.map(actGroup => {
                                  const actKey = `${waKey}-${actGroup.activity.id}`;
                                  const isActivityExpanded = expandedActivities.has(actKey);
                                  const activityTotal = actGroup.resources.reduce((sum, r) => {
                                    const units = r.manual_units ?? r.related_units ?? 0;
                                    return sum + (r.external_unit_cost ?? 0) * units;
                                  }, 0);

                                  return (
                                    <Collapsible key={actKey} open={isActivityExpanded} onOpenChange={() => toggleActivity(actKey)}>
                                      <div className="border rounded-md bg-background">
                                        <CollapsibleTrigger asChild>
                                          <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 transition-colors">
                                            {isActivityExpanded ? (
                                              <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            )}
                                            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                            <p className="font-mono text-sm flex-1 min-w-0 truncate">
                                              {formatActivityId(actGroup.activity)}
                                            </p>
                                            
                                            {/* Inline date pickers for actual dates */}
                                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                              <span className="text-[10px] text-muted-foreground">Inicio:</span>
                                              <InlineDatePicker
                                                value={actGroup.activity.actual_start_date || null}
                                                onChange={(v) => handleActivityDateChange(actGroup.activity.id, 'actual_start_date', v)}
                                                placeholder="Sin fecha"
                                                className="h-6 w-28 text-[10px]"
                                              />
                                              <span className="text-[10px] text-muted-foreground ml-1">Fin:</span>
                                              <InlineDatePicker
                                                value={actGroup.activity.actual_end_date || null}
                                                onChange={(v) => handleActivityDateChange(actGroup.activity.id, 'actual_end_date', v)}
                                                placeholder="Sin fecha"
                                                className="h-6 w-28 text-[10px]"
                                              />
                                            </div>
                                            
                                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                                              {actGroup.resources.length}
                                            </Badge>
                                            <span className="text-sm font-medium tabular-nums">
                                              {formatCurrency(activityTotal)}
                                            </span>
                                          </div>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="border-t divide-y">
                                            {actGroup.resources.map(resource => {
                                              const units = resource.manual_units ?? resource.related_units ?? 0;
                                              const subtotal = units * (resource.external_unit_cost ?? 0);

                                              return (
                                                <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5 hover:bg-muted/10">
                                                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm truncate">{resource.name}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                                      {resource.resource_type && (
                                                        <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                                                          {resource.resource_type}
                                                        </Badge>
                                                      )}
                                                      {resource.supplier_name && (
                                                        <span className="flex items-center gap-1 truncate">
                                                          <Building2 className="h-3 w-3" />
                                                          {resource.supplier_name}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                  <div className="text-right text-xs whitespace-nowrap">
                                                    <p className="font-medium">{formatNumber(units)} {resource.unit || 'ud'}</p>
                                                    <p className="text-muted-foreground">Uds calc.</p>
                                                  </div>
                                                  <div className="text-right text-xs whitespace-nowrap">
                                                    <p className="font-medium">{formatCurrency(resource.external_unit_cost ?? 0)}</p>
                                                    <p className="text-muted-foreground">Coste ud</p>
                                                  </div>
                                                  <div className="text-right min-w-[80px]">
                                                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(subtotal)}</p>
                                                  </div>
                                                  {onEditResource && (
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-7 w-7 shrink-0"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditResource(resource);
                                                      }}
                                                    >
                                                      <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </CollapsibleContent>
                                      </div>
                                    </Collapsible>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
