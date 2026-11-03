import { describe, expect, it } from "vitest";

import { calculateMaterialUnitPrice, crossSectionAreaMm2 } from "./material-price";

describe("crossSectionAreaMm2", () => {
  it("computes a round bar's area from its diameter", () => {
    expect(crossSectionAreaMm2("ROUND_BAR", { diameterMm: 10 })).toBeCloseTo(78.5398, 3);
  });

  it("computes a rectangular bar's area from width × height", () => {
    expect(crossSectionAreaMm2("RECT_BAR", { widthMm: 10, heightMm: 5 })).toBe(50);
  });

  it("returns null when required dimensions are missing or non-positive", () => {
    expect(crossSectionAreaMm2("ROUND_BAR", { diameterMm: 0 })).toBeNull();
    expect(crossSectionAreaMm2("ROUND_BAR", {})).toBeNull();
    expect(crossSectionAreaMm2("RECT_BAR", { widthMm: 10 })).toBeNull();
  });
});

describe("calculateMaterialUnitPrice", () => {
  const alu = { density: 2.7, pricePerKg: 4.5 };

  it("prices an aluminium round bar per mm and per metre", () => {
    const perMm = calculateMaterialUnitPrice({ profile: "ROUND_BAR", diameterMm: 10, baseUnit: "MM", ...alu });
    const perM = calculateMaterialUnitPrice({ profile: "ROUND_BAR", diameterMm: 10, baseUnit: "M", ...alu });
    expect(perMm).toBeCloseTo(0.000954, 6);
    expect(perM).toBeCloseTo(0.954, 3);
  });

  it("prices a steel rectangular bar per metre", () => {
    // area 50 mm² × 1000 mm × 7.85 × 1.5 / 1e6 = 0.5889 €/m
    const perM = calculateMaterialUnitPrice({
      profile: "RECT_BAR",
      widthMm: 10,
      heightMm: 5,
      baseUnit: "M",
      density: 7.85,
      pricePerKg: 1.5,
    });
    expect(perM).toBeCloseTo(0.588_75, 4);
  });

  it("returns null for non-length base units or missing dimensions", () => {
    expect(
      calculateMaterialUnitPrice({ profile: "ROUND_BAR", diameterMm: 10, baseUnit: "PCS", ...alu }),
    ).toBeNull();
    expect(
      calculateMaterialUnitPrice({ profile: "RECT_BAR", widthMm: 10, baseUnit: "M", ...alu }),
    ).toBeNull();
  });
});
