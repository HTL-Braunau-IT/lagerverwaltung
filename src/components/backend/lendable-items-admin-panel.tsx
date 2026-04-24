"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import {
  PlusIcon,
  WarningTriangleIcon,
  WastebinIcon,
} from "~/components/layout/icon-renders";
import { DetailCard, DetailText } from "~/components/ui/detail-card";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { useConfirmClick } from "~/components/backend/use-confirm-click";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type FormState = {
  id?: string;
  name: string;
  description: string;
  quantityOnHand: string;
  storageRoomId: string;
  isVisible: boolean;
  imageUrl: string;
  imageAltText: string;
};

type LendableItemListEntry = {
  id: string;
  name: string;
  description: string | null;
  quantityOnHand: number;
  storageRoomId: string;
  isVisible: boolean;
  storageRoom: { id: string; name: string };
  images: Array<{ id: string; url: string; altText: string | null }>;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    quantityOnHand: "0",
    storageRoomId: "",
    isVisible: true,
    imageUrl: "",
    imageAltText: "",
  };
}

function createFormFromItem(item: LendableItemListEntry): FormState {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    quantityOnHand: String(item.quantityOnHand),
    storageRoomId: item.storageRoomId,
    isVisible: item.isVisible,
    imageUrl: item.images[0]?.url ?? "",
    imageAltText: item.images[0]?.altText ?? "",
  };
}

function normalizeFormState(form: FormState): Omit<FormState, "id"> {
  const normalizedQuantity = Math.max(0, Math.floor(Number(form.quantityOnHand) || 0));
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    quantityOnHand: String(normalizedQuantity),
    storageRoomId: form.storageRoomId,
    isVisible: form.isVisible,
    imageUrl: form.imageUrl.trim(),
    imageAltText: form.imageAltText.trim(),
  };
}

