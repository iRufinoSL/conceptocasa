import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Plus, Search, Edit, Trash2, Ruler, Link2, Upload, FileUp, X } from 'lucide-react';
import { formatNumber } from '@/lib/format-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import * as XLSX from 'xlsx';

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
    const term = searchTerm.toLowerCase();
    return measurements.filter(m => 
      m.name.toLowerCase().includes(term) ||
      (m.measurement_unit || '').toLowerCase().includes(term) ||
      generateMedicionId(m).toLowerCase().includes(term)
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
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar CSV
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
                    <TableHead className="text-right">Uds Relacionadas</TableHead>
                    <TableHead className="text-right">Uds Cálculo</TableHead>
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
                          <div>
                            {measurement.name}
                            {relatedMeasurements.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {relatedMeasurements.map(rm => (
                                  <Badge key={rm.id} variant="secondary" className="text-xs">
                                    <Link2 className="h-3 w-3 mr-1" />
                                    {rm.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {measurement.manual_units !== null ? formatNumber(measurement.manual_units) : '-'}
                        </TableCell>
                        <TableCell>{measurement.measurement_unit || 'ud'}</TableCell>
                        <TableCell className="text-right">
                          {relatedUnits > 0 ? formatNumber(relatedUnits) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(calculatedUnits)}
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
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setMeasurementToDelete(measurement);
                                  setDeleteDialogOpen(true);
                                }}
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
