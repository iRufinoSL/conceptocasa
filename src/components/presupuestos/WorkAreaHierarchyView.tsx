import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Edit2, Trash2, MapPin, Layers, Pencil, Package } from 'lucide-react';
import { formatActividadId } from '@/lib/activity-id';
import { formatCurrency } from '@/lib/format-utils';
import { OPTION_COLORS } from '@/lib/options-utils';
import { searchMatch } from '@/lib/search-utils';

interface WorkArea {
  id: string;
  budget_id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
  created_at: string;
  updated_at: string;
  resources_subtotal?: number;
}

interface ActivityWithOpciones {
  id: string;
  name: string;
  code: string;
  opciones: string[];
  phase_id: string | null;
  resources_subtotal?: number;
  uses_measurement?: boolean;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface Resource {
  id: string;
  activity_id: string | null;
  name: string;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  subtotal: number;
}

interface WorkAreaHierarchyViewProps {
  workAreas: WorkArea[];
  activities: ActivityWithOpciones[];
  phases: Phase[];
  activityLinks: { work_area_id: string; activity_id: string }[];
  resources: Resource[];
  isAdmin: boolean;
  searchTerm?: string;
  onEditWorkArea: (area: WorkArea) => void;
  onDeleteWorkArea: (id: string) => void;
  onEditActivity: (activityId: string) => void;
  onEditResource: (resourceId: string) => void;
}

const LEVELS = [
  'Cota 0 terreno',
  'Nivel 1',
  'Nivel 2',
  'Nivel 3',
  'Terrazas',
  'Cubiertas',
  'Vivienda'
];

export function WorkAreaHierarchyView({
  workAreas,
  activities,
  phases,
  activityLinks,
  resources,
  isAdmin,
  searchTerm = '',
  onEditWorkArea,
  onDeleteWorkArea,
  onEditActivity,
  onEditResource
}: WorkAreaHierarchyViewProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(LEVELS));
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  const phaseMap = useMemo(() => {
    const map = new Map<string, Phase>();
    phases.forEach(p => map.set(p.id, p));
    return map;
  }, [phases]);

  const resourcesByActivity = useMemo(() => {
    const map = new Map<string, Resource[]>();
    resources.forEach(r => {
      if (r.activity_id) {
        const list = map.get(r.activity_id) || [];
        list.push(r);
        map.set(r.activity_id, list);
      }
    });
    return map;
  }, [resources]);

  // Check if an item matches the search term
  const matchesSearch = (text: string) => {
    if (!searchTerm.trim()) return true;
    return searchMatch(text, searchTerm);
  };

  // Get activities for a work area with search filtering
  const getActivitiesForWorkArea = (workAreaId: string) => {
    const linkedActivityIds = activityLinks.filter(l => l.work_area_id === workAreaId).map(l => l.activity_id);
    return activities
      // Filter out activities with uses_measurement = false (marked as "No")
      .filter(a => linkedActivityIds.includes(a.id) && a.uses_measurement !== false)
      .filter(a => {
        if (!searchTerm.trim()) return true;
        // Check if activity or any of its resources match
        const phase = a.phase_id ? phaseMap.get(a.phase_id) : null;
        const activityId = formatActividadId({ phaseCode: phase?.code, activityCode: a.code, name: a.name });
        const activityResources = resourcesByActivity.get(a.id) || [];
        const resourcesText = activityResources.map(r => r.name).join(' ');
        return matchesSearch([activityId, a.name, resourcesText].join(' '));
      })
      .sort((a, b) => {
        const phaseA = a.phase_id ? phaseMap.get(a.phase_id) : null;
        const phaseB = b.phase_id ? phaseMap.get(b.phase_id) : null;
        const idA = formatActividadId({ phaseCode: phaseA?.code, activityCode: a.code, name: a.name });
        const idB = formatActividadId({ phaseCode: phaseB?.code, activityCode: b.code, name: b.name });
        return idA.localeCompare(idB, 'es', { numeric: true });
      });
  };

