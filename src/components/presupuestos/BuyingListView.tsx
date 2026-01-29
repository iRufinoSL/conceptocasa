import { useState, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Package, Layers, ClipboardList, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';

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
  supplier_name?: string | null;
}

interface BuyingListViewProps {
  phases: Phase[];
  activities: Activity[];
  resources: Resource[];
}

export function BuyingListView({ phases, activities, resources }: BuyingListViewProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleActivity = (activityId: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  };

  // Group resources by activity
  const resourcesByActivity = useMemo(() => {
    const map = new Map<string, Resource[]>();
    resources.forEach(resource => {
      if (resource.activity_id) {
        const existing = map.get(resource.activity_id) || [];
        existing.push(resource);
        map.set(resource.activity_id, existing);
      }
    });
    return map;
  }, [resources]);

  // Group activities by phase
  const activitiesByPhase = useMemo(() => {
    const map = new Map<string, Activity[]>();
    activities.forEach(activity => {
      if (activity.phase_id) {
        const existing = map.get(activity.phase_id) || [];
        existing.push(activity);
        map.set(activity.phase_id, existing);
      }
    });
    // Sort activities within each phase by code
    map.forEach((acts, phaseId) => {
      map.set(phaseId, acts.sort((a, b) => a.code.localeCompare(b.code)));
    });
    return map;
  }, [activities]);

  // Calculate totals for each phase
  const phaseTotals = useMemo(() => {
    const totals = new Map<string, { resourceCount: number; total: number }>();
    phases.forEach(phase => {
      const phaseActivities = activitiesByPhase.get(phase.id) || [];
      let resourceCount = 0;
      let total = 0;
      phaseActivities.forEach(activity => {
        const activityResources = resourcesByActivity.get(activity.id) || [];
        resourceCount += activityResources.length;
        activityResources.forEach(r => {
          const units = r.manual_units ?? r.related_units ?? 0;
          total += (r.external_unit_cost ?? 0) * units;
        });
      });
      totals.set(phase.id, { resourceCount, total });
    });
    return totals;
  }, [phases, activitiesByPhase, resourcesByActivity]);

  // Calculate totals for each activity
  const activityTotals = useMemo(() => {
    const totals = new Map<string, { resourceCount: number; total: number }>();
    activities.forEach(activity => {
      const activityResources = resourcesByActivity.get(activity.id) || [];
      let total = 0;
      activityResources.forEach(r => {
        const units = r.manual_units ?? r.related_units ?? 0;
        total += (r.external_unit_cost ?? 0) * units;
      });
      totals.set(activity.id, { resourceCount: activityResources.length, total });
    });
    return totals;
  }, [activities, resourcesByActivity]);

  // Get activities without phase
  const unassignedActivities = useMemo(() => {
    return activities
      .filter(a => !a.phase_id)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [activities]);

  // Get resources without activity
  const unassignedResources = useMemo(() => {
    return resources.filter(r => !r.activity_id);
  }, [resources]);

  const generateActivityId = (activity: Activity, phaseCode: string | null) => {
    return formatActividadId({
      phaseCode: phaseCode,
      activityCode: activity.code,
      name: activity.name,
    });
  };

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

  // Sort phases by code
  const sortedPhases = useMemo(() => {
    return [...phases].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [phases]);

  if (phases.length === 0 && activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>No hay fases ni actividades para mostrar la lista de compra</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Phases with activities and resources */}
      {sortedPhases.map((phase) => {
        const phaseActivities = activitiesByPhase.get(phase.id) || [];
        const isPhaseExpanded = expandedPhases.has(phase.id);
        const phaseTotalData = phaseTotals.get(phase.id) || { resourceCount: 0, total: 0 };

        // Skip phases with no activities that have resources
        const hasResources = phaseActivities.some(a => (resourcesByActivity.get(a.id) || []).length > 0);
        if (phaseActivities.length === 0 || !hasResources) return null;

        return (
          <Collapsible key={phase.id} open={isPhaseExpanded} onOpenChange={() => togglePhase(phase.id)}>
            <div className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  {isPhaseExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <Layers className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {phase.code ? `${phase.code}.- ${phase.name}` : phase.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''} • {phaseTotalData.resourceCount} recurso{phaseTotalData.resourceCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatCurrency(phaseTotalData.total)}</p>
                    <p className="text-[10px] text-muted-foreground">Coste Base</p>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t bg-muted/10 p-2 space-y-1">
                  {phaseActivities.map((activity) => {
                    const activityResources = resourcesByActivity.get(activity.id) || [];
                    if (activityResources.length === 0) return null;

                    const isActivityExpanded = expandedActivities.has(activity.id);
                    const activityTotalData = activityTotals.get(activity.id) || { resourceCount: 0, total: 0 };

                    return (
                      <Collapsible key={activity.id} open={isActivityExpanded} onOpenChange={() => toggleActivity(activity.id)}>
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
                                {generateActivityId(activity, phase.code)}
                              </p>
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                {activityTotalData.resourceCount}
                              </Badge>
                              <span className="text-sm font-medium tabular-nums">
                                {formatCurrency(activityTotalData.total)}
                              </span>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t divide-y">
                              {activityResources.map((resource) => {
                                const units = resource.manual_units ?? resource.related_units ?? 0;
                                const subtotal = (resource.external_unit_cost ?? 0) * units;
                                return (
                                  <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5">
                                    <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{resource.name}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {resource.resource_type && (
                                          <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                                            {resource.resource_type}
                                          </Badge>
                                        )}
                                        {resource.supplier_name && (
                                          <span className="truncate">{resource.supplier_name}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right text-xs whitespace-nowrap">
                                      <p className="font-medium">{units.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {resource.unit || 'ud'}</p>
                                      <p className="text-muted-foreground">× {formatCurrency(resource.external_unit_cost || 0)}</p>
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

      {/* Activities without phase */}
      {unassignedActivities.length > 0 && (
        <Collapsible open={expandedPhases.has('unassigned')} onOpenChange={() => togglePhase('unassigned')}>
          <div className="border rounded-lg border-dashed">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                {expandedPhases.has('unassigned') ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-muted-foreground">Sin fase asignada</p>
                  <p className="text-xs text-muted-foreground">
                    {unassignedActivities.length} actividad{unassignedActivities.length !== 1 ? 'es' : ''}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t bg-muted/10 p-2 space-y-1">
                {unassignedActivities.map((activity) => {
                  const activityResources = resourcesByActivity.get(activity.id) || [];
                  if (activityResources.length === 0) return null;

                  const isActivityExpanded = expandedActivities.has(activity.id);
                  const activityTotalData = activityTotals.get(activity.id) || { resourceCount: 0, total: 0 };

                  return (
                    <Collapsible key={activity.id} open={isActivityExpanded} onOpenChange={() => toggleActivity(activity.id)}>
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
                              {generateActivityId(activity, null)}
                            </p>
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {activityTotalData.resourceCount}
                            </Badge>
                            <span className="text-sm font-medium tabular-nums">
                              {formatCurrency(activityTotalData.total)}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t divide-y">
                            {activityResources.map((resource) => {
                              const units = resource.manual_units ?? resource.related_units ?? 0;
                              const subtotal = (resource.external_unit_cost ?? 0) * units;
                              return (
                                <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5">
                                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm truncate">{resource.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {resource.resource_type && (
                                        <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                                          {resource.resource_type}
                                        </Badge>
                                      )}
                                      {resource.supplier_name && (
                                        <span className="truncate">{resource.supplier_name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right text-xs whitespace-nowrap">
                                    <p className="font-medium">{units.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {resource.unit || 'ud'}</p>
                                    <p className="text-muted-foreground">× {formatCurrency(resource.external_unit_cost || 0)}</p>
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
      )}

      {/* Resources without activity */}
      {unassignedResources.length > 0 && (
        <Collapsible open={expandedPhases.has('no-activity')} onOpenChange={() => togglePhase('no-activity')}>
          <div className="border rounded-lg border-dashed border-orange-300 dark:border-orange-700">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                {expandedPhases.has('no-activity') ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <Package className="h-4 w-4 text-orange-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-orange-600 dark:text-orange-400">Recursos sin actividad</p>
                  <p className="text-xs text-muted-foreground">
                    {unassignedResources.length} recurso{unassignedResources.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t divide-y">
                {unassignedResources.map((resource) => {
                  const units = resource.manual_units ?? resource.related_units ?? 0;
                  const subtotal = (resource.external_unit_cost ?? 0) * units;
                  return (
                    <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5">
                      <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{resource.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {resource.resource_type && (
                            <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                              {resource.resource_type}
                            </Badge>
                          )}
                          {resource.supplier_name && (
                            <span className="truncate">{resource.supplier_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs whitespace-nowrap">
                        <p className="font-medium">{units.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {resource.unit || 'ud'}</p>
                        <p className="text-muted-foreground">× {formatCurrency(resource.external_unit_cost || 0)}</p>
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
      )}
    </div>
  );
}

export default BuyingListView;
