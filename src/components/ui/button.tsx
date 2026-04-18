"use client";

import * as React from "react";

type ButtonVariant = "default" | "outline" | "secondary" | "destructive" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary/90 text-primary-foreground hover:opacity-90",
  outline: "border border-input bg-background text-foreground hover:bg-accent",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  ghost: "text-foreground hover:bg-accent",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-12 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-8 text-sm",
};

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
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    />
  );
}
