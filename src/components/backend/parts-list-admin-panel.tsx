"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
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

type PartListDocument = {
  id: string;
  fileName: string;
  originalName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PartListForm>(createEmptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createDocumentFile, setCreateDocumentFile] = useState<File | null>(null);
  const [createUploadError, setCreateUploadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

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
  const selectedPartListQuery = api.partsList.backendById.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId) },
  );

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

  const createMutation = api.partsList.backendCreate.useMutation();
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
  const clearImageMutation = api.partsList.backendClearImage.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.partsList.backendList.invalidate(),
        selectedId ? utils.partsList.backendById.invalidate({ id: selectedId }) : Promise.resolve(),
      ]);
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
  const currentImageUrl = selectedPartListQuery.data?.imageUrl ?? null;
  const currentDocuments = (selectedPartListQuery.data?.documents ?? []) as PartListDocument[];
  const canSave =
    form.name.trim().length > 0 &&
    form.items.length > 0 &&
    form.items.every((item) => item.productId.length > 0 && Number(item.quantity) > 0);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadImageForPartList = async (partListId: string, file: File) => {
    const body = new FormData();
    body.append("partListId", partListId);
    body.append("file", file);
    const response = await fetch("/api/backend/parts-list/upload-image", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      throw new Error(result?.message ?? "Bild konnte nicht hochgeladen werden.");
    }
  };

  const uploadDocumentForPartList = async (partListId: string, file: File) => {
    const body = new FormData();
    body.append("partListId", partListId);
    body.append("file", file);
    const response = await fetch("/api/backend/parts-list/upload-document", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      throw new Error(result?.message ?? "Dokument konnte nicht hochgeladen werden.");
    }
  };

  const uploadImageForSelected = async () => {
    if (!selectedId || !imageFile) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      await uploadImageForPartList(selectedId, imageFile);
      setImageFile(null);
      await Promise.all([
        utils.partsList.backendList.invalidate(),
        utils.partsList.backendById.invalidate({ id: selectedId }),
      ]);
      await selectedPartListQuery.refetch();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Bild konnte nicht hochgeladen werden.");
    } finally {
      setUploadBusy(false);
    }
  };

  const uploadDocumentForSelected = async () => {
    if (!selectedId || !documentFile) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      await uploadDocumentForPartList(selectedId, documentFile);
      setDocumentFile(null);
      await utils.partsList.backendById.invalidate({ id: selectedId });
      await selectedPartListQuery.refetch();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Dokument konnte nicht hochgeladen werden.");
    } finally {
      setUploadBusy(false);
    }
  };

  const deleteDocumentForSelected = async (documentId: string) => {
    if (!selectedId) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const response = await fetch("/api/backend/parts-list/delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(result?.message ?? "Dokument konnte nicht geloescht werden.");
      }
      await utils.partsList.backendById.invalidate({ id: selectedId });
      await selectedPartListQuery.refetch();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Dokument konnte nicht geloescht werden.");
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Teilelisten</h2>
          <p className="text-sm text-muted-foreground">Teilelisten erstellen, bearbeiten und loeschen.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setForm(createEmptyForm());
            setCreateImageFile(null);
            setCreateDocumentFile(null);
            setCreateUploadError(null);
            setCreateOpen(true);
          }}
        >
          Neue Teileliste
        </Button>
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

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Neue Teileliste"
        description="Name, Beschreibung und Produkte eingeben, um eine neue Teileliste anzulegen."
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
                      list={`parts-list-products-create-${index}`}
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
                    <datalist id={`parts-list-products-create-${index}`}>
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
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">Dateien (optional)</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Bild und Dokument werden direkt nach dem Erstellen hochgeladen.
          </p>
          {createUploadError ? <p className="mt-2 text-xs text-destructive">{createUploadError}</p> : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Bild
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => setCreateImageFile(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-muted-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Dokument
              <input
                type="file"
                accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(event) => setCreateDocumentFile(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-muted-foreground"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            onClick={async () => {
              setCreateUploadError(null);
              let created: { id: string };
              try {
                created = await createMutation.mutateAsync({
                  name: form.name.trim(),
                  description: form.description.trim() ? form.description.trim() : null,
                  items: form.items.map((item) => ({
                    productId: item.productId,
                    quantity: Number(item.quantity),
                  })),
                });
              } catch (error) {
                setCreateUploadError(
                  error instanceof Error ? error.message : "Teileliste konnte nicht erstellt werden.",
                );
                return;
              }

              let attachmentError: string | null = null;
              setUploadBusy(true);
              try {
                if (createImageFile) {
                  await uploadImageForPartList(created.id, createImageFile);
                }
                if (createDocumentFile) {
                  await uploadDocumentForPartList(created.id, createDocumentFile);
                }
              } catch (error) {
                attachmentError =
                  error instanceof Error ? error.message : "Dateien konnten nicht vollstaendig hochgeladen werden.";
              } finally {
                setUploadBusy(false);
              }

              await utils.partsList.backendList.invalidate();
              await loadPartListForEdit(created.id);
              setCreateOpen(false);
              setCreateImageFile(null);
              setCreateDocumentFile(null);
              if (attachmentError) {
                setUploadError(attachmentError);
                setCreateUploadError(attachmentError);
              }
            }}
            disabled={!canSave || createMutation.isPending}
          >
            {createMutation.isPending ? "Erstellt..." : "Teileliste erstellen"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
            Abbrechen
          </Button>
        </div>
      </Dialog>

      {isEditing ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">Teileliste bearbeiten</h3>
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

          <Button
            type="button"
            variant="destructive"
            onClick={() => selectedId && deleteMutation.mutate({ id: selectedId })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Loescht..." : "Teileliste loeschen"}
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">Dateien</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Optionales Bild und Dokumente fuer diese Teileliste hochladen.
          </p>

          {uploadError ? <p className="mt-2 text-xs text-destructive">{uploadError}</p> : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-foreground">Bild</p>
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={`Vorschaubild ${form.name}`}
                  className="mt-2 h-24 w-24 rounded-md border border-border object-cover"
                />
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Noch kein Bild vorhanden.</p>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-xs text-muted-foreground"
              />
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={() => void uploadImageForSelected()} disabled={!imageFile || uploadBusy}>
                  Bild hochladen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => selectedId && clearImageMutation.mutate({ id: selectedId })}
                  disabled={!currentImageUrl || clearImageMutation.isPending || uploadBusy}
                >
                  Bild entfernen
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-foreground">Dokumente</p>
              <input
                type="file"
                accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-xs text-muted-foreground"
              />
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void uploadDocumentForSelected()}
                  disabled={!documentFile || uploadBusy}
                >
                  Dokument hochladen
                </Button>
              </div>
              <div className="mt-3 space-y-1.5">
                {currentDocuments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine Dokumente vorhanden.</p>
                ) : (
                  currentDocuments.map((document) => (
                    <div key={document.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-primary underline-offset-2 hover:underline"
                      >
                        {document.originalName}
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{formatBytes(document.sizeBytes)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void deleteDocumentForSelected(document.id)}
                          disabled={uploadBusy}
                        >
                          Entfernen
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}
    </Card>
  );
}
