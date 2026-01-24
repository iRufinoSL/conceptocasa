import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput, parseEuropeanNumber } from '@/components/ui/numeric-input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, CheckCircle2, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMatch } from '@/lib/search-utils';
import { toast } from 'sonner';

interface InlineEditProps {
  value: string | number | null;
  onSave: (value: any) => Promise<void>;
  type: 'text' | 'number' | 'select' | 'percent' | 'searchable-select';
  options?: { value: string; label: string; searchContent?: string }[];
  decimals?: number;
  className?: string;
  displayValue?: React.ReactNode;
  disabled?: boolean;
  tabIndex?: number;
  onTabNext?: () => void;
  onTabPrev?: () => void;
  allowNull?: boolean;
}

// Global counter to track active saves across all instances
let activeSaveCount = 0;

const blockNavigation = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = 'Hay cambios guardándose. ¿Seguro que quieres salir?';
  return e.returnValue;
};

const incrementSaveCount = () => {
  activeSaveCount++;
  if (activeSaveCount === 1) {
    window.addEventListener('beforeunload', blockNavigation);
  }
};

const decrementSaveCount = () => {
  activeSaveCount = Math.max(0, activeSaveCount - 1);
  if (activeSaveCount === 0) {
    window.removeEventListener('beforeunload', blockNavigation);
  }
};

