import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Edit2, Trash2, MapPin, Layers, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { OPTION_COLORS } from '@/lib/options-utils';

interface WorkArea {
  id: string;
  budget_id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
  resources_subtotal?: number;
}

interface Activity {
  id: string;
  name?: string;
  code?: string;
  opciones: string[];
  phase_id?: string | null;
  resources_subtotal?: number;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface WorkAreasOptionsGroupedViewProps {
  workAreas: WorkArea[];
  activities: Activity[];
  phases: Phase[];
  activityLinks: { work_area_id: string; activity_id: string }[];
  activitiesWithoutWorkArea?: Activity[];
  isAdmin: boolean;
  expandedOptions: Set<string>;
  onToggleExpanded: (option: string) => void;
  onEdit: (area: WorkArea) => void;
  onDelete: (id: string) => void;
}

const OPCIONES = ['A', 'B', 'C'];

export function WorkAreasOptionsGroupedView({
  workAreas,
  activities,
  phases,
  activityLinks,
  activitiesWithoutWorkArea = [],
  isAdmin,
  expandedOptions,
  onToggleExpanded,
  onEdit,
  onDelete,
}: WorkAreasOptionsGroupedViewProps) {
  // Track expanded states for all levels of hierarchy
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set());

  const toggleLevel = (key: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWorkArea = (key: string) => {
    setExpandedWorkAreas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Get activity details by id
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    activitiesWithoutWorkArea.forEach(a => map.set(a.id, a));
    return map;
  }, [activities, activitiesWithoutWorkArea]);

  // Get activities for a specific work area that belong to a specific option
  const getWorkAreaActivitiesForOption = (workAreaId: string, option: string): Activity[] => {
    const linkedActivityIds = activityLinks
      .filter(link => link.work_area_id === workAreaId)
      .map(link => link.activity_id);
    
    return linkedActivityIds
      .map(id => activityMap.get(id))
      .filter((a): a is Activity => a !== undefined && (a.opciones || []).includes(option));
  };

  // Calculate subtotal for a work area considering only activities of a specific option
  const getWorkAreaSubtotalForOption = (workAreaId: string, option: string): number => {
    const activitiesForOption = getWorkAreaActivitiesForOption(workAreaId, option);
    return activitiesForOption.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
  };

  // Structure data by Option > Level > WorkArea > Activities
  const dataByOption = useMemo(() => {
    const result: Record<string, {
      levels: Record<string, {
        workAreas: {
          workArea: WorkArea;
          activities: Activity[];
          subtotal: number;
        }[];
        subtotal: number;
      }>;
      activitiesWithoutWorkArea: Activity[];
      subtotal: number;
    }> = {};

    OPCIONES.forEach(option => {
      const levels: Record<string, {
        workAreas: {
          workArea: WorkArea;
          activities: Activity[];
          subtotal: number;
        }[];
        subtotal: number;
      }> = {};

      let totalOptionSubtotal = 0;

      // Group by work areas that have activities in this option
      workAreas.forEach(area => {
        const activitiesForOption = getWorkAreaActivitiesForOption(area.id, option);
        if (activitiesForOption.length === 0) return;

        const areaSubtotal = activitiesForOption.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
        totalOptionSubtotal += areaSubtotal;

        if (!levels[area.level]) {
          levels[area.level] = { workAreas: [], subtotal: 0 };
        }
        
        levels[area.level].workAreas.push({
          workArea: area,
          activities: activitiesForOption,
          subtotal: areaSubtotal,
        });
        levels[area.level].subtotal += areaSubtotal;
      });

      // Sort work areas within each level alphabetically
      Object.values(levels).forEach(level => {
        level.workAreas.sort((a, b) => a.workArea.name.localeCompare(b.workArea.name));
      });

      // Activities without work area for this option
      const unassignedActivities = activitiesWithoutWorkArea.filter(
        a => (a.opciones || []).includes(option)
      );
      const unassignedSubtotal = unassignedActivities.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
      totalOptionSubtotal += unassignedSubtotal;

      result[option] = {
        levels,
        activitiesWithoutWorkArea: unassignedActivities,
        subtotal: totalOptionSubtotal,
      };
    });

    return result;
  }, [workAreas, activities, activityLinks, activitiesWithoutWorkArea, activityMap]);

  // Level order for consistent display
  const LEVEL_ORDER = [
    'Cota 0 terreno',
    'Nivel 1',
    'Nivel 2',
    'Nivel 3',
    'Terrazas',
    'Cubiertas',
    'Vivienda'
  ];

