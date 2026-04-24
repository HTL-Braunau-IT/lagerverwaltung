"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type HeaderNavLinkProps = {
  href: string;
  label: string;
  hoverClassName: string;
  icon: React.ReactNode;
  badgeLabel?: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNavLink({ href, label, hoverClassName, icon, badgeLabel }: HeaderNavLinkProps) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`group inline-flex min-w-24 flex-col items-center gap-1 transition-colors ${
        isActive ? "text-foreground" : `text-muted-foreground ${hoverClassName}`
      }`}
    >
      <span className="relative flex h-10 w-10 items-center justify-center">
        {icon}
        {badgeLabel ? (
          <span
            className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-950"
            aria-label={`${badgeLabel} offene Freigaben`}
          >
            {badgeLabel}
          </span>
        ) : null}
      </span>
      <span className={`text-sm font-medium ${isActive ? "underline underline-offset-4" : ""}`}>{label}</span>
    </Link>
  );
}
