import { useMemo, useState, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Folder, MoreHorizontal, Pencil, Copy, FileUp, Trash2, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { MeasurementInlineSelect, MeasurementInlineSelectHandle } from './MeasurementInlineSelect';
import { WorkAreaInlineSelect, WorkAreaInlineSelectHandle } from './WorkAreaInlineSelect';
import { cn } from '@/lib/utils';

interface BudgetActivity {
  id: string;
  budget_id: string;
  name: string;
  code: string;
  description: string | null;
  measurement_unit: string;
  phase_id: string | null;
  measurement_id: string | null;
  uses_measurement: boolean;
  files_count?: number;
  resources_subtotal?: number;
}

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
}

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
}

interface WorkAreaRelation {
  activity_id: string;
  work_area_id: string;
}

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementRelation {
  measurement_id: string;
  related_measurement_id: string;
}

interface ActivitiesWorkAreaGroupedViewProps {
  activities: BudgetActivity[];
  phases: BudgetPhase[];
  workAreas: WorkArea[];
  workAreaRelations: WorkAreaRelation[];
  measurements: Measurement[];
  measurementRelations: MeasurementRelation[];
  isAdmin: boolean;
  onEdit: (activity: BudgetActivity) => void;
  onDuplicate: (activity: BudgetActivity) => void;
  onDelete: (activity: BudgetActivity) => void;
  onManageFiles: (activity: BudgetActivity) => void;
  onUpdateMeasurement: (activityId: string, measurementId: string | null) => void;
  onUpdateWorkAreas: (activityId: string, workAreaIds: string[]) => void;
  generateActivityId: (activity: BudgetActivity) => string;
  getMeasurementData: (activity: BudgetActivity) => { measurement: Measurement | null; relatedUnits: number; medicionId: string };
}

