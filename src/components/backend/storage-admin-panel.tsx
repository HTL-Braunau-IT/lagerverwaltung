"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type StorageRoomForm = {
  name: string;
};

type StorageLocationForm = {
  name: string;
  storageRoomId: string;
  description: string;
};

function createEmptyRoomForm(): StorageRoomForm {
  return { name: "" };
}

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

export function StorageAdminPanel() {
  const utils = api.useUtils();
  const [roomSearchInput, setRoomSearchInput] = useState("");
  const [roomSearchTerm, setRoomSearchTerm] = useState("");
  const [locationSearchInput, setLocationSearchInput] = useState("");
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [locationRoomFilter, setLocationRoomFilter] = useState("");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createLocationOpen, setCreateLocationOpen] = useState(false);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<StorageRoomForm>(createEmptyRoomForm);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState<StorageLocationForm>(createEmptyLocationForm);

  useEffect(() => {
    const timeout = window.setTimeout(() => setRoomSearchTerm(roomSearchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [roomSearchInput]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLocationSearchTerm(locationSearchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [locationSearchInput]);

  const roomsQuery = api.storageRoom.backendList.useInfiniteQuery(
    {
      search: roomSearchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const locationsQuery = api.storageLocation.backendList.useInfiniteQuery(
    {
      search: locationSearchTerm || undefined,
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
  const locationItems = useMemo(
    () =>
      [...(locationsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    [locationsQuery.data],
  );

  const createRoomMutation = api.storageRoom.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
      ]);
      setRoomForm(createEmptyRoomForm());
      setCreateRoomOpen(false);
    },
  });
  const updateRoomMutation = api.storageRoom.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
        selectedRoomId ? utils.storageRoom.byId.invalidate({ id: selectedRoomId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteRoomMutation = api.storageRoom.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
      ]);
      setSelectedRoomId(null);
      setRoomForm(createEmptyRoomForm());
    },
  });

  const createLocationMutation = api.storageLocation.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.storageLocation.backendList.invalidate(), utils.storageLocation.list.invalidate()]);
      setLocationForm(createEmptyLocationForm());
      setCreateLocationOpen(false);
    },
  });
  const updateLocationMutation = api.storageLocation.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
        selectedLocationId ? utils.storageLocation.byId.invalidate({ id: selectedLocationId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteLocationMutation = api.storageLocation.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.storageLocation.backendList.invalidate(), utils.storageLocation.list.invalidate()]);
      setSelectedLocationId(null);
      setLocationForm(createEmptyLocationForm());
    },
  });

  const roomEditing = Boolean(selectedRoomId);
  const locationEditing = Boolean(selectedLocationId);
  const generatedLocationCode = toStorageLocationCode(locationForm.name.trim());

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Lagerraeume</h2>
            <p className="text-sm text-muted-foreground">Lagerraeume erstellen, bearbeiten und loeschen.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setRoomForm(createEmptyRoomForm());
              setCreateRoomOpen(true);
            }}
          >
            Neuer Lagerraum
          </Button>
        </div>

        <div className="mb-4">
          <label htmlFor="backend-room-search" className="mb-1 block text-xs text-muted-foreground">
            Suche nach Lagerraum
            <Input
              id="backend-room-search"
              value={roomSearchInput}
              onChange={(event) => setRoomSearchInput(event.target.value)}
              placeholder="z. B. Keller"
              className="mt-1 h-10 rounded-xl"
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <tr>
                <TableHead>Name</TableHead>
                <TableHead>Lagerplaetze</TableHead>
                <TableHead>Aktion</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {roomItems.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium text-foreground">{room.name}</TableCell>
                  <TableCell className="text-muted-foreground">{room._count.storageLocations}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setRoomForm({ name: room.name });
                      }}
                    >
                      Bearbeiten
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!roomsQuery.isLoading && !roomsQuery.error && roomItems.length === 0 ? (
                <tr>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Keine Lagerraeume gefunden.
                  </TableCell>
                </tr>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {roomsQuery.hasNextPage ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => void roomsQuery.fetchNextPage()}
              disabled={roomsQuery.isFetchingNextPage}
            >
              {roomsQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
            </Button>
          </div>
        ) : null}

        <Dialog
          open={createRoomOpen}
          onClose={() => setCreateRoomOpen(false)}
          title="Neuer Lagerraum"
          description="Name fuer den neuen Lagerraum eingeben."
        >
          <label className="text-xs text-muted-foreground">
            Name
            <Input
              value={roomForm.name}
              onChange={(event) => setRoomForm({ name: event.target.value })}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => createRoomMutation.mutate({ name: roomForm.name.trim() })}
              disabled={!roomForm.name.trim() || createRoomMutation.isPending}
            >
              {createRoomMutation.isPending ? "Erstellt..." : "Lagerraum erstellen"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateRoomOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </Dialog>

        {roomEditing ? (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">
              Lagerraum bearbeiten
            </h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedRoomId(null);
                setRoomForm(createEmptyRoomForm());
              }}
            >
              Auswahl aufheben
            </Button>
          </div>

          <label className="text-xs text-muted-foreground">
            Name
            <Input
              value={roomForm.name}
              onChange={(event) => setRoomForm({ name: event.target.value })}
              className="mt-1 h-10 rounded-xl"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() =>
                selectedRoomId &&
                updateRoomMutation.mutate({
                  id: selectedRoomId,
                  name: roomForm.name.trim(),
                })
              }
              disabled={!roomForm.name.trim() || updateRoomMutation.isPending}
            >
              {updateRoomMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => selectedRoomId && deleteRoomMutation.mutate({ id: selectedRoomId })}
              disabled={deleteRoomMutation.isPending}
            >
              {deleteRoomMutation.isPending ? "Loescht..." : "Lagerraum loeschen"}
            </Button>
          </div>
        </div>
        ) : null}
      </Card>

      <Card className="rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Lagerplaetze</h2>
            <p className="text-sm text-muted-foreground">Lagerplaetze verwalten und Lagerraeumen zuordnen.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setLocationForm(createEmptyLocationForm());
              setCreateLocationOpen(true);
            }}
          >
            Neuer Lagerplatz
          </Button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_260px]">
          <label htmlFor="backend-location-search" className="mb-1 block text-xs text-muted-foreground">
            Suche nach Code, Name oder Lagerraum
            <Input
              id="backend-location-search"
              value={locationSearchInput}
              onChange={(event) => setLocationSearchInput(event.target.value)}
              placeholder="z. B. C390 oder Keller"
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="mb-1 block text-xs text-muted-foreground">
            Lagerraum
            <select
              value={locationRoomFilter}
              onChange={(event) => setLocationRoomFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">Alle Lagerraeume</option>
              {roomItems.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <tr>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Lagerraum</TableHead>
                <TableHead>Produkte</TableHead>
                <TableHead>Aktion</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {locationItems.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className="font-medium text-foreground">{location.code}</TableCell>
                  <TableCell className="text-muted-foreground">{location.name}</TableCell>
                  <TableCell className="text-muted-foreground">{location.storageRoom.name}</TableCell>
                  <TableCell className="text-muted-foreground">{location._count.products}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLocationId(location.id);
                        setLocationForm({
                          name: location.name,
                          storageRoomId: location.storageRoomId,
                          description: location.description ?? "",
                        });
                      }}
                    >
                      Bearbeiten
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!locationsQuery.isLoading && !locationsQuery.error && locationItems.length === 0 ? (
                <tr>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Keine Lagerplaetze gefunden.
                  </TableCell>
                </tr>
              ) : null}
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

        <Dialog
          open={createLocationOpen}
          onClose={() => setCreateLocationOpen(false)}
          title="Neuer Lagerplatz"
          description="Name und Lagerraum eingeben. Der Code wird automatisch aus dem Namen erzeugt."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Name
              <Input
                value={locationForm.name}
                onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 h-10 rounded-xl"
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
                <option value="">Bitte waehlen</option>
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
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              onClick={() =>
                createLocationMutation.mutate({
                  code: generatedLocationCode,
                  name: locationForm.name.trim(),
                  storageRoomId: locationForm.storageRoomId,
                  description: locationForm.description.trim() ? locationForm.description.trim() : null,
                })
              }
              disabled={
                !generatedLocationCode ||
                !locationForm.name.trim() ||
                !locationForm.storageRoomId ||
                createLocationMutation.isPending
              }
            >
              {createLocationMutation.isPending ? "Erstellt..." : "Lagerplatz erstellen"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateLocationOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </Dialog>

        {locationEditing ? (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">
              Lagerplatz bearbeiten
            </h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedLocationId(null);
                setLocationForm(createEmptyLocationForm());
              }}
            >
              Auswahl aufheben
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Name
              <Input
                value={locationForm.name}
                onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 h-10 rounded-xl"
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
                <option value="">Bitte waehlen</option>
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
                selectedLocationId &&
                updateLocationMutation.mutate({
                  id: selectedLocationId,
                  code: generatedLocationCode,
                  name: locationForm.name.trim(),
                  storageRoomId: locationForm.storageRoomId,
                  description: locationForm.description.trim() ? locationForm.description.trim() : null,
                })
              }
              disabled={
                !generatedLocationCode ||
                !locationForm.name.trim() ||
                !locationForm.storageRoomId ||
                updateLocationMutation.isPending
              }
            >
              {updateLocationMutation.isPending ? "Speichert..." : "Aenderungen speichern"}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => selectedLocationId && deleteLocationMutation.mutate({ id: selectedLocationId })}
              disabled={deleteLocationMutation.isPending}
            >
              {deleteLocationMutation.isPending ? "Loescht..." : "Lagerplatz loeschen"}
            </Button>
          </div>
        </div>
        ) : null}
      </Card>
    </div>
  );
}
