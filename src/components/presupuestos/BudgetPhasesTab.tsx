import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, Upload, Search, ChevronRight, ChevronDown, ClipboardList, MoreHorizontal, Copy, Calendar, List, Clock, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { PhasesOptionsGroupedView } from './PhasesOptionsGroupedView';
import { OPTION_COLORS } from '@/lib/options-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { formatCurrency } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { searchMatch } from '@/lib/search-utils';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
interface BudgetPhase {
  id: string;
  budget_id: string;
  name: string;
  code: string | null;
  order_index: number | null;
  created_at: string;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  subtotal?: number;
  opciones: string[];
}

interface BudgetResource {
  id: string;
  activity_id: string | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
}

interface PhaseForm {
  name: string;
  code: string;
  selectedActivities: string[];
  start_date: string;
  duration_days: string;
}

interface BudgetPhasesTabProps {
  budgetId: string;
  isAdmin: boolean;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
}

const emptyForm: PhaseForm = {
  name: '',
  code: '',
  selectedActivities: [],
  start_date: '',
  duration_days: '',
};

// Calculate subtotal for a resource
const calculateResourceSubtotal = (resource: BudgetResource): number => {
  return calcResourceSubtotal({
    externalUnitCost: resource.external_unit_cost,
    safetyPercent: resource.safety_margin_percent,
    salesPercent: resource.sales_margin_percent,
    manualUnits: resource.manual_units,
    relatedUnits: resource.related_units,
  });
};

