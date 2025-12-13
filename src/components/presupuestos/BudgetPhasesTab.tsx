import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, Trash2, Upload, Search, ChevronRight, ChevronDown, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

interface BudgetPhase {
  id: string;
  budget_id: string;
  name: string;
  code: string | null;
  order_index: number | null;
  created_at: string;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
}

interface PhaseForm {
  name: string;
  code: string;
}

interface BudgetPhasesTabProps {
  budgetId: string;
  isAdmin: boolean;
}

const emptyForm: PhaseForm = {
  name: '',
  code: '',
};

export function BudgetPhasesTab({ budgetId, isAdmin }: BudgetPhasesTabProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<BudgetPhase | null>(null);
  const [form, setForm] = useState<PhaseForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [importData, setImportData] = useState<PhaseForm[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [phasesResponse, activitiesResponse] = await Promise.all([
        supabase
          .from('budget_phases')
          .select('*')
          .eq('budget_id', budgetId)
          .order('code', { ascending: true }),
        supabase
          .from('budget_activities')
          .select('id, name, code, phase_id')
          .eq('budget_id', budgetId)
      ]);

      if (phasesResponse.error) throw phasesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      setPhases(phasesResponse.data || []);
      setActivities(activitiesResponse.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  const handleNew = () => {
    setCurrentPhase(null);
    setForm(emptyForm);
    setFormDialogOpen(true);
  };

  const handleEdit = (phase: BudgetPhase) => {
    setCurrentPhase(phase);
    setForm({
      name: phase.name,
      code: phase.code || '',
    });
    setFormDialogOpen(true);
  };

  const handleDeleteClick = (phase: BudgetPhase) => {
    setCurrentPhase(phase);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre de la fase es obligatorio');
      return;
    }

    setIsSaving(true);
    try {
      if (currentPhase) {
        const { error } = await supabase
          .from('budget_phases')
          .update({
            name: form.name.trim(),
            code: form.code.trim() || null,
          })
          .eq('id', currentPhase.id);

        if (error) throw error;
        toast.success('Fase actualizada correctamente');
      } else {
        const { error } = await supabase
          .from('budget_phases')
          .insert({
            budget_id: budgetId,
            name: form.name.trim(),
            code: form.code.trim() || null,
          });

        if (error) throw error;
        toast.success('Fase creada correctamente');
      }

      setFormDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving phase:', error);
      toast.error('Error al guardar la fase');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPhase) return;

    try {
      const { error } = await supabase
        .from('budget_phases')
        .delete()
        .eq('id', currentPhase.id);

      if (error) throw error;
      toast.success('Fase eliminada correctamente');
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error deleting phase:', error);
      toast.error('Error al eliminar la fase');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
        
        const nameIdx = headers.findIndex(h => h.includes('fase') && !h.includes('código') && !h.includes('codigo'));
        const codeIdx = headers.findIndex(h => h.includes('código') || h.includes('codigo'));

        if (nameIdx === -1) {
          toast.error('No se encontró la columna "Fase" en el archivo');
          return;
        }

        const parsedData: PhaseForm[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
          const name = values[nameIdx]?.trim();
          const code = codeIdx !== -1 ? values[codeIdx]?.trim() : '';

          if (name) {
            parsedData.push({ name, code: code || '' });
          }
        }

        if (parsedData.length === 0) {
          toast.error('No se encontraron fases válidas en el archivo');
          return;
        }

        setImportData(parsedData);
        setImportDialogOpen(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        toast.error('Error al procesar el archivo CSV');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmImport = async () => {
    if (importData.length === 0) return;

    setIsImporting(true);
    try {
      const phasesToInsert = importData.map((phase, index) => ({
        budget_id: budgetId,
        name: phase.name,
        code: phase.code || null,
        order_index: index,
      }));

      const { error } = await supabase
        .from('budget_phases')
        .insert(phasesToInsert);

      if (error) throw error;

      toast.success(`${importData.length} fases importadas correctamente`);
      setImportDialogOpen(false);
      setImportData([]);
      fetchData();
    } catch (error) {
      console.error('Error importing phases:', error);
      toast.error('Error al importar las fases');
    } finally {
      setIsImporting(false);
    }
  };

  const togglePhaseExpanded = (phaseId: string) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(phaseId)) {
        newSet.delete(phaseId);
      } else {
        newSet.add(phaseId);
      }
      return newSet;
    });
  };

  const getPhaseActivities = (phaseId: string) => {
    return activities.filter(a => a.phase_id === phaseId);
  };

  const generatePhaseId = (phase: BudgetPhase) => {
    return `${phase.code || ''} ${phase.name}`.trim();
  };

  const generateActivityId = (activity: BudgetActivity, phaseCode: string | null) => {
    return `${phaseCode || ''} ${activity.code}.- ${activity.name}`.trim();
  };

  const filteredPhases = phases.filter(phase => {
    const searchLower = searchTerm.toLowerCase();
    return (
      phase.name.toLowerCase().includes(searchLower) ||
      (phase.code && phase.code.toLowerCase().includes(searchLower))
    );
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>CUÁNDO se hace? - Fases de Gestión</CardTitle>
            <CardDescription>Organización temporal de las fases del presupuesto</CardDescription>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Fase
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredPhases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No se encontraron fases' : 'No hay fases. Importe un archivo CSV o cree una nueva fase.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPhases.map((phase) => {
              const phaseActivities = getPhaseActivities(phase.id);
              const isExpanded = expandedPhases.has(phase.id);

              return (
                <Collapsible key={phase.id} open={isExpanded} onOpenChange={() => togglePhaseExpanded(phase.id)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium">{generatePhaseId(phase)}</p>
                            <p className="text-sm text-muted-foreground">
                              {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(phase)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(phase)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {phaseActivities.length > 0 ? (
                        <div className="border-t bg-muted/20 p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ActividadID</TableHead>
                                <TableHead>Actividad</TableHead>
                                <TableHead>Código</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {phaseActivities
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((activity) => (
                                  <TableRow key={activity.id}>
                                    <TableCell className="font-mono text-sm">
                                      {generateActivityId(activity, phase.code)}
                                    </TableCell>
                                    <TableCell>{activity.name}</TableCell>
                                    <TableCell>{activity.code}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="border-t bg-muted/20 p-4 text-center text-muted-foreground">
                          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No hay actividades asignadas a esta fase
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Form Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentPhase ? 'Editar Fase' : 'Nueva Fase'}</DialogTitle>
            <DialogDescription>
              {currentPhase ? 'Modifique los datos de la fase' : 'Introduzca los datos de la nueva fase'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código Fase</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Fase Gestión *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre de la fase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar Importación</DialogTitle>
            <DialogDescription>
              Se importarán {importData.length} fases. Revise los datos antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Fase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importData.map((phase, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{phase.code || '-'}</TableCell>
                    <TableCell>{phase.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmImport} disabled={isImporting}>
              {isImporting ? 'Importando...' : `Importar ${importData.length} fases`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Fase"
        description={`¿Está seguro de que desea eliminar la fase "${currentPhase?.name}"? Las actividades asociadas no se eliminarán, pero perderán su asignación de fase.`}
      />
    </Card>
  );
}
