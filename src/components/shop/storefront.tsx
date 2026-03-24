"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

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
  const amount = decimalToNumber(value);
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
}

export function Storefront() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const searchFromUrl = searchParams.get("search") ?? "";
  const categoryFromUrl = searchParams.get("categoryId") ?? undefined;
  const [sessionId, setSessionId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(categoryFromUrl);
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [searchTerm, setSearchTerm] = useState(searchFromUrl.trim());
  const [activeAddProductId, setActiveAddProductId] = useState<string | null>(null);
  const [activeAddPartListId, setActiveAddPartListId] = useState<string | null>(null);
  const [quantitiesByProduct, setQuantitiesByProduct] = useState<Record<string, string>>({});
  const [quantitiesByPartList, setQuantitiesByPartList] = useState<Record<string, string>>({});
  const [partListWarning, setPartListWarning] = useState<string | null>(null);
  const [showCartModal, setShowCartModal] = useState(false);
  const [failedProductImages, setFailedProductImages] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
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
    const updateAppHeaderOffset = () => {
      const appHeader = document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
      setAppHeaderOffset(appHeader?.offsetHeight ?? 0);
    };

    updateAppHeaderOffset();
    window.addEventListener("resize", updateAppHeaderOffset);
    return () => window.removeEventListener("resize", updateAppHeaderOffset);
  }, []);

  const categoryQuery = api.category.list.useQuery();
  const productQuery = api.product.list.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      categoryId: selectedCategoryId,
      limit: 24,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
  const partListsQuery = api.partsList.listForShop.useQuery();

  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
      setShowCartModal(true);
      setActiveAddProductId(null);
    },
  });
  const addPartListMutation = api.cart.addPartList.useMutation({
    onSuccess: async (result) => {
      await utils.cart.get.invalidate({ sessionId });
      setActiveAddPartListId(null);

      if (result.ok) {
        setPartListWarning(null);
        setShowCartModal(true);
        return;
      }

      if (result.reason === "INSUFFICIENT_PART_LIST_STOCK") {
        setPartListWarning(`${result.partListName}: maximal ${result.maxOrderable}x verfuegbar.`);
        return;
      }

      setPartListWarning("Teileliste konnte nicht hinzugefuegt werden.");
    },
  });

  const setQuantityMutation = api.cart.setItemQuantity.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
    },
  });

  const cartTotal = useMemo(() => {
    const items = cartQuery.data?.items ?? [];
    return items.reduce((total, item) => {
      return total + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
    }, 0);
  }, [cartQuery.data?.items]);

  const cartItems = useMemo(() => cartQuery.data?.items ?? [], [cartQuery.data?.items]);
  const groupedCartItems = useMemo(() => {
    const standalone: typeof cartItems = [];
    const partLists = new Map<string, { id: string; name: string; items: typeof cartItems }>();

    for (const item of cartItems) {
      if (!item.sourcePartListId || !item.sourcePartList) {
        standalone.push(item);
        continue;
      }
      const current = partLists.get(item.sourcePartListId) ?? {
        id: item.sourcePartList.id,
        name: item.sourcePartList.name,
        items: [],
      };
      current.items.push(item);
      partLists.set(item.sourcePartListId, current);
    }

    return { standalone, partLists: [...partLists.values()] };
  }, [cartItems]);
  const products = useMemo(
    () =>
      (productQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (product) => decimalToNumber(product.quantityOnHand) > 0,
      ),
    [productQuery.data?.pages],
  );
  const hasProducts = products.length > 0;
  const hasActiveFilters = Boolean(searchTerm) || Boolean(selectedCategoryId);

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
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_340px]">
        <aside
          className="self-start rounded-2xl border border-border bg-card p-3 shadow-sm lg:sticky lg:overflow-auto"
          style={{
            top: `${appHeaderOffset + stickyTopOffset}px`,
            maxHeight: `calc(100vh - ${appHeaderOffset + stickyTopOffset + 16}px)`,
          }}
        >
          <div>
            <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Teilelisten</p>
            {partListWarning ? (
              <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                {partListWarning}
              </div>
            ) : null}
            {partListsQuery.isLoading ? (
              <p className="px-2 text-xs text-muted-foreground">Teilelisten werden geladen...</p>
            ) : null}
            {partListsQuery.error ? (
              <p className="px-2 text-xs text-destructive">Teilelisten konnten nicht geladen werden.</p>
            ) : null}
            {!partListsQuery.isLoading && !partListsQuery.error && (partListsQuery.data?.length ?? 0) === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Keine Teilelisten verfuegbar.</p>
            ) : null}
            <div className="space-y-2">
              {(partListsQuery.data ?? []).map((partList) => {
                const quantityInput = quantitiesByPartList[partList.id] ?? "1";
                return (
                  <div key={partList.id} className="rounded-lg border border-border bg-muted/40 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="min-w-0 flex-1 break-all text-xs font-semibold leading-snug text-foreground"
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                          overflow: "hidden",
                        }}
                      >
                        {partList.name}
                      </p>
                      <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <span aria-hidden="true" className="text-muted-foreground">
                          |
                        </span>
                        <span>{partList.items.length} Produkte</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={quantityInput}
                        onChange={(event) =>
                          setQuantitiesByPartList((prev) => ({
                            ...prev,
                            [partList.id]: event.target.value,
                          }))
                        }
                        className="h-8 w-12 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                        aria-label={`Menge fuer Teileliste ${partList.name}`}
                      />
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={() => {
                          const requestedQuantity = Math.max(1, Math.floor(Number(quantityInput) || 1));
                          setPartListWarning(null);
                          setActiveAddPartListId(partList.id);
                          addPartListMutation.mutate({
                            sessionId,
                            partListId: partList.id,
                            quantity: requestedQuantity,
                          });
                        }}
                        disabled={sessionId.length === 0 || addPartListMutation.isPending}
                      >
                        {addPartListMutation.isPending && activeAddPartListId === partList.id ? (
                          "..."
                        ) : (
                          "In den Warenkorb"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="my-4 border-t border-border" />
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Kategorien</p>
          <nav className="space-y-1">
            <Button
              onClick={() => setSelectedCategoryId(undefined)}
              variant={selectedCategoryId === undefined ? "secondary" : "ghost"}
              className={`h-9 w-full justify-between rounded-lg px-3 text-left text-sm ${
                selectedCategoryId === undefined ? "" : "text-muted-foreground"
              }`}
            >
              <span>Alle Kategorien</span>
            </Button>
            {categoryQuery.data?.map((category) => (
              <Button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                variant={selectedCategoryId === category.id ? "secondary" : "ghost"}
                className={`h-9 w-full justify-between rounded-lg px-3 text-left text-sm ${
                  selectedCategoryId === category.id ? "" : "text-muted-foreground"
                }`}
              >
                <span className="truncate">{category.name}</span>
                <span className="text-xs">({category._count.products})</span>
              </Button>
            ))}
          </nav>
        </aside>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-1 xl:grid-cols-4">
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
                className="flex h-full cursor-pointer flex-col justify-between rounded-2xl p-4 transition hover:border-primary/50"
              >
                <div>
                  <div className="mb-3 overflow-hidden rounded-xl border border-border bg-muted">
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
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-base font-semibold text-foreground">{product.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {product.description ?? "Keine Beschreibung."}
                  </p>
                </div>
                <div className="mt-2 space-y-2">
                  <p className="text-lg font-semibold text-primary">{formatPrice(product.price)}</p>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    <div
                      className="shrink-0 flex h-10 items-center rounded-xl border border-slate-300 bg-white shadow-sm"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                        variant="ghost"
                        className="h-10 w-8 rounded-none rounded-l-xl border-r border-border px-0 text-muted-foreground"
                        aria-label={`Menge fuer ${product.name} reduzieren`}
                      >
                        -
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
                        className="w-9 border-none bg-transparent text-center text-sm font-medium text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                            stockOnHand > 0 ? Math.min(stockOnHand, currentQuantity + unitStep) : unitStep;
                          setQuantitiesByProduct((prev) => ({
                            ...prev,
                            [product.id]: nextQuantity.toString(),
                          }));
                        }}
                        variant="ghost"
                        className="h-10 w-8 rounded-none border-l border-border px-0 text-muted-foreground"
                        aria-label={`Menge fuer ${product.name} erhoehen`}
                      >
                        +
                      </Button>
                      <span className="pr-2 text-xs text-muted-foreground">{product.baseUnit.toLowerCase()}</span>
                    </div>
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        const quantity =
                          Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : unitStep;
                        if (stockOnHand <= 0 || quantity > stockOnHand) return;
                        setActiveAddProductId(product.id);
                        addItemMutation.mutate({
                          sessionId,
                          productId: product.id,
                          quantity,
                        });
                      }}
                      disabled={sessionId.length === 0 || addItemMutation.isPending || !canAddToCart}
                      className="h-10 shrink-0 whitespace-nowrap rounded-xl px-2.5"
                    >
                      {addItemMutation.isPending && activeAddProductId === product.id
                        ? "Wird hinzugefuegt..."
                        : "In den Warenkorb"}
                    </Button>
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

        <aside
          id="cart-panel"
          className="self-start rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:overflow-auto"
          style={{
            top: `${appHeaderOffset + stickyTopOffset}px`,
            maxHeight: `calc(100vh - ${appHeaderOffset + stickyTopOffset + 16}px)`,
          }}
        >
          <h2 className="text-base font-semibold text-foreground">Warenkorb</h2>
          <p className="mt-1 text-xs text-muted-foreground">Aktuelle Produktpreise aktiviert</p>
          <div className="mt-4 space-y-3">
            {cartQuery.isLoading && (
              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="text-sm text-muted-foreground">Warenkorb wird geladen...</p>
              </div>
            )}
            {cartQuery.error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">Warenkorb konnte nicht geladen werden.</p>
                <Button
                  onClick={() => void cartQuery.refetch()}
                  variant="outline"
                  className="mt-2"
                >
                  Erneut versuchen
                </Button>
              </div>
            )}
            {!cartQuery.isLoading && !cartQuery.error && (cartQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Artikel im Warenkorb.</p>
            ) : (
              <>
              {groupedCartItems.partLists.map((group) => (
                <div key={group.id} className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-sm font-semibold text-foreground">{group.name}</p>
                  <div className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border bg-card/70 p-2">
                        <p className="text-xs font-medium text-foreground">{item.product.name}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{formatPrice(item.product.price)}</p>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() =>
                                setQuantityMutation.mutate({
                                  sessionId,
                                  line: {
                                    productId: item.productId,
                                    sourcePartListId: item.sourcePartListId,
                                  },
                                  quantity: Math.max(0, decimalToNumber(item.quantity) - 1),
                                })
                              }
                              variant="outline"
                              className="h-7 px-2"
                            >
                              -
                            </Button>
                            <span className="min-w-8 text-center text-xs text-foreground">
                              {decimalToNumber(item.quantity)}
                            </span>
                            <Button
                              onClick={() =>
                                setQuantityMutation.mutate({
                                  sessionId,
                                  line: {
                                    productId: item.productId,
                                    sourcePartListId: item.sourcePartListId,
                                  },
                                  quantity: decimalToNumber(item.quantity) + 1,
                                })
                              }
                              variant="outline"
                              className="h-7 px-2"
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {groupedCartItems.standalone.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-foreground">{formatPrice(item.product.price)}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() =>
                          setQuantityMutation.mutate({
                            sessionId,
                            line: {
                              productId: item.productId,
                              sourcePartListId: item.sourcePartListId,
                            },
                            quantity: Math.max(0, decimalToNumber(item.quantity) - 1),
                          })
                        }
                        variant="outline"
                        className="h-8 px-2"
                      >
                        -
                      </Button>
                      <span className="min-w-8 text-center text-sm text-foreground">
                        {decimalToNumber(item.quantity)}
                      </span>
                      <Button
                        onClick={() =>
                          setQuantityMutation.mutate({
                            sessionId,
                            line: {
                              productId: item.productId,
                              sourcePartListId: item.sourcePartListId,
                            },
                            quantity: decimalToNumber(item.quantity) + 1,
                          })
                        }
                        variant="outline"
                        className="h-8 px-2"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              </>
            )}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Zwischensumme</span>
              <span className="font-semibold text-primary">{formatPrice(cartTotal)}</span>
            </div>
            <Link
              href="/carts"
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Zum Warenkorb
            </Link>
          </div>
        </aside>
      </section>

      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Artikel hinzugefuegt</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Der Artikel wurde in den Warenkorb gelegt.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setShowCartModal(false)}
                variant="outline"
                className="flex-1 rounded-xl"
              >
                Weiter einkaufen
              </Button>
              <Button
                onClick={() => {
                  setShowCartModal(false);
                  router.push("/carts");
                }}
                className="flex-1 rounded-xl"
              >
                Zu Warenkoerben
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
