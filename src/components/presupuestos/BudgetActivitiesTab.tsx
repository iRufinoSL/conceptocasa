import { useEffect, useState, useRef } from 'react';
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
import { Plus, Search, Upload, Pencil, Trash2, MoreHorizontal, FileUp, File, X, Download, ChevronRight, ChevronDown, List, Layers, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

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
  created_at: string;
  files_count?: number;
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

interface ActivityForm {
  name: string;
  code: string;
  description: string;
  measurement_unit: string;
  phase_id: string;
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
  phase_id: ''
};

export function BudgetActivitiesTab({ budgetId, isAdmin }: BudgetActivitiesTabProps) {
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'alphabetical' | 'grouped'>('alphabetical');
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
  
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch activities and phases
  const fetchData = async () => {
    try {
      const [activitiesRes, phasesRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name', { ascending: true }),
        supabase
          .from('budget_phases')
          .select('id, name, code')
          .eq('budget_id', budgetId)
          .order('code', { ascending: true })
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;

      // Get file counts for each activity
      const activitiesWithFiles = await Promise.all(
        (activitiesRes.data || []).map(async (activity) => {
          const { count } = await supabase
            .from('budget_activity_files')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activity.id);
          
          return { ...activity, files_count: count || 0 };
        })
      );

      setActivities(activitiesWithFiles);
      setPhases(phasesRes.data || []);
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

  // Open form for new activity
  const handleNew = () => {
    setEditingActivity(null);
    setForm(emptyForm);
    setFormDialogOpen(true);
  };

  // Open form for editing
  const handleEdit = (activity: BudgetActivity) => {
    setEditingActivity(activity);
    setForm({
      name: activity.name,
      code: activity.code,
      description: activity.description || '',
      measurement_unit: activity.measurement_unit,
      phase_id: activity.phase_id || ''
    });
    setFormDialogOpen(true);
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
        phase_id: form.phase_id || null
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

  // Get phase by id
  const getPhaseById = (phaseId: string | null) => {
    return phases.find(p => p.id === phaseId);
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
                <TableHead>Archivos</TableHead>
                {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.map((activity) => {
                const phase = getPhaseById(activity.phase_id);
                return (
                  <TableRow key={activity.id}>
                    <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                    <TableCell className="font-medium">{activity.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {phase ? `${phase.code} ${phase.name}` : '-'}
                    </TableCell>
                    <TableCell>{activity.measurement_unit}</TableCell>
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
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
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
                              <TableHead>ActividadID</TableHead>
                              <TableHead>Actividad</TableHead>
                              <TableHead>Unidad</TableHead>
                              <TableHead>Archivos</TableHead>
                              {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unassigned.sort((a, b) => a.name.localeCompare(b.name)).map(activity => (
                              <TableRow key={activity.id}>
                                <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                                <TableCell className="font-medium">{activity.name}</TableCell>
                                <TableCell>{activity.measurement_unit}</TableCell>
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
                            ))}
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
                            <TableHead>ActividadID</TableHead>
                            <TableHead>Actividad</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Archivos</TableHead>
                            {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).map(activity => (
                            <TableRow key={activity.id}>
                              <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                              <TableCell className="font-medium">{activity.name}</TableCell>
                              <TableCell>{activity.measurement_unit}</TableCell>
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
                          ))}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}
            </DialogTitle>
            <DialogDescription>
              {editingActivity 
                ? 'Modifica los datos de la actividad'
                : 'Introduce los datos de la nueva actividad'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción detallada de la actividad..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phase">Fase de Gestión</Label>
              <Select 
                value={form.phase_id} 
                onValueChange={(value) => setForm({ ...form, phase_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar fase..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin fase</SelectItem>
                  {phases.map(phase => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.code} {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </div>
  );
}
