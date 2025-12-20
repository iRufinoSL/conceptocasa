import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Search, FolderOpen, Settings2 } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';
import { UserGranularAccessDialog } from './UserGranularAccessDialog';

type AppRole = 'administrador' | 'colaborador' | 'cliente';

interface Presupuesto {
  id: string;
  nombre: string;
  version: string;
  poblacion: string;
}

interface UserBudgetAccess {
  presupuesto_id: string;
  role: AppRole;
}

interface UserBudgetAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userEmail: string;
}

export function UserBudgetAccessDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userEmail
}: UserBudgetAccessDialogProps) {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [userAccess, setUserAccess] = useState<UserBudgetAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, { action: 'add' | 'remove' | 'update'; role?: AppRole }>>(new Map());
  
  // Granular access dialog state
  const [isGranularOpen, setIsGranularOpen] = useState(false);
  const [granularPresupuesto, setGranularPresupuesto] = useState<Presupuesto | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, userId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all presupuestos
      const { data: presupuestosData, error: presupuestosError } = await supabase
        .from('presupuestos')
        .select('id, nombre, version, poblacion')
        .order('nombre');

      if (presupuestosError) throw presupuestosError;

      // Fetch user's current access
      const { data: accessData, error: accessError } = await supabase
        .from('user_presupuestos')
        .select('presupuesto_id, role')
        .eq('user_id', userId);

      if (accessError) throw accessError;

      setPresupuestos(presupuestosData || []);
      setUserAccess(accessData || []);
      setPendingChanges(new Map());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  const hasAccess = (presupuestoId: string): boolean => {
    const pending = pendingChanges.get(presupuestoId);
    if (pending) {
      if (pending.action === 'add') return true;
      if (pending.action === 'remove') return false;
    }
    return userAccess.some(a => a.presupuesto_id === presupuestoId);
  };

  const getRole = (presupuestoId: string): AppRole => {
    const pending = pendingChanges.get(presupuestoId);
    if (pending?.role) return pending.role;
    const access = userAccess.find(a => a.presupuesto_id === presupuestoId);
    return access?.role || 'cliente';
  };

  const toggleAccess = (presupuestoId: string) => {
    const currentlyHasAccess = hasAccess(presupuestoId);
    const existingAccess = userAccess.find(a => a.presupuesto_id === presupuestoId);
    const newChanges = new Map(pendingChanges);

    if (currentlyHasAccess) {
      if (existingAccess) {
        newChanges.set(presupuestoId, { action: 'remove' });
      } else {
        newChanges.delete(presupuestoId);
      }
    } else {
      if (existingAccess) {
        newChanges.delete(presupuestoId);
      } else {
        newChanges.set(presupuestoId, { action: 'add', role: 'cliente' });
      }
    }

    setPendingChanges(newChanges);
  };

  const updateRole = (presupuestoId: string, role: AppRole) => {
    const existingAccess = userAccess.find(a => a.presupuesto_id === presupuestoId);
    const newChanges = new Map(pendingChanges);
    const pending = pendingChanges.get(presupuestoId);

    if (pending?.action === 'add') {
      newChanges.set(presupuestoId, { action: 'add', role });
    } else if (existingAccess) {
      if (existingAccess.role === role) {
        newChanges.delete(presupuestoId);
      } else {
        newChanges.set(presupuestoId, { action: 'update', role });
      }
    }

    setPendingChanges(newChanges);
  };

  const handleSave = async () => {
    if (pendingChanges.size === 0) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      const toInsert: { user_id: string; presupuesto_id: string; role: AppRole }[] = [];
      const toDelete: string[] = [];
      const toUpdate: { presupuesto_id: string; role: AppRole }[] = [];

      pendingChanges.forEach((change, presupuestoId) => {
        if (change.action === 'add' && change.role) {
          toInsert.push({ user_id: userId, presupuesto_id: presupuestoId, role: change.role });
        } else if (change.action === 'remove') {
          toDelete.push(presupuestoId);
        } else if (change.action === 'update' && change.role) {
          toUpdate.push({ presupuesto_id: presupuestoId, role: change.role });
        }
      });

      // Perform deletions
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('user_presupuestos')
          .delete()
          .eq('user_id', userId)
          .in('presupuesto_id', toDelete);
        if (error) throw error;
      }

      // Perform insertions
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('user_presupuestos')
          .insert(toInsert);
        if (error) throw error;
      }

      // Perform updates
      for (const update of toUpdate) {
        const { error } = await supabase
          .from('user_presupuestos')
          .update({ role: update.role })
          .eq('user_id', userId)
          .eq('presupuesto_id', update.presupuesto_id);
        if (error) throw error;
      }

      toast.success('Accesos actualizados correctamente');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving access:', error);
      toast.error(error.message || 'Error al guardar accesos');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPresupuestos = presupuestos.filter(p =>
    searchMatch(p.nombre, searchTerm) ||
    searchMatch(p.poblacion, searchTerm) ||
    searchMatch(p.version, searchTerm)
  );

  const accessCount = presupuestos.filter(p => hasAccess(p.id)).length;

  const handleOpenGranular = (presupuesto: Presupuesto) => {
    setGranularPresupuesto(presupuesto);
    setIsGranularOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Accesos a Presupuestos
          </DialogTitle>
          <DialogDescription>
            Gestiona los presupuestos a los que {userName || userEmail} tiene acceso y su rol en cada uno.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar presupuestos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Badge variant="outline">{accessCount} acceso{accessCount !== 1 ? 's' : ''}</Badge>
          {pendingChanges.size > 0 && (
            <Badge variant="secondary">{pendingChanges.size} cambio{pendingChanges.size !== 1 ? 's' : ''} pendiente{pendingChanges.size !== 1 ? 's' : ''}</Badge>
          )}
        </div>

        <ScrollArea className="flex-1 border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredPresupuestos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No se encontraron presupuestos' : 'No hay presupuestos disponibles'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Acceso</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead>Población</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead className="w-40">Rol</TableHead>
                  <TableHead className="w-16">Granular</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPresupuestos.map((presupuesto) => {
                  const hasAccessToBudget = hasAccess(presupuesto.id);
                  const role = getRole(presupuesto.id);
                  const isPending = pendingChanges.has(presupuesto.id);

                  return (
                    <TableRow key={presupuesto.id} className={isPending ? 'bg-muted/50' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={hasAccessToBudget}
                          onCheckedChange={() => toggleAccess(presupuesto.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{presupuesto.nombre}</TableCell>
                      <TableCell>{presupuesto.poblacion}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{presupuesto.version}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={role}
                          onValueChange={(value: AppRole) => updateRole(presupuesto.id, value)}
                          disabled={!hasAccessToBudget}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="administrador">Administrador</SelectItem>
                            <SelectItem value="colaborador">Colaborador</SelectItem>
                            <SelectItem value="cliente">Cliente</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {hasAccessToBudget && (role === 'colaborador' || role === 'cliente') && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenGranular(presupuesto)}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accesos granulares</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || pendingChanges.size === 0}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Granular Access Dialog */}
      {granularPresupuesto && (
        <UserGranularAccessDialog
          open={isGranularOpen}
          onOpenChange={setIsGranularOpen}
          userId={userId}
          userName={userName || userEmail}
          presupuestoId={granularPresupuesto.id}
          presupuestoNombre={granularPresupuesto.nombre}
        />
      )}
    </Dialog>
  );
}
