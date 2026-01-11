import { useMemo, useState, Fragment } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Pencil, Trash2, Package, Wrench, Truck, Briefcase, CheckSquare } from 'lucide-react';
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

interface ResourcesTypeGroupedViewProps {
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

export function ResourcesTypeGroupedView({
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
}: ResourcesTypeGroupedViewProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(RESOURCE_TYPES));

  // Group resources by type and sort alphabetically within each group
  const groupedByType = useMemo(() => {
    const groups: Record<string, BudgetResource[]> = {};
    
    // Initialize all known types
    RESOURCE_TYPES.forEach(type => {
      groups[type] = [];
    });
    groups['Sin tipo'] = [];
    
    // Group resources
    resources.forEach(resource => {
      const type = resource.resource_type || 'Sin tipo';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(resource);
    });
    
    // Sort each group alphabetically by name
    Object.keys(groups).forEach(type => {
      groups[type].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
    
    return groups;
  }, [resources]);

  // Calculate totals per type
  const typeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(groupedByType).forEach(([type, typeResources]) => {
      totals[type] = typeResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
    });
    return totals;
  }, [groupedByType, calculateFields]);

  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  const isAdmin = permissions?.isAdmin;

  // Order types: first the predefined ones, then "Sin tipo" if it has resources
  const orderedTypes = [...RESOURCE_TYPES];
  if (groupedByType['Sin tipo']?.length > 0) {
    orderedTypes.push('Sin tipo');
  }

  return (
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
            <TableHead className="min-w-[180px]">Actividad</TableHead>
            {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedTypes.map(type => {
            const typeResources = groupedByType[type] || [];
            if (typeResources.length === 0) return null;
            
            const isExpanded = expandedTypes.has(type);
            const typeTotal = typeTotals[type] || 0;
            const colorClass = resourceTypeColors[type] || resourceTypeColors['Sin tipo'];

            return (
              <Fragment key={`type-${type}`}>
                {/* Type Header Row */}
                <TableRow className="cursor-pointer hover:bg-muted/50 bg-muted/30">
                  {isAdmin && <TableCell className="py-2" />}
                  <TableCell 
                    colSpan={isAdmin ? 12 : 13}
                    className="py-2"
                    onClick={() => toggleType(type)}
                  >
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      <Badge className={`${colorClass} gap-1.5`}>
                        {resourceTypeIcons[type]}
                        {type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {typeResources.length} recursos
                      </span>
                      <span className="ml-auto font-semibold">
                        {formatCurrency(typeTotal)}
                      </span>
                    </div>
                  </TableCell>
                  {isAdmin && <TableCell className="py-2" />}
                </TableRow>
                {/* Resource rows within this type */}
                {isExpanded && typeResources.map(resource => {
                  const fields = calculateFields(resource);
                  const activityDisplay = getActivityId(resource.activity_id);
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
                      <TableCell className="font-medium pl-12">
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
                      <TableCell className="text-sm">
                        <ResourceInlineEdit
                          value={resource.activity_id}
                          displayValue={activityDisplay || 'Sin actividad'}
                          onSave={(v) => onInlineUpdate(resource.id, 'activity_id', v)}
                          type="select"
                          options={activityOptions}
                          disabled={!canEdit}
                        />
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
          {resources.length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 14 : 13} className="text-center text-muted-foreground py-8">
                No hay recursos. Añade uno nuevo o importa desde CSV/Excel.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}