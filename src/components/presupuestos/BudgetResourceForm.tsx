import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { toast } from 'sonner';
import { formatCurrency, formatPercent } from '@/lib/format-utils';

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

interface BudgetResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  resource: BudgetResource | null;
  activities: Activity[];
  phases: Phase[];
  onSave: () => void;
}

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
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
  });

  useEffect(() => {
    if (resource) {
      setFormData({
        name: resource.name,
        external_unit_cost: resource.external_unit_cost || 0,
        unit: resource.unit || 'ud',
        resource_type: resource.resource_type || 'Producto',
        safety_margin_percent: resource.safety_margin_percent || 0.15,
        sales_margin_percent: resource.sales_margin_percent || 0.25,
        manual_units: resource.manual_units,
        related_units: resource.related_units,
        activity_id: resource.activity_id || '',
      });
    } else {
      setFormData({
        name: '',
        external_unit_cost: 0,
        unit: 'ud',
        resource_type: 'Producto',
        safety_margin_percent: 0.15,
        sales_margin_percent: 0.25,
        manual_units: null,
        related_units: null,
        activity_id: '',
      });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('El nombre del recurso es obligatorio');
      return;
    }

    setLoading(true);
    try {
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
        activity_id: formData.activity_id || null,
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

      onSave();
    } catch (error) {
      console.error('Error saving resource:', error);
      toast.error('Error al guardar el recurso');
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
                onChange={(value) => setFormData({ ...formData, external_unit_cost: value })}
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

          {/* Row 2: Safety Margin */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="safety_margin_percent">%Margen seguridad</Label>
              <NumericInput
                id="safety_margin_percent"
                value={formData.safety_margin_percent}
                onChange={(value) => setFormData({ ...formData, safety_margin_percent: value })}
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
                value={formData.sales_margin_percent}
                onChange={(value) => setFormData({ ...formData, sales_margin_percent: value })}
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
                value={calculatedUnits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                disabled
                className="bg-muted font-semibold"
              />
            </div>
          </div>

          {/* Row 5: Activity Relation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="activity_id">Actividad relacionada</Label>
              <Select
                value={formData.activity_id}
                onValueChange={(value) => setFormData({ ...formData, activity_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar actividad (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin actividad</SelectItem>
                  {activities.map((activity) => (
                    <SelectItem key={activity.id} value={activity.id}>
                      {getActivityDisplay(activity.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
