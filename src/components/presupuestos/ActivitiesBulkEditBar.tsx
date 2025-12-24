import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  uses_measurement: boolean;
  opciones: string[];
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface UndoState {
  field: string;
  previousValues: Map<string, any>;
  timestamp: Date;
}

interface ActivitiesBulkEditBarProps {
  selectedIds: Set<string>;
  activities: BudgetActivity[];
  phases: Phase[];
  onClearSelection: () => void;
  onRefresh: () => void;
  onBulkDelete: () => void;
  isAdmin: boolean;
}

const BULK_EDIT_FIELDS = [
  { value: 'uses_measurement', label: 'Usa Medición', type: 'boolean' },
  { value: 'opciones', label: 'Opciones', type: 'opciones' },
  { value: 'phase_id', label: 'Fase', type: 'phase' },
];

const OPCIONES = ['A', 'B', 'C']; // Keep fixed for bulk edit options selection

export function ActivitiesBulkEditBar({
  selectedIds,
  activities,
  phases,
  onClearSelection,
  onRefresh,
  onBulkDelete,
  isAdmin,
}: ActivitiesBulkEditBarProps) {
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState<any>('');
  const [selectedOpciones, setSelectedOpciones] = useState<string[]>(['A', 'B', 'C']);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);

  const selectedActivities = activities.filter(a => selectedIds.has(a.id));
  const selectedField = BULK_EDIT_FIELDS.find(f => f.value === bulkEditField);

  const getPhaseDisplayName = (phaseId: string | null) => {
    if (!phaseId) return 'Sin fase';
    const phase = phases.find(p => p.id === phaseId);
    return phase ? `${phase.code || ''} ${phase.name}` : 'Desconocida';
  };

  const getFieldDisplayValue = (activity: BudgetActivity, field: string): string => {
    if (field === 'uses_measurement') {
      return activity.uses_measurement ? 'Sí' : 'No';
    }
    if (field === 'opciones') {
      return (activity.opciones || ['A', 'B', 'C']).join(', ');
    }
    if (field === 'phase_id') {
      return getPhaseDisplayName(activity.phase_id);
    }
    return '-';
  };

  const getNewValueDisplay = (): string => {
    if (!selectedField) return '';
    
    if (selectedField.type === 'boolean') {
      return bulkEditValue === 'true' ? 'Sí' : 'No';
    }
    if (selectedField.type === 'opciones') {
      return selectedOpciones.join(', ') || 'Ninguna';
    }
    if (selectedField.type === 'phase') {
      if (bulkEditValue === '__none__') return 'Sin fase';
      return getPhaseDisplayName(bulkEditValue as string);
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
      selectedActivities.forEach(a => {
        if (bulkEditField === 'opciones') {
          previousValues.set(a.id, a.opciones || ['A', 'B', 'C']);
        } else {
          previousValues.set(a.id, a[bulkEditField as keyof BudgetActivity]);
        }
      });

      let updateValue: any;
      
      if (bulkEditField === 'uses_measurement') {
        updateValue = bulkEditValue === 'true';
      } else if (bulkEditField === 'opciones') {
        updateValue = selectedOpciones;
      } else if (bulkEditField === 'phase_id') {
        updateValue = bulkEditValue === '__none__' ? null : bulkEditValue;
      } else {
        updateValue = bulkEditValue;
      }

      const { error } = await supabase
        .from('budget_activities')
        .update({ [bulkEditField]: updateValue })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      // Add to undo stack
      setUndoStack(prev => [...prev, {
        field: bulkEditField,
        previousValues,
        timestamp: new Date(),
      }]);

      toast.success(`${selectedIds.size} actividades actualizadas`, {
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
      setSelectedOpciones(['A', 'B', 'C']);
      setConfirmDialogOpen(false);
      onRefresh();
      onClearSelection();
    } catch (error) {
      console.error('Error bulk updating:', error);
      toast.error('Error al actualizar actividades');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedIds, bulkEditField, bulkEditValue, selectedOpciones, selectedActivities, onRefresh, onClearSelection]);

  const handleUndo = useCallback(async (undoState: UndoState) => {
    setIsUpdating(true);
    try {
      const updates = Array.from(undoState.previousValues.entries()).map(async ([id, value]) => {
        return supabase
          .from('budget_activities')
          .update({ [undoState.field]: value })
          .eq('id', id);
      });

      await Promise.all(updates);
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

  const toggleOpcion = (opcion: string) => {
    setSelectedOpciones(prev => 
      prev.includes(opcion) 
        ? prev.filter(o => o !== opcion)
        : [...prev, opcion].sort()
    );
  };

  const canApply = () => {
    if (!bulkEditField) return false;
    if (bulkEditField === 'opciones') return selectedOpciones.length > 0;
    return bulkEditValue !== '';
  };

  const renderValueInput = () => {
    if (!selectedField) return null;

    switch (selectedField.type) {
      case 'boolean':
        return (
          <Select value={bulkEditValue as string} onValueChange={setBulkEditValue}>
            <SelectTrigger className="w-[100px] h-8">
              <SelectValue placeholder="Valor..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sí</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        );

      case 'opciones':
        return (
          <div className="flex items-center gap-2">
            {OPCIONES.map(opcion => (
              <label key={opcion} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={selectedOpciones.includes(opcion)}
                  onCheckedChange={() => toggleOpcion(opcion)}
                />
                <span className="text-sm font-medium">{opcion}</span>
              </label>
            ))}
          </div>
        );

      case 'phase':
        return (
          <Select value={bulkEditValue as string} onValueChange={setBulkEditValue}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Fase..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin fase</SelectItem>
              {phases.map(phase => (
                <SelectItem key={phase.id} value={phase.id}>
                  {phase.code} {phase.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      default:
        return null;
    }
  };

  if (selectedIds.size === 0) return null;

  return (
    <>
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 animate-in slide-in-from-top-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="h-7">
            {selectedIds.size} seleccionadas
          </Badge>

          <Select value={bulkEditField} onValueChange={(v) => { setBulkEditField(v); setBulkEditValue(''); setSelectedOpciones(['A', 'B', 'C']); }}>
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

          {bulkEditField && renderValueInput()}

          {canApply() && (
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
                  <strong>{getNewValueDisplay()}</strong> en {selectedIds.size} actividades.
                </p>
                
                <div className="max-h-[300px] overflow-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Actividad</th>
                        <th className="text-left p-2 font-medium">Valor actual</th>
                        <th className="text-left p-2 font-medium">Nuevo valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedActivities.slice(0, 10).map(activity => (
                        <tr key={activity.id} className="border-t">
                          <td className="p-2">{activity.code} - {activity.name}</td>
                          <td className="p-2 text-muted-foreground">
                            {getFieldDisplayValue(activity, bulkEditField)}
                          </td>
                          <td className="p-2 text-primary font-medium">
                            {getNewValueDisplay()}
                          </td>
                        </tr>
                      ))}
                      {selectedActivities.length > 10 && (
                        <tr className="border-t">
                          <td colSpan={3} className="p-2 text-center text-muted-foreground">
                            ... y {selectedActivities.length - 10} más
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
              {isUpdating ? 'Aplicando...' : `Aplicar a ${selectedIds.size} actividades`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
