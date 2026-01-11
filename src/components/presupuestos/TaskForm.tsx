import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import type { BudgetTask } from './BudgetAgendaTab';

interface TaskFormProps {
  budgetId: string;
  activities: { id: string; name: string; code: string }[];
  task: BudgetTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
}

export function TaskForm({ budgetId, activities, task, open, onOpenChange, onSuccess }: TaskFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activityId, setActivityId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [taskStatus, setTaskStatus] = useState<'pendiente' | 'realizada'>('pendiente');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [existingImages, setExistingImages] = useState<{ id: string; file_name: string; file_path: string }[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchContacts();
      if (task) {
        setName(task.name);
        setDescription(task.description || '');
        setActivityId(task.activity_id || '');
        setStartDate(task.start_date || '');
        setDurationDays(task.duration_days || 1);
        setTaskStatus(task.task_status);
        setSelectedContacts(task.contacts?.map(c => c.contact_id) || []);
        setExistingImages(task.images || []);
      } else {
        resetForm();
      }
    }
  }, [open, task]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setActivityId('');
    setStartDate('');
    setDurationDays(1);
    setTaskStatus('pendiente');
    setSelectedContacts([]);
    setExistingImages([]);
    setNewImages([]);
    setImagesToDelete([]);
  };

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname')
        .order('name');

      if (error) throw error;
      setAvailableContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    setNewImages(prev => [...prev, ...imageFiles]);
  };

  const removeNewImage = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  const markImageForDeletion = (imageId: string) => {
    setImagesToDelete(prev => [...prev, imageId]);
    setExistingImages(prev => prev.filter(img => img.id !== imageId));
  };

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev => 
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    setIsSaving(true);
    try {
      let resourceId = task?.id;

      // Create or update task as a resource with type 'Tarea'
      if (task) {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            activity_id: activityId || null,
            start_date: startDate || null,
            duration_days: durationDays,
            task_status: taskStatus
          })
          .eq('id', task.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('budget_activity_resources')
          .insert({
            budget_id: budgetId,
            name: name.trim(),
            description: description.trim() || null,
            activity_id: activityId || null,
            resource_type: 'Tarea',
            start_date: startDate || null,
            duration_days: durationDays,
            task_status: taskStatus
          })
          .select('id')
          .single();

        if (error) throw error;
        resourceId = data.id;
      }

      if (!resourceId) throw new Error('No resource ID');

      // Handle contacts - delete existing and re-add
      if (task) {
        await supabase
          .from('budget_resource_contacts')
          .delete()
          .eq('resource_id', resourceId);
      }

      if (selectedContacts.length > 0) {
        const contactInserts = selectedContacts.map(contactId => ({
          resource_id: resourceId,
          contact_id: contactId
        }));

        const { error: contactError } = await supabase
          .from('budget_resource_contacts')
          .insert(contactInserts);

        if (contactError) throw contactError;
      }

      // Delete marked images
      for (const imageId of imagesToDelete) {
        const imageToDelete = task?.images?.find(img => img.id === imageId);
        if (imageToDelete) {
          await supabase.storage.from('resource-images').remove([imageToDelete.file_path]);
          await supabase.from('budget_resource_images').delete().eq('id', imageId);
        }
      }

      // Upload new images
      for (const file of newImages) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${resourceId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('resource-images')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          continue;
        }

        await supabase.from('budget_resource_images').insert({
          resource_id: resourceId,
          file_name: file.name,
          file_path: fileName,
          file_type: file.type,
          file_size: file.size
        });
      }

      toast.success(task ? 'Tarea actualizada' : 'Tarea creada');
      onSuccess();
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error('Error al guardar la tarea');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Editar Tarea' : 'Nueva Tarea'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la tarea"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="activity">Actividad</Label>
              <Select
                value={activityId || '__none__'}
                onValueChange={(v) => setActivityId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una actividad (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin actividad</SelectItem>
                  {activities.map(activity => (
                    <SelectItem key={activity.id} value={activity.id}>
                      {activity.code} - {activity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción de la tarea"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha de inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duración (días)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={taskStatus} onValueChange={(v) => setTaskStatus(v as 'pendiente' | 'realizada')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contacts Section */}
          <div className="space-y-2">
            <Label>Contactos asociados</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg min-h-[60px]">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando contactos...
                </div>
              ) : (
                availableContacts.map(contact => (
                  <Badge
                    key={contact.id}
                    variant={selectedContacts.includes(contact.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleContact(contact.id)}
                  >
                    {contact.name} {contact.surname || ''}
                    {selectedContacts.includes(contact.id) && (
                      <X className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Images Section */}
          <div className="space-y-2">
            <Label>Imágenes</Label>
            <div className="border rounded-lg p-4 space-y-4">
              {/* Existing images */}
              {existingImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {existingImages.map(image => (
                    <TaskImagePreview
                      key={image.id}
                      image={image}
                      onRemove={() => markImageForDeletion(image.id)}
                    />
                  ))}
                </div>
              )}

              {/* New images preview */}
              {newImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {newImages.map((file, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewImage(index)}
                        className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Subir imágenes</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {task ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskImagePreview({ 
  image, 
  onRemove 
}: { 
  image: { id: string; file_name: string; file_path: string }; 
  onRemove: () => void;
}) {
  const { signedUrl, loading } = useSignedUrl(image.file_path, { bucket: 'resource-images' });

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : signedUrl ? (
        <img
          src={signedUrl}
          alt={image.file_name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
