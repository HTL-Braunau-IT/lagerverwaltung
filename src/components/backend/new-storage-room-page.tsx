"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";

type StorageRoomForm = {
  name: string;
};

export function NewStorageRoomPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const [form, setForm] = useState<StorageRoomForm>({ name: "" });
  const canSave = form.name.trim().length > 0;

  const createRoomMutation = api.storageRoom.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
      ]);
      router.push("/backend/storage/rooms");
    },
  });

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neuer Lagerraum</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name
          <Input
            value={form.name}
            onChange={(event) => setForm({ name: event.target.value })}
            className="mt-1 h-10 rounded-xl"
            autoFocus
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => createRoomMutation.mutate({ name: form.name.trim() })}
          disabled={!canSave || createRoomMutation.isPending}
        >
          {createRoomMutation.isPending ? "Erstellt..." : "Lagerraum erstellen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/backend/storage/rooms")}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}

