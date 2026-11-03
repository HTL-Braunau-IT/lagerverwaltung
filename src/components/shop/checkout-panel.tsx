"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, DetailText } from "../ui/detail-card";
import { api } from "~/trpc/react";
import { Textarea } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import { useToast } from "~/components/ui/toast";
import { ClockIcon } from "~/components/layout/icon-renders";
import { Button } from "../ui/button";

const SESSION_STORAGE_KEY = "lw_cart_session_id";

/** Use as Dialog `description` so the line sits under the title (same header block as `mb-4`), not in the body. */
export function getCheckoutIntro(role: string | undefined): string {
  return role === "STUDENT"
    ? "Wähle eine Lehrperson aus und sende deinen Warenkorb zur Freigabe."
    : "Wähle eine Kostenstelle aus und sende deinen Warenkorb als Bestellung ab.";
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export function CheckoutPanel(props: {
  /** When set (e.g. from /carts), uses this session id instead of creating a separate client instance. */
  sessionId?: string;
  onSuccessfulSubmit?: () => void;
}) {
  const { sessionId: sessionIdProp, onSuccessfulSubmit } = props;
  const { data: session, status: sessionStatus } = useSession();
  const utils = api.useUtils();
  const toast = useToast();
  const [fallbackSessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const sessionId = sessionIdProp ?? fallbackSessionId;
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
  const approvalInfoQuery = api.approval.myInfo.useQuery(undefined, {
    enabled: sessionStatus === "authenticated" && session?.user.role !== "STUDENT",
  });
  const teachersQuery = api.cart.listTeachersForCheckout.useQuery(undefined, {
    enabled: sessionStatus === "authenticated" && session?.user.role === "STUDENT",
  });

  const checkoutMutation = api.cart.checkout.useMutation({
    onSuccess: async (data) => {
      await utils.cart.get.invalidate({ sessionId });
      if (data.ok) {
        await utils.cart.listMyOrders.invalidate();
        toast.success(
          data.approvalStatus === "PENDING"
            ? `Bestellung ${data.orderNumber} wurde zur Freigabe gesendet.`
            : `Bestellung abgeschickt. Bestellnummer: ${data.orderNumber}`,
        );
        onSuccessfulSubmit?.();
        return;
      }
      switch (data.reason) {
        case "EMPTY_CART":
          toast.error("Dein Warenkorb ist leer. Bitte zuerst Artikel hinzufügen.");
          break;
        case "INVALID_COST_CENTER":
          toast.error("Die ausgewählte Kostenstelle ist ungültig. Bitte erneut wählen.");
          break;
        case "INSUFFICIENT_STOCK":
          toast.error("Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.");
          break;
        case "MIXED_STORAGE_ROOMS":
          toast.warning(
            "Dein Warenkorb enthält Produkte aus mehreren Lagerräumen. Bitte bestelle pro Lagerraum getrennt.",
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
        onSuccessfulSubmit?.();
        return;
      }
      switch (data.reason) {
        case "EMPTY_CART":
          toast.error("Dein Warenkorb ist leer. Bitte zuerst Produkte hinzufügen.");
          break;
        case "INVALID_TEACHER":
          toast.error("Die ausgewählte Lehrperson ist ungültig. Bitte erneut wählen.");
          break;
        case "INSUFFICIENT_STOCK":
          toast.error("Nicht genug Lagerbestand vorhanden. Bitte reduziere die Menge im Warenkorb.");
          break;
        case "MIXED_STORAGE_ROOMS":
          toast.warning(
            "Dein Warenkorb enthält Produkte aus mehreren Lagerräumen. Bitte bestelle pro Lagerraum getrennt.",
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
    <>
      <Card variant="warning">
        <div className="flex items-center gap-1.5 text-accent-orange">
          <ClockIcon className="h-5 w-5 shrink-0" />
          <DetailText variant="noteTitle" className="!mt-0">
            Öffnungszeiten Lager
          </DetailText>
        </div>
        <DetailText variant="value" className="text-xs !font-normal">        
          Montag bis Donnerstag von <span className="font-semibold">08:00</span> bis{" "}
          <span className="font-semibold">12:00</span> und von <span className="font-semibold">13:00</span> bis{" "}
          <span className="font-semibold">16:00</span>, Freitag von <span className="font-semibold">08:00</span> bis{" "}
          <span className="font-semibold">12:00</span>.
        </DetailText>
      </Card>

      {isStudentCheckout ? (
        <div className="mt-4 space-y-2">
          <label htmlFor="teacher" className="block text-sm font-medium text-slate-800">
            Lehrperson
          </label>
          <Select
            id="teacher"
            value={teacherExternalId}
            onValueChange={setTeacherExternalId}
            disabled={teachersQuery.isLoading || submitForTeacherApprovalMutation.isPending}
            placeholder="Bitte Lehrperson wählen"
            options={[
              { value: "", label: "Bitte Lehrperson wählen" },
              ...(teachersQuery.data?.map((teacher: { externalId: string; displayName: string; email: string }) => ({
                value: teacher.externalId,
                label: `${teacher.displayName} - ${teacher.email}`,
              })) ?? []),
            ]}
            className="w-full rounded-sm bg-card/40 px-2.5 py-2 text-sm text-slate-900 ring-1 ring-inset ring-border/50 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          {teachersQuery.error ? (
            <p className="text-sm text-rose-700">
              Lehrerliste konnte nicht geladen werden. Bitte später erneut versuchen.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <DetailText variant="value">Kostenstelle<span className="text-destructive pl-1">*</span></DetailText>
          <Select
            id="cost-center"
            value={costCenterId}
            onValueChange={setCostCenterId}
            disabled={costCentersQuery.isLoading || checkoutMutation.isPending}
            placeholder="Bitte Kostenstelle wählen"
            options={[
              { value: "", label: "Bitte Kostenstelle wählen" },
              ...(costCentersQuery.data?.map((center) => ({
                value: center.id,
                label: center.name,
              })) ?? []),
            ]}
            className="!m-0 w-full !bg-card/80 rounded-sm px-2.5 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 border border-primary/10"
          />
        </div>
      )}

      {!isStudentCheckout && approvalInfoQuery.data ? (
        <Card variant="static" className="mt-4">
          <DetailText variant="kicker">Freigabe erforderlich</DetailText>
          <DetailText variant="value" className="!font-normal">
            Deine Bestellung wird von{" "}
            <span className="font-semibold">{approvalInfoQuery.data.approvers.join(" oder ")}</span> freigegeben,
            bevor sie an das Lager geht.
            {approvalInfoQuery.data.amountLimit !== null
              ? ` Bestellungen bis ${new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(approvalInfoQuery.data.amountLimit)} gehen direkt an das Lager.`
              : null}
          </DetailText>
        </Card>
      ) : null}

      <div className="mt-4 space-y-2">
        <DetailText variant="value">
          Hinweis für Lager
          {isStudentCheckout ? (
            <span className="pl-1 text-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
        </DetailText>
        <div className="relative">
          <Textarea
            id="worker-note"
            value={workerNote}
            onChange={(event) => setWorkerNote(event.target.value)}
            maxLength={500}
            rows={4}
            className="border border-primary/10 pb-8"
            placeholder={
              isStudentCheckout
                ? "Bitte gib relevante Infos für das Lager ein (z. B. Klasse, Projekt, Dringlichkeit)."
                : "Optionale Infos für das Lager (z. B. Abholung durch Kollegin)."
            }
          />
          <span
            className="pointer-events-none absolute bottom-2 right-4 text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {trimmedWorkerNote.length}/500
          </span>
        </div>
        {isStudentCheckout && trimmedWorkerNote.length === 0 ? (
          <p className="text-sm text-rose-700">Bitte gib einen Hinweis für das Lager ein.</p>
        ) : null}
      </div>

      <Button
        type="button"
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
        variant="solid"
        className="mt-4 !h-10"
      >
        {checkoutMutation.isPending || submitForTeacherApprovalMutation.isPending
          ? "Bestellung wird gespeichert..."
          : "Bestellen"}
      </Button>
    </>
  );
}
