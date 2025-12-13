import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { cn } from '@/lib/utils';

interface InlineEditProps {
  value: string | number | null;
  onSave: (value: any) => Promise<void>;
  type: 'text' | 'number' | 'select' | 'percent';
  options?: { value: string; label: string }[];
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

  const handleSave = async () => {
    if (isSaving) return;
    
    let finalValue: any = editValue;
    
    if (type === 'number' || type === 'percent') {
      const num = typeof editValue === 'number' ? editValue : parseFloat(String(editValue).replace(',', '.'));
      finalValue = isNaN(num) ? null : num;
    }
    
    if (type === 'select' && editValue === '__none__') {
      finalValue = null;
    }

    if (finalValue !== value) {
      setIsSaving(true);
      try {
        await onSave(finalValue);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
  };

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
          'cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-colors',
          className
        )}
        onClick={() => setIsEditing(true)}
        title="Clic para editar"
      >
        {displayValue ?? String(value ?? '-')}
      </span>
    );
  }

  if (type === 'select' && options) {
    return (
      <Select
        value={String(editValue || '__none__')}
        onValueChange={(v) => {
          setEditValue(v);
          // Auto-save on select
          const finalValue = v === '__none__' ? null : v;
          if (finalValue !== value) {
            setIsSaving(true);
            onSave(finalValue).finally(() => {
              setIsSaving(false);
              setIsEditing(false);
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
