"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "~/components/layout/search-field";
import { useShopProductCountSnapshot } from "~/components/shop/shop-product-count-context";

type HeaderSearchMode =
  | "shop"
  | "ausleihe"
  | "orders"
  | "userOrdersReadonly"
  | "teacherOrdersReadonly"
  | "cartsReadonly"
  | "loansReadonly"
  | "backend";

function headerSearchMode(pathname: string): HeaderSearchMode | null {
  if (pathname === "/" || pathname.startsWith("/products/")) {
    return "shop";
  }
  if (pathname === "/ausleihe" || pathname.startsWith("/ausleihe/")) {
    return "ausleihe";
  }
  if (pathname === "/backend/orders" || pathname.startsWith("/backend/orders/")) {
    return "orders";
  }
  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return "userOrdersReadonly";
  }
  if (pathname === "/teacher/orders" || pathname.startsWith("/teacher/orders/")) {
    return "teacherOrdersReadonly";
  }
  if (pathname === "/carts" || pathname.startsWith("/carts/")) {
    return "cartsReadonly";
  }
  if (pathname === "/loans" || pathname.startsWith("/loans/")) {
    return "loansReadonly";
  }
  if (pathname === "/backend" || pathname.startsWith("/backend/")) {
    return "backend";
  }
  return null;
}

function isReadonlySearchMode(mode: HeaderSearchMode): boolean {
  return (
    mode === "userOrdersReadonly" ||
    mode === "teacherOrdersReadonly" ||
    mode === "cartsReadonly" ||
    mode === "loansReadonly"
  );
}

/** Delay before syncing typed text to the URL (avoids navigation on every keystroke). */
const HEADER_SEARCH_DEBOUNCE_MS = 300;

const HEADER_SEARCH_FIELD_IDS: Record<HeaderSearchMode, string> = {
  shop: "global-product-search",
  ausleihe: "header-ausleihe-search",
  orders: "header-orders-search",
  backend: "header-backend-search",
  userOrdersReadonly: "header-user-orders-search-readonly",
  teacherOrdersReadonly: "header-teacher-orders-search-readonly",
  cartsReadonly: "header-carts-search-readonly",
  loansReadonly: "header-loans-search-readonly",
};

export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const queryString = searchParams.toString();
  const mode = headerSearchMode(pathname);
  const [value, setValue] = useState(searchFromUrl);
  /** While focused, ignore `searchFromUrl` (it can lag behind keystrokes until debounced `replace`). */
  const searchFocusedRef = useRef(false);

  useEffect(() => {
    const readSearch = () =>
      new URLSearchParams(window.location.search).get("search") ?? "";
    const onPopState = () => setValue(readSearch());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (searchFocusedRef.current) return;
    setValue(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    if (!mode || isReadonlySearchMode(mode)) return;

    const timeout = window.setTimeout(() => {
      const currentQuery = queryString;
      const params = new URLSearchParams(currentQuery);
      const trimmed = value.trim();

      if (trimmed) {
        params.set("search", trimmed);
      } else {
        params.delete("search");
      }

      const nextQuery = params.toString();
      if (nextQuery === currentQuery) {
        return;
      }

      const targetPath = mode === "shop" ? "/" : pathname;
      router.replace(nextQuery ? `${targetPath}?${nextQuery}` : targetPath, { scroll: false });
    }, HEADER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [mode, pathname, queryString, router, value]);

  const searchFocusProps = {
    onFocus: () => {
      searchFocusedRef.current = true;
    },
    onBlur: () => {
      searchFocusedRef.current = false;
    },
  } as const;

  if (!mode) {
    return (
      <div>
        <div className="h-10 w-full" aria-hidden />
      </div>
    );
  }

  const placeholder = (() => {
    if (mode === "ausleihe") return "Ausleihe: z. B. Bohrer, Leiter, Material...";
    if (mode === "orders") return "Bestellungen: z. B. 2026000001, Mustermann, 4AH..., Kostenstelle...";
    if (
      mode === "userOrdersReadonly" ||
      mode === "teacherOrdersReadonly" ||
      mode === "cartsReadonly" ||
      mode === "loansReadonly"
    ) {
      return "Suche auf dieser Seite nicht verfügbar";
    }
    if (mode === "backend") return "Backend: Suche...";
    return "Suche nach Name oder Beschreibung, z. B. HDMI-Kabel, A4 Papier...";
  })();

  const id = HEADER_SEARCH_FIELD_IDS[mode];

  const readonly = mode ? isReadonlySearchMode(mode) : false;
  const shopProductCount = useShopProductCountSnapshot();
  const showShopProductCount = mode === "shop" && shopProductCount !== null;

  return (
    <div>
      {showShopProductCount ? (
        <div className="relative w-full">
          <SearchField
            id={id}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className="pe-[8.25rem] sm:pe-[9rem]"
            aria-describedby="shop-product-count-label"
            {...searchFocusProps}
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
                    shopProductCount.filtered < shopProductCount.total
                      ? "font-semibold"
                      : ""
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
          id={id}
          value={readonly ? "" : value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          disabled={readonly}
          title={readonly ? "Suchfeld ist auf dieser Seite deaktiviert" : undefined}
          {...searchFocusProps}
        />
      )}
    </div>
  );
}
