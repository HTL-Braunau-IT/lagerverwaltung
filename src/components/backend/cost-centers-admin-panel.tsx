"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type CostCenterForm = {
  name: string;
};

function createEmptyForm(): CostCenterForm {
  return {
    name: "",
  };
}

function toCostCenterCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CostCentersAdminPanel() {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CostCenterForm>(createEmptyForm);

  const costCentersQuery = api.costCenter.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const createMutation = api.costCenter.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
      setForm(createEmptyForm());
      setCreateOpen(false);
    },
  });
  const updateMutation = api.costCenter.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.costCenter.backendList.invalidate(),
        utils.costCenter.list.invalidate(),
        selectedId ? utils.costCenter.byId.invalidate({ id: selectedId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteMutation = api.costCenter.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
      setSelectedId(null);
      setForm(createEmptyForm());
    },
  });

  const items = useMemo(
    () =>
      [...(costCentersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    [costCentersQuery.data],
  );

  const isEditing = Boolean(selectedId);
  const generatedCode = toCostCenterCode(form.name.trim());
  const canSave = form.name.trim().length > 0 && generatedCode.length > 0;

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kostenstellen</h2>
        </div>
        <Button
          type="button"
          onClick={() => {
            setForm(createEmptyForm());
            setCreateOpen(true);
          }}
        >
          Neue Kostenstelle
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Bestellungen</TableHead>
              <TableHead>Aktion</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {costCentersQuery.isLoading ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Kostenstellen werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {costCentersQuery.error ? (
              <tr>
                <TableCell colSpan={4} className="text-destructive">
                  Kostenstellen konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!costCentersQuery.isLoading && !costCentersQuery.error && items.length === 0 ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Keine Kostenstellen gefunden.
                </TableCell>
              </tr>
            ) : null}
            {items.map((center) => (
              <TableRow key={center.id}>
                <TableCell className="font-medium text-foreground">{center.code}</TableCell>
                <TableCell className="text-muted-foreground">{center.name}</TableCell>
                <TableCell className="text-muted-foreground">{center._count.orders}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(center.id);
                      setForm({
                        name: center.name,
                      });
                    }}
                  >
                    Bearbeiten
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {costCentersQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void costCentersQuery.fetchNextPage()}
            disabled={costCentersQuery.isFetchingNextPage}
          >
            {costCentersQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Neue Kostenstelle"
        description="Name eingeben. Der Code wird automatisch aus dem Namen erzeugt."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Code (automatisch)
            <Input value={generatedCode} readOnly className="mt-1 h-10 rounded-xl" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              createMutation.mutate({
                code: generatedCode,
                name: form.name.trim(),
              })
            }
            disabled={!canSave || createMutation.isPending}
          >
            {createMutation.isPending ? "Erstellt..." : "Kostenstelle erstellen"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
            Abbrechen
          </Button>
        </div>
      </Dialog>

      {isEditing ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Kostenstelle bearbeiten</h3>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedId(null);
              setForm(createEmptyForm());
            }}
          >
            Auswahl aufheben
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Code (automatisch)
            <Input value={generatedCode} readOnly className="mt-1 h-10 rounded-xl" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              selectedId &&
              updateMutation.mutate({
                id: selectedId,
                code: generatedCode,
                name: form.name.trim(),
              })
            }
            disabled={!canSave || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={() => selectedId && deleteMutation.mutate({ id: selectedId })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Loescht..." : "Kostenstelle loeschen"}
          </Button>
        </div>
      </div>
      ) : null}
    </Card>
  );
}
