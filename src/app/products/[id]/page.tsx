"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";

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

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
}

function formatDecimal(value: number, fractionDigits = 3) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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
  const stickyTopOffset = 24;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const productQuery = api.product.byId.useQuery({ id: productId }, { enabled: Boolean(productId) });
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

  const categoryName = product.category?.name ?? "Ohne Kategorie";
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

        <Card className="self-start rounded-2xl p-6 shadow-sm">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
            <span aria-hidden="true">←</span>
            Zurück zur Produktliste
          </Link>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="overflow-hidden rounded-xl border border-border bg-muted"
                >
                  <img
                    src={image.url}
                    alt={image.altText ?? `${product.name} Produktbild`}
                    className="h-56 w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/pictures/placeholder.jpg";
                    }}
                  />
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{categoryName}</p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{product.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">SKU: {product.sku}</p>
              <p className="mt-4 text-sm text-foreground">
                {product.description ?? "Keine Beschreibung verfuegbar."}
              </p>

              <div className="mt-5 flex w-full items-start gap-2">
                {isAreaProduct ? (
                  <div className="w-full rounded-xl border border-border bg-muted/40 p-3">
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
                    <p className="mt-2 text-sm text-muted-foreground">
                      Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                    </p>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <div className="flex h-8 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                      <Button
                        type="button"
                        onClick={() => {
                          const currentQuantity = Math.max(Number(quantityInput) || unitStep, unitStep);
                          const nextQuantity = Math.max(unitStep, currentQuantity - unitStep);
                          setQuantityInput(nextQuantity.toString());
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-8 min-w-6 rounded-none border-r border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
                        aria-label={`Menge fuer ${product.name} reduzieren`}
                      >
                        <span className="block leading-none">-</span>
                      </Button>
                      <input
                        type="number"
                        min={unitStep}
                        max={stockOnHand}
                        step={unitStep}
                        value={quantityInput}
                        onChange={(event) => setQuantityInput(event.target.value)}
                        className="w-12 border-none bg-transparent text-center text-sm font-medium tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        aria-label={`Menge fuer ${product.name}`}
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          const currentQuantity = Math.max(Number(quantityInput) || unitStep, unitStep);
                          const nextQuantity = currentQuantity + unitStep;
                          setQuantityInput(nextQuantity.toString());
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-8 min-w-6 rounded-none border-l border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
                        aria-label={`Menge fuer ${product.name} erhoehen`}
                      >
                        <span className="block leading-none">+</span>
                      </Button>
                    </div>
                    <p className="text-xs text-center whitespace-nowrap text-muted-foreground">
                      Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                    </p>
                  </div>
                )}
                <Button
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
                  className="h-8 whitespace-nowrap rounded-xl px-3"
                >
                  {addItemMutation.isPending ? "Wird hinzugefuegt..." : "In den Warenkorb"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

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
