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
  { href: "/backend/storage/rooms", label: "Lager" },
  { href: "/backend/parts-list", label: "Teilelisten" },
  { href: "/backend/lendable-items", label: "Leihgeräte" },
  { href: "/backend/loans", label: "Ausleihen" },
] as const;

export function BackendSidebarNav() {
  const pathname = usePathname();
  const openOrdersCountQuery = api.order.backendOpenCount.useQuery();
  const openOrdersCount = openOrdersCountQuery.data?.count ?? 0;
  const openOrdersLabel = openOrdersCount > 99 ? "99+" : String(openOrdersCount);

  const openLoansCountQuery = api.loan.backendOpenCount.useQuery();
  const openLoansCount = openLoansCountQuery.data?.count ?? 0;
  const openLoansLabel = openLoansCount > 99 ? "99+" : String(openLoansCount);

  return (
    <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Administration</p>
      <nav className="space-y-1">
        {entries.map((entry) => {
          const isPartsListRoot = entry.href === "/backend/parts-list";
          const isPartsListRoute = pathname === "/backend/parts-list";
          const isLendableItemsRoot = entry.href === "/backend/lendable-items";
          const isLendableItemsRoute = pathname === "/backend/lendable-items";
          const isCostCentersRoot = entry.href === "/backend/cost-centers";
          const isCostCentersRoute = pathname === "/backend/cost-centers";
          const isActive = isPartsListRoot
            ? isPartsListRoute
            : isLendableItemsRoot
              ? isLendableItemsRoute
              : isCostCentersRoot
                ? isCostCentersRoute
              : pathname === entry.href;
          const isCategories = entry.href === "/backend/categories";
          const showCategoriesSubnav = isCategories;
          const isNewCategoryActive = pathname === "/backend/categories/new";
          const isStorage = entry.href === "/backend/storage/rooms";
          const showStorageSubnav = isStorage;
          const isPartsList = entry.href === "/backend/parts-list";
          const showPartsListSubnav = isPartsList;
          const isNewPartsListActive = pathname === "/backend/parts-list/new";
          const isLendableItems = entry.href === "/backend/lendable-items";
          const showLendableItemsSubnav = isLendableItems;
          const isNewLendableItemActive = pathname === "/backend/lendable-items/new";
          const isCostCenters = entry.href === "/backend/cost-centers";
          const showCostCentersSubnav = isCostCenters;
          const isNewCostCenterActive = pathname === "/backend/cost-centers/new";

          const isStorageRoomsActive = pathname === "/backend/storage/rooms";
          const isStorageLocationsActive = pathname === "/backend/storage/locations";
          const isNewStorageRoomActive = pathname === "/backend/storage/rooms/new";
          const isNewStorageLocationActive = pathname === "/backend/storage/locations/new";
          return (
            <div key={entry.href} className="space-y-1">
              {isStorage ? (
                <div className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground">
                  <span className="flex items-center justify-between gap-2">
                    <span>{entry.label}</span>
                  </span>
                </div>
              ) : (
                <Link
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

              {showCategoriesSubnav ? (
                <div className="relative ml-3 pl-3">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 h-[20px] w-px bg-border"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-5 h-px w-3 bg-border"
                  />
                  <Link
                    href="/backend/categories/new"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isNewCategoryActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Neue Kategorie
                  </Link>
                </div>
              ) : null}

              {showPartsListSubnav ? (
                <div className="relative ml-3 pl-3">
                  <span aria-hidden="true" className="absolute left-0 top-0 h-[20px] w-px bg-border" />
                  <span aria-hidden="true" className="absolute left-0 top-5 h-px w-3 bg-border" />
                  <Link
                    href="/backend/parts-list/new"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isNewPartsListActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Neue Teileliste
                  </Link>
                </div>
              ) : null}

              {showLendableItemsSubnav ? (
                <div className="relative ml-3 pl-3">
                  <span aria-hidden="true" className="absolute left-0 top-0 h-[20px] w-px bg-border" />
                  <span aria-hidden="true" className="absolute left-0 top-5 h-px w-3 bg-border" />
                  <Link
                    href="/backend/lendable-items/new"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isNewLendableItemActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Neues Leihgerät
                  </Link>
                </div>
              ) : null}

              {showCostCentersSubnav ? (
                <div className="relative ml-3 pl-3">
                  <span aria-hidden="true" className="absolute left-0 top-0 h-[20px] w-px bg-border" />
                  <span aria-hidden="true" className="absolute left-0 top-5 h-px w-3 bg-border" />
                  <Link
                    href="/backend/cost-centers/new"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isNewCostCenterActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Neue Kostenstelle
                  </Link>
                </div>
              ) : null}

              {showStorageSubnav ? (
                <div className="relative ml-3 space-y-1 pl-3">
                  <span aria-hidden="true" className="absolute left-0 top-0 h-full w-px bg-border" />

                  <Link
                    href="/backend/storage/rooms"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isStorageRoomsActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Lagerräume
                  </Link>
                  <div className="relative ml-3 pl-3">
                    <span aria-hidden="true" className="absolute left-0 top-0 h-[20px] w-px bg-border" />
                    <span aria-hidden="true" className="absolute left-0 top-5 h-px w-3 bg-border" />
                    <Link
                      href="/backend/storage/rooms/new"
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        isNewStorageRoomActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      Neuer Lagerraum
                    </Link>
                  </div>

                  <Link
                    href="/backend/storage/locations"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      isStorageLocationsActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    Lagerplätze
                  </Link>
                  <div className="relative ml-3 pl-3">
                    <span aria-hidden="true" className="absolute left-0 top-0 h-[20px] w-px bg-border" />
                    <span aria-hidden="true" className="absolute left-0 top-5 h-px w-3 bg-border" />
                    <Link
                      href="/backend/storage/locations/new"
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        isNewStorageLocationActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      Neuer Lagerplatz
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
