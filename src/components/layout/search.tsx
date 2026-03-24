"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "~/components/ui/input";

export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const showOnPage = pathname === "/" || pathname.startsWith("/products/");
  const [value, setValue] = useState(searchFromUrl);

  useEffect(() => {
    setValue(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    if (!showOnPage) return;

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

      const targetPath = "/";
      router.replace(nextQuery ? `${targetPath}?${nextQuery}` : targetPath, { scroll: false });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParams, showOnPage, value]);

  if (!showOnPage) {
    return null;
  }

  return (
    <div>
      <Input
        id="global-product-search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Suche nach Name oder Beschreibung, z. B. HDMI-Kabel, A4 Papier..."
        className="h-10 rounded-xl"
      />
    </div>
  );
}
