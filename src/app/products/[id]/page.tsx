"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import { ShopAddToCartButton, ShopQuantityStepper } from "~/components/shop/shop-quantity-add-to-cart";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";
import { CheckIcon, ClipboardCopyIcon, PackageIcon } from "~/components/layout/icon-renders";
import { ProductImageGallery } from "../../../components/shop/product-image-gallery";

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

function formatBaseUnitLabel(baseUnit: string) {
  return baseUnit.toLowerCase().replace("2", "²");
}

/** Rot: Bestand ≤ Mindestbestand. Gelb: darüber bis einschließlich 110 % des Mindestbestands. Grün: über 110 %. */
function stockAvailabilityDotClass(minimum: number, onHand: number): string {
  if (minimum <= 0) return "bg-muted-foreground/45";
  if (onHand <= minimum) return "bg-red-500";
  if (onHand <= minimum * 1.1) return "bg-amber-400";
  return "bg-emerald-500";
}

function stockAvailabilityTitle(minimum: number, onHand: number): string {
  if (minimum <= 0) return "Bestandslage (kein Mindestbestand hinterlegt)";
  if (onHand <= minimum) return "Kritisch: Bestand am oder unter dem Mindestbestand";
  if (onHand <= minimum * 1.1) return "Niedrig: Bestand nahe am Mindestbestand";
  return "Ausreichend: Bestand über dem Warnbereich";
}

function StockOnHandLine({
  quantityOnHand,
  minimumQuantity,
  baseUnit,
  align = "start",
}: {
  quantityOnHand: unknown;
  minimumQuantity: unknown;
  baseUnit: string;
  align?: "start" | "center";
}) {
  const onHand = decimalToNumber(quantityOnHand);
  const minimum = decimalToNumber(minimumQuantity);
  const dotClass = stockAvailabilityDotClass(minimum, onHand);
  const title = stockAvailabilityTitle(minimum, onHand);
  const unitLabel = formatBaseUnitLabel(baseUnit);

  const srSummary = `Bestand ${formatInventoryQuantity(onHand)} ${unitLabel}. ${title}`;

  return (
    <div
      className={[
        "-mt-1 mb-2 flex items-center gap-1.5 text-sm",
        align === "center" ? "justify-center" : "justify-start",
      ].join(" ")}
    >
      <p className="sr-only">{srSummary}</p>
      <span
        className={["h-2 w-2 shrink-0 rounded-full", dotClass].join(" ")}
        title={title}
        aria-hidden
      />
      <PackageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-semibold tabular-nums text-foreground">{formatInventoryQuantity(onHand)}</span>
      <span className="text-muted-foreground">{unitLabel}</span>
      <span className="text-muted-foreground">verfügbar</span>
    </div>
  );
}

