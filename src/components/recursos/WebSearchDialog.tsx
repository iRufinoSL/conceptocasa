import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Globe, Phone, Mail, Euro, ExternalLink, Plus, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface SearchResult {
  supplierName: string;
  website: string;
  phone: string;
  email: string;
  price: string;
  description: string;
}

interface WebSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateResource?: (data: {
    name: string;
    website: string;
    supplierName: string;
    supplierPhone: string;
    supplierEmail: string;
    unitCost: number | null;
  }) => void;
}

const RESOURCE_TYPES = [
  { value: 'material', label: 'Material' },
  { value: 'mano_obra', label: 'Mano de Obra' },
  { value: 'maquinaria', label: 'Maquinaria' },
  { value: 'subcontrata', label: 'Subcontrata' },
  { value: 'otros', label: 'Otros' },
];

const SPANISH_PROVINCES = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona',
  'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba', 'Cuenca',
  'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén',
  'A Coruña', 'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Murcia',
  'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife',
  'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Vizcaya', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'
];

const COUNTRIES = [
  { value: 'ES', label: 'España' },
  { value: 'PT', label: 'Portugal' },
  { value: 'FR', label: 'Francia' },
  { value: 'IT', label: 'Italia' },
  { value: 'DE', label: 'Alemania' },
  { value: 'GB', label: 'Reino Unido' },
  { value: 'NL', label: 'Países Bajos' },
  { value: 'BE', label: 'Bélgica' },
];

type GeoFilterType = 'none' | 'country' | 'province' | 'city' | 'radius';

