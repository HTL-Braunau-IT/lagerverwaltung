"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "~/trpc/react";

const entries = [
  { href: "/backend/orders", label: "Bestellungen" },
  { href: "/backend/users", label: "Benutzer" },
  { href: "/backend/cost-centers", label: "Kostenstellen" },
  { href: "/backend/products", label: "Produkte" },
  { href: "/backend/categories", label: "Kategorien" },
  { href: "/backend/storage", label: "Lagerplaetze" },
  { href: "/backend/parts-list", label: "Teilelisten" },
] as const;

export function BackendSidebarNav() {
  const pathname = usePathname();
  const openOrdersCountQuery = api.order.backendOpenCount.useQuery();
  const openOrdersCount = openOrdersCountQuery.data?.count ?? 0;
  const openOrdersLabel = openOrdersCount > 99 ? "99+" : String(openOrdersCount);

  return (
    <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Administrator</p>
      <nav className="space-y-1">
        {entries.map((entry) => {
          const isActive = pathname === entry.href;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{entry.label}</span>
                {entry.href === "/backend/orders" && openOrdersCount > 0 ? (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                    aria-label={`${openOrdersCount} offene Bestellungen`}
                  >
                    {openOrdersLabel}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
