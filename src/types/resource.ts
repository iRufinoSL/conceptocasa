export type UnitMeasure = 'm2' | 'm3' | 'ml' | 'mes' | 'ud' | 'kg' | 'hora' | 'día';

export type ResourceType = 'Producto' | 'Mano de obra' | 'Alquiler' | 'Servicio' | 'Material' | 'Equipo';

export type ResourceComposition = 'Simple' | 'Compuesto';

export interface RelatedResource {
  resourceId: string;
  quantity: number;
}

export interface ExternalResource {
  id: string;
  name: string;
  description: string;
  unitCost: number;
  unitMeasure: UnitMeasure;
  resourceType: ResourceType;
  imageUrl?: string;
  website?: string;
  relatedResources: RelatedResource[];
  createdAt: Date;
  updatedAt: Date;
}

export const UNIT_MEASURES: UnitMeasure[] = ['m2', 'm3', 'ml', 'mes', 'ud', 'kg', 'hora', 'día'];

export const RESOURCE_TYPES: ResourceType[] = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Material', 'Equipo'];

// Helper to determine if a resource is Simple or Compuesto
export function getResourceComposition(resource: ExternalResource): ResourceComposition {
  return resource.relatedResources.length > 0 ? 'Compuesto' : 'Simple';
}

// Helper to calculate the total cost for a composite resource
export function calculateCompositeCost(resource: ExternalResource, allResources: ExternalResource[]): number {
  if (resource.relatedResources.length === 0) {
    return resource.unitCost;
  }
  
  return resource.relatedResources.reduce((total, related) => {
    const relatedResource = allResources.find(r => r.id === related.resourceId);
    if (relatedResource) {
      return total + (relatedResource.unitCost * related.quantity);
    }
    return total;
  }, 0);
}
