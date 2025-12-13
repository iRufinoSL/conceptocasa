import { useState, useEffect } from 'react';
import { ExternalResource, UNIT_MEASURES, RESOURCE_TYPES, UnitMeasure, ResourceType, RelatedResource } from '@/types/resource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';

interface ResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: ExternalResource | null;
  onSubmit: (data: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate?: (id: string, data: Partial<ExternalResource>) => void;
  allResources: ExternalResource[];
}

const initialFormState = {
  name: '',
  description: '',
  unitCost: 0,
  unitMeasure: 'ud' as UnitMeasure,
  resourceType: 'Producto' as ResourceType,
  imageUrl: '',
  website: '',
  relatedResources: [] as RelatedResource[],
};

export function ResourceForm({ open, onOpenChange, resource, onSubmit, onUpdate, allResources }: ResourceFormProps) {
  const [formData, setFormData] = useState(initialFormState);

  // Get available resources for selection (exclude current resource being edited)
  const availableResources = allResources.filter(r => r.id !== resource?.id);

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
        relatedResources: resource.relatedResources || [],
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

  const addRelatedResource = () => {
    if (availableResources.length === 0) return;
    
    // Find a resource that isn't already related
    const alreadyRelatedIds = formData.relatedResources.map(r => r.resourceId);
    const availableToAdd = availableResources.filter(r => !alreadyRelatedIds.includes(r.id));
    
    if (availableToAdd.length === 0) return;
    
    setFormData({
      ...formData,
      relatedResources: [
        ...formData.relatedResources,
        { resourceId: availableToAdd[0].id, quantity: 1 }
      ]
    });
  };

  const updateRelatedResource = (index: number, updates: Partial<RelatedResource>) => {
    const updated = [...formData.relatedResources];
    updated[index] = { ...updated[index], ...updates };
    setFormData({ ...formData, relatedResources: updated });
  };

  const removeRelatedResource = (index: number) => {
    setFormData({
      ...formData,
      relatedResources: formData.relatedResources.filter((_, i) => i !== index)
    });
  };

  const isComposite = formData.relatedResources.length > 0;
  const alreadyRelatedIds = formData.relatedResources.map(r => r.resourceId);
  const canAddMore = availableResources.filter(r => !alreadyRelatedIds.includes(r.id)).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="unitCost">
                Coste unitario (€) {!isComposite && '*'}
              </Label>
              <Input
                id="unitCost"
                type="number"
                step="0.01"
                min="0"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                required={!isComposite}
                disabled={isComposite}
                className={isComposite ? 'bg-muted' : ''}
              />
              {isComposite && (
                <p className="text-xs text-accent">El coste se calcula automáticamente</p>
              )}
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

          {/* Related Resources Section */}
          <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Recursos relacionados
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({isComposite ? 'Compuesto' : 'Simple'})
                </span>
              </Label>
              {canAddMore && (
                <Button type="button" variant="outline" size="sm" onClick={addRelatedResource}>
                  <Plus className="h-4 w-4 mr-1" />
                  Añadir
                </Button>
              )}
            </div>
            
            {formData.relatedResources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este recurso es Simple. Añade recursos relacionados para convertirlo en Compuesto.
              </p>
            ) : (
              <div className="space-y-2">
                {formData.relatedResources.map((related, index) => {
                  const relatedResource = availableResources.find(r => r.id === related.resourceId);
                  const availableForSelect = availableResources.filter(
                    r => r.id === related.resourceId || !alreadyRelatedIds.includes(r.id)
                  );
                  
                  return (
                    <div key={index} className="flex items-center gap-2 bg-background p-2 rounded-md">
                      <Select
                        value={related.resourceId}
                        onValueChange={(value) => updateRelatedResource(index, { resourceId: value })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue>
                            {relatedResource?.name || 'Seleccionar recurso'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableForSelect.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({formatCurrency(r.unitCost)}/{r.unitMeasure})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={related.quantity}
                        onChange={(e) => updateRelatedResource(index, { quantity: parseFloat(e.target.value) || 1 })}
                        className="w-24"
                        placeholder="Cant."
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRelatedResource(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
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
