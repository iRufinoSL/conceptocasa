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
import { Plus, Trash2, Edit2, MapPin, List, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';

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

export function BudgetWorkAreasTab({ budgetId, isAdmin }: BudgetWorkAreasTabProps) {
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'alphabetic' | 'grouped'>('grouped');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<WorkArea | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    level: 'Nivel 1',
    work_area: 'Espacios'
  });

  const fetchWorkAreas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_work_areas')
        .select('*')
        .eq('budget_id', budgetId)
        .order('level', { ascending: true })
        .order('work_area', { ascending: true });

      if (error) throw error;

      // Calculate resources subtotal for each work area
      const enrichedData = await Promise.all((data || []).map(async (area) => {
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
          .select('external_unit_cost, manual_units, safety_margin_percent, sales_margin_percent')
          .in('activity_id', activityIds);

        const subtotal = (resources || []).reduce((sum, r) => {
          const baseCost = (r.external_unit_cost || 0) * (r.manual_units || 0);
          const withSafety = baseCost * (1 + (r.safety_margin_percent || 0) / 100);
          const withMargin = withSafety * (1 + (r.sales_margin_percent || 0) / 100);
          return sum + withMargin;
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
            </div>

            {viewMode === 'alphabetic' ? (
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
              <div className="space-y-6">
                {LEVELS.map((level) => {
                  const areasInLevel = groupedByLevel[level] || [];
                  if (areasInLevel.length === 0) return null;

                  const levelSubtotal = areasInLevel.reduce(
                    (sum, wa) => sum + (wa.resources_subtotal || 0),
                    0
                  );

                  return (
                    <div key={level} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          {level}
                          <Badge variant="secondary">{areasInLevel.length}</Badge>
                        </h3>
                        <span className="font-medium text-primary">
                          {formatCurrency(levelSubtotal)}
                        </span>
                      </div>
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
                    </div>
                  );
                })}
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
