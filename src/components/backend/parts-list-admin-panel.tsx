"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type PartListItemForm = {
  productId: string;
  productLabel: string;
  quantity: string;
};

type PartListForm = {
  name: string;
  description: string;
  items: PartListItemForm[];
};

function createEmptyForm(): PartListForm {
  return {
    name: "",
    description: "",
    items: [{ productId: "", productLabel: "", quantity: "1" }],
  };
}

export function PartsListAdminPanel() {
  const utils = api.useUtils();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PartListForm>(createEmptyForm);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const listsQuery = api.partsList.backendList.useQuery({
    search: searchTerm || undefined,
    limit: 200,
  });
  const productsQuery = api.product.backendList.useQuery({
    limit: 300,
    cursor: undefined,
  });

  const loadPartListForEdit = async (id: string) => {
    setSelectedId(id);
    const data = await utils.partsList.backendById.fetch({ id });
    setForm({
      name: data?.name ?? "",
      description: data?.description ?? "",
      items:
        data?.items.map((item) => ({
          productId: item.productId,
          productLabel: `${item.product.sku} - ${item.product.name}`,
          quantity: String(Number(item.quantity)),
        })) ?? [{ productId: "", productLabel: "", quantity: "1" }],
    });
  };

  const createMutation = api.partsList.backendCreate.useMutation({
    onSuccess: async () => {
      await utils.partsList.backendList.invalidate();
      setForm(createEmptyForm());
    },
  });
  const updateMutation = api.partsList.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.partsList.backendList.invalidate(),
        selectedId ? utils.partsList.backendById.invalidate({ id: selectedId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteMutation = api.partsList.backendDelete.useMutation({
    onSuccess: async () => {
      await utils.partsList.backendList.invalidate();
      setSelectedId(null);
      setForm(createEmptyForm());
    },
  });

  const productOptions = useMemo(
    () =>
      (productsQuery.data?.items ?? []).map((product) => ({
        id: product.id,
        label: `${product.sku} - ${product.name}`,
      })),
    [productsQuery.data],
  );
  const productByLabel = useMemo(
    () => new Map(productOptions.map((option) => [option.label.toLowerCase(), option.id])),
    [productOptions],
  );

  const isEditing = Boolean(selectedId);
  const canSave =
    form.name.trim().length > 0 &&
    form.items.length > 0 &&
    form.items.every((item) => item.productId.length > 0 && Number(item.quantity) > 0);

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Teilelisten</h2>
          <p className="text-sm text-muted-foreground">Teilelisten erstellen, bearbeiten und loeschen.</p>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="backend-part-list-search" className="mb-1 block text-xs text-muted-foreground">
          Suche nach Name oder Beschreibung
          <Input
            id="backend-part-list-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. Arduino Set"
            className="mt-1 h-10 rounded-xl"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Produkte</TableHead>
              <TableHead>Aktion</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {listsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Teilelisten werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {listsQuery.error ? (
              <tr>
                <TableCell colSpan={4} className="text-destructive">
                  Teilelisten konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!listsQuery.isLoading && !listsQuery.error && (listsQuery.data?.length ?? 0) === 0 ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Keine Teilelisten gefunden.
                </TableCell>
              </tr>
            ) : null}
            {(listsQuery.data ?? []).map((list) => (
              <TableRow
                key={list.id}
                onClick={() => void loadPartListForEdit(list.id)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium text-foreground">{list.name}</TableCell>
                <TableCell className="text-muted-foreground">{list.description ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{list.items.length}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void loadPartListForEdit(list.id);
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

      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? "Teileliste bearbeiten" : "Neue Teileliste"}
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
            Beschreibung
            <Input
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Produkt</th>
                <th className="px-3 py-2">Menge</th>
                <th className="px-3 py-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => (
                <tr key={`${index}-${item.productId}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      list={`parts-list-products-${index}`}
                      value={item.productLabel}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          items: prev.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  productLabel: event.target.value,
                                  productId:
                                    productByLabel.get(event.target.value.trim().toLowerCase()) ?? "",
                                }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="SKU oder Name tippen..."
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
                    />
                    <datalist id={`parts-list-products-${index}`}>
                      {productOptions.map((option) => (
                        <option key={option.id} value={option.label} />
                      ))}
                    </datalist>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={item.quantity}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          items: prev.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  quantity: event.target.value,
                                }
                              : entry,
                          ),
                        }))
                      }
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          items: prev.items.filter((_, entryIndex) => entryIndex !== index),
                        }))
                      }
                      disabled={form.items.length <= 1}
                    >
                      Zeile entfernen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                items: [...prev.items, { productId: "", productLabel: "", quantity: "1" }],
              }))
            }
          >
            Produktzeile hinzufuegen
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isEditing ? (
            <Button
              type="button"
              onClick={() => {
                if (!selectedId) return;
                updateMutation.mutate({
                  id: selectedId,
                  name: form.name.trim(),
                  description: form.description.trim() ? form.description.trim() : null,
                  items: form.items.map((item) => ({
                    productId: item.productId,
                    quantity: Number(item.quantity),
                  })),
                });
              }}
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
                  description: form.description.trim() ? form.description.trim() : null,
                  items: form.items.map((item) => ({
                    productId: item.productId,
                    quantity: Number(item.quantity),
                  })),
                })
              }
              disabled={!canSave || createMutation.isPending}
            >
              {createMutation.isPending ? "Erstellt..." : "Teileliste erstellen"}
            </Button>
          )}

          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => selectedId && deleteMutation.mutate({ id: selectedId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Loescht..." : "Teileliste loeschen"}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