export function LendableItemsAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [formsById, setFormsById] = useState<Record<string, FormState>>({});
  const [imageCacheBustById, setImageCacheBustById] = useState<Record<string, number>>({});
  const [inlineImageUploadPendingItemId, setInlineImageUploadPendingItemId] = useState<string | null>(null);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: expandedItemId,
  });

  const roomsQuery = api.storageRoom.list.useQuery();
  const itemsQuery = api.lendableItem.backendList.useQuery({
    search: searchTerm || undefined,
    limit: 200,
  });

  const createMutation = api.lendableItem.backendCreate.useMutation();
  const updateMutation = api.lendableItem.backendUpdate.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.lendableItem.backendList.invalidate();
      setFormsById((current) => {
        const prev = current[variables.id];
        if (!prev) return current;
        return {
          ...current,
          [variables.id]: {
            ...prev,
            name: variables.name,
            description: variables.description ?? "",
            quantityOnHand: String(variables.quantityOnHand),
            storageRoomId: variables.storageRoomId,
            isVisible: variables.isVisible ?? prev.isVisible,
            imageUrl: variables.imageUrl ?? "",
            imageAltText: variables.imageAltText ?? "",
          },
        };
      });
      toast.success("Leihgerät aktualisiert.");
    },
  });

  const deleteMutation = api.lendableItem.backendDelete.useMutation({
    onSuccess: async () => {
      await utils.lendableItem.backendList.invalidate();
      toast.success("Leihgerät geloescht.");
    },
  });

  const clearImageMutation = api.lendableItem.backendClearImage.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.lendableItem.backendList.invalidate();
      setFormsById((current) => {
        const prev = current[variables.id];
        if (!prev) return current;
        return { ...current, [variables.id]: { ...prev, imageUrl: "", imageAltText: "" } };
      });
      setImageCacheBustById((current) => ({ ...current, [variables.id]: Date.now() }));
      toast.success("Bild entfernt.");
    },
  });

  const sortedItems = useMemo(
    () => [...(itemsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [itemsQuery.data],
  );

  const expandedContext = useMemo(() => {
    if (!expandedItemId) return null;
    const item = sortedItems.find((i) => i.id === expandedItemId);
    if (!item) return null;
    const baseline = createFormFromItem(item);
    const current = formsById[item.id] ?? baseline;
    const dirty = isDirty(current, baseline, normalizeFormState);
    return { item, baseline, current, dirty };
  }, [expandedItemId, sortedItems, formsById]);

  const uploadImage = async (itemId: string, file: File) => {
    if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswaehlen.");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Das Bild ist zu gross. Maximal 8 MB erlaubt.");
    const body = new FormData();
    body.append("itemId", itemId);
    body.append("file", file);
    const response = await fetch("/api/backend/lendable-items/upload-image", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    if (!response.ok || !result?.url) throw new Error(result?.message ?? "Bild konnte nicht hochgeladen werden.");
    return result.url;
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Leihgeräte</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push("/backend/lendable-items/new")}
          className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neues Leihgerät
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-visible">
        <TableUI.Table>
          <TableUI.TableHeader className="bg-muted/50">
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Lagerraum</TableUI.TableHead>
              <TableUI.TableHead>Bestand</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {sortedItems.map((item) => {
              const isExpanded = expandedItemId === item.id;
              const rowForm = formsById[item.id] ?? createFormFromItem(item);

              return (
                <Fragment key={item.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedItemId((current) => (current === item.id ? null : item.id));
                      setFormsById((current) => ({
                        ...current,
                        [item.id]: current[item.id] ?? createFormFromItem(item),
                      }));
                    }}
                    className=""
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{item.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{item.storageRoom.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{item.quantityOnHand}</TableUI.TableCell>
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
                        <div className="grid gap-3 md:grid-cols-2 items-center">
                          <div className="min-w-0 flex flex-col gap-2">
                            <label className="text-xs text-muted-foreground">
                              Name
                              <Input
                                value={rowForm.name}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setFormsById((current) => ({
                                    ...current,
                                    [item.id]: { ...rowForm, name: event.target.value },
                                  }))
                                }
                                variant="title"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Beschreibung
                              <Input
                                value={rowForm.description}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setFormsById((current) => ({
                                    ...current,
                                    [item.id]: { ...rowForm, description: event.target.value },
                                  }))
                                }
                                variant="default"
                              />
                            </label>
                            <div className="grid grid-cols-3 items-end gap-2">
                              <label className="text-xs text-muted-foreground">
                                Bestand
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={rowForm.quantityOnHand}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    setFormsById((current) => ({
                                      ...current,
                                      [item.id]: { ...rowForm, quantityOnHand: event.target.value },
                                    }))
                                  }
                                  variant="default"
                                />
                              </label>
                              <label className="text-xs text-muted-foreground">
                                Lagerraum
                                <select
                                  value={rowForm.storageRoomId}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    setFormsById((current) => ({
                                      ...current,
                                      [item.id]: { ...rowForm, storageRoomId: event.target.value },
                                    }))
                                  }
                                  className="mt-1 flex h-10 w-full appearance-none rounded-md bg-card/40 backdrop-blur px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="">Lagerraum waehlen</option>
                                  {(roomsQuery.data ?? []).map((room) => (
                                    <option key={room.id} value={room.id}>
                                      {room.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFormsById((current) => ({
                                    ...current,
                                    [item.id]: { ...rowForm, isVisible: !rowForm.isVisible },
                                  }));
                                }}
                                className={`mt-1 flex h-11 w-full items-center justify-between gap-3 rounded-md border-2 bg-card/40 px-3 py-2 text-left transition ${
                                  rowForm.isVisible ? "border-emerald-500/60" : "border-red-500/60"
                                }`}
                                aria-label="Ausleihbarkeit umschalten"
                                aria-pressed={rowForm.isVisible}
                              >
                                <span className="text-sm text-foreground">Ausleihbar</span>
                                <span
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                                    rowForm.isVisible ? "bg-emerald-500/60" : "bg-red-500/60"
                                  }`}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                      rowForm.isVisible ? "translate-x-5" : "translate-x-1"
                                    }`}
                                  />
                                </span>
                              </button>
                            </div>
                          </div>
                          <DetailCard className="hover:!bg-card/40">
                            <div className="flex items-center justify-between gap-3">
                              <DetailText variant="title">Bilder & Dokumente</DetailText>
                            </div>
                            <div className="mt-2 h-px w-full bg-border" aria-hidden="true" />

                            <div className="pt-2">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
                                <div className="min-w-0">
                                      <DetailText 
                                        variant="subvalue"
                                        className="ml-1 "
                                      >
                                        Bild hochladen
                                      </DetailText>
                                      <label
                                        className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-violet-400/70 bg-card/40 p-3 text-sm ${
                                          inlineImageUploadPendingItemId === item.id
                                            ? "cursor-default opacity-90"
                                            : "cursor-pointer hover:bg-violet-100"
                                        }`}
                                        onClick={(event) => event.stopPropagation()}
                                        aria-busy={inlineImageUploadPendingItemId === item.id ? true : undefined}
                                      >
                                        <input
                                          id={`edit-lendable-item-image-${item.id}`}
                                          type="file"
                                          accept="image/*"
                                          disabled={inlineImageUploadPendingItemId === item.id}
                                          className="sr-only"
                                          onChange={async (event) => {
                                            event.stopPropagation();
                                            const inputEl = event.currentTarget;
                                            const file = inputEl.files?.[0];
                                            if (!file) return;

                                            try {
                                              setInlineImageUploadPendingItemId(item.id);
                                              const url = await uploadImage(item.id, file);
                                              setFormsById((current) => ({
                                                ...current,
                                                [item.id]: { ...(current[item.id] ?? rowForm), imageUrl: url },
                                              }));
                                              setImageCacheBustById((current) => ({ ...current, [item.id]: Date.now() }));
                                              toast.success("Bild hochgeladen.");
                                            } catch (error) {
                                              toast.error(
                                                error instanceof Error ? error.message : "Upload fehlgeschlagen.",
                                              );
                                            } finally {
                                              setInlineImageUploadPendingItemId((current) =>
                                                current === item.id ? null : current,
                                              );
                                              inputEl.value = "";
                                            }
                                          }}
                                        />
                                        <span
                                          className={`inline-flex shrink-0 rounded-sm bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                                            inlineImageUploadPendingItemId === item.id
                                              ? "opacity-70"
                                              : "group-hover:bg-violet-700"
                                          }`}
                                        >
                                          Datei auswählen
                                        </span>
                                        <span
                                          className={`min-w-0 flex-1 break-all text-left text-sm ${
                                            inlineImageUploadPendingItemId === item.id
                                              ? "text-muted-foreground"
                                              : rowForm.imageUrl.trim()
                                                ? "font-medium text-foreground"
                                                : "text-muted-foreground"
                                          }`}
                                          role="status"min-w-0 space-y-4
                                        >
                                          {inlineImageUploadPendingItemId === item.id
                                            ? "Bild wird hochgeladen..."
                                            : "Keine Datei ausgewählt"}
                                        </span>
                                      </label>
                                </div>

                                <div className="min-w-0 space-y-1.5 pt-3 md:pl-4 md:pt-0">
                                      <DetailText
                                        variant="subvalue"
                                        className="ml-1"
                                        >
                                        Aktuelles Bild
                                        </DetailText>
                                      {(rowForm.imageUrl.trim() || item.images[0]?.url) ? (
                                        (() => {
                                          const currentImageUrl = rowForm.imageUrl.trim() || item.images[0]?.url || "";
                                          const currentAltText =
                                            (rowForm.imageAltText.trim() || item.images[0]?.altText || "").trim();
                                          const cacheBust = imageCacheBustById[item.id];
                                          const imgSrc = cacheBust ? `${currentImageUrl}?v=${cacheBust}` : currentImageUrl;
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
                                            <div className="relative rounded-sm border-b-2 border-violet-400/80 bg-card/60 p-1.5">
                                              <button
                                                type="button"
                                                onClick={(event) => event.stopPropagation()}
                                                className="flex w-full min-w-0 items-center gap-2 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/80"
                                              >
                                                <img
                                                  src={imgSrc}
                                                  alt={`${rowForm.name} Bild`}
                                                  className="h-14 w-14 shrink-0 rounded-xs object-cover"
                                                  onError={(errEvent) => {
                                                    errEvent.currentTarget.onerror = null;
                                                    errEvent.currentTarget.src = "/pictures/placeholder.jpg";
                                                  }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                                    <span className="text-muted-foreground font-semibold">Name:</span>
                                                    <span className="break-all text-foreground">{displayImagePath}</span>

                                                    <span className="text-muted-foreground font-semibold">Alt-Text:</span>
                                                    <span className="min-w-0 line-clamp-2 text-muted-foreground">
                                                      {currentAltText || `Vorschaubild ${rowForm.name}`}
                                                    </span>

                                                    <span className="text-muted-foreground font-semibold">Größe:</span>
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
                                                  clearImageMutation.mutate({ id: item.id });
                                                }}
                                                disabled={
                                                  !currentImageUrl ||
                                                  clearImageMutation.isPending ||
                                                  inlineImageUploadPendingItemId === item.id
                                                }
                                                className="absolute bottom-1 right-1 h-8 w-8 p-0 rounded-xs text-muted-foreground transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                                                aria-label="Bild entfernen"
                                              >
                                                {inlineImageUploadPendingItemId === item.id || clearImageMutation.isPending ? (
                                                  <span className="text-xs">...</span>
                                                ) : (
                                                  <WastebinIcon size={16} className="opacity-90" />
                                                )}
                                              </Button>
                                            </div>
                                          );
                                        })()
                                      ) : (
                                        <DetailText
                                          variant="subvalue"
                                          className="ml-1 font-semibold">
                                            Noch kein Bild vorhanden.
                                        </DetailText>
                                      )}
                                    </div>
                              </div>
                            </div>
                          </DetailCard>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            className="!w-36"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (deleteMutation.isPending) return;
                              confirmOrRunDelete(() => deleteMutation.mutate({ id: item.id }));
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
                    ) : null}
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
      </div>

      <UnsavedChangesBar
        open={!!expandedContext?.dirty}
        title={expandedContext?.item.name ?? "Leihgerät"}
        onReset={() => {
          if (!expandedContext) return;
          setFormsById((current) => ({
            ...current,
            [expandedContext.item.id]: createFormFromItem(expandedContext.item),
          }));
        }}
        onSave={() => {
          if (!expandedContext) return;
          const payload = {
            id: expandedContext.item.id,
            name: expandedContext.current.name.trim(),
            description: expandedContext.current.description.trim() || null,
            quantityOnHand: Math.max(0, Math.floor(Number(expandedContext.current.quantityOnHand) || 0)),
            storageRoomId: expandedContext.current.storageRoomId,
            isVisible: expandedContext.current.isVisible,
            imageUrl: expandedContext.current.imageUrl.trim() || null,
            imageAltText: expandedContext.current.imageAltText.trim() || null,
          };
          updateMutation.mutate(payload);
        }}
        saveDisabled={updateMutation.isPending}
        resetDisabled={updateMutation.isPending}
        saveLabel={updateMutation.isPending ? "Speichert..." : "Speichern"}
      />
    </Card>
  );
}

