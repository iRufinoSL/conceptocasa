import { useState, useEffect, useMemo } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, X, Upload, Loader2, Search, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { formatActividadId } from '@/lib/activity-id';
import type { BudgetTask } from './BudgetAgendaTab';

export type EntryType = 'Tarea' | 'Cita';

interface TaskFormProps {
  budgetId: string;
  activities: { id: string; name: string; code: string; phase_code?: string | null }[];
  task: BudgetTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialType?: EntryType;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
}

export function TaskForm({ budgetId, activities, task, open, onOpenChange, onSuccess, initialType = 'Tarea' }: TaskFormProps) {
  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [taskStatus, setTaskStatus] = useState<'pendiente' | 'realizada'>('pendiente');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [existingImages, setExistingImages] = useState<{ id: string; file_name: string; file_path: string }[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activityOptions = useMemo(() => {
    return activities
      .map(a => {
        const label = formatActividadId({
          phaseCode: a.phase_code,
          activityCode: a.code,
          name: a.name,
        });

        const searchContent = `${a.phase_code || ''} ${a.code} ${a.name}`.toLowerCase();
        return { value: a.id, label, searchContent };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const q = activitySearchQuery.toLowerCase().trim();
    if (!q) return activityOptions;
    return activityOptions.filter(a => a.searchContent.includes(q));
  }, [activityOptions, activitySearchQuery]);

  useEffect(() => {
    if (open) {
      fetchContacts();
      if (task) {
        // Detect type from existing resource_type if available
        setEntryType((task as any).resource_type === 'Cita' ? 'Cita' : 'Tarea');
        setName(task.name);
        setDescription(task.description || '');
        setActivityId(task.activity_id || '');
        setActivitySearchQuery('');
        setActivityPopoverOpen(false);
        setStartDate(task.start_date || '');
        setStartTime(task.start_time || '');
        setEndTime(task.end_time || '');
        setDurationDays(task.duration_days || 1);
        setTaskStatus(task.task_status);
        setSelectedContacts(task.contacts?.map(c => c.contact_id) || []);
        setExistingImages(task.images || []);
      } else {
        resetForm();
        setEntryType(initialType);
      }
    }
  }, [open, task, initialType]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setActivityId('');
    setActivitySearchQuery('');
    setActivityPopoverOpen(false);
    setStartDate('');
    setStartTime('');
    setEndTime('');
    setDurationDays(1);
    setTaskStatus('pendiente');
    setSelectedContacts([]);
    setContactSearchQuery('');
    setShowAllContacts(false);
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

      // Create or update task/cita as a resource
      if (task) {
        const { error } = await supabase
          .from('budget_activity_resources')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            activity_id: activityId || null,
            resource_type: entryType,
            start_date: startDate || null,
            start_time: startTime || null,
            end_time: endTime || null,
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
            resource_type: entryType,
            start_date: startDate || null,
            start_time: startTime || null,
            end_time: endTime || null,
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

      const typeLabel = entryType === 'Cita' ? 'Cita' : 'Tarea';
      toast.success(task ? `${typeLabel} actualizada` : `${typeLabel} creada`);
      onSuccess();
    } catch (error) {
      console.error('Error saving:', error);
      const typeLabel = entryType === 'Cita' ? 'cita' : 'tarea';
      toast.error(`Error al guardar la ${typeLabel}`);
    } finally {
      setIsSaving(false);
    }
  };

  const typeLabel = entryType === 'Cita' ? 'Cita' : 'Tarea';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? `Editar ${typeLabel}` : `Nueva ${typeLabel}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Type selector */}
            <div className="space-y-2 md:col-span-2">
              <Label>Tipo</Label>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as EntryType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tarea">Tarea</SelectItem>
                  <SelectItem value="Cita">Cita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={entryType === 'Cita' ? 'Nombre de la cita' : 'Nombre de la tarea'}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="activity">Actividad</Label>
              <Popover open={activityPopoverOpen} onOpenChange={setActivityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={activityPopoverOpen}
                    className="w-full justify-between font-normal"
                    type="button"
                  >
                    <span className="truncate">
                      {activityId
                        ? activityOptions.find(a => a.value === activityId)?.label
                        : 'Sin actividad'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[520px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por ActividadID (fase + código + nombre)..."
                      value={activitySearchQuery}
                      onValueChange={setActivitySearchQuery}
                    />
                    <CommandList className="max-h-[280px]">
                      <CommandEmpty>No se encontraron actividades.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setActivityId('');
                            setActivityPopoverOpen(false);
                            setActivitySearchQuery('');
                          }}
                          className="cursor-pointer"
                        >
                          <Check className={`mr-2 h-4 w-4 ${!activityId ? 'opacity-100' : 'opacity-0'}`} />
                          Sin actividad
                        </CommandItem>
                        {filteredActivities.map(opt => (
                          <CommandItem
                            key={opt.value}
                            value={opt.value}
                            onSelect={() => {
                              setActivityId(opt.value);
                              setActivityPopoverOpen(false);
                              setActivitySearchQuery('');
                            }}
                            className="cursor-pointer"
                          >
                            <Check className={`mr-2 h-4 w-4 ${activityId === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="truncate">{opt.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
              <Label htmlFor="startDate">Fecha objetivo *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startTime">Hora (opcional)</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="HH:MM"
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
            <div className="p-3 border rounded-lg space-y-3">
              {/* Selected contacts - always shown */}
              {selectedContacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Contactos seleccionados:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedContacts.map(contactId => {
                      const contact = availableContacts.find(c => c.id === contactId);
                      if (!contact) return null;
                      return (
                        <Badge
                          key={contact.id}
                          variant="default"
                          className="cursor-pointer"
                          onClick={() => toggleContact(contact.id)}
                        >
                          {contact.name} {contact.surname || ''}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Search and add contacts */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contactos por nombre..."
                    value={contactSearchQuery}
                    onChange={(e) => {
                      setContactSearchQuery(e.target.value);
                      if (e.target.value) setShowAllContacts(true);
                    }}
                    className="pl-9 h-9"
                  />
                </div>
                
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando contactos...
                  </div>
                ) : (
                  <>
                    {!showAllContacts && selectedContacts.length === 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllContacts(true)}
                        className="text-xs"
                      >
                        Mostrar todos los contactos disponibles
                      </Button>
                    )}
                    
                    {(showAllContacts || contactSearchQuery) && (
                      <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/30">
                        {availableContacts
                          .filter(c => !selectedContacts.includes(c.id))
                          .filter(c => {
                            if (!contactSearchQuery) return true;
                            const searchLower = contactSearchQuery.toLowerCase();
                            const fullName = `${c.name} ${c.surname || ''}`.toLowerCase();
                            return fullName.includes(searchLower);
                          })
                          .map(contact => (
                            <div
                              key={contact.id}
                              className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer transition-colors"
                              onClick={() => toggleContact(contact.id)}
                            >
                              <Badge variant="outline" className="cursor-pointer">
                                {contact.name} {contact.surname || ''}
                              </Badge>
                            </div>
                          ))
                        }
                        {availableContacts
                          .filter(c => !selectedContacts.includes(c.id))
                          .filter(c => {
                            if (!contactSearchQuery) return true;
                            const searchLower = contactSearchQuery.toLowerCase();
                            const fullName = `${c.name} ${c.surname || ''}`.toLowerCase();
                            return fullName.includes(searchLower);
                          }).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            {contactSearchQuery ? 'No se encontraron contactos' : 'No hay más contactos disponibles'}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {showAllContacts && !contactSearchQuery && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllContacts(false)}
                        className="text-xs"
                      >
                        Ocultar lista
                      </Button>
                    )}
                  </>
                )}
              </div>
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
