import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Upload, Pencil, Trash2, MoreHorizontal, FileUp, File, X, Download, ChevronRight, ChevronDown, ChevronLeft, List, Layers, Copy, Package, Wrench, Truck, Briefcase, Eye, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { MeasurementInlineSelect, MeasurementInlineSelectHandle } from './MeasurementInlineSelect';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { BudgetResourceForm } from './BudgetResourceForm';

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
}

interface BudgetActivity {
  id: string;
  budget_id: string;
  name: string;
  code: string;
  description: string | null;
  measurement_unit: string;
  phase_id: string | null;
  measurement_id: string | null;
  created_at: string;
  files_count?: number;
  resources_subtotal?: number;
}

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementRelation {
  measurement_id: string;
  related_measurement_id: string;
}

interface ActivityFile {
  id: string;
  activity_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

interface ActivityResource {
  id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
}

interface ActivityForm {
  name: string;
  code: string;
  description: string;
  measurement_unit: string;
  phase_id: string;
  measurement_id: string;
}

interface BudgetActivitiesTabProps {
  budgetId: string;
  isAdmin: boolean;
}

const MEASUREMENT_UNITS = [
  'm2', 'm3', 'ml', 'mes', 'ud', 'kg', 'l', 'h', 'día', 'semana', 'pa'
].sort((a, b) => a.localeCompare(b));

const emptyForm: ActivityForm = {
  name: '',
  code: '',
  description: '',
  measurement_unit: 'ud',
  phase_id: '',
  measurement_id: ''
};

export function BudgetActivitiesTab({ budgetId, isAdmin }: BudgetActivitiesTabProps) {
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementRelations, setMeasurementRelations] = useState<MeasurementRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'alphabetical' | 'grouped'>('alphabetical');
  const [activitySortOrder, setActivitySortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  
  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  
  const [editingActivity, setEditingActivity] = useState<BudgetActivity | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<BudgetActivity | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<BudgetActivity | null>(null);
  const [activityFiles, setActivityFiles] = useState<ActivityFile[]>([]);
  const [activityResources, setActivityResources] = useState<ActivityResource[]>([]);
  const [resourceDetailDialogOpen, setResourceDetailDialogOpen] = useState(false);
  const [viewingResource, setViewingResource] = useState<ActivityResource | null>(null);
  const [duplicateResourceDialogOpen, setDuplicateResourceDialogOpen] = useState(false);
  const [duplicatingResource, setDuplicatingResource] = useState<ActivityResource | null>(null);
  const [duplicateResourceName, setDuplicateResourceName] = useState('');
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [editingResourceForForm, setEditingResourceForForm] = useState<any>(null);
  
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityFileInputRef = useRef<HTMLInputElement>(null);

  // Tab navigation refs for inline editing
  const cellRefs = useRef<Map<string, MeasurementInlineSelectHandle | null>>(new Map());
  const getCellKey = (activityId: string) => activityId;

  // Get sorted activities for navigation
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => a.name.localeCompare(b.name));
  }, [activities]);

  // Focus a specific cell
  const focusCell = useCallback((activityId: string) => {
    const key = getCellKey(activityId);
    const element = cellRefs.current.get(key);
    if (element) {
      element.focus();
      element.click();
    }
  }, []);

  // Navigate to next/prev activity's measurement field
  const navigateToMeasurementField = useCallback((currentActivityId: string, direction: 'next' | 'prev') => {
    const currentIndex = sortedActivities.findIndex(a => a.id === currentActivityId);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (nextIndex < 0 || nextIndex >= sortedActivities.length) return;

    const nextActivity = sortedActivities[nextIndex];
    focusCell(nextActivity.id);
  }, [sortedActivities, focusCell]);

  // Navigate to row above/below (arrow keys)
  const navigateToRow = useCallback((currentActivityId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedActivities.findIndex(a => a.id === currentActivityId);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (nextIndex < 0 || nextIndex >= sortedActivities.length) return;

    const nextActivity = sortedActivities[nextIndex];
    focusCell(nextActivity.id);
  }, [sortedActivities, focusCell]);

  // Register cell ref
  const registerCellRef = useCallback((activityId: string, el: MeasurementInlineSelectHandle | null) => {
    cellRefs.current.set(getCellKey(activityId), el);
  }, []);

  // Calculate resource subtotal for an activity
  const calculateResourceSubtotal = (resources: any[]) => {
    return resources.reduce((total, resource) => {
      const externalCost = resource.external_unit_cost || 0;
      const safetyPercent = resource.safety_margin_percent ?? 0.15;
      const salesPercent = resource.sales_margin_percent ?? 0.25;
      
      const safetyMarginUd = externalCost * safetyPercent;
      const internalCostUd = externalCost + safetyMarginUd;
      const salesMarginUd = internalCostUd * salesPercent;
      const salesCostUd = internalCostUd + salesMarginUd;
      
      const calculatedUnits = resource.manual_units !== null 
        ? resource.manual_units 
        : (resource.related_units || 0);
      
      return total + (calculatedUnits * salesCostUd);
    }, 0);
  };

  // Fetch activities and phases
  const fetchData = async () => {
    try {
      const [activitiesRes, phasesRes, resourcesRes, measurementsRes, measurementRelationsRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name', { ascending: true }),
        supabase
          .from('budget_phases')
          .select('id, name, code')
          .eq('budget_id', budgetId)
          .order('code', { ascending: true }),
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_measurements')
          .select('id, name, manual_units, measurement_unit')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_measurement_relations')
          .select('measurement_id, related_measurement_id')
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (resourcesRes.error) throw resourcesRes.error;
      if (measurementsRes.error) throw measurementsRes.error;
      if (measurementRelationsRes.error) throw measurementRelationsRes.error;

      const allResources = resourcesRes.data || [];

      // Get file counts and resource subtotals for each activity
      const activitiesWithData = await Promise.all(
        (activitiesRes.data || []).map(async (activity) => {
          const { count } = await supabase
            .from('budget_activity_files')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activity.id);
          
          // Calculate resources subtotal
          const activityResources = allResources.filter(r => r.activity_id === activity.id);
          const resourcesSubtotal = calculateResourceSubtotal(activityResources);
          
          return { 
            ...activity, 
            files_count: count || 0,
            resources_subtotal: resourcesSubtotal
          };
        })
      );

      setActivities(activitiesWithData);
      setPhases(phasesRes.data || []);
      
      // Set measurements and filter relations to this budget
      const measurementsList = measurementsRes.data || [];
      setMeasurements(measurementsList);
      const measurementIds = measurementsList.map(m => m.id);
      const filteredRelations = (measurementRelationsRes.data || []).filter(
        r => measurementIds.includes(r.measurement_id)
      );
      setMeasurementRelations(filteredRelations);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      toast.error('Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  // Listen for edit-activity events from BudgetPhasesTab
  useEffect(() => {
    const handleEditActivity = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activityData = customEvent.detail;
      if (activityData && activityData.id) {
        // Find the full activity in our state or fetch it
        const fullActivity = activities.find(a => a.id === activityData.id);
        if (fullActivity) {
          handleEdit(fullActivity);
        } else {
          // Activity might not be loaded yet, fetch and edit
          supabase
            .from('budget_activities')
            .select('*')
            .eq('id', activityData.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setEditingActivity(data);
                setForm({
                  name: data.name,
                  code: data.code,
                  description: data.description || '',
                  measurement_unit: data.measurement_unit,
                  phase_id: data.phase_id || '',
                  measurement_id: data.measurement_id || ''
                });
                setFormDialogOpen(true);
              }
            });
        }
      }
    };

    window.addEventListener('edit-activity', handleEditActivity);
    return () => window.removeEventListener('edit-activity', handleEditActivity);
  }, [activities]);

  // Open form for new activity
  const handleNew = () => {
    setEditingActivity(null);
    setForm(emptyForm);
    setActivityResources([]);
    setFormDialogOpen(true);
  };

  // Fetch resources for an activity
  const fetchActivityResources = async (activityId: string) => {
    const { data, error } = await supabase
      .from('budget_activity_resources')
      .select('id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units')
      .eq('activity_id', activityId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching resources:', error);
      return [];
    }
    return data || [];
  };

  // Open form for editing
  const handleEdit = async (activity: BudgetActivity) => {
    setEditingActivity(activity);
    setForm({
      name: activity.name,
      code: activity.code,
      description: activity.description || '',
      measurement_unit: activity.measurement_unit,
      phase_id: activity.phase_id || '',
      measurement_id: activity.measurement_id || ''
    });
    
    // Fetch resources for this activity
    const resources = await fetchActivityResources(activity.id);
    setActivityResources(resources);
    
    setFormDialogOpen(true);
  };

  // Handle new resource for current activity - open form directly
  const handleNewResource = () => {
    if (!editingActivity) return;
    // Set up empty resource with activity pre-selected
    setEditingResourceForForm({
      id: null,
      budget_id: editingActivity.budget_id,
      name: '',
      external_unit_cost: null,
      unit: 'ud',
      resource_type: null,
      safety_margin_percent: 0.15,
      sales_margin_percent: 0.25,
      manual_units: null,
      related_units: null,
      activity_id: editingActivity.id,
      description: null,
    });
    setResourceFormOpen(true);
  };

  // Handle edit resource - open form dialog directly
  const handleEditResource = (resourceId: string) => {
    const resource = activityResources.find(r => r.id === resourceId);
    if (resource && editingActivity) {
      // Go directly to full edit form
      setEditingResourceForForm({
        id: resource.id,
        budget_id: editingActivity.budget_id,
        name: resource.name,
        external_unit_cost: resource.external_unit_cost,
        unit: resource.unit,
        resource_type: resource.resource_type,
        safety_margin_percent: resource.safety_margin_percent,
        sales_margin_percent: resource.sales_margin_percent,
        manual_units: resource.manual_units,
        related_units: resource.related_units,
        activity_id: editingActivity.id,
        description: null,
      });
      setResourceFormOpen(true);
    }
  };

  // Handle delete resource
  const handleDeleteResource = async (resourceId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este recurso?')) return;
    
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .delete()
        .eq('id', resourceId);

      if (error) throw error;
      
      // Update local state
      setActivityResources(prev => prev.filter(r => r.id !== resourceId));
      toast.success('Recurso eliminado');
      
      // Refresh main data
      fetchData();
    } catch (err: any) {
      console.error('Error deleting resource:', err);
      toast.error(err.message || 'Error al eliminar recurso');
    }
  };

  // Open duplicate resource dialog
  const openDuplicateResourceDialog = (resource: ActivityResource) => {
    setDuplicatingResource(resource);
    setDuplicateResourceName(`${resource.name} (copia)`);
    setDuplicateResourceDialogOpen(true);
  };

  // Handle duplicate resource
  const handleDuplicateResource = async () => {
    if (!editingActivity || !duplicatingResource) return;
    
    const trimmedName = duplicateResourceName.trim();
    if (!trimmedName) {
      toast.error('El nombre del recurso es obligatorio');
      return;
    }
    
    // Check for duplicate name in current activity resources
    const isDuplicate = activityResources.some(
      r => r.name.toLowerCase() === trimmedName.toLowerCase() && r.id !== duplicatingResource.id
    );
    
    if (isDuplicate) {
      toast.error('Ya existe un recurso con ese nombre en esta actividad');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .insert({
          budget_id: editingActivity.budget_id,
          activity_id: editingActivity.id,
          name: trimmedName,
          external_unit_cost: duplicatingResource.external_unit_cost,
          unit: duplicatingResource.unit,
          resource_type: duplicatingResource.resource_type,
          safety_margin_percent: duplicatingResource.safety_margin_percent,
          sales_margin_percent: duplicatingResource.sales_margin_percent,
          manual_units: duplicatingResource.manual_units,
          related_units: duplicatingResource.related_units,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add to local state
      if (data) {
        const newResource: ActivityResource = {
          id: data.id,
          name: data.name,
          external_unit_cost: data.external_unit_cost,
          unit: data.unit,
          resource_type: data.resource_type,
          safety_margin_percent: data.safety_margin_percent,
          sales_margin_percent: data.sales_margin_percent,
          manual_units: data.manual_units,
          related_units: data.related_units,
        };
        setActivityResources(prev => [...prev, newResource].sort((a, b) => a.name.localeCompare(b.name)));
      }
      
      setDuplicateResourceDialogOpen(false);
      setDuplicatingResource(null);
      toast.success('Recurso duplicado');
      fetchData();
    } catch (err: any) {
      console.error('Error duplicating resource:', err);
      toast.error(err.message || 'Error al duplicar recurso');
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (activity: BudgetActivity) => {
    setDeletingActivity(activity);
    setDeleteDialogOpen(true);
  };

  // Save activity
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.code.trim()) {
      toast.error('El código es obligatorio');
      return;
    }

    setIsSaving(true);

    try {
      const data = {
        budget_id: budgetId,
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || null,
        measurement_unit: form.measurement_unit,
        phase_id: form.phase_id || null,
        measurement_id: form.measurement_id || null
      };

      if (editingActivity) {
        const { error } = await supabase
          .from('budget_activities')
          .update(data)
          .eq('id', editingActivity.id);

        if (error) throw error;
        toast.success('Actividad actualizada');
      } else {
        const { error } = await supabase
          .from('budget_activities')
          .insert(data);

        if (error) throw error;
        toast.success('Actividad creada');
      }

      setFormDialogOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving:', err);
      toast.error(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete activity
  const handleDelete = async () => {
    if (!deletingActivity) return;

    try {
      const { error } = await supabase
        .from('budget_activities')
        .delete()
        .eq('id', deletingActivity.id);

      if (error) throw error;
      toast.success('Actividad eliminada');
      setDeleteDialogOpen(false);
      setDeletingActivity(null);
      fetchData();
    } catch (err: any) {
      console.error('Error deleting:', err);
      toast.error(err.message || 'Error al eliminar');
    }
  };

  // Duplicate activity with all related files
  const handleDuplicate = async (activity: BudgetActivity) => {
    try {
      // Create duplicated activity
      const { data: newActivity, error: activityError } = await supabase
        .from('budget_activities')
        .insert({
          budget_id: budgetId,
          name: `${activity.name} (copia)`,
          code: `${activity.code}-C`,
          description: activity.description,
          measurement_unit: activity.measurement_unit,
          phase_id: activity.phase_id
        })
        .select()
        .single();

      if (activityError) throw activityError;

      // Get files from original activity
      const { data: files, error: filesError } = await supabase
        .from('budget_activity_files')
        .select('*')
        .eq('activity_id', activity.id);

      if (filesError) throw filesError;

      // Duplicate files if any
      if (files && files.length > 0) {
        for (const file of files) {
          // Download original file
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('activity-files')
            .download(file.file_path);

          if (downloadError) {
            console.error('Error downloading file:', downloadError);
            continue;
          }

          // Upload with new path
          const fileExt = file.file_name.split('.').pop();
          const newPath = `${newActivity.id}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('activity-files')
            .upload(newPath, fileData);

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            continue;
          }

          // Create file record
          await supabase
            .from('budget_activity_files')
            .insert({
              activity_id: newActivity.id,
              file_name: file.file_name,
              file_path: newPath,
              file_type: file.file_type,
              file_size: file.file_size
            });
        }
      }

      toast.success('Actividad duplicada');
      fetchData();
    } catch (err: any) {
      console.error('Error duplicating:', err);
      toast.error(err.message || 'Error al duplicar');
    }
  };

  // Import CSV
  const handleImport = async () => {
    if (!importFile) {
      toast.error('Selecciona un archivo');
      return;
    }

    setIsImporting(true);

    try {
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header
      const dataLines = lines.slice(1);
      
      const activitiesToInsert = dataLines.map(line => {
        // Parse CSV line (handle quoted values)
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        return {
          budget_id: budgetId,
          name: values[0] || '',
          code: values[1] || '',
          description: null,
          measurement_unit: 'ud'
        };
      }).filter(a => a.name && a.code);

      if (activitiesToInsert.length === 0) {
        toast.error('No se encontraron actividades válidas en el archivo');
        return;
      }

      const { error } = await supabase
        .from('budget_activities')
        .insert(activitiesToInsert);

      if (error) throw error;

      toast.success(`${activitiesToInsert.length} actividades importadas`);
      setImportDialogOpen(false);
      setImportFile(null);
      fetchData();
    } catch (err: any) {
      console.error('Error importing:', err);
      toast.error(err.message || 'Error al importar');
    } finally {
      setIsImporting(false);
    }
  };

  // Toggle phase expansion
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

  // Generate ActividadID
  const generateActivityId = (activity: BudgetActivity) => {
    const phase = phases.find(p => p.id === activity.phase_id);
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.- ${activity.name}`.trim();
  };

  // Sort activities by ActividadID
  const sortActivitiesByActivityId = (activitiesToSort: BudgetActivity[]) => {
    return [...activitiesToSort].sort((a, b) => {
      const actIdA = generateActivityId(a);
      const actIdB = generateActivityId(b);
      return activitySortOrder === 'asc' 
        ? actIdA.localeCompare(actIdB) 
        : actIdB.localeCompare(actIdA);
    });
  };

  // Toggle sort order
  const toggleActivitySortOrder = () => {
    setActivitySortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Get phase by id
  const getPhaseById = (phaseId: string | null) => {
    return phases.find(p => p.id === phaseId);
  };

  // Get measurement data for an activity
  const getMeasurementData = (activity: BudgetActivity): { measurement: Measurement | null; relatedUnits: number; medicionId: string } => {
    if (!activity.measurement_id) {
      return { measurement: null, relatedUnits: 0, medicionId: '-' };
    }
    
    const measurement = measurements.find(m => m.id === activity.measurement_id);
    if (!measurement) {
      return { measurement: null, relatedUnits: 0, medicionId: '-' };
    }
    
    // Calculate related units (sum of manual_units from related measurements)
    const relatedMeasurementIds = measurementRelations
      .filter(r => r.measurement_id === measurement.id)
      .map(r => r.related_measurement_id);
    
    const relatedUnitsSum = relatedMeasurementIds.reduce((sum, relId) => {
      const relMeasurement = measurements.find(m => m.id === relId);
      return sum + (relMeasurement?.manual_units || 0);
    }, 0);
    
    // Uds cálculo: if relatedUnits > 0 use that, else use manual_units
    const udsCalculo = relatedUnitsSum > 0 ? relatedUnitsSum : (measurement.manual_units || 0);
    
    // Generate MediciónID: Uds cálculo/Ud medida: Measurement name
    const medicionId = `${formatNumber(udsCalculo)}/${measurement.measurement_unit || 'ud'}: ${measurement.name}`;
    
    return { 
      measurement, 
      relatedUnits: udsCalculo, 
      medicionId 
    };
  };

  // Update activity measurement_id inline
  const handleUpdateActivityMeasurement = async (activityId: string, measurementId: string | null) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ measurement_id: measurementId })
        .eq('id', activityId);

      if (error) throw error;
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.id === activityId ? { ...a, measurement_id: measurementId } : a
      ));
      toast.success('Medición actualizada');
    } catch (err: any) {
      console.error('Error updating measurement:', err);
      toast.error(err.message || 'Error al actualizar medición');
    }
  };

  // Navigate to previous/next activity in form
  const navigateToActivity = async (direction: 'prev' | 'next') => {
    if (!editingActivity) return;
    
    const sortedActivities = [...activities].sort((a, b) => a.name.localeCompare(b.name));
    const currentIndex = sortedActivities.findIndex(a => a.id === editingActivity.id);
    
    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : sortedActivities.length - 1;
    } else {
      newIndex = currentIndex < sortedActivities.length - 1 ? currentIndex + 1 : 0;
    }
    
    const newActivity = sortedActivities[newIndex];
    if (newActivity) {
      await handleEdit(newActivity);
    }
  };

  // Manage activity files
  const handleManageFiles = async (activity: BudgetActivity) => {
    setSelectedActivity(activity);
    
    const { data, error } = await supabase
      .from('budget_activity_files')
      .select('*')
      .eq('activity_id', activity.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
      toast.error('Error al cargar archivos');
      return;
    }

    setActivityFiles(data || []);
    setFilesDialogOpen(true);
  };

  // Upload file to activity
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedActivity) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${selectedActivity.id}/${Date.now()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('activity-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('budget_activity_files')
        .insert({
          activity_id: selectedActivity.id,
          file_name: file.name,
          file_path: fileName,
          file_type: file.type,
          file_size: file.size
        });

      if (dbError) throw dbError;

      toast.success('Archivo subido');
      handleManageFiles(selectedActivity);
      fetchData();
    } catch (err: any) {
      console.error('Error uploading:', err);
      toast.error(err.message || 'Error al subir archivo');
    }

    if (activityFileInputRef.current) {
      activityFileInputRef.current.value = '';
    }
  };

  // Delete file
  const handleDeleteFile = async (file: ActivityFile) => {
    try {
      // Delete from storage
      await supabase.storage
        .from('activity-files')
        .remove([file.file_path]);

      // Delete from database
      const { error } = await supabase
        .from('budget_activity_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      toast.success('Archivo eliminado');
      if (selectedActivity) {
        handleManageFiles(selectedActivity);
      }
      fetchData();
    } catch (err: any) {
      console.error('Error deleting file:', err);
      toast.error(err.message || 'Error al eliminar archivo');
    }
  };

  // Download file
  const handleDownloadFile = async (file: ActivityFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('activity-files')
        .download(file.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading:', err);
      toast.error(err.message || 'Error al descargar');
    }
  };

  // Filter activities
  const filteredActivities = activities.filter(a => {
    const term = searchTerm.toLowerCase();
    return (
      a.name.toLowerCase().includes(term) ||
      a.code.toLowerCase().includes(term) ||
      a.description?.toLowerCase().includes(term) ||
      a.measurement_unit.toLowerCase().includes(term)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">QUÉ hay que hacer? - Actividades</h3>
          <p className="text-sm text-muted-foreground">{activities.length} actividad(es)</p>
        </div>
        <div className="flex gap-2">
          {/* View Mode Toggle */}
          <div className="flex border rounded-lg">
            <Button 
              variant={viewMode === 'alphabetical' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('alphabetical')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4 mr-1" />
              Alfabético
            </Button>
            <Button 
              variant={viewMode === 'grouped' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('grouped')}
              className="rounded-l-none"
            >
              <Layers className="h-4 w-4 mr-1" />
              Por Fase
            </Button>
          </div>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Actividad
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, código, descripción..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Alphabetical View */}
      {viewMode === 'alphabetical' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ActividadID</TableHead>
                <TableHead>Actividad</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Uds Relac.</TableHead>
                <TableHead>MediciónID</TableHead>
                <TableHead className="text-right">€SubTotal Recursos</TableHead>
                <TableHead>Archivos</TableHead>
                {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.map((activity) => {
                const phase = getPhaseById(activity.phase_id);
                const { relatedUnits, medicionId } = getMeasurementData(activity);
                return (
                  <TableRow key={activity.id}>
                    <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                    <TableCell className="font-medium">{activity.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {phase ? `${phase.code} ${phase.name}` : '-'}
                    </TableCell>
                    <TableCell>{activity.measurement_unit}</TableCell>
                    <TableCell className="text-right">
                      {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      {isAdmin ? (
                        <MeasurementInlineSelect
                          ref={(el) => registerCellRef(activity.id, el)}
                          activityId={activity.id}
                          value={activity.measurement_id}
                          measurements={measurements}
                          measurementRelations={measurementRelations}
                          onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                          onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                          onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                          onArrowUp={() => navigateToRow(activity.id, 'up')}
                          onArrowDown={() => navigateToRow(activity.id, 'down')}
                        />
                      ) : (
                        <span className="text-muted-foreground truncate" title={medicionId}>
                          {medicionId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-primary">
                      {formatCurrency(activity.resources_subtotal || 0)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManageFiles(activity)}
                        className="flex items-center gap-1"
                      >
                        <File className="h-4 w-4" />
                        {activity.files_count || 0}
                      </Button>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(activity)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleManageFiles(activity)}>
                              <FileUp className="h-4 w-4 mr-2" />
                              Archivos
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteClick(activity)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filteredActivities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    {searchTerm 
                      ? 'No se encontraron actividades con ese criterio'
                      : 'No hay actividades. Crea una nueva o importa desde CSV.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grouped by Phase View */}
      {viewMode === 'grouped' && (
        <div className="space-y-2">
          {/* Activities without phase */}
          {(() => {
            const unassigned = filteredActivities.filter(a => !a.phase_id);
            if (unassigned.length > 0) {
              const isExpanded = expandedPhases.has('unassigned');
              return (
                <Collapsible open={isExpanded} onOpenChange={() => togglePhaseExpanded('unassigned')}>
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
                            <p className="font-medium text-muted-foreground">Sin fase asignada</p>
                            <p className="text-sm text-muted-foreground">
                              {unassigned.length} actividad{unassigned.length !== 1 ? 'es' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t bg-muted/20 p-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-auto p-0 font-medium hover:bg-transparent"
                                  onClick={toggleActivitySortOrder}
                                >
                                  ActividadID
                                  {activitySortOrder === 'asc' ? (
                                    <ArrowUp className="ml-1 h-3 w-3 inline" />
                                  ) : (
                                    <ArrowDown className="ml-1 h-3 w-3 inline" />
                                  )}
                                </Button>
                              </TableHead>
                              <TableHead>Unidad</TableHead>
                              <TableHead className="text-right">Uds Relac.</TableHead>
                              <TableHead>MediciónID</TableHead>
                              <TableHead className="text-right">€SubTotal Recursos</TableHead>
                              <TableHead>Archivos</TableHead>
                              {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortActivitiesByActivityId(unassigned).map(activity => {
                              const { relatedUnits, medicionId } = getMeasurementData(activity);
                              return (
                                <TableRow key={activity.id}>
                                  <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                                  <TableCell>{activity.measurement_unit}</TableCell>
                                  <TableCell className="text-right">
                                    {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                                  </TableCell>
                                  <TableCell className="text-sm max-w-[150px]">
                                    {isAdmin ? (
                                      <MeasurementInlineSelect
                                        ref={(el) => registerCellRef(activity.id, el)}
                                        activityId={activity.id}
                                        value={activity.measurement_id}
                                        measurements={measurements}
                                        measurementRelations={measurementRelations}
                                        onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                                        onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                                        onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                                        onArrowUp={() => navigateToRow(activity.id, 'up')}
                                        onArrowDown={() => navigateToRow(activity.id, 'down')}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground truncate" title={medicionId}>
                                        {medicionId}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-semibold text-primary">
                                    {formatCurrency(activity.resources_subtotal || 0)}
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => handleManageFiles(activity)}>
                                      <File className="h-4 w-4 mr-1" />{activity.files_count || 0}
                                    </Button>
                                  </TableCell>
                                  {isAdmin && (
                                    <TableCell>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => handleEdit(activity)}>
                                            <Pencil className="h-4 w-4 mr-2" />Editar
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                                            <Copy className="h-4 w-4 mr-2" />Duplicar
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleDeleteClick(activity)} className="text-destructive">
                                            <Trash2 className="h-4 w-4 mr-2" />Eliminar
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            }
            return null;
          })()}

          {/* Activities grouped by phase */}
          {phases.map(phase => {
            const phaseActivities = filteredActivities.filter(a => a.phase_id === phase.id);
            if (phaseActivities.length === 0) return null;

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
                          <p className="font-medium">{phase.code} {phase.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t bg-muted/20 p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 font-medium hover:bg-transparent"
                                onClick={toggleActivitySortOrder}
                              >
                                ActividadID
                                {activitySortOrder === 'asc' ? (
                                  <ArrowUp className="ml-1 h-3 w-3 inline" />
                                ) : (
                                  <ArrowDown className="ml-1 h-3 w-3 inline" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead className="text-right">Uds Relac.</TableHead>
                            <TableHead>MediciónID</TableHead>
                            <TableHead className="text-right">€SubTotal Recursos</TableHead>
                            <TableHead>Archivos</TableHead>
                            {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortActivitiesByActivityId(phaseActivities).map(activity => {
                            const { relatedUnits, medicionId } = getMeasurementData(activity);
                            return (
                              <TableRow key={activity.id}>
                                <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                                <TableCell>{activity.measurement_unit}</TableCell>
                                <TableCell className="text-right">
                                  {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                                </TableCell>
                                <TableCell className="text-sm max-w-[150px]">
                                  {isAdmin ? (
                                    <MeasurementInlineSelect
                                      ref={(el) => registerCellRef(activity.id, el)}
                                      activityId={activity.id}
                                      value={activity.measurement_id}
                                      measurements={measurements}
                                      measurementRelations={measurementRelations}
                                      onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                                      onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                                      onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                                      onArrowUp={() => navigateToRow(activity.id, 'up')}
                                      onArrowDown={() => navigateToRow(activity.id, 'down')}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground truncate" title={medicionId}>
                                      {medicionId}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold text-primary">
                                  {formatCurrency(activity.resources_subtotal || 0)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => handleManageFiles(activity)}>
                                    <File className="h-4 w-4 mr-1" />{activity.files_count || 0}
                                  </Button>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleEdit(activity)}>
                                          <Pencil className="h-4 w-4 mr-2" />Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                                          <Copy className="h-4 w-4 mr-2" />Duplicar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDeleteClick(activity)} className="text-destructive">
                                          <Trash2 className="h-4 w-4 mr-2" />Eliminar
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          {filteredActivities.length === 0 && (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              {searchTerm 
                ? 'No se encontraron actividades con ese criterio'
                : 'No hay actividades. Crea una nueva o importa desde CSV.'}
            </div>
          )}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}
              </DialogTitle>
              {editingActivity && (
                <div className="flex items-center gap-1 mr-6">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateToActivity('prev')}
                    title="Actividad anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateToActivity('next')}
                    title="Actividad siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <DialogDescription>
              {editingActivity 
                ? 'Modifica los datos de la actividad'
                : 'Introduce los datos de la nueva actividad'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej: 001A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad de Medida</Label>
                <Select 
                  value={form.measurement_unit} 
                  onValueChange={(value) => setForm({ ...form, measurement_unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS.map(unit => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="phase">Fase de Gestión</Label>
                <Select 
                  value={form.phase_id || 'none'} 
                  onValueChange={(value) => setForm({ ...form, phase_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar fase..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin fase</SelectItem>
                    {phases.map(phase => (
                      <SelectItem key={phase.id} value={phase.id}>
                        {phase.code} {phase.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Actividad *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Construcción losa cimentación"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descripción detallada de la actividad..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="measurement">Medición Relacionada</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {form.measurement_id 
                        ? (() => {
                            const m = measurements.find(m => m.id === form.measurement_id);
                            return m ? m.name : 'Seleccionar medición...'
                          })()
                        : 'Sin medición'}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar medición..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No se encontraron mediciones</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => setForm({ ...form, measurement_id: '' })}
                          >
                            <span className="text-muted-foreground italic">Sin medición</span>
                          </CommandItem>
                          {measurements
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(m => (
                              <CommandItem
                                key={m.id}
                                value={m.name}
                                onSelect={() => setForm({ ...form, measurement_id: m.id })}
                              >
                                {m.name} ({formatNumber(m.manual_units || 0)} {m.measurement_unit || 'ud'})
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Resources list for existing activities */}
            {editingActivity && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="text-base font-semibold">Recursos asociados ({activityResources.length})</Label>
                    <Badge variant="default" className="text-sm">
                      €SubTotal: {formatCurrency(calculateResourceSubtotal(activityResources))}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <Button 
                      size="sm" 
                      onClick={() => handleNewResource()}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Nuevo Recurso
                    </Button>
                  )}
                </div>
                {activityResources.length > 0 ? (
                  <div className="border rounded-lg max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Recurso</TableHead>
                          <TableHead className="py-2">Tipo</TableHead>
                          <TableHead className="py-2 text-right">€Coste ud ext</TableHead>
                          <TableHead className="py-2">Ud</TableHead>
                          <TableHead className="py-2 text-right">%Seg</TableHead>
                          <TableHead className="py-2 text-right">%Venta</TableHead>
                          <TableHead className="py-2 text-right">Ud manual</TableHead>
                          <TableHead className="py-2 text-right">€SubTotal</TableHead>
                          <TableHead className="py-2 w-28">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activityResources.map((resource) => {
                          const externalCost = resource.external_unit_cost || 0;
                          const safetyPercent = resource.safety_margin_percent ?? 0.15;
                          const salesPercent = resource.sales_margin_percent ?? 0.25;
                          const safetyMarginUd = externalCost * safetyPercent;
                          const internalCostUd = externalCost + safetyMarginUd;
                          const salesMarginUd = internalCostUd * salesPercent;
                          const salesCostUd = internalCostUd + salesMarginUd;
                          const calculatedUnits = resource.manual_units !== null 
                            ? resource.manual_units 
                            : (resource.related_units || 0);
                          const subtotal = calculatedUnits * salesCostUd;
                          
                          const handleInlineUpdate = async (field: string, value: any) => {
                            try {
                              console.log(`Updating ${field} to:`, value, typeof value);
                              const { error } = await supabase
                                .from('budget_activity_resources')
                                .update({ [field]: value })
                                .eq('id', resource.id);
                              if (error) throw error;
                              // Update local state
                              setActivityResources(prev => 
                                prev.map(r => r.id === resource.id ? { ...r, [field]: value } : r)
                              );
                            } catch (err: any) {
                              console.error('Error updating resource:', err);
                              toast.error('Error al actualizar');
                            }
                          };

                          const resourceTypeIcon = resource.resource_type === 'Producto' ? <Package className="h-3 w-3" /> 
                            : resource.resource_type === 'Mano de obra' ? <Wrench className="h-3 w-3" />
                            : resource.resource_type === 'Alquiler' ? <Truck className="h-3 w-3" />
                            : resource.resource_type === 'Servicio' ? <Briefcase className="h-3 w-3" />
                            : null;
                          
                          return (
                            <TableRow key={resource.id} className="text-sm">
                              <TableCell className="py-1.5 font-medium">{resource.name}</TableCell>
                              <TableCell className="py-1.5">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.resource_type || ''}
                                    type="select"
                                    options={[
                                      { value: 'Producto', label: 'Producto' },
                                      { value: 'Mano de obra', label: 'Mano de obra' },
                                      { value: 'Alquiler', label: 'Alquiler' },
                                      { value: 'Servicio', label: 'Servicio' },
                                    ]}
                                    displayValue={
                                      resource.resource_type ? (
                                        <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                                          {resourceTypeIcon}
                                          {resource.resource_type}
                                        </Badge>
                                      ) : '-'
                                    }
                                    onSave={async (v) => handleInlineUpdate('resource_type', v)}
                                  />
                                ) : (
                                  resource.resource_type ? (
                                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                                      {resourceTypeIcon}
                                      {resource.resource_type}
                                    </Badge>
                                  ) : '-'
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={externalCost}
                                    type="number"
                                    decimals={2}
                                    displayValue={<span className="font-mono">{formatCurrency(externalCost)}</span>}
                                    onSave={async (v) => handleInlineUpdate('external_unit_cost', v)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatCurrency(externalCost)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.unit || ''}
                                    type="select"
                                    options={['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'].map(u => ({ value: u, label: u }))}
                                    displayValue={resource.unit || '-'}
                                    onSave={async (v) => handleInlineUpdate('unit', v)}
                                  />
                                ) : (
                                  resource.unit || '-'
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={safetyPercent * 100}
                                    type="percent"
                                    decimals={1}
                                    displayValue={<span className="font-mono">{formatPercent(safetyPercent)}</span>}
                                    onSave={async (v) => handleInlineUpdate('safety_margin_percent', Math.max(0, v as number) / 100)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatPercent(safetyPercent)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={salesPercent * 100}
                                    type="percent"
                                    decimals={1}
                                    displayValue={<span className="font-mono">{formatPercent(salesPercent)}</span>}
                                    onSave={async (v) => handleInlineUpdate('sales_margin_percent', Math.max(0, v as number) / 100)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatPercent(salesPercent)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.manual_units}
                                    type="number"
                                    decimals={2}
                                    allowNull={true}
                                    displayValue={<span className="font-mono">{resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}</span>}
                                    onSave={async (v) => handleInlineUpdate('manual_units', v)}
                                  />
                                ) : (
                                  <span className="font-mono">{resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono font-semibold text-primary">
                                {formatCurrency(subtotal)}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setViewingResource(resource);
                                      setResourceDetailDialogOpen(true);
                                    }}
                                    title="Ver detalle"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {isAdmin && (
                                    <>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => openDuplicateResourceDialog(resource)}
                                        title="Duplicar"
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => handleEditResource(resource.id)}
                                        title="Editar"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 text-destructive"
                                        onClick={() => handleDeleteResource(resource.id)}
                                        title="Eliminar"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground border rounded-lg">
                    No hay recursos asociados a esta actividad
                  </div>
                )}
              </div>
            )}
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

      {/* Resource Detail Dialog */}
      <Dialog open={resourceDetailDialogOpen} onOpenChange={setResourceDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Recurso</DialogTitle>
            <DialogDescription>
              Información completa del recurso
            </DialogDescription>
          </DialogHeader>
          
          {viewingResource && (() => {
            const externalCost = viewingResource.external_unit_cost || 0;
            const safetyPercent = viewingResource.safety_margin_percent ?? 0.15;
            const salesPercent = viewingResource.sales_margin_percent ?? 0.25;
            const safetyMarginUd = externalCost * safetyPercent;
            const internalCostUd = externalCost + safetyMarginUd;
            const salesMarginUd = internalCostUd * salesPercent;
            const salesCostUd = internalCostUd + salesMarginUd;
            const calculatedUnits = viewingResource.manual_units !== null 
              ? viewingResource.manual_units 
              : (viewingResource.related_units || 0);
            const subtotal = calculatedUnits * salesCostUd;
            
            return (
              <div className="space-y-4 py-4">
                {/* Resource name and type */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{viewingResource.name}</h3>
                  {viewingResource.resource_type && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      {viewingResource.resource_type === 'Producto' && <Package className="h-3 w-3" />}
                      {viewingResource.resource_type === 'Mano de obra' && <Wrench className="h-3 w-3" />}
                      {viewingResource.resource_type === 'Alquiler' && <Truck className="h-3 w-3" />}
                      {viewingResource.resource_type === 'Servicio' && <Briefcase className="h-3 w-3" />}
                      {viewingResource.resource_type}
                    </Badge>
                  )}
                </div>
                
                {/* Cost breakdown */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">€Coste ud externa</p>
                    <p className="font-mono font-semibold">{formatCurrency(externalCost)}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Unidad medida</p>
                    <p className="font-semibold">{viewingResource.unit || '-'}</p>
                  </div>
                </div>
                
                {/* Margins */}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Márgenes</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">%Seguridad</p>
                      <p className="font-mono">{(safetyPercent * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Margen seg.</p>
                      <p className="font-mono">{formatCurrency(safetyMarginUd)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Coste interno</p>
                      <p className="font-mono">{formatCurrency(internalCostUd)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t">
                    <div>
                      <p className="text-muted-foreground text-xs">%Venta</p>
                      <p className="font-mono">{(salesPercent * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Margen venta</p>
                      <p className="font-mono">{formatCurrency(salesMarginUd)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Coste venta ud</p>
                      <p className="font-mono font-semibold text-primary">{formatCurrency(salesCostUd)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Units */}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds manual</p>
                    <p className="font-mono">{viewingResource.manual_units !== null ? viewingResource.manual_units : '-'}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds relacionadas</p>
                    <p className="font-mono">{viewingResource.related_units !== null ? viewingResource.related_units : '-'}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds calculadas</p>
                    <p className="font-mono font-semibold">{calculatedUnits}</p>
                  </div>
                </div>
                
                {/* Total */}
                <div className="bg-primary/10 p-4 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">€SubTotal venta</p>
                  <p className="text-2xl font-bold text-primary font-mono">{formatCurrency(subtotal)}</p>
                </div>
              </div>
            );
          })()}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResourceDetailDialogOpen(false)}>
              Cerrar
            </Button>
            {isAdmin && viewingResource && editingActivity && (
              <Button onClick={() => {
                // Prepare resource data for the form
                setEditingResourceForForm({
                  id: viewingResource.id,
                  budget_id: editingActivity.budget_id,
                  name: viewingResource.name,
                  external_unit_cost: viewingResource.external_unit_cost,
                  unit: viewingResource.unit,
                  resource_type: viewingResource.resource_type,
                  safety_margin_percent: viewingResource.safety_margin_percent,
                  sales_margin_percent: viewingResource.sales_margin_percent,
                  manual_units: viewingResource.manual_units,
                  related_units: viewingResource.related_units,
                  activity_id: editingActivity.id,
                  description: null,
                });
                setResourceDetailDialogOpen(false);
                setResourceFormOpen(true);
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar completo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Resource Dialog */}
      <Dialog open={duplicateResourceDialogOpen} onOpenChange={setDuplicateResourceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar Recurso</DialogTitle>
            <DialogDescription>
              Introduce el nombre para el nuevo recurso duplicado
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
            const trimmedName = duplicateResourceName.trim();
            const isDuplicateName = trimmedName && activityResources.some(
              r => r.name.toLowerCase() === trimmedName.toLowerCase() && r.id !== duplicatingResource?.id
            );
            
            return (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="duplicate-name">Nombre del recurso *</Label>
                    <Input
                      id="duplicate-name"
                      value={duplicateResourceName}
                      onChange={(e) => setDuplicateResourceName(e.target.value)}
                      placeholder="Nombre del recurso"
                      maxLength={200}
                      autoFocus
                      className={isDuplicateName ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {isDuplicateName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Ya existe un recurso con este nombre en la actividad
                      </p>
                    )}
                  </div>
                  
                  {duplicatingResource && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      <p>Recurso original: <span className="font-medium">{duplicatingResource.name}</span></p>
                      <p>Tipo: {duplicatingResource.resource_type || '-'}</p>
                      <p>€Coste ud: {formatCurrency(duplicatingResource.external_unit_cost || 0)}</p>
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDuplicateResourceDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleDuplicateResource} 
                    disabled={!trimmedName || isDuplicateName}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Actividades</DialogTitle>
            <DialogDescription>
              Importa actividades desde un archivo CSV. El archivo debe tener las columnas: Actividad, Código actividad
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              
              {importFile ? (
                <div className="flex items-center justify-center gap-2">
                  <File className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{importFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(importFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setImportFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Arrastra un archivo CSV o haz clic para seleccionar
                  </p>
                  <Button 
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Seleccionar archivo
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={!importFile || isImporting}>
              {isImporting ? 'Importando...' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Files Dialog */}
      <Dialog open={filesDialogOpen} onOpenChange={setFilesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archivos de: {selectedActivity?.name}</DialogTitle>
            <DialogDescription>
              Gestiona los archivos multimedia de esta actividad
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isAdmin && (
              <div className="flex justify-end">
                <input
                  type="file"
                  ref={activityFileInputRef}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button onClick={() => activityFileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir archivo
                </Button>
              </div>
            )}

            {activityFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay archivos adjuntos
              </div>
            ) : (
              <div className="space-y-2">
                {activityFiles.map((file) => (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDownloadFile(file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteFile(file)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFilesDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Actividad"
        description={`¿Estás seguro de que quieres eliminar la actividad "${deletingActivity?.name}"? Esta acción no se puede deshacer.`}
      />

      {/* Budget Resource Form for Full Edit */}
      {editingActivity && (
        <BudgetResourceForm
          open={resourceFormOpen}
          onOpenChange={setResourceFormOpen}
          budgetId={editingActivity.budget_id}
          resource={editingResourceForForm}
          activities={activities.map(a => ({
            id: a.id,
            code: a.code,
            name: a.name,
            phase_id: a.phase_id
          }))}
          phases={phases.map(p => ({
            id: p.id,
            code: p.code,
            name: p.name
          }))}
          onSave={async () => {
            setResourceFormOpen(false);
            setEditingResourceForForm(null);
            // Refresh resources for the current activity
            if (editingActivity) {
              const resources = await fetchActivityResources(editingActivity.id);
              setActivityResources(resources);
            }
            // Also refresh main data
            fetchData();
          }}
        />
      )}
    </div>
  );
}
