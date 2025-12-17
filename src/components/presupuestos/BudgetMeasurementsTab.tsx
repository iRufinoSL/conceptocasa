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
import { toast } from 'sonner';
import { Plus, Search, Edit, Trash2, Ruler, Link2, Upload, FileUp, X, Download, Copy } from 'lucide-react';
import { formatNumber } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ResourceInlineEdit } from '@/components/presupuestos/ResourceInlineEdit';
import { MeasurementMultiSelect } from '@/components/presupuestos/MeasurementMultiSelect';
import { syncAllAffectedResources, syncResourcesRelatedUnits } from '@/lib/budget-utils';
import * as XLSX from 'xlsx';

// Define editable fields per row for tab navigation
const EDITABLE_FIELDS = ['name', 'manual_units', 'measurement_unit'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

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

interface BudgetMeasurementsTabProps {
  budgetId: string;
  isAdmin: boolean;
}

const MEASUREMENT_UNITS = ['m2', 'm3', 'ml', 'ud', 'mes', 'día', 'hora', 'kg', 't', 'l', 'pa'];

export function BudgetMeasurementsTab({ budgetId, isAdmin }: BudgetMeasurementsTabProps) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [relations, setRelations] = useState<MeasurementRelation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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

  // Tab navigation refs - stores refs for each editable cell
  const cellRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  // Get cell key for ref storage
  const getCellKey = (measurementId: string, field: EditableField) => `${measurementId}-${field}`;

  // Focus a specific cell
  const focusCell = useCallback((measurementId: string, field: EditableField) => {
    const key = getCellKey(measurementId, field);
    const element = cellRefs.current.get(key);
    if (element) {
      element.focus();
      element.click();
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [measurementsRes, relationsRes, activitiesRes, phasesRes] = await Promise.all([
        supabase.from('budget_measurements').select('*').eq('budget_id', budgetId).order('name'),
        supabase.from('budget_measurement_relations').select('*'),
        supabase.from('budget_activities').select('id, name, code, phase_id, measurement_id').eq('budget_id', budgetId),
        supabase.from('budget_phases').select('id, name, code').eq('budget_id', budgetId)
      ]);

      if (measurementsRes.error) throw measurementsRes.error;
      if (relationsRes.error) throw relationsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;

      setMeasurements(measurementsRes.data || []);
      
      // Filter relations to only those belonging to this budget's measurements
      const measurementIds = (measurementsRes.data || []).map(m => m.id);
      const filteredRelations = (relationsRes.data || []).filter(
        r => measurementIds.includes(r.measurement_id)
      );
      setRelations(filteredRelations);
      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar las mediciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [budgetId]);

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

  // Navigate to next/prev editable field (must be after filteredMeasurements)
  const navigateToField = useCallback((currentMeasurementId: string, currentField: EditableField, direction: 'next' | 'prev') => {
    const currentFieldIndex = EDITABLE_FIELDS.indexOf(currentField);
    const currentRowIndex = filteredMeasurements.findIndex(m => m.id === currentMeasurementId);
    
    if (currentRowIndex === -1) return;

    let nextRowIndex = currentRowIndex;
    let nextFieldIndex = currentFieldIndex;

    if (direction === 'next') {
      nextFieldIndex++;
      if (nextFieldIndex >= EDITABLE_FIELDS.length) {
        nextFieldIndex = 0;
        nextRowIndex++;
      }
    } else {
      nextFieldIndex--;
      if (nextFieldIndex < 0) {
        nextFieldIndex = EDITABLE_FIELDS.length - 1;
        nextRowIndex--;
      }
    }

    // Check bounds
    if (nextRowIndex < 0 || nextRowIndex >= filteredMeasurements.length) return;

    const nextMeasurement = filteredMeasurements[nextRowIndex];
    const nextField = EDITABLE_FIELDS[nextFieldIndex];
    
    focusCell(nextMeasurement.id, nextField);
  }, [filteredMeasurements, focusCell]);

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

  const openEditForm = (measurement: Measurement) => {
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

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
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

      setFormOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving measurement:', error);
      toast.error('Error al guardar la medición');
    }
  };

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

  // Inline edit handlers
  const handleInlineUpdate = useCallback(async (
    measurementId: string,
    field: string,
    value: any
  ) => {
    try {
      const { error } = await supabase
        .from('budget_measurements')
        .update({ [field]: value })
        .eq('id', measurementId);

      if (error) throw error;
      
      // If manual_units changed, sync related_units for affected resources
      if (field === 'manual_units') {
        await syncAllAffectedResources(measurementId);
      }
      
      fetchData();
    } catch (error) {
      console.error('Error updating measurement:', error);
      toast.error('Error al actualizar');
    }
  }, [budgetId]);

  // Handle inline activity update
  const handleActivityUpdate = useCallback(async (
    measurementId: string,
    selectedActivityIds: string[]
  ) => {
    try {
      // First, unlink all activities currently linked to this measurement
      await supabase
        .from('budget_activities')
        .update({ measurement_id: null })
        .eq('measurement_id', measurementId);

      // Then link selected activities
      if (selectedActivityIds.length > 0) {
        const { error } = await supabase
          .from('budget_activities')
          .update({ measurement_id: measurementId })
          .in('id', selectedActivityIds);

        if (error) throw error;
      }

      // Sync related_units for resources of the newly linked activities
      await syncResourcesRelatedUnits(measurementId);

      toast.success('Actividades actualizadas');
      fetchData();
    } catch (error) {
      console.error('Error updating activities:', error);
      toast.error('Error al actualizar actividades');
    }
  }, []);

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
  }, []);

  // Get activity options for inline edit
  const getActivityOptions = useCallback((measurementId: string) => {
    // Include activities that have no measurement or belong to this measurement
    const availableActs = activities.filter(a => 
      !a.measurement_id || a.measurement_id === measurementId
    );
    
    return availableActs.map(a => {
      const phase = phases.find(p => p.id === a.phase_id);
      const activityId = `${phase?.code || ''} ${a.code}.-${a.name}`;
      return {
        value: a.id,
        label: activityId,
        searchContent: `${phase?.code || ''} ${phase?.name || ''} ${a.code} ${a.name}`
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [activities, phases]);

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
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        toast.error('El archivo no contiene datos suficientes');
        return;
      }

      // Get headers from first row
      const headers = jsonData[0].map((h: any) => String(h || '').trim().toLowerCase());
      
      // Expected columns mapping
      const columnMap: Record<string, string> = {
        'nombre': 'name',
        'medición': 'name',
        'medicion': 'name',
        'uds manual': 'manual_units',
        'uds': 'manual_units',
        'unidades': 'manual_units',
        'ud medida': 'measurement_unit',
        'unidad': 'measurement_unit',
        'mediciones relacionadas': 'related_measurements',
        'relacionadas': 'related_measurements',
        'relaciones': 'related_measurements',
      };

      // Map header indices
      const headerIndices: Record<string, number> = {};
      headers.forEach((h, idx) => {
        const mappedKey = columnMap[h];
        if (mappedKey) {
          headerIndices[mappedKey] = idx;
        }
      });

      if (headerIndices['name'] === undefined) {
        toast.error('No se encontró la columna "Nombre" o "Medición" en el archivo');
        return;
      }

      // Build a map of existing measurements by name (case-insensitive)
      const existingMeasurementsMap = new Map<string, string>();
      measurements.forEach(m => {
        existingMeasurementsMap.set(m.name.toLowerCase().trim(), m.id);
      });

      // Parse rows - first pass to collect all measurements and their relations
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

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const name = String(row[headerIndices['name']] || '').trim();
        if (!name) continue;

        const isExisting = existingMeasurementsMap.has(name.toLowerCase());
        
        // Parse related measurements (comma or semicolon separated)
        let relatedNames: string[] = [];
        if (headerIndices['related_measurements'] !== undefined) {
          const relatedStr = String(row[headerIndices['related_measurements']] || '').trim();
          if (relatedStr) {
            relatedNames = relatedStr
              .split(/[,;]/)
              .map(s => s.trim())
              .filter(s => s.length > 0);
          }
        }

        if (isExisting) {
          // For existing measurements, we'll only update relations if specified
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

        // Check if already added in this import batch
        if (newMeasurementNames.has(name.toLowerCase())) {
          continue;
        }

        const manualUnits = headerIndices['manual_units'] !== undefined 
          ? parseEuropeanNumber(row[headerIndices['manual_units']]) 
          : null;
        
        let measurementUnit = headerIndices['measurement_unit'] !== undefined 
          ? String(row[headerIndices['measurement_unit']] || '').trim().toLowerCase() 
          : 'ud';
        
        // Validate measurement unit
        if (!MEASUREMENT_UNITS.includes(measurementUnit)) {
          measurementUnit = 'ud';
        }

        importedMeasurements.push({
          name,
          manual_units: manualUnits,
          measurement_unit: measurementUnit,
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

        // Add inserted measurements to our map
        insertedMeasurements.forEach(m => {
          existingMeasurementsMap.set(m.name.toLowerCase().trim(), m.id);
        });
      }

      // Now create relations
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
          if (relatedId === measurementId) continue; // No self-relation

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
  const handleExport = () => {
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
        const relatedUnits = getRelatedUnits(measurement.id);
        const calculatedUnits = getCalculatedUnits(measurement);

        return {
          'Nombre': measurement.name,
          'Uds Manual': measurement.manual_units !== null ? measurement.manual_units : '',
          'Ud Medida': measurement.measurement_unit || 'ud',
          'Mediciones Relacionadas': relatedNames,
          'Uds Relacionadas': relatedUnits > 0 ? relatedUnits : '',
          'Uds Cálculo': calculatedUnits,
          'Actividades Relacionadas': relatedActivitiesNames,
          'MediciónID': generateMedicionId(measurement)
        };
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mediciones');

      // Auto-size columns
      const colWidths = [
        { wch: 30 }, // Nombre
        { wch: 12 }, // Uds Manual
        { wch: 10 }, // Ud Medida
        { wch: 40 }, // Mediciones Relacionadas
        { wch: 15 }, // Uds Relacionadas
        { wch: 12 }, // Uds Cálculo
        { wch: 50 }, // Actividades Relacionadas
        { wch: 60 }, // MediciónID
      ];
      worksheet['!cols'] = colWidths;

      // Generate filename with date
      const date = new Date().toISOString().split('T')[0];
      const fileName = `mediciones_${date}.xlsx`;

      // Download
      XLSX.writeFile(workbook, fileName);
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
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar mediciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Table */}
          {filteredMeasurements.length === 0 ? (
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
                  {filteredMeasurements.map((measurement, rowIndex) => {
                    const relatedUnits = getRelatedUnits(measurement.id);
                    const calculatedUnits = getCalculatedUnits(measurement);
                    const relatedMeasurements = getRelatedMeasurements(measurement.id);
                    const medicionId = generateMedicionId(measurement);
                    const relatedActs = getRelatedActivities(measurement.id);

                    // Create tab navigation handlers for each field
                    const createTabHandlers = (field: EditableField) => ({
                      onTabNext: () => navigateToField(measurement.id, field, 'next'),
                      onTabPrev: () => navigateToField(measurement.id, field, 'prev'),
                    });

                    return (
                      <TableRow key={measurement.id}>
                        <TableCell className="font-medium">
                          <span 
                            ref={(el) => cellRefs.current.set(getCellKey(measurement.id, 'name'), el)}
                            tabIndex={-1}
                          >
                            <ResourceInlineEdit
                              value={measurement.name}
                              onSave={(v) => handleInlineUpdate(measurement.id, 'name', v)}
                              type="text"
                              disabled={!isAdmin}
                              tabIndex={rowIndex * EDITABLE_FIELDS.length}
                              {...createTabHandlers('name')}
                            />
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span 
                            ref={(el) => cellRefs.current.set(getCellKey(measurement.id, 'manual_units'), el)}
                            tabIndex={-1}
                          >
                            <ResourceInlineEdit
                              value={measurement.manual_units}
                              onSave={(v) => handleInlineUpdate(measurement.id, 'manual_units', v)}
                              type="number"
                              decimals={2}
                              disabled={!isAdmin}
                              displayValue={measurement.manual_units !== null ? formatNumber(measurement.manual_units) : '-'}
                              tabIndex={rowIndex * EDITABLE_FIELDS.length + 1}
                              {...createTabHandlers('manual_units')}
                            />
                          </span>
                        </TableCell>
                        <TableCell>
                          <span 
                            ref={(el) => cellRefs.current.set(getCellKey(measurement.id, 'measurement_unit'), el)}
                            tabIndex={-1}
                          >
                            <ResourceInlineEdit
                              value={measurement.measurement_unit || 'ud'}
                              onSave={(v) => handleInlineUpdate(measurement.id, 'measurement_unit', v)}
                              type="select"
                              options={MEASUREMENT_UNITS.map(u => ({ value: u, label: u }))}
                              disabled={!isAdmin}
                              tabIndex={rowIndex * EDITABLE_FIELDS.length + 2}
                              {...createTabHandlers('measurement_unit')}
                            />
                          </span>
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
                          <ResourceInlineEdit
                            value={relatedActs.map(a => a.id).join(',')}
                            onSave={async (v) => {
                              const ids = v ? String(v).split(',').filter(Boolean) : [];
                              await handleActivityUpdate(measurement.id, ids);
                            }}
                            type="searchable-select"
                            options={[
                              { value: '__none__', label: 'Sin actividad', searchContent: 'sin actividad ninguna' },
                              ...getActivityOptions(measurement.id)
                            ]}
                            disabled={!isAdmin}
                            displayValue={
                              <span className="text-sm text-muted-foreground truncate block max-w-[180px]" title={getActivitiesDisplay(measurement.id)}>
                                {getActivitiesDisplay(measurement.id)}
                              </span>
                            }
                          />
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
                                onClick={() => openEditForm(measurement)}
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
            <DialogTitle>
              {editingMeasurement ? 'Editar Medición' : 'Nueva Medición'}
            </DialogTitle>
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
