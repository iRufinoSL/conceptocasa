import { useState, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Package, Layers, Building2, ShoppingBag, Pencil, Filter, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Phase {
  id: string;
  name: string;
  code: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

interface Resource {
  id: string;
  name: string;
  activity_id: string | null;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  unit: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  purchase_unit_cost?: number | null;
  conversion_factor?: number | null;
}

interface SupplierBuyingListViewProps {
  phases: Phase[];
  activities: Activity[];
  resources: Resource[];
  onEditResource?: (resource: Resource) => void;
}

export function SupplierBuyingListView({ phases, activities, resources, onEditResource }: SupplierBuyingListViewProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [dateFilterStart, setDateFilterStart] = useState<string>('');
  const [dateFilterEnd, setDateFilterEnd] = useState<string>('');

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleSupplier = (key: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Get unique suppliers
  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Map<string, string>();
    resources.forEach(r => {
      if (r.supplier_id && r.supplier_name) {
        suppliers.set(r.supplier_id, r.supplier_name);
      }
    });
    return Array.from(suppliers.entries()).map(([id, name]) => ({ id, name }));
  }, [resources]);

  // Filter resources by supplier and date range
  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      // Supplier filter
      if (selectedSupplierId !== 'all' && r.supplier_id !== selectedSupplierId) {
        return false;
      }

      // Date filter - check activity dates
      if (dateFilterStart || dateFilterEnd) {
        const activity = activities.find(a => a.id === r.activity_id);
        if (!activity) return false;

        const phase = phases.find(p => p.id === activity.phase_id);
        const startDate = activity.actual_start_date || phase?.actual_start_date;
        const endDate = activity.actual_end_date || phase?.actual_end_date;

        if (!startDate && !endDate) return false;

        const filterStart = dateFilterStart ? parseISO(dateFilterStart) : null;
        const filterEnd = dateFilterEnd ? parseISO(dateFilterEnd) : null;
        const actStart = startDate ? parseISO(startDate) : null;
        const actEnd = endDate ? parseISO(endDate) : null;

        // Check if activity period overlaps with filter period
        if (filterStart && actEnd && isValid(filterStart) && isValid(actEnd) && actEnd < filterStart) {
          return false;
        }
        if (filterEnd && actStart && isValid(filterEnd) && isValid(actStart) && actStart > filterEnd) {
          return false;
        }
      }

      return true;
    });
  }, [resources, selectedSupplierId, dateFilterStart, dateFilterEnd, activities, phases]);

  // Group resources by phase -> supplier
  const groupedData = useMemo(() => {
    const result = new Map<string, Map<string, Resource[]>>();

    // Initialize phases
    phases.forEach(phase => {
      result.set(phase.id, new Map());
    });
    result.set('unassigned', new Map()); // For resources without phase

    filteredResources.forEach(resource => {
      const activity = activities.find(a => a.id === resource.activity_id);
      const phaseId = activity?.phase_id || 'unassigned';
      const supplierId = resource.supplier_id || 'no-supplier';

      if (!result.has(phaseId)) {
        result.set(phaseId, new Map());
      }

      const phaseMap = result.get(phaseId)!;
      if (!phaseMap.has(supplierId)) {
        phaseMap.set(supplierId, []);
      }
      phaseMap.get(supplierId)!.push(resource);
    });

    return result;
  }, [filteredResources, activities, phases]);

  // Calculate phase totals
  const phaseTotals = useMemo(() => {
    const totals = new Map<string, { resourceCount: number; total: number }>();

    groupedData.forEach((suppliers, phaseId) => {
      let resourceCount = 0;
      let total = 0;

      suppliers.forEach(resources => {
        resourceCount += resources.length;
        resources.forEach(r => {
          const purchaseCost = (r.purchase_unit_quantity ?? 0) * (r.purchase_unit_cost ?? 0);
          total += purchaseCost > 0 ? purchaseCost : (r.manual_units ?? r.related_units ?? 0) * (r.external_unit_cost ?? 0);
        });
      });

      totals.set(phaseId, { resourceCount, total });
    });

    return totals;
  }, [groupedData]);

  const getResourceTypeBadgeColor = (type: string | null) => {
    switch (type) {
      case 'Material':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Mano de obra':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Maquinaria':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'Subcontrata':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const getSupplierName = (supplierId: string) => {
    if (supplierId === 'no-supplier') return 'Sin proveedor asignado';
    return uniqueSuppliers.find(s => s.id === supplierId)?.name || 'Proveedor desconocido';
  };

  const sortedPhases = useMemo(() => {
    return [...phases].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [phases]);

  if (phases.length === 0 && filteredResources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>No hay recursos para mostrar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros:</span>
        </div>

        <div className="flex-1 min-w-[200px]">
          <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
            <SelectTrigger className="h-8">
              <Building2 className="h-3.5 w-3.5 mr-2" />
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {uniqueSuppliers.map(supplier => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs">Período:</Label>
          <Input
            type="date"
            value={dateFilterStart}
            onChange={(e) => setDateFilterStart(e.target.value)}
            className="h-8 w-[130px] text-xs"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="date"
            value={dateFilterEnd}
            onChange={(e) => setDateFilterEnd(e.target.value)}
            className="h-8 w-[130px] text-xs"
          />
        </div>
      </div>

      {/* Phase -> Supplier -> Resources Hierarchy */}
      {sortedPhases.map((phase) => {
        const suppliersMap = groupedData.get(phase.id);
        if (!suppliersMap || suppliersMap.size === 0) return null;

        const isPhaseExpanded = expandedPhases.has(phase.id);
        const phaseTotalData = phaseTotals.get(phase.id) || { resourceCount: 0, total: 0 };

        return (
          <Collapsible key={phase.id} open={isPhaseExpanded} onOpenChange={() => togglePhase(phase.id)}>
            <div className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  {isPhaseExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <Layers className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {phase.code ? `${phase.code}.- ${phase.name}` : phase.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suppliersMap.size} proveedor{suppliersMap.size !== 1 ? 'es' : ''} • {phaseTotalData.resourceCount} recurso{phaseTotalData.resourceCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatCurrency(phaseTotalData.total)}</p>
                    <p className="text-[10px] text-muted-foreground">Coste Compra</p>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t bg-muted/10 p-2 space-y-1">
                  {Array.from(suppliersMap.entries()).map(([supplierId, supplierResources]) => {
                    const supplierKey = `${phase.id}-${supplierId}`;
                    const isSupplierExpanded = expandedSuppliers.has(supplierKey);
                    const supplierTotal = supplierResources.reduce((sum, r) => {
                      const purchaseCost = (r.purchase_unit_quantity ?? 0) * (r.purchase_unit_cost ?? 0);
                      return sum + (purchaseCost > 0 ? purchaseCost : (r.manual_units ?? r.related_units ?? 0) * (r.external_unit_cost ?? 0));
                    }, 0);

                    return (
                      <Collapsible key={supplierKey} open={isSupplierExpanded} onOpenChange={() => toggleSupplier(supplierKey)}>
                        <div className="border rounded-md bg-background">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 transition-colors">
                              {isSupplierExpanded ? (
                                <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              )}
                              <Building2 className={cn(
                                "h-3.5 w-3.5 flex-shrink-0",
                                supplierId === 'no-supplier' ? 'text-orange-500' : 'text-muted-foreground'
                              )} />
                              <p className={cn(
                                "text-sm flex-1 min-w-0 truncate",
                                supplierId === 'no-supplier' && 'text-orange-600 dark:text-orange-400'
                              )}>
                                {getSupplierName(supplierId)}
                              </p>
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                {supplierResources.length}
                              </Badge>
                              <span className="text-sm font-medium tabular-nums">
                                {formatCurrency(supplierTotal)}
                              </span>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t divide-y">
                              {supplierResources.map((resource) => {
                                const calcUnits = resource.manual_units ?? resource.related_units ?? 0;
                                const hasPurchaseData = resource.purchase_unit && resource.purchase_unit_cost;
                                const displayUnits = hasPurchaseData ? resource.purchase_unit_quantity ?? 0 : calcUnits;
                                const displayUnit = hasPurchaseData ? resource.purchase_unit : resource.unit;
                                const displayCost = hasPurchaseData ? resource.purchase_unit_cost ?? 0 : resource.external_unit_cost ?? 0;
                                const subtotal = displayUnits * displayCost;

                                return (
                                  <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5 group">
                                    <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{resource.name}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {resource.resource_type && (
                                          <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                                            {resource.resource_type}
                                          </Badge>
                                        )}
                                        {hasPurchaseData && (
                                          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                            Ud. Compra
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right text-xs whitespace-nowrap">
                                      <p className="font-medium">
                                        {displayUnits.toLocaleString('es-ES', { maximumFractionDigits: 3 })} {displayUnit || 'ud'}
                                      </p>
                                      <p className="text-muted-foreground">× {formatCurrency(displayCost)}</p>
                                    </div>
                                    <div className="text-right min-w-[80px]">
                                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(subtotal)}</p>
                                    </div>
                                    {onEditResource && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => onEditResource(resource)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {/* Unassigned phase */}
      {groupedData.get('unassigned')?.size > 0 && (
        <Collapsible open={expandedPhases.has('unassigned')} onOpenChange={() => togglePhase('unassigned')}>
          <div className="border rounded-lg border-dashed">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                {expandedPhases.has('unassigned') ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-muted-foreground">Sin fase asignada</p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t bg-muted/10 p-2 space-y-1">
                {Array.from(groupedData.get('unassigned')!.entries()).map(([supplierId, supplierResources]) => {
                  const supplierKey = `unassigned-${supplierId}`;
                  const isSupplierExpanded = expandedSuppliers.has(supplierKey);
                  const supplierTotal = supplierResources.reduce((sum, r) => {
                    const purchaseCost = (r.purchase_unit_quantity ?? 0) * (r.purchase_unit_cost ?? 0);
                    return sum + (purchaseCost > 0 ? purchaseCost : (r.manual_units ?? r.related_units ?? 0) * (r.external_unit_cost ?? 0));
                  }, 0);

                  return (
                    <Collapsible key={supplierKey} open={isSupplierExpanded} onOpenChange={() => toggleSupplier(supplierKey)}>
                      <div className="border rounded-md bg-background">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 transition-colors">
                            {isSupplierExpanded ? (
                              <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <p className="text-sm flex-1 min-w-0 truncate">
                              {getSupplierName(supplierId)}
                            </p>
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {supplierResources.length}
                            </Badge>
                            <span className="text-sm font-medium tabular-nums">
                              {formatCurrency(supplierTotal)}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t divide-y">
                            {supplierResources.map((resource) => {
                              const calcUnits = resource.manual_units ?? resource.related_units ?? 0;
                              const hasPurchaseData = resource.purchase_unit && resource.purchase_unit_cost;
                              const displayUnits = hasPurchaseData ? resource.purchase_unit_quantity ?? 0 : calcUnits;
                              const displayUnit = hasPurchaseData ? resource.purchase_unit : resource.unit;
                              const displayCost = hasPurchaseData ? resource.purchase_unit_cost ?? 0 : resource.external_unit_cost ?? 0;
                              const subtotal = displayUnits * displayCost;

                              return (
                                <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5 group">
                                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm truncate">{resource.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {resource.resource_type && (
                                        <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                                          {resource.resource_type}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right text-xs whitespace-nowrap">
                                    <p className="font-medium">
                                      {displayUnits.toLocaleString('es-ES', { maximumFractionDigits: 3 })} {displayUnit || 'ud'}
                                    </p>
                                    <p className="text-muted-foreground">× {formatCurrency(displayCost)}</p>
                                  </div>
                                  <div className="text-right min-w-[80px]">
                                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(subtotal)}</p>
                                  </div>
                                  {onEditResource && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => onEditResource(resource)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}

export default SupplierBuyingListView;
