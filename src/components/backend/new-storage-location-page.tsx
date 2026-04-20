"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";

type StorageLocationForm = {
  name: string;
  storageRoomId: string;
  description: string;
};

function toStorageLocationCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewStorageLocationPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [form, setForm] = useState<StorageLocationForm>({ name: "", storageRoomId: "", description: "" });

  const roomsQuery = api.storageRoom.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
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

  const generatedCode = toStorageLocationCode(form.name.trim());
  const canSave = Boolean(generatedCode) && form.name.trim().length > 0 && Boolean(form.storageRoomId);

  const createLocationMutation = api.storageLocation.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.storageLocation.backendList.invalidate(), utils.storageLocation.list.invalidate()]);
      router.push("/backend/storage/locations");
    },
  });

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neuer Lagerplatz</h2>
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
          Code (automatisch)
          <Input value={generatedCode} readOnly className="mt-1 h-10 rounded-xl" />
        </label>
        <label className="text-xs text-muted-foreground">
          Lagerraum
          <select
            value={form.storageRoomId}
            onChange={(event) => setForm((prev) => ({ ...prev, storageRoomId: event.target.value }))}
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
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="mt-1 h-10 rounded-xl"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() =>
            createLocationMutation.mutate({
              code: generatedCode,
              name: form.name.trim(),
              storageRoomId: form.storageRoomId,
              description: form.description.trim() ? form.description.trim() : null,
            })
          }
          disabled={!canSave || createLocationMutation.isPending}
        >
          {createLocationMutation.isPending ? "Erstellt..." : "Lagerplatz erstellen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/backend/storage/locations")}>
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
      </div>
    </Card>
  );
}

