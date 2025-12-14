import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format-utils';

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementRelation {
  measurement_id: string;
  related_measurement_id: string;
}

interface MeasurementInlineSelectProps {
  activityId: string;
  value: string | null;
  measurements: Measurement[];
  measurementRelations: MeasurementRelation[];
  onSave: (measurementId: string | null) => void;
}

export function MeasurementInlineSelect({
  activityId,
  value,
  measurements,
  measurementRelations,
  onSave
}: MeasurementInlineSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Generate MediciónID for a measurement
  const getMedicionId = (measurement: Measurement): string => {
    // Calculate related units
    const relatedMeasurementIds = measurementRelations
      .filter(r => r.measurement_id === measurement.id)
      .map(r => r.related_measurement_id);
    
    const relatedUnitsSum = relatedMeasurementIds.reduce((sum, relId) => {
      const relMeasurement = measurements.find(m => m.id === relId);
      return sum + (relMeasurement?.manual_units || 0);
    }, 0);
    
    const udsCalculo = relatedUnitsSum > 0 ? relatedUnitsSum : (measurement.manual_units || 0);
    return `${formatNumber(udsCalculo)}/${measurement.measurement_unit || 'ud'}: ${measurement.name}`;
  };

  const currentMeasurement = measurements.find(m => m.id === value);
  const displayValue = currentMeasurement ? getMedicionId(currentMeasurement) : '-';

  const filteredMeasurements = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return measurements
      .filter(m => 
        m.name.toLowerCase().includes(query) ||
        getMedicionId(m).toLowerCase().includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [measurements, measurementRelations, searchQuery]);

  const handleSelect = (measurementId: string | null) => {
    onSave(measurementId);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-full text-left px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer truncate text-muted-foreground",
            open && "bg-muted"
          )}
          title={displayValue}
        >
          {displayValue}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar medición..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No se encontraron mediciones</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => handleSelect(null)}
                className="flex items-center gap-2"
              >
                <Check className={cn("h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground italic">Sin medición</span>
              </CommandItem>
              {filteredMeasurements.map(measurement => {
                const medicionId = getMedicionId(measurement);
                return (
                  <CommandItem
                    key={measurement.id}
                    value={measurement.id}
                    onSelect={() => handleSelect(measurement.id)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn("h-4 w-4", value === measurement.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate" title={medicionId}>{medicionId}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
