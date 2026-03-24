"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
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
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(
    decimalToNumber(value),
  );
}

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = params.id;
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );

  const utils = api.useUtils();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showCartModal, setShowCartModal] = useState(false);
  const [quantityInput, setQuantityInput] = useState("1");
  const [activeAddPartListId, setActiveAddPartListId] = useState<string | null>(null);
  const [quantitiesByPartList, setQuantitiesByPartList] = useState<Record<string, string>>({});
  const [partListWarning, setPartListWarning] = useState<string | null>(null);
  const stickyTopOffset = 24;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const categoryQuery = api.category.list.useQuery();
  const partListsQuery = api.partsList.listForShop.useQuery();
  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
  const productQuery = api.product.byId.useQuery({ id: productId }, { enabled: Boolean(productId) });
  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
      setShowCartModal(true);
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
    setQuantityInput(step.toString());
  }, [productQuery.data?.id, productQuery.data?.unitStep]);

  const cartTotal = useMemo(() => {
    const items = cartQuery.data?.items ?? [];
    return items.reduce((total, item) => {
      return total + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
    }, 0);
  }, [cartQuery.data?.items]);

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
  const lowStock = decimalToNumber(product.quantityOnHand) <= decimalToNumber(product.minimumQuantity);
  const stockOnHand = decimalToNumber(product.quantityOnHand);
  const unitStep = Math.max(decimalToNumber(product.unitStep), 0.001);
  const parsedQuantity = Number(quantityInput);
  const selectedQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : unitStep;
  const canAddToCart = stockOnHand > 0 && selectedQuantity <= stockOnHand;

  const categoryName = product.category?.name ?? "Ohne Kategorie";
  const searchFromUrl = (searchParams.get("search") ?? "").trim();
  const images =
    product.images.length === 0
      ? [{ id: "placeholder", url: "/pictures/placeholder.jpg", altText: null }]
      : product.images;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-6 px-2 py-6 sm:px-4 lg:px-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]">
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
                const quantityForPartList = quantitiesByPartList[partList.id] ?? "1";
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
                        value={quantityForPartList}
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
                          const requestedQuantity = Math.max(1, Math.floor(Number(quantityForPartList) || 1));
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
                        {addPartListMutation.isPending && activeAddPartListId === partList.id
                          ? "..."
                          : "In den Warenkorb"}
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
              onClick={() => {
                setSelectedCategoryId(undefined);
                router.push(
                  searchFromUrl ? `/?search=${encodeURIComponent(searchFromUrl)}` : "/",
                );
              }}
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
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  const params = new URLSearchParams();
                  if (searchFromUrl) params.set("search", searchFromUrl);
                  params.set("categoryId", category.id);
                  const query = params.toString();
                  router.push(query ? `/?${query}` : "/");
                }}
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

        <Card className="rounded-2xl p-6 shadow-sm">
          <Link href="/" className="mb-4 inline-flex text-sm font-medium text-primary hover:opacity-80">
            Zurueck zur Produktliste
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

              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-lg font-semibold text-primary">{formatPrice(product.price)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                </p>
                <Badge variant={lowStock ? "destructive" : "success"} className="mt-3">
                  {lowStock ? "Niedriger Bestand" : "Auf Lager"}
                </Badge>
              </div>

              <div className="mt-5 flex w-full flex-wrap items-center gap-2">
                <div className="shrink-0 flex h-10 items-center rounded-xl border border-slate-300 bg-white shadow-sm">
                  <Button
                    type="button"
                    onClick={() => {
                      const currentQuantity = Math.max(Number(quantityInput) || unitStep, unitStep);
                      const nextQuantity = Math.max(unitStep, currentQuantity - unitStep);
                      setQuantityInput(nextQuantity.toString());
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
                    onChange={(event) => setQuantityInput(event.target.value)}
                    className="w-12 border-none bg-transparent text-center text-sm font-medium text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Menge fuer ${product.name}`}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      const currentQuantity = Math.max(Number(quantityInput) || unitStep, unitStep);
                      const nextQuantity = currentQuantity + unitStep;
                      setQuantityInput(nextQuantity.toString());
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
                  onClick={() => {
                    if (stockOnHand <= 0 || selectedQuantity > stockOnHand) return;
                    addItemMutation.mutate({
                      sessionId,
                      productId: product.id,
                      quantity: selectedQuantity,
                    });
                  }}
                  disabled={sessionId.length === 0 || addItemMutation.isPending || !canAddToCart}
                  className="h-10 rounded-xl px-3"
                >
                  {addItemMutation.isPending ? "Wird hinzugefuegt..." : "In den Warenkorb"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

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
            {(cartQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Artikel im Warenkorb.</p>
            ) : (
              cartQuery.data?.items.map((item) => (
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
              ))
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
              <Button onClick={() => setShowCartModal(false)} variant="outline" className="flex-1 rounded-xl">
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
