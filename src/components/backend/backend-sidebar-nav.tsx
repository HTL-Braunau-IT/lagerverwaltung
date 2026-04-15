"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  LendingIcon,
  LoansIcon,
  OrdersIcon,
  PackageIcon,
  TagIcon,
  UsersIcon,
  WarehouseIcon,
  ListIcon,
} from "~/components/layout/icon-renders";
import { api } from "~/trpc/react";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function BackendSidebarNav() {
  const pathname = usePathname();
  const openOrdersCountQuery = api.order.backendOpenCount.useQuery();
  const openOrdersCount = openOrdersCountQuery.data?.count ?? 0;
  const openOrdersLabel = openOrdersCount > 99 ? "99+" : String(openOrdersCount);

  const openLoansCountQuery = api.loan.backendOpenCount.useQuery();
  const openLoansCount = openLoansCountQuery.data?.count ?? 0;
  const openLoansLabel = openLoansCount > 99 ? "99+" : String(openLoansCount);

  const navSections = useMemo(() => {
    return [
      {
        heading: "Vorgänge",
        items: [          
          { href: "/backend/orders", label: "Bestellungen", icon: <OrdersIcon className="h-4 w-4" /> },
          { href: "/backend/loans", label: "Ausleihen", icon: <LoansIcon className="h-4 w-4" /> },
        ],
      },
      {
        heading: "Stammdaten",
        items: [
          { href: "/backend/products", label: "Produkte", icon: <PackageIcon className="h-4 w-4" /> },
          { href: "/backend/categories", label: "Kategorien", icon: <TagIcon className="h-4 w-4" /> },
          { href: "/backend/parts-list", label: "Teilelisten", icon: <ListIcon className="h-4 w-4" /> },
          { href: "/backend/cost-centers", label: "Kostenstellen", icon: <TagIcon className="h-4 w-4" /> },
          { href: "/backend/storage/locations", label: "Lager", icon: <WarehouseIcon className="h-4 w-4" /> },
          { href: "/backend/lendable-items", label: "Leihgeräte", icon: <LendingIcon /> },
        ],
      },
      {
        heading: "System",
        items: [{ href: "/backend/users", label: "Benutzer", icon: <UsersIcon className="h-4 w-4" /> }],
      },
    ] as const;
  }, []);

  const isActiveHref = (href: string) => {
    if (href === "/backend/storage/locations") return pathname.startsWith("/backend/storage");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="rounded-md border border-border bg-card p-3 shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground text-center">Administration</p>
      <nav className="mt-1 space-y-5">
        {navSections.map((section) => (
          <div key={section.heading} className="space-y-2">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.heading}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = isActiveHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block w-full rounded-sm px-3 py-2 text-left text-sm font-medium transition ${
                      isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="[&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>
                        <span>{item.label}</span>
                      </span>
                      {item.href === "/backend/orders" && openOrdersCount > 0 ? (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                          aria-label={`${openOrdersCount} offene Bestellungen`}
                        >
                          {openOrdersLabel}
                        </span>
                      ) : null}
                      {item.href === "/backend/loans" && openLoansCount > 0 ? (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                          aria-label={`${openLoansCount} offene Anfragen`}
                        >
                          {openLoansLabel}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
