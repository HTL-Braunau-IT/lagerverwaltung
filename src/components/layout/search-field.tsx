import * as React from "react";

import { Input } from "~/components/ui/input";

export type SearchFieldProps = React.ComponentProps<typeof Input>;

/** Shared header search styling for shop, Ausleihe, and other searchable areas. */
export function SearchField({ className = "", ...props }: SearchFieldProps) {
  return <Input className={`h-10 ${className}`.trim()} {...props} />;
}
