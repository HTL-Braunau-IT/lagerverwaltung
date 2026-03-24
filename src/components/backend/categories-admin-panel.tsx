"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type CategoryForm = {
  name: string;
  slug: string;
};

function createEmptyForm(): CategoryForm {
  return {
    name: "",
    slug: "",
  };
}

export function CategoriesAdminPanel() {
  const utils = api.useUtils();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [usageFilter, setUsageFilter] = useState<"ALL" | "USED" | "UNUSED">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(createEmptyForm);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchTerm(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const categoriesQuery = api.category.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const createMutation = api.category.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.category.backendList.invalidate(), utils.category.list.invalidate()]);
      setForm(createEmptyForm());
    },
  });
  const updateMutation = api.category.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.category.backendList.invalidate(),
        utils.category.list.invalidate(),
        selectedId ? utils.category.byId.invalidate({ id: selectedId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteMutation = api.category.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.category.backendList.invalidate(), utils.category.list.invalidate()]);
      setSelectedId(null);
      setForm(createEmptyForm());
    },
  });

  const items = useMemo(
    () =>
      [...(categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [])]
        .filter((category) => {
          if (usageFilter === "USED") return category._count.products > 0;
          if (usageFilter === "UNUSED") return category._count.products === 0;
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data, usageFilter],
  );

  const isEditing = Boolean(selectedId);
  const canSave = form.name.trim().length > 0;

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground">Kategorien</h2>
        <p className="text-sm text-muted-foreground">Kategorien erstellen, bearbeiten und loeschen.</p>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <label htmlFor="backend-category-search" className="mb-1 block text-xs text-muted-foreground">
          Suche nach Name oder Slug
          <Input
            id="backend-category-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. Elektronik"
            className="mt-1 h-10 rounded-xl"
          />
        </label>
        <label className="mb-1 block text-xs text-muted-foreground">
          Nutzung
          <select
            value={usageFilter}
            onChange={(event) => setUsageFilter(event.target.value as "ALL" | "USED" | "UNUSED")}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ALL">Alle</option>
            <option value="USED">Nur verwendet</option>
            <option value="UNUSED">Nur ungenutzt</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Produkte</TableHead>
              <TableHead>Aktion</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {categoriesQuery.isLoading ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Kategorien werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {categoriesQuery.error ? (
              <tr>
                <TableCell colSpan={4} className="text-destructive">
                  Kategorien konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!categoriesQuery.isLoading && !categoriesQuery.error && items.length === 0 ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Keine Kategorien gefunden.
                </TableCell>
              </tr>
            ) : null}
            {items.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium text-foreground">{category.name}</TableCell>
                <TableCell className="text-muted-foreground">{category.slug ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{category._count.products}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(category.id);
                      setForm({
                        name: category.name,
                        slug: category.slug ?? "",
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

      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? "Kategorie bearbeiten" : "Neue Kategorie"}
          </h3>
          {isEditing ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedId(null);
                setForm(createEmptyForm());
              }}
            >
              Neu anlegen
            </Button>
          ) : null}
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
            Slug (optional)
            <Input
              value={form.slug}
              onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isEditing ? (
            <Button
              type="button"
              onClick={() =>
                selectedId &&
                updateMutation.mutate({
                  id: selectedId,
                  name: form.name.trim(),
                  slug: form.slug.trim() ? form.slug.trim() : null,
                })
              }
              disabled={!canSave || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() =>
                createMutation.mutate({
                  name: form.name.trim(),
                  slug: form.slug.trim() ? form.slug.trim() : null,
                })
              }
              disabled={!canSave || createMutation.isPending}
            >
              {createMutation.isPending ? "Erstellt..." : "Kategorie erstellen"}
            </Button>
          )}

          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => selectedId && deleteMutation.mutate({ id: selectedId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Loescht..." : "Kategorie loeschen"}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
