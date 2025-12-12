import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Calculator, FolderOpen } from 'lucide-react';

export default function Presupuestos() {
  const navigate = useNavigate();
  const { user, loading, userPresupuestos, isAdmin } = useAuth();

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

        {userPresupuestos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userPresupuestos.map((up) => (
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
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Código: {up.presupuesto?.codigo_correlativo}
                  </p>
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