  // Generate ActividadID with format: PhaseCode ActivityCode.- ActivityName
  const getActivityLabel = (activity: Activity): string => {
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code || ''}.- ${activity.name || ''}`.trim();
  };

  const handleEditActivity = (activity: Activity) => {
    window.dispatchEvent(new CustomEvent('edit-activity', { 
      detail: { id: activity.id, name: activity.name, code: activity.code }
    }));
  };

  return (
    <div className="space-y-2">
      {OPCIONES.map(option => {
        const optionData = dataByOption[option];
        const isExpanded = expandedOptions.has(option);
        const colors = OPTION_COLORS[option];
        const levelKeys = LEVEL_ORDER.filter(l => optionData.levels[l]);
        const totalAreas = Object.values(optionData.levels).reduce(
          (sum, l) => sum + l.workAreas.length, 0
        );
        const totalActivities = Object.values(optionData.levels).reduce(
          (sum, l) => sum + l.workAreas.reduce((s, wa) => s + wa.activities.length, 0), 0
        ) + optionData.activitiesWithoutWorkArea.length;

        return (
          <Collapsible 
            key={option} 
            open={isExpanded} 
            onOpenChange={() => onToggleExpanded(option)}
          >
            <div className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Badge 
                      variant="default" 
                      className={`text-lg px-3 py-1 ${colors.bg} hover:opacity-80`}
                    >
                      Opción {option}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {totalAreas} áreas · {totalActivities} actividades
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">SubTotal Opción {option}</p>
                      <p className={`text-lg font-bold font-mono ${colors.text}`}>
                        {formatCurrency(optionData.subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t px-2 py-2 space-y-1">
                  {levelKeys.length > 0 || optionData.activitiesWithoutWorkArea.length > 0 ? (
                    <>
                      {/* Levels */}
                      {levelKeys.map(level => {
                        const levelData = optionData.levels[level];
                        const levelKey = `${option}-${level}`;
                        const isLevelExpanded = expandedLevels.has(levelKey);

                        return (
                          <Collapsible 
                            key={levelKey} 
                            open={isLevelExpanded} 
                            onOpenChange={() => toggleLevel(levelKey)}
                          >
                            <div className="bg-muted/30 rounded-lg">
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg">
                                  <div className="flex items-center gap-3">
                                    {isLevelExpanded ? (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <Layers className="h-4 w-4 text-primary" />
                                    <span className="font-medium">{level}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {levelData.workAreas.length} áreas
                                    </Badge>
                                  </div>
                                  <span className="font-medium font-mono text-sm">
                                    {formatCurrency(levelData.subtotal)}
                                  </span>
                                </div>
                              </CollapsibleTrigger>

                              <CollapsibleContent>
                                <div className="px-2 pb-2 space-y-1">
                                  {/* Work Areas within Level */}
                                  {levelData.workAreas.map(({ workArea, activities: waActivities, subtotal: waSubtotal }) => {
                                    const waKey = `${option}-${level}-${workArea.id}`;
                                    const isWaExpanded = expandedWorkAreas.has(waKey);

                                    return (
                                      <Collapsible 
                                        key={waKey} 
                                        open={isWaExpanded} 
                                        onOpenChange={() => toggleWorkArea(waKey)}
                                      >
                                        <div className="bg-background border rounded-md ml-4">
                                          <CollapsibleTrigger asChild>
                                            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-md">
                                              <div className="flex items-center gap-3">
                                                {isWaExpanded ? (
                                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                ) : (
                                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                                )}
                                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-medium">{workArea.name}</span>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                  {workArea.work_area}
                                                </code>
                                                <Badge variant="outline" className="text-xs">
                                                  {waActivities.length} act.
                                                </Badge>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm">
                                                  {formatCurrency(waSubtotal)}
                                                </span>
                                                {isAdmin && (
                                                  <div className="flex gap-1">
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-7 w-7"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEdit(workArea);
                                                      }}
                                                    >
                                                      <Edit2 className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDelete(workArea.id);
                                                      }}
                                                    >
                                                      <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </CollapsibleTrigger>

                                          <CollapsibleContent>
                                            <div className="border-t px-3 py-2 space-y-1">
                                              {/* Activities within Work Area */}
                                              {waActivities.map(activity => (
                                                <div 
                                                  key={activity.id}
                                                  className="flex items-center justify-between py-1.5 px-3 bg-muted/20 rounded text-sm ml-4"
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-sm">{getActivityLabel(activity)}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-mono text-muted-foreground">
                                                      {formatCurrency(activity.resources_subtotal || 0)}
                                                    </span>
                                                    {isAdmin && (
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => handleEditActivity(activity)}
                                                        title="Editar actividad"
                                                      >
                                                        <Pencil className="h-3 w-3" />
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
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

                      {/* Activities without work area */}
                      {optionData.activitiesWithoutWorkArea.length > 0 && (
                        <Collapsible 
                          open={expandedLevels.has(`${option}-sin-area`)} 
                          onOpenChange={() => toggleLevel(`${option}-sin-area`)}
                        >
                          <div className="bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-amber-500/20 transition-colors rounded-lg">
                                <div className="flex items-center gap-3">
                                  {expandedLevels.has(`${option}-sin-area`) ? (
                                    <ChevronDown className="h-3 w-3 text-amber-600" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-amber-600" />
                                  )}
                                  <MapPin className="h-4 w-4 text-amber-600" />
                                  <span className="font-medium text-amber-700">Sin Área de Trabajo</span>
                                  <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700">
                                    {optionData.activitiesWithoutWorkArea.length} actividades
                                  </Badge>
                                </div>
                                <span className="font-medium font-mono text-sm text-amber-700">
                                  {formatCurrency(optionData.activitiesWithoutWorkArea.reduce(
                                    (sum, a) => sum + (a.resources_subtotal || 0), 0
                                  ))}
                                </span>
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="border-t border-amber-500/20 px-3 py-2 space-y-1">
                                {optionData.activitiesWithoutWorkArea.map(activity => (
                                  <div 
                                    key={activity.id}
                                    className="flex items-center justify-between py-1.5 px-3 bg-amber-500/10 rounded text-sm ml-4"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm">{getActivityLabel(activity)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-muted-foreground">
                                        {formatCurrency(activity.resources_subtotal || 0)}
                                      </span>
                                      {isAdmin && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => handleEditActivity(activity)}
                                          title="Editar actividad"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay actividades con opción {option}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
