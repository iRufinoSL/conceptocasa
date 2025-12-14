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
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | number>(value ?? '');
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
      const num = typeof editValue === 'number' ? editValue : parseFloat(String(editValue).replace(',', '.'));
      finalValue = isNaN(num) ? null : num;
    }
    
    if ((type === 'select' || type === 'searchable-select') && editValue === '__none__') {
      finalValue = null;
    }

    if (finalValue !== value) {
      setIsSaving(true);
      try {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
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

  if (!isEditing) {
    return (
      <span
        className={cn(
          'cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-colors inline-flex items-center gap-1',
          className
        )}
        onClick={() => setIsEditing(true)}
        title="Clic para editar"
      >
        {displayValue ?? String(value ?? '-')}
        {showSuccess && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 animate-fade-in" />
        )}
      </span>
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
      <Popover open={true} onOpenChange={(open) => !open && setIsEditing(false)}>
        <PopoverTrigger asChild>
          <span className="sr-only">Seleccionar actividad</span>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
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
                        "mr-2 h-4 w-4",
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
    );
  }

  if (type === 'select' && options) {
    return (
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
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === 'number' || type === 'percent') {
    return (
      <NumericInput
        ref={inputRef}
        value={typeof editValue === 'number' ? editValue : parseFloat(String(editValue).replace(',', '.')) || 0}
        onChange={(v) => setEditValue(v)}
        decimals={decimals}
        className="h-7 w-20 text-xs"
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      value={String(editValue)}
      onChange={(e) => setEditValue(e.target.value)}
      className="h-7 text-xs"
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
    />
  );
}
