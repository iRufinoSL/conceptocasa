import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, User, Users, Calendar, ClipboardList, MapPin, Layers, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { Pencil, Package, Wrench, Truck, Briefcase, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { GestionesDateView } from './GestionesDateView';
import { TaskForm } from './TaskForm';
import type { BudgetTask } from './BudgetAgendaTab';

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

interface AreaTask {
  id: string;
  name: string;
  activity_id: string | null;
  activity_code: string;
  activity_name: string;
  phase_code: string | null;
  task_status: string | null;
}

interface WorkAreaGroup {
  id: string;
  name: string;
  level: string;
  work_area: string;
  tasks: AreaTask[];
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

type SortMode = 'fecha_objetivo' | 'supplier' | 'activity_date' | 'area_trabajo';

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

  // Area trabajo state
  const [areaTasks, setAreaTasks] = useState<AreaTask[]>([]);
  const [areaWorkAreas, setAreaWorkAreas] = useState<{ id: string; name: string; level: string; work_area: string }[]>([]);
  const [areaWorkAreaLinks, setAreaWorkAreaLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);
  const [areaActivityDates, setAreaActivityDates] = useState<{ id: string; actual_start_date: string | null; actual_end_date: string | null }[]>([]);
  const [areaDateFrom, setAreaDateFrom] = useState('');
  const [areaDateTo, setAreaDateTo] = useState('');
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set(['__all__']));
  const [areaLoading, setAreaLoading] = useState(false);
  
  // Task form state
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<BudgetTask | null>(null);

  // Fetch resources data (non-tasks)
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .neq('resource_type', 'Tarea'),
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

  // Fetch area trabajo data
  const fetchAreaData = useCallback(async () => {
    setAreaLoading(true);
    try {
      // First get work areas for this budget
      const waRes = await supabase
        .from('budget_work_areas')
        .select('id, name, level, work_area')
        .eq('budget_id', budgetId);

      const waIds = (waRes.data || []).map(wa => wa.id);

      // Now fetch tasks, links (filtered by budget's work areas), and activities in parallel
      const [tasksRes, waLinksRes, actRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('id, name, activity_id, task_status')
          .eq('budget_id', budgetId)
          .in('resource_type', ['Tarea', 'Cita']),
        waIds.length > 0
          ? supabase
              .from('budget_work_area_activities')
              .select('work_area_id, activity_id')
              .in('work_area_id', waIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('budget_activities')
          .select('id, code, name, phase_id, actual_start_date, actual_end_date, budget_phases(code)')
          .eq('budget_id', budgetId),
      ]);

      // Build activity info map
      const activitiesMap = new Map<string, {
        code: string; name: string; phase_code: string | null;
        actual_start_date: string | null; actual_end_date: string | null;
      }>();
      (actRes.data || []).forEach((a: any) => {
        activitiesMap.set(a.id, {
          code: a.code,
          name: a.name,
          phase_code: a.budget_phases?.code || null,
          actual_start_date: a.actual_start_date,
          actual_end_date: a.actual_end_date,
        });
      });

      const mappedTasks: AreaTask[] = (tasksRes.data || []).map(t => {
        const act = t.activity_id ? activitiesMap.get(t.activity_id) : null;
        return {
          id: t.id,
          name: t.name,
          activity_id: t.activity_id,
          activity_code: act?.code || '',
          activity_name: act?.name || '',
          phase_code: act?.phase_code || null,
          task_status: t.task_status,
        };
      });

      setAreaTasks(mappedTasks);
      setAreaWorkAreas(waRes.data || []);

      // Links are already filtered by budget's work areas in the query
      setAreaWorkAreaLinks(waLinksRes.data || []);

      setAreaActivityDates((actRes.data || []).map((a: any) => ({
        id: a.id,
        actual_start_date: a.actual_start_date,
        actual_end_date: a.actual_end_date,
      })));
    } catch (error) {
      console.error('Error fetching area data:', error);
      toast.error('Error al cargar datos de áreas');
    } finally {
      setAreaLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    if (sortMode === 'area_trabajo') {
      fetchAreaData();
    }
  }, [sortMode, fetchAreaData]);

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

    let effectiveStartDate = activity.start_date;
    if (!effectiveStartDate && activity.phase_id) {
      const phase = phases.find(p => p.id === activity.phase_id);
      if (phase?.start_date) {
        effectiveStartDate = phase.start_date;
      }
    }

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

  // === Area trabajo computed values ===
  const areaActivityDatesMap = useMemo(() => {
    const map = new Map<string, { actual_start_date: string | null; actual_end_date: string | null }>();
    areaActivityDates.forEach(a => map.set(a.id, a));
    return map;
  }, [areaActivityDates]);

  const isAreaActivityInDateRange = useCallback((activityId: string): boolean => {
    if (!areaDateFrom && !areaDateTo) return true;
    const dateInfo = areaActivityDatesMap.get(activityId);
    if (!dateInfo) return !areaDateFrom && !areaDateTo;

    const actStart = dateInfo.actual_start_date ? parseISO(dateInfo.actual_start_date) : null;
    const actEnd = dateInfo.actual_end_date ? parseISO(dateInfo.actual_end_date) : null;

    if (!actStart && !actEnd) return !areaDateFrom && !areaDateTo;

    const filterFrom = areaDateFrom ? parseISO(areaDateFrom) : null;
    const filterTo = areaDateTo ? parseISO(areaDateTo) : null;

    if (filterFrom && filterTo) {
      const rangeStart = actStart || actEnd!;
      const rangeEnd = actEnd || actStart!;
      return rangeStart <= filterTo && rangeEnd >= filterFrom;
    }
    if (filterFrom) return (actEnd || actStart!) >= filterFrom;
    if (filterTo) return (actStart || actEnd!) <= filterTo;
    return true;
  }, [areaDateFrom, areaDateTo, areaActivityDatesMap]);

  const workAreaGroups = useMemo((): WorkAreaGroup[] => {
    const groups: WorkAreaGroup[] = [];

    areaWorkAreas.forEach(wa => {
      const activityIds = areaWorkAreaLinks
        .filter(l => l.work_area_id === wa.id)
        .map(l => l.activity_id);

      const filteredActivityIds = activityIds.filter(isAreaActivityInDateRange);

      const tasksInArea = areaTasks.filter(
        t => t.activity_id && filteredActivityIds.includes(t.activity_id)
      );

      if (tasksInArea.length > 0) {
        const sorted = [...tasksInArea].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        groups.push({ ...wa, tasks: sorted });
      }
    });

    groups.sort((a, b) => {
      if (a.level !== b.level) return a.level.localeCompare(b.level, 'es');
      return a.name.localeCompare(b.name, 'es');
    });

    // Tasks with activities not linked to any work area
    const allLinkedActivityIds = new Set(areaWorkAreaLinks.map(l => l.activity_id));
    const unlinkedTasks = areaTasks.filter(
      t => t.activity_id && !allLinkedActivityIds.has(t.activity_id) && isAreaActivityInDateRange(t.activity_id)
    );
    if (unlinkedTasks.length > 0) {
      const sorted = [...unlinkedTasks].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      groups.push({ id: '__no_area__', name: 'Sin área de trabajo', level: '', work_area: '', tasks: sorted });
    }

    // Tasks without activity
    const noActivityTasks = areaTasks.filter(t => !t.activity_id);
    if (noActivityTasks.length > 0) {
      const sorted = [...noActivityTasks].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      groups.push({ id: '__no_activity__', name: 'Sin actividad', level: '', work_area: '', tasks: sorted });
    }

    return groups;
  }, [areaTasks, areaWorkAreas, areaWorkAreaLinks, isAreaActivityInDateRange]);

  // Initialize expanded work areas
  useEffect(() => {
    if (expandedWorkAreas.has('__all__') && workAreaGroups.length > 0) {
      setExpandedWorkAreas(new Set(workAreaGroups.map(g => g.id)));
    }
  }, [workAreaGroups.length]);

  // Area trabajo helpers
  const toggleWorkArea = (id: string) => {
    setExpandedWorkAreas(prev => {
      const next = new Set(prev);
      next.delete('__all__');
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllWorkAreas = () => setExpandedWorkAreas(new Set(workAreaGroups.map(g => g.id)));
  const collapseAllWorkAreas = () => setExpandedWorkAreas(new Set());

  const handleToggleAreaTaskStatus = async (taskId: string, currentStatus: string | null) => {
    const newStatus = currentStatus === 'realizada' ? 'pendiente' : 'realizada';
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ task_status: newStatus })
        .eq('id', taskId);
      if (error) throw error;
      setAreaTasks(prev => prev.map(t => t.id === taskId ? { ...t, task_status: newStatus } : t));
      toast.success(newStatus === 'realizada' ? 'Marcada como realizada' : 'Marcada como pendiente');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar estado');
    }
  };

  // Load full resource data and open edit form for area_trabajo tasks
  const handleEditAreaResource = async (taskId: string) => {
    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) throw error;
      if (data && onEdit) {
        onEdit(data as BudgetResource);
      }
    } catch (err) {
      console.error('Error loading resource:', err);
      toast.error('Error al cargar el recurso');
    }
  };

  // Task form handlers for area_trabajo view
  const handleNewAreaTask = () => {
    setEditingTask(null);
    setTaskFormOpen(true);
  };

  const handleTaskFormSuccess = () => {
    setTaskFormOpen(false);
    setEditingTask(null);
    fetchAreaData();
    fetchData();
  };

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
      fetchData();
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

  if (sortMode !== 'area_trabajo' && sortMode !== 'fecha_objetivo' && resources.length === 0) {
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
        <Button
          variant={sortMode === 'area_trabajo' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('area_trabajo')}
          className="gap-1.5"
        >
          <MapPin className="h-4 w-4" />
          Por Área trabajo
        </Button>
      </div>

      {/* Fecha Objetivo View */}
      {sortMode === 'fecha_objetivo' && (
        <GestionesDateView
          budgetId={budgetId}
          budgetName={budgetName}
          isAdmin={isAdmin}
          activities={activities.map(a => {
            const phase = phases.find(p => p.id === a.phase_id);
            return {
              id: a.id,
              name: a.name,
              code: a.code,
              phase_code: phase?.code || null
            };
          })}
          onEditTask={onEditTask}
          onEditActivity={onEditActivity}
          onRefresh={fetchData}
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

      {/* Area trabajo View */}
      {sortMode === 'area_trabajo' && (
        <div className="space-y-3">
          {areaLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Date range filter */}
              <Card>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">Filtro fechas reales:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Desde</span>
                      <Input
                        type="date"
                        value={areaDateFrom}
                        onChange={(e) => setAreaDateFrom(e.target.value)}
                        className="h-8 w-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Hasta</span>
                      <Input
                        type="date"
                        value={areaDateTo}
                        onChange={(e) => setAreaDateTo(e.target.value)}
                        className="h-8 w-40"
                      />
                    </div>
                    {(areaDateFrom || areaDateTo) && (
                      <Button variant="ghost" size="sm" onClick={() => { setAreaDateFrom(''); setAreaDateTo(''); }}>
                        <X className="h-4 w-4 mr-1" />
                        Limpiar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Expand/Collapse controls + Nueva tarea */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {workAreaGroups.reduce((sum, g) => sum + g.tasks.length, 0)} tareas
                  </Badge>
                  {isAdmin && (
                    <Button size="sm" onClick={handleNewAreaTask} className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      Nueva tarea
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={expandAllWorkAreas}>
                    Expandir todo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={collapseAllWorkAreas}>
                    Colapsar todo
                  </Button>
                </div>
              </div>

              {/* Work area groups */}
              {workAreaGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {areaDateFrom || areaDateTo
                    ? 'No hay tareas en el rango de fechas seleccionado'
                    : 'No hay tareas con áreas de trabajo asignadas'}
                </div>
              ) : (
                workAreaGroups.map(group => {
                  const isExpanded = expandedWorkAreas.has(group.id);

                  return (
                    <Collapsible
                      key={group.id}
                      open={isExpanded}
                      onOpenChange={() => toggleWorkArea(group.id)}
                    >
                      <Card>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-2 p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Layers className="h-4 w-4 text-primary" />
                            <span className="font-medium">
                              {group.level ? `${group.level} - ${group.name}` : group.name}
                            </span>
                            <Badge variant="outline" className="ml-2">
                              {group.tasks.length} {group.tasks.length === 1 ? 'tarea' : 'tareas'}
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10"></TableHead>
                                  <TableHead>Tarea</TableHead>
                                  <TableHead>ActividadID</TableHead>
                                  {isAdmin && onEdit && <TableHead className="w-[60px]"></TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.tasks.map(task => (
                                  <TableRow
                                    key={task.id}
                                    className={cn(
                                      'cursor-pointer hover:bg-accent/50',
                                      task.task_status === 'realizada' && 'bg-green-50/50 dark:bg-green-900/10'
                                    )}
                                    onClick={() => handleEditAreaResource(task.id)}
                                  >
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={task.task_status === 'realizada'}
                                        onCheckedChange={() => handleToggleAreaTaskStatus(task.id, task.task_status)}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <span className={cn(
                                        'font-medium',
                                        task.task_status === 'realizada' && 'line-through text-muted-foreground'
                                      )}>
                                        {task.name}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      {task.activity_id ? (
                                        <Button
                                          variant="link"
                                          className="p-0 h-auto text-sm text-primary hover:underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onEditActivity?.(task.activity_id!);
                                          }}
                                        >
                                          {formatActividadId({
                                            phaseCode: task.phase_code,
                                            activityCode: task.activity_code,
                                            name: task.activity_name,
                                          })}
                                        </Button>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">Sin actividad</span>
                                      )}
                                    </TableCell>
                                    {isAdmin && onEdit && (
                                      <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleEditAreaResource(task.id)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                             </Table>
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })
              )}
            </>
          )}
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
      {/* Task Form Dialog */}
      <TaskForm
        budgetId={budgetId}
        activities={activities.map(a => {
          const phase = phases.find(p => p.id === a.phase_id);
          return {
            id: a.id,
            name: a.name,
            code: a.code,
            phase_code: phase?.code || null,
          };
        })}
        task={editingTask}
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        onSuccess={handleTaskFormSuccess}
      />
    </div>
  );
}
