export type UnitMeasure = 'm2' | 'm3' | 'ml' | 'mes' | 'ud' | 'kg' | 'hora' | 'día';

export type ResourceType = 'Alquiler' | 'Equipo' | 'Mano de obra' | 'Material' | 'Producto' | 'Servicio' | 'Utiles y herramientas';

export type ResourceComposition = 'Simple' | 'Compuesto';

export interface RelatedResource {
  resourceId: string;
  quantity: number;
}

export interface ResourceFile {
  id: string;
  resource_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
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
  registrationDate: Date;
  createdAt: Date;
  updatedAt: Date;
  supplierId?: string | null;
  supplier?: {
    id: string;
    name: string;
    surname?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  } | null;
  files?: ResourceFile[];
  tradeId?: string | null;
  trade?: {
    id: string;
    name: string;
  } | null;
  vatIncludedPercent?: number | null;
}

export const UNIT_MEASURES: UnitMeasure[] = ['m2', 'm3', 'ml', 'mes', 'ud', 'kg', 'hora', 'día'];

export const RESOURCE_TYPES: ResourceType[] = ['Alquiler', 'Equipo', 'Mano de obra', 'Material', 'Producto', 'Servicio', 'Utiles y herramientas'];

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
