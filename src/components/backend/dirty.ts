export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortForStableJson(obj[key]);
  }
  return out;
}

export function isDirty<T>(
  current: T,
  baseline: T,
  normalize: (value: T) => unknown,
  extraDirty: boolean = false,
): boolean {
  if (extraDirty) return true;
  return stableStringify(normalize(current)) !== stableStringify(normalize(baseline));
}

