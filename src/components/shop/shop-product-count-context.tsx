"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ShopProductCountSnapshot = {
  filtered: number;
  total: number;
  isLoading: boolean;
};

type ShopProductCountContextValue = {
  snapshot: ShopProductCountSnapshot | null;
  setSnapshot: (value: ShopProductCountSnapshot | null) => void;
};

const ShopProductCountContext = createContext<ShopProductCountContextValue | null>(null);

export function ShopProductCountProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ShopProductCountSnapshot | null>(null);
  const value = useMemo(() => ({ snapshot, setSnapshot }), [snapshot]);
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
