"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { ChevronDownIcon, PlusIcon, WastebinIcon } from "~/components/layout/icon-renders";

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
  const [filesSectionCollapsed, setFilesSectionCollapsed] = useState(true);
  const [confirmDeletePartList, setConfirmDeletePartList] = useState(false);
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

  useEffect(() => {
    if (!selectedId) setConfirmDeletePartList(false);
  }, [selectedId]);

  useEffect(() => {
    if (!confirmDeletePartList) return;
    const timeout = window.setTimeout(() => setConfirmDeletePartList(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [confirmDeletePartList]);

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
    setUploadError(null);
    setImageFile(null);
    setDocumentFile(null);
    setFilesSectionCollapsed(true);
    setConfirmDeletePartList(false);
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
        <Input
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
          className="h-10"
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

  const uploadImageForSelected = async (fileOverride?: File) => {
    const fileToUpload = fileOverride ?? imageFile;
    if (!selectedId || !fileToUpload) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      await uploadImageForPartList(selectedId, fileToUpload);
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

  const uploadDocumentForSelected = async (fileOverride?: File) => {
    const fileToUpload = fileOverride ?? documentFile;
    if (!selectedId || !fileToUpload) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      await uploadDocumentForPartList(selectedId, fileToUpload);
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

  const onDeletePartListClick = () => {
    if (!selectedId || deleteMutation.isPending) return;
    if (!confirmDeletePartList) {
      setConfirmDeletePartList(true);
      return;
    }
    setConfirmDeletePartList(false);
    deleteMutation.mutate({ id: selectedId });
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

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader className="">
            <tr className="">
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Beschreibung</TableUI.TableHead>
              <TableUI.TableHead>Produkte</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {listsQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Teilelisten werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {listsQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-destructive">
                  Teilelisten konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!listsQuery.isLoading && !listsQuery.error && (listsQuery.data?.length ?? 0) === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={3} className="text-muted-foreground">
                  Keine Teilelisten gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {(listsQuery.data ?? []).map((list) => {
              const isExpanded = selectedId === list.id;

              return (
                <Fragment key={list.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      if (selectedId === list.id) {
                        setSelectedId(null);
                        setForm(createEmptyForm());
                        return;
                      }
                      void loadPartListForEdit(list.id);
                    }}
                    className={`cursor-pointer ${
                      isExpanded ? "" : ""
                    }`}
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{list.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{list.description ?? "-"}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{list.items.length}</TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={3}
                    rowClassName="bg-muted/30"
                    cellClassName="p-3"
                    contentClassName="!p-0"
                  >
                    {isExpanded ? (
                      <div className="w-full p-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-muted-foreground">
                              Name
                              <Input
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="h-11 mt-1 w-full px-2.5 py-2 text-slate-900 !text-lg font-semibold text-foreground"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Beschreibung
                              <Input
                                value={form.description}
                                onChange={(event) =>
                                  setForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                className="h-11 mt-1 w-full px-2.5 py-2 text-slate-900 !text-lg font-semibold text-foreground"
                              />
                            </label>
                          </div>

                          <TableUI.Subtable className="mt-4" tableClassName="table-fixed text-left text-sm">
                            <TableUI.SubtableHeader className=" text-muted-foreground">
                              <tr>
                                <TableUI.SubtableHead className="w-[50%]">Produkt</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-[16%]">Menge</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-[14%]">Einheit</TableUI.SubtableHead>
                                <TableUI.SubtableHead className="w-[20%]">Aktion</TableUI.SubtableHead>
                              </tr>
                            </TableUI.SubtableHeader>
                            <TableUI.SubtableBody className="">
                              {form.items.map((item, index) => (
                                <TableUI.SubtableRow key={`${index}-${item.productId}`} className="hover:bg-transparent">
                                  <TableUI.SubtableCell className="">
                                    {renderProductCell(item, index)}
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="">
                                    <Input
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
                                      className="h-10 px-3 py-2"
                                    />
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="">
                                    <span className=" inline-flex h-10 w-full items-center rounded-md bg-card/80 px-3 py-2 text-sm text-muted-foreground">
                                      {item.displayUnit || "-"}
                                    </span>
                                  </TableUI.SubtableCell>
                                  <TableUI.SubtableCell className="">
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      onClick={() =>
                                        setForm((prev) => ({
                                          ...prev,
                                          items: prev.items.filter((_, entryIndex) => entryIndex !== index),
                                        }))
                                      }
                                      disabled={form.items.length <= 1}
                                      className="!h-10 rounded-xs"
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        <WastebinIcon size={16} className="opacity-90" />
                                        <span>Zeile entfernen</span>
                                      </span>
                                    </Button>
                                  </TableUI.SubtableCell>
                                </TableUI.SubtableRow>
                              ))}
                            </TableUI.SubtableBody>
                          </TableUI.Subtable>

                          <div className="grid grid-cols-3 gap-4">
                            <div className="mt-4">
                              <Button
                                type="button"
                                variant="glass"
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
                                Produktzeile hinzufügen
                              </Button>
                            </div>
                            <div className="mt-4 flex flex-col items-stretch gap-1">
                              <Button
                                type="button"
                                variant="solid"
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
                                {updateMutation.isPending ? "Speichert..." : "Änderungen speichern"}
                              </Button>
                              {hasDuplicateProducts ? (
                                <p className="text-xs text-destructive">
                                  Jedes Produkt darf nur einmal in der Teileliste vorkommen.
                                </p>
                              ) : null}
                            </div>
                            <div className="mt-4">
                              <Button
                                type="button"
                                variant="destructive"
                                onClick={onDeletePartListClick}
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending
                                  ? "Löscht..."
                                  : confirmDeletePartList
                                    ? "Nochmal klicken zum Löschen"
                                    : "Teileliste löschen"}
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 rounded-md bg-card/40 p-3 min-w-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFilesSectionCollapsed((current) => !current);
                              }}
                              className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-md"
                              aria-expanded={!filesSectionCollapsed}
                              aria-controls="parts-list-files-section"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-lg font-semibold text-slate-900">Bilder & Dokumente</p>
                                <span
                                  aria-hidden="true"
                                  className="shrink-0 text-slate-500"
                                  title={filesSectionCollapsed ? "Ausklappen" : "Einklappen"}
                                >
                                  <ChevronDownIcon open={!filesSectionCollapsed} className="h-4 w-4" />
                                </span>
                              </div>
                              {!filesSectionCollapsed ? (
                                <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                              ) : null}
                            </button>
                            {!filesSectionCollapsed ? (
                              <div id="parts-list-files-section" className="space-y-3 pt-3">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 md:items-stretch">
                                  <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                    <div>
                                      <p className="select-none text-sm text-slate-600">Bild hochladen</p>
                                      <label
                                        className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-violet-400/70 bg-card/40 p-3 text-sm ${
                                          uploadBusy
                                            ? "cursor-default opacity-90"
                                            : "cursor-pointer hover:bg-violet-100"
                                        }`}
                                        onClick={(event) => event.stopPropagation()}
                                        aria-busy={uploadBusy ? true : undefined}
                                      >
                                        <input
                                          type="file"
                                          accept="image/png,image/jpeg,image/webp,image/gif"
                                          disabled={uploadBusy}
                                          className="sr-only"
                                          onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (!file) return;
                                            setUploadError(null);
                                            setImageFile(file);
                                            void uploadImageForSelected(file).finally(() => {
                                              event.target.value = "";
                                            });
                                          }}
                                        />
                                        <span
                                          className={`inline-flex shrink-0 rounded-sm bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                                            uploadBusy ? "opacity-70" : "group-hover:bg-violet-700"
                                          }`}
                                        >
                                          Datei auswählen
                                        </span>
                                        <span
                                          className={`min-w-0 flex-1 break-all text-left text-sm ${
                                            uploadBusy
                                              ? "text-muted-foreground"
                                              : imageFile
                                                ? "font-medium text-slate-900"
                                                : "text-slate-500"
                                          }`}
                                          role="status"
                                          title={uploadBusy ? undefined : imageFile?.name}
                                        >
                                          {uploadBusy
                                            ? "Bild wird hochgeladen..."
                                            : (imageFile?.name ?? "Keine Datei ausgewählt")}
                                        </span>
                                      </label>
                                    </div>
                                    <div className="mt-auto space-y-1.5 border-t border-slate-300/80 pt-3">
                                      <p className="mb-1 text-xs font-medium text-slate-700">Aktuelles Bild</p>
                                      {currentImageUrl ? (
                                        (() => {
                                          const displayImagePath = (() => {
                                            try {
                                              const pathname = new URL(currentImageUrl, "http://dummy").pathname;
                                              const file = pathname.split("/").pop() ?? "";
                                              return file ? `${file}` : pathname || currentImageUrl;
                                            } catch {
                                              return currentImageUrl;
                                            }
                                          })();

                                          return (
                                            <div className="relative rounded-sm border-b-2 border-violet-400/80 bg-card/80 p-1.5">
                                              <button
                                                type="button"
                                                onClick={(event) => event.stopPropagation()}
                                                className="flex w-full min-w-0 items-center gap-2 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/80"
                                              >
                                                <img
                                                  src={currentImageUrl}
                                                  alt={`${form.name} Bild`}
                                                  className="h-14 w-14 shrink-0 rounded-xs object-cover"
                                                  onError={(errEvent) => {
                                                    errEvent.currentTarget.onerror = null;
                                                    errEvent.currentTarget.src = "/pictures/placeholder.jpg";
                                                  }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                                    <span className="text-slate-600 font-semibold">Name:</span>
                                                    <span className="break-all text-slate-700">{displayImagePath}</span>

                                                    <span className="text-slate-600 font-semibold">Alt-Text:</span>
                                                    <span className="min-w-0 line-clamp-2 text-slate-600">
                                                      {`Vorschaubild ${form.name}`}
                                                    </span>

                                                    <span className="text-slate-600 font-semibold">Größe:</span>
                                                    <span className="tabular-nums text-muted-foreground">—</span>
                                                  </div>
                                                </div>
                                              </button>

                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  if (!selectedId) return;
                                                  clearImageMutation.mutate({ id: selectedId });
                                                }}
                                                disabled={!currentImageUrl || clearImageMutation.isPending || uploadBusy}
                                                className="absolute bottom-1 right-1 h-8 w-8 p-0 rounded-xs text-slate-600 transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                                                aria-label="Bild entfernen"
                                              >
                                                {uploadBusy || clearImageMutation.isPending ? (
                                                  <span className="text-xs">...</span>
                                                ) : (
                                                  <WastebinIcon size={16} className="opacity-90" />
                                                )}
                                              </Button>
                                            </div>
                                          );
                                        })()
                                      ) : (
                                        <p className="text-xs text-muted-foreground">Noch kein Bild vorhanden.</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                    <div>
                                      <p className="select-none text-sm text-slate-600">Dokument hochladen</p>
                                      <label
                                        className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-amber-500/65 bg-card/40 p-3 text-sm ${
                                          uploadBusy
                                            ? "cursor-default opacity-90"
                                            : "cursor-pointer hover:bg-amber-100"
                                        }`}
                                        onClick={(event) => event.stopPropagation()}
                                        aria-busy={uploadBusy ? true : undefined}
                                      >
                                        <input
                                          type="file"
                                          accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                          disabled={uploadBusy}
                                          className="sr-only"
                                          onChange={async (event) => {
                                            const file = event.target.files?.[0];
                                            if (!file) return;
                                            setUploadError(null);
                                            setDocumentFile(file);
                                            try {
                                              await uploadDocumentForSelected(file);
                                            } finally {
                                              event.target.value = "";
                                            }
                                          }}
                                        />
                                        <span
                                          className={`inline-flex shrink-0 rounded-sm bg-amber-700 px-3 py-2 text-sm font-semibold text-white ${
                                            uploadBusy ? "opacity-70" : "group-hover:bg-amber-800"
                                          }`}
                                        >
                                          Datei auswählen
                                        </span>
                                        <span
                                          className={`min-w-0 flex-1 break-all text-left text-sm ${
                                            uploadBusy ? "text-muted-foreground" : "text-slate-500"
                                          }`}
                                          role="status"
                                          title={uploadBusy ? undefined : documentFile?.name ?? undefined}
                                        >
                                          {uploadBusy
                                            ? "Dokument wird hochgeladen..."
                                            : (documentFile?.name ?? "Keine Datei ausgewählt")}
                                        </span>
                                      </label>
                                    </div>
                                    <div className="mt-auto space-y-1.5 border-t border-slate-300/80 pt-3">
                                      <p className="mb-1 text-xs font-medium text-slate-700">Alle Dokumente</p>
                                      {currentDocuments.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Keine Dokumente vorhanden.</p>
                                      ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                          {currentDocuments.map((document) => (
                                            <div
                                              key={document.id}
                                              className="flex items-center justify-between gap-2 rounded-sm bg-card/80 px-2 py-1.5"
                                            >
                                              <a
                                                href={document.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(event) => event.stopPropagation()}
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
                                                  variant="ghost"
                                                  onClick={async (event) => {
                                                    event.stopPropagation();
                                                    await deleteDocumentForSelected(document.id);
                                                  }}
                                                  disabled={uploadBusy}
                                                  className="h-8 w-8 p-0 rounded-xs text-slate-600 transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                                                  aria-label="Dokument entfernen"
                                                >
                                                  {uploadBusy ? (
                                                    <span className="text-xs">...</span>
                                                  ) : (
                                                    <WastebinIcon size={16} className="opacity-90" />
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
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
