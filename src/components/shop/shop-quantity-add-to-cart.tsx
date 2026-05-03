"use client";

import { Button, type ButtonVariant } from "~/components/ui/button";
import { CartIcon } from "~/components/layout/icon-renders";

export function ShopQuantityStepper({
  value,
  onChange,
  min,
  max,
  step,
  decreaseAriaLabel,
  increaseAriaLabel,
  inputAriaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max?: number;
  step: number;
  decreaseAriaLabel: string;
  increaseAriaLabel: string;
  inputAriaLabel: string;
}) {
  const incrementCap = max !== undefined && max > 0 ? max : Number.POSITIVE_INFINITY;
  const inputMax = max !== undefined && max > 0 ? max : undefined;

  return (
    <div className="flex h-8 min-w-0 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <Button
        type="button"
        onClick={() => {
          const currentQuantity = Math.max(Number(value) || min, min);
          const nextQuantity = Math.max(min, currentQuantity - step);
          onChange(nextQuantity.toString());
        }}
        size="sm"
        variant="ghost"
        className="h-8 min-w-6 shrink-0 rounded-none border-r border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
        aria-label={decreaseAriaLabel}
      >
        <span className="block leading-none">-</span>
      </Button>
      <input
        type="number"
        min={min}
        max={inputMax}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-11 min-w-0 shrink border-none bg-transparent text-center text-sm font-medium tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={inputAriaLabel}
      />
      <Button
        type="button"
        onClick={() => {
          const currentQuantity = Math.max(Number(value) || min, min);
          const nextQuantity = Math.min(incrementCap, currentQuantity + step);
          onChange(nextQuantity.toString());
        }}
        size="sm"
        variant="ghost"
        className="h-8 min-w-6 shrink-0 rounded-none border-l border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
        aria-label={increaseAriaLabel}
      >
        <span className="block leading-none">+</span>
      </Button>
    </div>
  );
}

export function ShopAddToCartButton({
  onClick,
  disabled,
  pending,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-7 min-h-7 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm leading-none",
        className ?? "",
      ].join(" ")}
    >
      {pending ? "Wird hinzugefuegt..." : "In Warenkorb"}
    </Button>
  );
}

export function ShopExportPdfButton({
  onClick,
  disabled,
  pending,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  variant?: ButtonVariant;
}) {
  return (
    <Button
      type="button"
      variant="glass"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-8 min-h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm leading-none",
        className ?? "",
      ].join(" ")}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </span>
      {pending ? "Wird exportiert..." : "Als PDF exportieren"}
    </Button>
  );
}
