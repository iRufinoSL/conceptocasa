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
  time_percent: number | null;
  parent_id: string | null;
  depends_on_phase_id: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface BudgetActivity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  subtotal?: number;
  opciones: string[];
  actual_start_date: string | null;
  actual_end_date: string | null;
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
  time_percent: string;
  parent_id: string;
  depends_on_phase_id: string;
  actual_start_date: string;
  actual_end_date: string;
}

interface BudgetPhasesTabProps {
  budgetId: string;
  isAdmin: boolean;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  initialPhaseId?: string | null;
}

const emptyForm: PhaseForm = {
  name: '',
  code: '',
  selectedActivities: [],
  start_date: '',
  duration_days: '',
  time_percent: '',
  parent_id: '',
  depends_on_phase_id: '',
  actual_start_date: '',
  actual_end_date: '',
};

// Calculate budget duration in days
const calculateBudgetDuration = (startDate: string | null | undefined, endDate: string | null | undefined): number => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

// Calculate phase start date from time_percent
const calculatePhaseStartDate = (budgetStartDate: string | null | undefined, budgetDuration: number, timePercent: number | null): string | null => {
  if (!budgetStartDate || !budgetDuration || timePercent === null) return null;
  const start = new Date(budgetStartDate);
  const daysOffset = Math.floor((timePercent / 100) * budgetDuration);
  start.setDate(start.getDate() + daysOffset);
  return start.toISOString().split('T')[0];
};

// Calculate phase end date
const calculatePhaseEndDate = (startDate: string | null, durationDays: number | null): string | null => {
  if (!startDate || !durationDays) return null;
  const start = parseISO(startDate);
  if (!isValid(start)) return null;
  const end = addDays(start, durationDays);
  return format(end, 'yyyy-MM-dd');
};

