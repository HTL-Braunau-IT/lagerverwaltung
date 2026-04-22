"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DetailCard, DetailText } from "~/components/ui/detail-card";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { Card } from "~/components/ui/card";
import * as TableUI from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

const statusConfig: Record<
  OrderStatus,
  {
    label: string;
    pillClassName: string;
    borderClassName: string;
    nextStatus: OrderStatus | null;
    advanceActionLabel: string | null;
  }
> = {
  OPEN: {
    label: "Offen",
    pillClassName: "",
    borderClassName: "",
    nextStatus: "PREPARING",
    advanceActionLabel: "Kommissionierung starten",
  },
  PREPARING: {
    label: "In Vorbereitung",
    pillClassName: "",
    borderClassName: "",
    nextStatus: "READY_FOR_PICKUP",
    advanceActionLabel: "Abholbereit melden",
  },
  READY_FOR_PICKUP: {
    label: "Abholbereit",
    pillClassName: "",
    borderClassName: "",
    nextStatus: null,
    advanceActionLabel: null,
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
  const toast = useToast();
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
    onSuccess: async (_data, variables) => {
      await Promise.all([
        utils.order.backendList.invalidate(),
        utils.order.backendOpenCount.invalidate(),
        expandedOrderId ? utils.order.backendById.invalidate({ id: expandedOrderId }) : Promise.resolve(),
      ]);
      const label = statusConfig[variables.nextStatus as OrderStatus]?.label ?? "Status aktualisiert";
      toast.success(`Bestellung: ${label}.`);
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
        <TableUI.Table className="table-fixed">
          <TableUI.TableHeader>
            <tr>
              <TableUI.TableHead>Bestellnummer</TableUI.TableHead>
              <TableUI.TableHead>Lehrer</TableUI.TableHead>
              <TableUI.TableHead>Kostenstelle</TableUI.TableHead>
              <TableUI.TableHead>Datum</TableUI.TableHead>
              <TableUI.TableHead>Status</TableUI.TableHead>
              <TableUI.TableHead className="w-[14rem] min-w-[14rem] max-w-[14rem] whitespace-nowrap">
                Aktion
              </TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {ordersQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={6} className="text-muted-foreground">
                  Bestellungen werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}

            {ordersQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={6} className="text-destructive">
                  Bestellungen konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {!ordersQuery.isLoading && !ordersQuery.error && sortedOrders.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={6} className="text-muted-foreground">
                  Keine Bestellungen gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {sortedOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const status = statusConfig[order.status];
              const nextStatus = status.nextStatus;

              return (
                <Fragment key={order.id}>
                  <TableUI.TableRow
                    onClick={() => setExpandedOrderId((current) => (current === order.id ? null : order.id))}
                  >
                    <TableUI.TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{order.orderNumber}</span>
                        {order.workerNote ? (
                          <Badge variant="note">
                            Hinweis
                          </Badge>
                        ) : null}
                      </div>
                    </TableUI.TableCell>
                    <TableUI.TableCell >
                      <p>{userLabel(order.user)}</p>
                      {order.sourceRequest?.student ? (
                        <p className="text-[9px] text-slate-500 italic">
                          Schüler: {userLabel(order.sourceRequest.student)}
                        </p>
                      ) : null}
                    </TableUI.TableCell>
                    <TableUI.TableCell>
                      {order.costCenter.code} - {order.costCenter.name}
                    </TableUI.TableCell>
                    <TableUI.TableCell>{formatDate(order.createdAt)}</TableUI.TableCell>
                    <TableUI.TableCell>
                      <Badge
                        variant={
                          order.status === "READY_FOR_PICKUP"
                            ? "orderThird"
                            : order.status === "OPEN"
                              ? "orderFirst"
                              : "orderSecond"
                        }
                        className={status.pillClassName}
                      >
                        {status.label}
                      </Badge>
                    </TableUI.TableCell>
                    <TableUI.TableCell className="w-[14rem] min-w-[14rem] max-w-[14rem] whitespace-nowrap">
                      {nextStatus && status.advanceActionLabel ? (
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateStatusMutation.mutate({
                              orderId: order.id,
                              nextStatus,
                            });
                          }}
                          disabled={updateStatusMutation.isPending}
                          variant={nextStatus === "READY_FOR_PICKUP" ? "solid" : "glass"}
                          size="sm"
                          aria-label={`Status auf ${statusConfig[nextStatus].label} setzen`}
                        >
                          {status.advanceActionLabel}
                        </Button>
                      ) : (
                        <span
                          className="inline-flex w-full max-w-full justify-center rounded-full py-1.5 text-center text-xs text-muted-foreground"
                          aria-label="Keine weitere Aktion"
                        >
                          —
                        </span>
                      )}
                    </TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
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
                          <DetailCard>
                            <DetailText variant="noteTitle">
                              Hinweis für Lager
                            </DetailText>
                            <DetailText variant="note">
                              {expandedOrderQuery.data.workerNote}
                            </DetailText>
                          </DetailCard>
                        ) : null}

                        <DetailCard className="hover:!bg-card/40 !bg-card/0 !m-0 !p-0">
                          <TableUI.Subtable className="mt-3">
                            <TableUI.SubtableHeader>
                              <tr>
                                <TableUI.SubtableHead className="w-14">Bild</TableUI.SubtableHead>
                                <TableUI.SubtableHead>Produkt</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-[7rem]">SKU</TableUI.SubtableHead>
                                <TableUI.SubtableHead>Lagerplatz</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-24 whitespace-nowrap">Menge</TableUI.SubtableHead>
                              </tr>
                            </TableUI.SubtableHeader>
                            <TableUI.SubtableBody>
                              {expandedOrderQuery.data.items.map((item) => (
                                <TableUI.SubtableRow key={item.id}>
                                  <TableUI.SubtableCell>
                                    <img
                                      src={item.product.images[0]?.url ?? "/pictures/placeholder.jpg"}
                                      alt={item.product.images[0]?.altText ?? `${item.product.name} Bild`}
                                      className="h-12 w-12 rounded object-cover"
                                      onError={(event) => {
                                        event.currentTarget.onerror = null;
                                        event.currentTarget.src = "/pictures/placeholder.jpg";
                                      }}
                                    />
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="font-medium text-foreground">
                                    {item.product.name}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground">{item.product.sku}</TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground">
                                    {item.product.storageLocation
                                      ? `${item.product.storageLocation.code} - ${item.product.storageLocation.name}`
                                      : "-"}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                                    {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                                  </TableUI.SubtableCell>
                                </TableUI.SubtableRow>
                              ))}
                            </TableUI.SubtableBody>
                          </TableUI.Subtable>
                        </DetailCard>
                      </div>
                    ) : null}
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
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
