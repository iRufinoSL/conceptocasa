import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, ChevronDown, Pencil, Trash2, MoreHorizontal, Package } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { OPTION_COLORS } from '@/lib/options-utils';
import { percentToRatio } from '@/lib/budget-pricing';

interface BudgetResource {
  id: string;
  budget_id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
  description: string | null;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
  opciones?: string[];
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface ResourcesOptionsGroupedViewProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  isAdmin: boolean;
  selectedIds: Set<string>;
  expandedOptions: Set<string>;
  onToggleExpanded: (option: string) => void;
  onToggleSelected: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  canEditResource: (resourceId: string) => boolean;
}

const OPCIONES = ['A', 'B', 'C'];

export function ResourcesOptionsGroupedView({
  resources,
  activities,
  phases,
  isAdmin,
  selectedIds,
  expandedOptions,
  onToggleExpanded,
  onToggleSelected,
  onSelectAll,
  onEdit,
  onDelete,
  canEditResource,
}: ResourcesOptionsGroupedViewProps) {
  // Calculate subtotal for a resource
  const calculateFields = (resource: BudgetResource) => {
    const externalCost = resource.external_unit_cost || 0;
    const safetyRatio = percentToRatio(resource.safety_margin_percent, 0.15);
    const salesRatio = percentToRatio(resource.sales_margin_percent, 0.25);

    const safetyMarginUd = externalCost * safetyRatio;
    const internalCostUd = externalCost + safetyMarginUd;
    const salesMarginUd = internalCostUd * salesRatio;
    const salesCostUd = internalCostUd + salesMarginUd;

    const calculatedUnits = resource.manual_units !== null
      ? resource.manual_units
      : (resource.related_units || 0);

    const subtotalSales = calculatedUnits * salesCostUd;

    return { subtotalSales, calculatedUnits };
  };

  // Get activity options
  const getActivityOptions = (activityId: string | null): string[] => {
    if (!activityId) return ['A', 'B', 'C'];
    const activity = activities.find(a => a.id === activityId);
    return activity?.opciones || ['A', 'B', 'C'];
  };

  // Get ActivityID for display
  const getActivityId = (activityId: string | null) => {
    if (!activityId) return '-';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '-';
    
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.-${activity.name}`;
  };

  // Group resources by option based on their activity's opciones
  const resourcesByOption = useMemo(() => {
    const groups: Record<string, BudgetResource[]> = { A: [], B: [], C: [] };
    
    resources.forEach(resource => {
      const opciones = getActivityOptions(resource.activity_id);
      opciones.forEach(opcion => {
        if (groups[opcion]) {
          groups[opcion].push(resource);
        }
      });
    });
    
    // Sort alphabetically within each group
    Object.values(groups).forEach(group => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return groups;
  }, [resources, activities]);

  // Calculate subtotals per option
  const optionSubtotals = useMemo(() => {
    const result: Record<string, number> = {};
    OPCIONES.forEach(opcion => {
      result[opcion] = resourcesByOption[opcion]?.reduce(
        (sum, resource) => sum + calculateFields(resource).subtotalSales,
        0
      ) || 0;
    });
    return result;
  }, [resourcesByOption]);

  const allSelected = resources.length > 0 && resources.every(r => selectedIds.has(r.id));
  const someSelected = resources.some(r => selectedIds.has(r.id)) && !allSelected;

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
            {selectedIds.size > 0 ? `${selectedIds.size} seleccionados` : 'Seleccionar todos'}
          </span>
        </div>
      </div>

      {/* Groups by Option */}
      {OPCIONES.map(opcion => {
        const resourcesInOption = resourcesByOption[opcion] || [];
        const isExpanded = expandedOptions.has(opcion);
        const subtotal = optionSubtotals[opcion];
        const colors = OPTION_COLORS[opcion];

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
                      className={`text-lg px-3 py-1 ${colors.bg} hover:opacity-80`}
                    >
                      Opción {opcion}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {resourcesInOption.length} recursos
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">SubTotal Opción {opcion}</p>
                      <p className={`text-lg font-bold font-mono ${colors.text}`}>
                        {formatCurrency(subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t">
                  {resourcesInOption.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Recurso</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Actividad</TableHead>
                          <TableHead className="text-right">Uds</TableHead>
                          <TableHead className="text-right">€SubTotal</TableHead>
                          {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resourcesInOption.map(resource => {
                          const { subtotalSales, calculatedUnits } = calculateFields(resource);
                          const isSelected = selectedIds.has(resource.id);

                          return (
                            <TableRow 
                              key={resource.id}
                              className={isSelected ? 'bg-primary/5' : ''}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => onToggleSelected(resource.id)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {canEditResource(resource.id) ? (
                                  <button
                                    onClick={() => onEdit(resource)}
                                    className="text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                                  >
                                    {resource.name}
                                  </button>
                                ) : (
                                  resource.name
                                )}
                              </TableCell>
                              <TableCell>
                                {resource.resource_type ? (
                                  <Badge variant="outline" className="text-xs">
                                    {resource.resource_type}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                {getActivityId(resource.activity_id)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatNumber(calculatedUnits)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-primary">
                                {formatCurrency(subtotalSales)}
                              </TableCell>
                              {canEditResource(resource.id) && (
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-popover">
                                      <DropdownMenuItem onClick={() => onEdit(resource)}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Editar
                                      </DropdownMenuItem>
                                      {isAdmin && (
                                        <DropdownMenuItem 
                                          onClick={() => onDelete(resource)}
                                          className="text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Eliminar
                                        </DropdownMenuItem>
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
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay recursos con opción {opcion}
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