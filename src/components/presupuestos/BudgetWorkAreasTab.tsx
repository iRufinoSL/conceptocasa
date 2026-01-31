import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, MapPin, List, Layers, ChevronDown, ChevronRight, LayoutGrid, Pencil, Search } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';
import { WorkAreasOptionsGroupedView } from './WorkAreasOptionsGroupedView';
import { WorkAreaActivitiesSelect } from './WorkAreaActivitiesSelect';
import { WorkAreaHierarchyView } from './WorkAreaHierarchyView';
import { OPTION_COLORS } from '@/lib/options-utils';
import { formatActividadId } from '@/lib/activity-id';
import { formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { useBudgetBroadcast } from '@/hooks/useBudgetBroadcast';

interface WorkArea {
  id: string;
  budget_id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
  created_at: string;
  updated_at: string;
  resources_subtotal?: number;
}

interface BudgetWorkAreasTabProps {
  budgetId: string;
  isAdmin: boolean;
}

const LEVELS = [
  'Cota 0 terreno',
  'Nivel 1',
  'Nivel 2',
  'Nivel 3',
  'Terrazas',
  'Cubiertas',
  'Vivienda'
];

const DEFAULT_WORK_AREAS = [
  'Perímetro parcela',
  'Espacios parcela',
  'Cimentación',
  'Suelos',
  'Techos',
  'Espacios',
  'Paredes externas',
  'Paredes internas',
  'Vivienda general'
];

interface ActivityWithOpciones {
  id: string;
  name: string;
  code: string;
  opciones: string[];
  phase_id: string | null;
  resources_subtotal?: number;
  uses_measurement?: boolean;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface ResourceData {
  id: string;
  activity_id: string | null;
  name: string;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  subtotal: number;
}

export function BudgetWorkAreasTab({ budgetId, isAdmin }: BudgetWorkAreasTabProps) {
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [activities, setActivities] = useState<ActivityWithOpciones[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [activityLinks, setActivityLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);
  const [resources, setResources] = useState<ResourceData[]>([]);
  const [unassignedResourcesSubtotal, setUnassignedResourcesSubtotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'alphabetic' | 'grouped' | 'options'>('grouped');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<WorkArea | null>(null);
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set()); // collapsed by default
  const [customWorkAreas, setCustomWorkAreas] = useState<string[]>([]);
  const [newWorkAreaInput, setNewWorkAreaInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    level: 'Nivel 1',
    work_area: 'Espacios',
    activity_ids: [] as string[]
  });

  // Ref to hold fetchWorkAreas so broadcast callback can access it
  const fetchWorkAreasRef = useRef<() => Promise<void>>();

  // Instant broadcast for cross-client sync
  const handleBroadcast = useCallback((payload: any) => {
    // When another client broadcasts a change, refetch immediately
    if (payload.type === 'work-area-changed' || payload.type === 'activity-changed') {
      fetchWorkAreasRef.current?.();
    }
  }, []);

  const { broadcastWorkAreaChange } = useBudgetBroadcast({
    budgetId,
    onBroadcast: handleBroadcast,
  });

  // Combine default and custom work areas, plus any from existing data
  const allWorkAreas = useMemo(() => {
    const existingWorkAreas = workAreas.map(wa => wa.work_area);
    const combined = new Set([...DEFAULT_WORK_AREAS, ...customWorkAreas, ...existingWorkAreas]);
    return Array.from(combined).sort((a, b) => a.localeCompare(b, 'es'));
  }, [customWorkAreas, workAreas]);

  const fetchWorkAreas = async () => {
    setIsLoading(true);
    try {
      // Fetch work areas, activities, phases, links and ALL resources in parallel (avoid N+1 queries)
      const [workAreasRes, activitiesRes, phasesRes, allActivityLinksRes, resourcesRes] = await Promise.all([
        supabase
          .from('budget_work_areas')
          .select('*')
          .eq('budget_id', budgetId)
          .order('level', { ascending: true })
          .order('work_area', { ascending: true }),
        supabase
          .from('budget_activities')
          .select('id, name, code, opciones, phase_id, uses_measurement')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_phases')
          .select('id, code, name')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_work_area_activities')
          .select('work_area_id, activity_id, budget_activities!inner(budget_id)')
          .eq('budget_activities.budget_id', budgetId),
        supabase
          .from('budget_activity_resources')
          .select('id, activity_id, name, resource_type, external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent')
          .eq('budget_id', budgetId)
      ]);

      if (workAreasRes.error) throw workAreasRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (allActivityLinksRes.error) throw allActivityLinksRes.error;
      if (resourcesRes.error) throw resourcesRes.error;

      setPhases(phasesRes.data || []);

      const links = (allActivityLinksRes.data || []).map((l: any) => ({ work_area_id: l.work_area_id, activity_id: l.activity_id }));
      const allResources = resourcesRes.data || [];

      // Subtotal by activity
      const subtotalByActivity = new Map<string, number>();
      let resourcesWithoutActivity = 0;

      allResources.forEach((r: any) => {
        const rowSubtotal = calcResourceSubtotal({
          externalUnitCost: r.external_unit_cost,
          safetyPercent: r.safety_margin_percent,
          salesPercent: r.sales_margin_percent,
          manualUnits: r.manual_units,
          relatedUnits: r.related_units,
        });

        if (!r.activity_id) {
          resourcesWithoutActivity += rowSubtotal;
          return;
        }

        subtotalByActivity.set(r.activity_id, (subtotalByActivity.get(r.activity_id) || 0) + rowSubtotal);
      });

      setUnassignedResourcesSubtotal(resourcesWithoutActivity);

      // Activities with subtotal
      const activitiesWithSubtotals = (activitiesRes.data || []).map((act) => ({
        ...act,
        resources_subtotal: subtotalByActivity.get(act.id) || 0,
      }));

      setActivities(activitiesWithSubtotals);
      setActivityLinks(links);

      // Build resources with subtotals
      const resourcesWithSubtotals: ResourceData[] = allResources.map((r: any) => ({
        id: r.id,
        activity_id: r.activity_id,
        name: r.name,
        resource_type: r.resource_type,
        external_unit_cost: r.external_unit_cost,
        manual_units: r.manual_units,
        related_units: r.related_units,
        safety_margin_percent: r.safety_margin_percent,
        sales_margin_percent: r.sales_margin_percent,
        subtotal: calcResourceSubtotal({
          externalUnitCost: r.external_unit_cost,
          safetyPercent: r.safety_margin_percent,
          salesPercent: r.sales_margin_percent,
          manualUnits: r.manual_units,
          relatedUnits: r.related_units,
        })
      }));
      setResources(resourcesWithSubtotals);

      // Work areas enriched with subtotal (sum subtotals of linked activities)
      const enrichedData = (workAreasRes.data || []).map((area) => {
        const activityIds = links.filter(l => l.work_area_id === area.id).map(l => l.activity_id);
        const subtotal = activityIds.reduce((sum, id) => sum + (subtotalByActivity.get(id) || 0), 0);
        return { ...area, resources_subtotal: subtotal };
      });

      setWorkAreas(enrichedData);
    } catch (error) {
      console.error('Error fetching work areas:', error);
      toast.error('Error al cargar áreas de trabajo');
    } finally {
      setIsLoading(false);
    }
  };

  // Update ref so broadcast callback can call fetchWorkAreas
  fetchWorkAreasRef.current = fetchWorkAreas;

  useEffect(() => {
    if (budgetId) {
      fetchWorkAreas();
    }
  }, [budgetId]);

  // Realtime subscription for cross-tab synchronization
  useEffect(() => {
    if (!budgetId) return;

    const channel = supabase
      .channel(`work-areas-${budgetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_work_areas',
          filter: `budget_id=eq.${budgetId}`
        },
        () => {
          console.log('Work areas changed, refreshing...');
          fetchWorkAreas();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_work_area_activities'
        },
        () => {
          console.log('Work area activities changed, refreshing...');
          fetchWorkAreas();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_activities',
          filter: `budget_id=eq.${budgetId}`
        },
        () => {
          console.log('Activities changed, refreshing...');
          fetchWorkAreas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [budgetId]);

  const handleOpenDialog = (area?: WorkArea) => {
    if (area) {
      setEditingArea(area);
      const linkedActivityIds = activityLinks
        .filter(l => l.work_area_id === area.id)
        .map(l => l.activity_id);
      setFormData({
        name: area.name,
        level: area.level,
        work_area: area.work_area,
        activity_ids: linkedActivityIds
      });
    } else {
      setEditingArea(null);
      setFormData({
        name: '',
        level: 'Nivel 1',
        work_area: 'Espacios',
        activity_ids: []
      });
    }
    setDialogOpen(true);
  };

  const handleAddCustomWorkArea = () => {
    const trimmed = newWorkAreaInput.trim();
    if (!trimmed) return;
    if (allWorkAreas.includes(trimmed)) {
      toast.error('Este área de trabajo ya existe');
      return;
    }
    setCustomWorkAreas(prev => [...prev, trimmed]);
    setFormData(prev => ({ ...prev, work_area: trimmed }));
    setNewWorkAreaInput('');
    toast.success(`Área de trabajo "${trimmed}" añadida`);
  };

  const handleSave = async () => {
    // Check for duplicate area_id
    const newAreaId = `${formData.work_area}/${formData.level}`;
    const existingArea = workAreas.find(
      wa => wa.area_id === newAreaId && wa.id !== editingArea?.id
    );

    if (existingArea) {
      toast.error(`Ya existe un área con ID "${newAreaId}". Cambia el nivel o el área de trabajo.`);
      return;
    }

    try {
      let savedAreaId: string | null = null;
      
      if (editingArea) {
        const { error } = await supabase
          .from('budget_work_areas')
          .update({
            name: formData.name,
            level: formData.level,
            work_area: formData.work_area
          })
          .eq('id', editingArea.id);

        if (error) throw error;
        savedAreaId = editingArea.id;
        toast.success('Área de trabajo actualizada');
      } else {
        const { data: newArea, error } = await supabase
          .from('budget_work_areas')
          .insert({
            budget_id: budgetId,
            name: formData.name,
            level: formData.level,
            work_area: formData.work_area
          })
          .select('id')
          .single();

        if (error) throw error;
        savedAreaId = newArea?.id || null;
        toast.success('Área de trabajo creada');
      }

      // Update activity links
      if (savedAreaId) {
        const { error: deleteLinksError } = await supabase
          .from('budget_work_area_activities')
          .delete()
          .eq('work_area_id', savedAreaId);
        
        if (deleteLinksError) {
          console.error('Error deleting activity links:', deleteLinksError);
          throw deleteLinksError;
        }
        
        if (formData.activity_ids.length > 0) {
          // CRITICAL: Use the correct column order matching unique constraint (work_area_id, activity_id)
          const relationsToInsert = formData.activity_ids.map(activityId => ({
            work_area_id: savedAreaId,
            activity_id: activityId
          }));
          
          const { error: insertLinksError } = await supabase
            .from('budget_work_area_activities')
            .upsert(relationsToInsert, {
              onConflict: 'work_area_id,activity_id',
              ignoreDuplicates: true
            });
          
          if (insertLinksError) {
            console.error('Error inserting activity links:', insertLinksError);
            throw insertLinksError;
          }
        }
      }

      setDialogOpen(false);
      // Immediate refetch for local state
      await fetchWorkAreas();
      // Broadcast to other clients for instant sync
      broadcastWorkAreaChange(editingArea ? 'update' : 'create', savedAreaId || undefined);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta área de trabajo?')) return;

    try {
      const { error } = await supabase
        .from('budget_work_areas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Área de trabajo eliminada');
      await fetchWorkAreas();
      broadcastWorkAreaChange('delete', id);
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    }
  };

  // Phase lookup map
  const phaseMap = useMemo(() => {
    const map = new Map<string, Phase>();
    phases.forEach(p => map.set(p.id, p));
    return map;
  }, [phases]);

  // Get activities linked to a specific work area, sorted alphabetically by ActividadID
  const getActivitiesForWorkArea = (workAreaId: string) => {
    const linkedActivityIds = activityLinks.filter(l => l.work_area_id === workAreaId).map(l => l.activity_id);
    return activities
      .filter(a => linkedActivityIds.includes(a.id))
      .sort((a, b) => {
        const phaseA = a.phase_id ? phaseMap.get(a.phase_id) : null;
        const phaseB = b.phase_id ? phaseMap.get(b.phase_id) : null;
        const idA = formatActividadId({ phaseCode: phaseA?.code, activityCode: a.code, name: a.name });
        const idB = formatActividadId({ phaseCode: phaseB?.code, activityCode: b.code, name: b.name });
        return idA.localeCompare(idB, 'es', { numeric: true });
      });
  };

  // Group work areas by level
  const groupedByLevel = workAreas.reduce((acc, area) => {
    if (!acc[area.level]) {
      acc[area.level] = [];
    }
    acc[area.level].push(area);
    return acc;
  }, {} as Record<string, WorkArea[]>);

  // Sort alphabetically by AreaID
  const sortedAlphabetically = [...workAreas].sort((a, b) => a.area_id.localeCompare(b.area_id, 'es', { numeric: true }));

  // Find activities without work areas
  const activityIdsWithWorkArea = new Set(activityLinks.map(link => link.activity_id));
  const activitiesWithoutWorkArea = activities.filter(a => !activityIdsWithWorkArea.has(a.id));

  // Calculate subtotal for activities WITHOUT work area
  const unassignedSubtotal = activitiesWithoutWorkArea.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);

  // Handle inline work area assignment
  const handleAssignWorkArea = async (activityId: string, workAreaId: string) => {
    if (!workAreaId) return;
    
    try {
      // First check if relationship already exists
      const { data: existing } = await supabase
        .from('budget_work_area_activities')
        .select('id')
        .eq('activity_id', activityId)
        .eq('work_area_id', workAreaId)
        .maybeSingle();
      
      if (existing) {
        toast.info('Esta actividad ya está asignada a esta área');
        return;
      }
      
      // Delete any existing assignment for this activity (an activity can only be in one work area at a time)
      await supabase
        .from('budget_work_area_activities')
        .delete()
        .eq('activity_id', activityId);
      
      // Insert the new relationship
      const { error } = await supabase
        .from('budget_work_area_activities')
        .insert({
          work_area_id: workAreaId,
          activity_id: activityId
        });
      
      if (error) throw error;
      toast.success('Área de trabajo asignada');
      await fetchWorkAreas();
      broadcastWorkAreaChange('update', workAreaId);
    } catch (error: any) {
      console.error('Error assigning work area:', error);
      toast.error(error.message || 'Error al asignar área de trabajo');
    }
  };

  // Total includes work areas + activities without work area + resources without activity
  const totalSubtotal = workAreas.reduce((sum, wa) => sum + (wa.resources_subtotal || 0), 0) + unassignedSubtotal + unassignedResourcesSubtotal;

  // Calculate option subtotals based on ALL activities (including those without work area)
  // IMPORTANT: if opciones is empty/undefined, treat as "A+B+C" to keep totals consistent across views.
  const optionSubtotals = { A: 0, B: 0, C: 0 };
  activities.forEach(activity => {
    const subtotal = activity.resources_subtotal || 0;
    const activityOpciones = activity.opciones?.length ? activity.opciones : ['A', 'B', 'C'];
    if (activityOpciones.includes('A')) optionSubtotals.A += subtotal;
    if (activityOpciones.includes('B')) optionSubtotals.B += subtotal;
    if (activityOpciones.includes('C')) optionSubtotals.C += subtotal;
  });

  // Resources without activity apply to all options
  optionSubtotals.A += unassignedResourcesSubtotal;
  optionSubtotals.B += unassignedResourcesSubtotal;
  optionSubtotals.C += unassignedResourcesSubtotal;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            DÓNDE? - Áreas de Trabajo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                DÓNDE? - Áreas de Trabajo
              </CardTitle>
              <CardDescription>
                Define las áreas de trabajo del presupuesto y su relación con actividades y mediciones
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                Total: {formatCurrency(totalSubtotal)}
              </Badge>
              {isAdmin && (
                <Button onClick={() => handleOpenDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Nueva Área
                </Button>
              )}
            </div>
          </div>
          {/* Option Subtotals - now correctly calculated */}
          <div className="flex items-center gap-4 flex-wrap">
            {(['A', 'B', 'C'] as const).map(opt => {
              const colors = OPTION_COLORS[opt];
              return (
                <div key={opt} className="text-right">
                  <p className={`text-lg font-bold ${colors?.text || ''} ${colors?.textDark || ''}`}>
                    {formatCurrency(optionSubtotals[opt])}
                  </p>
                  <p className="text-xs text-muted-foreground">SubTotal {opt}</p>
                </div>
              );
            })}
          </div>
          {/* Warning for activities/resources without assignment */}
          {(activitiesWithoutWorkArea.length > 0 || unassignedResourcesSubtotal > 0) && (
            <div className="mt-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              {activitiesWithoutWorkArea.length > 0 && (
                <div>
                  <strong>{activitiesWithoutWorkArea.length} actividades</strong> sin área de trabajo asignada
                </div>
              )}
              {unassignedResourcesSubtotal > 0 && (
                <div>
                  <strong>{formatCurrency(unassignedResourcesSubtotal)}</strong> en recursos sin actividad asignada
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {workAreas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay áreas de trabajo definidas</p>
            {isAdmin && (
              <Button variant="outline" onClick={() => handleOpenDialog()} className="mt-4">
                <Plus className="h-4 w-4 mr-1" />
                Crear primera área de trabajo
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'grouped' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grouped')}
                >
                  <Layers className="h-4 w-4 mr-1" />
                  Por Nivel
                </Button>
                <Button
                  variant={viewMode === 'alphabetic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('alphabetic')}
                >
                  <List className="h-4 w-4 mr-1" />
                  Alfabético
                </Button>
                <Button
                  variant={viewMode === 'options' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('options')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Por Opción
                </Button>
              </div>
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar en áreas, actividades, recursos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {viewMode === 'options' ? (
              <WorkAreasOptionsGroupedView
                workAreas={workAreas}
                activities={activities}
                phases={phases}
                activityLinks={activityLinks}
                activitiesWithoutWorkArea={activitiesWithoutWorkArea}
                isAdmin={isAdmin}
                expandedOptions={expandedOptions}
                onToggleExpanded={(opt) => {
                  setExpandedOptions(prev => {
                    const next = new Set(prev);
                    if (next.has(opt)) next.delete(opt);
                    else next.add(opt);
                    return next;
                  });
                }}
                onEdit={handleOpenDialog}
                onDelete={handleDelete}
              />
            ) : viewMode === 'alphabetic' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AreaID</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">€ SubTotal</TableHead>
                    {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAlphabetically
                    .filter((area) => {
                      if (!searchTerm.trim()) return true;
                      const searchableText = [area.area_id, area.name || '', area.level, area.work_area].join(' ');
                      return searchMatch(searchableText, searchTerm);
                    })
                    .map((area) => (
                    <TableRow key={area.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{area.area_id}</code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{area.name || '-'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(area.resources_subtotal || 0)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(area)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(area.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <WorkAreaHierarchyView
                workAreas={workAreas}
                activities={activities}
                phases={phases}
                activityLinks={activityLinks}
                resources={resources}
                isAdmin={isAdmin}
                searchTerm={searchTerm}
                onEditWorkArea={handleOpenDialog}
                onDeleteWorkArea={handleDelete}
                onEditActivity={(activityId) => {
                  // Dispatch custom event to open activity edit dialog in BudgetActivitiesTab
                  // Include returnTab to navigate back to DÓNDE? after saving
                  window.dispatchEvent(new CustomEvent('edit-activity', { 
                    detail: { id: activityId, returnTab: 'areas-trabajo' }
                  }));
                }}
                onEditResource={(resourceId) => {
                  // Dispatch custom event to open resource edit dialog in BudgetResourcesTab
                  window.dispatchEvent(new CustomEvent('edit-resource', { 
                    detail: { id: resourceId }
                  }));
                }}
              />
            )}

            {/* Activities without work area section */}
            {activitiesWithoutWorkArea.length > 0 && (
              <div className="mt-6 border rounded-lg border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
                <div className="bg-amber-100/50 dark:bg-amber-900/30 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-amber-800 dark:text-amber-200">Sin Área Trabajo</span>
                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                      {activitiesWithoutWorkArea.length} actividades
                    </Badge>
                  </div>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {formatCurrency(activitiesWithoutWorkArea.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0))}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre Actividad</TableHead>
                      <TableHead>Área de Trabajo</TableHead>
                      <TableHead>Opciones</TableHead>
                      <TableHead className="text-right">€ SubTotal</TableHead>
                      {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activitiesWithoutWorkArea.sort((a, b) => a.code.localeCompare(b.code)).map((activity) => (
                      <TableRow key={activity.id} className="bg-amber-50/30 dark:bg-amber-950/10">
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{activity.code}</code>
                        </TableCell>
                        <TableCell className="font-medium">{activity.name}</TableCell>
                        <TableCell>
                          <Select
                            onValueChange={(value) => handleAssignWorkArea(activity.id, value)}
                          >
                            <SelectTrigger className="h-8 w-[200px] text-xs">
                              <SelectValue placeholder="Seleccionar área..." />
                            </SelectTrigger>
                            <SelectContent>
                              {workAreas
                                .sort((a, b) => a.area_id.localeCompare(b.area_id, 'es', { numeric: true }))
                                .map((wa) => (
                                  <SelectItem key={wa.id} value={wa.id} className="text-xs">
                                    {wa.area_id}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {activity.opciones?.map(opt => (
                              <Badge 
                                key={opt} 
                                variant="outline" 
                                className={`${OPTION_COLORS[opt as 'A'|'B'|'C']?.bg || ''} ${OPTION_COLORS[opt as 'A'|'B'|'C']?.text || ''} text-xs`}
                              >
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(activity.resources_subtotal || 0)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                // Dispatch custom event to open activity edit dialog in BudgetActivitiesTab
                                window.dispatchEvent(new CustomEvent('edit-activity', { 
                                  detail: { id: activity.id, name: activity.name, code: activity.code }
                                }));
                              }}
                              title="Editar actividad"
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
            )}
          </>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingArea ? 'Editar Área de Trabajo' : 'Nueva Área de Trabajo'}
              </DialogTitle>
              <DialogDescription>
                Define el nivel, área de trabajo y opcionalmente una descripción
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="level">Nivel *</Label>
                <Select
                  value={formData.level}
                  onValueChange={(value) => setFormData({ ...formData, level: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work_area">Área de Trabajo *</Label>
                <Select
                  value={formData.work_area}
                  onValueChange={(value) => setFormData({ ...formData, work_area: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allWorkAreas.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Add custom work area */}
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newWorkAreaInput}
                    onChange={(e) => setNewWorkAreaInput(e.target.value)}
                    placeholder="Nueva área de trabajo..."
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomWorkArea();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddCustomWorkArea}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>AreaID generado:</strong>{' '}
                  <code className="bg-background px-2 py-1 rounded">
                    {formData.work_area}/{formData.level}
                  </code>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Descripción (opcional)</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Descripción adicional del área..."
                />
              </div>
              {/* Activities multi-select with search - showing only related activities */}
              <WorkAreaActivitiesSelect
                activities={activities}
                phases={phases}
                selectedIds={formData.activity_ids}
                onSelectionChange={(ids) => setFormData(prev => ({ ...prev, activity_ids: ids }))}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingArea ? 'Guardar Cambios' : 'Crear Área'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
