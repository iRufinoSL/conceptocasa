import { useMemo, useState, Fragment, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Pencil, Trash2, Package, Wrench, Truck, Briefcase, CheckSquare, Filter, FilterX } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { ResourceInlineEdit } from './ResourceInlineEdit';

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
  created_at: string | null;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface CalculatedFields {
  safetyMarginUd: number;
  internalCostUd: number;
  salesMarginUd: number;
  salesCostUd: number;
  calculatedUnits: number;
  subtotalSales: number;
}

interface ResourcesTypePhaseActivityGroupedViewProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  permissions: any;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  onInlineUpdate: (id: string, field: string, value: any) => Promise<void>;
  calculateFields: (resource: BudgetResource) => CalculatedFields;
  getActivityId: (activityId: string | null) => string;
  canEditResource: (resource: BudgetResource) => boolean;
}

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos', 'Tarea'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
  'Impuestos': <Package className="h-4 w-4" />,
  'Tarea': <CheckSquare className="h-4 w-4" />,
};

const resourceTypeColors: Record<string, string> = {
  'Producto': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Mano de obra': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Alquiler': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Servicio': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'Impuestos': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Tarea': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Sin tipo': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export function ResourcesTypePhaseActivityGroupedView({
  resources,
  activities,
  phases,
  permissions,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onInlineUpdate,
  calculateFields,
  getActivityId,
  canEditResource,
}: ResourcesTypePhaseActivityGroupedViewProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(RESOURCE_TYPES));
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  
  // Activity selection for filtering
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const isAdmin = permissions?.isAdmin;

  // Build hierarchical structure: Type -> Phase -> Activity -> Resources
  const hierarchicalData = useMemo(() => {
    const structure: Record<string, Record<string, Record<string, BudgetResource[]>>> = {};
    
    // Initialize all known types
    RESOURCE_TYPES.forEach(type => {
      structure[type] = {};
    });
    structure['Sin tipo'] = {};
    
    // Group resources
    resources.forEach(resource => {
      const type = resource.resource_type || 'Sin tipo';
      if (!structure[type]) {
        structure[type] = {};
      }
      
      // Get activity and phase info
      const activity = resource.activity_id ? activities.find(a => a.id === resource.activity_id) : null;
      const phaseId = activity?.phase_id || '__no_phase__';
      const activityId = resource.activity_id || '__no_activity__';
      
      if (!structure[type][phaseId]) {
        structure[type][phaseId] = {};
      }
      if (!structure[type][phaseId][activityId]) {
        structure[type][phaseId][activityId] = [];
      }
      
      structure[type][phaseId][activityId].push(resource);
    });
    
    // Sort resources within each activity alphabetically
    Object.keys(structure).forEach(type => {
      Object.keys(structure[type]).forEach(phaseId => {
        Object.keys(structure[type][phaseId]).forEach(activityId => {
          structure[type][phaseId][activityId].sort((a, b) => 
            a.name.localeCompare(b.name, 'es')
          );
        });
      });
    });
    
    return structure;
  }, [resources, activities]);

  // Filter resources based on selected activities
  const filteredHierarchicalData = useMemo(() => {
    if (!showOnlySelected || selectedActivityIds.size === 0) {
      return hierarchicalData;
    }
    
    const filtered: Record<string, Record<string, Record<string, BudgetResource[]>>> = {};
    
    Object.entries(hierarchicalData).forEach(([type, phases]) => {
      Object.entries(phases).forEach(([phaseId, activities]) => {
        Object.entries(activities).forEach(([activityId, resources]) => {
          if (selectedActivityIds.has(activityId)) {
            if (!filtered[type]) filtered[type] = {};
            if (!filtered[type][phaseId]) filtered[type][phaseId] = {};
            filtered[type][phaseId][activityId] = resources;
          }
        });
      });
    });
    
    return filtered;
  }, [hierarchicalData, selectedActivityIds, showOnlySelected]);

  // Calculate totals per type
  const typeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(filteredHierarchicalData).forEach(([type, phases]) => {
      let total = 0;
      Object.values(phases).forEach(activities => {
        Object.values(activities).forEach(resourceList => {
          resourceList.forEach(r => {
            total += calculateFields(r).subtotalSales;
          });
        });
      });
      totals[type] = total;
    });
    return totals;
  }, [filteredHierarchicalData, calculateFields]);

  // Calculate totals per phase within a type
  const phaseTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    Object.entries(filteredHierarchicalData).forEach(([type, phases]) => {
      totals[type] = {};
      Object.entries(phases).forEach(([phaseId, activities]) => {
        let phaseTotal = 0;
        Object.values(activities).forEach(resourceList => {
          resourceList.forEach(r => {
            phaseTotal += calculateFields(r).subtotalSales;
          });
        });
        totals[type][phaseId] = phaseTotal;
      });
    });
    return totals;
  }, [filteredHierarchicalData, calculateFields]);

  // Calculate totals per activity within a phase
  const activityTotals = useMemo(() => {
    const totals: Record<string, Record<string, Record<string, number>>> = {};
    Object.entries(filteredHierarchicalData).forEach(([type, phases]) => {
      totals[type] = {};
      Object.entries(phases).forEach(([phaseId, activities]) => {
        totals[type][phaseId] = {};
        Object.entries(activities).forEach(([activityId, resourceList]) => {
          let activityTotal = 0;
          resourceList.forEach(r => {
            activityTotal += calculateFields(r).subtotalSales;
          });
          totals[type][phaseId][activityId] = activityTotal;
        });
      });
    });
    return totals;
  }, [filteredHierarchicalData, calculateFields]);

  // Count resources per type
  const typeResourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(filteredHierarchicalData).forEach(([type, phases]) => {
      let count = 0;
      Object.values(phases).forEach(activities => {
        Object.values(activities).forEach(resourceList => {
          count += resourceList.length;
        });
      });
      counts[type] = count;
    });
    return counts;
  }, [filteredHierarchicalData]);

  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  const togglePhase = (key: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedPhases(newExpanded);
  };

  const toggleActivity = (key: string) => {
    const newExpanded = new Set(expandedActivities);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedActivities(newExpanded);
  };

  // Toggle activity selection - when selecting, automatically filter to show only selected
  const toggleActivitySelection = (activityId: string) => {
    const newSelected = new Set(selectedActivityIds);
    if (newSelected.has(activityId)) {
      newSelected.delete(activityId);
      // If no activities selected anymore, show all
      if (newSelected.size === 0) {
        setShowOnlySelected(false);
      }
    } else {
      newSelected.add(activityId);
      // When selecting activities, automatically show only selected
      setShowOnlySelected(true);
    }
    setSelectedActivityIds(newSelected);
  };

  // Get phase name
  const getPhaseName = (phaseId: string) => {
    if (phaseId === '__no_phase__') return 'Sin fase';
    const phase = phases.find(p => p.id === phaseId);
    return phase ? `${phase.code || ''} ${phase.name}` : 'Sin fase';
  };

  // Get activity name
  const getActivityName = (activityId: string) => {
    if (activityId === '__no_activity__') return 'Sin actividad';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return 'Sin actividad';
    return `${activity.code}.-${activity.name}`;
  };

  // Order types: first the predefined ones, then "Sin tipo" if it has resources
  const orderedTypes = useMemo(() => {
    const types = [...RESOURCE_TYPES];
    if ((typeResourceCounts['Sin tipo'] || 0) > 0) {
      types.push('Sin tipo');
    }
    return types.filter(type => (typeResourceCounts[type] || 0) > 0);
  }, [typeResourceCounts]);

  return (
    <div className="space-y-4">
      {/* Show filter info only when filtering is active */}
      {showOnlySelected && selectedActivityIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Filter className="h-3 w-3" />
              Mostrando {selectedActivityIds.size} actividad{selectedActivityIds.size > 1 ? 'es' : ''} seleccionada{selectedActivityIds.size > 1 ? 's' : ''}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedActivityIds(new Set());
              setShowOnlySelected(false);
            }}
            className="gap-1.5"
          >
            <FilterX className="h-4 w-4" />
            Mostrar todos
          </Button>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === resources.length && resources.length > 0}
                    onCheckedChange={onToggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[200px]">Recurso</TableHead>
              <TableHead className="text-right">€Coste ud ext.</TableHead>
              <TableHead>Ud</TableHead>
              <TableHead className="text-right">%Seg.</TableHead>
              <TableHead className="text-right">€Seg.</TableHead>
              <TableHead className="text-right">€Coste int.</TableHead>
              <TableHead className="text-right">%Venta</TableHead>
              <TableHead className="text-right">€Venta</TableHead>
              <TableHead className="text-right">€Coste venta</TableHead>
              <TableHead className="text-right">Uds calc.</TableHead>
              <TableHead className="text-right">€Subtotal</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderedTypes.map(type => {
              const typePhases = filteredHierarchicalData[type] || {};
              const typeCount = typeResourceCounts[type] || 0;
              if (typeCount === 0) return null;
              
              const isTypeExpanded = expandedTypes.has(type);
              const typeTotal = typeTotals[type] || 0;
              const colorClass = resourceTypeColors[type] || resourceTypeColors['Sin tipo'];

              // Sort phases by code
              const sortedPhaseIds = Object.keys(typePhases).sort((a, b) => {
                if (a === '__no_phase__') return 1;
                if (b === '__no_phase__') return -1;
                const phaseA = phases.find(p => p.id === a);
                const phaseB = phases.find(p => p.id === b);
                return (phaseA?.code || '').localeCompare(phaseB?.code || '', 'es');
              });

              return (
                <Fragment key={`type-${type}`}>
                  {/* Type Header Row */}
                  <TableRow className="cursor-pointer hover:bg-muted/50 bg-muted/30">
                    {isAdmin && <TableCell className="py-2" />}
                    <TableCell 
                      colSpan={isAdmin ? 11 : 12}
                      className="py-2"
                      onClick={() => toggleType(type)}
                    >
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          {isTypeExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                        <Badge className={`${colorClass} gap-1.5`}>
                          {resourceTypeIcons[type]}
                          {type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {typeCount} recursos
                        </span>
                        <span className="ml-auto font-semibold">
                          {formatCurrency(typeTotal)}
                        </span>
                      </div>
                    </TableCell>
                    {isAdmin && <TableCell className="py-2" />}
                  </TableRow>

                  {/* Phases within type */}
                  {isTypeExpanded && sortedPhaseIds.map(phaseId => {
                    const phaseActivities = typePhases[phaseId] || {};
                    const phaseKey = `${type}-${phaseId}`;
                    const isPhaseExpanded = expandedPhases.has(phaseKey);
                    const phaseTotal = phaseTotals[type]?.[phaseId] || 0;
                    const phaseName = getPhaseName(phaseId);

                    // Count resources in this phase
                    const phaseResourceCount = Object.values(phaseActivities).reduce(
                      (sum, resources) => sum + resources.length, 0
                    );

                    // Sort activities by code
                    const sortedActivityIds = Object.keys(phaseActivities).sort((a, b) => {
                      if (a === '__no_activity__') return 1;
                      if (b === '__no_activity__') return -1;
                      const actA = activities.find(act => act.id === a);
                      const actB = activities.find(act => act.id === b);
                      return (actA?.code || '').localeCompare(actB?.code || '', 'es');
                    });

                    return (
                      <Fragment key={phaseKey}>
                        {/* Phase Header Row */}
                        <TableRow className="cursor-pointer hover:bg-accent/50 bg-accent/20">
                          {isAdmin && <TableCell className="py-1.5" />}
                          <TableCell 
                            colSpan={isAdmin ? 11 : 12}
                            className="py-1.5 pl-12"
                            onClick={() => togglePhase(phaseKey)}
                          >
                            <div className="flex items-center gap-3">
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                                {isPhaseExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </Button>
                              <span className="font-medium text-sm">{phaseName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({phaseResourceCount} recursos)
                              </span>
                              <span className="ml-auto font-medium text-sm">
                                Subtotal: {formatCurrency(phaseTotal)}
                              </span>
                            </div>
                          </TableCell>
                          {isAdmin && <TableCell className="py-1.5" />}
                        </TableRow>

                        {/* Activities within phase */}
                        {isPhaseExpanded && sortedActivityIds.map(activityId => {
                          const activityResources = phaseActivities[activityId] || [];
                          const activityKey = `${type}-${phaseId}-${activityId}`;
                          const isActivityExpanded = expandedActivities.has(activityKey);
                          const activityTotal = activityTotals[type]?.[phaseId]?.[activityId] || 0;
                          const activityName = getActivityName(activityId);
                          const isActivitySelected = activityId !== '__no_activity__' && selectedActivityIds.has(activityId);

                          return (
                            <Fragment key={activityKey}>
                              {/* Activity Header Row */}
                              <TableRow className="cursor-pointer hover:bg-primary/5 bg-primary/10">
                                {isAdmin && (
                                  <TableCell className="py-1">
                                    {activityId !== '__no_activity__' && (
                                      <Checkbox
                                        checked={isActivitySelected}
                                        onCheckedChange={() => toggleActivitySelection(activityId)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    )}
                                  </TableCell>
                                )}
                                <TableCell 
                                  colSpan={isAdmin ? 11 : 12}
                                  className="py-1 pl-20"
                                  onClick={() => toggleActivity(activityKey)}
                                >
                                  <div className="flex items-center gap-3">
                                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                                      {isActivityExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </Button>
                                    <span className={`text-sm ${isActivitySelected ? 'font-semibold text-primary' : ''}`}>
                                      {activityName}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      ({activityResources.length} recursos)
                                    </span>
                                    <span className="ml-auto font-medium text-sm text-primary">
                                      Subtotal: {formatCurrency(activityTotal)}
                                    </span>
                                  </div>
                                </TableCell>
                                {isAdmin && <TableCell className="py-1" />}
                              </TableRow>

                              {/* Resources within activity */}
                              {isActivityExpanded && activityResources.map(resource => {
                                const fields = calculateFields(resource);
                                const canEdit = canEditResource(resource);
                                
                                const unitOptions = UNITS.map(u => ({ value: u, label: u }));
                                const activityOptions = activities.map(a => {
                                  const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
                                  return {
                                    value: a.id,
                                    label: `${phase?.code || ''} ${a.code}.-${a.name}`,
                                  };
                                });

                                return (
                                  <TableRow key={resource.id} className={selectedIds.has(resource.id) ? 'bg-muted/50' : ''}>
                                    {isAdmin && (
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedIds.has(resource.id)}
                                          onCheckedChange={() => onToggleSelect(resource.id)}
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="font-medium pl-28">
                                      <ResourceInlineEdit
                                        value={resource.name}
                                        displayValue={resource.name}
                                        onSave={(v) => onInlineUpdate(resource.id, 'name', v)}
                                        type="text"
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.external_unit_cost}
                                        displayValue={formatCurrency(resource.external_unit_cost || 0)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'external_unit_cost', v)}
                                        type="number"
                                        decimals={2}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <ResourceInlineEdit
                                        value={resource.unit}
                                        displayValue={resource.unit || '-'}
                                        onSave={(v) => onInlineUpdate(resource.id, 'unit', v)}
                                        type="select"
                                        options={unitOptions}
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.safety_margin_percent}
                                        displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'safety_margin_percent', v)}
                                        type="percent"
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">
                                      {formatCurrency(fields.safetyMarginUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">
                                      {formatCurrency(fields.internalCostUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      <ResourceInlineEdit
                                        value={resource.sales_margin_percent}
                                        displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
                                        onSave={(v) => onInlineUpdate(resource.id, 'sales_margin_percent', v)}
                                        type="percent"
                                        disabled={!canEdit}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">
                                      {formatCurrency(fields.salesMarginUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold">
                                      {formatCurrency(fields.salesCostUd)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatNumber(fields.calculatedUnits)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-primary">
                                      {formatCurrency(fields.subtotalSales)}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onEdit(resource)}
                                            className="h-8 w-8"
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onDelete(resource)}
                                            className="h-8 w-8 text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            {resources.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 13 : 12} className="text-center text-muted-foreground py-8">
                  No hay recursos. Añade uno nuevo o importa desde CSV/Excel.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
