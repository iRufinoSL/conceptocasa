import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, FileText, User, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { cn } from '@/lib/utils';
import type { BudgetPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

// Define editable fields for tab navigation (in display order)
const EDITABLE_FIELDS = [
  'name', 'supplier_id'
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
  supplier_id: string | null;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
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
  permissions: BudgetPermissions;
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
  expandedActivities: Set<string>;
  onExpandedActivitiesChange: (activities: Set<string>) => void;
  canEditResource: (resource: BudgetResource) => boolean;
}

export function ResourcesActivityGroupedView({
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
  expandedActivities,
  onExpandedActivitiesChange,
  canEditResource,
}: ResourcesActivityGroupedViewProps) {
  // Tab navigation refs
  const cellRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const getCellKey = (resourceId: string, field: EditableField) => `${resourceId}-${field}`;

  // State for contacts (suppliers)
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  // Fetch contacts for supplier selection
  useEffect(() => {
    const fetchContacts = async () => {
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, name, surname')
        .order('name');
      setContacts(data || []);
    };
    fetchContacts();
  }, []);

  // Get contact name by ID
  const getContactName = useCallback((contactId: string | null) => {
    if (!contactId) return null;
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return null;
    return contact.surname ? `${contact.name} ${contact.surname}` : contact.name;
  }, [contacts]);

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
    const next = new Set(expandedActivities);
    if (next.has(activityId)) {
      next.delete(activityId);
    } else {
      next.add(activityId);
    }
    onExpandedActivitiesChange(next);
  };

  const expandAll = () => {
    const allActivityIds = groupedData.map(([id]) => id);
    onExpandedActivitiesChange(new Set(allActivityIds));
  };

  const collapseAll = () => {
    onExpandedActivitiesChange(new Set());
  };

  const renderResourceRow = (resource: BudgetResource, indent: number = 0) => {
    const fields = calculateFields(resource);

    // Helper to create tab navigation handlers for a field
    const createTabHandlers = (field: EditableField) => ({
      onTabNext: () => navigateToField(resource.id, field, 'next'),
      onTabPrev: () => navigateToField(resource.id, field, 'prev'),
    });

    // Helper to register cell ref
    const registerRef = (field: EditableField) => (el: HTMLElement | null) => {
      cellRefs.current.set(getCellKey(resource.id, field), el);
    };

    const canEdit = canEditResource(resource);
    
    // Calculate external cost subtotal (external_unit_cost * calculated_units)
    const externalCostSubtotal = (resource.external_unit_cost || 0) * fields.calculatedUnits;

    return (
      <TableRow 
        key={resource.id} 
        className={cn(selectedIds.has(resource.id) ? 'bg-muted/50' : '')}
      >
        {permissions.isAdmin && (
          <TableCell style={{ paddingLeft: `${indent * 16 + 8}px` }}>
            <Checkbox
              checked={selectedIds.has(resource.id)}
              onCheckedChange={() => onToggleSelect(resource.id)}
            />
          </TableCell>
        )}
        {/* 1. Recurso */}
        <TableCell className="font-medium" style={{ paddingLeft: permissions.isAdmin ? undefined : `${indent * 16 + 8}px` }}>
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
        {/* 2. Uds calc. */}
        <TableCell className="text-right font-mono">
          {formatNumber(fields.calculatedUnits)}
        </TableCell>
        {/* 3. Ud */}
        <TableCell className="text-center">
          {resource.unit || '-'}
        </TableCell>
        {/* 4. Suministrador */}
        <TableCell>
          <span ref={registerRef('supplier_id')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.supplier_id}
              displayValue={
                resource.supplier_id ? (
                  <span className="flex items-center gap-1 text-sm">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {getContactName(resource.supplier_id) || 'Cargando...'}
                  </span>
                ) : <span className="text-muted-foreground italic text-xs">-</span>
              }
              onSave={(v) => onInlineUpdate(resource.id, 'supplier_id', v === '__none__' ? null : v)}
              type="select"
              options={[
                { value: '__none__', label: 'Sin suministrador' },
                ...contacts.map(c => ({
                  value: c.id,
                  label: c.surname ? `${c.name} ${c.surname}` : c.name
                }))
              ]}
              disabled={!canEdit}
              {...createTabHandlers('supplier_id')}
            />
          </span>
        </TableCell>
        {/* 5. SubTotal coste externo */}
        <TableCell className="text-right font-mono">
          {formatCurrency(externalCostSubtotal)}
        </TableCell>
        {/* 6. SubTotal venta */}
        <TableCell className="text-right font-mono font-bold text-primary">
          {formatCurrency(fields.subtotalSales)}
        </TableCell>
        {permissions.isAdmin && (
          <TableCell>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(resource)} disabled={!canEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(resource)} disabled={!permissions.canDelete}>
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
              {permissions.isAdmin && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === resources.length && resources.length > 0}
                    onCheckedChange={onToggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[180px]">Recurso</TableHead>
              <TableHead className="text-right">Uds calc.</TableHead>
              <TableHead className="text-center">Ud</TableHead>
              <TableHead className="min-w-[140px]">Suministrador</TableHead>
              <TableHead className="text-right">SubT coste ext.</TableHead>
              <TableHead className="text-right">SubT venta</TableHead>
              {permissions.isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedData.map(([activityKey, activityGroup]) => {
              const isActivityExpanded = expandedActivities.has(activityKey);
              const activityResourceCount = activityGroup.resources.length;
              const activityTotalSales = activityGroup.resources.reduce(
                (sum, r) => sum + calculateFields(r).subtotalSales, 0
              );
              const activityTotalExternal = activityGroup.resources.reduce(
                (sum, r) => sum + ((r.external_unit_cost || 0) * calculateFields(r).calculatedUnits), 0
              );
              const activityLabel = getActivityLabel(activityGroup.activity);

              return (
                <React.Fragment key={activityKey}>
                  <TableRow 
                    className="bg-muted/20 hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleActivity(activityKey)}
                  >
                    <TableCell colSpan={permissions.isAdmin ? 8 : 7}>
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
                        <Badge variant="secondary" className="ml-1">
                          Ext: {formatCurrency(activityTotalExternal)}
                        </Badge>
                        <Badge variant="default" className="ml-1">
                          Venta: {formatCurrency(activityTotalSales)}
                        </Badge>
                      </div>
                    </TableCell>
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