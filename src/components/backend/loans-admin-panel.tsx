"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";
import { FilterPillButton } from "../ui/filter-pill-button";
import { DetailCard, DetailText } from "../ui/detail-card";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function dateToInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function addDaysToInputValue(days: number) {
  const now = new Date();
  const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string | undefined) {
  if (!value) return undefined;
  return new Date(value + "T00:00:00");
}

type LoanStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLOSED";

type LoanStatusBadge = {
  variant: "default" | "secondary" | "destructive" | "success" | "orderFirst" | "orderSecond" | "orderThird" | "note";
  text: string;
};

const loanStatusBadge: Record<LoanStatus, LoanStatusBadge> = {
  PENDING: { variant: "note", text: "Wartet" },
  APPROVED: { variant: "orderFirst", text: "Freigegeben" },
  REJECTED: { variant: "orderSecond", text: "Abgelehnt" },
  CLOSED: { variant: "orderThird", text: "Erledigt" },
};

export function LoansAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [statusFilter, setStatusFilter] = useState<"ALL" | LoanStatus>("ALL");
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  const loansQuery = api.loan.backendListLoans.useQuery({
    status: statusFilter === "ALL" ? undefined : statusFilter,
    search: searchTerm || undefined,
    limit: 100,
  });

  const handoverMutation = api.loan.backendHandover.useMutation({
    onSuccess: async () => {
      await utils.loan.backendListLoans.invalidate();
      await utils.loan.backendOpenCount.invalidate();
      setExpandedLoanId(null);
      toast.success("Ausleihe ausgegeben.");
    },
  });

  const returnMutation = api.loan.backendReturn.useMutation({
    onSuccess: async () => {
      await utils.loan.backendListLoans.invalidate();
      await utils.loan.backendOpenCount.invalidate();
      setExpandedLoanId(null);
      toast.success("Ausleihe zurueckgebucht.");
    },
  });

  const remindMutation = api.loan.backendSendReminderNow.useMutation({
    onSuccess: async () => {
      await utils.loan.backendListLoans.invalidate();
      toast.success("Erinnerung gesendet.");
    },
  });

  const sortedLoans = useMemo(
    () => [...(loansQuery.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [loansQuery.data],
  );

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Leihgeräte</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Status:</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "ALL" as const, label: "Alle" },
              { value: "PENDING" as const, label: "Wartet" },
              { value: "APPROVED" as const, label: "Freigegeben" },
              { value: "REJECTED" as const, label: "Abgelehnt" },
              { value: "CLOSED" as const, label: "Erledigt" },
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
              <TableUI.TableHead>Ausleihen</TableUI.TableHead>
              <TableUI.TableHead>Person</TableUI.TableHead>
              <TableUI.TableHead>Datum</TableUI.TableHead>
              <TableUI.TableHead>Status</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>

          <TableUI.TableBody>
            {loansQuery.isLoading ? (
              <TableUI.TableRow>
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Werkzeuge werden geladen...
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}

            {loansQuery.error ? (
              <TableUI.TableRow>
                <TableUI.TableCell colSpan={4} className="text-destructive">
                  Werkzeuge konnten nicht geladen werden.
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}

            {!loansQuery.isLoading && !loansQuery.error && sortedLoans.length === 0 ? (
              <TableUI.TableRow>
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Keine Werkzeuge gefunden.
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}

            {sortedLoans.map((loan) => {
              const isExpanded = expandedLoanId === loan.id;
              const loanHasHandover = loan.items.some((it) => {
                const approved = decimalToNumber(it.quantityApproved);
                const handedOver = decimalToNumber(it.quantityHandedOver);
                return approved - handedOver > 0;
              });
              const loanHasReturn = loan.items.some((it) => {
                const handedOver = decimalToNumber(it.quantityHandedOver);
                const returned = decimalToNumber(it.quantityReturned);
                return handedOver - returned > 0;
              });
              const statusBadge = loanStatusBadge[loan.status as LoanStatus];
              return (
                <Fragment key={loan.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      if (handoverMutation.isPending || returnMutation.isPending || remindMutation.isPending) return;
                      setExpandedLoanId((current: string | null) => (current === loan.id ? null : loan.id));
                    }}
                    className="cursor-pointer"
                  >
                    <TableUI.TableCell className="px-4 py-3">
                      <div className="font-medium">{loan.id.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{loan.storageRoom?.name ?? "-"}</div>
                    </TableUI.TableCell>
                    <TableUI.TableCell className="px-4 py-3">
                      <div className="text-sm font-medium">{loan.borrower.name ?? loan.borrower.email ?? "-"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{loan.borrower.email ?? "-"}</div>
                    </TableUI.TableCell>
                    <TableUI.TableCell className="px-4 py-3 text-sm text-muted-foreground">{formatDate(loan.createdAt)}</TableUI.TableCell>
                    <TableUI.TableCell className="px-4 py-3">
                      <Badge variant={statusBadge.variant}>{statusBadge.text}</Badge>
                    </TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={4}
                    rowClassName="border-t border-border bg-muted/30"
                    cellClassName="px-3 py-4"
                    contentClassName="!p-0 !pt-0 !pb-0 !px-0"
                  >
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-3">
                        <DetailCard>
                          <DetailText variant="kicker">Referenznummer</DetailText>
                          <DetailText variant="value">{loan.id.slice(0, 8)}</DetailText>
                        </DetailCard>
                        <DetailCard>
                          <DetailText variant="kicker">Person</DetailText>
                          <DetailText variant="value">{loan.borrower.name ?? loan.borrower.email ?? "-"}</DetailText>
                        </DetailCard>
                        <DetailCard>
                          <DetailText variant="kicker">Erstellt</DetailText>
                          <DetailText variant="value">{formatDate(loan.createdAt)}</DetailText>
                        </DetailCard>
                      </div>

                      <DetailCard className="hover:!bg-card/40 !bg-card/0 !m-0 !p-0">
                        <TableUI.Subtable tableClassName="table-fixed">
                          <TableUI.SubtableHeader>
                            <tr>
                              <TableUI.SubtableHead className="min-w-[13rem] w-[42%] shrink-0">
                                Material
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead
                                className="w-24 shrink-0 whitespace-nowrap tabular-nums"
                                title="Vom Lehrer:in freigegebene Stückzahl"
                              >
                                Freigegeben
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead
                                className="w-24 shrink-0 whitespace-nowrap tabular-nums"
                                title="Bereits an die ausleihende Person übergeben"
                              >
                                Ausgegeben
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead
                                className="w-24 shrink-0 whitespace-nowrap tabular-nums"
                                title="Noch nicht zurückgegebene Stückzahl"
                              >
                                Offen
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead className="w-36 shrink-0 whitespace-nowrap">
                                Fällig am
                              </TableUI.SubtableHead>
                              <TableUI.SubtableHead className="min-w-[10rem] shrink-0">Aktion</TableUI.SubtableHead>
                            </tr>
                          </TableUI.SubtableHeader>
                          <TableUI.SubtableBody>
                            {loan.items.map((item) => {
                              const approved = decimalToNumber(item.quantityApproved);
                              const handedOver = decimalToNumber(item.quantityHandedOver);
                              const returned = decimalToNumber(item.quantityReturned);
                              const remainingToHandOver = approved - handedOver;
                              const remainingToReturn = handedOver - returned;

                              return (
                                <TableUI.SubtableRow key={item.id}>
                                  <TableUI.SubtableCell className="w-[32%] min-w-[13rem] shrink-0 font-medium text-foreground">
                                    <div className="min-w-0 truncate" title={item.lendableItem?.name ?? undefined}>
                                      {item.lendableItem?.name ?? "-"}
                                    </div>
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                                    {Math.floor(approved)}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                                    {Math.floor(handedOver)}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground tabular-nums">
                                    {Math.floor(remainingToReturn)}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="text-muted-foreground">
                                    {item.dueAt ? formatDate(item.dueAt) : "-"}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="min-w-[10rem] shrink-0 align-top">
                                    <LoanItemActions
                                      item={item}
                                      loanId={loan.id}
                                      remainingToHandOver={remainingToHandOver}
                                      remainingToReturn={remainingToReturn}
                                      handoverMutation={handoverMutation}
                                      returnMutation={returnMutation}
                                      remindMutation={remindMutation}
                                    />
                                  </TableUI.SubtableCell>
                                </TableUI.SubtableRow>
                              );
                            })}
                          </TableUI.SubtableBody>
                        </TableUI.Subtable>
                      </DetailCard>
                    </div>
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
      </div>
    </Card>
  );
}

function LoanItemActions(props: {
  item: {
    id: string;
    dueAt: Date | null;
    quantityApproved: unknown;
    quantityHandedOver: unknown;
    quantityReturned: unknown;
    lendableItem?: { name: string | null } | null;
  };
  loanId: string;
  remainingToHandOver: number;
  remainingToReturn: number;
  handoverMutation: {
    mutate: (input: {
      loanId: string;
      items: Array<{ loanItemId: string; handoverQuantity: number; dueAt?: Date }>;
    }) => void;
    isPending: boolean;
  };
  returnMutation: {
    mutate: (input: {
      loanId: string;
      items: Array<{ loanItemId: string; returnQuantity: number }>;
    }) => void;
    isPending: boolean;
  };
  remindMutation: {
    mutate: (input: { loanItemId: string }) => void;
    isPending: boolean;
  };
}) {
  const { item, loanId, remainingToHandOver, remainingToReturn } = props;

  const [dueAtInput, setDueAtInput] = useState(() => dateToInputValue(item.dueAt) || addDaysToInputValue(5));

  const isHandoverPossible = remainingToHandOver > 0 && decimalToNumber(item.quantityApproved) > 0;
  const isReturnPossible = remainingToReturn > 0;

  return (
    <div className="flex flex-col gap-2">
      {isHandoverPossible ? (
        <div className="flex flex-wrap items-center gap-2 grid grid-cols-2">
          <label className="inline-flex min-w-0 w-full max-w-full items-center gap-1.5">
            <span className="shrink-0 text-xs text-muted-foreground">
              Fällig
            </span>
            <Input
              type="date"
              value={dueAtInput}
              onChange={(e) => setDueAtInput(e.target.value)}
              className="relative flex h-6 w-full min-w-0 max-w-full items-center justify-center !px-0 !py-0 text-center leading-6 [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit]:h-full [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:w-full [&::-webkit-datetime-edit]:flex-1 [&::-webkit-datetime-edit]:items-center [&::-webkit-datetime-edit]:justify-center [&::-webkit-datetime-edit-fields-wrapper]:flex [&::-webkit-datetime-edit-fields-wrapper]:h-full [&::-webkit-datetime-edit-fields-wrapper]:w-full [&::-webkit-datetime-edit-fields-wrapper]:items-center [&::-webkit-datetime-edit-fields-wrapper]:justify-center [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
            />
          </label>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() =>
              props.handoverMutation.mutate({
                loanId,
                items: [
                  {
                    loanItemId: item.id,
                    handoverQuantity: remainingToHandOver,
                    dueAt: parseDateInputValue(dueAtInput),
                  },
                ],
              })
            }
            disabled={props.handoverMutation.isPending}
          >
            Übergeben
          </Button>
        </div>
      ) : null}

      {isReturnPossible ? (
        <div className="flex flex-wrap items-center gap-2 grid grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant="solid"
            onClick={() =>
              props.returnMutation.mutate({
                loanId,
                items: [
                  {
                    loanItemId: item.id,
                    returnQuantity: remainingToReturn,
                  },
                ],
              })
            }
            disabled={props.returnMutation.isPending}
          >
            Rückgabe
          </Button>
          <Button
            type="button"
            size="sm"
            variant="notify"
            onClick={() => props.remindMutation.mutate({ loanItemId: item.id })}
            disabled={props.remindMutation.isPending}
          >
            Erinnern
          </Button>
        </div>
      ) : null}

      {!isHandoverPossible && !isReturnPossible ? (
        <span
          aria-label="Keine Aktion"
        >
          -
        </span>
      ) : null}
    </div>
  );
}

