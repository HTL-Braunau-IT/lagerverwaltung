"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";

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

      <div className="overflow-x-auto rounded-xl border border-border">
        <TableUI.Table>
          <TableUI.TableHeader className="bg-muted/50">
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Slug</TableUI.TableHead>
              <TableUI.TableHead>Produkte</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody className="bg-white">
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
                    className={`cursor-pointer bg-white hover:bg-muted/30 ${isExpanded ? "bg-muted/15" : ""} select-none`}
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
                      <div className="mx-4 flex min-w-0 flex-col gap-4">
                        <div className="w-full rounded-lg bg-card/40 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-foreground">Kategorie bearbeiten</h3>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            Produkte:{" "}
                            <span className="font-medium text-foreground">{category._count.products}</span>
                          </p>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-muted-foreground">
                              Name
                              <Input
                                value={form.name}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="mt-1 h-10 rounded-xl"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Slug (automatisch)
                              <Input
                                value={generatedSlug}
                                readOnly
                                onClick={(event) => event.stopPropagation()}
                                className="mt-1 h-10 rounded-xl"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateMutation.mutate({
                                  id: category.id,
                                  name: form.name.trim(),
                                  slug: generatedSlug,
                                });
                              }}
                              disabled={!canSave || updateMutation.isPending}
                            >
                              {updateMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteMutation.mutate({ id: category.id });
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? "Loescht..." : "Kategorie loeschen"}
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
