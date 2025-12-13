import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, 
  Search, 
  MapPin, 
  Calendar, 
  DollarSign,
  Building2,
  FolderOpen,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
  FileText,
  Calculator
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrencyNoDecimals } from '@/lib/format-utils';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ProjectContactsManager } from '@/components/projects/ProjectContactsManager';
import { ProjectDocumentsManager } from '@/components/projects/ProjectDocumentsManager';
import { ProjectBudgetsManager } from '@/components/projects/ProjectBudgetsManager';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { AppNavDropdown } from '@/components/AppNavDropdown';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  location: string | null;
  project_type: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
}

interface ProjectContact {
  contact_id: string;
  contact_role: string | null;
  contact: {
    name: string;
    surname: string | null;
  } | null;
}

export default function Proyectos() {
  const navigate = useNavigate();
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectContacts, setProjectContacts] = useState<Record<string, ProjectContact[]>>({});
  const [projectBudgetCounts, setProjectBudgetCounts] = useState<Record<string, number>>({});
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Contacts manager state
  const [contactsManagerOpen, setContactsManagerOpen] = useState(false);
  const [selectedProjectForContacts, setSelectedProjectForContacts] = useState<Project | null>(null);

  // Documents manager state
  const [documentsManagerOpen, setDocumentsManagerOpen] = useState(false);
  const [selectedProjectForDocs, setSelectedProjectForDocs] = useState<Project | null>(null);

  // Budgets manager state
  const [budgetsManagerOpen, setBudgetsManagerOpen] = useState(false);
  const [selectedProjectForBudgets, setSelectedProjectForBudgets] = useState<Project | null>(null);

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProjects(data);
      setFilteredProjects(data);
      
      // Fetch contacts for all projects
      const projectIds = data.map(p => p.id);
      if (projectIds.length > 0) {
        // Fetch contacts for all projects
        const { data: contactsData } = await supabase
          .from('project_contacts')
          .select('project_id, contact_id, contact_role')
          .in('project_id', projectIds);

        if (contactsData) {
          // Fetch contact details
          const contactIds = [...new Set(contactsData.map(pc => pc.contact_id))];
          const { data: contactDetails } = await supabase
            .from('crm_contacts')
            .select('id, name, surname')
            .in('id', contactIds);

          // Group by project
          const grouped: Record<string, ProjectContact[]> = {};
          contactsData.forEach(pc => {
            if (!grouped[pc.project_id]) grouped[pc.project_id] = [];
            grouped[pc.project_id].push({
              contact_id: pc.contact_id,
              contact_role: pc.contact_role,
              contact: contactDetails?.find(c => c.id === pc.contact_id) || null
            });
          });
          setProjectContacts(grouped);
        }

        // Fetch budget counts for all projects
        const { data: budgetsData } = await supabase
          .from('presupuestos')
          .select('project_id')
          .in('project_id', projectIds);

        if (budgetsData) {
          const counts: Record<string, number> = {};
          budgetsData.forEach(b => {
            if (b.project_id) {
              counts[b.project_id] = (counts[b.project_id] || 0) + 1;
            }
          });
          setProjectBudgetCounts(counts);
        }
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  useEffect(() => {
    let filtered = projects.filter(project => {
      const matchesSearch = 
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.project_type?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
    
    // Sort alphabetically by name
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    
    setFilteredProjects(filtered);
  }, [searchTerm, statusFilter, projects]);

  const handleAddNew = () => {
    setEditingProject(null);
    setFormOpen(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormOpen(true);
  };

  const handleManageContacts = (project: Project) => {
    setSelectedProjectForContacts(project);
    setContactsManagerOpen(true);
  };

  const handleManageDocuments = (project: Project) => {
    setSelectedProjectForDocs(project);
    setDocumentsManagerOpen(true);
  };

  const handleManageBudgets = (project: Project) => {
    setSelectedProjectForBudgets(project);
    setBudgetsManagerOpen(true);
  };

  const handleDeleteClick = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectToDelete.id);

      if (error) throw error;

      toast({ title: 'Proyecto eliminado correctamente' });
      fetchProjects();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'completed': return 'secondary';
      case 'on_hold': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Activo';
      case 'completed': return 'Completado';
      case 'on_hold': return 'En pausa';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getInitials = (name: string, surname?: string | null) => {
    const first = name.charAt(0).toUpperCase();
    const second = surname ? surname.charAt(0).toUpperCase() : '';
    return first + second;
  };

  const canEdit = isAdmin();

  if (loading || rolesLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <AppNavDropdown />
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Proyectos</h1>
              <p className="text-sm text-muted-foreground">
                Gestión de proyectos de construcción
              </p>
            </div>
          </div>
          {canEdit && (
            <Button onClick={handleAddNew} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo Proyecto</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search, Filter and Stats */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar proyectos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="completed">Completado</SelectItem>
              <SelectItem value="on_hold">En pausa</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
            <Building2 className="h-4 w-4" />
            <span>{filteredProjects.length} proyectos</span>
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <Card className="py-16">
            <CardContent className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No se encontraron proyectos' : 'No hay proyectos registrados'}
              </p>
              {canEdit && !searchTerm && (
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear primer proyecto
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => {
              const contacts = projectContacts[project.id] || [];
              const budgetCount = projectBudgetCounts[project.id] || 0;
              return (
                <Card
                  key={project.id}
                  className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg line-clamp-1 flex-1">{project.name}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Badge variant={getStatusVariant(project.status)}>
                          {getStatusLabel(project.status)}
                        </Badge>
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleManageContacts(project)}>
                                <Users className="h-4 w-4 mr-2" />
                                Gestionar contactos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManageDocuments(project)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Documentos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManageBudgets(project)}>
                                <Calculator className="h-4 w-4 mr-2" />
                                Presupuestos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(project)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteClick(project)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {project.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{project.location}</span>
                      </div>
                    )}
                    {project.project_type && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span>{project.project_type}</span>
                      </div>
                    )}
                    {project.budget && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span>{formatCurrencyNoDecimals(project.budget)}</span>
                      </div>
                    )}
                    {project.start_date && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(new Date(project.start_date), 'dd MMM yyyy', { locale: es })}
                          {project.end_date && ` - ${format(new Date(project.end_date), 'dd MMM yyyy', { locale: es })}`}
                        </span>
                      </div>
                    )}
                    
                    {/* Project Stats: Contacts & Budgets */}
                    {(contacts.length > 0 || budgetCount > 0) && (
                      <div className="pt-2 border-t flex items-center justify-between gap-4">
                        {/* Contacts */}
                        {contacts.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {contacts.slice(0, 3).map((pc, idx) => (
                                <Avatar key={idx} className="h-6 w-6 border-2 border-background">
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {pc.contact ? getInitials(pc.contact.name, pc.contact.surname) : '?'}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {contacts.length > 3 && (
                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                                  +{contacts.length - 3}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {contacts.length}
                            </span>
                          </div>
                        )}

                        {/* Budgets */}
                        {budgetCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="p-1.5 rounded bg-primary/10">
                              <Calculator className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {budgetCount} presupuesto{budgetCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Form */}
      <ProjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editingProject}
        onSuccess={fetchProjects}
      />

      {/* Contacts Manager */}
      {selectedProjectForContacts && (
        <ProjectContactsManager
          open={contactsManagerOpen}
          onOpenChange={(open) => {
            setContactsManagerOpen(open);
            if (!open) {
              fetchProjects(); // Refresh to show updated contacts
            }
          }}
          projectId={selectedProjectForContacts.id}
          projectName={selectedProjectForContacts.name}
        />
      )}

      {/* Documents Manager */}
      {selectedProjectForDocs && (
        <ProjectDocumentsManager
          open={documentsManagerOpen}
          onOpenChange={setDocumentsManagerOpen}
          projectId={selectedProjectForDocs.id}
          projectName={selectedProjectForDocs.name}
          canEdit={canEdit}
        />
      )}

      {/* Budgets Manager */}
      {selectedProjectForBudgets && (
        <ProjectBudgetsManager
          open={budgetsManagerOpen}
          onOpenChange={setBudgetsManagerOpen}
          projectId={selectedProjectForBudgets.id}
          projectName={selectedProjectForBudgets.name}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar proyecto"
        description={`¿Estás seguro de que quieres eliminar el proyecto "${projectToDelete?.name}"? Esta acción no se puede deshacer.`}
        isDeleting={isDeleting}
      />
    </div>
  );
}
