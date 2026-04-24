"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { useConfirmClick } from "~/components/backend/use-confirm-click";

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
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedCostCenterId, setExpandedCostCenterId] = useState<string | null>(null);
  const [form, setForm] = useState<CostCenterForm>(createEmptyForm);
  const [baselineForm, setBaselineForm] = useState<CostCenterForm>(createEmptyForm);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: expandedCostCenterId,
  });

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
      toast.success("Kostenstelle erstellt.");
    },
  });
  const updateMutation = api.costCenter.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.costCenter.backendList.invalidate(),
        utils.costCenter.list.invalidate(),
        expandedCostCenterId ? utils.costCenter.byId.invalidate({ id: expandedCostCenterId }) : Promise.resolve(),
      ]);
      toast.success("Kostenstelle aktualisiert.");
    },
  });
  const deleteMutation = api.costCenter.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
      setExpandedCostCenterId(null);
      setForm(createEmptyForm());
      setBaselineForm(createEmptyForm());
      toast.success("Kostenstelle geloescht.");
    },
  });

  const items = useMemo(
    () =>
      [...(costCentersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    [costCentersQuery.data],
  );

  const generatedCode = toCostCenterCode(form.name.trim());
  const canSave = form.name.trim().length > 0 && generatedCode.length > 0;

  const isExpandedDirty = useMemo(() => {
    if (!expandedCostCenterId) return false;
    const normalize = (f: CostCenterForm) => ({ name: f.name.trim() });
    return isDirty(form, baselineForm, normalize);
  }, [baselineForm, expandedCostCenterId, form]);

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kostenstellen</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push("/backend/cost-centers/new")}
          className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neue Kostenstelle
        </button>
      </div>

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader className="">
            <tr>
              <TableUI.TableHead>Code</TableUI.TableHead>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Bestellungen</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody className="">
            {costCentersQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Kostenstellen werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {costCentersQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-destructive">
                  Kostenstellen konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!costCentersQuery.isLoading && !costCentersQuery.error && items.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Keine Kostenstellen gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {items.map((center) => {
              const isExpanded = expandedCostCenterId === center.id;

              return (
                <Fragment key={center.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedCostCenterId((current) => {
                        const next = current === center.id ? null : center.id;
                        setForm((prev) => (next ? { name: center.name } : prev));
                        setBaselineForm(next ? { name: center.name } : createEmptyForm());
                        return next;
                      });
                    }}
                    className=""
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{center.code}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{center.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{center._count.orders}</TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={3}
                    rowClassName="bg-muted/30"
                    cellClassName="min-w-0 align-top px-1 py-5"
                    contentClassName="!p-0"
                  >
                    {isExpanded ? (
                      <div className="px-4 flex min-w-0 flex-col gap-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-1">
                          <label className="text-xs text-muted-foreground">
                            Name
                            <Input
                              value={form.name}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                              variant="title"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Code (automatisch)
                            <Input
                              value={generatedCode}
                              disabled
                              onClick={(event) => event.stopPropagation()}
                              variant="subtitle"
                            />
                          </label>
                          <Button
                            type="button"
                            variant="destructive"
                            className="!w-36 col-span-2 justify-self-end"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (deleteMutation.isPending) return;
                              confirmOrRunDelete(() => deleteMutation.mutate({ id: center.id }));
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending
                              ? "Löscht..."
                              : isConfirmingDelete
                                ? "Nochmal klicken"
                                : "Löschen"}
                          </Button>  

                        </div>
                      </div>  
                    ) : null}
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
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

      <UnsavedChangesBar
        open={isExpandedDirty}
        title={
          expandedCostCenterId
            ? (items.find((c) => c.id === expandedCostCenterId)?.name ?? "Kostenstelle")
            : "Kostenstelle"
        }
        onReset={() => {
          if (!expandedCostCenterId) return;
          setForm(baselineForm);
        }}
        onSave={() => {
          if (!expandedCostCenterId) return;
          const center = items.find((c) => c.id === expandedCostCenterId);
          if (!center) return;
          if (updateMutation.isPending) return;
          if (!canSave) return;
          updateMutation.mutate(
            {
              id: center.id,
              code: toCostCenterCode(form.name.trim()),
              name: form.name.trim(),
            },
            {
              onSuccess: () => {
                setBaselineForm({ name: form.name });
              },
            },
          );
        }}
        saveDisabled={!canSave || updateMutation.isPending}
        resetDisabled={updateMutation.isPending}
        saveLabel={updateMutation.isPending ? "Speichert..." : "Speichern"}
      />
    </Card>
  );
}
