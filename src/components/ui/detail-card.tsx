import * as React from "react";

type DetailTextVariant = "title" | "kicker" | "value" | "subvalue" | "noteTitle" | "note";

const textVariantClasses: Record<DetailTextVariant, string> = {
  title: "text-lg font-semibold text-slate-900",
  kicker: "text-xs uppercase tracking-wide text-muted-foreground",
  subvalue: "mt-1 text-xs normal-case text-muted-foreground",
  value: "mt-1 text-sm font-semibold text-foreground",
  noteTitle:"uppercase tracking-wide font-semibold text-accent-orange",
  note:"",
};

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
  const variantClass = textVariantClasses[variant];

  return <p className={`${variantClass} ${className}`.trim()} {...props} />;
}

