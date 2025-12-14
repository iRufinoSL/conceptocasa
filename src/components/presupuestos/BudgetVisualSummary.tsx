import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { Calculator, TrendingUp, Percent, Euro, Package, Wrench, Truck, Briefcase, Layers, ClipboardList, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap } from 'recharts';
import { BudgetSummary } from './BudgetSummary';

interface BudgetResource {
  id: string;
  name: string;
  resource_type: string | null;
  unit: string | null;
  manual_units: number | null;
  related_units: number | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  activity_id: string | null;
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

interface BudgetVisualSummaryProps {
  budgetId: string;
  budgetName: string;
}

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  'Producto': 'hsl(217, 91%, 60%)',
  'Mano de obra': 'hsl(142, 76%, 36%)',
  'Alquiler': 'hsl(38, 92%, 50%)',
  'Servicio': 'hsl(346, 77%, 49%)',
  'Sin tipo': 'hsl(220, 9%, 46%)',
};

const PHASE_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(346, 77%, 49%)',
  'hsl(262, 83%, 58%)',
  'hsl(199, 89%, 48%)',
  'hsl(24, 94%, 50%)',
  'hsl(173, 80%, 40%)',
];

export function BudgetVisualSummary({ budgetId, budgetName }: BudgetVisualSummaryProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name'),
        supabase
          .from('budget_activities')
          .select('id, code, name, phase_id')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_phases')
          .select('id, code, name')
          .eq('budget_id', budgetId)
          .order('code'),
      ]);

      if (resourcesRes.error) throw resourcesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;

      setResources(resourcesRes.data || []);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculations = useMemo(() => {
    let totalBaseCost = 0;
    let totalWithSafety = 0;
    let totalWithMargins = 0;

    const resourceDetails = resources.map(resource => {
      const units = resource.manual_units !== null ? resource.manual_units : (resource.related_units || 0);
      const unitCost = resource.external_unit_cost || 0;
      const safetyPercent = resource.safety_margin_percent ?? 0.15;
      const salesPercent = resource.sales_margin_percent ?? 0.25;

      const baseCost = units * unitCost;
      const safetyMargin = baseCost * safetyPercent;
      const withSafety = baseCost + safetyMargin;
      const salesMargin = withSafety * salesPercent;
      const withMargins = withSafety + salesMargin;

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

    // Group by phase
    const byPhase = resourceDetails.reduce((acc, r) => {
      const activity = activities.find(a => a.id === r.activity_id);
      const phase = activity?.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
      const phaseName = phase ? `${phase.code || ''} ${phase.name}`.trim() : 'Sin fase';
      
      if (!acc[phaseName]) {
        acc[phaseName] = { count: 0, total: 0, phaseId: phase?.id || null };
      }
      acc[phaseName].count++;
      acc[phaseName].total += r.withMargins;
      return acc;
    }, {} as Record<string, { count: number; total: number; phaseId: string | null }>);

    // Group by activity
    const byActivity = resourceDetails.reduce((acc, r) => {
      const activity = activities.find(a => a.id === r.activity_id);
      const activityName = activity ? `${activity.code}.-${activity.name}` : 'Sin actividad';
      
      if (!acc[activityName]) {
        acc[activityName] = { count: 0, total: 0, activityId: activity?.id || null };
      }
      acc[activityName].count++;
      acc[activityName].total += r.withMargins;
      return acc;
    }, {} as Record<string, { count: number; total: number; activityId: string | null }>);

    return {
      resources: resourceDetails,
      totalBaseCost,
      totalWithSafety,
      totalWithMargins,
      totalSafetyMargin: totalWithSafety - totalBaseCost,
      totalSalesMargin: totalWithMargins - totalWithSafety,
      byType,
      byPhase,
      byActivity,
      resourceCount: resources.length,
      activityCount: activities.length,
      phaseCount: phases.length,
    };
  }, [resources, activities, phases]);

  // Prepare chart data
  const typeChartData = useMemo(() => {
    return Object.entries(calculations.byType)
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        color: RESOURCE_TYPE_COLORS[name] || RESOURCE_TYPE_COLORS['Sin tipo'],
      }))
      .sort((a, b) => b.value - a.value);
  }, [calculations.byType]);

  const phaseChartData = useMemo(() => {
    return Object.entries(calculations.byPhase)
      .map(([name, data], index) => ({
        name: name.length > 25 ? name.substring(0, 25) + '...' : name,
        fullName: name,
        value: data.total,
        count: data.count,
        color: PHASE_COLORS[index % PHASE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [calculations.byPhase]);

  const topActivitiesData = useMemo(() => {
    return Object.entries(calculations.byActivity)
      .map(([name, data]) => ({
        name: name.length > 30 ? name.substring(0, 30) + '...' : name,
        fullName: name,
        value: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [calculations.byActivity]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{payload[0]?.payload?.fullName || label}</p>
          <p className="text-primary font-mono font-bold">{formatCurrency(payload[0]?.value || 0)}</p>
          {payload[0]?.payload?.count && (
            <p className="text-muted-foreground text-sm">{payload[0].payload.count} recursos</p>
          )}
        </div>
      );
    }
    return null;
  };

  const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (calculations.resourceCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Resumen del Presupuesto
          </CardTitle>
          <CardDescription>No hay recursos en este presupuesto todavía</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Añade recursos desde la pestaña "CÓMO hacer?" para ver el resumen visual</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with export button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Resumen Visual del Presupuesto</h3>
          <p className="text-sm text-muted-foreground">Distribución de costes y análisis</p>
        </div>
        <Button variant="outline" onClick={() => setSummaryOpen(true)} className="gap-2">
          <FileDown className="h-4 w-4" />
          Ver detalle y exportar PDF
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

        <Card className="bg-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ClipboardList className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{calculations.activityCount}</p>
                <p className="text-xs text-muted-foreground">Actividades</p>
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
                <p className="text-lg font-bold font-mono">{formatCurrency(calculations.totalBaseCost)}</p>
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
                <p className="text-lg font-bold font-mono">{formatCurrency(calculations.totalSafetyMargin + calculations.totalSalesMargin)}</p>
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
                <p className="text-lg font-bold font-mono">{formatCurrency(calculations.totalWithMargins)}</p>
                <p className="text-xs text-muted-foreground">Total PVP</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart - By Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Distribución por Tipo de Recurso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeChartData}
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
                    {typeChartData.map((entry, index) => (
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
              {typeChartData.map((type) => (
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

        {/* Bar Chart - By Phase */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Distribución por Fase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={phaseChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(value) => formatCurrency(value)}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={120}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {phaseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Activities */}
      {topActivitiesData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Top Actividades por Coste
            </CardTitle>
            <CardDescription>Las {topActivitiesData.length} actividades con mayor coste total</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topActivitiesData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 50 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10 }}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value)}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="value" 
                    fill="hsl(217, 91%, 60%)" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Coste Base Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{formatCurrency(calculations.totalBaseCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">Suma de costes externos × unidades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Margen de Seguridad</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono text-orange-600">{formatCurrency(calculations.totalSafetyMargin)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {calculations.totalBaseCost > 0 
                ? `${((calculations.totalSafetyMargin / calculations.totalBaseCost) * 100).toFixed(1)}% sobre coste base`
                : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Margen Comercial</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono text-blue-600">{formatCurrency(calculations.totalSalesMargin)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {calculations.totalWithSafety > 0 
                ? `${((calculations.totalSalesMargin / calculations.totalWithSafety) * 100).toFixed(1)}% sobre coste interno`
                : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Summary Dialog */}
      <BudgetSummary
        budgetId={budgetId}
        budgetName={budgetName}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
      />
    </div>
  );
}
