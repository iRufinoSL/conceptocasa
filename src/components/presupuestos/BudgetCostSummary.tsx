import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Home, Euro, TrendingUp, Building2, Package } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  resource_type: string | null;
  activity_opciones: string[];
}

interface Space {
  id: string;
  m2_built: number | null;
  m2_livable: number | null;
}

// Valid resource types (exclude invalid types like "herramientas")
const VALID_RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const IMPUESTOS_TYPE = 'Impuestos';
const OPTIONS = ['A', 'B', 'C'] as const;

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  'Producto': 'hsl(217, 91%, 60%)',
  'Mano de obra': 'hsl(142, 76%, 36%)',
  'Alquiler': 'hsl(38, 92%, 50%)',
  'Servicio': 'hsl(346, 77%, 49%)',
  'Sin tipo': 'hsl(220, 9%, 46%)',
};

const OPTION_COLORS: Record<string, { from: string; to: string; border: string; text: string }> = {
  'A': { from: 'from-amber-500/10', to: 'to-orange-500/10', border: 'border-amber-500/20', text: 'text-amber-600' },
  'B': { from: 'from-emerald-500/10', to: 'to-teal-500/10', border: 'border-emerald-500/20', text: 'text-emerald-600' },
  'C': { from: 'from-violet-500/10', to: 'to-purple-500/10', border: 'border-violet-500/20', text: 'text-violet-600' },
};

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
            .select('id, external_unit_cost, manual_units, related_units, safety_margin_percent, sales_margin_percent, resource_type, activity_id, budget_activities(opciones)')
            .eq('budget_id', budgetId),
          supabase
            .from('budget_spaces')
            .select('id, m2_built, m2_livable')
            .eq('budget_id', budgetId)
        ]);

        if (resourcesRes.error) throw resourcesRes.error;
        if (spacesRes.error) throw spacesRes.error;

        // Map resources with their activity opciones
        const mappedResources: Resource[] = (resourcesRes.data || []).map((r: any) => ({
          id: r.id,
          external_unit_cost: r.external_unit_cost,
          manual_units: r.manual_units,
          related_units: r.related_units,
          safety_margin_percent: r.safety_margin_percent,
          sales_margin_percent: r.sales_margin_percent,
          resource_type: r.resource_type,
          activity_opciones: r.budget_activities?.opciones || ['A', 'B', 'C'],
        }));

        setResources(mappedResources);
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

  // Calculate total m2
  const totalM2Built = spaces.reduce((sum, space) => sum + (space.m2_built || 0), 0);
  const totalM2Livable = spaces.reduce((sum, space) => sum + (space.m2_livable || 0), 0);

  // Helper function to calculate resource subtotal
  const getResourceSubtotal = (resource: Resource) => {
    return calcResourceSubtotal({
      externalUnitCost: resource.external_unit_cost,
      safetyPercent: resource.safety_margin_percent,
      salesPercent: resource.sales_margin_percent,
      manualUnits: resource.manual_units,
      relatedUnits: resource.related_units
    });
  };

  // Filter resources by option
  const filterResourcesByOption = (option: string) => {
    return resources.filter(r => r.activity_opciones.includes(option));
  };

  // Calculate metrics for a given set of resources
  const calculateMetrics = (resourceList: Resource[]) => {
    const subtotalResources = resourceList.reduce((sum, resource) => sum + getResourceSubtotal(resource), 0);
    
    const subtotalGastosConstruccion = resourceList.reduce((sum, resource) => {
      if (resource.resource_type === IMPUESTOS_TYPE) return sum;
      return sum + getResourceSubtotal(resource);
    }, 0);

    const costPerM2Built = totalM2Built > 0 ? subtotalResources / totalM2Built : 0;
    const costPerM2Livable = totalM2Livable > 0 ? subtotalResources / totalM2Livable : 0;
    const costPerM2BuiltGastos = totalM2Built > 0 ? subtotalGastosConstruccion / totalM2Built : 0;
    const costPerM2LivableGastos = totalM2Livable > 0 ? subtotalGastosConstruccion / totalM2Livable : 0;

    return {
      subtotalResources,
      subtotalGastosConstruccion,
      costPerM2Built,
      costPerM2Livable,
      costPerM2BuiltGastos,
      costPerM2LivableGastos,
      resourceCount: resourceList.length
    };
  };

  // Calculate chart data for a given set of resources
  const calculateChartData = (resourceList: Resource[]) => {
    const byType = resourceList.reduce((acc, resource) => {
      const type = resource.resource_type || 'Sin tipo';
      if (type !== 'Sin tipo' && !VALID_RESOURCE_TYPES.includes(type) && type !== IMPUESTOS_TYPE) {
        return acc;
      }
      const total = getResourceSubtotal(resource);
      if (!acc[type]) {
        acc[type] = { count: 0, total: 0 };
      }
      acc[type].count++;
      acc[type].total += total;
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return Object.entries(byType)
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        color: RESOURCE_TYPE_COLORS[name] || RESOURCE_TYPE_COLORS['Sin tipo'],
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  // Calculate metrics for each option
  const optionMetrics = useMemo(() => {
    const result: Record<string, ReturnType<typeof calculateMetrics> & { chartData: ReturnType<typeof calculateChartData> }> = {};
    OPTIONS.forEach(option => {
      const filteredResources = filterResourcesByOption(option);
      result[option] = {
        ...calculateMetrics(filteredResources),
        chartData: calculateChartData(filteredResources)
      };
    });
    return result;
  }, [resources, totalM2Built, totalM2Livable]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{payload[0]?.payload?.name}</p>
          <p className="text-primary font-mono font-bold">{formatCurrency(payload[0]?.value || 0)}</p>
          {payload[0]?.payload?.count && (
            <p className="text-muted-foreground text-sm">{payload[0].payload.count} recursos</p>
          )}
        </div>
      );
    }
    return null;
  };

  const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-medium">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Render metrics cards for an option
  const renderMetricsSection = (option: string, metrics: typeof optionMetrics['A']) => {
    const colors = OPTION_COLORS[option];
    
    return (
      <div className="space-y-6">
        {/* Cost Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Subtotal Recursos */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-primary/10">
                  <Calculator className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Subtotal Recursos (Opción {option})</span>
              </div>
              <div className="text-3xl font-bold text-primary">
                {formatCurrency(metrics.subtotalResources)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total PVP de {metrics.resourceCount} recursos
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

        {/* Cost per m2 - 4 cards in 2x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cost per m2 Built Total */}
          <Card className={`bg-gradient-to-br ${colors.from} ${colors.to} ${colors.border}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${colors.from.replace('from-', 'bg-').replace('/10', '/20')}`}>
                  <TrendingUp className={`h-5 w-5 ${colors.text}`} />
                </div>
                <span className="text-sm font-medium">€ Coste por m² Construido Total</span>
              </div>
              <div className={`text-4xl font-bold ${colors.text}`}>
                {formatCurrency(metrics.costPerM2Built)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalResources)} ÷ {formatNumber(totalM2Built)} m²
              </p>
              {totalM2Built === 0 && (
                <p className={`text-xs ${colors.text} mt-2`}>
                  ⚠️ Añade espacios para calcular el coste por m²
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost per m2 Livable Total */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-emerald-500/20">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="text-sm font-medium">€ Coste por m² Habitable Total</span>
              </div>
              <div className="text-4xl font-bold text-emerald-600">
                {formatCurrency(metrics.costPerM2Livable)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalResources)} ÷ {formatNumber(totalM2Livable)} m²
              </p>
              {totalM2Livable === 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  ⚠️ Añade espacios para calcular el coste por m²
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost per m2 Built Gastos Construcción */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-blue-500/20">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium">€ Coste por m² Gastos Construcción</span>
              </div>
              <div className="text-4xl font-bold text-blue-600">
                {formatCurrency(metrics.costPerM2BuiltGastos)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalGastosConstruccion)} ÷ {formatNumber(totalM2Built)} m²
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Excluye tipo "Impuestos"
              </p>
            </CardContent>
          </Card>

          {/* Cost per m2 Livable Gastos Construcción */}
          <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-violet-500/20">
                  <TrendingUp className="h-5 w-5 text-violet-600" />
                </div>
                <span className="text-sm font-medium">€ Coste por m² Habitable Gastos Construcción</span>
              </div>
              <div className="text-4xl font-bold text-violet-600">
                {formatCurrency(metrics.costPerM2LivableGastos)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalGastosConstruccion)} ÷ {formatNumber(totalM2Livable)} m²
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Excluye tipo "Impuestos"
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Resource Type Distribution Chart */}
        {metrics.chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Distribución por Tipo de Recurso (Opción {option})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={CustomPieLabel}
                      outerRadius={100}
                      innerRadius={40}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {metrics.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value) => <span className="text-foreground text-sm">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Type badges with values */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                {metrics.chartData.map((type) => (
                  <Badge 
                    key={type.name} 
                    variant="outline" 
                    className="text-xs py-1.5 px-3"
                    style={{ borderColor: type.color, color: type.color }}
                  >
                    {type.name}: {formatCurrency(type.value)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

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
            Resumen de costes por metro cuadrado del presupuesto, separado por opciones A, B y C
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

          {/* Tabs for Options A, B, C */}
          <Tabs defaultValue="A" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="A" className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/20 text-amber-600 border-amber-500/30">A</Badge>
                Opción A
              </TabsTrigger>
              <TabsTrigger value="B" className="flex items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">B</Badge>
                Opción B
              </TabsTrigger>
              <TabsTrigger value="C" className="flex items-center gap-2">
                <Badge variant="outline" className="bg-violet-500/20 text-violet-600 border-violet-500/30">C</Badge>
                Opción C
              </TabsTrigger>
            </TabsList>

            {OPTIONS.map(option => (
              <TabsContent key={option} value={option}>
                {renderMetricsSection(option, optionMetrics[option])}
              </TabsContent>
            ))}
          </Tabs>

          {/* Info Note */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Nota:</strong> El coste por m² se calcula dividiendo el subtotal de recursos (PVP) 
              entre los metros cuadrados totales registrados en la sección de Espacios del presupuesto.
              Los cálculos de "Gastos Construcción" excluyen los recursos de tipo "Impuestos".
              Los recursos se filtran según las opciones (A, B, C) asignadas a sus actividades.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
