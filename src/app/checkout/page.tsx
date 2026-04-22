"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";
import { useToast } from "~/components/ui/toast";

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
  const toast = useToast();
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [costCenterId, setCostCenterId] = useState("");
  const [teacherExternalId, setTeacherExternalId] = useState("");
  const [workerNote, setWorkerNote] = useState("");

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
    onSuccess: async (data) => {
      await utils.cart.get.invalidate({ sessionId });
      if (data.ok) {
        toast.success(`Bestellung abgeschickt. Bestellnummer: ${data.orderNumber}`);
        return;
      }
      switch (data.reason) {
        case "EMPTY_CART":
          toast.error("Dein Warenkorb ist leer. Bitte zuerst Artikel hinzufuegen.");
          break;
        case "INVALID_COST_CENTER":
          toast.error("Die ausgewaehlte Kostenstelle ist ungueltig. Bitte erneut waehlen.");
          break;
        case "INSUFFICIENT_STOCK":
          toast.error("Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.");
          break;
        case "MIXED_STORAGE_ROOMS":
          toast.warning(
            "Dein Warenkorb enthaelt Produkte aus mehreren Lagerraeumen. Bitte bestelle pro Lagerraum getrennt.",
          );
          break;
      }
    },
  });
  const submitForTeacherApprovalMutation = api.cart.submitForTeacherApproval.useMutation({
    onSuccess: async (data) => {
      await utils.cart.get.invalidate({ sessionId });
      if (data.ok) {
        toast.success("Anfrage an Lehrperson gesendet.");
        return;
      }
      switch (data.reason) {
        case "EMPTY_CART":
          toast.error("Dein Warenkorb ist leer. Bitte zuerst Artikel hinzufuegen.");
          break;
        case "INVALID_TEACHER":
          toast.error("Die ausgewaehlte Lehrperson ist ungueltig. Bitte erneut waehlen.");
          break;
        case "INSUFFICIENT_STOCK":
          toast.error("Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.");
          break;
        case "MIXED_STORAGE_ROOMS":
          toast.warning(
            "Dein Warenkorb enthaelt Produkte aus mehreren Lagerraeumen. Bitte bestelle pro Lagerraum getrennt.",
          );
          break;
      }
    },
  });

  const currentRole = session?.user.role;
  const isStudentCheckout = currentRole === "STUDENT";
  const trimmedWorkerNote = workerNote.trim();

  const itemCount = useMemo(() => cartQuery.data?.items.length ?? 0, [cartQuery.data?.items.length]);

  const canSubmit =
    sessionId.length > 0 &&
    (!isStudentCheckout ? costCenterId.length > 0 : teacherExternalId.length > 0) &&
    (!isStudentCheckout || trimmedWorkerNote.length > 0) &&
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

        <div className="mt-5 space-y-2">
          <label htmlFor="worker-note" className="block text-sm font-medium text-slate-800">
            Hinweis fuer Lager {isStudentCheckout ? "(Pflichtfeld)" : "(optional)"}
          </label>
          <textarea
            id="worker-note"
            value={workerNote}
            onChange={(event) => setWorkerNote(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder={
              isStudentCheckout
                ? "Bitte gib relevante Infos fuer das Lager ein (z. B. Klasse, Projekt, Dringlichkeit)."
                : "Optionale Infos fuer das Lager (z. B. Abholung durch Kollegin)."
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {isStudentCheckout
                ? "Schueler muessen einen Hinweis fuer das Lager angeben."
                : "Fuer Lehrpersonen/Admins ist der Hinweis optional."}
            </span>
            <span>{trimmedWorkerNote.length}/500</span>
          </div>
          {isStudentCheckout && trimmedWorkerNote.length === 0 ? (
            <p className="text-sm text-rose-700">Bitte gib einen Hinweis fuer das Lager ein.</p>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Aktuelle Artikel im Warenkorb: <span className="font-semibold text-slate-900">{itemCount}</span>
        </div>

        <button
          onClick={() => {
            if (isStudentCheckout) {
              submitForTeacherApprovalMutation.mutate({
                sessionId,
                teacherExternalId,
                workerNote: trimmedWorkerNote || undefined,
              });
              return;
            }
            checkoutMutation.mutate({
              sessionId,
              costCenterId,
              workerNote: trimmedWorkerNote || undefined,
            });
          }}
          disabled={!canSubmit}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkoutMutation.isPending || submitForTeacherApprovalMutation.isPending
            ? "Bestellung wird gespeichert..."
            : "Bestellen"}
        </button>

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
