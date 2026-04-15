"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";

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
  const [inlineImageUploadError, setInlineImageUploadError] = useState<string | null>(null);
  const [inlineImageUploadPendingItemId, setInlineImageUploadPendingItemId] = useState<string | null>(null);

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

      <div className="overflow-x-auto overflow-y-visible rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Lagerraum</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead>Sichtbar</TableHead>
              <TableHead>Bild</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((item) => {
              const isExpanded = expandedItemId === item.id;
              const rowForm = formsById[item.id] ?? createFormFromItem(item);

              return (
                <Fragment key={item.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedItemId((current) => (current === item.id ? null : item.id));
                      setFormsById((current) => ({
                        ...current,
                        [item.id]: current[item.id] ?? createFormFromItem(item),
                      }));
                    }}
                    className="cursor-pointer bg-white"
                  >
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell>{item.storageRoom.name}</TableCell>
                    <TableCell>{item.quantityOnHand}</TableCell>
                    <TableCell>{item.isVisible ? "Ja" : "Nein"}</TableCell>
                    <TableCell>{item.images[0]?.url ? "Vorhanden" : "-"}</TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={5} className="px-3 py-4">
                        <div className="grid gap-3 md:grid-cols-2">
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
                              className="mt-1 h-10 rounded-xl"
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
                              className="mt-1 h-10 rounded-xl"
                            />
                          </label>
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
                              className="mt-1 h-10 rounded-xl"
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
                              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                            >
                              <option value="">Lagerraum waehlen</option>
                              {(roomsQuery.data ?? []).map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
                            <input
                              type="checkbox"
                              checked={rowForm.isVisible}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [item.id]: { ...rowForm, isVisible: event.target.checked },
                                }))
                              }
                            />
                            Ausleihbar
                          </label>
                          <label className="text-xs text-muted-foreground md:col-span-2">
                            Bild hochladen (optional)
                            <Input
                              type="file"
                              accept="image/*"
                              onClick={(event) => event.stopPropagation()}
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
                                } catch (error) {
                                  setInlineImageUploadError(
                                    error instanceof Error ? error.message : "Upload fehlgeschlagen.",
                                  );
                                } finally {
                                  setInlineImageUploadPendingItemId((current) => (current === item.id ? null : current));
                                  inputEl.value = "";
                                }
                              }}
                              className="mt-2 h-10"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground md:col-span-2">
                            Bild-URL
                            <Input
                              value={rowForm.imageUrl}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [item.id]: { ...rowForm, imageUrl: event.target.value },
                                }))
                              }
                              className="mt-1 h-10 rounded-xl"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground md:col-span-2">
                            Bild-Alt-Text
                            <Input
                              value={rowForm.imageAltText}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [item.id]: { ...rowForm, imageAltText: event.target.value },
                                }))
                              }
                              className="mt-1 h-10 rounded-xl"
                            />
                          </label>
                        </div>
                        {inlineImageUploadPendingItemId === item.id ? (
                          <p className="mt-2 text-xs text-muted-foreground">Bild wird hochgeladen...</p>
                        ) : null}
                        {inlineImageUploadError ? (
                          <p className="mt-2 text-sm text-destructive">{inlineImageUploadError}</p>
                        ) : null}
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
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

