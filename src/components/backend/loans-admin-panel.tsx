"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

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
  // Keep it stable by using UTC midnight formatting.
  return d.toISOString().slice(0, 10);
}

function addDaysToInputValue(days: number) {
  const now = new Date();
  const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string | undefined) {
  if (!value) return undefined;
  // z.coerce.date() expects something that can become a Date.
  return new Date(value + "T00:00:00");
}

type LoanStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLOSED";

const statusBadgeClass: Record<LoanStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-rose-100 text-rose-900",
  CLOSED: "bg-slate-100 text-slate-900",
};

export function LoansAdminPanel() {
  const utils = api.useUtils();
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
    },
  });

  const returnMutation = api.loan.backendReturn.useMutation({
    onSuccess: async () => {
      await utils.loan.backendListLoans.invalidate();
      await utils.loan.backendOpenCount.invalidate();
      setExpandedLoanId(null);
    },
  });

  const remindMutation = api.loan.backendSendReminderNow.useMutation({
    onSuccess: async () => {
      await utils.loan.backendListLoans.invalidate();
    },
  });

  const sortedLoans = useMemo(
    () => [...(loansQuery.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [loansQuery.data],
  );

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Leihgeräte</h2>
          <p className="text-sm text-muted-foreground">Uebergabe, Rueckgabe und Erinnerungen verwalten.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-end gap-3">
        <label className="block text-xs text-muted-foreground">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | LoanStatus)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ALL">Alle Status</option>
            <option value="PENDING">Wartet</option>
            <option value="APPROVED">Freigegeben</option>
            <option value="REJECTED">Abgelehnt</option>
            <option value="CLOSED">Erledigt</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Ausleihen</TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aktion</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loansQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Werkzeuge werden geladen...
                </TableCell>
              </TableRow>
            ) : null}

            {loansQuery.error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  Werkzeuge konnten nicht geladen werden.
                </TableCell>
              </TableRow>
            ) : null}

            {!loansQuery.isLoading && !loansQuery.error && sortedLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Keine Werkzeuge gefunden.
                </TableCell>
              </TableRow>
            ) : null}

            {sortedLoans.map((loan) => {
              const isExpanded = expandedLoanId === loan.id;
              return (
                <Fragment key={loan.id}>
                  <TableRow
                    onClick={() => {
                      if (handoverMutation.isPending || returnMutation.isPending || remindMutation.isPending) return;
                      setExpandedLoanId((current) => (current === loan.id ? null : loan.id));
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell className="px-4 py-3">
                      <div className="font-medium">{loan.id.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{loan.storageRoom?.name ?? "-"}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="text-sm font-medium">{loan.borrower.name ?? loan.borrower.email ?? "-"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{loan.borrower.email ?? "-"}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{formatDate(loan.createdAt)}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="secondary" className={statusBadgeClass[loan.status as LoanStatus]}>
                        {loan.status === "PENDING"
                          ? "Wartet"
                          : loan.status === "APPROVED"
                            ? "Freigegeben"
                            : loan.status === "REJECTED"
                              ? "Abgelehnt"
                              : "Erledigt"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {isExpanded ? "Offen" : "Anzeigen"}
                    </TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={5} className="px-3 py-4">
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <h3 className="text-lg font-semibold text-foreground">Details: {loan.id.slice(0, 8)}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {loan.borrower.name ?? loan.borrower.email ?? "-"} · {loan.storageRoom?.name ?? "-"}
                            </p>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-border">
                            <Table>
                              <TableHeader className="bg-muted/50">
                                <TableRow>
                                  <TableHead>Material</TableHead>
                                  <TableHead>Freigegeben</TableHead>
                                  <TableHead>Uebergeben</TableHead>
                                  <TableHead>Rueckgabe</TableHead>
                                  <TableHead>Faellig</TableHead>
                                  <TableHead>Aktion</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {loan.items.map((item) => {
                                  const approved = decimalToNumber(item.quantityApproved);
                                  const handedOver = decimalToNumber(item.quantityHandedOver);
                                  const returned = decimalToNumber(item.quantityReturned);
                                  const remainingToHandOver = approved - handedOver;
                                  const remainingToReturn = handedOver - returned;
                                  const activeDue = remainingToReturn > 0 && item.dueAt;

                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell>
                                        <div className="text-sm font-medium text-foreground">{item.lendableItem?.name ?? "-"}</div>
                                      </TableCell>
                                      <TableCell className="text-sm">{Math.floor(approved)}</TableCell>
                                      <TableCell className="text-sm">{Math.floor(handedOver)}</TableCell>
                                      <TableCell className="text-sm">{Math.floor(remainingToReturn)}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                        {item.dueAt ? formatDate(item.dueAt) : "-"}
                                      </TableCell>
                                      <TableCell className="w-[360px]">
                                        <LoanItemActions
                                          item={item}
                                          loanId={loan.id}
                                          remainingToHandOver={remainingToHandOver}
                                          remainingToReturn={remainingToReturn}
                                          handoverMutation={handoverMutation}
                                          returnMutation={returnMutation}
                                          remindMutation={remindMutation}
                                        />
                                        {activeDue ? null : null}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
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

  const [handoverQty, setHandoverQty] = useState<string>(() => String(Math.max(1, Math.floor(remainingToHandOver))));
  const [dueAtInput, setDueAtInput] = useState<string>(() => dateToInputValue(item.dueAt) || addDaysToInputValue(5));
  const [returnQty, setReturnQty] = useState<string>(() => String(Math.max(1, Math.floor(remainingToReturn))));

  const isHandoverPossible = remainingToHandOver > 0 && decimalToNumber(item.quantityApproved) > 0;
  const isReturnPossible = remainingToReturn > 0;

  const baseUnit = "Stk";

  return (
    <div className="flex flex-col gap-2">
      {isHandoverPossible ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[120px]">
            <div className="text-xs text-muted-foreground">Uebergabe</div>
            <Input
              type="number"
              min="1"
              step="1"
              value={handoverQty}
              onChange={(e) => setHandoverQty(e.target.value)}
              className="mt-1 h-9 rounded-xl"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">{baseUnit}</div>
          </label>
          <label className="flex-1">
            <div className="text-xs text-muted-foreground">Faellig am</div>
            <Input
              type="date"
              value={dueAtInput}
              onChange={(e) => setDueAtInput(e.target.value)}
              className="mt-1 h-9 rounded-xl"
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              props.handoverMutation.mutate({
                loanId,
                items: [
                  {
                    loanItemId: item.id,
                    handoverQuantity: Number(handoverQty),
                    dueAt: parseDateInputValue(dueAtInput),
                  },
                ],
              })
            }
            disabled={props.handoverMutation.isPending}
          >
            Uebergeben
          </Button>
        </div>
      ) : null}

      {isReturnPossible ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[140px]">
            <div className="text-xs text-muted-foreground">Rueckgabe</div>
            <Input
              type="number"
              min="1"
              step="1"
              value={returnQty}
              onChange={(e) => setReturnQty(e.target.value)}
              className="mt-1 h-9 rounded-xl"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              props.returnMutation.mutate({
                loanId,
                items: [
                  {
                    loanItemId: item.id,
                    returnQuantity: Number(returnQty),
                  },
                ],
              })
            }
            disabled={props.returnMutation.isPending}
          >
            Zurueck
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => props.remindMutation.mutate({ loanItemId: item.id })}
            disabled={props.remindMutation.isPending}
          >
            Erinnern
          </Button>
        </div>
      ) : null}
    </div>
  );
}

