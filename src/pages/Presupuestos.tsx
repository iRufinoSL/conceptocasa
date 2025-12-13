import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Calculator, FolderOpen, Building2, Search } from 'lucide-react';

export default function Presupuestos() {
  const navigate = useNavigate();
  const { user, loading, userPresupuestos, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

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
    if (!searchTerm.trim()) return userPresupuestos;
    
    const term = searchTerm.toLowerCase();
    return userPresupuestos.filter(up => 
      up.presupuesto?.nombre?.toLowerCase().includes(term) ||
      up.presupuesto?.poblacion?.toLowerCase().includes(term) ||
      up.presupuesto?.codigo_correlativo?.toString().includes(term) ||
      up.presupuesto?.version?.toLowerCase().includes(term) ||
      up.presupuesto?.project?.name?.toLowerCase().includes(term)
    );
  }, [userPresupuestos, searchTerm]);

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
          <p className="text-muted-foreground">
            {isAdmin() 
              ? 'Gestiona todos los presupuestos del sistema'
              : 'Presupuestos a los que tienes acceso'}
          </p>
        </div>

        {/* Search */}
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
            <Calculator className="h-4 w-4" />
            <span>{filteredPresupuestos.length} presupuestos</span>
          </div>
        </div>

        {filteredPresupuestos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPresupuestos.map((up) => (
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
                  <p className="text-sm text-muted-foreground">
                    Código: {up.presupuesto?.codigo_correlativo}
                  </p>
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
