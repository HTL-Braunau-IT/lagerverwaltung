"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pdf } from "@react-pdf/renderer";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { useConfirmClick } from "~/components/backend/use-confirm-click";
import { CostCenterBillingPdfDocument } from "~/components/backend/pdf/cost-center-billing-pdf-document";

type CostCenterForm = {
  name: string;
  isActive: boolean;
};

function createEmptyForm(): CostCenterForm {
  return {
    name: "",
    isActive: true,
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
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [expandedCostCenterId, setExpandedCostCenterId] = useState<string | null>(null);
  const [exportingCostCenterId, setExportingCostCenterId] = useState<string | null>(null);
  const [form, setForm] = useState<CostCenterForm>(createEmptyForm);
  const [baselineForm, setBaselineForm] = useState<CostCenterForm>(createEmptyForm);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: expandedCostCenterId,
  });

  const costCentersQuery = api.costCenter.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      isActive:
        visibilityFilter === "ALL" ? undefined : visibilityFilter === "ACTIVE",
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
    const normalize = (f: CostCenterForm) => ({ name: f.name.trim(), isActive: f.isActive });
    return isDirty(form, baselineForm, normalize);
  }, [baselineForm, expandedCostCenterId, form]);

  const exportBillingPdf = async (center: { id: string; code: string; createdAt: Date }) => {
    if (exportingCostCenterId) return;

    setExportingCostCenterId(center.id);
    try {
      const data = await utils.costCenter.backendBillingExport.fetch({ id: center.id });
      const periodTo = new Date();
      const blob = await pdf(
        <CostCenterBillingPdfDocument
          costCenterName={data.costCenter.name}
          periodFrom={new Date(data.costCenter.createdAt)}
          periodTo={periodTo}
          orders={data.orders.map((order) => ({
            ...order,
            createdAt: new Date(order.createdAt),
          }))}
          grandTotal={data.grandTotal}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `abrechnung-${center.code}-${periodTo.toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Abrechnung exportiert.");
    } catch {
      toast.error("PDF Export fehlgeschlagen.");
    } finally {
      setExportingCostCenterId(null);
    }
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-3 flex items-center justify-between gap-3">
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Sichtbarkeit:</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "ALL" as const, label: "Alle" },
              { value: "ACTIVE" as const, label: "Sichtbar" },
              { value: "INACTIVE" as const, label: "Ausgeblendet" },
            ] as const
          ).map((opt) => {
            const active = visibilityFilter === opt.value;
            return (
              <FilterPillButton
                key={opt.value}
                onClick={() => setVisibilityFilter(opt.value)}
                active={active}
              >
                {opt.label}
              </FilterPillButton>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader className="">
            <tr>
              <TableUI.TableHead>Code</TableUI.TableHead>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Bestellungen</TableUI.TableHead>
              <TableUI.TableHead>Sichtbarkeit</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody className="">
            {costCentersQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Kostenstellen werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {costCentersQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-destructive">
                  Kostenstellen konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!costCentersQuery.isLoading && !costCentersQuery.error && items.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
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
                        setForm((prev) =>
                          next ? { name: center.name, isActive: center.isActive } : prev,
                        );
                        setBaselineForm(
                          next ? { name: center.name, isActive: center.isActive } : createEmptyForm(),
                        );
                        return next;
                      });
                    }}
                    className=""
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{center.code}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{center.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{center._count.orders}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">
                      {center.isActive ? "Sichtbar" : "Ausgeblendet"}
                    </TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={4}
                    rowClassName="bg-muted/30"
                    cellClassName="min-w-0 align-top px-1 py-5"
                    contentClassName="!p-0"
                  >
                    {isExpanded ? (
                      <div className="px-4 flex min-w-0 flex-col gap-4">
                        <div className="mb-1 grid grid-cols-1 items-end gap-3 md:grid-cols-3">
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
                          <label className="text-xs text-muted-foreground">
                            Sichtbar in Shopfront
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setForm((prev) => ({ ...prev, isActive: !prev.isActive }));
                              }}
                              className={`flex h-10 w-full items-center justify-between gap-3 rounded-sm border-2 bg-card/40 px-3 text-left transition ${
                                form.isActive ? "border-emerald-500/60" : "border-red-500/60"
                              }`}
                              aria-label="Kostenstellen-Sichtbarkeit umschalten"
                              aria-pressed={form.isActive}
                            >
                              <span className="text-sm text-foreground">Sichtbar</span>
                              <span
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                                  form.isActive ? "bg-emerald-500/60" : "bg-red-500/60"
                                }`}
                                aria-hidden="true"
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                    form.isActive ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </span>
                            </button>
                          </label>
                          <div className="flex justify-end gap-3 md:col-span-3">
                            <Button
                              type="button"
                              variant="outline"
                              className="!w-44"
                              onClick={(event) => {
                                event.stopPropagation();
                                void exportBillingPdf(center);
                              }}
                              disabled={exportingCostCenterId === center.id || deleteMutation.isPending}
                            >
                              {exportingCostCenterId === center.id ? "Wird exportiert..." : "Abrechnung exportieren"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              className="!w-36"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (deleteMutation.isPending) return;
                                confirmOrRunDelete(() => deleteMutation.mutate({ id: center.id }));
                              }}
                              disabled={deleteMutation.isPending || exportingCostCenterId === center.id}
                            >
                              {deleteMutation.isPending
                                ? "Löscht..."
                                : isConfirmingDelete
                                  ? "Nochmal klicken"
                                  : "Löschen"}
                            </Button>
                          </div>

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
              isActive: form.isActive,
            },
            {
              onSuccess: () => {
                setBaselineForm({ name: form.name, isActive: form.isActive });
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