  // Filter work areas based on search - show area if it or any of its children match
  const filteredGroupedByLevel = useMemo(() => {
    if (!searchTerm.trim()) {
      return workAreas.reduce((acc, area) => {
        if (!acc[area.level]) {
          acc[area.level] = [];
        }
        acc[area.level].push(area);
        return acc;
      }, {} as Record<string, WorkArea[]>);
    }

    // With search: filter areas that match or have matching activities/resources
    const filteredAreas = workAreas.filter(area => {
      // Check if the area itself matches
      if (matchesSearch([area.area_id, area.name || '', area.level, area.work_area].join(' '))) {
        return true;
      }
      // Check if any of its activities/resources match
      const areaActivities = getActivitiesForWorkArea(area.id);
      return areaActivities.length > 0;
    });

    return filteredAreas.reduce((acc, area) => {
      if (!acc[area.level]) {
        acc[area.level] = [];
      }
      acc[area.level].push(area);
      return acc;
    }, {} as Record<string, WorkArea[]>);
  }, [workAreas, searchTerm, activities, activityLinks, resources]);

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const toggleArea = (areaId: string) => {
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
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

  const expandAllLevels = () => setExpandedLevels(new Set(LEVELS));
  const collapseAllLevels = () => {
    setExpandedLevels(new Set());
    setExpandedAreas(new Set());
    setExpandedActivities(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={expandAllLevels}>
          Expandir niveles
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAllLevels}>
          Colapsar todo
        </Button>
      </div>

      {LEVELS.map((level) => {
        const areasInLevel = filteredGroupedByLevel[level] || [];
        if (areasInLevel.length === 0) return null;

        const levelSubtotal = areasInLevel.reduce(
          (sum, wa) => sum + (wa.resources_subtotal || 0),
          0
        );
        const isLevelExpanded = expandedLevels.has(level);

        return (
          <Collapsible key={level} open={isLevelExpanded} onOpenChange={() => toggleLevel(level)}>
            <CollapsibleTrigger asChild>
              <button className="w-full bg-muted/50 px-4 py-3 flex items-center justify-between hover:bg-muted/70 transition-colors rounded-lg border">
                <div className="flex items-center gap-3">
                  {isLevelExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{level}</span>
                  <Badge variant="secondary">{areasInLevel.length}</Badge>
                </div>
                <span className="font-medium text-primary">{formatCurrency(levelSubtotal)}</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-4 mt-2 space-y-2">
                {areasInLevel
                  .sort((a, b) => a.area_id.localeCompare(b.area_id, 'es', { numeric: true }))
                  .map((area) => {
                    const areaActivities = getActivitiesForWorkArea(area.id);
                    const isAreaExpanded = expandedAreas.has(area.id);

                    return (
                      <Collapsible
                        key={area.id}
                        open={isAreaExpanded}
                        onOpenChange={() => toggleArea(area.id)}
                      >
                        <div className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between bg-background px-3 py-2 hover:bg-muted/30 transition-colors">
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center gap-2 flex-1">
                                {areaActivities.length > 0 ? (
                                  isAreaExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                ) : (
                                  <span className="w-4" />
                                )}
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <code className="text-xs bg-muted px-2 py-0.5 rounded">{area.area_id}</code>
                                {area.name && (
                                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">{area.name}</span>
                                )}
                                {areaActivities.length > 0 && (
                                  <Badge variant="outline" className="text-xs">{areaActivities.length}</Badge>
                                )}
                              </button>
                            </CollapsibleTrigger>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{formatCurrency(area.resources_subtotal || 0)}</span>
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditWorkArea(area);
                                    }}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteWorkArea(area.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          <CollapsibleContent>
                            <div className="pl-6 py-2 space-y-1 bg-muted/20 border-t">
                              {areaActivities.map((activity) => {
                                const phase = activity.phase_id ? phaseMap.get(activity.phase_id) : null;
                                const actividadId = formatActividadId({
                                  phaseCode: phase?.code,
                                  activityCode: activity.code,
                                  name: activity.name
                                });
                                const activityResources = resourcesByActivity.get(activity.id) || [];
                                const isActivityExpanded = expandedActivities.has(activity.id);

                                return (
                                  <Collapsible
                                    key={activity.id}
                                    open={isActivityExpanded}
                                    onOpenChange={() => toggleActivity(activity.id)}
                                  >
                                    <div className="border rounded bg-background">
                                      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30">
                                        <CollapsibleTrigger asChild>
                                          <button className="flex items-center gap-2 flex-1 text-left">
                                            {activityResources.length > 0 ? (
                                              isActivityExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                                            ) : (
                                              <span className="w-3.5" />
                                            )}
                                            <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                                              {actividadId.length > 50 ? `${actividadId.substring(0, 47)}...` : actividadId}
                                            </code>
                                            {activityResources.length > 0 && (
                                              <Badge variant="outline" className="text-[10px] px-1.5">{activityResources.length} rec.</Badge>
                                            )}
                                            {activity.opciones?.map(opt => (
                                              <Badge 
                                                key={opt} 
                                                variant="outline" 
                                                className={`${OPTION_COLORS[opt as 'A'|'B'|'C']?.bg || ''} ${OPTION_COLORS[opt as 'A'|'B'|'C']?.text || ''} text-[10px] px-1`}
                                              >
                                                {opt}
                                              </Badge>
                                            ))}
                                          </button>
                                        </CollapsibleTrigger>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{formatCurrency(activity.resources_subtotal || 0)}</span>
                                          {isAdmin && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEditActivity(activity.id);
                                              }}
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <CollapsibleContent>
                                        <div className="pl-8 py-1.5 space-y-1 bg-muted/10 border-t">
                                          {activityResources.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic py-1">Sin recursos</p>
                                          ) : (
                                            activityResources.map((resource) => (
                                              <div
                                                key={resource.id}
                                                className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/30 group"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <Package className="h-3 w-3 text-muted-foreground" />
                                                  <span className="text-xs">{resource.name}</span>
                                                  {resource.resource_type && (
                                                    <Badge variant="outline" className="text-[10px] px-1">
                                                      {resource.resource_type}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs font-medium">{formatCurrency(resource.subtotal)}</span>
                                                  {isAdmin && (
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                      onClick={() => onEditResource(resource.id)}
                                                    >
                                                      <Pencil className="h-2.5 w-2.5" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                );
                              })}
                              {areaActivities.length === 0 && (
                                <p className="text-xs text-muted-foreground italic py-2 px-2">Sin actividades asignadas</p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
