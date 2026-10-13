"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { useToast } from "~/components/ui/toast";
import { Card, DetailText } from "~/components/ui/detail-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/input";
import { NumberStepper } from "~/components/ui/number-stepper";
import { Select } from "~/components/ui/select";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";
import * as TableUI from "~/components/ui/table";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) return Number(String(value));
  return 0;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(value);
}

function userLabel(user: { name: string | null; email: string | null } | null | undefined) {
  return user?.name?.trim() || user?.email?.trim() || "Unbekannt";
}

function unitLabel(baseUnit: string) {
  return baseUnit === "PCS" ? "Stk" : baseUnit;
}

export function useOrderApprovals() {
  return api.approval.listPending.useQuery();
}

export function OrderApprovalsSection() {
  const utils = api.useUtils();
  const toast = useToast();
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("freigabe");
  const focusRef = useRef<HTMLDivElement | null>(null);

  const pendingQuery = useOrderApprovals();
  const decidedQuery = api.approval.listDecidedByMe.useQuery();
  const costCentersQuery = api.cart.listCostCenters.useQuery();

  const [costCenterByOrderId, setCostCenterByOrderId] = useState<Record<string, string>>({});
  const [noteByOrderId, setNoteByOrderId] = useState<Record<string, string>>({});
  const [quantityDraftByItemId, setQuantityDraftByItemId] = useState<Record<string, string>>({});

  const invalidate = async () => {
    await Promise.all([
      utils.approval.listPending.invalidate(),
      utils.approval.listDecidedByMe.invalidate(),
      utils.approval.pendingCount.invalidate(),
    ]);
  };

  const updateQuantityMutation = api.approval.updateItemQuantity.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Menge gespeichert.");
    },
  });
  const removeItemMutation = api.approval.removeItem.useMutation({ onSuccess: invalidate });
  const approveMutation = api.approval.approve.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Bestellung freigegeben und an das Lager weitergeleitet.");
    },
  });
  const rejectMutation = api.approval.reject.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Bestellung abgelehnt.");
    },
  });

  const isBusy =
    updateQuantityMutation.isPending ||
    removeItemMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;
  const actionError =
    updateQuantityMutation.error?.message ??
    removeItemMutation.error?.message ??
    approveMutation.error?.message ??
    rejectMutation.error?.message;

  const pendingOrders = pendingQuery.data ?? [];
  const decidedOrders = decidedQuery.data ?? [];

  useEffect(() => {
    if (focusOrderId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusOrderId, pendingOrders.length]);

  if (pendingQuery.isLoading) {
    return <div className="rounded-md bg-card/40 p-5 text-slate-600">Bestellfreigaben werden geladen...</div>;
  }

  if (pendingOrders.length === 0 && decidedOrders.length === 0) return null;

  return (
    <section className="space-y-4">
      {pendingOrders.length > 0 ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bestellungen zur Freigabe</h2>
            <p className="text-sm text-muted-foreground">
              Diese Bestellungen werden erst nach deiner Freigabe an das Lager weitergeleitet.
            </p>
          </div>

          {actionError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {pendingOrders.map((order) => {
              const costCenterId = costCenterByOrderId[order.id] ?? order.costCenter.id;
              const note = noteByOrderId[order.id] ?? "";
              const isFocused = order.id === focusOrderId;

              return (
                <div key={order.id} ref={isFocused ? focusRef : undefined} className="scroll-mt-32">
                  <Card
                    variant="detail"
                    className={`relative min-w-0 !bg-card/40 hover:!bg-card/40 ${isFocused ? "ring-2 ring-primary/60" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <DetailText variant="kicker">Bestellnummer</DetailText>
                        <DetailText variant="value">{order.orderNumber}</DetailText>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="orderFirst">Wartet auf Freigabe</Badge>
                        <span className="text-xs text-muted-foreground">
                          {order.approvalGroup ? `Gruppe: ${order.approvalGroup.name}` : "Ohne Gruppe (Fallback)"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Card variant="detail">
                        <DetailText variant="kicker">Besteller/in</DetailText>
                        <DetailText variant="value" className="min-w-0 truncate">
                          {userLabel(order.user)}
                        </DetailText>
                        {order.sourceRequest ? (
                          <DetailText variant="subvalue" className="truncate">
                            für {userLabel(order.sourceRequest.student)}
                          </DetailText>
                        ) : null}
                      </Card>
                      <Card variant="detail">
                        <DetailText variant="kicker">Eingang</DetailText>
                        <DetailText variant="value">{formatDate(order.createdAt)}</DetailText>
                      </Card>
                      <Card variant="detail">
                        <DetailText variant="kicker">Summe</DetailText>
                        <DetailText variant="value" className="tabular-nums">
                          {formatEuro(order.total)}
                        </DetailText>
                      </Card>
                    </div>

                    {order.workerNote ? (
                      <Card variant="static" className="mt-3">
                        <DetailText variant="kicker">Hinweis für Lager</DetailText>
                        <DetailText variant="value" className="whitespace-pre-wrap !font-normal">
                          {order.workerNote}
                        </DetailText>
                      </Card>
                    ) : null}

                    <div className="mt-4 space-y-3">
                      {order.items.map((item) => {
                        const step = getQuantityStepForBaseUnit(item.product.baseUnit);
                        const draft = quantityDraftByItemId[item.id] ?? decimalToNumber(item.quantity).toString();
                        const draftChanged = Number(draft) !== decimalToNumber(item.quantity);
                        return (
                          <Card variant="detail" key={item.id}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{item.product.name}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatEuro(decimalToNumber(item.product.price))} / {unitLabel(item.product.baseUnit)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-start gap-2">
                              <div className="flex flex-col items-center">
                                <NumberStepper
                                  value={draft}
                                  onChange={(next) =>
                                    setQuantityDraftByItemId((current) => ({ ...current, [item.id]: next }))
                                  }
                                  min={step}
                                  step={step}
                                  disabled={isBusy}
                                  decreaseAriaLabel={`Menge für ${item.product.name} verringern`}
                                  increaseAriaLabel={`Menge für ${item.product.name} erhöhen`}
                                  inputAriaLabel={`Menge für ${item.product.name}`}
                                  className="shadow-xs"
                                />
                                <p className="mt-1 text-center text-[11px] text-slate-500">
                                  Verfügbar: {decimalToNumber(item.product.quantityOnHand)} {unitLabel(item.product.baseUnit)}
                                </p>
                              </div>
                              <Button
                                variant="solid"
                                type="button"
                                disabled={isBusy || !draftChanged}
                                onClick={() => {
                                  const quantity = Number(draft);
                                  if (!Number.isFinite(quantity) || quantity <= 0) return;
                                  updateQuantityMutation.mutate({ orderId: order.id, itemId: item.id, quantity });
                                }}
                                className="!h-9 !w-auto shrink-0 text-xs"
                              >
                                Menge speichern
                              </Button>
                              <Button
                                variant="destructive"
                                type="button"
                                disabled={isBusy || order.items.length <= 1}
                                onClick={() => removeItemMutation.mutate({ orderId: order.id, itemId: item.id })}
                                className="!h-9 !w-auto shrink-0 text-xs"
                              >
                                Position entfernen
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <DetailText variant="kicker">Kostenstelle</DetailText>
                        <Select
                          id={`approval-cc-${order.id}`}
                          value={costCenterId}
                          onValueChange={(next) =>
                            setCostCenterByOrderId((current) => ({ ...current, [order.id]: next }))
                          }
                          disabled={costCentersQuery.isLoading || isBusy}
                          options={[
                            ...(costCentersQuery.data ?? []).map((center) => ({
                              value: center.id,
                              label: center.name,
                            })),
                            ...((costCentersQuery.data ?? []).some((center) => center.id === order.costCenter.id)
                              ? []
                              : [{ value: order.costCenter.id, label: `${order.costCenter.name} (inaktiv)` }]),
                          ]}
                          className="!mt-1 w-full px-2.5 py-2 text-sm text-slate-900"
                        />
                      </div>
                      <div>
                        <DetailText variant="kicker">Kommentar / Begründung</DetailText>
                        <Textarea
                          value={note}
                          onChange={(event) =>
                            setNoteByOrderId((current) => ({ ...current, [order.id]: event.target.value }))
                          }
                          maxLength={1000}
                          rows={2}
                          className="mt-1"
                          placeholder="Optional bei Freigabe, Pflicht bei Ablehnung"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="destructive"
                          className="!h-9"
                          disabled={isBusy || note.trim().length === 0}
                          title={note.trim().length === 0 ? "Bitte eine Begründung eingeben" : undefined}
                          onClick={() => rejectMutation.mutate({ orderId: order.id, note: note.trim() })}
                        >
                          {rejectMutation.isPending ? "Wird abgelehnt..." : "Ablehnen"}
                        </Button>
                        <Button
                          type="button"
                          variant="solid"
                          className="!h-9"
                          disabled={isBusy || !costCenterId}
                          onClick={() =>
                            approveMutation.mutate({
                              orderId: order.id,
                              costCenterId,
                              note: note.trim() || undefined,
                            })
                          }
                        >
                          {approveMutation.isPending ? "Wird freigegeben..." : "Freigeben"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {decidedOrders.length > 0 ? (
        <details className="group rounded-md bg-card/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none p-4">
            <p className="text-base font-semibold text-slate-900">Von mir entschiedene Bestellungen</p>
            <span className="text-xs font-medium text-slate-600 group-open:hidden">Anzeigen</span>
            <span className="hidden text-xs font-medium text-slate-600 group-open:inline">Ausblenden</span>
          </summary>
          <div className="hidden px-3 pb-3 group-open:block">
            <TableUI.Subtable className="rounded-sm">
              <TableUI.SubtableHeader>
                <tr>
                  <TableUI.SubtableHead scope="col">Bestellung</TableUI.SubtableHead>
                  <TableUI.SubtableHead scope="col">Besteller/in</TableUI.SubtableHead>
                  <TableUI.SubtableHead scope="col">Entschieden</TableUI.SubtableHead>
                  <TableUI.SubtableHead scope="col" className="text-right">
                    Summe
                  </TableUI.SubtableHead>
                  <TableUI.SubtableHead scope="col" className="text-right">
                    Status
                  </TableUI.SubtableHead>
                </tr>
              </TableUI.SubtableHeader>
              <TableUI.SubtableBody>
                {decidedOrders.map((order) => (
                  <TableUI.SubtableRow key={order.id}>
                    <TableUI.SubtableCell className="font-medium">{order.orderNumber}</TableUI.SubtableCell>
                    <TableUI.SubtableCell className="truncate">{userLabel(order.user)}</TableUI.SubtableCell>
                    <TableUI.SubtableCell className="whitespace-nowrap">
                      {order.approvalDecidedAt ? formatDate(order.approvalDecidedAt) : "-"}
                    </TableUI.SubtableCell>
                    <TableUI.SubtableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatEuro(order.total)}
                    </TableUI.SubtableCell>
                    <TableUI.SubtableCell className="text-right">
                      <Badge
                        variant={order.approvalStatus === "APPROVED" ? "orderThird" : "destructive"}
                        title={order.approvalNote ?? undefined}
                      >
                        {order.approvalStatus === "APPROVED" ? "Freigegeben" : "Abgelehnt"}
                      </Badge>
                    </TableUI.SubtableCell>
                  </TableUI.SubtableRow>
                ))}
              </TableUI.SubtableBody>
            </TableUI.Subtable>
          </div>
        </details>
      ) : null}
    </section>
  );
}
