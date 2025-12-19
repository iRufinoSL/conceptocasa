import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, X, Undo2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getActivityMeasurementUnits } from '@/lib/budget-utils';

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

interface UndoState {
  field: string;
  previousValues: Map<string, any>;
  timestamp: Date;
}

interface BulkEditBarProps {
  selectedIds: Set<string>;
  resources: BudgetResource[];
  activities: Activity[];
  phases: Phase[];
  onClearSelection: () => void;
  onRefresh: () => void;
  onBulkDelete: () => void;
  isAdmin: boolean;
}

const BULK_EDIT_FIELDS = [
  { value: 'resource_type', label: 'Tipo recurso', type: 'select' },
  { value: 'unit', label: 'Ud medida', type: 'select' },
  { value: 'safety_margin_percent', label: '% Margen seguridad', type: 'percent' },
  { value: 'sales_margin_percent', label: '% Margen venta', type: 'percent' },
  { value: 'external_unit_cost', label: '€ Coste ud ext.', type: 'number' },
  { value: 'manual_units', label: 'Uds manuales', type: 'number' },
  { value: 'activity_id', label: 'Actividad', type: 'activity' },
];

const RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio'];
const UNITS = ['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'];

export function BulkEditBar({
  selectedIds,
  resources,
  activities,
  phases,
  onClearSelection,
  onRefresh,
  onBulkDelete,
  isAdmin,
}: BulkEditBarProps) {
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState<string | number>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);

  const selectedResources = resources.filter(r => selectedIds.has(r.id));
  const selectedField = BULK_EDIT_FIELDS.find(f => f.value === bulkEditField);

  const getActivityDisplayName = (activityId: string | null) => {
    if (!activityId) return 'Sin actividad';
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return 'Desconocida';
    const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
    return `${phase?.code || ''} ${activity.code}.-${activity.name}`;
  };

  const getFieldDisplayValue = (resource: BudgetResource, field: string): string => {
    const value = resource[field as keyof BudgetResource];
    if (value === null || value === undefined) return '-';
    
    if (field === 'activity_id') {
      return getActivityDisplayName(value as string);
    }
    if (field === 'safety_margin_percent' || field === 'sales_margin_percent') {
      return `${((value as number) * 100).toFixed(0)}%`;
    }
    if (field === 'external_unit_cost' || field === 'manual_units') {
      return String(value);
    }
    return String(value);
  };

  const getNewValueDisplay = (): string => {
    if (!selectedField || bulkEditValue === '') return '';
    
    if (selectedField.type === 'percent') {
      const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
      return isNaN(numVal) ? '' : `${numVal}%`;
    }
    if (selectedField.type === 'activity') {
      if (bulkEditValue === '__none__') return 'Sin actividad';
      return getActivityDisplayName(bulkEditValue as string);
    }
    return String(bulkEditValue);
  };

  const handleApplyBulkEdit = useCallback(async () => {
    if (selectedIds.size === 0 || !bulkEditField) {
      toast.error('Selecciona filas y un campo a editar');
      return;
    }

    setIsUpdating(true);
    try {
      // Save previous values for undo
      const previousValues = new Map<string, any>();
      selectedResources.forEach(r => {
        previousValues.set(r.id, r[bulkEditField as keyof BudgetResource]);
      });

      let updateValue: any = bulkEditValue;
      
      // Handle percentage fields - convert from display percentage to decimal
      if (bulkEditField === 'safety_margin_percent' || bulkEditField === 'sales_margin_percent') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : numVal / 100;
      } else if (bulkEditField === 'external_unit_cost' || bulkEditField === 'manual_units') {
        const numVal = typeof bulkEditValue === 'number' ? bulkEditValue : parseFloat(String(bulkEditValue).replace(',', '.'));
        updateValue = isNaN(numVal) ? null : numVal;
      } else if (bulkEditField === 'activity_id' && bulkEditValue === '__none__') {
        updateValue = null;
      }

      // If changing activity, also update related_units
      if (bulkEditField === 'activity_id') {
        const relatedUnits = updateValue ? await getActivityMeasurementUnits(updateValue) : null;
        
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({ 
            activity_id: updateValue,
            related_units: relatedUnits
          })
          .in('id', Array.from(selectedIds));

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({ [bulkEditField]: updateValue })
          .in('id', Array.from(selectedIds));

        if (error) throw error;
      }

      // Add to undo stack
      setUndoStack(prev => [...prev, {
        field: bulkEditField,
        previousValues,
        timestamp: new Date(),
      }]);

      toast.success(`${selectedIds.size} recursos actualizados`, {
        action: {
          label: 'Deshacer',
          onClick: () => handleUndo({
            field: bulkEditField,
            previousValues,
            timestamp: new Date(),
          }),
        },
      });
      
      setBulkEditField('');
      setBulkEditValue('');
      setConfirmDialogOpen(false);
      onRefresh();
    } catch (error) {
      console.error('Error bulk updating:', error);
      toast.error('Error al actualizar recursos');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedIds, bulkEditField, bulkEditValue, selectedResources, onRefresh]);

  const handleUndo = useCallback(async (undoState: UndoState) => {
    setIsUpdating(true);
    try {
      // Restore each resource to its previous value
      const updates = Array.from(undoState.previousValues.entries()).map(async ([id, value]) => {
        if (undoState.field === 'activity_id') {
          const relatedUnits = value ? await getActivityMeasurementUnits(value) : null;
          return supabase
            .from('budget_activity_resources')
            .update({ 
              activity_id: value,
              related_units: relatedUnits
            })
            .eq('id', id);
        }
        return supabase
          .from('budget_activity_resources')
          .update({ [undoState.field]: value })
          .eq('id', id);
      });

      await Promise.all(updates);

      // Remove from undo stack
      setUndoStack(prev => prev.filter(u => u !== undoState));
      
      toast.success('Cambios deshechos');
      onRefresh();
    } catch (error) {
      console.error('Error undoing:', error);
      toast.error('Error al deshacer');
    } finally {
      setIsUpdating(false);
    }
  }, [onRefresh]);

  const handleUndoLast = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastUndo = undoStack[undoStack.length - 1];
    handleUndo(lastUndo);
  }, [undoStack, handleUndo]);

  const renderValueInput = () => {
    if (!selectedField) return null;

    switch (selectedField.type) {
      case 'select':
        if (bulkEditField === 'resource_type') {
          return (
            <Select value={bulkEditValue as string} onValueChange={setBulkEditValue}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Tipo..." />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        if (bulkEditField === 'unit') {
          return (
            <Select value={bulkEditValue as string} onValueChange={setBulkEditValue}>
              <SelectTrigger className="w-[100px] h-8">
                <SelectValue placeholder="Unidad..." />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map(unit => (
                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return null;

      case 'percent':
        return (
          <div className="flex items-center gap-1">
            <NumericInput
              value={bulkEditValue as number}
              onChange={(val) => setBulkEditValue(val ?? '')}
              className="w-[80px] h-8"
              placeholder="0"
              min={0}
              max={100}
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
        );

      case 'number':
        return (
          <NumericInput
            value={bulkEditValue as number}
            onChange={(val) => setBulkEditValue(val ?? '')}
            className="w-[100px] h-8"
            placeholder="0"
            decimals={2}
          />
        );

      case 'activity':
        return (
          <Select value={bulkEditValue as string} onValueChange={setBulkEditValue}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Actividad..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin actividad</SelectItem>
              {activities.map(activity => {
                const phase = activity.phase_id ? phases.find(p => p.id === activity.phase_id) : null;
                const displayName = `${phase?.code || ''} ${activity.code}.-${activity.name}`;
                return (
                  <SelectItem key={activity.id} value={activity.id}>
                    {displayName}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );

      default:
        return (
          <Input
            value={bulkEditValue as string}
            onChange={(e) => setBulkEditValue(e.target.value)}
            className="w-[120px] h-8"
            placeholder="Valor..."
          />
        );
    }
  };

  if (selectedIds.size === 0) return null;

  return (
    <>
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 animate-in slide-in-from-top-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Selection count */}
          <Badge variant="secondary" className="h-7">
            {selectedIds.size} seleccionados
          </Badge>

          {/* Field selector */}
          <Select value={bulkEditField} onValueChange={(v) => { setBulkEditField(v); setBulkEditValue(''); }}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue placeholder="Campo a editar..." />
            </SelectTrigger>
            <SelectContent>
              {BULK_EDIT_FIELDS.map(field => (
                <SelectItem key={field.value} value={field.value}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value input */}
          {bulkEditField && renderValueInput()}

          {/* Apply button */}
          {bulkEditField && bulkEditValue !== '' && (
            <Button
              size="sm"
              onClick={() => setConfirmDialogOpen(true)}
              disabled={isUpdating}
              className="h-8"
            >
              <Check className="h-4 w-4 mr-1" />
              Aplicar
            </Button>
          )}

          {/* Undo button */}
          {undoStack.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleUndoLast}
              disabled={isUpdating}
              className="h-8"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Deshacer ({undoStack.length})
            </Button>
          )}

          <div className="flex-1" />

          {/* Delete button */}
          {isAdmin && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onBulkDelete}
              disabled={isUpdating}
              className="h-8"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
          )}

          {/* Clear selection */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            className="h-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirmar edición masiva
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Se actualizará el campo <strong>{selectedField?.label}</strong> a{' '}
                  <strong>{getNewValueDisplay()}</strong> en {selectedIds.size} recursos.
                </p>
                
                {/* Preview of changes */}
                <div className="max-h-[300px] overflow-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Recurso</th>
                        <th className="text-left p-2 font-medium">Valor actual</th>
                        <th className="text-left p-2 font-medium">Nuevo valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResources.slice(0, 10).map(resource => (
                        <tr key={resource.id} className="border-t">
                          <td className="p-2">{resource.name}</td>
                          <td className="p-2 text-muted-foreground">
                            {getFieldDisplayValue(resource, bulkEditField)}
                          </td>
                          <td className="p-2 text-primary font-medium">
                            {getNewValueDisplay()}
                          </td>
                        </tr>
                      ))}
                      {selectedResources.length > 10 && (
                        <tr className="border-t">
                          <td colSpan={3} className="p-2 text-center text-muted-foreground">
                            ... y {selectedResources.length - 10} más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-muted-foreground">
                  Podrás deshacer este cambio con el botón "Deshacer" en la barra de edición.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApplyBulkEdit}
              disabled={isUpdating}
            >
              {isUpdating ? 'Aplicando...' : `Aplicar a ${selectedIds.size} recursos`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
