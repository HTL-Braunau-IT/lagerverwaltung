"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
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
      <div className="mb-3 mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neuer Lagerplatz</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm text-muted-foreground">
          Name
          <span className="text-destructive pl-1">*</span>
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            variant="title"
            className="mt-1"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Code (automatisch)
          <Input
            value={generatedCode}
            disabled
            variant="subtitle"
            className="mt-1" />
        </label>
        <label className="text-sm text-muted-foreground">
          Beschreibung (optional)
          <Input
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            variant="default"
            className="mt-1 h-11"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Lagerraum
          <span className="text-destructive pl-1">*</span>
          <Select
            value={form.storageRoomId}
            onValueChange={(nextRoomId) => setForm((prev) => ({ ...prev, storageRoomId: nextRoomId }))}
            options={[
              { value: "", label: "Bitte wählen" },
              ...roomItems.map((room) => ({ value: room.id, label: room.name })),
            ]}
            className="mt-1 h-11 w-full px-2.5 py-2 text-sm text-slate-900"
          />
        </label>
      </div>

      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="glass"
          className="!w-36"
          onClick={() => router.push("/backend/storage/locations")}>
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
        <Button
          type="button"
          variant="solid"
          className="!w-48"
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


      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">


      </div>
    </Card>
  );
}

