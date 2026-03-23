"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const entries = [
  { href: "/backend", label: "Produkte" },
  { href: "/backend/orders", label: "Bestellungen" },
] as const;

export function BackendSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Administrator</p>
      <nav className="space-y-1">
        {entries.map((entry) => {
          const isActive = pathname === entry.href;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
