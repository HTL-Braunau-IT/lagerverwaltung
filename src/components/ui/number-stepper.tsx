"use client";

import { useCallback, useMemo } from "react";
import { Button } from "~/components/ui/button";

/**
 * Normalize decimal text for German input: accept a comma as the decimal separator and
 * keep only digits plus at most one dot. Typing "0,85" yields "0.85" instead of NaN,
 * which previously collapsed the value to the step minimum (#116).
 */
function sanitizeDecimalInput(raw: string): string {
  let seenDot = false;
  let out = "";
  for (const ch of raw.replace(/,/g, ".")) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot) {
      out += ".";
      seenDot = true;
    }
  }
  return out;
}

export function NumberStepper({
  value,
  onChange,
  min,
  step,
  max,
  decreaseAriaLabel,
  increaseAriaLabel,
  inputAriaLabel,
  stopPropagation = false,
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  step: number;
  max?: number;
  decreaseAriaLabel: string;
  increaseAriaLabel: string;
  inputAriaLabel: string;
  stopPropagation?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const decimals = useMemo(() => {
    const text = String(step);
    const fractional = text.split(".")[1];
    return fractional ? fractional.length : 0;
  }, [step]);

  const normalize = useCallback(
    (num: number) => {
      if (!Number.isFinite(num)) return min;
      const rounded = decimals > 0 ? Number(num.toFixed(decimals)) : Math.round(num);
      return Math.max(min, rounded);
    },
    [decimals, min],
  );

  const inputMax = max !== undefined && max > 0 ? max : undefined;
  const incrementCap = inputMax ?? Number.POSITIVE_INFINITY;
  const inputChars = Math.max((value.length > 0 ? value : String(min)).length, 2);

  return (
    <div
      className={`inline-flex h-9 shrink-0 self-start overflow-hidden rounded-sm bg-card/30 ${className}`.trim()}
      onClick={(event) => {
        if (!stopPropagation) return;
        event.stopPropagation();
      }}
    >
      <Button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          const current = Math.max(Number(sanitizeDecimalInput(value)) || min, min);
          const next = normalize(current - step);
          onChange(next.toString());
        }}
        size="sm"
        variant="quant"
        className="h-9 min-w-6 shrink-0 rounded-none px-1.5 leading-none text-sm text-muted-foreground bg-transparent hover:!bg-primary/10 hover:!text-accent-foreground"
        aria-label={decreaseAriaLabel}
      >
        <span className="block leading-none">-</span>
      </Button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        autoComplete="off"
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
        }}
        onChange={(event) => onChange(sanitizeDecimalInput(event.target.value))}
        style={{ width: `calc(${inputChars}ch + 0.5rem)` }}
        className="box-border h-full shrink-0 border-0 bg-transparent px-1 text-center text-sm font-medium tabular-nums text-foreground outline-none"
        aria-label={inputAriaLabel}
      />

      <Button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          const current = Math.max(Number(sanitizeDecimalInput(value)) || min, min);
          const next = Math.min(incrementCap, normalize(current + step));
          onChange(next.toString());
        }}
        size="sm"
        variant="quant"
        className="h-9 min-w-6 shrink-0 rounded-none px-1.5 leading-none text-sm text-muted-foreground bg-transparent hover:!bg-primary/10 hover:!text-accent-foreground"
        aria-label={increaseAriaLabel}
      >
        <span className="block leading-none">+</span>
      </Button>
    </div>
  );
}

