"use client";

import { Fragment, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button, buttonClassName, type ButtonVariant } from "~/components/ui/button";
import { Card, DetailText } from "~/components/ui/detail-card";
import { Dialog } from "~/components/ui/dialog";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { NumberStepper } from "~/components/ui/number-stepper";
import { Card as ShellCard } from "~/components/ui/card";
import * as TableUI from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";
import { ChevronDownIcon, PencilEditIcon } from "~/components/layout/icon-renders";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";

type OrderStatus = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";
const ORDER_STATUSES: OrderStatus[] = ["OPEN", "PREPARING", "READY_FOR_PICKUP"];

type OrderStatusActionVariant = Extract<ButtonVariant, "solid" | "glass">;

function OrderStatusActionButton(props: {
  variant: OrderStatusActionVariant;
  actionLabel: string;
  nextStatusLabel: string;
  isMenuOpen: boolean;
  disabled: boolean;
  onAdvance: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  menuButtonRef: (node: HTMLButtonElement | null) => void;
}) {
  const { variant, actionLabel, nextStatusLabel, isMenuOpen, disabled, onAdvance, onToggleMenu, menuButtonRef } =
    props;

  return (
    <div
      aria-disabled={disabled}
      className={buttonClassName({
        variant,
        size: "sm",
        className:
          "h-8 w-[13.5rem] max-w-[13.5rem] overflow-hidden rounded-sm !px-0 !py-0 !items-stretch !justify-start hover:!opacity-80",
      })}
    >
      <button
        type="button"
        onClick={onAdvance}
        disabled={disabled}
        aria-label={`Status auf ${nextStatusLabel} setzen`}
        className="flex h-full min-w-0 flex-1 items-center justify-center text-center text-xs text-current transition"
      >
        {actionLabel}
      </button>
      <span aria-hidden="true" className="shrink-0 self-center text-xs text-border select-none">
        |
      </span>
      <button
        type="button"
        ref={menuButtonRef}
        onClick={onToggleMenu}
        disabled={disabled}
        aria-label="Status-Menü öffnen"
        className="inline-flex h-full shrink-0 items-center px-2 text-current transition"
      >
        <ChevronDownIcon open={isMenuOpen} className="h-4 w-4" />
      </button>
    </div>
  );
}

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

type ApprovalFilter = "RELEASED" | "PENDING" | "DECLINED";

