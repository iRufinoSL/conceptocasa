export type ActividadIdParts = {
  phaseCode?: string | null;
  activityCode?: string | null;
  name?: string | null;
};

/**
 * ActividadID format:
 * (Código fase (2 dígitos) + " " + Código actividad (alfanumérico) + ".-" + Nombre)
 * Examples:
 * - "01 A10.-Demoliciones"
 * - "A10.-Demoliciones" (if no phase)
 */
export function formatActividadId({ phaseCode, activityCode, name }: ActividadIdParts): string {
  const pc = (phaseCode || '').trim();
  const ac = (activityCode || '').trim();
  const n = (name || '').trim();

  const prefix = pc ? `${pc} ${ac}` : ac;
  if (!prefix && !n) return '';
  if (!n) return prefix;
  if (!prefix) return n;
  return `${prefix}.-${n}`;
}
