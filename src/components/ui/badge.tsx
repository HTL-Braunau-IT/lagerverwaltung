import * as React from "react";

type BadgeVariant = "default" | "secondary" | "destructive" | "success" | "orderFirst" | "orderSecond" | "orderThird" | "note";
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
  orderFirst:"bg-accent-orange text-white",
  orderSecond:"bg-primary/20 text-primary/80",
  orderThird:"bg-primary/80 text-white",
  note:"bg-card/40 text-accent-orange",
};

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
