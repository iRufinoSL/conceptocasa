import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Pencil, Trash2, Package, Wrench, Truck, Briefcase } from 'lucide-react';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { cn } from '@/lib/utils';

// Define editable fields for tab navigation (in display order)
const EDITABLE_FIELDS = [
  'name', 'external_unit_cost', 'unit', 'resource_type', 'activity_id',
  'related_units', 'manual_units', 'safety_margin_percent', 'sales_margin_percent'
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

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

interface ResourcesActivityGroupedViewProps {
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

export function ResourcesActivityGroupedView({
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
}: ResourcesActivityGroupedViewProps) {
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

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

  // Group resources by Activity only
  const groupedData = useMemo(() => {
    const activityMap = new Map<string, {
      activity: Activity | null;
      resources: BudgetResource[];
    }>();

    // Initialize "Sin Actividad" group
    activityMap.set('__no_activity__', {
      activity: null,
      resources: [],
    });

    // Group resources
    resources.forEach((resource) => {
      const activity = resource.activity_id 
        ? activities.find(a => a.id === resource.activity_id) 
        : null;
      
      const activityKey = activity?.id || '__no_activity__';

      if (!activityMap.has(activityKey)) {
        activityMap.set(activityKey, {
          activity,
          resources: [],
        });
      }

      activityMap.get(activityKey)!.resources.push(resource);
    });

    // Sort resources within each group
    activityMap.forEach((activityGroup) => {
      activityGroup.resources.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Convert to sorted array by ActivityID
    return Array.from(activityMap.entries()).sort(([keyA, a], [keyB, b]) => {
      if (keyA === '__no_activity__') return 1;
      if (keyB === '__no_activity__') return -1;
      const labelA = getActivityLabel(a.activity);
      const labelB = getActivityLabel(b.activity);
      return labelA.localeCompare(labelB);
    });
  }, [resources, activities, phases]);

  function getActivityLabel(activity: Activity | null) {
    if (!activity) return 'Sin Actividad';
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    return `${phase?.code || ''} ${activity.code}.-${activity.name}`;
  }

  // Get flat list of resources in display order for navigation
  const flatResourceList = useMemo(() => {
    const result: BudgetResource[] = [];
    groupedData.forEach(([, activityGroup]) => {
      result.push(...activityGroup.resources);
    });
    return result;
  }, [groupedData]);

  // Navigate to next/prev editable field
  const navigateToField = useCallback(
    (currentResourceId: string, currentField: EditableField, direction: 'next' | 'prev') => {
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
    },
    [flatResourceList, focusCell]
  );

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
    const allActivityIds = groupedData.map(([id]) => id);
    setExpandedActivities(new Set(allActivityIds));
  };

  const collapseAll = () => {
    setExpandedActivities(new Set());
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
      >
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
              disabled={!isAdmin}
              {...createTabHandlers('name')}
            />
          </span>
        </TableCell>
        {/* 2. €Coste ud externa */}
        <TableCell className="text-right font-mono">
          <span ref={registerRef('external_unit_cost')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.external_unit_cost}
              displayValue={formatCurrency(resource.external_unit_cost || 0)}
              onSave={(v) => onInlineUpdate(resource.id, 'external_unit_cost', v)}
              type="number"
              decimals={2}
              disabled={!isAdmin}
              {...createTabHandlers('external_unit_cost')}
            />
          </span>
        </TableCell>
        {/* 3. Ud medida */}
        <TableCell>
          <span ref={registerRef('unit')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.unit}
              displayValue={resource.unit || '-'}
              onSave={(v) => onInlineUpdate(resource.id, 'unit', v)}
              type="select"
              options={unitOptions}
              disabled={!isAdmin}
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
              disabled={!isAdmin}
              {...createTabHandlers('resource_type')}
            />
          </span>
        </TableCell>
        {/* 5. Uds relacionadas */}
        <TableCell className="text-right font-mono">
          <span ref={registerRef('related_units')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.related_units}
              displayValue={resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
              onSave={(v) => onInlineUpdate(resource.id, 'related_units', v)}
              type="number"
              decimals={2}
              disabled={!isAdmin}
              {...createTabHandlers('related_units')}
            />
          </span>
        </TableCell>
        {/* 6. Uds manual */}
        <TableCell className="text-right font-mono">
          <span ref={registerRef('manual_units')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.manual_units}
              displayValue={resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
              onSave={(v) => onInlineUpdate(resource.id, 'manual_units', v)}
              type="number"
              decimals={2}
              allowNull={true}
              disabled={!isAdmin}
              {...createTabHandlers('manual_units')}
            />
          </span>
        </TableCell>
        {/* 7. €SubTotal */}
        <TableCell className="text-right font-mono font-bold text-primary">
          {formatCurrency(fields.subtotalSales)}
        </TableCell>
        {/* Remaining columns */}
        <TableCell className="text-right font-mono">
          <span ref={registerRef('safety_margin_percent')} tabIndex={-1}>
            <ResourceInlineEdit
              value={(resource.safety_margin_percent ?? 0.15) * 100}
              displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
              onSave={(v) => onInlineUpdate(resource.id, 'safety_margin_percent', Math.max(0, v) / 100)}
              type="percent"
              decimals={1}
              disabled={!isAdmin}
              {...createTabHandlers('safety_margin_percent')}
            />
          </span>
        </TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">
          {formatCurrency(fields.safetyMarginUd)}
        </TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">
          {formatCurrency(fields.internalCostUd)}
        </TableCell>
        <TableCell className="text-right font-mono">
          <span ref={registerRef('sales_margin_percent')} tabIndex={-1}>
            <ResourceInlineEdit
              value={(resource.sales_margin_percent ?? 0.25) * 100}
              displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
              onSave={(v) => onInlineUpdate(resource.id, 'sales_margin_percent', Math.max(0, v) / 100)}
              type="percent"
              decimals={1}
              disabled={!isAdmin}
              {...createTabHandlers('sales_margin_percent')}
            />
          </span>
        </TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">
          {formatCurrency(fields.salesMarginUd)}
        </TableCell>
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrency(fields.salesCostUd)}
        </TableCell>
        <TableCell className="text-right font-mono font-semibold">
          {formatNumber(fields.calculatedUnits)}
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
              <TableHead className="text-right">Uds rel.</TableHead>
              <TableHead className="text-right">Uds man.</TableHead>
              <TableHead className="text-right">€SubT</TableHead>
              <TableHead className="text-right">%Seg.</TableHead>
              <TableHead className="text-right">€Seg.</TableHead>
              <TableHead className="text-right">€Coste int.</TableHead>
              <TableHead className="text-right">%Venta</TableHead>
              <TableHead className="text-right">€Venta</TableHead>
              <TableHead className="text-right">€Coste venta</TableHead>
              <TableHead className="text-right">Uds calc.</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedData.map(([activityKey, activityGroup]) => {
              const isActivityExpanded = expandedActivities.has(activityKey);
              const activityResourceCount = activityGroup.resources.length;
              const activityTotal = activityGroup.resources.reduce(
                (sum, r) => sum + calculateFields(r).subtotalSales, 0
              );
              const activityLabel = getActivityLabel(activityGroup.activity);

              return (
                <React.Fragment key={activityKey}>
                  <TableRow 
                    className="bg-muted/20 hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleActivity(activityKey)}
                  >
                    <TableCell colSpan={isAdmin ? 15 : 14}>
                      <div className="flex items-center gap-2">
                        {isActivityExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{activityLabel}</span>
                        <Badge variant="outline" className="ml-2">
                          {activityResourceCount} recursos
                        </Badge>
                        <Badge variant="default" className="ml-1">
                          {formatCurrency(activityTotal)}
                        </Badge>
                      </div>
                    </TableCell>
                    {isAdmin && <TableCell />}
                  </TableRow>
                  {isActivityExpanded && activityGroup.resources.map((resource) => 
                    renderResourceRow(resource, 2)
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