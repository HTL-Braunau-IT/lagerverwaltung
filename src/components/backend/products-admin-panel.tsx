"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

const unitKinds = [
  { value: "PIECE", label: "Stueck" },
  { value: "LENGTH", label: "Laenge" },
  { value: "AREA", label: "Flaeche" },
  { value: "WEIGHT", label: "Gewicht" },
  { value: "VOLUME", label: "Volumen" },
] as const;

const baseUnits = [
  { value: "PCS", label: "Stk" },
  { value: "MM", label: "mm" },
  { value: "CM", label: "cm" },
  { value: "M", label: "m" },
  { value: "CM2", label: "cm2" },
  { value: "M2", label: "m2" },
  { value: "G", label: "g" },
  { value: "KG", label: "kg" },
  { value: "ML", label: "ml" },
  { value: "L", label: "l" },
] as const;

type ProductFormState = {
  name: string;
  sku: string;
  description: string;
  price: string;
  minimumQuantity: string;
  unitKind: (typeof unitKinds)[number]["value"];
  baseUnit: (typeof baseUnits)[number]["value"];
  unitStep: string;
  categoryId: string;
  storageLocationId: string;
  imageUrl: string;
  imageAltText: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function createInitialForm(product: {
  name: string;
  sku: string;
  description: string | null;
  price: unknown;
  minimumQuantity: unknown;
  unitKind: ProductFormState["unitKind"];
  baseUnit: ProductFormState["baseUnit"];
  unitStep: unknown;
  categoryId: string | null;
  storageLocationId: string | null;
  images: Array<{
    url: string;
    altText: string | null;
  }>;
}): ProductFormState {
  const firstImage = product.images[0];
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? "",
    price: String(toNumber(product.price)),
    minimumQuantity: String(toNumber(product.minimumQuantity)),
    unitKind: product.unitKind,
    baseUnit: product.baseUnit,
    unitStep: String(toNumber(product.unitStep)),
    categoryId: product.categoryId ?? "",
    storageLocationId: product.storageLocationId ?? "",
    imageUrl: firstImage?.url ?? "",
    imageAltText: firstImage?.altText ?? "",
  };
}

