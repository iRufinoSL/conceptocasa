import { useState, useMemo, useCallback } from 'react';
import { ExternalResource, ResourceType, calculateCompositeCost, getResourceComposition } from '@/types/resource';
import { mockResources } from '@/data/mockResources';
import { searchMatch } from '@/lib/search-utils';

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
        searchMatch(resource.website, searchTerm);
      
      const matchesType = filterType === 'all' || resource.resourceType === filterType;
      return matchesSearch && matchesType;
    });
  }, [resources, searchTerm, filterType, getComposition]);

  const addResource = (resource: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newResource: ExternalResource = {
      ...resource,
      id: Date.now().toString(),
      registrationDate: resource.registrationDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setResources((prev) => [...prev, newResource]);
  };

  const duplicateResource = (resourceId: string) => {
    const original = resources.find(r => r.id === resourceId);
    if (!original) return;
    
    const duplicated: ExternalResource = {
      ...original,
      id: Date.now().toString(),
      name: `${original.name} (copia)`,
      registrationDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setResources((prev) => [...prev, duplicated]);
    return duplicated;
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
    duplicateResource,
    getEffectiveCost,
    getComposition,
  };
}
