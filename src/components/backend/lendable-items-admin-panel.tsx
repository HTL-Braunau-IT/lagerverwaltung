"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import * as TableUI from "~/components/ui/table";
import { ChevronDownIcon, PlusIcon, WastebinIcon } from "~/components/layout/icon-renders";

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

export function LendableItemsAdminPanel() {
  const utils = api.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [formsById, setFormsById] = useState<Record<string, FormState>>({});
  const [imageCacheBustById, setImageCacheBustById] = useState<Record<string, number>>({});
  const [inlineImageUploadError, setInlineImageUploadError] = useState<string | null>(null);
  const [inlineImageUploadPendingItemId, setInlineImageUploadPendingItemId] = useState<string | null>(null);
  const [editMediaSectionCollapsedById, setEditMediaSectionCollapsedById] = useState<Record<string, boolean>>({});

  const roomsQuery = api.storageRoom.list.useQuery();
  const itemsQuery = api.lendableItem.backendList.useQuery({
    search: searchTerm || undefined,
    limit: 200,
  });

  const createMutation = api.lendableItem.backendCreate.useMutation();
  const updateMutation = api.lendableItem.backendUpdate.useMutation({
    onSuccess: async () => {
      await utils.lendableItem.backendList.invalidate();
    },
  });

  const deleteMutation = api.lendableItem.backendDelete.useMutation({
    onSuccess: async () => {
      await utils.lendableItem.backendList.invalidate();
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
    },
  });

  const sortedItems = useMemo(
    () => [...(itemsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [itemsQuery.data],
  );

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
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-xs text-muted-foreground col-span-2">
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
                          <div className="grid grid-cols-3 gap-2 items-end">
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
                              className={`flex h-11 w-full items-center justify-between gap-3 rounded-md border-2 bg-card/40 mt-1 px-3 py-2 text-left transition ${
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

                        <div className="rounded-md bg-card/40 p-3 min-w-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditMediaSectionCollapsedById((current) => ({
                                ...current,
                                [item.id]: !(current[item.id] ?? true),
                              }));
                            }}
                            className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-md"
                            aria-expanded={!(editMediaSectionCollapsedById[item.id] ?? true)}
                            aria-controls={`edit-media-section-${item.id}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-lg font-semibold text-foreground">Bilder & Dokumente</p>
                              <span
                                aria-hidden="true"
                                className="shrink-0 text-muted-foreground"
                                title={(editMediaSectionCollapsedById[item.id] ?? true) ? "Ausklappen" : "Einklappen"}
                              >
                                <ChevronDownIcon
                                  open={!(editMediaSectionCollapsedById[item.id] ?? true)}
                                  className="h-4 w-4"
                                />
                              </span>
                            </div>
                            {!(editMediaSectionCollapsedById[item.id] ?? true) ? (
                              <div className="mt-2 h-px w-full bg-border" aria-hidden="true" />
                            ) : null}
                          </button>

                          {!(editMediaSectionCollapsedById[item.id] ?? true) ? (
                            <div id={`edit-media-section-${item.id}`} className="space-y-3 pt-3">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 md:items-start">
                                <div className="min-w-0 space-y-4">
                                  <div>
                                    <p className="select-none text-sm text-muted-foreground">Bild hochladen</p>
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
                                            setInlineImageUploadError(null);
                                            setInlineImageUploadPendingItemId(item.id);
                                            const url = await uploadImage(item.id, file);
                                            setFormsById((current) => ({
                                              ...current,
                                              [item.id]: { ...(current[item.id] ?? rowForm), imageUrl: url },
                                            }));
                                            setImageCacheBustById((current) => ({ ...current, [item.id]: Date.now() }));
                                          } catch (error) {
                                            setInlineImageUploadError(
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
                                        role="status"
                                      >
                                        {inlineImageUploadPendingItemId === item.id
                                          ? "Bild wird hochgeladen..."
                                          : "Keine Datei ausgewählt"}
                                      </span>
                                    </label>
                                  </div>

                                  {inlineImageUploadError ? (
                                    <p className="text-xs text-destructive">{inlineImageUploadError}</p>
                                  ) : null}

                                  <div className="mt-auto space-y-1.5 border-t border-border pt-3">
                                    <p className="mb-1 text-xs font-medium text-foreground">Aktuelles Bild</p>
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
                                          <div className="relative rounded-sm border-b-2 border-violet-400/80 bg-card/80 p-1.5">
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
                                      <p className="text-xs text-muted-foreground">Noch kein Bild vorhanden.</p>
                                    )}
                                  </div>
                                </div>

                                <div className="hidden md:block" />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateMutation.mutate({
                                id: item.id,
                                name: rowForm.name.trim(),
                                description: rowForm.description.trim() || null,
                                quantityOnHand: Math.max(0, Math.floor(Number(rowForm.quantityOnHand) || 0)),
                                storageRoomId: rowForm.storageRoomId,
                                isVisible: rowForm.isVisible,
                                imageUrl: rowForm.imageUrl.trim() || null,
                                imageAltText: rowForm.imageAltText.trim() || null,
                              });
                            }}
                            disabled={updateMutation.isPending}
                          >
                            Speichern
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFormsById((current) => ({
                                ...current,
                                [item.id]: createFormFromItem(item),
                              }));
                            }}
                          >
                            Zuruecksetzen
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteMutation.mutate({ id: item.id });
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Loeschen
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
    </Card>
  );
}

