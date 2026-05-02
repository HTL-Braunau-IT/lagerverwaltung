"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";
import { Button } from "~/components/ui/button";
import { Card as ShellCard } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { NumberStepper } from "~/components/ui/number-stepper";
import { Select } from "~/components/ui/select";
import { useToast } from "~/components/ui/toast";
import { getQuantityStepForBaseUnit, isQuantityAlignedToStep } from "~/lib/quantity-rules";
import { Card, DetailText } from "../ui/detail-card";

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
  { value: "MM2", label: "mm2" },
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
  const [categorySearch, setCategorySearch] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);

  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category])),
    [categoriesQuery.data],
  );

  const filteredCategories = useMemo(() => {
    const all = categoriesQuery.data ?? [];
    const q = categorySearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((category) => category.name.toLowerCase().includes(q));
  }, [categoriesQuery.data, categorySearch]);

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

  const quantityStep = useMemo(() => getQuantityStepForBaseUnit(form.baseUnit), [form.baseUnit]);

  const canCreate = useMemo(() => {
    const price = parseMoneyInput(form.price);
    return (
      form.name.trim().length > 0 &&
      form.sku.trim().length > 0 &&
      Number.isFinite(price) &&
      price >= 0 &&
      Number.isFinite(Number(form.minimumQuantity)) &&
      Number(form.minimumQuantity) >= 0 &&
      isQuantityAlignedToStep(Number(form.minimumQuantity), quantityStep) &&
      Number.isFinite(Number(form.startingQuantity)) &&
      Number(form.startingQuantity) >= 0 &&
      isQuantityAlignedToStep(Number(form.startingQuantity), quantityStep) &&
      Number.isFinite(Number(form.unitStep)) &&
      Number(form.unitStep) === quantityStep &&
      !uploadPending
    );
  }, [form, quantityStep, uploadPending]);

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
    <ShellCard className="bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neues Produkt</h2>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] md:items-stretch md:gap-4">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <div className="space-y-3 rounded-lg">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-x-4">
                <label className="block text-sm text-slate-600 md:col-span-2">
                  Name
                  <span className="text-destructive pl-1">*</span>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                    autoFocus
                    disabled={uploadPending}
                    variant="title"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  SKU
                  <span className="text-destructive pl-1">*</span>
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm((c) => ({ ...c, sku: e.target.value }))}
                    disabled={uploadPending}
                    variant="subtitle"
                  />
                </label>
                <label className="block text-sm text-slate-600 md:col-span-3">
                  Beschreibung
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                    rows={3}
                    disabled={uploadPending}
                    className="mt-1 w-full rounded-md bg-card/40 px-2.5 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-4">
              <Card variant="product" className="space-y-3 rounded-sm !bg-card/40 !hover:bg-card/40">
                <div>
                  <DetailText variant="title">Lager</DetailText>
                  <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                </div>
                <label className="block text-sm text-slate-600">
                  Raum
                  <Select
                    value={selectedRoomId}
                    onValueChange={(nextRoomId) =>
                      setForm((c) => ({
                        ...c,
                        storageRoomId: nextRoomId,
                        storageLocationId: "",
                      }))
                    }
                    disabled={uploadPending}
                    options={[
                      { value: "", label: "Kein Lagerraum" },
                      ...(storageRoomsQuery.data ?? []).map((room) => ({ value: room.id, label: room.name })),
                    ]}
                    className="mt-1 w-full px-2.5 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Platz
                  <Select
                    value={form.storageLocationId}
                    onValueChange={(nextLocationId) =>
                      setForm((c) => {
                        const selected = storageLocationsById.get(nextLocationId);
                        return {
                          ...c,
                          storageRoomId: selected?.storageRoomId ?? c.storageRoomId,
                          storageLocationId: nextLocationId,
                        };
                      })
                    }
                    disabled={uploadPending || !selectedRoomId}
                    options={[
                      {
                        value: "",
                        label: selectedRoomId ? "Kein Lagerplatz" : "Bitte zuerst Lagerraum waehlen",
                        disabled: !selectedRoomId,
                      },
                      ...filteredLocations.map((loc) => ({
                        value: loc.id,
                        label: `${loc.code} - ${loc.name}`,
                      })),
                    ]}
                    className="mt-1 w-full rounded-sm px-2.5 py-2 text-sm text-slate-900"
                  />
                </label>
              </Card>

              <Card variant="product" className="space-y-3 !bg-card/40 !hover:bg-card/40">
                <div>
                  <DetailText variant="title">Mengen & Einheiten</DetailText>
                  <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-sm text-slate-600 text-center sm:pr-3">
                    Startbestand
                    <div className="mt-1 flex justify-center">
                      <NumberStepper
                        value={form.startingQuantity}
                        min={0}
                        step={quantityStep}
                        onChange={(value) => setForm((c) => ({ ...c, startingQuantity: value }))}
                        decreaseAriaLabel="Startbestand verringern"
                        increaseAriaLabel="Startbestand erhoehen"
                        inputAriaLabel="Startbestand"
                        className={uploadPending ? "pointer-events-none opacity-80" : ""}
                      />
                    </div>
                  </label>
                  <label className="block text-sm text-slate-600 text-center sm:pl-3">
                    Minimum
                    <div className="mt-1 flex justify-center">
                      <NumberStepper
                        value={form.minimumQuantity}
                        min={0}
                        step={quantityStep}
                        onChange={(value) => setForm((c) => ({ ...c, minimumQuantity: value }))}
                        decreaseAriaLabel="Minimum verringern"
                        increaseAriaLabel="Minimum erhoehen"
                        inputAriaLabel="Minimum"
                        className={uploadPending ? "pointer-events-none opacity-80" : ""}
                      />
                    </div>
                  </label>
                  <label className="block text-sm text-slate-600 text-center sm:pl-3">
                    Schritte
                    <div className="mt-1 flex justify-center">
                      <NumberStepper
                        value={form.unitStep}
                        min={quantityStep}
                        step={quantityStep}
                        onChange={(value) => setForm((c) => ({ ...c, unitStep: value }))}
                        decreaseAriaLabel="Schritte verringern"
                        increaseAriaLabel="Schritte erhoehen"
                        inputAriaLabel="Schritte"
                        className={uploadPending ? "pointer-events-none opacity-80" : ""}
                      />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-600 text-center sm:pr-3">
                    Einheitstyp
                    <Select
                      value={form.unitKind}
                      onValueChange={(nextUnitKind) =>
                        setForm((c) => ({ ...c, unitKind: nextUnitKind as ProductCreateFormState["unitKind"] }))
                      }
                      disabled={uploadPending}
                      options={unitKinds.map((u) => ({ value: u.value, label: u.label }))}
                      className="mt-1 w-full rounded-sm bg-card/40 px-2.5 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-sm text-slate-600 text-center sm:pl-3">
                    Basiseinheit
                    <Select
                      value={form.baseUnit}
                      onValueChange={(nextBaseUnit) =>
                        setForm((c) => {
                          const baseUnit = nextBaseUnit as ProductCreateFormState["baseUnit"];
                          const nextStep = getQuantityStepForBaseUnit(baseUnit);
                          return { ...c, baseUnit, unitStep: String(nextStep) };
                        })
                      }
                      disabled={uploadPending}
                      options={baseUnits.map((u) => ({ value: u.value, label: u.label }))}
                      className="mt-1 w-full rounded-sm bg-card/40 px-2.5 py-2 text-sm text-slate-900"
                    />
                  </label>
                </div>
              </Card>

              <Card variant="product" className="space-y-3 !bg-card/40 !hover:bg-card/40">
                <div>
                  <DetailText variant="title">Sichtbarkeit & Preis</DetailText>
                  <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                </div>

                <button
                  type="button"
                  onClick={() => setForm((c) => ({ ...c, isVisible: !c.isVisible }))}
                  className={`flex w-full items-center justify-between gap-3 rounded-sm border-2 bg-card/40 mt-1 px-3 py-2 text-left transition ${
                    form.isVisible ? "border-emerald-500/60" : "border-red-500/60"
                  }`}
                  aria-label="Produktsichtbarkeit umschalten"
                  aria-pressed={form.isVisible}
                  disabled={uploadPending}
                >
                  <span className="text-sm text-slate-900">Sichtbar in Shopfront</span>
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

                <label className="block text-sm text-slate-600 text-center mt-2">
                  Verkaufspreis
                  <div className="mt-1 flex w-full">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))}
                      disabled={uploadPending}
                      className="!h-9 !rounded-l-sm !rounded-r-none !bg-transparent pl-4 py-2 text-sm text-slate-900 text-center"
                    />
                    <span className="inline-flex items-center rounded-r-sm bg-card/80 px-2.5 text-sm text-slate-700">
                      €
                    </span>
                  </div>
                </label>
              </Card>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden md:self-stretch">
            <Card variant="product" className="flex min-h-0 flex-1 flex-col gap-3 md:min-h-0 md:overflow-hidden !bg-card/40 !hover:bg-card/40">
              <div className="shrink-0 space-y-3">
                <DetailText variant="title">Kategorien</DetailText>
                <div className="h-px w-full bg-slate-300/70" aria-hidden="true" />
                {form.categoryIds.length > 0 ? (
                  <div className="max-h-20 flex flex-wrap gap-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                    {form.categoryIds.map((categoryId) => {
                      const assigned = categoriesById.get(categoryId);
                      if (!assigned) return null;
                      return (
                        <Button
                          key={categoryId}
                          variant="category-pill"
                          size="sm"
                          onClick={() =>
                            setForm((c) => ({
                              ...c,
                              categoryIds: c.categoryIds.filter((id) => id !== categoryId),
                            }))
                          }
                          className="max-w-full cursor-pointer gap-1.5"
                          aria-label={`Kategorie ${assigned.name} entfernen`}
                          disabled={uploadPending}
                        >
                          <span className="truncate font-medium">
                            {assigned.name}
                            <span className="text-destructive"> X</span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
                <Input
                  type="search"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder="Kategorien suchen..."
                  className="h-9 rounded-md text-sm"
                  aria-label="Kategorien filtern"
                  disabled={uploadPending}
                />
              </div>

              <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-sm bg-card/40">
                <div
                  className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-gutter:stable]"
                  role="group"
                  aria-label="Kategorien auswählen"
                >
                  <div className="flex flex-col gap-2">
                    {filteredCategories.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-900 hover:bg-card/80"
                      >
                        <input
                          type="checkbox"
                          checked={form.categoryIds.includes(category.id)}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              categoryIds: e.target.checked
                                ? [...c.categoryIds, category.id]
                                : c.categoryIds.filter((id) => id !== category.id),
                            }))
                          }
                          className="h-4 w-4 shrink-0"
                          disabled={uploadPending}
                        />
                        <span>{category.name}</span>
                      </label>
                    ))}
                    {(categoriesQuery.data?.length ?? 0) === 0 ? (
                      <p className="text-xs text-slate-500">Keine Kategorien vorhanden.</p>
                    ) : filteredCategories.length === 0 ? (
                      <p className="text-xs text-slate-500">Keine Treffer.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card variant="product" className="min-w-0 !bg-card/40 !hover:bg-card/40">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <DetailText variant="title">Bilder & Dokumente</DetailText>
            </div>
            <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
          </div>

          <div className="space-y-3 pt-3">
            <div>
              <p className="select-none text-sm text-slate-600">Bild hochladen</p>
              <label
                className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-violet-400/70 bg-card/40 p-3 text-sm ${
                  uploadPending ? "cursor-default opacity-90" : "cursor-pointer hover:bg-violet-100"
                }`}
                aria-busy={uploadPending ? true : undefined}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadPending}
                  className="sr-only"
                  onChange={(e) => {
                    setImageFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <span
                  className={`inline-flex shrink-0 rounded-sm bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                    uploadPending ? "opacity-70" : "group-hover:bg-violet-700"
                  }`}
                >
                  Datei auswählen
                </span>
                <span
                  className={`min-w-0 flex-1 break-all text-left text-sm ${
                    uploadPending
                      ? "text-muted-foreground"
                      : imageFile
                        ? "font-medium text-slate-900"
                        : "text-slate-500"
                  }`}
                  title={uploadPending ? undefined : imageFile ? imageFile.name : undefined}
                  role="status"
                >
                  {uploadPending ? "Bild wird hochgeladen..." : (imageFile?.name ?? "Keine Datei ausgewählt")}
                </span>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">Unterstützt PNG, JPEG, WebP und GIF, Max 8MB.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="glass"
          onClick={() => router.push("/backend/products")}
          disabled={uploadPending}
          className="!w-36"
          >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canCreate || createMutation.isPending || uploadPending}
          variant="solid" 
          className="!w-36 justify-end-self"
          >          
          {createMutation.isPending || uploadPending ? "Erstellt..." : "Produkt erstellen"}
        </Button>
      </div>
    </ShellCard>
  );
}

