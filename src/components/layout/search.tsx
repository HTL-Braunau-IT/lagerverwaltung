"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "~/components/layout/search-field";
import {
  useShopFiltersReset,
  useShopHasActiveFilters,
  useShopProductCountSnapshot,
} from "~/components/shop/shop-product-count-context";

type SearchMode = "home" | "redirect" | "ausleihe" | "orders" | "backend" | null;

const PRODUCT_SEARCH_LAUNCHER_PATHS = [
  "/carts",
  "/orders",
  "/loans",
  "/teacher/orders",
] as const;

const SHOP_SEARCH_PLACEHOLDER =
  "Suche nach Name oder Beschreibung, z. B. HDMI-Kabel, A4 Papier...";

const BACKEND_SEARCH_PLACEHOLDERS: ReadonlyArray<readonly [prefix: string, area: string, examples: string]> =
  [
    ["/backend/orders", "Bestellungen", "2026000001, Mustermann, 4AH..., Kostenstelle..."],
    ["/backend/loans", "Ausleihen", "Mustermann, Bohrmaschine, E-Mail..."],
    ["/backend/products", "Produkte", "BEPCKF0033050DC, HDMI-Kabel, DIN Nummer..."],
    ["/backend/categories", "Kategorien", "Elektronik, Metalle, Werkzeug..."],
    ["/backend/parts-list", "Teilelisten", "Arduino-Kit, Kleinorgel, Piano..."],
    ["/backend/cost-centers", "Kostenstellen", "Ausbildung, 4AH, Werkstätte..."],
    ["/backend/storage", "Lager", "A-01, Bausatzkasten, Z/1/1..."],
    ["/backend/lendable-items", "Leihgeräte", "Bohrer, Leiter, Gabelschlüssel..."],
    ["/backend/users", "Benutzer", "Name, muster@htl..."],
    ["/backend/info", "Info", "..."],
  ];

function pagePlaceholder(pathname: string): string | undefined {
  const match = BACKEND_SEARCH_PLACEHOLDERS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? `Suche in ${match[1]}: z. B. ${match[2]}` : undefined;
}

const DEBOUNCE_MS = 300;

function SearchFieldClearButton({
  onClear,
  className = "",
  layout = "overlay",
}: {
  onClear: () => void;
  className?: string;
  layout?: "overlay" | "inline";
}) {
  const positionClass =
    layout === "overlay"
      ? "absolute top-1/2 z-10 -translate-y-1/2 translate-x-3"
      : "relative z-10 shrink-0 translate-x-1";

  return (
    <button
      type="button"
      className={`${positionClass} flex h-6 w-6 items-center justify-center rounded-xs text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive ${className}`.trim()}
      aria-label="Filter zurücksetzen"
      title="Filter zurücksetzen"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
    >
      <span aria-hidden className="relative -top-px text-sm leading-none font-semibold">
        ×
      </span>
    </button>
  );
}

function getSearchMode(pathname: string): SearchMode {
  if (pathname === "/") return "home";
  if (
    PRODUCT_SEARCH_LAUNCHER_PATHS.some(
      (base) => pathname === base || pathname.startsWith(`${base}/`),
    ) ||
    pathname.startsWith("/products/") ||
    pathname === "/parts-list" ||
    pathname.startsWith("/parts-list/")
  ) {
    return "redirect";
  }
  if (pathname === "/ausleihe" || pathname.startsWith("/ausleihe/")) return "ausleihe";
  if (pathname === "/backend/orders" || pathname.startsWith("/backend/orders/")) return "orders";
  if (pathname === "/backend" || pathname.startsWith("/backend/")) return "backend";
  return null;
}

