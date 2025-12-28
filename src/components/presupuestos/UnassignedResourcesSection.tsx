import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Trash2, Check, X, Package, Wrench, Truck, Briefcase } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getActivityMeasurementUnits } from '@/lib/budget-utils';

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
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
  opciones: string[];
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface UnassignedResourcesSectionProps {
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  isAdmin: boolean;
  onEdit: (resource: BudgetResource) => void;
  onDelete: (resource: BudgetResource) => void;
  onRefresh: () => void;
  calculateFields: (resource: BudgetResource) => {
    safetyMarginUd: number;
    internalCostUd: number;
    salesMarginUd: number;
    salesCostUd: number;
    calculatedUnits: number;
    subtotalSales: number;
  };
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
};

const resourceTypeVariants: Record<string, string> = {
  'Producto': 'default',
  'Mano de obra': 'secondary',
  'Alquiler': 'outline',
  'Servicio': 'destructive',
};

export function UnassignedResourcesSection({
  resources,
  activities,
  phases,
  isAdmin,
  onEdit,
  onDelete,
  onRefresh,
  calculateFields,
}: UnassignedResourcesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter resources without activity
  const unassignedResources = useMemo(() => {
    return resources.filter(r => !r.activity_id);
  }, [resources]);

  // Calculate total for unassigned resources
  const totalUnassigned = useMemo(() => {
    return unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
  }, [unassignedResources, calculateFields]);

  // Get activity display name
  const getActivityDisplay = (activityId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '';
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    return `${phase?.code || ''} ${activity.code}.-${activity.name}`;
  };

  // Assign activity to resource
  const handleAssignActivity = async (resourceId: string) => {
    if (!selectedActivityId) {
      toast.error('Selecciona una actividad');
      return;
    }

    setIsUpdating(true);
    try {
      // Get related_units from the activity's measurement
      const relatedUnits = await getActivityMeasurementUnits(selectedActivityId);

      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ 
          activity_id: selectedActivityId,
          related_units: relatedUnits 
        })
        .eq('id', resourceId);

      if (error) throw error;

      toast.success('Actividad asignada correctamente');
      setAssigningId(null);
      setSelectedActivityId('');
      onRefresh();
    } catch (error) {
      console.error('Error assigning activity:', error);
      toast.error('Error al asignar la actividad');
    } finally {
      setIsUpdating(false);
    }
  };

  // Cancel assignment
  const handleCancelAssign = () => {
    setAssigningId(null);
    setSelectedActivityId('');
  };

  if (unassignedResources.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="h-5 w-5 text-amber-600" />
            ) : (
              <ChevronRight className="h-5 w-5 text-amber-600" />
            )}
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                Recursos sin actividad asignada
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {unassignedResources.length} recurso{unassignedResources.length !== 1 ? 's' : ''} pendiente{unassignedResources.length !== 1 ? 's' : ''} de asignar
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-amber-800 dark:text-amber-200">
              {formatCurrency(totalUnassigned)}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">SubTotal sin asignar</p>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-amber-50/50 dark:bg-amber-950/20">
                <TableHead>Recurso</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ud</TableHead>
                <TableHead className="text-right">€Coste venta</TableHead>
                <TableHead className="text-right">Uds</TableHead>
                <TableHead className="text-right">€SubTotal</TableHead>
                <TableHead className="min-w-[300px]">Asignar a actividad</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {unassignedResources.map((resource) => {
                const fields = calculateFields(resource);
                const isAssigning = assigningId === resource.id;

                return (
                  <TableRow key={resource.id}>
                    <TableCell className="font-medium">{resource.name}</TableCell>
                    <TableCell>
                      {resource.resource_type && (
                        <Badge variant={resourceTypeVariants[resource.resource_type] as any || 'secondary'}>
                          {resourceTypeIcons[resource.resource_type]}
                          <span className="ml-1">{resource.resource_type}</span>
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{resource.unit || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(fields.salesCostUd)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(fields.calculatedUnits)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">
                      {formatCurrency(fields.subtotalSales)}
                    </TableCell>
                    <TableCell>
                      {isAssigning ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedActivityId}
                            onValueChange={setSelectedActivityId}
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder="Seleccionar actividad..." />
                            </SelectTrigger>
                            <SelectContent>
                              {activities.map((activity) => (
                                <SelectItem key={activity.id} value={activity.id}>
                                  {getActivityDisplay(activity.id)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                            onClick={() => handleAssignActivity(resource.id)}
                            disabled={isUpdating || !selectedActivityId}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                            onClick={handleCancelAssign}
                            disabled={isUpdating}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAssigningId(resource.id)}
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          Asignar actividad
                        </Button>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(resource)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(resource)}
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
      </CollapsibleContent>
    </Collapsible>
  );
}
