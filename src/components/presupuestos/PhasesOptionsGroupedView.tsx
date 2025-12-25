import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Pencil, Trash2, MoreHorizontal, Copy, ClipboardList } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/format-utils';
import { OPTION_COLORS } from '@/lib/options-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  order_index: number | null;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  opciones: string[];
}

interface BudgetResource {
  id: string;
  activity_id: string | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
}

interface PhasesOptionsGroupedViewProps {
  phases: BudgetPhase[];
  activities: BudgetActivity[];
  resources: BudgetResource[];
  isAdmin: boolean;
  expandedOptions: Set<string>;
  onToggleExpanded: (option: string) => void;
  onEdit: (phase: BudgetPhase) => void;
  onDelete: (phase: BudgetPhase) => void;
  onDuplicate: (phase: BudgetPhase) => void;
  onEditActivity?: (activity: BudgetActivity) => void;
}

const OPCIONES = ['A', 'B', 'C'];

const calculateResourceSubtotal = (resource: BudgetResource): number => {
  return calcResourceSubtotal({
    externalUnitCost: resource.external_unit_cost,
    safetyPercent: resource.safety_margin_percent,
    salesPercent: resource.sales_margin_percent,
    manualUnits: resource.manual_units,
    relatedUnits: resource.related_units,
  });
};

export function PhasesOptionsGroupedView({
  phases,
  activities,
  resources,
  isAdmin,
  expandedOptions,
  onToggleExpanded,
  onEdit,
  onDelete,
  onDuplicate,
  onEditActivity,
}: PhasesOptionsGroupedViewProps) {
  // Calculate subtotals per option based on activities' opciones
  const optionSubtotals = useMemo(() => {
    const result: Record<string, number> = { A: 0, B: 0, C: 0 };
    
    activities.forEach(activity => {
      const activityOpciones = activity.opciones || ['A', 'B', 'C'];
      const activityResources = resources.filter(r => r.activity_id === activity.id);
      const activitySubtotal = activityResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
      
      activityOpciones.forEach(opcion => {
        if (result[opcion] !== undefined) {
          result[opcion] += activitySubtotal;
        }
      });
    });
    
    return result;
  }, [activities, resources]);

  // Group phases by option based on their activities
  const phasesByOption = useMemo(() => {
    const groups: Record<string, { phase: BudgetPhase; subtotal: number }[]> = { A: [], B: [], C: [] };
    
    phases.forEach(phase => {
      const phaseActivities = activities.filter(a => a.phase_id === phase.id);
      
      // Calculate which options this phase has based on its activities
      const phaseOptions = new Set<string>();
      let phaseSubtotalByOption: Record<string, number> = { A: 0, B: 0, C: 0 };
      
      phaseActivities.forEach(activity => {
        const activityOpciones = activity.opciones || ['A', 'B', 'C'];
        const activityResources = resources.filter(r => r.activity_id === activity.id);
        const activitySubtotal = activityResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
        
        activityOpciones.forEach(opt => {
          phaseOptions.add(opt);
          phaseSubtotalByOption[opt] += activitySubtotal;
        });
      });
      
      // Add phase to each option group it belongs to
      OPCIONES.forEach(opcion => {
        if (phaseOptions.has(opcion) || phaseActivities.length === 0) {
          groups[opcion].push({
            phase,
            subtotal: phaseSubtotalByOption[opcion] || 0
          });
        }
      });
    });
    
    // Sort phases alphabetically within each group
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const codeA = a.phase.code || '';
        const codeB = b.phase.code || '';
        return codeA.localeCompare(codeB) || a.phase.name.localeCompare(b.phase.name);
      });
    });
    
    return groups;
  }, [phases, activities, resources]);

  const generatePhaseId = (phase: BudgetPhase) => {
    return `${phase.code || ''} ${phase.name}`.trim();
  };

  return (
    <div className="space-y-2">
      {OPCIONES.map(opcion => {
        const phasesInOption = phasesByOption[opcion] || [];
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
                      {phasesInOption.length} fases
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
                  {phasesInOption.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>FaseID</TableHead>
                          <TableHead className="text-right">€SubTotal Opción {opcion}</TableHead>
                          {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {phasesInOption.map(({ phase, subtotal: phaseSubtotal }) => (
                          <TableRow key={phase.id}>
                            <TableCell className="font-medium">
                              {generatePhaseId(phase)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-primary">
                              {formatCurrency(phaseSubtotal)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover">
                                    <DropdownMenuItem onClick={() => onEdit(phase)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDuplicate(phase)}>
                                      <Copy className="h-4 w-4 mr-2" />
                                      Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDelete(phase)} className="text-destructive">
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Eliminar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay fases con actividades en opción {opcion}
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