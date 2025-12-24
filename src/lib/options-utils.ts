/**
 * Options utility functions
 * Ensures Option A is always displayed first, and at minimum Option A is always shown
 */

export const DEFAULT_OPTIONS = ['A', 'B', 'C'] as const;
export type OptionType = 'A' | 'B' | 'C';

/**
 * Get available options, always prioritizing A first.
 * If no options are provided or the array is empty, returns ['A'].
 * @param opciones - Array of options or undefined
 * @returns Array of options with A always first, minimum ['A']
 */
export function getDisplayOptions(opciones?: string[] | null): string[] {
  if (!opciones || opciones.length === 0) {
    return ['A'];
  }
  
  // Sort to ensure A is always first, then B, then C
  const sorted = [...opciones].sort((a, b) => {
    const order = { 'A': 0, 'B': 1, 'C': 2 };
    return (order[a as OptionType] ?? 99) - (order[b as OptionType] ?? 99);
  });
  
  return sorted;
}

/**
 * Get all available options from a list of items (activities, spaces, etc.)
 * Returns unique options, always with A first, minimum ['A']
 */
export function getAllAvailableOptions(items: { opciones?: string[] | null }[]): string[] {
  if (!items || items.length === 0) {
    return ['A'];
  }
  
  const allOptions = new Set<string>();
  items.forEach(item => {
    const opts = item.opciones || ['A', 'B', 'C'];
    opts.forEach(opt => allOptions.add(opt));
  });
  
  if (allOptions.size === 0) {
    return ['A'];
  }
  
  // Sort to ensure A is always first
  return Array.from(allOptions).sort((a, b) => {
    const order = { 'A': 0, 'B': 1, 'C': 2 };
    return (order[a as OptionType] ?? 99) - (order[b as OptionType] ?? 99);
  });
}

/**
 * Ensures A is always included in the options array
 */
export function ensureOptionA(opciones: string[]): string[] {
  if (!opciones.includes('A')) {
    return ['A', ...opciones];
  }
  return getDisplayOptions(opciones);
}

/**
 * Colors for each option
 */
export const OPTION_COLORS: Record<string, { from: string; to: string; border: string; text: string; bg: string }> = {
  'A': { 
    from: 'from-amber-500/10', 
    to: 'to-orange-500/10', 
    border: 'border-amber-500/20', 
    text: 'text-amber-600',
    bg: 'bg-amber-500'
  },
  'B': { 
    from: 'from-emerald-500/10', 
    to: 'to-teal-500/10', 
    border: 'border-emerald-500/20', 
    text: 'text-emerald-600',
    bg: 'bg-emerald-500'
  },
  'C': { 
    from: 'from-violet-500/10', 
    to: 'to-purple-500/10', 
    border: 'border-violet-500/20', 
    text: 'text-violet-600',
    bg: 'bg-violet-500'
  },
};
