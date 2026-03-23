"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

const statusConfig: Record<
  OrderStatus,
  { label: string; pillClassName: string; nextStatus: OrderStatus | null }
> = {
  OPEN: {
    label: "Offen",
    pillClassName: "",
    nextStatus: "PREPARING",
  },
  PREPARING: {
    label: "In Vorbereitung",
    pillClassName: "",
    nextStatus: "READY_FOR_PICKUP",
  },
  READY_FOR_PICKUP: {
    label: "Abholbereit",
    pillClassName: "",
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
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Bestellungen</h2>
          <p className="text-sm text-muted-foreground">Bestellungen suchen, oeffnen und Status aktualisieren.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <label htmlFor="backend-order-search" className="block text-xs text-muted-foreground">
          Suche nach Bestellnummer, Kunde oder Kostenstelle
          <Input
            id="backend-order-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. 2026000001, max.mustermann, 4AH..."
            className="mt-1 h-10 rounded-xl"
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrderStatus)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ALL">Alle Status</option>
            <option value="OPEN">Offen</option>
            <option value="PREPARING">In Vorbereitung</option>
            <option value="READY_FOR_PICKUP">Abholbereit</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Bestellnummer</TableHead>
              <TableHead>Kunde</TableHead>
              <TableHead>Kostenstelle</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aktion</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {ordersQuery.isLoading ? (
              <tr>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Bestellungen werden geladen...
                </TableCell>
              </tr>
            ) : null}

            {ordersQuery.error ? (
              <tr>
                <TableCell colSpan={6} className="text-destructive">
                  Bestellungen konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}

            {!ordersQuery.isLoading && !ordersQuery.error && sortedOrders.length === 0 ? (
              <tr>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Keine Bestellungen gefunden.
                </TableCell>
              </tr>
            ) : null}

            {sortedOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const status = statusConfig[order.status];
              const nextStatus = status.nextStatus;

              return (
                <Fragment key={order.id}>
                  <TableRow
                    onClick={() => setExpandedOrderId((current) => (current === order.id ? null : order.id))}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium text-foreground">{order.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{userLabel(order.user)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.costCenter.code} - {order.costCenter.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === "READY_FOR_PICKUP"
                            ? "success"
                            : order.status === "OPEN"
                              ? "destructive"
                              : "secondary"
                        }
                        className={status.pillClassName}
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
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
                        variant="outline"
                        size="sm"
                        className="disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {nextStatus ? `Zu ${statusConfig[nextStatus].label}` : "Final"}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={6} className="px-3 py-4">
                        {expandedOrderQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground">Details werden geladen...</p>
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
                              <div className="rounded-lg border border-border bg-card p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bestellnummer</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {expandedOrderQuery.data.orderNumber}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-card p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kunde</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {userLabel(expandedOrderQuery.data.user)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {expandedOrderQuery.data.user.email ?? "Keine E-Mail"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-card p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Erstellt</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatDate(expandedOrderQuery.data.createdAt)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-card p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Zuletzt aktualisiert</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatDate(expandedOrderQuery.data.updatedAt)}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-xl border border-border bg-card p-3">
                              <p className="text-sm font-semibold text-foreground">Positionen</p>
                              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                                <table className="min-w-full border-collapse text-left text-xs">
                                  <thead className="bg-muted uppercase tracking-wide text-muted-foreground">
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
                                      <tr key={item.id} className="border-t border-border">
                                        <td className="px-2.5 py-2">
                                          <img
                                            src={item.product.images[0]?.url ?? "/pictures/placeholder.jpg"}
                                            alt={item.product.images[0]?.altText ?? `${item.product.name} Bild`}
                                            className="h-10 w-10 rounded border border-border object-cover"
                                            onError={(event) => {
                                              event.currentTarget.onerror = null;
                                              event.currentTarget.src = "/pictures/placeholder.jpg";
                                            }}
                                          />
                                        </td>
                                        <td className="px-2.5 py-2 text-foreground">{item.product.name}</td>
                                        <td className="px-2.5 py-2 text-muted-foreground">{item.product.sku}</td>
                                        <td className="px-2.5 py-2 text-muted-foreground">
                                          {item.product.storageLocation.code} - {item.product.storageLocation.name}
                                        </td>
                                        <td className="px-2.5 py-2 text-foreground">
                                          {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                                        </td>
                                        <td className="px-2.5 py-2 text-muted-foreground">{formatDate(item.createdAt)}</td>
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
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
