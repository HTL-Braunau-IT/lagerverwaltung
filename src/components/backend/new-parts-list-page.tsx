"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";

type PartListItemForm = {
  productId: string;
  productLabel: string;
  quantity: string;
  displayUnit: string;
  storageRoomId: string | null;
};

type PartListForm = {
  name: string;
  description: string;
  items: PartListItemForm[];
};

const EMPTY_PART_LIST_ITEM: PartListItemForm = {
  productId: "",
  productLabel: "",
  quantity: "1",
  displayUnit: "-",
  storageRoomId: null,
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
    items: [{ ...EMPTY_PART_LIST_ITEM }],
  };
}

function formatBaseUnitLabel(baseUnit: string) {
  return BASE_UNIT_LABELS[baseUnit] ?? baseUnit;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const maybeData = (error as { data?: { zodError?: { fieldErrors?: Record<string, string[] | undefined> } } }).data;
    const fieldErrors = maybeData?.zodError?.fieldErrors;
    if (fieldErrors) {
      const zodFieldMessage = Object.values(fieldErrors)
        .flat()
        .find((message): message is string => typeof message === "string" && message.trim().length > 0);
      if (zodFieldMessage) return zodFieldMessage;
    }
  }

  const rawMessage = error instanceof Error ? error.message.trim() : "";
  if (!rawMessage) return fallback;

  if (
    (rawMessage.startsWith("[") && rawMessage.endsWith("]")) ||
    (rawMessage.startsWith("{") && rawMessage.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(rawMessage) as unknown;
      if (Array.isArray(parsed)) {
        const firstArrayMessage = parsed.find(
          (entry): entry is { message: string } =>
            typeof entry === "object" &&
            entry !== null &&
            "message" in entry &&
            typeof (entry as { message?: unknown }).message === "string" &&
            (entry as { message: string }).message.trim().length > 0,
        );
        if (firstArrayMessage) return firstArrayMessage.message;
      } else if (parsed && typeof parsed === "object" && "message" in parsed) {
        const objectMessage = (parsed as { message?: unknown }).message;
        if (typeof objectMessage === "string" && objectMessage.trim().length > 0) {
          return objectMessage;
        }
      }
    } catch {
      // Keep fallback behavior below when payload is not valid JSON.
    }
  }

  return rawMessage;
}

