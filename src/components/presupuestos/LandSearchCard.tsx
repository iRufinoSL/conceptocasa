import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Search,
  Loader2,
  MapPin,
  Euro,
  Ruler,
  ExternalLink,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  TreePine,
  Filter
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { openSafeUrl } from '@/lib/url-utils';

interface LandListing {
  title: string;
  location: string;
  municipality: string;
  province: string;
  price?: number;
  priceText?: string;
  surfaceArea?: number;
  surfaceText?: string;
  cadastralReference?: string;
  url?: string;
  source?: string;
  description?: string;
  landClass?: string;
  canBuild?: boolean | null;
  isVerifying?: boolean;
}

interface LandSearchCardProps {
  onSelectListing?: (listing: LandListing) => void;
}

export function LandSearchCard({ onSelectListing }: LandSearchCardProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Search fields
  const [municipality, setMunicipality] = useState('');
  const [province, setProvince] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [minSurface, setMinSurface] = useState<number | undefined>(undefined);
  const [maxSurface, setMaxSurface] = useState<number | undefined>(undefined);
  
  // Results
  const [listings, setListings] = useState<LandListing[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Filter state
  const [filterBuildable, setFilterBuildable] = useState<'all' | 'buildable' | 'unknown'>('all');

  const handleSearch = async () => {
    if (!municipality.trim() && !province.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Introduce al menos un municipio o provincia',
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke('search-land-listings', {
        body: {
          municipality: municipality.trim(),
          province: province.trim(),
          maxPrice,
          minSurface,
          maxSurface,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const result = data.data;
        setListings(result.listings || []);
        setTotalFound(result.totalFound || 0);
        setSources(result.sources || []);
        
        toast({
          title: 'Búsqueda completada',
          description: `Se encontraron ${result.listings?.length || 0} terrenos en venta`,
        });
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('Error searching land listings:', error);
      toast({
        variant: 'destructive',
        title: 'Error en la búsqueda',
        description: error instanceof Error ? error.message : 'No se pudieron obtener los resultados',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const verifyLandClass = async (index: number) => {
    const listing = listings[index];
    if (!listing.cadastralReference) {
      toast({
        variant: 'destructive',
        title: 'Sin referencia catastral',
        description: 'Este terreno no tiene referencia catastral. Intenta obtenerla del anuncio original.',
      });
      return;
    }

    // Mark as verifying
    setListings(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], isVerifying: true };
      return updated;
    });

    try {
      const { data, error } = await supabase.functions.invoke('catastro-lookup', {
        body: {
          cadastralReference: listing.cadastralReference,
          saveToProfile: false,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const catastroData = data.data;
        const landClass = catastroData.landClass || 'Desconocido';
        const canBuild = landClass === 'Urbano' || landClass === 'Urbanizable';

        setListings(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            landClass,
            canBuild,
            isVerifying: false,
          };
          return updated;
        });

        toast({
          title: 'Verificación completada',
          description: `Terreno clasificado como: ${landClass}`,
        });
      } else {
        throw new Error(data?.error || 'Error al verificar');
      }
    } catch (error) {
      console.error('Error verifying land class:', error);
      setListings(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], isVerifying: false, canBuild: null };
        return updated;
      });
      toast({
        variant: 'destructive',
        title: 'Error al verificar',
        description: error instanceof Error ? error.message : 'No se pudo consultar el Catastro',
      });
    }
  };

  const verifyAllWithReference = async () => {
    const listingsWithRef = listings.filter(l => l.cadastralReference && l.canBuild === undefined);
    
    if (listingsWithRef.length === 0) {
      toast({
        title: 'Sin terrenos pendientes',
        description: 'No hay terrenos con referencia catastral pendientes de verificar',
      });
      return;
    }

    toast({
      title: 'Verificando terrenos...',
      description: `Consultando ${listingsWithRef.length} referencias catastrales`,
    });

    for (let i = 0; i < listings.length; i++) {
      if (listings[i].cadastralReference && listings[i].canBuild === undefined) {
        await verifyLandClass(i);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
  };

  const formatSurface = (surface?: number) => {
    if (!surface) return '-';
    return `${surface.toLocaleString('es-ES')} m²`;
  };

  const filteredListings = listings.filter(listing => {
    if (filterBuildable === 'all') return true;
    if (filterBuildable === 'buildable') return listing.canBuild === true;
    if (filterBuildable === 'unknown') return listing.canBuild === undefined || listing.canBuild === null;
    return true;
  });

  const buildableCount = listings.filter(l => l.canBuild === true).length;
  const notBuildableCount = listings.filter(l => l.canBuild === false).length;
  const unknownCount = listings.filter(l => l.canBuild === undefined || l.canBuild === null).length;

  return (
    <Card className="border-primary/20">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Buscador de Terrenos en Venta</CardTitle>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isExpanded ? 'Contraer' : 'Expandir'}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CardDescription>
            Busca terrenos y parcelas en venta en portales inmobiliarios y verifica su edificabilidad
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Search Section */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="municipality">Municipio</Label>
                  <Input
                    id="municipality"
                    placeholder="Ej: Gozón, Villaviciosa..."
                    value={municipality}
                    onChange={(e) => setMunicipality(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="province">Provincia</Label>
                  <Input
                    id="province"
                    placeholder="Ej: Asturias, Madrid..."
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                  />
                </div>
              </div>

              {/* Advanced Filters */}
              <Collapsible open={showFilters} onOpenChange={setShowFilters}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Filter className="h-3 w-3" />
                    {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 p-3 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <Label className="text-xs">Precio máximo (€)</Label>
                      <NumericInput
                        value={maxPrice}
                        onChange={setMaxPrice}
                        placeholder="Sin límite"
                        min={0}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Superficie mínima (m²)</Label>
                      <NumericInput
                        value={minSurface}
                        onChange={setMinSurface}
                        placeholder="Sin mínimo"
                        min={0}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Superficie máxima (m²)</Label>
                      <NumericInput
                        value={maxSurface}
                        onChange={setMaxSurface}
                        placeholder="Sin máximo"
                        min={0}
                        className="h-8"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button
                onClick={handleSearch}
                disabled={isSearching || (!municipality.trim() && !province.trim())}
                className="w-full"
                size="lg"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Buscando terrenos...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Buscar Terrenos en Venta
                  </>
                )}
              </Button>
            </div>

            {/* Results */}
            {hasSearched && (
              <>
                <Separator />
                
                {/* Stats */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <TreePine className="h-3 w-3" />
                    {listings.length} encontrados
                  </Badge>
                  {buildableCount > 0 && (
                    <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle2 className="h-3 w-3" />
                      {buildableCount} edificables
                    </Badge>
                  )}
                  {notBuildableCount > 0 && (
                    <Badge className="gap-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      <XCircle className="h-3 w-3" />
                      {notBuildableCount} no edificables
                    </Badge>
                  )}
                  {unknownCount > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <HelpCircle className="h-3 w-3" />
                      {unknownCount} sin verificar
                    </Badge>
                  )}
                  
                  {/* Action buttons */}
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={verifyAllWithReference}
                      disabled={unknownCount === 0 || listings.some(l => l.isVerifying)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Verificar todos
                    </Button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1">
                  <Button
                    variant={filterBuildable === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBuildable('all')}
                  >
                    Todos ({listings.length})
                  </Button>
                  <Button
                    variant={filterBuildable === 'buildable' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBuildable('buildable')}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Edificables ({buildableCount})
                  </Button>
                  <Button
                    variant={filterBuildable === 'unknown' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBuildable('unknown')}
                    className="gap-1"
                  >
                    <HelpCircle className="h-3 w-3" />
                    Sin verificar ({unknownCount})
                  </Button>
                </div>

                {/* Listings */}
                {filteredListings.length > 0 ? (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {filteredListings.map((listing, index) => {
                        const originalIndex = listings.findIndex(l => l === listing);
                        return (
                          <Card key={index} className={`p-4 ${
                            listing.canBuild === true ? 'border-green-500/50 bg-green-50/30 dark:bg-green-950/20' :
                            listing.canBuild === false ? 'border-red-500/50 bg-red-50/30 dark:bg-red-950/20' :
                            ''
                          }`}>
                            <div className="space-y-2">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm line-clamp-2">{listing.title}</h4>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                    <MapPin className="h-3 w-3" />
                                    <span>{listing.location || `${listing.municipality}, ${listing.province}`}</span>
                                  </div>
                                </div>
                                {listing.canBuild !== undefined && (
                                  <Badge className={
                                    listing.canBuild 
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  }>
                                    {listing.canBuild ? 'Edificable' : 'No edificable'}
                                  </Badge>
                                )}
                              </div>

                              {/* Details */}
                              <div className="flex flex-wrap gap-3 text-sm">
                                <div className="flex items-center gap-1">
                                  <Euro className="h-3 w-3 text-primary" />
                                  <span className="font-medium">{listing.priceText || formatPrice(listing.price)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Ruler className="h-3 w-3 text-primary" />
                                  <span>{listing.surfaceText || formatSurface(listing.surfaceArea)}</span>
                                </div>
                                {listing.source && (
                                  <Badge variant="outline" className="text-xs">
                                    {listing.source}
                                  </Badge>
                                )}
                                {listing.landClass && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {listing.landClass}
                                  </Badge>
                                )}
                              </div>

                              {/* Description */}
                              {listing.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {listing.description}
                                </p>
                              )}

                              {/* Cadastral Reference */}
                              {listing.cadastralReference && (
                                <div className="flex items-center gap-1 text-xs font-mono bg-muted/50 px-2 py-1 rounded w-fit">
                                  <span className="text-muted-foreground">Ref:</span>
                                  <span>{listing.cadastralReference}</span>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex flex-wrap gap-2 pt-2">
                                {listing.url && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openSafeUrl(listing.url)}
                                    className="gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Ver anuncio
                                  </Button>
                                )}
                                {listing.cadastralReference && listing.canBuild === undefined && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => verifyLandClass(originalIndex)}
                                    disabled={listing.isVerifying}
                                    className="gap-1"
                                  >
                                    {listing.isVerifying ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Search className="h-3 w-3" />
                                    )}
                                    Verificar Catastro
                                  </Button>
                                )}
                                {onSelectListing && listing.canBuild === true && (
                                  <Button
                                    size="sm"
                                    onClick={() => onSelectListing(listing)}
                                    className="gap-1"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Seleccionar
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <TreePine className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No se encontraron terrenos con los criterios seleccionados</p>
                  </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span>Fuentes consultadas: </span>
                    {sources.slice(0, 5).join(', ')}
                    {sources.length > 5 && ` y ${sources.length - 5} más`}
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!hasSearched && (
              <div className="text-center py-6 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Introduce un municipio o provincia para buscar terrenos en venta</p>
                <p className="text-xs mt-1">
                  Se buscarán anuncios en Idealista, Fotocasa, pisos.com y otros portales
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
