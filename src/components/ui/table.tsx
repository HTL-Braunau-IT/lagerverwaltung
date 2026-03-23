import * as React from "react";

type TableProps = React.TableHTMLAttributes<HTMLTableElement>;
type SectionProps = React.HTMLAttributes<HTMLTableSectionElement>;
type RowProps = React.HTMLAttributes<HTMLTableRowElement>;
type CellProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type DataCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function Table({ className = "", ...props }: TableProps) {
  return (
    <div className="w-full overflow-auto">
      <table className={`w-full caption-bottom text-sm ${className}`.trim()} {...props} />
    </div>
  );
}

export function TableHeader({ className = "", ...props }: SectionProps) {
  return <thead className={`[&_tr]:border-b ${className}`.trim()} {...props} />;
}

export function TableBody({ className = "", ...props }: SectionProps) {
  return <tbody className={`[&_tr:last-child]:border-0 ${className}`.trim()} {...props} />;
}

export function TableRow({ className = "", ...props }: RowProps) {
  return <tr className={`border-b border-border transition-colors hover:bg-muted/40 ${className}`.trim()} {...props} />;
}

export function TableHead({ className = "", ...props }: CellProps) {
  return (
    <th
      className={`h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className}`.trim()}
      {...props}
    />
  );
}

export function TableCell({ className = "", ...props }: DataCellProps) {
  return <td className={`px-3 py-3 align-middle text-sm ${className}`.trim()} {...props} />;
}
