import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UrbanProfileCard } from './UrbanProfileCard';
import { PreliminaryUrbanReportsManager } from './PreliminaryUrbanReportsManager';
import { LandSearchCard } from './LandSearchCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Building2, Home } from 'lucide-react';

interface BudgetUrbanismTabProps {
  budgetId: string;
  isAdmin: boolean;
  cadastralReference?: string;
}

function HousingProfileCard({ budgetId }: { budgetId: string }) {
  const [profileContent, setProfileContent] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('budget_predesigns')
        .select('description')
        .eq('budget_id', budgetId)
        .eq('content_type', 'Perfil inicial')
        .maybeSingle();
      if (data?.description) {
        setProfileContent(data.description);
      }
    };
    fetchProfile();
  }, [budgetId]);

  if (!profileContent) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          Perfil básico de vivienda
        </CardTitle>
        <CardDescription>Datos del perfil recibido por email</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed">
          {profileContent}
        </pre>
      </CardContent>
    </Card>
  );
}

export function BudgetUrbanismTab({ budgetId, isAdmin, cadastralReference }: BudgetUrbanismTabProps) {
  const [hasLand, setHasLand] = useState<boolean | null>(
    cadastralReference ? true : null
  );

  // If not yet decided
  if (hasLand === null) {
    return (
      <div className="space-y-6">
        {/* Always show housing profile if available */}
        <HousingProfileCard budgetId={budgetId} />
        
        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              ¿Dispone de terreno para edificar?
            </CardTitle>
            <CardDescription>
              Seleccione la situación actual del proyecto para continuar con el proceso urbanístico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <Button
                variant="outline"
                className="h-auto py-6 flex flex-col items-center gap-3 border-2 hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => setHasLand(true)}
              >
                <Building2 className="h-10 w-10 text-primary" />
                <div className="text-center">
                  <p className="font-semibold text-base">Sí, tengo terreno</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Introduzca la referencia catastral para analizar la edificabilidad
                  </p>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-6 flex flex-col items-center gap-3 border-2 hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => setHasLand(false)}
              >
                <Search className="h-10 w-10 text-primary" />
                <div className="text-center">
                  <p className="font-semibold text-base">No, busco terreno</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Buscar terrenos en venta por municipio, área geográfica o provincia
                  </p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Always show housing profile if available */}
      <HousingProfileCard budgetId={budgetId} />

      {/* Toggle button to switch */}
      <div className="flex items-center gap-2">
        <Button
          variant={hasLand ? 'default' : 'outline'}
          size="sm"
          onClick={() => setHasLand(true)}
          className="gap-1"
        >
          <Building2 className="h-3.5 w-3.5" />
          Tengo terreno
        </Button>
        <Button
          variant={!hasLand ? 'default' : 'outline'}
          size="sm"
          onClick={() => setHasLand(false)}
          className="gap-1"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar terreno
        </Button>
      </div>

      {hasLand ? (
        <>
          <UrbanProfileCard 
            budgetId={budgetId} 
            cadastralReference={cadastralReference}
            isAdmin={isAdmin} 
          />
          <PreliminaryUrbanReportsManager 
            budgetId={budgetId}
            isAdmin={isAdmin}
          />
        </>
      ) : (
        <LandSearchCard />
      )}
    </div>
  );
}
