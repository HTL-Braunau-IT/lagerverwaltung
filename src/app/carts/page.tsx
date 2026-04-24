"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WastebinIcon } from "~/components/layout/icon-renders";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";
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
  const amount = decimalToNumber(value);
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}



export default function CartsPage() {
  const utils = api.useUtils();
  const toast = useToast();
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [cartName, setCartName] = useState("");
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [confirmClearCart, setConfirmClearCart] = useState(false);
  const [expressSku, setExpressSku] = useState("");
  const [expressQuantity, setExpressQuantity] = useState("1");

  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
  const savedCartsQuery = api.cart.listSavedCarts.useQuery();
  type SavedCart = NonNullable<typeof savedCartsQuery.data>[number];
  const [savedCartPreview, setSavedCartPreview] = useState<SavedCart | null>(null);

  const setQuantityMutation = api.cart.setItemQuantity.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
    },
  });

  const saveCurrentCartMutation = api.cart.saveCurrentCart.useMutation({
    onSuccess: async () => {
      setCartName("");
      await Promise.all([utils.cart.get.invalidate({ sessionId }), utils.cart.listSavedCarts.invalidate()]);
      toast.success("Warenkorb gespeichert.");
    },
  });

  const loadSavedCartMutation = api.cart.loadSavedCart.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.cart.get.invalidate({ sessionId }), utils.cart.listSavedCarts.invalidate()]);
      toast.success("Warenkorb geladen.");
    },
  });

  const deleteSavedCartMutation = api.cart.deleteSavedCart.useMutation({
    onSuccess: async () => {
      await utils.cart.listSavedCarts.invalidate();
      toast.success("Warenkorb geloescht.");
    },
  });

  const addItemMutation = api.cart.addItem.useMutation({
    meta: { silent: true },
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

  const savedCartPreviewTotals = useMemo(() => {
    if (!savedCartPreview) return { itemCount: 0, total: 0 };
    const total = savedCartPreview.items.reduce((sum, item) => {
      return sum + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
    }, 0);
    const itemCount = savedCartPreview.items.reduce((sum, item) => {
      return sum + decimalToNumber(item.quantity);
    }, 0);
    return { itemCount, total };
  }, [savedCartPreview]);

  const activeItems = useMemo(() => cartQuery.data?.items ?? [], [cartQuery.data?.items]);
  const groupedCartItems = useMemo(() => {
    const standalone: typeof activeItems = [];
    const partLists = new Map<string, { id: string; name: string; items: typeof activeItems }>();

    for (const item of activeItems) {
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
  }, [activeItems]);

  useEffect(() => {
    if (activeItems.length === 0) setConfirmClearCart(false);
  }, [activeItems.length]);

  useEffect(() => {
    if (!confirmClearCart) return;
    const timeout = window.setTimeout(() => setConfirmClearCart(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [confirmClearCart]);

  const clearCart = async () => {
    if (sessionId.length === 0 || activeItems.length === 0) return;

    const lines = new Map<
      string,
      { productId: string; sourcePartListId: string | null | undefined }
    >();
    for (const item of activeItems) {
      lines.set(`${item.productId}:${item.sourcePartListId ?? ""}`, {
        productId: item.productId,
        sourcePartListId: item.sourcePartListId,
      });
    }

    setIsClearingCart(true);
    try {
      await Promise.all(
        [...lines.values()].map((line) =>
          setQuantityMutation.mutateAsync({
            sessionId,
            line,
            quantity: 0,
          }),
        ),
      );
      await utils.cart.get.invalidate({ sessionId });
      toast.success("Warenkorb geleert.");
    } finally {
      setIsClearingCart(false);
    }
  };

  const onClearCartClick = () => {
    if (isClearingCart || setQuantityMutation.isPending) return;
    if (!confirmClearCart) {
      setConfirmClearCart(true);
      return;
    }
    setConfirmClearCart(false);
    void clearCart();
  };

  const onExpressAddSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const sku = expressSku.trim();
    if (sku.length === 0) {
      toast.error("Bitte SKU eingeben.");
      return;
    }

    const quantity = Number(expressQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Bitte eine gueltige Menge eingeben.");
      return;
    }

    if (sessionId.length === 0) {
      toast.error("Session nicht verfuegbar. Bitte Seite neu laden.");
      return;
    }

    try {
      const result = await utils.product.list.fetch({ search: sku, limit: 5 });
      const match =
        result.items.find((item) => item.sku.toLowerCase() === sku.toLowerCase()) ?? result.items[0];
      if (!match) {
        toast.error("Kein Produkt mit dieser SKU gefunden.");
        return;
      }

      await addItemMutation.mutateAsync({
        sessionId,
        productId: match.id,
        quantity,
      });

      setExpressSku("");
      setExpressQuantity("1");
      toast.success("Produkt hinzugefuegt.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      toast.error(message);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Dialog
        open={savedCartPreview !== null}
        onClose={() => setSavedCartPreview(null)}
        title={savedCartPreview?.name ?? "Gespeicherter Warenkorb"}
        description={
          savedCartPreview
            ? `${savedCartPreviewTotals.itemCount} Artikel · ${formatPrice(savedCartPreviewTotals.total)}`
            : undefined
        }
        headerRight={
          <Button type="button" variant="outline" size="sm" onClick={() => setSavedCartPreview(null)}>
            Schließen
          </Button>
        }
      >
        {savedCartPreview ? (
          <div className="space-y-0">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="w-[100px] text-right">Menge</TableHead>
                  <TableHead className="w-[110px] text-right">Einheit</TableHead>
                  <TableHead className="w-[140px] text-right">Stückpreis</TableHead>
                  <TableHead className="w-[160px] text-right">Summe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedCartPreview.items.map((item, idx) => {
                  const qty = decimalToNumber(item.quantity);
                  const price = decimalToNumber(item.product.price);
                  return (
                    <TableRow key={`${item.productId}:${idx}`}>
                      <TableCell className="min-w-[260px]">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{item.product.name}</span>
                          <span className="text-xs text-slate-500">{item.product.sku || item.productId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{qty}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {String(item.product.baseUnit).toLowerCase()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatPrice(price)}</TableCell>
                      <TableCell className="text-right font-semibold text-sky-800 tabular-nums">
                        {formatPrice(qty * price)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3 pr-3">
              <span className="text-sm text-slate-500">Gesamt</span>
              <span className="text-sm font-bold text-sky-800 tabular-nums">
                {formatPrice(savedCartPreviewTotals.total)}
              </span>
            </div>
          </div>
        ) : null}
      </Dialog>

      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Aktuellen Warenkorb speichern</h2>
            <p className="mt-1 text-xs text-slate-500">Name für späteres Laden vergeben</p>
            <input
              value={cartName}
              onChange={(event) => setCartName(event.target.value)}
              placeholder="z. B. Elektronik Klasse 3BHELS"
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
            />
            <button
              onClick={() =>
                saveCurrentCartMutation.mutate({
                  sessionId,
                  name: cartName.trim(),
                })
              }
              disabled={
                sessionId.length === 0 ||
                cartName.trim().length === 0 ||
                activeItems.length === 0 ||
                saveCurrentCartMutation.isPending
              }
              className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveCurrentCartMutation.isPending ? "Wird gespeichert..." : "Warenkorb speichern"}
            </button>
            {saveCurrentCartMutation.error && (
              <p className="mt-2 text-xs text-rose-700">Speichern fehlgeschlagen. Bitte erneut versuchen.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Gespeicherte Warenkörbe</h2>
            {loadSavedCartMutation.error?.message === "MIXED_STORAGE_ROOMS" ? (
              <p className="mt-2 text-sm text-rose-700">
                Dieser Warenkorb enthaelt Produkte aus mehreren Lagerraeumen und kann nicht geladen werden.
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {savedCartsQuery.isLoading && <p className="text-sm text-slate-600">Warenkoerbe werden geladen...</p>}
              {!savedCartsQuery.isLoading && (savedCartsQuery.data?.length ?? 0) === 0 && (
                <p className="text-sm text-slate-500">Noch keine gespeicherten Warenkoerbe.</p>
              )}
              {savedCartsQuery.data?.map((savedCart) => {
                const total = savedCart.items.reduce((sum, item) => {
                  return sum + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
                }, 0);
                const itemCount = savedCart.items.reduce((sum, item) => {
                  return sum + decimalToNumber(item.quantity);
                }, 0);

                return (
                  <div
                    key={savedCart.id}
                    className="group cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-slate-100/70"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSavedCartPreview(savedCart)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSavedCartPreview(savedCart);
                      }
                    }}
                    aria-label={`Gespeicherten Warenkorb "${savedCart.name}" anzeigen`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-900">
                        {savedCart.name}
                      </p>
                      <p className="text-xs text-slate-500 whitespace-nowrap group-hover:text-slate-600">
                        {itemCount} Artikel · {formatPrice(total)}
                      </p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSavedCartMutation.mutate({
                            savedCartId: savedCart.id,
                          });
                        }}
                        disabled={deleteSavedCartMutation.isPending}
                        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Gespeicherten Warenkorb "${savedCart.name}" löschen`}
                      >
                        Löschen
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          loadSavedCartMutation.mutate({
                            sessionId,
                            savedCartId: savedCart.id,
                          });
                        }}
                        disabled={sessionId.length === 0 || loadSavedCartMutation.isPending}
                        className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Laden
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Aktueller Warenkorb</h2>
              <p className="text-xs text-slate-500">Artikel in dieser Browser-Sitzung</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={onClearCartClick}
                disabled={
                  sessionId.length === 0 ||
                  activeItems.length === 0 ||
                  isClearingCart ||
                  setQuantityMutation.isPending
                }
                className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearingCart
                  ? "Wird gelöscht..."
                  : confirmClearCart
                    ? "Nochmal klicken"
                    : "Alle Produkte löschen"}
              </button>
              <Link
                href="/checkout"
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
              >
                Bestellen
              </Link>
            </div>
          </div>

          <section className="mt-3 w-full">
            <form onSubmit={onExpressAddSubmit} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 -mb-2">
              <div className="flex items-baseline gap-2">
                <p className="text-xs font-semibold text-slate-700">Schnellbestellung</p>
              </div>
              <label className="flex flex-1 items-center gap-2 min-w-[260px]">
                <span className="text-xs text-slate-600 whitespace-nowrap">SKU</span>
                <input
                  value={expressSku}
                  onChange={(e) => setExpressSku(e.target.value)}
                  placeholder="z.B. BESKO00047F055V"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-600 whitespace-nowrap">Menge</span>
                <input
                  value={expressQuantity}
                  onChange={(e) => setExpressQuantity(e.target.value)}
                  type="number"
                  step="1"
                  min="1"
                  className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
                />
              </label>
              <Button
                type="submit"
                disabled={addItemMutation.isPending || sessionId.length === 0}
                variant="outline"
                size="sm"
                className="h-8 shrink-0 whitespace-nowrap rounded-xl px-2.5 text-slate-700 hover:bg-slate-100"
              >
                {addItemMutation.isPending ? "Wird hinzugefuegt..." : "In den Warenkorb"}
              </Button>
            </form>
          </section>

          <div className="mt-4 space-y-3">
            {cartQuery.isLoading && <p className="text-sm text-slate-600">Warenkorb wird geladen...</p>}
            {!cartQuery.isLoading && activeItems.length === 0 && (
              <p className="text-sm text-slate-500">Keine Artikel im Warenkorb.</p>
            )}
            {groupedCartItems.partLists.map((group) => (
              <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <p className="text-sm font-semibold text-slate-900"> Stückliste - {group.name}</p>
                <div className="mt-2 space-y-2">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-1.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-start gap-3">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                            <button
                              onClick={() =>
                                setQuantityMutation.mutate({
                                  sessionId,
                                  line: {
                                    productId: item.productId,
                                    sourcePartListId: item.sourcePartListId,
                                  },
                                  quantity: 0,
                                })
                              }
                              disabled={setQuantityMutation.isPending}
                              className="rounded-lg translate-y-1 translate-x-1 p-1 text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`${item.product.name} aus dem Warenkorb entfernen`}
                            >
                              <WastebinIcon size={14} />
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{item.product.sku}</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="flex items-start gap-1">
                            <button
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
                              className="rounded-lg border border-slate-300 bg-white px-1 h-7 w-7 text-slate-700"
                            >
                              -
                            </button>
                            <span className="min-w-8 pt-1 text-center text-sm text-slate-900">
                              {decimalToNumber(item.quantity)}
                            </span>
                            <button
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
                              className="rounded-lg border border-slate-300 bg-white px-1 h-7 w-7 text-slate-700"
                            >
                              +
                            </button>
                          </div>
                          <p className="text-center text-[11px] text-slate-500">
                            Verfügbar: {decimalToNumber(item.product.quantityOnHand)}{" "}
                            {item.product.baseUnit.toLowerCase()}
                          </p>
                        </div>
                        <div className="justify-self-end">
                          <p className="text-sm text-right font-semibold text-sky-800">
                            {formatPrice(decimalToNumber(item.quantity) * decimalToNumber(item.product.price))}
                          </p>
                          <p className="mt-2 text-xs text-right text-slate-500">
                            {formatPrice(item.product.price)} pro {item.product.baseUnit.toLowerCase()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {groupedCartItems.standalone.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-start gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                      <button
                        onClick={() =>
                          setQuantityMutation.mutate({
                            sessionId,
                            line: {
                              productId: item.productId,
                              sourcePartListId: item.sourcePartListId,
                            },
                            quantity: 0,
                          })
                        }
                        disabled={setQuantityMutation.isPending}
                        className="rounded-lg translate-y-1 translate-x-1 p-1 text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`${item.product.name} aus dem Warenkorb entfernen`}
                      >
                        <WastebinIcon size={14} />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.product.sku}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <button
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
                        className="rounded-lg border border-slate-300 bg-white px-1 h-7 w-7 text-slate-700"
                      >
                        -
                      </button>
                      <span className="min-w-8 text-center text-sm text-slate-900">
                        {decimalToNumber(item.quantity)}
                      </span>
                      <button
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
                        className="rounded-lg border border-slate-300 bg-white px-1 h-7 w-7 text-slate-700"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-center text-[11px] text-slate-500">
                      Verfügbar: {decimalToNumber(item.product.quantityOnHand)}{" "}
                      {item.product.baseUnit.toLowerCase()}
                    </p>
                  </div>
                  <div className="justify-self-end">
                    <p className="text-sm text-right font-semibold text-sky-800">
                      {formatPrice(decimalToNumber(item.quantity) * decimalToNumber(item.product.price))}
                    </p>
                    <p className="mt-2 text-xs text-right text-slate-500">
                      {formatPrice(item.product.price)} pro {item.product.baseUnit.toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-end text-sm">
              <span className="text-slate-500">Zwischensumme</span>
              <span className="font-bold text-sky-800 px-4">{formatPrice(cartTotal)}</span>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
