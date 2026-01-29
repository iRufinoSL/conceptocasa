import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserCheck, Plus, Trash2, Eye } from 'lucide-react';

interface ModelUser {
  id: string;
  user_id: string;
  description: string | null;
  role_type: string;
  is_active: boolean;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

export function ModelUsersManager() {
  const [modelUsers, setModelUsers] = useState<ModelUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roleType, setRoleType] = useState<string>('cliente');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch model users
      const { data: modelData, error: modelError } = await supabase
        .from('model_users')
        .select('*')
        .order('role_type');

      if (modelError) throw modelError;

      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('email');

      if (profilesError) throw profilesError;

      // Enrich model users with profile data
      const enrichedModelUsers = (modelData || []).map(m => ({
        ...m,
        profile: profilesData?.find(p => p.id === m.user_id),
      }));

      setModelUsers(enrichedModelUsers);

      // Filter out users that are already model users
      const modelUserIds = new Set(modelData?.map(m => m.user_id) || []);
      const available = (profilesData || []).filter(p => !modelUserIds.has(p.id));
      setAvailableUsers(available);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar usuarios modelo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddModelUser = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('model_users').insert({
        user_id: selectedUserId,
        role_type: roleType,
        description: description || null,
        is_active: true,
      });

      if (error) throw error;

      toast.success('Usuario modelo añadido');
      setIsDialogOpen(false);
      setSelectedUserId('');
      setRoleType('cliente');
      setDescription('');
      fetchData();
    } catch (error: any) {
      console.error('Error adding model user:', error);
      toast.error(error.message || 'Error al añadir usuario modelo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveModelUser = async (id: string) => {
    try {
      const { error } = await supabase.from('model_users').delete().eq('id', id);
      if (error) throw error;
      toast.success('Usuario modelo eliminado');
      fetchData();
    } catch (error: any) {
      console.error('Error removing model user:', error);
      toast.error(error.message || 'Error al eliminar');
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'administrador':
        return 'default';
      case 'colaborador':
        return 'secondary';
      case 'cliente':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Usuarios Modelo</CardTitle>
              <CardDescription>
                Usuarios de prueba para verificar permisos y vistas de cada rol
              </CardDescription>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Añadir
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Añadir Usuario Modelo</DialogTitle>
                <DialogDescription>
                  Selecciona un usuario existente para marcarlo como modelo de pruebas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Usuario</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar usuario..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Rol</Label>
                  <Select value={roleType} onValueChange={setRoleType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administrador">Administrador</SelectItem>
                      <SelectItem value="colaborador">Colaborador</SelectItem>
                      <SelectItem value="cliente">Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Ej: Usuario modelo para testing de vista cliente"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddModelUser} disabled={isSaving || !selectedUserId}>
                  {isSaving ? 'Guardando...' : 'Añadir'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : modelUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay usuarios modelo configurados</p>
            <p className="text-sm">Añade usuarios para probar diferentes perspectivas del sistema</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol Modelo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelUsers.map(mu => (
                <TableRow key={mu.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{mu.profile?.full_name || 'Sin nombre'}</p>
                      <p className="text-sm text-muted-foreground">{mu.profile?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(mu.role_type)}>
                      {mu.role_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {mu.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveModelUser(mu.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
