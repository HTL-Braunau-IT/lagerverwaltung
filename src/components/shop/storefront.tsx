"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useToast } from "~/components/ui/toast";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";

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

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
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
  const [failedProductImages, setFailedProductImages] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const canSeePartListProductCount =
    session?.user.role === "ADMIN" || session?.user.role === "TEACHER";
  // Match the natural top spacing of the content (main has `py-6` => 24px),
  // so the asides align with the product grid initially and keep that gap when sticky.
  const stickyTopOffset = 24;
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
  const hasActiveFilters =
    Boolean(searchTerm) || Boolean(selectedCategoryId) || Boolean(selectedStorageLocationId);

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
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-6 px-2 py-6 sm:px-4 lg:px-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_340px]">
        <ShopCategoriesAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          selectedCategoryId={selectedCategoryId}
          onSelectedCategoryIdChange={setSelectedCategoryId}
        />

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {productQuery.isLoading && (
            <div className="col-span-full rounded-2xl border border-border bg-card p-5 text-muted-foreground">
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
            <div className="col-span-full rounded-2xl border border-border bg-card p-5 text-muted-foreground">
              <p className="text-sm font-semibold">
                {hasActiveFilters
                  ? "Keine Treffer fuer deine Suche."
                  : "Aktuell sind keine Produkte verfuegbar."}
              </p>
              <p className="mt-1 text-sm">
                {hasActiveFilters
                  ? "Passe Suche oder Kategorie an, um weitere Produkte zu sehen."
                  : "Sobald Produkte angelegt sind, erscheinen sie hier."}
              </p>
              {hasActiveFilters && (
                <Button
                  onClick={() => {
                    setSearchInput("");
                    setSearchTerm("");
                    setSelectedCategoryId(undefined);
                    setSelectedStorageLocationId(undefined);
                    router.replace("/");
                  }}
                  variant="outline"
                  className="mt-3"
                >
                  Filter zuruecksetzen
                </Button>
              )}
            </div>
          )}

          {products.map((product) => {
            const previewImage = product.images[0];
            const hasImageError = failedProductImages.has(product.id);
            const showImagePlaceholder = !previewImage?.url || hasImageError;
            const quantityInput = quantitiesByProduct[product.id] ?? "1";
            const unitStep = Math.max(decimalToNumber(product.unitStep), 0.001);
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
                tabIndex={0}
                onClick={() => router.push(`/products/${product.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/products/${product.id}`);
                  }
                }}
                className="relative h-full cursor-pointer overflow-hidden rounded-2xl transition hover:border-primary/50"
              >
                {storageRoomBadgeLetter && (
                  <div
                    className="absolute -right-1 -top-1 z-10 flex h-8 w-8 items-center justify-center rounded-bl-md text-[10px] font-semibold leading-none backdrop-blur-sm border-4 border-white"
                    title={`Lagerraum: ${storageRoomName}`}
                    aria-label={`Lagerraum: ${storageRoomName}`}
                    style={
                      storageRoomHue === null
                        ? undefined
                        : {
                            backgroundColor: `hsla(${storageRoomHue} 70% 85% / 0.9)`,
                            color: `hsl(${storageRoomHue} 40% 22%)`,
                          }
                    }
                  >
                    {storageRoomBadgeLetter}
                  </div>
                )}

                <div className="flex h-full flex-col p-3">
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-border bg-muted">
                      {showImagePlaceholder ? (
                        <div
                          className="flex h-40 w-full items-center justify-center bg-slate-100 text-xs font-medium text-slate-500"
                          aria-label={`${product.name} Platzhalterbild`}
                        >
                          Kein Produktbild
                        </div>
                      ) : (
                        <img
                          src={previewImage.url}
                          alt={previewImage.altText ?? `${product.name} Produktbild`}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                          onError={() => {
                            setFailedProductImages((prev) => {
                              if (prev.has(product.id)) return prev;
                              const next = new Set(prev);
                              next.add(product.id);
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                        {product.name}
                      </h2>
                      <div className="flex items-start justify-between gap-3">
                        <p className="shrink-0 text-base font-semibold tabular-nums text-primary pr-1">
                          {formatPrice(product.price)} 
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-2">
                    <div
                      className="flex w-full items-start gap-2 bg-white"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex min-w-0 flex-col items-center gap-1">
                        <div className="flex h-8 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const currentQuantity =
                                Number.isFinite(parsedQuantity) && parsedQuantity > 0
                                  ? parsedQuantity
                                  : unitStep;
                              const nextQuantity = Math.max(unitStep, currentQuantity - unitStep);
                              setQuantitiesByProduct((prev) => ({
                                ...prev,
                                [product.id]: nextQuantity.toString(),
                              }));
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-8 min-w-6 rounded-none border-r border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
                            aria-label={`Menge fuer ${product.name} reduzieren`}
                          >
                            <span
                            className="block leading-none">
                              -
                            </span>
                          </Button>
                          <input
                            type="number"
                            min={unitStep}
                            max={stockOnHand}
                            step={unitStep}
                            value={quantityInput}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              setQuantitiesByProduct((prev) => ({
                                ...prev,
                                [product.id]: event.target.value,
                              }));
                            }}
                            className="w-8 border-none bg-transparent text-center text-sm font-medium tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label={`Menge fuer ${product.name}`}
                          />
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const currentQuantity =
                                Number.isFinite(parsedQuantity) && parsedQuantity > 0
                                  ? parsedQuantity
                                  : unitStep;
                              const nextQuantity =
                                stockOnHand > 0
                                  ? Math.min(stockOnHand, currentQuantity + unitStep)
                                  : unitStep;
                              setQuantitiesByProduct((prev) => ({
                                ...prev,
                                [product.id]: nextQuantity.toString(),
                              }));
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-8 min-w-6 rounded-none border-l border-border px-1.5 leading-none text-sm text-muted-foreground -translate-y-[1px]"
                            aria-label={`Menge fuer ${product.name} erhoehen`}
                          >
                            <span
                            className="block leading-none">
                              +
                            </span>
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center whitespace-nowrap">
                          Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                        </p>
                      </div>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
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
                        disabled={sessionId.length === 0 || addItemMutation.isPending || !canAddToCart}
                        className="h-8 flex-1 whitespace-nowrap rounded-xl px-3"
                      >
                        {addItemMutation.isPending && activeAddProductId === product.id
                          ? "Hinzufügen..."
                          : "In den Warenkorb"}
                      </Button>
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
