import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Globe, Phone, Mail, Euro, ExternalLink, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export function WebSearchDialog({ open, onOpenChange, onCreateResource }: WebSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceType, setResourceType] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const { toast } = useToast();

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
      const { data, error } = await supabase.functions.invoke('search-resources', {
        body: { 
          query: searchQuery,
          resourceType: resourceType || undefined,
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
