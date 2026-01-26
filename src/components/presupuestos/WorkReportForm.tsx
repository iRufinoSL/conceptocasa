import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { WorkReportWorkerSelect } from './WorkReportWorkerSelect';
import { WorkReportEntryForm, type WorkReportEntryData } from './WorkReportEntryForm';

interface WorkReportFormProps {
  budgetId: string;
  activities: { id: string; name: string; code: string; phase_code?: string | null }[];
  report: WorkReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export interface WorkReport {
  id: string;
  budget_id: string;
  title: string;
  report_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  workers?: { profile_id: string }[];
  entries?: {
    id: string;
    description: string;
    activity_id: string | null;
    images?: { id: string; file_name: string; file_path: string }[];
  }[];
}

const createEmptyEntry = (): WorkReportEntryData => ({
  description: '',
  activityId: null,
  images: [],
  existingImages: [],
  imagesToDelete: [],
});

export function WorkReportForm({ 
  budgetId, 
  activities, 
  report, 
  open, 
  onOpenChange, 
  onSuccess 
}: WorkReportFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [entries, setEntries] = useState<WorkReportEntryData[]>([createEmptyEntry()]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (report) {
        // Editing existing report
        setTitle(report.title);
        setReportDate(report.report_date);
        setSelectedWorkers(report.workers?.map(w => w.profile_id) || []);
        
        if (report.entries && report.entries.length > 0) {
          setEntries(report.entries.map(e => ({
            id: e.id,
            description: e.description,
            activityId: e.activity_id,
            images: [],
            existingImages: e.images || [],
            imagesToDelete: [],
          })));
        } else {
          setEntries([createEmptyEntry()]);
        }
      } else {
        // Creating new report
        resetForm();
      }
    }
  }, [open, report]);

  const resetForm = () => {
    setTitle('');
    setReportDate(new Date().toISOString().split('T')[0]);
    setSelectedWorkers([]);
    setEntries([createEmptyEntry()]);
  };

  const handleAddEntry = () => {
    setEntries([...entries, createEmptyEntry()]);
  };

  const handleRemoveEntry = (index: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  const handleEntryChange = (index: number, updatedEntry: WorkReportEntryData) => {
    setEntries(entries.map((e, i) => i === index ? updatedEntry : e));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    if (!reportDate) {
      toast.error('La fecha es requerida');
      return;
    }

    // Validate at least one entry with description
    const validEntries = entries.filter(e => e.description.trim());
    if (validEntries.length === 0) {
      toast.error('Debe añadir al menos un trabajo con descripción');
      return;
    }

    setIsSaving(true);
    try {
      let workReportId = report?.id;

      // Create or update work report
      if (report) {
        const { error } = await supabase
          .from('work_reports')
          .update({
            title: title.trim(),
            report_date: reportDate,
          })
          .eq('id', report.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('work_reports')
          .insert({
            budget_id: budgetId,
            title: title.trim(),
            report_date: reportDate,
            created_by: user?.id || null,
          })
          .select('id')
          .single();

        if (error) throw error;
        workReportId = data.id;
      }

      if (!workReportId) throw new Error('No work report ID');

      // Handle workers
      if (report) {
        // Delete existing workers
        await supabase
          .from('work_report_workers')
          .delete()
          .eq('work_report_id', workReportId);
      }

      if (selectedWorkers.length > 0) {
        const workerInserts = selectedWorkers.map(profileId => ({
          work_report_id: workReportId,
          profile_id: profileId,
        }));

        const { error: workersError } = await supabase
          .from('work_report_workers')
          .insert(workerInserts);

        if (workersError) throw workersError;
      }

      // Handle entries
      // First, delete images marked for deletion
      for (const entry of entries) {
        for (const imageId of (entry.imagesToDelete || [])) {
          const { data: imgData } = await supabase
            .from('work_report_entry_images')
            .select('file_path')
            .eq('id', imageId)
            .single();

          if (imgData?.file_path) {
            await supabase.storage.from('resource-images').remove([imgData.file_path]);
          }
          await supabase.from('work_report_entry_images').delete().eq('id', imageId);
        }
      }

      // Delete existing entries if editing (will cascade delete images)
      if (report) {
        // Get existing entry IDs to delete their images first
        const { data: existingEntries } = await supabase
          .from('work_report_entries')
          .select('id')
          .eq('work_report_id', workReportId);

        // Only delete entries that are not in the current list
        const currentEntryIds = entries.filter(e => e.id).map(e => e.id);
        const entriesToDelete = (existingEntries || [])
          .filter(e => !currentEntryIds.includes(e.id));

        for (const entryToDelete of entriesToDelete) {
          await supabase
            .from('work_report_entries')
            .delete()
            .eq('id', entryToDelete.id);
        }
      }

      // Create/update entries
      for (const entry of validEntries) {
        let entryId = entry.id;

        if (entry.id) {
          // Update existing entry
          const { error } = await supabase
            .from('work_report_entries')
            .update({
              description: entry.description.trim(),
              activity_id: entry.activityId,
            })
            .eq('id', entry.id);

          if (error) throw error;
        } else {
          // Create new entry
          const { data, error } = await supabase
            .from('work_report_entries')
            .insert({
              work_report_id: workReportId,
              description: entry.description.trim(),
              activity_id: entry.activityId,
            })
            .select('id')
            .single();

          if (error) throw error;
          entryId = data.id;
        }

        // Upload new images
        for (const file of entry.images) {
          const fileExt = file.name.split('.').pop();
          const fileName = `work-reports/${workReportId}/${entryId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('resource-images')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Error uploading image:', uploadError);
            continue;
          }

          await supabase.from('work_report_entry_images').insert({
            entry_id: entryId,
            file_name: file.name,
            file_path: fileName,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user?.id || null,
          });
        }
      }

      toast.success(report ? 'Parte de trabajo actualizado' : 'Parte de trabajo creado');
      onSuccess();
    } catch (error) {
      console.error('Error saving work report:', error);
      toast.error('Error al guardar el parte de trabajo');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {report ? 'Editar Parte de Trabajo' : 'Nuevo Parte de Trabajo'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Título del parte *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Breve resumen de los trabajos del día..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reportDate">Fecha del parte *</Label>
              <Input
                id="reportDate"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
          </div>

          {/* Workers selector */}
          <WorkReportWorkerSelect
            selectedWorkers={selectedWorkers}
            onWorkersChange={setSelectedWorkers}
          />

          {/* Entries section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Trabajos realizados</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddEntry}
              >
                <Plus className="h-4 w-4 mr-1" />
                Añadir trabajo
              </Button>
            </div>

            <div className="space-y-4">
              {entries.map((entry, index) => (
                <WorkReportEntryForm
                  key={index}
                  entry={entry}
                  index={index}
                  activities={activities}
                  onChange={(updated) => handleEntryChange(index, updated)}
                  onRemove={() => handleRemoveEntry(index)}
                  canRemove={entries.length > 1}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {report ? 'Guardar cambios' : 'Crear parte'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
