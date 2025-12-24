import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, ChevronDown, Pencil, Trash2, MoreHorizontal, File, Copy } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/format-utils';
import { getAllAvailableOptions, getDisplayOptions, OPTION_COLORS } from '@/lib/options-utils';

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  uses_measurement: boolean;
  opciones: string[];
  phase_id: string | null;
  resources_subtotal?: number;
  files_count?: number;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface ActivitiesOptionsGroupedViewProps {
  activities: BudgetActivity[];
  phases: Phase[];
  isAdmin: boolean;
  canEdit: boolean;
  selectedIds: Set<string>;
  expandedOptions: Set<string>;
  onToggleExpanded: (option: string) => void;
  onToggleSelected: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (activity: BudgetActivity) => void;
  onDelete: (activity: BudgetActivity) => void;
  onDuplicate: (activity: BudgetActivity) => void;
  onManageFiles: (activity: BudgetActivity) => void;
  canEditActivity: (activityId: string) => boolean;
}

const OPCIONES = ['A', 'B', 'C'];

export function ActivitiesOptionsGroupedView({
  activities,
  phases,
  isAdmin,
  canEdit,
  selectedIds,
  expandedOptions,
  onToggleExpanded,
  onToggleSelected,
  onSelectAll,
  onEdit,
  onDelete,
  onDuplicate,
  onManageFiles,
  canEditActivity,
}: ActivitiesOptionsGroupedViewProps) {
  // Group activities by option
  const groupedByOption = useMemo(() => {
    const groups: Record<string, BudgetActivity[]> = {
      'A': [],
      'B': [],
      'C': [],
    };

    activities.forEach(activity => {
      const opciones = activity.opciones || ['A', 'B', 'C'];
      opciones.forEach(opcion => {
        if (groups[opcion]) {
          groups[opcion].push(activity);
        }
      });
    });

    // Sort activities alphabetically within each group
    Object.values(groups).forEach(group => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [activities]);

  // Calculate subtotals per option
  const subtotals = useMemo(() => {
    const result: Record<string, number> = {};
    OPCIONES.forEach(opcion => {
      result[opcion] = groupedByOption[opcion]?.reduce(
        (sum, activity) => sum + (activity.resources_subtotal || 0),
        0
      ) || 0;
    });
    return result;
  }, [groupedByOption]);

  const getPhaseById = (phaseId: string | null) => {
    if (!phaseId) return null;
    return phases.find(p => p.id === phaseId);
  };

  const allSelected = activities.length > 0 && activities.every(a => selectedIds.has(a.id));
  const someSelected = activities.some(a => selectedIds.has(a.id)) && !allSelected;

  return (
    <div className="space-y-2">
      {/* Select All header */}
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) {
                (el as any).indeterminate = someSelected;
              }
            }}
            onCheckedChange={onSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedIds.size > 0 ? `${selectedIds.size} seleccionadas` : 'Seleccionar todas'}
          </span>
        </div>
        <Badge variant="outline" className="font-mono">
          Total: {formatCurrency(Object.values(subtotals).reduce((a, b) => a + b, 0) / 3)}
        </Badge>
      </div>

      {/* Groups by Option */}
      {OPCIONES.map(opcion => {
        const activitiesInOption = groupedByOption[opcion] || [];
        const isExpanded = expandedOptions.has(opcion);
        const subtotal = subtotals[opcion];

        return (
          <Collapsible 
            key={opcion} 
            open={isExpanded} 
            onOpenChange={() => onToggleExpanded(opcion)}
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
                      className={`text-lg px-3 py-1 ${
                        opcion === 'A' ? 'bg-blue-500 hover:bg-blue-600' :
                        opcion === 'B' ? 'bg-amber-500 hover:bg-amber-600' :
                        'bg-emerald-500 hover:bg-emerald-600'
                      }`}
                    >
                      Opción {opcion}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {activitiesInOption.length} actividades
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">SubTotal Opción {opcion}</p>
                      <p className="text-lg font-bold font-mono text-primary">
                        {formatCurrency(subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t">
                  {activitiesInOption.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Actividad</TableHead>
                          <TableHead>Opciones</TableHead>
                          <TableHead>Fase</TableHead>
                          <TableHead className="text-center">Usa Med.</TableHead>
                          <TableHead className="text-right">€SubTotal</TableHead>
                          <TableHead>Archivos</TableHead>
                          {(isAdmin || canEdit) && <TableHead className="w-20">Acciones</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activitiesInOption.map(activity => {
                          const phase = getPhaseById(activity.phase_id);
                          const isSelected = selectedIds.has(activity.id);
                          const opciones = activity.opciones || ['A', 'B', 'C'];

                          return (
                            <TableRow 
                              key={activity.id}
                              className={isSelected ? 'bg-primary/5' : ''}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => onToggleSelected(activity.id)}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm">{activity.code}</TableCell>
                              <TableCell className="font-medium">{activity.name}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {opciones.map(op => (
                                    <Badge 
                                      key={op} 
                                      variant="outline" 
                                      className={`text-xs ${
                                        op === 'A' ? 'border-blue-500 text-blue-600' :
                                        op === 'B' ? 'border-amber-500 text-amber-600' :
                                        'border-emerald-500 text-emerald-600'
                                      }`}
                                    >
                                      {op}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {phase ? `${phase.code} ${phase.name}` : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={activity.uses_measurement ? 'default' : 'secondary'} className="text-xs">
                                  {activity.uses_measurement ? 'Sí' : 'No'}
                                </Badge>
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
                              {canEditActivity(activity.id) && (
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
                                      {isAdmin && (
                                        <>
                                          <DropdownMenuItem onClick={() => onDuplicate(activity)}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Duplicar
                                          </DropdownMenuItem>
                                          <DropdownMenuItem 
                                            onClick={() => onDelete(activity)}
                                            className="text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Eliminar
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No hay actividades con la opción {opcion}
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
