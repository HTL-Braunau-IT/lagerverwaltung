"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { ArrowRightIcon, WastebinIcon } from "~/components/layout/icon-renders";
import { Button, buttonClassName } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import * as TableUI from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";
import { useConfirmClick } from "~/components/backend/use-confirm-click";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  getQuantityDecimalsForStep,
  getQuantityStepForBaseUnit,
  isQuantityAlignedToStep,
} from "~/lib/quantity-rules";
import { NumberStepper } from "~/components/ui/number-stepper";
import { CartPdfDocument } from "~/components/shop/pdf/cart-pdf-document";
import { ShopExportPdfButton } from "~/components/shop/shop-quantity-add-to-cart";
import { Card, DetailText } from "~/components/ui/detail-card";
import { Input } from "~/components/ui/input";

const SESSION_STORAGE_KEY = "lw_cart_session_id";

function formatCartQtyString(quantity: unknown, step: number): string {
  const n = decimalToNumber(quantity);
  const decimals = getQuantityDecimalsForStep(step);
  return decimals > 0 ? String(Number(n.toFixed(decimals))) : String(Math.round(n));
}

function snapCartQuantityToStep(value: number, min: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return min;
  const decimals = getQuantityDecimalsForStep(step);
  const coarse = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
  const snapped = Math.round(coarse / step) * step;
  const out = decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped;
  return Math.max(min, out);
}

