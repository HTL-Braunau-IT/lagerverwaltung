"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card as ShellCard } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import { useToast } from "~/components/ui/toast";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";
import { Card } from "../ui/detail-card";

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
    <ShellCard className="rounded-2xl bg-transparent">
      <div className="mb-3 mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neues Leihgerät</h2>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-muted-foreground">
          Name
          <span className="text-destructive pl-1">*</span>
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            variant="title"
            className="mt-1"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Beschreibung
          <Input
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            variant="subtitle"
            className="mt-1"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 items-end">
        <label className="text-sm text-muted-foreground">
          Bestand
          <Input
            type="number"
            min="0"
            step="1"
            value={form.quantityOnHand}
            onChange={(e) => setForm((prev) => ({ ...prev, quantityOnHand: e.target.value }))}
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
            disabled={uploadPending}
            options={[
              { value: "", label: "Lagerraum wählen" },
              ...(roomsQuery.data ?? []).map((room) => ({ value: room.id, label: room.name })),
            ]}
            className="mt-1 h-11 w-full px-2.5 py-2 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, isVisible: !prev.isVisible }))}
          className={`mt-1 flex h-11 w-full items-center justify-between gap-3 rounded-sm border-2 bg-card/40 px-3 py-2 text-left transition ${
            form.isVisible ? "border-emerald-500/60" : "border-red-500/60"
          }`}
          aria-label="Ausleihbar umschalten"
          aria-pressed={form.isVisible}
          disabled={uploadPending}
        >
          <span className="text-sm text-slate-900">Ausleihbar</span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              form.isVisible ? "bg-emerald-500/60" : "bg-red-500/60"
            }`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                form.isVisible ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>

      <Card variant="detail" className="mt-4 !bg-card/40 !hover:bg-card/40">
        <div className="space-y-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">Bilder & Dokumente</p>
            <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:items-start md:gap-8">
            <div className="flex flex-col gap-3">
              <div>
                <p className="select-none text-sm text-slate-600">Bild hochladen (optional)</p>
                <label
                  htmlFor="new-lendable-item-image"
                  className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-lg border-2 border-dashed border-violet-400/70 bg-card/40 p-3 text-sm ${
                    uploadPending ? "cursor-default opacity-90" : "cursor-pointer hover:bg-violet-100"
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
                <p className="mt-2 text-xs text-muted-foreground">Unterstützt PNG, JPEG, WebP und GIF, Max 8MB.</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="glass"
          className="!w-36"
          onClick={() => router.push("/backend/lendable-items")} disabled={uploadPending}
          >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
        <Button
          type="button"
          variant="solid"
          className="!w-48"
          onClick={handleSubmit}
          disabled={!canSave || createMutation.isPending || uploadPending}>
          {createMutation.isPending ? "Erstellt..." : uploadPending ? "Lade Bild hoch..." : "Leihgerät erstellen"}
        </Button>

      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">


      </div>
    </ShellCard>
  );
}

