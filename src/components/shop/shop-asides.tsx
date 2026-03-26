"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { PinIcon } from "~/components/layout/icon-renders";

type StickySizing = {
  appHeaderOffset: number;
  stickyTopOffset: number;
};

function stickyStyle({ appHeaderOffset, stickyTopOffset }: StickySizing) {
  const top = appHeaderOffset + stickyTopOffset;
  return {
    top: `${top}px`,
    maxHeight: `calc(100vh - ${top + 16}px)`,
  } as const;
}

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function toMixedStorageRoomWarning(message: string | null | undefined): string | null {
  if (!message) return null;
  if (message.startsWith("MIXED_STORAGE_ROOMS:")) {
    const [, existingRoom, incomingRoom] = message.split(":");
    if (existingRoom && incomingRoom) {
      return `Du hast bereits Produkte aus Lagerraum ${existingRoom} im Warenkorb. Bitte entferne diese zuerst oder schliesse die Bestellung ab, bevor du Produkte aus Lagerraum ${incomingRoom} hinzufuegst.`;
    }
    return "Warenkorb darf nur Produkte aus einem Lagerraum enthalten.";
  }
  if (message === "MIXED_STORAGE_ROOMS") {
    return "Warenkorb darf nur Produkte aus einem Lagerraum enthalten.";
  }
  if (message.startsWith("PRODUCT_WITHOUT_STORAGE_ROOM:")) {
    return "Dieses Produkt ist keinem Lagerraum zugeordnet und kann nicht in den Warenkorb gelegt werden.";
  }
  return null;
}

type ShopCategoriesAsideProps = StickySizing & {
  className?: string;
  selectedCategoryId?: string | undefined;
  onSelectedCategoryIdChange?: (categoryId: string | undefined) => void;
  onCategoryPicked?: (categoryId: string | undefined) => void;
};

export function ShopCategoriesAside({
  appHeaderOffset,
  stickyTopOffset,
  className = "",
  selectedCategoryId,
  onSelectedCategoryIdChange,
  onCategoryPicked,
}: ShopCategoriesAsideProps) {
  const categoryQuery = api.category.list.useQuery();
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | undefined>(undefined);

  const currentSelected = onSelectedCategoryIdChange ? selectedCategoryId : uncontrolledSelected;
  const setSelected = onSelectedCategoryIdChange ?? setUncontrolledSelected;

  return (
    <aside
      className={`self-start rounded-2xl border border-border bg-card p-3 shadow-sm lg:sticky lg:overflow-auto ${className}`}
      style={stickyStyle({ appHeaderOffset, stickyTopOffset })}
    >
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Kategorien</p>
      <nav className="space-y-1">
        <Button
          onClick={() => {
            setSelected(undefined);
            onCategoryPicked?.(undefined);
          }}
          variant={currentSelected === undefined ? "secondary" : "ghost"}
          className={`h-9 w-full justify-between rounded-lg px-3 text-left text-sm ${
            currentSelected === undefined ? "" : "text-muted-foreground"
          }`}
        >
          <span>Alle Kategorien</span>
        </Button>
        {categoryQuery.data?.map((category) => (
          <Button
            key={category.id}
            onClick={() => {
              setSelected(category.id);
              onCategoryPicked?.(category.id);
            }}
            variant={currentSelected === category.id ? "secondary" : "ghost"}
            className={`h-9 w-full justify-between rounded-lg px-3 text-left text-sm ${
              currentSelected === category.id ? "" : "text-muted-foreground"
            }`}
          >
            <span className="truncate">{category.name}</span>
            <span className="text-xs">({category._count.products})</span>
          </Button>
        ))}
      </nav>
    </aside>
  );
}

type ShopPartListsAsideProps = StickySizing & {
  className?: string;
  sessionId: string;
  canSeePartListProductCount: boolean;
  onAddedToCart?: () => void;
  warning?: string | null;
  onWarningChange?: (warning: string | null) => void;
};