function approvalLabel(approvalStatus: string) {
  if (approvalStatus === "PENDING") return "Wartet auf Freigabe";
  if (approvalStatus === "REJECTED") return "Abgelehnt";
  if (approvalStatus === "CANCELLED") return "Zurückgezogen";
  return null;
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
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("RELEASED");
  const openCountQuery = api.order.backendOpenCount.useQuery();
  const pendingApprovalCount = openCountQuery.data?.pendingApprovalCount ?? 0;
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [menuOpenOrderId, setMenuOpenOrderId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [returnDialogOrderId, setReturnDialogOrderId] = useState<string | null>(null);
  const [returnDraftByItemId, setReturnDraftByItemId] = useState<Record<string, string>>({});
  const [quantityEditTarget, setQuantityEditTarget] = useState<{
    orderId: string;
    itemId: string;
  } | null>(null);
  const [quantityEditDraft, setQuantityEditDraft] = useState("");
  const menuButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const ordersQuery = api.order.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      approval: approvalFilter,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 30_000,
      refetchIntervalInBackground: true,
    },
  );

  const expandedOrderQuery = api.order.backendById.useQuery(
    { id: expandedOrderId ?? "" },
    {
      enabled: Boolean(expandedOrderId),
      refetchInterval: expandedOrderId ? 30_000 : false,
      refetchIntervalInBackground: true,
    },
  );

  const returnDialogQuery = api.order.backendById.useQuery(
    { id: returnDialogOrderId ?? "" },
    {
      enabled: Boolean(returnDialogOrderId),
      refetchInterval: false,
    },
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

  const updateItemQuantityMutation = api.order.backendUpdateItemQuantity.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.order.backendList.invalidate(),
        utils.order.backendOpenCount.invalidate(),
        utils.order.backendById.invalidate({ id: data.orderId }),
      ]);
      setQuantityEditTarget(null);
      setQuantityEditDraft("");
      toast.success("Menge aktualisiert.");
    },
    onError: (error) => {
      toast.error(error.message || "Menge konnte nicht aktualisiert werden.");
    },
  });

  const bookReturnMutation = api.order.backendBookReturn.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.order.backendList.invalidate(),
        utils.order.backendOpenCount.invalidate(),
        utils.order.backendById.invalidate({ id: data.orderId }),
      ]);
      setReturnDialogOrderId(null);
      setReturnDraftByItemId({});
      toast.success("Rückgabe erfolgreich rückgebucht.");
    },
    onError: (error) => {
      toast.error(error.message || "Rückgabe konnte nicht gebucht werden.");
    },
  });

  const sortedOrders = useMemo(
    () =>
      [...(ordersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [ordersQuery.data],
  );

  useEffect(() => {
    if (!expandedOrderId) return;
    const hasExpandedOrder = sortedOrders.some((order) => order.id === expandedOrderId);
    if (!hasExpandedOrder) {
      setExpandedOrderId(null);
    }
  }, [expandedOrderId, sortedOrders]);

  const closeStatusMenu = () => {
    setMenuOpenOrderId(null);
    setMenuPosition(null);
  };

  const openReturnDialog = (orderId: string) => {
    closeStatusMenu();
    setReturnDialogOrderId(orderId);
    setReturnDraftByItemId({});
  };

  const updateMenuPosition = (orderId: string | null) => {
    if (!orderId) {
      setMenuPosition(null);
      return;
    }
    const trigger = menuButtonRefs.current.get(orderId);
    if (!trigger) {
      setMenuPosition(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      left: Math.min(Math.max(8, rect.right - 220), window.innerWidth - 228),
    });
  };

  useEffect(() => {
    if (!menuOpenOrderId) return;
    const onPointerDown = (event: MouseEvent) => {
      const targetNode = event.target;
      if (!(targetNode instanceof Node)) return;
      const trigger = menuButtonRefs.current.get(menuOpenOrderId);
      if (trigger?.contains(targetNode)) return;
      if (menuContainerRef.current?.contains(targetNode)) return;
      closeStatusMenu();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStatusMenu();
    };
    const onLayoutChange = () => updateMenuPosition(menuOpenOrderId);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpenOrderId]);

  useEffect(() => {
    const dialogData = returnDialogQuery.data;
    if (!dialogData) return;
    setReturnDraftByItemId((current) => {
      const next: Record<string, string> = {};
      for (const item of dialogData.items) {
        const remaining = decimalToNumber((item as { remainingReturnableQuantity?: unknown }).remainingReturnableQuantity);
        next[item.id] = remaining > 0 ? remaining.toString() : "0";
      }
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      const isSameLength = currentKeys.length === nextKeys.length;
      const isSameValues = isSameLength && nextKeys.every((key) => current[key] === next[key]);
      return isSameValues ? current : next;
    });
  }, [returnDialogQuery.data]);

  const quantityEditItem =
    quantityEditTarget && expandedOrderQuery.data?.id === quantityEditTarget.orderId
      ? expandedOrderQuery.data.items.find((item) => item.id === quantityEditTarget.itemId)
      : null;

  const openQuantityEditDialog = (orderId: string, item: { id: string; quantity: unknown }) => {
    setQuantityEditTarget({ orderId, itemId: item.id });
    setQuantityEditDraft(decimalToNumber(item.quantity).toString());
  };

  useEffect(() => {
    if (!quantityEditTarget || !expandedOrderQuery.data) return;
    if (expandedOrderQuery.data.id !== quantityEditTarget.orderId) return;
    if (expandedOrderQuery.data.status !== "OPEN") {
      setQuantityEditTarget(null);
      setQuantityEditDraft("");
    }
  }, [quantityEditTarget, expandedOrderQuery.data]);

  return (
    <ShellCard className="rounded-2xl bg-transparent">
      <div className="mb-3 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="">
          <h2 className="text-xl font-semibold text-foreground">Bestellungen</h2>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Freigabe:</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "RELEASED" as const, label: "Im Lager" },
              {
                value: "PENDING" as const,
                label: pendingApprovalCount > 0 ? `Wartet auf Freigabe (${pendingApprovalCount})` : "Wartet auf Freigabe",
              },
              { value: "DECLINED" as const, label: "Abgelehnt / zurückgezogen" },
            ] as const
          ).map((opt) => (
            <FilterPillButton
              key={opt.value}
              onClick={() => {
                setApprovalFilter(opt.value);
                setExpandedOrderId(null);
              }}
              active={approvalFilter === opt.value}
            >
              {opt.label}
            </FilterPillButton>
          ))}
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
              <TableUI.TableHead className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap">
                Positionen
              </TableUI.TableHead>
              <TableUI.TableHead>Datum</TableUI.TableHead>
              <TableUI.TableHead className="w-[14rem] min-w-[14rem] max-w-[14rem] whitespace-nowrap">
                Status
                </TableUI.TableHead>
              <TableUI.TableHead className="w-[18rem] min-w-[18rem] max-w-[18rem] whitespace-nowrap">
                Aktion
              </TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {ordersQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={7} className="text-muted-foreground">
                  Bestellungen werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}

            {ordersQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={7} className="text-destructive">
                  Bestellungen konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {!ordersQuery.isLoading && !ordersQuery.error && sortedOrders.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={7} className="text-sm italic text-muted-foreground/80">
                  Keine Bestellungen gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {sortedOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const status = statusConfig[order.status];
              const nextStatus = status.nextStatus;
              const isMenuOpen = menuOpenOrderId === order.id;
              const pendingApprovalLabel = approvalLabel(order.approvalStatus);

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
                    <TableUI.TableCell className="min-w-0">
                      <div className="line-clamp-1">
                        {order.costCenter.code} - {order.costCenter.name}
                      </div>
                    </TableUI.TableCell>
                    <TableUI.TableCell className="w-[7rem] min-w-[7rem] max-w-[7rem] tabular-nums">
                      {order.items.length}
                    </TableUI.TableCell>
                    <TableUI.TableCell>{formatDate(order.createdAt)}</TableUI.TableCell>
                    <TableUI.TableCell className="w-[14rem] min-w-[14rem] max-w-[14rem] whitespace-nowrap">
                      {pendingApprovalLabel ? (
                        <Badge variant={order.approvalStatus === "PENDING" ? "orderSecond" : "destructive"}>
                          {pendingApprovalLabel}
                        </Badge>
                      ) : (
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
                      )}
                    </TableUI.TableCell>
                    <TableUI.TableCell className="w-[14rem] min-w-[14rem] max-w-[14rem] whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 px-1">
                        {order.approvalStatus === "PENDING" ? (
                          <Link
                            href={`/teacher/orders?freigabe=${encodeURIComponent(order.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className={buttonClassName({
                              variant: "glass",
                              size: "sm",
                              className: "h-8 w-[13.5rem] max-w-[13.5rem] rounded-sm",
                            })}
                          >
                            Zur Freigabe
                          </Link>
                        ) : pendingApprovalLabel ? (
                          <span className="inline-flex rounded-full py-1.5 text-center text-xs text-muted-foreground">
                            —
                          </span>
                        ) : nextStatus && status.advanceActionLabel && order.status !== "READY_FOR_PICKUP" ? (
                          <OrderStatusActionButton
                            variant={nextStatus === "READY_FOR_PICKUP" ? "solid" : "glass"}
                            actionLabel={status.advanceActionLabel}
                            nextStatusLabel={statusConfig[nextStatus].label}
                            isMenuOpen={isMenuOpen}
                            disabled={updateStatusMutation.isPending}
                            onAdvance={(event) => {
                              event.stopPropagation();
                              updateStatusMutation.mutate({
                                orderId: order.id,
                                nextStatus,
                              });
                            }}
                            menuButtonRef={(node) => {
                              if (node) {
                                menuButtonRefs.current.set(order.id, node);
                              } else {
                                menuButtonRefs.current.delete(order.id);
                              }
                            }}
                            onToggleMenu={(event) => {
                              event.stopPropagation();
                              setMenuOpenOrderId((current) => {
                                const next = current === order.id ? null : order.id;
                                if (next) updateMenuPosition(next);
                                else setMenuPosition(null);
                                return next;
                              });
                            }}
                          />
                        ) : order.status === "READY_FOR_PICKUP" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="glass"
                            // Mirror the OrderStatusActionButton split-button silhouette so the
                            // dropdown-only trigger matches the in-progress action buttons (#79).
                            className="h-8 w-[13.5rem] max-w-[13.5rem] overflow-hidden rounded-sm !items-stretch !justify-start !px-0 !py-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenOrderId((current) => {
                                const next = current === order.id ? null : order.id;
                                if (next) updateMenuPosition(next);
                                else setMenuPosition(null);
                                return next;
                              });
                            }}
                            ref={(node) => {
                              if (node) {
                                menuButtonRefs.current.set(order.id, node);
                              } else {
                                menuButtonRefs.current.delete(order.id);
                              }
                            }}
                          >
                            <span className="flex h-full min-w-0 flex-1 items-center justify-center text-center text-xs text-current">
                              Aktionen
                            </span>
                            <span aria-hidden="true" className="shrink-0 self-center text-xs text-border select-none">
                              |
                            </span>
                            <span className="inline-flex h-full shrink-0 items-center px-2 text-current">
                              <ChevronDownIcon open={isMenuOpen} className="h-4 w-4" />
                            </span>
                          </Button>
                        ) : (
                          <span
                            className="inline-flex rounded-full py-1.5 text-center text-xs text-muted-foreground"
                            aria-label="Keine weitere Aktion"
                          >
                            —
                          </span>
                        )}
                      </div>
                    </TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={7}
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
                          <Card variant="detail">
                            <DetailText variant="kicker">Bestellnummer</DetailText>
                            <DetailText variant="value">{expandedOrderQuery.data.orderNumber}</DetailText>
                          </Card>
                          <Card variant="detail">
                            <DetailText variant="kicker">Lehrer</DetailText>
                            <DetailText variant="value">{userLabel(expandedOrderQuery.data.user)}</DetailText>
                            <DetailText variant="subvalue">
                              {expandedOrderQuery.data.user.email ?? "Keine E-Mail"}
                            </DetailText>
                            {expandedOrderQuery.data.sourceRequest?.student ? (
                              <p className="mt-2 text-[9px] text-muted-foreground italic">
                                Schüler: {userLabel(expandedOrderQuery.data.sourceRequest.student)}
                              </p>
                            ) : null}
                          </Card>
                          <Card variant="detail">
                            <DetailText variant="kicker">Kostenstelle</DetailText>
                            <DetailText variant="value">
                              {order.costCenter.code} - {order.costCenter.name}
                            </DetailText>
                          </Card>
                          <Card variant="detail">
                            <DetailText variant="kicker">Erstellt</DetailText>
                            <DetailText variant="value">{formatDate(expandedOrderQuery.data.createdAt)}</DetailText>
                          </Card>
                          <Card variant="detail">
                            <DetailText variant="kicker">Zuletzt aktualisiert</DetailText>
                            <DetailText variant="value">{formatDate(expandedOrderQuery.data.updatedAt)}</DetailText>
                          </Card>
                        </div>

                        {expandedOrderQuery.data.approvalStatus !== "NOT_REQUIRED" ? (
                          <Card variant="detail">
                            <DetailText variant="kicker">Freigabe</DetailText>
                            <DetailText variant="value">
                              {approvalLabel(expandedOrderQuery.data.approvalStatus) ?? "Freigegeben"}
                              {expandedOrderQuery.data.approvalGroup
                                ? ` · Gruppe ${expandedOrderQuery.data.approvalGroup.name}`
                                : ""}
                              {expandedOrderQuery.data.approvalDecidedBy
                                ? ` · durch ${userLabel(expandedOrderQuery.data.approvalDecidedBy)}`
                                : ""}
                              {expandedOrderQuery.data.approvalDecidedAt
                                ? ` am ${formatDate(expandedOrderQuery.data.approvalDecidedAt)}`
                                : ""}
                            </DetailText>
                            {expandedOrderQuery.data.approvalNote ? (
                              <DetailText variant="subvalue" className="whitespace-pre-wrap">
                                {expandedOrderQuery.data.approvalNote}
                              </DetailText>
                            ) : null}
                          </Card>
                        ) : null}

                        {expandedOrderQuery.data.workerNote ? (
                          <Card variant="detail">
                            <DetailText variant="noteTitle">
                              Hinweis für Lager
                            </DetailText>
                            <DetailText variant="note">
                              {expandedOrderQuery.data.workerNote}
                            </DetailText>
                          </Card>
                        ) : null}

                        <Card variant="detail" className="hover:!bg-card/40 !bg-card/0 !m-0 !p-0">
                          <TableUI.Subtable className="mt-3">
                            <TableUI.SubtableHeader>
                              <tr>
                                <TableUI.SubtableHead className="w-20">Bild</TableUI.SubtableHead>
                                <TableUI.SubtableHead>Produkt</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-[7rem]">SKU</TableUI.SubtableHead>
                                <TableUI.SubtableHead>Lagerplatz</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-0 whitespace-nowrap">Menge</TableUI.SubtableHead>
                                <TableUI.SubtableHead
                                  className="w-0 whitespace-nowrap text-xs font-normal text-muted-foreground/60"
                                  title="Aktueller Lagerbestand (nur Orientierung)"
                                >
                                  Lager
                                </TableUI.SubtableHead>
                              </tr>
                            </TableUI.SubtableHeader>
                            <TableUI.SubtableBody>
                              {expandedOrderQuery.data.items.map((item) => {
                                const canEditQuantity =
                                  order.status === "OPEN" &&
                                  (order.approvalStatus === "NOT_REQUIRED" || order.approvalStatus === "APPROVED");
                                const unitLabel =
                                  item.product.baseUnit === "PCS" ? "STK" : item.product.baseUnit;

                                return (
                                <TableUI.SubtableRow key={item.id}>
                                  <TableUI.SubtableCell>
                                    <img
                                      src={item.product.images[0]?.url ?? "/pictures/placeholder.jpg"}
                                      alt={item.product.images[0]?.altText ?? `${item.product.name} Bild`}
                                      className="h-16 w-16 rounded object-cover"
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
                                    {item.product.storageLocation ? item.product.storageLocation.name : "-"}
                                    {item.product.compartment ? (
                                      <span className="ml-1.5 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                        Fach {item.product.compartment}
                                      </span>
                                    ) : null}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="w-0 whitespace-nowrap tabular-nums">
                                    {canEditQuantity ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openQuantityEditDialog(order.id, item);
                                        }}
                                        className="group inline-flex cursor-pointer items-baseline gap-1 px-1 py-0.5 text-left"
                                        aria-label={`Menge für ${item.product.name} bearbeiten`}
                                        title="Menge bearbeiten"
                                      >
                                        <span className="font-semibold text-foreground">
                                          {decimalToNumber(item.quantity)}
                                        </span>
                                        <span className="text-sm text-muted-foreground">{unitLabel}</span>
                                        <PencilEditIcon className="h-3 w-3 shrink-0 self-center text-muted-foreground/30 transition group-hover:text-muted-foreground/45" />
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-baseline gap-1">
                                        <span className="font-semibold text-foreground">
                                          {decimalToNumber(item.quantity)}
                                        </span>
                                        <span className="text-sm text-muted-foreground">{unitLabel}</span>
                                      </span>
                                    )}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="w-0 whitespace-nowrap tabular-nums text-xs text-muted-foreground/55">
                                    <span className="inline-flex items-baseline gap-1">
                                      <span>{decimalToNumber(item.product.quantityOnHand)}</span>
                                      <span>{item.product.baseUnit === "PCS" ? "STK" : item.product.baseUnit}</span>
                                    </span>
                                  </TableUI.SubtableCell>
                                </TableUI.SubtableRow>
                                );
                              })}
                            </TableUI.SubtableBody>
                          </TableUI.Subtable>
                        </Card>
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
      {(() => {
        const activeOrderStatus = sortedOrders.find((order) => order.id === menuOpenOrderId)?.status;
        const canBookReturn = activeOrderStatus === "READY_FOR_PICKUP";
        return menuOpenOrderId && menuPosition ? (
          createPortal(
            <div
              ref={menuContainerRef}
              className="fixed z-[120] w-[220px] rounded-md bg-card p-2 "
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {ORDER_STATUSES.map((targetStatus) => {
                const label = statusConfig[targetStatus].label;
                const isCurrent = activeOrderStatus === targetStatus;
                const badgeVariant =
                  targetStatus === "READY_FOR_PICKUP"
                    ? "orderThird"
                    : targetStatus === "OPEN"
                      ? "orderFirst"
                      : "orderSecond";
                return (
                  <button
                    key={targetStatus}
                    type="button"
                    disabled={isCurrent || updateStatusMutation.isPending}
                    className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm text-foreground transition hover:!bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isCurrent) return;
                      updateStatusMutation.mutate({
                        orderId: menuOpenOrderId,
                        nextStatus: targetStatus,
                      });
                      closeStatusMenu();
                    }}
                  >
                    <Badge variant={badgeVariant}>{label}</Badge>
                    {isCurrent ? <span className="text-xs text-muted-foreground">Aktuell</span> : null}
                  </button>
                );
              })}
              {canBookReturn ? (
                <>
                  <div className="my-1 h-px bg-border/70" />
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm text-foreground transition hover:!bg-primary/10"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReturnDialog(menuOpenOrderId);
                    }}
                  >
                    <span>Rückbuchung</span>
                    <span className="text-xs text-muted-foreground">Menge</span>
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        ) : null;
      })()}
      <Dialog
        open={Boolean(quantityEditTarget)}
        onClose={() => {
          if (updateItemQuantityMutation.isPending) return;
          setQuantityEditTarget(null);
          setQuantityEditDraft("");
        }}
        title="Menge anpassen"
        description={
          quantityEditItem
            ? `Position: ${quantityEditItem.product.name}`
            : "Bestellposition wird geladen..."
        }
      >
        {quantityEditItem ? (
          <div className="grid grid-cols-2 items-center justify-between gap-4">
            <div className="grid grid-cols-1 min-w-0 gap-1.5 items-center">
              <NumberStepper
                value={quantityEditDraft}
                onChange={setQuantityEditDraft}
                min={getQuantityStepForBaseUnit(quantityEditItem.product.baseUnit)}
                step={Math.max(decimalToNumber(quantityEditItem.product.unitStep), 0.001)}
                decreaseAriaLabel={`Menge ${quantityEditItem.product.name} verringern`}
                increaseAriaLabel={`Menge ${quantityEditItem.product.name} erhöhen`}
                inputAriaLabel={`Menge ${quantityEditItem.product.name}`}
                disabled={updateItemQuantityMutation.isPending}
                className="w-fit"
              />
              <p className="text-xs text-muted-foreground">
                Verfügbar im Lager: {decimalToNumber(quantityEditItem.product.quantityOnHand)}{" "}
                {quantityEditItem.product.baseUnit === "PCS" ? "STK" : quantityEditItem.product.baseUnit}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <Button
                type="button"
                variant="glass"
                className=" min-w-[6.5rem]"
                onClick={() => {
                  setQuantityEditTarget(null);
                  setQuantityEditDraft("");
                }}
                disabled={updateItemQuantityMutation.isPending}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="solid"
                className="min-w-[6.5rem]"
                disabled={updateItemQuantityMutation.isPending}
                  onClick={() => {
                    if (!quantityEditTarget) return;
                    const nextQuantity = decimalToNumber(quantityEditDraft);
                    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
                      toast.error("Bitte eine gültige Menge eingeben.");
                      return;
                    }
                    updateItemQuantityMutation.mutate({
                      orderId: quantityEditTarget.orderId,
                      orderItemId: quantityEditTarget.itemId,
                      quantity: nextQuantity,
                    });
                  }}
                >
                  Speichern
                </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Position wird geladen...</p>
        )}
      </Dialog>
      <Dialog
        open={Boolean(returnDialogOrderId)}
        onClose={() => {
          if (bookReturnMutation.isPending) return;
          setReturnDialogOrderId(null);
          setReturnDraftByItemId({});
        }}
        title="Rückgabe buchen"
        description="Positionen können teilweise oder komplett zurück ins Lager gebucht werden."
      >
        {returnDialogQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Positionen werden geladen...</p>
        ) : null}
        {returnDialogQuery.error ? (
          <p className="text-sm text-destructive">Rückgabedaten konnten nicht geladen werden.</p>
        ) : null}
        {returnDialogQuery.data ? (
          <div className="space-y-4">
            <Card variant="detail" className="hover:!bg-card/40 !bg-card/0 !m-0 !p-0">
              <TableUI.Subtable tableClassName="table-fixed">
                <TableUI.SubtableHeader>
                  <tr>
                    <TableUI.SubtableHead>Produkt</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-24 whitespace-nowrap">Bestellt</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-24 whitespace-nowrap">Schon zurück</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-24 whitespace-nowrap">Offen</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[12rem]">Rückgabe</TableUI.SubtableHead>
                  </tr>
                </TableUI.SubtableHeader>
                <TableUI.SubtableBody>
                  {returnDialogQuery.data.items.map((item) => {
                    const ordered = decimalToNumber(item.quantity);
                    const returned = decimalToNumber((item as { alreadyReturnedQuantity?: unknown }).alreadyReturnedQuantity);
                    const remaining = decimalToNumber(
                      (item as { remainingReturnableQuantity?: unknown }).remainingReturnableQuantity,
                    );
                    const step = Math.max(decimalToNumber((item.product as { unitStep?: unknown }).unitStep), 0.001);
                    const unitLabel = item.product.baseUnit === "PCS" ? "STK" : item.product.baseUnit;
                    const value = returnDraftByItemId[item.id] ?? "0";

                    return (
                      <TableUI.SubtableRow key={item.id}>
                        <TableUI.SubtableCell className="font-medium text-foreground">{item.product.name}</TableUI.SubtableCell>
                        <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                          {ordered} {unitLabel}
                        </TableUI.SubtableCell>
                        <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                          {returned} {unitLabel}
                        </TableUI.SubtableCell>
                        <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                          {remaining} {unitLabel}
                        </TableUI.SubtableCell>
                        <TableUI.SubtableCell>
                          <div className="flex items-center gap-2">
                            <NumberStepper
                              value={value}
                              onChange={(next) => {
                                setReturnDraftByItemId((current) => ({ ...current, [item.id]: next }));
                              }}
                              min={0}
                              max={remaining}
                              step={step}
                              decreaseAriaLabel={`Rückgabe ${item.product.name} verringern`}
                              increaseAriaLabel={`Rückgabe ${item.product.name} erhöhen`}
                              inputAriaLabel={`Rückgabe ${item.product.name}`}
                              disabled={bookReturnMutation.isPending || remaining <= 0}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={bookReturnMutation.isPending || remaining <= 0}
                              onClick={() => {
                                setReturnDraftByItemId((current) => ({
                                  ...current,
                                  [item.id]: remaining.toString(),
                                }));
                              }}
                            >
                              Alles
                            </Button>
                          </div>
                        </TableUI.SubtableCell>
                      </TableUI.SubtableRow>
                    );
                  })}
                </TableUI.SubtableBody>
              </TableUI.Subtable>
            </Card>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReturnDialogOrderId(null);
                  setReturnDraftByItemId({});
                }}
                disabled={bookReturnMutation.isPending}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="solid"
                disabled={bookReturnMutation.isPending}
                onClick={() => {
                  const dialogData = returnDialogQuery.data;
                  if (!dialogData) return;
                  const rows = dialogData.items;
                  const payloadItems = rows
                    .map((item) => {
                      const remaining = decimalToNumber(
                        (item as { remainingReturnableQuantity?: unknown }).remainingReturnableQuantity,
                      );
                      const requested = Math.max(0, decimalToNumber(returnDraftByItemId[item.id] ?? "0"));
                      return {
                        orderItemId: item.id,
                        returnQuantity: Math.min(remaining, requested),
                      };
                    })
                    .filter((item) => item.returnQuantity > 0);

                  if (payloadItems.length === 0) {
                    toast.error("Bitte mindestens eine Rückgabemenge > 0 eintragen.");
                    return;
                  }

                  bookReturnMutation.mutate({
                    orderId: dialogData.id,
                    items: payloadItems,
                  });
                }}
              >
                Rückgabe buchen
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </ShellCard>
  );
}
