"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { PlusIcon } from "~/components/layout/icon-renders";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [locationRoomFilter, setLocationRoomFilter] = useState("");
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState<StorageLocationForm>(createEmptyLocationForm);

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
    },
  });
  const deleteLocationMutation = api.storageLocation.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.storageLocation.backendList.invalidate(), utils.storageLocation.list.invalidate()]);
      setExpandedLocationId(null);
      setLocationForm(createEmptyLocationForm());
    },
  });

  const generatedLocationCode = toStorageLocationCode(locationForm.name.trim());
  const canSave =
    Boolean(generatedLocationCode) && locationForm.name.trim().length > 0 && Boolean(locationForm.storageRoomId);

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex gap-3 items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Lagerplätze</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Filtern nach Raum:</p>
        <div className="flex flex-wrap gap-2">
          {roomItems.map((room) => {
            const active = effectiveRoomId === room.id;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setLocationRoomFilter(room.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {room.name}
              </button>
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

      
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Lagerraum</TableHead>
              <TableHead>Produkte</TableHead>
            </tr>
          </TableHeader>
          <TableBody className="bg-white">
            {locationsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Lagerplätze werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {locationsQuery.error ? (
              <tr>
                <TableCell colSpan={4} className="text-destructive">
                  Lagerplätze konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!locationsQuery.isLoading && !locationsQuery.error && locationItems.length === 0 ? (
              <tr>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Keine Lagerplätze gefunden.
                </TableCell>
              </tr>
            ) : null}
            {locationItems.map((location) => {
              const isExpanded = expandedLocationId === location.id;
              return (
                <Fragment key={location.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedLocationId((current) => (current === location.id ? null : location.id));
                      setLocationForm((current) =>
                        expandedLocationId === location.id
                          ? current
                          : {
                              name: location.name,
                              storageRoomId: location.storageRoomId,
                              description: location.description ?? "",
                            },
                      );
                    }}
                    className={`cursor-pointer bg-white hover:bg-muted/30 ${isExpanded ? "bg-muted/15" : ""} select-none`}
                  >
                    <TableCell className="font-medium text-foreground">{location.code}</TableCell>
                    <TableCell className="text-muted-foreground">{location.name}</TableCell>
                    <TableCell className="text-muted-foreground">{location.storageRoom.name}</TableCell>
                    <TableCell className="text-muted-foreground">{location._count.products}</TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="p-3">
                        <div className="w-full p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-foreground">Lagerplatz bearbeiten</h3>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            Produkte:{" "}
                            <span className="font-medium text-foreground">{location._count.products}</span>
                          </p>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-muted-foreground">
                              Name
                              <Input
                                value={locationForm.name}
                                onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="mt-1 h-10 rounded-xl"
                                autoFocus
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Code (automatisch)
                              <Input value={generatedLocationCode} readOnly className="mt-1 h-10 rounded-xl" />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Lagerraum
                              <select
                                value={locationForm.storageRoomId}
                                onChange={(event) =>
                                  setLocationForm((prev) => ({ ...prev, storageRoomId: event.target.value }))
                                }
                                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
                              >
                                <option value="">Bitte wählen</option>
                                {roomItems.map((room) => (
                                  <option key={room.id} value={room.id}>
                                    {room.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-muted-foreground md:col-span-2">
                              Beschreibung (optional)
                              <Input
                                value={locationForm.description}
                                onChange={(event) =>
                                  setLocationForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                className="mt-1 h-10 rounded-xl"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                updateLocationMutation.mutate({
                                  id: location.id,
                                  code: generatedLocationCode,
                                  name: locationForm.name.trim(),
                                  storageRoomId: locationForm.storageRoomId,
                                  description: locationForm.description.trim() ? locationForm.description.trim() : null,
                                })
                              }
                              disabled={!canSave || updateLocationMutation.isPending}
                            >
                              {updateLocationMutation.isPending ? "Speichert..." : "Änderungen speichern"}
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => deleteLocationMutation.mutate({ id: location.id })}
                              disabled={deleteLocationMutation.isPending}
                            >
                              {deleteLocationMutation.isPending ? "Löscht..." : "Lagerplatz löschen"}
                            </Button>
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
    </Card>
  );
}

