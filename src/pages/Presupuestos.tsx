import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Calculator, FolderOpen, Building2, Search, Calendar, LayoutGrid, List, Download, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Presupuestos() {
  const navigate = useNavigate();
  const { user, loading, userPresupuestos, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'date_asc' | 'date_desc'>(() => {
    const saved = localStorage.getItem('presupuestos-sort-by');
    return (saved === 'name_asc' || saved === 'name_desc' || saved === 'date_asc' || saved === 'date_desc') 
      ? saved : 'date_desc';
  });
  const [projectFilter, setProjectFilter] = useState<string>(() => {
    return localStorage.getItem('presupuestos-project-filter') || 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const saved = localStorage.getItem('presupuestos-view-mode');
    return (saved === 'cards' || saved === 'list') ? saved : 'cards';
  });

  // Persist preferences
  const handleViewModeChange = (mode: 'cards' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('presupuestos-view-mode', mode);
  };

  const handleSortChange = (sort: typeof sortBy) => {
    setSortBy(sort);
    localStorage.setItem('presupuestos-sort-by', sort);
  };

  const handleProjectFilterChange = (filter: string) => {
    setProjectFilter(filter);
    localStorage.setItem('presupuestos-project-filter', filter);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSortBy('date_desc');
    setProjectFilter('all');
    setCurrentPage(1);
    localStorage.removeItem('presupuestos-sort-by');
    localStorage.removeItem('presupuestos-project-filter');
  };

  const hasActiveFilters = searchTerm !== '' || sortBy !== 'date_desc' || projectFilter !== 'all';

  const itemsPerPage = 9;

  // Get unique projects for filter
  const uniqueProjects = useMemo(() => {
    const projects = new Map<string, string>();
    userPresupuestos.forEach(up => {
      if (up.presupuesto?.project) {
        projects.set(up.presupuesto.project.id, up.presupuesto.project.name);
      }
    });
    return Array.from(projects.entries()).map(([id, name]) => ({ id, name }));
  }, [userPresupuestos]);

  // Statistics
  const stats = useMemo(() => {
    const total = userPresupuestos.length;
    const withProject = userPresupuestos.filter(up => up.presupuesto?.project_id).length;
    const withoutProject = total - withProject;
    const byRole = {
      administrador: userPresupuestos.filter(up => up.role === 'administrador').length,
      colaborador: userPresupuestos.filter(up => up.role === 'colaborador').length,
      cliente: userPresupuestos.filter(up => up.role === 'cliente').length,
    };
    return { total, withProject, withoutProject, byRole };
  }, [userPresupuestos]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const filteredPresupuestos = useMemo(() => {
    let result = [...userPresupuestos];
    
    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(up => 
        up.presupuesto?.nombre?.toLowerCase().includes(term) ||
        up.presupuesto?.poblacion?.toLowerCase().includes(term) ||
        up.presupuesto?.codigo_correlativo?.toString().includes(term) ||
        up.presupuesto?.version?.toLowerCase().includes(term) ||
        up.presupuesto?.project?.name?.toLowerCase().includes(term)
      );
    }
    
    // Filter by project
    if (projectFilter !== 'all') {
      if (projectFilter === 'none') {
        result = result.filter(up => !up.presupuesto?.project_id);
      } else {
        result = result.filter(up => up.presupuesto?.project?.id === projectFilter);
      }
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return (a.presupuesto?.nombre || '').localeCompare(b.presupuesto?.nombre || '');
        case 'name_desc':
          return (b.presupuesto?.nombre || '').localeCompare(a.presupuesto?.nombre || '');
        case 'date_asc':
          return new Date(a.presupuesto?.created_at || 0).getTime() - new Date(b.presupuesto?.created_at || 0).getTime();
        case 'date_desc':
        default:
          return new Date(b.presupuesto?.created_at || 0).getTime() - new Date(a.presupuesto?.created_at || 0).getTime();
      }
    });
    
    return result;
  }, [userPresupuestos, searchTerm, sortBy, projectFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredPresupuestos.length / itemsPerPage);
  const paginatedPresupuestos = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPresupuestos.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPresupuestos, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, projectFilter, sortBy]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'Activo',
      completed: 'Completado',
      on_hold: 'En pausa',
      cancelled: 'Cancelado'
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: 'default',
      completed: 'secondary',
      on_hold: 'outline',
      cancelled: 'destructive'
    };
    return variants[status] || 'outline';
  };

  const exportToCSV = () => {
    const headers = ['Nombre', 'Código', 'Población', 'Versión', 'Proyecto', 'Estado Proyecto', 'Rol', 'Fecha Creación'];
    const rows = filteredPresupuestos.map(up => [
      up.presupuesto?.nombre || '',
      up.presupuesto?.codigo_correlativo?.toString() || '',
      up.presupuesto?.poblacion || '',
      up.presupuesto?.version || '',
      up.presupuesto?.project?.name || '',
      up.presupuesto?.project ? getStatusLabel(up.presupuesto.project.status) : '',
      up.role,
      up.presupuesto?.created_at 
        ? format(new Date(up.presupuesto.created_at), 'dd/MM/yyyy', { locale: es })
        : ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `presupuestos_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Presupuestos</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Mis Presupuestos</h2>
          <p className="text-muted-foreground mb-6">
            {isAdmin() 
              ? 'Gestiona todos los presupuestos del sistema'
              : 'Presupuestos a los que tienes acceso'}
          </p>
          
          {/* Statistics Cards */}
          <TooltipProvider>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="bg-primary/5 border-primary/20 cursor-help">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Calculator className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Número total de presupuestos a los que tienes acceso</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="bg-green-500/5 border-green-500/20 cursor-help">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10">
                          <Building2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{stats.withProject}</p>
                          <p className="text-xs text-muted-foreground">Con proyecto</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Presupuestos vinculados a un proyecto existente</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="bg-orange-500/5 border-orange-500/20 cursor-help">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/10">
                          <FolderOpen className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{stats.withoutProject}</p>
                          <p className="text-xs text-muted-foreground">Sin proyecto</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Presupuestos independientes sin proyecto asignado</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="bg-blue-500/5 border-blue-500/20 cursor-help">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Calendar className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{uniqueProjects.length}</p>
                          <p className="text-xs text-muted-foreground">Proyectos</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Número de proyectos únicos con presupuestos vinculados</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, población, código o proyecto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={projectFilter} onValueChange={handleProjectFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filtrar por proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              <SelectItem value="none">Sin proyecto</SelectItem>
              {uniqueProjects.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => handleSortChange(v as typeof sortBy)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Más recientes</SelectItem>
              <SelectItem value="date_asc">Más antiguos</SelectItem>
              <SelectItem value="name_asc">Nombre A-Z</SelectItem>
              <SelectItem value="name_desc">Nombre Z-A</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
            <Calculator className="h-4 w-4" />
            <span>{filteredPresupuestos.length} presupuestos</span>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-muted-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restablecer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={filteredPresupuestos.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('cards')}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {paginatedPresupuestos.length > 0 ? (
          <>
            {viewMode === 'cards' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedPresupuestos.map((up) => (
                  <Card 
                    key={up.presupuesto_id} 
                    className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all"
                    onClick={() => navigate(`/presupuestos/${up.presupuesto_id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Calculator className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full capitalize">
                          {up.role}
                        </span>
                      </div>
                      <CardTitle className="text-lg">
                        {up.presupuesto?.nombre || 'Sin nombre'}
                      </CardTitle>
                      <CardDescription>
                        {up.presupuesto?.poblacion} • Versión {up.presupuesto?.version}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Código: {up.presupuesto?.codigo_correlativo}</span>
                        {up.presupuesto?.created_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(up.presupuesto.created_at), 'd MMM yyyy', { locale: es })}
                          </span>
                        )}
                      </div>
                      {up.presupuesto?.project && (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/proyectos?id=${up.presupuesto?.project?.id}`);
                            }}
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <Building2 className="h-4 w-4" />
                            <span>{up.presupuesto.project.name}</span>
                          </button>
                          <Badge variant={getStatusVariant(up.presupuesto.project.status)}>
                            {getStatusLabel(up.presupuesto.project.status)}
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Población</TableHead>
                      <TableHead>Versión</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPresupuestos.map((up) => (
                      <TableRow 
                        key={up.presupuesto_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/presupuestos/${up.presupuesto_id}`)}
                      >
                        <TableCell className="font-medium">
                          {up.presupuesto?.nombre || 'Sin nombre'}
                        </TableCell>
                        <TableCell>{up.presupuesto?.codigo_correlativo}</TableCell>
                        <TableCell>{up.presupuesto?.poblacion}</TableCell>
                        <TableCell>{up.presupuesto?.version}</TableCell>
                        <TableCell>
                          {up.presupuesto?.project ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/proyectos?id=${up.presupuesto?.project?.id}`);
                              }}
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <Building2 className="h-4 w-4" />
                              <span>{up.presupuesto.project.name}</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full capitalize">
                            {up.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {up.presupuesto?.created_at 
                            ? format(new Date(up.presupuesto.created_at), 'd MMM yyyy', { locale: es })
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No tienes presupuestos asignados</h3>
            <p className="text-muted-foreground">
              Contacta con un administrador para obtener acceso a un presupuesto.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
