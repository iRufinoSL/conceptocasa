import { useState, useEffect } from 'react';
import { ExternalResource, UNIT_MEASURES, RESOURCE_TYPES, UnitMeasure, ResourceType } from '@/types/resource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface ResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: ExternalResource | null;
  onSubmit: (data: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate?: (id: string, data: Partial<ExternalResource>) => void;
}

const initialFormState = {
  name: '',
  description: '',
  unitCost: 0,
  unitMeasure: 'ud' as UnitMeasure,
  resourceType: 'Producto' as ResourceType,
  imageUrl: '',
  website: '',
};

export function ResourceForm({ open, onOpenChange, resource, onSubmit, onUpdate }: ResourceFormProps) {
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (resource) {
      setFormData({
        name: resource.name,
        description: resource.description,
        unitCost: resource.unitCost,
        unitMeasure: resource.unitMeasure,
        resourceType: resource.resourceType,
        imageUrl: resource.imageUrl || '',
        website: resource.website || '',
      });
    } else {
      setFormData(initialFormState);
    }
  }, [resource, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resource && onUpdate) {
      onUpdate(resource.id, formData);
    } else {
      onSubmit(formData);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {resource ? 'Editar Recurso' : 'Nuevo Recurso'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del recurso *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Hormigón HA-25"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción detallada del recurso..."
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitCost">Coste unitario (€) *</Label>
              <Input
                id="unitCost"
                type="number"
                step="0.01"
                min="0"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitMeasure">Unidad de medida *</Label>
              <Select
                value={formData.unitMeasure}
                onValueChange={(value: UnitMeasure) => setFormData({ ...formData, unitMeasure: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_MEASURES.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resourceType">Tipo de recurso *</Label>
            <Select
              value={formData.resourceType}
              onValueChange={(value: ResourceType) => setFormData({ ...formData, resourceType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">URL de imagen</Label>
            <Input
              id="imageUrl"
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://ejemplo.com/imagen.jpg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Sitio web</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://www.proveedor.com"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent">
              {resource ? 'Guardar cambios' : 'Crear recurso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
