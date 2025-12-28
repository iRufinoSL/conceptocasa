import { useState, useMemo, useCallback, useEffect } from 'react';
import { ExternalResource, ResourceType, calculateCompositeCost, getResourceComposition, RelatedResource, ResourceFile } from '@/types/resource';
import { searchMatch } from '@/lib/search-utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DBResource {
  id: string;
  name: string;
  description: string | null;
  unit_cost: number | null;
  unit_measure: string | null;
  resource_type: string | null;
  image_url: string | null;
  website: string | null;
  registration_date: string | null;
  supplier_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  supplier?: {
    id: string;
    name: string;
    surname: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
  } | null;
}

interface DBRelation {
  resource_id: string;
  related_resource_id: string;
  quantity: number | null;
}

function mapDBToResource(dbResource: DBResource, relations: DBRelation[], files: ResourceFile[]): ExternalResource {
  return {
    id: dbResource.id,
    name: dbResource.name,
    description: dbResource.description || '',
    unitCost: Number(dbResource.unit_cost) || 0,
    unitMeasure: (dbResource.unit_measure as ExternalResource['unitMeasure']) || 'ud',
    resourceType: (dbResource.resource_type as ExternalResource['resourceType']) || 'Producto',
    imageUrl: dbResource.image_url || undefined,
    website: dbResource.website || undefined,
    registrationDate: dbResource.registration_date ? new Date(dbResource.registration_date) : new Date(),
    createdAt: dbResource.created_at ? new Date(dbResource.created_at) : new Date(),
    updatedAt: dbResource.updated_at ? new Date(dbResource.updated_at) : new Date(),
    supplierId: dbResource.supplier_id,
    supplier: dbResource.supplier || null,
    relatedResources: relations
      .filter(r => r.resource_id === dbResource.id)
      .map(r => ({ resourceId: r.related_resource_id, quantity: Number(r.quantity) || 1 })),
    files: files.filter(f => f.resource_id === dbResource.id),
  };
}

