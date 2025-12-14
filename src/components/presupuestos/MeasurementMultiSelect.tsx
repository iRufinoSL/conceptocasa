import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format-utils';

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementMultiSelectProps {
  measurementId: string;
  selectedIds: string[];
  allMeasurements: Measurement[];
  onSave: (selectedIds: string[]) => Promise<void>;
  disabled?: boolean;
}

export function MeasurementMultiSelect({
  measurementId,
  selectedIds,
  allMeasurements,
  onSave,
  disabled = false,
}: MeasurementMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);
  const [isSaving, setIsSaving] = useState(false);

  // Get available measurements (exclude self)
  const availableMeasurements = useMemo(() => {
    return allMeasurements.filter(m => m.id !== measurementId);
  }, [allMeasurements, measurementId]);

  // Filter measurements by search
  const filteredMeasurements = useMemo(() => {
    if (!searchQuery) return availableMeasurements;
    const query = searchQuery.toLowerCase();
    return availableMeasurements.filter(m => 
      m.name.toLowerCase().includes(query)
    );
  }, [availableMeasurements, searchQuery]);

  // Get selected measurements for display
  const selectedMeasurements = useMemo(() => {
    return allMeasurements.filter(m => selectedIds.includes(m.id));
  }, [allMeasurements, selectedIds]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalSelectedIds(selectedIds);
      setSearchQuery('');
    }
    setIsOpen(open);
  };

  const toggleMeasurement = (id: string) => {
    setLocalSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localSelectedIds);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1">
        {selectedMeasurements.length === 0 ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          selectedMeasurements.map(m => (
            <Badge key={m.id} variant="secondary" className="text-xs">
              <Link2 className="h-3 w-3 mr-1" />
              {m.name}
            </Badge>
          ))
        )}
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div 
          className="cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-colors min-h-[24px]"
          title="Clic para editar"
        >
          {selectedMeasurements.length === 0 ? (
            <span className="text-muted-foreground text-sm">-</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedMeasurements.map(m => (
                <Badge key={m.id} variant="secondary" className="text-xs">
                  <Link2 className="h-3 w-3 mr-1" />
                  {m.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Buscar medición..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>No se encontraron mediciones.</CommandEmpty>
            <CommandGroup>
              {filteredMeasurements.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.id}
                  onSelect={() => toggleMeasurement(m.id)}
                  className="cursor-pointer"
                >
                  <Checkbox
                    checked={localSelectedIds.includes(m.id)}
                    className="mr-2"
                  />
                  <span className="text-sm flex-1 truncate">
                    {m.name} ({formatNumber(m.manual_units || 0)} {m.measurement_unit || 'ud'})
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex justify-between items-center p-2 border-t">
          <span className="text-xs text-muted-foreground">
            {localSelectedIds.length} seleccionada(s)
          </span>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}