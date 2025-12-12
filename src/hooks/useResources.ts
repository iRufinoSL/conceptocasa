import { useState, useMemo, useCallback } from 'react';
import { ExternalResource, ResourceType, calculateCompositeCost, getResourceComposition } from '@/types/resource';
import { mockResources } from '@/data/mockResources';

export function useResources() {
  const [resources, setResources] = useState<ExternalResource[]>(mockResources);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ResourceType | 'all'>('all');

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
      const searchLower = searchTerm.toLowerCase();
      const composition = getComposition(resource);
      
      // Search across all fields including composition
      const matchesSearch =
        resource.name.toLowerCase().includes(searchLower) ||
        resource.description.toLowerCase().includes(searchLower) ||
        resource.id.toLowerCase().includes(searchLower) ||
        resource.resourceType.toLowerCase().includes(searchLower) ||
        resource.unitMeasure.toLowerCase().includes(searchLower) ||
        resource.unitCost.toString().includes(searchLower) ||
        composition.toLowerCase().includes(searchLower) ||
        (resource.website && resource.website.toLowerCase().includes(searchLower));
      
      const matchesType = filterType === 'all' || resource.resourceType === filterType;
      return matchesSearch && matchesType;
    });
  }, [resources, searchTerm, filterType, getComposition]);

  const addResource = (resource: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newResource: ExternalResource = {
      ...resource,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setResources((prev) => [...prev, newResource]);
  };

  const updateResource = (id: string, updates: Partial<ExternalResource>) => {
    setResources((prev) =>
      prev.map((resource) =>
        resource.id === id
          ? { ...resource, ...updates, updatedAt: new Date() }
          : resource
      )
    );
  };

  const deleteResource = (id: string) => {
    setResources((prev) => prev.filter((resource) => resource.id !== id));
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
    getEffectiveCost,
    getComposition,
  };
}