// Calculate time_percent from start_date
const calculateTimePercentFromDate = (
  budgetStartDate: string | null | undefined, 
  budgetEndDate: string | null | undefined, 
  phaseStartDate: string
): number | null => {
  if (!budgetStartDate || !budgetEndDate) return null;
  const budgetStart = parseISO(budgetStartDate);
  const budgetEnd = parseISO(budgetEndDate);
  const phaseStart = parseISO(phaseStartDate);
  
  if (!isValid(budgetStart) || !isValid(budgetEnd) || !isValid(phaseStart)) return null;
  
  const totalDays = (budgetEnd.getTime() - budgetStart.getTime()) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return null;
  
  const daysFromStart = (phaseStart.getTime() - budgetStart.getTime()) / (1000 * 60 * 60 * 24);
  const percent = Math.round((daysFromStart / totalDays) * 100);
  
  return Math.max(0, Math.min(100, percent));
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

export function BudgetPhasesTab({ budgetId, isAdmin, budgetStartDate, budgetEndDate, initialPhaseId }: BudgetPhasesTabProps) {
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
  const [expandedPhasesTime, setExpandedPhasesTime] = useState<Set<string>>(new Set());
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set()); // collapsed by default
  const [editingTimeField, setEditingTimeField] = useState<{ phaseId: string; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPhaseHandledRef = useRef<string | null>(null);

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
          .select('id, name, code, phase_id, opciones, actual_start_date, actual_end_date')
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

  // Open phase form if initialPhaseId is provided
  useEffect(() => {
    if (initialPhaseId && phases.length > 0 && !isLoading && initialPhaseHandledRef.current !== initialPhaseId) {
      const phase = phases.find(p => p.id === initialPhaseId);
      if (phase) {
        initialPhaseHandledRef.current = initialPhaseId;
        // Get activities assigned to this phase
        const phaseActivities = activities.filter(a => a.phase_id === phase.id).map(a => a.id);
        setCurrentPhase(phase);
        setForm({
          name: phase.name,
          code: phase.code || '',
          selectedActivities: phaseActivities,
          start_date: phase.start_date || '',
          duration_days: phase.duration_days?.toString() || '',
          time_percent: phase.time_percent?.toString() || '',
          parent_id: phase.parent_id || '',
          depends_on_phase_id: phase.depends_on_phase_id || '',
          actual_start_date: phase.actual_start_date || '',
          actual_end_date: phase.actual_end_date || '',
        });
        setFormDialogOpen(true);
      }
    }
  }, [initialPhaseId, phases, activities, isLoading]);

  // Resources without activity_id are real budget resources but are not counted in activity-based views.
  // Treat them as "A+B+C" to keep totals consistent with CÓMO? (Recursos).
  const unassignedResourcesSubtotal = useMemo(() => {
    const unassigned = resources.filter(r => !r.activity_id);
    return unassigned.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
  }, [resources]);

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

  // Calculate total (include activities without phase + resources without activity)
  const totalSubtotal = useMemo(() => {
    const phasesTotal = Array.from(phaseSubtotals.values()).reduce((sum, val) => sum + val, 0);
    const unphasedTotal = activities
      .filter(a => !a.phase_id)
      .reduce((sum, a) => sum + (activitySubtotals.get(a.id) || 0), 0);

    return phasesTotal + unphasedTotal + unassignedResourcesSubtotal;
  }, [phaseSubtotals, activities, activitySubtotals, unassignedResourcesSubtotal]);

  // Calculate subtotals per option (A, B, C)
  const optionSubtotals = useMemo(() => {
    const result: Record<string, number> = { A: 0, B: 0, C: 0 };

    activities.forEach(activity => {
      const activityOpciones = activity.opciones?.length ? activity.opciones : ['A', 'B', 'C'];
      const activityResources = resources.filter(r => r.activity_id === activity.id);
      const activitySubtotal = activityResources.reduce((sum, r) => sum + calculateResourceSubtotal(r), 0);
      activityOpciones.forEach(opcion => {
        if (result[opcion] !== undefined) result[opcion] += activitySubtotal;
      });
    });

    // Resources without activity apply to all options
    (['A', 'B', 'C'] as const).forEach(op => {
      result[op] += unassignedResourcesSubtotal;
    });

    return result;
  }, [activities, resources, unassignedResourcesSubtotal]);

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
      time_percent: phase.time_percent?.toString() || '',
      parent_id: phase.parent_id || '',
      depends_on_phase_id: phase.depends_on_phase_id || '',
      actual_start_date: phase.actual_start_date || '',
      actual_end_date: phase.actual_end_date || '',
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
      
      // Calculate start_date based on dependency or time_percent
      const budgetDuration = calculateBudgetDuration(budgetStartDate, budgetEndDate);
      let timePercent = form.time_percent ? parseFloat(form.time_percent) : null;
      let finalStartDate: string | null = null;
      
      // If this phase depends on another, calculate start from dependency
      if (form.depends_on_phase_id) {
        const dependsOnPhase = phases.find(p => p.id === form.depends_on_phase_id);
        if (dependsOnPhase) {
          const dependsOnEndDate = calculatePhaseEndDate(
            dependsOnPhase.start_date, 
            dependsOnPhase.duration_days
          );
          
          if (dependsOnEndDate) {
            finalStartDate = dependsOnEndDate;
            // Recalculate time_percent based on the new start date
            const newTimePercent = calculateTimePercentFromDate(budgetStartDate, budgetEndDate, dependsOnEndDate);
            if (newTimePercent !== null) {
              timePercent = newTimePercent;
            }
          } else if (dependsOnPhase.start_date) {
            // If dependent phase has no duration, use its start date as minimum
            finalStartDate = dependsOnPhase.start_date;
            const newTimePercent = calculateTimePercentFromDate(budgetStartDate, budgetEndDate, dependsOnPhase.start_date);
            if (newTimePercent !== null) {
              timePercent = newTimePercent;
            }
          }
        }
      }
      
      // If no dependency-based date, use time_percent calculation
      if (!finalStartDate) {
        const calculatedStartDate = calculatePhaseStartDate(budgetStartDate, budgetDuration, timePercent);
        finalStartDate = calculatedStartDate || (form.start_date || null);
      }

      if (currentPhase) {
        const { error } = await supabase
          .from('budget_phases')
          .update({
            name: form.name.trim(),
            code: form.code.trim() || null,
            start_date: finalStartDate,
            duration_days: form.duration_days ? parseInt(form.duration_days) : null,
            time_percent: timePercent,
            parent_id: form.parent_id || null,
            depends_on_phase_id: form.depends_on_phase_id || null,
            actual_start_date: form.actual_start_date || null,
            actual_end_date: form.actual_end_date || null,
          })
          .eq('id', currentPhase.id);

        if (error) throw error;
        
        // Update dependent phases if this phase's dates changed
        await updateDependentPhases(currentPhase.id, finalStartDate, form.duration_days ? parseInt(form.duration_days) : null);
      } else {
        const { data, error } = await supabase
          .from('budget_phases')
          .insert({
            budget_id: budgetId,
            name: form.name.trim(),
            code: form.code.trim() || null,
            start_date: finalStartDate,
            duration_days: form.duration_days ? parseInt(form.duration_days) : null,
            time_percent: timePercent,
            parent_id: form.parent_id || null,
            depends_on_phase_id: form.depends_on_phase_id || null,
            actual_start_date: form.actual_start_date || null,
            actual_end_date: form.actual_end_date || null,
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

  // Update phases that depend on a given phase when it changes
  const updateDependentPhases = async (phaseId: string, newStartDate: string | null, newDurationDays: number | null) => {
    const endDate = calculatePhaseEndDate(newStartDate, newDurationDays);
    if (!endDate) return;
    
    // Find phases that depend on this one
    const dependentPhases = phases.filter(p => p.depends_on_phase_id === phaseId);
    
    for (const depPhase of dependentPhases) {
      const newTimePercent = calculateTimePercentFromDate(budgetStartDate, budgetEndDate, endDate);
      
      await supabase
        .from('budget_phases')
        .update({
          start_date: endDate,
          time_percent: newTimePercent,
        })
        .eq('id', depPhase.id);
      
      // Recursively update phases that depend on this dependent phase
      if (depPhase.duration_days) {
        await updateDependentPhases(depPhase.id, endDate, depPhase.duration_days);
      }
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

  const togglePhaseTimeExpanded = (phaseId: string) => {
    setExpandedPhasesTime(prev => {
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

  // Handle inline actual date update for phases
  const handlePhaseActualDateUpdate = async (phaseId: string, field: 'actual_start_date' | 'actual_end_date', value: string | null) => {
    try {
      const { error } = await supabase
        .from('budget_phases')
        .update({ [field]: value || null })
        .eq('id', phaseId);
      
      if (error) throw error;
      
      setPhases(prev => prev.map(p => 
        p.id === phaseId ? { ...p, [field]: value || null } : p
      ));
      toast.success('Fecha actualizada');
    } catch (err: any) {
      console.error('Error updating phase actual date:', err);
      toast.error('Error al actualizar');
    }
  };

  // Handle inline actual date update for activities
  const handleActivityActualDateUpdate = async (activityId: string, field: 'actual_start_date' | 'actual_end_date', value: string | null) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ [field]: value || null })
        .eq('id', activityId);
      
      if (error) throw error;
      
      setActivities(prev => prev.map(a => 
        a.id === activityId ? { ...a, [field]: value || null } : a
      ));
      toast.success('Fecha actualizada');
    } catch (err: any) {
      console.error('Error updating activity actual date:', err);
      toast.error('Error al actualizar');
    }
  };

  // Handle inline time field update
  const handleInlineTimeUpdate = async (phaseId: string, field: 'start_date' | 'duration_days' | 'time_percent', value: string | number | null) => {
    try {
      const updateData: any = { [field]: value };
      
      // If updating time_percent, also calculate and update start_date
      if (field === 'time_percent' && value !== null) {
        const budgetDuration = calculateBudgetDuration(budgetStartDate, budgetEndDate);
        const calculatedStartDate = calculatePhaseStartDate(budgetStartDate, budgetDuration, value as number);
        if (calculatedStartDate) {
          updateData.start_date = calculatedStartDate;
        }
      }
      
      const { error } = await supabase
        .from('budget_phases')
        .update(updateData)
        .eq('id', phaseId);
      
      if (error) throw error;
      
      // Update local state
      setPhases(prev => prev.map(p => 
        p.id === phaseId ? { ...p, ...updateData } : p
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
            {(['A', 'B', 'C'] as const).map(opt => {
              const colors = OPTION_COLORS[opt];
              return (
                <div key={opt} className="text-right">
                  <p className={`text-lg font-bold ${colors?.text || ''} ${colors?.textDark || ''}`}>
                    {formatCurrency(optionSubtotals[opt] || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">SubTotal {opt}</p>
                </div>
              );
            })}
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
        {/* Budget Duration Info */}
        {viewMode === 'time' && budgetStartDate && budgetEndDate && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Fecha Inicio Presupuesto:</span>{' '}
              <span className="font-medium">{format(parseISO(budgetStartDate), 'dd/MM/yyyy', { locale: es })}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha Fin Presupuesto:</span>{' '}
              <span className="font-medium">{format(parseISO(budgetEndDate), 'dd/MM/yyyy', { locale: es })}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Duración Presupuesto:</span>{' '}
              <span className="font-medium">{calculateBudgetDuration(budgetStartDate, budgetEndDate)} días</span>
            </div>
          </div>
        )}

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
          /* Time Management View with collapsible phases */
          <div className="space-y-2">
            {filteredPhases.map((phase) => {
              const phaseActivities = getPhaseActivities(phase.id);
              const isExpanded = expandedPhasesTime.has(phase.id);

              return (
                <Collapsible key={phase.id} open={isExpanded} onOpenChange={() => togglePhaseTimeExpanded(phase.id)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        {phaseActivities.length > 0 ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )
                        ) : (
                          <div className="w-4" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{generatePhaseId(phase)}</p>
                          <p className="text-xs text-muted-foreground">
                            {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''}
                            {phase.duration_days && ` • ${phase.duration_days} días`}
                          </p>
                        </div>
                        {/* Inline date inputs for phase */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Inicio Real</p>
                            <Input
                              type="date"
                              value={phase.actual_start_date || ''}
                              onChange={(e) => handlePhaseActualDateUpdate(phase.id, 'actual_start_date', e.target.value)}
                              className="w-32 h-7 text-xs"
                              disabled={!isAdmin}
                            />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Fin Real</p>
                            <Input
                              type="date"
                              value={phase.actual_end_date || ''}
                              onChange={(e) => handlePhaseActualDateUpdate(phase.id, 'actual_end_date', e.target.value)}
                              className="w-32 h-7 text-xs"
                              disabled={!isAdmin}
                            />
                          </div>
                        </div>
                        {isAdmin && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
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
                          </div>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {phaseActivities.length > 0 ? (
                        <div className="border-t bg-muted/20 p-3">
                          <div className="space-y-2">
                            {phaseActivities
                              .sort((a, b) => a.code.localeCompare(b.code))
                              .map((activity) => (
                                <div 
                                  key={activity.id}
                                  className="flex items-center gap-2 p-2 rounded-md border bg-background"
                                >
                                  <p className="font-mono text-sm flex-1 min-w-0 truncate">
                                    {generateActivityId(activity, phase.code)}
                                  </p>
                                  {/* Inline date inputs for activity */}
                                  <div className="flex items-center gap-2">
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground mb-0.5">Inicio Real</p>
                                      <Input
                                        type="date"
                                        value={activity.actual_start_date || ''}
                                        onChange={(e) => handleActivityActualDateUpdate(activity.id, 'actual_start_date', e.target.value)}
                                        className="w-32 h-7 text-xs"
                                        disabled={!isAdmin}
                                      />
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground mb-0.5">Fin Real</p>
                                      <Input
                                        type="date"
                                        value={activity.actual_end_date || ''}
                                        onChange={(e) => handleActivityActualDateUpdate(activity.id, 'actual_end_date', e.target.value)}
                                        className="w-32 h-7 text-xs"
                                        disabled={!isAdmin}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <div className="border-t bg-muted/20 p-4 text-center text-muted-foreground">
                          <ClipboardList className="h-6 w-6 mx-auto mb-1 opacity-50" />
                          <p className="text-sm">No hay actividades asignadas</p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="depends_on_phase_id">Depende de (Secuencia)</Label>
              <div className="flex gap-2">
                <select
                  id="depends_on_phase_id"
                  value={form.depends_on_phase_id}
                  onChange={(e) => setForm({ ...form, depends_on_phase_id: e.target.value })}
                  className="flex-1 h-10 px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">Sin dependencia</option>
                  {phases
                    .filter(p => p.id !== currentPhase?.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code}. ` : ''}{p.name}
                      </option>
                    ))}
                </select>
                {form.depends_on_phase_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setForm({ ...form, depends_on_phase_id: '' })}
                    title="Quitar dependencia"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {form.depends_on_phase_id && (() => {
                const dependsOnPhase = phases.find(p => p.id === form.depends_on_phase_id);
                if (dependsOnPhase) {
                  const endDate = calculatePhaseEndDate(dependsOnPhase.start_date, dependsOnPhase.duration_days);
                  return (
                    <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>Fase dependiente:</strong> {dependsOnPhase.code ? `${dependsOnPhase.code}. ` : ''}{dependsOnPhase.name}
                        {dependsOnPhase.start_date && (
                          <span className="block mt-1">
                            Inicio: {format(parseISO(dependsOnPhase.start_date), 'dd/MM/yyyy', { locale: es })}
                            {dependsOnPhase.duration_days && ` • Duración: ${dependsOnPhase.duration_days} días`}
                            {endDate && (
                              <span className="block font-semibold text-green-700 dark:text-green-400">
                                → Esta fase iniciará el: {format(parseISO(endDate), 'dd/MM/yyyy', { locale: es })}
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
              <p className="text-xs text-muted-foreground">
                Esta fase comenzará cuando termine la fase seleccionada (se muestra con flecha en Gantt)
              </p>
            </div>
            {/* Time Management Fields */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time_percent" className={form.depends_on_phase_id ? 'text-muted-foreground' : ''}>
                  Tiempo % (0-100)
                </Label>
                <Input
                  id="time_percent"
                  type="number"
                  min={0}
                  max={100}
                  value={form.time_percent}
                  onChange={(e) => setForm({ ...form, time_percent: e.target.value })}
                  placeholder="0"
                  disabled={!!form.depends_on_phase_id}
                  className={form.depends_on_phase_id ? 'bg-muted/50' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  {form.depends_on_phase_id 
                    ? 'Se calcula automáticamente por la dependencia'
                    : 'Posición en la línea temporal del presupuesto'
                  }
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duración (días)</Label>
                <Input
                  id="duration_days"
                  type="number"
                  min={0}
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Fecha Inicio (calculada)</Label>
                <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 text-sm">
                  {(() => {
                    // If depending on another phase, show calculated date from dependency
                    if (form.depends_on_phase_id) {
                      const dependsOnPhase = phases.find(p => p.id === form.depends_on_phase_id);
                      if (dependsOnPhase) {
                        const endDate = calculatePhaseEndDate(dependsOnPhase.start_date, dependsOnPhase.duration_days);
                        if (endDate) {
                          return format(parseISO(endDate), 'dd/MM/yyyy', { locale: es });
                        } else if (dependsOnPhase.start_date) {
                          return format(parseISO(dependsOnPhase.start_date), 'dd/MM/yyyy', { locale: es });
                        }
                      }
                    }
                    // Otherwise use time_percent calculation
                    const budgetDuration = calculateBudgetDuration(budgetStartDate, budgetEndDate);
                    const timePercent = form.time_percent ? parseFloat(form.time_percent) : null;
                    const calculatedDate = calculatePhaseStartDate(budgetStartDate, budgetDuration, timePercent);
                    return calculatedDate 
                      ? format(parseISO(calculatedDate), 'dd/MM/yyyy', { locale: es })
                      : '-';
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {form.depends_on_phase_id 
                    ? 'Fecha de fin de la fase dependiente'
                    : 'Se calcula desde Tiempo% × Duración Presupuesto'
                  }
                </p>
              </div>
            </div>

            {/* Fechas Reales de Ejecución */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-base font-semibold mb-3 block">Fechas Reales de Ejecución</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="actual_start_date">Inicio Real</Label>
                  <Input
                    id="actual_start_date"
                    type="date"
                    value={form.actual_start_date}
                    onChange={(e) => setForm({ ...form, actual_start_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fecha de inicio efectivo de la fase
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_end_date">Fin Real</Label>
                  <Input
                    id="actual_end_date"
                    type="date"
                    value={form.actual_end_date}
                    onChange={(e) => setForm({ ...form, actual_end_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fecha de finalización efectiva de la fase
                  </p>
                </div>
              </div>
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
