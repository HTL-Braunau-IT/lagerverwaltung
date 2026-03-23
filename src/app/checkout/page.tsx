"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";

const SESSION_STORAGE_KEY = "lw_cart_session_id";

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export default function CheckoutPage() {
  const { data: session, status: sessionStatus } = useSession();
  const utils = api.useUtils();
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [costCenterId, setCostCenterId] = useState("");
  const [teacherExternalId, setTeacherExternalId] = useState("");

  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
  const costCentersQuery = api.cart.listCostCenters.useQuery();
  const teachersQuery = api.cart.listTeachersForCheckout.useQuery(undefined, {
    enabled: sessionStatus === "authenticated" && session?.user.role === "STUDENT",
  });

  const checkoutMutation = api.cart.checkout.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
    },
  });
  const submitForTeacherApprovalMutation = api.cart.submitForTeacherApproval.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
    },
  });

  const currentRole = session?.user.role;
  const isStudentCheckout = currentRole === "STUDENT";

  const itemCount = useMemo(() => cartQuery.data?.items.length ?? 0, [cartQuery.data?.items.length]);

  const canSubmit =
    sessionId.length > 0 &&
    (!isStudentCheckout ? costCenterId.length > 0 : teacherExternalId.length > 0) &&
    itemCount > 0 &&
    !checkoutMutation.isPending &&
    !submitForTeacherApprovalMutation.isPending &&
    !cartQuery.isLoading;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Bestellung</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isStudentCheckout
            ? "Waehle eine Lehrperson aus und sende deinen Warenkorb zur Freigabe."
            : "Waehle eine Kostenstelle aus und sende deinen Warenkorb als Bestellung ab."}
        </p>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Lager ist offen Montag bis Donnerstag von 08:00 bis 12:00 und von 13:00 bis 16:00, Freitag
          von 08:00 bis 12:00.
        </div>

        {isStudentCheckout ? (
          <div className="mt-5 space-y-2">
            <label htmlFor="teacher" className="block text-sm font-medium text-slate-800">
              Lehrperson
            </label>
            <select
              id="teacher"
              value={teacherExternalId}
              onChange={(event) => setTeacherExternalId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
              disabled={teachersQuery.isLoading || submitForTeacherApprovalMutation.isPending}
            >
              <option value="">Bitte Lehrperson waehlen</option>
              {teachersQuery.data?.map((teacher: { externalId: string; displayName: string; email: string }) => (
                <option key={teacher.externalId} value={teacher.externalId}>
                  {teacher.displayName} - {teacher.email}
                </option>
              ))}
            </select>
            {teachersQuery.error && (
              <p className="text-sm text-rose-700">
                Lehrerliste konnte nicht geladen werden. Bitte spaeter erneut versuchen.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <label htmlFor="cost-center" className="block text-sm font-medium text-slate-800">
              Kostenstelle
            </label>
            <select
              id="cost-center"
              value={costCenterId}
              onChange={(event) => setCostCenterId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
              disabled={costCentersQuery.isLoading || checkoutMutation.isPending}
            >
              <option value="">Bitte Kostenstelle waehlen</option>
              {costCentersQuery.data?.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.code} - {center.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Aktuelle Artikel im Warenkorb: <span className="font-semibold text-slate-900">{itemCount}</span>
        </div>

        <button
          onClick={() => {
            if (isStudentCheckout) {
              submitForTeacherApprovalMutation.mutate({ sessionId, teacherExternalId });
              return;
            }
            checkoutMutation.mutate({ sessionId, costCenterId });
          }}
          disabled={!canSubmit}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkoutMutation.isPending || submitForTeacherApprovalMutation.isPending
            ? "Bestellung wird gespeichert..."
            : "Bestellen"}
        </button>

        {submitForTeacherApprovalMutation.data?.ok && (
          <p className="mt-3 text-sm text-emerald-700">
            Anfrage erfolgreich an Lehrperson gesendet.
          </p>
        )}
        {submitForTeacherApprovalMutation.data &&
          !submitForTeacherApprovalMutation.data.ok &&
          submitForTeacherApprovalMutation.data.reason === "EMPTY_CART" && (
            <p className="mt-3 text-sm text-rose-700">
              Dein Warenkorb ist leer. Bitte zuerst Artikel hinzufuegen.
            </p>
          )}
        {submitForTeacherApprovalMutation.data &&
          !submitForTeacherApprovalMutation.data.ok &&
          submitForTeacherApprovalMutation.data.reason === "INVALID_TEACHER" && (
            <p className="mt-3 text-sm text-rose-700">
              Die ausgewaehlte Lehrperson ist ungueltig. Bitte erneut waehlen.
            </p>
          )}
        {submitForTeacherApprovalMutation.data &&
          !submitForTeacherApprovalMutation.data.ok &&
          submitForTeacherApprovalMutation.data.reason === "INSUFFICIENT_STOCK" && (
            <p className="mt-3 text-sm text-rose-700">
              Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.
            </p>
          )}
        {submitForTeacherApprovalMutation.error && (
          <p className="mt-3 text-sm text-rose-700">
            Anfrage fehlgeschlagen. Bitte pruefe deine Eingaben und versuche es erneut.
          </p>
        )}

        {checkoutMutation.data?.ok && (
          <p className="mt-3 text-sm text-emerald-700">
            Bestellung erfolgreich gespeichert. Bestellnummer: {checkoutMutation.data.orderNumber}
          </p>
        )}
        {checkoutMutation.data && !checkoutMutation.data.ok && checkoutMutation.data.reason === "EMPTY_CART" && (
          <p className="mt-3 text-sm text-rose-700">Dein Warenkorb ist leer. Bitte zuerst Artikel hinzufuegen.</p>
        )}
        {checkoutMutation.data &&
          !checkoutMutation.data.ok &&
          checkoutMutation.data.reason === "INVALID_COST_CENTER" && (
            <p className="mt-3 text-sm text-rose-700">
              Die ausgewaehlte Kostenstelle ist ungueltig. Bitte erneut waehlen.
            </p>
          )}
        {checkoutMutation.data &&
          !checkoutMutation.data.ok &&
          checkoutMutation.data.reason === "INSUFFICIENT_STOCK" && (
            <p className="mt-3 text-sm text-rose-700">
              Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.
            </p>
          )}
        {checkoutMutation.error && (
          <p className="mt-3 text-sm text-rose-700">
            Bestellung fehlgeschlagen. Bitte pruefe deine Eingaben und versuche es erneut.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/carts"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
          >
            Zurueck zu Warenkoerben
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Weiter einkaufen
          </Link>
        </div>
      </section>
    </main>
  );
}
