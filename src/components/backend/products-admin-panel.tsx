"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { FilterPillButton } from "~/components/ui/filter-pill-button";
import { Input } from "~/components/ui/input";
import { NumberStepper } from "~/components/ui/number-stepper";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { useToast } from "~/components/ui/toast";
import * as TableUI from "~/components/ui/table";
import { ChevronDownIcon, PlusIcon, WastebinIcon } from "~/components/layout/icon-renders";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";

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
  { value: "DM2", label: "dm2" },
  { value: "MM2", label: "mm2" },
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


const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BYTES = 12 * 1024 * 1024;
const NEAR_MINIMUM_PAGE_SIZE = 100;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

const moneyFormatDeAt = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoneyDeAt(value: number): string {
  if (!Number.isFinite(value)) return moneyFormatDeAt.format(0);
  return moneyFormatDeAt.format(value);
}

/** Parses de-AT style input (comma decimal, optional dot thousands) or plain dot decimals. */
function parseMoneyInput(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (s.includes(",")) {
    return Number(s.replace(",", "."));
  }
  return Number(s);
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
    price: formatMoneyDeAt(toNumber(product.price)),
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

function BookingHistory({ productId }: { productId: string }) {
  const bookingsQuery = api.product.backendStockBookings.useQuery({ productId, limit: 10 });
  const [collapsed, setCollapsed] = useState(true);

  const bookings = bookingsQuery.data?.bookings ?? [];
  const completedOrders = bookingsQuery.data?.completedOrders ?? [];
  const showBookingsTable = !bookingsQuery.isLoading && !bookingsQuery.error && bookings.length > 0;
  const showCompletedOrdersTable =
    !bookingsQuery.isLoading && !bookingsQuery.error && completedOrders.length > 0;

  return (
    <div className="mx-4 mt-4 rounded-md bg-card/40 p-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        aria-expanded={!collapsed}
        aria-controls={`booking-history-section-${productId}`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold text-slate-900">Buchungsverlauf</p>
          <span
            aria-hidden="true"
            className="shrink-0 text-slate-500"
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            <ChevronDownIcon open={!collapsed} className="h-4 w-4" />
          </span>
        </div>
        {!collapsed ? <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" /> : null}
      </button>

      {!collapsed ? (
        <div id={`booking-history-section-${productId}`} className="pt-3">
          {bookingsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Verlauf wird geladen...</p>
          ) : null}
          {bookingsQuery.error ? (
            <p className="text-sm text-rose-700">Verlauf konnte nicht geladen werden.</p>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <p className="select-none text-sm text-slate-600">Letzte Buchungen</p>

          {!bookingsQuery.isLoading && !bookingsQuery.error && bookings.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Keine Buchungen vorhanden.</p>
          ) : null}

          {showBookingsTable ? (
            <div className="mt-2">
              <TableUI.Subtable tableClassName="table-fixed">
                <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
                  <TableUI.SubtableRow className="hover:bg-transparent">
                    <TableUI.SubtableHead className="w-[72px]">Menge</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[34%]">Lieferant</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[32%]">Von</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[160px] whitespace-nowrap">Datum</TableUI.SubtableHead>
                  </TableUI.SubtableRow>
                </TableUI.SubtableHeader>
                <TableUI.SubtableBody>
                  {bookings.map((booking) => (
                    <Fragment key={booking.id}>
                      <TableUI.SubtableRow>
                        <TableUI.SubtableCell className="font-semibold tabular-nums">
                          {toNumber(booking.quantityDelta)}
                        </TableUI.SubtableCell>
                        <TableUI.SubtableCell className="min-w-0 break-words">{booking.supplier}</TableUI.SubtableCell>
                        <TableUI.SubtableCell className="min-w-0 break-words">
                          {booking.user.name ?? booking.user.email ?? "Unbekannt"}
                        </TableUI.SubtableCell>
                        <TableUI.SubtableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                          {new Date(booking.createdAt).toLocaleString("de-AT")}
                        </TableUI.SubtableCell>
                      </TableUI.SubtableRow>
                      {booking.note ? (
                        <TableUI.SubtableRow className="bg-muted/10 hover:bg-muted/20">
                          <TableUI.SubtableCell colSpan={4} className="text-muted-foreground">
                            Notiz: {booking.note}
                          </TableUI.SubtableCell>
                        </TableUI.SubtableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableUI.SubtableBody>
              </TableUI.Subtable>
            </div>
          ) : null}
        </section>

        <section>
          <p className="select-none text-sm text-slate-600">Abgeschlossene Aufträge</p>

          {!bookingsQuery.isLoading && !bookingsQuery.error && completedOrders.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Keine fertigen Auftraege fuer dieses Produkt.</p>
          ) : null}

          {showCompletedOrdersTable ? (
            <div className="mt-2">
              <TableUI.Subtable tableClassName="table-fixed">
                <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
                  <TableUI.SubtableRow className="hover:bg-transparent">
                    <TableUI.SubtableHead className="w-[92px]">Auftrag</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[72px]">Menge</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[32%]">Von</TableUI.SubtableHead>
                    <TableUI.SubtableHead className="w-[160px] whitespace-nowrap">Datum</TableUI.SubtableHead>
                  </TableUI.SubtableRow>
                </TableUI.SubtableHeader>
                <TableUI.SubtableBody>
                  {completedOrders.map((entry) => (
                    <TableUI.SubtableRow key={entry.id}>
                      <TableUI.SubtableCell className="font-semibold tabular-nums">
                        {entry.order.orderNumber}
                      </TableUI.SubtableCell>
                      <TableUI.SubtableCell className="font-semibold tabular-nums">
                        {toNumber(entry.quantity)}
                      </TableUI.SubtableCell>
                      <TableUI.SubtableCell className="min-w-0 break-words">
                        {entry.order.user.name ?? entry.order.user.email ?? "Unbekannt"}
                      </TableUI.SubtableCell>
                      <TableUI.SubtableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(entry.order.createdAt).toLocaleString("de-AT")}
                      </TableUI.SubtableCell>
                    </TableUI.SubtableRow>
                  ))}
                </TableUI.SubtableBody>
              </TableUI.Subtable>
            </div>
          ) : null}
        </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductsAdminPanel() {
  const utils = api.useUtils();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [storageRoomFilter, setStorageRoomFilter] = useState("");
  const [storageLocationFilter, setStorageLocationFilter] = useState("");
  const [showNearMinimumOnly, setShowNearMinimumOnly] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [imageFieldsTouchedById, setImageFieldsTouchedById] = useState<Record<string, boolean>>({});
  const [formsById, setFormsById] = useState<Record<string, ProductFormState>>({});
  const [editUploadPendingById, setEditUploadPendingById] = useState<Record<string, boolean>>({});
  /** File chosen in the edit form; uploaded only when saving. */
  const [editPendingImageById, setEditPendingImageById] = useState<
    Record<string, { file: File; previewUrl: string } | null>
  >({});
  /** Selected product image row in the admin grid (`null` = none, fields empty unless edited). */
  const [editSelectedImageIdById, setEditSelectedImageIdById] = useState<Record<string, string | null>>({});
  const [imageDeletePendingKey, setImageDeletePendingKey] = useState<string | null>(null);
  const [editDocumentUploadPendingById, setEditDocumentUploadPendingById] = useState<Record<string, boolean>>({});
  const [editMediaSectionCollapsedById, setEditMediaSectionCollapsedById] = useState<Record<string, boolean>>({});
  const [bookingProduct, setBookingProduct] = useState<{ id: string; name: string } | null>(null);
  const [bookingQuantityInput, setBookingQuantityInput] = useState("");
  const [bookingSupplierInput, setBookingSupplierInput] = useState("");
  const [bookingNoteInput, setBookingNoteInput] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  const [editCategorySearch, setEditCategorySearch] = useState("");
  const [listCategorySearch, setListCategorySearch] = useState("");
  const [listLocationSearch, setListLocationSearch] = useState("");
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const [locationListOpen, setLocationListOpen] = useState(false);
  const [nearMinimumVisibleCount, setNearMinimumVisibleCount] = useState(NEAR_MINIMUM_PAGE_SIZE);
  const categoryFilterRootRef = useRef<HTMLDivElement>(null);
  const locationFilterRootRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const categoryInputId = useId();
  const locationInputId = useId();
  const categoryListboxId = useId();
  const locationListboxId = useId();
  const nearMinimumSwitchId = useId();

  const productsQuery = api.product.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      categoryId: expandedCategoryId || undefined,
      storageRoomId: storageRoomFilter || undefined,
      storageLocationId: storageLocationFilter || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!expandedCategoryId,
    },
  );
  const categoryCountsQuery = api.product.backendCategoryCounts.useQuery({
    search: searchTerm || undefined,
    storageRoomId: storageRoomFilter || undefined,
    storageLocationId: storageLocationFilter || undefined,
  });
  const categoriesQuery = api.category.list.useQuery();
  const storageRoomsQuery = api.storageRoom.list.useQuery();
  const storageLocationsQuery = api.storageLocation.list.useQuery();

  const updateMutation = api.product.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.product.backendList.invalidate(), utils.product.backendCategoryCounts.invalidate()]);
      toast.success("Produkt gespeichert.");
    },
  });
  // Product creation moved to /backend/products/new.
  const deleteProductImageMutation = api.product.backendDeleteProductImage.useMutation({
    onSuccess: async () => {
      await utils.product.backendList.invalidate();
      toast.success("Produktbild entfernt.");
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
      toast.success("Bestandsbuchung gespeichert.");
    },
  });

  const sortedProducts = useMemo(
    () =>
      [...(productsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [productsQuery.data],
  );
  const nearMinimumProducts = useMemo(
    () =>
      sortedProducts.filter((product) => isNearMinimumStock(product.quantityOnHand, product.minimumQuantity)),
    [sortedProducts],
  );
  const isPreparingNearMinimumList =
    showNearMinimumOnly && (productsQuery.hasNextPage || productsQuery.isFetchingNextPage);
  const visibleProducts = useMemo(() => {
    if (!showNearMinimumOnly) return sortedProducts;
    if (isPreparingNearMinimumList) return [];
    return nearMinimumProducts.slice(0, nearMinimumVisibleCount);
  }, [
    showNearMinimumOnly,
    sortedProducts,
    isPreparingNearMinimumList,
    nearMinimumProducts,
    nearMinimumVisibleCount,
  ]);
  const hasMoreNearMinimumProducts =
    showNearMinimumOnly &&
    !isPreparingNearMinimumList &&
    nearMinimumVisibleCount < nearMinimumProducts.length;

  useEffect(() => {
    setNearMinimumVisibleCount(NEAR_MINIMUM_PAGE_SIZE);
  }, [showNearMinimumOnly, searchTerm, categoryFilter, storageRoomFilter, storageLocationFilter]);

  useEffect(() => {
    if (!showNearMinimumOnly) return;
    if (!productsQuery.hasNextPage) return;
    if (productsQuery.isFetchingNextPage) return;
    void productsQuery.fetchNextPage();
  }, [
    showNearMinimumOnly,
    productsQuery.hasNextPage,
    productsQuery.isFetchingNextPage,
    productsQuery.fetchNextPage,
  ]);

  useEffect(() => {
    if (showNearMinimumOnly) return;
    if (!productsQuery.hasNextPage) return;
    if (productsQuery.isFetchingNextPage) return;
    void productsQuery.fetchNextPage();
  }, [
    showNearMinimumOnly,
    productsQuery.hasNextPage,
    productsQuery.isFetchingNextPage,
    productsQuery.fetchNextPage,
  ]);

  useEffect(() => {
    if (showNearMinimumOnly) return;
    const target = loadMoreRef.current;
    if (!target) return;
    if (!productsQuery.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (productsQuery.isFetchingNextPage) return;
        void productsQuery.fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    showNearMinimumOnly,
    productsQuery.fetchNextPage,
    productsQuery.hasNextPage,
    productsQuery.isFetchingNextPage,
    visibleProducts.length,
  ]);
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
  const filteredListCategories = useMemo(() => {
    const needle = listCategorySearch.trim().toLowerCase();
    return (categoriesQuery.data ?? []).filter((category) => category.name.toLowerCase().includes(needle));
  }, [categoriesQuery.data, listCategorySearch]);
  const filteredListLocations = useMemo(() => {
    const needle = listLocationSearch.trim().toLowerCase();
    if (!needle) return filteredStorageLocationsForList;
    return filteredStorageLocationsForList.filter((storageLocation) => {
      const hay = `${storageLocation.code} ${storageLocation.name} ${storageLocation.storageRoom.name}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [filteredStorageLocationsForList, listLocationSearch]);
  const categoryFilterInputValue = useMemo(() => {
    if (categoryListOpen) return listCategorySearch;
    if (categoryFilter) return categoriesById.get(categoryFilter)?.name ?? "";
    return "";
  }, [categoryListOpen, listCategorySearch, categoryFilter, categoriesById]);
  const locationFilterInputValue = useMemo(() => {
    if (locationListOpen) return listLocationSearch;
    if (storageLocationFilter) {
      const loc = storageLocationsById.get(storageLocationFilter);
      return loc ? `${loc.code} - ${loc.name}` : "";
    }
    return "";
  }, [locationListOpen, listLocationSearch, storageLocationFilter, storageLocationsById]);
  const categoryRows = useMemo(() => {
    const rows = (categoryCountsQuery.data ?? []).filter((row) => row.productCount > 0);
    if (!categoryFilter) return rows;
    return rows.filter((row) => row.id === categoryFilter);
  }, [categoryCountsQuery.data, categoryFilter]);

  useEffect(() => {
    if (!categoryListOpen && !locationListOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (categoryFilterRootRef.current?.contains(target)) return;
      if (locationFilterRootRef.current?.contains(target)) return;
      setCategoryListOpen(false);
      setLocationListOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [categoryListOpen, locationListOpen]);

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

  useEffect(() => {
    if (!expandedCategoryId) return;
    const stillVisible = categoryRows.some((row) => row.id === expandedCategoryId);
    if (stillVisible) return;
    setExpandedCategoryId(null);
    setExpandedRowId(null);
  }, [categoryRows, expandedCategoryId]);
  // (creation-only state removed)

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

  const handleResetProduct = useCallback((product: { id: string } & Parameters<typeof createInitialForm>[0]) => {
    clearEditPendingImage(product.id);
    setFormsById((current) => ({
      ...current,
      [product.id]: createInitialForm(product),
    }));
    setEditSelectedImageIdById((current) => ({
      ...current,
      [product.id]: null,
    }));
    setImageFieldsTouchedById((current) => ({
      ...current,
      [product.id]: false,
    }));
  }, [clearEditPendingImage]);

  const computeHasUnsavedChanges = useCallback(
    (product: { id: string } & Parameters<typeof createInitialForm>[0]) => {
      const initial = createInitialForm(product);
      const current = formsById[product.id] ?? initial;
      const pendingImage = !!editPendingImageById[product.id];
      const imageTouched = !!imageFieldsTouchedById[product.id];

      const normalize = (f: ProductFormState) => ({
        ...f,
        name: f.name.trim(),
        sku: f.sku.trim(),
        description: f.description.trim(),
        imageUrl: imageTouched ? f.imageUrl.trim() : "",
        imageAltText: imageTouched ? f.imageAltText.trim() : "",
        categoryIds: [...f.categoryIds].sort(),
      });
      return isDirty(current, initial, normalize, pendingImage);
    },
    [editPendingImageById, formsById, imageFieldsTouchedById],
  );

  const handleSaveProduct = useCallback(
    async (product: { id: string } & Parameters<typeof createInitialForm>[0]) => {
      const form = formsById[product.id] ?? createInitialForm(product);

      let editingImageId: string | undefined = editSelectedImageIdById[product.id] ?? undefined;
      let imageUrl: string | null = form.imageUrl.trim() || null;
      const imageAltText: string | null = form.imageAltText.trim() ? form.imageAltText.trim() : null;

      const pending = editPendingImageById[product.id];
      if (pending) {
        const sku = form.sku.trim();
        if (!sku) {
          toast.error("Bitte zuerst eine SKU eingeben.");
          return;
        }
        try {
          setEditUploadPendingById((current) => ({
            ...current,
            [product.id]: true,
          }));
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
          toast.success("Bild hochgeladen.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Bild konnte nicht hochgeladen werden.");
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
          price: (() => {
            const p = parseMoneyInput(form.price);
            return Number.isFinite(p) ? p : 0;
          })(),
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
        setImageFieldsTouchedById((current) => ({ ...current, [product.id]: false }));
      } catch {
        // tRPC surfaces toast or error boundary elsewhere
      }
    },
    [
      addProductImageMutation,
      editPendingImageById,
      editSelectedImageIdById,
      formsById,
      setImageFieldsTouchedById,
      toast,
      updateMutation,
      uploadProductImage,
    ],
  );

  const expandedProduct = useMemo(() => {
    if (!expandedRowId) return null;
    return visibleProducts.find((product) => product.id === expandedRowId) ?? null;
  }, [expandedRowId, visibleProducts]);

  const hasUnsavedChanges = useMemo(() => {
    if (!expandedProduct) return false;
    return computeHasUnsavedChanges(expandedProduct);
  }, [computeHasUnsavedChanges, expandedProduct]);

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Produkte</h2>
        </div>
        <Button
          type="button"
          onClick={() => router.push("/backend/products/new")}
          variant="new">
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <PlusIcon />
          </span>
          Neues Produkt
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-8 md:grid-cols-[max-content_minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 max-w-full flex-row flex-nowrap items-center gap-x-2 overflow-x-auto [scrollbar-width:none] md:max-w-none md:overflow-visible [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-sm text-muted-foreground">Raum:</span>
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
            <FilterPillButton
              className="px-2 py-1 text-xs"
              onClick={() => setStorageRoomFilter("")}
              active={storageRoomFilter === ""}
            >
              Alle
            </FilterPillButton>
            {(storageRoomsQuery.data ?? []).map((storageRoom) => (
              <FilterPillButton
                key={storageRoom.id}
                className="px-2 py-1 text-xs"
                onClick={() => setStorageRoomFilter(storageRoom.id)}
                active={storageRoomFilter === storageRoom.id}
              >
                {storageRoom.name}
              </FilterPillButton>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-row flex-wrap items-start justify-center gap-3">
          <div ref={categoryFilterRootRef} className="flex min-w-0 flex-1 flex-row items-center gap-2">
            <label htmlFor={categoryInputId} className="shrink-0 text-sm text-muted-foreground text-right">
              Kategorie
            </label>
            <div className="relative min-w-0 flex-1">
              <Input
                id={categoryInputId}
                type="text"
                inputMode="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={categoryListOpen}
                aria-controls={categoryListOpen ? categoryListboxId : undefined}
                autoComplete="off"
                value={categoryFilterInputValue}
                onChange={(event) => {
                  setListCategorySearch(event.target.value);
                  setCategoryListOpen(true);
                  setLocationListOpen(false);
                }}
                onFocus={() => {
                  setLocationListOpen(false);
                  setCategoryListOpen(true);
                  const seed = categoryFilter ? categoriesById.get(categoryFilter)?.name ?? "" : "";
                  setListCategorySearch(seed);
                }}
                placeholder="Suchen…"
                className="h-9 rounded-lg pr-8 text-sm"
              />
              {categoryFilter !== "" || (categoryListOpen && listCategorySearch.trim() !== "") ? (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                  aria-label="Kategoriefilter zurücksetzen"
                  title="Filter zurücksetzen"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setCategoryFilter("");
                    setListCategorySearch("");
                    setCategoryListOpen(false);
                  }}
                >
                  <span aria-hidden className="relative -top-px text-lg leading-none">
                    ×
                  </span>
                </button>
              ) : null}
              {categoryListOpen ? (
                  <div
                    id={categoryListboxId}
                    role="listbox"
                    aria-label="Kategorie waehlen"
                    className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-36 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-0.5 shadow-md [scrollbar-gutter:stable]"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={categoryFilter === ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setCategoryFilter("");
                        setListCategorySearch("");
                        setCategoryListOpen(false);
                      }}
                      className={`flex w-full px-2 py-1.5 text-left text-xs outline-none transition focus-visible:bg-muted ${
                        categoryFilter === "" ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted/70"
                      }`}
                    >
                      Alle Kategorien
                    </button>
                {filteredListCategories.map((category) => {
                  const active = categoryFilter === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        const picked = categoriesById.get(category.id);
                        setCategoryFilter(category.id);
                        setListCategorySearch(picked?.name ?? "");
                        setCategoryListOpen(false);
                      }}
                      className={`flex w-full px-2 py-1.5 text-left text-xs outline-none transition focus-visible:bg-muted ${
                        active ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted/70"
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
                    {(categoriesQuery.data?.length ?? 0) === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Keine Kategorien.</p>
                    ) : filteredListCategories.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Keine Treffer.</p>
                    ) : null}
                  </div>
                ) : null}
            </div>
          </div>

          <div ref={locationFilterRootRef} className="flex min-w-0 flex-1 flex-row items-center gap-2">
            <label htmlFor={locationInputId} className="shrink-0 text-sm text-muted-foreground text-right">
              Platz
            </label>
            <div className="relative min-w-0 flex-1">
              <Input
                id={locationInputId}
                type="text"
                inputMode="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={locationListOpen}
                aria-controls={locationListOpen ? locationListboxId : undefined}
                autoComplete="off"
                value={locationFilterInputValue}
                onChange={(event) => {
                  setListLocationSearch(event.target.value);
                  setLocationListOpen(true);
                  setCategoryListOpen(false);
                }}
                onFocus={() => {
                  setCategoryListOpen(false);
                  setLocationListOpen(true);
                  const loc = storageLocationFilter
                    ? storageLocationsById.get(storageLocationFilter)
                    : undefined;
                  const seed = loc ? `${loc.code} - ${loc.name}` : "";
                  setListLocationSearch(seed);
                }}
                placeholder="Suchen…"
                className="h-9 rounded-lg pr-8 text-sm"
              />
              {storageLocationFilter !== "" || (locationListOpen && listLocationSearch.trim() !== "") ? (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                  aria-label="Lagerplatzfilter zurücksetzen"
                  title="Filter zurücksetzen"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setStorageLocationFilter("");
                    setListLocationSearch("");
                    setLocationListOpen(false);
                  }}
                >
                  <span aria-hidden className="relative -top-px text-lg leading-none">
                    ×
                  </span>
                </button>
              ) : null}
              {locationListOpen ? (
                  <div
                    id={locationListboxId}
                    role="listbox"
                    aria-label="Lagerplatz waehlen"
                    className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-36 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-0.5 shadow-md [scrollbar-gutter:stable]"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={storageLocationFilter === ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setStorageLocationFilter("");
                        setListLocationSearch("");
                        setLocationListOpen(false);
                      }}
                      className={`flex w-full px-2 py-1.5 text-left text-xs outline-none transition focus-visible:bg-muted ${
                        storageLocationFilter === "" ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted/70"
                      }`}
                    >
                      Alle Lagerplaetze
                    </button>
                {filteredListLocations.map((storageLocation) => {
                  const active = storageLocationFilter === storageLocation.id;
                  const label = `${storageLocation.code} - ${storageLocation.name} (${storageLocation.storageRoom.name})`;
                  return (
                    <button
                      key={storageLocation.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setStorageLocationFilter(storageLocation.id);
                        setListLocationSearch(
                          `${storageLocation.code} - ${storageLocation.name}`,
                        );
                        setLocationListOpen(false);
                      }}
                      className={`flex w-full px-2 py-1.5 text-left text-xs outline-none transition focus-visible:bg-muted ${
                        active ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted/70"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                    {(storageLocationsQuery.data?.length ?? 0) === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Keine Lagerplaetze.</p>
                    ) : filteredListLocations.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Keine Treffer.</p>
                    ) : null}
                  </div>
                ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-row items-center justify-end gap-2">
          <label
            htmlFor={nearMinimumSwitchId}
            className="whitespace-nowrap text-sm text-muted-foreground"
            title="Nur Produkte mit Bestand nahe oder unter dem Mindestbestand (bis 110 Prozent des Mindestwerts)"
          >
            Nahe Mindestbestand
          </label>
          <Switch
            id={nearMinimumSwitchId}
            checked={showNearMinimumOnly}
            onCheckedChange={setShowNearMinimumOnly}
            title={
              showNearMinimumOnly
                ? "Filter aus: alle Produkte anzeigen"
                : "Filter ein: nur Produkte nahe oder unter Mindestbestand"
            }
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md">
        <TableUI.Table className="table-fixed">
          <colgroup>
            <col className="w-[45%]" />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <TableUI.TableHeader>
            <tr>
              <TableUI.TableHead className="min-w-0">Name</TableUI.TableHead>
              <TableUI.TableHead className="min-w-0">SKU</TableUI.TableHead>
              <TableUI.TableHead className="min-w-0">Lagerplatz</TableUI.TableHead>
              <TableUI.TableHead className="min-w-0 whitespace-normal leading-tight">Bestand</TableUI.TableHead>
              <TableUI.TableHead className="min-w-0 whitespace-normal leading-tight">
                {"Mindest\u00ADbestand"}
              </TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {categoryCountsQuery.isLoading ? (
              <tr>
                <TableUI.TableCell colSpan={5} className="text-muted-foreground">
                  Kategorien werden geladen...
                </TableUI.TableCell>
              </tr>
            ) : null}

            {categoryCountsQuery.error ? (
              <tr>
                <TableUI.TableCell colSpan={5} className="text-destructive">
                  Kategorien konnten nicht geladen werden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {!categoryCountsQuery.isLoading && !categoryCountsQuery.error && categoryRows.length === 0 ? (
              <tr>
                <TableUI.TableCell colSpan={5} className="text-muted-foreground">
                  Keine Kategorien gefunden.
                </TableUI.TableCell>
              </tr>
            ) : null}

            {!categoryCountsQuery.isLoading && !categoryCountsQuery.error
              ? categoryRows.map((categoryGroup) => {
              const isCategoryExpanded = expandedCategoryId === categoryGroup.id;
              return (
                <Fragment key={categoryGroup.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedRowId(null);
                      setExpandedCategoryId((current) => (current === categoryGroup.id ? null : categoryGroup.id));
                    }}
                    className={`cursor-pointer ${isCategoryExpanded ? "bg-muted/30 hover:bg-muted/40" : ""}`}
                  >
                    <TableUI.TableCell
                      colSpan={5}
                      className={`min-w-0 ${isCategoryExpanded ? "relative border-b border-border/60" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ChevronDownIcon open={isCategoryExpanded} className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {categoryGroup.name} {" "}
                            <span className="text-xs text-muted-foreground tabular-nums">
                              ({categoryGroup.productCount} Produkt{categoryGroup.productCount === 1 ? "" : "e"})
                            </span>
                            </span>
                        </div>
                      </div>
                    </TableUI.TableCell>
                  </TableUI.TableRow>
                  {isCategoryExpanded ? (
                    productsQuery.isLoading || isPreparingNearMinimumList ? (
                      <tr>
                        <TableUI.TableCell colSpan={5} className="text-muted-foreground">
                          Produkte werden geladen...
                        </TableUI.TableCell>
                      </tr>
                    ) : productsQuery.error ? (
                      <tr>
                        <TableUI.TableCell colSpan={5} className="text-destructive">
                          Produkte konnten nicht geladen werden.
                        </TableUI.TableCell>
                      </tr>
                    ) : visibleProducts.length === 0 ? (
                      <tr>
                        <TableUI.TableCell colSpan={5} className="text-muted-foreground">
                          Keine Produkte in dieser Kategorie.
                        </TableUI.TableCell>
                      </tr>
                    ) : (
                      visibleProducts.map((product, productIndex) => {
                          const isExpanded = expandedRowId === product.id;
                          const isFirstInCategory = productIndex === 0;
                          const isLastInCategory = productIndex === visibleProducts.length - 1;
                          const isNearMinimum = isNearMinimumStock(product.quantityOnHand, product.minimumQuantity);
                          const isBelowMinimum = (() => {
                            const minimum = toNumber(product.minimumQuantity);
                            if (minimum <= 0) return false;
                            const quantity = toNumber(product.quantityOnHand);
                            return quantity < minimum;
                          })();
                          const form = formsById[product.id] ?? createInitialForm(product);
                          const quantityStep = getQuantityStepForBaseUnit(form.baseUnit);
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
                          const isHoverPreviewVisible = hoveredProductId === product.id && !isExpanded && !!previewImage?.url;

                          return (
                            <Fragment key={`${categoryGroup.id}:${product.id}`}>
                  <TableUI.TableRow
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
                    className={`cursor-pointer ${isHoverPreviewVisible ? "z-30" : ""} ${
                      isBelowMinimum
                        ? "rounded-md outline outline-2 outline-offset-[-4px] outline-destructive"
                        : isNearMinimum
                          ? "rounded-md outline outline-2 outline-offset-[-4px] outline-accent-orange"
                          : ""
                    } ${isCategoryExpanded ? "bg-muted/15" : ""}`}
                  >
                    <TableUI.TableCell className="relative min-w-0 max-w-0">
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute left-5 z-0 w-[2px] bg-muted-foreground ${
                          isLastInCategory ? "top-0 bottom-[calc(50%-2px)]" : "top-0 bottom-0"
                        } ${isFirstInCategory ? "-top-3 rounded-t-full" : ""} ${isLastInCategory ? "rounded-b-full" : ""}`}
                      />
                      <svg
                        aria-hidden
                        viewBox="0 0 12 12"
                        className="pointer-events-none absolute left-5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 translate-x-[1px]"
                      >
                        <path
                          d="M0 0 V6 A2 2 0 0 0 2 8 H12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground"
                        />
                      </svg>
                      <div className="relative max-w-full pl-8">
                        <div className="relative inline-block max-w-full">
                          <span className="break-words">{product.name}</span>
                          {isHoverPreviewVisible ? (
                            <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 rounded-md bg-card/90 p-1">
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
                      </div>
                    </TableUI.TableCell>
                    <TableUI.TableCell className="min-w-0 max-w-0 break-words">
                      {product.sku}
                    </TableUI.TableCell>
                    <TableUI.TableCell className="min-w-0 max-w-0 break-words">
                      {locationText}
                    </TableUI.TableCell>
                    <TableUI.TableCell className="whitespace-nowrap tabular-nums">
                      {toNumber(product.quantityOnHand)}
                    </TableUI.TableCell>
                    <TableUI.TableCell className="whitespace-nowrap tabular-nums">
                      {toNumber(product.minimumQuantity)}
                    </TableUI.TableCell>
                  </TableUI.TableRow>
                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={5}
                    rowClassName="bg-muted/30"
                    cellClassName="min-w-0 align-top px-1 py-5"
                    contentClassName="!p-0"
                  >
                    {isExpanded ? (
                    <>
                    <div className="mx-4 flex min-w-0 flex-col gap-4">
                      <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] md:items-stretch md:gap-4">
                        <div className="flex min-h-0 min-w-0 flex-col gap-4">
                          <div className="space-y-3 rounded-lg">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-x-4">
                              <label className="block text-sm text-slate-600 md:col-span-2">
                                Name
                                <Input
                                  value={form.name}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    setFormsById((current) => ({
                                      ...current,
                                      [product.id]: { ...form, name: event.target.value },
                                    }))
                                  }
                                  variant="title"
                                />
                              </label>
                              <label className="block text-sm text-slate-600">
                                SKU
                                <Input
                                  value={form.sku}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    setFormsById((current) => ({
                                      ...current,
                                      [product.id]: { ...form, sku: event.target.value },
                                    }))
                                  }
                                  variant="subtitle"
                                />
                              </label>
                              <label className="block text-sm text-slate-600 md:col-span-3">
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
                                  className="mt-1 w-full rounded-md bg-card/40 px-2.5 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-4">
                            <div className="space-y-3 rounded-sm bg-card/40 p-3">
                              <div>
                                <p className="text-lg font-semibold text-slate-900">Lager</p>
                                <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                              </div>
                              <label className="block text-sm text-slate-600">
                                Raum
                                <Select
                                  value={selectedRoomId}
                                  onClick={(event) => event.stopPropagation()}
                                  onValueChange={(nextRoomId) =>
                                    setFormsById((current) => ({
                                      ...current,
                                      [product.id]: {
                                        ...form,
                                        storageRoomId: nextRoomId,
                                        storageLocationId: "",
                                      },
                                    }))
                                  }
                                  options={[
                                    { value: "", label: "Kein Lagerraum" },
                                    ...(storageRoomsQuery.data ?? []).map((storageRoom) => ({
                                      value: storageRoom.id,
                                      label: storageRoom.name,
                                    })),
                                  ]}
                                  className="mt-1 w-full px-2.5 py-2 text-sm text-slate-900"
                                />
                              </label>
                              <label className="block text-sm text-slate-600">
                                Platz
                                <Select
                                  value={form.storageLocationId}
                                  onClick={(event) => event.stopPropagation()}
                                  onValueChange={(nextLocationId) =>
                                    setFormsById((current) => {
                                      const selectedLocation = storageLocationsById.get(nextLocationId);
                                      return {
                                        ...current,
                                        [product.id]: {
                                          ...form,
                                          storageRoomId: selectedLocation?.storageRoomId ?? form.storageRoomId,
                                          storageLocationId: nextLocationId,
                                        },
                                      };
                                    })
                                  }
                                  disabled={!selectedRoomId}
                                  options={[
                                    {
                                      value: "",
                                      label: selectedRoomId ? "Kein Lagerplatz" : "Bitte zuerst Lagerraum wählen",
                                    },
                                    ...filteredStorageLocationsForForm.map((storageLocation) => ({
                                      value: storageLocation.id,
                                      label: `${storageLocation.code} - ${storageLocation.name}`,
                                    })),
                                  ]}
                                  className="mt-1 w-full rounded-sm bg-card/40 px-2.5 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                                />
                              </label>
                            </div>

                            <div className="space-y-3 rounded-md bg-card/40 p-3">
                              <div>
                                <p className="text-lg font-semibold text-slate-900">Mengen & Einheiten</p>
                                <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                              </div>

                                  <div className="relative grid grid-cols-1 gap-3 px-3 sm:grid-cols-3">
                                    <div
                                      className="pointer-events-none absolute inset-y-0 left-1/3 hidden w-px bg-slate-300/40 sm:block"
                                      aria-hidden="true"
                                    />

                                    <label className="block text-sm text-slate-600 text-center sm:pr-3">
                                      Bestand
                                      {(() => {
                                        const quantityOnHand = toNumber(product.quantityOnHand);
                                        const minimumQuantity = toNumber(form.minimumQuantity);
                                        const ratio = minimumQuantity > 0 ? quantityOnHand / minimumQuantity : Number.POSITIVE_INFINITY;
                                        const stockColorClass =
                                          ratio > 1.1 ? "text-primary" : ratio >= 1 ? "text-accent-orange" : "text-destructive";

                                        return (
                                      <input
                                        disabled
                                        value={String(toNumber(product.quantityOnHand))}
                                        className={`mt-1 w-full rounded-sm bg-card/40 px-2.5 py-2 text-sm ${stockColorClass} text-center font-semibold`}
                                      />
                                        );
                                      })()}
                                    </label>
                                    <label className="block text-sm text-slate-600 text-center sm:pl-3">
                                      Minimum
                                      <div className="mt-1 flex justify-center">
                                        <NumberStepper
                                          value={form.minimumQuantity}
                                          min={0}
                                          step={quantityStep}
                                          stopPropagation
                                          className="cursor-default"
                                          onChange={(value) =>
                                            setFormsById((current) => ({
                                              ...current,
                                              [product.id]: { ...form, minimumQuantity: value },
                                            }))
                                          }
                                          decreaseAriaLabel="Minimum verringern"
                                          increaseAriaLabel="Minimum erhoehen"
                                          inputAriaLabel="Minimum"
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
                                          stopPropagation
                                          className="cursor-default"
                                          onChange={(value) =>
                                            setFormsById((current) => ({
                                              ...current,
                                              [product.id]: { ...form, unitStep: value },
                                            }))
                                          }
                                          decreaseAriaLabel="Schritte verringern"
                                          increaseAriaLabel="Schritte erhoehen"
                                          inputAriaLabel="Schritte"
                                        />
                                      </div>
                                    </label>

                                    <label className="block text-sm text-slate-600 text-center sm:pr-3">
                                      Neu einbuchen
                                      <Button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setBookingProduct({ id: product.id, name: product.name });
                                          setBookingError(null);
                                        }}
                                        variant="new"
                                        className="mt-1 h-[38px] shrink-0 w-full text-center"
                                      >
                                        Dialog öffnen
                                      </Button>
                                    </label>

                                    <label className="block text-sm text-slate-600 text-center sm:pl-3">
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
                                        className="mt-1 w-full rounded-sm bg-card/40 py-2 text-sm text-slate-900 text-center"
                                      >
                                        {unitKinds.map((unitKind) => (
                                          <option key={unitKind.value} value={unitKind.value}>
                                            {unitKind.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="block text-sm text-slate-600 text-center sm:pl-3">
                                      <label className="block text-sm text-slate-600 sm:flex-1 text-center">
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
                                              unitStep: String(
                                                getQuantityStepForBaseUnit(
                                                  event.target.value as ProductFormState["baseUnit"],
                                                ),
                                              ),
                                              },
                                            }))
                                          }
                                          className="mt-1 w-full rounded-sm bg-card/40 py-2 text-sm text-slate-900 text-center"
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
                                </div>

                                <div className="space-y-3 rounded-md bg-card/40 p-3">
                                  <div>
                                    <p className="text-lg font-semibold text-slate-900">Sichtbarkeit & Preis</p>
                                    <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setFormsById((current) => ({
                                          ...current,
                                          [product.id]: { ...form, isVisible: !form.isVisible },
                                        }));
                                      }}
                                      className={`flex w-full items-center justify-between gap-3 rounded-sm border-2 bg-card/40 mt-1 px-3 py-2 text-left transition sm:col-span-2 ${
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

                                    <label className="block text-sm text-slate-600 text-center mt-2">
                                      Verkaufspreis
                                      <div className="mt-1 flex w-full">
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          value={form.price}
                                          onClick={(event) => event.stopPropagation()}
                                          onChange={(event) =>
                                            setFormsById((current) => ({
                                              ...current,
                                              [product.id]: { ...form, price: event.target.value },
                                            }))
                                          }
                                          className="!h-9 !rounded-l-sm !rounded-r-none !bg-transparent pl-4 py-2 text-sm text-slate-900 text-center"
                                        />
                                        <span className="inline-flex items-center rounded-r-sm bg-card/80 px-2.5 text-sm text-slate-700">
                                          €
                                        </span>
                                      </div>
                                    </label>

                                    <label className="block text-sm text-slate-600 text-center mt-2">
                                      Gesamtvermögen
                                      <div className="mt-1 flex w-full">
                                        <input
                                          disabled
                                          value={(() => {
                                            const price = parseMoneyInput(form.price);
                                            const stock = toNumber(product.quantityOnHand);
                                            const total =
                                              Number.isFinite(price) && Number.isFinite(stock) ? price * stock : NaN;
                                            return formatMoneyDeAt(total);
                                          })()}
                                          onClick={(event) => event.stopPropagation()}
                                          className="w-full !rounded-l-sm bg-card/40 pl-2.5 py-2 text-sm text-slate-600 font-semibold text-center"
                                        />
                                        <span className="inline-flex items-center rounded-r-sm bg-card/80 px-2.5 text-sm text-slate-700">
                                          €
                                        </span>
                                      </div>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex min-h-0 min-w-0 flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden md:self-stretch">
                              <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-md bg-card/40 p-3 md:min-h-0 md:overflow-hidden">
                                <div className="shrink-0 space-y-3">
                                  <p className="text-lg font-semibold text-slate-900">Kategorien</p>
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
                                            className="max-w-full cursor-pointer gap-1.5"
                                            aria-label={`Kategorie ${assigned.name} entfernen`}
                                          >
                                            <span className="truncate font-medium">{assigned.name}
                                              <span className="text-destructive"> X
                                              </span>
                                            </span>
                                          </Button>
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
                                    className="h-9 rounded-md text-sm"
                                    aria-label="Kategorien filtern"
                                  />
                                </div>
                                <div
                                  className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-sm bg-card/40 max-h-80"
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
                                          className="flex cursor-pointer items-center gap-2 text-sm text-slate-900 hover:bg-card/80"
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
                                            className="h-4 w-4 shrink-0"
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

                          <div className="rounded-md bg-card/40 p-3 min-w-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditMediaSectionCollapsedById((current) => ({
                                  ...current,
                                  [product.id]: !(current[product.id] ?? true),
                                }));
                              }}
                              className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-md"
                              aria-expanded={!(editMediaSectionCollapsedById[product.id] ?? true)}
                              aria-controls={`edit-media-section-${product.id}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-lg font-semibold text-slate-900">Bilder & Dokumente</p>
                                <span
                                  aria-hidden="true"
                                  className="shrink-0 text-slate-500"
                                  title={(editMediaSectionCollapsedById[product.id] ?? true) ? "Ausklappen" : "Einklappen"}
                                >
                                  <ChevronDownIcon
                                    open={!(editMediaSectionCollapsedById[product.id] ?? true)}
                                    className="h-4 w-4"
                                  />
                                </span>
                              </div>
                              {!(editMediaSectionCollapsedById[product.id] ?? true) ? (
                                <div className="mt-2 h-px w-full bg-slate-300/70" aria-hidden="true" />
                              ) : null}
                            </button>

                            {!(editMediaSectionCollapsedById[product.id] ?? true) ? (
                              <div id={`edit-media-section-${product.id}`} className="space-y-3 pt-3">

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 md:items-stretch">
                              <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                    <div>
                                      <p className="select-none text-sm text-slate-600">Bild hochladen</p>
                                      <label
                                        className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-violet-400/70 bg-card/40 p-3 text-sm ${
                                          editUploadPendingById[product.id]
                                            ? "cursor-default opacity-90"
                                            : "cursor-pointer hover:bg-violet-100"
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
                                              toast.error("Bitte zuerst eine SKU eingeben.");
                                              event.target.value = "";
                                              return;
                                            }
                                            if (!file.type.startsWith("image/")) {
                                              toast.error("Bitte eine Bilddatei auswaehlen.");
                                              event.target.value = "";
                                              return;
                                            }
                                            if (file.size > MAX_UPLOAD_BYTES) {
                                              toast.error("Das Bild ist zu gross. Maximal 8 MB erlaubt.");
                                              event.target.value = "";
                                              return;
                                            }
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
                                          className={`inline-flex shrink-0 rounded-sm bg-violet-600 px-3 py-2 text-sm font-semibold text-white ${
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

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          const openSource =
                                            form.imageUrl.trim() || pendingEditImage?.previewUrl || "";
                                          const href = resolveImageTabUrl(openSource);
                                          if (href) window.open(href, "_blank", "noopener,noreferrer");
                                        }}
                                        className={`relative h-48 w-full shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 sm:h-56 sm:w-56 md:h-64 md:w-64 ${
                                          form.imageUrl.trim() || pendingEditImage?.previewUrl
                                            ? "cursor-pointer transition hover:ring-2 hover:ring-violet-400/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
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
                                          <Input
                                            type="text"
                                            inputMode="url"
                                            autoComplete="off"
                                            value={form.imageUrl}
                                            disabled={urlFieldDisabled}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => {
                                              setImageFieldsTouchedById((current) => ({
                                                ...current,
                                                [product.id]: true,
                                              }));
                                              setFormsById((current) => ({
                                                ...current,
                                                [product.id]: {
                                                  ...(current[product.id] ?? createInitialForm(product)),
                                                  imageUrl: event.target.value,
                                                },
                                              }));
                                            }}
                                            placeholder={
                                              urlFieldDisabled
                                                ? "—"
                                                : "Nach Auswahl aus Liste oder nach Speichern"
                                            }
                                            className={`h-9 mt-1 w-full px-2.5 py-2 text-sm ${
                                              urlFieldDisabled
                                                ? "cursor-not-allowed bg-slate-50 text-slate-500"
                                                : "text-slate-900"
                                            }`}
                                          />
                                        </div>
                                        <div className="block text-xs text-slate-600">
                                          <span className="select-none">Bild-Alt-Text</span>
                                          <Input
                                            value={form.imageAltText}
                                            disabled={altFieldDisabled}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => {
                                              setImageFieldsTouchedById((current) => ({
                                                ...current,
                                                [product.id]: true,
                                              }));
                                              setFormsById((current) => ({
                                                ...current,
                                                [product.id]: {
                                                  ...(current[product.id] ?? createInitialForm(product)),
                                                  imageAltText: event.target.value,
                                                },
                                              }));
                                            }}
                                            placeholder={
                                              altFieldDisabled
                                                ? "—"
                                                : imageFilePending
                                                  ? "Vor Speichern für das neue Bild eintragen"
                                                  : "Bearbeiten, mit Speichern übernehmen"
                                            }
                                            className={`h-9 mt-1 w-full px-2.5 py-2 text-sm ${
                                              altFieldDisabled
                                                ? "cursor-not-allowed text-slate-500"
                                                : "text-slate-900"
                                            }`}
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-auto border-t border-slate-300/80 pt-3">
                                      <p className="mb-2 text-xs font-medium text-slate-700">Alle Bilder</p>
                                      <div className="max-h-56 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                                        {(product.images ?? []).length === 0 ? (
                                          <p className="text-xs text-muted-foreground">Keine Bilder vorhanden.</p>
                                        ) : (
                                          <div className="grid grid-cols-3 gap-2">
                                            {(product.images ?? []).map((image, imageIndex) => {
                                              const isSelected = editSelectedImageIdById[product.id] === image.id;
                                              const deleteKey = `${product.id}:${image.id}`;
                                              const sizeBytes = image.sizeBytes ?? null;
                                              const displayImagePath = (() => {
                                                try {
                                                  const pathname = new URL(image.url, "http://dummy").pathname;
                                                  const file = pathname.split("/").pop() ?? "";
                                                  return file ? `${file}` : pathname || image.url;
                                                } catch {
                                                  return image.url;
                                                }
                                              })();

                                              return (
                                                <div
                                                  key={image.id ?? `${image.url}-${imageIndex}`}
                                                  className={`relative rounded-sm border-b-2 bg-card/80 p-1.5 transition ${
                                                    isSelected
                                                      ? "border-violet-400/80 border-b-2"
                                                      : "border-transparent"
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
                                                    className="flex w-full min-w-0 items-center gap-2 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/80"
                                                  >
                                                    <img
                                                      src={image.url}
                                                      alt={
                                                        image.altText || `${form.name} Produktbild ${imageIndex + 1}`
                                                      }
                                                      className="h-14 w-14 shrink-0 rounded-xs object-cover"
                                                      onError={(errEvent) => {
                                                        errEvent.currentTarget.onerror = null;
                                                        errEvent.currentTarget.src = "/pictures/placeholder.jpg";
                                                      }}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px] leading-snug" >
                                                        <span className="text-slate-600 font-semibold">
                                                          Name:
                                                        </span>
                                                        <span className="break-all text-slate-700">
                                                          {displayImagePath}
                                                        </span>

                                                        <span className="text-slate-600 font-semibold">
                                                          Alt-Text:
                                                        </span>
                                                        <span
                                                          className={`min-w-0 ${
                                                            image.altText
                                                              ? "line-clamp-2 text-slate-600"
                                                              : "text-muted-foreground"
                                                          }`}
                                                        >
                                                          {image.altText ? image.altText : "—"}
                                                        </span>

                                                        <span className="text-slate-600 font-semibold">
                                                          Größe:
                                                        </span>
                                                        <span className="tabular-nums text-muted-foreground">
                                                          {sizeBytes != null ? formatBytes(sizeBytes) : "—"}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
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
                                                    className="absolute bottom-1 right-1 h-8 w-8 p-0 rounded-xs text-slate-600 hover:bg-destructive hover:text-white"
                                                    aria-label="Bild entfernen"
                                                  >
                                                    {imageDeletePendingKey === deleteKey ? (
                                                      <span className="text-xs">...</span>
                                                    ) : (
                                                      <WastebinIcon size={16} className="opacity-90" />
                                                    )}
                                                  </Button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                              <div className="flex min-h-0 flex-col gap-3 md:h-full">
                                <div>
                                  <p className="select-none text-sm text-slate-600">Dokument hochladen</p>
                                  <label
                                    className={`group mt-2 flex w-full min-w-0 select-none items-center gap-3 rounded-md border-2 border-dashed border-amber-500/65 bg-card/40 p-3 text-sm ${
                                      editDocumentUploadPendingById[product.id]
                                        ? "cursor-default opacity-90"
                                        : "cursor-pointer hover:bg-amber-100"
                                    }`}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-busy={editDocumentUploadPendingById[product.id] ? true : undefined}
                                  >
                                    <input
                                      type="file"
                                      accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                      disabled={!!editDocumentUploadPendingById[product.id]}
                                      className="sr-only"
                                      onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          setEditDocumentUploadPendingById((current) => ({
                                            ...current,
                                            [product.id]: true,
                                          }));
                                          await uploadProductDocument(product.id, file);
                                          await utils.product.backendList.invalidate();
                                          toast.success("Dokument hochgeladen.");
                                        } catch (error) {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : "Dokument konnte nicht hochgeladen werden.",
                                          );
                                        } finally {
                                          setEditDocumentUploadPendingById((current) => ({
                                            ...current,
                                            [product.id]: false,
                                          }));
                                          event.target.value = "";
                                        }
                                      }}
                                    />
                                    <span
                                      className={`inline-flex shrink-0 rounded-sm bg-amber-700 px-3 py-2 text-sm font-semibold text-white ${
                                        editDocumentUploadPendingById[product.id]
                                          ? "opacity-70"
                                          : "group-hover:bg-amber-800"
                                      }`}
                                    >
                                      Datei auswählen
                                    </span>
                                    <span
                                      className={`min-w-0 flex-1 break-all text-left text-sm ${
                                        editDocumentUploadPendingById[product.id]
                                          ? "text-muted-foreground"
                                          : "text-slate-500"
                                      }`}
                                      role="status"
                                    >
                                      {editDocumentUploadPendingById[product.id]
                                        ? "Dokument wird hochgeladen..."
                                        : "Keine Datei ausgewählt"}
                                    </span>
                                  </label>
                                </div>

                                <div className="mt-auto space-y-1.5 border-t border-slate-300/80 pt-3">
                                  <p className="mb-1 text-xs font-medium text-slate-700">Alle Dokumente</p>
                                  {(product.documents ?? []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Keine Dokumente vorhanden.</p>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                      {(product.documents ?? []).map((document) => (
                                        <div
                                          key={document.id}
                                          className="flex items-center justify-between gap-2 rounded-sm bg-card/80 px-2 py-1.5"
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
                                              variant="ghost"
                                              onClick={async (event) => {
                                                event.stopPropagation();
                                                try {
                                                  setEditDocumentUploadPendingById((current) => ({
                                                    ...current,
                                                    [product.id]: true,
                                                  }));
                                                  await deleteProductDocument(document.id);
                                                  await utils.product.backendList.invalidate();
                                                  toast.success("Dokument geloescht.");
                                                } catch (error) {
                                                  toast.error(
                                                    error instanceof Error
                                                      ? error.message
                                                      : "Dokument konnte nicht geloescht werden.",
                                                  );
                                                } finally {
                                                  setEditDocumentUploadPendingById((current) => ({
                                                    ...current,
                                                    [product.id]: false,
                                                  }));
                                                }
                                              }}
                                              disabled={editDocumentUploadPendingById[product.id]}
                                              className="h-8 w-8 p-0 rounded-xs text-slate-600 transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                                              aria-label="Dokument entfernen"
                                            >
                                              {editDocumentUploadPendingById[product.id] ? (
                                                <span className="text-xs">...</span>
                                              ) : (
                                                <WastebinIcon size={16} className="opacity-90" />
                                              )}
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                                </div>
                              </div>
                            ) : null}
                          </div>

                        </div>

                    <BookingHistory productId={product.id} />
                    </>
                    ) : null}
                  </TableUI.TableExpandableRow>
                            </Fragment>
                          );
                        })
                      )
                    ) : null}
                </Fragment>
              );
                })
              : null}
          </TableUI.TableBody>
        </TableUI.Table>
      </div>
      {!showNearMinimumOnly && productsQuery.hasNextPage ? (
        <div className="mt-4">
          <div ref={loadMoreRef} className="h-px w-full" aria-hidden="true" />
          {productsQuery.isFetchingNextPage ? (
            <p className="mt-3 text-sm text-muted-foreground">Lade mehr...</p>
          ) : null}
        </div>
      ) : null}
      {showNearMinimumOnly && hasMoreNearMinimumProducts ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNearMinimumVisibleCount((current) => current + NEAR_MINIMUM_PAGE_SIZE);
            }}
          >
            Mehr laden
          </Button>
        </div>
      ) : null}

      <UnsavedChangesBar
        open={!!expandedRowId && hasUnsavedChanges}
        title={expandedProduct?.name ?? "Produkt"}
        onReset={() => {
          if (!expandedProduct) return;
          handleResetProduct(expandedProduct);
        }}
        onSave={() => {
          if (!expandedProduct) return;
          void handleSaveProduct(expandedProduct);
        }}
        saveDisabled={
          updateMutation.isPending ||
          (expandedRowId !== null ? !!editUploadPendingById[expandedRowId] : false) ||
          addProductImageMutation.isPending ||
          (expandedRowId !== null ? !!editDocumentUploadPendingById[expandedRowId] : false)
        }
        resetDisabled={updateMutation.isPending}
        saveLabel={
          updateMutation.isPending ||
          (expandedRowId !== null ? !!editUploadPendingById[expandedRowId] : false) ||
          addProductImageMutation.isPending
            ? "Speichert..."
            : "Speichern"
        }
      />

      {bookingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Einbuchen</h3>
            <p className="mt-1 text-sm text-muted-foreground">{bookingProduct!.name}</p>

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
                  if (!bookingProduct) return;
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
