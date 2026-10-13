"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, DetailText } from "~/components/ui/detail-card";
import * as TableUI from "~/components/ui/table";
import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { SkuPill } from "~/components/ui/sku-pill";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";

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

function orderStatusBadgeVariant(
  status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP",
): "orderFirst" | "orderSecond" | "orderThird" {
  if (status === "READY_FOR_PICKUP") return "orderThird";
  if (status === "OPEN") return "orderFirst";
  return "orderSecond";
}

type ApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

function formatOrderProgress(status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP", approvalStatus: ApprovalStatus) {
  if (approvalStatus === "PENDING") return "Wartet auf Freigabe";
  if (approvalStatus === "REJECTED") return "Abgelehnt";
  if (approvalStatus === "CANCELLED") return "Zurückgezogen";
  return formatStatus(status);
}

function orderProgressBadgeVariant(
  status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP",
  approvalStatus: ApprovalStatus,
) {
  if (approvalStatus === "PENDING") return "orderSecond";
  if (approvalStatus === "REJECTED" || approvalStatus === "CANCELLED") return "destructive";
  return orderStatusBadgeVariant(status);
}

function formatRequestStatus(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  return "Abgelehnt";
}

function requestStatusBadgeVariant(
  status: "PENDING" | "APPROVED" | "REJECTED",
): "orderSecond" | "orderThird" | "destructive" | "default" {
  if (status === "PENDING") return "orderSecond";
  if (status === "APPROVED") return "orderThird";
  if (status === "REJECTED") return "destructive";
  return "default";
}

