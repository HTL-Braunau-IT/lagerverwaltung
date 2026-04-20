"use client";

import * as React from "react";

type FilterPillButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  active?: boolean;
};

export function FilterPillButton({
  active = false,
  className = "",
  ...props
}: FilterPillButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card/40 backdrop-blur-sm text-foreground/80 hover:bg-card/60 hover:text-foreground transition-[background-color,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      } ${className}`.trim()}
      {...props}
    />
  );
}

