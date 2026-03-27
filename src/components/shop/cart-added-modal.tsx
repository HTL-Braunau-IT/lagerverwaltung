"use client";

import { Button } from "~/components/ui/button";

type CartAddedModalProps = {
  open: boolean;
  onContinueShopping: () => void;
  onGoToCart: () => void;
  itemName?: string | null;
  itemQuantity?: number | null;
  message?: string;
  continueLabel?: string;
  goToCartLabel?: string;
};

export function CartAddedModal({
  open,
  onContinueShopping,
  onGoToCart,
  itemName = null,
  itemQuantity = null,
  message = "Wurde in den Warenkorb gelegt.",
  continueLabel = "Weiter einkaufen",
  goToCartLabel = "Zum Warenkorb",
}: CartAddedModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        {itemName ? (
          <p className="mt-1 flex items-start justify-center gap-2 text-center text-sm font-medium text-foreground">
            {itemQuantity !== null ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{itemQuantity}x</span>
            ) : null}
            <span>{itemName}</span>
          </p>
        ) : null}
        <p className="mt-1 text-center text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={onContinueShopping} variant="outline" className="flex-1 rounded-xl">
            {continueLabel}
          </Button>
          <Button onClick={onGoToCart} className="flex-1 rounded-xl">
            {goToCartLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
