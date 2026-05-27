"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/detail-card";
import { useToast } from "~/components/ui/toast";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import { ShopAddToCartButton, ShopQuantityStepper } from "~/components/shop/shop-quantity-add-to-cart";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";
import { StockOnHandLine } from "~/components/shop/stock-on-hand-line";
import { SkuPill } from "~/components/ui/sku-pill";
import { ProductImageGallery } from "../../../components/shop/product-image-gallery";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";
import { PRODUCT_PLACEHOLDER_IMAGE } from "~/lib/product-placeholder";
import { NumberStepper } from "~/components/ui/number-stepper";

const SESSION_STORAGE_KEY = "lw_cart_session_id";

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatPrice(value: unknown) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(
    decimalToNumber(value),
  );
}

function toMixedStorageRoomWarning(message: string | null | undefined): string | null {
  if (!message) return null;
  if (message.startsWith("MIXED_STORAGE_ROOMS:")) {
    const [, existingRoom, incomingRoom] = message.split(":");
    if (existingRoom && incomingRoom) {
      return `Du hast bereits Produkte aus Lagerraum ${existingRoom} im Warenkorb. Bitte entferne diese zuerst oder schliesse die Bestellung ab, bevor du Produkte aus Lagerraum ${incomingRoom} hinzufuegst.`;
    }
    return "Warenkorb darf nur Produkte aus einem Lagerraum enthalten.";
  }
  if (message === "MIXED_STORAGE_ROOMS") {
    return "Warenkorb darf nur Produkte aus einem Lagerraum enthalten.";
  }
  if (message.startsWith("PRODUCT_WITHOUT_STORAGE_ROOM:")) {
    return "Dieses Produkt ist keinem Lagerraum zugeordnet und kann nicht in den Warenkorb gelegt werden.";
  }
  return null;
}

function formatDecimal(value: number, fractionDigits = 3) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ProductDetailTab = "details" | "documents";

