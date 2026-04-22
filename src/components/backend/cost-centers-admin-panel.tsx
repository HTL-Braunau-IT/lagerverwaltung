"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedCostCenterId, setExpandedCostCenterId] = useState<string | null>(null);
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
    },
  });
  const updateMutation = api.costCenter.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.costCenter.backendList.invalidate(),
        utils.costCenter.list.invalidate(),
        expandedCostCenterId ? utils.costCenter.byId.invalidate({ id: expandedCostCenterId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteMutation = api.costCenter.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
      setExpandedCostCenterId(null);
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

  const generatedCode = toCostCenterCode(form.name.trim());
  const canSave = form.name.trim().length > 0 && generatedCode.length > 0;

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
                            variant="solid"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateMutation.mutate({
                                id: center.id,
                                code: generatedCode,
                                name: form.name.trim(),
                              });
                            }}
                            disabled={!canSave || updateMutation.isPending}
                            size="lg"
                          >
                            {updateMutation.isPending ? "Speichert..." : "Änderungen speichern"}
                          </Button>

                          <Button
                            type="button"
                            variant="destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteMutation.mutate({ id: center.id });
                            }}
                            disabled={deleteMutation.isPending}
                            size="lg"
                          >
                            {deleteMutation.isPending ? "Löscht..." : "Kostenstelle löschen"}
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

    </Card>
  );
}
