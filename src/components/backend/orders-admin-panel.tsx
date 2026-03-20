"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

const statusConfig: Record<
  OrderStatus,
  { label: string; pillClassName: string; nextStatus: OrderStatus | null }
> = {
  OPEN: {
    label: "Offen",
    pillClassName: "border border-rose-200 bg-rose-50 text-rose-700",
    nextStatus: "PREPARING",
  },
  PREPARING: {
    label: "In Vorbereitung",
    pillClassName: "border border-amber-200 bg-amber-50 text-amber-700",
    nextStatus: "READY_FOR_PICKUP",
  },
  READY_FOR_PICKUP: {
    label: "Abholbereit",
    pillClassName: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    nextStatus: null,
  },
};

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

function userLabel(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Unbekannt";
}

export function OrdersAdminPanel() {
  const utils = api.useUtils();

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const ordersQuery = api.order.backendList.useQuery({
    search: searchTerm || undefined,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    limit: 200,
  });

  const expandedOrderQuery = api.order.backendById.useQuery(
    { id: expandedOrderId ?? "" },
    { enabled: Boolean(expandedOrderId) },
  );

  const updateStatusMutation = api.order.backendUpdateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.order.backendList.invalidate(),
        expandedOrderId ? utils.order.backendById.invalidate({ id: expandedOrderId }) : Promise.resolve(),
      ]);
    },
  });

  const sortedOrders = useMemo(
    () => (ordersQuery.data ?? []).toSorted((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [ordersQuery.data],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Bestellungen</h2>
          <p className="text-sm text-slate-600">Bestellungen suchen, oeffnen und Status aktualisieren.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <label htmlFor="backend-order-search" className="block text-xs text-slate-600">
          Suche nach Bestellnummer, Kunde oder Kostenstelle
          <input
            id="backend-order-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. 2026000001, max.mustermann, 4AH..."
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 focus:ring-2"
          />
        </label>

        <label className="block text-xs text-slate-600">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrderStatus)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 focus:ring-2"
          >
            <option value="ALL">Alle Status</option>
            <option value="OPEN">Offen</option>
            <option value="PREPARING">In Vorbereitung</option>
            <option value="READY_FOR_PICKUP">Abholbereit</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-3">Bestellnummer</th>
              <th className="px-3 py-3">Kunde</th>
              <th className="px-3 py-3">Kostenstelle</th>
              <th className="px-3 py-3">Datum</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Bestellungen werden geladen...
                </td>
              </tr>
            ) : null}

            {ordersQuery.error ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-rose-700">
                  Bestellungen konnten nicht geladen werden.
                </td>
              </tr>
            ) : null}

            {!ordersQuery.isLoading && !ordersQuery.error && sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Keine Bestellungen gefunden.
                </td>
              </tr>
            ) : null}

            {sortedOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const status = statusConfig[order.status];
              const nextStatus = status.nextStatus;

              return (
                <Fragment key={order.id}>
                  <tr
                    onClick={() => setExpandedOrderId((current) => (current === order.id ? null : order.id))}
                    className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                  >
                    <td className="px-3 py-3 font-medium text-slate-900">{order.orderNumber}</td>
                    <td className="px-3 py-3 text-slate-700">{userLabel(order.user)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {order.costCenter.code} - {order.costCenter.name}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{formatDate(order.createdAt)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.pillClassName}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!nextStatus) return;
                          updateStatusMutation.mutate({
                            orderId: order.id,
                            nextStatus,
                          });
                        }}
                        disabled={!nextStatus || updateStatusMutation.isPending}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {nextStatus ? `Zu ${statusConfig[nextStatus].label}` : "Final"}
                      </button>
                    </td>
                  </tr>

                  {isExpanded ? (
                    <tr className="border-t border-slate-200 bg-slate-50/70">
                      <td colSpan={6} className="px-3 py-4">
                        {expandedOrderQuery.isLoading ? (
                          <p className="text-sm text-slate-500">Details werden geladen...</p>
                        ) : null}
                        {expandedOrderQuery.error ? (
                          <p className="text-sm text-rose-700">Details konnten nicht geladen werden.</p>
                        ) : null}
                        {!expandedOrderQuery.isLoading &&
                        !expandedOrderQuery.error &&
                        expandedOrderQuery.data &&
                        expandedOrderQuery.data.id === order.id ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Bestellnummer</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {expandedOrderQuery.data.orderNumber}
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Kunde</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {userLabel(expandedOrderQuery.data.user)}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {expandedOrderQuery.data.user.email ?? "Keine E-Mail"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Erstellt</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {formatDate(expandedOrderQuery.data.createdAt)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Zuletzt aktualisiert</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {formatDate(expandedOrderQuery.data.updatedAt)}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-sm font-semibold text-slate-900">Positionen</p>
                              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="min-w-full border-collapse text-left text-xs">
                                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                                    <tr>
                                      <th className="px-2.5 py-2">Bild</th>
                                      <th className="px-2.5 py-2">Produkt</th>
                                      <th className="px-2.5 py-2">SKU</th>
                                      <th className="px-2.5 py-2">Lagerplatz</th>
                                      <th className="px-2.5 py-2">Menge</th>
                                      <th className="px-2.5 py-2">Zeitpunkt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedOrderQuery.data.items.map((item) => (
                                      <tr key={item.id} className="border-t border-slate-200">
                                        <td className="px-2.5 py-2">
                                          <img
                                            src={item.product.images[0]?.url ?? "/pictures/placeholder.jpg"}
                                            alt={item.product.images[0]?.altText ?? `${item.product.name} Bild`}
                                            className="h-10 w-10 rounded border border-slate-200 object-cover"
                                            onError={(event) => {
                                              event.currentTarget.onerror = null;
                                              event.currentTarget.src = "/pictures/placeholder.jpg";
                                            }}
                                          />
                                        </td>
                                        <td className="px-2.5 py-2 text-slate-800">{item.product.name}</td>
                                        <td className="px-2.5 py-2 text-slate-600">{item.product.sku}</td>
                                        <td className="px-2.5 py-2 text-slate-600">
                                          {item.product.storageLocation.code} - {item.product.storageLocation.name}
                                        </td>
                                        <td className="px-2.5 py-2 text-slate-800">
                                          {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                                        </td>
                                        <td className="px-2.5 py-2 text-slate-600">{formatDate(item.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
