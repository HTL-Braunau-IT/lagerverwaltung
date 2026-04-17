"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DetailCard, DetailText } from "~/components/ui/detail-card";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { Card } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableExpandableRow,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

const statusConfig: Record<
  OrderStatus,
  { label: string; pillClassName: string; borderClassName: string; nextStatus: OrderStatus | null }
> = {
  OPEN: {
    label: "Offen",
    pillClassName: "",
    borderClassName: "border-destructive/60",
    nextStatus: "PREPARING",
  },
  PREPARING: {
    label: "In Vorbereitung",
    pillClassName: "",
    borderClassName: "border-secondary-foreground/25",
    nextStatus: "READY_FOR_PICKUP",
  },
  READY_FOR_PICKUP: {
    label: "Abholbereit",
    pillClassName: "",
    borderClassName: "border-success/60",
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
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const ordersQuery = api.order.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const expandedOrderQuery = api.order.backendById.useQuery(
    { id: expandedOrderId ?? "" },
    { enabled: Boolean(expandedOrderId) },
  );

  const updateStatusMutation = api.order.backendUpdateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.order.backendList.invalidate(),
        utils.order.backendOpenCount.invalidate(),
        expandedOrderId ? utils.order.backendById.invalidate({ id: expandedOrderId }) : Promise.resolve(),
      ]);
    },
  });

  const sortedOrders = useMemo(
    () =>
      [...(ordersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [ordersQuery.data],
  );

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="">
          <h2 className="text-xl font-semibold text-foreground">Bestellungen</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Status:</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "ALL" as const, label: "Alle" },
              { value: "OPEN" as const, label: "Offen" },
              { value: "PREPARING" as const, label: "In Vorbereitung" },
              { value: "READY_FOR_PICKUP" as const, label: "Abholbereit" },
            ] as const
          ).map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <FilterPillButton
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                active={active}
              >
                {opt.label}
              </FilterPillButton>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Bestellnummer</TableHead>
              <TableHead>Lehrer</TableHead>
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
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{order.orderNumber}</span>
                        {order.workerNote ? (
                          <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-800">
                            Hinweis
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell >
                      <p>{userLabel(order.user)}</p>
                      {order.sourceRequest?.student ? (
                        <p className="text-[9px] text-slate-500 italic">
                          Schüler: {userLabel(order.sourceRequest.student)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {order.costCenter.code} - {order.costCenter.name}
                    </TableCell>
                    <TableCell>{formatDate(order.createdAt)}</TableCell>
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

                  <TableExpandableRow
                    open={isExpanded}
                    colSpan={6}
                    rowClassName="bg-muted/30"
                    cellClassName="p-3"
                    containerClassName=""
                    contentClassName={`${status.borderClassName}`.trim()}
                  >
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
                        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                          <DetailCard>
                            <DetailText variant="kicker">Bestellnummer</DetailText>
                            <DetailText variant="value">{expandedOrderQuery.data.orderNumber}</DetailText>
                          </DetailCard>
                          <DetailCard>
                            <DetailText variant="kicker">Lehrer</DetailText>
                            <DetailText variant="value">{userLabel(expandedOrderQuery.data.user)}</DetailText>
                            <DetailText variant="subvalue">
                              {expandedOrderQuery.data.user.email ?? "Keine E-Mail"}
                            </DetailText>
                            {expandedOrderQuery.data.sourceRequest?.student ? (
                              <p className="mt-2 text-[9px] text-muted-foreground italic">
                                Schueler: {userLabel(expandedOrderQuery.data.sourceRequest.student)}
                              </p>
                            ) : null}
                          </DetailCard>
                          <DetailCard>
                            <DetailText variant="kicker">Kostenstelle</DetailText>
                            <DetailText variant="value">
                              {order.costCenter.code} - {order.costCenter.name}
                            </DetailText>
                          </DetailCard>
                          <DetailCard>
                            <DetailText variant="kicker">Erstellt</DetailText>
                            <DetailText variant="value">{formatDate(expandedOrderQuery.data.createdAt)}</DetailText>
                          </DetailCard>
                          <DetailCard>
                            <DetailText variant="kicker">Zuletzt aktualisiert</DetailText>
                            <DetailText variant="value">{formatDate(expandedOrderQuery.data.updatedAt)}</DetailText>
                          </DetailCard>
                        </div>

                        {expandedOrderQuery.data.workerNote ? (
                          <div className="rounded-xl border border-orange-300 bg-orange-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                              Hinweis fuer Lager
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-orange-900">
                              {expandedOrderQuery.data.workerNote}
                            </p>
                          </div>
                        ) : null}

                        <div className="rounded-md border border-border bg-card/40 p-3">
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
                                </tr>
                              </thead>
                              <tbody className="bg-white">
                                {expandedOrderQuery.data.items.map((item) => (
                                  <tr key={item.id} className="border-t border-border bg-white">
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
                                      {item.product.storageLocation
                                        ? `${item.product.storageLocation.code} - ${item.product.storageLocation.name}`
                                        : "-"}
                                    </td>
                                    <td className="px-2.5 py-2 text-muted-foreground">
                                      {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </TableExpandableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {ordersQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void ordersQuery.fetchNextPage()}
            disabled={ordersQuery.isFetchingNextPage}
          >
            {ordersQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
