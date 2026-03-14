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
import { ArrowLeft, Calculator, Search, LayoutGrid, List, Plus, Pencil, Trash2, ExternalLink, RefreshCw, Copy, Archive, ChevronDown, ChevronRight, Play, Crown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { BackupButton } from '@/components/BackupButton';
import { recalculateAllBudgetResources } from '@/lib/budget-utils';
import { searchMatch } from '@/lib/search-utils';
import { CloneBudgetDialog } from '@/components/presupuestos/CloneBudgetDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { createModelBudget, getModelBudget } from '@/lib/model-budget-sync';

type PresupuestoStatus = 'activo' | 'en_ejecucion' | 'archivado' | 'modelo';

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
  archived: boolean;
  status: PresupuestoStatus;
  is_model?: boolean;
  model_budget_id?: string | null;
}

interface PresupuestoForm {
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  provincia: string;
  direccion: string;
  coordenadas_lat: string;
  coordenadas_lng: string;
  google_maps_url: string;
  status: PresupuestoStatus;
  start_date: string;
  end_date: string;
}

const emptyForm: PresupuestoForm = {
  nombre: '',
  codigo_correlativo: 0,
  version: 'v1.0',
  poblacion: '',
  provincia: '',
  direccion: '',
  coordenadas_lat: '',
  coordenadas_lng: '',
  google_maps_url: '',
  status: 'activo',
  start_date: '',
  end_date: ''
};

// Calculate duration in days between two dates
const calculateDurationDays = (startDate: string, endDate: string): number | null => {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
};

const STATUS_LABELS: Record<PresupuestoStatus, string> = {
  activo: 'Activo',
  en_ejecucion: 'En Ejecución',
  archivado: 'Archivado',
  modelo: 'Modelo',
};

const STATUS_COLORS: Record<PresupuestoStatus, string> = {
  activo: 'bg-primary/10 text-primary',
  en_ejecucion: 'bg-amber-500/10 text-amber-600',
  archivado: 'bg-muted text-muted-foreground',
  modelo: 'bg-violet-500/10 text-violet-600',
};

// Subcomponent for Card view
interface PresupuestoCardProps {
  p: Presupuesto;
  isAdmin: boolean;
  recalculatingId: string | null;
  onRecalculate: (e: React.MouseEvent, id: string) => void;
  onEdit: (p: Presupuesto) => void;
  onDelete: (p: Presupuesto) => void;
  onStatusChange: (e: React.MouseEvent, p: Presupuesto, status: PresupuestoStatus) => void;
  onNavigate: (id: string) => void;
  generatePresupuestoId: (p: Presupuesto) => string;
}

