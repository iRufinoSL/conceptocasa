import { ResourceType, RESOURCE_TYPES } from '@/types/resource';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface ResourceFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: ResourceType | 'all';
  onFilterChange: (value: ResourceType | 'all') => void;
}

export function ResourceFilters({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterChange,
}: ResourceFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar recursos..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={filterType} onValueChange={(value) => onFilterChange(value as ResourceType | 'all')}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Filtrar por tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los tipos</SelectItem>
          {RESOURCE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
