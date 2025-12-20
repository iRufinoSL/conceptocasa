import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Activity, Package } from 'lucide-react';
import { searchMatch } from '@/lib/search-utils';

type AccessLevel = 'view' | 'edit';

interface ActivityItem {
  id: string;
  code: string;
  name: string;
  budget_id: string;
}

interface ResourceItem {
  id: string;
  name: string;
  resource_type: string | null;
  activity_id: string | null;
  budget_id: string;
}

interface UserGranularAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  presupuestoId: string;
  presupuestoNombre: string;
}

export function UserGranularAccessDialog({
  open,
  onOpenChange,
  userId,
  userName,
  presupuestoId,
  presupuestoNombre
}: UserGranularAccessDialogProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [activityAccess, setActivityAccess] = useState<Map<string, AccessLevel>>(new Map());
  const [resourceAccess, setResourceAccess] = useState<Map<string, AccessLevel>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('activities');
  
  // Track pending changes
  const [pendingActivityChanges, setPendingActivityChanges] = useState<Map<string, { action: 'add' | 'remove' | 'update'; level?: AccessLevel }>>(new Map());
  const [pendingResourceChanges, setPendingResourceChanges] = useState<Map<string, { action: 'add' | 'remove' | 'update'; level?: AccessLevel }>>(new Map());

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, presupuestoId, userId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch activities for this budget
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('budget_activities')
        .select('id, code, name, budget_id')
        .eq('budget_id', presupuestoId)
        .order('code');

      if (activitiesError) throw activitiesError;

      // Fetch resources for this budget
      const { data: resourcesData, error: resourcesError } = await supabase
        .from('budget_activity_resources')
        .select('id, name, resource_type, activity_id, budget_id')
        .eq('budget_id', presupuestoId)
        .order('name');

      if (resourcesError) throw resourcesError;

      // Fetch user's current activity access
      const activityIds = (activitiesData || []).map(a => a.id);
      let activityAccessMap = new Map<string, AccessLevel>();
      
      if (activityIds.length > 0) {
        const { data: activityAccessData, error: activityAccessError } = await supabase
          .from('user_activity_access')
          .select('activity_id, access_level')
          .eq('user_id', userId)
          .in('activity_id', activityIds);

        if (activityAccessError) throw activityAccessError;

        (activityAccessData || []).forEach(a => {
          activityAccessMap.set(a.activity_id, a.access_level as AccessLevel);
        });
      }

      // Fetch user's current resource access
      const resourceIds = (resourcesData || []).map(r => r.id);
      let resourceAccessMap = new Map<string, AccessLevel>();
      
      if (resourceIds.length > 0) {
        const { data: resourceAccessData, error: resourceAccessError } = await supabase
          .from('user_resource_access')
          .select('resource_id, access_level')
          .eq('user_id', userId)
          .in('resource_id', resourceIds);

        if (resourceAccessError) throw resourceAccessError;

        (resourceAccessData || []).forEach(r => {
          resourceAccessMap.set(r.resource_id, r.access_level as AccessLevel);
        });
      }

      setActivities(activitiesData || []);
      setResources(resourcesData || []);
      setActivityAccess(activityAccessMap);
      setResourceAccess(resourceAccessMap);
      setPendingActivityChanges(new Map());
      setPendingResourceChanges(new Map());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  const hasActivityAccess = (activityId: string): boolean => {
    const pending = pendingActivityChanges.get(activityId);
    if (pending) {
      if (pending.action === 'add') return true;
      if (pending.action === 'remove') return false;
    }
    return activityAccess.has(activityId);
  };

  const getActivityLevel = (activityId: string): AccessLevel => {
    const pending = pendingActivityChanges.get(activityId);
    if (pending?.level) return pending.level;
    return activityAccess.get(activityId) || 'view';
  };

  const hasResourceAccess = (resourceId: string): boolean => {
    const pending = pendingResourceChanges.get(resourceId);
    if (pending) {
      if (pending.action === 'add') return true;
      if (pending.action === 'remove') return false;
    }
    return resourceAccess.has(resourceId);
  };

  const getResourceLevel = (resourceId: string): AccessLevel => {
    const pending = pendingResourceChanges.get(resourceId);
    if (pending?.level) return pending.level;
    return resourceAccess.get(resourceId) || 'view';
  };

  const toggleActivityAccess = (activityId: string) => {
    const currentlyHasAccess = hasActivityAccess(activityId);
    const existingAccess = activityAccess.has(activityId);
    const newChanges = new Map(pendingActivityChanges);

    if (currentlyHasAccess) {
      if (existingAccess) {
        newChanges.set(activityId, { action: 'remove' });
      } else {
        newChanges.delete(activityId);
      }
    } else {
      if (existingAccess) {
        newChanges.delete(activityId);
      } else {
        newChanges.set(activityId, { action: 'add', level: 'view' });
      }
    }

    setPendingActivityChanges(newChanges);
  };

  const updateActivityLevel = (activityId: string, level: AccessLevel) => {
    const existingLevel = activityAccess.get(activityId);
    const newChanges = new Map(pendingActivityChanges);
    const pending = pendingActivityChanges.get(activityId);

    if (pending?.action === 'add') {
      newChanges.set(activityId, { action: 'add', level });
    } else if (existingLevel) {
      if (existingLevel === level) {
        newChanges.delete(activityId);
      } else {
        newChanges.set(activityId, { action: 'update', level });
      }
    }

    setPendingActivityChanges(newChanges);
  };

  const toggleResourceAccess = (resourceId: string) => {
    const currentlyHasAccess = hasResourceAccess(resourceId);
    const existingAccess = resourceAccess.has(resourceId);
    const newChanges = new Map(pendingResourceChanges);

    if (currentlyHasAccess) {
      if (existingAccess) {
        newChanges.set(resourceId, { action: 'remove' });
      } else {
        newChanges.delete(resourceId);
      }
    } else {
      if (existingAccess) {
        newChanges.delete(resourceId);
      } else {
        newChanges.set(resourceId, { action: 'add', level: 'view' });
      }
    }

    setPendingResourceChanges(newChanges);
  };

  const updateResourceLevel = (resourceId: string, level: AccessLevel) => {
    const existingLevel = resourceAccess.get(resourceId);
    const newChanges = new Map(pendingResourceChanges);
    const pending = pendingResourceChanges.get(resourceId);

    if (pending?.action === 'add') {
      newChanges.set(resourceId, { action: 'add', level });
    } else if (existingLevel) {
      if (existingLevel === level) {
        newChanges.delete(resourceId);
      } else {
        newChanges.set(resourceId, { action: 'update', level });
      }
    }

    setPendingResourceChanges(newChanges);
  };

  const handleSave = async () => {
    if (pendingActivityChanges.size === 0 && pendingResourceChanges.size === 0) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      // Process activity changes
      const activityInserts: { user_id: string; activity_id: string; access_level: AccessLevel }[] = [];
      const activityDeletes: string[] = [];
      const activityUpdates: { activity_id: string; access_level: AccessLevel }[] = [];

      pendingActivityChanges.forEach((change, activityId) => {
        if (change.action === 'add' && change.level) {
          activityInserts.push({ user_id: userId, activity_id: activityId, access_level: change.level });
        } else if (change.action === 'remove') {
          activityDeletes.push(activityId);
        } else if (change.action === 'update' && change.level) {
          activityUpdates.push({ activity_id: activityId, access_level: change.level });
        }
      });

      // Process resource changes
      const resourceInserts: { user_id: string; resource_id: string; access_level: AccessLevel }[] = [];
      const resourceDeletes: string[] = [];
      const resourceUpdates: { resource_id: string; access_level: AccessLevel }[] = [];

      pendingResourceChanges.forEach((change, resourceId) => {
        if (change.action === 'add' && change.level) {
          resourceInserts.push({ user_id: userId, resource_id: resourceId, access_level: change.level });
        } else if (change.action === 'remove') {
          resourceDeletes.push(resourceId);
        } else if (change.action === 'update' && change.level) {
          resourceUpdates.push({ resource_id: resourceId, access_level: change.level });
        }
      });

      // Execute activity operations
      if (activityDeletes.length > 0) {
        const { error } = await supabase
          .from('user_activity_access')
          .delete()
          .eq('user_id', userId)
          .in('activity_id', activityDeletes);
        if (error) throw error;
      }

      if (activityInserts.length > 0) {
        const { error } = await supabase
          .from('user_activity_access')
          .insert(activityInserts);
        if (error) throw error;
      }

      for (const update of activityUpdates) {
        const { error } = await supabase
          .from('user_activity_access')
          .update({ access_level: update.access_level })
          .eq('user_id', userId)
          .eq('activity_id', update.activity_id);
        if (error) throw error;
      }

      // Execute resource operations
      if (resourceDeletes.length > 0) {
        const { error } = await supabase
          .from('user_resource_access')
          .delete()
          .eq('user_id', userId)
          .in('resource_id', resourceDeletes);
        if (error) throw error;
      }

      if (resourceInserts.length > 0) {
        const { error } = await supabase
          .from('user_resource_access')
          .insert(resourceInserts);
        if (error) throw error;
      }

      for (const update of resourceUpdates) {
        const { error } = await supabase
          .from('user_resource_access')
          .update({ access_level: update.access_level })
          .eq('user_id', userId)
          .eq('resource_id', update.resource_id);
        if (error) throw error;
      }

      toast.success('Accesos granulares actualizados');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving access:', error);
      toast.error(error.message || 'Error al guardar accesos');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredActivities = activities.filter(a =>
    searchMatch(a.name, searchTerm) ||
    searchMatch(a.code, searchTerm)
  );

  const filteredResources = resources.filter(r =>
    searchMatch(r.name, searchTerm) ||
    searchMatch(r.resource_type, searchTerm)
  );

  const activityAccessCount = activities.filter(a => hasActivityAccess(a.id)).length;
  const resourceAccessCount = resources.filter(r => hasResourceAccess(r.id)).length;
  const totalPendingChanges = pendingActivityChanges.size + pendingResourceChanges.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Accesos Granulares
          </DialogTitle>
          <DialogDescription>
            Gestiona accesos específicos de {userName} a actividades y recursos del presupuesto <strong>{presupuestoNombre}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          {totalPendingChanges > 0 && (
            <Badge variant="secondary">{totalPendingChanges} cambio{totalPendingChanges !== 1 ? 's' : ''} pendiente{totalPendingChanges !== 1 ? 's' : ''}</Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="activities" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Actividades
              <Badge variant="outline" className="ml-1">{activityAccessCount}/{activities.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Recursos
              <Badge variant="outline" className="ml-1">{resourceAccessCount}/{resources.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activities" className="flex-1 mt-4">
            <ScrollArea className="h-[350px] border rounded-md">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No se encontraron actividades' : 'No hay actividades en este presupuesto'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Acceso</TableHead>
                      <TableHead className="w-20">Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-32">Nivel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivities.map((activity) => {
                      const hasAccess = hasActivityAccess(activity.id);
                      const level = getActivityLevel(activity.id);
                      const isPending = pendingActivityChanges.has(activity.id);

                      return (
                        <TableRow key={activity.id} className={isPending ? 'bg-muted/50' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={hasAccess}
                              onCheckedChange={() => toggleActivityAccess(activity.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.code}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{activity.name}</TableCell>
                          <TableCell>
                            <Select
                              value={level}
                              onValueChange={(value: AccessLevel) => updateActivityLevel(activity.id, value)}
                              disabled={!hasAccess}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="view">Solo ver</SelectItem>
                                <SelectItem value="edit">Ver y editar</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="resources" className="flex-1 mt-4">
            <ScrollArea className="h-[350px] border rounded-md">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : filteredResources.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No se encontraron recursos' : 'No hay recursos en este presupuesto'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Acceso</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="w-32">Nivel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResources.map((resource) => {
                      const hasAccess = hasResourceAccess(resource.id);
                      const level = getResourceLevel(resource.id);
                      const isPending = pendingResourceChanges.has(resource.id);

                      return (
                        <TableRow key={resource.id} className={isPending ? 'bg-muted/50' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={hasAccess}
                              onCheckedChange={() => toggleResourceAccess(resource.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{resource.name}</TableCell>
                          <TableCell>
                            {resource.resource_type && (
                              <Badge variant="secondary">{resource.resource_type}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={level}
                              onValueChange={(value: AccessLevel) => updateResourceLevel(resource.id, value)}
                              disabled={!hasAccess}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="view">Solo ver</SelectItem>
                                <SelectItem value="edit">Ver y editar</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || totalPendingChanges === 0}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
