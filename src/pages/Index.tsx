import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { ExternalResource } from '@/types/resource';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ResourceFilters } from '@/components/ResourceFilters';
import { ResourceCard } from '@/components/ResourceCard';
import { ResourceForm } from '@/components/ResourceForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Plus, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
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
  } = useResources();

  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ExternalResource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<ExternalResource | null>(null);
  const { toast } = useToast();

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

  const handleDeleteConfirm = () => {
    if (resourceToDelete) {
      deleteResource(resourceToDelete.id);
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

  const handleUpdate = (id: string, data: Partial<ExternalResource>) => {
    updateResource(id, data);
    toast({
      title: 'Recurso actualizado',
      description: 'Los cambios han sido guardados correctamente.',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Recursos Externos</h2>
            <p className="text-muted-foreground mt-1">
              Gestiona los recursos externos para tus proyectos de construcción
            </p>
          </div>
          <Button variant="accent" onClick={handleAddNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Recurso
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <StatsCards resources={allResources} />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <ResourceFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        </div>

        {/* Resources Grid */}
        {resources.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
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
        resource={editingResource}
        onSubmit={handleSubmit}
        onUpdate={handleUpdate}
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
};

export default Index;
