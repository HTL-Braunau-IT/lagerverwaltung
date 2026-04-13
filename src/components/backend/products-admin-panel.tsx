"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

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

type ProductFormState = {
  name: string;
  sku: string;
  description: string;
  price: string;
  minimumQuantity: string;
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

type ProductCreateFormState = ProductFormState & {
  startingQuantity: string;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BYTES = 12 * 1024 * 1024;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function isNearMinimumStock(quantityOnHand: unknown, minimumQuantity: unknown): boolean {
  const minimum = toNumber(minimumQuantity);
  if (minimum <= 0) return false;
  const quantity = toNumber(quantityOnHand);
  return quantity <= minimum * 1.1;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Resolves a stored image path or absolute URL for opening in a new browser tab. */
function resolveImageTabUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith("blob:")) return t;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (typeof window === "undefined") return t;
  try {
    return new URL(t, window.location.origin).href;
  } catch {
    return null;
  }
}

function createInitialForm(product: {
  name: string;
  sku: string;
  description: string | null;
  price: unknown;
  minimumQuantity: unknown;
  unitKind: ProductFormState["unitKind"];
  baseUnit: ProductFormState["baseUnit"];
  unitStep: unknown;
  isVisible: boolean;
  categoryId: string | null;
  categories: Array<{
    categoryId: string;
  }>;
  storageLocationId: string | null;
  storageLocation: {
    storageRoomId: string;
  } | null;
  images: Array<{
    url: string;
    altText: string | null;
  }>;
}): ProductFormState {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? "",
    price: String(toNumber(product.price)),
    minimumQuantity: String(toNumber(product.minimumQuantity)),
    unitKind: product.unitKind,
    baseUnit: product.baseUnit,
    unitStep: String(toNumber(product.unitStep)),
    isVisible: product.isVisible,
    categoryIds: Array.from(
      new Set([
        ...product.categories.map((entry) => entry.categoryId),
        ...(product.categoryId ? [product.categoryId] : []),
      ]),
    ),
    storageRoomId: product.storageLocation?.storageRoomId ?? "",
    storageLocationId: product.storageLocationId ?? "",
    imageUrl: "",
    imageAltText: "",
  };
}

