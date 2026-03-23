import * as React from "react";

type BadgeVariant = "default" | "secondary" | "destructive" | "success";
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-semibold ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
