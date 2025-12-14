import { useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
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
  onTabNext?: () => void;
  onTabPrev?: () => void;
}

export interface MeasurementInlineSelectHandle {
  focus: () => void;
  click: () => void;
}

export const MeasurementInlineSelect = forwardRef<MeasurementInlineSelectHandle, MeasurementInlineSelectProps>(
  function MeasurementInlineSelect({
    activityId,
    value,
    measurements,
    measurementRelations,
    onSave,
    onTabNext,
    onTabPrev
  }, ref) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
      click: () => triggerRef.current?.click()
    }));

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

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setSearchQuery('');
        triggerRef.current?.blur();
      } else if (!open) {
        if (e.key === 'Tab') {
          if (e.shiftKey && onTabPrev) {
            e.preventDefault();
            onTabPrev();
          } else if (!e.shiftKey && onTabNext) {
            e.preventDefault();
            onTabNext();
          }
        }
      }
    };

    // Handle escape inside the popover
    const handlePopoverKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
      }
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            className={cn(
              "w-full text-left px-2 py-1 -mx-1 rounded-md transition-all duration-200 cursor-pointer truncate",
              "hover:bg-primary/10 hover:border-primary/30 border border-transparent",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:bg-primary/10",
              open && "ring-2 ring-primary ring-offset-1 bg-primary/5",
              !currentMeasurement && "text-muted-foreground"
            )}
            title={displayValue}
            onKeyDown={handleKeyDown}
          >
            {displayValue}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start" onKeyDown={handlePopoverKeyDown}>
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
);