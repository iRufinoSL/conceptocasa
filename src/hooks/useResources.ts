import { useState, useMemo } from 'react';
import { ExternalResource, ResourceType } from '@/types/resource';
import { mockResources } from '@/data/mockResources';

export function useResources() {
  const [resources, setResources] = useState<ExternalResource[]>(mockResources);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ResourceType | 'all'>('all');

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      const matchesSearch =
        resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || resource.resourceType === filterType;
      return matchesSearch && matchesType;
    });
  }, [resources, searchTerm, filterType]);

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
  };
}
