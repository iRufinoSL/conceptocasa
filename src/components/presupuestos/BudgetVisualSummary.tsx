import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { percentToRatio } from '@/lib/budget-pricing';
import { Calculator, TrendingUp, Percent, Euro, Package, Wrench, Truck, Briefcase, Layers, ClipboardList, FileDown, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap } from 'recharts';
import { BudgetSummary } from './BudgetSummary';
import { recalculateAllBudgetResources, syncActivityResourcesRelatedUnits } from '@/lib/budget-utils';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

// Valid resource types (exclude invalid types like "herramientas")
const VALID_RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos', 'Tarea'];

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  'Producto': 'hsl(217, 91%, 60%)',
  'Mano de obra': 'hsl(142, 76%, 36%)',
  'Alquiler': 'hsl(38, 92%, 50%)',
  'Servicio': 'hsl(346, 77%, 49%)',
  'Impuestos': 'hsl(280, 60%, 50%)',
  'Tarea': 'hsl(220, 9%, 46%)',
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
  const [recalculating, setRecalculating] = useState(false);
  const [orphanResourcesOpen, setOrphanResourcesOpen] = useState(false);
  const [assigningResourceId, setAssigningResourceId] = useState<string | null>(null);

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

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await recalculateAllBudgetResources(budgetId);
      if (result.errors > 0) {
        toast.warning(`Recálculo completado con ${result.errors} errores`);
      } else {
        toast.success(`Presupuesto recalculado correctamente (${result.updated} actividades)`);
      }
      // Refresh the data after recalculation
      await fetchData();
    } catch (error) {
      console.error('Error recalculating budget:', error);
      toast.error('Error al recalcular el presupuesto');
    } finally {
      setRecalculating(false);
    }
  };

  const assignActivityToResource = async (resourceId: string, activityId: string) => {
    setAssigningResourceId(resourceId);
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ activity_id: activityId })
        .eq('id', resourceId);
      
      if (error) throw error;
      
      // Sync related_units for the assigned activity
      await syncActivityResourcesRelatedUnits(activityId);
      
      toast.success('Actividad asignada correctamente');
      await fetchData();
    } catch (error) {
      console.error('Error assigning activity:', error);
      toast.error('Error al asignar la actividad');
    } finally {
      setAssigningResourceId(null);
    }
  };

  const calculations = useMemo(() => {
    let totalBaseCost = 0;
    let totalWithSafety = 0;
    let totalWithMargins = 0;

    const resourceDetails = resources.map(resource => {
      const units = resource.manual_units !== null ? resource.manual_units : (resource.related_units || 0);
      const unitCost = resource.external_unit_cost || 0;

      const safetyRatio = percentToRatio(resource.safety_margin_percent, 0.15);
      const salesRatio = percentToRatio(resource.sales_margin_percent, 0.25);

      const baseCost = units * unitCost;
      const withSafety = baseCost * (1 + safetyRatio);
      const withMargins = withSafety * (1 + salesRatio);

      totalBaseCost += baseCost;
      totalWithSafety += withSafety;
      totalWithMargins += withMargins;

      return {
        ...resource,
        units,
        unitCost,
        safetyPercent: safetyRatio * 100,
        salesPercent: salesRatio * 100,
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

  // Diagnóstico de descuadres
  const diagnostics = useMemo(() => {
    // 1. Recursos sin actividad
    const resourcesWithoutActivity = calculations.resources.filter(r => !r.activity_id);
    const resourcesWithoutActivityTotal = resourcesWithoutActivity.reduce((sum, r) => sum + r.withMargins, 0);

    // 2. Actividades sin fase
    const activitiesWithoutPhase = activities.filter(a => !a.phase_id);
    const activitiesWithoutPhaseIds = new Set(activitiesWithoutPhase.map(a => a.id));
    const activitiesWithoutPhaseTotal = calculations.resources
      .filter(r => r.activity_id && activitiesWithoutPhaseIds.has(r.activity_id))
      .reduce((sum, r) => sum + r.withMargins, 0);

    // 3. Top 10 actividades con mayor importe (para detectar dónde está el grueso)
    const activityTotals = activities.map(activity => {
      const activityResources = calculations.resources.filter(r => r.activity_id === activity.id);
      const total = activityResources.reduce((sum, r) => sum + r.withMargins, 0);
      const resourceCount = activityResources.length;
      const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
      return {
        id: activity.id,
        code: activity.code,
        name: activity.name,
        phaseName: phase ? `${phase.code || ''} ${phase.name}`.trim() : 'Sin fase',
        total,
        resourceCount,
      };
    }).sort((a, b) => b.total - a.total).slice(0, 10);

    // List of orphan resources with details
    const orphanResourcesList = resourcesWithoutActivity.map(r => ({
      id: r.id,
      name: r.name,
      resourceType: r.resource_type || 'Sin tipo',
      subtotal: r.withMargins,
    })).sort((a, b) => b.subtotal - a.subtotal);

    return {
      resourcesWithoutActivity: resourcesWithoutActivity.length,
      resourcesWithoutActivityTotal,
      orphanResourcesList,
      activitiesWithoutPhase: activitiesWithoutPhase.length,
      activitiesWithoutPhaseTotal,
      topActivities: activityTotals,
      hasIssues: resourcesWithoutActivity.length > 0 || activitiesWithoutPhase.length > 0,
    };
  }, [calculations, activities, phases]);

  // Prepare chart data - only include valid resource types
  const typeChartData = useMemo(() => {
    return Object.entries(calculations.byType)
      .filter(([name]) => {
        // Only include valid types (exclude invalid ones like "herramientas")
        return name === 'Sin tipo' || VALID_RESOURCE_TYPES.includes(name);
      })
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        color: RESOURCE_TYPE_COLORS[name] || RESOURCE_TYPE_COLORS['Sin tipo'],
      }))
      .filter(item => item.value > 0)
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
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRecalculate} 
            disabled={recalculating}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculando...' : 'Recalcular Presupuesto'}
          </Button>
          <Button variant="outline" onClick={() => setSummaryOpen(true)} className="gap-2">
            <FileDown className="h-4 w-4" />
            Ver detalle y exportar PDF
          </Button>
        </div>
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

      {/* Diagnóstico de descuadres */}
      <Card className={diagnostics.hasIssues ? 'border-amber-500/50 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5'}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {diagnostics.hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            Diagnóstico de Descuadres
          </CardTitle>
          <CardDescription>
            {diagnostics.hasIssues 
              ? 'Se han detectado elementos que pueden causar diferencias entre subtotales'
              : 'Todos los recursos están asignados correctamente'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recursos sin actividad */}
          <Collapsible open={orphanResourcesOpen} onOpenChange={setOrphanResourcesOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background border cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Package className={`h-5 w-5 ${diagnostics.resourcesWithoutActivity > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="font-medium">Recursos sin actividad</p>
                    <p className="text-xs text-muted-foreground">No suman en el subtotal de Actividades ni Fases</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Badge variant={diagnostics.resourcesWithoutActivity > 0 ? 'destructive' : 'secondary'}>
                      {diagnostics.resourcesWithoutActivity}
                    </Badge>
                    {diagnostics.resourcesWithoutActivityTotal > 0 && (
                      <p className="text-xs text-amber-600 font-mono mt-1">
                        {formatCurrency(diagnostics.resourcesWithoutActivityTotal)}
                      </p>
                    )}
                  </div>
                  {diagnostics.resourcesWithoutActivity > 0 && (
                    orphanResourcesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {diagnostics.orphanResourcesList.length > 0 && (
                <div className="mt-2 ml-8 space-y-2 max-h-80 overflow-y-auto">
                  {diagnostics.orphanResourcesList.map(resource => (
                    <div key={resource.id} className="flex items-center justify-between p-2 rounded border bg-muted/30 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={resource.name}>{resource.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{resource.resourceType}</span>
                          <span className="font-mono">{formatCurrency(resource.subtotal)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          onValueChange={(activityId) => assignActivityToResource(resource.id, activityId)}
                          disabled={assigningResourceId === resource.id}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Asignar actividad..." />
                          </SelectTrigger>
                          <SelectContent>
                            {activities.map(activity => {
                              const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
                              return (
                                <SelectItem key={activity.id} value={activity.id} className="text-xs">
                                  <span className="font-mono mr-1">{activity.code}.-</span>
                                  {activity.name.length > 25 ? activity.name.substring(0, 25) + '...' : activity.name}
                                  {phase && <span className="text-muted-foreground ml-1">({phase.code || phase.name})</span>}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {assigningResourceId === resource.id && (
                          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Actividades sin fase */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
            <div className="flex items-center gap-3">
              <ClipboardList className={`h-5 w-5 ${diagnostics.activitiesWithoutPhase > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium">Actividades sin fase</p>
                <p className="text-xs text-muted-foreground">No suman en el subtotal de Fases</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={diagnostics.activitiesWithoutPhase > 0 ? 'destructive' : 'secondary'}>
                {diagnostics.activitiesWithoutPhase}
              </Badge>
              {diagnostics.activitiesWithoutPhaseTotal > 0 && (
                <p className="text-xs text-amber-600 font-mono mt-1">
                  {formatCurrency(diagnostics.activitiesWithoutPhaseTotal)}
                </p>
              )}
            </div>
          </div>

          {/* Top 10 actividades */}
          {diagnostics.topActivities.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Top 10 Actividades por importe
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Actividad</th>
                      <th className="text-left p-2 font-medium">Fase</th>
                      <th className="text-right p-2 font-medium">Recursos</th>
                      <th className="text-right p-2 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.topActivities.map((activity, idx) => (
                      <tr key={activity.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="p-2">
                          <span className="font-mono text-xs text-muted-foreground">{activity.code}.-</span>{' '}
                          <span className="truncate" title={activity.name}>
                            {activity.name.length > 30 ? activity.name.substring(0, 30) + '...' : activity.name}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground text-xs">
                          {activity.phaseName === 'Sin fase' ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-600/50">Sin fase</Badge>
                          ) : (
                            activity.phaseName
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">{activity.resourceCount}</td>
                        <td className="p-2 text-right font-mono font-semibold">{formatCurrency(activity.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
