"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

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
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Produkte</TableHead>
            </tr>
          </TableHeader>
          <TableBody className="bg-white">
            {categoriesQuery.isLoading ? (
              <tr>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Kategorien werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {categoriesQuery.error ? (
              <tr>
                <TableCell colSpan={3} className="text-destructive">
                  Kategorien konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!categoriesQuery.isLoading && !categoriesQuery.error && items.length === 0 ? (
              <tr>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Keine Kategorien gefunden.
                </TableCell>
              </tr>
            ) : null}
            {items.map((category) => {
              const isExpanded = expandedCategoryId === category.id;

              return (
                <Fragment key={category.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedCategoryId((current) => (current === category.id ? null : category.id));
                      setForm((current) => (expandedCategoryId === category.id ? current : { name: category.name }));
                    }}
                    className={`cursor-pointer bg-white hover:bg-muted/30 ${isExpanded ? "bg-muted/15" : ""} select-none`}
                  >
                    <TableCell className="font-medium text-foreground">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">{category.slug ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{category._count.products}</TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="p-3">
                        <div className="w-full p-3">
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
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="mt-1 h-10 rounded-xl"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Slug (automatisch)
                              <Input value={generatedSlug} readOnly className="mt-1 h-10 rounded-xl" />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: category.id,
                                  name: form.name.trim(),
                                  slug: generatedSlug,
                                })
                              }
                              disabled={!canSave || updateMutation.isPending}
                            >
                              {updateMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => deleteMutation.mutate({ id: category.id })}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? "Loescht..." : "Kategorie loeschen"}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
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
