/**
 * European number formatting utilities
 * Format: thousands separator ".", decimal separator ",", 2 decimal places
 */

/**
 * Format a number in European format (e.g., 1.234,56)
 */
export const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined) return '-';
  
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format a currency value in European format (e.g., 1.234,56 €)
 */
export const formatCurrency = (value: number | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined) return '-';
  
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format a currency value without decimals (e.g., 1.234 €)
 */
export const formatCurrencyNoDecimals = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'Sin presupuesto';
  
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Format a percentage in European format (e.g., 25,50%)
 */
export const formatPercent = (value: number | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined) return '-';
  
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
};
