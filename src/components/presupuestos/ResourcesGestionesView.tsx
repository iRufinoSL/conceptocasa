import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, User, Users, Calendar, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { Pencil, Package, Wrench, Truck, Briefcase, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { GestionesDateView } from './GestionesDateView';
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

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
  start_date: string | null;
  duration_days: number | null;
  end_date: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
  start_date: string | null;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface ResourcesGestionesViewProps {
  budgetId: string;
  budgetName?: string;
  isAdmin: boolean;
  onEdit?: (resource: BudgetResource) => void;
  onEditActivity?: (activityId: string) => void;
  onEditTask?: (taskId: string) => void;
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
  'Tarea': <CheckSquare className="h-4 w-4" />,
  'Herramienta': <Wrench className="h-4 w-4" />,
};

type SortMode = 'fecha_objetivo' | 'supplier' | 'activity_date';

export function ResourcesGestionesView({
  budgetId,
  budgetName = 'Presupuesto',
  isAdmin,
  onEdit,
  onEditActivity,
  onEditTask,
}: ResourcesGestionesViewProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('fecha_objetivo');
  const [isLoading, setIsLoading] = useState(true);
  const [editingStartDate, setEditingStartDate] = useState<{ activityId: string; value: string } | null>(null);
  // Fetch all data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .neq('resource_type', 'Tarea'), // Exclude tasks, we only want resources
        supabase
          .from('budget_activities')
          .select('id, code, name, phase_id, start_date, duration_days, end_date')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_phases')
          .select('id, code, name, start_date')
          .eq('budget_id', budgetId)
      ]);

      if (resourcesRes.error) throw resourcesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;

      setResources(resourcesRes.data || []);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);

      // Fetch suppliers
      const supplierIds = [...new Set((resourcesRes.data || []).map(r => r.supplier_id).filter(Boolean))] as string[];
      if (supplierIds.length > 0) {
        const { data: suppliersData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname, email, phone')
          .in('id', supplierIds);
        setSuppliers(suppliersData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate fields for resource
  const calculateFields = (resource: BudgetResource) => {
    const externalCost = resource.external_unit_cost || 0;
    const safetyPercent = resource.safety_margin_percent ?? 15;
    const salesPercent = resource.sales_margin_percent ?? 25;
    
    const safetyRatio = safetyPercent / 100;
    const salesRatio = salesPercent / 100;
    
    const internalCostUd = externalCost * (1 + safetyRatio);
    const salesCostUd = internalCostUd * (1 + salesRatio);
    
    const calculatedUnits = resource.manual_units !== null 
      ? resource.manual_units 
      : (resource.related_units || 0);
    
    const subtotalSales = calculatedUnits * salesCostUd;
    
    return { calculatedUnits, subtotalSales };
  };

  // Get activity info with effective start date
  const getActivityInfo = useCallback((activityId: string | null) => {
    if (!activityId) return null;
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return null;

    // Get effective start date: activity's own start_date OR phase's start_date
    let effectiveStartDate = activity.start_date;
    if (!effectiveStartDate && activity.phase_id) {
      const phase = phases.find(p => p.id === activity.phase_id);
      if (phase?.start_date) {
        effectiveStartDate = phase.start_date;
      }
    }

    // Calculate end date if we have start date and duration
    let effectiveEndDate = activity.end_date;
    if (!effectiveEndDate && effectiveStartDate && activity.duration_days) {
      const endDate = addDays(parseISO(effectiveStartDate), activity.duration_days);
      effectiveEndDate = format(endDate, 'yyyy-MM-dd');
    }

    return {
      ...activity,
      effectiveStartDate,
      effectiveEndDate,
    };
  }, [activities, phases]);

  // Get supplier name
  const getSupplierLabel = (supplierId: string) => {
    if (supplierId === '__no_supplier__') return 'Sin suministrador';
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return 'Cargando...';
    return supplier.surname ? `${supplier.name} ${supplier.surname}` : supplier.name;
  };

  const getSupplierContact = (supplierId: string) => {
    if (supplierId === '__no_supplier__') return '';
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return '';
    const parts = [supplier.email, supplier.phone].filter(Boolean);
    return parts.join(' | ');
  };

  // Group and sort resources
  const processedResources = useMemo(() => {
    if (sortMode === 'activity_date') {
      // Sort all resources by activity start date
      return [...resources].sort((a, b) => {
        const activityA = getActivityInfo(a.activity_id);
        const activityB = getActivityInfo(b.activity_id);
        
        const dateA = activityA?.effectiveStartDate || '9999-12-31';
        const dateB = activityB?.effectiveStartDate || '9999-12-31';
        
        return dateA.localeCompare(dateB);
      });
    }
    return resources;
  }, [resources, sortMode, getActivityInfo]);

  // Group by supplier when in supplier mode
  const groupedBySupplier = useMemo(() => {
    if (sortMode !== 'supplier') return {};
    
    const groups: Record<string, BudgetResource[]> = {};
    resources.forEach(resource => {
      const key = resource.supplier_id || '__no_supplier__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(resource);
    });

    // Sort each group by name
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [resources, sortMode]);

  // Sort supplier IDs
  const sortedSupplierIds = useMemo(() => {
    const ids = Object.keys(groupedBySupplier);
    return ids.sort((a, b) => {
      if (a === '__no_supplier__') return 1;
      if (b === '__no_supplier__') return -1;
      const supplierA = suppliers.find(s => s.id === a);
      const supplierB = suppliers.find(s => s.id === b);
      const nameA = supplierA ? `${supplierA.name} ${supplierA.surname || ''}` : '';
      const nameB = supplierB ? `${supplierB.name} ${supplierB.surname || ''}` : '';
      return nameA.localeCompare(nameB);
    });
  }, [groupedBySupplier, suppliers]);

  // Calculate supplier totals
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(groupedBySupplier).forEach(([supplierId, supplierResources]) => {
      totals[supplierId] = supplierResources.reduce((sum, r) => {
        const fields = calculateFields(r);
        return sum + fields.subtotalSales;
      }, 0);
    });
    return totals;
  }, [groupedBySupplier]);

  const toggleSupplierExpanded = (supplierId: string) => {
    setExpandedSuppliers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(supplierId)) {
        newSet.delete(supplierId);
      } else {
        newSet.add(supplierId);
      }
      return newSet;
    });
  };

  // Handle inline date edit
  const handleStartDateChange = async (activityId: string, newDate: string) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ start_date: newDate || null })
        .eq('id', activityId);

      if (error) throw error;
      
      toast.success('Fecha de inicio actualizada');
      setEditingStartDate(null);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error updating start date:', error);
      toast.error('Error al actualizar la fecha');
    }
  };

  // Render resource row
  const renderResourceRow = (resource: BudgetResource, showSupplier: boolean = false) => {
    const fields = calculateFields(resource);
    const activityInfo = getActivityInfo(resource.activity_id);
    const isEditingDate = editingStartDate?.activityId === resource.activity_id;

    return (
      <TableRow key={resource.id}>
        <TableCell className="font-medium">{resource.name}</TableCell>
        <TableCell>
          <Badge variant="outline" className="gap-1">
            {resourceTypeIcons[resource.resource_type || 'Producto']}
            {resource.resource_type || 'Producto'}
          </Badge>
        </TableCell>
        {showSupplier && (
          <TableCell>
            {resource.supplier_id ? getSupplierLabel(resource.supplier_id) : '-'}
          </TableCell>
        )}
        <TableCell className="max-w-[200px]">
          {activityInfo ? (
            <Button
              variant="link"
              className="p-0 h-auto font-medium text-primary hover:underline whitespace-normal break-words leading-tight text-sm text-left"
              onClick={() => onEditActivity?.(activityInfo.id)}
            >
              {activityInfo.code}
            </Button>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          {isEditingDate && isAdmin ? (
            <Input
              type="date"
              value={editingStartDate.value}
              onChange={(e) => setEditingStartDate({ activityId: resource.activity_id!, value: e.target.value })}
              onBlur={() => handleStartDateChange(resource.activity_id!, editingStartDate.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleStartDateChange(resource.activity_id!, editingStartDate.value);
                } else if (e.key === 'Escape') {
                  setEditingStartDate(null);
                }
              }}
              className="h-8 w-32"
              autoFocus
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 font-normal"
              onClick={() => {
                if (isAdmin && resource.activity_id) {
                  setEditingStartDate({
                    activityId: resource.activity_id,
                    value: activityInfo?.effectiveStartDate || ''
                  });
                }
              }}
              disabled={!isAdmin || !resource.activity_id}
            >
              {activityInfo?.effectiveStartDate 
                ? format(parseISO(activityInfo.effectiveStartDate), 'dd/MM/yyyy', { locale: es })
                : '-'
              }
            </Button>
          )}
        </TableCell>
        <TableCell className="text-right">
          {formatNumber(fields.calculatedUnits)}
        </TableCell>
        <TableCell>{resource.unit || 'ud'}</TableCell>
        <TableCell className="text-right font-semibold text-primary">
          {formatCurrency(fields.subtotalSales)}
        </TableCell>
        {isAdmin && onEdit && (
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(resource)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay recursos para mostrar
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Vista:</span>
        <Button
          variant={sortMode === 'fecha_objetivo' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('fecha_objetivo')}
          className="gap-1.5"
        >
          <ClipboardList className="h-4 w-4" />
          Por Fecha Objetivo
        </Button>
        <Button
          variant={sortMode === 'supplier' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('supplier')}
          className="gap-1.5"
        >
          <Users className="h-4 w-4" />
          Por Suministrador
        </Button>
        <Button
          variant={sortMode === 'activity_date' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('activity_date')}
          className="gap-1.5"
        >
          <Calendar className="h-4 w-4" />
          Por Fecha Actividad
        </Button>
      </div>

      {/* Fecha Objetivo View (new) */}
      {sortMode === 'fecha_objetivo' && (
        <GestionesDateView
          budgetId={budgetId}
          budgetName={budgetName}
          isAdmin={isAdmin}
          onEditTask={onEditTask}
          onEditActivity={onEditActivity}
        />
      )}

      {/* Sorted by Activity Date View */}
      {sortMode === 'activity_date' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Suministrador</TableHead>
                <TableHead>ActividadID</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Fecha Inicio
                  </div>
                </TableHead>
                <TableHead className="text-right">Uds calc.</TableHead>
                <TableHead>Ud</TableHead>
                <TableHead className="text-right">€Subtotal</TableHead>
                {isAdmin && onEdit && <TableHead className="w-[60px]">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedResources.map(resource => renderResourceRow(resource, true))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grouped by Supplier View */}
      {sortMode === 'supplier' && sortedSupplierIds.map(supplierId => {
        const supplierResources = groupedBySupplier[supplierId];
        const isExpanded = expandedSuppliers.has(supplierId);
        const total = supplierTotals[supplierId] || 0;

        return (
          <div key={supplierId} className="border rounded-lg overflow-hidden">
            {/* Supplier Header */}
            <div
              className={cn(
                "flex items-center justify-between p-4 cursor-pointer transition-colors",
                supplierId === '__no_supplier__' 
                  ? "bg-muted/50 hover:bg-muted" 
                  : "bg-primary/5 hover:bg-primary/10"
              )}
              onClick={() => toggleSupplierExpanded(supplierId)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="p-2 rounded-full bg-background">
                  {supplierId === '__no_supplier__' ? (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">{getSupplierLabel(supplierId)}</p>
                  {supplierId !== '__no_supplier__' && (
                    <p className="text-sm text-muted-foreground">{getSupplierContact(supplierId)}</p>
                  )}
                </div>
                <Badge variant="secondary" className="ml-2">
                  {supplierResources.length} recurso{supplierResources.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{formatCurrency(total)}</p>
                <p className="text-xs text-muted-foreground">Subtotal</p>
              </div>
            </div>

            {/* Resources Table */}
            {isExpanded && (
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>ActividadID</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Fecha Inicio
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Uds calc.</TableHead>
                      <TableHead>Ud</TableHead>
                      <TableHead className="text-right">€Subtotal</TableHead>
                      {isAdmin && onEdit && <TableHead className="w-[60px]">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierResources.map(resource => renderResourceRow(resource, false))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