export function ResourceInlineEdit({
  value,
  onSave,
  type,
  options,
  decimals = 2,
  className,
  displayValue,
  disabled = false,
  tabIndex,
  onTabNext,
  onTabPrev,
  allowNull = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | number | null>(value ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Only update editValue from props when NOT editing
  // This prevents the value from resetting during save operations
  useEffect(() => {
    if (!isEditing && !isSaving) {
      setEditValue(value ?? '');
    }
  }, [value, isEditing, isSaving]);

  useEffect(() => {
    if (isEditing) {
      setSearchQuery('');
    }
  }, [isEditing]);

  // Cleanup on unmount - ensure we don't leave navigation blocked
  useEffect(() => {
    return () => {
      if (isSaving) {
        decrementSaveCount();
      }
    };
  }, [isSaving]);

  const triggerSuccess = useCallback(() => {
    setShowSuccess(true);
    setSaveError(false);
    setTimeout(() => setShowSuccess(false), 1200);
  }, []);

  const handleCancel = useCallback(() => {
    // Abort any in-progress save
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Reset to original value
    setEditValue(value ?? '');
    setIsEditing(false);
    setIsSaving(false);
    setSaveError(false);
    if (activeSaveCount > 0) {
      decrementSaveCount();
    }
  }, [value]);

  const handleSave = async () => {
    if (isSaving) return;

    // Store scroll position before saving
    const scrollPosition = window.scrollY;

    let finalValue: any = editValue;

    if (type === 'number' || type === 'percent') {
      // editValue can be: number, null (from allowNull NumericInput), or '' (empty string)
      if (editValue === null) {
        finalValue = allowNull ? null : 0;
      } else if (editValue === '' || editValue === undefined) {
        finalValue = allowNull ? null : 0;
      } else if (typeof editValue === 'number') {
        finalValue = editValue;
      } else if (typeof editValue === 'string') {
        // Parse string to number (European format aware)
        const parsed = parseEuropeanNumber(editValue);
        finalValue = isNaN(parsed) ? (allowNull ? null : 0) : parsed;
      }

      // Final validation: ensure it's a valid number or null
      if (finalValue !== null && (typeof finalValue !== 'number' || isNaN(finalValue))) {
        finalValue = allowNull ? null : 0;
      }
    }

    if ((type === 'select' || type === 'searchable-select') && editValue === '__none__') {
      finalValue = null;
    }

    // Always save for numbers/percents since comparison is tricky with formatting
    const shouldSave = (type === 'number' || type === 'percent') ? true : finalValue !== value;

    if (!shouldSave) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    incrementSaveCount();
    try {
      console.log(`ResourceInlineEdit saving: ${finalValue} (type: ${typeof finalValue}, allowNull: ${allowNull})`);
      await onSave(finalValue);
      triggerSuccess();

      // Restore scroll position after save completes
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPosition, behavior: 'instant' });
      });

      setIsEditing(false);
    } catch (error) {
      console.error('ResourceInlineEdit save failed:', error);
      toast.error('No se pudo guardar el valor');
      setSaveError(true);
      // Keep editing so the user can retry / correct
    } finally {
      decrementSaveCount();
      setIsSaving(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleSave();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      await handleSave();
      // Navigate to next/prev field after saving
      requestAnimationFrame(() => {
        if (e.shiftKey && onTabPrev) {
          onTabPrev();
        } else if (!e.shiftKey && onTabNext) {
          onTabNext();
        }
      });
    } else if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
  };

  // Filter and sort options for searchable select
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    
    const query = searchQuery.trim();
    let filtered = options;
    
    if (query) {
      filtered = options.filter(opt => {
        const searchContent = opt.searchContent || opt.label;
        return searchMatch(searchContent, query);
      });
    }
    
    // Sort alphabetically by label (which is ActividadID)
    return filtered.sort((a, b) => {
      if (a.value === '__none__') return -1;
      if (b.value === '__none__') return 1;
      return a.label.localeCompare(b.label);
    });
  }, [options, searchQuery]);

  if (disabled) {
    return (
      <span className={cn('cursor-default', className)}>
        {displayValue ?? String(value ?? '-')}
      </span>
    );
  }

  // Wrapper for all edit states with consistent positioning
  const EditWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="inline-block relative min-w-[60px]">
      {children}
    </div>
  );

  // Show saving indicator when save is in progress
  if (isSaving) {
    return (
      <EditWrapper>
        <span
          className={cn(
            'px-1.5 py-0.5 -mx-1 rounded-md inline-flex items-center gap-1.5',
            'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
            'border border-amber-200 dark:border-amber-800',
            'text-xs font-medium',
            className
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Guardando...</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCancel();
            }}
            className="ml-0.5 p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
            title="Cancelar"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      </EditWrapper>
    );
  }

  // Show error state with retry/cancel options
  if (saveError && !isEditing) {
    return (
      <EditWrapper>
        <span
          className={cn(
            'px-1.5 py-0.5 -mx-1 rounded-md inline-flex items-center gap-1.5',
            'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
            'border border-red-200 dark:border-red-800',
            'text-xs font-medium',
            className
          )}
        >
          <span>Error</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSaveError(false);
              setIsEditing(true);
            }}
            className="ml-0.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 transition-colors text-xs"
            title="Reintentar"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCancel();
            }}
            className="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            title="Descartar cambios"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      </EditWrapper>
    );
  }

  if (!isEditing) {
    return (
      <EditWrapper>
        <span
          className={cn(
            'cursor-pointer hover:bg-primary/10 px-1.5 py-0.5 -mx-1 rounded-md inline-flex items-center gap-1',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:bg-primary/10',
            'border border-transparent hover:border-primary/30',
            'transition-all duration-200 ease-out',
            'animate-fade-in',
            'select-none',
            className
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setIsEditing(true);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setIsEditing(true);
            }
          }}
          tabIndex={tabIndex ?? 0}
          role="button"
          title="Clic para editar (Tab para navegar)"
        >
          {displayValue ?? String(value ?? '-')}
          {showSuccess && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 animate-scale-in" />
          )}
        </span>
      </EditWrapper>
    );
  }

  if (type === 'searchable-select' && options) {
    const handleSelect = async (selectedValue: string) => {
      const scrollPosition = window.scrollY;
      setEditValue(selectedValue);
      const finalValue = selectedValue === '__none__' ? null : selectedValue;

      if (finalValue === value) {
        setIsEditing(false);
        return;
      }

      setIsSaving(true);
      incrementSaveCount();
      try {
        await onSave(finalValue);
        triggerSuccess();
        setIsEditing(false);
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollPosition, behavior: 'instant' });
        });
      } catch (error) {
        console.error('ResourceInlineEdit select save failed:', error);
        toast.error('No se pudo guardar el valor');
        setSaveError(true);
        // Keep editing open
      } finally {
        decrementSaveCount();
        setIsSaving(false);
      }
    };

    return (
      <EditWrapper>
        <div className="animate-scale-in">
          <Popover open={true} onOpenChange={(open) => !open && setIsEditing(false)}>
            <PopoverTrigger asChild>
              <span className="sr-only">Seleccionar actividad</span>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 animate-scale-in" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Buscar actividad..." 
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList className="max-h-[200px]">
                  <CommandEmpty>No se encontraron actividades.</CommandEmpty>
                  <CommandGroup>
                    {filteredOptions.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => handleSelect(opt.value)}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 transition-opacity duration-150",
                            String(editValue) === opt.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </EditWrapper>
    );
  }

  if (type === 'select' && options) {
    return (
      <EditWrapper>
        <div className="animate-scale-in">
          <Select
            value={String(editValue || '__none__')}
            onValueChange={async (v) => {
              const scrollPosition = window.scrollY;
              setEditValue(v);
              const finalValue = v === '__none__' ? null : v;

              if (finalValue === value) {
                setIsEditing(false);
                return;
              }

              setIsSaving(true);
              incrementSaveCount();
              try {
                await onSave(finalValue);
                triggerSuccess();
                setIsEditing(false);
                requestAnimationFrame(() => {
                  window.scrollTo({ top: scrollPosition, behavior: 'instant' });
                });
              } catch (error) {
                console.error('ResourceInlineEdit select save failed:', error);
                toast.error('No se pudo guardar el valor');
                setSaveError(true);
              } finally {
                decrementSaveCount();
                setIsSaving(false);
              }
            }}
            open={true}
            onOpenChange={(open) => !open && setIsEditing(false)}
          >
            <SelectTrigger className="h-7 w-full text-xs ring-2 ring-primary ring-offset-1 bg-primary/5 transition-all duration-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="animate-scale-in">
              <SelectItem value="__none__">-</SelectItem>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EditWrapper>
    );
  }

  if (type === 'number' || type === 'percent') {
    // IMPORTANT: while editing, the input must be controlled by local state (editValue)
    // otherwise it will "snap back" to the prop value on each render.
    const numericValue =
      editValue === '' || editValue === undefined
        ? (allowNull ? null : 0)
        : editValue === null
          ? null
          : typeof editValue === 'number'
            ? editValue
            : parseEuropeanNumber(String(editValue));

    // Handle blur: just cancel editing, don't save automatically
    // User must press Enter or Tab to save
    const handleNumericBlur = () => {
      // Cancel editing and restore original value
      setEditValue(value ?? '');
      setIsEditing(false);
    };

    return (
      <EditWrapper>
        <div
          className="animate-scale-in"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <NumericInput
            ref={inputRef}
            value={numericValue}
            onChange={(v) => setEditValue(v as number | null)}
            decimals={decimals}
            allowNull={allowNull}
            className="h-7 w-24 text-xs ring-2 ring-primary ring-offset-1 bg-primary/5 transition-all duration-200"
            onBlur={handleNumericBlur}
            onKeyDown={handleKeyDown}
          />
        </div>
      </EditWrapper>
    );
  }

  return (
    <EditWrapper>
      <div className="animate-scale-in">
        <Input
          ref={inputRef}
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 text-xs ring-2 ring-primary ring-offset-1 bg-primary/5 transition-all duration-200"
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
      </div>
    </EditWrapper>
  );
}
