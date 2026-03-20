"use client";

import { useEffect, useMemo, useState } from "react";

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

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
}

export function Storefront() {
  const utils = api.useUtils();
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const categoryQuery = api.category.list.useQuery();
  const productQuery = api.product.list.useQuery({
    search: searchTerm || undefined,
    categoryId: selectedCategoryId,
    limit: 24,
  });
  const cartQuery = api.cart.get.useQuery(
    { sessionId },
    {
      enabled: sessionId.length > 0,
    },
  );

  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.get.invalidate({ sessionId });
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

  const cartItemsCount = cartQuery.data?.items.length ?? 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
            <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Schulshop</h1>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Warenkorb: {cartItemsCount} Artikel
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="product-search" className="mb-2 block text-xs text-slate-600">
            Suche nach Name oder Beschreibung
          </label>
          <input
            id="product-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="z. B. HDMI-Kabel, A4 Papier..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
          />
        </div>
      </header>

      <section className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategoryId(undefined)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            selectedCategoryId === undefined
              ? "border-sky-300 bg-sky-50 text-sky-800"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
          }`}
        >
          Alle Kategorien
        </button>
        {categoryQuery.data?.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategoryId(category.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCategoryId === category.id
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {category.name} ({category._count.products})
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {productQuery.isLoading && (
            <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
              Produkte werden geladen...
            </p>
          )}

          {!productQuery.isLoading && (productQuery.data?.items.length ?? 0) === 0 && (
            <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
              Keine Produkte fuer diesen Filter gefunden.
            </p>
          )}

          {productQuery.data?.items.map((product) => {
            const lowStock =
              decimalToNumber(product.quantityOnHand) <= decimalToNumber(product.minimumQuantity);
            const previewImage = product.images[0];
            return (
              <article
                key={product.id}
                className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={previewImage?.url || "/pictures/placeholder.jpg"}
                      alt={previewImage?.altText ?? `${product.name} Produktbild`}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/pictures/placeholder.jpg";
                      }}
                    />
                  </div>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-base font-semibold text-slate-900">{product.name}</h2>
                    {lowStock ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                        Niedriger Bestand
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                        Auf Lager
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                  </p>
                  <p className="mt-3 text-sm text-slate-600">
                    {product.description ?? "Keine Beschreibung."}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-sky-800">{formatPrice(product.price)}</p>
                  <button
                    onClick={() =>
                      addItemMutation.mutate({
                        sessionId,
                        productId: product.id,
                        quantity: 1,
                      })
                    }
                    disabled={sessionId.length === 0 || addItemMutation.isPending}
                    className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    In den Warenkorb
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-28">
          <h2 className="text-base font-semibold text-slate-900">Warenkorb</h2>
          <p className="mt-1 text-xs text-slate-500">Aktuelle Produktpreise aktiviert</p>
          <div className="mt-4 space-y-3">
            {(cartQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">Keine Artikel im Warenkorb.</p>
            ) : (
              cartQuery.data?.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-700">{formatPrice(item.product.price)}</p>
                    <div className="flex items-center gap-2">
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
                </div>
              ))
            )}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Zwischensumme</span>
              <span className="font-semibold text-sky-800">{formatPrice(cartTotal)}</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
