"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { useToast } from "~/components/ui/toast";
import { DetailCard, DetailText } from "../ui/detail-card";
import { Badge } from "~/components/ui/badge"
import * as TableUI from "~/components/ui/table";

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
  if (status === "PENDING") return "orderSecond";
  if (status === "APPROVED") return "orderThird";
  return "orderFirst";
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

        {actionErrorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm">
            Aktion fehlgeschlagen: {actionErrorMessage}
          </div>
        )}

        {!requestsQuery.isLoading &&
          !requestsQuery.error &&
          pendingRequests.length === 0 &&
          completedRequests.length === 0 &&
          !loanRequestsQuery.isLoading &&
          pendingLoanRequests.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-semibold">Aktuell keine Freigaben vorhanden.</p>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <h2 className="text-sm font-semibold text-sky-900">Offene Freigaben</h2>
              <p className="mt-1 text-sm text-sky-800">
                Diese Anfragen warten auf deine finale Entscheidung.
              </p>
            </div>
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
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm text-slate-500">{studentLabel(request.student)}</h3>
                    <Badge
                      variant={requestStatusBadgeVariant(request.status)}
                    >
                      {requestStatusLabel(request.status)}
                    </Badge>
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
                    {!hasItems ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Keine Positionen mehr vorhanden. Bitte Anfrage ablehnen.
                      </p>
                    ) : null}
                    <ul className="mt-2 space-y-3">
                      {request.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{item.product.name}</span>
                            <span className="text-slate-600">{item.product.baseUnit.toLowerCase()}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={quantityDraftByItemId[item.id] ?? decimalToNumber(item.quantity).toString()}
                              onChange={(event) =>
                                setQuantityDraftByItemId((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              disabled={isAnyMutationPending}
                              className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <button
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
                              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Menge speichern
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                removeItemMutation.mutate({
                                  requestId: request.id,
                                  itemId: item.id,
                                })
                              }
                              disabled={isAnyMutationPending}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Position entfernen
                            </button>
                          </div>
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
                      disabled={costCentersQuery.isLoading || isAnyMutationPending}
                    >
                      <option value="">Bitte Kostenstelle waehlen</option>
                      {costCentersQuery.data?.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.code} - {center.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate({ requestId: request.id })}
                      disabled={isAnyMutationPending}
                      className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rejectMutation.isPending ? "Wird abgelehnt..." : "Anfrage ablehnen"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        approveMutation.mutate({
                          requestId: request.id,
                          costCenterId: selectedCostCenter,
                        })
                      }
                      disabled={!canApprove}
                      className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {approveMutation.isPending ? "Wird bestellt..." : "Bestellung final absenden"}
                    </button>
                  </div>
                </article>
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
                  <DetailCard
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

                    <div className="flex items-center justify-between gap-3 pt-1 pl-1">
                      <div className="min-w-0">
                        <DetailText variant="kicker">
                          Bestellnummer
                        </DetailText>
                        <DetailText variant="value">
                          {request.approvedOrder?.orderNumber}
                        </DetailText>
                      </div>
                      <Badge variant={requestStatusBadgeVariant(request.status)}>
                          {requestStatusLabel(request.status)}
                      </Badge>
                    </div>

                    <div className="my-4 h-px w-full bg-slate-300/70" aria-hidden="true" />

                    <div className="mt-5 grid grid-cols-4 gap-4">
                      <DetailCard>
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Eingang</DetailText>
                          <DetailText variant="value">{formatDate(request.createdAt).split(",")[0]}</DetailText>
                        </div>
                      </DetailCard>

                      <DetailCard>
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Bearbeitet</DetailText>
                          <DetailText variant="value">{formatDate(request.updatedAt).split(",")[0]}</DetailText>
                        </div>
                      </DetailCard>

                      <DetailCard>
                        <div className="flex min-w-0 flex-col gap-1">
                          <DetailText variant="kicker">Produkte</DetailText>
                          <DetailText variant="value">{itemCount}</DetailText>
                        </div>
                      </DetailCard>

                      <DetailCard>
                        <div className="flex min-w-0 flex-col gap-1">
                          {request.status === "APPROVED" && request.approvedOrder ? (
                            <>
                              <DetailText variant="kicker">Lehrperson</DetailText>
                              <DetailText variant="value">{request.teacherDisplayName}</DetailText>
                            </>
                          ) : (
                            <>
                              <DetailText variant="kicker">Bestellnummer</DetailText>
                              <DetailText variant="value">-</DetailText>
                            </>
                          )}
                        </div>
                      </DetailCard>



                      {request.status === "REJECTED" ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
                          <p className="font-semibold">Anfrage abgelehnt.</p>
                        </div>
                      ) : null}

                      <details className="group col-span-4 !rounded-sm bg-card/40 hover:bg-card/60">
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
                  </DetailCard>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