function BookingHistory({ productId }: { productId: string }) {
  const bookingsQuery = api.product.backendStockBookings.useQuery({ productId, limit: 10 });

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Letzte Buchungen
      </p>
      {bookingsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Verlauf wird geladen...</p> : null}
      {bookingsQuery.error ? (
        <p className="mt-2 text-sm text-rose-700">Verlauf konnte nicht geladen werden.</p>
      ) : null}
      {!bookingsQuery.isLoading &&
      !bookingsQuery.error &&
      (bookingsQuery.data?.bookings?.length ?? 0) === 0 &&
      (bookingsQuery.data?.completedOrders?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Noch keine Buchungen oder fertigen Auftraege vorhanden.</p>
      ) : null}
      <div className="mt-2 space-y-2">
        {(bookingsQuery.data?.bookings ?? []).map((booking) => (
          <div
            key={booking.id}
            className="rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-foreground"
          >
            <p>
              Menge: <span className="font-medium">{toNumber(booking.quantityDelta)}</span>
              {" | "}Lieferant: <span className="font-medium">{booking.supplier}</span>
            </p>
            <p>
              Von: {booking.user.name ?? booking.user.email ?? "Unbekannt"} {" | "}
              {new Date(booking.createdAt).toLocaleString("de-AT")}
            </p>
            {booking.note ? <p>Notiz: {booking.note}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Fertige Auftraege (READY_FOR_PICKUP)
        </p>
        <div className="mt-2 space-y-2">
          {(bookingsQuery.data?.completedOrders ?? []).map((entry) => (
            <div
              key={entry.id}
            className="rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-xs text-success"
            >
              <p>
                Auftrag: <span className="font-medium">{entry.order.orderNumber}</span>
                {" | "}Menge: <span className="font-medium">{toNumber(entry.quantity)}</span>
              </p>
              <p>
                Von: {entry.order.user.name ?? entry.order.user.email ?? "Unbekannt"} {" | "}
                {new Date(entry.order.createdAt).toLocaleString("de-AT")}
              </p>
            </div>
          ))}
          {(bookingsQuery.data?.completedOrders.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Keine fertigen Auftraege fuer dieses Produkt.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProductsAdminPanel() {
  const utils = api.useUtils();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [formsById, setFormsById] = useState<Record<string, ProductFormState>>({});
  const [bookingProduct, setBookingProduct] = useState<{ id: string; name: string } | null>(null);
  const [bookingQuantityInput, setBookingQuantityInput] = useState("");
  const [bookingSupplierInput, setBookingSupplierInput] = useState("");
  const [bookingNoteInput, setBookingNoteInput] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const productsQuery = api.product.backendList.useQuery({
    search: searchTerm || undefined,
    limit: 200,
  });
  const categoriesQuery = api.category.list.useQuery();
  const storageLocationsQuery = api.storageLocation.list.useQuery();

  const updateMutation = api.product.backendUpdate.useMutation({
    onSuccess: async () => {
      await utils.product.backendList.invalidate();
    },
  });
  const stockBookingMutation = api.product.backendBookStock.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.product.backendList.invalidate(),
        bookingProduct
          ? utils.product.backendStockBookings.invalidate({ productId: bookingProduct.id, limit: 10 })
          : Promise.resolve(),
      ]);
      setBookingProduct(null);
      setBookingQuantityInput("");
      setBookingSupplierInput("");
      setBookingNoteInput("");
      setBookingError(null);
    },
  });

  const sortedProducts = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [productsQuery.data],
  );

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Produkte</h2>
          <p className="text-sm text-muted-foreground">Produkte suchen, oeffnen und bearbeiten.</p>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="backend-product-search" className="mb-1 block text-xs text-muted-foreground">
          Suche nach Name, SKU oder Beschreibung
          <Input
            id="backend-product-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="z. B. HDMI, Papier, sku-1002"
            className="mt-1 h-10 rounded-xl"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Lagerplatz</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead>Mindestbestand</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {productsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Produkte werden geladen...
                </TableCell>
              </tr>
            ) : null}

            {productsQuery.error ? (
              <tr>
                <TableCell colSpan={6} className="text-destructive">
                  Produkte konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}

            {!productsQuery.isLoading && !productsQuery.error && sortedProducts.length === 0 ? (
              <tr>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Keine Produkte gefunden.
                </TableCell>
              </tr>
            ) : null}

            {sortedProducts.map((product) => {
              const isExpanded = expandedRowId === product.id;
              const form = formsById[product.id] ?? createInitialForm(product);
              const locationText = product.storageLocation
                ? `${product.storageLocation.code} - ${product.storageLocation.name}`
                : "-";

              return (
                <Fragment key={product.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedRowId((current) => (current === product.id ? null : product.id));
                      setFormsById((current) => ({
                        ...current,
                        [product.id]: current[product.id] ?? createInitialForm(product),
                      }));
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium text-foreground">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                    <TableCell className="text-muted-foreground">{product.category?.name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{locationText}</TableCell>
                    <TableCell className="text-muted-foreground">{toNumber(product.quantityOnHand)}</TableCell>
                    <TableCell className="text-muted-foreground">{toNumber(product.minimumQuantity)}</TableCell>
                  </TableRow>
                  {isExpanded ? (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={6} className="px-3 py-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-xs text-slate-600">
                            Name
                            <input
                              value={form.name}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, name: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            SKU
                            <input
                              value={form.sku}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, sku: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600 md:col-span-2">
                            Beschreibung
                            <textarea
                              value={form.description}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, description: event.target.value },
                                }))
                              }
                              rows={3}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            Preis
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.price}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, price: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            Mindestbestand
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={form.minimumQuantity}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, minimumQuantity: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            Bestand (nur Anzeige)
                            <input
                              disabled
                              value={String(toNumber(product.quantityOnHand))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-sm text-slate-600"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            Einheitstyp
                            <select
                              value={form.unitKind}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: {
                                    ...form,
                                    unitKind: event.target.value as ProductFormState["unitKind"],
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            >
                              {unitKinds.map((unitKind) => (
                                <option key={unitKind.value} value={unitKind.value}>
                                  {unitKind.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs text-slate-600">
                            Basiseinheit
                            <select
                              value={form.baseUnit}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: {
                                    ...form,
                                    baseUnit: event.target.value as ProductFormState["baseUnit"],
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            >
                              {baseUnits.map((baseUnit) => (
                                <option key={baseUnit.value} value={baseUnit.value}>
                                  {baseUnit.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs text-slate-600">
                            Schrittweite
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={form.unitStep}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, unitStep: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600">
                            Kategorie
                            <select
                              value={form.categoryId}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, categoryId: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            >
                              <option value="">Keine Kategorie</option>
                              {(categoriesQuery.data ?? []).map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs text-slate-600">
                            Lagerplatz
                            <select
                              value={form.storageLocationId}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, storageLocationId: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            >
                              <option value="">Kein Lagerplatz</option>
                              {(storageLocationsQuery.data ?? []).map((storageLocation) => (
                                <option key={storageLocation.id} value={storageLocation.id}>
                                  {storageLocation.code} - {storageLocation.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs text-slate-600 md:col-span-2">
                            Bild-URL
                            <input
                              type="url"
                              value={form.imageUrl}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, imageUrl: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          <label className="text-xs text-slate-600 md:col-span-2">
                            Bild-Alt-Text
                            <input
                              value={form.imageAltText}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFormsById((current) => ({
                                  ...current,
                                  [product.id]: { ...form, imageAltText: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                            />
                          </label>

                          {form.imageUrl ? (
                            <div className="md:col-span-2">
                              <p className="mb-1 text-xs text-slate-600">Bildvorschau</p>
                              <img
                                src={form.imageUrl}
                                alt={form.imageAltText || `${form.name} Produktbild`}
                                className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
                                onClick={(event) => event.stopPropagation()}
                                onError={(event) => {
                                  event.currentTarget.onerror = null;
                                  event.currentTarget.src = "/pictures/placeholder.jpg";
                                }}
                              />
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setBookingProduct({ id: product.id, name: product.name });
                              setBookingError(null);
                            }}
                            variant="secondary"
                          >
                            Einbuchen
                          </Button>
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFormsById((current) => ({
                                ...current,
                                [product.id]: createInitialForm(product),
                              }));
                            }}
                            variant="outline"
                          >
                            Zuruecksetzen
                          </Button>
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateMutation.mutate({
                                id: product.id,
                                name: form.name.trim(),
                                sku: form.sku.trim(),
                                description: form.description.trim() ? form.description.trim() : null,
                                price: Number(form.price),
                                minimumQuantity: Number(form.minimumQuantity),
                                unitKind: form.unitKind,
                                baseUnit: form.baseUnit,
                                unitStep: Number(form.unitStep),
                                categoryId: form.categoryId || null,
                                storageLocationId: form.storageLocationId || null,
                                imageUrl: form.imageUrl.trim() || null,
                                imageAltText: form.imageAltText.trim() || null,
                              });
                            }}
                            disabled={updateMutation.isPending}
                            className="disabled:opacity-60"
                          >
                            {updateMutation.isPending ? "Speichert..." : "Speichern"}
                          </Button>
                        </div>

                        <BookingHistory productId={product.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {bookingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Einbuchen</h3>
            <p className="mt-1 text-sm text-muted-foreground">{bookingProduct.name}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-600">
                Menge (positiv oder negativ)
                <input
                  value={bookingQuantityInput}
                  onChange={(event) => setBookingQuantityInput(event.target.value)}
                  placeholder="z. B. 20.5 oder 120,5"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="block text-xs text-slate-600">
                Lieferant
                <input
                  value={bookingSupplierInput}
                  onChange={(event) => setBookingSupplierInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="block text-xs text-slate-600">
                Notiz (optional)
                <textarea
                  value={bookingNoteInput}
                  onChange={(event) => setBookingNoteInput(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>
            </div>

            {bookingError ? <p className="mt-3 text-sm text-rose-700">{bookingError}</p> : null}

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  setBookingProduct(null);
                  setBookingError(null);
                }}
                variant="outline"
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const normalizedQuantity = bookingQuantityInput.trim().replace(",", ".");
                  const quantity = Number(normalizedQuantity);
                  const supplier = bookingSupplierInput.trim();

                  if (!Number.isFinite(quantity) || quantity === 0) {
                    setBookingError("Bitte eine gueltige Menge ungleich 0 eingeben.");
                    return;
                  }
                  if (!supplier) {
                    setBookingError("Bitte einen Lieferanten eingeben.");
                    return;
                  }

                  setBookingError(null);
                  stockBookingMutation.mutate({
                    productId: bookingProduct.id,
                    quantityDelta: quantity,
                    supplier,
                    note: bookingNoteInput.trim() ? bookingNoteInput.trim() : null,
                  });
                }}
                disabled={stockBookingMutation.isPending}
                className="disabled:opacity-60"
              >
                {stockBookingMutation.isPending ? "Bucht..." : "Einbuchen"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
