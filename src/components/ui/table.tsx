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
      className={`relative isolate z-0 bg-card/40 backdrop-blur-sm cursor-pointer select-none transition-colors duration-60 delay-60 hover:delay-0 hover:z-20 hover:bg-card/80 ${className}`.trim()}
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
  const baseContentClassName = "w-full overflow-hidden rounded-md border-0 pt-2 pb-1.5 px-2";
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const lastOpenChildrenRef = React.useRef<React.ReactNode>(null);
  const prevOpenForExitRef = React.useRef(open);
  const closeRafRef = React.useRef<{ outer?: number; inner?: number }>({});
  const [maxHeight, setMaxHeight] = React.useState<string>("0px");
  const [exitActive, setExitActive] = React.useState(false);

  if (open) {
    lastOpenChildrenRef.current = children;
  }

  const displayChildren = open ? children : exitActive ? lastOpenChildrenRef.current : null;
  const panelOpen = open || exitActive;

  React.useLayoutEffect(() => {
    const el = contentRef.current;

    if (open) {
      prevOpenForExitRef.current = true;
      if (exitActive) setExitActive(false);
      if (!el) return;

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

      const raf = requestAnimationFrame(update);
      return () => cancelAnimationFrame(raf);
    }

    // Closing edge: bump `exitActive` first so the next pass measures frozen children (parents
    // often pass `null` children when `open` is false, e.g. `{open && <Panel />}`).
    if (prevOpenForExitRef.current) {
      prevOpenForExitRef.current = false;
      setExitActive(true);
      return;
    }

    if (exitActive && el) {
      const pinned = `${el.scrollHeight + 8}px`;
      setMaxHeight(pinned);
      const { current: rafs } = closeRafRef;
      rafs.outer = requestAnimationFrame(() => {
        rafs.inner = requestAnimationFrame(() => setMaxHeight("0px"));
      });
      return () => {
        if (rafs.outer !== undefined) cancelAnimationFrame(rafs.outer);
        if (rafs.inner !== undefined) cancelAnimationFrame(rafs.inner);
        rafs.outer = undefined;
        rafs.inner = undefined;
      };
    }

    setMaxHeight("0px");
    // Do not depend on `children`: inline JSX makes a new element reference every parent render,
    // which would re-run this effect constantly and thrash layout + ResizeObserver.
  }, [open, exitActive]);

  const onCollapseTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "max-height") return;
    if (open) return;
    setExitActive(false);
  };

  return (
    <tr className={rowClassName}>
      <td
        colSpan={colSpan}
        className={`${panelOpen ? cellClassName : collapsedCellClassName} align-top`.trim()}
      >
        <div
          aria-hidden={!panelOpen}
          style={{ maxHeight }}
          onTransitionEnd={onCollapseTransitionEnd}
          className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out ${
            open ? "opacity-100" : "opacity-0"
          } ${!open ? "pointer-events-none" : ""} ${containerClassName}`.trim()}
        >
          <div ref={contentRef} className={`${baseContentClassName} ${contentClassName}`.trim()}>
            {displayChildren}
          </div>
        </div>
      </td>
    </tr>
  );
}

/** `<thead>` for nested tables: muted strip, distinct from the main `Table` primary header. */
export function SubtableHeader({ className = "", ...props }: SectionProps) {
  return (
    <thead
      className={`bg-primary text-primary-foreground [&_th]:text-primary-foreground ${className}`.trim()}
      {...props}
    />
  );
}

/** `<tbody>` for nested `Subtable`s (matches `TableBody` row border behavior). */
export function SubtableBody({ className = "", ...props }: SectionProps) {
  return <tbody className={`[&_tr:last-child]:border-0 ${className}`.trim()} {...props} />;
}

/** Compact `<th>` for use inside `<SubtableHeader>`. */
export function SubtableHead({ className = "", ...props }: CellProps) {
  return (
    <th
      className={`h-6 min-w-0 px-2 py-1.5 text-left align-middle text-[10px] font-semibold uppercase tracking-wide ${className}`.trim()}
      {...props}
    />
  );
}

/** Compact `<td>` for use inside `<SubtableBody>`. */
export function SubtableCell({ className = "", ...props }: DataCellProps) {
  return (
    <td className={`px-2 py-1.5 align-middle text-xs leading-snug text-foreground ${className}`.trim()} {...props} />
  );
}

/** Row for nested tables: same border rhythm as `TableRow` without pointer / selection blocking. */
export function SubtableRow({ className = "", ...props }: RowProps) {
  return (
    <tr
      className={`cursor-default select-text transition-colors duration-60 hover:delay-0 hover:bg-card/80 ${className}`.trim()}
      {...props}
    />
  );
}

type SubtableProps = {
  className?: string;
  tableClassName?: string;
  children: React.ReactNode;
};

/**
 * Nested compact table: renders `<table>` directly (not `Table`) so you do not stack two
 * transparent `rounded-md` wrappers. Solid `bg-card` + no `backdrop-blur` on `SubtableRow`
 * keeps expandable `bg-muted` from showing through at the corners.
 */
export function Subtable({ className = "", tableClassName = "", children }: SubtableProps) {
  return (
    <div className={`w-full overflow-hidden rounded-sm bg-card/60 ${className}`.trim()}>
      <div className="overflow-x-auto">
        <table
          className={`w-full border-separate border-spacing-0 caption-bottom text-xs [&_td]:py-1.5 [&_th]:py-1.5 ${tableClassName}`.trim()}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
