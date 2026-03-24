"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { api } from "~/trpc/react";

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

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PartListDetailPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const partListId = params.id;
  const canSeePartListProductCount =
    session?.user.role === "ADMIN" || session?.user.role === "TEACHER";
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showCartModal, setShowCartModal] = useState(false);
  const [activeAddPartListId, setActiveAddPartListId] = useState<string | null>(null);
  const [quantitiesByPartList, setQuantitiesByPartList] = useState<Record<string, string>>({});
  const [partListWarning, setPartListWarning] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const stickyTopOffset = 24;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);

  const utils = api.useUtils();
  const categoryQuery = api.category.list.useQuery();
  const partListsQuery = api.partsList.listForShop.useQuery();
  const selectedPartListQuery = api.partsList.byIdForShop.useQuery(
    { id: partListId },
    { enabled: Boolean(partListId) },
  );
  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
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

  const cartTotal = useMemo(() => {
    const items = cartQuery.data?.items ?? [];
    return items.reduce((total, item) => {
      return total + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
    }, 0);
  }, [cartQuery.data?.items]);

  if (selectedPartListQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Teileliste wird geladen...</p>
          <p className="mt-1 text-sm text-muted-foreground">Bitte kurz warten.</p>
        </div>
      </main>
    );
  }

  if (selectedPartListQuery.error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-destructive shadow-sm">
          <p className="text-sm font-semibold">Teileliste konnte nicht geladen werden.</p>
          <p className="mt-1 text-sm">Bitte pruefe deine Verbindung und versuche es erneut.</p>
          <Button onClick={() => void selectedPartListQuery.refetch()} variant="outline" className="mt-3">
            Erneut laden
          </Button>
        </div>
      </main>
    );
  }

  if (!selectedPartListQuery.data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Teileliste nicht gefunden.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Die Teileliste wurde eventuell entfernt oder die URL ist nicht mehr gueltig.
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

  const selectedPartList = selectedPartListQuery.data;
  const selectedImageUrl = selectedPartList.imageUrl ?? "/pictures/placeholder.jpg";
  const searchFromUrl = (searchParams.get("search") ?? "").trim();

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
          {canSeePartListProductCount ? (
            <>
              <div>
                <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Teilelisten
                </p>
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
                      <div
                        key={partList.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/parts-list/${partList.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/parts-list/${partList.id}`);
                          }
                        }}
                        className="cursor-pointer rounded-lg border border-border bg-muted/40 p-2 transition hover:border-primary/50"
                      >
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
                        <div className="mt-2 flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={quantityForPartList}
                            onClick={(event) => event.stopPropagation()}
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
                            onClick={(event) => {
                              event.stopPropagation();
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
            </>
          ) : null}
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Kategorien</p>
          <nav className="space-y-1">
            <Button
              onClick={() => {
                setSelectedCategoryId(undefined);
                router.push(searchFromUrl ? `/?search=${encodeURIComponent(searchFromUrl)}` : "/");
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

        <Card className="self-start rounded-2xl p-6 shadow-sm">
          <Link href="/" className="mb-4 inline-flex text-sm font-medium text-primary hover:opacity-80">
            Zurueck zur Produktliste
          </Link>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-border bg-muted">
              <img
                src={selectedImageUrl}
                alt={`${selectedPartList.name} Bild`}
                className="h-56 w-full object-cover"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/pictures/placeholder.jpg";
                }}
              />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Teileliste</p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{selectedPartList.name}</h1>
              <p className="mt-4 text-sm text-foreground">
                {selectedPartList.description ?? "Keine Beschreibung verfuegbar."}
              </p>
              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  Enthaltene Produkte:{" "}
                  <span className="font-semibold text-foreground">{selectedPartList.items.length}</span>
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={quantityInput}
                    onChange={(event) => setQuantityInput(event.target.value)}
                    className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    aria-label={`Menge fuer Teileliste ${selectedPartList.name}`}
                  />
                  <Button
                    onClick={() => {
                      const requestedQuantity = Math.max(1, Math.floor(Number(quantityInput) || 1));
                      setPartListWarning(null);
                      setActiveAddPartListId(selectedPartList.id);
                      addPartListMutation.mutate({
                        sessionId,
                        partListId: selectedPartList.id,
                        quantity: requestedQuantity,
                      });
                    }}
                    disabled={sessionId.length === 0 || addPartListMutation.isPending}
                    className="h-10 rounded-xl px-3"
                  >
                    {addPartListMutation.isPending && activeAddPartListId === selectedPartList.id
                      ? "..."
                      : "In den Warenkorb"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h2 className="text-sm font-semibold text-foreground">Enthaltene Produkte</h2>
              <div className="mt-3 space-y-2">
                {selectedPartList.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Produkte in dieser Teileliste.</p>
                ) : (
                  selectedPartList.items.map((item) => {
                    const previewImage = item.product.images[0]?.url ?? "/pictures/placeholder.jpg";
                    const previewAlt = item.product.images[0]?.altText ?? `${item.product.name} Produktbild`;
                    return (
                      <Link
                        key={item.id}
                        href={`/products/${item.product.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition hover:border-primary/50"
                      >
                        <img
                          src={previewImage}
                          alt={previewAlt}
                          className="h-14 w-14 rounded-md border border-border object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "/pictures/placeholder.jpg";
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.product.sku} · Bestand:{" "}
                            {formatStock(item.product.quantityOnHand, item.product.baseUnit)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-foreground">
                          x{decimalToNumber(item.quantity)}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h2 className="text-sm font-semibold text-foreground">Dokumente</h2>
              <div className="mt-3 space-y-2">
                {selectedPartList.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>
                ) : (
                  selectedPartList.documents.map((document) => (
                    <a
                      key={document.id}
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-border bg-card p-2 transition hover:border-primary/50"
                    >
                      <p className="truncate text-sm font-medium text-primary">{document.originalName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document.mimeType} · {formatFileSize(document.sizeBytes)}
                      </p>
                    </a>
                  ))
                )}
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
            <p className="mt-1 text-sm text-muted-foreground">Die Teileliste wurde in den Warenkorb gelegt.</p>
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