function formatDecimal(value: number, fractionDigits = 3) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatInventoryQuantity(value: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ProductDetailTab = "details" | "documents";

const SKU_COPY_FEEDBACK_MS = 1500;

function SkuCopyButton({ sku }: { sku: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center justify-center border-l border-border px-2 text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      title={copied ? "SKU kopiert" : "SKU in die Zwischenablage kopieren"}
      aria-label={copied ? "SKU kopiert" : "SKU in die Zwischenablage kopieren"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sku);
        } catch {
          return;
        }
        setCopied(true);
        if (resetRef.current) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => {
          setCopied(false);
          resetRef.current = null;
        }, SKU_COPY_FEEDBACK_MS);
      }}
    >
      <span className="relative inline-flex h-[14px] w-[14px] items-center justify-center">
        <span
          className={[
            "transition-opacity duration-200 ease-out",
            copied ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          aria-hidden
        >
          <ClipboardCopyIcon size={14} />
        </span>
        <span
          className={[
            "absolute inset-0 flex items-center justify-center text-green-600 transition-opacity duration-200 ease-out",
            copied ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          aria-hidden
        >
          <CheckIcon size={14} />
        </span>
      </span>
    </button>
  );
}

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showCartModal, setShowCartModal] = useState(false);
  const [lastAddedProductQuantity, setLastAddedProductQuantity] = useState<number | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [areaWidthInput, setAreaWidthInput] = useState("1");
  const [areaHeightInput, setAreaHeightInput] = useState("1");
  const [partListWarning, setPartListWarning] = useState<string | null>(null);
  const [productDetailTab, setProductDetailTab] = useState<ProductDetailTab>("details");
  const stickyTopOffset = 24;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const productQuery = api.product.byId.useQuery({ id: productId }, { enabled: Boolean(productId) });
  const categoriesQuery = api.category.list.useQuery();
  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
      setShowCartModal(true);
    },
    onError: (error) => {
      setPartListWarning(error.message);
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
    const step = Math.max(decimalToNumber(productQuery.data.unitStep), 0.001);
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
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Produkt wird geladen...</p>
          <p className="mt-1 text-sm text-muted-foreground">Bitte kurz warten.</p>
        </div>
      </main>
    );
  }

  if (productQuery.error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-destructive shadow-sm">
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
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
  const unitStep = Math.max(decimalToNumber(product.unitStep), 0.001);
  const parsedQuantity = Number(quantityInput);
  const areaWidth = Number(areaWidthInput);
  const areaHeight = Number(areaHeightInput);
  const areaInSquareMillimeters =
    Number.isFinite(areaWidth) && areaWidth > 0 && Number.isFinite(areaHeight) && areaHeight > 0
      ? areaWidth * areaHeight
      : 0;
  const computedAreaQuantity =
    product.baseUnit === "CM2"
      ? areaInSquareMillimeters / 100
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
      ? [{ id: "placeholder", url: "/pictures/placeholder.jpg", altText: null }]
      : product.images;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-6 px-2 py-6 sm:px-4 lg:px-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_340px]">
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
        <Card className="self-start rounded-2xl p-6 shadow-sm">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
            <span aria-hidden="true">←</span>
            Zurück zur Produktliste
          </Link>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ProductImageGallery images={images} productName={product.name} />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{product.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="inline-flex max-w-full min-h-0 items-stretch overflow-hidden rounded-full border border-border bg-muted/50 text-sm text-foreground shadow-sm">
                  <Link
                    href={`/?search=${encodeURIComponent(product.sku)}`}
                    className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1.5 px-3 py-1 transition hover:border-primary/45 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title={`Alle Produkte mit dieser SKU anzeigen`}
                  >
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      SKU
                    </span>
                    <span className="truncate font-medium tabular-nums">{product.sku}</span>
                  </Link>
                  <SkuCopyButton key={product.id} sku={product.sku} />
                </div>
                {product.storageLocation ? (
                  <Link
                    href={`/?storageLocationId=${encodeURIComponent(product.storageLocation.id)}`}
                    className="inline-flex max-w-full min-h-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-foreground shadow-sm transition hover:border-primary/45 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <p className="shrink-0 text-base font-semibold tabular-nums text-primary pr-1 text-xs">
                    / {product.baseUnit}
                  </p>
                </div>
                <div className="mt-2">
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
                  <ShopQuantityStepper
                    value={quantityInput}
                    onChange={setQuantityInput}
                    min={unitStep}
                    max={stockOnHand}
                    step={unitStep}
                    decreaseAriaLabel={`Menge fuer ${product.name} reduzieren`}
                    increaseAriaLabel={`Menge fuer ${product.name} erhoehen`}
                    inputAriaLabel={`Menge fuer ${product.name}`}
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
                />
              </div>
            </div>
          </div>
        </Card>

        <section
          className="overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm"
          aria-label="Produktdetails"
        >
          <div
            className="flex flex-wrap gap-0 border-b border-border bg-card/50"
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
                  <div className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40">
                    <p className="truncate text-sm font-medium text-primary">Beschreibung</p>
                    <div className="mt-2 border-t border-border/60 pt-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {product.description}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-white p-3 shadow-sm dark:bg-card">
                  <p className="truncate text-sm font-medium text-primary">Kategorien</p>
                  <div className="mt-2 border-t border-border/60 pt-2.5">
                    {categoryEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categoryEntries.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/?categoryId=${encodeURIComponent(cat.id)}`}
                            className="inline-flex max-w-full min-h-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-foreground shadow-sm transition hover:border-primary/45 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      className="block rounded-lg border border-border bg-card p-3 transition hover:border-primary/50"
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
          warning={partListWarning}
          onWarningChange={setPartListWarning}
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
