"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { api } from "~/trpc/react";

export type HeaderCartLinkProps = {
  label: string;
  icon: ReactNode;
};

const SESSION_STORAGE_KEY = "lw_cart_session_id";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatBadgeQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value > 99) return "99+";
  const rounded = Math.round(value * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return isWhole ? String(Math.round(rounded)) : String(rounded).replace(/\.0+$/, "");
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export function HeaderCartLink({ label, icon }: HeaderCartLinkProps) {
  const [sessionId, setSessionId] = useState("");
  const pathname = usePathname();
  const isActive = pathname === "/carts" || pathname.startsWith("/carts/");

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    },
  );

  const quantityTotal = useMemo(() => {
    const items = cartQuery.data?.items ?? [];
    return items.reduce((total, item) => total + decimalToNumber(item.quantity), 0);
  }, [cartQuery.data?.items]);
  const badgeLabel = useMemo(() => formatBadgeQuantity(quantityTotal), [quantityTotal]);

  return (
    <Link
      href="/carts"
      aria-current={isActive ? "page" : undefined}
      className={`group inline-flex min-w-24 flex-col items-center gap-0.5 [&_svg]:text-inherit ${
        isActive
          ? "relative border-b-2 border-b-[var(--nav-cart)] px-1 py-0.5 font-medium text-[var(--nav-cart)] transition-[color,border-color] duration-60 delay-60 hover:delay-0"
          : "relative border-b-2 border-b-transparent px-1 py-0.5 font-medium text-muted-foreground/85 transition-[color,border-color] duration-60 delay-60 hover:delay-0 hover:border-b-[color-mix(in_srgb,var(--nav-cart)_42%,transparent)] hover:text-[color-mix(in_srgb,var(--nav-cart)_55%,var(--muted-foreground))]"
      }`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center text-inherit">
        {icon}
        <span
          className="absolute -right-1.5 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent-orange px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
          aria-label={`${badgeLabel} Produkte im Warenkorb`}
        >
          {badgeLabel}
        </span>
      </span>
      <span className="text-sm leading-tight">{label}</span>
    </Link>
  );
}

