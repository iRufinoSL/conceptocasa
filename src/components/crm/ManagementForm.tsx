import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Management } from '@/pages/CRM';

interface ManagementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  management?: Management | null;
  onSuccess: () => void;
  // Optional prefill from contact or email
  prefillContactId?: string | null;
  prefillContactName?: string | null;
  prefillTitle?: string | null;
  prefillDescription?: string | null;
  prefillType?: string | null;
}

export function ManagementForm({ 
  open, 
  onOpenChange, 
  management, 
  onSuccess,
  prefillContactId,
  prefillContactName,
  prefillTitle,
  prefillDescription,
  prefillType,
}: ManagementFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    management_type: 'Tarea',
    status: 'Pendiente',
    target_date: '',
    start_time: '',
    end_time: ''
  });

  useEffect(() => {
    if (management) {
      setFormData({
        title: management.title || '',
        description: management.description || '',
        management_type: management.management_type || 'Tarea',
        status: management.status || 'Pendiente',
        target_date: management.target_date || '',
        start_time: management.start_time?.slice(0, 5) || '',
        end_time: management.end_time?.slice(0, 5) || ''
      });
      setContactId(null);
    } else {
      // Apply prefills for new management
      setFormData({
        title: prefillTitle || (prefillContactName ? `Seguimiento: ${prefillContactName}` : ''),
        description: prefillDescription || '',
        management_type: prefillType || 'Tarea',
        status: 'Pendiente',
        target_date: '',
        start_time: '',
        end_time: ''
      });
      setContactId(prefillContactId || null);
    }
  }, [management, open, prefillContactId, prefillContactName, prefillTitle, prefillDescription, prefillType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const data = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        management_type: formData.management_type,
        status: formData.status,
        target_date: formData.target_date || null,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null
      };

      if (management) {
        const { error } = await supabase
          .from('crm_managements')
          .update(data)
          .eq('id', management.id);

        if (error) throw error;
        toast({ title: 'Gestión actualizada correctamente' });
      } else {
        const { data: newManagement, error } = await supabase
          .from('crm_managements')
          .insert(data)
          .select()
          .single();

        if (error) throw error;
        
        // Link contact if provided
        if (contactId && newManagement) {
          await supabase
            .from('crm_management_contacts')
            .insert({
              management_id: newManagement.id,
              contact_id: contactId
            });
        }
        
        toast({ title: 'Gestión creada correctamente' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{management ? 'Editar Gestión' : 'Nueva Gestión'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Título de la gestión"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="management_type">Tipo</Label>
              <Select value={formData.management_type} onValueChange={(v) => setFormData({ ...formData, management_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tarea">Tarea</SelectItem>
                  <SelectItem value="Reunión">Reunión</SelectItem>
                  <SelectItem value="Llamada">Llamada</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Visita">Visita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En progreso">En progreso</SelectItem>
                  <SelectItem value="Completado">Completado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_date">Fecha</Label>
            <Input
              id="target_date"
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Hora inicio</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">Hora fin</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción de la gestión..."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : management ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
