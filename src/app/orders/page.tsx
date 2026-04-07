"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { CheckIcon, ClipboardCopyIcon } from "~/components/layout/icon-renders";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatOrderDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP") {
  if (status === "OPEN") return "Offen";
  if (status === "PREPARING") return "In Vorbereitung";
  return "Abholbereit";
}

function orderStatusBadgeVariant(status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP"): Parameters<typeof Badge>[0]["variant"] {
  if (status === "OPEN") return "destructive";
  if (status === "PREPARING") return "secondary";
  return "success";
}

function formatRequestStatus(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  return "Abgelehnt";
}

function userLabel(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Unbekannt";
}

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
      className="inline-flex shrink-0 items-center justify-center rounded-full px-2 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
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
            "absolute inset-0 flex items-center justify-center text-emerald-600 transition-opacity duration-200 ease-out",
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

export default function OrdersPage() {
  const { data: session } = useSession();
  const showOwnOrders = !!session?.user.role && session.user.role !== "STUDENT";
  const ordersQuery = api.cart.listMyOrders.useQuery(undefined, {
    enabled: showOwnOrders,
  });
  const submittedRequestsQuery = api.cart.listMySubmittedRequests.useQuery(undefined, {
    enabled: session?.user.role === "STUDENT",
  });

  return (
    <main className="mx-auto flex min-h-screen w-[90%] max-w-none flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="space-y-4">
        {session?.user.role === "STUDENT" && (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Meine Freigabeanfragen</h2>
            <p className="mt-1 text-sm text-slate-600">
              Hier siehst du den Status deiner an Lehrpersonen gesendeten Anfragen.
            </p>

            {submittedRequestsQuery.isLoading && (
              <p className="mt-3 text-sm text-slate-600">Anfragen werden geladen...</p>
            )}
            {submittedRequestsQuery.error && (
              <p className="mt-3 text-sm text-rose-700">
                Freigabeanfragen konnten nicht geladen werden.
              </p>
            )}
            {!submittedRequestsQuery.isLoading &&
              !submittedRequestsQuery.error &&
              (submittedRequestsQuery.data?.length ?? 0) === 0 && (
                <p className="mt-3 text-sm text-slate-500">Noch keine Freigabeanfragen vorhanden.</p>
              )}

            <div className="mt-4 space-y-3">
              {submittedRequestsQuery.data?.map((request) => {
                const requestItemCount = request.items.reduce(
                  (sum, item) => sum + decimalToNumber(item.quantity),
                  0,
                );

                return (
                  <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          An Lehrperson: {request.teacherDisplayName}
                        </p>
                        <p className="text-xs text-slate-500">{request.teacherEmail}</p>
                      </div>
                      <span className="rounded-full bg-slate-200 px-3 py-1   text-xs font-medium text-slate-800">
                        {formatRequestStatus(request.status)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                      <p>
                        <span className="text-slate-500">Gesendet: </span>
                        {formatOrderDate(request.createdAt)}
                      </p>
                      <p>
                        <span className="text-slate-500">Artikel gesamt: </span>
                        {requestItemCount}
                      </p>
                      <p>
                        <span className="text-slate-500">Bestellung: </span>
                        {request.approvedOrder?.orderNumber ?? "-"}
                      </p>
                    </div>
                    {request.approvedOrder ? (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span className="text-slate-500">Bestellstatus:</span>
                        <Badge variant={orderStatusBadgeVariant(request.approvedOrder.status)}>
                          {formatStatus(request.approvedOrder.status)}
                        </Badge>
                      </p>
                    ) : null}
                    {request.status === "REJECTED" ? (
                      <p className="mt-2 text-xs text-rose-700">
                        Die Lehrperson hat diese Anfrage abgelehnt. Bitte passe den Warenkorb an und sende eine neue
                        Anfrage.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>
        )}

        {showOwnOrders ? (
          <>
            {ordersQuery.isLoading && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
                Bestellungen werden geladen...
              </div>
            )}

            {ordersQuery.error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
                <p className="text-sm font-semibold">Bestellungen konnten nicht geladen werden.</p>
                <button
                  onClick={() => void ordersQuery.refetch()}
                  className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
                >
                  Erneut laden
                </button>
              </div>
            )}

            {!ordersQuery.isLoading && !ordersQuery.error && (ordersQuery.data?.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
                <p className="text-sm font-semibold">Noch keine Bestellungen vorhanden.</p>
                <p className="mt-1 text-sm text-slate-500">
                  Sobald du im Checkout bestellst, erscheinen deine Eintraege hier.
                </p>
              </div>
            )}

            {(ordersQuery.data?.length ?? 0) > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {ordersQuery.data!.map((order) => {
                  const itemCount = order.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);

                  return (
                    <article
                      key={order.id}
                      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
                    <div className="justify-self-start">
                      <p className="text-sm text-slate-500">Bestellnummer</p>
                      <h2 className="text-lg font-semibold text-slate-900">{order.orderNumber}</h2>
                    </div>

                    <div className="justify-self-center self-start -mt-5">
                      {order.sourceRequest ? (
                        <div className="flex flex-col items-center gap-0.5 text-center">
                          <div className="relative">
                            <div
                              aria-hidden="true"
                              className="absolute left-1/2 top-0 z-0 h-8 w-[190px] -translate-x-1/2 border border-violet-200 bg-violet-100 shadow-sm rounded-b-md"
                            >
                            </div>
                            <Badge
                              variant="default"
                              className="relative z-10 rounded-none border-0 bg-transparent p-4 mt-1.5 text-violet-800 shadow-none leading-none"
                            >
                              Aus Schuelerfreigabe
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            Schueler: {userLabel(order.sourceRequest.student)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="justify-self-end">
                      <Badge variant={orderStatusBadgeVariant(order.status)}>
                        {formatStatus(order.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />

                  <div className="mt-7 grid gap-6">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                      <div className="grid gap-4 text-sm text-slate-700 sm:grid-cols-3 sm:gap-6">
                        <p className="flex min-w-0 flex-col gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Datum
                          </span>
                          <span className="min-w-0 truncate text-base font-semibold leading-tight text-slate-900">
                            {formatOrderDate(order.createdAt)}
                          </span>
                        </p>
                        <p className="flex min-w-0 flex-col gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Kostenstelle
                          </span>
                          <span className="min-w-0 truncate text-base font-semibold leading-tight text-slate-900">
                            {order.costCenter.code} - {order.costCenter.name}
                          </span>
                        </p>
                        <p className="flex min-w-0 flex-col gap-1 sm:text-right">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Artikel gesamt
                          </span>
                          <span className="min-w-0 truncate text-base font-semibold tabular-nums leading-tight text-slate-900">
                            {itemCount}
                          </span>
                        </p>
                      </div>
                    </div>

                    <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none">
                        <div className="flex items-baseline gap-2">
                          <p className="text-base font-semibold text-slate-900">Positionen</p>
                        </div>
                        <span className="text-xs font-medium text-slate-600 group-open:hidden">
                          Anzeigen
                        </span>
                        <span className="text-xs font-medium text-slate-600 hidden group-open:inline">
                          Ausblenden
                        </span>
                      </summary>

                      <div className="mt-8">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(max-content,26ch)_max-content] items-center gap-x-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <span className="min-w-0 truncate">Name</span>
                          <div className="justify-self-center text-center">SKU</div>
                          <span className="shrink-0 text-right">Menge</span>
                        </div>

                        <ul className="mt-2 divide-y divide-slate-200/70">
                          {order.items.map((item) => (
                            <li
                              key={item.id}
                              className="grid grid-cols-[minmax(0,1fr)_minmax(max-content,22ch)_max-content] items-center gap-x-4 py-2.5 text-sm text-slate-700 first:pt-3 last:pb-3"
                            >
                              <span className="min-w-0 truncate text-[15px] font-medium text-slate-900">
                                {item.product.name}
                              </span>
                              <span className="justify-self-center">
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white/80 pl-2 pr-1 py-1 font-mono text-[11px] tabular-nums text-slate-700 shadow-sm">
                                  <span className="whitespace-nowrap">{item.product.sku}</span>
                                  <SkuCopyButton sku={item.product.sku} />
                                </span>
                              </span>
                              <span className="justify-self-end whitespace-nowrap text-right text-[15px] font-semibold tabular-nums text-slate-900">
                                {decimalToNumber(item.quantity)}{" "}
                                <span className="font-medium text-slate-600">
                                  {item.product.baseUnit.toLowerCase()}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
