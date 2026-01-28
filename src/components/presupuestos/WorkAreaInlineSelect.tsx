import { useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, CheckCircle2, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMatch } from '@/lib/search-utils';
import { Badge } from '@/components/ui/badge';

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
}

interface WorkAreaRelation {
  activity_id: string;
  work_area_id: string;
}

interface WorkAreaInlineSelectProps {
  activityId: string;
  workAreas: WorkArea[];
  workAreaRelations: WorkAreaRelation[];
  onSave: (workAreaIds: string[]) => void | Promise<void>;
  onTabNext?: () => void;
  onTabPrev?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
}

export interface WorkAreaInlineSelectHandle {
  focus: () => void;
  click: () => void;
}

export const WorkAreaInlineSelect = forwardRef<WorkAreaInlineSelectHandle, WorkAreaInlineSelectProps>(
  function WorkAreaInlineSelect({
    activityId,
    workAreas,
    workAreaRelations,
    onSave,
    onTabNext,
    onTabPrev,
    onArrowUp,
    onArrowDown
  }, ref) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    // Local optimistic state to avoid stale-props race conditions when toggling fast
    const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([]);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Get current work area IDs for this activity
    const currentWorkAreaIds = useMemo(() => {
      return workAreaRelations
        .filter(r => r.activity_id === activityId)
        .map(r => r.work_area_id);
    }, [workAreaRelations, activityId]);

    // Keep local state in sync when props change (e.g., after realtime refresh)
    useEffect(() => {
      // De-dupe defensively
      setLocalSelectedIds(Array.from(new Set(currentWorkAreaIds)));
    }, [currentWorkAreaIds]);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
      click: () => triggerRef.current?.click()
    }));

    const triggerSuccess = () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    };

    // Get selected work areas for display
    const selectedWorkAreas = useMemo(() => {
      return workAreas.filter(wa => localSelectedIds.includes(wa.id));
    }, [localSelectedIds, workAreas]);

    // Get display value
    const displayValue = useMemo(() => {
      if (selectedWorkAreas.length === 0) return '-';
      if (selectedWorkAreas.length === 1) {
        return selectedWorkAreas[0].area_id;
      }
      return `${selectedWorkAreas.length} áreas`;
    }, [selectedWorkAreas]);

    const filteredWorkAreas = useMemo(() => {
      return workAreas
        .filter(wa => 
          searchMatch(wa.name, searchQuery) ||
          searchMatch(wa.area_id, searchQuery) ||
          searchMatch(wa.level, searchQuery) ||
          searchMatch(wa.work_area, searchQuery)
        )
        .sort((a, b) => a.area_id.localeCompare(b.area_id));
    }, [workAreas, searchQuery]);

    // Handle toggle with immediate save
    const handleToggle = async (workAreaId: string) => {
      const base = localSelectedIds;
      const newIds = base.includes(workAreaId)
        ? base.filter(id => id !== workAreaId)
        : [...base, workAreaId];

      // Optimistic UI first
      setLocalSelectedIds(Array.from(new Set(newIds)));
      try {
        await onSave(Array.from(new Set(newIds)));
        triggerSuccess();
      } catch (e) {
        // Revert to server state on error
        setLocalSelectedIds(Array.from(new Set(currentWorkAreaIds)));
        throw e;
      }
    };

    // Handle remove via X button (outside popover)
    const handleRemove = (e: React.MouseEvent, workAreaId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const newIds = localSelectedIds.filter(id => id !== workAreaId);
      setLocalSelectedIds(Array.from(new Set(newIds)));
      // Fire-and-forget (errors handled in parent toast)
      void onSave(Array.from(new Set(newIds)));
      triggerSuccess();
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
        } else if (e.key === 'ArrowUp' && onArrowUp) {
          e.preventDefault();
          onArrowUp();
        } else if (e.key === 'ArrowDown' && onArrowDown) {
          e.preventDefault();
          onArrowDown();
        }
      }
    };

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
      <div className="flex items-center gap-1 flex-wrap">
        {/* Show selected work areas as badges with X button */}
        {selectedWorkAreas.map(wa => (
          <Badge
            key={wa.id}
            variant="secondary"
            className="text-xs flex items-center gap-1 cursor-default"
          >
            <span className="truncate max-w-[80px]" title={`${wa.area_id}: ${wa.name}`}>
              {wa.area_id}
            </span>
            <button
              type="button"
              onClick={(e) => handleRemove(e, wa.id)}
              className="ml-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
              title="Quitar área de trabajo"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        {/* Popover to add more */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              className={cn(
                "px-2 py-1 rounded-md transition-all duration-200 cursor-pointer flex items-center gap-1.5",
                "hover:bg-primary/10 hover:border-primary/30 border border-dashed border-muted-foreground/30",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:bg-primary/10",
                open && "ring-2 ring-primary ring-offset-1 bg-primary/5",
                "text-muted-foreground text-xs"
              )}
              title="Añadir área de trabajo"
              onKeyDown={handleKeyDown}
            >
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>{selectedWorkAreas.length === 0 ? 'Añadir' : '+'}</span>
              {showSuccess && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 animate-scale-in flex-shrink-0" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start" onKeyDown={handlePopoverKeyDown}>
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar área de trabajo..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No se encontraron áreas de trabajo</CommandEmpty>
                <CommandGroup>
                  {filteredWorkAreas.map(workArea => {
                    const isSelected = localSelectedIds.includes(workArea.id);
                    return (
                      <CommandItem
                        key={workArea.id}
                        value={workArea.id}
                        onSelect={() => void handleToggle(workArea.id)}
                        className="flex items-center gap-2"
                      >
                        <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate font-medium">{workArea.area_id}</span>
                          <span className="text-xs text-muted-foreground truncate">{workArea.name || `${workArea.level}/${workArea.work_area}`}</span>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">{workArea.level}</Badge>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