export function WebSearchDialog({ open, onOpenChange, onCreateResource }: WebSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceType, setResourceType] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [geoFilterOpen, setGeoFilterOpen] = useState(true);
  
  // Geographic filters
  const [geoFilterType, setGeoFilterType] = useState<GeoFilterType>('country');
  const [selectedCountry, setSelectedCountry] = useState('ES');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [cityName, setCityName] = useState('');
  const [radiusKm, setRadiusKm] = useState('50');
  const [radiusLocation, setRadiusLocation] = useState('');
  
  const { toast } = useToast();

  // Build geographic filter string for search
  const buildGeoFilter = () => {
    switch (geoFilterType) {
      case 'country':
        const country = COUNTRIES.find(c => c.value === selectedCountry);
        return { location: country?.label || 'España', country: selectedCountry };
      case 'province':
        return selectedProvince 
          ? { location: `${selectedProvince}, España`, country: 'ES' }
          : { location: 'España', country: 'ES' };
      case 'city':
        return cityName 
          ? { location: `${cityName}, España`, country: 'ES' }
          : { location: 'España', country: 'ES' };
      case 'radius':
        return radiusLocation 
          ? { location: `${radiusLocation} ${radiusKm}km`, country: 'ES', radius: radiusKm }
          : { location: 'España', country: 'ES' };
      default:
        return { location: '', country: '' };
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Error',
        description: 'Por favor, introduce una búsqueda',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    setSearchPerformed(true);

    try {
      const geoFilter = buildGeoFilter();
      
      const { data, error } = await supabase.functions.invoke('search-resources', {
        body: { 
          query: searchQuery,
          resourceType: resourceType || undefined,
          geoFilter,
        },
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        setResults(data.data || []);
        if (data.data?.length === 0) {
          toast({
            title: 'Sin resultados',
            description: 'No se encontraron proveedores para esta búsqueda',
          });
        }
      } else {
        throw new Error(data.error || 'Error en la búsqueda');
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al buscar recursos',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddAsResource = (result: SearchResult) => {
    // Parse price to number
    let unitCost: number | null = null;
    if (result.price) {
      const priceStr = result.price.replace('€', '').replace(/\s/g, '').replace(',', '.');
      const parsed = parseFloat(priceStr);
      if (!isNaN(parsed)) {
        unitCost = parsed;
      }
    }

    if (onCreateResource) {
      onCreateResource({
        name: searchQuery,
        website: result.website,
        supplierName: result.supplierName,
        supplierPhone: result.phone,
        supplierEmail: result.email,
        unitCost,
      });
      toast({
        title: 'Recurso preparado',
        description: 'Los datos del proveedor han sido transferidos al formulario',
      });
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setResourceType('');
    setResults([]);
    setSearchPerformed(false);
    setGeoFilterType('country');
    setSelectedCountry('ES');
    setSelectedProvince('');
    setCityName('');
    setRadiusKm('50');
    setRadiusLocation('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Rastrear Web - Buscar Proveedores
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Geographic Filter */}
          <Collapsible open={geoFilterOpen} onOpenChange={setGeoFilterOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Filtro geográfico</span>
                  {geoFilterType !== 'none' && (
                    <span className="text-xs text-muted-foreground">
                      ({geoFilterType === 'country' ? COUNTRIES.find(c => c.value === selectedCountry)?.label :
                        geoFilterType === 'province' ? selectedProvince || 'Sin seleccionar' :
                        geoFilterType === 'city' ? cityName || 'Sin especificar' :
                        geoFilterType === 'radius' ? `${radiusLocation || 'Sin ubicación'} (${radiusKm}km)` : ''})
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${geoFilterOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <RadioGroup value={geoFilterType} onValueChange={(v) => setGeoFilterType(v as GeoFilterType)}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="country" id="geo-country" />
                      <Label htmlFor="geo-country">Por país</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="province" id="geo-province" />
                      <Label htmlFor="geo-province">Por provincia</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="city" id="geo-city" />
                      <Label htmlFor="geo-city">Por ciudad/localidad</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="radius" id="geo-radius" />
                      <Label htmlFor="geo-radius">Por radio de distancia</Label>
                    </div>
                  </div>
                </RadioGroup>

                {geoFilterType === 'country' && (
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger className="w-full sm:w-[250px]">
                        <SelectValue placeholder="Seleccionar país" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {geoFilterType === 'province' && (
                  <div className="space-y-2">
                    <Label>Provincia</Label>
                    <Select value={selectedProvince} onValueChange={setSelectedProvince}>
                      <SelectTrigger className="w-full sm:w-[250px]">
                        <SelectValue placeholder="Seleccionar provincia" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPANISH_PROVINCES.map((province) => (
                          <SelectItem key={province} value={province}>
                            {province}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {geoFilterType === 'city' && (
                  <div className="space-y-2">
                    <Label>Ciudad o localidad</Label>
                    <Input
                      placeholder="Ej: Valencia, Getafe, Marbella..."
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      className="w-full sm:w-[300px]"
                    />
                  </div>
                )}

                {geoFilterType === 'radius' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Ubicación central</Label>
                      <Input
                        placeholder="Ej: Calle Mayor 10, Madrid"
                        value={radiusLocation}
                        onChange={(e) => setRadiusLocation(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Radio (km)</Label>
                      <Select value={radiusKm} onValueChange={setRadiusKm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 km</SelectItem>
                          <SelectItem value="25">25 km</SelectItem>
                          <SelectItem value="50">50 km</SelectItem>
                          <SelectItem value="100">100 km</SelectItem>
                          <SelectItem value="200">200 km</SelectItem>
                          <SelectItem value="500">500 km</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Search Form */}
          <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="search-query">Definición de búsqueda</Label>
              <Input
                id="search-query"
                placeholder="Ej: baldosas cerámicas, ventanas PVC, pintura exterior..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de recurso</Label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {RESOURCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </Button>
            </div>
          </div>

          {/* Results */}
          {searchPerformed && (
            <div className="border rounded-lg">
              <ScrollArea className="h-[400px]">
                {results.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Suministrador</TableHead>
                        <TableHead>Web</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="max-w-[200px]">
                              <div className="truncate" title={result.supplierName}>
                                {result.supplierName}
                              </div>
                              {result.description && (
                                <div className="text-xs text-muted-foreground truncate" title={result.description}>
                                  {result.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {result.website ? (
                              <a
                                href={result.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span className="text-xs max-w-[120px] truncate">
                                  {new URL(result.website).hostname}
                                </span>
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.phone ? (
                              <a
                                href={`tel:${result.phone}`}
                                className="flex items-center gap-1 text-sm hover:underline"
                              >
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {result.phone}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.email ? (
                              <a
                                href={`mailto:${result.email}`}
                                className="flex items-center gap-1 text-sm hover:underline"
                              >
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span className="max-w-[120px] truncate">{result.email}</span>
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.price ? (
                              <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                                <Euro className="h-3 w-3" />
                                {result.price.replace('€', '').trim()}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddAsResource(result)}
                              title="Añadir como recurso"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Search className="h-12 w-12 mb-4 opacity-50" />
                    <p>No se encontraron resultados</p>
                    <p className="text-sm">Intenta con otros términos de búsqueda</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {!searchPerformed && (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Introduce una búsqueda para rastrear la web</p>
              <p className="text-sm">Buscaremos proveedores, precios y datos de contacto</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
