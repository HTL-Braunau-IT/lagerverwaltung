"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function studentLabel(student: { name: string | null; email: string | null }) {
  return student.name?.trim() || student.email?.trim() || "Unbekannt";
}

export function AssignedOrdersPanel() {
  const utils = api.useUtils();
  const [costCenterByRequestId, setCostCenterByRequestId] = useState<Record<string, string>>({});

  const requestsQuery = api.order.listAssignedRequests.useQuery();
  const costCentersQuery = api.cart.listCostCenters.useQuery();
  const approveMutation = api.order.approveAssignedRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.order.listAssignedRequests.invalidate(),
        utils.cart.listMyOrders.invalidate(),
      ]);
    },
  });

  const pendingRequests = useMemo(
    () => (requestsQuery.data ?? []).filter((request) => request.status === "PENDING"),
    [requestsQuery.data],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
        <h1 className="text-2xl font-semibold text-slate-900">Zugewiesene Freigaben</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hier findest du alle an dich zugewiesenen Schueleranfragen und kannst sie final bestellen.
        </p>
      </header>

      <section className="space-y-4">
        {requestsQuery.isLoading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
            Anfragen werden geladen...
          </div>
        )}

        {requestsQuery.error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
            <p className="text-sm font-semibold">Anfragen konnten nicht geladen werden.</p>
            <button
              onClick={() => void requestsQuery.refetch()}
              className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
            >
              Erneut laden
            </button>
          </div>
        )}

        {!requestsQuery.isLoading && !requestsQuery.error && pendingRequests.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-semibold">Aktuell keine offenen Freigaben.</p>
          </div>
        )}

        {pendingRequests.map((request) => {
          const selectedCostCenter = costCenterByRequestId[request.id] ?? "";
          const itemCount = request.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);
          const canApprove =
            selectedCostCenter.length > 0 && !approveMutation.isPending && !costCentersQuery.isLoading;

          return (
            <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{studentLabel(request.student)}</h2>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                  Wartet auf Freigabe
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <p>
                  <span className="text-slate-500">Eingang: </span>
                  {formatDate(request.createdAt)}
                </p>
                <p>
                  <span className="text-slate-500">Lehrperson: </span>
                  {request.teacherDisplayName}
                </p>
                <p>
                  <span className="text-slate-500">Artikel gesamt: </span>
                  {itemCount}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Positionen</p>
                <ul className="mt-2 space-y-2">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                      <span>{item.product.name}</span>
                      <span className="font-medium text-slate-900">
                        {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 space-y-2">
                <label htmlFor={`cc-${request.id}`} className="block text-sm font-medium text-slate-800">
                  Kostenstelle
                </label>
                <select
                  id={`cc-${request.id}`}
                  value={selectedCostCenter}
                  onChange={(event) =>
                    setCostCenterByRequestId((current) => ({
                      ...current,
                      [request.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
                  disabled={costCentersQuery.isLoading || approveMutation.isPending}
                >
                  <option value="">Bitte Kostenstelle waehlen</option>
                  {costCentersQuery.data?.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.code} - {center.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() =>
                  approveMutation.mutate({
                    requestId: request.id,
                    costCenterId: selectedCostCenter,
                  })
                }
                disabled={!canApprove}
                className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {approveMutation.isPending ? "Wird bestellt..." : "Bestellung final absenden"}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
