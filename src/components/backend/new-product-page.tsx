"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";

const unitKinds = [
  { value: "PIECE", label: "Stück" },
  { value: "LENGTH", label: "Länge" },
  { value: "AREA", label: "Fläche" },
  { value: "WEIGHT", label: "Gewicht" },
  { value: "VOLUME", label: "Volumen" },
] as const;

const baseUnits = [
  { value: "PCS", label: "Stk" },
  { value: "MM", label: "mm" },
  { value: "CM", label: "cm" },
  { value: "M", label: "m" },
  { value: "CM2", label: "cm2" },
  { value: "M2", label: "m2" },
  { value: "G", label: "g" },
  { value: "KG", label: "kg" },
  { value: "ML", label: "ml" },
  { value: "L", label: "l" },
] as const;

type ProductCreateFormState = {
  name: string;
  sku: string;
  description: string;
  price: string;
  minimumQuantity: string;
  startingQuantity: string;
  unitKind: (typeof unitKinds)[number]["value"];
  baseUnit: (typeof baseUnits)[number]["value"];
  unitStep: string;
  isVisible: boolean;
  categoryIds: string[];
  storageRoomId: string;
  storageLocationId: string;
  imageUrl: string;
  imageAltText: string;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const moneyFormatDeAt = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoneyDeAt(value: number): string {
  if (!Number.isFinite(value)) return moneyFormatDeAt.format(0);
  return moneyFormatDeAt.format(value);
}

function parseMoneyInput(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (s.includes(",")) return Number(s.replace(",", "."));
  return Number(s);
}

function createEmptyForm(): ProductCreateFormState {
  return {
    name: "",
    sku: "",
    description: "",
    price: formatMoneyDeAt(0),
    minimumQuantity: "0",
    startingQuantity: "0",
    unitKind: "PIECE",
    baseUnit: "PCS",
    unitStep: "1",
    isVisible: true,
    categoryIds: [],
    storageRoomId: "",
    storageLocationId: "",
    imageUrl: "",
    imageAltText: "",
  };
}

export function NewProductPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const toast = useToast();

  const categoriesQuery = api.category.list.useQuery();
  const storageRoomsQuery = api.storageRoom.list.useQuery();
  const storageLocationsQuery = api.storageLocation.list.useQuery();

  const [form, setForm] = useState<ProductCreateFormState>(createEmptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);

  const storageLocationsById = useMemo(
    () => new Map((storageLocationsQuery.data ?? []).map((loc) => [loc.id, loc])),
    [storageLocationsQuery.data],
  );

  const selectedRoomId =
    form.storageRoomId || storageLocationsById.get(form.storageLocationId)?.storageRoomId || "";

  const filteredLocations = useMemo(() => {
    const all = storageLocationsQuery.data ?? [];
    return selectedRoomId ? all.filter((loc) => loc.storageRoomId === selectedRoomId) : all;
  }, [selectedRoomId, storageLocationsQuery.data]);

  const canCreate = useMemo(() => {
    const price = parseMoneyInput(form.price);
    return (
      form.name.trim().length > 0 &&
      form.sku.trim().length > 0 &&
      Number.isFinite(price) &&
      price >= 0 &&
      Number.isFinite(Number(form.minimumQuantity)) &&
      Number(form.minimumQuantity) >= 0 &&
      Number.isFinite(Number(form.startingQuantity)) &&
      Number(form.startingQuantity) >= 0 &&
      Number.isFinite(Number(form.unitStep)) &&
      Number(form.unitStep) > 0 &&
      !uploadPending
    );
  }, [form, uploadPending]);

  const uploadProductImage = async (sku: string, file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswaehlen.");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Das Bild ist zu gross. Maximal 8 MB erlaubt.");
    const body = new FormData();
    body.append("sku", sku);
    body.append("file", file);
    const response = await fetch("/api/backend/products/upload-image", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    if (!response.ok || !result?.url) throw new Error(result?.message ?? "Bild konnte nicht hochgeladen werden.");
    return result.url;
  };

  const createMutation = api.product.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.product.backendList.invalidate(), utils.product.list.invalidate()]);
      toast.success("Produkt erstellt.");
      router.push("/backend/products");
    },
  });

  const handleSubmit = async () => {
    if (!canCreate) return;
    setUploadPending(true);
    try {
      let imageUrl = form.imageUrl.trim() || null;
      if (imageFile) imageUrl = await uploadProductImage(form.sku.trim(), imageFile);

      createMutation.mutate({
        name: form.name.trim(),
        sku: form.sku.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        price: parseMoneyInput(form.price),
        minimumQuantity: Number(form.minimumQuantity),
        startingQuantity: Number(form.startingQuantity),
        unitKind: form.unitKind,
        baseUnit: form.baseUnit,
        unitStep: Number(form.unitStep),
        isVisible: form.isVisible,
        categoryIds: form.categoryIds,
        storageLocationId: form.storageLocationId || null,
        imageUrl,
        imageAltText: form.imageAltText.trim() ? form.imageAltText.trim() : null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
      setUploadPending(false);
      return;
    } finally {
      setUploadPending(false);
    }
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neues Produkt</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name
          <Input
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            autoFocus
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          SKU
          <Input
            value={form.sku}
            onChange={(e) => setForm((c) => ({ ...c, sku: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">
          Beschreibung
          <textarea
            value={form.description}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            rows={3}
            disabled={uploadPending}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Preis
          <Input
            type="text"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Mindestbestand
          <Input
            type="number"
            min={0}
            step={0.001}
            value={form.minimumQuantity}
            onChange={(e) => setForm((c) => ({ ...c, minimumQuantity: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Startbestand
          <Input
            type="number"
            min={0}
            step={0.001}
            value={form.startingQuantity}
            onChange={(e) => setForm((c) => ({ ...c, startingQuantity: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Schrittweite
          <Input
            type="number"
            min={0.001}
            step={0.001}
            value={form.unitStep}
            onChange={(e) => setForm((c) => ({ ...c, unitStep: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Einheitstyp
          <select
            value={form.unitKind}
            onChange={(e) => setForm((c) => ({ ...c, unitKind: e.target.value as ProductCreateFormState["unitKind"] }))}
            disabled={uploadPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
          >
            {unitKinds.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground text-center">
          Basiseinheit
          <select
            value={form.baseUnit}
            onChange={(e) => setForm((c) => ({ ...c, baseUnit: e.target.value as ProductCreateFormState["baseUnit"] }))}
            disabled={uploadPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none text-center"
          >
            {baseUnits.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground md:row-span-2">
          Kategorien
          <div className="mt-1 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-input bg-background px-3 py-2">
            {(categoriesQuery.data ?? []).map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.categoryIds.includes(category.id)}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      categoryIds: e.target.checked ? [...c.categoryIds, category.id] : c.categoryIds.filter((id) => id !== category.id),
                    }))
                  }
                  className="h-4 w-4 rounded border-input"
                  disabled={uploadPending}
                />
                <span>{category.name}</span>
              </label>
            ))}
            {(categoriesQuery.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">Keine Kategorien vorhanden.</p>
            ) : null}
          </div>
        </label>
        <label className="text-xs text-muted-foreground">
          Raum
          <select
            value={selectedRoomId}
            onChange={(e) =>
              setForm((c) => ({
                ...c,
                storageRoomId: e.target.value,
                storageLocationId: "",
              }))
            }
            disabled={uploadPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="">Kein Lagerraum</option>
            {(storageRoomsQuery.data ?? []).map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Platz
          <select
            value={form.storageLocationId}
            onChange={(e) =>
              setForm((c) => {
                const selected = storageLocationsById.get(e.target.value);
                return {
                  ...c,
                  storageRoomId: selected?.storageRoomId ?? c.storageRoomId,
                  storageLocationId: e.target.value,
                };
              })
            }
            disabled={uploadPending || !selectedRoomId}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="">{selectedRoomId ? "Kein Lagerplatz" : "Bitte zuerst Lagerraum waehlen"}</option>
            {filteredLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code} - {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">
          Bild hochladen (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            disabled={uploadPending}
            className="mt-2 block w-full cursor-pointer rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 p-3 text-sm font-medium text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:bg-primary/10"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {imageFile ? `Ausgewaehlt: ${imageFile.name}` : "Noch keine Datei ausgewaehlt."}
          </span>
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">
          Bild-Alt-Text (optional)
          <Input
            value={form.imageAltText}
            onChange={(e) => setForm((c) => ({ ...c, imageAltText: e.target.value }))}
            className="mt-1 h-10 rounded-xl"
            disabled={uploadPending}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSubmit} disabled={!canCreate || createMutation.isPending || uploadPending}>
          {createMutation.isPending || uploadPending ? "Erstellt..." : "Produkt erstellen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/backend/products")} disabled={uploadPending}>
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
      </div>
    </Card>
  );
}

