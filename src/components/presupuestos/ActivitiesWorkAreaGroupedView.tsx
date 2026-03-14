import { useMemo, useState, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Folder, MoreHorizontal, Pencil, Copy, FileUp, Trash2, File, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { MeasurementInlineSelect, MeasurementInlineSelectHandle } from './MeasurementInlineSelect';
import { WorkspaceInlineSelect, WorkspaceInlineSelectHandle } from './WorkspaceInlineSelect';
import type { WorkspaceRoom, WorkspaceRelation } from './WorkspaceInlineSelect';
import { cn } from '@/lib/utils';
import { BudgetPermissions } from '@/hooks/usePermissions';

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
  parent_activity_id?: string | null;
}

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
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
  workspaces: WorkspaceRoom[];
  workspaceRelations: WorkspaceRelation[];
  measurements: Measurement[];
  measurementRelations: MeasurementRelation[];
  permissions: BudgetPermissions;
  canEditActivity: (activityId: string) => boolean;
  onEdit: (activity: BudgetActivity) => void;
  onDuplicate: (activity: BudgetActivity) => void;
  onDelete: (activity: BudgetActivity) => void;
  onManageFiles: (activity: BudgetActivity) => void;
  onUpdateMeasurement: (activityId: string, measurementId: string | null) => void;
  onUpdateWorkspaces: (activityId: string, workspaceIds: string[]) => void;
  generateActivityId: (activity: BudgetActivity) => string;
  getMeasurementData: (activity: BudgetActivity) => { measurement: Measurement | null; relatedUnits: number; medicionId: string };
}

export function ActivitiesWorkAreaGroupedView({
  activities,
  phases,
  workspaces,
  workspaceRelations,
  measurements,
  measurementRelations,
  permissions,
  canEditActivity,
  onEdit,
  onDuplicate,
  onDelete,
  onManageFiles,
  onUpdateMeasurement,
  onUpdateWorkspaces,
  generateActivityId,
  getMeasurementData
}: ActivitiesWorkAreaGroupedViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));
  const measurementRefs = useRef<Map<string, MeasurementInlineSelectHandle | null>>(new Map());
  const workspaceRefs = useRef<Map<string, WorkspaceInlineSelectHandle | null>>(new Map());

  // Group activities by workspace room
  const groupedData = useMemo(() => {
    const wsMap = new Map<string, {
      workspace: WorkspaceRoom | null;
      activities: BudgetActivity[];
      subtotal: number;
    }>();

    // Group by workspace
    workspaces.forEach(ws => {
      const activityIds = workspaceRelations
        .filter(r => r.workspace_id === ws.id)
        .map(r => r.activity_id);

      const wsActivities = activities.filter(a => activityIds.includes(a.id));
      const subtotal = wsActivities.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);

      if (wsActivities.length > 0) {
        wsMap.set(ws.id, {
          workspace: ws,
          activities: wsActivities.sort((a, b) => a.name.localeCompare(b.name)),
          subtotal
        });
      }
    });

    // Find unassigned activities
    const allLinkedActivityIds = new Set(workspaceRelations.map(r => r.activity_id));
    const unassigned = activities.filter(a => !allLinkedActivityIds.has(a.id));
    const unassignedSubtotal = unassigned.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);

    if (unassigned.length > 0) {
      wsMap.set('__no_workspace__', {
        workspace: null,
        activities: unassigned.sort((a, b) => a.name.localeCompare(b.name)),
        subtotal: unassignedSubtotal
      });
    }

    return Array.from(wsMap.entries())
      .map(([wsId, data]) => ({ wsId, ...data }))
      .sort((a, b) => {
        if (a.wsId === '__no_workspace__') return 1;
        if (b.wsId === '__no_workspace__') return -1;
        return (a.workspace?.name || '').localeCompare(b.workspace?.name || '');
      });
  }, [activities, workspaces, workspaceRelations]);

  const toggleGroup = (wsId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = groupedData.map(g => g.wsId);
    setExpandedGroups(new Set(allIds));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const getPhaseById = (phaseId: string | null) => phases.find(p => p.id === phaseId);

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

      {/* Grouped by workspace */}
      <div className="space-y-3">
        {groupedData.map(({ wsId, workspace, activities: wsActivities, subtotal }) => {
          const isExpanded = expandedGroups.has(wsId);

          return (
            <div key={wsId} className="border rounded-lg overflow-hidden">
              {/* Workspace Header */}
              <button
                className="w-full bg-muted/30 px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                onClick={() => toggleGroup(wsId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="font-bold text-lg">
                    {workspace ? workspace.name : 'Sin espacio asignado'}
                  </span>
                  <Badge variant="outline">
                    {wsActivities.length} actividades
                  </Badge>
                </div>
                <span className="font-semibold text-primary text-lg">
                  {formatCurrency(subtotal)}
                </span>
              </button>

              {/* Activities Table */}
              {isExpanded && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ActividadID</TableHead>
                      <TableHead className="text-center w-16">Uso Pres.</TableHead>
                      <TableHead>Actividad</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Espacios</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Uds Relac.</TableHead>
                      <TableHead>MediciónID</TableHead>
                      <TableHead className="text-right">€SubTotal</TableHead>
                      <TableHead>Archivos</TableHead>
                      {(permissions.isAdmin || permissions.canEdit) && <TableHead className="w-20">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wsActivities.map((activity) => {
                      const phase = getPhaseById(activity.phase_id);
                      const { relatedUnits, medicionId } = getMeasurementData(activity);

                      return (
                        <TableRow key={activity.id}>
                          <TableCell className="font-mono text-sm">
                            {generateActivityId(activity)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={activity.uses_measurement !== false ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {activity.uses_measurement !== false ? 'Sí' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{activity.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {phase ? `${phase.code} ${phase.name}` : '-'}
                          </TableCell>
                          <TableCell className="max-w-[150px]">
                            {canEditActivity(activity.id) ? (
                              <WorkspaceInlineSelect
                                ref={(el) => workspaceRefs.current.set(activity.id, el)}
                                activityId={activity.id}
                                workspaces={workspaces}
                                workspaceRelations={workspaceRelations}
                                inheritedWorkspaceIds={activity.parent_activity_id ? workspaceRelations.filter(r => r.activity_id === activity.parent_activity_id).map(r => r.workspace_id) : undefined}
                                onSave={(ids) => onUpdateWorkspaces(activity.id, ids)}
                              />
                            ) : (
                              <span className="text-muted-foreground">
                                {workspaceRelations.filter(r => r.activity_id === activity.id).length} espacios
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{activity.measurement_unit}</TableCell>
                          <TableCell className="text-right">
                            {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            {canEditActivity(activity.id) ? (
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
                          <TableCell>
                            {canEditActivity(activity.id) && (
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
                                  {permissions.isAdmin && (
                                    <>
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
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
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
