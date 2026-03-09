/**
 * Construction Visual Patterns Catalog
 * SVG pattern definitions for wall layers and sections
 */

export interface VisualPattern {
  id: string;
  label: string;
  category: 'estructura' | 'aislamiento' | 'revestimiento' | 'suelo' | 'cubierta' | 'varios' | 'color';
  /** SVG pattern element content (inside <pattern>) */
  svgContent: string;
  /** Pattern unit size */
  width: number;
  height: number;
  /** Background fill color */
  bgColor: string;
  /** Stroke/line color */
  fgColor: string;
}

export const VISUAL_PATTERNS: VisualPattern[] = [
  // ── Estructura ──
  {
    id: 'bloques',
    label: 'Bloques',
    category: 'estructura',
    width: 20, height: 10,
    bgColor: '#e8dcc8',
    fgColor: '#8b7355',
    svgContent: `<rect width="20" height="10" fill="#e8dcc8"/><rect x="0" y="0" width="9.5" height="4.5" fill="none" stroke="#8b7355" stroke-width="0.5"/><rect x="10.5" y="0" width="9.5" height="4.5" fill="none" stroke="#8b7355" stroke-width="0.5"/><rect x="5" y="5.5" width="9.5" height="4.5" fill="none" stroke="#8b7355" stroke-width="0.5"/><rect x="15.5" y="5.5" width="4.5" height="4.5" fill="none" stroke="#8b7355" stroke-width="0.5"/><rect x="0" y="5.5" width="4.5" height="4.5" fill="none" stroke="#8b7355" stroke-width="0.5"/>`,
  },
  {
    id: 'ladrillo',
    label: 'Ladrillo',
    category: 'estructura',
    width: 16, height: 8,
    bgColor: '#c4736e',
    fgColor: '#8b4040',
    svgContent: `<rect width="16" height="8" fill="#c4736e"/><rect x="0" y="0" width="7.5" height="3.5" fill="none" stroke="#8b4040" stroke-width="0.4"/><rect x="8.5" y="0" width="7.5" height="3.5" fill="none" stroke="#8b4040" stroke-width="0.4"/><rect x="4" y="4.5" width="7.5" height="3.5" fill="none" stroke="#8b4040" stroke-width="0.4"/><rect x="12.5" y="4.5" width="3.5" height="3.5" fill="none" stroke="#8b4040" stroke-width="0.4"/><rect x="0" y="4.5" width="3.5" height="3.5" fill="none" stroke="#8b4040" stroke-width="0.4"/>`,
  },
  {
    id: 'hormigon',
    label: 'Hormigón',
    category: 'estructura',
    width: 12, height: 12,
    bgColor: '#b8b8b8',
    fgColor: '#888888',
    svgContent: `<rect width="12" height="12" fill="#b8b8b8"/><circle cx="3" cy="3" r="0.8" fill="#888888"/><circle cx="9" cy="7" r="0.6" fill="#888888"/><circle cx="6" cy="10" r="0.7" fill="#888888"/><circle cx="1" cy="8" r="0.5" fill="#888888"/><circle cx="10" cy="2" r="0.5" fill="#888888"/>`,
  },
  {
    id: 'hormigon_armado',
    label: 'Hormigón armado',
    category: 'estructura',
    width: 14, height: 14,
    bgColor: '#a0a0a0',
    fgColor: '#555555',
    svgContent: `<rect width="14" height="14" fill="#a0a0a0"/><circle cx="3" cy="4" r="0.7" fill="#555"/><circle cx="10" cy="8" r="0.6" fill="#555"/><circle cx="7" cy="12" r="0.5" fill="#555"/><line x1="0" y1="7" x2="14" y2="7" stroke="#555" stroke-width="0.6" stroke-dasharray="2 2"/><line x1="7" y1="0" x2="7" y2="14" stroke="#555" stroke-width="0.6" stroke-dasharray="2 2"/>`,
  },
  {
    id: 'madera',
    label: 'Madera',
    category: 'estructura',
    width: 16, height: 8,
    bgColor: '#d4a76a',
    fgColor: '#8b6914',
    svgContent: `<rect width="16" height="8" fill="#d4a76a"/><line x1="0" y1="2" x2="16" y2="2" stroke="#8b6914" stroke-width="0.3"/><line x1="0" y1="5" x2="16" y2="5.5" stroke="#8b6914" stroke-width="0.3"/><line x1="0" y1="7" x2="16" y2="6.8" stroke="#8b6914" stroke-width="0.2"/><path d="M4 0 Q5 4 3 8" fill="none" stroke="#8b6914" stroke-width="0.2"/><path d="M12 0 Q11 3 13 8" fill="none" stroke="#8b6914" stroke-width="0.2"/>`,
  },
  {
    id: 'piedra',
    label: 'Piedra',
    category: 'estructura',
    width: 20, height: 16,
    bgColor: '#c8bfa0',
    fgColor: '#7a7060',
    svgContent: `<rect width="20" height="16" fill="#c8bfa0"/><path d="M0 5 L7 4 L8 0" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M8 0 L12 5 L20 6" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M0 5 L3 10 L8 9 L12 5" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M12 5 L15 10 L20 9" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M3 10 L0 16" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M3 10 L6 16" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M8 9 L10 16" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M15 10 L14 16" fill="none" stroke="#7a7060" stroke-width="0.5"/><path d="M15 10 L20 14" fill="none" stroke="#7a7060" stroke-width="0.5"/>`,
  },
  // ── Aislamiento ──
  {
    id: 'aislante',
    label: 'Aislante térmico',
    category: 'aislamiento',
    width: 12, height: 12,
    bgColor: '#fff3c4',
    fgColor: '#ccaa00',
    svgContent: `<rect width="12" height="12" fill="#fff3c4"/><path d="M0 6 Q3 0 6 6 Q9 12 12 6" fill="none" stroke="#ccaa00" stroke-width="0.5"/><path d="M0 0 Q3 6 6 0 Q9 -6 12 0" fill="none" stroke="#ccaa00" stroke-width="0.3" transform="translate(0,3)"/>`,
  },
  {
    id: 'lana_mineral',
    label: 'Lana mineral',
    category: 'aislamiento',
    width: 10, height: 10,
    bgColor: '#e8e0d0',
    fgColor: '#aa9970',
    svgContent: `<rect width="10" height="10" fill="#e8e0d0"/><line x1="0" y1="2" x2="10" y2="3" stroke="#aa9970" stroke-width="0.3"/><line x1="0" y1="5" x2="10" y2="4.5" stroke="#aa9970" stroke-width="0.3"/><line x1="0" y1="7.5" x2="10" y2="8" stroke="#aa9970" stroke-width="0.3"/><line x1="2" y1="0" x2="3" y2="10" stroke="#aa9970" stroke-width="0.2"/><line x1="7" y1="0" x2="6" y2="10" stroke="#aa9970" stroke-width="0.2"/>`,
  },
  {
    id: 'poliestireno',
    label: 'Poliestireno (EPS)',
    category: 'aislamiento',
    width: 8, height: 8,
    bgColor: '#e8f4ff',
    fgColor: '#88bbdd',
    svgContent: `<rect width="8" height="8" fill="#e8f4ff"/><circle cx="2" cy="2" r="1.2" fill="none" stroke="#88bbdd" stroke-width="0.3"/><circle cx="6" cy="6" r="1.2" fill="none" stroke="#88bbdd" stroke-width="0.3"/><circle cx="6" cy="2" r="0.8" fill="none" stroke="#88bbdd" stroke-width="0.2"/><circle cx="2" cy="6" r="0.8" fill="none" stroke="#88bbdd" stroke-width="0.2"/>`,
  },
  // ── Revestimiento ──
  {
    id: 'yeso',
    label: 'Yeso / Enlucido',
    category: 'revestimiento',
    width: 8, height: 8,
    bgColor: '#f5f0e8',
    fgColor: '#d0c8b8',
    svgContent: `<rect width="8" height="8" fill="#f5f0e8"/><circle cx="2" cy="3" r="0.3" fill="#d0c8b8"/><circle cx="5" cy="6" r="0.3" fill="#d0c8b8"/><circle cx="7" cy="1" r="0.2" fill="#d0c8b8"/>`,
  },
  {
    id: 'ceramica',
    label: 'Cerámica / Azulejo',
    category: 'revestimiento',
    width: 10, height: 10,
    bgColor: '#dce8f0',
    fgColor: '#8899aa',
    svgContent: `<rect width="10" height="10" fill="#dce8f0"/><rect x="0" y="0" width="4.5" height="4.5" fill="none" stroke="#8899aa" stroke-width="0.4"/><rect x="5.5" y="0" width="4.5" height="4.5" fill="none" stroke="#8899aa" stroke-width="0.4"/><rect x="0" y="5.5" width="4.5" height="4.5" fill="none" stroke="#8899aa" stroke-width="0.4"/><rect x="5.5" y="5.5" width="4.5" height="4.5" fill="none" stroke="#8899aa" stroke-width="0.4"/>`,
  },
  {
    id: 'vidrio',
    label: 'Vidrio',
    category: 'revestimiento',
    width: 10, height: 10,
    bgColor: '#d8eef8',
    fgColor: '#70a8cc',
    svgContent: `<rect width="10" height="10" fill="#d8eef8" opacity="0.7"/><line x1="0" y1="0" x2="10" y2="10" stroke="#70a8cc" stroke-width="0.3"/><line x1="5" y1="0" x2="10" y2="5" stroke="#70a8cc" stroke-width="0.2"/><line x1="0" y1="5" x2="5" y2="10" stroke="#70a8cc" stroke-width="0.2"/>`,
  },
  // ── Suelo ──
  {
    id: 'tierra',
    label: 'Tierra / Relleno',
    category: 'suelo',
    width: 10, height: 10,
    bgColor: '#c4a060',
    fgColor: '#8b6914',
    svgContent: `<rect width="10" height="10" fill="#c4a060"/><circle cx="2" cy="3" r="0.5" fill="#8b6914"/><circle cx="7" cy="7" r="0.6" fill="#8b6914"/><circle cx="5" cy="1" r="0.4" fill="#8b6914"/><circle cx="8" cy="3" r="0.3" fill="#8b6914"/><circle cx="1" cy="8" r="0.4" fill="#8b6914"/>`,
  },
  {
    id: 'grava',
    label: 'Grava',
    category: 'suelo',
    width: 12, height: 12,
    bgColor: '#c8c0b0',
    fgColor: '#706858',
    svgContent: `<rect width="12" height="12" fill="#c8c0b0"/><circle cx="3" cy="3" r="1.5" fill="none" stroke="#706858" stroke-width="0.4"/><circle cx="9" cy="4" r="1.8" fill="none" stroke="#706858" stroke-width="0.4"/><circle cx="5" cy="9" r="1.3" fill="none" stroke="#706858" stroke-width="0.4"/><circle cx="10" cy="10" r="1" fill="none" stroke="#706858" stroke-width="0.3"/>`,
  },
  // ── Cubierta ──
  {
    id: 'membrana',
    label: 'Membrana imperm.',
    category: 'cubierta',
    width: 12, height: 6,
    bgColor: '#2a2a2a',
    fgColor: '#555555',
    svgContent: `<rect width="12" height="6" fill="#2a2a2a"/><line x1="0" y1="3" x2="12" y2="3" stroke="#555" stroke-width="0.5"/><line x1="0" y1="1" x2="12" y2="1" stroke="#555" stroke-width="0.3" stroke-dasharray="1 1"/>`,
  },
  {
    id: 'teja',
    label: 'Teja',
    category: 'cubierta',
    width: 12, height: 8,
    bgColor: '#b86040',
    fgColor: '#804020',
    svgContent: `<rect width="12" height="8" fill="#b86040"/><path d="M0 4 Q3 0 6 4 Q9 8 12 4" fill="none" stroke="#804020" stroke-width="0.5"/><path d="M0 8 Q3 4 6 8" fill="none" stroke="#804020" stroke-width="0.4"/>`,
  },
  // ── Varios ──
  {
    id: 'metal',
    label: 'Metal / Acero',
    category: 'varios',
    width: 8, height: 8,
    bgColor: '#c0c8d0',
    fgColor: '#707880',
    svgContent: `<rect width="8" height="8" fill="#c0c8d0"/><line x1="0" y1="0" x2="8" y2="0" stroke="#707880" stroke-width="0.4"/><line x1="0" y1="2" x2="8" y2="2" stroke="#707880" stroke-width="0.3"/><line x1="0" y1="4" x2="8" y2="4" stroke="#707880" stroke-width="0.4"/><line x1="0" y1="6" x2="8" y2="6" stroke="#707880" stroke-width="0.3"/>`,
  },
  {
    id: 'aire',
    label: 'Aire / Cámara',
    category: 'varios',
    width: 10, height: 10,
    bgColor: '#ffffff',
    fgColor: '#cccccc',
    svgContent: `<rect width="10" height="10" fill="#fff"/><line x1="0" y1="5" x2="10" y2="5" stroke="#ccc" stroke-width="0.3" stroke-dasharray="2 2"/><line x1="5" y1="0" x2="5" y2="10" stroke="#ccc" stroke-width="0.3" stroke-dasharray="2 2"/>`,
  },
  {
    id: 'vacio',
    label: 'Vacío / Sin relleno',
    category: 'varios',
    width: 10, height: 10,
    bgColor: 'transparent',
    fgColor: 'transparent',
    svgContent: `<rect width="10" height="10" fill="none"/>`,
  },
  // ── Color (sólidos) ──
  {
    id: 'blanco',
    label: 'Blanco',
    category: 'color',
    width: 8, height: 8,
    bgColor: '#ffffff',
    fgColor: '#e0e0e0',
    svgContent: `<rect width="8" height="8" fill="#ffffff"/><rect width="8" height="8" fill="none" stroke="#e0e0e0" stroke-width="0.2"/>`,
  },
  {
    id: 'amarillo',
    label: 'Amarillo',
    category: 'color',
    width: 8, height: 8,
    bgColor: '#fff9c4',
    fgColor: '#f9a825',
    svgContent: `<rect width="8" height="8" fill="#fff9c4"/>`,
  },
  {
    id: 'azul_tenue',
    label: 'Azul tenue',
    category: 'color',
    width: 8, height: 8,
    bgColor: '#e3f2fd',
    fgColor: '#90caf9',
    svgContent: `<rect width="8" height="8" fill="#e3f2fd"/>`,
  },
];

export const PATTERN_CATEGORIES = [
  { id: 'estructura', label: 'Estructura' },
  { id: 'aislamiento', label: 'Aislamiento' },
  { id: 'revestimiento', label: 'Revestimiento' },
  { id: 'suelo', label: 'Suelo' },
  { id: 'cubierta', label: 'Cubierta' },
  { id: 'varios', label: 'Varios' },
] as const;

export function getPatternById(id: string | null | undefined): VisualPattern | undefined {
  if (!id) return undefined;
  return VISUAL_PATTERNS.find(p => p.id === id);
}

/**
 * Generates an inline SVG data URI for a pattern preview thumbnail
 */
export function patternPreviewSvg(pattern: VisualPattern, size = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${pattern.width * 2} ${pattern.height * 2}"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="${pattern.width}" height="${pattern.height}">${pattern.svgContent}</pattern></defs><rect width="${pattern.width * 2}" height="${pattern.height * 2}" fill="url(#p)"/></svg>`;
}

export function patternPreviewDataUri(pattern: VisualPattern, size = 24): string {
  return `data:image/svg+xml,${encodeURIComponent(patternPreviewSvg(pattern, size))}`;
}
