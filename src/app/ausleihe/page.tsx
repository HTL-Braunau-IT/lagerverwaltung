"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import Link from "next/link";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDaysSince(borrowedAt: Date) {
  const now = new Date();
  const ms = now.getTime() - borrowedAt.getTime();
  const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  return `${days} Tag${days === 1 ? "" : "e"}`;
}

function requestStatusLabel(status: "PENDING" | "APPROVED" | "REJECTED" | "CLOSED") {
  if (status === "PENDING") return "Wartet auf Freigabe";
  if (status === "APPROVED") return "Freigegeben";
  if (status === "REJECTED") return "Abgelehnt";
  return "Erledigt";
}

export default function AusleihePage() {
  const { data: session } = useSession();
  const userRole = session?.user.role;

  const [searchInput, setSearchInput] = useState("");
  const searchTerm = searchInput.trim();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [quantityDraft, setQuantityDraft] = useState<string>("1");
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
    onSuccess: () => {
      setSelectedItemId(null);
      setQuantityDraft("1");
      setSelectedTeacherExternalId("");
      setDueInfoOpen(false);
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
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-700">HTL Lager</p>
        <h1 className="text-2xl font-semibold text-slate-900">Ausleihe</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hier kannst du Materialien ausleihen und den Status verfolgen.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
          >
            Zur Produktliste
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <Card className="rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
          <h2 className="text-xl font-semibold text-slate-900">Ausleihbare Materialien</h2>
          <p className="mt-1 text-sm text-slate-600">Es werden nur Artikel mit verfuegbarer Menge angezeigt.</p>
            </div>

            <label className="w-full max-w-[340px] text-sm text-slate-600">
              Suche
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="z. B. Bohrer, Leiter, Material..."
                className="mt-1 h-10 rounded-xl"
              />
            </label>
          </div>

          {lendableItemsQuery.isLoading ? (
            <p className="text-sm text-slate-600">Artikel werden geladen...</p>
          ) : null}
          {!lendableItemsQuery.isLoading && lendableItemsQuery.data && lendableItemsQuery.data.length === 0 ? (
            <p className="text-sm text-slate-600">Aktuell keine ausleihbaren Artikel gefunden.</p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(lendableItemsQuery.data ?? []).map((item: any) => (
              <div key={item.id}>
                <Card className="rounded-xl p-4 shadow-sm">
                  {item.image?.url ? (
                    <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      <img
                        src={item.image.url}
                        alt={item.image.altText || `${item.name} Bild`}
                        className="h-40 w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/pictures/placeholder.jpg";
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="mt-1 line-clamp-2 text-base font-semibold text-slate-900">{item.name}</h3>
                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.description}</p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">Verfuegbar</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {Math.floor(decimalToNumber(item.effectiveAvailable))} Stk
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      disabled={!(userRole === "ADMIN" || userRole === "TEACHER" || userRole === "STUDENT")}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setQuantityDraft("1");
                        setDueInfoOpen(true);
                      }}
                    >
                      Ausleihen
                    </Button>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </Card>

        <Dialog
          open={dueInfoOpen}
          onClose={() => setDueInfoOpen(false)}
          title={selectedItem ? `Ausleihen: ${selectedItem.name}` : "Ausleihen"}
          description="Wähle die Menge (und fuer Schueler eine Lehrperson) und sende die Ausleihe ans Lager."
        >
          {selectedItem ? (
            <div className="mt-1 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    Menge
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={quantityDraft}
                      onChange={(e) => setQuantityDraft(e.target.value)}
                      className="mt-1 h-10 rounded-xl"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Max: {Math.floor(decimalToNumber(selectedItem.effectiveAvailable))} Stk
                    </p>
                  </label>

                  {userRole === "STUDENT" ? (
                    <label className="text-sm text-slate-700">
                      Lehrperson
                      <select
                        value={selectedTeacherExternalId}
                        onChange={(e) => setSelectedTeacherExternalId(e.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none"
                      >
                        <option value="">Bitte waehle</option>
                        {(teachersQuery.data ?? []).map((t) => (
                          <option key={t.externalId} value={t.externalId}>
                            {t.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                </div>

                {createLoanMutation.error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    Fehler: {createLoanMutation.error.message}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDueInfoOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
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
                    {createLoanMutation.isPending ? "Wird erstellt..." : "Ausleihe anfragen"}
                  </Button>
                </div>
              </div>
          ) : null}
        </Dialog>
      </section>

      <section className="space-y-4">
        <Card className="rounded-2xl p-5">
          <div className="mb-2">
            <h2 className="text-xl font-semibold text-slate-900">Meine Ausleihen</h2>
            <p className="mt-1 text-sm text-slate-600">Hier siehst du offene, freigegebene und erledigte Ausleihen.</p>
          </div>

          {myLoansQuery.isLoading ? (
            <p className="text-sm text-slate-600">Ausleihen werden geladen...</p>
          ) : null}

          {!myLoansQuery.isLoading && myLoansQuery.data && myLoansQuery.data.length === 0 ? (
            <p className="text-sm text-slate-600">Noch keine Ausleihen vorhanden.</p>
          ) : null}

          <div className="mt-4 space-y-4">
            {openLoans.map((loan: any) => (
              <Card key={loan.id} className="rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {loan.storageRoom?.name ?? "Lagerraum"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {requestStatusLabel(loan.status)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Erstellt: {formatDateTime(loan.createdAt)}</p>
                  </div>

                  <Badge variant="secondary" className="bg-slate-100 text-slate-900">
                    {loan.items.reduce((sum: number, item: any) => sum + decimalToNumber(item.quantityApproved), 0)} gesamt
                  </Badge>
                </div>

                <div className="mt-3 space-y-2">
                  {loan.items.map((item: any) => {
                    const activeBorrowed =
                      decimalToNumber(item.quantityHandedOver) - decimalToNumber(item.quantityReturned);
                    const isActive = activeBorrowed > 0;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.lendableItem?.name ?? "Unbekannt"}</p>
                          <p className="text-xs text-slate-600">
                            {activeBorrowed > 0 ? "Aktiv" : "—"} {Math.floor(activeBorrowed)} Stk
                          </p>
                        </div>

                        {item.borrowedAt && item.dueAt ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Ausgeliehen: {formatDaysSince(item.borrowedAt)} | Faellig: {formatDateTime(item.dueAt)}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">Noch nicht uebergeben.</p>
                        )}

                        {isActive ? (
                          <div className="mt-2">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                              Rueckgabe geplant
                            </Badge>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {closedLoansNotHandedOver.length > 0 ? (
              <div className="pt-2">
                <h3 className="text-sm font-semibold text-slate-900">Erledigt (neu)</h3>
                <p className="mt-1 text-xs text-slate-500">Noch nicht uebergeben.</p>
              </div>
            ) : null}
            {closedLoansNotHandedOver.map((loan) => (
              <Card key={loan.id} className="rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {loan.storageRoom?.name ?? "Lagerraum"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{requestStatusLabel(loan.status)}</p>
                    <p className="mt-1 text-xs text-slate-500">Erstellt: {formatDateTime(loan.createdAt)}</p>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-900">
                    {loan.items.reduce((sum: number, item: any) => sum + decimalToNumber(item.quantityApproved), 0)} gesamt
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {loan.items.map((item: any) => {
                    const activeBorrowed =
                      decimalToNumber(item.quantityHandedOver) - decimalToNumber(item.quantityReturned);
                    const isActive = activeBorrowed > 0;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.lendableItem?.name ?? "Unbekannt"}</p>
                          <p className="text-xs text-slate-600">
                            {activeBorrowed > 0 ? "Aktiv" : "—"} {Math.floor(activeBorrowed)} Stk
                          </p>
                        </div>
                        {item.borrowedAt && item.dueAt ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Ausgeliehen: {formatDaysSince(item.borrowedAt)} | Faellig: {formatDateTime(item.dueAt)}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">Noch nicht uebergeben.</p>
                        )}
                        {isActive ? (
                          <div className="mt-2">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                              Rueckgabe geplant
                            </Badge>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {closedLoansHandedOver.length > 0 ? (
              <div className="pt-2">
                <h3 className="text-sm font-semibold text-slate-900">Erledigt (uebergeben)</h3>
                <p className="mt-1 text-xs text-slate-500">Bereits uebergeben.</p>
              </div>
            ) : null}
            {closedLoansHandedOver.map((loan: any) => (
              <Card key={loan.id} className="rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {loan.storageRoom?.name ?? "Lagerraum"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{requestStatusLabel(loan.status)}</p>
                    <p className="mt-1 text-xs text-slate-500">Erstellt: {formatDateTime(loan.createdAt)}</p>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-900">
                    {loan.items.reduce((sum: number, item: any) => sum + decimalToNumber(item.quantityApproved), 0)} gesamt
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {loan.items.map((item: any) => {
                    const activeBorrowed =
                      decimalToNumber(item.quantityHandedOver) - decimalToNumber(item.quantityReturned);
                    const isActive = activeBorrowed > 0;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.lendableItem?.name ?? "Unbekannt"}</p>
                          <p className="text-xs text-slate-600">
                            {activeBorrowed > 0 ? "Aktiv" : "—"} {Math.floor(activeBorrowed)} Stk
                          </p>
                        </div>
                        {item.borrowedAt && item.dueAt ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Ausgeliehen: {formatDaysSince(item.borrowedAt)} | Faellig: {formatDateTime(item.dueAt)}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">Noch nicht uebergeben.</p>
                        )}
                        {isActive ? (
                          <div className="mt-2">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                              Rueckgabe geplant
                            </Badge>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}

