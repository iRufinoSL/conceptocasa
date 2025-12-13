import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Calculator, TrendingUp, Percent, Euro, Package } from 'lucide-react';

interface BudgetResource {
  id: string;
  name: string;
  description: string | null;
  resource_type: string | null;
  unit: string | null;
  manual_units: number | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
}

interface BudgetSummaryProps {
  budgetId: string;
  budgetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BudgetSummary({ budgetId, budgetName, open, onOpenChange }: BudgetSummaryProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && budgetId) {
      fetchResources();
    }
  }, [open, budgetId]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name');

      if (error) throw error;
      setResources(data || []);
    } catch (error) {
      console.error('Error fetching budget resources:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const calculations = useMemo(() => {
    let totalBaseCost = 0;
    let totalWithSafety = 0;
    let totalWithMargins = 0;

    const resourceDetails = resources.map(resource => {
      const units = resource.manual_units || 0;
      const unitCost = resource.external_unit_cost || 0;
      const safetyPercent = resource.safety_margin_percent ?? 15;
      const salesPercent = resource.sales_margin_percent ?? 25;

      const baseCost = units * unitCost;
      const withSafety = baseCost * (1 + safetyPercent / 100);
      const withMargins = withSafety * (1 + salesPercent / 100);

      totalBaseCost += baseCost;
      totalWithSafety += withSafety;
      totalWithMargins += withMargins;

      return {
        ...resource,
        units,
        unitCost,
        safetyPercent,
        salesPercent,
        baseCost,
        withSafety,
        withMargins
      };
    });

    // Group by resource type
    const byType = resourceDetails.reduce((acc, r) => {
      const type = r.resource_type || 'Sin tipo';
      if (!acc[type]) {
        acc[type] = { count: 0, total: 0 };
      }
      acc[type].count++;
      acc[type].total += r.withMargins;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return {
      resources: resourceDetails,
      totalBaseCost,
      totalWithSafety,
      totalWithMargins,
      totalSafetyMargin: totalWithSafety - totalBaseCost,
      totalSalesMargin: totalWithMargins - totalWithSafety,
      byType,
      resourceCount: resources.length
    };
  }, [resources]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Resumen de Presupuesto: {budgetName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{calculations.resourceCount}</p>
                      <p className="text-xs text-muted-foreground">Recursos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-500/5 border-slate-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-500/10">
                      <Euro className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                      <p className="text-xs text-muted-foreground">Coste base</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Percent className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalSafetyMargin + calculations.totalSalesMargin)}</p>
                      <p className="text-xs text-muted-foreground">Márgenes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(calculations.totalWithMargins)}</p>
                      <p className="text-xs text-muted-foreground">Total PVP</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by Type */}
            {Object.keys(calculations.byType).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose por tipo de recurso</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(calculations.byType).map(([type, data]) => (
                      <Badge key={type} variant="outline" className="text-sm py-1 px-3">
                        {type}: {data.count} ({formatCurrency(data.total)})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resource Details Table */}
            {calculations.resources.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Detalle de recursos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recurso</TableHead>
                          <TableHead className="text-right">Uds.</TableHead>
                          <TableHead className="text-right">Coste/Ud.</TableHead>
                          <TableHead className="text-right">Seguridad</TableHead>
                          <TableHead className="text-right">Margen</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculations.resources.map((resource) => (
                          <TableRow key={resource.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{resource.name}</p>
                                {resource.resource_type && (
                                  <p className="text-xs text-muted-foreground">{resource.resource_type}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.units)} {resource.unit || ''}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(resource.unitCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.safetyPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(resource.salesPercent, 0)}%
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(resource.withMargins)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={5} className="text-right">
                            TOTAL PVP
                          </TableCell>
                          <TableCell className="text-right font-mono text-lg">
                            {formatCurrency(calculations.totalWithMargins)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Este presupuesto no tiene recursos definidos
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Margin Breakdown */}
            {calculations.resourceCount > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Desglose de márgenes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Coste base (sin márgenes)</p>
                      <p className="text-xl font-bold">{formatCurrency(calculations.totalBaseCost)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen de seguridad</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatCurrency(calculations.totalSafetyMargin)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10">
                      <p className="text-sm text-muted-foreground">+ Margen comercial</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(calculations.totalSalesMargin)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Precio de venta total (PVP)</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(calculations.totalWithMargins)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
