import { useState, useEffect } from 'react';
import { ExternalResource, UNIT_MEASURES, RESOURCE_TYPES, UnitMeasure, ResourceType, RelatedResource } from '@/types/resource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { InputAddon } from '@/components/ui/input-addon';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { ResourceSupplierSelect } from './ResourceSupplierSelect';
import { ResourceFileManager } from './ResourceFileManager';
import { ResourceTradeSelect } from './ResourceTradeSelect';

interface ResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: ExternalResource | null;
  onSubmit: (data: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt' | 'files'>) => void;
  onUpdate?: (id: string, data: Partial<ExternalResource>) => void;
  allResources: ExternalResource[];
  onUploadFile?: (resourceId: string, file: File) => Promise<boolean>;
  onDeleteFile?: (fileId: string, filePath: string) => Promise<boolean>;
  getFileUrl?: (filePath: string) => Promise<string | null>;
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
  registrationDate: new Date().toISOString().split('T')[0],
  supplierId: null as string | null,
  tradeId: null as string | null,
  vatIncludedPercent: null as number | null,
  widthMm: null as number | null,
  heightMm: null as number | null,
  depthMm: null as number | null,
};

export function ResourceForm({ 
  open, 
  onOpenChange, 
  resource, 
  onSubmit, 
  onUpdate, 
  allResources,
  onUploadFile,
  onDeleteFile,
  getFileUrl,
}: ResourceFormProps) {
  const [formData, setFormData] = useState(initialFormState);

  // Get available resources for selection (exclude current resource being edited)
  const availableResources = allResources.filter(r => r.id !== resource?.id);

  useEffect(() => {
    if (resource) {
      const regDate = resource.registrationDate 
        ? new Date(resource.registrationDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      setFormData({
        name: resource.name,
        description: resource.description,
        unitCost: resource.unitCost,
        unitMeasure: resource.unitMeasure,
        resourceType: resource.resourceType,
        imageUrl: resource.imageUrl || '',
        website: resource.website || '',
        relatedResources: resource.relatedResources || [],
        registrationDate: regDate,
        supplierId: resource.supplierId || null,
        tradeId: resource.tradeId || null,
        vatIncludedPercent: resource.vatIncludedPercent ?? null,
      });
    } else {
      setFormData({
        ...initialFormState,
        registrationDate: new Date().toISOString().split('T')[0],
      });
    }
  }, [resource, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = {
      ...formData,
      registrationDate: new Date(formData.registrationDate),
    };
    if (resource && onUpdate) {
      onUpdate(resource.id, dataToSubmit);
    } else {
      onSubmit(dataToSubmit);
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
      <DialogContent 
        className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent closing when interacting with file dialogs or other portaled elements
          const target = e.target as HTMLElement;
          if (target.closest('input[type="file"]') || target.tagName === 'INPUT') {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          // Prevent closing during file selection
          e.preventDefault();
        }}
      >
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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitCost">
                Coste unitario {!isComposite && '*'}
              </Label>
              <InputAddon addon="€">
                <NumericInput
                  id="unitCost"
                  value={formData.unitCost}
                  onChange={(value) => setFormData({ ...formData, unitCost: value })}
                  disabled={isComposite}
                  className={isComposite ? 'bg-muted' : ''}
                  placeholder="0,00"
                />
              </InputAddon>
              {isComposite && (
                <p className="text-xs text-accent">El coste se calcula automáticamente</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vatIncludedPercent">% IVA incluido</Label>
              <InputAddon addon="%">
                <NumericInput
                  id="vatIncludedPercent"
                  value={formData.vatIncludedPercent ?? 0}
                  onChange={(value) => setFormData({ ...formData, vatIncludedPercent: value || null })}
                  placeholder="0"
                  decimals={0}
                />
              </InputAddon>
              <p className="text-xs text-muted-foreground">
                IVA que lleva incluido el precio
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitMeasure">Ud. medida *</Label>
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

          {/* Trade/Sector Section */}
          <div className="space-y-2">
            <Label>Oficio/Sector</Label>
            <ResourceTradeSelect
              value={formData.tradeId}
              onChange={(value) => setFormData({ ...formData, tradeId: value })}
            />
            <p className="text-xs text-muted-foreground">
              Clasifica el recurso por oficio o sector (electricidad, fontanería, etc.)
            </p>
          </div>

          {/* Supplier Section */}
          <div className="space-y-2">
            <Label>Suministrador</Label>
            <ResourceSupplierSelect
              value={formData.supplierId}
              onChange={(value) => setFormData({ ...formData, supplierId: value })}
            />
            <p className="text-xs text-muted-foreground">
              Selecciona un contacto del CRM o crea uno nuevo como suministrador
            </p>
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
                      <NumericInput
                        value={related.quantity}
                        onChange={(value) => updateRelatedResource(index, { quantity: value || 1 })}
                        className="w-24"
                        placeholder="Cant."
                        decimals={2}
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

          {/* Files Section - Only for existing resources */}
          {resource && onUploadFile && onDeleteFile && getFileUrl && (
            <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
              <Label className="text-base font-semibold">Archivos adjuntos</Label>
              <ResourceFileManager
                resourceId={resource.id}
                files={resource.files || []}
                onUpload={onUploadFile}
                onDelete={onDeleteFile}
                getFileUrl={getFileUrl}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registrationDate">Fecha de registro *</Label>
              <Input
                id="registrationDate"
                type="date"
                value={formData.registrationDate}
                onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
                required
              />
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
