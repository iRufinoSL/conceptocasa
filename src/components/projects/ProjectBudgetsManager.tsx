import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, Plus, X, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  project_id: string | null;
}

interface ProjectBudgetsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function ProjectBudgetsManager({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ProjectBudgetsManagerProps) {
  const [linkedBudgets, setLinkedBudgets] = useState<Presupuesto[]>([]);
  const [availableBudgets, setAvailableBudgets] = useState<Presupuesto[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchBudgets();
    }
  }, [open, projectId]);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      // Fetch budgets linked to this project
      const { data: linked, error: linkedError } = await supabase
        .from('presupuestos')
        .select('*')
        .eq('project_id', projectId)
        .order('codigo_correlativo');

      if (linkedError) throw linkedError;
      setLinkedBudgets(linked || []);

      // Fetch budgets not linked to any project (available)
      const { data: available, error: availableError } = await supabase
        .from('presupuestos')
        .select('*')
        .is('project_id', null)
        .order('codigo_correlativo');

      if (availableError) throw availableError;
      setAvailableBudgets(available || []);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      toast.error('Error al cargar los presupuestos');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkBudget = async () => {
    if (!selectedBudgetId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: projectId })
        .eq('id', selectedBudgetId);

      if (error) throw error;

      toast.success('Presupuesto vinculado correctamente');
      setSelectedBudgetId('');
      fetchBudgets();
    } catch (error) {
      console.error('Error linking budget:', error);
      toast.error('Error al vincular el presupuesto');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkBudget = async (budgetId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: null })
        .eq('id', budgetId);

      if (error) throw error;

      toast.success('Presupuesto desvinculado');
      fetchBudgets();
    } catch (error) {
      console.error('Error unlinking budget:', error);
      toast.error('Error al desvincular el presupuesto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Presupuestos de {projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add Budget Section */}
          {availableBudgets.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Vincular presupuesto</label>
              <div className="flex gap-2">
                <Select value={selectedBudgetId} onValueChange={setSelectedBudgetId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar presupuesto" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBudgets.map((budget) => (
                      <SelectItem key={budget.id} value={budget.id}>
                        {budget.codigo_correlativo} - {budget.nombre} (v{budget.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleLinkBudget}
                  disabled={!selectedBudgetId || saving}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Linked Budgets List */}
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Presupuestos vinculados ({linkedBudgets.length})
            </label>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : linkedBudgets.length === 0 ? (
              <div className="text-center py-8 border rounded-lg bg-muted/30">
                <LinkIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No hay presupuestos vinculados a este proyecto
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {linkedBudgets.map((budget) => (
                  <div
                    key={budget.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Calculator className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{budget.nombre}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Código: {budget.codigo_correlativo}</span>
                          <Badge variant="outline" className="text-xs">
                            v{budget.version}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUnlinkBudget(budget.id)}
                      disabled={saving}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableBudgets.length === 0 && linkedBudgets.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center">
              No hay presupuestos disponibles. Crea presupuestos primero.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
