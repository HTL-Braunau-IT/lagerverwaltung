"use client";

import * as React from "react";

export type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "destructive"
  | "destructiveTransparent"
  | "ghost"
  | "solid"
  | "glass"
  | "catInactive"
  | "notify"
  | "category-pill"
  | "new"
  | "quant";

type ButtonSize = "default" | "sm" | "lg";

type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const pillTableActionLayout =
  "w-full max-w-full border-0 font-semibold disabled:cursor-not-allowed disabled:!opacity-55";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary/90 text-primary-foreground hover:opacity-90",
  outline: "border border-input bg-background text-foreground hover:bg-accent",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  destructive: "w-full max-w-full bg-destructive/90 text-destructive-foreground hover:opacity-90",
  destructiveTransparent: "w-full max-w-full bg-transparent font-normal text-destructive transition hover:bg-destructive hover:text-white",
  ghost: "text-foreground hover:bg-accent",
  solid: `${pillTableActionLayout} bg-primary/90 text-primary-foreground transition-[opacity] hover:opacity-95`,
  glass: `${pillTableActionLayout} bg-card/60 text-primary backdrop-blur-sm transition-[background-color,color] duration-200 hover:bg-card/90 hover:text-primary`,
  catInactive: `${pillTableActionLayout} bg-transparent text-muted-foreground backdrop-blur-none transition-[color,background-color] duration-60 delay-60 hover:delay-0 hover:text-primary hover:bg-card/60`,
  notify: `${pillTableActionLayout} bg-accent-orange/80 text-white backdrop-blur-sm transition-[background-color,color] duration-200 hover:opacity-95`,
  "category-pill":
    "!h-auto !min-h-0 !rounded-full bg-card/40 px-3 py-1 text-sm font-medium text-slate-900 transition hover:bg-card/90 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
  new: `!h-9 inline-flex items-center !rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90`,
  quant: `hover:bg-card/20`
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-12 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-8 text-sm",
};

export function buttonClassName({
  variant = "default",
  size = "default",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return `inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
}

export function Button({
  className = "",
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) { 
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
