import { useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, CheckCircle2, MapPin } from 'lucide-react';
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
  onSave: (workAreaIds: string[]) => void;
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
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Get current work area IDs for this activity
    const currentWorkAreaIds = useMemo(() => {
      return workAreaRelations
        .filter(r => r.activity_id === activityId)
        .map(r => r.work_area_id);
    }, [workAreaRelations, activityId]);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentWorkAreaIds));

    // Sync with external state when relations change
    useEffect(() => {
      setSelectedIds(new Set(currentWorkAreaIds));
    }, [currentWorkAreaIds]);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
      click: () => triggerRef.current?.click()
    }));

    const triggerSuccess = () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    };

    // Get display value
    const displayValue = useMemo(() => {
      if (selectedIds.size === 0) return '-';
      const selected = workAreas.filter(wa => selectedIds.has(wa.id));
      if (selected.length === 1) {
        return selected[0].area_id;
      }
      return `${selected.length} áreas`;
    }, [selectedIds, workAreas]);

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

    const handleToggle = (workAreaId: string) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(workAreaId)) {
        newSelected.delete(workAreaId);
      } else {
        newSelected.add(workAreaId);
      }
      setSelectedIds(newSelected);
    };

    const handleSave = () => {
      const currentSet = new Set(currentWorkAreaIds);
      const hasChanged = 
        selectedIds.size !== currentSet.size ||
        [...selectedIds].some(id => !currentSet.has(id));
      
      onSave(Array.from(selectedIds));
      setOpen(false);
      setSearchQuery('');
      if (hasChanged) {
        triggerSuccess();
      }
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
      <Popover open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleSave();
        }
        setOpen(isOpen);
      }}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            className={cn(
              "w-full text-left px-2 py-1 -mx-1 rounded-md transition-all duration-200 cursor-pointer truncate flex items-center gap-1.5",
              "hover:bg-primary/10 hover:border-primary/30 border border-transparent",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:bg-primary/10",
              open && "ring-2 ring-primary ring-offset-1 bg-primary/5",
              selectedIds.size === 0 && "text-muted-foreground"
            )}
            title={displayValue}
            onKeyDown={handleKeyDown}
          >
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{displayValue}</span>
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
                {filteredWorkAreas.map(workArea => (
                  <CommandItem
                    key={workArea.id}
                    value={workArea.id}
                    onSelect={() => handleToggle(workArea.id)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn("h-4 w-4", selectedIds.has(workArea.id) ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate font-medium">{workArea.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{workArea.area_id}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{workArea.level}</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);
