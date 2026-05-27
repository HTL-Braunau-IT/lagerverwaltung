"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, DetailText } from "~/components/ui/detail-card";
import { useToast } from "~/components/ui/toast";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import { ProductImageCarousel } from "~/components/shop/product-image-carousel";
import { StockOnHandLine } from "~/components/shop/stock-on-hand-line";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";
import { ShopAddToCartButton } from "~/components/shop/shop-quantity-add-to-cart";
import { NumberStepper } from "~/components/ui/number-stepper";
import {
  useShopFiltersPublisher,
  useShopProductCountPublisher,
} from "~/components/shop/shop-product-count-context";
import { getQuantityStepForBaseUnit } from "~/lib/quantity-rules";

const SESSION_STORAGE_KEY = "lw_cart_session_id";

function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

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
  const amount = decimalToNumber(value);
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
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

export function Storefront() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const toast = useToast();
  const searchFromUrl = searchParams.get("search") ?? "";
  const categoryFromUrl = searchParams.get("categoryId") ?? undefined;
  const storageLocationIdFromUrl = searchParams.get("storageLocationId") ?? undefined;
  const [sessionId, setSessionId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(categoryFromUrl);
  const [selectedStorageLocationId, setSelectedStorageLocationId] = useState<string | undefined>(
    storageLocationIdFromUrl,
  );
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [searchTerm, setSearchTerm] = useState(searchFromUrl.trim());
  const [activeAddProductId, setActiveAddProductId] = useState<string | null>(null);
  const [quantitiesByProduct, setQuantitiesByProduct] = useState<Record<string, string>>({});
  const [showCartModal, setShowCartModal] = useState(false);
  const [lastAddedProductName, setLastAddedProductName] = useState<string | null>(null);
  const [lastAddedProductQuantity, setLastAddedProductQuantity] = useState<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const publishShopProductCount = useShopProductCountPublisher();
  const { setHasActiveFilters, resetFiltersRef } = useShopFiltersPublisher();
  const canSeePartListProductCount =
    session?.user.role === "ADMIN" || session?.user.role === "TEACHER";
  // Match space below the header to the grid: main `pt-10` (40px) + section `mt-2` (8px).
  // Header uses `sticky top-5`; gap is accounted for in `stickyStyle` via `APP_HEADER_STICKY_TOP_PX`.
  const stickyTopOffset = 48;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    setSelectedStorageLocationId(storageLocationIdFromUrl ?? undefined);
  }, [storageLocationIdFromUrl]);

  useEffect(() => {
    const updateAppHeaderOffset = () => {
      const appHeader = document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
      setAppHeaderOffset(appHeader?.offsetHeight ?? 0);
    };

    updateAppHeaderOffset();
    window.addEventListener("resize", updateAppHeaderOffset);
    return () => window.removeEventListener("resize", updateAppHeaderOffset);
  }, []);

  const productQuery = api.product.list.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      categoryId: selectedCategoryId,
      storageLocationId: selectedStorageLocationId,
      limit: 24,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
      setShowCartModal(true);
      setActiveAddProductId(null);
    },
    onError: (error) => {
      const warning = toMixedStorageRoomWarning(error.message);
      setActiveAddProductId(null);
      if (warning) {
        toast.warning(warning);
        return;
      }
      toast.error("Produkt konnte nicht in den Warenkorb gelegt werden.");
    },
  });

  const products = useMemo(
    () =>
      (productQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (product) => decimalToNumber(product.quantityOnHand) > 0,
      ),
    [productQuery.data?.pages],
  );
  const hasProducts = products.length > 0;
  const firstPage = productQuery.data?.pages[0];
  const filteredProductCount = firstPage?.filteredAvailableCount ?? products.length;
  const totalProductCount = firstPage?.totalAvailableCount ?? filteredProductCount;
  const hasActiveFilters =
    Boolean(searchTerm) || Boolean(selectedCategoryId) || Boolean(selectedStorageLocationId);

  const resetShopFilters = useCallback(() => {
    setSearchInput("");
    setSearchTerm("");
    setSelectedCategoryId(undefined);
    setSelectedStorageLocationId(undefined);
    router.replace("/");
  }, [router]);

  useEffect(() => {
    resetFiltersRef.current = resetShopFilters;
    return () => {
      resetFiltersRef.current = null;
    };
  }, [resetFiltersRef, resetShopFilters]);

  useEffect(() => {
    setHasActiveFilters(hasActiveFilters);
    return () => setHasActiveFilters(false);
  }, [hasActiveFilters, setHasActiveFilters]);

  useEffect(() => {
    publishShopProductCount({
      filtered: filteredProductCount,
      total: totalProductCount,
      isLoading: productQuery.isLoading,
    });
    return () => publishShopProductCount(null);
  }, [
    publishShopProductCount,
    filteredProductCount,
    totalProductCount,
    productQuery.isLoading,
  ]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    if (!productQuery.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (productQuery.isFetchingNextPage) return;
        void productQuery.fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    productQuery.fetchNextPage,
    productQuery.hasNextPage,
    productQuery.isFetchingNextPage,
    products.length,
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-[calc(90%-2rem)] flex-col gap-0 pt-10 pb-6 sm:w-[calc(90%-3rem)] lg:w-[calc(90%-4rem)]">
      <section className="mt-2 grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)] 3xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <ShopCategoriesAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          selectedCategoryId={selectedCategoryId}
          onSelectedCategoryIdChange={setSelectedCategoryId}
        />

        <div className="grid auto-rows-max content-start gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-3 [@media(min-width:2200px)]:grid-cols-5">
          {productQuery.isLoading && (
            <div className="col-span-full p-5 text-muted-foreground">
              <p className="text-sm font-medium text-foreground">Produkte werden geladen...</p>
              <p className="mt-1 text-sm">Bitte kurz warten.</p>
            </div>
          )}

          {productQuery.error && (
            <div className="col-span-full rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-destructive">
              <p className="text-sm font-semibold">Produkte konnten nicht geladen werden.</p>
              <p className="mt-1 text-sm">
                Pruefe die Verbindung und versuche es erneut.
              </p>
              <Button
                onClick={() => void productQuery.refetch()}
                variant="outline"
                className="mt-3"
              >
                Erneut laden
              </Button>
            </div>
          )}

          {!productQuery.isLoading && !productQuery.error && !hasProducts && (
            <Card variant="detail" className="col-span-full p-5 !text-center hover:!bg-card/40">
              <DetailText variant="title" className="font-semibold">
                {hasActiveFilters
                  ? "Keine Treffer für deine Suche."
                  : "Aktuell sind keine Produkte verfügbar."}
              </DetailText>
              <DetailText variant="subvalue" className="mt-1">
                {hasActiveFilters
                  ? "Passe Suche oder Kategorie an, um weitere Produkte zu sehen."
                  : "Sobald Produkte angelegt sind, erscheinen sie hier."}
              </DetailText>
              {hasActiveFilters && (
                <Button
                  onClick={resetShopFilters}
                  variant="solid"
                  className="mt-3 max-w-sm"
                >
                  Filter zurücksetzen
                </Button>
              )}
            </Card>
          )}

          {products.map((product) => {
            const quantityInput = quantitiesByProduct[product.id] ?? "1";
            const unitStep = getQuantityStepForBaseUnit(product.baseUnit);
            const stockOnHand = decimalToNumber(product.quantityOnHand);
            const parsedQuantity = Number(quantityInput);
            const selectedQuantity =
              Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : unitStep;
            const canAddToCart = stockOnHand > 0 && selectedQuantity <= stockOnHand;
            const storageRoomName = product.storageLocation?.storageRoom?.name?.trim() ?? "";
            const storageRoomBadgeLetter = storageRoomName ? storageRoomName[0]?.toUpperCase() : null;
            const storageRoomHue = storageRoomName ? hueFromString(storageRoomName) : null;
            return (
              <Card
                key={product.id}
                role="button"
                variant="product"
                tabIndex={0}
                onClick={() => router.push(`/products/${product.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/products/${product.id}`);
                  }
                }}
                className="!bg-card/60 relative cursor-pointer overflow-hidden rounded-2xl !p-0 transition hover:border-primary/50"
              >
                {storageRoomBadgeLetter && (
                  <div
                    className="absolute right-0 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-bl-md text-[10px] font-semibold leading-none [background-clip:padding-box]"
                    title={`Lagerraum: ${storageRoomName}`}
                    aria-label={`Lagerraum: ${storageRoomName}`}
                    style={
                      storageRoomHue === null
                        ? undefined
                        : {
                            backgroundColor: `hsl(${storageRoomHue} 70% 85%)`,
                            color: `hsl(${storageRoomHue} 40% 22%)`,
                          }
                    }
                  >
                    {storageRoomBadgeLetter}
                  </div>
                )}

                <div className="flex flex-col">
                  <div className="relative overflow-hidden bg-primary/90">
                    <ProductImageCarousel
                      images={product.images}
                      productName={product.name}
                      href={`/products/${product.id}`}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-9 bg-gradient-to-t from-card/20 to-transparent"
                      aria-hidden
                    />
                  </div>

                  <div className="flex min-w-0 flex-col px-3 pb-3 pt-3">
                    <div className="space-y-2">
                      <h2 className="line-clamp-2 min-h-[2lh] text-[15px] font-semibold leading-snug text-foreground">
                        {product.name}
                      </h2>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-lg font-semibold tabular-nums tracking-tight text-primary">
                            {formatPrice(product.price)}
                          </p>
                          <p className="text-xs font-medium tabular-nums text-muted-foreground">
                            / {product.baseUnit === "PCS" ? "STK" : product.baseUnit}
                          </p>
                        </div>
                        <StockOnHandLine
                          quantityOnHand={product.quantityOnHand}
                          minimumQuantity={product.minimumQuantity}
                          baseUnit={product.baseUnit}
                          align="start"
                          size="compact"
                        />
                      </div>
                    </div>

                    <div
                      className="mt-2 flex min-w-0 flex-col gap-3 border-t border-black/5 pt-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex min-w-0 w-full justify-between gap-3">
                        <NumberStepper
                          value={quantityInput}
                          onChange={(value) =>
                            setQuantitiesByProduct((prev) => ({ ...prev, [product.id]: value }))
                          }
                          min={unitStep}
                          step={unitStep}
                          max={stockOnHand > 0 ? stockOnHand : undefined}
                          decreaseAriaLabel={`Menge fuer ${product.name} reduzieren`}
                          increaseAriaLabel={`Menge fuer ${product.name} erhoehen`}
                          inputAriaLabel={`Menge fuer ${product.name}`}
                          stopPropagation
                          className="shrink-0 !rounded-sm !border-0 !bg-card/40 !shadow-none [&_button]:!h-9 !h-9"
                        />
                        <ShopAddToCartButton
                          onClick={() => {
                            const quantity =
                              Number.isFinite(parsedQuantity) && parsedQuantity > 0
                                ? parsedQuantity
                                : unitStep;
                            if (stockOnHand <= 0 || quantity > stockOnHand) return;
                            setActiveAddProductId(product.id);
                            setLastAddedProductName(product.name);
                            setLastAddedProductQuantity(quantity);
                            addItemMutation.mutate({
                              sessionId,
                              productId: product.id,
                              quantity,
                            });
                          }}
                          disabled={
                            sessionId.length === 0 || addItemMutation.isPending || !canAddToCart
                          }
                          pending={addItemMutation.isPending && activeAddProductId === product.id}
                          className="!h-9 !min-h-9 min-w-0 flex-1 !rounded-sm px-4 text-sm font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {productQuery.isFetchingNextPage && (
            <div className="col-span-full rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Weitere Produkte werden geladen...
            </div>
          )}

          {!productQuery.isLoading && hasProducts && (
            <div ref={loadMoreRef} className="col-span-full h-1 w-full" aria-hidden="true" />
          )}
        </div>

        <ShopPartListsAside
          className="flex"
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          sessionId={sessionId}
          canSeePartListProductCount={canSeePartListProductCount}
          onAddedToCart={() => {
            setLastAddedProductName(null);
            setLastAddedProductQuantity(null);
            setShowCartModal(true);
          }}
        />
      </section>

      <CartAddedModal
        open={showCartModal}
        itemName={lastAddedProductName}
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