export function NewPartsListPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const toast = useToast();

  const [form, setForm] = useState<PartListForm>(createEmptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
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

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const productsQuery = api.product.backendList.useQuery(
    {
      search: productSearchTerm || undefined,
      limit: 200,
      cursor: undefined,
    },
    { enabled: activeProductRowKey !== null && productSearchTerm.length > 0 },
  );

  const productSuggestions = useMemo(
    () =>
      (productsQuery.data?.items ?? []).map((product) => ({
        id: product.id,
        label: `${product.sku} - ${product.name}`,
        baseUnit: product.baseUnit,
        storageRoomId: product.storageLocation?.storageRoomId ?? null,
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

  const hasDuplicateProducts = duplicateProductIds.size > 0;
  const storageRoomValidationMessage = useMemo(() => {
    const selectedItems = form.items.filter((item) => item.productId.length > 0);
    if (selectedItems.length === 0) return null;
    if (selectedItems.some((item) => !item.storageRoomId)) {
      return "Alle Produkte in einer Teileliste muessen einem Lagerplatz zugeordnet sein.";
    }

    const distinctStorageRooms = new Set(
      selectedItems
        .map((item) => item.storageRoomId)
        .filter((storageRoomId): storageRoomId is string => Boolean(storageRoomId)),
    );
    if (distinctStorageRooms.size > 1) {
      return "Alle Produkte in einer Teileliste muessen im selben Lagerraum liegen.";
    }
    return null;
  }, [form.items]);
  const normalizedFormItems = form.items
    .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))
    .filter((item) => item.productId.length > 0 && Number.isFinite(item.quantity) && item.quantity > 0);

  const canSave =
    form.name.trim().length > 0 &&
    form.items.length > 0 &&
    form.items.every((item) => item.productId.length > 0 && Number(item.quantity) > 0) &&
    !hasDuplicateProducts &&
    !storageRoomValidationMessage;

  const getProductRowKey = (index: number) => `create-${index}`;

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
      top: rect.bottom + 4,
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
    updateFormItem(index, (item) => ({ ...item, productLabel: value, productId: "", storageRoomId: null }));
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

  const selectProductSuggestion = (
    index: number,
    selected: { id: string; label: string; baseUnit: string; storageRoomId: string | null },
  ) => {
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
      storageRoomId: selected.storageRoomId,
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

  const showSuggestions = activeProductRowKey !== null && productSearchTerm.length > 0 && dropdownPosition !== null;

  const createMutation = api.partsList.backendCreate.useMutation({
    meta: { silent: true },
  });

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

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neue Teileliste</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1 h-10 rounded-xl"
            autoFocus
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
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
            {form.items.map((item, index) => {
              const rowKey = getProductRowKey(index);
              return (
                <tr key={`${index}-${item.productId}`} className="border-t border-border">
                  <td className="px-3 py-2 align-top">
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
                        <p className="mt-1 text-xs text-destructive">
                          Produkt ist bereits in einer anderen Zeile enthalten.
                        </p>
                      ) : null}
                    </div>
                  </td>
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
                          items:
                            prev.items.length <= 1
                              ? [{ ...EMPTY_PART_LIST_ITEM }]
                              : prev.items.filter((_, entryIndex) => entryIndex !== index),
                        }))
                      }
                    >
                      Zeile entfernen
                    </Button>
                  </td>
                </tr>
              );
            })}
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
              items: [...prev.items, { ...EMPTY_PART_LIST_ITEM }],
            }))
          }
        >
          Produktzeile hinzufuegen
        </Button>
      </div>

      <div className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="space-y-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">Bilder & Dokumente</p>
            <div className="mt-2 h-px w-full bg-slate-200/70" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 md:items-stretch">
            <div className="flex min-h-0 flex-col gap-3 md:h-full">
              <div>
                <p className="select-none text-xs text-slate-600">Bild hochladen</p>
                <label
                  htmlFor="new-parts-list-image"
                  className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-lg border-2 border-dashed border-violet-400/70 bg-violet-50/90 p-3 text-sm ${
                    uploadBusy ? "cursor-default opacity-90" : "cursor-pointer hover:bg-violet-100/90"
                  }`}
                >
                  <input
                    id="new-parts-list-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={uploadBusy}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setImageFile(file);
                      event.target.value = "";
                    }}
                  />
                  <span
                    className={`inline-flex shrink-0 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                      uploadBusy ? "opacity-70" : "group-hover:bg-violet-700"
                    }`}
                  >
                    Datei auswählen
                  </span>
                  <span
                    className={`min-w-0 flex-1 break-all text-left text-sm ${
                      imageFile ? "font-medium text-slate-900" : "text-slate-500"
                    }`}
                    title={imageFile?.name}
                    role="status"
                  >
                    {imageFile?.name ?? "Keine Datei ausgewählt"}
                  </span>
                </label>
              </div>
              <p className="min-w-0 flex-1 text-xs text-slate-600">
                  Unterstützt PNG, JPEG, WebP und GIF. Wird nach dem Speichern der Teileliste übertragen.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!imagePreviewUrl) return;
                    window.open(imagePreviewUrl, "_blank", "noopener,noreferrer");
                  }}
                  className={`relative h-48 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-56 sm:w-56 md:h-64 md:w-64 ${
                    imagePreviewUrl
                      ? "cursor-pointer ring-offset-2 transition hover:ring-2 hover:ring-violet-400/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      : "cursor-default opacity-90"
                  }`}
                  aria-label={imagePreviewUrl ? "Bild in neuem Tab oeffnen" : "Vorschau (noch kein Bild gewaehlt)"}
                  disabled={!imagePreviewUrl}
                >
                  <img
                    src={imagePreviewUrl ?? "/pictures/placeholder.jpg"}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/pictures/placeholder.jpg";
                    }}
                  />
                </button>

              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 md:h-full">
              <div>
                <p className="select-none text-xs text-slate-600">Dokument hochladen</p>
                <label
                  htmlFor="new-parts-list-document"
                  className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-lg border-2 border-dashed border-amber-500/65 bg-amber-50/90 p-3 text-sm ${
                    uploadBusy ? "cursor-default opacity-90" : "cursor-pointer hover:bg-amber-100/90"
                  }`}
                >
                  <input
                    id="new-parts-list-document"
                    type="file"
                    accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    disabled={uploadBusy}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setDocumentFile(file);
                      event.target.value = "";
                    }}
                  />
                  <span
                    className={`inline-flex shrink-0 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-amber-50 ${
                      uploadBusy ? "opacity-70" : "group-hover:bg-amber-800"
                    }`}
                  >
                    Datei auswählen
                  </span>
                  <span
                    className={`min-w-0 flex-1 break-all text-left text-sm ${
                      documentFile ? "font-medium text-slate-900" : "text-slate-500"
                    }`}
                    title={documentFile?.name}
                    role="status"
                  >
                    {documentFile?.name ?? "Keine Datei ausgewählt"}
                  </span>
                </label>
              </div>
              <p className="text-xs text-slate-600">
                PDF, Text, Tabellen und Präsentationen. Wird nach dem Speichern der Teileliste übertragen.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {hasDuplicateProducts ? (
          <p className="mb-2 text-xs text-destructive">Jedes Produkt darf nur einmal in der Teileliste vorkommen.</p>
        ) : null}
        {storageRoomValidationMessage ? (
          <p className="mb-2 text-xs text-destructive">{storageRoomValidationMessage}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={async () => {
              if (storageRoomValidationMessage) {
                toast.error(storageRoomValidationMessage);
                return;
              }
              let created: { id: string };
              try {
                created = await createMutation.mutateAsync({
                  name: form.name.trim(),
                  description: form.description.trim() ? form.description.trim() : null,
                  items: normalizedFormItems,
                });
              } catch (error) {
                toast.error(extractErrorMessage(error, "Teileliste konnte nicht erstellt werden."));
                return;
              }

              setUploadBusy(true);
              try {
                if (imageFile) {
                  await uploadImageForPartList(created.id, imageFile);
                }
                if (documentFile) {
                  await uploadDocumentForPartList(created.id, documentFile);
                }
              } catch (error) {
                toast.error(
                  `Teileliste wurde erstellt, aber Dateien konnten nicht hochgeladen werden: ${extractErrorMessage(
                    error,
                    "Unbekannter Fehler",
                  )}`,
                );
                setUploadBusy(false);
                return;
              }
              setUploadBusy(false);

              await utils.partsList.backendList.invalidate();
              toast.success("Teileliste erstellt.");
              router.push("/backend/parts-list");
            }}
            disabled={!canSave || createMutation.isPending || uploadBusy}
          >
            {createMutation.isPending ? "Erstellt..." : uploadBusy ? "Lade Dateien hoch..." : "Teileliste erstellen"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/backend/parts-list")} disabled={uploadBusy}>
            <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
              <ArrowLeftIcon />
            </span>
            Zurück
          </Button>
        </div>
      </div>

      {showSuggestions
        ? createPortal(
            <div
              className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
              style={{
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                top: dropdownPosition.top,
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
                      const [, indexText] = activeProductRowKey.split("-");
                      const index = Number(indexText);
                      if (Number.isInteger(index)) {
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

