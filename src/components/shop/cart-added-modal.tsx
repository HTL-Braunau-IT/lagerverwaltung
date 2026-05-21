"use client";

import { CheckIcon } from "~/components/layout/icon-renders";
import { Button } from "~/components/ui/button";
import { DetailText } from "../ui/detail-card";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4"
      role="presentation"
      onClick={onContinueShopping}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-md bg-card/90 backdrop-blur-xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        {itemName ? (
          <div className="mt-1 flex items-start gap-3">
            {itemQuantity !== null ? (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs tabular-nums text-black">
                {itemQuantity}x
              </span>
            ) : null}
            <DetailText variant="value" className="mb-0.5 !mt-0 min-w-0 flex-1 text-center">
              {itemName}
            </DetailText>
            {itemQuantity !== null ? (
              <span
                className="shrink-0 rounded-md bg-primary/80 px-1.5 py-0.5 text-xs tabular-nums invisible text-white"
                aria-hidden
              >
                {itemQuantity}x
              </span>
            ) : null}
          </div>
        ) : null}
        <DetailText
          variant="subvalue"
          className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm !text-[color-mix(in_srgb,var(--success)_50%,var(--muted-foreground))]"
        >
          <CheckIcon size={14} className="shrink-0" />
          {message}
        </DetailText>
        <div className="mt-6 flex gap-2">
          <Button onClick={onContinueShopping} variant="quant" className="flex-1 text-primary !h-10">
            {continueLabel}
          </Button>
          <Button onClick={onGoToCart} variant="solid" className="flex-1 !h-10">
            {goToCartLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
