import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ChevronRight, ChevronDown, Package, Calendar, ShoppingCart, Building2, 
  Pencil, RefreshCw, ClipboardList, List, Save, X, Check, Edit, Search, Printer, Trash2, MessageSquare
} from 'lucide-react';
import { BudgetMessagesList } from './BudgetMessagesList';
import { searchMatch } from '@/lib/search-utils';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { formatActividadId } from '@/lib/activity-id';
import { cn } from '@/lib/utils';
import { parseISO, isWithinInterval, isValid, isBefore, isAfter } from 'date-fns';
import { InlineDatePicker } from '@/components/ui/inline-date-picker';
import { toast } from 'sonner';
import { PurchaseUnitDialog } from './PurchaseUnitDialog';
import { ResourceSupplierSelect } from '@/components/ResourceSupplierSelect';
import { 
  exportBuyingListAllPdf,
  exportBuyingListByActivityPdf,
  exportBuyingListBySupplierPdf,
  exportBuyingListSelectedPdf
} from './BuyingListPdfExport';

// Unit options
const UNIT_OPTIONS = [
  'ud', 'm', 'm2', 'm3', 'ml', 'kg', 'l', 't', 'h', 'día', 'mes', 'año', 'pa', '%'
];

interface Phase {
  id: string;
  name: string;
  code: string | null;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  uses_measurement: boolean;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

interface Resource {
  id: string;
  name: string;
  activity_id: string | null;
  resource_type: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  unit: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  purchase_unit_cost?: number | null;
  conversion_factor?: number | null;
  purchase_vat_percent?: number | null;
  purchase_units?: number | null;
  purchase_unit_measure?: string | null;
}

type ViewMode = 'activity' | 'supplier' | 'resource' | 'messages';

interface SupplierInfo {
  id: string;
  name: string;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nif_dni?: string | null;
}

interface BudgetInfo {
  id: string;
  nombre: string;
  direccion?: string | null;
  poblacion?: string | null;
  provincia?: string | null;
  google_maps_url?: string | null;
}

interface BuyingListUnifiedProps {
  budgetId: string;
  resources: Resource[];
  activities: Activity[];
  phases: Phase[];
  onEditResource?: (resource: Resource) => void;
  onDeleteResource?: (resourceId: string) => void;
  onRefresh?: () => void;
}

export function BuyingListUnified({ 
  budgetId,
  resources: initialResources, 
  activities: initialActivities, 
  phases,
  onEditResource,
  onDeleteResource,
  onRefresh
}: BuyingListUnifiedProps) {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('activity');
  
  // Budget info for PDF export
  const [budgetInfo, setBudgetInfo] = useState<BudgetInfo | null>(null);
  
  // Supplier details for PDF export
  const [supplierDetails, setSupplierDetails] = useState<Map<string, SupplierInfo>>(new Map());
  
  // Selected resources for printing in "Por Recurso" view
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  
  // Expansion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
  
  // Local data - initialized from props
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [resources, setResources] = useState<Resource[]>(initialResources);
  
  // Date range filter - persisted in localStorage per budget
  const storageKey = `buyingList_dateRange_${budgetId}`;
  const [startDate, setStartDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.startDate || '';
      }
    } catch {}
    return '';
  });
  const [endDate, setEndDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.endDate || '';
      }
    } catch {}
    return '';
  });

  // Persist date range to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ startDate, endDate }));
    } catch {}
  }, [startDate, endDate, storageKey]);

  // Search term
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Inline editing
  const [editingResource, setEditingResource] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    purchase_unit_cost?: string;
    purchase_unit?: string;
    purchase_unit_quantity?: string;
    purchase_vat_percent?: string;
    purchase_units?: string;
    purchase_unit_measure?: string;
    supplier_id?: string | null;
  }>({});
  
  // Dialog for full edit
  const [dialogResource, setDialogResource] = useState<Resource | null>(null);

  // CRITICAL: Sync local state with props when they change
  // This ensures data loaded asynchronously (e.g., in Agenda tab) gets reflected
  useEffect(() => {
    setActivities(initialActivities);
  }, [initialActivities]);

  useEffect(() => {
    setResources(initialResources);
  }, [initialResources]);

  // Fetch budget info for PDF export
  useEffect(() => {
    const fetchBudgetInfo = async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, nombre, direccion, poblacion, provincia, google_maps_url')
        .eq('id', budgetId)
        .single();
      
      if (!error && data) {
        setBudgetInfo(data as BudgetInfo);
      }
    };
    
    fetchBudgetInfo();
  }, [budgetId]);

  // Fetch supplier details for PDF export
  useEffect(() => {
    const fetchSupplierDetails = async () => {
      // Get unique supplier IDs from resources
      const supplierIds = [...new Set(
        resources
          .filter(r => r.supplier_id)
          .map(r => r.supplier_id as string)
      )];
      
      if (supplierIds.length === 0) return;
      
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone, address, nif_dni')
        .in('id', supplierIds);
      
      if (!error && data) {
        const detailsMap = new Map<string, SupplierInfo>();
        data.forEach(contact => {
          detailsMap.set(contact.id, contact as SupplierInfo);
        });
        setSupplierDetails(detailsMap);
      }
    };
    
    fetchSupplierDetails();
  }, [resources]);

  // Toggle resource selection
  const toggleResourceSelection = (resourceId: string) => {
    setSelectedResources(prev => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  // Select/deselect all resources
  const toggleSelectAll = useCallback((resourceIds: string[]) => {
    setSelectedResources(prev => {
      const allSelected = resourceIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        resourceIds.forEach(id => next.delete(id));
      } else {
        resourceIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubGroup = (id: string) => {
    setExpandedSubGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter activities by uses_measurement and date range
  const filteredActivities = useMemo(() => {
    const measurementActivities = activities.filter(a => a.uses_measurement === true);
    
    if (!startDate && !endDate) return measurementActivities;
    
    return measurementActivities.filter(activity => {
      const actStart = activity.actual_start_date;
      const actEnd = activity.actual_end_date;
      
      // If no dates on activity, exclude when filtering
      if (!actStart && !actEnd) return false;
      
      try {
        const filterStart = startDate ? parseISO(startDate) : null;
        const filterEnd = endDate ? parseISO(endDate) : null;
        const actStartDate = actStart ? parseISO(actStart) : null;
        const actEndDate = actEnd ? parseISO(actEnd) : null;
        
        // Check overlap between activity period and filter period
        if (filterStart && actEndDate && isValid(filterStart) && isValid(actEndDate)) {
          if (isBefore(actEndDate, filterStart)) return false;
        }
        if (filterEnd && actStartDate && isValid(filterEnd) && isValid(actStartDate)) {
          if (isAfter(actStartDate, filterEnd)) return false;
        }
        
        return true;
      } catch {
        return false;
      }
    });
  }, [activities, startDate, endDate]);

  const filteredActivityIds = useMemo(() => new Set(filteredActivities.map(a => a.id)), [filteredActivities]);

  // Filter resources by filtered activities and search term
  const filteredResources = useMemo(() => {
    let result = resources.filter(r => r.activity_id && filteredActivityIds.has(r.activity_id));
    
    // Apply search filter if search term exists
    if (searchTerm.trim()) {
      result = result.filter(r => {
        const activity = filteredActivities.find(a => a.id === r.activity_id);
        const phase = activity ? phases.find(p => p.id === activity.phase_id) : null;
        const activityId = activity ? formatActividadId({
          phaseCode: phase?.code || null,
          activityCode: activity.code,
          name: activity.name
        }) : '';
        
        // Search in resource name, type, supplier, activity id, phase name
        return (
          searchMatch(r.name, searchTerm) ||
          searchMatch(r.resource_type || '', searchTerm) ||
          searchMatch(r.supplier_name || '', searchTerm) ||
          searchMatch(activityId, searchTerm) ||
          searchMatch(phase?.name || '', searchTerm) ||
          searchMatch(activity?.name || '', searchTerm)
        );
      });
    }
    
    return result;
  }, [resources, filteredActivityIds, searchTerm, filteredActivities, phases]);

  // Handle inline resource update
  const handleResourceUpdate = useCallback(async (
    resourceId: string,
    updates: {
      purchase_unit_cost?: number | null;
      purchase_unit?: string | null;
      purchase_unit_quantity?: number | null;
      purchase_vat_percent?: number | null;
      purchase_units?: number | null;
      purchase_unit_measure?: string | null;
      supplier_id?: string | null;
    },
    supplierName?: string | null
  ) => {
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update(updates)
        .eq('id', resourceId);

      if (error) throw error;

      // Update local state, including supplier_name if supplier changed
      setResources(prev => prev.map(r => 
        r.id === resourceId 
          ? { 
              ...r, 
              ...updates,
              ...(supplierName !== undefined && { supplier_name: supplierName })
            } 
          : r
      ));

      toast.success('Recurso actualizado');
      setEditingResource(null);
      setEditingSupplier(null);
      setEditValues({});
    } catch (error) {
      console.error('Error updating resource:', error);
      toast.error('Error al actualizar');
    }
  }, []);

  // Handle supplier change inline
  const handleSupplierChange = useCallback(async (
    resourceId: string,
    supplierId: string | null,
    contact: { name: string; surname: string | null } | null
  ) => {
    const supplierName = contact 
      ? (contact.surname ? `${contact.name} ${contact.surname}` : contact.name) 
      : null;
    
    await handleResourceUpdate(resourceId, { supplier_id: supplierId }, supplierName);
    setEditingSupplier(null);
  }, [handleResourceUpdate]);

  // Handle activity date update
  const handleActivityDateChange = useCallback(async (
    activityId: string, 
    field: 'actual_start_date' | 'actual_end_date', 
    value: string | null
  ) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ [field]: value })
        .eq('id', activityId);

      if (error) throw error;

      setActivities(prev => prev.map(a => 
        a.id === activityId ? { ...a, [field]: value } : a
      ));

      toast.success('Fecha actualizada');
    } catch (error) {
      console.error('Error updating date:', error);
      toast.error('Error al actualizar');
    }
  }, []);

  // Start inline editing
  const startEditing = (resource: Resource) => {
    const calculatedUnits = resource.manual_units ?? resource.related_units ?? 0;
    setEditingResource(resource.id);
    setEditValues({
      purchase_unit_cost: String(resource.purchase_unit_cost ?? resource.external_unit_cost ?? 0),
      purchase_unit: resource.purchase_unit ?? resource.unit ?? 'ud',
      purchase_unit_quantity: String(resource.purchase_unit_quantity ?? calculatedUnits),
      purchase_vat_percent: String(resource.purchase_vat_percent ?? 21),
      purchase_units: String(resource.purchase_units ?? calculatedUnits),
      purchase_unit_measure: resource.purchase_unit_measure ?? resource.unit ?? 'ud',
      supplier_id: resource.supplier_id
    });
  };

  // Save inline edits
  const saveEditing = () => {
    if (!editingResource) return;
    
    handleResourceUpdate(editingResource, {
      purchase_unit_cost: editValues.purchase_unit_cost ? parseFloat(editValues.purchase_unit_cost) : null,
      purchase_unit: editValues.purchase_unit || null,
      purchase_unit_quantity: editValues.purchase_unit_quantity ? parseFloat(editValues.purchase_unit_quantity) : null,
      purchase_vat_percent: editValues.purchase_vat_percent ? parseFloat(editValues.purchase_vat_percent) : 21,
      purchase_units: editValues.purchase_units ? parseFloat(editValues.purchase_units) : null,
      purchase_unit_measure: editValues.purchase_unit_measure || null
    });
  };

  // Cancel inline editing
  const cancelEditing = () => {
    setEditingResource(null);
    setEditingSupplier(null);
    setEditValues({});
  };

  // Helper functions
  const getPhase = (phaseId: string | null) => phases.find(p => p.id === phaseId);
  
  const formatActivityId = (activity: Activity) => {
    const phase = getPhase(activity.phase_id);
    return formatActividadId({
      phaseCode: phase?.code || null,
      activityCode: activity.code,
      name: activity.name
    });
  };

  const getResourceTypeBadgeColor = (type: string | null) => {
    switch (type) {
      case 'Material':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Mano de obra':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Maquinaria':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'Subcontrata':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  // Calculate buying list subtotal with VAT
  const calcBuyingSubtotal = (r: Resource) => {
    const calculatedUnits = r.manual_units ?? r.related_units ?? 0;
    const qty = r.purchase_units ?? calculatedUnits;
    const cost = r.purchase_unit_cost ?? r.external_unit_cost ?? 0;
    const vatPercent = r.purchase_vat_percent ?? 21;
    const vatAmount = cost * qty * (vatPercent / 100);
    return (cost * qty) + vatAmount;
  };

  // Calculate totals with VAT
  const grandTotal = useMemo(() => {
    return filteredResources.reduce((sum, r) => {
      return sum + calcBuyingSubtotal(r);
    }, 0);
  }, [filteredResources]);

  // Group data by activity
  const activityGroupedData = useMemo(() => {
    const groups = new Map<string, { activity: Activity; resources: Resource[]; total: number }>();
    
    filteredActivities.forEach(activity => {
      const actResources = filteredResources.filter(r => r.activity_id === activity.id);
      if (actResources.length === 0) return;
      
      const total = actResources.reduce((sum, r) => {
        return sum + calcBuyingSubtotal(r);
      }, 0);
      
      groups.set(activity.id, { activity, resources: actResources, total });
    });
    
    // Sort by ActividadID
    return Array.from(groups.values()).sort((a, b) => 
      formatActivityId(a.activity).localeCompare(formatActivityId(b.activity))
    );
  }, [filteredActivities, filteredResources]);

  // Group data by supplier
  const supplierGroupedData = useMemo(() => {
    const groups = new Map<string, { supplierId: string; supplierName: string; resources: Resource[]; total: number }>();
    
    filteredResources.forEach(resource => {
      const supplierId = resource.supplier_id || '__no_supplier__';
      const supplierName = resource.supplier_name || 'Sin proveedor';
      
      if (!groups.has(supplierId)) {
        groups.set(supplierId, { supplierId, supplierName, resources: [], total: 0 });
      }
      
      const group = groups.get(supplierId)!;
      group.resources.push(resource);
      group.total += calcBuyingSubtotal(resource);
    });
    
    // Sort alphabetically, "Sin proveedor" last
    return Array.from(groups.values()).sort((a, b) => {
      if (a.supplierId === '__no_supplier__') return 1;
      if (b.supplierId === '__no_supplier__') return -1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [filteredResources]);

  // Group data by resource (flat list with full info)
  const resourceList = useMemo(() => {
    return filteredResources.map(resource => {
      const activity = filteredActivities.find(a => a.id === resource.activity_id);
      return {
        ...resource,
        activity,
        activityId: activity ? formatActivityId(activity) : '',
        total: calcBuyingSubtotal(resource)
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredResources, filteredActivities]);

  // Render resource row for activity/supplier views (full columns)
  const renderResourceRowFull = (resource: Resource, showActivity = false) => {
    const isEditing = editingResource === resource.id;
    const isEditingSupplierInline = editingSupplier === resource.id;
    const calculatedUnits = resource.manual_units ?? resource.related_units ?? 0;
    const displayPurchaseCost = resource.purchase_unit_cost ?? resource.external_unit_cost ?? 0;
    const displayPurchaseUnitMeasure = resource.purchase_unit_measure ?? resource.unit ?? 'ud';
    const displayPurchaseUnits = resource.purchase_units ?? calculatedUnits;
    const displayVatPercent = resource.purchase_vat_percent ?? 21;
    const vatAmount = displayPurchaseCost * displayPurchaseUnits * (displayVatPercent / 100);
    const buyingSubtotal = (displayPurchaseCost * displayPurchaseUnits) + vatAmount;
    const activity = activities.find(a => a.id === resource.activity_id);

    return (
      <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5 hover:bg-muted/10 border-b last:border-b-0">
        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate font-medium">{resource.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {resource.resource_type && (
              <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
                {resource.resource_type}
              </Badge>
            )}
            {showActivity && activity && (
              <span className="truncate font-mono text-[10px]">{formatActivityId(activity)}</span>
            )}
          </div>
        </div>
        
        {/* Supplier - Editable inline */}
        <div className="w-32 hidden sm:block" onClick={(e) => e.stopPropagation()}>
          {isEditingSupplierInline ? (
            <div className="relative">
              <ResourceSupplierSelect
                value={resource.supplier_id || null}
                onChange={(supplierId, contact) => {
                  handleSupplierChange(resource.id, supplierId, contact);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 absolute -right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                onClick={() => setEditingSupplier(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              className="text-xs w-full flex items-center justify-center gap-1 hover:bg-muted/50 rounded py-1 px-1 transition-colors"
              onClick={() => setEditingSupplier(resource.id)}
              title="Click para editar proveedor"
            >
              {resource.supplier_name ? (
                <>
                  <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate max-w-20">{resource.supplier_name}</span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-60" />
                </>
              ) : (
                <span className="text-muted-foreground/60 italic flex items-center gap-1">
                  Sin proveedor
                  <Pencil className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          )}
        </div>
        
        {/* Purchase Unit Cost */}
        <div className="w-20 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_unit_cost || ''}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_unit_cost: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium">{formatCurrency(displayPurchaseCost)}</span>
          )}
        </div>
        
        {/* VAT Percent */}
        <div className="w-16 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_vat_percent || '21'}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_vat_percent: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{formatNumber(displayVatPercent)}%</span>
          )}
        </div>
        
        {/* Purchase Unit Measure */}
        <div className="w-16 text-center">
          {isEditing ? (
            <Select
              value={editValues.purchase_unit_measure || 'ud'}
              onValueChange={(v) => setEditValues(prev => ({ ...prev, purchase_unit_measure: v }))}
            >
              <SelectTrigger className="h-6 text-xs px-1" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map(unit => (
                  <SelectItem key={unit} value={unit} className="text-xs">{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">{displayPurchaseUnitMeasure}</span>
          )}
        </div>
        
        {/* Purchase Units */}
        <div className="w-20 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_units || ''}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_units: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium">{formatNumber(displayPurchaseUnits)}</span>
          )}
        </div>
        
        {/* VAT Amount (calculated, read-only) */}
        <div className="w-20 text-center">
          <span className="text-xs text-muted-foreground">{formatCurrency(vatAmount)}</span>
        </div>
        
        {/* Subtotal */}
        <div className="w-24 text-right">
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(buyingSubtotal)}</span>
        </div>
        
        {/* Actions */}
        <div className="w-24 flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary"
                onClick={(e) => { e.stopPropagation(); saveEditing(); }}
                title="Guardar"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); startEditing(resource); }}
                title="Editar costes inline"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); setDialogResource(resource); }}
                title="Editar unidad compra"
              >
                <ShoppingCart className="h-3 w-3" />
              </Button>
              {onEditResource && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onEditResource(resource); }}
                  title="Editar recurso completo"
                >
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {onDeleteResource && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDeleteResource(resource.id); }}
                  title="Borrar recurso"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // Render resource row for "Por Recurso" view with simplified columns
  const renderResourceRowSimple = (resource: Resource) => {
    const isEditing = editingResource === resource.id;
    const isEditingSupplierInline = editingSupplier === resource.id;
    const calculatedUnits = resource.manual_units ?? resource.related_units ?? 0;
    const displayPurchaseCost = resource.purchase_unit_cost ?? resource.external_unit_cost ?? 0;
    const displayPurchaseUnitMeasure = resource.purchase_unit_measure ?? resource.unit ?? 'ud';
    const displayPurchaseUnits = resource.purchase_units ?? calculatedUnits;
    const displayVatPercent = resource.purchase_vat_percent ?? 21;
    const vatAmount = displayPurchaseCost * displayPurchaseUnits * (displayVatPercent / 100);
    const buyingSubtotal = (displayPurchaseCost * displayPurchaseUnits) + vatAmount;
    const isSelected = selectedResources.has(resource.id);

    return (
      <div key={resource.id} className="flex items-center gap-2 px-3 py-2 bg-muted/5 hover:bg-muted/10 border-b last:border-b-0">
        {/* Selection checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => toggleResourceSelection(resource.id)}
          className="flex-shrink-0"
        />
        
        {/* 1. Recurso */}
        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate font-medium">{resource.name}</p>
          {resource.resource_type && (
            <Badge className={cn("text-[9px] px-1 py-0", getResourceTypeBadgeColor(resource.resource_type))}>
              {resource.resource_type}
            </Badge>
          )}
        </div>
        
        {/* 2. Proveedor - Editable inline */}
        <div className="w-36" onClick={(e) => e.stopPropagation()}>
          {isEditingSupplierInline ? (
            <div className="relative">
              <ResourceSupplierSelect
                value={resource.supplier_id || null}
                onChange={(supplierId, contact) => {
                  handleSupplierChange(resource.id, supplierId, contact);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 absolute -right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                onClick={() => setEditingSupplier(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              className="text-xs w-full flex items-center justify-center gap-1 hover:bg-muted/50 rounded py-1 px-1 transition-colors"
              onClick={() => setEditingSupplier(resource.id)}
              title="Click para editar proveedor"
            >
              {resource.supplier_name ? (
                <>
                  <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate max-w-24">{resource.supplier_name}</span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-60" />
                </>
              ) : (
                <span className="text-muted-foreground/60 italic flex items-center gap-1">
                  Sin proveedor
                  <Pencil className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          )}
        </div>
        
        {/* 3. €Coste ud compra - Editable inline */}
        <div className="w-20 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_unit_cost || ''}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_unit_cost: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium">{formatCurrency(displayPurchaseCost)}</span>
          )}
        </div>
        
        {/* 4. %IVA - Editable inline */}
        <div className="w-14 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_vat_percent || '21'}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_vat_percent: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{formatNumber(displayVatPercent)}%</span>
          )}
        </div>
        
        {/* 5. Ud medida lista compra - Editable inline */}
        <div className="w-20 text-center">
          {isEditing ? (
            <Select
              value={editValues.purchase_unit_measure || 'ud'}
              onValueChange={(v) => setEditValues(prev => ({ ...prev, purchase_unit_measure: v }))}
            >
              <SelectTrigger className="h-6 text-xs px-1" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map(unit => (
                  <SelectItem key={unit} value={unit} className="text-xs">{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">{displayPurchaseUnitMeasure}</span>
          )}
        </div>
        
        {/* 6. Uds compra - Editable inline */}
        <div className="w-20 text-center">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={editValues.purchase_units || ''}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchase_units: e.target.value }))}
              className="h-6 text-xs text-center px-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium">{formatNumber(displayPurchaseUnits)}</span>
          )}
        </div>
        
        {/* 7. €SubTotal compra */}
        <div className="w-24 text-right">
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(buyingSubtotal)}</span>
        </div>
        
        {/* Actions */}
        <div className="w-20 flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary"
                onClick={(e) => { e.stopPropagation(); saveEditing(); }}
                title="Guardar"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); startEditing(resource); }}
                title="Editar inline"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              {onEditResource && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onEditResource(resource); }}
                  title="Editar recurso"
                >
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {onDeleteResource && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDeleteResource(resource.id); }}
                  title="Borrar recurso"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // Resource header row for activity/supplier views
  const ResourceHeaderFull = ({ showActivity = false }: { showActivity?: boolean }) => (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 text-[10px] text-muted-foreground font-medium border-b">
      <div className="w-4" />
      <div className="flex-1 min-w-0">{showActivity ? 'Recurso / Actividad' : 'Recurso'}</div>
      <div className="w-32 text-center hidden sm:block">Proveedor</div>
      <div className="w-20 text-center">€Coste ud</div>
      <div className="w-16 text-center">%IVA</div>
      <div className="w-16 text-center">Ud medida</div>
      <div className="w-20 text-center">Uds compra</div>
      <div className="w-20 text-center">€IVA</div>
      <div className="w-24 text-right">€SubTotal</div>
      <div className="w-24 text-center">Acciones</div>
    </div>
  );

  // Resource header row for "Por Recurso" view (simplified columns with selection)
  const ResourceHeaderSimple = ({ resourceIds }: { resourceIds: string[] }) => {
    const allSelected = resourceIds.length > 0 && resourceIds.every(id => selectedResources.has(id));
    const someSelected = resourceIds.some(id => selectedResources.has(id));
    
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 text-[10px] text-muted-foreground font-medium border-b">
        <Checkbox
          checked={allSelected}
          onCheckedChange={() => toggleSelectAll(resourceIds)}
          className="flex-shrink-0"
          data-state={someSelected && !allSelected ? "indeterminate" : undefined}
        />
        <div className="w-4" />
        <div className="flex-1 min-w-0">Recurso</div>
        <div className="w-36 text-center">Proveedor</div>
        <div className="w-20 text-center">€Coste ud</div>
        <div className="w-14 text-center">%IVA</div>
        <div className="w-20 text-center">Ud medida</div>
        <div className="w-20 text-center">Uds compra</div>
        <div className="w-24 text-right">€SubTotal</div>
        <div className="w-20 text-center">Acciones</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters: Date Range + Search */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium text-sm">Filtrar por rango de fechas reales:</span>
            <span className="text-xs text-muted-foreground">
              Solo actividades con <span className="font-medium">Uso en Presupuesto</span>: <span className="font-medium">Sí</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <Label htmlFor="startDate" className="text-xs text-muted-foreground">Fecha real inicio</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endDate" className="text-xs text-muted-foreground">Fecha real final</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="mt-5"
            >
              Limpiar
            </Button>
          )}
        </div>
        
        {/* Search */}
        <div className="space-y-1">
          <Label htmlFor="search" className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder="Recurso, proveedor, actividad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-56 pl-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex-1" />
        
        {/* Print All Button */}
        {budgetInfo && filteredResources.length > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => exportBuyingListAllPdf(budgetInfo, filteredResources, filteredActivities, phases)}
            className="gap-2"
            title="Imprimir toda la lista de compra"
          >
            <Printer className="h-4 w-4" />
            Imprimir Todo
          </Button>
        )}
        
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        )}
        
        <Badge variant="secondary" className="h-7">
          Total: {formatCurrency(grandTotal)}
        </Badge>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
        <span className="text-sm font-medium text-muted-foreground mr-2">Vista:</span>
        <div className="inline-flex rounded-md border">
          <Button
            variant={viewMode === 'activity' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('activity')}
            className="rounded-r-none"
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Por Actividad
          </Button>
          <Button
            variant={viewMode === 'supplier' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('supplier')}
            className="rounded-none border-x"
          >
            <Building2 className="h-4 w-4 mr-1" />
            Por Proveedor
          </Button>
          <Button
            variant={viewMode === 'resource' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('resource')}
            className="rounded-none border-r"
          >
            <Package className="h-4 w-4 mr-1" />
            Por Recurso
          </Button>
          <Button
            variant={viewMode === 'messages' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('messages')}
            className="rounded-l-none"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Mensajes
          </Button>
        </div>
      </div>

      {/* Purchase Unit Dialog */}
      <PurchaseUnitDialog
        open={!!dialogResource}
        onOpenChange={(open) => !open && setDialogResource(null)}
        resource={dialogResource}
        onSaved={() => {
          onRefresh?.();
          setDialogResource(null);
        }}
      />

      {/* Empty State */}
      {filteredResources.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>
            {startDate || endDate
              ? 'No hay recursos en el rango de fechas seleccionado'
              : 'No hay recursos con actividades asignadas'}
          </p>
        </div>
      )}

      {/* View: By Activity */}
      {viewMode === 'activity' && activityGroupedData.length > 0 && (
        <div className="space-y-2">
          {activityGroupedData.map(({ activity, resources: actResources, total }) => {
            const isExpanded = expandedGroups.has(activity.id);
            
            return (
              <Collapsible key={activity.id} open={isExpanded} onOpenChange={() => toggleGroup(activity.id)}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <ClipboardList className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-semibold truncate text-sm">
                          {formatActivityId(activity)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {actResources.length} recurso{actResources.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      
                      {/* Inline date pickers */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-[10px] text-muted-foreground">Inicio:</span>
                        <InlineDatePicker
                          value={activity.actual_start_date || null}
                          onChange={(v) => handleActivityDateChange(activity.id, 'actual_start_date', v)}
                          placeholder="Sin fecha"
                          className="h-6 w-28 text-[10px]"
                        />
                        <span className="text-[10px] text-muted-foreground ml-1">Fin:</span>
                        <InlineDatePicker
                          value={activity.actual_end_date || null}
                          onChange={(v) => handleActivityDateChange(activity.id, 'actual_end_date', v)}
                          placeholder="Sin fecha"
                          className="h-6 w-28 text-[10px]"
                        />
                      </div>
                      
                      {/* Print button for this activity */}
                      {budgetInfo && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportBuyingListByActivityPdf(
                              budgetInfo,
                              filteredResources,
                              filteredActivities,
                              phases,
                              activity.id,
                              formatActivityId(activity)
                            );
                          }}
                          title={`Imprimir recursos de ${formatActivityId(activity)}`}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency(total)}</p>
                        <p className="text-[10px] text-muted-foreground">Total Compra</p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t">
                      <ResourceHeaderFull />
                      {actResources.map(resource => renderResourceRowFull(resource))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* View: By Supplier */}
      {viewMode === 'supplier' && supplierGroupedData.length > 0 && (
        <div className="space-y-2">
          {supplierGroupedData.map(({ supplierId, supplierName, resources: suppResources, total }) => {
            const isExpanded = expandedGroups.has(supplierId);
            const isNoSupplier = supplierId === '__no_supplier__';
            
            return (
              <Collapsible key={supplierId} open={isExpanded} onOpenChange={() => toggleGroup(supplierId)}>
                <div className={cn("border rounded-lg", isNoSupplier && "border-dashed border-muted-foreground/50")}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <Building2 className={cn("h-4 w-4 flex-shrink-0", isNoSupplier ? "text-muted-foreground" : "text-primary")} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-semibold truncate", isNoSupplier && "text-muted-foreground")}>
                          {supplierName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {suppResources.length} recurso{suppResources.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      
                      {/* Print button for this supplier */}
                      {budgetInfo && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportBuyingListBySupplierPdf(
                              budgetInfo,
                              filteredResources,
                              filteredActivities,
                              phases,
                              supplierId,
                              supplierName,
                              supplierDetails
                            );
                          }}
                          title={`Imprimir recursos de ${supplierName}`}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency(total)}</p>
                        <p className="text-[10px] text-muted-foreground">Total Compra</p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t">
                      <ResourceHeaderFull showActivity />
                      {suppResources.map(resource => renderResourceRowFull(resource, true))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* View: By Resource (flat list) */}
      {viewMode === 'resource' && resourceList.length > 0 && (
        <div className="border rounded-lg">
          {/* Total header row above the column headers */}
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-xs font-semibold border-b">
            <div className="w-5" /> {/* Space for checkbox */}
            <div className="w-4" />
            <div className="flex-1 min-w-0">
              {selectedResources.size > 0 && (
                <span className="text-muted-foreground font-normal text-xs">
                  {selectedResources.size} seleccionado{selectedResources.size !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="w-36" />
            <div className="w-20" />
            <div className="w-14" />
            <div className="w-20" />
            <div className="w-20" />
            <div className="w-24 text-right">
              <p className="text-primary">{formatCurrency(grandTotal)}</p>
              <p className="text-[9px] text-muted-foreground font-normal">Total Compra</p>
            </div>
            <div className="w-20 flex justify-center gap-1">
              {budgetInfo && selectedResources.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => exportBuyingListSelectedPdf(
                    budgetInfo, 
                    filteredResources, 
                    filteredActivities, 
                    phases, 
                    [...selectedResources]
                  )}
                  title="Imprimir recursos seleccionados"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Selección
                </Button>
              )}
              {budgetInfo && selectedResources.size === 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => exportBuyingListAllPdf(budgetInfo, filteredResources, filteredActivities, phases)}
                  title="Imprimir todo"
                >
                  <Printer className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <ResourceHeaderSimple resourceIds={resourceList.map(r => r.id)} />
          {resourceList.map(resource => renderResourceRowSimple(resource))}
        </div>
      )}

      {/* View: Messages */}
      {viewMode === 'messages' && (
        <BudgetMessagesList
          budgetId={budgetId}
          activities={activities.length > 0 ? activities : initialActivities}
          phases={phases}
          resources={resources.length > 0 ? resources : initialResources}
          filterStartDate={startDate}
          filterEndDate={endDate}
        />
      )}
    </div>
  );
}

export default BuyingListUnified;