const PresupuestoCard = ({ p, isAdmin, recalculatingId, onRecalculate, onEdit, onDelete, onStatusChange, onNavigate, generatePresupuestoId }: PresupuestoCardProps) => (
  <Card 
    className={`hover:shadow-md transition-shadow cursor-pointer group ${p.status === 'archivado' ? 'border-dashed opacity-75' : ''}`}
    onClick={() => onNavigate(p.id)}
  >
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={STATUS_COLORS[p.status]}>
              {p.status === 'en_ejecucion' && <Play className="h-3 w-3 mr-1" />}
              {p.status === 'archivado' && <Archive className="h-3 w-3 mr-1" />}
              {p.status === 'modelo' && <Crown className="h-3 w-3 mr-1" />}
              {STATUS_LABELS[p.status]}
            </Badge>
          </div>
          <CardTitle className="text-lg group-hover:text-primary transition-colors">
            {p.nombre}
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {generatePresupuestoId(p)}
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {isAdmin && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                title="Recalcular"
                onClick={(e) => onRecalculate(e, p.id)}
                disabled={recalculatingId === p.id}
              >
                <RefreshCw className={`h-4 w-4 ${recalculatingId === p.id ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                title="Editar"
                onClick={(e) => { e.stopPropagation(); onEdit(p); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                title="Eliminar"
                onClick={(e) => { e.stopPropagation(); onDelete(p); }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
          <Button 
            variant="ghost" 
            size="icon"
            title="Ir al Panel de control"
            onClick={(e) => { e.stopPropagation(); onNavigate(p.id); }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
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
);

// Subcomponent for Row view
interface PresupuestoRowProps {
  p: Presupuesto;
  isAdmin: boolean;
  recalculatingId: string | null;
  onRecalculate: (e: React.MouseEvent, id: string) => void;
  onEdit: (p: Presupuesto) => void;
  onDelete: (p: Presupuesto) => void;
  onStatusChange: (e: React.MouseEvent, p: Presupuesto, status: PresupuestoStatus) => void;
  onNavigate: (id: string) => void;
  generatePresupuestoId: (p: Presupuesto) => string;
}

const PresupuestoRow = ({ p, isAdmin, recalculatingId, onRecalculate, onEdit, onDelete, onStatusChange, onNavigate, generatePresupuestoId }: PresupuestoRowProps) => (
  <TableRow 
    className={`hover:bg-muted/50 cursor-pointer ${p.status === 'archivado' ? 'opacity-75' : ''}`}
    onClick={() => onNavigate(p.id)}
  >
    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
      {generatePresupuestoId(p)}
    </TableCell>
    <TableCell className="font-medium hover:text-primary transition-colors">
      {p.nombre}
    </TableCell>
    <TableCell>
      <Badge className={STATUS_COLORS[p.status]}>
        {STATUS_LABELS[p.status]}
      </Badge>
    </TableCell>
    <TableCell>{p.codigo_correlativo}</TableCell>
    <TableCell>{p.version}</TableCell>
    <TableCell>{p.poblacion}</TableCell>
    <TableCell>{p.provincia || '-'}</TableCell>
    <TableCell>{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: es })}</TableCell>
    <TableCell>
      <div className="flex gap-1">
        {isAdmin && (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              title="Recalcular"
              onClick={(e) => onRecalculate(e, p.id)}
              disabled={recalculatingId === p.id}
            >
              <RefreshCw className={`h-4 w-4 ${recalculatingId === p.id ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              title="Editar"
              onClick={(e) => { e.stopPropagation(); onEdit(p); }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              title="Eliminar"
              onClick={(e) => { e.stopPropagation(); onDelete(p); }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={(e) => { e.stopPropagation(); onNavigate(p.id); }}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </TableCell>
  </TableRow>
);

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
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [showActive, setShowActive] = useState(false);
  const [showEnEjecucion, setShowEnEjecucion] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showModelo, setShowModelo] = useState(true);
  const [creatingModel, setCreatingModel] = useState(false);
  const [modelSourceDialog, setModelSourceDialog] = useState(false);
  const [modelSourceId, setModelSourceId] = useState('');

  const isAdmin = roles.includes('administrador');

  // Handle manual recalculation for a budget
  const handleRecalculate = async (e: React.MouseEvent, budgetId: string) => {
    e.stopPropagation();
    setRecalculatingId(budgetId);
    try {
      const result = await recalculateAllBudgetResources(budgetId);
      if (result.errors > 0) {
        toast.warning(`Recalculado con ${result.errors} error(es)`);
      } else {
        toast.success('Presupuesto recalculado correctamente');
      }
      // Emit event so any open dashboard tabs can refresh
      window.dispatchEvent(new CustomEvent('budget-recalculated'));
    } catch (err) {
      console.error('Error recalculating:', err);
      toast.error('Error al recalcular');
    } finally {
      setRecalculatingId(null);
    }
  };

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
        setPresupuestos((data || []).map(p => ({
          ...p,
          status: (p.status as PresupuestoStatus) || (p.archived ? 'archivado' : 'activo')
        })));
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
      direccion: (p as any).direccion || '',
      coordenadas_lat: p.coordenadas_lat?.toString() || '',
      coordenadas_lng: p.coordenadas_lng?.toString() || '',
      google_maps_url: (p as any).google_maps_url || '',
      status: p.status || 'activo',
      start_date: (p as any).start_date || '',
      end_date: (p as any).end_date || ''
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
        direccion: form.direccion.trim() || null,
        coordenadas_lat: form.coordenadas_lat ? parseFloat(form.coordenadas_lat) : null,
        coordenadas_lng: form.coordenadas_lng ? parseFloat(form.coordenadas_lng) : null,
        google_maps_url: form.google_maps_url.trim() || null,
        status: form.status,
        archived: form.status === 'archivado',
        start_date: form.start_date || null,
        end_date: form.end_date || null
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

  // Handle status change
  const handleStatusChange = async (e: React.MouseEvent, p: Presupuesto, newStatus: PresupuestoStatus) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ 
          status: newStatus,
          archived: newStatus === 'archivado'
        })
        .eq('id', p.id);

      if (error) throw error;
      toast.success(`Estado cambiado a: ${STATUS_LABELS[newStatus]}`);
      fetchPresupuestos();
    } catch (err: any) {
      console.error('Error changing status:', err);
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  // Filter presupuestos - separate active from archived
  const filteredPresupuestos = presupuestos.filter(p => {
    const presupuestoId = generatePresupuestoId(p);
    return (
      searchMatch(p.nombre, searchTerm) ||
      searchMatch(p.poblacion, searchTerm) ||
      searchMatch(p.provincia, searchTerm) ||
      p.codigo_correlativo?.toString().includes(searchTerm) ||
      searchMatch(p.version, searchTerm) ||
      searchMatch(presupuestoId, searchTerm)
    );
  });

  const activePresupuestos = filteredPresupuestos.filter(p => p.status === 'activo');
  const enEjecucionPresupuestos = filteredPresupuestos.filter(p => p.status === 'en_ejecucion');
  const archivedPresupuestos = filteredPresupuestos.filter(p => p.status === 'archivado');
  const modeloPresupuestos = filteredPresupuestos.filter(p => p.status === 'modelo' || (p as any).is_model);

  const handleCreateModel = async () => {
    if (!modelSourceId) {
      toast.error('Selecciona un presupuesto origen');
      return;
    }
    setCreatingModel(true);
    try {
      const result = await createModelBudget(modelSourceId);
      if (result.success) {
        toast.success('Presupuesto Modelo creado correctamente');
        setModelSourceDialog(false);
        setModelSourceId('');
        fetchPresupuestos();
      } else {
        toast.error(result.error || 'Error al crear modelo');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setCreatingModel(false);
    }
  };

  const hasModel = modeloPresupuestos.length > 0;
  const enEjecucionForModel = presupuestos.filter(p => p.status === 'en_ejecucion');

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
          <div className="flex items-center gap-2">
            {isAdmin && <BackupButton module="budgets" variant="outline" />}
            {isAdmin && !hasModel && (
              <Button variant="outline" className="gap-2 border-violet-300 text-violet-600 hover:bg-violet-50" onClick={() => setModelSourceDialog(true)}>
                <Crown className="h-4 w-4" />
                Crear Modelo
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setCloneDialogOpen(true)}>
                <Copy className="h-4 w-4 mr-2" />
                Clonar Existente
              </Button>
            )}
            {isAdmin && (
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Presupuesto
              </Button>
            )}
          </div>
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
          {activePresupuestos.length} activo(s), {enEjecucionPresupuestos.length} en ejecución{archivedPresupuestos.length > 0 && `, ${archivedPresupuestos.length} archivado(s)`}
        </p>

        {/* Active Presupuestos Section */}
        {activePresupuestos.length > 0 && (
          <Collapsible open={showActive} onOpenChange={setShowActive} className="mb-6">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 mb-4 text-foreground hover:text-primary">
                {showActive ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">
                  Activos ({activePresupuestos.length})
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* Cards View - Active */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activePresupuestos.map((p) => (
                    <PresupuestoCard 
                      key={p.id} 
                      p={p} 
                      isAdmin={isAdmin}
                      recalculatingId={recalculatingId}
                      onRecalculate={handleRecalculate}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onStatusChange={handleStatusChange}
                      onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                      generatePresupuestoId={generatePresupuestoId}
                    />
                  ))}
                </div>
              )}

              {/* List View - Active */}
              {viewMode === 'list' && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PresupuestoID</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Versión</TableHead>
                        <TableHead>Población</TableHead>
                        <TableHead>Provincia</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="w-40">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activePresupuestos.map((p) => (
                        <PresupuestoRow
                          key={p.id}
                          p={p}
                          isAdmin={isAdmin}
                          recalculatingId={recalculatingId}
                          onRecalculate={handleRecalculate}
                          onEdit={handleEdit}
                          onDelete={handleDeleteClick}
                          onStatusChange={handleStatusChange}
                          onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                          generatePresupuestoId={generatePresupuestoId}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* En Ejecución Presupuestos Section */}
        {enEjecucionPresupuestos.length > 0 && (
          <Collapsible open={showEnEjecucion} onOpenChange={setShowEnEjecucion} className="mb-6">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 mb-4 text-amber-600 hover:text-amber-700">
                {showEnEjecucion ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Play className="h-4 w-4" />
                <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20">
                  En Ejecución ({enEjecucionPresupuestos.length})
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* Cards View - En Ejecución */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enEjecucionPresupuestos.map((p) => (
                    <PresupuestoCard 
                      key={p.id} 
                      p={p} 
                      isAdmin={isAdmin}
                      recalculatingId={recalculatingId}
                      onRecalculate={handleRecalculate}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onStatusChange={handleStatusChange}
                      onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                      generatePresupuestoId={generatePresupuestoId}
                    />
                  ))}
                </div>
              )}

              {/* List View - En Ejecución */}
              {viewMode === 'list' && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PresupuestoID</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Versión</TableHead>
                        <TableHead>Población</TableHead>
                        <TableHead>Provincia</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="w-40">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enEjecucionPresupuestos.map((p) => (
                        <PresupuestoRow
                          key={p.id}
                          p={p}
                          isAdmin={isAdmin}
                          recalculatingId={recalculatingId}
                          onRecalculate={handleRecalculate}
                          onEdit={handleEdit}
                          onDelete={handleDeleteClick}
                          onStatusChange={handleStatusChange}
                          onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                          generatePresupuestoId={generatePresupuestoId}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Archived Presupuestos Section */}
        {archivedPresupuestos.length > 0 && (
          <Collapsible open={showArchived} onOpenChange={setShowArchived} className="mt-6">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 mb-4 text-muted-foreground hover:text-foreground">
                {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Archive className="h-4 w-4" />
                <span>Archivados ({archivedPresupuestos.length})</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* Cards View - Archived */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                  {archivedPresupuestos.map((p) => (
                    <PresupuestoCard 
                      key={p.id} 
                      p={p} 
                      isAdmin={isAdmin}
                      recalculatingId={recalculatingId}
                      onRecalculate={handleRecalculate}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onStatusChange={handleStatusChange}
                      onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                      generatePresupuestoId={generatePresupuestoId}
                    />
                  ))}
                </div>
              )}

              {/* List View - Archived */}
              {viewMode === 'list' && (
                <div className="border rounded-lg overflow-hidden opacity-75">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PresupuestoID</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Versión</TableHead>
                        <TableHead>Población</TableHead>
                        <TableHead>Provincia</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="w-40">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {archivedPresupuestos.map((p) => (
                        <PresupuestoRow
                          key={p.id}
                          p={p}
                          isAdmin={isAdmin}
                          recalculatingId={recalculatingId}
                          onRecalculate={handleRecalculate}
                          onEdit={handleEdit}
                          onDelete={handleDeleteClick}
                          onStatusChange={handleStatusChange}
                          onNavigate={(id) => navigate(`/presupuestos/${id}`)}
                          generatePresupuestoId={generatePresupuestoId}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty state */}
        {activePresupuestos.length === 0 && archivedPresupuestos.length === 0 && (
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
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingPresupuesto ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </DialogTitle>
            <DialogDescription>
              {editingPresupuesto 
                ? 'Modifica los datos del presupuesto'
                : 'Introduce los datos del nuevo presupuesto'}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-1">
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

            {/* Dirección */}
            <div className="space-y-2">
              <Label htmlFor="direccion">Dirección de obra</Label>
              <Input
                id="direccion"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Ej: Calle Mayor 123, 28001"
              />
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

            {/* Google Maps URL */}
            <div className="space-y-2">
              <Label htmlFor="google_maps_url">URL Google Maps</Label>
              <Input
                id="google_maps_url"
                value={form.google_maps_url}
                onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })}
                placeholder="https://www.google.com/maps?q=..."
              />
              <p className="text-xs text-muted-foreground">
                URL de ubicación desde Google Maps o sección de Urbanismo
              </p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Fecha Inicio</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Fecha Fin</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  min={form.start_date || undefined}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Duración (días)</Label>
                <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 text-sm">
                  {calculateDurationDays(form.start_date, form.end_date) ?? '-'}
                </div>
              </div>
            </div>

            {/* Preview of PresupuestoID */}
            <div className="p-3 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground">PresupuestoID (calculado)</Label>
              <p className="text-sm font-medium mt-1">{generatePresupuestoId(form)}</p>
            </div>

            {/* Status selector - only show when editing */}
            {editingPresupuesto && (
              <div className="space-y-2">
                <Label htmlFor="status">Estado del presupuesto</Label>
                <Select
                  value={form.status}
                  onValueChange={(value: PresupuestoStatus) => setForm({ ...form, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="en_ejecucion">En Ejecución</SelectItem>
                    <SelectItem value="archivado">Archivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
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

      {/* Clone Budget Dialog */}
      <CloneBudgetDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        onCloneSuccess={(newBudgetId) => {
          navigate(`/presupuestos/${newBudgetId}`);
        }}
      />
    </div>
  );
}
