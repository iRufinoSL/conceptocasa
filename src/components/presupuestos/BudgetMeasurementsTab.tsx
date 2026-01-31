import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Search, Edit, Trash2, Ruler, Link2, Upload, FileUp, X, Download, Copy, List, Layers, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MeasurementMultiSelect } from '@/components/presupuestos/MeasurementMultiSelect';
import { MeasurementsWorkAreaGroupedView } from '@/components/presupuestos/MeasurementsWorkAreaGroupedView';
import { syncAllAffectedResources, syncResourcesRelatedUnits } from '@/lib/budget-utils';
import { ResourceInlineEdit } from '@/components/presupuestos/ResourceInlineEdit';
import { 
  readExcelFile, 
  writeExcelFile, 
  measurementImportSchema, 
  MEASUREMENT_COLUMN_MAPPING,
  parseNumber as parseEuropeanNumber,
  getCellString,
  MEASUREMENT_UNITS
} from '@/lib/excel-utils';


interface Measurement {
  id: string;
  budget_id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
  created_at: string;
  updated_at: string;
}

interface MeasurementRelation {
  id: string;
  measurement_id: string;
  related_measurement_id: string;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  measurement_id: string | null;
}

interface Phase {
  id: string;
  name: string;
  code: string | null;
}

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
}

interface WorkAreaMeasurement {
  work_area_id: string;
  measurement_id: string;
}

interface BudgetMeasurementsTabProps {
  budgetId: string;
  isAdmin: boolean;
}

// MEASUREMENT_UNITS imported from excel-utils

