export type PercentInput = number | null | undefined;

/**
 * Normaliza un porcentaje que puede venir como:
 * - ratio (0.15 => 15%)
 * - porcentaje (15 => 15%)
 * y lo devuelve SIEMPRE como ratio (0.15).
 */
export function percentToRatio(value: PercentInput, fallbackRatio: number): number {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallbackRatio;
  const n = Number(value);
  // Si viene como 15, 25, etc.
  if (n > 1) return n / 100;
  return n;
}

export function calcUnitSalesCost(
  externalUnitCost: number | null | undefined,
  safetyPercent: PercentInput,
  salesPercent: PercentInput,
  defaults: { safetyRatio: number; salesRatio: number } = { safetyRatio: 0.15, salesRatio: 0.25 }
): number {
  const base = Number(externalUnitCost) || 0;
  const safety = percentToRatio(safetyPercent, defaults.safetyRatio);
  const sales = percentToRatio(salesPercent, defaults.salesRatio);
  // Mismo modelo que ya usáis (margen de venta aplicado sobre coste + seguridad)
  return base * (1 + safety) * (1 + sales);
}

export function calcResourceSubtotal(
  params: {
    externalUnitCost: number | null | undefined;
    safetyPercent: PercentInput;
    salesPercent: PercentInput;
    manualUnits: number | null | undefined;
    relatedUnits: number | null | undefined;
  },
  defaults: { safetyRatio: number; salesRatio: number } = { safetyRatio: 0.15, salesRatio: 0.25 }
): number {
  const unitSalesCost = calcUnitSalesCost(
    params.externalUnitCost,
    params.safetyPercent,
    params.salesPercent,
    defaults
  );

  const units = params.manualUnits !== null && params.manualUnits !== undefined
    ? Number(params.manualUnits) || 0
    : Number(params.relatedUnits) || 0;

  return unitSalesCost * units;
}
