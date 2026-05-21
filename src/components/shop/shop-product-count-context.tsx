"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ShopProductCountSnapshot = {
  filtered: number;
  total: number;
  isLoading: boolean;
};

type ShopProductCountContextValue = {
  snapshot: ShopProductCountSnapshot | null;
  setSnapshot: (value: ShopProductCountSnapshot | null) => void;
  hasActiveFilters: boolean;
  setHasActiveFilters: (value: boolean) => void;
  resetFiltersRef: React.MutableRefObject<(() => void) | null>;
};

const ShopProductCountContext = createContext<ShopProductCountContextValue | null>(null);

export function ShopProductCountProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ShopProductCountSnapshot | null>(null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const resetFiltersRef = useRef<(() => void) | null>(null);
  const value = useMemo(
    () => ({ snapshot, setSnapshot, hasActiveFilters, setHasActiveFilters, resetFiltersRef }),
    [snapshot, hasActiveFilters],
  );
  return (
    <ShopProductCountContext.Provider value={value}>{children}</ShopProductCountContext.Provider>
  );
}

export function useShopProductCountSnapshot(): ShopProductCountSnapshot | null {
  return useContext(ShopProductCountContext)?.snapshot ?? null;
}

export function useShopProductCountPublisher() {
  const ctx = useContext(ShopProductCountContext);
  if (!ctx) {
    throw new Error("useShopProductCountPublisher must be used within ShopProductCountProvider");
  }
  return ctx.setSnapshot;
}

export function useShopFiltersPublisher() {
  const ctx = useContext(ShopProductCountContext);
  if (!ctx) {
    throw new Error("useShopFiltersPublisher must be used within ShopProductCountProvider");
  }
  return {
    setHasActiveFilters: ctx.setHasActiveFilters,
    resetFiltersRef: ctx.resetFiltersRef,
  };
}

export function useShopHasActiveFilters() {
  const ctx = useContext(ShopProductCountContext);
  return ctx?.hasActiveFilters ?? false;
}

export function useShopFiltersReset() {
  const ctx = useContext(ShopProductCountContext);
  return useCallback(() => {
    ctx?.resetFiltersRef.current?.();
  }, [ctx]);
}