export function BudgetPhasesTab({ budgetId, isAdmin, budgetStartDate, budgetEndDate }: BudgetPhasesTabProps) {
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [resources, setResources] = useState<BudgetResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'activities' | 'time' | 'options'>('activities');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<BudgetPhase | null>(null);
  const [form, setForm] = useState<PhaseForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [importData, setImportData] = useState<{ name: string; code: string }[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set()); // collapsed by default
  const [editingTimeField, setEditingTimeField] = useState<{ phaseId: string; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [phasesResponse, activitiesResponse, resourcesResponse] = await Promise.all([
        supabase
          .from('budget_phases')
          .select('*')
          .eq('budget_id', budgetId)
          .order('code', { ascending: true }),
        supabase
          .from('budget_activities')
          .select('id, name, code, phase_id, opciones')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_activity_resources')
          .select('id, activity_id, external_unit_cost, safety_margin_percent, sales_margin_percent, manual_units, related_units')
          .eq('budget_id', budgetId)
      ]);

      if (phasesResponse.error) throw phasesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;
      if (resourcesResponse.error) throw resourcesResponse.error;

      setPhases(phasesResponse.data || []);
      setActivities(activitiesResponse.data || []);
      setResources(resourcesResponse.data || []);
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

  // Listen for budget recalculation events
  useEffect(() => {
    const handleRecalculated = () => {
      fetchData();
    };
    window.addEventListener('budget-recalculated', handleRecalculated);
    return () => window.removeEventListener('budget-recalculated', handleRecalculated);
  }, []);

  // Calculate subtotals per activity
  const activitySubtotals = useMemo(() => {
    const subtotals = new Map<string, number>();
    activities.forEach(activity => {
      const activityResources = resources.filter(r => r.activity_id === activity.id);
      const subtotal = activityResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
      subtotals.set(activity.id, subtotal);
    });
    return subtotals;
  }, [activities, resources]);

  // Calculate subtotals per phase
  const phaseSubtotals = useMemo(() => {
    const subtotals = new Map<string, number>();
    
    for (const phase of phases) {
      // Get activities in this phase
      const phaseActivities = activities.filter(a => a.phase_id === phase.id);
      const activityIds = phaseActivities.map(a => a.id);
      
      // Get resources for these activities and calculate subtotal
      const phaseResources = resources.filter(r => r.activity_id && activityIds.includes(r.activity_id));
      const subtotal = phaseResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
      
      subtotals.set(phase.id, subtotal);
    }
    
    return subtotals;
  }, [phases, activities, resources]);

  // Calculate total
  const totalSubtotal = useMemo(() => {
    return Array.from(phaseSubtotals.values()).reduce((sum, val) => sum + val, 0);
  }, [phaseSubtotals]);

  // Calculate subtotals per option (A, B, C)
  const optionSubtotals = useMemo(() => {
    const result: Record<string, number> = { A: 0, B: 0, C: 0 };
    activities.forEach(activity => {
      const activityOpciones = activity.opciones || ['A', 'B', 'C'];
      const activityResources = resources.filter(r => r.activity_id === activity.id);
      const activitySubtotal = activityResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
      activityOpciones.forEach(opcion => {
        if (result[opcion] !== undefined) result[opcion] += activitySubtotal;
      });
    });
    return result;
  }, [activities, resources]);

  const toggleOptionExpanded = (option: string) => {
    setExpandedOptions(prev => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  };

  const handleNew = () => {
    setCurrentPhase(null);
    setForm(emptyForm);
    setFormDialogOpen(true);
  };

  const handleEdit = (phase: BudgetPhase) => {
    setCurrentPhase(phase);
    // Get activities assigned to this phase
    const phaseActivities = activities.filter(a => a.phase_id === phase.id).map(a => a.id);
    setForm({
      name: phase.name,
      code: phase.code || '',
      selectedActivities: phaseActivities,
      start_date: phase.start_date || '',
      duration_days: phase.duration_days?.toString() || '',
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
      let phaseId = currentPhase?.id;

      if (currentPhase) {
        const { error } = await supabase
          .from('budget_phases')
          .update({
            name: form.name.trim(),
            code: form.code.trim() || null,
            start_date: form.start_date || null,
            duration_days: form.duration_days ? parseInt(form.duration_days) : null,
          })
          .eq('id', currentPhase.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('budget_phases')
          .insert({
            budget_id: budgetId,
            name: form.name.trim(),
            code: form.code.trim() || null,
            start_date: form.start_date || null,
            duration_days: form.duration_days ? parseInt(form.duration_days) : null,
          })
          .select()
          .single();

        if (error) throw error;
        phaseId = data.id;
      }

      // Update activity associations
      if (phaseId) {
        // First, remove phase from activities that were previously assigned but are now unselected
        const previouslyAssigned = activities.filter(a => a.phase_id === phaseId).map(a => a.id);
        const toUnassign = previouslyAssigned.filter(id => !form.selectedActivities.includes(id));
        
        if (toUnassign.length > 0) {
          await supabase
            .from('budget_activities')
            .update({ phase_id: null })
            .in('id', toUnassign);
        }

        // Then, assign the selected activities to this phase
        if (form.selectedActivities.length > 0) {
          await supabase
            .from('budget_activities')
            .update({ phase_id: phaseId })
            .in('id', form.selectedActivities);
        }
      }

      toast.success(currentPhase ? 'Fase actualizada correctamente' : 'Fase creada correctamente');
      setFormDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving phase:', error);
      toast.error('Error al guardar la fase');
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate phase with all related activities
  const handleDuplicate = async (phase: BudgetPhase) => {
    try {
      // Create duplicated phase
      const { data: newPhase, error: phaseError } = await supabase
        .from('budget_phases')
        .insert({
          budget_id: budgetId,
          name: `${phase.name} (copia)`,
          code: phase.code ? `${phase.code}-C` : null,
          order_index: phase.order_index,
        })
        .select()
        .single();

      if (phaseError) throw phaseError;

      // Get activities from original phase
      const phaseActivities = activities.filter(a => a.phase_id === phase.id);

      // Duplicate activities if any
      for (const activity of phaseActivities) {
        // Get full activity data
        const { data: fullActivity, error: actError } = await supabase
          .from('budget_activities')
          .select('*')
          .eq('id', activity.id)
          .single();

        if (actError || !fullActivity) continue;

        // Create duplicated activity
        const { data: newActivity, error: newActError } = await supabase
          .from('budget_activities')
          .insert({
            budget_id: budgetId,
            name: `${fullActivity.name} (copia)`,
            code: `${fullActivity.code}-C`,
            description: fullActivity.description,
            measurement_unit: fullActivity.measurement_unit,
            phase_id: newPhase.id
          })
          .select()
          .single();

        if (newActError || !newActivity) continue;

        // Get files from original activity
        const { data: files } = await supabase
          .from('budget_activity_files')
          .select('*')
          .eq('activity_id', activity.id);

        // Duplicate files if any
        if (files && files.length > 0) {
          for (const file of files) {
            try {
              const { data: fileData } = await supabase.storage
                .from('activity-files')
                .download(file.file_path);

              if (!fileData) continue;

              const fileExt = file.file_name.split('.').pop();
              const newPath = `${newActivity.id}/${Date.now()}.${fileExt}`;
              
              await supabase.storage
                .from('activity-files')
                .upload(newPath, fileData);

              await supabase
                .from('budget_activity_files')
                .insert({
                  activity_id: newActivity.id,
                  file_name: file.file_name,
                  file_path: newPath,
                  file_type: file.file_type,
                  file_size: file.file_size
                });
            } catch (fileErr) {
              console.error('Error duplicating file:', fileErr);
            }
          }
        }
      }

      toast.success('Fase duplicada con todas sus actividades');
      fetchData();
    } catch (err: any) {
      console.error('Error duplicating:', err);
      toast.error(err.message || 'Error al duplicar');
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

        const parsedData: { name: string; code: string }[] = [];
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

  // Handle inline time field update
  const handleInlineTimeUpdate = async (phaseId: string, field: 'start_date' | 'duration_days', value: string | number | null) => {
    try {
      const updateData: any = { [field]: value };
      const { error } = await supabase
        .from('budget_phases')
        .update(updateData)
        .eq('id', phaseId);
      
      if (error) throw error;
      
      // Update local state
      setPhases(prev => prev.map(p => 
        p.id === phaseId ? { ...p, [field]: value } : p
      ));
      
      // Refetch to get calculated fields
      fetchData();
      toast.success('Campo actualizado');
    } catch (err: any) {
      console.error('Error updating:', err);
      toast.error('Error al actualizar');
    }
    setEditingTimeField(null);
  };

  // Sort phases by start_date for time view
  const phasesSortedByDate = useMemo(() => {
    return [...phases].sort((a, b) => {
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return a.start_date.localeCompare(b.start_date);
    });
  }, [phases]);

  const filteredPhases = (viewMode === 'time' ? phasesSortedByDate : phases).filter(phase => {
    return (
      searchMatch(phase.name, searchTerm) ||
      searchMatch(phase.code, searchTerm)
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
          <div className="flex-1">
            <CardTitle>CUÁNDO se hace? - Fases de Gestión</CardTitle>
            <CardDescription>Organización temporal de las fases del presupuesto</CardDescription>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Option Subtotals */}
            {(['A', 'B', 'C'] as const).map(opt => (
              <div key={opt} className="text-right">
                <p className={`text-lg font-bold ${OPTION_COLORS[opt]?.text || 'text-primary'}`}>
                  {formatCurrency(optionSubtotals[opt] || 0)}
                </p>
                <p className="text-xs text-muted-foreground">SubTotal {opt}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* View Mode Toggle */}
          <div className="flex border rounded-lg">
            <Button 
              variant={viewMode === 'activities' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('activities')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4 mr-1" />
              Actividades
            </Button>
            <Button 
              variant={viewMode === 'time' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('time')}
              className="rounded-none border-x"
            >
              <Clock className="h-4 w-4 mr-1" />
              Gestión Tiempo
            </Button>
            <Button 
              variant={viewMode === 'options' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('options')}
              className="rounded-l-none"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Por Opción
            </Button>
          </div>
          {isAdmin && (
            <div className="flex gap-2 ml-auto">
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
        ) : viewMode === 'time' ? (
          /* Time Management View */
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FaseID</TableHead>
                  <TableHead>Fecha Inicio</TableHead>
                  <TableHead className="text-center">Duración (días)</TableHead>
                  <TableHead>Fecha Fin Estimada</TableHead>
                  {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhases.map((phase) => (
                  <TableRow key={phase.id}>
                    <TableCell className="font-medium">{generatePhaseId(phase)}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Input
                          type="date"
                          value={phase.start_date || ''}
                          min={budgetStartDate || undefined}
                          max={budgetEndDate || undefined}
                          onChange={(e) => handleInlineTimeUpdate(phase.id, 'start_date', e.target.value || null)}
                          className="w-36 h-8"
                        />
                      ) : (
                        <span>
                          {phase.start_date 
                            ? format(parseISO(phase.start_date), 'dd/MM/yyyy', { locale: es })
                            : '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isAdmin ? (
                        <Input
                          type="number"
                          value={phase.duration_days ?? ''}
                          min={0}
                          onChange={(e) => handleInlineTimeUpdate(phase.id, 'duration_days', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-20 h-8 text-center mx-auto"
                        />
                      ) : (
                        <span>{phase.duration_days ?? '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {phase.estimated_end_date 
                        ? format(parseISO(phase.estimated_end_date), 'dd/MM/yyyy', { locale: es })
                        : '-'}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => handleEdit(phase)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteClick(phase)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Activities View (existing) */
          <div className="space-y-2">
            {filteredPhases.map((phase) => {
              const phaseActivities = getPhaseActivities(phase.id);
              const isExpanded = expandedPhases.has(phase.id);

              return (
                <Collapsible key={phase.id} open={isExpanded} onOpenChange={() => togglePhaseExpanded(phase.id)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{generatePhaseId(phase)}</p>
                            <p className="text-sm text-muted-foreground">
                              {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''}
                            </p>
                          </div>
                          <div className="text-right mr-4">
                            <p className="font-semibold text-green-600">
                              {formatCurrency(phaseSubtotals.get(phase.id) || 0)}
                            </p>
                            <p className="text-xs text-muted-foreground">€SubTotal Venta</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem onClick={() => handleEdit(phase)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(phase)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteClick(phase)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {phaseActivities.length > 0 ? (
                        <div className="border-t bg-muted/20 p-4">
                          <div className="space-y-2">
                            {phaseActivities
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((activity) => (
                                <div 
                                  key={activity.id}
                                  className="p-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer transition-colors flex items-center justify-between"
                                  onClick={() => {
                                    setCurrentPhase(null);
                                    window.dispatchEvent(new CustomEvent('edit-activity', { detail: activity }));
                                  }}
                                >
                                  <p className="font-mono text-sm">
                                    {generateActivityId(activity, phase.code)}
                                  </p>
                                  <p className="text-sm font-semibold text-green-600">
                                    {formatCurrency(activitySubtotals.get(activity.id) || 0)}
                                  </p>
                                </div>
                              ))}
                          </div>
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
            <div className="space-y-2">
              <Label>Actividades asociadas</Label>
              <ScrollArea className="h-48 border rounded-md p-3">
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay actividades disponibles</p>
                ) : (
                  <div className="space-y-2">
                    {activities
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((activity) => (
                        <div key={activity.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`activity-${activity.id}`}
                            checked={form.selectedActivities.includes(activity.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, selectedActivities: [...form.selectedActivities, activity.id] });
                              } else {
                                setForm({ ...form, selectedActivities: form.selectedActivities.filter(id => id !== activity.id) });
                              }
                            }}
                          />
                          <label 
                            htmlFor={`activity-${activity.id}`} 
                            className="text-sm cursor-pointer flex-1"
                          >
                            {activity.code} - {activity.name}
                          </label>
                        </div>
                      ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {form.selectedActivities.length} actividad(es) seleccionada(s)
              </p>
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
