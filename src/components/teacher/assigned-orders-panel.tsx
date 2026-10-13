"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { useToast } from "~/components/ui/toast";
import { Card, DetailText } from "../ui/detail-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { NumberStepper } from "~/components/ui/number-stepper";
import { Select } from "~/components/ui/select";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";
import * as TableUI from "~/components/ui/table";
import { OrderApprovalsSection, useOrderApprovals } from "~/components/teacher/order-approvals-section";

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

function requestStatusLabel(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  return "Abgelehnt";
}

function requestStatusBadgeVariant(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "orderFirst";
  if (status === "APPROVED") return "orderThird";
  if (status === "REJECTED") return "destructive";
  return "default";
}

function approvedOrderStatusLabel(status: "OPEN" | "PREPARING" | "READY_FOR_PICKUP") {
  if (status === "OPEN") return "Offen";
  if (status === "PREPARING") return "In Vorbereitung";
  return "Abholbereit";
}

export function AssignedOrdersPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const [costCenterByRequestId, setCostCenterByRequestId] = useState<Record<string, string>>({});
  const [quantityDraftByItemId, setQuantityDraftByItemId] = useState<Record<string, string>>({});

  const requestsQuery = api.order.listAssignedRequests.useQuery();
  const costCentersQuery = api.cart.listCostCenters.useQuery();

  const invalidateAfterRequestChange = async () => {
    await Promise.all([
      utils.order.listAssignedRequests.invalidate(),
      utils.cart.listMyOrders.invalidate(),
      utils.cart.listMySubmittedRequests.invalidate(),
    ]);
  };

  const updateItemQuantityMutation = api.order.updateAssignedRequestItemQuantity.useMutation({
    onSuccess: async () => {
      await invalidateAfterRequestChange();
    },
  });
  const removeItemMutation = api.order.removeAssignedRequestItem.useMutation({
    onSuccess: async () => {
      await invalidateAfterRequestChange();
    },
  });
  const rejectMutation = api.order.rejectAssignedRequest.useMutation({
    onSuccess: async () => {
      await invalidateAfterRequestChange();
      toast.success("Bestellung abgelehnt.");
    },
  });
  const approveMutation = api.order.approveAssignedRequest.useMutation({
    onSuccess: async () => {
      await invalidateAfterRequestChange();
      toast.success("Bestellung freigegeben.");
    },
  });

  const loanRequestsQuery = api.loan.listPendingLoanRequests.useQuery();
  const orderApprovalsQuery = useOrderApprovals();
  const decidedApprovalsQuery = api.approval.listDecidedByMe.useQuery();

  const invalidateAfterLoanAction = async () => {
    await Promise.all([
      utils.loan.listPendingLoanRequests.invalidate(),
      utils.loan.listMyLoans.invalidate(),
    ]);
  };

  const approveLoanMutation = api.loan.teacherApproveLoan.useMutation({
    onSuccess: async () => {
      await invalidateAfterLoanAction();
      toast.success("Ausleihe freigegeben.");
    },
  });

  const rejectLoanMutation = api.loan.teacherRejectLoan.useMutation({
    onSuccess: async () => {
      await invalidateAfterLoanAction();
      toast.success("Ausleihe abgelehnt.");
    },
  });

  const pendingRequests = useMemo(
    () => (requestsQuery.data ?? []).filter((request) => request.status === "PENDING"),
    [requestsQuery.data],
  );
  const completedRequests = useMemo(
    () => (requestsQuery.data ?? []).filter((request) => request.status !== "PENDING"),
    [requestsQuery.data],
  );
  const isAnyMutationPending =
    updateItemQuantityMutation.isPending ||
    removeItemMutation.isPending ||
    rejectMutation.isPending ||
    approveMutation.isPending ||
    approveLoanMutation.isPending ||
    rejectLoanMutation.isPending;
  const actionErrorMessage =
    updateItemQuantityMutation.error?.message ??
    removeItemMutation.error?.message ??
    rejectMutation.error?.message ??
    approveMutation.error?.message ??
    approveLoanMutation.error?.message ??
    rejectLoanMutation.error?.message;

  const pendingLoanRequests = loanRequestsQuery.data ?? [];

  return (
    <main className="mx-auto flex min-h-screen w-[90%] max-w-none flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

      <OrderApprovalsSection />

      <section className="space-y-4">
        {requestsQuery.isLoading && (
          <div className="rounded-md bg-card/40 p-5 text-slate-600">
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

        {!requestsQuery.isLoading &&
          !requestsQuery.error &&
          pendingRequests.length === 0 &&
          completedRequests.length === 0 &&
          !loanRequestsQuery.isLoading &&
          pendingLoanRequests.length === 0 &&
          !orderApprovalsQuery.isLoading &&
          (orderApprovalsQuery.data?.length ?? 0) === 0 &&
          (decidedApprovalsQuery.data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-semibold">Aktuell keine Freigaben vorhanden.</p>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {pendingRequests.map((request) => {
              const selectedCostCenter = costCenterByRequestId[request.id] ?? "";
              const itemCount = request.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);
              const hasItems = request.items.length > 0;
              const canApprove =
                selectedCostCenter.length > 0 &&
                hasItems &&
                !isAnyMutationPending &&
                !costCentersQuery.isLoading;

              return (
                <Card
                  variant="detail"
                  key={request.id}
                  className="relative min-w-0 overflow-visible !bg-card/40 hover:!bg-card/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <DetailText variant="value">
                      Offene Freigabe
                      
                    </DetailText>
                    <Badge variant={requestStatusBadgeVariant(request.status)}>
                      {requestStatusLabel(request.status)}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card variant="detail">
                      <DetailText variant="kicker">Schüler</DetailText>
                      <DetailText variant="value" className="min-w-0 truncate">
                        {studentLabel(request.student)}
                      </DetailText>
                    </Card>
                    <Card variant="detail">
                      <DetailText variant="kicker">Eingang</DetailText>
                      <DetailText variant="value">{formatDate(request.createdAt)}</DetailText>
                    </Card>
                    <Card variant="detail">
                      <DetailText variant="kicker">Artikel gesamt</DetailText>
                      <DetailText variant="value">{itemCount}</DetailText>
                    </Card>
                  </div>

                  <div className="my-4 h-px w-full bg-slate-300/70" aria-hidden="true" />

                  <details className="group mt-4 !rounded-md bg-card/40 transition hover:bg-card/60 open:hover:bg-card/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none p-4 sm:p-5">
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold text-slate-900">Positionen
                          <span className="text-xs font-medium text-slate-600"> - unbedingt durschauen</span>
                        </p>
                      </div>
                      <span className="text-xs font-medium text-slate-600 group-open:hidden">Anzeigen</span>
                      <span className="hidden text-xs font-medium text-slate-600 group-open:inline">
                        Ausblenden
                      </span>
                    </summary>

                    <div className="hidden group-open:block px-2 pb-2 sm:px-3 sm:pb-3">
                      {!hasItems ? (
                        <p className="text-sm text-slate-600">
                          Keine Positionen mehr vorhanden. Bitte Anfrage ablehnen.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                      {request.items.map((item) => (
                        <Card variant="detail" key={item.id}>
                          <div className="flex flex-wrap items-center justify-start gap-3">
                            <span className="font-medium text-slate-900">{item.product.name}</span>                            
                          </div>

                          <div className="mt-3 flex flex-wrap items-start gap-2">
                            <div className="flex flex-col items-center">
                              <NumberStepper
                                value={
                                  quantityDraftByItemId[item.id] ?? decimalToNumber(item.quantity).toString()
                                }
                                onChange={(next) =>
                                  setQuantityDraftByItemId((current) => ({
                                    ...current,
                                    [item.id]: next,
                                  }))
                                }
                                min={getQuantityStepForBaseUnit(item.product.baseUnit)}
                                step={getQuantityStepForBaseUnit(item.product.baseUnit)}
                                disabled={isAnyMutationPending}
                                decreaseAriaLabel={`Menge für ${item.product.name} verringern`}
                                increaseAriaLabel={`Menge für ${item.product.name} erhöhen`}
                                inputAriaLabel={`Menge für ${item.product.name}`}
                                className="shadow-xs"
                              />
                              <p className="mt-1 text-center text-[11px] text-slate-500">
                                Verfügbar: {decimalToNumber(item.product.quantityOnHand)}{" "}
                                {item.product.baseUnit === "PCS" ? "Stk" : item.product.baseUnit}
                              </p>
                            </div>
                            <Button
                              variant="solid"
                              type="button"
                              onClick={() => {
                                const draftValue = quantityDraftByItemId[item.id];
                                const nextQuantity = Number(draftValue ?? decimalToNumber(item.quantity));
                                if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

                                updateItemQuantityMutation.mutate({
                                  requestId: request.id,
                                  itemId: item.id,
                                  quantity: nextQuantity,
                                });
                              }}
                              disabled={isAnyMutationPending}
                              className="!h-9 !w-auto !max-w-[180px] shrink-0 transition text-xs"
                            >
                              Menge speichern
                            </Button>
                            <Button
                              variant="destructive"
                              type="button"
                              onClick={() =>
                                removeItemMutation.mutate({
                                  requestId: request.id,
                                  itemId: item.id,
                                })
                              }
                              disabled={isAnyMutationPending}
                              className="!h-9 !w-auto !max-w-[180px] shrink-0 transition text-xs"
                            >
                              Position entfernen
                            </Button>
                          </div>
                        </Card>
                      ))}
                        </ul>
                      )}
                    </div>
                  </details>

                  <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
                    <div className="min-w-0">
                      <Select
                        id={`cc-${request.id}`}
                        value={selectedCostCenter}
                        onValueChange={(nextCostCenterId) =>
                          setCostCenterByRequestId((current) => ({
                            ...current,
                            [request.id]: nextCostCenterId,
                          }))
                        }
                        disabled={costCentersQuery.isLoading || isAnyMutationPending}
                        placeholder="Kostenstelle wählen"
                        options={[
                          { value: "", label: "Kostenstelle wählen" },
                          ...(costCentersQuery.data ?? []).map((center) => ({
                            value: center.id,
                            label: `${center.code} - ${center.name}`,
                          })),
                        ]}
                        className="!mt-0 w-full px-2.5 py-2 text-sm text-slate-900"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => rejectMutation.mutate({ requestId: request.id })}
                      disabled={isAnyMutationPending}
                      className="!h-9"
                    >
                      {rejectMutation.isPending ? "Wird abgelehnt..." : "Anfrage ablehnen"}
                    </Button>
                    <Button
                      type="button"
                      variant="solid"
                      onClick={() =>
                        approveMutation.mutate({
                          requestId: request.id,
                          costCenterId: selectedCostCenter,
                        })
                      }
                      disabled={!canApprove}
                      className="!h-9"
                    >
                      {approveMutation.isPending ? "Wird bestellt..." : "Bestellung final absenden"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {loanRequestsQuery.isLoading && pendingLoanRequests.length === 0 ? (
          <div className="rounded-md bg-card/40 p-5 text-slate-600">
            Ausleihanfragen werden geladen...
          </div>
        ) : null}

        {loanRequestsQuery.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
            <p className="text-sm font-semibold">Ausleihanfragen konnten nicht geladen werden.</p>
            <button
              onClick={() => void loanRequestsQuery.refetch()}
              className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
            >
              Erneut laden
            </button>
          </div>
        ) : null}

        {pendingLoanRequests.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">Offene Ausleihfreigaben</h2>
              <p className="mt-1 text-sm text-amber-800">
                Diese Ausleihanfragen warten auf deine endgueltige Entscheidung.
              </p>
            </div>

            {pendingLoanRequests.map((request) => {
              const itemCount = request.items.reduce((sum, item) => sum + decimalToNumber(item.quantityRequested), 0);
              const hasItems = request.items.length > 0;
              return (
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm text-slate-500">{studentLabel(request.borrower)}</h3>
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
                      {request.teacherDisplayName ?? "-"}
                    </p>
                    <p>
                      <span className="text-slate-500">Artikel gesamt: </span>
                      {itemCount}
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-800">Positionen</p>
                    {!hasItems ? (
                      <p className="mt-2 text-sm text-slate-600">Keine Positionen vorhanden.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {request.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            <span className="font-medium text-slate-900">{item.lendableItem.name}</span>
                            <span>
                              {decimalToNumber(item.quantityRequested)} Stk
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => rejectLoanMutation.mutate({ loanId: request.id })}
                      disabled={!hasItems || isAnyMutationPending || rejectLoanMutation.isPending}
                      className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rejectLoanMutation.isPending ? "Wird abgelehnt..." : "Anfrage ablehnen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => approveLoanMutation.mutate({ loanId: request.id })}
                      disabled={!hasItems || isAnyMutationPending || approveLoanMutation.isPending}
                      className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {approveLoanMutation.isPending ? "Wird freigegeben..." : "Freigeben"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {completedRequests.length > 0 && (
          <div className="space-y-3 mt-6 ">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {completedRequests.map((request) => {
                const itemCount = request.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);

                return (
                  <Card
                    variant="detail"
                    key={request.id}
                    className="relative min-w-0 overflow-visible !bg-card/40 hover:!bg-card/40"
                  >
                    {request.status === "APPROVED" && request.approvedOrder ? (
                      <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 ">
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
                              {approvedOrderStatusLabel(request.approvedOrder.status)}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-start justify-between gap-3 pt-1 pl-1">
                      <div className="min-w-0">
                        <DetailText variant="kicker">
                          Bestellnummer
                        </DetailText>
                        <DetailText variant="value">
                          {request.approvedOrder?.orderNumber ?? "-"}
                        </DetailText>
                      </div>
                      <Badge variant={requestStatusBadgeVariant(request.status)}>
                          {requestStatusLabel(request.status)}
                      </Badge>
                    </div>

                    <div className="my-4 h-px w-full bg-slate-300/70" aria-hidden="true" />

                    <div className="mt-5 grid grid-cols-4 gap-4">
                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Eingang</DetailText>
                          <DetailText variant="value">{formatDate(request.createdAt)}</DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Bearbeitet</DetailText>
                          <DetailText variant="value">{formatDate(request.updatedAt)}</DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Produkte</DetailText>
                          <DetailText variant="value">{itemCount}</DetailText>
                        </div>
                      </Card>

                      <Card variant="detail">
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Schüler</DetailText>
                          <DetailText variant="value" className="min-w-0 truncate">
                            {studentLabel(request.student)}
                          </DetailText>
                        </div>
                      </Card>

                      <details className="group col-span-4 !rounded-sm bg-card/40 hover:bg-card/60 transition">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none p-4 sm:p-5">
                          <div className="flex items-baseline gap-2">
                            <p className="text-base font-semibold text-slate-900">Positionen</p>
                          </div>
                          <span className="text-xs font-medium text-slate-600 group-open:hidden">Anzeigen</span>
                          <span className="hidden text-xs font-medium text-slate-600 group-open:inline">
                            Ausblenden
                          </span>
                        </summary>

                        <div className="hidden group-open:block px-2 pb-2 sm:px-3 sm:pb-3">
                          {request.items.length === 0 ? (
                            <p className="text-sm text-slate-600">Keine Positionen vorhanden.</p>
                          ) : (
                            <TableUI.Subtable className="rounded-sm">
                              <TableUI.SubtableHeader>
                                <tr>
                                  <TableUI.SubtableHead scope="col">Name</TableUI.SubtableHead>
                                  <TableUI.SubtableHead scope="col" className="text-right">
                                    Menge
                                  </TableUI.SubtableHead>
                                </tr>
                              </TableUI.SubtableHeader>
                              <TableUI.SubtableBody>
                                {request.items.map((item) => (
                                  <TableUI.SubtableRow key={item.id}>
                                    <TableUI.SubtableCell className="min-w-0">
                                      <span className="block min-w-0 truncate font-medium">
                                        {item.product.name}
                                      </span>
                                    </TableUI.SubtableCell>
                                    <TableUI.SubtableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                                      {decimalToNumber(item.quantity)}{" "}
                                      <span className="font-medium text-muted-foreground">
                                        {item.product.baseUnit.toLowerCase()}
                                      </span>
                                    </TableUI.SubtableCell>
                                  </TableUI.SubtableRow>
                                ))}
                              </TableUI.SubtableBody>
                            </TableUI.Subtable>
                          )}
                        </div>
                      </details>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
