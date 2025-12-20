import React, { useMemo, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Pencil, Trash2, Copy, Package, Wrench, Truck, Briefcase } from 'lucide-react';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { cn } from '@/lib/utils';
import type { BudgetPermissions } from '@/hooks/usePermissions';

// Define editable fields for tab navigation (in display order)
// Note: cost/margin fields will be conditionally excluded based on permissions
const ALL_EDITABLE_FIELDS = [
  'name', 'external_unit_cost', 'unit', 'resource_type', 'activity_id',
  'related_units', 'manual_units', 'safety_margin_percent', 'sales_margin_percent'
] as const;
type EditableField = typeof ALL_EDITABLE_FIELDS[number];

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
  permissions: BudgetPermissions;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  onDuplicate?: (resource: BudgetResource) => void;
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
  expandedPhases: Set<string>;
  expandedActivities: Set<string>;
  onExpandedPhasesChange: (phases: Set<string>) => void;
  onExpandedActivitiesChange: (activities: Set<string>) => void;
  canEditResource: (resource: BudgetResource) => boolean;
  visibleColumns?: string[];
  showPhaseSubtotals?: boolean;
  showActivitySubtotals?: boolean;
  hideUnassignedPhase?: boolean;
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
  permissions,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onDuplicate,
  onInlineUpdate,
  calculateFields,
  getActivityId,
  expandedPhases,
  expandedActivities,
  onExpandedPhasesChange,
  onExpandedActivitiesChange,
  canEditResource,
  visibleColumns,
  showPhaseSubtotals = true,
  showActivitySubtotals = true,
  hideUnassignedPhase = false,
}: ResourcesGroupedViewProps) {
  // Destructure permissions for easier access
  const { canViewCosts, canViewMargins, canViewCostDetails, canEdit, canDuplicate, canDelete, isAdmin } = permissions;
  
  // Define default columns if not specified
  const defaultColumns = ['activityId', 'usesMeasurement', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId', 'subtotal', 'files', 'actions'];
  const columnsToShow = visibleColumns || defaultColumns;
  
  // Helper function to check if a column should be visible
  const isColumnVisible = (columnId: string) => columnsToShow.includes(columnId);
  
  // Build editable fields list based on permissions
  const EDITABLE_FIELDS = useMemo(() => {
    const fields: EditableField[] = ['name'];
    if (canViewCosts) fields.push('external_unit_cost');
    fields.push('unit', 'resource_type', 'activity_id', 'related_units', 'manual_units');
    if (canViewMargins) fields.push('safety_margin_percent', 'sales_margin_percent');
    return fields;
  }, [canViewCosts, canViewMargins]);
  // Tab navigation refs
  const cellRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const getCellKey = (resourceId: string, field: EditableField) => `${resourceId}-${field}`;

  // Focus a specific cell
  const focusCell = useCallback((resourceId: string, field: EditableField) => {
    const key = getCellKey(resourceId, field);
    const element = cellRefs.current.get(key);
    if (element) {
      element.focus();
      element.click();
    }
  }, []);

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

    // Convert to sorted array, optionally filtering out unassigned phase
    return Array.from(phaseMap.entries())
      .filter(([key]) => !hideUnassignedPhase || key !== '__no_phase__')
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__no_phase__') return 1;
        if (keyB === '__no_phase__') return -1;
        return (a.phase?.code || '').localeCompare(b.phase?.code || '');
      });
  }, [resources, activities, phases, hideUnassignedPhase]);

  // Get flat list of resources in display order for navigation
  const flatResourceList = useMemo(() => {
    const result: BudgetResource[] = [];
    groupedData.forEach(([, phaseGroup]) => {
      // Activities sorted
      const sortedActivities = Array.from(phaseGroup.activities.entries())
        .sort(([, a], [, b]) => (a.activity?.code || '').localeCompare(b.activity?.code || ''));
      
      sortedActivities.forEach(([, activityGroup]) => {
        result.push(...activityGroup.resources);
      });
      
      // Unassigned resources
      result.push(...phaseGroup.unassignedResources);
    });
    return result;
  }, [groupedData]);

  // Navigate to next/prev editable field
  const navigateToField = useCallback((currentResourceId: string, currentField: EditableField, direction: 'next' | 'prev') => {
    const currentFieldIndex = EDITABLE_FIELDS.indexOf(currentField);
    const currentRowIndex = flatResourceList.findIndex(r => r.id === currentResourceId);
    
    if (currentRowIndex === -1) return;

    let nextRowIndex = currentRowIndex;
    let nextFieldIndex = currentFieldIndex;

    if (direction === 'next') {
      nextFieldIndex++;
      if (nextFieldIndex >= EDITABLE_FIELDS.length) {
        nextFieldIndex = 0;
        nextRowIndex++;
      }
    } else {
      nextFieldIndex--;
      if (nextFieldIndex < 0) {
        nextFieldIndex = EDITABLE_FIELDS.length - 1;
        nextRowIndex--;
      }
    }

    // Check bounds
    if (nextRowIndex < 0 || nextRowIndex >= flatResourceList.length) return;

    const nextResource = flatResourceList[nextRowIndex];
    const nextField = EDITABLE_FIELDS[nextFieldIndex];
    
    focusCell(nextResource.id, nextField);
  }, [flatResourceList, focusCell]);

  const togglePhase = (phaseId: string) => {
    const next = new Set(expandedPhases);
    if (next.has(phaseId)) {
      next.delete(phaseId);
    } else {
      next.add(phaseId);
    }
    onExpandedPhasesChange(next);
  };

  const toggleActivity = (activityId: string) => {
    const next = new Set(expandedActivities);
    if (next.has(activityId)) {
      next.delete(activityId);
    } else {
      next.add(activityId);
    }
    onExpandedActivitiesChange(next);
  };

  const expandAll = () => {
    const allPhaseIds = groupedData.map(([id]) => id);
    const allActivityIds = groupedData.flatMap(([, group]) => 
      Array.from(group.activities.keys())
    );
    onExpandedPhasesChange(new Set(allPhaseIds));
    onExpandedActivitiesChange(new Set(allActivityIds));
  };

  const collapseAll = () => {
    onExpandedPhasesChange(new Set());
    onExpandedActivitiesChange(new Set());
  };

  const renderResourceRow = (resource: BudgetResource, indent: number = 0) => {
    const fields = calculateFields(resource);
    
    const unitOptions = UNITS.map(u => ({ value: u, label: u }));
    const typeOptions = RESOURCE_TYPES.map(t => ({ value: t, label: t }));
    
    // Activity options sorted alphabetically by ActividadID with searchContent for full-text search
    const activityOptions = [
      { value: '__none__', label: 'Sin actividad', searchContent: 'sin actividad' },
      ...activities
        .map(a => {
          const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
          const actividadId = `${phase?.code || ''} ${a.code}.-${a.name}`;
          // Include all searchable content: code, name, description, phase info
          const searchContent = `${phase?.code || ''} ${phase?.name || ''} ${a.code} ${a.name}`.toLowerCase();
          return {
            value: a.id,
            label: actividadId,
            searchContent,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];

    // Helper to create tab navigation handlers for a field
    const createTabHandlers = (field: EditableField) => ({
      onTabNext: () => navigateToField(resource.id, field, 'next'),
      onTabPrev: () => navigateToField(resource.id, field, 'prev'),
    });

    // Helper to register cell ref
    const registerRef = (field: EditableField) => (el: HTMLElement | null) => {
      cellRefs.current.set(getCellKey(resource.id, field), el);
    };

    return (
      <TableRow 
        key={resource.id} 
        className={cn(selectedIds.has(resource.id) ? 'bg-muted/50' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Checkbox for selection (admin only) */}
        {isAdmin && (
          <TableCell style={{ paddingLeft: `${indent * 16 + 8}px` }}>
            <Checkbox
              checked={selectedIds.has(resource.id)}
              onCheckedChange={() => onToggleSelect(resource.id)}
            />
          </TableCell>
        )}
        {/* 1. Recurso */}
        <TableCell className="font-medium" style={{ paddingLeft: isAdmin ? undefined : `${indent * 16 + 8}px` }}>
          <span ref={registerRef('name')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.name}
              displayValue={resource.name}
              onSave={(v) => onInlineUpdate(resource.id, 'name', v)}
              type="text"
              disabled={!canEdit}
              {...createTabHandlers('name')}
            />
          </span>
        </TableCell>
        {/* 2. €Coste ud externa - only visible to those with canViewCosts */}
        {canViewCosts && (
          <TableCell className="text-right font-mono">
            <span ref={registerRef('external_unit_cost')} tabIndex={-1}>
              <ResourceInlineEdit
                value={resource.external_unit_cost}
                displayValue={formatCurrency(resource.external_unit_cost || 0)}
                onSave={(v) => onInlineUpdate(resource.id, 'external_unit_cost', v)}
                type="number"
                decimals={2}
                disabled={!canEdit}
                {...createTabHandlers('external_unit_cost')}
              />
            </span>
          </TableCell>
        )}
        {/* 3. Ud medida */}
        <TableCell>
          <span ref={registerRef('unit')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.unit}
              displayValue={resource.unit || '-'}
              onSave={(v) => onInlineUpdate(resource.id, 'unit', v)}
              type="select"
              options={unitOptions}
              disabled={!canEdit}
              {...createTabHandlers('unit')}
            />
          </span>
        </TableCell>
        {/* 4. Tipo recurso */}
        <TableCell>
          <span ref={registerRef('resource_type')} tabIndex={-1}>
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
              disabled={!canEdit}
              {...createTabHandlers('resource_type')}
            />
          </span>
        </TableCell>
        {/* 5. Actividad relacionada */}
        <TableCell>
          <span ref={registerRef('activity_id')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.activity_id || '__none__'}
              displayValue={getActivityId(resource.activity_id) || 'Sin actividad'}
              onSave={(v) => onInlineUpdate(resource.id, 'activity_id', v === '__none__' ? null : v)}
              type="searchable-select"
              options={activityOptions}
              disabled={!canEdit}
              {...createTabHandlers('activity_id')}
            />
          </span>
        </TableCell>
        {/* 6. Uds relacionadas */}
        <TableCell className="text-right font-mono">
          <span ref={registerRef('related_units')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.related_units}
              displayValue={resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
              onSave={(v) => onInlineUpdate(resource.id, 'related_units', v)}
              type="number"
              decimals={2}
              disabled={!canEdit}
              {...createTabHandlers('related_units')}
            />
          </span>
        </TableCell>
        {/* 7. Uds manual - conditionally visible */}
        {isColumnVisible('manualUnits') && (
          <TableCell className="text-right font-mono">
            <span ref={registerRef('manual_units')} tabIndex={-1}>
              <ResourceInlineEdit
                value={resource.manual_units}
                displayValue={resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
                onSave={(v) => onInlineUpdate(resource.id, 'manual_units', v)}
                type="number"
                decimals={2}
                allowNull={true}
                disabled={!canEdit}
                {...createTabHandlers('manual_units')}
              />
            </span>
          </TableCell>
        )}
        {/* 8. €SubTotal - conditionally visible */}
        {isColumnVisible('subtotal') && (
          <TableCell className="text-right font-mono font-bold text-primary">
            {formatCurrency(fields.subtotalSales)}
          </TableCell>
        )}
        {/* Margin columns - only visible to those with canViewMargins */}
        {canViewMargins && (
          <>
            <TableCell className="text-right font-mono">
              <span ref={registerRef('safety_margin_percent')} tabIndex={-1}>
                <ResourceInlineEdit
                  value={(resource.safety_margin_percent ?? 0.15) * 100}
                  displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
                  onSave={(v) => onInlineUpdate(resource.id, 'safety_margin_percent', Math.max(0, v) / 100)}
                  type="percent"
                  decimals={1}
                  disabled={!canEdit}
                  {...createTabHandlers('safety_margin_percent')}
                />
              </span>
            </TableCell>
            {canViewCostDetails && (
              <>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {formatCurrency(fields.safetyMarginUd)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {formatCurrency(fields.internalCostUd)}
                </TableCell>
              </>
            )}
            <TableCell className="text-right font-mono">
              <span ref={registerRef('sales_margin_percent')} tabIndex={-1}>
                <ResourceInlineEdit
                  value={(resource.sales_margin_percent ?? 0.25) * 100}
                  displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
                  onSave={(v) => onInlineUpdate(resource.id, 'sales_margin_percent', Math.max(0, v) / 100)}
                  type="percent"
                  decimals={1}
                  disabled={!canEdit}
                  {...createTabHandlers('sales_margin_percent')}
                />
              </span>
            </TableCell>
            {canViewCostDetails && (
              <>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {formatCurrency(fields.salesMarginUd)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatCurrency(fields.salesCostUd)}
                </TableCell>
              </>
            )}
          </>
        )}
        {/* Uds calculadas - conditionally visible */}
        {isColumnVisible('calculatedUnits') && (
          <TableCell className="text-right font-mono font-semibold">
            {formatNumber(fields.calculatedUnits)}
          </TableCell>
        )}
        {/* Actions column - based on permissions */}
        {(canEdit || canDuplicate || canDelete) && (
          <TableCell>
            <div className="flex items-center gap-1">
              {canEdit && (
                <Button variant="ghost" size="icon" onClick={() => onEdit(resource)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {canDuplicate && onDuplicate && (
                <Button variant="ghost" size="icon" onClick={() => onDuplicate(resource)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon" onClick={() => onDelete(resource)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
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
              {canViewCosts && <TableHead className="text-right">€Coste ud ext.</TableHead>}
              <TableHead>Ud</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="min-w-[180px]">ActividadID</TableHead>
              <TableHead className="text-right">Uds rel.</TableHead>
              {isColumnVisible('manualUnits') && <TableHead className="text-right">Uds man.</TableHead>}
              {isColumnVisible('subtotal') && <TableHead className="text-right">€SubT</TableHead>}
              {canViewMargins && (
                <>
                  <TableHead className="text-right">%Seg.</TableHead>
                  {canViewCostDetails && (
                    <>
                      <TableHead className="text-right">€Seg.</TableHead>
                      <TableHead className="text-right">€Coste int.</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">%Venta</TableHead>
                  {canViewCostDetails && (
                    <>
                      <TableHead className="text-right">€Venta</TableHead>
                      <TableHead className="text-right">€Coste venta</TableHead>
                    </>
                  )}
                </>
              )}
              {isColumnVisible('calculatedUnits') && <TableHead className="text-right">Uds calc.</TableHead>}
              {(canEdit || canDuplicate || canDelete) && <TableHead className="w-[100px]">Acciones</TableHead>}
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
                <React.Fragment key={phaseKey}>
                  {/* Phase Row */}
                  <TableRow 
                    className="bg-muted/30 hover:bg-muted/50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhase(phaseKey);
                    }}
                  >
                    <TableCell colSpan={isAdmin ? 16 : 15}>
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
                  </TableRow>

                  {/* Phase Content (Activities) */}
                  {isPhaseExpanded && (
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
                          <React.Fragment key={activityKey}>
                            {/* Activity Row */}
                            <TableRow 
                              className="bg-muted/10 hover:bg-muted/20 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActivity(activityKey);
                              }}
                            >
                              <TableCell colSpan={isAdmin ? 16 : 15} style={{ paddingLeft: '32px' }}>
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
                            </TableRow>

                            {/* Activity Resources */}
                            {isActivityExpanded && activityGroup.resources.map((resource) => 
                              renderResourceRow(resource, 3)
                            )}
                          </React.Fragment>
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
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
