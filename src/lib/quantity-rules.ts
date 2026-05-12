const INTEGER_STEP_BASE_UNITS = new Set(["PCS", "MM", "CM", "CM2", "DM2", "MM2"]);

export function getQuantityStepForBaseUnit(baseUnit: string): number {
  return INTEGER_STEP_BASE_UNITS.has(baseUnit) ? 1 : 0.001;
}

export function getQuantityDecimalsForStep(step: number): number {
  return step >= 1 ? 0 : 3;
}

export function isQuantityAlignedToStep(quantity: number, step: number): boolean {
  if (!Number.isFinite(quantity) || !Number.isFinite(step) || step <= 0) return false;
  const rounded = Math.round(quantity / step);
  return Math.abs(quantity - rounded * step) <= 1e-9;
}