function userLabel(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Unbekannt";
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
  const utils = api.useUtils();
  const toast = useToast();
  const cancelMutation = api.approval.cancelMine.useMutation({
    onSuccess: async () => {
      await utils.cart.listMyOrders.invalidate();
      toast.success("Bestellung zurückgezogen.");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <main className="mx-auto flex min-h-screen w-[90%] max-w-none flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="space-y-4">
        {session?.user.role === "STUDENT" && (
          <article className="mt-6">

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

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              {submittedRequestsQuery.data?.map((request) => {
                const requestItemCount = request.items.reduce(
                  (sum, item) => sum + decimalToNumber(item.quantity),
                  0,
                );

                return (
                  <Card
                    variant="detail"
                    key={request.id}
                    className="relative min-w-0 overflow-visible !bg-card/40 hover:!bg-card/40"
                  >
                    {request.status === "APPROVED" && request.approvedOrder ? (
                      <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
                        <div className="flex flex-col items-center gap-0.5 text-center">
                          <div className="relative">
                            <div
                              aria-hidden="true"
                              className="absolute left-1/2 top-0 z-0 h-8 w-[190px] -translate-x-1/2 rounded-b-md border border-violet-200 bg-violet-100 shadow-sm"
                            />
                            <Badge
                              variant="default"
                              className="relative z-10 mt-1.5 rounded-none border-0 bg-transparent p-4 leading-none text-violet-800 shadow-none"
                            >
                              Als Bestellung übernommen
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            Status:{" "}
                            <span className="font-medium">
                              {formatOrderProgress(request.approvedOrder.status, request.approvedOrder.approvalStatus)}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-start justify-between gap-3 pt-1 pl-1">
                      <div className="min-w-0">
                        <DetailText variant="kicker">Bestellnummer</DetailText>
                        <DetailText variant="value">
                          {request.approvedOrder?.orderNumber ?? "-"}
                        </DetailText>
                      </div>
                      <Badge variant={requestStatusBadgeVariant(request.status)} className="shrink-0">
                        {formatRequestStatus(request.status)}
                      </Badge>
                    </div>

                    <div className="my-4 h-px w-full bg-slate-300/70" aria-hidden="true" />

                    <div className="mt-5 grid grid-cols-4 gap-4">
                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Eingang</DetailText>
                          <DetailText variant="value">
                            {formatOrderDate(request.createdAt)}
                          </DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Bearbeitet</DetailText>
                          <DetailText variant="value">
                            {formatOrderDate(request.updatedAt)}
                          </DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Produkte</DetailText>
                          <DetailText variant="value" className="tabular-nums">
                            {requestItemCount}
                          </DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Lehrperson</DetailText>
                          <DetailText variant="value" className="min-w-0 truncate">
                            {request.teacherDisplayName}
                          </DetailText>
                        </div>
                      </Card>

                      <details className="group col-span-4 !rounded-sm bg-card/40 hover:bg-card/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none p-4 sm:p-5">
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

                        <div className="hidden group-open:block px-2 pb-2 sm:px-3 sm:pb-3">
                          <TableUI.Subtable className="rounded-sm" tableClassName="table-fixed">
                            <colgroup>
                              <col className="w-[60%]" />
                              <col className="w-[25%]" />
                              <col className="w-[15%]" />
                            </colgroup>
                            <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
                              <tr>
                                <TableUI.SubtableHead scope="col" className="min-w-0">
                                  Name
                                </TableUI.SubtableHead>
                                <TableUI.SubtableHead scope="col" className="whitespace-nowrap px-2 text-left">
                                  <span className="sr-only">SKU</span>
                                </TableUI.SubtableHead>
                                <TableUI.SubtableHead scope="col" className="whitespace-nowrap px-2 text-right">
                                  Menge
                                </TableUI.SubtableHead>
                              </tr>
                            </TableUI.SubtableHeader>
                            <TableUI.SubtableBody>
                              {request.items.map((item) => (
                                <TableUI.SubtableRow key={item.id}>
                                  <TableUI.SubtableCell className="min-w-0 text-sm font-medium text-foreground">
                                    <span className="block truncate">{item.product.name}</span>
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="whitespace-nowrap px-2 text-left">
                                    <SkuPill sku={item.product.sku} />
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="whitespace-nowrap px-2 text-right text-sm font-semibold tabular-nums text-foreground">
                                    {decimalToNumber(item.quantity)}{" "}
                                    <span className="font-medium text-muted-foreground">
                                      {item.product.baseUnit === "PCS" ? "Stk" : item.product.baseUnit}
                                    </span>
                                  </TableUI.SubtableCell>
                                </TableUI.SubtableRow>
                              ))}
                            </TableUI.SubtableBody>
                          </TableUI.Subtable>
                        </div>
                      </details>
                    </div>
                  </Card>
                );
              })}
            </div>
          </article>
        )}

        {showOwnOrders ? (
          <>
            {ordersQuery.isLoading && (
              <div className="p-5 text-slate-600">
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
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-6">
                {ordersQuery.data!.map((order) => {
                  const itemCount = order.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);

                  return (
                    <Card
                      variant="detail"
                      key={order.id}
                      className="relative min-w-0 overflow-visible !bg-card/40 hover:!bg-card/40"
                    >
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3 pt-1 pl-1">
                    <div className="justify-self-start">
                      <DetailText variant="kicker">
                        Bestellnummer
                      </DetailText>
                      <DetailText variant="value">
                        {order.orderNumber}
                      </DetailText>
                    </div>

                    <div className="justify-self-center self-start -mt-4">
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
                              Aus Schülerfreigabe
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            Schueler: {userLabel(order.sourceRequest.student)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="justify-self-end">
                      <Badge variant={orderProgressBadgeVariant(order.status, order.approvalStatus)}>
                        {formatOrderProgress(order.status, order.approvalStatus)}
                      </Badge>
                    </div>
                  </div>

                  {order.approvalStatus === "PENDING" ? (
                    <Card variant="static" className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <DetailText variant="kicker">Freigabe durch</DetailText>
                        <DetailText variant="value">
                          {order.pendingApprovers.length > 0 ? order.pendingApprovers.join(" oder ") : "-"}
                        </DetailText>
                      </div>
                      <Button
                        type="button"
                        variant="destructiveTransparent"
                        className="!h-9 !w-auto"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate({ orderId: order.id })}
                      >
                        Zurückziehen
                      </Button>
                    </Card>
                  ) : null}

                  {(order.approvalStatus === "REJECTED" || order.approvalStatus === "APPROVED") &&
                  (order.approvalNote || order.approvalDecidedBy) ? (
                    <Card variant={order.approvalStatus === "REJECTED" ? "warning" : "static"} className="mt-4">
                      <DetailText variant="kicker">
                        {order.approvalStatus === "REJECTED" ? "Abgelehnt" : "Freigegeben"}
                        {order.approvalDecidedBy ? ` von ${userLabel(order.approvalDecidedBy)}` : ""}
                      </DetailText>
                      {order.approvalNote ? (
                        <DetailText variant="value" className="whitespace-pre-wrap !font-normal">
                          {order.approvalNote}
                        </DetailText>
                      ) : null}
                    </Card>
                  ) : null}

                  <div className="mt-4 h-px w-full bg-slate-300/70" aria-hidden="true" />

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-4">
                    <Card variant="detail" className="min-w-0">
                      <DetailText variant="kicker">Datum</DetailText>
                      <DetailText variant="value" className="min-w-0 truncate">
                        {formatOrderDate(order.createdAt)}
                      </DetailText>
                    </Card>
                    <Card variant="detail" className="min-w-0">
                      <DetailText variant="kicker">Kostenstelle</DetailText>
                      <DetailText variant="value" className="min-w-0 truncate">
                        {order.costCenter.code} - {order.costCenter.name}
                      </DetailText>
                    </Card>
                    <Card variant="detail" className="min-w-0">
                      <DetailText variant="kicker">Produkte</DetailText>
                      <DetailText variant="value" className="min-w-0 truncate tabular-nums">
                        {itemCount}
                      </DetailText>
                    </Card>

                    <details className="group sm:col-span-3 rounded-md bg-card/40 hover:bg-card/60">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none p-4 sm:p-5">
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

                      <div className="hidden group-open:block px-2 pb-2 sm:px-3 sm:pb-3">
                        <TableUI.Subtable className="rounded-sm" tableClassName="table-fixed">
                        <colgroup>
                          <col className="w-[60%]" />
                          <col className="w-[25%]" />
                          <col className="w-[15%]" />
                        </colgroup>
                          <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
                            <tr>
                              <TableUI.SubtableHead scope="col" className="min-w-0">
                                Name
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead scope="col" className="whitespace-nowrap px-2 text-left">
                                <span className="sr-only">SKU</span>
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead scope="col" className="whitespace-nowrap px-2 text-right">
                                Menge
                              </TableUI.SubtableHead>
                            </tr>
                          </TableUI.SubtableHeader>
                          <TableUI.SubtableBody>
                            {order.items.map((item) => (
                              <TableUI.SubtableRow key={item.id}>
                                <TableUI.SubtableCell className="min-w-0 text-sm font-medium text-foreground">
                                  <span className="block truncate">{item.product.name}</span>
                                </TableUI.SubtableCell>
                                <TableUI.SubtableCell className="whitespace-nowrap px-2 text-left">
                                  <SkuPill sku={item.product.sku} />
                                </TableUI.SubtableCell>
                                <TableUI.SubtableCell className="whitespace-nowrap px-2 text-right text-sm font-semibold tabular-nums text-foreground">
                                  {decimalToNumber(item.quantity)}{" "}
                                  <span className="font-medium text-muted-foreground">
                                    {item.product.baseUnit === "PCS" ? "Stk" : item.product.baseUnit}
                                  </span>
                                </TableUI.SubtableCell>
                              </TableUI.SubtableRow>
                            ))}
                          </TableUI.SubtableBody>
                        </TableUI.Subtable>
                      </div>
                    </details>
                  </div>
                  </Card>
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
