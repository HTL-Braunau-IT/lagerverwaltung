"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CheckIcon, ClipboardCopyIcon } from "~/components/layout/icon-renders";

const SKU_COPY_FEEDBACK_MS = 1500;

function SkuCopyButton({ sku }: { sku: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center justify-center border-l border-border px-2 text-muted-foreground transition hover:bg-card/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      title={copied ? "SKU kopiert" : "SKU in die Zwischenablage kopieren"}
      aria-label={copied ? "SKU kopiert" : "SKU in die Zwischenablage kopieren"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sku);
        } catch {
          return;
        }
        setCopied(true);
        if (resetRef.current) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => {
          setCopied(false);
          resetRef.current = null;
        }, SKU_COPY_FEEDBACK_MS);
      }}
    >
      <span className="relative inline-flex h-[14px] w-[14px] items-center justify-center">
        <span
          className={[
            "transition-opacity duration-200 ease-out",
            copied ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          aria-hidden
        >
          <ClipboardCopyIcon size={14} />
        </span>
        <span
          className={[
            "absolute inset-0 flex items-center justify-center text-green-600 transition-opacity duration-200 ease-out",
            copied ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          aria-hidden
        >
          <CheckIcon size={14} />
        </span>
      </span>
    </button>
  );
}

export function SkuPill({ sku, className }: { sku: string; className?: string }) {
  return (
    <div
      className={[
        "inline-flex max-w-full min-h-0 items-stretch overflow-hidden rounded-full bg-card/40 text-sm text-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link
        href={`/?search=${encodeURIComponent(sku)}`}
        className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1.5 px-3 py-1 transition hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title="Alle Produkte mit dieser SKU anzeigen"
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          SKU
        </span>
        <span className="truncate font-medium tabular-nums">{sku}</span>
      </Link>
      <SkuCopyButton sku={sku} />
    </div>
  );
}
