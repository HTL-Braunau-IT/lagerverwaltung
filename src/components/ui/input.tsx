import * as React from "react";

export type InputVariant = "default" | "title" | "subtitle";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
};

const baseClassName =
  "flex h-10 w-full rounded-md bg-card/40 backdrop-blur px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const variantClasses: Record<InputVariant, string> = {
  default: "",
  title: "h-11 mt-1 w-full px-2.5 py-2 text-slate-900 !text-lg font-semibold text-foreground",
  subtitle: "h-11 mt-1 w-full px-2.5 py-2 !text-lg text-slate-900",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", variant = "default", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`${baseClassName} ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
});

const textareaBaseClassName =
  "box-border min-h-20 w-full bg-card/60 max-w-full resize-none rounded-md px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = "", ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={`${textareaBaseClassName} ${className}`.trim()}
      {...props}
    />
  );
});
