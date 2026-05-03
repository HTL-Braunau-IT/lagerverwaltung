"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "~/components/layout/search-field";

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

export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const mode = headerSearchMode(pathname);
  const [value, setValue] = useState(searchFromUrl);

  useEffect(() => {
    setValue(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    if (!mode || isReadonlySearchMode(mode)) return;

    const timeout = window.setTimeout(() => {
      const currentQuery = searchParams.toString();
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
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [mode, pathname, router, searchParams, value]);

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

  const id =
    mode === "ausleihe"
      ? "header-ausleihe-search"
      : mode === "orders"
        ? "header-orders-search"
        : mode === "backend"
          ? "header-backend-search"
          : mode === "userOrdersReadonly"
            ? "header-user-orders-search-readonly"
            : mode === "teacherOrdersReadonly"
              ? "header-teacher-orders-search-readonly"
              : mode === "cartsReadonly"
                ? "header-carts-search-readonly"
                : mode === "loansReadonly"
                  ? "header-loans-search-readonly"
                  : "global-product-search";

  const readonly = mode ? isReadonlySearchMode(mode) : false;

  return (
    <div>
      <SearchField
        id={id}
        value={readonly ? "" : value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        disabled={readonly}
        title={readonly ? "Suchfeld ist auf dieser Seite deaktiviert" : undefined}
      />
    </div>
  );
}
