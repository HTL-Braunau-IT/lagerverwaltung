"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  const productId = params.id;
  const [sessionId] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );

  const utils = api.useUtils();
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showCartModal, setShowCartModal] = useState(false);
  const categoryQuery = api.category.list.useQuery();
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

  if (productQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-700">Produkt wird geladen...</p>
          <p className="mt-1 text-sm text-slate-500">Bitte kurz warten.</p>
        </div>
      </main>
    );
  }

  if (productQuery.error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          <p className="text-sm font-semibold">Produkt konnte nicht geladen werden.</p>
          <p className="mt-1 text-sm text-rose-800">
            Bitte pruefe deine Verbindung und versuche es erneut.
          </p>
          <button
            onClick={() => void productQuery.refetch()}
            className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
          >
            Erneut laden
          </button>
        </div>
      </main>
    );
  }

  if (!productQuery.data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Produkt nicht gefunden.</p>
          <p className="mt-1 text-sm text-slate-500">
            Das Produkt wurde eventuell entfernt oder die URL ist nicht mehr gueltig.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
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

  const categoryName = product.category?.name ?? "Ohne Kategorie";
  const locationLabel = product.storageLocation
    ? `${product.storageLocation.code} - ${product.storageLocation.name}`
    : "Kein Lagerort hinterlegt";
  const images =
    product.images.length === 0
      ? [{ id: "placeholder", url: "/pictures/placeholder.jpg", altText: null }]
      : product.images;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-700">HTL Lager</p>
            <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Produktdetails</h1>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Warenkorb: {cartQuery.data?.items.length ?? 0} Artikel
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="product-search-detail" className="mb-2 block text-xs text-slate-600">
            Produkte suchen
          </label>
          <input
            id="product-search-detail"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. HDMI-Kabel, A4 Papier..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 transition focus:ring-2"
          />
        </div>
      </header>

      <section className="flex flex-wrap gap-2">
        <Link
          href={`/?search=${encodeURIComponent(searchInput.trim())}`}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            selectedCategoryId === undefined
              ? "border-sky-300 bg-sky-50 text-sky-800"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
          }`}
          onClick={() => setSelectedCategoryId(undefined)}
        >
          Alle Kategorien
        </Link>
        {categoryQuery.data?.map((category) => (
          <Link
            key={category.id}
            href={`/?search=${encodeURIComponent(searchInput.trim())}&categoryId=${category.id}`}
            onClick={() => setSelectedCategoryId(category.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCategoryId === category.id
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {category.name} ({category._count.products})
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Link href="/" className="mb-4 inline-flex text-sm font-medium text-sky-700 hover:text-sky-600">
            Zurueck zur Produktliste
          </Link>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
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
              <p className="text-xs uppercase tracking-[0.2em] text-sky-700">{categoryName}</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.name}</h1>
              <p className="mt-1 text-sm text-slate-500">SKU: {product.sku}</p>
              <p className="mt-4 text-sm text-slate-700">
                {product.description ?? "Keine Beschreibung verfuegbar."}
              </p>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-semibold text-sky-800">{formatPrice(product.price)}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Bestand: {formatStock(product.quantityOnHand, product.baseUnit)}
                </p>
                <p className="mt-1 text-sm text-slate-600">Lagerort: {locationLabel}</p>
                <span
                  className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs ${
                    lowStock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {lowStock ? "Niedriger Bestand" : "Auf Lager"}
                </span>
              </div>

              <button
                onClick={() => {
                  if (stockOnHand <= 0) return;
                  addItemMutation.mutate({
                    sessionId,
                    productId: product.id,
                    quantity: 1,
                  });
                }}
                disabled={sessionId.length === 0 || addItemMutation.isPending || stockOnHand <= 0}
                className="mt-5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addItemMutation.isPending ? "Wird hinzugefuegt..." : "In den Warenkorb"}
              </button>
            </div>
          </div>
        </article>

        <aside
          id="cart-panel"
          className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-28"
        >
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
                            line: {
                              productId: item.productId,
                              sourcePartListId: item.sourcePartListId,
                            },
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
                            line: {
                              productId: item.productId,
                              sourcePartListId: item.sourcePartListId,
                            },
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
            <Link
              href="/carts"
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Zum Warenkorb
            </Link>
          </div>
        </aside>
      </section>

      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Artikel hinzugefuegt</h3>
            <p className="mt-1 text-sm text-slate-600">
              Der Artikel wurde in den Warenkorb gelegt.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCartModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                Weiter einkaufen
              </button>
              <button
                onClick={() => {
                  setShowCartModal(false);
                  router.push("/carts");
                }}
                className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
              >
                Zu Warenkoerben
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
