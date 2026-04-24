"use client";

import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { DetailText } from "~/components/ui/detail-card";

export function UnsavedChangesBar({
  open,
  title,
  onReset,
  onSave,
  saveDisabled,
  resetDisabled,
  saveLabel,
}: {
  open: boolean;
  title: string;
  onReset: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  resetDisabled?: boolean;
  saveLabel?: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
  }, [open, title]);

  if (!open) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 transition-all duration-200 ease-out ${
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
      aria-live="polite"
      role="status"
    >
      <div className="pointer-events-auto w-full max-w-3xl rounded-sm bg-card/90 backdrop-blur shadow-lg border-b-3 border-primary">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DetailText variant="kicker">Ungespeicherte Änderungen</DetailText>
            </div>
            <DetailText variant="value">{title}</DetailText>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0 [&>button]:w-28 [&>button]:shrink-0">
            <Button
              type="button"
              variant="glass"
              className="rounded-sm"
              onClick={onReset}
              disabled={resetDisabled}
            >
              Zurücksetzen
            </Button>
            <Button
              type="button"
              variant="solid"
              className="rounded-sm animate-pulse hover:animate-none"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {saveLabel ?? "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

