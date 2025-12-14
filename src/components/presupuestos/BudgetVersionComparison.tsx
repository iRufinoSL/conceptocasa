import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { 
  GitCompare, 
  ArrowUp, 
  ArrowDown, 
  Minus, 
  TrendingUp, 
  TrendingDown,
  Package,
  ClipboardList,
  Layers,
  Euro,
  AlertCircle,
  Plus,
  X
} from 'lucide-react';

interface BudgetVersion {
  id: string;
  nombre: string;
  version: string;
  codigo_correlativo: number;
  poblacion: string;
  created_at: string;
}

interface BudgetData {
  resources: any[];
  activities: any[];
  phases: any[];
  totalCost: number;
  resourcesByType: Record<string, { count: number; total: number }>;
  resourcesByPhase: Record<string, { count: number; total: number }>;
}

interface BudgetVersionComparisonProps {
  currentBudgetId: string;
  currentBudgetName: string;
  currentVersion: string;
}

export function BudgetVersionComparison({ 
  currentBudgetId, 
  currentBudgetName, 
  currentVersion 
}: BudgetVersionComparisonProps) {
  const [versions, setVersions] = useState<BudgetVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [currentData, setCurrentData] = useState<BudgetData | null>(null);
  const [compareData, setCompareData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Fetch available versions (same budget name)
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        // Get all budgets with the same name
        const { data, error } = await supabase
          .from('presupuestos')
          .select('id, nombre, version, codigo_correlativo, poblacion, created_at')
          .eq('nombre', currentBudgetName)
          .neq('id', currentBudgetId)
          .order('version', { ascending: false });

        if (error) throw error;
        setVersions(data || []);
      } catch (error) {
        console.error('Error fetching versions:', error);
      }
    };

    fetchVersions();
  }, [currentBudgetName, currentBudgetId]);

  // Fetch current budget data
  useEffect(() => {
    const fetchCurrentData = async () => {
      setLoading(true);
      try {
        const data = await fetchBudgetData(currentBudgetId);
        setCurrentData(data);
      } catch (error) {
        console.error('Error fetching current data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentData();
  }, [currentBudgetId]);

  // Fetch comparison budget data when selected
  useEffect(() => {
    if (!selectedVersionId) {
      setCompareData(null);
      return;
    }

    const fetchCompareData = async () => {
      setLoadingCompare(true);
      try {
        const data = await fetchBudgetData(selectedVersionId);
        setCompareData(data);
      } catch (error) {
        console.error('Error fetching compare data:', error);
      } finally {
        setLoadingCompare(false);
      }
    };

    fetchCompareData();
  }, [selectedVersionId]);

  const fetchBudgetData = async (budgetId: string): Promise<BudgetData> => {
    const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
      supabase
        .from('budget_activity_resources')
        .select('*')
        .eq('budget_id', budgetId),
      supabase
        .from('budget_activities')
        .select('id, code, name, phase_id')
        .eq('budget_id', budgetId),
      supabase
        .from('budget_phases')
        .select('id, code, name')
        .eq('budget_id', budgetId),
    ]);

    const resources = resourcesRes.data || [];
    const activities = activitiesRes.data || [];
    const phases = phasesRes.data || [];

    // Calculate totals
    let totalCost = 0;
    const resourcesByType: Record<string, { count: number; total: number }> = {};
    const resourcesByPhase: Record<string, { count: number; total: number }> = {};

    resources.forEach(resource => {
      const units = resource.manual_units !== null ? resource.manual_units : (resource.related_units || 0);
      const unitCost = resource.external_unit_cost || 0;
      const safetyPercent = resource.safety_margin_percent ?? 0.15;
      const salesPercent = resource.sales_margin_percent ?? 0.25;

      const baseCost = units * unitCost;
      const withSafety = baseCost * (1 + safetyPercent);
      const withMargins = withSafety * (1 + salesPercent);
      totalCost += withMargins;

      // By type
      const type = resource.resource_type || 'Sin tipo';
      if (!resourcesByType[type]) resourcesByType[type] = { count: 0, total: 0 };
      resourcesByType[type].count++;
      resourcesByType[type].total += withMargins;

      // By phase
      const activity = activities.find(a => a.id === resource.activity_id);
      const phase = activity?.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
      const phaseName = phase ? `${phase.code || ''} ${phase.name}`.trim() : 'Sin fase';
      if (!resourcesByPhase[phaseName]) resourcesByPhase[phaseName] = { count: 0, total: 0 };
      resourcesByPhase[phaseName].count++;
      resourcesByPhase[phaseName].total += withMargins;
    });

    return {
      resources,
      activities,
      phases,
      totalCost,
      resourcesByType,
      resourcesByPhase,
    };
  };

  const selectedVersion = versions.find(v => v.id === selectedVersionId);

  // Calculate differences
  const differences = useMemo(() => {
    if (!currentData || !compareData) return null;

    const costDiff = currentData.totalCost - compareData.totalCost;
    const costDiffPercent = compareData.totalCost !== 0 
      ? ((costDiff / compareData.totalCost) * 100) 
      : 0;

    const resourcesDiff = currentData.resources.length - compareData.resources.length;
    const activitiesDiff = currentData.activities.length - compareData.activities.length;
    const phasesDiff = currentData.phases.length - compareData.phases.length;

    // Find new, removed, and changed resources by name
    const currentNames = new Set(currentData.resources.map(r => r.name));
    const compareNames = new Set(compareData.resources.map(r => r.name));
    
    const newResources = currentData.resources.filter(r => !compareNames.has(r.name));
    const removedResources = compareData.resources.filter(r => !currentNames.has(r.name));
    
    // Changed resources (same name, different cost)
    const changedResources: Array<{ name: string; currentCost: number; previousCost: number; diff: number }> = [];
    currentData.resources.forEach(curr => {
      const prev = compareData.resources.find(r => r.name === curr.name);
      if (prev) {
        const currCost = (curr.external_unit_cost || 0) * (curr.manual_units ?? curr.related_units ?? 0);
        const prevCost = (prev.external_unit_cost || 0) * (prev.manual_units ?? prev.related_units ?? 0);
        if (Math.abs(currCost - prevCost) > 0.01) {
          changedResources.push({
            name: curr.name,
            currentCost: currCost,
            previousCost: prevCost,
            diff: currCost - prevCost,
          });
        }
      }
    });

    return {
      costDiff,
      costDiffPercent,
      resourcesDiff,
      activitiesDiff,
      phasesDiff,
      newResources,
      removedResources,
      changedResources: changedResources.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10),
    };
  }, [currentData, compareData]);

  const DiffBadge = ({ value, format = 'number' }: { value: number; format?: 'number' | 'currency' | 'percent' }) => {
    if (value === 0) return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" />Sin cambio</Badge>;
    
    const isPositive = value > 0;
    const formattedValue = format === 'currency' 
      ? formatCurrency(Math.abs(value))
      : format === 'percent'
        ? `${Math.abs(value).toFixed(1)}%`
        : Math.abs(value).toString();

    return (
      <Badge 
        variant={isPositive ? 'destructive' : 'default'}
        className={`gap-1 ${isPositive ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-green-500/10 text-green-600 border-green-500/20'}`}
      >
        {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {isPositive ? '+' : '-'}{formattedValue}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with version selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Comparar Versiones
          </CardTitle>
          <CardDescription>
            Compara la versión actual ({currentVersion}) con otras versiones del presupuesto
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                No hay otras versiones de este presupuesto disponibles para comparar.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Las versiones se crean cuando hay presupuestos con el mismo nombre pero diferente versión.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Comparar con versión:
                </label>
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Seleccionar versión para comparar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {versions.map(version => (
                      <SelectItem key={version.id} value={version.id}>
                        {version.version} - {version.poblacion} (Código: {version.codigo_correlativo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedVersionId && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedVersionId('')}
                  className="mt-6"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedVersionId && loadingCompare && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}

      {selectedVersionId && !loadingCompare && compareData && differences && (
        <>
          {/* Summary Comparison Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Euro className="h-5 w-5 text-primary" />
                  <DiffBadge value={differences.costDiff} format="currency" />
                </div>
                <p className="text-xs text-muted-foreground">Coste Total PVP</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold font-mono">{formatCurrency(currentData?.totalCost || 0)}</span>
                  <span className="text-xs text-muted-foreground">vs {formatCurrency(compareData.totalCost)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <DiffBadge value={differences.resourcesDiff} />
                </div>
                <p className="text-xs text-muted-foreground">Recursos</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold">{currentData?.resources.length}</span>
                  <span className="text-xs text-muted-foreground">vs {compareData.resources.length}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <ClipboardList className="h-5 w-5 text-purple-600" />
                  <DiffBadge value={differences.activitiesDiff} />
                </div>
                <p className="text-xs text-muted-foreground">Actividades</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold">{currentData?.activities.length}</span>
                  <span className="text-xs text-muted-foreground">vs {compareData.activities.length}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Layers className="h-5 w-5 text-orange-600" />
                  <DiffBadge value={differences.phasesDiff} />
                </div>
                <p className="text-xs text-muted-foreground">Fases</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold">{currentData?.phases.length}</span>
                  <span className="text-xs text-muted-foreground">vs {compareData.phases.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Difference Visual */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Diferencia de Coste</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{selectedVersion?.version}</span>
                    <span className="font-mono">{formatCurrency(compareData.totalCost)}</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-muted-foreground/30 rounded-full"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div className="text-2xl font-bold">
                  {differences.costDiff >= 0 ? (
                    <TrendingUp className="h-8 w-8 text-red-500" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-green-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{currentVersion} (actual)</span>
                    <span className="font-mono font-bold">{formatCurrency(currentData?.totalCost || 0)}</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${differences.costDiff >= 0 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ 
                        width: compareData.totalCost > 0 
                          ? `${Math.min(100, ((currentData?.totalCost || 0) / compareData.totalCost) * 100)}%`
                          : '100%'
                      }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-center mt-4 text-sm">
                {differences.costDiff >= 0 ? (
                  <span className="text-red-600">
                    Incremento del {Math.abs(differences.costDiffPercent).toFixed(1)}% ({formatCurrency(differences.costDiff)})
                  </span>
                ) : (
                  <span className="text-green-600">
                    Reducción del {Math.abs(differences.costDiffPercent).toFixed(1)}% ({formatCurrency(Math.abs(differences.costDiff))})
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* New and Removed Resources */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* New Resources */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-green-600">
                  <Plus className="h-4 w-4" />
                  Recursos Nuevos ({differences.newResources.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {differences.newResources.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">Sin recursos nuevos</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {differences.newResources.slice(0, 10).map(resource => (
                      <div key={resource.id} className="flex items-center justify-between text-sm bg-green-500/5 p-2 rounded">
                        <span>{resource.name}</span>
                        <Badge variant="outline" className="text-green-600">
                          {resource.resource_type || 'Sin tipo'}
                        </Badge>
                      </div>
                    ))}
                    {differences.newResources.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{differences.newResources.length - 10} más
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Removed Resources */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <X className="h-4 w-4" />
                  Recursos Eliminados ({differences.removedResources.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {differences.removedResources.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">Sin recursos eliminados</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {differences.removedResources.slice(0, 10).map(resource => (
                      <div key={resource.id} className="flex items-center justify-between text-sm bg-red-500/5 p-2 rounded">
                        <span className="line-through text-muted-foreground">{resource.name}</span>
                        <Badge variant="outline" className="text-red-600">
                          {resource.resource_type || 'Sin tipo'}
                        </Badge>
                      </div>
                    ))}
                    {differences.removedResources.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{differences.removedResources.length - 10} más
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Changed Resources */}
          {differences.changedResources.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recursos con Cambio de Coste</CardTitle>
                <CardDescription>Top 10 recursos con mayor variación</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recurso</TableHead>
                      <TableHead className="text-right">Coste Anterior</TableHead>
                      <TableHead className="text-right">Coste Actual</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {differences.changedResources.map((resource, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{resource.name}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatCurrency(resource.previousCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(resource.currentCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DiffBadge value={resource.diff} format="currency" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Type Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Comparación por Tipo de Recurso</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">{selectedVersion?.version}</TableHead>
                    <TableHead className="text-right">{currentVersion} (actual)</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.keys({ ...currentData?.resourcesByType, ...compareData.resourcesByType })
                    .sort()
                    .map(type => {
                      const current = currentData?.resourcesByType[type]?.total || 0;
                      const compare = compareData.resourcesByType[type]?.total || 0;
                      const diff = current - compare;
                      
                      return (
                        <TableRow key={type}>
                          <TableCell className="font-medium">{type}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(compare)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(current)}
                          </TableCell>
                          <TableCell className="text-right">
                            <DiffBadge value={diff} format="currency" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
