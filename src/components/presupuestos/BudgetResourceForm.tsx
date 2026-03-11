import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { addDays, format } from 'date-fns';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatCurrency, formatPercent } from '@/lib/format-utils';
import { getActivityMeasurementUnits, syncActivityResourcesRelatedUnits } from '@/lib/budget-utils';
import { ResourceSupplierSelect } from '@/components/ResourceSupplierSelect';

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
  supplier_id: string | null;
  signed_subtotal: number | null;
  purchase_vat_percent?: number | null;
  purchase_units?: number | null;
  purchase_unit_measure?: string | null;
  purchase_unit_cost?: number | null;
  is_estimation?: boolean;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phase_id: string | null;
  measurement_id?: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface BudgetResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  resource: BudgetResource | null;
  activities: Activity[];
  phases: Phase[];
  onSave: () => void;
}

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos', 'Tarea'];
const UNIT_MEASURES = ['m2', 'm3', 'ml', 'ud', 'mes', 'kg', 'hora', 'día'];

export function BudgetResourceForm({
  open,
  onOpenChange,
  budgetId,
  resource,
  activities,
  phases,
  onSave,
}: BudgetResourceFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    external_unit_cost: 0,
    unit: 'ud',
    resource_type: 'Producto',
    safety_margin_percent: 0.15,
    sales_margin_percent: 0.25,
    manual_units: null as number | null,
    related_units: null as number | null,
    activity_id: '',
    start_date: '',
    duration_days: 1,
    task_status: 'pendiente' as 'pendiente' | 'realizada',
    supplier_id: null as string | null,
    // Buying list specific fields
    purchase_vat_percent: 21,
    purchase_units: null as number | null,
    purchase_unit_measure: '',
    purchase_unit_cost: null as number | null,
    is_estimation: false,
  });

  // Calculate end date for tasks
  const endDate = useMemo(() => {
    if (formData.resource_type === 'Tarea' && formData.start_date) {
      return format(addDays(new Date(formData.start_date), formData.duration_days - 1), 'yyyy-MM-dd');
    }
    return '';
  }, [formData.resource_type, formData.start_date, formData.duration_days]);
  
  // Fetch related_units when activity changes
  const handleActivityChange = useCallback(async (activityId: string) => {
    setFormData(prev => ({ ...prev, activity_id: activityId }));
    
    if (activityId) {
      const relatedUnits = await getActivityMeasurementUnits(activityId);
      setFormData(prev => ({ ...prev, related_units: relatedUnits }));
    } else {
      setFormData(prev => ({ ...prev, related_units: null }));
    }
  }, []);

  useEffect(() => {
    const initFormData = async () => {
      if (resource) {
        // First load the existing data including task-specific fields
        const resourceWithTaskFields = resource as BudgetResource & { 
          start_date?: string | null; 
          duration_days?: number | null; 
          task_status?: string | null;
        };
        
        setFormData({
          name: resource.name,
          external_unit_cost: resource.external_unit_cost || 0,
          unit: resource.unit || 'ud',
          resource_type: resource.resource_type || 'Producto',
          safety_margin_percent: resource.safety_margin_percent ?? 0.15,
          sales_margin_percent: resource.sales_margin_percent ?? 0.25,
          manual_units: resource.manual_units,
          related_units: resource.related_units,
          activity_id: resource.activity_id || '',
          start_date: resourceWithTaskFields.start_date || '',
          duration_days: resourceWithTaskFields.duration_days || 1,
          task_status: (resourceWithTaskFields.task_status as 'pendiente' | 'realizada') || 'pendiente',
          supplier_id: resource.supplier_id || null,
          // Buying list specific fields
          purchase_vat_percent: resource.purchase_vat_percent ?? 21,
          purchase_units: resource.purchase_units ?? null,
          purchase_unit_measure: resource.purchase_unit_measure || '',
          purchase_unit_cost: resource.purchase_unit_cost ?? null,
          is_estimation: resource.is_estimation ?? false,
        });
        
        // If resource has an activity, recalculate related_units to ensure it's up-to-date
        if (resource.activity_id) {
          const freshRelatedUnits = await getActivityMeasurementUnits(resource.activity_id);
          if (freshRelatedUnits !== null && freshRelatedUnits !== resource.related_units) {
            setFormData(prev => ({ ...prev, related_units: freshRelatedUnits }));
          }
        }
      } else {
        // Check for preselected activity from navigation
        const preselectedActivityId = window.sessionStorage.getItem('preselectedActivityId');
        
        setFormData({
          name: '',
          external_unit_cost: 0,
          unit: 'ud',
          resource_type: 'Producto',
          safety_margin_percent: 0.15,
          sales_margin_percent: 0.25,
          manual_units: null,
          related_units: null,
          activity_id: preselectedActivityId || '',
          start_date: '',
          duration_days: 1,
          task_status: 'pendiente',
          supplier_id: null,
          // Buying list specific fields
          purchase_vat_percent: 21,
          purchase_units: null,
          purchase_unit_measure: '',
          purchase_unit_cost: null,
          is_estimation: false,
        });
        
        // If preselected activity, fetch related_units
        if (preselectedActivityId) {
          const relatedUnits = await getActivityMeasurementUnits(preselectedActivityId);
          setFormData(prev => ({ ...prev, related_units: relatedUnits }));
          window.sessionStorage.removeItem('preselectedActivityId');
        }
      }
    };
    
    if (open) {
      initFormData();
    }
  }, [resource, open]);

  // Calculate derived fields
  const safetyMarginUd = formData.external_unit_cost * formData.safety_margin_percent;
  const internalCostUd = formData.external_unit_cost + safetyMarginUd;
  const salesMarginUd = internalCostUd * formData.sales_margin_percent;
  const salesCostUd = internalCostUd + salesMarginUd;
  const calculatedUnits = formData.manual_units !== null 
    ? formData.manual_units 
    : (formData.related_units || 0);
  const subtotalSales = calculatedUnits * salesCostUd;

  // Get ActivityID display for an activity
  const getActivityDisplay = (activityId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return '';
    
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.-${activity.name}`;
  };

  // Activity options sorted alphabetically by ActividadID with search content
  const activityOptions = useMemo(() => {
    return activities
      .map(a => {
        const phase = a.phase_id ? phases.find(p => p.id === a.phase_id) : null;
        const actividadId = `${phase?.code || ''} ${a.code}.-${a.name}`;
        const searchContent = `${phase?.code || ''} ${phase?.name || ''} ${a.code} ${a.name}`.toLowerCase();
        return {
          value: a.id,
          label: actividadId,
          searchContent,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activities, phases]);

  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);

  const filteredActivities = useMemo(() => {
    const query = activitySearchQuery.toLowerCase().trim();
    if (!query) return activityOptions;
    return activityOptions.filter(opt => opt.searchContent.includes(query));
  }, [activityOptions, activitySearchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('El nombre del recurso es obligatorio');
      return;
    }

    setLoading(true);
    try {
      // Ensure activity_id is a valid UUID or null (not empty string or "null")
      const activityId = formData.activity_id && formData.activity_id !== '' && formData.activity_id !== 'null' 
        ? formData.activity_id 
        : null;
      
      const data = {
        budget_id: budgetId,
        name: formData.name.trim(),
        external_unit_cost: formData.external_unit_cost,
        unit: formData.unit,
        resource_type: formData.resource_type,
        safety_margin_percent: formData.safety_margin_percent,
        sales_margin_percent: formData.sales_margin_percent,
        manual_units: formData.manual_units,
        related_units: formData.related_units,
        activity_id: activityId,
        start_date: formData.resource_type === 'Tarea' ? (formData.start_date || null) : null,
        duration_days: formData.resource_type === 'Tarea' ? formData.duration_days : null,
        task_status: formData.resource_type === 'Tarea' ? formData.task_status : null,
        supplier_id: formData.supplier_id,
        // Buying list specific fields
        purchase_vat_percent: formData.purchase_vat_percent,
        purchase_units: formData.purchase_units,
        purchase_unit_measure: formData.purchase_unit_measure || null,
        purchase_unit_cost: formData.purchase_unit_cost,
        is_estimation: formData.is_estimation,
      };

      if (resource) {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update(data)
          .eq('id', resource.id);
        
        if (error) throw error;
        toast.success('Recurso actualizado correctamente');
      } else {
        const { error } = await supabase
          .from('budget_activity_resources')
          .insert(data);
        
        if (error) throw error;
        toast.success('Recurso creado correctamente');
      }

      // Sync related_units for the activity if resource is assigned to one
      if (activityId) {
        await syncActivityResourcesRelatedUnits(activityId);
      }

      onSave();
    } catch (error: any) {
      console.error('Error saving resource:', error);
      const errorMessage = error?.message || error?.details || 'Error desconocido';
      toast.error(`Error al guardar el recurso: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resource ? 'Editar Recurso' : 'Nuevo Recurso'}</DialogTitle>
          <DialogDescription>
            {resource ? 'Modifica los datos del recurso' : 'Introduce los datos del nuevo recurso'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Resource Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Recurso *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nombre del recurso"
              required
            />
          </div>

          {/* Row 1: Cost, Unit, Type */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="external_unit_cost">€Coste ud externa</Label>
              <NumericInput
                id="external_unit_cost"
                value={formData.external_unit_cost}
                onChange={(value) => setFormData({ ...formData, external_unit_cost: value ?? 0 })}
                decimals={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Ud medida</Label>
              <Select
                value={formData.unit}
                onValueChange={(value) => setFormData({ ...formData, unit: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar unidad" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_MEASURES.map((unit) => (
                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource_type">Tipo Recurso</Label>
              <Select
                value={formData.resource_type}
                onValueChange={(value) => setFormData({ ...formData, resource_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task-specific fields: Show only when resource type is Tarea */}
          {formData.resource_type === 'Tarea' && (
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg border border-dashed">
              <div className="col-span-4 text-sm font-medium text-muted-foreground">
                Campos específicos de Tarea
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_date">Fecha inicio</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duración (días)</Label>
                <Input
                  id="duration_days"
                  type="number"
                  min="1"
                  value={formData.duration_days}
                  onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha fin (calculada)</Label>
                <Input
                  value={endDate || '-'}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_status">Estado</Label>
                <Select
                  value={formData.task_status}
                  onValueChange={(value) => setFormData({ ...formData, task_status: value as 'pendiente' | 'realizada' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Row 2: Safety Margin */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="safety_margin_percent">%Margen seguridad</Label>
              <NumericInput
                id="safety_margin_percent"
                value={formData.safety_margin_percent * 100}
                onChange={(value) => setFormData({ ...formData, safety_margin_percent: Math.max(0, value ?? 0) / 100 })}
                decimals={2}
              />
            </div>
            <div className="space-y-2">
              <Label>€Margen seguridad ud</Label>
              <Input
                value={formatCurrency(safetyMarginUd)}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>€Coste ud interna</Label>
              <Input
                value={formatCurrency(internalCostUd)}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          {/* Row 3: Sales Margin */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sales_margin_percent">%Margen venta</Label>
              <NumericInput
                id="sales_margin_percent"
                value={formData.sales_margin_percent * 100}
                onChange={(value) => setFormData({ ...formData, sales_margin_percent: Math.max(0, value ?? 0) / 100 })}
                decimals={2}
              />
            </div>
            <div className="space-y-2">
              <Label>€Margen venta ud</Label>
              <Input
                value={formatCurrency(salesMarginUd)}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>€Coste venta ud</Label>
              <Input
                value={formatCurrency(salesCostUd)}
                disabled
                className="bg-muted font-semibold"
              />
            </div>
          </div>

          {/* Row 4: Units */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manual_units">Uds manual</Label>
              <NumericInput
                id="manual_units"
                value={formData.manual_units ?? 0}
                onChange={(value) => setFormData({ ...formData, manual_units: value === 0 ? null : value })}
                decimals={2}
              />
              <p className="text-xs text-muted-foreground">Dejar vacío para usar Uds relacionadas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="related_units">Uds relacionadas</Label>
              <NumericInput
                id="related_units"
                value={formData.related_units ?? 0}
                onChange={(value) => setFormData({ ...formData, related_units: value === 0 ? null : value })}
                decimals={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Uds calculadas</Label>
              <Input
                value={calculatedUnits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })}
                disabled
                className="bg-muted font-semibold"
              />
            </div>
          </div>

          {/* Row 4.5: Buying List Fields */}
          {(() => {
            // Calculate buying list values
            const purchaseUnitCost = formData.purchase_unit_cost ?? formData.external_unit_cost;
            const purchaseUnits = formData.purchase_units ?? calculatedUnits;
            const purchaseVatPercent = formData.purchase_vat_percent ?? 21;
            const vatAmount = purchaseUnitCost * purchaseUnits * (purchaseVatPercent / 100);
            const purchaseSubtotal = (purchaseUnitCost * purchaseUnits) + vatAmount;
            
            return (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="col-span-6 text-sm font-medium text-blue-700 dark:text-blue-400 mb-3">
                  Campos Lista de Compra
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_unit_cost">€Coste ud compra</Label>
                    <NumericInput
                      id="purchase_unit_cost"
                      value={formData.purchase_unit_cost ?? formData.external_unit_cost}
                      onChange={(value) => setFormData({ ...formData, purchase_unit_cost: value === formData.external_unit_cost ? null : value })}
                      decimals={2}
                    />
                    <p className="text-xs text-muted-foreground">Por defecto = €Coste ud externa</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_vat_percent">%IVA</Label>
                    <NumericInput
                      id="purchase_vat_percent"
                      value={formData.purchase_vat_percent}
                      onChange={(value) => setFormData({ ...formData, purchase_vat_percent: value ?? 21 })}
                      decimals={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>€Importe IVA</Label>
                    <Input
                      value={formatCurrency(vatAmount)}
                      disabled
                      className="bg-blue-100 dark:bg-blue-900/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_unit_measure">Ud medida lista compra</Label>
                    <Select
                      value={formData.purchase_unit_measure !== '' ? formData.purchase_unit_measure : formData.unit}
                      onValueChange={(value) => setFormData({ ...formData, purchase_unit_measure: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar unidad" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_MEASURES.map((unit) => (
                          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Por defecto = Ud medida</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_units">Uds compra</Label>
                    <NumericInput
                      id="purchase_units"
                      value={formData.purchase_units !== null ? formData.purchase_units : calculatedUnits}
                      onChange={(value) => setFormData({ ...formData, purchase_units: value })}
                      decimals={2}
                    />
                    <p className="text-xs text-muted-foreground">Por defecto = Uds calculadas ({calculatedUnits})</p>
                  </div>
                  <div className="space-y-2">
                    <Label>€SubTotal compra</Label>
                    <Input
                      value={formatCurrency(purchaseSubtotal)}
                      disabled
                      className="bg-blue-100 dark:bg-blue-900/50 font-semibold"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Row 5: Activity Relation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="activity_id">Actividad relacionada</Label>
              <Popover open={activityPopoverOpen} onOpenChange={setActivityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={activityPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {formData.activity_id ? getActivityDisplay(formData.activity_id) : 'Sin actividad'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Buscar actividad..." 
                      value={activitySearchQuery}
                      onValueChange={setActivitySearchQuery}
                    />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No se encontraron actividades.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            handleActivityChange('');
                            setActivityPopoverOpen(false);
                            setActivitySearchQuery('');
                          }}
                          className="cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              !formData.activity_id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          Sin actividad
                        </CommandItem>
                        {filteredActivities.map((opt) => (
                          <CommandItem
                            key={opt.value}
                            value={opt.value}
                            onSelect={() => {
                              handleActivityChange(opt.value);
                              setActivityPopoverOpen(false);
                              setActivitySearchQuery('');
                            }}
                            className="cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.activity_id === opt.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>€Subtotal venta</Label>
              <Input
                value={formatCurrency(subtotalSales)}
                disabled
                className="bg-primary/10 font-bold text-primary"
              />
            </div>
          </div>

          {/* Row 5.5: Signed Subtotal (read-only, only shown when exists) */}
          {resource?.signed_subtotal !== null && resource?.signed_subtotal !== undefined && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-amber-700 dark:text-amber-400 font-semibold">
                    €Subtotal Firmado
                  </Label>
                  <Input
                    value={formatCurrency(resource.signed_subtotal)}
                    disabled
                    className="bg-amber-100 dark:bg-amber-900/50 font-bold text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Este valor quedó fijado cuando se firmó el presupuesto y no puede modificarse
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Desviación</Label>
                  <Input
                    value={`${formatCurrency(subtotalSales - resource.signed_subtotal)} (${((subtotalSales - resource.signed_subtotal) / resource.signed_subtotal * 100).toFixed(1)}%)`}
                    disabled
                    className={cn(
                      "font-semibold",
                      subtotalSales > resource.signed_subtotal 
                        ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400" 
                        : subtotalSales < resource.signed_subtotal
                        ? "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400"
                        : "bg-muted"
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Row 6: Supplier */}
          <div className="space-y-2">
            <Label htmlFor="supplier_id">Suministrador / Proveedor</Label>
            <ResourceSupplierSelect
              value={formData.supplier_id}
              onChange={(supplierId) => setFormData({ ...formData, supplier_id: supplierId })}
            />
            <p className="text-xs text-muted-foreground">
              Seleccione el contacto proveedor de este recurso o cree uno nuevo
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : (resource ? 'Actualizar' : 'Crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
