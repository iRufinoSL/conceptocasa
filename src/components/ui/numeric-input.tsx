import * as React from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | string | null;
  onChange: (value: number | null) => void;
  decimals?: number;
  allowNull?: boolean;
}

/**
 * Parse a string value that may use European format (comma as decimal separator)
 * or standard format (period as decimal separator) into a number.
 * Returns NaN if the value cannot be parsed.
 */
export const parseEuropeanNumber = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  
  // Remove spaces
  const cleanValue = value.trim().replace(/\s/g, '');
  
  let result: number;
  
  // If the value has both . and , we need to determine which is the decimal separator
  if (cleanValue.includes(',') && cleanValue.includes('.')) {
    const lastComma = cleanValue.lastIndexOf(',');
    const lastDot = cleanValue.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // European format: 1.234,56 -> 1234.56
      result = parseFloat(cleanValue.replace(/\./g, '').replace(',', '.'));
    } else {
      // Standard format: 1,234.56 -> 1234.56
      result = parseFloat(cleanValue.replace(/,/g, ''));
    }
  } else if (cleanValue.includes(',')) {
    // Only comma - treat as European decimal separator
    // First remove any dots (thousands separators), then convert comma to dot
    result = parseFloat(cleanValue.replace(/\./g, '').replace(',', '.'));
  } else if (cleanValue.includes('.')) {
    // Only dots - need to determine if they are thousands separators or decimal
    const parts = cleanValue.split('.');
    
    // If multiple dots, they're thousands separators: 12.000 or 12.000.000
    if (parts.length > 2) {
      result = parseFloat(cleanValue.replace(/\./g, ''));
    } else {
      // Single dot: check if it looks like a thousands separator
      // In European format, 12.000 means 12000, but 12.50 means 12.50
      // If the part after the dot has exactly 3 digits AND the integer part is >= 1, 
      // it's likely a thousands separator
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3 && parseInt(parts[0]) >= 1) {
        // Likely European thousands separator: 12.000 -> 12000, 1.234 -> 1234
        result = parseFloat(cleanValue.replace(/\./g, ''));
      } else {
        // Otherwise treat as decimal separator: 12.5 -> 12.5, 0.50 -> 0.5
        result = parseFloat(cleanValue);
      }
    }
  } else {
    // No separators - just a plain number (12000, 5, etc.)
    result = parseFloat(cleanValue);
  }
  
  // Return 0 only for NaN, preserve actual 0 values
  return isNaN(result) ? 0 : result;
};

/**
 * Format a number with European thousands separators (dots) and decimal comma
 * while the user is typing
 */
const formatWithThousands = (value: string, decimals: number): string => {
  if (!value || value === '-') return value;
  
  // Handle negative numbers
  const isNegative = value.startsWith('-');
  const prefix = isNegative ? '-' : '';
  let cleanValue = isNegative ? value.slice(1) : value;
  
  // Check if user is typing a decimal (comma or period that acts as decimal)
  const hasComma = cleanValue.includes(',');
  const endsWithPeriod = cleanValue.endsWith('.');
  
  // Remove any existing thousands separators (dots) when there's a comma (European decimal)
  if (hasComma) {
    // European format in progress: periods before comma are thousands separators
    cleanValue = cleanValue.replace(/\./g, '');
  } else if (endsWithPeriod) {
    // User just typed a period - convert to comma for European format
    cleanValue = cleanValue.slice(0, -1) + ',';
  } else {
    // No comma yet - remove all dots (they would be thousands separators from previous formatting)
    cleanValue = cleanValue.replace(/\./g, '');
  }
  
  // Split by comma to get integer and decimal parts
  const parts = cleanValue.split(',');
  const integerPart = parts[0].replace(/\D/g, ''); // Keep only digits
  const decimalPart = parts.length > 1 ? parts[1].replace(/\D/g, '') : null;
  
  if (!integerPart && !decimalPart) return prefix;
  
  // Format integer part with thousands separators (dots)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') || '0';
  
  // If there's a decimal part
  if (decimalPart !== null) {
    // Keep the decimal part as typed (up to max decimals)
    const truncatedDecimal = decimalPart.slice(0, decimals);
    return `${prefix}${formattedInteger},${truncatedDecimal}`;
  }
  
  // If cleanValue ends with comma (user just typed comma/period)
  if (cleanValue.endsWith(',')) {
    return `${prefix}${formattedInteger},`;
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
  ({ className, value, onChange, decimals = 2, allowNull = false, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>('');
    const [isFocused, setIsFocused] = React.useState(false);
    
    // Initialize display value from prop
    React.useEffect(() => {
      if (!isFocused) {
        if (value === null || value === undefined) {
          setDisplayValue(allowNull ? '' : formatForDisplay(0, decimals));
        } else if (typeof value === 'number') {
          setDisplayValue(formatForDisplay(value, decimals));
        } else if (typeof value === 'string') {
          if (value === '' && allowNull) {
            setDisplayValue('');
          } else {
            const numValue = parseEuropeanNumber(value);
            setDisplayValue(formatForDisplay(numValue, decimals));
          }
        }
      }
    }, [value, decimals, isFocused, allowNull]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow empty input
      if (inputValue === '' || inputValue.trim() === '') {
        setDisplayValue('');
        onChange(allowNull ? null : 0);
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
      if (displayValue === '' || displayValue.trim() === '') {
        if (allowNull) {
          setDisplayValue('');
          onChange(null);
        } else {
          setDisplayValue(formatForDisplay(0, decimals));
        }
      } else {
        const numericValue = parseEuropeanNumber(displayValue);
        setDisplayValue(formatForDisplay(numericValue, decimals));
      }
      
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
