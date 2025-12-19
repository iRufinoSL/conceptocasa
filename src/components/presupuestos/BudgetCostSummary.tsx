import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Calculator, Home, Euro, TrendingUp, Building2 } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';

interface BudgetCostSummaryProps {
  budgetId: string;
  budgetName: string;
  budgetCode: number;
  budgetVersion: string;
  budgetLocation: string;
  budgetProvince: string | null;
}

interface Resource {
  id: string;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
}

interface Space {
  id: string;
  m2_built: number | null;
  m2_livable: number | null;
}

export function BudgetCostSummary({
  budgetId,
  budgetName,
  budgetCode,
  budgetVersion,
  budgetLocation,
  budgetProvince
}: BudgetCostSummaryProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [resourcesRes, spacesRes] = await Promise.all([
          supabase
            .from('budget_activity_resources')
            .select('id, external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent')
            .eq('budget_id', budgetId),
          supabase
            .from('budget_spaces')
            .select('id, m2_built, m2_livable')
            .eq('budget_id', budgetId)
        ]);

        if (resourcesRes.error) throw resourcesRes.error;
        if (spacesRes.error) throw spacesRes.error;

        setResources(resourcesRes.data || []);
        setSpaces(spacesRes.data || []);
      } catch (error) {
        console.error('Error fetching cost summary data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Listen for budget-recalculated event
    const handleRecalculated = () => {
      fetchData();
    };
    window.addEventListener('budget-recalculated', handleRecalculated);
    
    return () => {
      window.removeEventListener('budget-recalculated', handleRecalculated);
    };
  }, [budgetId]);

  // Calculate subtotal of all resources (PVP)
  const subtotalResources = resources.reduce((sum, resource) => {
    const total = calcResourceSubtotal({
      externalUnitCost: resource.external_unit_cost,
      safetyPercent: resource.safety_margin_percent,
      salesPercent: resource.sales_margin_percent,
      manualUnits: resource.manual_units,
      relatedUnits: resource.related_units
    });
    return sum + total;
  }, 0);

  // Calculate total m2
  const totalM2Built = spaces.reduce((sum, space) => sum + (space.m2_built || 0), 0);
  const totalM2Livable = spaces.reduce((sum, space) => sum + (space.m2_livable || 0), 0);

  // Calculate cost per m2
  const costPerM2Built = totalM2Built > 0 ? subtotalResources / totalM2Built : 0;
  const costPerM2Livable = totalM2Livable > 0 ? subtotalResources / totalM2Livable : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="h-5 w-5" />
            ¿CUÁNTO cuesta?
          </CardTitle>
          <CardDescription>
            Resumen de costes por metro cuadrado del presupuesto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Budget Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Datos del Presupuesto
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Nombre:</span>
                <p className="font-medium">{budgetName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Código:</span>
                <p className="font-medium">{budgetCode}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Versión:</span>
                <p className="font-medium">{budgetVersion}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Ubicación:</span>
                <p className="font-medium">{budgetLocation}{budgetProvince ? `, ${budgetProvince}` : ''}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Cost Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Subtotal Recursos */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Calculator className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Subtotal Recursos</span>
                </div>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(subtotalResources)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total PVP de {resources.length} recursos
                </p>
              </CardContent>
            </Card>

            {/* Total m2 Construidos */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-full bg-muted">
                    <Home className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">m² Construidos</span>
                </div>
                <div className="text-3xl font-bold">
                  {formatNumber(totalM2Built)} m²
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  De {spaces.length} espacios
                </p>
              </CardContent>
            </Card>

            {/* Total m2 Habitables */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-full bg-muted">
                    <Home className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">m² Habitables</span>
                </div>
                <div className="text-3xl font-bold">
                  {formatNumber(totalM2Livable)} m²
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  De {spaces.length} espacios
                </p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Cost per m2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cost per m2 Built */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-full bg-amber-500/20">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium">€ Coste por m² Construido</span>
                </div>
                <div className="text-4xl font-bold text-amber-600">
                  {formatCurrency(costPerM2Built)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {formatCurrency(subtotalResources)} ÷ {formatNumber(totalM2Built)} m²
                </p>
                {totalM2Built === 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Añade espacios para calcular el coste por m²
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cost per m2 Livable */}
            <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-full bg-emerald-500/20">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium">€ Coste por m² Habitable</span>
                </div>
                <div className="text-4xl font-bold text-emerald-600">
                  {formatCurrency(costPerM2Livable)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {formatCurrency(subtotalResources)} ÷ {formatNumber(totalM2Livable)} m²
                </p>
                {totalM2Livable === 0 && (
                  <p className="text-xs text-emerald-600 mt-2">
                    ⚠️ Añade espacios para calcular el coste por m²
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Info Note */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Nota:</strong> El coste por m² se calcula dividiendo el subtotal de recursos (PVP) 
              entre los metros cuadrados totales registrados en la sección de Espacios del presupuesto.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