export default function ProductDetailPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = params.id;
  const [sessionId] = useState(() => getOrCreateSessionId());
  const canSeePartListProductCount =
    session?.user.role === "ADMIN" || session?.user.role === "TEACHER";

  const utils = api.useUtils();
  const toast = useToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showCartModal, setShowCartModal] = useState(false);
  const [lastAddedProductQuantity, setLastAddedProductQuantity] = useState<number | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [areaWidthInput, setAreaWidthInput] = useState("1");
  const [areaHeightInput, setAreaHeightInput] = useState("1");
  const [productDetailTab, setProductDetailTab] = useState<ProductDetailTab>("details");
  // Match space below the header to the grid: main `pt-10` (40px) + section `mt-2` (8px).
  // Header uses `sticky top-5`; gap is accounted for in aside `stickyStyle` via measured height.
  const stickyTopOffset = 48;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const productQuery = api.product.byId.useQuery({ id: productId }, { enabled: Boolean(productId) });
  const categoriesQuery = api.category.list.useQuery();
  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
      setShowCartModal(true);
    },
    onError: (error) => {
      const warning = toMixedStorageRoomWarning(error.message);
      if (warning) {
        toast.warning(warning);
        return;
      }
      toast.error("Produkt konnte nicht in den Warenkorb gelegt werden.");
    },
  });

  useEffect(() => {
    const updateAppHeaderOffset = () => {
      const appHeader = document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
      setAppHeaderOffset(appHeader?.offsetHeight ?? 0);
    };

    updateAppHeaderOffset();
    window.addEventListener("resize", updateAppHeaderOffset);
    return () => window.removeEventListener("resize", updateAppHeaderOffset);
  }, []);

  useEffect(() => {
    if (!productQuery.data) return;
    const step = getQuantityStepForBaseUnit(productQuery.data.baseUnit);
    // Avoid synchronous setState directly in the effect body (lint rule).
    queueMicrotask(() => {
      setQuantityInput(step.toString());
      setAreaWidthInput("1");
      setAreaHeightInput("1");
    });
  }, [productQuery.data?.id, productQuery.data?.unitStep]);
  

  if (productQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="p-6">
          <p className="text-sm font-medium text-foreground">Produkt wird geladen...</p>
          <p className="mt-1 text-sm text-muted-foreground">Bitte kurz warten.</p>
        </div>
      </main>
    );
  }

  if (productQuery.error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="bg-destructive/10 p-6 text-destructive">
          <p className="text-sm font-semibold">Produkt konnte nicht geladen werden.</p>
          <p className="mt-1 text-sm">
            Bitte pruefe deine Verbindung und versuche es erneut.
          </p>
          <Button onClick={() => void productQuery.refetch()} variant="outline" className="mt-3">
            Erneut laden
          </Button>
        </div>
      </main>
    );
  }

  if (!productQuery.data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="p-6">
          <p className="text-sm font-semibold text-foreground">Produkt nicht gefunden.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Das Produkt wurde eventuell entfernt oder die URL ist nicht mehr gueltig.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40"
          >
            Zur Produktuebersicht
          </Link>
        </div>
      </main>
    );
  }

  const product = productQuery.data;
  const isAreaProduct = product.unitKind === "AREA";
  const stockOnHand = decimalToNumber(product.quantityOnHand);
  const unitStep = getQuantityStepForBaseUnit(product.baseUnit);
  const parsedQuantity = Number(quantityInput);
  const areaWidth = Number(areaWidthInput);
  const areaHeight = Number(areaHeightInput);
  const areaInSquareMillimeters =
    Number.isFinite(areaWidth) && areaWidth > 0 && Number.isFinite(areaHeight) && areaHeight > 0
      ? areaWidth * areaHeight
      : 0;
  const computedAreaQuantity =
    product.baseUnit === "DM2" || product.baseUnit === "CM2"
      ? areaInSquareMillimeters / 10_000
      : product.baseUnit === "M2"
        ? areaInSquareMillimeters / 1_000_000
        : areaInSquareMillimeters;
  const selectedQuantity = isAreaProduct
    ? computedAreaQuantity
    : Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? parsedQuantity
      : unitStep;
  const canAddToCart = stockOnHand > 0 && selectedQuantity <= stockOnHand;

  const categoryEntries: { id: string; name: string }[] = [];
  const seenCategoryIds = new Set<string>();
  for (const entry of product.categories) {
    const cat = categoriesQuery.data?.find((c) => c.id === entry.categoryId);
    if (cat && !seenCategoryIds.has(cat.id)) {
      seenCategoryIds.add(cat.id);
      categoryEntries.push({ id: cat.id, name: cat.name });
    }
  }
  if (categoryEntries.length === 0 && product.category) {
    categoryEntries.push({ id: product.category.id, name: product.category.name });
  }
  const searchFromUrl = (searchParams.get("search") ?? "").trim();
  const images =
    product.images.length === 0
      ? [{ id: "placeholder", url: PRODUCT_PLACEHOLDER_IMAGE, altText: null }]
      : product.images;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-0 px-2 pt-10 pb-6 sm:px-4 lg:px-6">
      <section className="mt-2 mx-2 grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr_340px]">
        <ShopCategoriesAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          selectedCategoryId={selectedCategoryId}
          onSelectedCategoryIdChange={setSelectedCategoryId}
          onCategoryPicked={(categoryId) => {
            const params = new URLSearchParams();
            if (searchFromUrl) params.set("search", searchFromUrl);
            if (categoryId) params.set("categoryId", categoryId);
            const query = params.toString();
            router.push(query ? `/?${query}` : "/");
          }}
        />

        <div className="flex min-w-0 flex-col gap-6">
        <Card variant="detail" className="p-6 !bg-card/40 hover:!bg-card/40">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
            <span aria-hidden="true">←</span>
            Zurück zur Produktliste
          </Link>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ProductImageGallery images={images} productName={product.name} />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{product.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <SkuPill key={product.id} sku={product.sku} />
                {product.storageLocation ? (
                  <Link
                    href={`/?storageLocationId=${encodeURIComponent(product.storageLocation.id)}`}
                    className="inline-flex max-w-full min-h-0 items-center gap-1.5 rounded-full bg-card/40 px-3 py-1 text-sm text-foreground transition hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`Alle Produkte an diesem Lagerplatz anzeigen`}
                  >
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Lagerplatz
                    </span>
                    <span className="truncate font-medium">{product.storageLocation.name}</span>
                  </Link>
                ) : null}
              </div>
              <div className="mt-5">
                <div className="flex flex-wrap items-baseline gap-1">
                  <p className="shrink-0 text-base font-semibold tabular-nums text-primary pr-1 text-xl">
                    {formatPrice(product.price)} 
                  </p>
                  <p className="text-xs font-medium tabular-nums text-muted-foreground">
                    / {product.baseUnit === "PCS" ? "STK" : product.baseUnit}
                  </p>
                </div>
                <div className="mt-2 ml-0.5">
                  <StockOnHandLine
                    quantityOnHand={product.quantityOnHand}
                    minimumQuantity={product.minimumQuantity}
                    baseUnit={product.baseUnit}
                  />
                </div>
              </div>

              <div className="mt-5 flex w-full flex-nowrap items-center gap-2">
                {isAreaProduct ? (
                  <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Flaeche berechnen
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Breite (mm)</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={areaWidthInput}
                          onChange={(event) => setAreaWidthInput(event.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Hoehe (mm)</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={areaHeightInput}
                          onChange={(event) => setAreaHeightInput(event.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Berechnete Menge:{" "}
                      <span className="font-semibold text-foreground">
                        {formatDecimal(selectedQuantity > 0 ? selectedQuantity : 0)}{" "}
                        {product.baseUnit.toLowerCase().replace("2", "²")}
                      </span>
                      {" · "}
                      {formatDecimal(areaInSquareMillimeters > 0 ? areaInSquareMillimeters : 0, 0)} mm²
                    </p>
                  </div>
                ) : (
                  <NumberStepper
                    value={quantityInput}
                    onChange={setQuantityInput}
                    min={unitStep}
                    max={stockOnHand}
                    step={unitStep}
                    decreaseAriaLabel={`Menge fuer ${product.name} reduzieren`}
                    increaseAriaLabel={`Menge fuer ${product.name} erhoehen`}
                    inputAriaLabel={`Menge fuer ${product.name}`}
                    className="shrink-0 !rounded-sm !border-0 !bg-card/40 !shadow-none [&_button]:!h-9 !h-9"
                  />
                )}
                <ShopAddToCartButton
                  onClick={() => {
                    if (stockOnHand <= 0 || selectedQuantity <= 0 || selectedQuantity > stockOnHand) return;
                    setLastAddedProductQuantity(selectedQuantity);
                    addItemMutation.mutate({
                      sessionId,
                      productId: product.id,
                      quantity: selectedQuantity,
                    });
                  }}
                  disabled={sessionId.length === 0 || addItemMutation.isPending || !canAddToCart}
                  pending={addItemMutation.isPending}
                  className="!h-9 !min-h-9 min-w-0 !w-fit !rounded-sm px-4 text-sm font-semibold"
                />
              </div>
            </div>
          </div>
        </Card>

        <section
          className="overflow-hidden rounded-md bg-card/40"
          aria-label="Produktdetails"
        >
          <div
            className="flex flex-wrap gap-0 border-b border-border bg-card/40"
            role="tablist"
            aria-orientation="horizontal"
          >
            {(
              [
                { id: "details" as const, label: "Details" },
                { id: "documents" as const, label: "Dokumente" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`product-tab-${tab.id}`}
                aria-selected={productDetailTab === tab.id}
                aria-controls={`product-tab-panel-${tab.id}`}
                onClick={() => setProductDetailTab(tab.id)}
                className={[
                  "-mb-px min-h-[44px] border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
                  productDetailTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {productDetailTab === "details" ? (
              <div
                id="product-tab-panel-details"
                role="tabpanel"
                aria-labelledby="product-tab-details"
                className="space-y-2"
              >
                {product.description?.trim() ? (
                  <div className="rounded-sm bg-card/40 p-3">
                    <p className="truncate text-sm font-medium text-primary">Beschreibung</p>
                    <div className="mt-2 border-t border-border/60 pt-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {product.description}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-sm bg-card/40 p-3">
                  <p className="truncate text-sm font-medium text-primary">Kategorien</p>
                  <div className="mt-2 border-t border-border/60 pt-2.5">
                    {categoryEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categoryEntries.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/?categoryId=${encodeURIComponent(cat.id)}`}
                            className="inline-flex max-w-full min-h-0 items-center gap-1.5 rounded-full bg-card/40 px-3 py-1 text-sm text-foreground transition hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title="Alle Produkte in dieser Kategorie anzeigen"
                          >
                            <span className="truncate font-medium">{cat.name}</span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex max-w-full min-h-0 items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                        Ohne Kategorie
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {productDetailTab === "documents" ? (
              <div
                id="product-tab-panel-documents"
                role="tabpanel"
                aria-labelledby="product-tab-documents"
                className="space-y-2"
              >
                {product.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>
                ) : (
                  product.documents.map((document) => (
                    <a
                      key={document.id}
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-sm bg-card/40 p-3 transition hover:bg-card/80"
                    >
                      <p className="truncate text-sm font-medium text-primary">{document.originalName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document.mimeType} · {formatFileSize(document.sizeBytes)}
                      </p>
                    </a>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </section>
        </div>

        <ShopPartListsAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          sessionId={sessionId}
          canSeePartListProductCount={canSeePartListProductCount}
          onAddedToCart={() => setShowCartModal(true)}
        />
      </section>

      <CartAddedModal
        open={showCartModal}
        itemName={product.name}
        itemQuantity={lastAddedProductQuantity}
        onContinueShopping={() => setShowCartModal(false)}
        onGoToCart={() => {
          setShowCartModal(false);
          router.push("/carts");
        }}
      />
    </main>
  );
}
