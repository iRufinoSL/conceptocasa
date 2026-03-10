import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Target, Eye, EyeOff, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

interface Destination {
  id: string;
  budget_id: string;
  internal_name: string;
  public_name: string;
  order_index: number;
  created_at: string;
}

interface ActivityDestination {
  activity_id: string;
  destination_id: string;
}

interface Activity {
  id: string;
  name: string;
  code: string;
}

interface BudgetDestinationsManagerProps {
  budgetId: string;
  activities: Activity[];
  isAdmin: boolean;
  canEdit: boolean;
}

export function BudgetDestinationsManager({ budgetId, activities, isAdmin, canEdit }: BudgetDestinationsManagerProps) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activityDestinations, setActivityDestinations] = useState<ActivityDestination[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [editingDest, setEditingDest] = useState<Destination | null>(null);
  const [deleteDest, setDeleteDest] = useState<Destination | null>(null);
  const [internalName, setInternalName] = useState('');
  const [publicName, setPublicName] = useState('');

  // Expanded destination to see/edit activity assignments
  const [expandedDestId, setExpandedDestId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [destRes, adRes] = await Promise.all([
      supabase
        .from('budget_destinations')
        .select('*')
        .eq('budget_id', budgetId)
        .order('order_index'),
      supabase
        .from('budget_activity_destinations')
        .select('activity_id, destination_id')
        .in('destination_id', 
          // We'll fetch all and filter client-side to avoid empty IN
          []
        ),
    ]);

    const dests = (destRes.data || []) as Destination[];
    setDestinations(dests);

    // Now fetch activity destinations for these destination IDs
    if (dests.length > 0) {
      const { data: adData } = await supabase
        .from('budget_activity_destinations')
        .select('activity_id, destination_id')
        .in('destination_id', dests.map(d => d.id));
      setActivityDestinations((adData || []) as ActivityDestination[]);
    } else {
      setActivityDestinations([]);
    }

    setIsLoading(false);
  }, [budgetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!internalName.trim() || !publicName.trim()) {
      toast.error('Ambos nombres son obligatorios');
      return;
    }

    if (editingDest) {
      const { error } = await supabase
        .from('budget_destinations')
        .update({ internal_name: internalName.trim(), public_name: publicName.trim() })
        .eq('id', editingDest.id);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Destino actualizado');
    } else {
      const { error } = await supabase
        .from('budget_destinations')
        .insert({
          budget_id: budgetId,
          internal_name: internalName.trim(),
          public_name: publicName.trim(),
          order_index: destinations.length,
        });
      if (error) { toast.error('Error al crear destino'); return; }
      toast.success('Destino creado — todas las actividades asignadas automáticamente');
    }

    setFormOpen(false);
    setEditingDest(null);
    setInternalName('');
    setPublicName('');
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteDest) return;
    const { error } = await supabase.from('budget_destinations').delete().eq('id', deleteDest.id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Destino eliminado');
    setDeleteDest(null);
    fetchData();
  };

  const toggleActivityDestination = async (activityId: string, destinationId: string, assigned: boolean) => {
    if (assigned) {
      // Remove
      const { error } = await supabase
        .from('budget_activity_destinations')
        .delete()
        .eq('activity_id', activityId)
        .eq('destination_id', destinationId);
      if (error) { toast.error('Error'); return; }
    } else {
      // Add
      const { error } = await supabase
        .from('budget_activity_destinations')
        .insert({ activity_id: activityId, destination_id: destinationId });
      if (error) { toast.error('Error'); return; }
    }
    fetchData();
  };

  const getAssignedCount = (destId: string) =>
    activityDestinations.filter(ad => ad.destination_id === destId).length;

  const isActivityAssigned = (activityId: string, destId: string) =>
    activityDestinations.some(ad => ad.activity_id === activityId && ad.destination_id === destId);

  const openEdit = (dest: Destination) => {
    setEditingDest(dest);
    setInternalName(dest.internal_name);
    setPublicName(dest.public_name);
    setFormOpen(true);
  };

  const openNew = () => {
    setEditingDest(null);
    setInternalName('');
    setPublicName('');
    setFormOpen(true);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Cargando destinos...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Destinos del Presupuesto
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada destino tiene un nombre interno (uso privado) y uno público (aparece en PDFs).
            Las actividades se asignan automáticamente a todos los destinos.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Destino
          </Button>
        )}
      </div>

      {destinations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No hay destinos definidos</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea destinos para organizar qué actividades aparecen en cada presupuesto impreso.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {destinations.map(dest => {
            const assigned = getAssignedCount(dest.id);
            const isExpanded = expandedDestId === dest.id;
            return (
              <Card key={dest.id} className="overflow-hidden">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{dest.internal_name}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">Interno</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate">{dest.public_name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Público / PDF</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {assigned}/{activities.length} actividades
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExpandedDestId(isExpanded ? null : dest.id)}
                      >
                        {isExpanded ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                        {isExpanded ? 'Ocultar' : 'Ver'} actividades
                      </Button>
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(dest)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDest(dest)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-3">
                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Asig.</TableHead>
                            <TableHead className="w-20">Código</TableHead>
                            <TableHead>Actividad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activities.map(act => {
                            const assigned = isActivityAssigned(act.id, dest.id);
                            return (
                              <TableRow key={act.id} className="h-8">
                                <TableCell className="py-1">
                                  <Checkbox
                                    checked={assigned}
                                    disabled={!canEdit}
                                    onCheckedChange={() => toggleActivityDestination(act.id, dest.id, assigned)}
                                  />
                                </TableCell>
                                <TableCell className="py-1 font-mono text-xs">{act.code}</TableCell>
                                <TableCell className="py-1 text-xs">{act.name}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDest ? 'Editar Destino' : 'Nuevo Destino'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nombre Interno (uso privado)</Label>
              <Input
                value={internalName}
                onChange={e => setInternalName(e.target.value)}
                placeholder="Ej: Presupuesto para el cliente"
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Solo visible para los usuarios de la aplicación</p>
            </div>
            <div>
              <Label className="text-xs">Nombre Público (aparece en PDF)</Label>
              <Input
                value={publicName}
                onChange={e => setPublicName(e.target.value)}
                placeholder="Ej: Presupuesto de Reforma Integral"
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Este nombre se imprimirá en los documentos PDF</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingDest ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <DeleteConfirmDialog
        open={!!deleteDest}
        onOpenChange={(open) => { if (!open) setDeleteDest(null); }}
        onConfirm={handleDelete}
        title="Eliminar Destino"
        description={`¿Eliminar el destino "${deleteDest?.internal_name}"? Las asignaciones de actividades se eliminarán también.`}
      />
    </div>
  );
}
