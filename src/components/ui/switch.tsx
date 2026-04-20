"use client";

import * as React from "react";

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  className = "",
  disabled,
  id,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-card/40"
      } ${className}`.trim()}
      {...props}
    >
      <span
        aria-hidden
        className={`pointer-events-none block h-[1.125rem] w-[1.125rem] rounded-full bg-background shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
