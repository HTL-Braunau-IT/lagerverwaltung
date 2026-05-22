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

type CategoryForm = {
  name: string;
};

function createEmptyForm(): CategoryForm {
  return {
    name: "",
  };
}

function toCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CategoriesAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(createEmptyForm);
  const [baselineForm, setBaselineForm] = useState<CategoryForm>(createEmptyForm);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: expandedCategoryId,
  });

  const categoriesQuery = api.category.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const updateMutation = api.category.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.category.backendList.invalidate(),
        utils.category.list.invalidate(),
        expandedCategoryId ? utils.category.byId.invalidate({ id: expandedCategoryId }) : Promise.resolve(),
      ]);
      toast.success("Kategorie aktualisiert.");
    },
  });
  const deleteMutation = api.category.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.category.backendList.invalidate(), utils.category.list.invalidate()]);
      setExpandedCategoryId(null);
      setForm(createEmptyForm());
      setBaselineForm(createEmptyForm());
      toast.success("Kategorie geloescht.");
    },
  });

  const items = useMemo(
    () =>
      [...(categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data],
  );

  const generatedSlug = toCategorySlug(form.name.trim());
  const canSave = form.name.trim().length > 0 && generatedSlug.length > 0;

  const isExpandedDirty = useMemo(() => {
    if (!expandedCategoryId) return false;
    const normalize = (f: CategoryForm) => ({ name: f.name.trim() });
    return isDirty(form, baselineForm, normalize);
  }, [baselineForm, expandedCategoryId, form]);

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kategorien</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push("/backend/categories/new")}
          className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neue Kategorie
        </button>
      </div>

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader className="">
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Slug</TableUI.TableHead>
              <TableUI.TableHead>Produkte</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody className="">
            {categoriesQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Kategorien werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {categoriesQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-destructive">
                  Kategorien konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!categoriesQuery.isLoading && !categoriesQuery.error && items.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Keine Kategorien gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {items.map((category) => {
              const isExpanded = expandedCategoryId === category.id;

              return (
                <Fragment key={category.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedCategoryId((current) => {
                        const next = current === category.id ? null : category.id;
                        setForm((prev) => (next ? { name: category.name } : prev));
                        setBaselineForm(next ? { name: category.name } : createEmptyForm());
                        return next;
                      });
                    }}
                    className={""}
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{category.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{category.slug ?? "-"}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{category._count.products}</TableUI.TableCell>
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
                              Slug (automatisch)
                              <Input
                                value={generatedSlug}
                                disabled
                                onClick={(event) => event.stopPropagation()}
                                variant="subtitle"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Produkte in Kategorie
                              <Input
                                value={category._count.products}
                                disabled
                                variant="subtitle"
                              />
                            </label>
                            <div className="mt-4.5 flex items-center justify-end">
                              <Button
                                type="button"
                                variant="destructive"
                                className="!w-36"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (deleteMutation.isPending) return;
                                  confirmOrRunDelete(() => deleteMutation.mutate({ id: category.id }));
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
                        </div>
                    ) : null}
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
      </div>
      {categoriesQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void categoriesQuery.fetchNextPage()}
            disabled={categoriesQuery.isFetchingNextPage}
          >
            {categoriesQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}

      <UnsavedChangesBar
        open={isExpandedDirty}
        title={
          expandedCategoryId
            ? (items.find((c) => c.id === expandedCategoryId)?.name ?? "Kategorie")
            : "Kategorie"
        }
        onReset={() => {
          if (!expandedCategoryId) return;
          setForm(baselineForm);
        }}
        onSave={() => {
          if (!expandedCategoryId) return;
          const category = items.find((c) => c.id === expandedCategoryId);
          if (!category) return;
          if (updateMutation.isPending) return;
          if (!canSave) return;
          updateMutation.mutate(
            {
              id: category.id,
              name: form.name.trim(),
              slug: toCategorySlug(form.name.trim()),
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
