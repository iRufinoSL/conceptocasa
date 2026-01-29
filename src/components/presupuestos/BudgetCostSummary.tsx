import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Home, Euro, TrendingUp, Building2, Package, LayoutGrid, FileText, FileSignature, Loader2, Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatNumber, formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllAvailableOptions, getDisplayOptions, OPTION_COLORS } from '@/lib/options-utils';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface BudgetCostSummaryProps {
  budgetId: string;
  budgetName: string;
  budgetCode: number;
  budgetVersion: string;
  budgetLocation: string;
  budgetProvince: string | null;
  comparativaOpciones: string | null;
  onComparativaOpcionesChange?: (value: string) => void;
  isAdmin: boolean;
  isSigned?: boolean;
  onSignedChange?: (signed: boolean) => Promise<void>;
  optionADescription?: string | null;
  optionBDescription?: string | null;
  optionCDescription?: string | null;
  onOptionDescriptionChange?: (option: string, value: string) => Promise<void>;
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
  opciones: string[];
}

// Valid resource types (exclude invalid types like "herramientas")
const VALID_RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const IMPUESTOS_TYPE = 'Impuestos';

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  'Producto': 'hsl(217, 91%, 60%)',
  'Mano de obra': 'hsl(142, 76%, 36%)',
  'Alquiler': 'hsl(38, 92%, 50%)',
  'Servicio': 'hsl(346, 77%, 49%)',
  'Sin tipo': 'hsl(220, 9%, 46%)',
};

