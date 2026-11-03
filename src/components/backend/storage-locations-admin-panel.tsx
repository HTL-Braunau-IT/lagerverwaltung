"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { useConfirmClick } from "~/components/backend/use-confirm-click";

type StorageLocationForm = {
  name: string;
  storageRoomId: string;
  description: string;
};

function createEmptyLocationForm(): StorageLocationForm {
  return { name: "", storageRoomId: "", description: "" };
}

function toStorageLocationCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function StorageLocationsAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [locationRoomFilter, setLocationRoomFilter] = useState("");
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState<StorageLocationForm>(createEmptyLocationForm);
  const [baselineForm, setBaselineForm] = useState<StorageLocationForm>(createEmptyLocationForm);
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: expandedLocationId,
  });

  const roomsQuery = api.storageRoom.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const locationsQuery = api.storageLocation.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      storageRoomId: locationRoomFilter || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const roomItems = useMemo(
    () =>
      [...(roomsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [roomsQuery.data],
  );

  useEffect(() => {
    if (locationRoomFilter) return;
    const first = roomItems[0]?.id;
    if (first) setLocationRoomFilter(first);
  }, [locationRoomFilter, roomItems]);

  const effectiveRoomId = useMemo(() => {
    if (locationRoomFilter) return locationRoomFilter;
    return roomItems[0]?.id ?? "";
  }, [locationRoomFilter, roomItems]);
  const locationItems = useMemo(
    () =>
      [...(locationsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    [locationsQuery.data],
  );

  const updateLocationMutation = api.storageLocation.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
        expandedLocationId ? utils.storageLocation.byId.invalidate({ id: expandedLocationId }) : Promise.resolve(),
      ]);
      toast.success("Lagerplatz aktualisiert.");
    },
  });
  const deleteLocationMutation = api.storageLocation.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.storageLocation.backendList.invalidate(), utils.storageLocation.list.invalidate()]);
      setExpandedLocationId(null);
      setLocationForm(createEmptyLocationForm());
      setBaselineForm(createEmptyLocationForm());
      toast.success("Lagerplatz geloescht.");
    },
  });

  const generatedLocationCode = toStorageLocationCode(locationForm.name.trim());
  const canSave =
    Boolean(generatedLocationCode) && locationForm.name.trim().length > 0 && Boolean(locationForm.storageRoomId);

  const isExpandedDirty = useMemo(() => {
    if (!expandedLocationId) return false;
    const normalize = (f: StorageLocationForm) => ({
      name: f.name.trim(),
      storageRoomId: f.storageRoomId,
      description: f.description.trim(),
    });
    return isDirty(locationForm, baselineForm, normalize);
  }, [baselineForm, expandedLocationId, locationForm]);

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-3 flex gap-3 items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Lagerplätze</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Raum:</p>
        <div className="flex flex-wrap gap-2">
          {roomItems.map((room) => {
            const active = effectiveRoomId === room.id;
            return (
              <FilterPillButton
                key={room.id}
                onClick={() => setLocationRoomFilter(room.id)}
                active={active}
              >
                {room.name}
              </FilterPillButton>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => router.push("/backend/storage/locations/new")}
          className="ml-auto inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neuer Lagerplatz
        </button>
      </div>

      
      <div className="overflow-x-auto rounded-md">
        <TableUI.Table>
          <TableUI.TableHeader className="">
            <tr>
              <TableUI.TableHead>Code</TableUI.TableHead>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>Lagerraum</TableUI.TableHead>
              <TableUI.TableHead>Produkte</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody className="">
            {locationsQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Lagerplätze werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}
            {locationsQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-destructive">
                  Lagerplätze konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {!locationsQuery.isLoading && !locationsQuery.error && locationItems.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={4} className="text-sm italic text-muted-foreground/80">
                  Keine Lagerplätze gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}
            {locationItems.map((location) => {
              const isExpanded = expandedLocationId === location.id;
              return (
                <Fragment key={location.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedLocationId((current) => {
                        const next = current === location.id ? null : location.id;
                        setLocationForm((prev) =>
                          next
                            ? {
                                name: location.name,
                                storageRoomId: location.storageRoomId,
                                description: location.description ?? "",
                              }
                            : prev,
                        );
                        setBaselineForm(
                          next
                            ? {
                                name: location.name,
                                storageRoomId: location.storageRoomId,
                                description: location.description ?? "",
                              }
                            : createEmptyLocationForm(),
                        );
                        return next;
                      });
                    }}
                    className=""
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{location.code}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{location.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{location.storageRoom.name}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{location._count.products}</TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={4}
                    rowClassName="bg-muted/30"
                    cellClassName="min-w-0 align-top px-1 py-5"
                    contentClassName="!p-0"
                  >
                    {isExpanded ? (
                      <div className="px-4 flex min-w-0 flex-col gap-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-1">
                          <label className="text-xs text-muted-foreground">
                            Name
                            <Input
                              value={locationForm.name}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setLocationForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                              variant="title"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Code (automatisch)
                            <Input
                              value={generatedLocationCode}
                              disabled
                              onClick={(event) => event.stopPropagation()}
                              variant="subtitle"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Beschreibung (optional)
                            <Input
                              value={locationForm.description}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setLocationForm((prev) => ({ ...prev, description: event.target.value }))
                              }
                              variant="default"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Lagerraum
                            <select
                              value={locationForm.storageRoomId}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setLocationForm((prev) => ({ ...prev, storageRoomId: event.target.value }))
                              }
                              className="mt-1 flex h-10 w-full appearance-none rounded-md bg-card/40 backdrop-blur px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="">Bitte wählen</option>
                              {roomItems.map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Produkte
                            <Input
                            variant="default"
                            disabled
                            value={location._count.products}
                            >
                            
                            </Input>
                          </label>
                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              variant="destructive"
                              className="!w-36"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (deleteLocationMutation.isPending) return;
                                confirmOrRunDelete(() => deleteLocationMutation.mutate({ id: location.id }));
                              }}
                              disabled={deleteLocationMutation.isPending}
                            >
                              {deleteLocationMutation.isPending
                                ? "Löscht..."
                                : isConfirmingDelete
                                  ? "Nochmal klicken"
                                  : "Löschen"}
                            </Button>
                          </div>
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

      {locationsQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void locationsQuery.fetchNextPage()}
            disabled={locationsQuery.isFetchingNextPage}
          >
            {locationsQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}

      <UnsavedChangesBar
        open={isExpandedDirty}
        title={expandedLocationId ? (locationItems.find((l) => l.id === expandedLocationId)?.name ?? "Lagerplatz") : "Lagerplatz"}
        onReset={() => {
          if (!expandedLocationId) return;
          setLocationForm(baselineForm);
        }}
        onSave={() => {
          if (!expandedLocationId) return;
          const loc = locationItems.find((l) => l.id === expandedLocationId);
          if (!loc) return;
          if (updateLocationMutation.isPending) return;
          if (!canSave) return;
          updateLocationMutation.mutate(
            {
              id: loc.id,
              code: toStorageLocationCode(locationForm.name.trim()),
              name: locationForm.name.trim(),
              storageRoomId: locationForm.storageRoomId,
              description: locationForm.description.trim() ? locationForm.description.trim() : null,
            },
            {
              onSuccess: () => {
                setBaselineForm({
                  name: locationForm.name,
                  storageRoomId: locationForm.storageRoomId,
                  description: locationForm.description,
                });
              },
            },
          );
        }}
        saveDisabled={!canSave || updateLocationMutation.isPending}
        resetDisabled={updateLocationMutation.isPending}
        saveLabel={updateLocationMutation.isPending ? "Speichert..." : "Speichern"}
      />
    </Card>
  );
}

