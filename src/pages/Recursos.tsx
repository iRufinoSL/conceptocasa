import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useResources } from '@/hooks/useResources';
import { ExternalResource } from '@/types/resource';
import { StatsCards } from '@/components/StatsCards';
import { ResourceFilters } from '@/components/ResourceFilters';
import { ResourceCard } from '@/components/ResourceCard';
import { ResourceList } from '@/components/ResourceList';
import { ResourceForm } from '@/components/ResourceForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Plus, FolderOpen, LayoutGrid, List, ArrowLeft, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { BackupButton } from '@/components/BackupButton';

type ViewMode = 'cards' | 'list';

export default function Recursos() {
  const navigate = useNavigate();
  const { user, loading: authLoading, rolesLoading, isAdmin } = useAuth();
  const {
    resources,
    allResources,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    addResource,
    updateResource,
    deleteResource,
    duplicateResource,
    getEffectiveCost,
    loading,
    uploadFile,
    deleteFile,
    getFileUrl,
  } = useResources();

  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ExternalResource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<ExternalResource | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
    // Wait for roles to load before checking admin status
    if (!authLoading && !rolesLoading && user && !isAdmin()) {
      navigate('/dashboard');
      toast({
        title: 'Acceso denegado',
        description: 'No tienes permisos para acceder a esta sección.',
        variant: 'destructive',
      });
    }
  }, [user, authLoading, rolesLoading, isAdmin, navigate, toast]);

  const handleAddNew = () => {
    setEditingResource(null);
    setFormOpen(true);
  };

  const handleEdit = (resource: ExternalResource) => {
    setEditingResource(resource);
    setFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    const resource = allResources.find((r) => r.id === id);
    if (resource) {
      setResourceToDelete(resource);
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (resourceToDelete) {
      await deleteResource(resourceToDelete.id);
      toast({
        title: 'Recurso eliminado',
        description: `"${resourceToDelete.name}" ha sido eliminado correctamente.`,
      });
      setResourceToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleSubmit = (data: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>) => {
    addResource(data);
    toast({
      title: 'Recurso creado',
      description: `"${data.name}" ha sido añadido correctamente.`,
    });
  };

  const handleDuplicate = async (id: string) => {
    const duplicated = await duplicateResource(id);
    if (duplicated) {
      toast({
        title: 'Recurso duplicado',
        description: `Recurso duplicado correctamente.`,
      });
    }
  };

  const handleUpdate = (id: string, data: Partial<ExternalResource>) => {
    updateResource(id, data);
    toast({
      title: 'Recurso actualizado',
      description: 'Los cambios han sido guardados correctamente.',
    });
  };

  if (authLoading || rolesLoading) {
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
              <Package className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Gestión de Recursos</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Recursos externos</h2>
            <p className="text-muted-foreground mt-1">
              Gestiona los recursos externos para tus proyectos de construcción
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BackupButton module="resources" variant="outline" />
            <Button variant="accent" onClick={handleAddNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Recurso
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <StatsCards resources={allResources} />
        </div>

        {/* Filters and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <ResourceFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filterType={filterType}
              onFilterChange={setFilterType}
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Tarjetas</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Lista</span>
            </Button>
          </div>
        </div>

        {/* Resources Display */}
        {resources.length > 0 ? (
          viewMode === 'cards' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {resources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onEdit={handleEdit}
                  onDelete={handleDeleteClick}
                  effectiveCost={getEffectiveCost(resource)}
                  allResources={allResources}
                />
              ))}
            </div>
          ) : (
            <ResourceList
              resources={resources}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              onDuplicate={handleDuplicate}
              getEffectiveCost={getEffectiveCost}
            />
          )
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No hay recursos</h3>
            <p className="text-muted-foreground mb-6">
              {searchTerm || filterType !== 'all'
                ? 'No se encontraron recursos con los filtros aplicados.'
                : 'Comienza añadiendo tu primer recurso externo.'}
            </p>
            {!searchTerm && filterType === 'all' && (
              <Button variant="accent" onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Añadir primer recurso
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Form Dialog */}
      <ResourceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        resource={editingResource ? allResources.find(r => r.id === editingResource.id) || editingResource : null}
        onSubmit={handleSubmit}
        onUpdate={handleUpdate}
        allResources={allResources}
        onUploadFile={uploadFile}
        onDeleteFile={deleteFile}
        getFileUrl={getFileUrl}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        resourceName={resourceToDelete?.name}
      />
    </div>
  );
}
