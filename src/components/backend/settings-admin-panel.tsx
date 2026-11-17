"use client";

import { useState } from "react";

import { api, type RouterOutputs } from "~/trpc/react";
import { Card as ShellCard } from "~/components/ui/card";
import { Card, DetailText } from "~/components/ui/detail-card";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useToast } from "~/components/ui/toast";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { TeacherPicker, type DirectoryEntry } from "~/components/backend/teacher-picker";

type Settings = RouterOutputs["approval"]["settingsGet"]["settings"];

type SettingsForm = {
  approval: Omit<Settings["approval"], "fallbackApproverId" | "amountLimit" | "reminderAfterDays"> & {
    amountLimit: string;
    reminderAfterDays: string;
  };
  fallbackApprover: DirectoryEntry | null;
  mail: Settings["mail"];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ToggleRow(props: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-card/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        disabled={props.disabled}
        aria-label={props.title}
      />
    </div>
  );
}

type SettingsData = RouterOutputs["approval"]["settingsGet"];

function buildInitialForm(data: SettingsData, entries: DirectoryEntry[]): SettingsForm {
  const fallback = data.fallbackApprover;
  return {
    approval: {
      enabled: data.settings.approval.enabled,
      amountLimitEnabled: data.settings.approval.amountLimitEnabled,
      amountLimit: String(data.settings.approval.amountLimit),
      reminderAfterDays: String(data.settings.approval.reminderAfterDays),
    },
    fallbackApprover: fallback
      ? (entries.find((entry) => entry.userId === fallback.id) ?? {
          key: fallback.id,
          ref: { userId: fallback.id },
          userId: fallback.id,
          name: fallback.name ?? fallback.email ?? "-",
          email: fallback.email ?? "",
          group: null,
        })
      : null,
    mail: data.settings.mail,
  };
}

export function SettingsAdminPanel() {
  const settingsQuery = api.approval.settingsGet.useQuery();
  const directoryQuery = api.approval.directory.useQuery();

  if (!settingsQuery.data || directoryQuery.isLoading) {
    return (
      <ShellCard className="bg-transparent">
        <h2 className="mb-3 mt-1 text-xl font-semibold text-foreground">Einstellungen</h2>
        <p className="text-sm text-muted-foreground">
          {settingsQuery.error ? "Einstellungen konnten nicht geladen werden." : "Einstellungen werden geladen..."}
        </p>
      </ShellCard>
    );
  }

  // Remount with fresh state whenever the stored settings change (e.g. after saving).
  return (
    <SettingsEditor
      key={settingsQuery.dataUpdatedAt}
      initial={buildInitialForm(settingsQuery.data, directoryQuery.data?.entries ?? [])}
      entries={directoryQuery.data?.entries ?? []}
    />
  );
}

