"use client";

import * as React from "react";
import { ChevronDownIcon } from "~/components/layout/icon-renders";

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Bitte wählen",
  disabled = false,
  className = "",
  onClick,
}: SelectProps) {
  const listboxId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  });

  const selectedOption = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  React.useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setActiveIndex(idx);
  }, [options, value]);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown, { capture: true });
    return () => document.removeEventListener("mousedown", handlePointerDown, { capture: true });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (options.length === 0) return;
    queueMicrotask(() => optionRefs.current[activeIndex]?.focus());
  }, [open, activeIndex, options.length]);

  function setAndClose(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function focusOption(idx: number) {
    const next = Math.max(0, Math.min(idx, options.length - 1));
    setActiveIndex(next);
    queueMicrotask(() => optionRefs.current[next]?.focus());
  }

  function openAndFocus(idx: number) {
    setOpen(true);
    queueMicrotask(() => focusOption(idx));
  }

  const triggerLabel = selectedOption?.label ?? placeholder;

  return (
    <div ref={rootRef} className="relative" onClick={onClick}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((v) => !v);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAndFocus(Math.min(activeIndex + 1, options.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus(Math.max(activeIndex - 1, 0));
            return;
          }
        }}
        className={cx(
          "mt-1 w-full rounded-md bg-card/40 px-2.5 py-2 text-sm text-slate-900",
          "inline-flex items-center justify-between gap-2",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:bg-slate-100",
          className
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", selectedOption ? "" : "text-slate-500")}>
          {triggerLabel}
        </span>
        <ChevronDownIcon open={open} className="h-4 w-4" />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
          className={cx(
            "absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-card",
            "max-h-64 overflow-y-auto"
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              queueMicrotask(() => triggerRef.current?.focus());
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusOption(Math.min(activeIndex + 1, options.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              focusOption(Math.max(activeIndex - 1, 0));
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              focusOption(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              focusOption(options.length - 1);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const opt = options[activeIndex];
              if (!opt || opt.disabled) return;
              setAndClose(opt.value);
            }
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value || `__empty_${idx}`}
                id={`${listboxId}-opt-${idx}`}
                ref={(node) => {
                  optionRefs.current[idx] = node;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={!!opt.disabled}
                onClick={(event) => {
                  event.preventDefault();
                  if (opt.disabled) return;
                  setAndClose(opt.value);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cx(
                  "w-full px-2.5 py-2 text-left text-sm",
                  "flex items-center justify-between gap-3",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected ? "bg-slate-100 text-slate-900" : "text-slate-800 hover:bg-slate-50"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {isSelected ? (
                  <span className="text-xs font-semibold text-slate-600">Ausgewählt</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

