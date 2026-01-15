import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  MapPin, 
  Building2, 
  Ruler, 
  Search, 
  Loader2, 
  RefreshCw,
  TreePine,
  Mountain,
  Home,
  FileText,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface UrbanProfile {
  id: string;
  budget_id: string;
  cadastral_reference: string;
  municipality: string | null;
  province: string | null;
  autonomous_community: string | null;
  locality: string | null;
  address: string | null;
  surface_area: number | null;
  land_use: string | null;
  land_class: string | null;
  cadastral_value: number | null;
  construction_year: number | null;
  urban_classification: string | null;
  urban_qualification: string | null;
  buildability_index: number | null;
  max_height: number | null;
  max_floors: number | null;
  min_plot_area: number | null;
  front_setback: number | null;
  side_setback: number | null;
  rear_setback: number | null;
  max_occupation_percent: number | null;
  climatic_zone: string | null;
  wind_zone: string | null;
  seismic_zone: string | null;
  snow_zone: string | null;
  analysis_status: string | null;
  analysis_notes: string | null;
  last_analyzed_at: string | null;
  created_at: string;
}

interface CatastroData {
  cadastralReference: string;
  province: string;
  municipality: string;
  locality?: string;
  address?: string;
  surfaceArea?: number;
  landUse?: string;
  landClass?: string;
  constructionYear?: number;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface UrbanProfileCardProps {
  budgetId: string;
  cadastralReference?: string;
  isAdmin: boolean;
}

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pendiente', color: 'bg-muted text-muted-foreground', icon: AlertCircle },
  catastro_loaded: { label: 'Catastro cargado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Search },
  pgou_loaded: { label: 'PGOU analizado', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: FileText },
  cte_loaded: { label: 'CTE analizado', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: Building2 },
  complete: { label: 'Completo', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', icon: CheckCircle2 },
};

export function UrbanProfileCard({ budgetId, cadastralReference: initialRef, isAdmin }: UrbanProfileCardProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<UrbanProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchRef, setSearchRef] = useState(initialRef || '');
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('urban_profiles')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      if (data?.cadastral_reference) {
        setSearchRef(data.cadastral_reference);
      }
    } catch (error) {
      console.error('Error fetching urban profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [budgetId]);

  useEffect(() => {
    if (initialRef && !searchRef) {
      setSearchRef(initialRef);
    }
  }, [initialRef]);

  const handleCatastroSearch = async () => {
    if (!searchRef.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Introduce una referencia catastral válida',
      });
      return;
    }

    setIsSearching(true);

    try {
      const { data, error } = await supabase.functions.invoke('catastro-lookup', {
        body: {
          cadastralReference: searchRef.trim(),
          budgetId,
          saveToProfile: true,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const catastroData = data.data as CatastroData;
        toast({
          title: 'Datos del Catastro obtenidos',
          description: `Parcela en ${catastroData.municipality}, ${catastroData.province}`,
        });
        fetchProfile();
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('Error querying catastro:', error);
      toast({
        variant: 'destructive',
        title: 'Error al consultar el Catastro',
        description: error instanceof Error ? error.message : 'No se pudo obtener la información',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getStatusInfo = () => {
    const status = profile?.analysis_status || 'pending';
    return statusLabels[status] || statusLabels.pending;
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num == null) return '-';
    return num.toLocaleString('es-ES');
  };

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="border-primary/20">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Perfil Urbanístico</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {profile && (
                <Badge className={statusInfo.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? 'Contraer' : 'Expandir'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CardDescription>
            Consulta la normativa urbanística a partir de la referencia catastral
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Search Section */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="cadastral-ref" className="sr-only">Referencia Catastral</Label>
                <Input
                  id="cadastral-ref"
                  placeholder="Ej: 52025A06004590000RS"
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </div>
              <Button 
                onClick={handleCatastroSearch} 
                disabled={isSearching || !searchRef.trim()}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : profile ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">
                  {profile ? 'Actualizar' : 'Consultar Catastro'}
                </span>
              </Button>
            </div>

            {/* Profile Data */}
            {profile && (
              <div className="space-y-4">
                <Separator />
                
                {/* Location Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      Ubicación
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Municipio:</span>
                        <p className="font-medium">{profile.municipality || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Provincia:</span>
                        <p className="font-medium">{profile.province || '-'}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Localidad:</span>
                        <p className="font-medium">{profile.locality || '-'}</p>
                      </div>
                      {profile.address && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Dirección:</span>
                          <p className="font-medium">{profile.address}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Land Section */}
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <TreePine className="h-4 w-4 text-primary" />
                      Terreno
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Superficie:</span>
                        <p className="font-medium">
                          {profile.surface_area ? `${formatNumber(profile.surface_area)} m²` : '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Clase:</span>
                        <p className="font-medium">{profile.land_class || '-'}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Uso:</span>
                        <p className="font-medium">{profile.land_use || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Urban Parameters (if available) */}
                {(profile.urban_classification || profile.buildability_index || profile.max_height) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2 text-sm">
                        <Ruler className="h-4 w-4 text-primary" />
                        Parámetros Urbanísticos
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {profile.urban_classification && (
                          <div>
                            <span className="text-muted-foreground">Clasificación:</span>
                            <p className="font-medium">{profile.urban_classification}</p>
                          </div>
                        )}
                        {profile.buildability_index && (
                          <div>
                            <span className="text-muted-foreground">Edificabilidad:</span>
                            <p className="font-medium">{profile.buildability_index} m²/m²</p>
                          </div>
                        )}
                        {profile.max_height && (
                          <div>
                            <span className="text-muted-foreground">Altura máx:</span>
                            <p className="font-medium">{profile.max_height} m</p>
                          </div>
                        )}
                        {profile.max_floors && (
                          <div>
                            <span className="text-muted-foreground">Plantas máx:</span>
                            <p className="font-medium">{profile.max_floors}</p>
                          </div>
                        )}
                        {profile.max_occupation_percent && (
                          <div>
                            <span className="text-muted-foreground">Ocupación máx:</span>
                            <p className="font-medium">{profile.max_occupation_percent}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* CTE Zones (if available) */}
                {(profile.climatic_zone || profile.wind_zone || profile.seismic_zone) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2 text-sm">
                        <Mountain className="h-4 w-4 text-primary" />
                        Zonas CTE
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {profile.climatic_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona climática:</span>
                            <p className="font-medium">{profile.climatic_zone}</p>
                          </div>
                        )}
                        {profile.wind_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona eólica:</span>
                            <p className="font-medium">{profile.wind_zone}</p>
                          </div>
                        )}
                        {profile.seismic_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona sísmica:</span>
                            <p className="font-medium">{profile.seismic_zone}</p>
                          </div>
                        )}
                        {profile.snow_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona nieve:</span>
                            <p className="font-medium">{profile.snow_zone}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Notes */}
                {profile.analysis_notes && (
                  <>
                    <Separator />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Notas del análisis:</span>
                      <p className="mt-1">{profile.analysis_notes}</p>
                    </div>
                  </>
                )}

                {/* Last Updated */}
                {profile.last_analyzed_at && (
                  <div className="text-xs text-muted-foreground pt-2">
                    Última consulta: {new Date(profile.last_analyzed_at).toLocaleString('es-ES')}
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!profile && (
              <div className="text-center py-6 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Introduce una referencia catastral y pulsa "Consultar Catastro"</p>
                <p className="text-xs mt-1">
                  Ejemplo: 52025A06004590000RS (Manzaneda, Gozón, Asturias)
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
