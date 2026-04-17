import * as React from "react";

type DetailTextVariant = "title" | "kicker" | "value" | "subvalue";

export function DetailCard({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-md bg-card/40 hover:bg-card/60 p-3 ${className}`.trim()}
      {...props}
    />
  );
}

export function DetailText({
  className = "",
  variant,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { variant: DetailTextVariant }) {
  const variantClass =
    variant === "title"
      ? "text-lg font-semibold text-slate-900"
      : variant === "kicker"
        ? "text-xs uppercase tracking-wide text-muted-foreground"
        : variant === "subvalue"
          ? "mt-1 text-xs normal-case text-muted-foreground"
          : "mt-1 text-sm font-semibold text-foreground";

  return <p className={`${variantClass} ${className}`.trim()} {...props} />;
}

