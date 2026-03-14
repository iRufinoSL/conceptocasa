import { useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, CheckCircle2, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMatch } from '@/lib/search-utils';
import { Badge } from '@/components/ui/badge';

export interface WorkspaceRoom {
  id: string;
  name: string;
  floor_id: string | null;
  floor_polygon?: Array<{ x: number; y: number }> | null;
}

export interface WorkspaceRelation {
  activity_id: string;
  workspace_id: string;
}

interface WorkspaceInlineSelectProps {
  activityId: string;
  workspaces: WorkspaceRoom[];
  workspaceRelations: WorkspaceRelation[];
  /** Called with a single-element array [workspaceId] or empty [] */
  onSave: (workspaceIds: string[]) => void | Promise<void>;
  /** If true, this activity inherits from parent — show inherited badge */
  inheritedWorkspaceIds?: string[];
  onTabNext?: () => void;
  onTabPrev?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
}

export interface WorkspaceInlineSelectHandle {
  focus: () => void;
  click: () => void;
}

export const WorkspaceInlineSelect = forwardRef<WorkspaceInlineSelectHandle, WorkspaceInlineSelectProps>(
  function WorkspaceInlineSelect({
    activityId,
    workspaces,
    workspaceRelations,
    onSave,
    inheritedWorkspaceIds,
    onTabNext,
    onTabPrev,
    onArrowUp,
    onArrowDown,
  }, ref) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Single workspace: get current assigned workspace
    const currentWorkspaceId = useMemo(() => {
      const rel = workspaceRelations.find(r => r.activity_id === activityId);
      return rel?.workspace_id || null;
    }, [workspaceRelations, activityId]);

    const currentWorkspace = useMemo(() => {
      return currentWorkspaceId ? workspaces.find(ws => ws.id === currentWorkspaceId) || null : null;
    }, [currentWorkspaceId, workspaces]);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
      click: () => triggerRef.current?.click(),
    }));

    const triggerSuccess = () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    };

    // Inherited workspace (from parent) if not directly assigned
    const inheritedWorkspace = useMemo(() => {
      if (!inheritedWorkspaceIds || inheritedWorkspaceIds.length === 0 || currentWorkspaceId) return null;
      const inheritedId = inheritedWorkspaceIds[0];
      return inheritedId ? workspaces.find(ws => ws.id === inheritedId) || null : null;
    }, [inheritedWorkspaceIds, currentWorkspaceId, workspaces]);

    const filteredWorkspaces = useMemo(() => {
      return workspaces
        .filter(ws => searchMatch(ws.name, searchQuery))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [workspaces, searchQuery]);

    const handleSelect = async (workspaceId: string) => {
      // If clicking the already-selected one, deselect
      const newIds = workspaceId === currentWorkspaceId ? [] : [workspaceId];
      setOpen(false);
      setSearchQuery('');
      try {
        await onSave(newIds);
        triggerSuccess();
      } catch {
        // revert handled by parent
      }
    };

    const handleRemove = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void onSave([]);
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
          if (e.shiftKey && onTabPrev) { e.preventDefault(); onTabPrev(); }
          else if (!e.shiftKey && onTabNext) { e.preventDefault(); onTabNext(); }
        } else if (e.key === 'ArrowUp' && onArrowUp) { e.preventDefault(); onArrowUp(); }
        else if (e.key === 'ArrowDown' && onArrowDown) { e.preventDefault(); onArrowDown(); }
      }
    };

    return (
      <div className="flex items-center gap-1 flex-wrap">
        {/* Inherited workspace (from parent) */}
        {inheritedWorkspace && (
          <Badge variant="outline" className="text-xs flex items-center gap-1 opacity-60 border-dashed">
            <span className="truncate max-w-[100px]" title={`Heredado: ${inheritedWorkspace.name}`}>
              {inheritedWorkspace.name}
            </span>
            <span className="text-[9px]">↑</span>
          </Badge>
        )}

        {/* Currently assigned workspace */}
        {currentWorkspace && (
          <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-default">
            <span className="truncate max-w-[120px]" title={currentWorkspace.name}>
              {currentWorkspace.name}
            </span>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
              title="Quitar espacio de trabajo"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}

        {/* Popover to select workspace */}
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
              title={currentWorkspace ? 'Cambiar espacio de trabajo' : 'Asignar espacio de trabajo'}
              onKeyDown={handleKeyDown}
            >
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>{!currentWorkspace && !inheritedWorkspace ? 'Asignar' : '⇄'}</span>
              {showSuccess && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 animate-scale-in flex-shrink-0" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar espacio de trabajo..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No se encontraron espacios de trabajo</CommandEmpty>
                <CommandGroup>
                  {filteredWorkspaces.map(ws => {
                    const isSelected = ws.id === currentWorkspaceId;
                    const isInherited = inheritedWorkspaceIds?.includes(ws.id) && !isSelected;
                    return (
                      <CommandItem
                        key={ws.id}
                        value={ws.id}
                        onSelect={() => void handleSelect(ws.id)}
                        className="flex items-center gap-2"
                      >
                        <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate font-medium">{ws.name}</span>
                          {ws.floor_polygon && (
                            <span className="text-[10px] text-muted-foreground">
                              {ws.floor_polygon.length} paredes
                            </span>
                          )}
                        </div>
                        {isInherited && (
                          <Badge variant="outline" className="text-[9px] shrink-0 border-dashed">Heredado</Badge>
                        )}
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
