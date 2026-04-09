"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "~/components/layout/search-field";

type HeaderSearchMode = "shop" | "ausleihe";

function headerSearchMode(pathname: string): HeaderSearchMode | null {
  if (pathname === "/" || pathname.startsWith("/products/")) {
    return "shop";
  }
  if (pathname === "/ausleihe" || pathname.startsWith("/ausleihe/")) {
    return "ausleihe";
  }
  return null;
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
    if (!mode) return;

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
    return null;
  }

  const placeholder =
    mode === "ausleihe"
      ? "Ausleihe: z. B. Bohrer, Leiter, Material..."
      : "Suche nach Name oder Beschreibung, z. B. HDMI-Kabel, A4 Papier...";

  const id = mode === "ausleihe" ? "header-ausleihe-search" : "global-product-search";

  return (
    <div>
      <SearchField
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
