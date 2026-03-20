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
    <aside className="rounded-2xl border border-slate-200 bg-slate-900 p-3 text-white shadow-sm">
      <p className="px-3 pb-2 text-xs uppercase tracking-[0.2em] text-slate-300">Administrator</p>
      <nav className="space-y-1">
        {entries.map((entry) => {
          const isActive = pathname === entry.href;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white"
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
