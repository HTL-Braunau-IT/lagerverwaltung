export type MaterialProfile = "ROUND_BAR" | "RECT_BAR";

/** Cross-section area in mm² for a length-sold profile, or null if dimensions are missing/invalid. */
export function crossSectionAreaMm2(
  profile: MaterialProfile,
  dims: { diameterMm?: number | null; widthMm?: number | null; heightMm?: number | null },
): number | null {
  if (profile === "ROUND_BAR") {
    const d = dims.diameterMm;
    if (!d || d <= 0) return null;
    return (Math.PI * d * d) / 4;
  }
  // RECT_BAR
  const w = dims.widthMm;
  const h = dims.heightMm;
  if (!w || w <= 0 || !h || h <= 0) return null;
  return w * h;
}

/** Length of one base unit in millimetres, for length-sold products (null = not length-based). */
export function baseUnitLengthMm(baseUnit: string): number | null {
  if (baseUnit === "MM") return 1;
  if (baseUnit === "CM") return 10;
  if (baseUnit === "M") return 1000;
  return null;
}

/**
 * Suggested price per base unit for a length-sold material product:
 *   price = area(mm²) × lengthPerUnit(mm) × density(g/cm³) × pricePerKg / 1_000_000
 * (1 cm³ = 1000 mm³ and 1 kg = 1000 g → a combined divisor of 1e6).
 * Returns null when the inputs don't describe a calculable length product.
 */
export function calculateMaterialUnitPrice(input: {
  profile: MaterialProfile;
  diameterMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  density: number;
  pricePerKg: number;
  baseUnit: string;
}): number | null {
  const area = crossSectionAreaMm2(input.profile, input);
  if (area === null) return null;
  const lengthMm = baseUnitLengthMm(input.baseUnit);
  if (lengthMm === null) return null;
  if (!(input.density > 0) || !(input.pricePerKg > 0)) return null;
  return (area * lengthMm * input.density * input.pricePerKg) / 1_000_000;
}
