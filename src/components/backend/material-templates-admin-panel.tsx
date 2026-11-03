"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { useConfirmClick } from "~/components/backend/use-confirm-click";

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

type DraftState = { name: string; density: string; pricePerKg: string };

const emptyDraft: DraftState = { name: "", density: "", pricePerKg: "" };

export function MaterialTemplatesAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const listQuery = api.materialTemplate.backendList.useQuery();
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [newDraft, setNewDraft] = useState<DraftState>(emptyDraft);
  const { isConfirming, confirmOrRun } = useConfirmClick({ resetKey: null });

  const invalidate = async () => {
    await Promise.all([
      utils.materialTemplate.backendList.invalidate(),
      utils.materialTemplate.list.invalidate(),
    ]);
  };

  const upsertMutation = api.materialTemplate.backendUpsert.useMutation({
    onSuccess: async () => {
      await invalidate();
      setNewDraft(emptyDraft);
      toast.success("Materialvorlage gespeichert.");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = api.materialTemplate.backendDelete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Materialvorlage gelöscht.");
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = listQuery.data ?? [];

  const saveRow = (id: string, isActive: boolean) => {
    const base = rows.find((row) => row.id === id);
    if (!base) return;
    const draft = drafts[id];
    const name = (draft?.name ?? base.name).trim();
    const density = Number((draft?.density ?? String(toNumber(base.density))).replace(",", "."));
    const pricePerKg = Number((draft?.pricePerKg ?? String(toNumber(base.pricePerKg))).replace(",", "."));
    if (!name || !(density > 0) || !(pricePerKg >= 0)) {
      toast.error("Bitte Name, Dichte (> 0) und Preis pro kg angeben.");
      return;
    }
    upsertMutation.mutate({ id, name, density, pricePerKg, isActive });
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Materialvorlagen</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Dichte in g/cm³, Preis pro kg. Diese Vorlagen berechnen einen Preisvorschlag im Produkt.
      </p>

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader>
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Dichte (g/cm³)</TableUI.TableHead>
              <TableUI.TableHead>Preis / kg</TableUI.TableHead>
              <TableUI.TableHead>Produkte</TableUI.TableHead>
              <TableUI.TableHead>Aktionen</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {listQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={5} className="text-sm italic text-muted-foreground/80">
                  Materialvorlagen werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!listQuery.isLoading && rows.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={5} className="text-sm italic text-muted-foreground/80">
                  Keine Materialvorlagen vorhanden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {rows.map((row) => {
              const draft = drafts[row.id];
              const setField = (field: keyof DraftState, value: string) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: {
                    name: current[row.id]?.name ?? row.name,
                    density: current[row.id]?.density ?? String(toNumber(row.density)),
                    pricePerKg: current[row.id]?.pricePerKg ?? String(toNumber(row.pricePerKg)),
                    [field]: value,
                  },
                }));
              return (
                <TableUI.TableRow key={row.id}>
                  <TableUI.TableCell className="px-3 py-2">
                    <Input
                      value={draft?.name ?? row.name}
                      onChange={(event) => setField("name", event.target.value)}
                      className="!h-8 text-sm"
                    />
                  </TableUI.TableCell>
                  <TableUI.TableCell className="px-3 py-2">
                    <Input
                      inputMode="decimal"
                      value={draft?.density ?? String(toNumber(row.density))}
                      onChange={(event) => setField("density", event.target.value)}
                      className="!h-8 w-24 text-sm"
                    />
                  </TableUI.TableCell>
                  <TableUI.TableCell className="px-3 py-2">
                    <Input
                      inputMode="decimal"
                      value={draft?.pricePerKg ?? String(toNumber(row.pricePerKg))}
                      onChange={(event) => setField("pricePerKg", event.target.value)}
                      className="!h-8 w-24 text-sm"
                    />
                  </TableUI.TableCell>
                  <TableUI.TableCell className="px-3 py-2 text-sm tabular-nums text-muted-foreground">
                    {row._count.products}
                  </TableUI.TableCell>
                  <TableUI.TableCell className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="solid"
                        className="!h-8"
                        disabled={upsertMutation.isPending}
                        onClick={() => saveRow(row.id, row.isActive)}
                      >
                        Speichern
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructiveTransparent"
                        className="!h-8 !w-auto"
                        disabled={deleteMutation.isPending}
                        onClick={() =>
                          confirmOrRun(() => deleteMutation.mutate({ id: row.id }))
                        }
                      >
                        {isConfirming ? "Sicher?" : "Löschen"}
                      </Button>
                    </div>
                  </TableUI.TableCell>
                </TableUI.TableRow>
              );
            })}
            <TableUI.TableRow>
              <TableUI.TableCell className="px-3 py-2">
                <Input
                  value={newDraft.name}
                  placeholder="Neues Material"
                  onChange={(event) => setNewDraft((d) => ({ ...d, name: event.target.value }))}
                  className="!h-8 text-sm"
                />
              </TableUI.TableCell>
              <TableUI.TableCell className="px-3 py-2">
                <Input
                  inputMode="decimal"
                  value={newDraft.density}
                  placeholder="z. B. 2,70"
                  onChange={(event) => setNewDraft((d) => ({ ...d, density: event.target.value }))}
                  className="!h-8 w-24 text-sm"
                />
              </TableUI.TableCell>
              <TableUI.TableCell className="px-3 py-2">
                <Input
                  inputMode="decimal"
                  value={newDraft.pricePerKg}
                  placeholder="z. B. 4,50"
                  onChange={(event) => setNewDraft((d) => ({ ...d, pricePerKg: event.target.value }))}
                  className="!h-8 w-24 text-sm"
                />
              </TableUI.TableCell>
              <TableUI.TableCell className="px-3 py-2 text-sm text-muted-foreground">—</TableUI.TableCell>
              <TableUI.TableCell className="px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="solid"
                  className="!h-8"
                  disabled={upsertMutation.isPending}
                  onClick={() => {
                    const name = newDraft.name.trim();
                    const density = Number(newDraft.density.replace(",", "."));
                    const pricePerKg = Number(newDraft.pricePerKg.replace(",", "."));
                    if (!name || !(density > 0) || !(pricePerKg >= 0)) {
                      toast.error("Bitte Name, Dichte (> 0) und Preis pro kg angeben.");
                      return;
                    }
                    upsertMutation.mutate({ name, density, pricePerKg, isActive: true });
                  }}
                >
                  Hinzufügen
                </Button>
              </TableUI.TableCell>
            </TableUI.TableRow>
          </TableUI.TableBody>
        </TableUI.Table>
      </div>
    </Card>
  );
}