export function useResources() {
  const [resources, setResources] = useState<ExternalResource[]>([]);
  const [relations, setRelations] = useState<DBRelation[]>([]);
  const [files, setFiles] = useState<ResourceFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ResourceType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch resources from database
  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const [resourcesRes, relationsRes, filesRes] = await Promise.all([
        supabase
          .from('external_resources')
          .select(`
            *,
            supplier:crm_contacts!external_resources_supplier_id_fkey(id, name, surname, email, phone, city)
          `)
          .order('name'),
        supabase
          .from('external_resource_relations')
          .select('resource_id, related_resource_id, quantity'),
        supabase
          .from('external_resource_files')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (resourcesRes.error) throw resourcesRes.error;
      if (relationsRes.error) throw relationsRes.error;
      if (filesRes.error) throw filesRes.error;

      const dbResources = (resourcesRes.data || []) as DBResource[];
      const dbRelations = (relationsRes.data || []) as DBRelation[];
      const dbFiles = (filesRes.data || []) as ResourceFile[];

      setRelations(dbRelations);
      setFiles(dbFiles);
      setResources(dbResources.map(r => mapDBToResource(r, dbRelations, dbFiles)));
    } catch (error: unknown) {
      console.error('Error fetching resources:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los recursos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Calculate effective cost for a resource (including composite resources)
  const getEffectiveCost = useCallback((resource: ExternalResource): number => {
    return calculateCompositeCost(resource, resources);
  }, [resources]);

  // Get composition type for a resource
  const getComposition = useCallback((resource: ExternalResource) => {
    return getResourceComposition(resource);
  }, []);

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      const composition = getComposition(resource);
      
      // Search across all fields including composition (accent-insensitive)
      const matchesSearch =
        searchMatch(resource.name, searchTerm) ||
        searchMatch(resource.description, searchTerm) ||
        searchMatch(resource.id, searchTerm) ||
        searchMatch(resource.resourceType, searchTerm) ||
        searchMatch(resource.unitMeasure, searchTerm) ||
        resource.unitCost.toString().includes(searchTerm) ||
        searchMatch(composition, searchTerm) ||
        searchMatch(resource.website, searchTerm) ||
        searchMatch(resource.supplier?.name, searchTerm);
      
      const matchesType = filterType === 'all' || resource.resourceType === filterType;
      return matchesSearch && matchesType;
    });
  }, [resources, searchTerm, filterType, getComposition]);

  const addResource = async (resourceData: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt' | 'files'>) => {
    try {
      const { data, error } = await supabase
        .from('external_resources')
        .insert({
          name: resourceData.name,
          description: resourceData.description,
          unit_cost: resourceData.unitCost,
          unit_measure: resourceData.unitMeasure,
          resource_type: resourceData.resourceType,
          image_url: resourceData.imageUrl || null,
          website: resourceData.website || null,
          registration_date: resourceData.registrationDate.toISOString().split('T')[0],
          supplier_id: resourceData.supplierId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add related resources
      if (resourceData.relatedResources.length > 0) {
        const { error: relError } = await supabase
          .from('external_resource_relations')
          .insert(
            resourceData.relatedResources.map(rel => ({
              resource_id: data.id,
              related_resource_id: rel.resourceId,
              quantity: rel.quantity,
            }))
          );
        if (relError) throw relError;
      }

      await fetchResources();
      return data;
    } catch (error: unknown) {
      console.error('Error adding resource:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el recurso',
        variant: 'destructive',
      });
      return null;
    }
  };

  const duplicateResource = async (resourceId: string) => {
    const original = resources.find(r => r.id === resourceId);
    if (!original) return null;

    const duplicated = await addResource({
      ...original,
      name: `${original.name} (copia)`,
      registrationDate: new Date(),
      supplierId: original.supplierId,
      supplier: original.supplier,
    });

    return duplicated;
  };

  const updateResource = async (id: string, updates: Partial<ExternalResource>) => {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.unitCost !== undefined) updateData.unit_cost = updates.unitCost;
      if (updates.unitMeasure !== undefined) updateData.unit_measure = updates.unitMeasure;
      if (updates.resourceType !== undefined) updateData.resource_type = updates.resourceType;
      if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl || null;
      if (updates.website !== undefined) updateData.website = updates.website || null;
      if (updates.registrationDate !== undefined) {
        updateData.registration_date = updates.registrationDate instanceof Date 
          ? updates.registrationDate.toISOString().split('T')[0]
          : updates.registrationDate;
      }
      if (updates.supplierId !== undefined) updateData.supplier_id = updates.supplierId || null;

      const { error } = await supabase
        .from('external_resources')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Update related resources if provided
      if (updates.relatedResources !== undefined) {
        // Delete existing relations
        await supabase
          .from('external_resource_relations')
          .delete()
          .eq('resource_id', id);

        // Insert new relations
        if (updates.relatedResources.length > 0) {
          const { error: relError } = await supabase
            .from('external_resource_relations')
            .insert(
              updates.relatedResources.map(rel => ({
                resource_id: id,
                related_resource_id: rel.resourceId,
                quantity: rel.quantity,
              }))
            );
          if (relError) throw relError;
        }
      }

      await fetchResources();
    } catch (error: unknown) {
      console.error('Error updating resource:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el recurso',
        variant: 'destructive',
      });
    }
  };

  const deleteResource = async (id: string) => {
    try {
      // First delete files from storage
      const resourceFiles = files.filter(f => f.resource_id === id);
      for (const file of resourceFiles) {
        await supabase.storage.from('resource-files').remove([file.file_path]);
      }

      const { error } = await supabase
        .from('external_resources')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchResources();
    } catch (error: unknown) {
      console.error('Error deleting resource:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el recurso',
        variant: 'destructive',
      });
    }
  };

  // File management
  const uploadFile = async (resourceId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${resourceId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('resource-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('external_resource_files')
        .insert({
          resource_id: resourceId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      await fetchResources();
      return true;
    } catch (error: unknown) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo subir el archivo',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteFile = async (fileId: string, filePath: string) => {
    try {
      await supabase.storage.from('resource-files').remove([filePath]);
      
      const { error } = await supabase
        .from('external_resource_files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      await fetchResources();
      return true;
    } catch (error: unknown) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el archivo',
        variant: 'destructive',
      });
      return false;
    }
  };

  const getFileUrl = async (filePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('resource-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry
    
    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }
    
    return data.signedUrl;
  };

  return {
    resources: filteredResources,
    allResources: resources,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    addResource,
    updateResource,
    deleteResource,
    duplicateResource,
    getEffectiveCost,
    getComposition,
    loading,
    refetch: fetchResources,
    uploadFile,
    deleteFile,
    getFileUrl,
  };
}