function createEmptyCreateForm(): ProductCreateFormState {
  return {
    name: "",
    sku: "",
    description: "",
    price: "0",
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

function BookingHistory({ productId }: { productId: string }) {
  const bookingsQuery = api.product.backendStockBookings.useQuery({ productId, limit: 10 });

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Letzte Buchungen
      </p>
      {bookingsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Verlauf wird geladen...</p> : null}
      {bookingsQuery.error ? (
        <p className="mt-2 text-sm text-rose-700">Verlauf konnte nicht geladen werden.</p>
      ) : null}
      {!bookingsQuery.isLoading &&
      !bookingsQuery.error &&
      (bookingsQuery.data?.bookings?.length ?? 0) === 0 &&
      (bookingsQuery.data?.completedOrders?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Noch keine Buchungen oder fertigen Auftraege vorhanden.</p>
      ) : null}
      <div className="mt-2 overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto py-1 !px-2 text-[11px] leading-tight">Menge</TableHead>
              <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight">Lieferant</TableHead>
              <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight">Von</TableHead>
              <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight">Datum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[11px] leading-tight">
            {!bookingsQuery.isLoading &&
            !bookingsQuery.error &&
            (bookingsQuery.data?.bookings?.length ?? 0) === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="bg-white py-1 px-2 text-xs text-muted-foreground">
                  Keine Buchungen vorhanden.
                </TableCell>
              </TableRow>
            ) : null}
            {(bookingsQuery.data?.bookings ?? []).map((booking) => (
              <Fragment key={booking.id}>
                <TableRow className="bg-muted/30 hover:bg-muted/40">
                  <TableCell className="text-[11px] font-medium !py-1 !px-2">{toNumber(booking.quantityDelta)}</TableCell>
                  <TableCell className="text-[11px] !py-0 !px-0">{booking.supplier}</TableCell>
                  <TableCell className="text-[11px] !py-0 !px-0">{booking.user.name ?? booking.user.email ?? "Unbekannt"}</TableCell>
                  <TableCell className="whitespace-nowrap text-[11px] !py-0 !px-0">
                    {new Date(booking.createdAt).toLocaleString("de-AT")}
                  </TableCell>
                </TableRow>
                {booking.note ? (
                  <TableRow className="bg-muted/20 hover:bg-muted/25">
                    <TableCell colSpan={4} className="py-0.5 px-2 text-xs text-muted-foreground">
                      Notiz: {booking.note}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Abgeschlossene Aufträge
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border border-success/40">
          <Table>
            <TableHeader className="bg-success/10">
              <TableRow className="border-success/40 hover:bg-success/10">
                <TableHead className="h-auto py-1 !px-2 text-[11px] leading-tight text-success">Auftrag</TableHead>
                <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight text-success">Menge</TableHead>
                <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight text-success">Von</TableHead>
                <TableHead className="h-auto py-1 !px-0 text-[11px] leading-tight text-success">Datum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-[11px] leading-tight text-success">
              {!bookingsQuery.isLoading &&
              !bookingsQuery.error &&
              (bookingsQuery.data?.completedOrders?.length ?? 0) === 0 ? (
                <TableRow className="border-success/40 hover:bg-success/5">
                  <TableCell colSpan={4} className="bg-success/5 text-xs text-muted-foreground">
                    Keine fertigen Auftraege fuer dieses Produkt.
                  </TableCell>
                </TableRow>
              ) : null}
              {(bookingsQuery.data?.completedOrders ?? []).map((entry) => (
                <TableRow key={entry.id} className="border-success/40 bg-success/5 hover:bg-success/10">
                  <TableCell className="text-[11px] font-medium !py-1 !px-2">{entry.order.orderNumber}</TableCell>
                  <TableCell className="text-[11px] font-medium !py-0 !px-0">{toNumber(entry.quantity)}</TableCell>
                  <TableCell className="text-[11px] !py-0 !px-0">{entry.order.user.name ?? entry.order.user.email ?? "Unbekannt"}</TableCell>
                  <TableCell className="whitespace-nowrap text-[11px] !py-0 !px-0">
                    {new Date(entry.order.createdAt).toLocaleString("de-AT")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export function ProductsAdminPanel() {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [storageRoomFilter, setStorageRoomFilter] = useState("");
  const [storageLocationFilter, setStorageLocationFilter] = useState("");
  const [showNearMinimumOnly, setShowNearMinimumOnly] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [formsById, setFormsById] = useState<Record<string, ProductFormState>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProductCreateFormState>(createEmptyCreateForm);
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImageUploadError, setCreateImageUploadError] = useState<string | null>(null);
  const [editUploadPendingById, setEditUploadPendingById] = useState<Record<string, boolean>>({});
  const [editUploadErrorById, setEditUploadErrorById] = useState<Record<string, string | null>>({});
  /** File chosen in the edit form; uploaded only when saving. */
  const [editPendingImageById, setEditPendingImageById] = useState<
    Record<string, { file: File; previewUrl: string } | null>
  >({});
  /** Selected product image row in the admin grid (`null` = none, fields empty unless edited). */
  const [editSelectedImageIdById, setEditSelectedImageIdById] = useState<Record<string, string | null>>({});
  const [imageDeletePendingKey, setImageDeletePendingKey] = useState<string | null>(null);
  const [editDocumentUploadPendingById, setEditDocumentUploadPendingById] = useState<Record<string, boolean>>({});
  const [editDocumentUploadErrorById, setEditDocumentUploadErrorById] = useState<Record<string, string | null>>({});
  const [createImageUploadPending, setCreateImageUploadPending] = useState(false);
  const [bookingProduct, setBookingProduct] = useState<{ id: string; name: string } | null>(null);
  const [bookingQuantityInput, setBookingQuantityInput] = useState("");
  const [bookingSupplierInput, setBookingSupplierInput] = useState("");
  const [bookingNoteInput, setBookingNoteInput] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  const [editCategorySearch, setEditCategorySearch] = useState("");

  const productsQuery = api.product.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      categoryId: categoryFilter || undefined,
      storageRoomId: storageRoomFilter || undefined,
      storageLocationId: storageLocationFilter || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const categoriesQuery = api.category.list.useQuery();
  const storageRoomsQuery = api.storageRoom.list.useQuery();
  const storageLocationsQuery = api.storageLocation.list.useQuery();

  const updateMutation = api.product.backendUpdate.useMutation({
    onSuccess: async () => {
      await utils.product.backendList.invalidate();
    },
  });
  const createMutation = api.product.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.product.backendList.invalidate(), utils.product.list.invalidate()]);
      setCreateForm(createEmptyCreateForm());
      setCreateImageFile(null);
      setCreateImageUploadError(null);
      setCreateOpen(false);
    },
  });
  const deleteProductImageMutation = api.product.backendDeleteProductImage.useMutation({
    onSuccess: async () => {
      await utils.product.backendList.invalidate();
    },
    onSettled: () => {
      setImageDeletePendingKey(null);
    },
  });

  const addProductImageMutation = api.product.backendAddProductImage.useMutation({
    onSuccess: async () => {
      await utils.product.backendList.invalidate();
    },
  });

  const stockBookingMutation = api.product.backendBookStock.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.product.backendList.invalidate(),
        bookingProduct
          ? utils.product.backendStockBookings.invalidate({ productId: bookingProduct.id, limit: 10 })
          : Promise.resolve(),
      ]);
      setBookingProduct(null);
      setBookingQuantityInput("");
      setBookingSupplierInput("");
      setBookingNoteInput("");
      setBookingError(null);
    },
  });

  const sortedProducts = useMemo(
    () =>
      [...(productsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [productsQuery.data],
  );
  const visibleProducts = useMemo(() => {
    if (!showNearMinimumOnly) return sortedProducts;
    return sortedProducts.filter((product) =>
      isNearMinimumStock(product.quantityOnHand, product.minimumQuantity),
    );
  }, [showNearMinimumOnly, sortedProducts]);
  const storageLocationsById = useMemo(() => {
    return new Map((storageLocationsQuery.data ?? []).map((storageLocation) => [storageLocation.id, storageLocation]));
  }, [storageLocationsQuery.data]);
  const filteredStorageLocationsForList = useMemo(() => {
    if (!storageRoomFilter) return storageLocationsQuery.data ?? [];
    return (storageLocationsQuery.data ?? []).filter(
      (storageLocation) => storageLocation.storageRoomId === storageRoomFilter,
    );
  }, [storageLocationsQuery.data, storageRoomFilter]);
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category])),
    [categoriesQuery.data],
  );
  const filteredEditCategories = useMemo(() => {
    const needle = editCategorySearch.trim().toLowerCase();
    return (categoriesQuery.data ?? []).filter((category) => category.name.toLowerCase().includes(needle));
  }, [categoriesQuery.data, editCategorySearch]);

  useEffect(() => {
    setEditCategorySearch("");
  }, [expandedRowId]);

  useEffect(() => {
    if (!storageRoomFilter || !storageLocationFilter) return;
    const selectedLocation = storageLocationsById.get(storageLocationFilter);
    if (!selectedLocation || selectedLocation.storageRoomId !== storageRoomFilter) {
      setStorageLocationFilter("");
    }
  }, [storageRoomFilter, storageLocationFilter, storageLocationsById]);
  const canCreateProduct =
    createForm.name.trim().length > 0 &&
    createForm.sku.trim().length > 0 &&
    Number.isFinite(Number(createForm.price)) &&
    Number(createForm.price) >= 0 &&
    Number.isFinite(Number(createForm.minimumQuantity)) &&
    Number(createForm.minimumQuantity) >= 0 &&
    Number.isFinite(Number(createForm.startingQuantity)) &&
    Number(createForm.startingQuantity) >= 0 &&
    Number.isFinite(Number(createForm.unitStep)) &&
    Number(createForm.unitStep) > 0;
  const selectedCreateRoomId =
    createForm.storageRoomId || storageLocationsById.get(createForm.storageLocationId)?.storageRoomId || "";
  const filteredStorageLocationsForCreate = (storageLocationsQuery.data ?? []).filter((storageLocation) =>
    selectedCreateRoomId ? storageLocation.storageRoomId === selectedCreateRoomId : true,
  );

  const uploadProductImage = async (sku: string, file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Bitte eine Bilddatei auswaehlen.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Das Bild ist zu gross. Maximal 8 MB erlaubt.");
    }

    const body = new FormData();
    body.append("sku", sku);
    body.append("file", file);

    const response = await fetch("/api/backend/products/upload-image", {
      method: "POST",
      body,
    });
    const result = (await response.json().catch(() => null)) as
      | { url?: string; message?: string }
      | null;

    if (!response.ok || !result?.url) {
      throw new Error(result?.message ?? "Bild konnte nicht hochgeladen werden.");
    }

    return result.url;
  };

  const uploadProductDocument = async (productId: string, file: File) => {
    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      throw new Error("Das Dokument ist zu gross. Maximal 12 MB erlaubt.");
    }

    const body = new FormData();
    body.append("productId", productId);
    body.append("file", file);

    const response = await fetch("/api/backend/products/upload-document", {
      method: "POST",
      body,
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      throw new Error(result?.message ?? "Dokument konnte nicht hochgeladen werden.");
    }
  };

  const deleteProductDocument = async (documentId: string) => {
    const response = await fetch("/api/backend/products/delete-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      throw new Error(result?.message ?? "Dokument konnte nicht geloescht werden.");
    }
  };

  const clearEditPendingImage = (productId: string) => {
    setEditPendingImageById((current) => {
      const prev = current[productId];
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...current, [productId]: null };
    });
  };

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Produkte</h2>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreateForm(createEmptyCreateForm());
            setCreateImageFile(null);
            setCreateImageUploadError(null);
            setCreateOpen(true);
          }}
        >
          Neues Produkt
        </Button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <label className="mb-1 block text-xs text-muted-foreground">
          Kategorie
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle Kategorien</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-1 block text-xs text-muted-foreground">
          Lagerraum
          <select
            value={storageRoomFilter}
            onChange={(event) => setStorageRoomFilter(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle Lagerraeume</option>
            {(storageRoomsQuery.data ?? []).map((storageRoom) => (
              <option key={storageRoom.id} value={storageRoom.id}>
                {storageRoom.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-1 block text-xs text-muted-foreground">
          Platz
          <select
            value={storageLocationFilter}
            onChange={(event) => setStorageLocationFilter(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle Lagerplaetze</option>
            {filteredStorageLocationsForList.map((storageLocation) => (
              <option key={storageLocation.id} value={storageLocation.id}>
                {storageLocation.code} - {storageLocation.name} ({storageLocation.storageRoom.name})
              </option>
            ))}
          </select>
        </label>
        <div className="mb-1 flex items-end">
          <Button
            type="button"
            variant={showNearMinimumOnly ? "default" : "outline"}
            className="h-10 w-full rounded-xl"
            onClick={() => setShowNearMinimumOnly((current) => !current)}
          >
            {showNearMinimumOnly ? "Filter aktiv: nahe Mindestbestand" : "Nahe Mindestbestand (<= 110%)"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Lagerplatz</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead>Mindestbestand</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {productsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={6} className="bg-white text-muted-foreground">
                  Produkte werden geladen...
                </TableCell>
              </tr>
            ) : null}

            {productsQuery.error ? (
              <tr>
                <TableCell colSpan={6} className="bg-white text-destructive">
                  Produkte konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}

            {!productsQuery.isLoading && !productsQuery.error && visibleProducts.length === 0 ? (
              <tr>
                <TableCell colSpan={6} className="bg-white text-muted-foreground">
                  Keine Produkte gefunden.
                </TableCell>
              </tr>
            ) : null}

            {visibleProducts.map((product) => {
              const isExpanded = expandedRowId === product.id;
              const isNearMinimum = isNearMinimumStock(product.quantityOnHand, product.minimumQuantity);
              const form = formsById[product.id] ?? createInitialForm(product);
              const pendingEditImage = editPendingImageById[product.id];
              const previewImage = product.images[0];
              const locationText = product.storageLocation
                ? `${product.storageLocation.code} - ${product.storageLocation.name}`
                : "-";
              const selectedRoomId =
                form.storageRoomId || storageLocationsById.get(form.storageLocationId)?.storageRoomId || "";
              const filteredStorageLocationsForForm = (storageLocationsQuery.data ?? []).filter((storageLocation) =>
                selectedRoomId ? storageLocation.storageRoomId === selectedRoomId : true,
              );
              const imageUploadBusy = !!editUploadPendingById[product.id];
              const imageFilePending = !!pendingEditImage;
              const urlFieldDisabled = imageFilePending || imageUploadBusy;
              const altFieldDisabled = imageUploadBusy;

              return (
                <Fragment key={product.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedRowId((current) => (current === product.id ? null : product.id));
                      setFormsById((current) => ({
                        ...current,
                        [product.id]: current[product.id] ?? createInitialForm(product),
                      }));
                    }}
                    onMouseEnter={() => {
                      if (isExpanded) return;
                      setHoveredProductId(product.id);
                    }}
                    onMouseLeave={() =>
                      setHoveredProductId((current) => (current === product.id ? null : current))
                    }
                    className={`cursor-pointer ${isNearMinimum ? "outline outline-2 -outline-offset-2 outline-yellow-400" : ""}`}
                  >
                    <TableCell
                      className={`font-medium ${
                        isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-foreground"
                      }`}
                    >
                      <div className="relative inline-block">
                        <span>{product.name}</span>
                        {previewImage?.url && hoveredProductId === product.id && !isExpanded ? (
                          <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 rounded-md border border-border bg-card p-1 shadow-lg">
                            <img
                              src={previewImage.url}
                              alt={previewImage.altText || `${product.name} Produktbild`}
                              className="h-20 w-20 rounded object-cover"
                              onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = "/pictures/placeholder.jpg";
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-muted-foreground"}>
                      {product.sku}
                    </TableCell>
                    <TableCell className={isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-muted-foreground"}>
                      {product.category?.name ?? "-"}
                    </TableCell>
                    <TableCell className={isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-muted-foreground"}>
                      {locationText}
                    </TableCell>
                    <TableCell className={isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-muted-foreground"}>
                      {toNumber(product.quantityOnHand)}
                    </TableCell>
                    <TableCell className={isExpanded ? "bg-muted/60 text-black/20" : "bg-white text-muted-foreground"}>
                      {toNumber(product.minimumQuantity)}
                    </TableCell>
                  </TableRow>
                  {isExpanded ? (
                    <tr className="border-t border-border">
                      <td colSpan={6} className="align-top bg-muted/50 px-1 py-5">
                        <div className="mx-4 flex flex-col gap-4">
                          <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] md:items-stretch md:gap-4">
                            <div className="flex min-h-0 min-w-0 flex-col gap-4">
                              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                <div>
                                  <p className="text-lg font-semibold text-slate-900">Stammdaten</p>
                                  <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />
                                </div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-x-4">
                                  <label className="block text-xs text-slate-600 md:col-span-2">
                                    Name
                                    <input
                                      value={form.name}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: { ...form, name: event.target.value },
                                        }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                  <label className="block text-xs text-slate-600">
                                    SKU
                                    <input
                                      value={form.sku}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: { ...form, sku: event.target.value },
                                        }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                  <label className="block text-xs text-slate-600 md:col-span-3">
                                    Beschreibung
                                    <textarea
                                      value={form.description}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: { ...form, description: event.target.value },
                                        }))
                                      }
                                      rows={3}
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-4">
                                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                  <div>
                                    <p className="text-lg font-semibold text-slate-900">Lager</p>
                                    <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />
                                  </div>
                                  <label className="block text-xs text-slate-600">
                                    Raum
                                    <select
                                      value={selectedRoomId}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: {
                                            ...form,
                                            storageRoomId: event.target.value,
                                            storageLocationId: "",
                                          },
                                        }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                    >
                                      <option value="">Kein Lagerraum</option>
                                      {(storageRoomsQuery.data ?? []).map((storageRoom) => (
                                        <option key={storageRoom.id} value={storageRoom.id}>
                                          {storageRoom.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block text-xs text-slate-600">
                                    Platz
                                    <select
                                      value={form.storageLocationId}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => {
                                          const selectedLocation = storageLocationsById.get(event.target.value);
                                          return {
                                            ...current,
                                            [product.id]: {
                                              ...form,
                                              storageRoomId: selectedLocation?.storageRoomId ?? form.storageRoomId,
                                              storageLocationId: event.target.value,
                                            },
                                          };
                                        })
                                      }
                                      disabled={!selectedRoomId}
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                                    >
                                      <option value="">
                                        {selectedRoomId ? "Kein Lagerplatz" : "Bitte zuerst Lagerraum waehlen"}
                                      </option>
                                      {filteredStorageLocationsForForm.map((storageLocation) => (
                                        <option key={storageLocation.id} value={storageLocation.id}>
                                          {storageLocation.code} - {storageLocation.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                  <div>
                                    <p className="text-lg font-semibold text-slate-900">Produkt Details</p>
                                    <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <label className="block text-xs text-slate-600">
                                      Bestand
                                      <input
                                        disabled
                                        value={String(toNumber(product.quantityOnHand))}
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-sm text-slate-600"
                                      />
                                    </label>
                                    <label className="block text-xs text-slate-600">
                                      Minimum
                                      <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={form.minimumQuantity}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: { ...form, minimumQuantity: event.target.value },
                                          }))
                                        }
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs text-slate-600">
                                      Schritte
                                      <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        value={form.unitStep}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: { ...form, unitStep: event.target.value },
                                          }))
                                        }
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="block text-xs text-slate-600">
                                      Einheitstyp
                                      <select
                                        value={form.unitKind}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: {
                                              ...form,
                                              unitKind: event.target.value as ProductFormState["unitKind"],
                                            },
                                          }))
                                        }
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                      >
                                        {unitKinds.map((unitKind) => (
                                          <option key={unitKind.value} value={unitKind.value}>
                                            {unitKind.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block text-xs text-slate-600">
                                      Basiseinheit
                                      <select
                                        value={form.baseUnit}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: {
                                              ...form,
                                              baseUnit: event.target.value as ProductFormState["baseUnit"],
                                            },
                                          }))
                                        }
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                      >
                                        {baseUnits.map((baseUnit) => (
                                          <option key={baseUnit.value} value={baseUnit.value}>
                                            {baseUnit.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                </div>

                                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                  <div>
                                    <p className="text-lg font-semibold text-slate-900">Preis</p>
                                    <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />
                                  </div>
                                  <label className="block text-xs text-slate-600">
                                    Verkaufspreis
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={form.price}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: { ...form, price: event.target.value },
                                        }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>

                            <div className="flex min-h-0 min-w-0 flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden md:self-stretch">
                              <div className="flex w-full shrink-0">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setFormsById((current) => ({
                                      ...current,
                                      [product.id]: { ...form, isVisible: !form.isVisible },
                                    }));
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 bg-white px-3 py-2 text-left transition ${
                                    form.isVisible ? "border-emerald-500/60" : "border-red-500/60"
                                  }`}
                                  aria-label="Produktsichtbarkeit umschalten"
                                  aria-pressed={form.isVisible}
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
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:min-h-0 md:overflow-hidden">
                                <div className="shrink-0 space-y-3">
                                  <p className="text-lg font-semibold text-slate-900">Kategorien</p>
                                  <div className="h-px w-full bg-slate-200/70" aria-hidden="true" />
                                  {form.categoryIds.length > 0 ? (
                                    <div className="max-h-20 flex flex-wrap gap-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                                      {form.categoryIds.map((categoryId) => {
                                        const assigned = categoriesById.get(categoryId);
                                        if (!assigned) return null;
                                        return (
                                          <button
                                            key={categoryId}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setFormsById((current) => {
                                                const prev = current[product.id] ?? form;
                                                return {
                                                  ...current,
                                                  [product.id]: {
                                                    ...prev,
                                                    categoryIds: prev.categoryIds.filter((id) => id !== categoryId),
                                                  },
                                                };
                                              });
                                            }}
                                            className="inline-flex max-w-full min-h-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
                                            aria-label={`Kategorie ${assigned.name} entfernen`}
                                          >
                                            <span className="truncate font-medium">{assigned.name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  <Input
                                    type="search"
                                    value={editCategorySearch}
                                    onChange={(event) => setEditCategorySearch(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    placeholder="Kategorien suchen..."
                                    className="h-9 rounded-lg border-slate-300 bg-white text-sm"
                                    aria-label="Kategorien filtern"
                                  />
                                </div>
                                <div
                                  className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white max-h-80"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <div
                                    className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-gutter:stable]"
                                    role="group"
                                    aria-label="Kategorien auswaehlen"
                                  >
                                    <div className="flex flex-col gap-2 ">
                                      {filteredEditCategories.map((category) => (
                                        <label
                                          key={category.id}
                                          className="flex cursor-pointer items-center gap-2 text-sm text-slate-900"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={form.categoryIds.includes(category.id)}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) =>
                                              setFormsById((current) => ({
                                                ...current,
                                                [product.id]: {
                                                  ...form,
                                                  categoryIds: event.target.checked
                                                    ? [...form.categoryIds, category.id]
                                                    : form.categoryIds.filter((id) => id !== category.id),
                                                },
                                              }))
                                            }
                                            className="h-4 w-4 shrink-0 rounded border-slate-300"
                                          />
                                          <span>{category.name}</span>
                                        </label>
                                      ))}
                                      {(categoriesQuery.data?.length ?? 0) === 0 ? (
                                        <p className="text-xs text-slate-500">Keine Kategorien vorhanden.</p>
                                      ) : filteredEditCategories.length === 0 ? (
                                        <p className="text-xs text-slate-500">Keine Treffer.</p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div>
                              <p className="text-lg font-semibold text-slate-900">Bilder und Dokumente</p>
                              <div className="mt-4 h-px w-full bg-slate-200/70" aria-hidden="true" />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 md:items-stretch">
                              <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                <div>
                                  <p className="select-none text-xs text-slate-600">Bild hochladen</p>
                                  <label
                                    className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-lg border-2 border-dashed border-violet-400/70 bg-violet-50/90 p-3 text-sm ${
                                      editUploadPendingById[product.id]
                                        ? "cursor-default opacity-90"
                                        : "cursor-pointer hover:bg-violet-100/90"
                                    }`}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-busy={editUploadPendingById[product.id] ? true : undefined}
                                  >
                                    <input
                                      id={`edit-product-image-${product.id}`}
                                      type="file"
                                      accept="image/*"
                                      disabled={!!editUploadPendingById[product.id]}
                                      className="sr-only"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        const sku = form.sku.trim();
                                        if (!sku) {
                                          setEditUploadErrorById((current) => ({
                                            ...current,
                                            [product.id]: "Bitte zuerst eine SKU eingeben.",
                                          }));
                                          event.target.value = "";
                                          return;
                                        }
                                        if (!file.type.startsWith("image/")) {
                                          setEditUploadErrorById((current) => ({
                                            ...current,
                                            [product.id]: "Bitte eine Bilddatei auswaehlen.",
                                          }));
                                          event.target.value = "";
                                          return;
                                        }
                                        if (file.size > MAX_UPLOAD_BYTES) {
                                          setEditUploadErrorById((current) => ({
                                            ...current,
                                            [product.id]: "Das Bild ist zu gross. Maximal 8 MB erlaubt.",
                                          }));
                                          event.target.value = "";
                                          return;
                                        }
                                        setEditUploadErrorById((current) => ({ ...current, [product.id]: null }));
                                        setEditPendingImageById((current) => {
                                          const prev = current[product.id];
                                          if (prev?.previewUrl) {
                                            URL.revokeObjectURL(prev.previewUrl);
                                          }
                                          return {
                                            ...current,
                                            [product.id]: { file, previewUrl: URL.createObjectURL(file) },
                                          };
                                        });
                                        setEditSelectedImageIdById((current) => ({
                                          ...current,
                                          [product.id]: null,
                                        }));
                                        setFormsById((current) => {
                                          const f = current[product.id] ?? createInitialForm(product);
                                          return {
                                            ...current,
                                            [product.id]: {
                                              ...f,
                                              imageUrl: "",
                                              imageAltText: f.imageAltText,
                                            },
                                          };
                                        });
                                        event.target.value = "";
                                      }}
                                    />
                                    <span
                                      className={`inline-flex shrink-0 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
                                        editUploadPendingById[product.id]
                                          ? "opacity-70"
                                          : "group-hover:bg-violet-700"
                                      }`}
                                    >
                                      Datei auswählen
                                    </span>
                                    <span
                                      className={`min-w-0 flex-1 break-all text-left text-sm ${
                                        editUploadPendingById[product.id]
                                          ? "text-muted-foreground"
                                          : pendingEditImage
                                            ? "font-medium text-slate-900"
                                            : "text-slate-500"
                                      }`}
                                      title={
                                        editUploadPendingById[product.id]
                                          ? undefined
                                          : pendingEditImage
                                            ? pendingEditImage.file.name
                                            : undefined
                                      }
                                      role="status"
                                    >
                                      {editUploadPendingById[product.id]
                                        ? "Bild wird hochgeladen..."
                                        : (pendingEditImage?.file.name ?? "Keine Datei ausgewählt")}
                                    </span>
                                  </label>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Datei waehlen, optional Alt-Text setzen — das Bild wird beim Speichern
                                  hochgeladen.
                                </p>
                                {editUploadErrorById[product.id] ? (
                                  <p className="text-xs text-destructive">{editUploadErrorById[product.id]}</p>
                                ) : null}

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const openSource =
                                        form.imageUrl.trim() || pendingEditImage?.previewUrl || "";
                                      const href = resolveImageTabUrl(openSource);
                                      if (href) window.open(href, "_blank", "noopener,noreferrer");
                                    }}
                                    className={`relative h-36 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-40 sm:w-40 ${
                                      form.imageUrl.trim() || pendingEditImage?.previewUrl
                                        ? "cursor-pointer ring-offset-2 transition hover:ring-2 hover:ring-violet-400/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                                        : "cursor-default opacity-90"
                                    }`}
                                    aria-label={
                                      form.imageUrl.trim() || pendingEditImage?.previewUrl
                                        ? "Bild in neuem Tab oeffnen"
                                        : "Vorschau (noch keine Bild-URL)"
                                    }
                                  >
                                    <img
                                      src={
                                        form.imageUrl.trim() ||
                                        pendingEditImage?.previewUrl ||
                                        "/pictures/placeholder.jpg"
                                      }
                                      alt=""
                                      className="h-full w-full object-cover"
                                      onError={(event) => {
                                        event.currentTarget.onerror = null;
                                        event.currentTarget.src = "/pictures/placeholder.jpg";
                                      }}
                                    />
                                  </button>
                                  <div className="min-w-0 flex-1 space-y-3">
                                    <div className="block text-xs text-slate-600">
                                      <span className="select-none">
                                        {urlFieldDisabled ? "Bild-URL" : "Bild-URL (optional)"}
                                      </span>
                                      <input
                                        type="text"
                                        inputMode="url"
                                        autoComplete="off"
                                        value={form.imageUrl}
                                        disabled={urlFieldDisabled}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: {
                                              ...(current[product.id] ?? createInitialForm(product)),
                                              imageUrl: event.target.value,
                                            },
                                          }))
                                        }
                                        placeholder={
                                          urlFieldDisabled
                                            ? "—"
                                            : "Nach Auswahl aus Liste oder nach Speichern"
                                        }
                                        className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-sm ${
                                          urlFieldDisabled
                                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500"
                                            : "border-slate-300 bg-white text-slate-900"
                                        }`}
                                      />
                                    </div>
                                    <div className="block text-xs text-slate-600">
                                      <span className="select-none">Bild-Alt-Text</span>
                                      <input
                                        value={form.imageAltText}
                                        disabled={altFieldDisabled}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) =>
                                          setFormsById((current) => ({
                                            ...current,
                                            [product.id]: {
                                              ...(current[product.id] ?? createInitialForm(product)),
                                              imageAltText: event.target.value,
                                            },
                                          }))
                                        }
                                        placeholder={
                                          altFieldDisabled
                                            ? "—"
                                            : imageFilePending
                                              ? "Vor Speichern für das neue Bild eintragen"
                                              : "Bearbeiten, mit Speichern übernehmen"
                                        }
                                        className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-sm ${
                                          altFieldDisabled
                                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500"
                                            : "border-slate-300 bg-white text-slate-900"
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-auto border-t border-slate-200/80 pt-3">
                                  <p className="mb-2 text-xs font-medium text-slate-700">Alle Bilder</p>
                                  <div className="max-h-56 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                                    {(product.images ?? []).length === 0 ? (
                                      <p className="text-xs text-muted-foreground">Keine Bilder vorhanden.</p>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-2">
                                        {(product.images ?? []).map((image, imageIndex) => {
                                          const isSelected = editSelectedImageIdById[product.id] === image.id;
                                          const deleteKey = `${product.id}:${image.id}`;
                                          const sizeBytes = image.sizeBytes ?? null;

                                          return (
                                            <div
                                              key={image.id ?? `${image.url}-${imageIndex}`}
                                              className={`flex items-start gap-2 rounded-md border bg-slate-50/80 p-2 transition ${
                                                isSelected
                                                  ? "border-violet-600"
                                                  : "border-slate-200"
                                              }`}
                                            >
                                              <button
                                                type="button"
                                                onClick={(clickEvent) => {
                                                  clickEvent.stopPropagation();
                                                  if (editSelectedImageIdById[product.id] === image.id) {
                                                    setEditSelectedImageIdById((current) => ({
                                                      ...current,
                                                      [product.id]: null,
                                                    }));
                                                    setFormsById((current) => {
                                                      const f = current[product.id] ?? createInitialForm(product);
                                                      return {
                                                        ...current,
                                                        [product.id]: {
                                                          ...f,
                                                          imageUrl: "",
                                                          imageAltText: "",
                                                        },
                                                      };
                                                    });
                                                    return;
                                                  }
                                                  clearEditPendingImage(product.id);
                                                  setEditSelectedImageIdById((current) => ({
                                                    ...current,
                                                    [product.id]: image.id,
                                                  }));
                                                  setFormsById((current) => {
                                                    const f = current[product.id] ?? createInitialForm(product);
                                                    return {
                                                      ...current,
                                                      [product.id]: {
                                                        ...f,
                                                        imageUrl: image.url,
                                                        imageAltText: image.altText ?? "",
                                                      },
                                                    };
                                                  });
                                                }}
                                                className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/80"
                                              >
                                                <img
                                                  src={image.url}
                                                  alt={
                                                    image.altText || `${form.name} Produktbild ${imageIndex + 1}`
                                                  }
                                                  className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover"
                                                  onError={(errEvent) => {
                                                    errEvent.currentTarget.onerror = null;
                                                    errEvent.currentTarget.src = "/pictures/placeholder.jpg";
                                                  }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                  <p className="break-all text-[11px] leading-snug text-slate-600">
                                                    {image.url}
                                                  </p>
                                                  {image.altText ? (
                                                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                                                      Alt: {image.altText}
                                                    </p>
                                                  ) : (
                                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                      Kein Alt-Text
                                                    </p>
                                                  )}
                                                </div>
                                              </button>
                                              <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch">
                                                <span className="text-[11px] text-muted-foreground">
                                                  {sizeBytes != null ? formatBytes(sizeBytes) : "—"}
                                                </span>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  disabled={imageDeletePendingKey !== null}
                                                  onClick={(clickEvent) => {
                                                    clickEvent.stopPropagation();
                                                    if (!image.id) return;
                                                    const deletedUrl = image.url;
                                                    setImageDeletePendingKey(deleteKey);
                                                    deleteProductImageMutation.mutate(
                                                      { productId: product.id, imageId: image.id },
                                                      {
                                                        onSuccess: () => {
                                                          setEditSelectedImageIdById((current) =>
                                                            current[product.id] === image.id
                                                              ? { ...current, [product.id]: null }
                                                              : current,
                                                          );
                                                          setFormsById((current) => {
                                                            const f = current[product.id];
                                                            if (!f) return current;
                                                            if (f.imageUrl === deletedUrl) {
                                                              return {
                                                                ...current,
                                                                [product.id]: {
                                                                  ...f,
                                                                  imageUrl: "",
                                                                  imageAltText: "",
                                                                },
                                                              };
                                                            }
                                                            return current;
                                                          });
                                                        },
                                                      },
                                                    );
                                                  }}
                                                  className="text-xs"
                                                >
                                                  {imageDeletePendingKey === deleteKey ? "..." : "Entfernen"}
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                <label className="text-xs text-slate-600">
                                  Dokument hochladen
                                  <input
                                    type="file"
                                    accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={async (event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        setEditDocumentUploadPendingById((current) => ({
                                          ...current,
                                          [product.id]: true,
                                        }));
                                        setEditDocumentUploadErrorById((current) => ({
                                          ...current,
                                          [product.id]: null,
                                        }));
                                        await uploadProductDocument(product.id, file);
                                        await utils.product.backendList.invalidate();
                                      } catch (error) {
                                        setEditDocumentUploadErrorById((current) => ({
                                          ...current,
                                          [product.id]:
                                            error instanceof Error
                                              ? error.message
                                              : "Dokument konnte nicht hochgeladen werden.",
                                        }));
                                      } finally {
                                        setEditDocumentUploadPendingById((current) => ({
                                          ...current,
                                          [product.id]: false,
                                        }));
                                        event.target.value = "";
                                      }
                                    }}
                                    className="mt-2 block w-full cursor-pointer rounded-lg border-2 border-dashed border-amber-500/65 bg-amber-50/90 p-3 text-sm font-medium text-amber-950 file:mr-3 file:rounded-md file:border-0 file:bg-amber-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-amber-50 hover:bg-amber-100/90"
                                  />
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  Klicken, um ein Dokument auszuwaehlen.
                                </p>
                                {editDocumentUploadPendingById[product.id] ? (
                                  <p className="text-xs text-muted-foreground">Dokument wird hochgeladen...</p>
                                ) : null}
                                {editDocumentUploadErrorById[product.id] ? (
                                  <p className="text-xs text-destructive">
                                    {editDocumentUploadErrorById[product.id]}
                                  </p>
                                ) : null}

                                <div className="mt-auto space-y-1.5 border-t border-slate-200/80 pt-3">
                                  <p className="mb-1 text-xs font-medium text-slate-700">Dokumente</p>
                                  {(product.documents ?? []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Keine Dokumente vorhanden.</p>
                                  ) : (
                                    (product.documents ?? []).map((document) => (
                                      <div
                                        key={document.id}
                                        className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5"
                                      >
                                        <a
                                          href={document.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) => event.stopPropagation()}
                                          className="truncate text-xs text-primary underline-offset-2 hover:underline"
                                        >
                                          {document.originalName}
                                        </a>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] text-muted-foreground">
                                            {formatBytes(document.sizeBytes)}
                                          </span>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              try {
                                                setEditDocumentUploadPendingById((current) => ({
                                                  ...current,
                                                  [product.id]: true,
                                                }));
                                                setEditDocumentUploadErrorById((current) => ({
                                                  ...current,
                                                  [product.id]: null,
                                                }));
                                                await deleteProductDocument(document.id);
                                                await utils.product.backendList.invalidate();
                                              } catch (error) {
                                                setEditDocumentUploadErrorById((current) => ({
                                                  ...current,
                                                  [product.id]:
                                                    error instanceof Error
                                                      ? error.message
                                                      : "Dokument konnte nicht geloescht werden.",
                                                }));
                                              } finally {
                                                setEditDocumentUploadPendingById((current) => ({
                                                  ...current,
                                                  [product.id]: false,
                                                }));
                                              }
                                            }}
                                            disabled={editDocumentUploadPendingById[product.id]}
                                          >
                                            Entfernen
                                          </Button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setBookingProduct({ id: product.id, name: product.name });
                              setBookingError(null);
                            }}
                            variant="secondary"
                          >
                            Einbuchen
                          </Button>
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearEditPendingImage(product.id);
                              setFormsById((current) => ({
                                ...current,
                                [product.id]: createInitialForm(product),
                              }));
                              setEditSelectedImageIdById((current) => ({
                                ...current,
                                [product.id]: null,
                              }));
                            }}
                            variant="outline"
                          >
                            Zuruecksetzen
                          </Button>
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void (async () => {
                                let editingImageId: string | undefined =
                                  editSelectedImageIdById[product.id] ?? undefined;
                                let imageUrl: string | null = form.imageUrl.trim() || null;
                                let imageAltText: string | null = form.imageAltText.trim()
                                  ? form.imageAltText.trim()
                                  : null;

                                const pending = editPendingImageById[product.id];
                                if (pending) {
                                  const sku = form.sku.trim();
                                  if (!sku) {
                                    setEditUploadErrorById((current) => ({
                                      ...current,
                                      [product.id]: "Bitte zuerst eine SKU eingeben.",
                                    }));
                                    return;
                                  }
                                  try {
                                    setEditUploadPendingById((current) => ({
                                      ...current,
                                      [product.id]: true,
                                    }));
                                    setEditUploadErrorById((current) => ({ ...current, [product.id]: null }));
                                    const uploadedUrl = await uploadProductImage(sku, pending.file);
                                    const created = await addProductImageMutation.mutateAsync({
                                      productId: product.id,
                                      url: uploadedUrl,
                                      altText: imageAltText,
                                    });
                                    URL.revokeObjectURL(pending.previewUrl);
                                    setEditPendingImageById((current) => ({
                                      ...current,
                                      [product.id]: null,
                                    }));
                                    editingImageId = created.id;
                                    imageUrl = uploadedUrl.trim() || null;
                                    setFormsById((current) => {
                                      const f = current[product.id] ?? createInitialForm(product);
                                      return {
                                        ...current,
                                        [product.id]: {
                                          ...f,
                                          imageUrl: uploadedUrl,
                                          imageAltText: imageAltText ?? "",
                                        },
                                      };
                                    });
                                    setEditSelectedImageIdById((current) => ({
                                      ...current,
                                      [product.id]: created.id,
                                    }));
                                  } catch (error) {
                                    setEditUploadErrorById((current) => ({
                                      ...current,
                                      [product.id]:
                                        error instanceof Error
                                          ? error.message
                                          : "Bild konnte nicht hochgeladen werden.",
                                    }));
                                    return;
                                  } finally {
                                    setEditUploadPendingById((current) => ({
                                      ...current,
                                      [product.id]: false,
                                    }));
                                  }
                                }

                                try {
                                  await updateMutation.mutateAsync({
                                    id: product.id,
                                    name: form.name.trim(),
                                    sku: form.sku.trim(),
                                    description: form.description.trim() ? form.description.trim() : null,
                                    price: Number(form.price),
                                    minimumQuantity: Number(form.minimumQuantity),
                                    unitKind: form.unitKind,
                                    baseUnit: form.baseUnit,
                                    unitStep: Number(form.unitStep),
                                    isVisible: form.isVisible,
                                    categoryIds: form.categoryIds,
                                    storageLocationId: form.storageLocationId || null,
                                    editingImageId,
                                    imageUrl,
                                    imageAltText,
                                  });
                                } catch {
                                  // tRPC surfaces toast or error boundary elsewhere
                                }
                              })();
                            }}
                            disabled={
                              updateMutation.isPending ||
                              editUploadPendingById[product.id] ||
                              addProductImageMutation.isPending ||
                              editDocumentUploadPendingById[product.id]
                            }
                            className="disabled:opacity-60"
                          >
                            {updateMutation.isPending ||
                            editUploadPendingById[product.id] ||
                            addProductImageMutation.isPending
                              ? "Speichert..."
                              : "Speichern"}
                          </Button>
                        </div>

                        <BookingHistory productId={product.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {productsQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void productsQuery.fetchNextPage()}
            disabled={productsQuery.isFetchingNextPage}
          >
            {productsQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Neues Produkt"
        description="Alle Produktdaten eingeben, Startbestand setzen und optional ein Bild hochladen."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <Input
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            SKU
            <Input
              value={createForm.sku}
              onChange={(event) => setCreateForm((current) => ({ ...current, sku: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground md:col-span-2">
            Beschreibung
            <textarea
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Preis
            <Input
              type="number"
              min={0}
              step={0.01}
              value={createForm.price}
              onChange={(event) => setCreateForm((current) => ({ ...current, price: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Mindestbestand
            <Input
              type="number"
              min={0}
              step={0.001}
              value={createForm.minimumQuantity}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, minimumQuantity: event.target.value }))
              }
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Startbestand
            <Input
              type="number"
              min={0}
              step={0.001}
              value={createForm.startingQuantity}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, startingQuantity: event.target.value }))
              }
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Schrittweite
            <Input
              type="number"
              min={0.001}
              step={0.001}
              value={createForm.unitStep}
              onChange={(event) => setCreateForm((current) => ({ ...current, unitStep: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Einheitstyp
            <select
              value={createForm.unitKind}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  unitKind: event.target.value as ProductFormState["unitKind"],
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              {unitKinds.map((unitKind) => (
                <option key={unitKind.value} value={unitKind.value}>
                  {unitKind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Basiseinheit
            <select
              value={createForm.baseUnit}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  baseUnit: event.target.value as ProductFormState["baseUnit"],
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              {baseUnits.map((baseUnit) => (
                <option key={baseUnit.value} value={baseUnit.value}>
                  {baseUnit.label}
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
                    checked={createForm.categoryIds.includes(category.id)}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        categoryIds: event.target.checked
                          ? [...current.categoryIds, category.id]
                          : current.categoryIds.filter((id) => id !== category.id),
                      }))
                    }
                    className="h-4 w-4 rounded border-input"
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
              value={selectedCreateRoomId}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  storageRoomId: event.target.value,
                  storageLocationId: "",
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">Kein Lagerraum</option>
              {(storageRoomsQuery.data ?? []).map((storageRoom) => (
                <option key={storageRoom.id} value={storageRoom.id}>
                  {storageRoom.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Platz
            <select
              value={createForm.storageLocationId}
              onChange={(event) =>
                setCreateForm((current) => {
                  const selectedLocation = storageLocationsById.get(event.target.value);
                  return {
                    ...current,
                    storageRoomId: selectedLocation?.storageRoomId ?? current.storageRoomId,
                    storageLocationId: event.target.value,
                  };
                })
              }
              disabled={!selectedCreateRoomId}
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">{selectedCreateRoomId ? "Kein Lagerplatz" : "Bitte zuerst Lagerraum waehlen"}</option>
              {filteredStorageLocationsForCreate.map((storageLocation) => (
                <option key={storageLocation.id} value={storageLocation.id}>
                  {storageLocation.code} - {storageLocation.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground md:col-span-2">
            Bild hochladen (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setCreateImageFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full cursor-pointer rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 p-3 text-sm font-medium text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:bg-primary/10"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {createImageFile ? `Ausgewaehlt: ${createImageFile.name}` : "Noch keine Datei ausgewaehlt."}
            </span>
          </label>
          <label className="text-xs text-muted-foreground md:col-span-2">
            Bild-Alt-Text (optional)
            <Input
              value={createForm.imageAltText}
              onChange={(event) => setCreateForm((current) => ({ ...current, imageAltText: event.target.value }))}
              className="mt-1 h-10 rounded-xl"
            />
          </label>
        </div>
        {createImageUploadError ? <p className="mt-2 text-sm text-destructive">{createImageUploadError}</p> : null}
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            disabled={!canCreateProduct || createMutation.isPending || createImageUploadPending}
            onClick={async () => {
              try {
                setCreateImageUploadError(null);
                let imageUrl = createForm.imageUrl.trim() || null;
                if (createImageFile) {
                  setCreateImageUploadPending(true);
                  imageUrl = await uploadProductImage(createForm.sku.trim(), createImageFile);
                }
                createMutation.mutate({
                  name: createForm.name.trim(),
                  sku: createForm.sku.trim(),
                  description: createForm.description.trim() ? createForm.description.trim() : null,
                  price: Number(createForm.price),
                  minimumQuantity: Number(createForm.minimumQuantity),
                  startingQuantity: Number(createForm.startingQuantity),
                  unitKind: createForm.unitKind,
                  baseUnit: createForm.baseUnit,
                  unitStep: Number(createForm.unitStep),
                  isVisible: createForm.isVisible,
                  categoryIds: createForm.categoryIds,
                  storageLocationId: createForm.storageLocationId || null,
                  imageUrl,
                  imageAltText: createForm.imageAltText.trim() ? createForm.imageAltText.trim() : null,
                });
              } catch (error) {
                setCreateImageUploadError(
                  error instanceof Error ? error.message : "Bild konnte nicht hochgeladen werden.",
                );
              } finally {
                setCreateImageUploadPending(false);
              }
            }}
          >
            {createMutation.isPending || createImageUploadPending ? "Erstellt..." : "Produkt erstellen"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
            Abbrechen
          </Button>
        </div>
      </Dialog>

      {bookingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Einbuchen</h3>
            <p className="mt-1 text-sm text-muted-foreground">{bookingProduct.name}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-600">
                Menge (positiv oder negativ)
                <input
                  value={bookingQuantityInput}
                  onChange={(event) => setBookingQuantityInput(event.target.value)}
                  placeholder="z. B. 20.5 oder 120,5"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="block text-xs text-slate-600">
                Lieferant
                <input
                  value={bookingSupplierInput}
                  onChange={(event) => setBookingSupplierInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="block text-xs text-slate-600">
                Notiz (optional)
                <textarea
                  value={bookingNoteInput}
                  onChange={(event) => setBookingNoteInput(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>
            </div>

            {bookingError ? <p className="mt-3 text-sm text-rose-700">{bookingError}</p> : null}

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  setBookingProduct(null);
                  setBookingError(null);
                }}
                variant="outline"
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const normalizedQuantity = bookingQuantityInput.trim().replace(",", ".");
                  const quantity = Number(normalizedQuantity);
                  const supplier = bookingSupplierInput.trim();

                  if (!Number.isFinite(quantity) || quantity === 0) {
                    setBookingError("Bitte eine gueltige Menge ungleich 0 eingeben.");
                    return;
                  }
                  if (!supplier) {
                    setBookingError("Bitte einen Lieferanten eingeben.");
                    return;
                  }

                  setBookingError(null);
                  stockBookingMutation.mutate({
                    productId: bookingProduct.id,
                    quantityDelta: quantity,
                    supplier,
                    note: bookingNoteInput.trim() ? bookingNoteInput.trim() : null,
                  });
                }}
                disabled={stockBookingMutation.isPending}
                className="disabled:opacity-60"
              >
                {stockBookingMutation.isPending ? "Bucht..." : "Einbuchen"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
