import * as React from "react";

type TableProps = React.TableHTMLAttributes<HTMLTableElement>;
type SectionProps = React.HTMLAttributes<HTMLTableSectionElement>;
type RowProps = React.HTMLAttributes<HTMLTableRowElement>;
type CellProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type DataCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function Table({ className = "", ...props }: TableProps) {
  return (
    <div className="w-full overflow-auto rounded-md">
      <table className={`w-full border-separate border-spacing-0 caption-bottom text-sm ${className}`.trim()} {...props} />
    </div>
  );
}

export function TableHeader({ className = "", ...props }: SectionProps) {
  return (
    <thead
      className={`bg-primary text-primary-foreground [&_th]:text-primary-foreground ${className}`.trim()}
      {...props}
    />
  );
}

export function TableBody({ className = "", ...props }: SectionProps) {
  return <tbody className={`[&_tr:last-child]:border-0 ${className}`.trim()} {...props} />;
}

export function TableRow({ className = "", ...props }: RowProps) {
  return (
    <tr
      className={`border-b border-border bg-card/40 backdrop-blur-sm cursor-pointer select-none transition-colors duration-60 delay-60 hover:delay-0 hover:bg-card/80 ${className}`.trim()}
      {...props}
    />
  );
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
  return <td className={`px-3 py-3 align-middle text-sm text-foreground ${className}`.trim()} {...props} />;
}

type TableExpandableRowProps = {
  open: boolean;
  colSpan: number;
  children: React.ReactNode;
  /**
   * Applied to the `<tr>` that contains the expandable content.
   */
  rowClassName?: string;
  /**
   * Applied to the `<td>` wrapper cell.
   */
  cellClassName?: string;
  /**
   * Applied to the `<td>` wrapper cell when closed.
   * Defaults to removing all padding so the row collapses to zero height.
   */
  collapsedCellClassName?: string;
  /**
   * Applied to the animated outer `<div>`.
   */
  containerClassName?: string;
  /**
   * Applied to the inner `<div>` that actually holds content (measured for height).
   */
  contentClassName?: string;
};

export function TableExpandableRow({
  open,
  colSpan,
  children,
  rowClassName = "",
  cellClassName = "",
  collapsedCellClassName = "p-0",
  containerClassName = "",
  contentClassName = "",
}: TableExpandableRowProps) {
  const baseContentClassName = "w-full rounded-md border-0 p-2";
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = React.useState<string>("0px");

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (!open) {
      setMaxHeight("0px");
      return;
    }

    const update = () => {
      // `scrollHeight` covers padding but not margins (fine for our use).
      // Add a small buffer to avoid rare 1-2px clipping with borders/subpixel rounding.
      setMaxHeight(`${el.scrollHeight + 8}px`);
    };

    update();

    // Keep height in sync for async content (images, fonts, data).
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }

    // Fallback: do a second measure next frame.
    const raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [open, children]);

  return (
    <tr className={rowClassName}>
      <td
        colSpan={colSpan}
        className={`${open ? cellClassName : collapsedCellClassName} align-top`.trim()}
      >
        <div
          aria-hidden={!open}
          style={{ maxHeight }}
          className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
            open ? "opacity-100" : "opacity-0"
          } ${containerClassName}`.trim()}
        >
          <div ref={contentRef} className={`${baseContentClassName} ${contentClassName}`.trim()}>
            {children}
          </div>
        </div>
      </td>
    </tr>
  );
}
