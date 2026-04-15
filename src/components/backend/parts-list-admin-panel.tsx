"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";

type PartListItemForm = {
  productId: string;
  productLabel: string;
  quantity: string;
  displayUnit: string;
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

const BASE_UNIT_LABELS: Record<string, string> = {
  PCS: "Stk",
  MM: "mm",
  CM: "cm",
  M: "m",
  CM2: "cm2",
  M2: "m2",
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "l",
};

function createEmptyForm(): PartListForm {
  return {
    name: "",
    description: "",
    items: [{ productId: "", productLabel: "", quantity: "1", displayUnit: "-" }],
  };
}

function formatBaseUnitLabel(baseUnit: string) {
  return BASE_UNIT_LABELS[baseUnit] ?? baseUnit;
}

export function PartsListAdminPanel() {
  const utils = api.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PartListForm>(createEmptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [activeProductRowKey, setActiveProductRowKey] = useState<string | null>(null);
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const productInputRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setProductSearchTerm(productSearchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [productSearchInput]);

  const listsQuery = api.partsList.backendList.useQuery({
    search: searchTerm || undefined,
    limit: 200,
  });
  const productsQuery = api.product.backendList.useQuery(
    {
      search: productSearchTerm || undefined,
      limit: 200,
      cursor: undefined,
    },
    { enabled: activeProductRowKey !== null && productSearchTerm.length > 0 },
  );
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
          displayUnit: formatBaseUnitLabel(item.product.baseUnit),
        })) ?? [{ productId: "", productLabel: "", quantity: "1", displayUnit: "-" }],
    });
  };

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

  const productSuggestions = useMemo(
    () =>
      (productsQuery.data?.items ?? []).map((product) => ({
        id: product.id,
        label: `${product.sku} - ${product.name}`,
        baseUnit: product.baseUnit,
      })),
    [productsQuery.data],
  );
  const duplicateProductIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of form.items) {
      if (!item.productId) continue;
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([productId]) => productId),
    );
  }, [form.items]);

  const isEditing = Boolean(selectedId);
  const currentImageUrl = selectedPartListQuery.data?.imageUrl ?? null;
  const currentDocuments = (selectedPartListQuery.data?.documents ?? []) as PartListDocument[];
  const hasDuplicateProducts = duplicateProductIds.size > 0;
  const canSave =
    form.name.trim().length > 0 &&
    form.items.length > 0 &&
    form.items.every((item) => item.productId.length > 0 && Number(item.quantity) > 0) &&
    !hasDuplicateProducts;
  const normalizedFormItems = form.items
    .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))
    .filter((item) => item.productId.length > 0 && Number.isFinite(item.quantity) && item.quantity > 0);

  const getProductRowKey = (index: number) => `edit-${index}`;

  const updateDropdownPosition = (rowKey: string | null) => {
    if (!rowKey) {
      setDropdownPosition(null);
      return;
    }
    const input = productInputRefs.current.get(rowKey);
    if (!input) {
      setDropdownPosition(null);
      return;
    }
    const rect = input.getBoundingClientRect();
    setDropdownPosition({
      top: rect.top - 4,
      left: rect.left,
      width: rect.width,
    });
  };

  const updateFormItem = (index: number, updater: (item: PartListItemForm) => PartListItemForm) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    }));
  };

  const handleProductInputFocus = (index: number, currentLabel: string) => {
    const rowKey = getProductRowKey(index);
    setActiveProductRowKey(rowKey);
    setProductSearchInput(currentLabel);
    setProductSearchTerm(currentLabel.trim());
    setHighlightedSuggestionIndex(0);
    updateDropdownPosition(rowKey);
  };

  const handleProductInputChange = (index: number, value: string) => {
    const rowKey = getProductRowKey(index);
    updateFormItem(index, (item) => ({ ...item, productLabel: value, productId: "" }));
    setActiveProductRowKey(rowKey);
    setProductSearchInput(value);
    setHighlightedSuggestionIndex(0);
    updateDropdownPosition(rowKey);
  };

  const closeProductSuggestions = (index: number) => {
    const rowKey = getProductRowKey(index);
    window.setTimeout(() => {
      setActiveProductRowKey((currentKey) => (currentKey === rowKey ? null : currentKey));
    }, 120);
  };

  const selectProductSuggestion = (index: number, selected: { id: string; label: string; baseUnit: string }) => {
    const alreadySelectedInAnotherRow = form.items.some(
      (item, itemIndex) => itemIndex !== index && item.productId === selected.id,
    );
    if (alreadySelectedInAnotherRow) {
      return;
    }
    updateFormItem(index, (item) => ({
      ...item,
      productId: selected.id,
      productLabel: selected.label,
      displayUnit: formatBaseUnitLabel(selected.baseUnit),
    }));
    setActiveProductRowKey(null);
    setProductSearchInput("");
    setProductSearchTerm("");
    setHighlightedSuggestionIndex(0);
  };

  useEffect(() => {
    if (!activeProductRowKey) return;
    const syncPosition = () => updateDropdownPosition(activeProductRowKey);
    syncPosition();
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [activeProductRowKey]);

  const renderProductCell = (item: PartListItemForm, index: number) => {
    const rowKey = getProductRowKey(index);

    return (
      <div>
        <input
          ref={(node) => {
            if (node) {
              productInputRefs.current.set(rowKey, node);
            } else {
              productInputRefs.current.delete(rowKey);
            }
          }}
          value={item.productLabel}
          onFocus={() => handleProductInputFocus(index, item.productLabel)}
          onBlur={() => closeProductSuggestions(index)}
          onChange={(event) => handleProductInputChange(index, event.target.value)}
          onKeyDown={(event) => {
            if (!showSuggestions || filteredProductSuggestions.length === 0) {
              if (event.key === "Escape") {
                setActiveProductRowKey(null);
              }
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedSuggestionIndex((prev) => (prev + 1) % filteredProductSuggestions.length);
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedSuggestionIndex((prev) =>
                prev <= 0 ? filteredProductSuggestions.length - 1 : prev - 1,
              );
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const selected = filteredProductSuggestions[highlightedSuggestionIndex];
              if (selected) {
                selectProductSuggestion(index, selected);
              }
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setActiveProductRowKey(null);
            }
          }}
          placeholder="SKU oder Name tippen..."
          className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
        />
        {item.productId && duplicateProductIds.has(item.productId) ? (
          <p className="mt-1 text-xs text-destructive">Produkt ist bereits in einer anderen Zeile enthalten.</p>
        ) : null}
      </div>
    );
  };

  const showSuggestions = activeProductRowKey !== null && productSearchTerm.length > 0 && dropdownPosition !== null;
  const filteredProductSuggestions = useMemo(() => {
    if (!activeProductRowKey) return productSuggestions;
    const [, indexText] = activeProductRowKey.split("-");
    const activeIndex = Number(indexText);
    if (!Number.isInteger(activeIndex)) return productSuggestions;
    return productSuggestions.filter(
      (suggestion) =>
        !form.items.some((item, itemIndex) => itemIndex !== activeIndex && item.productId === suggestion.id),
    );
  }, [activeProductRowKey, form.items, productSuggestions]);

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
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Teilelisten</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push("/backend/parts-list/new")}
          className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neue Teileliste
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Produkte</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {listsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Teilelisten werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {listsQuery.error ? (
              <tr>
                <TableCell colSpan={3} className="text-destructive">
                  Teilelisten konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!listsQuery.isLoading && !listsQuery.error && (listsQuery.data?.length ?? 0) === 0 ? (
              <tr>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Keine Teilelisten gefunden.
                </TableCell>
              </tr>
            ) : null}
            {(listsQuery.data ?? []).map((list) => {
              const isExpanded = selectedId === list.id;

              return (
                <Fragment key={list.id}>
                  <TableRow
                    onClick={() => {
                      if (selectedId === list.id) {
                        setSelectedId(null);
                        setForm(createEmptyForm());
                        return;
                      }
                      void loadPartListForEdit(list.id);
                    }}
                    className={`cursor-pointer select-none bg-white hover:bg-muted/30 ${
                      isExpanded ? "bg-muted/15" : ""
                    }`}
                  >
                    <TableCell className="font-medium text-foreground">{list.name}</TableCell>
                    <TableCell className="text-muted-foreground">{list.description ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{list.items.length}</TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="p-3">
                        <div className="w-full p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-foreground">Teileliste bearbeiten</h3>
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
                                onChange={(event) =>
                                  setForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                className="mt-1 h-10 rounded-xl"
                              />
                            </label>
                          </div>

                          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
                            <table className="min-w-full table-fixed border-collapse text-left text-sm">
                              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="w-[50%] px-3 py-2">Produkt</th>
                                  <th className="w-[16%] px-3 py-2">Menge</th>
                                  <th className="w-[14%] px-3 py-2">Einheit</th>
                                  <th className="w-[20%] px-3 py-2">Aktion</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.items.map((item, index) => (
                                  <tr key={`${index}-${item.productId}`} className="border-t border-border">
                                    <td className="px-3 py-2 align-top">{renderProductCell(item, index)}</td>
                                    <td className="px-3 py-2 align-top">
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
                                    <td className="px-3 py-2 align-top">
                                      <span className="inline-flex h-10 w-full items-center rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm text-foreground">
                                        {item.displayUnit || "-"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 align-top">
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
                                  items: [
                                    ...prev.items,
                                    { productId: "", productLabel: "", quantity: "1", displayUnit: "-" },
                                  ],
                                }))
                              }
                            >
                              Produktzeile hinzufuegen
                            </Button>
                          </div>

                          <div className="mt-4">
                            {hasDuplicateProducts ? (
                              <p className="mb-2 text-xs text-destructive">
                                Jedes Produkt darf nur einmal in der Teileliste vorkommen.
                              </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!selectedId) return;
                                  updateMutation.mutate({
                                    id: selectedId,
                                    name: form.name.trim(),
                                    description: form.description.trim() ? form.description.trim() : null,
                                    items: normalizedFormItems,
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
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => void uploadImageForSelected()}
                                    disabled={!imageFile || uploadBusy}
                                  >
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
                                      <div
                                        key={document.id}
                                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                                      >
                                        <a
                                          href={document.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="truncate text-xs text-primary underline-offset-2 hover:underline"
                                        >
                                          {document.originalName}
                                        </a>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] text-muted-foreground">
                                            {formatBytes(document.sizeBytes)}
                                          </span>
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
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showSuggestions
        ? createPortal(
            <div
              className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
              style={{
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                bottom: Math.max(window.innerHeight - dropdownPosition.top, 0),
              }}
            >
              {productsQuery.isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Produkte werden gesucht...</p>
              ) : filteredProductSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Keine passenden Produkte gefunden.</p>
              ) : (
                filteredProductSuggestions.map((suggestion, suggestionIndex) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-xs ${
                      suggestionIndex === highlightedSuggestionIndex
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!activeProductRowKey) return;
                      const [mode, indexText] = activeProductRowKey.split("-");
                      const index = Number(indexText);
                      if (mode === "edit" && Number.isInteger(index)) {
                        selectProductSuggestion(index, suggestion);
                      }
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

    </Card>
  );
}