export function ActivitiesWorkAreaGroupedView({
  activities,
  phases,
  workAreas,
  workAreaRelations,
  measurements,
  measurementRelations,
  isAdmin,
  onEdit,
  onDuplicate,
  onDelete,
  onManageFiles,
  onUpdateMeasurement,
  onUpdateWorkAreas,
  generateActivityId,
  getMeasurementData
}: ActivitiesWorkAreaGroupedViewProps) {
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set());
  const measurementRefs = useRef<Map<string, MeasurementInlineSelectHandle | null>>(new Map());
  const workAreaRefs = useRef<Map<string, WorkAreaInlineSelectHandle | null>>(new Map());

  // Group activities by work area
  const groupedData = useMemo(() => {
    const groups = new Map<string, {
      workArea: WorkArea | null;
      activities: BudgetActivity[];
      subtotal: number;
    }>();

    // Initialize "Sin área" group
    groups.set('__no_area__', {
      workArea: null,
      activities: [],
      subtotal: 0
    });

    // Get activities for each work area
    workAreas.forEach(wa => {
      const activityIds = workAreaRelations
        .filter(r => r.work_area_id === wa.id)
        .map(r => r.activity_id);
      
      const areaActivities = activities.filter(a => activityIds.includes(a.id));
      const subtotal = areaActivities.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);

      groups.set(wa.id, {
        workArea: wa,
        activities: areaActivities.sort((a, b) => a.name.localeCompare(b.name)),
        subtotal
      });
    });

    // Find activities without work area
    const allLinkedActivityIds = new Set(workAreaRelations.map(r => r.activity_id));
    const unassigned = activities.filter(a => !allLinkedActivityIds.has(a.id));
    const unassignedSubtotal = unassigned.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
    
    groups.set('__no_area__', {
      workArea: null,
      activities: unassigned.sort((a, b) => a.name.localeCompare(b.name)),
      subtotal: unassignedSubtotal
    });

    // Sort by work area area_id, put __no_area__ at the end
    return Array.from(groups.entries())
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__no_area__') return 1;
        if (keyB === '__no_area__') return -1;
        return (a.workArea?.area_id || '').localeCompare(b.workArea?.area_id || '');
      });
  }, [activities, workAreas, workAreaRelations]);

  const toggleWorkArea = (waId: string) => {
    setExpandedWorkAreas(prev => {
      const next = new Set(prev);
      if (next.has(waId)) {
        next.delete(waId);
      } else {
        next.add(waId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = groupedData.map(([id]) => id);
    setExpandedWorkAreas(new Set(allIds));
  };

  const collapseAll = () => {
    setExpandedWorkAreas(new Set());
  };

  const getPhaseById = (phaseId: string | null) => {
    return phases.find(p => p.id === phaseId);
  };

  // Calculate total
  const totalSubtotal = activities.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expandir todo
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Colapsar todo
          </Button>
        </div>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          Total: {formatCurrency(totalSubtotal)}
        </Badge>
      </div>

      {/* Grouped content */}
      <div className="space-y-4">
        {groupedData.map(([waId, group]) => {
          if (group.activities.length === 0) return null;

          const isExpanded = expandedWorkAreas.has(waId);

          return (
            <div key={waId} className="border rounded-lg overflow-hidden">
              {/* Work Area Header */}
              <button
                className="w-full bg-muted/50 px-4 py-3 flex items-center justify-between hover:bg-muted/70 transition-colors"
                onClick={() => toggleWorkArea(waId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <MapPin className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <span className="font-semibold">
                      {group.workArea ? group.workArea.name : 'Sin área de trabajo'}
                    </span>
                    {group.workArea && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {group.workArea.area_id}
                      </span>
                    )}
                  </div>
                  <Badge variant="secondary">{group.activities.length}</Badge>
                </div>
                <span className="font-medium text-primary">
                  {formatCurrency(group.subtotal)}
                </span>
              </button>

              {/* Activities Table */}
              {isExpanded && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ActividadID</TableHead>
                      <TableHead className="text-center w-16">Usa Med.</TableHead>
                      <TableHead>Actividad</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Áreas</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Uds Relac.</TableHead>
                      <TableHead>MediciónID</TableHead>
                      <TableHead className="text-right">€SubTotal</TableHead>
                      <TableHead>Archivos</TableHead>
                      {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.activities.map((activity) => {
                      const phase = getPhaseById(activity.phase_id);
                      const { relatedUnits, medicionId } = getMeasurementData(activity);

                      return (
                        <TableRow key={activity.id}>
                          <TableCell className="font-mono text-sm">
                            {generateActivityId(activity)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={activity.uses_measurement ? 'default' : 'secondary'} 
                              className="text-xs"
                            >
                              {activity.uses_measurement ? 'Sí' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{activity.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {phase ? `${phase.code} ${phase.name}` : '-'}
                          </TableCell>
                          <TableCell className="max-w-[150px]">
                            {isAdmin ? (
                              <WorkAreaInlineSelect
                                ref={(el) => workAreaRefs.current.set(activity.id, el)}
                                activityId={activity.id}
                                workAreas={workAreas}
                                workAreaRelations={workAreaRelations}
                                onSave={(ids) => onUpdateWorkAreas(activity.id, ids)}
                              />
                            ) : (
                              <span className="text-muted-foreground">
                                {workAreaRelations.filter(r => r.activity_id === activity.id).length} áreas
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{activity.measurement_unit}</TableCell>
                          <TableCell className="text-right">
                            {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            {isAdmin ? (
                              <MeasurementInlineSelect
                                ref={(el) => measurementRefs.current.set(activity.id, el)}
                                activityId={activity.id}
                                value={activity.measurement_id}
                                measurements={measurements}
                                measurementRelations={measurementRelations}
                                onSave={(measurementId) => onUpdateMeasurement(activity.id, measurementId)}
                              />
                            ) : (
                              <span className="text-muted-foreground truncate" title={medicionId}>
                                {medicionId}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-primary">
                            {formatCurrency(activity.resources_subtotal || 0)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onManageFiles(activity)}
                              className="flex items-center gap-1"
                            >
                              <File className="h-4 w-4" />
                              {activity.files_count || 0}
                            </Button>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => onEdit(activity)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onDuplicate(activity)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onManageFiles(activity)}>
                                    <FileUp className="h-4 w-4 mr-2" />
                                    Archivos
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => onDelete(activity)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
