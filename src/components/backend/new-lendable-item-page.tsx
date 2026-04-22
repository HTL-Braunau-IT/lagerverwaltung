"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type FormState = {
  name: string;
  description: string;
  quantityOnHand: string;
  storageRoomId: string;
  isVisible: boolean;
  imageUrl: string;
  imageAltText: string;
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

export function NewLendableItemPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const toast = useToast();

  const roomsQuery = api.storageRoom.list.useQuery();
  const createMutation = api.lendableItem.backendCreate.useMutation({
    meta: { silent: true },
  });
  const updateMutation = api.lendableItem.backendUpdate.useMutation({
    meta: { silent: true },
  });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!createImageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(createImageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [createImageFile]);

  const canSave = useMemo(() => {
    const nameOk = form.name.trim().length > 0;
    const roomOk = form.storageRoomId.trim().length > 0;
    const qty = Number(form.quantityOnHand);
    const qtyOk = Number.isFinite(qty) && qty >= 0;
    return nameOk && roomOk && qtyOk && !uploadPending;
  }, [form.name, form.quantityOnHand, form.storageRoomId, uploadPending]);

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

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      quantityOnHand: Math.max(0, Math.floor(Number(form.quantityOnHand) || 0)),
      storageRoomId: form.storageRoomId,
      isVisible: form.isVisible,
      imageUrl: form.imageUrl.trim() || null,
      imageAltText: form.imageAltText.trim() || null,
    };

    if (!payload.name || !payload.storageRoomId) return;

    setUploadPending(true);
    try {
      const created = await createMutation.mutateAsync({
        ...payload,
        imageUrl: createImageFile ? null : payload.imageUrl,
      });

      if (createImageFile) {
        const uploadedUrl = await uploadImage(created.id, createImageFile);
        await updateMutation.mutateAsync({
          id: created.id,
          ...payload,
          imageUrl: uploadedUrl,
        });
      }

      await utils.lendableItem.backendList.invalidate();
      toast.success("Leihgerät erstellt.");
      router.push("/backend/lendable-items");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setUploadPending(false);
    }
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neues Leihgerät</h2>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            autoFocus
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Beschreibung
          <Input
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Bestand
          <Input
            type="number"
            min="0"
            step="1"
            value={form.quantityOnHand}
            onChange={(e) => setForm((prev) => ({ ...prev, quantityOnHand: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Lagerraum
          <select
            value={form.storageRoomId}
            onChange={(e) => setForm((prev) => ({ ...prev, storageRoomId: e.target.value }))}
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
            checked={form.isVisible}
            onChange={(e) => setForm((prev) => ({ ...prev, isVisible: e.target.checked }))}
          />
          Ausleihbar
        </label>
      </div>

      <div className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="space-y-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">Bild</p>
            <div className="mt-2 h-px w-full bg-slate-200/70" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col gap-3">
              <div>
                <p className="select-none text-xs text-slate-600">Bild hochladen (optional)</p>
                <label
                  htmlFor="new-lendable-item-image"
                  className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-lg border-2 border-dashed border-violet-400/70 bg-violet-50/90 p-3 text-sm ${
                    uploadPending ? "cursor-default opacity-90" : "cursor-pointer hover:bg-violet-100/90"
                  }`}
                >
                  <input
                    id="new-lendable-item-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={uploadPending}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setCreateImageFile(file);
                      event.target.value = "";
                    }}
                  />
                  <span
                    className={`inline-flex shrink-0 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                      uploadPending ? "opacity-70" : "group-hover:bg-violet-700"
                    }`}
                  >
                    Datei auswählen
                  </span>
                  <span
                    className={`min-w-0 flex-1 break-all text-left text-sm ${
                      createImageFile ? "font-medium text-slate-900" : "text-slate-500"
                    }`}
                    title={createImageFile?.name}
                    role="status"
                  >
                    {createImageFile?.name ?? "Keine Datei ausgewählt"}
                  </span>
                </label>
              </div>

              <label className="text-xs text-muted-foreground">
                Bild-URL (optional)
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  className="mt-1 h-10 rounded-xl"
                  placeholder="https://..."
                  disabled={uploadPending}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Bild-Alt-Text (optional)
                <Input
                  value={form.imageAltText}
                  onChange={(e) => setForm((prev) => ({ ...prev, imageAltText: e.target.value }))}
                  className="mt-1 h-10 rounded-xl"
                  disabled={uploadPending}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Hinweis: Wenn eine Datei ausgewählt ist, wird die URL beim Erstellen ignoriert und nach dem Upload gesetzt.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="select-none text-xs text-slate-600">Vorschau</p>
              <button
                type="button"
                onClick={() => {
                  if (imagePreviewUrl) {
                    window.open(imagePreviewUrl, "_blank", "noopener,noreferrer");
                    return;
                  }
                  const url = form.imageUrl.trim();
                  if (url) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
                className={`relative h-48 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${
                  imagePreviewUrl || form.imageUrl.trim()
                    ? "cursor-pointer ring-offset-2 transition hover:ring-2 hover:ring-violet-400/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                    : "cursor-default opacity-90"
                }`}
                aria-label={
                  imagePreviewUrl || form.imageUrl.trim()
                    ? "Bild in neuem Tab oeffnen"
                    : "Vorschau (noch kein Bild gewaehlt)"
                }
                disabled={!imagePreviewUrl && !form.imageUrl.trim()}
              >
                <img
                  src={imagePreviewUrl ?? form.imageUrl.trim() ?? "/pictures/placeholder.jpg"}
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
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSubmit} disabled={!canSave || createMutation.isPending || uploadPending}>
          {createMutation.isPending ? "Erstellt..." : uploadPending ? "Lade Bild hoch..." : "Leihgerät erstellen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/backend/lendable-items")} disabled={uploadPending}>
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
      </div>
    </Card>
  );
}

