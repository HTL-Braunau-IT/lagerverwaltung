"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";
import { DetailCard, DetailText } from "~/components/ui/detail-card";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(createEmptyForm);

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
    },
  });
  const deleteMutation = api.category.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.category.backendList.invalidate(), utils.category.list.invalidate()]);
      setExpandedCategoryId(null);
      setForm(createEmptyForm());
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

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
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
                                className="h-11 mt-1 w-full px-2.5 py-2 text-slate-900 !text-lg font-semibold text-foreground"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Slug (automatisch)
                              <Input
                                value={generatedSlug}
                                readOnly
                                onClick={(event) => event.stopPropagation()}
                                className="h-11 mt-1 w-full px-2.5 py-2 !text-lg text-slate-900"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Produkte in Kategorie
                              <Input
                                value={category._count.products}
                                readOnly
                                className="h-11 mt-1 w-full px-2.5 py-2 !text-lg text-slate-900"
                              />
                            </label>
                            <div className="mt-4.5 grid grid-cols-2 gap-2 items-center">
                              <Button
                                type="button"
                                variant="solid"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateMutation.mutate({
                                    id: category.id,
                                    name: form.name.trim(),
                                    slug: generatedSlug,
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
                                  deleteMutation.mutate({ id: category.id });
                                }}
                                disabled={deleteMutation.isPending}
                                size="lg"
                              >
                                {deleteMutation.isPending ? "Loescht..." : "Kategorie löschen"}
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

    </Card>
  );
}
