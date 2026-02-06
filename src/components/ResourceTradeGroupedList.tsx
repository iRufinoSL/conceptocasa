import { useState, useMemo } from 'react';
import { ExternalResource, getResourceComposition, ResourceType, RESOURCE_TYPES } from '@/types/resource';
import { useTrades } from '@/hooks/useTrades';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Pencil, Trash2, Copy, HardHat, Package, Users, Clock, Wrench, Boxes, Cog, Layers, Square, ExternalLink, Hammer } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ResourceTradeGroupedListProps {
  resources: ExternalResource[];
  onEdit: (resource: ExternalResource) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  getEffectiveCost: (resource: ExternalResource) => number;
  onUpdateResourceType?: (resourceId: string, newType: ResourceType) => void;
}

const resourceTypeVariants: Record<ResourceType, "producto" | "manoDeObra" | "alquiler" | "servicio" | "material" | "equipo" | "utiles"> = {
  'Alquiler': 'alquiler',
  'Equipo': 'equipo',
  'Mano de obra': 'manoDeObra',
  'Material': 'material',
  'Producto': 'producto',
  'Servicio': 'servicio',
  'Utiles y herramientas': 'utiles',
};

const resourceTypeIcons: Record<ResourceType, React.ReactNode> = {
  'Alquiler': <Clock className="h-3.5 w-3.5" />,
  'Equipo': <Cog className="h-3.5 w-3.5" />,
  'Mano de obra': <Users className="h-3.5 w-3.5" />,
  'Material': <Boxes className="h-3.5 w-3.5" />,
  'Producto': <Package className="h-3.5 w-3.5" />,
  'Servicio': <Wrench className="h-3.5 w-3.5" />,
  'Utiles y herramientas': <Hammer className="h-3.5 w-3.5" />,
};

export function ResourceTradeGroupedList({ 
  resources, 
  onEdit, 
  onDelete, 
  onDuplicate, 
  getEffectiveCost,
  onUpdateResourceType
}: ResourceTradeGroupedListProps) {
  const { trades } = useTrades();
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set(['sin-oficio']));

  // Group resources by trade
  const groupedResources = useMemo(() => {
    const groups: Record<string, ExternalResource[]> = {};
    
    // Initialize groups for all trades
    trades.forEach(trade => {
      groups[trade.id] = [];
    });
    groups['sin-oficio'] = [];
    
    // Distribute resources
    resources.forEach(resource => {
      const tradeId = (resource as any).tradeId || 'sin-oficio';
      if (!groups[tradeId]) {
        groups[tradeId] = [];
      }
      groups[tradeId].push(resource);
    });
    
    // Sort resources within each group
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    });
    
    return groups;
  }, [resources, trades]);

  const toggleTrade = (tradeId: string) => {
    setExpandedTrades(prev => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  };

  const formatDate = (date: Date) => {
    return format(new Date(date), 'dd/MM/yyyy', { locale: es });
  };

  const getTradeInfo = (tradeId: string): { name: string; count: number } => {
    if (tradeId === 'sin-oficio') {
      return { name: 'Sin oficio/sector asignado', count: groupedResources['sin-oficio']?.length || 0 };
    }
    const trade = trades.find(t => t.id === tradeId);
    return { 
      name: trade?.name || 'Desconocido', 
      count: groupedResources[tradeId]?.length || 0 
    };
  };

  // Get ordered trade IDs (trades with resources first, then sin-oficio)
  const orderedTradeIds = useMemo(() => {
    const tradesWithResources = trades
      .filter(t => groupedResources[t.id]?.length > 0)
      .map(t => t.id);
    
    if (groupedResources['sin-oficio']?.length > 0) {
      tradesWithResources.push('sin-oficio');
    }
    
    return tradesWithResources;
  }, [trades, groupedResources]);

  if (resources.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground rounded-lg border border-border bg-card">
        No se encontraron recursos externos
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orderedTradeIds.map(tradeId => {
        const { name, count } = getTradeInfo(tradeId);
        const isExpanded = expandedTrades.has(tradeId);
        const tradeResources = groupedResources[tradeId] || [];
        
        if (count === 0) return null;
        
        return (
          <Collapsible key={tradeId} open={isExpanded} onOpenChange={() => toggleTrade(tradeId)}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <HardHat className={`h-5 w-5 ${tradeId === 'sin-oficio' ? 'text-muted-foreground' : 'text-accent'}`} />
                <span className="font-medium flex-1">{name}</span>
                <Badge variant="secondary" className="text-xs">
                  {count} {count === 1 ? 'recurso' : 'recursos'}
                </Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border border-border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Descripción</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Composición</TableHead>
                      <TableHead className="text-right">Coste</TableHead>
                      <TableHead className="text-right">%IVA incl.</TableHead>
                      <TableHead className="hidden sm:table-cell">Ud.</TableHead>
                      <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                      <TableHead className="w-[120px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tradeResources.map((resource) => {
                      const composition = getResourceComposition(resource);
                      const isComposite = composition === 'Compuesto';
                      const effectiveCost = getEffectiveCost(resource);
                      
                      return (
                        <TableRow key={resource.id}>
                          <TableCell className="max-w-[200px]">
                            <div className="flex items-center gap-3">
                              {resource.imageUrl ? (
                                <img
                                  src={resource.imageUrl}
                                  alt={resource.name}
                                  className="h-8 w-8 rounded-md object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                  {resourceTypeIcons[resource.resourceType]}
                                </div>
                              )}
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="font-medium text-foreground truncate text-sm" title={resource.name}>
                                  {resource.name}
                                </p>
                                {resource.website && (
                                  <a
                                    href={resource.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-accent hover:underline flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Web
                                  </a>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-sm text-muted-foreground line-clamp-2 max-w-[250px]">
                              {resource.description}
                            </p>
                          </TableCell>
                          <TableCell>
                            {onUpdateResourceType ? (
                              <Select
                                value={resource.resourceType}
                                onValueChange={(value: ResourceType) => onUpdateResourceType(resource.id, value)}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs border-transparent hover:border-input bg-transparent">
                                  <SelectValue>
                                    <div className="flex items-center gap-1.5">
                                      {resourceTypeIcons[resource.resourceType]}
                                      <span className="hidden xl:inline">{resource.resourceType}</span>
                                    </div>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {RESOURCE_TYPES.map((type) => (
                                    <SelectItem key={type} value={type} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        {resourceTypeIcons[type]}
                                        {type}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={resourceTypeVariants[resource.resourceType]} className="gap-1 whitespace-nowrap text-xs">
                                {resourceTypeIcons[resource.resourceType]}
                                <span className="hidden xl:inline">{resource.resourceType}</span>
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isComposite ? "default" : "secondary"} className="gap-1 whitespace-nowrap text-xs">
                              {isComposite ? <Layers className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                              <span className="hidden xl:inline">{composition}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold whitespace-nowrap text-sm">
                            <div>{formatCurrency(effectiveCost)}</div>
                            {isComposite && (
                              <span className="text-xs text-accent font-normal">Calculado</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {resource.vatIncludedPercent ? `${resource.vatIncludedPercent}%` : '—'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {resource.unitMeasure}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                            {formatDate(resource.registrationDate)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => onDuplicate(resource.id)}
                                title="Duplicar"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => onEdit(resource)}
                                title="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => onDelete(resource.id)}
                                title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
