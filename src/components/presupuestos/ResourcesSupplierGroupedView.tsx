import React, { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Pencil, Trash2, Package, Wrench, Truck, Briefcase, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface BudgetResource {
  id: string;
  budget_id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
  description: string | null;
  created_at: string | null;
  supplier_id: string | null;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface ResourcesSupplierGroupedViewProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  isAdmin: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  calculateFields: (resource: BudgetResource) => {
    safetyMarginUd: number;
    internalCostUd: number;
    salesMarginUd: number;
    salesCostUd: number;
    calculatedUnits: number;
    subtotalSales: number;
  };
  getActivityId: (activityId: string | null) => string;
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
  'Herramienta': <Wrench className="h-4 w-4" />,
  'Impuestos': <Package className="h-4 w-4" />,
  'Tarea': <CheckSquare className="h-4 w-4" />,
};

export function ResourcesSupplierGroupedView({
  resources,
  activities,
  phases,
  isAdmin,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  calculateFields,
  getActivityId,
}: ResourcesSupplierGroupedViewProps) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<Contact[]>([]);

  // Fetch suppliers for all supplier_ids in resources
  useEffect(() => {
    const supplierIds = [...new Set(resources.map(r => r.supplier_id).filter(Boolean))] as string[];
    
    if (supplierIds.length === 0) {
      setSuppliers([]);
      return;
    }

    const fetchSuppliers = async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone')
        .in('id', supplierIds);

      if (!error && data) {
        setSuppliers(data);
      }
    };

    fetchSuppliers();
  }, [resources]);

  // Group resources by supplier
  const groupedBySupplier = useMemo(() => {
    const groups: Record<string, BudgetResource[]> = {};
    
    resources.forEach(resource => {
      const key = resource.supplier_id || '__no_supplier__';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(resource);
    });

    // Sort each group by name
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [resources]);

  // Calculate totals per supplier
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    
    Object.entries(groupedBySupplier).forEach(([supplierId, supplierResources]) => {
      totals[supplierId] = supplierResources.reduce((sum, r) => {
        const fields = calculateFields(r);
        return sum + fields.subtotalSales;
      }, 0);
    });

    return totals;
  }, [groupedBySupplier, calculateFields]);

  // Sort suppliers: those with resources first, then "Sin suministrador"
  const sortedSupplierIds = useMemo(() => {
    const ids = Object.keys(groupedBySupplier);
    return ids.sort((a, b) => {
      if (a === '__no_supplier__') return 1;
      if (b === '__no_supplier__') return -1;
      const supplierA = suppliers.find(s => s.id === a);
      const supplierB = suppliers.find(s => s.id === b);
      const nameA = supplierA ? `${supplierA.name} ${supplierA.surname || ''}` : '';
      const nameB = supplierB ? `${supplierB.name} ${supplierB.surname || ''}` : '';
      return nameA.localeCompare(nameB);
    });
  }, [groupedBySupplier, suppliers]);

  const toggleSupplierExpanded = (supplierId: string) => {
    setExpandedSuppliers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(supplierId)) {
        newSet.delete(supplierId);
      } else {
        newSet.add(supplierId);
      }
      return newSet;
    });
  };

  const getSupplierLabel = (supplierId: string) => {
    if (supplierId === '__no_supplier__') {
      return 'Sin suministrador';
    }
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return 'Cargando...';
    return supplier.surname 
      ? `${supplier.name} ${supplier.surname}`
      : supplier.name;
  };

  const getSupplierContact = (supplierId: string) => {
    if (supplierId === '__no_supplier__') return '';
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return '';
    const parts = [supplier.email, supplier.phone].filter(Boolean);
    return parts.join(' | ');
  };

  if (resources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay recursos para mostrar
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedSupplierIds.map(supplierId => {
        const supplierResources = groupedBySupplier[supplierId];
        const isExpanded = expandedSuppliers.has(supplierId);
        const total = supplierTotals[supplierId] || 0;

        return (
          <div key={supplierId} className="border rounded-lg overflow-hidden">
            {/* Supplier Header */}
            <div
              className={cn(
                "flex items-center justify-between p-4 cursor-pointer transition-colors",
                supplierId === '__no_supplier__' 
                  ? "bg-muted/50 hover:bg-muted" 
                  : "bg-primary/5 hover:bg-primary/10"
              )}
              onClick={() => toggleSupplierExpanded(supplierId)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="p-2 rounded-full bg-background">
                  {supplierId === '__no_supplier__' ? (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">{getSupplierLabel(supplierId)}</p>
                  {supplierId !== '__no_supplier__' && (
                    <p className="text-sm text-muted-foreground">{getSupplierContact(supplierId)}</p>
                  )}
                </div>
                <Badge variant="secondary" className="ml-2">
                  {supplierResources.length} recurso{supplierResources.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{formatCurrency(total)}</p>
                <p className="text-xs text-muted-foreground">Subtotal</p>
              </div>
            </div>

            {/* Resources Table */}
            {isExpanded && (
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={supplierResources.every(r => selectedIds.has(r.id))}
                            onCheckedChange={() => {
                              const allSelected = supplierResources.every(r => selectedIds.has(r.id));
                              supplierResources.forEach(r => {
                                if (allSelected && selectedIds.has(r.id)) {
                                  onToggleSelect(r.id);
                                } else if (!allSelected && !selectedIds.has(r.id)) {
                                  onToggleSelect(r.id);
                                }
                              });
                            }}
                          />
                        </TableHead>
                      )}
                      <TableHead>Recurso</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">€Coste ud</TableHead>
                      <TableHead>Ud</TableHead>
                      <TableHead className="text-right">Uds calc.</TableHead>
                      <TableHead className="text-right">€Subtotal</TableHead>
                      <TableHead>Actividad</TableHead>
                      {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierResources.map(resource => {
                      const fields = calculateFields(resource);
                      const isSelected = selectedIds.has(resource.id);

                      return (
                        <TableRow 
                          key={resource.id}
                          className={cn(isSelected && "bg-primary/5")}
                        >
                          {isAdmin && (
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => onToggleSelect(resource.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">{resource.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              {resourceTypeIcons[resource.resource_type || 'Producto']}
                              {resource.resource_type || 'Producto'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(resource.external_unit_cost || 0)}
                          </TableCell>
                          <TableCell>{resource.unit || 'ud'}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(fields.calculatedUnits)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatCurrency(fields.subtotalSales)}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <span className="whitespace-normal break-words leading-tight text-sm">
                              {getActivityId(resource.activity_id) || '-'}
                            </span>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(resource);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(resource);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
