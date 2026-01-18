import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText, User, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { cn } from '@/lib/utils';
import type { BudgetPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

// Define editable fields for tab navigation (simplified)
const EDITABLE_FIELDS = ['name', 'supplier_id'] as const;
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
  supplier_id: string | null;
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

interface Contact {
  id: string;
  name: string;
  surname: string | null;
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
    subtotalExternalCost: number;
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
  const { canEdit, isAdmin } = permissions;

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
      const sortedActivities = Array.from(phaseGroup.activities.entries())
        .sort(([, a], [, b]) => (a.activity?.code || '').localeCompare(b.activity?.code || ''));
      
      sortedActivities.forEach(([, activityGroup]) => {
        result.push(...activityGroup.resources);
      });
      
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

  // Helper to create tab navigation handlers for a field
  const createTabHandlers = (resourceId: string, field: EditableField) => ({
    onTabNext: () => navigateToField(resourceId, field, 'next'),
    onTabPrev: () => navigateToField(resourceId, field, 'prev'),
  });

  // Helper to register cell ref
  const registerRef = (resourceId: string, field: EditableField) => (el: HTMLElement | null) => {
    cellRefs.current.set(getCellKey(resourceId, field), el);
  };

  const renderResourceRow = (resource: BudgetResource, indent: number = 0) => {
    const fields = calculateFields(resource);

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
          <span ref={registerRef(resource.id, 'name')} tabIndex={-1}>
            <ResourceInlineEdit
              value={resource.name}
              displayValue={resource.name}
              onSave={(v) => onInlineUpdate(resource.id, 'name', v)}
              type="text"
              disabled={!canEdit}
              {...createTabHandlers(resource.id, 'name')}
            />
          </span>
        </TableCell>
        
        {/* 2. Uds calculadas */}
        <TableCell className="text-right font-mono">
          {formatNumber(fields.calculatedUnits)}
        </TableCell>
        
        {/* 3. Ud */}
        <TableCell className="text-center">
          {resource.unit || '-'}
        </TableCell>
        
        {/* 4. Suministrador */}
        <TableCell>
          <span ref={registerRef(resource.id, 'supplier_id')} tabIndex={-1}>
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
              {...createTabHandlers(resource.id, 'supplier_id')}
            />
          </span>
        </TableCell>
        
        {/* 5. SubTotal coste externo */}
        <TableCell className="text-right font-mono">
          {formatCurrency(fields.subtotalExternalCost)}
        </TableCell>
        
        {/* 6. SubTotal venta */}
        <TableCell className="text-right font-mono font-bold text-primary">
          {formatCurrency(fields.subtotalSales)}
        </TableCell>
        
        {/* Acciones - solo editar para abrir formulario completo */}
        {isAdmin && (
          <TableCell>
            <Button variant="ghost" size="icon" onClick={() => onEdit(resource)}>
              <Pencil className="h-4 w-4" />
            </Button>
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

  // Calculate column count for colspan
  const columnCount = 6 + (isAdmin ? 2 : 0); // 6 data columns + checkbox + actions if admin

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
              <TableHead className="min-w-[180px]">Recurso</TableHead>
              <TableHead className="text-right">Uds calc.</TableHead>
              <TableHead className="text-center">Ud</TableHead>
              <TableHead className="min-w-[140px]">Suministrador</TableHead>
              <TableHead className="text-right">SubT coste ext.</TableHead>
              <TableHead className="text-right">SubT venta</TableHead>
              {isAdmin && <TableHead className="w-[60px]">Acciones</TableHead>}
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
              
              // Calculate phase totals
              const phaseTotalSales = 
                phaseGroup.unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0) +
                Array.from(phaseGroup.activities.values()).reduce(
                  (sum, ag) => sum + ag.resources.reduce((s, r) => s + calculateFields(r).subtotalSales, 0), 0
                );
              const phaseTotalCost = 
                phaseGroup.unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalExternalCost, 0) +
                Array.from(phaseGroup.activities.values()).reduce(
                  (sum, ag) => sum + ag.resources.reduce((s, r) => s + calculateFields(r).subtotalExternalCost, 0), 0
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
                    <TableCell colSpan={columnCount}>
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
                        {showPhaseSubtotals && (
                          <>
                            <span className="ml-auto text-sm text-muted-foreground">
                              Coste: {formatCurrency(phaseTotalCost)}
                            </span>
                            <Badge variant="default" className="ml-2">
                              Venta: {formatCurrency(phaseTotalSales)}
                            </Badge>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Phase Content (Activities) */}
                  {isPhaseExpanded && (
                    <>
                      {activitiesArray.map(([activityKey, activityGroup]) => {
                        const isActivityExpanded = expandedActivities.has(activityKey);
                        const activityTotalSales = activityGroup.resources.reduce(
                          (sum, r) => sum + calculateFields(r).subtotalSales, 0
                        );
                        const activityTotalCost = activityGroup.resources.reduce(
                          (sum, r) => sum + calculateFields(r).subtotalExternalCost, 0
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
                              <TableCell colSpan={columnCount} style={{ paddingLeft: '32px' }}>
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
                                  {showActivitySubtotals && (
                                    <>
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        Coste: {formatCurrency(activityTotalCost)}
                                      </span>
                                      <Badge variant="secondary" className="ml-1">
                                        Venta: {formatCurrency(activityTotalSales)}
                                      </Badge>
                                    </>
                                  )}
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
                            <TableCell colSpan={columnCount} style={{ paddingLeft: '32px' }}>
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
