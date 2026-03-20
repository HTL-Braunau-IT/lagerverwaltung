"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [cartName, setCartName] = useState("");

  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );
  const savedCartsQuery = api.cart.listSavedCarts.useQuery();

  const setQuantityMutation = api.cart.setItemQuantity.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
    },
  });

  const saveCurrentCartMutation = api.cart.saveCurrentCart.useMutation({
    onSuccess: async () => {
      setCartName("");
      await Promise.all([utils.cart.get.invalidate({ sessionId }), utils.cart.listSavedCarts.invalidate()]);
    },
  });

  const loadSavedCartMutation = api.cart.loadSavedCart.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.cart.get.invalidate({ sessionId }), utils.cart.listSavedCarts.invalidate()]);
    },
  });

  const deleteSavedCartMutation = api.cart.deleteSavedCart.useMutation({
    onSuccess: async () => {
      await utils.cart.listSavedCarts.invalidate();
    },
  });

  const cartTotal = useMemo(() => {
    const items = cartQuery.data?.items ?? [];
    return items.reduce((total, item) => {
      return total + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
    }, 0);
  }, [cartQuery.data?.items]);

  const activeItems = cartQuery.data?.items ?? [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
        <h1 className="text-2xl font-semibold text-slate-900">Warenkoerbe</h1>
        <p className="mt-1 text-sm text-slate-600">
          Verwalte deinen aktuellen Warenkorb und speichere Vorlagen fuer spaeter.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
          >
            Zur Produktliste
          </Link>
          <Link
            href="/checkout"
            className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            Bestellen
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-base font-semibold text-slate-900">Aktueller Warenkorb</h2>
          <p className="mt-1 text-xs text-slate-500">Artikel in dieser Browser-Sitzung</p>

          <div className="mt-4 space-y-3">
            {cartQuery.isLoading && <p className="text-sm text-slate-600">Warenkorb wird geladen...</p>}
            {!cartQuery.isLoading && activeItems.length === 0 && (
              <p className="text-sm text-slate-500">Keine Artikel im Warenkorb.</p>
            )}
            {activeItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatPrice(item.product.price)} pro {item.product.baseUnit.toLowerCase()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-sky-800">
                    {formatPrice(decimalToNumber(item.quantity) * decimalToNumber(item.product.price))}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() =>
                      setQuantityMutation.mutate({
                        sessionId,
                        productId: item.productId,
                        quantity: Math.max(0, decimalToNumber(item.quantity) - 1),
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
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
                        productId: item.productId,
                        quantity: decimalToNumber(item.quantity) + 1,
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Zwischensumme</span>
              <span className="font-semibold text-sky-800">{formatPrice(cartTotal)}</span>
            </div>
          </div>
        </article>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Warenkorb speichern</h2>
            <p className="mt-1 text-xs text-slate-500">Name fuer spaeteres Laden vergeben</p>
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
            <h2 className="text-base font-semibold text-slate-900">Gespeicherte Warenkoerbe</h2>
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
                  <div key={savedCart.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">{savedCart.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {itemCount} Artikel - {formatPrice(total)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() =>
                          loadSavedCartMutation.mutate({
                            sessionId,
                            savedCartId: savedCart.id,
                          })
                        }
                        disabled={sessionId.length === 0 || loadSavedCartMutation.isPending}
                        className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Laden
                      </button>
                      <button
                        onClick={() =>
                          deleteSavedCartMutation.mutate({
                            savedCartId: savedCart.id,
                          })
                        }
                        disabled={deleteSavedCartMutation.isPending}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Loeschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
