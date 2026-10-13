"use client";

import { Fragment, useMemo, useState } from "react";

import { api, type RouterOutputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card as ShellCard } from "~/components/ui/card";
import { Card, DetailText } from "~/components/ui/detail-card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";
import { useConfirmClick } from "~/components/backend/use-confirm-click";
import {
  TeacherMultiPicker,
  TeacherPicker,
  type DirectoryEntry,
} from "~/components/backend/teacher-picker";

type Group = RouterOutputs["approval"]["groupList"][number];
type GroupUser = Group["approver"];

type GroupForm = {
  id?: string;
  name: string;
  isActive: boolean;
  approver: DirectoryEntry | null;
  deputy: DirectoryEntry | null;
  hasOwnLimit: boolean;
  amountLimit: string;
  members: DirectoryEntry[];
};

const NEW_GROUP_KEY = "__new__";

function emptyForm(): GroupForm {
  return {
    name: "",
    isActive: true,
    approver: null,
    deputy: null,
    hasOwnLimit: false,
    amountLimit: "",
    members: [],
  };
}

function userLabel(user: { name: string | null; email: string | null } | null) {
  if (!user) return "-";
  return user.name?.trim() || user.email?.trim() || "-";
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(value);
}

export function ApprovalGroupsAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const groupsQuery = api.approval.groupList.useQuery();
  const directoryQuery = api.approval.directory.useQuery();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: editingKey,
  });

  const entries = useMemo(() => directoryQuery.data?.entries ?? [], [directoryQuery.data]);
  const entryByUserId = useMemo(
    () => new Map(entries.filter((entry) => entry.userId).map((entry) => [entry.userId!, entry])),
    [entries],
  );
  const groups = groupsQuery.data ?? [];

  const toEntry = (user: GroupUser): DirectoryEntry =>
    entryByUserId.get(user.id) ?? {
      key: user.id,
      ref: { userId: user.id },
      userId: user.id,
      name: userLabel(user),
      email: user.email ?? "",
      group: null,
    };

  const invalidate = async () => {
    await Promise.all([utils.approval.groupList.invalidate(), utils.approval.directory.invalidate()]);
  };

  const saveMutation = api.approval.groupSave.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingKey(null);
      toast.success("Freigabegruppe gespeichert.");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = api.approval.groupDelete.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingKey(null);
      toast.success("Freigabegruppe gelöscht.");
    },
    onError: (error) => toast.error(error.message),
  });
  const assignMutation = api.approval.groupAssignMember.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Lehrkraft zugeordnet.");
    },
    onError: (error) => toast.error(error.message),
  });

  const openEditor = (group: Group | null) => {
    if (!group) {
      setForm(emptyForm());
      setEditingKey((current) => (current === NEW_GROUP_KEY ? null : NEW_GROUP_KEY));
      return;
    }
    setForm({
      id: group.id,
      name: group.name,
      isActive: group.isActive,
      approver: toEntry(group.approver),
      deputy: group.deputy ? toEntry(group.deputy) : null,
      hasOwnLimit: group.amountLimit !== null,
      amountLimit: group.amountLimit !== null ? String(group.amountLimit) : "",
      members: group.members.map(toEntry),
    });
    setEditingKey((current) => (current === group.id ? null : group.id));
  };

  const amountLimitValue = form.hasOwnLimit ? Number(form.amountLimit.replace(",", ".")) : null;
  const amountLimitValid = amountLimitValue === null || (Number.isFinite(amountLimitValue) && amountLimitValue >= 0);
  const canSave =
    form.name.trim().length > 0 &&
    form.approver !== null &&
    form.approver.key !== form.deputy?.key &&
    amountLimitValid &&
    !saveMutation.isPending;

  const save = () => {
    if (!canSave || !form.approver) return;
    saveMutation.mutate({
      id: form.id,
      name: form.name.trim(),
      isActive: form.isActive,
      approver: form.approver.ref,
      deputy: form.deputy?.ref ?? null,
      amountLimit: amountLimitValue,
      members: form.members.map((member) => member.ref),
    });
  };

  const describeMember = (entry: DirectoryEntry) =>
    entry.group && entry.group.id !== form.id ? `wird aus „${entry.group.name}“ verschoben` : null;

  const editor = (
    <div className="grid grid-cols-1 gap-4 p-1 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <DetailText variant="kicker">Name</DetailText>
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="z. B. Abteilung Elektronik"
            maxLength={120}
            className="mt-1 border border-primary/10"
          />
        </div>
        <div>
          <DetailText variant="kicker">Freigeber</DetailText>
          <div className="mt-1">
            <TeacherPicker
              entries={entries}
              value={form.approver}
              onChange={(approver) => setForm((current) => ({ ...current, approver }))}
            />
          </div>
        </div>
        <div>
          <DetailText variant="kicker">Vertretung (optional)</DetailText>
          <div className="mt-1">
            <TeacherPicker
              entries={entries.filter((entry) => entry.key !== form.approver?.key)}
              value={form.deputy}
              onChange={(deputy) => setForm((current) => ({ ...current, deputy }))}
              allowClear
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Erhält dieselben Freigabe-Mails und kann ebenfalls entscheiden.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-card/40 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-foreground">Aktiv</p>
            <p className="text-xs text-muted-foreground">
              Inaktive Gruppen werden ignoriert, Mitglieder gehen an den Fallback-Freigeber.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
            aria-label="Gruppe aktiv"
          />
        </div>
        <div className="space-y-2 rounded-md bg-card/40 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Eigene Betragsgrenze</p>
              <p className="text-xs text-muted-foreground">
                Überschreibt die globale Einstellung: Bestellungen bis zu diesem Betrag brauchen keine Freigabe.
              </p>
            </div>
            <Switch
              checked={form.hasOwnLimit}
              onCheckedChange={(hasOwnLimit) => setForm((current) => ({ ...current, hasOwnLimit }))}
              aria-label="Eigene Betragsgrenze"
            />
          </div>
          {form.hasOwnLimit ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.amountLimit}
                onChange={(event) => setForm((current) => ({ ...current, amountLimit: event.target.value }))}
                className="w-40 border border-primary/10"
                aria-label="Betragsgrenze in Euro"
              />
              <span className="text-sm text-muted-foreground">€</span>
              {!amountLimitValid ? <span className="text-xs text-destructive">Ungültiger Betrag</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <DetailText variant="kicker">Mitglieder ({form.members.length})</DetailText>
          <p className="mb-2 text-xs text-muted-foreground">
            Bestellungen dieser Lehrkräfte müssen vom Freigeber bestätigt werden. Eine Lehrkraft kann nur in einer
            Gruppe sein.
          </p>
          <TeacherMultiPicker
            entries={entries}
            value={form.members}
            onChange={(members) => setForm((current) => ({ ...current, members }))}
            describe={describeMember}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          {form.id ? (
            <Button
              type="button"
              variant="destructive"
              className="!w-auto px-5"
              disabled={deleteMutation.isPending}
              onClick={() => confirmOrRunDelete(() => deleteMutation.mutate({ id: form.id! }))}
            >
              {deleteMutation.isPending ? "Löscht..." : isConfirmingDelete ? "Nochmal klicken" : "Löschen"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="!w-auto px-5" onClick={() => setEditingKey(null)}>
            Abbrechen
          </Button>
          <Button type="button" variant="solid" className="!w-auto px-5" disabled={!canSave} onClick={save}>
            {saveMutation.isPending ? "Speichert..." : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );

  const approverUserIds = new Set(groups.flatMap((group) => [group.approver.id, group.deputy?.id]));
  const ungrouped = entries.filter((entry) => !entry.group && !(entry.userId && approverUserIds.has(entry.userId)));

  return (
    <ShellCard className="bg-transparent">
      <div className="mb-3 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Freigabegruppen</h2>
          <p className="text-sm text-muted-foreground">
            Bestellungen von Gruppenmitgliedern gehen erst nach Freigabe durch den Freigeber an das Lager.
          </p>
        </div>
        <Button type="button" variant="new" className="!w-auto gap-1.5 px-4" onClick={() => openEditor(null)}>
          <PlusIcon className="h-4 w-4" />
          Neue Gruppe
        </Button>
      </div>

      {directoryQuery.data?.directoryError ? (
        <p className="mb-3 rounded-md bg-accent-orange/15 px-3 py-2 text-sm text-foreground">
          Das Lehrerverzeichnis (Entra) ist gerade nicht erreichbar. Es werden nur bereits bekannte Benutzer angezeigt.
        </p>
      ) : null}

      {editingKey === NEW_GROUP_KEY ? (
        <Card variant="static" className="mb-4">
          <DetailText variant="title" className="mb-3">
            Neue Freigabegruppe
          </DetailText>
          {editor}
        </Card>
      ) : null}

      <div className="overflow-x-auto">
        <TableUI.Table>
          <TableUI.TableHeader>
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Freigeber</TableUI.TableHead>
              <TableUI.TableHead>Vertretung</TableUI.TableHead>
              <TableUI.TableHead>Mitglieder</TableUI.TableHead>
              <TableUI.TableHead>Betragsgrenze</TableUI.TableHead>
              <TableUI.TableHead>Offen</TableUI.TableHead>
              <TableUI.TableHead>Status</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {groupsQuery.isLoading ? (
              <TableUI.TableRow className="cursor-default">
                <TableUI.TableCell colSpan={7} className="text-muted-foreground">
                  Gruppen werden geladen...
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}
            {!groupsQuery.isLoading && groups.length === 0 ? (
              <TableUI.TableRow className="cursor-default">
                <TableUI.TableCell colSpan={7} className="text-muted-foreground">
                  Noch keine Freigabegruppen angelegt.
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}
            {groups.map((group) => (
              <Fragment key={group.id}>
                <TableUI.TableRow className="cursor-pointer select-none" onClick={() => openEditor(group)}>
                  <TableUI.TableCell className="font-medium text-foreground">{group.name}</TableUI.TableCell>
                  <TableUI.TableCell className="text-muted-foreground">{userLabel(group.approver)}</TableUI.TableCell>
                  <TableUI.TableCell className="text-muted-foreground">{userLabel(group.deputy)}</TableUI.TableCell>
                  <TableUI.TableCell className="tabular-nums text-muted-foreground">{group.members.length}</TableUI.TableCell>
                  <TableUI.TableCell className="text-muted-foreground">
                    {group.amountLimit !== null ? formatEuro(group.amountLimit) : "Global"}
                  </TableUI.TableCell>
                  <TableUI.TableCell className="tabular-nums text-muted-foreground">{group.pendingCount}</TableUI.TableCell>
                  <TableUI.TableCell>
                    <Badge variant={group.isActive ? "orderThird" : "secondary"}>
                      {group.isActive ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableUI.TableCell>
                </TableUI.TableRow>
                <TableUI.TableExpandableRow
                  open={editingKey === group.id}
                  colSpan={7}
                  rowClassName="bg-muted/30"
                  cellClassName="p-3"
                >
                  {editingKey === group.id ? editor : null}
                </TableUI.TableExpandableRow>
              </Fragment>
            ))}
          </TableUI.TableBody>
        </TableUI.Table>
      </div>

      <Card variant="static" className="mt-6">
        <DetailText variant="title">Lehrkräfte ohne Gruppe ({ungrouped.length})</DetailText>
        <p className="mb-3 text-sm text-muted-foreground">
          Bestellungen dieser Lehrkräfte gehen an den Fallback-Freigeber (siehe Einstellungen). Freigeber und
          Vertretungen sind ausgeblendet, ihre Bestellungen gelten automatisch als freigegeben.
        </p>
        {directoryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Verzeichnis wird geladen...</p>
        ) : ungrouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Alle Lehrkräfte sind einer Gruppe zugeordnet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto">
            {ungrouped.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                </div>
                <div className="w-64">
                  <Select
                    value=""
                    onValueChange={(groupId) => {
                      if (!groupId) return;
                      assignMutation.mutate({ groupId, member: entry.ref });
                    }}
                    disabled={assignMutation.isPending || groups.length === 0}
                    placeholder="Gruppe zuordnen"
                    options={[
                      { value: "", label: "Gruppe zuordnen" },
                      ...groups.map((group) => ({ value: group.id, label: group.name })),
                    ]}
                    className="!mt-0 w-full px-2.5 py-1.5 text-sm"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ShellCard>
  );
}
