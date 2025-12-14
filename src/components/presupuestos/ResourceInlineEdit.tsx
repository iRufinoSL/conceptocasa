import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value ?? '');
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      setSearchQuery('');
    }
  }, [isEditing]);

  const triggerSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1200);
  };

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
        // Parse string to number
        const parsed = parseFloat(editValue.replace(',', '.').replace(/\./g, ''));
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

    if (shouldSave) {
      setIsSaving(true);
      try {
        console.log(`ResourceInlineEdit saving: ${finalValue} (type: ${typeof finalValue}, allowNull: ${allowNull})`);
        await onSave(finalValue);
        triggerSuccess();
        // Restore scroll position after save completes
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollPosition, behavior: 'instant' });
        });
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
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
    
    const query = searchQuery.toLowerCase().trim();
    let filtered = options;
    
    if (query) {
      filtered = options.filter(opt => {
        const searchContent = opt.searchContent || opt.label;
        return searchContent.toLowerCase().includes(query);
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
            className
          )}
          onClick={() => setIsEditing(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
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
    const handleSelect = (selectedValue: string) => {
      const scrollPosition = window.scrollY;
      setEditValue(selectedValue);
      const finalValue = selectedValue === '__none__' ? null : selectedValue;
      if (finalValue !== value) {
        setIsSaving(true);
        onSave(finalValue).finally(() => {
          setIsSaving(false);
          setIsEditing(false);
          triggerSuccess();
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollPosition, behavior: 'instant' });
          });
        });
      } else {
        setIsEditing(false);
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
            onValueChange={(v) => {
              const scrollPosition = window.scrollY;
              setEditValue(v);
              // Auto-save on select
              const finalValue = v === '__none__' ? null : v;
              if (finalValue !== value) {
                setIsSaving(true);
                onSave(finalValue).finally(() => {
                  setIsSaving(false);
                  setIsEditing(false);
                  triggerSuccess();
                  requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollPosition, behavior: 'instant' });
                  });
                });
              } else {
                setIsEditing(false);
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
    // Get the numeric value from props for initial display
    // When allowNull is true and value is null, pass null; otherwise parse as number
    const numericValue = (allowNull && value === null) ? null : (typeof value === 'number' ? value : (typeof value === 'string' && value !== '' ? parseFloat(value) : 0));
    
    return (
      <EditWrapper>
        <div className="animate-scale-in">
          <NumericInput
            ref={inputRef}
            value={numericValue}
            onChange={(v) => setEditValue(v as number | null)}
            decimals={decimals}
            allowNull={allowNull}
            className="h-7 w-24 text-xs ring-2 ring-primary ring-offset-1 bg-primary/5 transition-all duration-200"
            onBlur={handleSave}
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