function SettingsEditor({ initial, entries }: { initial: SettingsForm; entries: DirectoryEntry[] }) {
  const utils = api.useUtils();
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm>(initial);
  const [baseline, setBaseline] = useState<SettingsForm>(initial);

  const saveMutation = api.approval.settingsSave.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.approval.settingsGet.invalidate(), utils.approval.myInfo.invalidate()]);
      toast.success("Einstellungen gespeichert.");
    },
    onError: (error) => toast.error(error.message),
  });

  const setApproval = (patch: Partial<SettingsForm["approval"]>) =>
    setForm((current) => ({ ...current, approval: { ...current.approval, ...patch } }));
  const setMail = (patch: Partial<SettingsForm["mail"]>) =>
    setForm((current) => ({ ...current, mail: { ...current.mail, ...patch } }));

  const amountLimit = Number(form.approval.amountLimit.replace(",", "."));
  const reminderAfterDays = Number(form.approval.reminderAfterDays);
  const amountLimitValid = Number.isFinite(amountLimit) && amountLimit >= 0;
  const reminderValid = Number.isInteger(reminderAfterDays) && reminderAfterDays >= 0 && reminderAfterDays <= 60;
  const warehouseValid = !form.mail.warehouseAddress.trim() || EMAIL_PATTERN.test(form.mail.warehouseAddress.trim());
  const bccValid = !form.mail.opsBccAddress.trim() || EMAIL_PATTERN.test(form.mail.opsBccAddress.trim());
  const canSave = amountLimitValid && reminderValid && warehouseValid && bccValid && !saveMutation.isPending;

  const dirty = isDirty(form, baseline, (value) => ({ ...value, fallbackApprover: value.fallbackApprover?.key ?? null }));
  const approvalDisabled = !form.approval.enabled;

  return (
    <ShellCard className="bg-transparent">
      <div className="mb-4 mt-1">
        <h2 className="text-xl font-semibold text-foreground">Einstellungen</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card variant="static" className="space-y-3">
          <DetailText variant="title">Bestellfreigabe</DetailText>
          <ToggleRow
            title="Freigabe-Workflow aktiv"
            description="Bestellungen von Lehrkräften müssen vom Freigeber ihrer Gruppe bestätigt werden."
            checked={form.approval.enabled}
            onCheckedChange={(enabled) => setApproval({ enabled })}
          />

          <div className="rounded-md bg-card/40 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Fallback-Freigeber</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Gibt Bestellungen von Lehrkräften ohne (aktive) Gruppe frei. Ohne Fallback bestellen diese direkt.
            </p>
            <TeacherPicker
              entries={entries}
              value={form.fallbackApprover}
              onChange={(fallbackApprover) => setForm((current) => ({ ...current, fallbackApprover }))}
              allowClear
              disabled={approvalDisabled}
            />
          </div>

          <div className="space-y-2 rounded-md bg-card/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Betragsgrenze</p>
                <p className="text-xs text-muted-foreground">
                  Bestellungen bis zu diesem Betrag gehen ohne Freigabe direkt an das Lager. Gruppen können einen
                  eigenen Wert festlegen.
                </p>
              </div>
              <Switch
                checked={form.approval.amountLimitEnabled}
                onCheckedChange={(amountLimitEnabled) => setApproval({ amountLimitEnabled })}
                disabled={approvalDisabled}
                aria-label="Betragsgrenze aktiv"
              />
            </div>
            {form.approval.amountLimitEnabled ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.approval.amountLimit}
                  onChange={(event) => setApproval({ amountLimit: event.target.value })}
                  disabled={approvalDisabled}
                  className="w-40 border border-primary/10"
                  aria-label="Betragsgrenze in Euro"
                />
                <span className="text-sm text-muted-foreground">€</span>
                {!amountLimitValid ? <span className="text-xs text-destructive">Ungültiger Betrag</span> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-md bg-card/40 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Erinnerung nach Tagen</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Freigeber werden erinnert, wenn eine Bestellung so lange offen ist (0 = aus). Benötigt einen täglichen
              Aufruf von <code className="text-[11px]">POST /api/backend/orders/approval-reminders</code>.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={60}
                step={1}
                value={form.approval.reminderAfterDays}
                onChange={(event) => setApproval({ reminderAfterDays: event.target.value })}
                disabled={approvalDisabled}
                className="w-24 border border-primary/10"
                aria-label="Erinnerung nach Tagen"
              />
              <span className="text-sm text-muted-foreground">Tage</span>
              {!reminderValid ? <span className="text-xs text-destructive">0–60 Tage</span> : null}
            </div>
          </div>
        </Card>

        <Card variant="static" className="space-y-3">
          <DetailText variant="title">E-Mail-Benachrichtigungen</DetailText>
          <ToggleRow
            title="Freigabe angefordert"
            description="An Freigeber und Vertretung, sobald eine Bestellung auf Freigabe wartet (Besteller/in in CC)."
            checked={form.mail.approvalRequested}
            onCheckedChange={(approvalRequested) => setMail({ approvalRequested })}
          />
          <ToggleRow
            title="Freigegeben / abgelehnt"
            description="An die bestellende Lehrkraft (Schüler/in in CC), inkl. Änderungen und Begründung."
            checked={form.mail.approvalDecided}
            onCheckedChange={(approvalDecided) => setMail({ approvalDecided })}
          />
          <ToggleRow
            title="Bestellung zurückgezogen"
            description="An Freigeber und Vertretung, wenn die Lehrkraft eine offene Bestellung zurückzieht."
            checked={form.mail.approvalCancelled}
            onCheckedChange={(approvalCancelled) => setMail({ approvalCancelled })}
          />
          <ToggleRow
            title="Erinnerung an Freigeber"
            description="Sammel-Mail über länger offene Freigaben (siehe Erinnerung nach Tagen)."
            checked={form.mail.approvalReminder}
            onCheckedChange={(approvalReminder) => setMail({ approvalReminder })}
          />
          <ToggleRow
            title="Neue Bestellung an Lager"
            description="An die Lager-Adresse, sobald eine Bestellung freigegeben ist oder keine Freigabe braucht."
            checked={form.mail.orderReleased}
            onCheckedChange={(orderReleased) => setMail({ orderReleased })}
          />

          <div className="rounded-md bg-card/40 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Lager-Adresse</p>
            <p className="mb-2 text-xs text-muted-foreground">Empfänger für „Neue Bestellung an Lager“.</p>
            <Input
              type="email"
              value={form.mail.warehouseAddress}
              onChange={(event) => setMail({ warehouseAddress: event.target.value })}
              placeholder="lager@schule.at"
              className="border border-primary/10"
            />
            {!warehouseValid ? <p className="mt-1 text-xs text-destructive">Ungültige E-Mail-Adresse</p> : null}
            {form.mail.orderReleased && !form.mail.warehouseAddress.trim() ? (
              <p className="mt-1 text-xs text-accent-orange">Ohne Adresse wird diese Mail nicht versendet.</p>
            ) : null}
          </div>

          <div className="rounded-md bg-card/40 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">BCC für alle Mails</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Kopie aller Bestell- und Ausleih-Mails. Leer = Wert aus der Serverkonfiguration (MAIL_OPS_BCC_ADDRESS).
            </p>
            <Input
              type="email"
              value={form.mail.opsBccAddress}
              onChange={(event) => setMail({ opsBccAddress: event.target.value })}
              className="border border-primary/10"
            />
            {!bccValid ? <p className="mt-1 text-xs text-destructive">Ungültige E-Mail-Adresse</p> : null}
          </div>
        </Card>
      </div>

      <UnsavedChangesBar
        open={dirty}
        title="Einstellungen"
        onReset={() => setForm(baseline)}
        onSave={() => {
          if (!canSave) return;
          saveMutation.mutate(
            {
              approval: {
                enabled: form.approval.enabled,
                amountLimitEnabled: form.approval.amountLimitEnabled,
                amountLimit,
                reminderAfterDays,
              },
              fallbackApprover: form.fallbackApprover?.ref ?? null,
              mail: {
                ...form.mail,
                warehouseAddress: form.mail.warehouseAddress.trim(),
                opsBccAddress: form.mail.opsBccAddress.trim(),
              },
            },
            { onSuccess: () => setBaseline(form) },
          );
        }}
        saveDisabled={!canSave}
        resetDisabled={saveMutation.isPending}
        saveLabel={saveMutation.isPending ? "Speichert..." : "Speichern"}
      />
    </ShellCard>
  );
}
