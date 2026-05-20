"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "~/components/layout/search-field";
import { useShopProductCountSnapshot } from "~/components/shop/shop-product-count-context";

type SearchMode = "home" | "redirect" | "ausleihe" | "orders" | "backend" | null;

const PRODUCT_SEARCH_LAUNCHER_PATHS = [
  "/carts",
  "/orders",
  "/loans",
  "/teacher/orders",
] as const;

const SHOP_SEARCH_PLACEHOLDER =
  "Suche nach Name oder Beschreibung, z. B. HDMI-Kabel, A4 Papier...";

const DEBOUNCE_MS = 300;

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
        ? "Ausleihe: z. B. Bohrer, Leiter, Material..."
        : mode === "orders"
          ? "Bestellungen: z. B. 2026000001, Mustermann, 4AH..., Kostenstelle..."
          : "Backend: Suche...";

  const fieldId =
    mode === "home" || mode === "redirect"
      ? "global-product-search"
      : `header-${mode}-search`;

  const shopProductCount = useShopProductCountSnapshot();
  const showShopProductCount = mode === "home" && shopProductCount !== null;

  return (
    <div>
      {showShopProductCount ? (
        <div className="relative w-full">
          <SearchField
            id={fieldId}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={placeholder}
            className="pe-[8.25rem] sm:pe-[9rem]"
            aria-describedby="shop-product-count-label"
          />
          <span
            id="shop-product-count-label"
            className="pointer-events-none absolute end-3 top-1/2 max-w-[min(8rem,calc(100%-2rem))] -translate-y-1/2 truncate text-right text-xs text-muted-foreground/70"
            aria-live="polite"
          >
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
      ) : (
        <SearchField
          id={fieldId}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
