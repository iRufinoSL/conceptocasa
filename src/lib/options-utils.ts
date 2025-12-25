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
 * Unified colors for each option - USE THESE EVERYWHERE
 * A = Blue, B = Amber, C = Emerald
 */
export const OPTION_COLORS: Record<string, { 
  from: string; 
  to: string; 
  border: string; 
  borderSolid: string;
  text: string; 
  textDark: string;
  bg: string;
  bgLight: string;
  bgLightDark: string;
  hover: string;
}> = {
  'A': { 
    from: 'from-blue-500/10', 
    to: 'to-blue-600/10', 
    border: 'border-blue-500/30', 
    borderSolid: 'border-blue-500',
    text: 'text-blue-600',
    textDark: 'dark:text-blue-400',
    bg: 'bg-blue-500',
    bgLight: 'bg-blue-500/10',
    bgLightDark: 'dark:bg-blue-500/20',
    hover: 'hover:bg-blue-600'
  },
  'B': { 
    from: 'from-amber-500/10', 
    to: 'to-amber-600/10', 
    border: 'border-amber-500/30', 
    borderSolid: 'border-amber-500',
    text: 'text-amber-600',
    textDark: 'dark:text-amber-400',
    bg: 'bg-amber-500',
    bgLight: 'bg-amber-500/10',
    bgLightDark: 'dark:bg-amber-500/20',
    hover: 'hover:bg-amber-600'
  },
  'C': { 
    from: 'from-emerald-500/10', 
    to: 'to-emerald-600/10', 
    border: 'border-emerald-500/30', 
    borderSolid: 'border-emerald-500',
    text: 'text-emerald-600',
    textDark: 'dark:text-emerald-400',
    bg: 'bg-emerald-500',
    bgLight: 'bg-emerald-500/10',
    bgLightDark: 'dark:bg-emerald-500/20',
    hover: 'hover:bg-emerald-600'
  },
};

/**
 * Helper to get option color classes for badges
 */
export function getOptionBadgeClasses(option: string, selected: boolean = true): string {
  const colors = OPTION_COLORS[option];
  if (!colors) return '';
  
  if (selected) {
    return `${colors.bg} ${colors.hover} text-white`;
  }
  return `${colors.borderSolid}/40 ${colors.text} hover:${colors.borderSolid} hover:${colors.text}`;
}

/**
 * Helper to get option card background classes
 */
export function getOptionCardClasses(option: string): string {
  const colors = OPTION_COLORS[option];
  if (!colors) return '';
  return `${colors.bgLight} ${colors.bgLightDark} ${colors.border}`;
}
