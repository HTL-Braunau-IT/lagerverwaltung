"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "~/trpc/react";

const entries = [
  { href: "/backend/orders", label: "Bestellungen" },
  { href: "/backend/users", label: "Benutzer" },
  { href: "/backend/cost-centers", label: "Kostenstellen" },
  { href: "/backend/products", label: "Produkte" },
  { href: "/backend/categories", label: "Kategorien" },
  { href: "/backend/storage/rooms", label: "Lager" },
  { href: "/backend/parts-list", label: "Teilelisten" },
  { href: "/backend/lendable-items", label: "Leihgeräte" },
  { href: "/backend/loans", label: "Ausleihen" },
] as const;

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

type NavGroupItem = { href: string; label: string; indent?: 0 | 1 };
type NavGroup = {
  matchPrefix: string;
  parentHref: string;
  items: NavGroupItem[];
  navigateOnOpen?: boolean;
};

export function BackendSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const openOrdersCountQuery = api.order.backendOpenCount.useQuery();
  const openOrdersCount = openOrdersCountQuery.data?.count ?? 0;
  const openOrdersLabel = openOrdersCount > 99 ? "99+" : String(openOrdersCount);

  const openLoansCountQuery = api.loan.backendOpenCount.useQuery();
  const openLoansCount = openLoansCountQuery.data?.count ?? 0;
  const openLoansLabel = openLoansCount > 99 ? "99+" : String(openLoansCount);

  const groups = useMemo(() => {
    const g: Record<string, NavGroup> = {
      "/backend/categories": {
        matchPrefix: "/backend/categories",
        parentHref: "/backend/categories",
        items: [{ href: "/backend/categories/new", label: "Neue Kategorie" }],
        navigateOnOpen: true,
      },
      "/backend/parts-list": {
        matchPrefix: "/backend/parts-list",
        parentHref: "/backend/parts-list",
        items: [{ href: "/backend/parts-list/new", label: "Neue Teileliste" }],
        navigateOnOpen: true,
      },
      "/backend/lendable-items": {
        matchPrefix: "/backend/lendable-items",
        parentHref: "/backend/lendable-items",
        items: [{ href: "/backend/lendable-items/new", label: "Neues Leihgerät" }],
        navigateOnOpen: true,
      },
      "/backend/cost-centers": {
        matchPrefix: "/backend/cost-centers",
        parentHref: "/backend/cost-centers",
        items: [{ href: "/backend/cost-centers/new", label: "Neue Kostenstelle" }],
        navigateOnOpen: true,
      },
      "/backend/storage/rooms": {
        matchPrefix: "/backend/storage",
        parentHref: "/backend/storage/rooms",
        items: [
          { href: "/backend/storage/rooms", label: "Lagerräume" },
          { href: "/backend/storage/rooms/new", label: "Neuer Lagerraum", indent: 1 },
          { href: "/backend/storage/locations", label: "Lagerplätze" },
          { href: "/backend/storage/locations/new", label: "Neuer Lagerplatz", indent: 1 },
        ],
        navigateOnOpen: false,
      },
    };
    return g;
  }, []);

  const defaultOpenByHref = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [href, group] of Object.entries(groups)) {
      result[href] = pathname.startsWith(group.matchPrefix);
    }
    return result;
  }, [groups, pathname]);

  // User preference overrides route-default open state when set.
  const [openPreferenceByHref, setOpenPreferenceByHref] = useState<Record<string, boolean | undefined>>({});

  return (
    <aside className="rounded-md border border-border bg-card p-3 shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground text-center">Administration</p>
      <div className="flex items-center justify-center gap-2 px-3 pb-2 text-[8px]">
        <button
          type="button"
          onClick={() => {
            setOpenPreferenceByHref((prev) => {
              const next: Record<string, boolean | undefined> = { ...prev };
              for (const href of Object.keys(groups)) next[href] = true;
              return next;
            });
          }}
          className="rounded-md px-2 py-1 font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Alle ausklappen
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenPreferenceByHref((prev) => {
              const next: Record<string, boolean | undefined> = { ...prev };
              for (const href of Object.keys(groups)) next[href] = false;
              return next;
            });
          }}
          className="rounded-md px-2 py-1 font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Alle einklappen
        </button>
      </div>
      <nav className="space-y-2">
        {entries.map((entry) => {
          const group = groups[entry.href];
          const isGroup = Boolean(group);
          const defaultOpen = isGroup ? defaultOpenByHref[entry.href] ?? false : false;
          const isOpen = isGroup ? (openPreferenceByHref[entry.href] ?? defaultOpen) : false;
          const isParentActive = isGroup ? pathname === group!.parentHref : false;
          const isActive = isGroup ? isParentActive : pathname === entry.href;

          const toggle = () => {
            if (!isGroup) return;
            const next = !isOpen;
            // If user sets it to the route default, clear preference so it keeps following route changes.
            setOpenPreferenceByHref((prev) => ({
              ...prev,
              [entry.href]: next === defaultOpen ? undefined : next,
            }));
          };

          return (
            <div key={entry.href} className="space-y-1">
              {isGroup ? (
                <div className="rounded-lg">
                  <div
                    className={`flex w-full items-center justify-between gap-2 rounded-sm text-left text-sm font-medium transition ${
                      isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <Link
                      href={group!.parentHref}
                      className="min-w-0 flex-1 px-3 py-2"
                      onClick={(e) => {
                        // Parent click also toggles. Optionally navigate when opening.
                        e.preventDefault();
                        const wasOpen = isOpen;
                        toggle();
                        if (!wasOpen && group!.navigateOnOpen !== false) {
                          router.push(group!.parentHref);
                        }
                      }}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate">{entry.label}</span>
                        {entry.href === "/backend/orders" && openOrdersCount > 0 ? (
                          <span
                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                            aria-label={`${openOrdersCount} offene Bestellungen`}
                          >
                            {openOrdersLabel}
                          </span>
                        ) : null}
                        {entry.href === "/backend/loans" && openLoansCount > 0 ? (
                          <span
                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                            aria-label={`${openLoansCount} offene Anfragen`}
                          >
                            {openLoansLabel}
                          </span>
                        ) : null}
                      </span>
                    </Link>

                    <button
                      type="button"
                      aria-label={isOpen ? `${entry.label} einklappen` : `${entry.label} ausklappen`}
                      aria-expanded={isOpen}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle();
                      }}
                      className={`-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md transition ${
                        isActive ? "text-primary-foreground/90" : "text-foreground"
                      }`}
                    >
                      <Chevron open={isOpen} />
                    </button>
                  </div>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="group/subnav relative ml-3 space-y-1 pl-3 pt-1">
                        <span
                          aria-hidden="true"
                          className={`absolute left-3 top-2 bottom-0 w-px transition-colors ${
                            pathname.startsWith(group!.matchPrefix) && pathname !== group!.parentHref
                              ? "bg-primary"
                              : "bg-border border-[1.5px] group-hover/subnav:bg-muted-foreground"
                          }`}
                        />
                        {group!.items.map((item) => {
                          const isItemActive = pathname === item.href;
                          const indent = item.indent ?? 0;
                          return (
                            <div
                              key={item.href}
                              className={`${indent ? "relative ml-3 pl-3" : ""} group/item`}
                            >
                              {indent ? (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className={`absolute left-0 top-0 h-[20px] w-px transition-colors ${
                                      isItemActive ? "bg-primary" : "bg-border group-hover/item:bg-muted-foreground"
                                    }`}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className={`absolute left-0 top-5 h-px w-3 transition-colors ${
                                      isItemActive ? "bg-primary" : "bg-border group-hover/item:bg-muted-foreground"
                                    }`}
                                  />
                                </>
                              ) : null}
                              <Link
                                href={item.href}
                                className={`block w-full rounded-sm px-3 py-2 text-left text-sm font-medium transition ${
                                  isItemActive ? "bg-primary/90 text-primary-foreground" : "text-foreground hover:bg-accent"
                                }`}
                              >
                                {item.label}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  href={entry.href}
                  className={`block w-full rounded-sm px-3 py-2 text-left text-sm font-medium transition ${
                    isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
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
                    {entry.href === "/backend/loans" && openLoansCount > 0 ? (
                      <span
                        className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                        aria-label={`${openLoansCount} offene Anfragen`}
                      >
                        {openLoansLabel}
                      </span>
                    ) : null}
                  </span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
