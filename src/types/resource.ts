export type UnitMeasure = 'm2' | 'm3' | 'ml' | 'mes' | 'ud' | 'kg' | 'hora' | 'día';

export type ResourceType = 'Producto' | 'Mano de obra' | 'Alquiler' | 'Servicio' | 'Material' | 'Equipo';

export interface ExternalResource {
  id: string;
  name: string;
  description: string;
  unitCost: number;
  unitMeasure: UnitMeasure;
  resourceType: ResourceType;
  imageUrl?: string;
  website?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UNIT_MEASURES: UnitMeasure[] = ['m2', 'm3', 'ml', 'mes', 'ud', 'kg', 'hora', 'día'];

export const RESOURCE_TYPES: ResourceType[] = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Material', 'Equipo'];
