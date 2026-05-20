"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type HeaderNavAccent = "orders" | "loans" | "approvals" | "admin";

/** Bottom border only; shared frame keeps width stable; border color set per state. */
const frame =
  "relative border-b-2 px-1 py-0.5 transition-[color,border-color] duration-60 delay-60 hover:delay-0";

/* Hover utilities must be literal substrings here so Tailwind emits them (dynamic string concat is not scanned). */
const accentClassName: Record<HeaderNavAccent, { active: string; inactive: string }> = {
  orders: {
    active: `${frame} border-b-[var(--nav-orders)] font-medium text-[var(--nav-orders)]`,
    inactive: `${frame} border-b-transparent font-medium text-muted-foreground/85 hover:border-b-[color-mix(in_srgb,var(--nav-orders)_42%,transparent)] hover:text-[color-mix(in_srgb,var(--nav-orders)_55%,var(--muted-foreground))]`,
  },
  loans: {
    active: `${frame} border-b-[var(--nav-loans)] font-medium text-[var(--nav-loans)]`,
    inactive: `${frame} border-b-transparent font-medium text-muted-foreground/85 hover:border-b-[color-mix(in_srgb,var(--nav-loans)_42%,transparent)] hover:text-[color-mix(in_srgb,var(--nav-loans)_55%,var(--muted-foreground))]`,
  },
  approvals: {
    active: `${frame} border-b-[var(--nav-approvals)] font-medium text-[var(--nav-approvals)]`,
    inactive: `${frame} border-b-transparent font-medium text-muted-foreground/85 hover:border-b-[color-mix(in_srgb,var(--nav-approvals)_42%,transparent)] hover:text-[color-mix(in_srgb,var(--nav-approvals)_55%,var(--muted-foreground))]`,
  },
  admin: {
    active: `${frame} border-b-[var(--nav-admin)] font-medium text-[var(--nav-admin)]`,
    inactive: `${frame} border-b-transparent font-medium text-muted-foreground/85 hover:border-b-[color-mix(in_srgb,var(--nav-admin)_42%,transparent)] hover:text-[color-mix(in_srgb,var(--nav-admin)_55%,var(--muted-foreground))]`,
  },
};

type HeaderNavLinkProps = {
  href: string;
  label: string;
  accent: HeaderNavAccent;
  icon: React.ReactNode;
  badgeLabel?: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNavLink({ href, label, accent, icon, badgeLabel }: HeaderNavLinkProps) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href);
  const tone = isActive ? accentClassName[accent].active : accentClassName[accent].inactive;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`group inline-flex min-w-24 flex-col items-center gap-0.5 [&_svg]:text-inherit ${tone}`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center text-inherit">
        {icon}
        {badgeLabel !== undefined ? (
          <span
            className="absolute -right-1.5 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent-orange px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
            aria-label={`${badgeLabel} offene in ${label}`}
          >
            {badgeLabel}
          </span>
        ) : null}
      </span>
      <span className="text-sm leading-tight">{label}</span>
    </Link>
  );
}
