"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DetailText } from "./detail-card";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

export function Dialog({ open, onClose, title, description, headerRight, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl rounded-md bg-card p-5 text-card-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DetailText variant="title">
              {title}
            </DetailText>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