function commitCartLineQuantity(raw: string, step: number, apply: (quantity: number) => void) {
  if (raw.trim() === "") return;
  const num = Number(raw);
  if (!Number.isFinite(num)) return;
  apply(snapCartQuantityToStep(num, 0, step));
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

type SavedCart = RouterOutputs["cart"]["listSavedCarts"][number];

function SavedCartRow(props: {
  savedCart: SavedCart;
  sessionId: string;
  onPreview: (cart: SavedCart) => void;
  deleteMutation: { mutate: (input: { savedCartId: string }) => void; isPending: boolean };
  loadMutation: {
    mutate: (input: { sessionId: string; savedCartId: string }) => void;
    isPending: boolean;
  };
}) {
  const { savedCart, sessionId, onPreview, deleteMutation, loadMutation } = props;
  const { isConfirming: isConfirmingDelete, confirmOrRun: confirmOrRunDelete } = useConfirmClick({
    resetKey: savedCart.id,
  });

  const total = savedCart.items.reduce((sum, item) => {
    return sum + decimalToNumber(item.quantity) * decimalToNumber(item.product.price);
  }, 0);
  const itemCount = savedCart.items.reduce((sum, item) => {
    return sum + decimalToNumber(item.quantity);
  }, 0);

  return (
    <Card
      className="group cursor-pointer p-3"
      role="button"
      tabIndex={0}
      variant="detail"
      onClick={() => onPreview(savedCart)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview(savedCart);
        }
      }}
      aria-label={`Gespeicherten Warenkorb "${savedCart.name}" anzeigen`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-900">
          {savedCart.name}
        </p>
        <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500 transition-colors group-hover:text-slate-600">
          {itemCount} Artikel · {formatPrice(total)}
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (deleteMutation.isPending) return;
            confirmOrRunDelete(() =>
              deleteMutation.mutate({
                savedCartId: savedCart.id,
              }),
            );
          }}
          disabled={deleteMutation.isPending}
          variant="destructive"
          className="!h-8 !w-fit"
          aria-label={
            isConfirmingDelete
              ? `Zum Löschen von "${savedCart.name}" erneut klicken`
              : `Gespeicherten Warenkorb "${savedCart.name}" löschen`
          }
        >
          {deleteMutation.isPending
            ? "Löscht..."
            : isConfirmingDelete
              ? "Nochmal klicken"
              : "Löschen"}
        </Button>
        <Button
          type="button"
          variant="solid"
          onClick={(event) => {
            event.stopPropagation();
            loadMutation.mutate({
              sessionId,
              savedCartId: savedCart.id,
            });
          }}
          disabled={sessionId.length === 0 || loadMutation.isPending}
          className="!h-8 !w-full"
        >
          Laden
        </Button>
      </div>
    </Card>
  );
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
      const quantityStep = getQuantityStepForBaseUnit(match.baseUnit);
      if (!isQuantityAlignedToStep(quantity, quantityStep)) {
        toast.error(
          `Fuer ${match.baseUnit.toLowerCase()} ist nur eine Menge in ${quantityStep.toLocaleString("de-AT")}er-Schritten erlaubt.`,
        );
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

  const exportCartPdf = async () => {
    if (activeItems.length === 0) {
      toast.warning("Warenkorb ist leer.");
      return;
    }

    try {
      const standaloneLines = groupedCartItems.standalone.map((item) => ({
        id: item.id,
        productName: item.product.name,
        sku: item.product.sku ?? item.productId,
        quantity: decimalToNumber(item.quantity),
        unit: item.product.baseUnit,
        unitPrice: decimalToNumber(item.product.price),
      }));
      const partListGroups = groupedCartItems.partLists.map((group) => ({
        id: group.id,
        name: group.name,
        items: group.items.map((item) => ({
          id: item.id,
          productName: item.product.name,
          sku: item.product.sku ?? item.productId,
          quantity: decimalToNumber(item.quantity),
          unit: item.product.baseUnit,
          unitPrice: decimalToNumber(item.product.price),
        })),
      }));
      const positionCount =
        standaloneLines.length + partListGroups.reduce((sum, group) => sum + group.items.length, 0);

      const blob = await pdf(
        <CartPdfDocument
          lines={standaloneLines}
          partListGroups={partListGroups}
          generatedAt={new Date()}
          total={cartTotal}
          positionCount={positionCount}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `warenkorb-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("PDF Export fehlgeschlagen.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
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
          <Button type="button" variant="glass" size="sm" onClick={() => setSavedCartPreview(null)}>
            Schließen
          </Button>
        }
      >
        {savedCartPreview ? (
          <div className="space-y-0">
            <TableUI.Table className="min-w-[520px]">
              <TableUI.TableHeader>
                <tr>
                  <TableUI.TableHead>Produkt</TableUI.TableHead>
                  <TableUI.TableHead className="w-[100px] text-right">Menge</TableUI.TableHead>
                  <TableUI.TableHead className="w-[110px] text-right">Einheit</TableUI.TableHead>
                  <TableUI.TableHead className="w-[140px] text-right">Stückpreis</TableUI.TableHead>
                  <TableUI.TableHead className="w-[160px] text-right">Summe</TableUI.TableHead>
                </tr>
              </TableUI.TableHeader>
              <TableUI.TableBody>
                {savedCartPreview.items.map((item, idx) => {
                  const qty = decimalToNumber(item.quantity);
                  const price = decimalToNumber(item.product.price);
                  return (
                    <TableUI.TableRow key={`${item.productId}:${idx}`}>
                      <TableUI.TableCell className="min-w-[260px]">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{item.product.name}</span>
                          <span className="text-xs text-slate-500">{item.product.sku || item.productId}</span>
                        </div>
                      </TableUI.TableCell>
                      <TableUI.TableCell className="text-right tabular-nums">{qty}</TableUI.TableCell>
                      <TableUI.TableCell className="text-right tabular-nums">
                        {String(item.product.baseUnit).toLowerCase()}
                      </TableUI.TableCell>
                      <TableUI.TableCell className="text-right tabular-nums">{formatPrice(price)}</TableUI.TableCell>
                      <TableUI.TableCell className="text-right font-semibold text-sky-800 tabular-nums">
                        {formatPrice(qty * price)}
                      </TableUI.TableCell>
                    </TableUI.TableRow>
                  );
                })}
              </TableUI.TableBody>
            </TableUI.Table>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3 pr-3">
              <span className="text-sm text-slate-500">Gesamt</span>
              <span className="text-sm font-bold text-sky-800 tabular-nums">
                {formatPrice(savedCartPreviewTotals.total)}
              </span>
            </div>
          </div>
        ) : null}
      </Dialog>

      <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_1fr] mt-6">
        <aside className="space-y-6">
          <Card variant="detail" className="!bg-card/40 hover:!bg-card/40">
            <DetailText variant="title">
              Warenkorb speichern            
            </DetailText>
            <DetailText variant="subvalue">
              Name für späteres Laden vergeben
            </DetailText>
            <Input
              value={cartName}
              onChange={(event) => setCartName(event.target.value)}
              placeholder="z. B. Elektronik Klasse 3BHELS"
              className="mt-3"
            />
            <Button
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
              variant="solid"
              className="mt-3 !h-10"
            >
              {saveCurrentCartMutation.isPending ? "Wird gespeichert..." : "Warenkorb speichern"}
            </Button>
            {saveCurrentCartMutation.error && (
              <p className="mt-2 text-xs text-rose-700">Speichern fehlgeschlagen. Bitte erneut versuchen.</p>
            )}
          </Card>

          <Card variant="detail" className="!bg-card/40 hover:!bg-card/40">
            <DetailText variant="title">
              Gespeicherte Warenkörbe
            </DetailText>
            {loadSavedCartMutation.error?.message === "MIXED_STORAGE_ROOMS" ? (
              <p className="mt-2 text-sm text-rose-700">
                Dieser Warenkorb enthält Produkte aus mehreren Lagerräumen und kann nicht geladen werden.
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {savedCartsQuery.isLoading && <p className="text-sm text-slate-600">Warenkoerbe werden geladen...</p>}
              {!savedCartsQuery.isLoading && (savedCartsQuery.data?.length ?? 0) === 0 && (
                <p className="text-sm text-slate-500">Noch keine gespeicherten Warenkoerbe.</p>
              )}
              {savedCartsQuery.data?.map((savedCart) => (
                <SavedCartRow
                  key={savedCart.id}
                  savedCart={savedCart}
                  sessionId={sessionId}
                  onPreview={setSavedCartPreview}
                  deleteMutation={deleteSavedCartMutation}
                  loadMutation={loadSavedCartMutation}
                />
              ))}
            </div>
          </Card>
        </aside>

        <Card variant="detail" className="p-4 !bg-card/40 hover:!bg-card/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DetailText variant="title">
                Aktueller Warenkorb
              </DetailText>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                onClick={onClearCartClick}
                variant="destructive"
                disabled={
                  sessionId.length === 0 ||
                  activeItems.length === 0 ||
                  isClearingCart ||
                  setQuantityMutation.isPending
                }
                className="!w-fit !h-9"
              >
                {isClearingCart
                  ? "Wird gelöscht..."
                  : confirmClearCart
                    ? "Nochmal klicken"
                    : "Alle Produkte löschen"}
              </Button>
              <ShopExportPdfButton
                onClick={() => void exportCartPdf()}
                disabled={activeItems.length === 0}
                className="!h-9"
              />

              <Link
                href="/checkout"
                className={buttonClassName({
                  variant: "solid",
                  size: "sm",
                  className: "!w-fit !h-9 gap-1.5 rounded-lg px-3 text-sm font-medium",
                })}
              >
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
                Bestellen
              </Link>
            </div>
          </div>

          <section className="mt-3 w-fit">
            <form onSubmit={onExpressAddSubmit} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
              <DetailText variant="subvalue" className="!mt-0 font-semibold">Schnellbestellung</DetailText>
              <label className="flex flex-1 items-center gap-2">
                <DetailText variant="subvalue" className="!mt-0">SKU</DetailText>
                <Input
                  value={expressSku}
                  onChange={(e) => setExpressSku(e.target.value)}
                  placeholder="z.B. BESKO00047F055V"
                  className="!h-6 !max-w-96"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-600 whitespace-nowrap">Menge</span>
                <Input
                  value={expressQuantity}
                  onChange={(e) => setExpressQuantity(e.target.value)}
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="!h-6 !max-w-24"
                />
              </label>
              <Button
                type="submit"
                disabled={addItemMutation.isPending || sessionId.length === 0}
                variant="solid"
                size="sm"
                className="!w-fit !h-6"
              >
                {addItemMutation.isPending ? "Wird hinzugefuegt..." : "In den Warenkorb"}
              </Button>
            </form>
          </section>

          <div className="mt-4 space-y-3">
            {cartQuery.isLoading && <p className="text-sm text-slate-600">Warenkorb wird geladen...</p>}
            {!cartQuery.isLoading && activeItems.length === 0 && (
              <DetailText variant="subvalue">Keine Produkte im Warenkorb.</DetailText>
            )}
            {groupedCartItems.partLists.map((group) => (
              <div
                key={group.id}
                className="overflow-hidden rounded-md border border-card/80 hover:!border-card transition"
              >
                <div className="border-b border-border/40 bg-card/80 px-2 py-2">
                  <p className="text-sm font-semibold text-slate-900"> Stückliste - {group.name}</p>
                </div>
                <div className="space-y-2 p-2">
                  {group.items.map((item) => (
                    <Card
                      key={item.id}
                      variant="detail"
                      className="rounded-md p-1.5 ring-1 ring-inset ring-border/35 "
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-start gap-3">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                            <Button
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
                              variant="ghost"
                              className="mt-1 !h-8 !w-8 shrink-0 p-0 rounded-sm !text-destructive hover:!text-white transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                              aria-label={`${item.product.name} aus dem Warenkorb entfernen`}
                            >
                              <WastebinIcon size={16} className="opacity-90" />
                            </Button>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{item.product.sku}</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="flex justify-center">
                            {(() => {
                              const itemStep = getQuantityStepForBaseUnit(item.product.baseUnit);
                              return (
                                <NumberStepper
                                  value={formatCartQtyString(item.quantity, itemStep)}
                                  onChange={(next) =>
                                    commitCartLineQuantity(next, itemStep, (quantity) =>
                                      setQuantityMutation.mutate({
                                        sessionId,
                                        line: {
                                          productId: item.productId,
                                          sourcePartListId: item.sourcePartListId,
                                        },
                                        quantity,
                                      }),
                                    )
                                  }
                                  min={0}
                                  step={itemStep}
                                  disabled={setQuantityMutation.isPending}
                                  decreaseAriaLabel={`Menge fuer ${item.product.name} verringern`}
                                  increaseAriaLabel={`Menge fuer ${item.product.name} erhoehen`}
                                  inputAriaLabel={`Menge fuer ${item.product.name}`}
                                  className="shrink-0 bg-card/40 !h-9"
                                />
                              );
                            })()}
                          </div>
                          <p className="text-center text-[11px] text-slate-500 mt-1">
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
                    </Card>
                  ))}
                </div>
              </div>
            ))}
            {groupedCartItems.standalone.map((item) => (
              <Card key={item.id} variant="detail" className="px-4 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-start gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
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
                        className="mt-0.5 h-8 w-8 shrink-0 p-0 rounded-sm !text-destructive hover:!text-white transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-1"
                        aria-label={`${item.product.name} aus dem Warenkorb entfernen`}
                      >
                        <WastebinIcon size={16} className="opacity-90" />
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.product.sku}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex justify-center">
                      {(() => {
                        const itemStep = getQuantityStepForBaseUnit(item.product.baseUnit);
                        return (
                          <NumberStepper
                            value={formatCartQtyString(item.quantity, itemStep)}
                            onChange={(next) =>
                              commitCartLineQuantity(next, itemStep, (quantity) =>
                                setQuantityMutation.mutate({
                                  sessionId,
                                  line: {
                                    productId: item.productId,
                                    sourcePartListId: item.sourcePartListId,
                                  },
                                  quantity,
                                }),
                              )
                            }
                            min={0}
                            step={itemStep}
                            disabled={setQuantityMutation.isPending}
                            decreaseAriaLabel={`Menge fuer ${item.product.name} verringern`}
                            increaseAriaLabel={`Menge fuer ${item.product.name} erhoehen`}
                            inputAriaLabel={`Menge fuer ${item.product.name}`}
                            className="shrink-0 bg-card/40"
                          />
                        );
                      })()}
                    </div>
                    <p className="text-center text-[11px] text-slate-500 mt-1">
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
              </Card>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-300 pt-3">
            <div className="flex items-center justify-end text-sm">
              <span className="text-slate-500">Zwischensumme</span>
              <span className="font-bold text-sky-800 px-4">{formatPrice(cartTotal)}</span>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
