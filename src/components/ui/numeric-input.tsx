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
  
  // Remove thousands separators (dots) and convert decimal comma to period
  // First, determine the format by checking if there's a comma after a dot
  const cleanValue = value.trim();
  
  // If the value has both . and , we need to determine which is the decimal separator
  // European: 1.234,56 -> 1234.56
  // Standard: 1,234.56 -> 1234.56
  
  if (cleanValue.includes(',') && cleanValue.includes('.')) {
    // Check which comes last - that's likely the decimal separator
    const lastComma = cleanValue.lastIndexOf(',');
    const lastDot = cleanValue.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // European format: 1.234,56
      return parseFloat(cleanValue.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      // Standard format: 1,234.56
      return parseFloat(cleanValue.replace(/,/g, '')) || 0;
    }
  } else if (cleanValue.includes(',')) {
    // Only comma - could be European decimal or thousands
    // If there's exactly 3 digits after comma, it might be thousands separator
    const parts = cleanValue.split(',');
    if (parts.length === 2 && parts[1].length === 3 && !parts[1].includes('.')) {
      // Likely thousands separator: 1,234 -> 1234
      return parseFloat(cleanValue.replace(',', '')) || 0;
    }
    // Likely European decimal: 1,5 -> 1.5
    return parseFloat(cleanValue.replace(',', '.')) || 0;
  }
  
  // Standard format or just a number
  return parseFloat(cleanValue.replace(/,/g, '')) || 0;
};

/**
 * NumericInput component that accepts both European (comma) and standard (period) 
 * decimal separators. Displays the value as-is but parses correctly on change.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, decimals = 2, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>('');
    
    // Initialize display value from prop
    React.useEffect(() => {
      if (typeof value === 'number') {
        // Convert number to display string with comma as decimal separator
        const formatted = value.toFixed(decimals).replace('.', ',');
        // Only update if different to avoid cursor jumping
        if (parseEuropeanNumber(displayValue) !== value) {
          setDisplayValue(formatted);
        }
      } else if (typeof value === 'string') {
        setDisplayValue(value);
      }
    }, [value, decimals]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow empty input
      if (inputValue === '') {
        setDisplayValue('');
        onChange(0);
        return;
      }
      
      // Allow valid numeric input characters (digits, comma, period, minus)
      const validPattern = /^-?[\d.,]*$/;
      if (!validPattern.test(inputValue)) {
        return;
      }
      
      setDisplayValue(inputValue);
      const numericValue = parseEuropeanNumber(inputValue);
      onChange(numericValue);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // On blur, format the value properly
      const numericValue = parseEuropeanNumber(displayValue);
      const formatted = numericValue.toFixed(decimals).replace('.', ',');
      setDisplayValue(formatted);
      
      // Call original onBlur if provided
      if (props.onBlur) {
        props.onBlur(e);
      }
    };
    
    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);

NumericInput.displayName = "NumericInput";

export { NumericInput };
