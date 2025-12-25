import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, MapPin, List, Layers, ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import { WorkAreasOptionsGroupedView } from './WorkAreasOptionsGroupedView';
import { OPTION_COLORS } from '@/lib/options-utils';
import { formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';

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

const WORK_AREAS = [
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
  resources_subtotal?: number;
}

export function BudgetWorkAreasTab({ budgetId, isAdmin }: BudgetWorkAreasTabProps) {
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [activities, setActivities] = useState<ActivityWithOpciones[]>([]);
  const [activityLinks, setActivityLinks] = useState<{ work_area_id: string; activity_id: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'alphabetic' | 'grouped' | 'options'>('grouped');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<WorkArea | null>(null);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(LEVELS));
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set()); // collapsed by default
  const [formData, setFormData] = useState({
    name: '',
    level: 'Nivel 1',
    work_area: 'Espacios'
  });

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const expandAllLevels = () => setExpandedLevels(new Set(LEVELS));
  const collapseAllLevels = () => setExpandedLevels(new Set());

  const fetchWorkAreas = async () => {
    setIsLoading(true);
    try {
      // Fetch work areas and activities in parallel
      const [workAreasRes, activitiesRes, allActivityLinksRes] = await Promise.all([
        supabase
          .from('budget_work_areas')
          .select('*')
          .eq('budget_id', budgetId)
          .order('level', { ascending: true })
          .order('work_area', { ascending: true }),
        supabase
          .from('budget_activities')
          .select('id, name, code, opciones')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_work_area_activities')
          .select('work_area_id, activity_id')
      ]);

      if (workAreasRes.error) throw workAreasRes.error;
      if (activitiesRes.error) throw activitiesRes.error;

      // Calculate subtotal for each activity
      const activitiesWithSubtotals = await Promise.all((activitiesRes.data || []).map(async (act) => {
        const { data: resources } = await supabase
          .from('budget_activity_resources')
          .select('external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent')
          .eq('activity_id', act.id);
        
        const subtotal = (resources || []).reduce((sum, r) => {
          return sum + calcResourceSubtotal({
            externalUnitCost: r.external_unit_cost,
            safetyPercent: r.safety_margin_percent,
            salesPercent: r.sales_margin_percent,
            manualUnits: r.manual_units,
            relatedUnits: r.related_units
          });
        }, 0);
        
        return { ...act, resources_subtotal: subtotal };
      }));

      setActivities(activitiesWithSubtotals);
      setActivityLinks(allActivityLinksRes.data || []);

      // Calculate resources subtotal for each work area
      const enrichedData = await Promise.all((workAreasRes.data || []).map(async (area) => {
        // Get linked activities
        const { data: activityLinks } = await supabase
          .from('budget_work_area_activities')
          .select('activity_id')
          .eq('work_area_id', area.id);

        if (!activityLinks || activityLinks.length === 0) {
          return { ...area, resources_subtotal: 0 };
        }

        const activityIds = activityLinks.map(al => al.activity_id);

        // Get resources for those activities
        const { data: resources } = await supabase
          .from('budget_activity_resources')
          .select('external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent')
          .in('activity_id', activityIds);

        const subtotal = (resources || []).reduce((sum, r) => {
          return sum + calcResourceSubtotal({
            externalUnitCost: r.external_unit_cost,
            safetyPercent: r.safety_margin_percent,
            salesPercent: r.sales_margin_percent,
            manualUnits: r.manual_units,
            relatedUnits: r.related_units
          });
        }, 0);

        return { ...area, resources_subtotal: subtotal };
      }));

      setWorkAreas(enrichedData);
    } catch (error) {
      console.error('Error fetching work areas:', error);
      toast.error('Error al cargar áreas de trabajo');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (budgetId) {
      fetchWorkAreas();
    }
  }, [budgetId]);

  const handleOpenDialog = (area?: WorkArea) => {
    if (area) {
      setEditingArea(area);
      setFormData({
        name: area.name,
        level: area.level,
        work_area: area.work_area
      });
    } else {
      setEditingArea(null);
      setFormData({
        name: '',
        level: 'Nivel 1',
        work_area: 'Espacios'
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

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
        toast.success('Área de trabajo actualizada');
      } else {
        const { error } = await supabase
          .from('budget_work_areas')
          .insert({
            budget_id: budgetId,
            name: formData.name,
            level: formData.level,
            work_area: formData.work_area
          });

        if (error) throw error;
        toast.success('Área de trabajo creada');
      }

      setDialogOpen(false);
      fetchWorkAreas();
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
      fetchWorkAreas();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    }
  };

  // Group work areas by level
  const groupedByLevel = workAreas.reduce((acc, area) => {
    if (!acc[area.level]) {
      acc[area.level] = [];
    }
    acc[area.level].push(area);
    return acc;
  }, {} as Record<string, WorkArea[]>);

  // Sort alphabetically
  const sortedAlphabetically = [...workAreas].sort((a, b) => a.name.localeCompare(b.name));

  const totalSubtotal = workAreas.reduce((sum, wa) => sum + (wa.resources_subtotal || 0), 0);

  // Find activities without work areas
  const activityIdsWithWorkArea = new Set(activityLinks.map(link => link.activity_id));
  const activitiesWithoutWorkArea = activities.filter(a => !activityIdsWithWorkArea.has(a.id));

  // Calculate option subtotals based on activities linked to work areas
  const optionSubtotals = { A: 0, B: 0, C: 0 };
  activityLinks.forEach(link => {
    const activity = activities.find(a => a.id === link.activity_id);
    if (activity) {
      const subtotal = activity.resources_subtotal || 0;
      if (activity.opciones?.includes('A')) optionSubtotals.A += subtotal;
      if (activity.opciones?.includes('B')) optionSubtotals.B += subtotal;
      if (activity.opciones?.includes('C')) optionSubtotals.C += subtotal;
    }
  });

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
          {/* Warning for activities without work area */}
          {activitiesWithoutWorkArea.length > 0 && (
            <div className="mt-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              <strong>{activitiesWithoutWorkArea.length} actividades</strong> sin área de trabajo asignada
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
            <div className="flex gap-2 mb-4">
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

            {viewMode === 'options' ? (
              <WorkAreasOptionsGroupedView
                workAreas={workAreas}
                activities={activities}
                activityLinks={activityLinks}
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
                    <TableHead>Nombre</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead>Área de Trabajo</TableHead>
                    <TableHead>AreaID</TableHead>
                    <TableHead className="text-right">€ SubTotal</TableHead>
                    {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAlphabetically.map((area) => (
                    <TableRow key={area.id}>
                      <TableCell className="font-medium">{area.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{area.level}</Badge>
                      </TableCell>
                      <TableCell>{area.work_area}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{area.area_id}</code>
                      </TableCell>
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
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={expandAllLevels}>
                    Expandir todo
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAllLevels}>
                    Colapsar todo
                  </Button>
                </div>
                {LEVELS.map((level) => {
                  const areasInLevel = groupedByLevel[level] || [];
                  if (areasInLevel.length === 0) return null;

                  const levelSubtotal = areasInLevel.reduce(
                    (sum, wa) => sum + (wa.resources_subtotal || 0),
                    0
                  );
                  const isExpanded = expandedLevels.has(level);

                  return (
                    <div key={level} className="border rounded-lg overflow-hidden">
                      <button
                        className="w-full bg-muted/50 px-4 py-3 flex items-center justify-between hover:bg-muted/70 transition-colors"
                        onClick={() => toggleLevel(level)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Layers className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{level}</span>
                          <Badge variant="secondary">{areasInLevel.length}</Badge>
                        </div>
                        <span className="font-medium text-primary">
                          {formatCurrency(levelSubtotal)}
                        </span>
                      </button>
                      {isExpanded && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Área de Trabajo</TableHead>
                              <TableHead>AreaID</TableHead>
                              <TableHead className="text-right">€ SubTotal</TableHead>
                              {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {areasInLevel.map((area) => (
                              <TableRow key={area.id}>
                                <TableCell className="font-medium">{area.name}</TableCell>
                                <TableCell>{area.work_area}</TableCell>
                                <TableCell>
                                  <code className="text-xs bg-muted px-2 py-1 rounded">
                                    {area.area_id}
                                  </code>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(area.resources_subtotal || 0)}
                                </TableCell>
                                {isAdmin && (
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenDialog(area);
                                        }}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDelete(area.id);
                                        }}
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
                      )}
                    </div>
                  );
                })}
              </div>
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
                      <TableHead>Opciones</TableHead>
                      <TableHead className="text-right">€ SubTotal</TableHead>
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
                Define el nombre, nivel y tipo de área de trabajo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del área *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Cocina, Salón principal..."
                />
              </div>
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
                    {WORK_AREAS.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>AreaID generado:</strong>{' '}
                  <code className="bg-background px-2 py-1 rounded">
                    {formData.work_area}/{formData.level}
                  </code>
                </p>
              </div>
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
