"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  LendingIcon,
  LoansIcon,
  OrdersIcon,
  PackageIcon,
  TagIcon,
  UsersIcon,
  WarehouseIcon,
  ListIcon,
  AdministrationIcon,
} from "~/components/layout/icon-renders";
import { api } from "~/trpc/react";

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
          { href: "/backend/lendable-items", label: "Leihgeräte", icon: <LendingIcon className="h-4 w-4" /> },
        ],
      },
      {
        heading: "System",
        items: [          
          { href: "/backend/users", label: "Benutzer", icon: <UsersIcon className="h-4 w-4" /> },
          { href: "/backend/info", label: "Info", icon: <AdministrationIcon className="h-4 w-4" /> },
        ],
      },
    ] as const;
  }, []);

  const isActiveHref = (href: string) => {
    if (href === "/backend/storage/locations") return pathname.startsWith("/backend/storage");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const hoverIntentTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);

  const onItemPointerEnter = (href: string, pointerType: string) => {
    if (pointerType !== "mouse") return;

    if (hoverClearTimerRef.current) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    if (hoverIntentTimerRef.current) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }

    // Hover intent: avoid flicker on drive-by passes.
    hoverIntentTimerRef.current = window.setTimeout(() => {
      setHoveredHref(href);
      hoverIntentTimerRef.current = null;
    }, 0);
  };

  const onItemPointerLeave = (_href: string, pointerType: string) => {
    if (pointerType !== "mouse") return;

    if (hoverIntentTimerRef.current) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
    if (hoverClearTimerRef.current) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }

    // Lazy hover: keep highlight a touch longer.
    hoverClearTimerRef.current = window.setTimeout(() => {
      setHoveredHref(null);
      hoverClearTimerRef.current = null;
    }, 60);
  };

  return (
    <aside
      data-backend-sidebar="true"
      className="glass sticky self-start mt-1 overflow-y-auto p-3"
    >
      <nav className="mt-1 space-y-5">
        {navSections.map((section) => (
          <div key={section.heading} className="space-y-2">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.heading}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = isActiveHref(item.href);
                const isHovered = hoveredHref === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onPointerEnter={(e) => onItemPointerEnter(item.href, e.pointerType)}
                    onPointerLeave={(e) => onItemPointerLeave(item.href, e.pointerType)}
                    className={`block w-full rounded-sm px-3 py-2 text-left text-sm font-medium transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isHovered
                          ? "bg-card/40 text-foreground"
                          : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
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
