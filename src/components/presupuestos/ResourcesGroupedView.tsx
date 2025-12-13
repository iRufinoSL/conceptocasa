import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Pencil, Trash2, Package, Wrench, Truck, Briefcase } from 'lucide-react';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { cn } from '@/lib/utils';

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

interface ResourcesGroupedViewProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  isAdmin: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  onInlineUpdate: (id: string, field: string, value: any) => Promise<void>;
  calculateFields: (resource: BudgetResource) => {
    safetyMarginUd: number;
    internalCostUd: number;
    salesMarginUd: number;
    salesCostUd: number;
    calculatedUnits: number;
    subtotalSales: number;
  };
  getActivityId: (activityId: string | null) => string;
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
};

const resourceTypeVariants: Record<string, string> = {
  'Producto': 'default',
  'Mano de obra': 'secondary',
  'Alquiler': 'outline',
  'Servicio': 'destructive',
};

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

export function ResourcesGroupedView({
  resources,
  activities,
  phases,
  isAdmin,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onInlineUpdate,
  calculateFields,
  getActivityId,
}: ResourcesGroupedViewProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  // Group resources by Phase -> Activity
  const groupedData = useMemo(() => {
    const phaseMap = new Map<string, {
      phase: Phase | null;
      activities: Map<string, {
        activity: Activity | null;
        resources: BudgetResource[];
      }>;
      unassignedResources: BudgetResource[];
    }>();

    // Initialize "Sin Fase" group
    phaseMap.set('__no_phase__', {
      phase: null,
      activities: new Map(),
      unassignedResources: [],
    });

    // Group resources
    resources.forEach((resource) => {
      const activity = resource.activity_id 
        ? activities.find(a => a.id === resource.activity_id) 
        : null;
      
      const phase = activity?.phase_id 
        ? phases.find(p => p.id === activity.phase_id) 
        : null;

      const phaseKey = phase?.id || '__no_phase__';

      if (!phaseMap.has(phaseKey)) {
        phaseMap.set(phaseKey, {
          phase,
          activities: new Map(),
          unassignedResources: [],
        });
      }

      const phaseGroup = phaseMap.get(phaseKey)!;

      if (activity) {
        if (!phaseGroup.activities.has(activity.id)) {
          phaseGroup.activities.set(activity.id, {
            activity,
            resources: [],
          });
        }
        phaseGroup.activities.get(activity.id)!.resources.push(resource);
      } else {
        phaseGroup.unassignedResources.push(resource);
      }
    });

    // Sort resources within each group
    phaseMap.forEach((phaseGroup) => {
      phaseGroup.unassignedResources.sort((a, b) => a.name.localeCompare(b.name));
      phaseGroup.activities.forEach((activityGroup) => {
        activityGroup.resources.sort((a, b) => a.name.localeCompare(b.name));
      });
    });

    // Convert to sorted array
    return Array.from(phaseMap.entries())
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__no_phase__') return 1;
        if (keyB === '__no_phase__') return -1;
        return (a.phase?.code || '').localeCompare(b.phase?.code || '');
      });
  }, [resources, activities, phases]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const toggleActivity = (activityId: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allPhaseIds = groupedData.map(([id]) => id);
    const allActivityIds = groupedData.flatMap(([, group]) => 
      Array.from(group.activities.keys())
    );
    setExpandedPhases(new Set(allPhaseIds));
    setExpandedActivities(new Set(allActivityIds));
  };

  const collapseAll = () => {
    setExpandedPhases(new Set());
    setExpandedActivities(new Set());
  };

  const renderResourceRow = (resource: BudgetResource, indent: number = 0) => {
    const fields = calculateFields(resource);
    
    const unitOptions = UNITS.map(u => ({ value: u, label: u }));
    const typeOptions = RESOURCE_TYPES.map(t => ({ value: t, label: t }));
    const activityOptions = activities.map(a => {
      const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
      return {
        value: a.id,
        label: `${phase?.code || ''} ${a.code}.-${a.name}`,
      };
    });

    return (
      <TableRow 
        key={resource.id} 
        className={cn(selectedIds.has(resource.id) ? 'bg-muted/50' : '')}
      >
        {isAdmin && (
          <TableCell style={{ paddingLeft: `${indent * 16 + 8}px` }}>
            <Checkbox
              checked={selectedIds.has(resource.id)}
              onCheckedChange={() => onToggleSelect(resource.id)}
            />
          </TableCell>
        )}
        <TableCell className="font-medium" style={{ paddingLeft: isAdmin ? undefined : `${indent * 16 + 8}px` }}>
          <ResourceInlineEdit
            value={resource.name}
            displayValue={resource.name}
            onSave={(v) => onInlineUpdate(resource.id, 'name', v)}
            type="text"
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell className="text-right font-mono">
          <ResourceInlineEdit
            value={resource.external_unit_cost}
            displayValue={formatCurrency(resource.external_unit_cost || 0)}
            onSave={(v) => onInlineUpdate(resource.id, 'external_unit_cost', v)}
            type="number"
            decimals={2}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell>
          <ResourceInlineEdit
            value={resource.unit}
            displayValue={resource.unit || '-'}
            onSave={(v) => onInlineUpdate(resource.id, 'unit', v)}
            type="select"
            options={unitOptions}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell>
          <ResourceInlineEdit
            value={resource.resource_type}
            displayValue={
              resource.resource_type ? (
                <Badge variant={resourceTypeVariants[resource.resource_type] as any || 'secondary'}>
                  {resourceTypeIcons[resource.resource_type]}
                  <span className="ml-1">{resource.resource_type}</span>
                </Badge>
              ) : '-'
            }
            onSave={(v) => onInlineUpdate(resource.id, 'resource_type', v)}
            type="select"
            options={typeOptions}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell className="text-right font-mono">
          <ResourceInlineEdit
            value={(resource.safety_margin_percent || 0.15) * 100}
            displayValue={formatPercent(resource.safety_margin_percent || 0.15)}
            onSave={(v) => onInlineUpdate(resource.id, 'safety_margin_percent', v / 100)}
            type="percent"
            decimals={1}
            disabled={!isAdmin}
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
            value={(resource.sales_margin_percent || 0.25) * 100}
            displayValue={formatPercent(resource.sales_margin_percent || 0.25)}
            onSave={(v) => onInlineUpdate(resource.id, 'sales_margin_percent', v / 100)}
            type="percent"
            decimals={1}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">
          {formatCurrency(fields.salesMarginUd)}
        </TableCell>
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrency(fields.salesCostUd)}
        </TableCell>
        <TableCell className="text-right font-mono">
          <ResourceInlineEdit
            value={resource.manual_units}
            displayValue={resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
            onSave={(v) => onInlineUpdate(resource.id, 'manual_units', v)}
            type="number"
            decimals={2}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell className="text-right font-mono">
          <ResourceInlineEdit
            value={resource.related_units}
            displayValue={resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
            onSave={(v) => onInlineUpdate(resource.id, 'related_units', v)}
            type="number"
            decimals={2}
            disabled={!isAdmin}
          />
        </TableCell>
        <TableCell className="text-right font-mono font-semibold">
          {formatNumber(fields.calculatedUnits)}
        </TableCell>
        <TableCell className="text-right font-mono font-bold text-primary">
          {formatCurrency(fields.subtotalSales)}
        </TableCell>
        {isAdmin && (
          <TableCell>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(resource)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(resource)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  };

  if (resources.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No hay recursos. Añade uno nuevo o importa desde CSV/Excel.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse controls */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expandir todo
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Colapsar todo
        </Button>
      </div>

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
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">%Seg.</TableHead>
              <TableHead className="text-right">€Seg.</TableHead>
              <TableHead className="text-right">€Coste int.</TableHead>
              <TableHead className="text-right">%Venta</TableHead>
              <TableHead className="text-right">€Venta</TableHead>
              <TableHead className="text-right">€Coste venta</TableHead>
              <TableHead className="text-right">Uds man.</TableHead>
              <TableHead className="text-right">Uds rel.</TableHead>
              <TableHead className="text-right">Uds calc.</TableHead>
              <TableHead className="text-right">€Subtotal</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedData.map(([phaseKey, phaseGroup]) => {
              const isPhaseExpanded = expandedPhases.has(phaseKey);
              const phaseResourceCount = 
                phaseGroup.unassignedResources.length +
                Array.from(phaseGroup.activities.values()).reduce(
                  (sum, ag) => sum + ag.resources.length, 0
                );
              const phaseTotal = 
                phaseGroup.unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0) +
                Array.from(phaseGroup.activities.values()).reduce(
                  (sum, ag) => sum + ag.resources.reduce((s, r) => s + calculateFields(r).subtotalSales, 0), 0
                );

              const activitiesArray = Array.from(phaseGroup.activities.entries()).sort(
                ([, a], [, b]) => (a.activity?.code || '').localeCompare(b.activity?.code || '')
              );

              return (
                <Collapsible key={phaseKey} open={isPhaseExpanded} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow 
                        className="bg-muted/30 hover:bg-muted/50 cursor-pointer"
                        onClick={() => togglePhase(phaseKey)}
                      >
                        <TableCell colSpan={isAdmin ? 15 : 14}>
                          <div className="flex items-center gap-2">
                            {isPhaseExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Folder className="h-4 w-4 text-primary" />
                            <span className="font-semibold">
                              {phaseGroup.phase 
                                ? `${phaseGroup.phase.code || ''} - ${phaseGroup.phase.name}`
                                : 'Sin Fase'}
                            </span>
                            <Badge variant="secondary" className="ml-2">
                              {phaseResourceCount} recursos
                            </Badge>
                            <Badge variant="default" className="ml-1">
                              {formatCurrency(phaseTotal)}
                            </Badge>
                          </div>
                        </TableCell>
                        {isAdmin && <TableCell />}
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <>
                        {activitiesArray.map(([activityKey, activityGroup]) => {
                          const isActivityExpanded = expandedActivities.has(activityKey);
                          const activityTotal = activityGroup.resources.reduce(
                            (sum, r) => sum + calculateFields(r).subtotalSales, 0
                          );
                          const phase = activityGroup.activity?.phase_id 
                            ? phases.find(p => p.id === activityGroup.activity?.phase_id) 
                            : null;
                          const activityLabel = activityGroup.activity
                            ? `${phase?.code || ''} ${activityGroup.activity.code}.-${activityGroup.activity.name}`
                            : 'Sin Actividad';

                          return (
                            <Collapsible key={activityKey} open={isActivityExpanded} asChild>
                              <>
                                <CollapsibleTrigger asChild>
                                  <TableRow 
                                    className="bg-muted/10 hover:bg-muted/20 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleActivity(activityKey);
                                    }}
                                  >
                                    <TableCell colSpan={isAdmin ? 15 : 14} style={{ paddingLeft: '32px' }}>
                                      <div className="flex items-center gap-2">
                                        {isActivityExpanded ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4" />
                                        )}
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{activityLabel}</span>
                                        <Badge variant="outline" className="ml-2">
                                          {activityGroup.resources.length} recursos
                                        </Badge>
                                        <Badge variant="secondary" className="ml-1">
                                          {formatCurrency(activityTotal)}
                                        </Badge>
                                      </div>
                                    </TableCell>
                                    {isAdmin && <TableCell />}
                                  </TableRow>
                                </CollapsibleTrigger>
                                <CollapsibleContent asChild>
                                  <>
                                    {activityGroup.resources.map((resource) => 
                                      renderResourceRow(resource, 3)
                                    )}
                                  </>
                                </CollapsibleContent>
                              </>
                            </Collapsible>
                          );
                        })}
                        {/* Unassigned resources (no activity) */}
                        {phaseGroup.unassignedResources.length > 0 && (
                          <>
                            <TableRow className="bg-muted/10">
                              <TableCell colSpan={isAdmin ? 16 : 15} style={{ paddingLeft: '32px' }}>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <FileText className="h-4 w-4" />
                                  <span className="text-sm italic">Sin Actividad</span>
                                  <Badge variant="outline" className="ml-2">
                                    {phaseGroup.unassignedResources.length} recursos
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                            {phaseGroup.unassignedResources.map((resource) => 
                              renderResourceRow(resource, 3)
                            )}
                          </>
                        )}
                      </>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