export function BudgetCostSummary({
  budgetId,
  budgetName,
  budgetCode,
  budgetVersion,
  budgetLocation,
  budgetProvince,
  comparativaOpciones,
  onComparativaOpcionesChange,
  isAdmin,
  isSigned = false,
  onSignedChange,
  optionADescription,
  optionBDescription,
  optionCDescription,
  onOptionDescriptionChange
}: BudgetCostSummaryProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [confirmSignOpen, setConfirmSignOpen] = useState(false);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [savingDescription, setSavingDescription] = useState<string | null>(null);
  const [savedDescription, setSavedDescription] = useState<string | null>(null);
  const [descriptionValues, setDescriptionValues] = useState({
    A: optionADescription || '',
    B: optionBDescription || '',
    C: optionCDescription || ''
  });
  
  // Track the last saved values to avoid unnecessary saves
  const lastSavedRef = useRef({
    A: optionADescription || '',
    B: optionBDescription || '',
    C: optionCDescription || ''
  });
  
  // Debounce timers for each option
  const saveTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Sync description values when props change (from external source)
  useEffect(() => {
    setDescriptionValues({
      A: optionADescription || '',
      B: optionBDescription || '',
      C: optionCDescription || ''
    });
    lastSavedRef.current = {
      A: optionADescription || '',
      B: optionBDescription || '',
      C: optionCDescription || ''
    };
  }, [optionADescription, optionBDescription, optionCDescription]);

  const getOptionDescription = (option: string) => {
    return descriptionValues[option as 'A' | 'B' | 'C'] || '';
  };

  // Auto-save description with debounce
  const saveDescription = useCallback(async (option: string, value: string) => {
    if (onOptionDescriptionChange && value !== lastSavedRef.current[option as 'A' | 'B' | 'C']) {
      setSavingDescription(option);
      setSavedDescription(null);
      try {
        await onOptionDescriptionChange(option, value);
        lastSavedRef.current[option as 'A' | 'B' | 'C'] = value;
        setSavedDescription(option);
        // Clear the saved indicator after 2 seconds
        setTimeout(() => setSavedDescription(prev => prev === option ? null : prev), 2000);
      } catch (err) {
        console.error('Error saving description:', err);
      } finally {
        setSavingDescription(null);
      }
    }
  }, [onOptionDescriptionChange]);

  const handleDescriptionChange = (option: string, value: string) => {
    setDescriptionValues(prev => ({ ...prev, [option]: value }));
    
    // Clear existing timer for this option
    if (saveTimersRef.current[option]) {
      clearTimeout(saveTimersRef.current[option]);
    }
    
    // Set new debounce timer (800ms)
    saveTimersRef.current[option] = setTimeout(() => {
      saveDescription(option, value);
    }, 800);
  };

  const handleDescriptionBlur = async (option: string) => {
    setEditingDescription(null);
    
    // Clear any pending debounce timer and save immediately
    if (saveTimersRef.current[option]) {
      clearTimeout(saveTimersRef.current[option]);
      delete saveTimersRef.current[option];
    }
    
    const value = descriptionValues[option as 'A' | 'B' | 'C'];
    await saveDescription(option, value);
  };
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

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
            .select('id, m2_built, m2_livable, opciones')
            .eq('budget_id', budgetId)
        ]);

        if (resourcesRes.error) throw resourcesRes.error;
        if (spacesRes.error) throw spacesRes.error;

        // Map resources with their activity opciones
        // IMPORTANT: if opciones is empty/undefined, treat as "A+B+C" to keep totals consistent across views.
        const mappedResources: Resource[] = (resourcesRes.data || []).map((r: any) => ({
          id: r.id,
          external_unit_cost: r.external_unit_cost,
          manual_units: r.manual_units,
          related_units: r.related_units,
          safety_margin_percent: r.safety_margin_percent,
          sales_margin_percent: r.sales_margin_percent,
          resource_type: r.resource_type,
          activity_opciones: r.budget_activities?.opciones?.length ? r.budget_activities.opciones : ['A', 'B', 'C'],
        }));

        // Map spaces with their opciones
        const mappedSpaces: Space[] = (spacesRes.data || []).map((s: any) => ({
          id: s.id,
          m2_built: s.m2_built,
          m2_livable: s.m2_livable,
          opciones: s.opciones?.length ? s.opciones : ['A', 'B', 'C'],
        }));

        setResources(mappedResources);
        setSpaces(mappedSpaces);
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

  // Calculate total m2 (general - for display)
  const totalM2Built = spaces.reduce((sum, space) => sum + (space.m2_built || 0), 0);
  const totalM2Livable = spaces.reduce((sum, space) => sum + (space.m2_livable || 0), 0);

  // Determine available options - always includes A, sorted A first
  const availableOptions = useMemo(() => {
    // Collect all unique options from spaces and resources
    const allOptions = new Set<string>();
    spaces.forEach(s => {
      const opts = s.opciones?.length ? s.opciones : ['A', 'B', 'C'];
      opts.forEach(opt => allOptions.add(opt));
    });
    resources.forEach(r => {
      const opts = r.activity_opciones?.length ? r.activity_opciones : ['A', 'B', 'C'];
      opts.forEach(opt => allOptions.add(opt));
    });
    
    // If no options found, default to A
    if (allOptions.size === 0) {
      return ['A'];
    }
    
    // Sort to ensure A is always first
    return Array.from(allOptions).sort((a, b) => {
      const order: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2 };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });
  }, [spaces, resources]);

  // Calculate m2 per option
  const m2ByOption = useMemo(() => {
    const result: Record<string, { m2_built: number; m2_livable: number }> = {};
    availableOptions.forEach(option => {
      const optionSpaces = spaces.filter(s => s.opciones?.includes(option));
      result[option] = optionSpaces.reduce(
        (acc, space) => ({
          m2_built: acc.m2_built + (space.m2_built || 0),
          m2_livable: acc.m2_livable + (space.m2_livable || 0),
        }),
        { m2_built: 0, m2_livable: 0 }
      );
    });
    return result;
  }, [spaces, availableOptions]);

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

  // Calculate metrics for a given set of resources and m2 values
  const calculateMetrics = (resourceList: Resource[], optionM2: { m2_built: number; m2_livable: number }) => {
    const subtotalResources = resourceList.reduce((sum, resource) => sum + getResourceSubtotal(resource), 0);
    
    const subtotalGastosConstruccion = resourceList.reduce((sum, resource) => {
      if (resource.resource_type === IMPUESTOS_TYPE) return sum;
      return sum + getResourceSubtotal(resource);
    }, 0);

    const { m2_built, m2_livable } = optionM2;
    const costPerM2Built = m2_built > 0 ? subtotalResources / m2_built : 0;
    const costPerM2Livable = m2_livable > 0 ? subtotalResources / m2_livable : 0;
    const costPerM2BuiltGastos = m2_built > 0 ? subtotalGastosConstruccion / m2_built : 0;
    const costPerM2LivableGastos = m2_livable > 0 ? subtotalGastosConstruccion / m2_livable : 0;

    return {
      subtotalResources,
      subtotalGastosConstruccion,
      costPerM2Built,
      costPerM2Livable,
      costPerM2BuiltGastos,
      costPerM2LivableGastos,
      resourceCount: resourceList.length,
      m2_built,
      m2_livable
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

  // Calculate metrics for each option using option-specific m2
  const optionMetrics = useMemo(() => {
    const result: Record<string, ReturnType<typeof calculateMetrics> & { chartData: ReturnType<typeof calculateChartData> }> = {};
    availableOptions.forEach(option => {
      const filteredResources = filterResourcesByOption(option);
      const optionM2 = m2ByOption[option] || { m2_built: 0, m2_livable: 0 };
      result[option] = {
        ...calculateMetrics(filteredResources, optionM2),
        chartData: calculateChartData(filteredResources)
      };
    });
    return result;
  }, [resources, spaces, m2ByOption, availableOptions]);

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

          {/* Total m2 Construidos for this Option */}
          <Card className={`bg-gradient-to-br ${colors.from} ${colors.to} ${colors.border}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${colors.from.replace('from-', 'bg-').replace('/10', '/20')}`}>
                  <Home className={`h-5 w-5 ${colors.text}`} />
                </div>
                <span className="text-sm text-muted-foreground">m² Construidos (Opción {option})</span>
              </div>
              <div className={`text-3xl font-bold ${colors.text}`}>
                {formatNumber(metrics.m2_built)} m²
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Espacios asignados a opción {option}
              </p>
            </CardContent>
          </Card>

          {/* Total m2 Habitables for this Option */}
          <Card className={`bg-gradient-to-br ${colors.from} ${colors.to} ${colors.border}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${colors.from.replace('from-', 'bg-').replace('/10', '/20')}`}>
                  <Home className={`h-5 w-5 ${colors.text}`} />
                </div>
                <span className="text-sm text-muted-foreground">m² Habitables (Opción {option})</span>
              </div>
              <div className={`text-3xl font-bold ${colors.text}`}>
                {formatNumber(metrics.m2_livable)} m²
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Espacios asignados a opción {option}
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
                <span className="text-sm font-medium">€ Coste por m² Construido (Opción {option})</span>
              </div>
              <div className={`text-4xl font-bold ${colors.text}`}>
                {formatCurrency(metrics.costPerM2Built)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalResources)} ÷ {formatNumber(metrics.m2_built)} m²
              </p>
              {metrics.m2_built === 0 && (
                <p className={`text-xs ${colors.text} mt-2`}>
                  ⚠️ Añade espacios con opción {option} para calcular
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost per m2 Livable Total */}
          <Card className={`bg-gradient-to-br ${colors.from} ${colors.to} ${colors.border}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${colors.from.replace('from-', 'bg-').replace('/10', '/20')}`}>
                  <TrendingUp className={`h-5 w-5 ${colors.text}`} />
                </div>
                <span className="text-sm font-medium">€ Coste por m² Habitable (Opción {option})</span>
              </div>
              <div className={`text-4xl font-bold ${colors.text}`}>
                {formatCurrency(metrics.costPerM2Livable)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalResources)} ÷ {formatNumber(metrics.m2_livable)} m²
              </p>
              {metrics.m2_livable === 0 && (
                <p className={`text-xs ${colors.text} mt-2`}>
                  ⚠️ Añade espacios con opción {option} para calcular
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
                <span className="text-sm font-medium">€ Gastos Construcción / m² Construido (Opción {option})</span>
              </div>
              <div className="text-4xl font-bold text-blue-600">
                {formatCurrency(metrics.costPerM2BuiltGastos)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalGastosConstruccion)} ÷ {formatNumber(metrics.m2_built)} m²
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
                <span className="text-sm font-medium">€ Gastos Construcción / m² Habitable (Opción {option})</span>
              </div>
              <div className="text-4xl font-bold text-violet-600">
                {formatCurrency(metrics.costPerM2LivableGastos)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(metrics.subtotalGastosConstruccion)} ÷ {formatNumber(metrics.m2_livable)} m²
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
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
            
            {/* Signed Status */}
            {isAdmin && onSignedChange && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="budget-signed" className="flex items-center gap-2 text-sm font-medium">
                    <FileSignature className="h-4 w-4" />
                    Presupuesto Firmado
                  </Label>
                  <div className="flex items-center gap-3">
                    {isSigned && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                        Firmado
                      </Badge>
                    )}
                    <Switch
                      id="budget-signed"
                      checked={isSigned}
                      onCheckedChange={(checked) => {
                        if (checked && !isSigned) {
                          setConfirmSignOpen(true);
                        }
                      }}
                      disabled={isSigned || signingInProgress}
                    />
                    {signingInProgress && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {isSigned 
                    ? 'El presupuesto ha sido firmado. Los SubTotales firmados han quedado registrados y no se pueden modificar.'
                    : 'Al marcar como firmado, se registrará el SubTotal actual de cada recurso como "SubTotal Firmado" de forma inmutable.'}
                </p>
              </div>
            )}
            
            {/* Comparativa Opciones Field */}
            <div className="mt-4 pt-4 border-t">
              <Label htmlFor="comparativa-opciones" className="flex items-center gap-2 text-sm font-medium mb-2">
                <FileText className="h-4 w-4" />
                Comparativa Opciones
              </Label>
              {isAdmin ? (
                <Textarea
                  id="comparativa-opciones"
                  placeholder="Descripción comparativa de las opciones A, B, C..."
                  value={comparativaOpciones || ''}
                  onChange={(e) => onComparativaOpcionesChange?.(e.target.value)}
                  className="min-h-[80px]"
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {comparativaOpciones || 'Sin descripción comparativa'}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Tabs for Options A, B, C and Comparison */}
          <Tabs defaultValue="A" className="w-full">
            <TabsList className={`grid w-full mb-6`} style={{ gridTemplateColumns: `repeat(${availableOptions.length + 1}, minmax(0, 1fr))` }}>
              <TabsTrigger value="comparativa" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Comparativa
              </TabsTrigger>
              {availableOptions.map(option => (
                <TabsTrigger key={option} value={option} className="flex items-center gap-2">
                  <Badge variant="outline" className={`${OPTION_COLORS[option]?.bg || 'bg-gray-500'}/20 ${OPTION_COLORS[option]?.text || 'text-gray-600'} ${OPTION_COLORS[option]?.border || 'border-gray-500/30'}`}>{option}</Badge>
                  Opción {option}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Comparison View */}
            <TabsContent value="comparativa">
              <div className="space-y-6">
                {/* Comparison Header */}
                <div className="gap-4" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="font-medium text-muted-foreground flex items-center">Métrica</div>
                  {availableOptions.map(option => (
                    <div key={option} className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`${OPTION_COLORS[option]?.text || 'text-gray-600'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'} bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} px-4 py-1`}
                      >
                        Opción {option}
                      </Badge>
                    </div>
                  ))}
                </div>

                {/* Descripción de cada opción */}
                <div className="gap-4 items-start" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium pt-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Descripción
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-3 px-3 relative">
                        {isAdmin ? (
                          <>
                            <Textarea
                              value={descriptionValues[option as 'A' | 'B' | 'C']}
                              onChange={(e) => handleDescriptionChange(option, e.target.value)}
                              onBlur={() => handleDescriptionBlur(option)}
                              placeholder={`¿Qué caracteriza la Opción ${option}?`}
                              className="min-h-[80px] text-sm resize-none border-0 focus:ring-1 text-foreground placeholder:text-muted-foreground/60 bg-white/50 dark:bg-black/20 font-sans"
                              style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
                            />
                            {/* Save status indicator */}
                            <div className="absolute bottom-1 right-1 text-xs">
                              {savingDescription === option && (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Guardando...
                                </span>
                              )}
                              {savedDescription === option && (
                                <span className="text-green-600 flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  Guardado
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className={`text-sm whitespace-pre-wrap ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                            {getOptionDescription(option) || <span className="italic text-muted-foreground">Sin descripción</span>}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                {/* m² Construidos por Opción */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    m² Construidos
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatNumber(optionMetrics[option]?.m2_built || 0)} m²
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* m² Habitables por Opción */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    m² Habitables
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatNumber(optionMetrics[option]?.m2_livable || 0)} m²
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                {/* Subtotal Recursos */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calculator className="h-4 w-4 text-primary" />
                    Subtotal Recursos
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatCurrency(optionMetrics[option]?.subtotalResources || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">{optionMetrics[option]?.resourceCount || 0} recursos</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* € Coste por m² Construido Total */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-amber-600" />
                    € / m² Construido Total
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatCurrency(optionMetrics[option]?.costPerM2Built || 0)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* € Coste por m² Habitable Total */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    € / m² Habitable Total
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatCurrency(optionMetrics[option]?.costPerM2Livable || 0)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* € Coste por m² Gastos Construcción */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    € / m² Gastos Construcción
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatCurrency(optionMetrics[option]?.costPerM2BuiltGastos || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Excluye Impuestos</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* € Coste por m² Habitable Gastos Construcción */}
                <div className="gap-4 items-center" style={{ display: 'grid', gridTemplateColumns: `200px repeat(${availableOptions.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-violet-600" />
                    € / m² Hab. Gastos Const.
                  </div>
                  {availableOptions.map(option => (
                    <Card key={option} className={`bg-gradient-to-br ${OPTION_COLORS[option]?.from || 'from-gray-500/10'} ${OPTION_COLORS[option]?.to || 'to-gray-500/10'} ${OPTION_COLORS[option]?.border || 'border-gray-500/20'}`}>
                      <CardContent className="py-4 text-center">
                        <div className={`text-2xl font-bold ${OPTION_COLORS[option]?.text || 'text-gray-600'}`}>
                          {formatCurrency(optionMetrics[option]?.costPerM2LivableGastos || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Excluye Impuestos</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                {/* Charts Side by Side */}
                <div className={`grid grid-cols-1 gap-6`} style={{ gridTemplateColumns: `repeat(${Math.min(availableOptions.length, 3)}, 1fr)` }}>
                  {availableOptions.map(option => (
                    <Card key={option}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Distribución Opción {option}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {optionMetrics[option]?.chartData?.length > 0 ? (
                          <>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={optionMetrics[option].chartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={CustomPieLabel}
                                    outerRadius={70}
                                    innerRadius={30}
                                    dataKey="value"
                                    strokeWidth={2}
                                    stroke="hsl(var(--background))"
                                  >
                                    {optionMetrics[option].chartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                              {optionMetrics[option].chartData.map((type) => (
                                <Badge 
                                  key={type.name} 
                                  variant="outline" 
                                  className="text-[10px] py-0.5 px-1.5"
                                  style={{ borderColor: type.color, color: type.color }}
                                >
                                  {type.name}: {formatCurrency(type.value)}
                                </Badge>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                            Sin recursos
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Difference Summary - only show if we have multiple options */}
                {availableOptions.length >= 2 && (
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Diferencia entre opciones</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4 justify-center text-center">
                        {availableOptions.length >= 2 && availableOptions.includes('A') && availableOptions.includes('B') && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">A vs B</p>
                            <p className={`font-bold ${(optionMetrics['A']?.subtotalResources || 0) > (optionMetrics['B']?.subtotalResources || 0) ? 'text-red-500' : 'text-emerald-500'}`}>
                              {formatCurrency(Math.abs((optionMetrics['A']?.subtotalResources || 0) - (optionMetrics['B']?.subtotalResources || 0)))}
                            </p>
                          </div>
                        )}
                        {availableOptions.includes('B') && availableOptions.includes('C') && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">B vs C</p>
                            <p className={`font-bold ${(optionMetrics['B']?.subtotalResources || 0) > (optionMetrics['C']?.subtotalResources || 0) ? 'text-red-500' : 'text-emerald-500'}`}>
                              {formatCurrency(Math.abs((optionMetrics['B']?.subtotalResources || 0) - (optionMetrics['C']?.subtotalResources || 0)))}
                            </p>
                          </div>
                        )}
                        {availableOptions.includes('A') && availableOptions.includes('C') && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">A vs C</p>
                            <p className={`font-bold ${(optionMetrics['A']?.subtotalResources || 0) > (optionMetrics['C']?.subtotalResources || 0) ? 'text-red-500' : 'text-emerald-500'}`}>
                              {formatCurrency(Math.abs((optionMetrics['A']?.subtotalResources || 0) - (optionMetrics['C']?.subtotalResources || 0)))}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {availableOptions.map(option => (
              <TabsContent key={option} value={option}>
                {optionMetrics[option] && renderMetricsSection(option, optionMetrics[option])}
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

      {/* Confirmation Dialog for Signing */}
      <AlertDialog open={confirmSignOpen} onOpenChange={setConfirmSignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Confirmar firma del presupuesto
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Al firmar el presupuesto, se registrará el <strong>SubTotal Venta</strong> actual de cada recurso 
                como <strong>"SubTotal Firmado"</strong>.
              </p>
              <p className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ Esta acción es irreversible. Los SubTotales Firmados no podrán modificarse posteriormente.
              </p>
              <p>
                Esto permite comparar los costes presupuestados originalmente con los costes finalmente ejecutados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingInProgress}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={signingInProgress}
              onClick={async (e) => {
                e.preventDefault();
                if (!onSignedChange) return;
                
                setSigningInProgress(true);
                try {
                  await onSignedChange(true);
                  setConfirmSignOpen(false);
                  toast.success('Presupuesto firmado correctamente');
                } catch (error) {
                  console.error('Error signing budget:', error);
                  toast.error('Error al firmar el presupuesto');
                } finally {
                  setSigningInProgress(false);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {signingInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Firmando...
                </>
              ) : (
                'Confirmar firma'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
