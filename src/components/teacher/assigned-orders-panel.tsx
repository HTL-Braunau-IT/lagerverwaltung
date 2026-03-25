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

function requestStatusLabel(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  return "Abgelehnt";
}

function requestStatusBadgeClass(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "PENDING") return "bg-amber-100 text-amber-900";
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-900";
  return "bg-rose-100 text-rose-900";
}

export function AssignedOrdersPanel() {
  const utils = api.useUtils();
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
    },
  });
  const approveMutation = api.order.approveAssignedRequest.useMutation({
    onSuccess: async () => {
      await invalidateAfterRequestChange();
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
    },
  });

  const rejectLoanMutation = api.loan.teacherRejectLoan.useMutation({
    onSuccess: async () => {
      await invalidateAfterLoanAction();
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
                    <h3 className="text-lg font-semibold text-slate-900">{studentLabel(request.student)}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${requestStatusBadgeClass(request.status)}`}
                    >
                      {requestStatusLabel(request.status)}
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
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
                    <h3 className="text-lg font-semibold text-slate-900">{studentLabel(request.borrower)}</h3>
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
                      {approveLoanMutation.isPending ? "Wird freigegeben..." : "Ausleihe freigeben"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {completedRequests.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Abgeschlossene Freigaben</h2>
              <p className="mt-1 text-sm text-slate-600">
                Bereits bearbeitete Anfragen inklusive Freigabe-Ergebnis.
              </p>
            </div>
            {completedRequests.map((request) => {
              const itemCount = request.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);
              return (
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{studentLabel(request.student)}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${requestStatusBadgeClass(request.status)}`}
                    >
                      {requestStatusLabel(request.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                    <p>
                      <span className="text-slate-500">Eingang: </span>
                      {formatDate(request.createdAt)}
                    </p>
                    <p>
                      <span className="text-slate-500">Bearbeitet: </span>
                      {formatDate(request.updatedAt)}
                    </p>
                    <p>
                      <span className="text-slate-500">Artikel gesamt: </span>
                      {itemCount}
                    </p>
                  </div>

                  {request.status === "APPROVED" && request.approvedOrder ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      <p className="font-semibold">Freigabe erfolgreich als Bestellung uebernommen.</p>
                      <p className="mt-1">
                        Bestellnummer: <span className="font-medium">{request.approvedOrder.orderNumber}</span>
                      </p>
                      <p className="mt-1">
                        Status: <span className="font-medium">{request.approvedOrder.status}</span>
                      </p>
                    </div>
                  ) : null}

                  {request.status === "REJECTED" ? (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      Diese Anfrage wurde abgelehnt.
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-800">Positionen</p>
                    {request.items.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-600">Keine Positionen vorhanden.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {request.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            <span className="font-medium text-slate-900">{item.product.name}</span>
                            <span>
                              {decimalToNumber(item.quantity)} {item.product.baseUnit.toLowerCase()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
