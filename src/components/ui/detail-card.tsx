import * as React from "react";

type DetailTextVariant = "title" | "kicker" | "value" | "subvalue" | "novalue" | "noteTitle" | "note";

const textVariantClasses: Record<DetailTextVariant, string> = {
  title: "text-lg font-semibold text-slate-900",
  kicker: "text-xs uppercase tracking-wide text-muted-foreground",
  subvalue: "mt-1 text-xs normal-case text-muted-foreground",
  novalue: "mt-1 text-xs normal-case italic text-muted-foreground",
  value: "mt-1 text-sm font-semibold text-foreground",
  noteTitle:"tracking-wide font-semibold text-accent-orange",
  note:"",
};

export type CardVariant = "detail" | "product" | "static" | "warning";

const cardVariantClasses: Record<CardVariant, string> = {
  detail:
    "rounded-md bg-card/40 p-3 transition-colors duration-200 ease-in-out hover:bg-card/60",
  product:
    "rounded-md bg-card/40 p-3 transition-colors duration-200 ease-in-out hover:bg-card/60",
  static:
    "rounded-md bg-card/40 p-3",
  warning:
    "p-3 rounded-md transition-colors duration-200 ease-in-out bg-accent-orange/20 border border-accent-orange/20",
};

export function Card({
  className = "",
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant: CardVariant }) {
  const variantClass = cardVariantClasses[variant];

  return <div className={`${variantClass} ${className} [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_40%,transparent)_transparent]`.trim() }  {...props} />;
}

export function DetailText({
  className = "",
  variant,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { variant: DetailTextVariant }) {
  const variantClass = textVariantClasses[variant];

  return <p className={`${variantClass} ${className}`.trim()} {...props} />;
}