export function ShopPartListsAside({
  appHeaderOffset,
  stickyTopOffset,
  className = "",
  sessionId,
  canSeePartListProductCount,
  onAddedToCart,
  warning,
  onWarningChange,
}: ShopPartListsAsideProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const [showAllPartListsModal, setShowAllPartListsModal] = useState(false);
  const [partListModalSearch, setPartListModalSearch] = useState("");
  const [activeAddPartListId, setActiveAddPartListId] = useState<string | null>(null);
  const [quantitiesByPartList, setQuantitiesByPartList] = useState<Record<string, string>>({});
  const [internalWarning, setInternalWarning] = useState<string | null>(null);
  const partListWarning = onWarningChange ? warning ?? null : internalWarning;
  const setPartListWarning = onWarningChange ?? setInternalWarning;

  const partListsQuery = api.partsList.listForShop.useQuery();
  const pinnedPartListsQuery = api.partsList.pinnedForUser.useQuery(undefined, {
    enabled: Boolean(session?.user.id) && canSeePartListProductCount,
  });
  const togglePinnedPartListMutation = api.partsList.togglePinned.useMutation({
    onSuccess: async () => {
      await utils.partsList.pinnedForUser.invalidate();
    },
  });

  const addPartListMutation = api.cart.addPartList.useMutation({
    onSuccess: async (result) => {
      await utils.cart.get.invalidate({ sessionId });
      setActiveAddPartListId(null);

      if (result.ok) {
        setPartListWarning(null);
        onAddedToCart?.();
        return;
      }

      if (result.reason === "INSUFFICIENT_PART_LIST_STOCK") {
        setPartListWarning(`${result.partListName}: maximal ${result.maxOrderable}x verfuegbar.`);
        return;
      }

      setPartListWarning("Teileliste konnte nicht hinzugefuegt werden.");
    },
    onError: (error) => {
      const warning = toMixedStorageRoomWarning(error.message);
      if (warning) {
        setPartListWarning(warning);
        return;
      }
      setPartListWarning("Teileliste konnte nicht hinzugefuegt werden.");
    },
  });

  const pinnedPartListIds = useMemo(() => new Set(pinnedPartListsQuery.data ?? []), [pinnedPartListsQuery.data]);
  const allPartLists = useMemo(() => partListsQuery.data ?? [], [partListsQuery.data]);
  const pinnedPartLists = useMemo(
    () => allPartLists.filter((partList) => pinnedPartListIds.has(partList.id)),
    [allPartLists, pinnedPartListIds],
  );

  const modalSearchTerm = partListModalSearch.trim().toLowerCase();
  const filteredPinnedPartListsForModal = useMemo(() => {
    if (!modalSearchTerm) return pinnedPartLists;
    return pinnedPartLists.filter((partList) => partList.name.toLowerCase().includes(modalSearchTerm));
  }, [modalSearchTerm, pinnedPartLists]);
  const filteredPartListsForModal = useMemo(() => {
    const base = allPartLists.filter((partList) => !pinnedPartListIds.has(partList.id));
    if (!modalSearchTerm) return base;
    return base.filter((partList) => partList.name.toLowerCase().includes(modalSearchTerm));
  }, [allPartLists, modalSearchTerm, pinnedPartListIds]);

  return (
    <>
      <div
        className={`self-start flex flex-col gap-4 lg:sticky lg:overflow-hidden ${className}`}
        style={stickyStyle({ appHeaderOffset, stickyTopOffset })}
      >
        {canSeePartListProductCount ? (
          <aside className="min-h-0 rounded-2xl border border-border bg-card p-3 shadow-sm lg:overflow-auto">
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Teilelisten</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setPartListModalSearch("");
                  setShowAllPartListsModal(true);
                }}
                disabled={partListsQuery.isLoading || Boolean(partListsQuery.error)}
              >
                Alle anzeigen ({allPartLists.length})
              </Button>
            </div>

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

            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Gepinnt
            </p>
            {pinnedPartLists.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                Noch keine gepinnten Teilelisten. Du kannst Teilelisten in der Übersicht pinnen.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {pinnedPartLists.map((partList) => {
                  const quantityInput = quantitiesByPartList[partList.id] ?? "1";
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
                          {partList.name}{" "}
                          <span className="text-[11px] font-normal text-muted-foreground">
                            | {partList.items.length} Produkte
                          </span>
                        </p>
                        <button
                          type="button"
                          className="grid h-5 w-5 place-items-start justify-items-end rounded-md text-primary hover:bg-accent"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePinnedPartListMutation.mutate({ partListId: partList.id });
                          }}
                          aria-label={`Teileliste ${partList.name} pinnen oder entpinnen`}
                        >
                          <span className="pt-1 pr-1">
                            <PinIcon size={12} className="text-primary" filled />
                          </span>
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={quantityInput}
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
                          {addPartListMutation.isPending && activeAddPartListId === partList.id
                            ? "..."
                            : "In den Warenkorb"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <Dialog
        open={showAllPartListsModal}
        onClose={() => setShowAllPartListsModal(false)}
        title="Alle Teilelisten"
        description="Gepinnte Teilelisten stehen oben. Tippe auf das Symbol, um Teilelisten zu pinnen oder zu entpinnen."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={partListModalSearch}
              onChange={(event) => setPartListModalSearch(event.target.value)}
              placeholder="Teilelisten suchen..."
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              aria-label="Teilelisten suchen"
            />
          </div>

          {partListsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Teilelisten werden geladen...</p>
          ) : null}
          {partListsQuery.error ? (
            <p className="text-sm text-destructive">Teilelisten konnten nicht geladen werden.</p>
          ) : null}

          {!partListsQuery.isLoading && !partListsQuery.error ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Gepinnt ({pinnedPartLists.length})
                </p>
                {filteredPinnedPartListsForModal.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pinnedPartLists.length === 0
                      ? "Noch keine gepinnten Teilelisten."
                      : "Keine gepinnten Teilelisten passen zur Suche."}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredPinnedPartListsForModal.map((partList) => {
                      const quantityInput = quantitiesByPartList[partList.id] ?? "1";
                      return (
                        <div
                          key={`pinned-${partList.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setShowAllPartListsModal(false);
                            router.push(`/parts-list/${partList.id}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setShowAllPartListsModal(false);
                              router.push(`/parts-list/${partList.id}`);
                            }
                          }}
                          className="cursor-pointer rounded-xl border border-border bg-muted/40 p-3 transition hover:border-primary/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="min-w-0 flex-1 break-all text-sm font-semibold text-foreground"
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 3,
                                overflow: "hidden",
                              }}
                            >
                              {partList.name}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                | {partList.items.length} Produkte
                              </span>
                            </p>
                            <button
                              type="button"
                              className="grid h-5 w-5 place-items-start justify-items-end rounded-md text-primary hover:bg-accent"
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePinnedPartListMutation.mutate({ partListId: partList.id });
                              }}
                              aria-label={`Teileliste ${partList.name} pinnen oder entpinnen`}
                            >
                              <span className="pt-1 pr-1">
                                <PinIcon size={12} className="text-primary" filled />
                              </span>
                            </button>
                          </div>
                          <div
                            className="mt-3 flex items-center gap-2" 
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={quantityInput}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setQuantitiesByPartList((prev) => ({
                                  ...prev,
                                  [partList.id]: event.target.value,
                                }))
                              }
                              className="h-9 w-14 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                              aria-label={`Menge fuer Teileliste ${partList.name}`}
                            />
                            <Button
                              size="sm"
                              className="h-9 flex-1"
                              onClick={(event) => {
                                event.stopPropagation();
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
                              {addPartListMutation.isPending && activeAddPartListId === partList.id
                                ? "..."
                                : "In den Warenkorb"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Alle Teilelisten ({filteredPartListsForModal.length})
                </p>
                {filteredPartListsForModal.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Keine Teilelisten passen zur Suche.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredPartListsForModal.map((partList) => {
                      const isPinned = pinnedPartListIds.has(partList.id);
                      const quantityInput = quantitiesByPartList[partList.id] ?? "1";
                      return (
                        <div
                          key={partList.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setShowAllPartListsModal(false);
                            router.push(`/parts-list/${partList.id}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setShowAllPartListsModal(false);
                              router.push(`/parts-list/${partList.id}`);
                            }
                          }}
                          className="cursor-pointer rounded-xl border border-border bg-card p-3 transition hover:border-primary/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="min-w-0 flex-1 break-all text-sm font-semibold text-foreground"
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 3,
                                overflow: "hidden",
                              }}
                            >
                              {partList.name}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                | {partList.items.length} Produkte
                              </span>
                            </p>
                            <button
                              type="button"
                              className={`grid h-5 w-5 place-items-start justify-items-end rounded-md hover:bg-accent ${
                                isPinned ? "text-primary" : "text-muted-foreground"
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePinnedPartListMutation.mutate({ partListId: partList.id });
                              }}
                              aria-label={`Teileliste ${partList.name} pinnen oder entpinnen`}
                            >
                              <span className="pt-1 pr-1">
                                <PinIcon
                                  size={12}
                                  className={isPinned ? "text-primary" : "text-muted-foreground"}
                                  filled={isPinned}
                                />
                              </span>
                            </button>
                          </div>
                          <div
                            className="mt-3 flex items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={quantityInput}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setQuantitiesByPartList((prev) => ({
                                  ...prev,
                                  [partList.id]: event.target.value,
                                }))
                              }
                              className="h-9 w-14 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                              aria-label={`Menge fuer Teileliste ${partList.name}`}
                            />
                            <Button
                              size="sm"
                              className="h-9 flex-1"
                              onClick={(event) => {
                                event.stopPropagation();
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
                              {addPartListMutation.isPending && activeAddPartListId === partList.id
                                ? "..."
                                : "In den Warenkorb"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

