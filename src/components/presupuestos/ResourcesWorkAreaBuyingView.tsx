import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, ChevronDown, Package, MapPin, ClipboardList, Calendar, ShoppingCart, Building2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

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
}

export function ResourcesWorkAreaBuyingView({ 
  budgetId,
  resources, 
  activities, 
  phases 
}: ResourcesWorkAreaBuyingViewProps) {
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  
  // Date range filter
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Work areas and their activity associations
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workAreaActivityLinks, setWorkAreaActivityLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

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

  const toggleDate = (key: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  // Filter activities by date range
  const filteredActivities = useMemo(() => {
    if (!startDate && !endDate) return activities;
    
    return activities.filter(activity => {
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

  // Build hierarchical structure: WorkArea → Activity → Date → Resources
  const hierarchicalData = useMemo(() => {
    // Group resources by activity
    const resourcesByActivity = new Map<string, Resource[]>();
    resources.forEach(resource => {
      if (resource.activity_id) {
        const existing = resourcesByActivity.get(resource.activity_id) || [];
        existing.push(resource);
        resourcesByActivity.set(resource.activity_id, existing);
      }
    });

    // Create work area groups
    const workAreaGroups = new Map<string, {
      workArea: WorkArea;
      activities: Map<string, {
        activity: Activity;
        dateKey: string;
        resources: Resource[];
      }>;
      resourceCount: number;
      total: number;
    }>();

    // Group activities under their work areas
    filteredActivities.forEach(activity => {
      const activityResources = resourcesByActivity.get(activity.id) || [];
      if (activityResources.length === 0) return;

      const workAreaIds = activityToWorkAreas.get(activity.id) || [];
      if (workAreaIds.length === 0) {
        // Use a synthetic "Sin área" group
        workAreaIds.push('__unassigned__');
      }

      workAreaIds.forEach(waId => {
        if (!workAreaGroups.has(waId)) {
          const wa = workAreas.find(w => w.id === waId) || {
            id: '__unassigned__',
            name: 'Sin área de trabajo',
            level: '',
            work_area: ''
          };
          workAreaGroups.set(waId, {
            workArea: wa,
            activities: new Map(),
            resourceCount: 0,
            total: 0
          });
        }

        const waGroup = workAreaGroups.get(waId)!;
        
        if (!waGroup.activities.has(activity.id)) {
          const dateKey = activity.actual_start_date || 'sin-fecha';
          waGroup.activities.set(activity.id, {
            activity,
            dateKey,
            resources: []
          });
        }

        const actGroup = waGroup.activities.get(activity.id)!;
        activityResources.forEach(r => {
          actGroup.resources.push(r);
          waGroup.resourceCount++;
          const units = r.manual_units ?? r.related_units ?? 0;
          waGroup.total += (r.external_unit_cost ?? 0) * units;
        });
      });
    });

    return workAreaGroups;
  }, [filteredActivities, resources, workAreas, activityToWorkAreas]);

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
    if (!dateStr || dateStr === 'sin-fecha') return 'Sin fecha real inicio';
    try {
      return format(parseISO(dateStr), "d MMM yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  // Sort work areas by level and name
  const sortedWorkAreaGroups = useMemo(() => {
    return Array.from(hierarchicalData.values()).sort((a, b) => {
      if (a.workArea.id === '__unassigned__') return 1;
      if (b.workArea.id === '__unassigned__') return -1;
      const levelCompare = a.workArea.level.localeCompare(b.workArea.level);
      if (levelCompare !== 0) return levelCompare;
      return a.workArea.name.localeCompare(b.workArea.name);
    });
  }, [hierarchicalData]);

  // Calculate total
  const grandTotal = useMemo(() => {
    return sortedWorkAreaGroups.reduce((sum, wa) => sum + wa.total, 0);
  }, [sortedWorkAreaGroups]);

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
          <span className="font-medium text-sm">Filtrar por rango de fechas:</span>
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
      {sortedWorkAreaGroups.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>
            {startDate || endDate
              ? 'No hay recursos en el rango de fechas seleccionado'
              : 'No hay recursos con actividades asignadas a áreas de trabajo'}
          </p>
        </div>
      )}

      {/* Hierarchical List */}
      <div className="space-y-2">
        {sortedWorkAreaGroups.map(waGroup => {
          const isExpanded = expandedWorkAreas.has(waGroup.workArea.id);
          const isUnassigned = waGroup.workArea.id === '__unassigned__';

          // Sort activities by actual_start_date
          const sortedActivities = Array.from(waGroup.activities.values()).sort((a, b) => {
            const dateA = a.activity.actual_start_date || '';
            const dateB = b.activity.actual_start_date || '';
            return dateA.localeCompare(dateB);
          });

          return (
            <Collapsible key={waGroup.workArea.id} open={isExpanded} onOpenChange={() => toggleWorkArea(waGroup.workArea.id)}>
              <div className={cn("border rounded-lg", isUnassigned && "border-dashed")}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <MapPin className={cn("h-4 w-4 flex-shrink-0", isUnassigned ? "text-muted-foreground" : "text-primary")} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold truncate", isUnassigned && "text-muted-foreground")}>
                        {waGroup.workArea.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {waGroup.workArea.level && `${waGroup.workArea.level} • `}
                        {waGroup.activities.size} actividad{waGroup.activities.size !== 1 ? 'es' : ''} • {waGroup.resourceCount} recurso{waGroup.resourceCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(waGroup.total)}</p>
                      <p className="text-[10px] text-muted-foreground">Coste Base</p>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t bg-muted/10 p-2 space-y-1">
                    {sortedActivities.map(actGroup => {
                      const actKey = `${waGroup.workArea.id}-${actGroup.activity.id}`;
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
                                <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {formatDateDisplay(actGroup.activity.actual_start_date)}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5">
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
                                    <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5">
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
    </div>
  );
}
