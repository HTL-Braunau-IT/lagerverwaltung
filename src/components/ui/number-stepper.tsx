"use client";

import { useCallback, useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

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

  return (
    <div
      className={`flex h-9 min-w-0 shrink-0 overflow-hidden rounded-sm border border-primary/10 bg-card/30 ${className}`.trim()}
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
          const current = Math.max(Number(value) || min, min);
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
      <Input
        type="number"
        min={min}
        max={inputMax}
        step={step}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
        }}
        onChange={(event) => onChange(event.target.value)}
        className="!w-11 !h-full min-w-0 shrink !rounded-none !bg-transparent text-center text-sm font-medium tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={inputAriaLabel}
      />
      <Button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          const current = Math.max(Number(value) || min, min);
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

