"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";

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

function formatRequestStatus(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  return "Abgelehnt";
}

function userLabel(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Unbekannt";
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const ordersQuery = api.cart.listMyOrders.useQuery();
  const submittedRequestsQuery = api.cart.listMySubmittedRequests.useQuery(undefined, {
    enabled: session?.user.role === "STUDENT",
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
        <h1 className="text-2xl font-semibold text-slate-900">Bestellhistorie</h1>
        <p className="mt-1 text-sm text-slate-600">Hier siehst du alle deine bisherigen Bestellungen.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
          >
            Zur Produktliste
          </Link>
          <Link
            href="/carts"
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Zu Warenkoerben
          </Link>
          {session?.user.role === "TEACHER" || session?.user.role === "ADMIN" ? (
            <Link
              href="/teacher/orders"
              className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
            >
              Zu Freigaben
            </Link>
          ) : null}
        </div>
      </header>

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
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-800">
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
                  </div>
                );
              })}
            </div>
          </article>
        )}

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

        {ordersQuery.data?.map((order) => {
          const itemCount = order.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);

          return (
            <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">Bestellnummer</p>
                  <h2 className="text-lg font-semibold text-slate-900">{order.orderNumber}</h2>
                  {order.sourceRequest ? (
                    <div className="mt-2 space-y-1">
                      <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800">
                        Aus Schuelerfreigabe
                      </span>
                      <p className="text-xs text-slate-600">
                        Schueler: {userLabel(order.sourceRequest.student)}
                      </p>
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                  {formatStatus(order.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <p>
                  <span className="text-slate-500">Datum: </span>
                  {formatOrderDate(order.createdAt)}
                </p>
                <p>
                  <span className="text-slate-500">Kostenstelle: </span>
                  {order.costCenter.code} - {order.costCenter.name}
                </p>
                <p>
                  <span className="text-slate-500">Artikel gesamt: </span>
                  {itemCount}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Positionen</p>
                <ul className="mt-2 space-y-2">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                      <span>{item.product.name}</span>
                      <span className="font-medium text-slate-900">
                        {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
