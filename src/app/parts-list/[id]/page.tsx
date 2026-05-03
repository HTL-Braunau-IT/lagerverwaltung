"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/detail-card";
import { useToast } from "~/components/ui/toast";
import { api } from "~/trpc/react";
import { CartAddedModal } from "~/components/shop/cart-added-modal";
import {
  ShopAddToCartButton,
  ShopExportPdfButton,
} from "~/components/shop/shop-quantity-add-to-cart";
import { NumberStepper } from "~/components/ui/number-stepper";
import { PackageIcon } from "~/components/layout/icon-renders";
import { ShopCategoriesAside, ShopPartListsAside } from "~/components/shop/shop-asides";
import { PartListPdfDocument } from "~/components/shop/pdf/part-list-pdf-document";

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

function formatStock(value: unknown, baseUnit: string) {
  return `${decimalToNumber(value)} ${baseUnit.toLowerCase()}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ampel wie bei Produkten: Rot 0, Gelb 1–2, Gruen 3+. */
function partListAvailabilityDotClass(maxOrderable: number): string {
  if (maxOrderable <= 0) return "bg-red-500";
  if (maxOrderable <= 2) return "bg-amber-400";
  return "bg-emerald-500";
}

function partListAvailabilityTitle(maxOrderable: number): string {
  if (maxOrderable <= 0) {
    return "Nicht bestellbar: fuer eine komplette Teileliste reicht der Bestand nicht";
  }
  if (maxOrderable <= 2) {
    return "Niedrig: nur wenige komplette Teilelisten sind gleichzeitig aus dem Bestand moeglich";
  }
  return "Ausreichend: mehrere komplette Teilelisten sind aus dem Bestand moeglich";
}

function PartListMaxOrderableLine({
  maxOrderable,
  partListName,
}: {
  maxOrderable: number;
  partListName: string;
}) {
  const dotClass = partListAvailabilityDotClass(maxOrderable);
  const title = partListAvailabilityTitle(maxOrderable);
  const formatted = new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(maxOrderable);
  const srSummary = `${formatted} mal komplett als Teileliste „${partListName}“ aus aktuellem Bestand moeglich. ${title}`;

  return (
    <div className="-mt-1 mb-2 flex items-center gap-1.5 text-sm justify-start">
      <p className="sr-only">{srSummary}</p>
      <span className={["h-2 w-2 shrink-0 rounded-full", dotClass].join(" ")} title={title} aria-hidden />
      <PackageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-semibold tabular-nums text-foreground">{formatted}</span>
      <span className="text-muted-foreground">mal</span>
      <span className="text-muted-foreground">verfügbar</span>
    </div>
  );
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
  const [quantityInput, setQuantityInput] = useState("1");
  const [lastAddedPartListQuantity, setLastAddedPartListQuantity] = useState<number | null>(null);
  // Match space below the header to the grid: main `pt-10` (40px) + section `mt-2` (8px).
  // Header uses `sticky top-5`; gap is accounted for in aside `stickyStyle` via measured height.
  const stickyTopOffset = 48;
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);

  const utils = api.useUtils();
  const toast = useToast();
  const selectedPartListQuery = api.partsList.byIdForShop.useQuery(
    { id: partListId },
    { enabled: Boolean(partListId) },
  );
  const addPartListMutation = api.cart.addPartList.useMutation({
    onSuccess: async (result) => {
      await utils.cart.get.invalidate({ sessionId });

      if (result.ok) {
        setShowCartModal(true);
        return;
      }

      if (result.reason === "INSUFFICIENT_PART_LIST_STOCK") {
        toast.warning(
          `${result.partListName}: maximal ${result.maxOrderable}x verfügbar.`,
        );
        return;
      }

      toast.error("Teileliste konnte nicht hinzugefuegt werden.");
    },
    onError: () => {
      toast.error("Teileliste konnte nicht hinzugefuegt werden.");
    },
  });

  const shopMaxOrderable = selectedPartListQuery.data?.maxOrderable;

  useEffect(() => {
    if (shopMaxOrderable === undefined || shopMaxOrderable <= 0) return;
    setQuantityInput((prev) => {
      const n = Math.max(1, Math.floor(Number(prev) || 1));
      return n > shopMaxOrderable ? String(shopMaxOrderable) : prev;
    });
  }, [shopMaxOrderable]);

  useEffect(() => {
    const updateAppHeaderOffset = () => {
      const appHeader = document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
      setAppHeaderOffset(appHeader?.offsetHeight ?? 0);
    };

    updateAppHeaderOffset();
    window.addEventListener("resize", updateAppHeaderOffset);
    return () => window.removeEventListener("resize", updateAppHeaderOffset);
  }, []);

  if (selectedPartListQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 pt-10 pb-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Teileliste wird geladen...</p>
          <p className="mt-1 text-sm text-muted-foreground">Bitte kurz warten.</p>
        </div>
      </main>
    );
  }

  if (selectedPartListQuery.error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 pt-10 pb-6 sm:px-4 lg:px-6">
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
      <main className="mx-auto min-h-screen w-full max-w-[90%] px-2 pt-10 pb-6 sm:px-4 lg:px-6">
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
  const maxOrderable = selectedPartList.maxOrderable;
  const parsedQuantity = Number(quantityInput);
  const selectedQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? Math.floor(parsedQuantity)
      : 1;
  const canAddPartListToCart =
    maxOrderable > 0 && selectedQuantity >= 1 && selectedQuantity <= maxOrderable;
  const selectedImageUrl = selectedPartList.imageUrl ?? "/pictures/placeholder.jpg";
  const searchFromUrl = (searchParams.get("search") ?? "").trim();

  const exportPartListPdf = async () => {
    try {
      const blob = await pdf(
        <PartListPdfDocument
          name={selectedPartList.name}
          description={selectedPartList.description}
          maxOrderable={selectedPartList.maxOrderable}
          generatedAt={new Date()}
          items={selectedPartList.items.map((item) => ({
            id: item.id,
            productName: item.product.name,
            sku: item.product.sku,
            quantity: decimalToNumber(item.quantity),
            unit: item.product.baseUnit,
            quantityOnHand: decimalToNumber(item.product.quantityOnHand),
          }))}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `teileliste-${selectedPartList.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("PDF Export fehlgeschlagen.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[90%] flex-col gap-0 px-2 pt-10 pb-6 sm:px-4 lg:px-6">
      <section className="mt-2 mx-2 grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr_340px]">
        <ShopCategoriesAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          selectedCategoryId={selectedCategoryId}
          onSelectedCategoryIdChange={setSelectedCategoryId}
          onCategoryPicked={(categoryId) => {
            const params = new URLSearchParams();
            if (searchFromUrl) params.set("search", searchFromUrl);
            if (categoryId) params.set("categoryId", categoryId);
            const query = params.toString();
            router.push(query ? `/?${query}` : "/");
          }}
        />

        <div className="flex min-w-0 flex-col gap-6">
        <Card variant="detail" className="p-6 !bg-card/40 hover:!bg-card/40">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
            <span aria-hidden="true">←</span>
            Zurück zur Produktliste
          </Link>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-md">
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
              <p
                className={
                  selectedPartList.description?.trim()
                    ? "mt-4 text-sm text-foreground"
                    : "mt-4 text-sm italic text-muted-foreground/80"
                }
              >
                {selectedPartList.description?.trim() || "Keine Beschreibung verfügbar."}
              </p>
              <div className="mt-5">
                <div className="mt-2">
                  <PartListMaxOrderableLine
                    maxOrderable={maxOrderable}
                    partListName={selectedPartList.name}
                  />
                </div>
                
                <ShopExportPdfButton onClick={() => void exportPartListPdf()} className="!w-fit"/>
                <div className="mt-3 flex w-full flex-nowrap items-center gap-2">
                  <NumberStepper
                    value={quantityInput}
                    onChange={setQuantityInput}
                    min={1}
                    max={maxOrderable > 0 ? maxOrderable : undefined}
                    step={1}
                    decreaseAriaLabel={`Menge fuer Teileliste ${selectedPartList.name} reduzieren`}
                    increaseAriaLabel={`Menge fuer Teileliste ${selectedPartList.name} erhoehen`}
                    inputAriaLabel={`Menge fuer Teileliste ${selectedPartList.name}`}
                    className="shrink-0 !rounded-sm !border-0 !bg-card/40 !shadow-none [&_button]:!h-9 !h-9"
                  />
                  <ShopAddToCartButton
                    onClick={() => {
                      const raw = Math.max(1, Math.floor(Number(quantityInput) || 1));
                      const requestedQuantity =
                        maxOrderable > 0 ? Math.min(raw, maxOrderable) : raw;
                      setLastAddedPartListQuantity(requestedQuantity);
                      addPartListMutation.mutate({
                        sessionId,
                        partListId: selectedPartList.id,
                        quantity: requestedQuantity,
                      });
                    }}
                    disabled={
                      sessionId.length === 0 ||
                      addPartListMutation.isPending ||
                      !canAddPartListToCart
                    }
                    pending={addPartListMutation.isPending}
                    className="!h-9 !min-h-9 min-w-0 !w-fit !rounded-sm px-4 text-sm font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-md bg-card/40 p-4">
              <h2 className="text-sm font-semibold text-foreground">Produkte</h2>
              <div className="mt-3 space-y-2">
                {selectedPartList.items.length === 0 ? (
                  <p className="mt-4 text-sm italic text-muted-foreground/80">Keine Produkte in dieser Teileliste.</p>
                ) : (
                  selectedPartList.items.map((item) => {
                    const previewImage = item.product.images[0]?.url ?? "/pictures/placeholder.jpg";
                    const previewAlt = item.product.images[0]?.altText ?? `${item.product.name} Produktbild`;
                    return (
                      <Link
                        key={item.id}
                        href={`/products/${item.product.id}`}
                        className="flex items-center gap-3 rounded-md bg-card/40 p-2 hover:bg-card/80"
                      >
                        <img
                          src={previewImage}
                          alt={previewAlt}
                          className="h-14 w-14 rounded-sm object-cover"
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

            <div className="rounded-md bg-card/40 p-4">
              <h2 className="text-sm font-semibold text-foreground">Dokumente</h2>
              <div className="mt-3 space-y-2">
                {selectedPartList.documents.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground/80">Keine Dokumente vorhanden.</p>
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
        </div>

        <ShopPartListsAside
          appHeaderOffset={appHeaderOffset}
          stickyTopOffset={stickyTopOffset}
          sessionId={sessionId}
          canSeePartListProductCount={canSeePartListProductCount}
          onAddedToCart={() => setShowCartModal(true)}
        />
      </section>

      <CartAddedModal
        open={showCartModal}
        itemName={`Stückliste - ${selectedPartList.name}`}
        itemQuantity={lastAddedPartListQuantity}
        onContinueShopping={() => setShowCartModal(false)}
        onGoToCart={() => {
          setShowCartModal(false);
          router.push("/carts");
        }}
      />
    </main>
  );
}
