import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Upload, Pencil, Trash2, Package, Wrench, Truck, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { BudgetResourceForm } from './BudgetResourceForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

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
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface BudgetResourcesTabProps {
  budgetId: string;
  isAdmin: boolean;
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

export function BudgetResourcesTab({ budgetId, isAdmin }: BudgetResourcesTabProps) {
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<BudgetResource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<BudgetResource | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch resources, activities, and phases in parallel
      const [resourcesRes, activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name'),
        supabase
          .from('budget_activities')
          .select('id, code, name, phase_id')
          .eq('budget_id', budgetId)
          .order('code'),
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
      toast.error('Error al cargar los recursos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  // Get ActivityID for display
  const getActivityId = (activityId: string | null) => {
    if (!activityId) return '';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '';
    
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.-${activity.name}`;
  };

  // Calculate derived fields for a resource
  const calculateFields = (resource: BudgetResource) => {
    const externalCost = resource.external_unit_cost || 0;
    const safetyPercent = resource.safety_margin_percent || 0.15;
    const salesPercent = resource.sales_margin_percent || 0.25;
    
    const safetyMarginUd = externalCost * safetyPercent;
    const internalCostUd = externalCost + safetyMarginUd;
    const salesMarginUd = internalCostUd * salesPercent;
    const salesCostUd = internalCostUd + salesMarginUd;
    
    // Calculated units: if manual_units is defined (including 0), use it; otherwise use related_units
    const calculatedUnits = resource.manual_units !== null 
      ? resource.manual_units 
      : (resource.related_units || 0);
    
    const subtotalSales = calculatedUnits * salesCostUd;
    
    return {
      safetyMarginUd,
      internalCostUd,
      salesMarginUd,
      salesCostUd,
      calculatedUnits,
      subtotalSales,
    };
  };

  // Filter resources by search term
  const filteredResources = useMemo(() => {
    if (!searchTerm) return resources;
    
    const searchLower = searchTerm.toLowerCase();
    return resources.filter(resource => {
      const activityId = getActivityId(resource.activity_id);
      return (
        resource.name.toLowerCase().includes(searchLower) ||
        resource.resource_type?.toLowerCase().includes(searchLower) ||
        resource.unit?.toLowerCase().includes(searchLower) ||
        activityId.toLowerCase().includes(searchLower)
      );
    });
  }, [resources, searchTerm, activities, phases]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredResources.reduce((acc, resource) => {
      const fields = calculateFields(resource);
      return {
        subtotal: acc.subtotal + fields.subtotalSales,
        count: acc.count + 1,
      };
    }, { subtotal: 0, count: 0 });
  }, [filteredResources]);

  const handleEdit = (resource: BudgetResource) => {
    setEditingResource(resource);
    setFormOpen(true);
  };

  const handleDelete = (resource: BudgetResource) => {
    setResourceToDelete(resource);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!resourceToDelete) return;
    
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .delete()
        .eq('id', resourceToDelete.id);
      
      if (error) throw error;
      
      toast.success('Recurso eliminado correctamente');
      fetchData();
    } catch (error) {
      console.error('Error deleting resource:', error);
      toast.error('Error al eliminar el recurso');
    } finally {
      setDeleteDialogOpen(false);
      setResourceToDelete(null);
    }
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingResource(null);
  };

  const handleFormSave = () => {
    fetchData();
    handleFormClose();
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Remove BOM if present
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split('\n');
      
      const resourcesData: {
        budget_id: string;
        name: string;
        external_unit_cost: number | null;
        unit: string | null;
        resource_type: string | null;
        safety_margin_percent: number;
        sales_margin_percent: number;
        manual_units: number | null;
        related_units: number | null;
        activity_id: string | null;
      }[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line with proper handling of quoted fields
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        
        const name = values[0]?.replace(/^"|"$/g, '') || '';
        if (!name) continue;
        
        // Parse numbers - handles both European (1.234,56) and standard (1234.56) formats
        const parseNumber = (val: string): number | null => {
          if (!val || val.trim() === '') return null;
          let cleaned = val.replace(/^"|"$/g, '').trim();
          
          // Detect format: if has comma as last separator, it's European
          const hasEuropeanFormat = /\d,\d{1,2}$/.test(cleaned);
          
          if (hasEuropeanFormat) {
            // European: 1.234,56 -> 1234.56
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
          }
          // Otherwise keep as is (standard format: 1234.56)
          
          cleaned = cleaned.replace(/[^0-9.-]/g, '');
          const num = parseFloat(cleaned);
          return isNaN(num) ? null : num;
        };
        
        // CSV columns: Recurso, €Coste ud, Ud medida, Tipo recurso, %Margen seguridad, €Margen seguridad, €Coste interno ud, %Margen venta, €Margen venta, €Coste venta ud, Uds manual, Uds relacionadas, ActividadID
        const externalCost = parseNumber(values[1] || '');
        const unit = values[2]?.replace(/^"|"$/g, '').trim() || null;
        const resourceType = values[3]?.replace(/^"|"$/g, '').trim() || null;
        
        // Parse percentages - values like 0.15 mean 15%, keep as decimal
        let safetyPercent = parseNumber(values[4] || '');
        if (safetyPercent === null) safetyPercent = 0.15;
        // If value > 1, it's likely already a percentage (15 = 15%), convert to decimal
        if (safetyPercent > 1) safetyPercent = safetyPercent / 100;
        
        let salesPercent = parseNumber(values[7] || '');
        if (salesPercent === null) salesPercent = 0.25;
        if (salesPercent > 1) salesPercent = salesPercent / 100;
        
        const manualUnits = parseNumber(values[10] || '');
        const relatedUnits = parseNumber(values[11] || '');
        const activityIdField = values[12]?.replace(/^"|"$/g, '').trim() || '';
        
        // Find activity by its display ID (exact match or partial match)
        let activityId: string | null = null;
        if (activityIdField) {
          // Try exact match first
          const matchingActivity = activities.find(a => {
            const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
            const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
            return fullId === activityIdField || 
                   fullId.toLowerCase() === activityIdField.toLowerCase();
          });
          
          if (matchingActivity) {
            activityId = matchingActivity.id;
          } else {
            // Try partial match on name or code
            const partialMatch = activities.find(a => {
              const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
              const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
              return fullId.toLowerCase().includes(activityIdField.toLowerCase()) ||
                     activityIdField.toLowerCase().includes(a.name.toLowerCase());
            });
            activityId = partialMatch?.id || null;
          }
        }
        
        resourcesData.push({
          budget_id: budgetId,
          name,
          external_unit_cost: externalCost,
          unit: unit || null,
          resource_type: resourceType,
          safety_margin_percent: safetyPercent,
          sales_margin_percent: salesPercent,
          manual_units: manualUnits,
          related_units: relatedUnits,
          activity_id: activityId,
        });
      }
      
      if (resourcesData.length === 0) {
        toast.error('No se encontraron recursos válidos en el archivo');
        return;
      }
      
      // Insert resources in batches to avoid timeouts
      const batchSize = 50;
      let imported = 0;
      
      for (let i = 0; i < resourcesData.length; i += batchSize) {
        const batch = resourcesData.slice(i, i + batchSize);
        const { error } = await supabase
          .from('budget_activity_resources')
          .insert(batch);
        
        if (error) throw error;
        imported += batch.length;
      }
      
      toast.success(`${imported} recursos importados correctamente`);
      fetchData();
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast.error('Error al importar el archivo CSV');
    }
    
    // Reset input
    event.target.value = '';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>CÓMO hacer? - Recursos</CardTitle>
            <CardDescription>
              Gestión de recursos del presupuesto ({resources.length} recursos)
            </CardDescription>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar CSV
                  </span>
                </Button>
              </label>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Recurso
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Search and Summary */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar recursos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="text-sm">
                {filteredResources.length} recursos
              </Badge>
              <Badge variant="default" className="text-sm">
                Total: {formatCurrency(totals.subtotal)}
              </Badge>
            </div>
          </div>

          {/* Resources Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Recurso</TableHead>
                  <TableHead className="text-right">€Coste ud ext.</TableHead>
                  <TableHead>Ud</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">%Seg.</TableHead>
                  <TableHead className="text-right">€Seg.</TableHead>
                  <TableHead className="text-right">€Coste int.</TableHead>
                  <TableHead className="text-right">%Venta</TableHead>
                  <TableHead className="text-right">€Venta</TableHead>
                  <TableHead className="text-right">€Coste venta</TableHead>
                  <TableHead className="text-right">Uds man.</TableHead>
                  <TableHead className="text-right">Uds rel.</TableHead>
                  <TableHead className="text-right">Uds calc.</TableHead>
                  <TableHead className="text-right">€Subtotal</TableHead>
                  <TableHead className="min-w-[200px]">Actividad</TableHead>
                  {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 16 : 15} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No se encontraron recursos' : 'No hay recursos. Añade uno nuevo o importa desde CSV.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResources.map((resource) => {
                    const fields = calculateFields(resource);
                    const activityDisplay = getActivityId(resource.activity_id);
                    
                    return (
                      <TableRow key={resource.id}>
                        <TableCell className="font-medium">{resource.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(resource.external_unit_cost || 0)}
                        </TableCell>
                        <TableCell>{resource.unit || '-'}</TableCell>
                        <TableCell>
                          {resource.resource_type ? (
                            <Badge variant={resourceTypeVariants[resource.resource_type] as any || 'secondary'}>
                              {resourceTypeIcons[resource.resource_type]}
                              <span className="ml-1">{resource.resource_type}</span>
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPercent(resource.safety_margin_percent || 0.15)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(fields.safetyMarginUd)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(fields.internalCostUd)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPercent(resource.sales_margin_percent || 0.25)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(fields.salesMarginUd)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(fields.salesCostUd)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatNumber(fields.calculatedUnits)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {formatCurrency(fields.subtotalSales)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={activityDisplay}>
                          {activityDisplay || '-'}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(resource)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(resource)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resource Form Dialog */}
      <BudgetResourceForm
        open={formOpen}
        onOpenChange={handleFormClose}
        budgetId={budgetId}
        resource={editingResource}
        activities={activities}
        phases={phases}
        onSave={handleFormSave}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Eliminar recurso"
        description={`¿Estás seguro de que deseas eliminar el recurso "${resourceToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </>
  );
}