export function BudgetMeasurementsTab({ budgetId, isAdmin }: BudgetMeasurementsTabProps) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [relations, setRelations] = useState<MeasurementRelation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workAreaMeasurements, setWorkAreaMeasurements] = useState<WorkAreaMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'alphabetic' | 'grouped'>('alphabetic');
  
  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<Measurement | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    manual_units: null as number | null,
    measurement_unit: 'ud',
    related_measurement_ids: [] as string[],
    activity_ids: [] as string[]
  });
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [measurementToDelete, setMeasurementToDelete] = useState<Measurement | null>(null);
  
  // Import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When opening the edit form from the list, store scroll position so we can restore it after saving
  const returnToListRef = useRef<{ top: number; measurementId: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [measurementsRes, relationsRes, activitiesRes, phasesRes, workAreasRes, workAreaMeasurementsRes] = await Promise.all([
        supabase.from('budget_measurements').select('*').eq('budget_id', budgetId).order('name'),
        supabase.from('budget_measurement_relations').select('*'),
        supabase.from('budget_activities').select('id, name, code, phase_id, measurement_id').eq('budget_id', budgetId),
        supabase.from('budget_phases').select('id, name, code').eq('budget_id', budgetId),
        supabase.from('budget_work_areas').select('id, name, level, work_area').eq('budget_id', budgetId),
        supabase.from('budget_work_area_measurements').select('work_area_id, measurement_id')
      ]);

      if (measurementsRes.error) throw measurementsRes.error;
      if (relationsRes.error) throw relationsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (workAreasRes.error) throw workAreasRes.error;
      if (workAreaMeasurementsRes.error) throw workAreaMeasurementsRes.error;

      setMeasurements(measurementsRes.data || []);

      // Filter relations to only those belonging to this budget's measurements
      const measurementIds = (measurementsRes.data || []).map(m => m.id);
      const filteredRelations = (relationsRes.data || []).filter(
        r => measurementIds.includes(r.measurement_id)
      );
      setRelations(filteredRelations);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
      setWorkAreas(workAreasRes.data || []);

      // Filter work area measurements to only those belonging to this budget's measurements
      const filteredWaMeasurements = (workAreaMeasurementsRes.data || []).filter(
        wam => measurementIds.includes(wam.measurement_id)
      );
      setWorkAreaMeasurements(filteredWaMeasurements);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar las mediciones');
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate related units for a measurement
  const getRelatedUnits = (measurementId: string): number => {
    const relatedIds = relations
      .filter(r => r.measurement_id === measurementId)
      .map(r => r.related_measurement_id);
    
    return relatedIds.reduce((sum, relId) => {
      const relMeasurement = measurements.find(m => m.id === relId);
      return sum + (relMeasurement?.manual_units || 0);
    }, 0);
  };

  // Calculate Uds cálculo
  const getCalculatedUnits = (measurement: Measurement): number => {
    const relatedUnits = getRelatedUnits(measurement.id);
    if (relatedUnits > 0) {
      return relatedUnits;
    }
    return measurement.manual_units || 0;
  };

  // Get related activities for a measurement
  const getRelatedActivities = (measurementId: string): Activity[] => {
    return activities.filter(a => a.measurement_id === measurementId);
  };

  // Generate MediciónID
  const generateMedicionId = (measurement: Measurement): string => {
    const udsCalculo = getCalculatedUnits(measurement);
    const unit = measurement.measurement_unit || 'ud';
    const relatedActivities = getRelatedActivities(measurement.id);
    
    if (relatedActivities.length === 0) {
      return `${formatNumber(udsCalculo)}/${unit}: Sin actividad`;
    }
    
    const activityNames = relatedActivities.map(a => {
      const phase = phases.find(p => p.id === a.phase_id);
      const phaseCode = phase?.code || '';
      return `${phaseCode} ${a.code}.-${a.name}`;
    }).join(', ');
    
    return `${formatNumber(udsCalculo)}/${unit}: ${activityNames}`;
  };

  // Get related measurements for a measurement
  const getRelatedMeasurements = (measurementId: string): Measurement[] => {
    const relatedIds = relations
      .filter(r => r.measurement_id === measurementId)
      .map(r => r.related_measurement_id);
    return measurements.filter(m => relatedIds.includes(m.id));
  };

  // Filter measurements
  const filteredMeasurements = useMemo(() => {
    if (!searchTerm) return measurements;
    return measurements.filter(m => 
      searchMatch(m.name, searchTerm) ||
      searchMatch(m.measurement_unit, searchTerm) ||
      searchMatch(generateMedicionId(m), searchTerm)
    );
  }, [measurements, searchTerm, relations, activities, phases]);


  const openCreateForm = () => {
    setEditingMeasurement(null);
    setFormData({
      name: '',
      manual_units: null,
      measurement_unit: 'ud',
      related_measurement_ids: [],
      activity_ids: []
    });
    setFormOpen(true);
  };

  const openEditForm = (measurement: Measurement, opts?: { captureScroll?: boolean }) => {
    if (opts?.captureScroll) {
      returnToListRef.current = { top: window.scrollY, measurementId: measurement.id };
    }

    const relatedIds = relations
      .filter(r => r.measurement_id === measurement.id)
      .map(r => r.related_measurement_id);
    
    const activityIds = activities
      .filter(a => a.measurement_id === measurement.id)
      .map(a => a.id);

    setEditingMeasurement(measurement);
    setFormData({
      name: measurement.name,
      manual_units: measurement.manual_units,
      measurement_unit: measurement.measurement_unit || 'ud',
      related_measurement_ids: relatedIds,
      activity_ids: activityIds
    });
    setFormOpen(true);
  };

  // Save measurement and optionally navigate
  const saveMeasurement = async (): Promise<boolean> => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return false;
    }

    try {
      if (editingMeasurement) {
        // Update measurement
        const { error: updateError } = await supabase
          .from('budget_measurements')
          .update({
            name: formData.name.trim(),
            manual_units: formData.manual_units,
            measurement_unit: formData.measurement_unit
          })
          .eq('id', editingMeasurement.id);

        if (updateError) throw updateError;

        // Update relations - delete old and insert new
        await supabase
          .from('budget_measurement_relations')
          .delete()
          .eq('measurement_id', editingMeasurement.id);

        if (formData.related_measurement_ids.length > 0) {
          const relationsToInsert = formData.related_measurement_ids.map(relId => ({
            measurement_id: editingMeasurement.id,
            related_measurement_id: relId
          }));
          
          const { error: relError } = await supabase
            .from('budget_measurement_relations')
            .insert(relationsToInsert);
          
          if (relError) throw relError;
        }

        // Update activity links - first unlink all, then link selected
        await supabase
          .from('budget_activities')
          .update({ measurement_id: null })
          .eq('measurement_id', editingMeasurement.id);

        if (formData.activity_ids.length > 0) {
          const { error: actError } = await supabase
            .from('budget_activities')
            .update({ measurement_id: editingMeasurement.id })
            .in('id', formData.activity_ids);
          
          if (actError) throw actError;
        }

        // Sync related_units for resources of linked activities
        await syncAllAffectedResources(editingMeasurement.id);

        toast.success('Medición actualizada');
      } else {
        // Create measurement
        const { data: newMeasurement, error: createError } = await supabase
          .from('budget_measurements')
          .insert({
            budget_id: budgetId,
            name: formData.name.trim(),
            manual_units: formData.manual_units,
            measurement_unit: formData.measurement_unit
          })
          .select()
          .single();

        if (createError) throw createError;

        // Create relations
        if (formData.related_measurement_ids.length > 0) {
          const relationsToInsert = formData.related_measurement_ids.map(relId => ({
            measurement_id: newMeasurement.id,
            related_measurement_id: relId
          }));
          
          const { error: relError } = await supabase
            .from('budget_measurement_relations')
            .insert(relationsToInsert);
          
          if (relError) throw relError;
        }

        // Link activities
        if (formData.activity_ids.length > 0) {
          const { error: actError } = await supabase
            .from('budget_activities')
            .update({ measurement_id: newMeasurement.id })
            .in('id', formData.activity_ids);
          
          if (actError) throw actError;
        }

        // Sync related_units for resources of newly linked activities
        await syncResourcesRelatedUnits(newMeasurement.id);

        toast.success('Medición creada');
      }

      return true;
    } catch (error) {
      console.error('Error saving measurement:', error);
      toast.error('Error al guardar la medición');
      return false;
    }
  };

  const handleSubmit = async () => {
    const success = await saveMeasurement();
    if (success) {
      setFormOpen(false);
      await fetchData();

      // If user opened the form from the list, restore scroll position to where they came from
      if (returnToListRef.current) {
        const { top } = returnToListRef.current;
        returnToListRef.current = null;
        requestAnimationFrame(() => {
          window.scrollTo({ top, behavior: 'instant' });
        });
      }
    }
  };

  // Get current measurement index in filteredMeasurements
  const currentMeasurementIndex = useMemo(() => {
    if (!editingMeasurement) return -1;
    return filteredMeasurements.findIndex(m => m.id === editingMeasurement.id);
  }, [editingMeasurement, filteredMeasurements]);

  // Navigation handlers for the form
  const navigateToMeasurement = async (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (!editingMeasurement || filteredMeasurements.length === 0) return;

    // First save current changes
    const success = await saveMeasurement();
    if (!success) return;

    // Refresh data to get updated measurements
    await fetchData();

    // Determine target index
    let targetIndex = currentMeasurementIndex;
    switch (direction) {
      case 'first':
        targetIndex = 0;
        break;
      case 'prev':
        targetIndex = Math.max(0, currentMeasurementIndex - 1);
        break;
      case 'next':
        targetIndex = Math.min(filteredMeasurements.length - 1, currentMeasurementIndex + 1);
        break;
      case 'last':
        targetIndex = filteredMeasurements.length - 1;
        break;
    }

    // Open the target measurement form
    const targetMeasurement = filteredMeasurements[targetIndex];
    if (targetMeasurement) {
      openEditForm(targetMeasurement);
    }
  };

  const canNavigatePrev = currentMeasurementIndex > 0;
  const canNavigateNext = currentMeasurementIndex < filteredMeasurements.length - 1;

  const handleDelete = async () => {
    if (!measurementToDelete) return;

    try {
      const { error } = await supabase
        .from('budget_measurements')
        .delete()
        .eq('id', measurementToDelete.id);

      if (error) throw error;

      toast.success('Medición eliminada');
      setDeleteDialogOpen(false);
      setMeasurementToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting measurement:', error);
      toast.error('Error al eliminar la medición');
    }
  };

  // Inline save for manual units (safe raw typing; save only on Enter/Tab)
  const handleInlineManualUnitsSave = useCallback(
    async (measurementId: string, newValue: number | null) => {
      const { error } = await supabase
        .from('budget_measurements')
        .update({ manual_units: newValue })
        .eq('id', measurementId);

      if (error) throw error;

      // Update local state
      setMeasurements((prev) =>
        prev.map((m) => (m.id === measurementId ? { ...m, manual_units: newValue } : m))
      );

      // Keep downstream totals/resources consistent
      await syncAllAffectedResources(measurementId);
    },
    []
  );

  // Duplicate measurement with relations and activities
  const handleDuplicate = async (measurement: Measurement) => {
    try {
      // Create duplicated measurement
      const { data: newMeasurement, error: measurementError } = await supabase
        .from('budget_measurements')
        .insert({
          budget_id: budgetId,
          name: `${measurement.name} (copia)`,
          manual_units: measurement.manual_units,
          measurement_unit: measurement.measurement_unit
        })
        .select()
        .single();

      if (measurementError) throw measurementError;

      // Copy relations (related measurements)
      const measurementRelations = relations.filter(r => r.measurement_id === measurement.id);
      if (measurementRelations.length > 0) {
        const relationsToInsert = measurementRelations.map(r => ({
          measurement_id: newMeasurement.id,
          related_measurement_id: r.related_measurement_id
        }));

        const { error: relationsError } = await supabase
          .from('budget_measurement_relations')
          .insert(relationsToInsert);

        if (relationsError) throw relationsError;
      }

      // Copy activity links - link the same activities to the new measurement
      // Note: This creates a copy of the links, not the activities themselves
      const linkedActivities = activities.filter(a => a.measurement_id === measurement.id);
      if (linkedActivities.length > 0) {
        // Update activities to also be linked to new measurement
        // Since an activity can only have one measurement, we'll create a note about this
        toast.info(`${linkedActivities.length} actividades vinculadas no se duplicaron (cada actividad solo puede tener una medición)`);
      }

      toast.success('Medición duplicada correctamente');
      fetchData();
    } catch (error) {
      console.error('Error duplicating measurement:', error);
      toast.error('Error al duplicar la medición');
    }
  };

  // Get available activities (not linked to any measurement, or linked to current one)
  const availableActivities = useMemo(() => {
    return activities.filter(a => 
      !a.measurement_id || a.measurement_id === editingMeasurement?.id
    );
  }, [activities, editingMeasurement]);

  // Toggle related measurement
  const toggleRelatedMeasurement = (measurementId: string) => {
    setFormData(prev => ({
      ...prev,
      related_measurement_ids: prev.related_measurement_ids.includes(measurementId)
        ? prev.related_measurement_ids.filter(id => id !== measurementId)
        : [...prev.related_measurement_ids, measurementId]
    }));
  };

  // Toggle activity
  const toggleActivity = (activityId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_ids: prev.activity_ids.includes(activityId)
        ? prev.activity_ids.filter(id => id !== activityId)
        : [...prev.activity_ids, activityId]
    }));
  };

  // Parse European number format
  const parseEuropeanNumber = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    // Remove thousands separator (.) and replace decimal comma with period
    const normalized = value.toString().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  };

  // Handle inline related measurements update
  const handleRelatedMeasurementsUpdate = useCallback(async (
    measurementId: string,
    selectedRelatedIds: string[]
  ) => {
    try {
      // Delete existing relations for this measurement
      await supabase
        .from('budget_measurement_relations')
        .delete()
        .eq('measurement_id', measurementId);

      // Insert new relations
      if (selectedRelatedIds.length > 0) {
        const relationsToInsert = selectedRelatedIds.map(relId => ({
          measurement_id: measurementId,
          related_measurement_id: relId
        }));

        const { error } = await supabase
          .from('budget_measurement_relations')
          .insert(relationsToInsert);

        if (error) throw error;
      }

      // Sync related_units for resources of activities linked to this measurement
      await syncResourcesRelatedUnits(measurementId);

      toast.success('Mediciones relacionadas actualizadas');
      fetchData();
    } catch (error) {
      console.error('Error updating related measurements:', error);
      toast.error('Error al actualizar mediciones relacionadas');
    }
  }, [fetchData]);

  // Get formatted activities display for a measurement
  const getActivitiesDisplay = useCallback((measurementId: string): string => {
    const relatedActs = activities.filter(a => a.measurement_id === measurementId);
    if (relatedActs.length === 0) return '-';
    
    return relatedActs.map(a => {
      const phase = phases.find(p => p.id === a.phase_id);
      return `${phase?.code || ''} ${a.code}.-${a.name}`;
    }).join(', ');
  }, [activities, phases]);

  // Handle CSV/Excel import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
  };

  const handleImport = async () => {
    if (!importFile) return;

    setIsImporting(true);
    try {
      // Use the new excel-utils module with validation
      const result = await readExcelFile(
        importFile, 
        measurementImportSchema,
        MEASUREMENT_COLUMN_MAPPING,
        {
          skipDuplicates: new Set(measurements.map(m => m.name.toLowerCase().trim())),
          duplicateField: 'name'
        }
      );

      if (!result.success && result.data.length === 0) {
        const errorMsg = result.errors[0]?.message || 'Error al procesar el archivo';
        toast.error(errorMsg);
        return;
      }

      // Show validation errors if any
      if (result.errors.length > 0) {
        console.warn('Import validation errors:', result.errors);
        toast.warning(`${result.errors.length} filas con errores de validación omitidas`);
      }

      // Build a map of existing measurements by name (case-insensitive)
      const existingMeasurementsMap = new Map<string, string>();
      measurements.forEach(m => {
        existingMeasurementsMap.set(m.name.toLowerCase().trim(), m.id);
      });

      // Process validated data
      interface ImportedMeasurement {
        name: string;
        manual_units: number | null;
        measurement_unit: string;
        related_names: string[];
        isNew: boolean;
      }

      const importedMeasurements: ImportedMeasurement[] = [];
      const newMeasurementNames = new Set<string>();
      let duplicateCount = 0;

      for (const row of result.data) {
        const name = row.name;
        if (!name) continue;

        const isExisting = existingMeasurementsMap.has(name.toLowerCase());
        
        // Parse related measurements (comma or semicolon separated)
        let relatedNames: string[] = [];
        if (row.related_measurements) {
          relatedNames = row.related_measurements
            .split(/[,;]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        }

        if (isExisting) {
          if (relatedNames.length > 0) {
            importedMeasurements.push({
              name,
              manual_units: null,
              measurement_unit: 'ud',
              related_names: relatedNames,
              isNew: false
            });
          }
          duplicateCount++;
          continue;
        }

        if (newMeasurementNames.has(name.toLowerCase())) {
          continue;
        }

        importedMeasurements.push({
          name,
          manual_units: row.manual_units ?? null,
          measurement_unit: row.measurement_unit || 'ud',
          related_names: relatedNames,
          isNew: true
        });

        newMeasurementNames.add(name.toLowerCase());
      }

      const newMeasurements = importedMeasurements.filter(m => m.isNew);
      
      if (newMeasurements.length === 0 && importedMeasurements.filter(m => m.related_names.length > 0).length === 0) {
        toast.error(duplicateCount > 0 
          ? `Todas las ${duplicateCount} mediciones ya existen y no hay relaciones nuevas` 
          : 'No se encontraron mediciones válidas para importar');
        return;
      }

      // Insert new measurements
      let insertedMeasurements: Array<{ id: string; name: string }> = [];
      if (newMeasurements.length > 0) {
        const measurementsToInsert = newMeasurements.map(m => ({
          budget_id: budgetId,
          name: m.name,
          manual_units: m.manual_units,
          measurement_unit: m.measurement_unit
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from('budget_measurements')
          .insert(measurementsToInsert)
          .select('id, name');

        if (insertError) throw insertError;
        insertedMeasurements = insertedData || [];

        insertedMeasurements.forEach(m => {
          existingMeasurementsMap.set(m.name.toLowerCase().trim(), m.id);
        });
      }

      // Create relations
      const relationsToInsert: Array<{ measurement_id: string; related_measurement_id: string }> = [];
      const existingRelationsSet = new Set(
        relations.map(r => `${r.measurement_id}:${r.related_measurement_id}`)
      );

      for (const imported of importedMeasurements) {
        if (imported.related_names.length === 0) continue;

        const measurementId = existingMeasurementsMap.get(imported.name.toLowerCase().trim());
        if (!measurementId) continue;

        for (const relatedName of imported.related_names) {
          const relatedId = existingMeasurementsMap.get(relatedName.toLowerCase().trim());
          if (!relatedId) continue;
          if (relatedId === measurementId) continue;

          const relationKey = `${measurementId}:${relatedId}`;
          if (existingRelationsSet.has(relationKey)) continue;

          relationsToInsert.push({
            measurement_id: measurementId,
            related_measurement_id: relatedId
          });
          existingRelationsSet.add(relationKey);
        }
      }

      if (relationsToInsert.length > 0) {
        const { error: relError } = await supabase
          .from('budget_measurement_relations')
          .insert(relationsToInsert);

        if (relError) throw relError;
      }

      // Build success message
      const messages: string[] = [];
      if (newMeasurements.length > 0) {
        messages.push(`${newMeasurements.length} mediciones creadas`);
      }
      if (relationsToInsert.length > 0) {
        messages.push(`${relationsToInsert.length} relaciones creadas`);
      }
      if (duplicateCount > 0) {
        messages.push(`${duplicateCount} existentes omitidas`);
      }

      toast.success(messages.join(', '));
      setImportDialogOpen(false);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData();
    } catch (error) {
      console.error('Error importing:', error);
      toast.error('Error al importar el archivo');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle export to Excel
  const handleExport = async () => {
    if (measurements.length === 0) {
      toast.error('No hay mediciones para exportar');
      return;
    }

    try {
      // Build export data with relations
      const exportData = measurements.map(measurement => {
        // Get related measurement names
        const relatedMeasurementIds = relations
          .filter(r => r.measurement_id === measurement.id)
          .map(r => r.related_measurement_id);
        
        const relatedNames = relatedMeasurementIds
          .map(relId => {
            const relMeasurement = measurements.find(m => m.id === relId);
            return relMeasurement?.name || '';
          })
          .filter(name => name.length > 0)
          .join('; ');

        // Get related activities
        const relatedActivitiesNames = activities
          .filter(a => a.measurement_id === measurement.id)
          .map(a => {
            const phase = phases.find(p => p.id === a.phase_id);
            return `${phase?.code || ''} ${a.code}.-${a.name}`.trim();
          })
          .join('; ');

        // Calculate values
        const relatedUnitsVal = getRelatedUnits(measurement.id);
        const calculatedUnits = getCalculatedUnits(measurement);

        return {
          Nombre: measurement.name,
          UdsManual: measurement.manual_units !== null ? measurement.manual_units : '',
          UdMedida: measurement.measurement_unit || 'ud',
          MedicionesRelacionadas: relatedNames,
          UdsRelacionadas: relatedUnitsVal > 0 ? relatedUnitsVal : '',
          UdsCalculo: calculatedUnits,
          ActividadesRelacionadas: relatedActivitiesNames,
          MedicionID: generateMedicionId(measurement)
        };
      });

      // Define columns for export
      const columns = [
        { header: 'Nombre', key: 'Nombre', width: 30 },
        { header: 'Uds Manual', key: 'UdsManual', width: 12 },
        { header: 'Ud Medida', key: 'UdMedida', width: 10 },
        { header: 'Mediciones Relacionadas', key: 'MedicionesRelacionadas', width: 40 },
        { header: 'Uds Relacionadas', key: 'UdsRelacionadas', width: 15 },
        { header: 'Uds Cálculo', key: 'UdsCalculo', width: 12 },
        { header: 'Actividades Relacionadas', key: 'ActividadesRelacionadas', width: 50 },
        { header: 'MediciónID', key: 'MedicionID', width: 60 },
      ];

      // Generate filename with date
      const date = new Date().toISOString().split('T')[0];
      const fileName = `mediciones_${date}.xlsx`;

      // Use the new writeExcelFile utility
      await writeExcelFile(exportData, columns, fileName, 'Mediciones');
      toast.success(`Exportadas ${measurements.length} mediciones`);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Error al exportar las mediciones');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="h-5 w-5" />
                Mediciones
              </CardTitle>
              <CardDescription>
                Gestiona las mediciones del presupuesto
              </CardDescription>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                {measurements.length > 0 && (
                  <Button variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                )}
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </Button>
                <Button onClick={openCreateForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Medición
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* View Mode Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'alphabetic' | 'grouped')} className="w-auto">
              <TabsList>
                <TabsTrigger value="alphabetic" className="flex items-center gap-2">
                  <List className="h-4 w-4" />
                  Alfabético
                </TabsTrigger>
                <TabsTrigger value="grouped" className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Por Área
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar mediciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Grouped View */}
          {viewMode === 'grouped' ? (
            <MeasurementsWorkAreaGroupedView
              measurements={filteredMeasurements}
              relations={relations}
              workAreas={workAreas}
              workAreaMeasurements={workAreaMeasurements}
              activities={activities}
              isAdmin={isAdmin}
              onEdit={openEditForm}
              onDuplicate={handleDuplicate}
              onDelete={(m) => {
                setMeasurementToDelete(m);
                setDeleteDialogOpen(true);
              }}
              onUpdateManualUnits={isAdmin ? handleInlineManualUnitsSave : undefined}
              getRelatedUnits={getRelatedUnits}
              getCalculatedUnits={getCalculatedUnits}
              getRelatedMeasurements={getRelatedMeasurements}
              getRelatedActivities={getRelatedActivities}
              generateMedicionId={generateMedicionId}
            />
          ) : filteredMeasurements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm ? 'No se encontraron mediciones' : 'No hay mediciones. Crea la primera.'}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Uds Manual</TableHead>
                    <TableHead>Ud Medida</TableHead>
                    <TableHead>Mediciones Relacionadas</TableHead>
                    <TableHead className="text-right">Uds Relacionadas</TableHead>
                    <TableHead className="text-right">Uds Cálculo</TableHead>
                    <TableHead>Actividades Relacionadas</TableHead>
                    <TableHead>MediciónID</TableHead>
                    {isAdmin && <TableHead className="w-[100px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMeasurements.map((measurement) => {
                    const relatedUnits = getRelatedUnits(measurement.id);
                    const calculatedUnits = getCalculatedUnits(measurement);
                    const relatedMeasurements = getRelatedMeasurements(measurement.id);
                    const medicionId = generateMedicionId(measurement);

                    return (
                      <TableRow key={measurement.id}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1 -mx-1 rounded-md transition-colors truncate hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                            onClick={() => isAdmin && openEditForm(measurement, { captureScroll: true })}
                            title={isAdmin ? 'Editar medición' : measurement.name}
                            disabled={!isAdmin}
                          >
                            <span className="truncate block">{measurement.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <ResourceInlineEdit
                              value={measurement.manual_units}
                              onSave={(val) => handleInlineManualUnitsSave(measurement.id, val)}
                              type="number"
                              decimals={2}
                              allowNull={true}
                              numericInputMode="raw"
                              clearOnEdit={true}
                              displayValue={
                                measurement.manual_units !== null
                                  ? formatNumber(measurement.manual_units)
                                  : '-'
                              }
                              className="text-right"
                            />
                          ) : (
                            <span className="text-sm">
                              {measurement.manual_units !== null
                                ? formatNumber(measurement.manual_units)
                                : '-'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{measurement.measurement_unit || 'ud'}</span>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <MeasurementMultiSelect
                            measurementId={measurement.id}
                            selectedIds={relatedMeasurements.map(rm => rm.id)}
                            allMeasurements={measurements}
                            onSave={(ids) => handleRelatedMeasurementsUpdate(measurement.id, ids)}
                            disabled={!isAdmin}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {relatedUnits > 0 ? formatNumber(relatedUnits) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(calculatedUnits)}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1 -mx-1 rounded-md transition-colors truncate hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                            onClick={() => isAdmin && openEditForm(measurement, { captureScroll: true })}
                            title={isAdmin ? 'Editar actividades en el formulario' : getActivitiesDisplay(measurement.id)}
                            disabled={!isAdmin}
                          >
                            <span className="text-sm text-muted-foreground truncate block max-w-[180px]">
                              {getActivitiesDisplay(measurement.id)}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {medicionId}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditForm(measurement, { captureScroll: true })}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDuplicate(measurement)}
                                title="Duplicar"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setMeasurementToDelete(measurement);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {editingMeasurement ? 'Editar Medición' : 'Nueva Medición'}
              </DialogTitle>
              {editingMeasurement && filteredMeasurements.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigateToMeasurement('first')}
                    disabled={!canNavigatePrev}
                    title="Primera medición"
                    className="h-8 w-8"
                  >
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigateToMeasurement('prev')}
                    disabled={!canNavigatePrev}
                    title="Medición anterior"
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2 min-w-[60px] text-center">
                    {currentMeasurementIndex + 1} / {filteredMeasurements.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigateToMeasurement('next')}
                    disabled={!canNavigateNext}
                    title="Medición siguiente"
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigateToMeasurement('last')}
                    disabled={!canNavigateNext}
                    title="Última medición"
                    className="h-8 w-8"
                  >
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <DialogDescription>
              {editingMeasurement ? 'Modifica los datos de la medición' : 'Crea una nueva medición para el presupuesto'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nombre de la medición"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="measurement_unit">Ud Medida</Label>
                <Select
                  value={formData.measurement_unit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, measurement_unit: value }))}
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

              <div className="space-y-2">
                <Label htmlFor="manual_units">Uds Manual</Label>
                <NumericInput
                  id="manual_units"
                  value={formData.manual_units}
                  onChange={(value) => setFormData(prev => ({ ...prev, manual_units: value }))}
                  decimals={2}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Related Measurements Section */}
            <div className="space-y-2">
              <Label>Mediciones Relacionadas</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                {measurements.filter(m => m.id !== editingMeasurement?.id).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay otras mediciones disponibles</p>
                ) : (
                  <div className="space-y-2">
                    {measurements
                      .filter(m => m.id !== editingMeasurement?.id)
                      .map(m => (
                        <div key={m.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`rel-${m.id}`}
                            checked={formData.related_measurement_ids.includes(m.id)}
                            onCheckedChange={() => toggleRelatedMeasurement(m.id)}
                          />
                          <label htmlFor={`rel-${m.id}`} className="text-sm cursor-pointer flex-1">
                            {m.name} ({formatNumber(m.manual_units || 0)} {m.measurement_unit || 'ud'})
                          </label>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              {formData.related_measurement_ids.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Uds Relacionadas (suma): {formatNumber(
                    formData.related_measurement_ids.reduce((sum, id) => {
                      const m = measurements.find(m => m.id === id);
                      return sum + (m?.manual_units || 0);
                    }, 0)
                  )}
                </p>
              )}
            </div>

            {/* Related Activities Section */}
            <div className="space-y-2">
              <Label>Actividades Relacionadas</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                {availableActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay actividades disponibles</p>
                ) : (
                  <div className="space-y-2">
                    {availableActivities.map(a => {
                      const phase = phases.find(p => p.id === a.phase_id);
                      const activityId = `${phase?.code || ''} ${a.code}.-${a.name}`;
                      return (
                        <div key={a.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`act-${a.id}`}
                            checked={formData.activity_ids.includes(a.id)}
                            onCheckedChange={() => toggleActivity(a.id)}
                          />
                          <label htmlFor={`act-${a.id}`} className="text-sm cursor-pointer flex-1">
                            {activityId}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingMeasurement ? 'Guardar Cambios' : 'Crear Medición'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Medición"
        description={`¿Estás seguro de que quieres eliminar la medición "${measurementToDelete?.name}"? Las actividades relacionadas serán desvinculadas.`}
      />

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Mediciones desde CSV/Excel</DialogTitle>
            <DialogDescription>
              Sube un archivo CSV o Excel con las mediciones a importar. Las mediciones duplicadas serán omitidas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Archivo CSV/Excel</Label>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleImportFile}
                  className="flex-1"
                />
                {importFile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setImportFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {importFile && (
                <p className="text-sm text-muted-foreground">
                  Archivo seleccionado: {importFile.name}
                </p>
              )}
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium">Columnas esperadas:</p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li><strong>Nombre</strong> o <strong>Medición</strong> (obligatorio)</li>
                <li><strong>Uds manual</strong> o <strong>Uds</strong> o <strong>Unidades</strong> (opcional)</li>
                <li><strong>Ud medida</strong> o <strong>Unidad</strong> (opcional, por defecto: ud)</li>
                <li><strong>Mediciones relacionadas</strong> o <strong>Relacionadas</strong> (opcional, nombres separados por coma o punto y coma)</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Las relaciones se crean automáticamente si las mediciones referenciadas existen o se crean en la misma importación.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setImportDialogOpen(false);
              setImportFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={!importFile || isImporting}
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importando...
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  Importar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
