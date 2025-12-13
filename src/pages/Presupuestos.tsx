import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Calculator, Search, LayoutGrid, List, Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string | null;
  coordenadas_lat: number | null;
  coordenadas_lng: number | null;
  created_at: string;
  project_id: string | null;
}

interface PresupuestoForm {
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string;
  coordenadas_lat: string;
  coordenadas_lng: string;
}

const emptyForm: PresupuestoForm = {
  nombre: '',
  codigo_correlativo: 0,
  version: 'v1.0',
  poblacion: '',
  provincia: '',
  coordenadas_lat: '',
  coordenadas_lng: ''
};

export default function Presupuestos() {
  const navigate = useNavigate();
  const { user, loading, roles } = useAuth();
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  
  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPresupuesto, setEditingPresupuesto] = useState<Presupuesto | null>(null);
  const [deletingPresupuesto, setDeletingPresupuesto] = useState<Presupuesto | null>(null);
  const [form, setForm] = useState<PresupuestoForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = roles.includes('administrador');

  // Generate PresupuestoID (calculated field)
  const generatePresupuestoId = (p: Presupuesto | PresupuestoForm) => {
    const nombre = p.nombre || '';
    const codigo = 'codigo_correlativo' in p ? p.codigo_correlativo : 0;
    const version = p.version || '';
    const poblacion = p.poblacion || '';
    return `${nombre} (${codigo}/${version}): ${poblacion}`;
  };

  // Fetch presupuestos
  const fetchPresupuestos = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error fetching presupuestos:', error);
        toast.error('Error al cargar presupuestos');
      } else {
        setPresupuestos(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      fetchPresupuestos();
    }
  }, [user, loading]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Get next correlative code
  const getNextCode = async (): Promise<number> => {
    const { data } = await supabase
      .from('presupuestos')
      .select('codigo_correlativo')
      .order('codigo_correlativo', { ascending: false })
      .limit(1);
    
    return (data?.[0]?.codigo_correlativo || 0) + 1;
  };

  // Open form for new presupuesto
  const handleNew = async () => {
    const nextCode = await getNextCode();
    setEditingPresupuesto(null);
    setForm({ ...emptyForm, codigo_correlativo: nextCode });
    setFormDialogOpen(true);
  };

  // Open form for editing
  const handleEdit = (p: Presupuesto) => {
    setEditingPresupuesto(p);
    setForm({
      nombre: p.nombre,
      codigo_correlativo: p.codigo_correlativo,
      version: p.version,
      poblacion: p.poblacion,
      provincia: p.provincia || '',
      coordenadas_lat: p.coordenadas_lat?.toString() || '',
      coordenadas_lng: p.coordenadas_lng?.toString() || ''
    });
    setFormDialogOpen(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (p: Presupuesto) => {
    setDeletingPresupuesto(p);
    setDeleteDialogOpen(true);
  };

  // Save presupuesto (create or update)
  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.poblacion.trim()) {
      toast.error('La población es obligatoria');
      return;
    }

    setIsSaving(true);

    try {
      const data = {
        nombre: form.nombre.trim(),
        codigo_correlativo: form.codigo_correlativo,
        version: form.version.trim() || 'v1.0',
        poblacion: form.poblacion.trim(),
        provincia: form.provincia.trim() || null,
        coordenadas_lat: form.coordenadas_lat ? parseFloat(form.coordenadas_lat) : null,
        coordenadas_lng: form.coordenadas_lng ? parseFloat(form.coordenadas_lng) : null
      };

      if (editingPresupuesto) {
        // Update
        const { error } = await supabase
          .from('presupuestos')
          .update(data)
          .eq('id', editingPresupuesto.id);

        if (error) throw error;
        toast.success('Presupuesto actualizado');
      } else {
        // Create
        const { error } = await supabase
          .from('presupuestos')
          .insert(data);

        if (error) throw error;
        toast.success('Presupuesto creado');
      }

      setFormDialogOpen(false);
      fetchPresupuestos();
    } catch (err: any) {
      console.error('Error saving:', err);
      toast.error(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete presupuesto
  const handleDelete = async () => {
    if (!deletingPresupuesto) return;

    try {
      const { error } = await supabase
        .from('presupuestos')
        .delete()
        .eq('id', deletingPresupuesto.id);

      if (error) throw error;
      toast.success('Presupuesto eliminado');
      setDeleteDialogOpen(false);
      setDeletingPresupuesto(null);
      fetchPresupuestos();
    } catch (err: any) {
      console.error('Error deleting:', err);
      toast.error(err.message || 'Error al eliminar');
    }
  };

  // Filter presupuestos
  const filteredPresupuestos = presupuestos.filter(p => {
    const term = searchTerm.toLowerCase();
    const presupuestoId = generatePresupuestoId(p).toLowerCase();
    return (
      p.nombre?.toLowerCase().includes(term) ||
      p.poblacion?.toLowerCase().includes(term) ||
      p.provincia?.toLowerCase().includes(term) ||
      p.codigo_correlativo?.toString().includes(term) ||
      p.version?.toLowerCase().includes(term) ||
      presupuestoId.includes(term)
    );
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <AppNavDropdown />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Presupuestos</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Gestión de Presupuestos</h2>
            <p className="text-muted-foreground">
              Lista de presupuestos ordenados alfabéticamente
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Presupuesto
            </Button>
          )}
        </div>

        {/* Search and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, población, provincia, código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {filteredPresupuestos.length} presupuesto(s) encontrado(s)
        </p>

        {/* Cards View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPresupuestos.map((p) => (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{p.nombre}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {generatePresupuestoId(p)}
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p><strong>Código:</strong> {p.codigo_correlativo}</p>
                    <p><strong>Versión:</strong> {p.version}</p>
                    <p><strong>Población:</strong> {p.poblacion}</p>
                    {p.provincia && <p><strong>Provincia:</strong> {p.provincia}</p>}
                    {p.coordenadas_lat && p.coordenadas_lng && (
                      <p><strong>Coordenadas:</strong> {p.coordenadas_lat}, {p.coordenadas_lng}</p>
                    )}
                    <p><strong>Creado:</strong> {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: es })}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PresupuestoID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Población</TableHead>
                  <TableHead>Provincia</TableHead>
                  <TableHead>Creado</TableHead>
                  {isAdmin && <TableHead className="w-24">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPresupuestos.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {generatePresupuestoId(p)}
                    </TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>{p.codigo_correlativo}</TableCell>
                    <TableCell>{p.version}</TableCell>
                    <TableCell>{p.poblacion}</TableCell>
                    <TableCell>{p.provincia || '-'}</TableCell>
                    <TableCell>{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: es })}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(p)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Empty state */}
        {filteredPresupuestos.length === 0 && (
          <div className="text-center py-12">
            <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No se encontraron presupuestos
            </h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Prueba con otros términos de búsqueda' : 'No hay presupuestos disponibles'}
            </p>
          </div>
        )}
      </main>

      {/* Form Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPresupuesto ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </DialogTitle>
            <DialogDescription>
              {editingPresupuesto 
                ? 'Modifica los datos del presupuesto'
                : 'Introduce los datos del nuevo presupuesto'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre del Presupuesto *</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Casa García-Martínez"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Código Correlativo</Label>
                <Input
                  id="codigo"
                  type="number"
                  value={form.codigo_correlativo}
                  onChange={(e) => setForm({ ...form, codigo_correlativo: parseInt(e.target.value) || 0 })}
                  disabled={!!editingPresupuesto}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Versión</Label>
                <Input
                  id="version"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="Ej: v1.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="poblacion">Población *</Label>
                <Input
                  id="poblacion"
                  value={form.poblacion}
                  onChange={(e) => setForm({ ...form, poblacion: e.target.value })}
                  placeholder="Ej: Madrid"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  value={form.provincia}
                  onChange={(e) => setForm({ ...form, provincia: e.target.value })}
                  placeholder="Ej: Madrid"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lat">Latitud</Label>
                <Input
                  id="lat"
                  value={form.coordenadas_lat}
                  onChange={(e) => setForm({ ...form, coordenadas_lat: e.target.value })}
                  placeholder="Ej: 40.4168"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">Longitud</Label>
                <Input
                  id="lng"
                  value={form.coordenadas_lng}
                  onChange={(e) => setForm({ ...form, coordenadas_lng: e.target.value })}
                  placeholder="Ej: -3.7038"
                />
              </div>
            </div>

            {/* Preview of PresupuestoID */}
            <div className="p-3 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground">PresupuestoID (calculado)</Label>
              <p className="text-sm font-medium mt-1">{generatePresupuestoId(form)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Guardando...' : (editingPresupuesto ? 'Guardar cambios' : 'Crear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Presupuesto"
        description={`¿Estás seguro de que deseas eliminar el presupuesto "${deletingPresupuesto?.nombre}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