export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const queryString = searchParams.toString();
  const mode = getSearchMode(pathname);

  const [value, setValue] = useState("");
  const redirectTimerRef = useRef<number | null>(null);

  // Reset field on navigation; only pages that own `?search=` show the URL term.
  useEffect(() => {
    if (redirectTimerRef.current) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (mode === "home" || mode === "ausleihe" || mode === "orders" || mode === "backend") {
      setValue(searchFromUrl);
    } else {
      setValue("");
    }
  }, [mode, pathname, searchFromUrl]);

  // Storefront home: keep `?search=` in sync with the input.
  useEffect(() => {
    if (mode !== "home") return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(queryString);
      const trimmed = value.trim();

      if (trimmed) params.set("search", trimmed);
      else params.delete("search");

      const nextQuery = params.toString();
      if (nextQuery === queryString) return;

      router.replace(nextQuery ? `/?${nextQuery}` : "/", { scroll: false });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [mode, queryString, router, value]);

  // Ausleihe / backend: sync search on the current page only.
  useEffect(() => {
    if (mode !== "ausleihe" && mode !== "orders" && mode !== "backend") return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(queryString);
      const trimmed = value.trim();

      if (trimmed) params.set("search", trimmed);
      else params.delete("search");

      const nextQuery = params.toString();
      if (nextQuery === queryString) return;

      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [mode, pathname, queryString, router, value]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const handleChange = (next: string) => {
    setValue(next);

    if (mode !== "redirect") return;

    if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);

    const trimmed = next.trim();
    if (!trimmed) return;

    redirectTimerRef.current = window.setTimeout(() => {
      redirectTimerRef.current = null;
      router.push(`/?search=${encodeURIComponent(trimmed)}`);
    }, DEBOUNCE_MS);
  };

  if (!mode) {
    return (
      <div>
        <div className="h-10 w-full" aria-hidden />
      </div>
    );
  }

  const placeholder =
    mode === "home" || mode === "redirect"
      ? SHOP_SEARCH_PLACEHOLDER
      : mode === "ausleihe"
        ? "Suche in Ausleihe: z. B. Bohrer, Leiter, Material..."
        : (pagePlaceholder(pathname) ?? "Suche im Backend...");

  const fieldId =
    mode === "home" || mode === "redirect"
      ? "global-product-search"
      : `header-${mode}-search`;

  const shopProductCount = useShopProductCountSnapshot();
  const showShopProductCount = mode === "home" && shopProductCount !== null;
  const hasActiveShopFilters = useShopHasActiveFilters();
  const resetShopFilters = useShopFiltersReset();
  const showShopClearButton =
    mode === "home" && (value.trim() !== "" || hasActiveShopFilters);

  const clearShopFilters = () => {
    setValue("");
    resetShopFilters();
  };

  return (
    <div>
      {showShopProductCount ? (
        <div className="relative w-full">
          <SearchField
            id={fieldId}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={placeholder}
            className={
              showShopClearButton
                ? "pe-[10.5rem] sm:pe-[11.25rem]"
                : "pe-[8.25rem] sm:pe-[9rem]"
            }
            aria-describedby="shop-product-count-label"
          />
          <div className="pointer-events-none absolute end-3 top-1/2 flex max-w-[min(12rem,calc(100%-2rem))] -translate-y-1/2 items-center justify-end">
            {showShopClearButton ? (
              <SearchFieldClearButton
                onClear={clearShopFilters}
                layout="inline"
                className="pointer-events-auto"
              />
            ) : null}
            <span
              id="shop-product-count-label"
              className="truncate text-right text-xs text-muted-foreground/70"
              aria-live="polite"
            >
              <span className="text-slate-300/70 mx-3">|</span>
              {shopProductCount.isLoading ? (
                "…"
              ) : (
                <>
                  <span
                    className={
                      shopProductCount.filtered < shopProductCount.total ? "font-semibold" : ""
                    }
                  >
                    {shopProductCount.filtered}
                  </span>
                  {` von ${shopProductCount.total}`}
                </>
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="relative w-full">
          <SearchField
            id={fieldId}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={placeholder}
            className={showShopClearButton ? "pe-9" : undefined}
          />
          {showShopClearButton ? (
            <SearchFieldClearButton onClear={clearShopFilters} className="end-2" />
          ) : null}
        </div>
      )}
    </div>
  );
}
