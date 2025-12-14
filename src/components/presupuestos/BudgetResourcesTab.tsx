import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Pencil, Trash2, Package, Wrench, Truck, Briefcase, FileSpreadsheet, Check, List, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { BudgetResourceForm } from './BudgetResourceForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { ResourcesGroupedView } from './ResourcesGroupedView';
import * as XLSX from 'xlsx';

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

// Field options for bulk edit
const BULK_EDIT_FIELDS = [
  { value: 'resource_type', label: 'Tipo recurso' },
  { value: 'unit', label: 'Ud medida' },
  { value: 'safety_margin_percent', label: '% Margen seguridad' },
  { value: 'sales_margin_percent', label: '% Margen venta' },
  { value: 'external_unit_cost', label: '€ Coste ud ext.' },
  { value: 'activity_id', label: 'Actividad' },
];

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

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
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  
  // Bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState<string | number>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

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

  // Listen for navigation events from Activities tab
  useEffect(() => {
    const handleNavigateToResources = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      
      if (detail?.action === 'new' && detail?.activityId) {
        // Open form with pre-selected activity
        setEditingResource(null);
        setFormOpen(true);
        // Store the pre-selected activity ID for the form
        window.sessionStorage.setItem('preselectedActivityId', detail.activityId);
      } else if (detail?.action === 'edit' && detail?.resourceId) {
        // Find and edit the resource - check local state first, then fetch if not found
        let resource = resources.find(r => r.id === detail.resourceId);
        
        if (!resource) {
          // Resource not in state yet - fetch it directly from DB
          const { data, error } = await supabase
            .from('budget_activity_resources')
            .select('*')
            .eq('id', detail.resourceId)
            .single();
          
          if (!error && data) {
            resource = data as BudgetResource;
          }
        }
        
        if (resource) {
          setEditingResource(resource);
          setFormOpen(true);
        } else {
          toast.error('Recurso no encontrado');
        }
      }
    };
    
    window.addEventListener('navigate-to-resources', handleNavigateToResources);
    return () => window.removeEventListener('navigate-to-resources', handleNavigateToResources);
  }, [resources]);

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
    const safetyPercent = resource.safety_margin_percent ?? 0.15;
    const salesPercent = resource.sales_margin_percent ?? 0.25;
    
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

  // Inline update handler
  const handleInlineUpdate = useCallback(async (id: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ [field]: value })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setResources(prev => prev.map(r => 
        r.id === id ? { ...r, [field]: value } : r
      ));
    } catch (error) {
      console.error('Error updating resource:', error);
      toast.error('Error al actualizar');
      throw error;
    }
  }, []);

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResources.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Bulk update handler
  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !bulkEditField) {
      toast.error('Selecciona filas y un campo a editar');
      return;
    }

    setIsBulkUpdating(true);
    try {
      let updateValue: any = bulkEditValue;
      
      // Handle percentage fields
      if (bulkEditField === 'safety_margin_percent' || bulkEditField === 'sales_margin_percent') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : (numVal > 1 ? numVal / 100 : numVal);
      } else if (bulkEditField === 'external_unit_cost') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : numVal;
      } else if (bulkEditField === 'activity_id' && bulkEditValue === '__none__') {
        updateValue = null;
      }

      const { error } = await supabase
        .from('budget_activity_resources')
        .update({ [bulkEditField]: updateValue })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`${selectedIds.size} recursos actualizados`);
      setSelectedIds(new Set());
      setBulkEditField('');
      setBulkEditValue('');
      fetchData();
    } catch (error) {
      console.error('Error bulk updating:', error);
      toast.error('Error al actualizar recursos');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Parse numbers - handles European (1.234,56) and standard (1234.56) formats, and currency symbols
  const parseNumber = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    
    // If already a number, return it directly
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }
    
    if (typeof val !== 'string' || val.trim() === '') return null;
    
    // Remove quotes, currency symbols, and whitespace
    let cleaned = val.replace(/^"|"$/g, '').replace(/[€$£¥]/g, '').trim();
    
    if (cleaned === '' || cleaned === '0') return cleaned === '0' ? 0 : null;
    
    // Detect format: if has comma as last separator, it's European
    const hasEuropeanFormat = /\d,\d{1,2}$/.test(cleaned);
    
    if (hasEuropeanFormat) {
      // European: 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Otherwise keep as is (standard format: 1234.56 or 15.00 €)
    
    // Remove any remaining non-numeric characters except . and -
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Find activity by its display ID (exact match or partial match)
  const findActivityId = (activityIdField: string | null | undefined): string | null => {
    if (!activityIdField || typeof activityIdField !== 'string') return null;
    
    const cleanField = activityIdField.trim();
    // If empty or "0", return null (no activity)
    if (!cleanField || cleanField === '0') return null;
    
    // Try exact match first
    const matchingActivity = activities.find(a => {
      const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
      const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
      return fullId === cleanField || fullId.toLowerCase() === cleanField.toLowerCase();
    });
    
    if (matchingActivity) return matchingActivity.id;
    
    // Try partial match on name or code
    const partialMatch = activities.find(a => {
      const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
      const fullId = `${phase?.code || ''} ${a.code}.-${a.name}`;
      return fullId.toLowerCase().includes(cleanField.toLowerCase()) ||
             cleanField.toLowerCase().includes(a.name.toLowerCase());
    });
    
    return partialMatch?.id || null;
  };

  // Process row data (from CSV or Excel)
  const processRowData = (
    row: Record<string, any>,
    existingNames: Set<string>
  ): {
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
  } | null => {
    // Try to get value by multiple possible column names
    const getValue = (keys: string[]) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') {
          return row[key];
        }
      }
      return null;
    };
    
    // Column names match exactly the user's Excel headers
    const name = String(getValue(['Recurso']) || '').replace(/^"|"$/g, '').trim();
    
    // Debug: log first row to see column names
    if (existingNames.size === 0) {
      console.log('Import - First row data:', row);
      console.log('Import - Available columns:', Object.keys(row));
    }
    
    if (!name) {
      console.log('Import - Skipping row with empty name:', row);
      return null;
    }
    
    // Skip duplicates
    const nameLower = name.toLowerCase();
    if (existingNames.has(nameLower)) return null;
    existingNames.add(nameLower);
    
    const externalCost = parseNumber(getValue(['€Coste ud']));
    const unit = String(getValue(['Ud medida']) || '').replace(/^"|"$/g, '').trim() || null;
    const resourceType = String(getValue(['Tipo recurso']) || '').replace(/^"|"$/g, '').trim() || null;
    
    // Default percentages (these fields are not in the import)
    const safetyPercent = 0.15;
    const salesPercent = 0.25;
    
    const manualUnits = parseNumber(getValue(['Uds manual']));
    const relatedUnits = parseNumber(getValue(['Uds relacionadas']));
    const activityIdField = String(getValue(['ActividadID']) || '').replace(/^"|"$/g, '').trim();
    
    return {
      budget_id: budgetId,
      name,
      external_unit_cost: externalCost,
      unit,
      resource_type: resourceType,
      safety_margin_percent: safetyPercent,
      sales_margin_percent: salesPercent,
      manual_units: manualUnits,
      related_units: relatedUnits,
      activity_id: findActivityId(activityIdField),
    };
  };

  // Import resources from parsed data
  const importResources = async (
    resourcesData: Array<{
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
    }>,
    totalRows: number
  ) => {
    if (resourcesData.length === 0) {
      toast.info('No se encontraron recursos nuevos para importar (posibles duplicados)');
      return;
    }
    
    const skipped = totalRows - resourcesData.length;
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
    
    const skippedMsg = skipped > 0 ? ` (${skipped} duplicados omitidos)` : '';
    toast.success(`${imported} recursos importados correctamente${skippedMsg}`);
    fetchData();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const existingNames = new Set(resources.map(r => r.name.toLowerCase().trim()));

    try {
      if (isExcel) {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        
        const resourcesData: Array<ReturnType<typeof processRowData>> = [];
        
        for (const row of jsonData) {
          const processed = processRowData(row, existingNames);
          if (processed) resourcesData.push(processed);
        }
        
        await importResources(
          resourcesData.filter((r): r is NonNullable<typeof r> => r !== null),
          jsonData.length
        );
      } else {
        // Handle CSV file
        const text = await file.text();
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split('\n');
        
        if (lines.length < 2) {
          toast.error('El archivo CSV está vacío o no tiene datos');
          return;
        }
        
        // Parse header row to get column positions
        const headerLine = lines[0];
        const headers: string[] = [];
        let current = '';
        let inQuotes = false;
        
        // Detect delimiter: semicolon or comma
        const delimiter = headerLine.includes(';') ? ';' : ',';
        
        for (const char of headerLine) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            headers.push(current.replace(/^"|"$/g, '').trim());
            current = '';
          } else {
            current += char;
          }
        }
        headers.push(current.replace(/^"|"$/g, '').trim());
        
        const resourcesData: Array<ReturnType<typeof processRowData>> = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Parse CSV line with proper handling of quoted fields
          const values: string[] = [];
          current = '';
          inQuotes = false;
          
          for (const char of line) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          
          // Create row object from values
          const row: Record<string, string> = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });
          
          const processed = processRowData(row, existingNames);
          if (processed) resourcesData.push(processed);
        }
        
        await importResources(
          resourcesData.filter((r): r is NonNullable<typeof r> => r !== null),
          lines.filter((l, i) => i > 0 && l.trim()).length
        );
      }
    } catch (error) {
      console.error('Error importing file:', error);
      toast.error(`Error al importar el archivo ${isExcel ? 'Excel' : 'CSV'}`);
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
              <label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Importar CSV/Excel
                  </span>
                </Button>
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
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
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4 mr-1" />
                  Lista
                </Button>
                <Button
                  variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setViewMode('grouped')}
                >
                  <FolderTree className="h-4 w-4 mr-1" />
                  Por Fase
                </Button>
              </div>
              <Badge variant="secondary" className="text-sm">
                {filteredResources.length} recursos
              </Badge>
              <Badge variant="default" className="text-sm">
                Total: {formatCurrency(totals.subtotal)}
              </Badge>
            </div>
          </div>

          {/* Bulk Edit Bar */}
          {isAdmin && selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg border">
              <Badge variant="secondary">
                {selectedIds.size} seleccionados
              </Badge>
              <div className="flex items-center gap-2">
                <Select value={bulkEditField} onValueChange={setBulkEditField}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Campo a editar" />
                  </SelectTrigger>
                  <SelectContent>
                    {BULK_EDIT_FIELDS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {bulkEditField === 'resource_type' && (
                  <Select value={String(bulkEditValue)} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {bulkEditField === 'unit' && (
                  <Select value={String(bulkEditValue)} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue placeholder="Ud" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {bulkEditField === 'activity_id' && (
                  <Select value={String(bulkEditValue || '__none__')} onValueChange={setBulkEditValue}>
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue placeholder="Actividad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin actividad</SelectItem>
                      {activities.map(a => {
                        const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            {phase?.code || ''} {a.code}.-{a.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                
                {(bulkEditField === 'safety_margin_percent' || bulkEditField === 'sales_margin_percent') && (
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={typeof bulkEditValue === 'number' ? bulkEditValue * 100 : 0}
                      onChange={(v) => setBulkEditValue(v / 100)}
                      decimals={1}
                      className="w-[80px] h-9"
                      placeholder="%"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                )}
                
                {bulkEditField === 'external_unit_cost' && (
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={typeof bulkEditValue === 'number' ? bulkEditValue : 0}
                      onChange={(v) => setBulkEditValue(v)}
                      decimals={2}
                      className="w-[100px] h-9"
                      placeholder="€"
                    />
                    <span className="text-muted-foreground text-sm">€</span>
                  </div>
                )}
              </div>
              
              <Button 
                size="sm" 
                onClick={handleBulkUpdate} 
                disabled={!bulkEditField || isBulkUpdating}
              >
                <Check className="h-4 w-4 mr-1" />
                Aplicar
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkEditField('');
                  setBulkEditValue('');
                }}
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* Resources View */}
          {viewMode === 'grouped' ? (
            <ResourcesGroupedView
              resources={filteredResources}
              activities={activities}
              phases={phases}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onInlineUpdate={handleInlineUpdate}
              calculateFields={calculateFields}
              getActivityId={getActivityId}
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedIds.size === filteredResources.length && filteredResources.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
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
                      <TableCell colSpan={isAdmin ? 18 : 15} className="text-center text-muted-foreground py-8">
                        {searchTerm ? 'No se encontraron recursos' : 'No hay recursos. Añade uno nuevo o importa desde CSV/Excel.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResources.map((resource) => {
                      const fields = calculateFields(resource);
                      const activityDisplay = getActivityId(resource.activity_id);
                      
                      const unitOptions = UNITS.map(u => ({ value: u, label: u }));
                      const typeOptions = RESOURCE_TYPES.map(t => ({ value: t, label: t }));
                      const activityOptions = activities.map(a => {
                        const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
                        return {
                          value: a.id,
                          label: `${phase?.code || ''} ${a.code}.-${a.name}`,
                        };
                      });
                      
                      return (
                        <TableRow key={resource.id} className={selectedIds.has(resource.id) ? 'bg-muted/50' : ''}>
                          {isAdmin && (
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(resource.id)}
                                onCheckedChange={() => toggleSelect(resource.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            <ResourceInlineEdit
                              value={resource.name}
                              displayValue={resource.name}
                              onSave={(v) => handleInlineUpdate(resource.id, 'name', v)}
                              type="text"
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.external_unit_cost}
                              displayValue={formatCurrency(resource.external_unit_cost || 0)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'external_unit_cost', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell>
                            <ResourceInlineEdit
                              value={resource.unit}
                              displayValue={resource.unit || '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'unit', v)}
                              type="select"
                              options={unitOptions}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell>
                            <ResourceInlineEdit
                              value={resource.resource_type}
                              displayValue={
                                resource.resource_type ? (
                                  <Badge variant={resourceTypeVariants[resource.resource_type] as any || 'secondary'}>
                                    {resourceTypeIcons[resource.resource_type]}
                                    <span className="ml-1">{resource.resource_type}</span>
                                  </Badge>
                                ) : '-'
                              }
                              onSave={(v) => handleInlineUpdate(resource.id, 'resource_type', v)}
                              type="select"
                              options={typeOptions}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={(resource.safety_margin_percent ?? 0.15) * 100}
                              displayValue={formatPercent(resource.safety_margin_percent ?? 0.15)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'safety_margin_percent', v / 100)}
                              type="percent"
                              decimals={1}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.safetyMarginUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.internalCostUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={(resource.sales_margin_percent ?? 0.25) * 100}
                              displayValue={formatPercent(resource.sales_margin_percent ?? 0.25)}
                              onSave={(v) => handleInlineUpdate(resource.id, 'sales_margin_percent', v / 100)}
                              type="percent"
                              decimals={1}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(fields.salesMarginUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(fields.salesCostUd)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.manual_units}
                              displayValue={resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'manual_units', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <ResourceInlineEdit
                              value={resource.related_units}
                              displayValue={resource.related_units !== null ? formatNumber(resource.related_units) : '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'related_units', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatNumber(fields.calculatedUnits)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-primary">
                            {formatCurrency(fields.subtotalSales)}
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px]">
                            <ResourceInlineEdit
                              value={resource.activity_id}
                              displayValue={activityDisplay || '-'}
                              onSave={(v) => handleInlineUpdate(resource.id, 'activity_id', v)}
                              type="select"
                              options={activityOptions}
                              disabled={!isAdmin}
                            />
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
          )}
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
