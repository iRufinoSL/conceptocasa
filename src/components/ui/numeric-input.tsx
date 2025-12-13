import * as React from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | string;
  onChange: (value: number) => void;
  decimals?: number;
}

/**
 * Parse a string value that may use European format (comma as decimal separator)
 * or standard format (period as decimal separator) into a number.
 */
export const parseEuropeanNumber = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  
  // Remove thousands separators (dots in European format) and spaces
  const cleanValue = value.trim().replace(/\s/g, '');
  
  // If the value has both . and , we need to determine which is the decimal separator
  if (cleanValue.includes(',') && cleanValue.includes('.')) {
    const lastComma = cleanValue.lastIndexOf(',');
    const lastDot = cleanValue.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // European format: 1.234,56 -> 1234.56
      return parseFloat(cleanValue.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      // Standard format: 1,234.56 -> 1234.56
      return parseFloat(cleanValue.replace(/,/g, '')) || 0;
    }
  } else if (cleanValue.includes(',')) {
    // Only comma - treat as European decimal separator
    return parseFloat(cleanValue.replace(/\./g, '').replace(',', '.')) || 0;
  }
  
  // Standard format or just a number - remove any dots used as thousands
  return parseFloat(cleanValue) || 0;
};

/**
 * Format a number with European thousands separators (dots) and decimal comma
 */
const formatWithThousands = (value: string, decimals: number): string => {
  if (!value || value === '-') return value;
  
  // Check if we're in the middle of typing decimals
  const hasDecimalSeparator = value.includes(',') || value.includes('.');
  const endsWithSeparator = value.endsWith(',') || value.endsWith('.');
  
  // Parse to get the numeric value
  const numericValue = parseEuropeanNumber(value);
  
  if (isNaN(numericValue)) return value;
  
  // Split into integer and decimal parts
  const parts = value.replace('.', ',').split(',');
  const integerPart = parts[0].replace(/\D/g, '');
  const decimalPart = parts[1] || '';
  
  // Format integer part with thousands separators (dots)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Handle negative numbers
  const isNegative = value.startsWith('-');
  const prefix = isNegative ? '-' : '';
  
  if (hasDecimalSeparator) {
    // Keep the decimal part as typed (up to max decimals)
    const truncatedDecimal = decimalPart.slice(0, decimals);
    return `${prefix}${formattedInteger},${truncatedDecimal}`;
  }
  
  return `${prefix}${formattedInteger}`;
};

/**
 * Format a number for display (with thousands and decimals)
 */
const formatForDisplay = (value: number, decimals: number): string => {
  if (value === 0) return '0,00';
  
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  
  return formatted;
};

/**
 * NumericInput component that accepts both European (comma) and standard (period) 
 * decimal separators. Displays with automatic thousands separators.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, decimals = 2, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>('');
    const [isFocused, setIsFocused] = React.useState(false);
    
    // Initialize display value from prop
    React.useEffect(() => {
      if (!isFocused) {
        if (typeof value === 'number') {
          setDisplayValue(formatForDisplay(value, decimals));
        } else if (typeof value === 'string') {
          const numValue = parseEuropeanNumber(value);
          setDisplayValue(formatForDisplay(numValue, decimals));
        }
      }
    }, [value, decimals, isFocused]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow empty input
      if (inputValue === '') {
        setDisplayValue('');
        onChange(0);
        return;
      }
      
      // Allow valid numeric input characters (digits, comma, period, minus, dots for thousands)
      const validPattern = /^-?[\d.,\s]*$/;
      if (!validPattern.test(inputValue)) {
        return;
      }
      
      // Format with thousands separators while typing
      const formatted = formatWithThousands(inputValue, decimals);
      setDisplayValue(formatted);
      
      const numericValue = parseEuropeanNumber(inputValue);
      onChange(numericValue);
    };
    
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all text on focus for easy editing
      setTimeout(() => {
        e.target.select();
      }, 0);
      
      if (props.onFocus) {
        props.onFocus(e);
      }
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // On blur, format the value properly with all decimals
      const numericValue = parseEuropeanNumber(displayValue);
      setDisplayValue(formatForDisplay(numericValue, decimals));
      
      if (props.onBlur) {
        props.onBlur(e);
      }
    };
    
    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-right",
          className,
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);

NumericInput.displayName = "NumericInput";

export { NumericInput };
