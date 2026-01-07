import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { InputAddon } from '@/components/ui/input-addon';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  location: string | null;
  project_type: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface ProjectFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSuccess: () => void;
}

export function ProjectForm({ open, onOpenChange, project, onSuccess }: ProjectFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'prospecto',
    location: '',
    project_type: '',
    budget: 0,
    start_date: '',
    end_date: ''
  });

  useEffect(() => {
    if (project) {
      // Normalize legacy status values
      let normalizedStatus = project.status || 'prospecto';
      if (normalizedStatus === 'active') normalizedStatus = 'activo';
      if (normalizedStatus === 'completed' || normalizedStatus === 'on_hold' || normalizedStatus === 'cancelled') {
        normalizedStatus = 'archivado';
      }
      
      setFormData({
        name: project.name || '',
        description: project.description || '',
        status: normalizedStatus,
        location: project.location || '',
        project_type: project.project_type || '',
        budget: project.budget || 0,
        start_date: project.start_date || '',
        end_date: project.end_date || ''
      });
    } else {
      setFormData({
        name: '',
        description: '',
        status: 'prospecto',
        location: '',
        project_type: '',
        budget: 0,
        start_date: '',
        end_date: ''
      });
    }
  }, [project, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        status: formData.status,
        location: formData.location.trim() || null,
        project_type: formData.project_type || null,
        budget: formData.budget || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null
      };

      if (project) {
        const { error } = await supabase
          .from('projects')
          .update(data)
          .eq('id', project.id);

        if (error) throw error;
        toast({ title: 'Proyecto actualizado correctamente' });
      } else {
        const { error } = await supabase
          .from('projects')
          .insert(data);

        if (error) throw error;
        toast({ title: 'Proyecto creado correctamente' });
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? 'Editar Proyecto' : 'Nuevo Proyecto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nombre del proyecto"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospecto">Prospecto</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="archivado">Archivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project_type">Tipo</Label>
              <Select value={formData.project_type} onValueChange={(v) => setFormData({ ...formData, project_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Vivienda unifamiliar">Vivienda unifamiliar</SelectItem>
                  <SelectItem value="Reforma integral">Reforma integral</SelectItem>
                  <SelectItem value="Reforma parcial">Reforma parcial</SelectItem>
                  <SelectItem value="Local comercial">Local comercial</SelectItem>
                  <SelectItem value="Edificio residencial">Edificio residencial</SelectItem>
                  <SelectItem value="Nave industrial">Nave industrial</SelectItem>
                  <SelectItem value="Interiorismo">Interiorismo</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ubicación</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Ciudad, dirección..."
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">Presupuesto</Label>
            <InputAddon addon="€">
              <NumericInput
                id="budget"
                value={formData.budget}
                onChange={(value) => setFormData({ ...formData, budget: value })}
                placeholder="0,00"
                decimals={2}
              />
            </InputAddon>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Fecha inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Fecha fin</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción del proyecto..."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : project ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
