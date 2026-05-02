"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { useToast } from "~/components/ui/toast";
import { PackageIcon } from "~/components/layout/icon-renders";
import { Card, DetailText } from "~/components/ui/detail-card";
import { NumberStepper } from "~/components/ui/number-stepper";
import * as TableUI from "~/components/ui/table";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatInventoryQuantity(value: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDaysSince(borrowedAt: Date | string) {
  const now = new Date();
  const borrowedDate = borrowedAt instanceof Date ? borrowedAt : new Date(borrowedAt);
  const ms = now.getTime() - borrowedDate.getTime();
  const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  return `${days} Tag${days === 1 ? "" : "e"}`;
}

function requestStatusLabel(
  status: "PENDING" | "APPROVED" | "REJECTED" | "CLOSED",
  { isActive }: { isActive: boolean },
) {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return isActive ? "Ausgeliehen" : "Abholbereit";
  if (status === "REJECTED") return "Abgelehnt";
  return "Erledigt";
}

function loanStatusBadgeVariant(
  status: "PENDING" | "APPROVED" | "REJECTED" | "CLOSED",
  { isActive }: { isActive: boolean },
): Parameters<typeof Badge>[0]["variant"] {
  if (status === "PENDING") return "orderThird";
  if (status === "APPROVED") return isActive ? "orderSecond" : "orderFirst";
  if (status === "REJECTED") return "destructive";
  return "secondary";
}

function sumApprovedAcrossLoan(items: any[]) {
  return items.reduce((sum: number, item: any) => sum + decimalToNumber(item.quantityApproved), 0);
}

function sumOutstandingAcrossLoan(items: any[]) {
  return items.reduce((sum: number, item: any) => {
    const line =
      Math.max(0, decimalToNumber(item.quantityHandedOver) - decimalToNumber(item.quantityReturned));
    return sum + line;
  }, 0);
}

function outstandingForLine(item: any) {
  return Math.max(
    0,
    decimalToNumber(item.quantityHandedOver) - decimalToNumber(item.quantityReturned),
  );
}

function LoanRequestCard({ loan }: { loan: any }) {
  const outstandingTotal = sumOutstandingAcrossLoan(loan.items);
  const isActive = outstandingTotal > 0;

  const { activeBorrowedAt, activeDueAt, dueBorderClass, dueTextClass } = useMemo(() => {
    const items = Array.isArray(loan.items) ? loan.items : [];
    const outstandingItems = items.filter((item: any) => outstandingForLine(item) > 0);
    const relevant = outstandingItems.length > 0 ? outstandingItems : items;

    const borrowedAts = relevant
      .map((item: any) => item.borrowedAt)
      .filter(Boolean)
      .map((value: any) => (value instanceof Date ? value : new Date(value)))
      .filter((d: Date) => !Number.isNaN(d.getTime()));

    const dueAts = relevant
      .map((item: any) => item.dueAt)
      .filter(Boolean)
      .map((value: any) => (value instanceof Date ? value : new Date(value)))
      .filter((d: Date) => !Number.isNaN(d.getTime()));

    const activeBorrowedAt =
      borrowedAts.length > 0 ? new Date(Math.min(...borrowedAts.map((d: Date) => d.getTime()))) : null;
    const activeDueAt =
      dueAts.length > 0 ? new Date(Math.min(...dueAts.map((d: Date) => d.getTime()))) : null;

    const dueDaysLeft = activeDueAt ? Math.ceil((activeDueAt.getTime() - Date.now()) / 86_400_000) : null;
   
    const dueTone = dueDaysLeft === null ? "" : dueDaysLeft <= 0 ? "red" : dueDaysLeft <= 3 ? "amber" : "default";

    const dueTextClass = dueTone === "red" ? "text-red-600" : dueTone === "amber" ? "text-amber-600" : "text-slate-900";
    const dueBorderClass = dueTone === "red" ? "border-red-600" : dueTone === "amber" ? "border-amber-600" : "border-border";

    return { activeBorrowedAt, activeDueAt, dueBorderClass, dueTextClass };
  }, [loan.items]);

  return (


    <Card variant="detail" className={`!bg-card/40 hover:!bg-card/40 rounded-sm border ${dueBorderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">
            Referenznummer
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {loan.id.slice(0, 8)}
          </p>
        </div>
        <div className="shrink-0">
          <Badge variant={loanStatusBadgeVariant(loan.status, { isActive })}>
            {requestStatusLabel(loan.status, { isActive })}
          </Badge>
        </div>
      </div>
      <div className="mt-2">
        {loan.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Positionen vorhanden.</p>
        ) : (
          <TableUI.Subtable className="rounded-sm">
            <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
              <tr className="hover:bg-transparent">
                <TableUI.SubtableHead scope="col">Artikel</TableUI.SubtableHead>
                <TableUI.SubtableHead scope="col" className="text-right">
                  Menge
                </TableUI.SubtableHead>
              </tr>
            </TableUI.SubtableHeader>
            <TableUI.SubtableBody>
              {loan.items.map((item: any) => (
                <TableUI.SubtableRow key={item.id}>
                  <TableUI.SubtableCell className="min-w-0">
                    <span className="block min-w-0 truncate font-medium text-foreground">
                      {item.lendableItem?.name ?? "Unbekannt"}
                    </span>
                  </TableUI.SubtableCell>
                  <TableUI.SubtableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {decimalToNumber(item.quantityRequested)}{" "}
                    <span className="font-medium text-muted-foreground">Stk</span>
                  </TableUI.SubtableCell>
                </TableUI.SubtableRow>
              ))}
            </TableUI.SubtableBody>
          </TableUI.Subtable>
        )}
      </div>
      <div className="grid grid-cols-2">
        <p className="mt-2 text-xs tracking-wide text-muted-foreground">
          Lagerraum: {" "}
          <span className="text-xs font-semibold text-slate-900">
           {loan.storageRoom?.name ?? "Lagerraum"}
          </span>
        </p>  
        <p className="mt-2 text-xs text-muted-foreground justify-self-end text-right">
          Erstellt: {" "}
          <span className="text-xs font-semibold text-slate-900">
            {formatDateTime(loan.createdAt).split(",")[0]}
          </span>
        </p>
        {activeBorrowedAt && activeDueAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Aktive Leihdauer: {" "}
            <span className="text-xs font-semibold text-slate-900">
              {formatDaysSince(activeBorrowedAt)}
            </span>
          </p>
        ) : null}
        {activeDueAt ? (
          <p className="mt-2 text-xs text-muted-foreground justify-self-end text-right">
            Fällig: {" "}
            <span className={`text-xs font-semibold ${dueTextClass}`}>
            {formatDateTime(activeDueAt).split(",")[0]}
            </span>
          </p>
        ) : (" ")}
      </div>
    </Card>
  );
}

export default function AusleihePage() {
  const { data: session } = useSession();
  const userRole = session?.user.role;
  const toast = useToast();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantityDraft, setQuantityDraft] = useState<string>("1");
  const [quantitiesByItem, setQuantitiesByItem] = useState<Record<string, string>>({});
  const [selectedTeacherExternalId, setSelectedTeacherExternalId] = useState<string>("");
  const [dueInfoOpen, setDueInfoOpen] = useState(false);

  const lendableItemsQuery = api.loan.listLendableProducts.useQuery({
    search: searchTerm || undefined,
    limit: 30,
  });

  const myLoansQuery = api.loan.listMyLoans.useQuery();

  const teachersQuery = api.cart.listTeachersForCheckout.useQuery(undefined, {
    enabled: userRole === "STUDENT",
  });

  const createLoanMutation = api.loan.createLoan.useMutation({
    onSuccess: async () => {
      setSelectedItemId(null);
      setQuantityDraft("1");
      setSelectedTeacherExternalId("");
      setDueInfoOpen(false);
      await myLoansQuery.refetch();
      toast.success(userRole === "STUDENT" ? "Ausleihe zur Freigabe gesendet." : "Ausleihe angelegt.");
    },
  });

  const myLoans = (myLoansQuery.data ?? []) as any[];
  const openLoans = myLoans.filter((loan: any) => loan.status !== "CLOSED");
  const closedLoans = myLoans.filter((loan: any) => loan.status === "CLOSED");
  const closedLoansNotHandedOver = closedLoans.filter((loan: any) =>
    loan.items.every((item: any) => decimalToNumber(item.quantityHandedOver) <= 0),
  );
  const closedLoansHandedOver = closedLoans.filter((loan: any) =>
    loan.items.some((item: any) => decimalToNumber(item.quantityHandedOver) > 0),
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return lendableItemsQuery.data?.find((item: any) => item.id === selectedItemId) ?? null;
  }, [lendableItemsQuery.data, selectedItemId]);

  const canBorrow = userRole && selectedItem && (selectedItem.effectiveAvailable ?? 0) > 0;

  return (
    <main className="mx-auto flex min-h-screen w-[90%] max-w-none flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:items-start">
        <section className="order-2 space-y-4 lg:order-2">
          <div className="pt-6">
            <div className="space-y-4">
              {lendableItemsQuery.isLoading ? (
                <p className="text-sm text-slate-600">Artikel werden geladen...</p>
              ) : null}
              {!lendableItemsQuery.isLoading && lendableItemsQuery.data && lendableItemsQuery.data.length === 0 ? (
                <p className="text-sm text-slate-600">Aktuell keine ausleihbaren Artikel gefunden.</p>
              ) : null}

              <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {(lendableItemsQuery.data ?? []).map((item: any) => {
                const maxAvailable = Math.floor(decimalToNumber(item.effectiveAvailable));
                const quantityInput = quantitiesByItem[item.id] ?? "1";
                return (
                <div key={item.id}>
                  <Card variant="product" className="p-4 hover:!bg-card/40">
                    {item.image?.url ? (
                      <div className="mb-3 flex h-40 w-full items-center justify-center overflow-hidden !rounded-sm border border-slate-200 bg-card/40">
                        <img
                          src={item.image.url}
                          alt={item.image.altText || `${item.name} Bild`}
                          className="h-full w-full object-contain"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "/pictures/placeholder.jpg";
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <DetailText variant="title">
                        {item.name}
                      </DetailText>

                      <DetailText
                        variant="subvalue"
                        className={`line-clamp-1 ${item.description?.trim() ? "" : "italic text-muted-foreground/80"}`}
                      >
                        {item.description?.trim() || "Keine Beschreibung"}
                      </DetailText>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-sm">
                      <PackageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatInventoryQuantity(Math.floor(decimalToNumber(item.effectiveAvailable)))}
                      </span>
                      <span className="text-muted-foreground">Stk</span>
                      <span className="text-muted-foreground">verfügbar</span>
                    </div>

                    <div className="border-t border-border/50 pt-4">
                      <div className="flex items-stretch gap-2.5 sm:gap-3">
                        <NumberStepper
                          value={quantityInput}
                          onChange={(next) =>
                            setQuantitiesByItem((prev) => ({ ...prev, [item.id]: next }))
                          }
                          min={1}
                          step={1}
                          max={maxAvailable > 0 ? maxAvailable : 1}
                          decreaseAriaLabel={`Menge fuer ${item.name} reduzieren`}
                          increaseAriaLabel={`Menge fuer ${item.name} erhoehen`}
                          inputAriaLabel={`Menge fuer ${item.name}`}
                          className="shrink-0 bg-card/40 "
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="solid"
                          disabled={
                            !(userRole === "ADMIN" || userRole === "TEACHER" || userRole === "STUDENT")
                          }
                          className="h-9 min-h-9 min-w-0 flex-1 rounded-sm px-3 text-sm font-semibold leading-none"
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setQuantityDraft(quantityInput);
                            setDueInfoOpen(true);
                          }}
                        >
                          Ausleihen
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
                );
              })}
              </div>
            </div>
          </div>

          <Dialog
            open={dueInfoOpen}
            onClose={() => setDueInfoOpen(false)}
            title={selectedItem ? `Ausleihen: ${selectedItem.name}` : "Ausleihen"}
            description="Wähle die Menge (und für Schüler eine Lehrperson) und sende die Anfrage ans Lager."
          >
            {selectedItem ? (
              <div className="mt-1 space-y-4">
                {createLoanMutation.error ? (
                  <p className="">
                    Fehler: {createLoanMutation.error.message}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="glass"
                    onClick={() => setDueInfoOpen(false)}
                    className="!w-fit"                    
                    >
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    variant="solid"
                    className="!w-fit"
                    onClick={() => {
                      if (!selectedItem) return;
                      const quantity = Math.floor(Number(quantityDraft));
                      if (!Number.isFinite(quantity) || quantity <= 0) return;

                      if (userRole === "STUDENT" && !selectedTeacherExternalId) return;

                      createLoanMutation.mutate({
                        items: [{ lendableItemId: selectedItem.id, quantity }],
                        teacherExternalId: userRole === "STUDENT" ? selectedTeacherExternalId : undefined,
                      });
                    }}
                    disabled={!canBorrow || createLoanMutation.isPending}
                  >
                    {createLoanMutation.isPending ? "Wird erstellt..." : "Anfrage senden"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Dialog>
        </section>

        <section className="order-1 space-y-4 lg:order-1 lg:sticky lg:top-6 mt-6">
          <Card variant="detail" className="p-4 !bg-card/40 hover:!bg-card/40">
            <div className="mb-2">
              <h2 className="text-xl font-semibold text-foreground">Meine ausgeliehenen Werkzeuge</h2>
            </div>

            {myLoansQuery.isLoading ? <p className="text-sm text-muted-foreground">Werkzeuge werden geladen...</p> : null}

            {!myLoansQuery.isLoading && myLoansQuery.data && myLoansQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Anfragen vorhanden.</p>
            ) : null}

            <div className="mt-4 space-y-4">
              {openLoans.map((loan: any) => (
                <LoanRequestCard key={loan.id} loan={loan} />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

