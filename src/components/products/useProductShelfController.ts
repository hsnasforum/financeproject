"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  addRecent as addRecentProduct,
  loadShelfFromSnapshot,
  PRODUCT_SHELF_UPDATED_EVENT,
  productShelfConfig,
  toggleCompare as toggleProductCompare,
  toggleFavorite as toggleProductFavorite,
} from "@/lib/state/productShelf";

type ProductShelfStorageSnapshot = [currentRaw: string | null, legacyCompareRaw: string | null];

export type ProductShelfControllerProjection = {
  favoriteIds: Set<string>;
  comparedIds: Set<string>;
  recentViewed: readonly string[];
  compareCount: number;
  compareLimit: number;
};

export type ProductShelfController = ProductShelfControllerProjection & {
  toggleFavorite: typeof toggleProductFavorite;
  toggleCompare: typeof toggleProductCompare;
  addRecent: typeof addRecentProduct;
};

export function createProductShelfStorageSnapshot(
  currentRaw: string | null,
  legacyCompareRaw: string | null,
): string {
  return JSON.stringify([currentRaw, legacyCompareRaw] satisfies ProductShelfStorageSnapshot);
}

const EMPTY_PRODUCT_SHELF_STORAGE_SNAPSHOT = createProductShelfStorageSnapshot(null, null);

function parseProductShelfStorageSnapshot(snapshot: string): ProductShelfStorageSnapshot {
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(parsed)) return [null, null];
    return [
      typeof parsed[0] === "string" ? parsed[0] : null,
      typeof parsed[1] === "string" ? parsed[1] : null,
    ];
  } catch {
    return [null, null];
  }
}

export function projectProductShelfStorageSnapshot(snapshot: string): ProductShelfControllerProjection {
  const [currentRaw, legacyCompareRaw] = parseProductShelfStorageSnapshot(snapshot);
  const shelf = loadShelfFromSnapshot(currentRaw, legacyCompareRaw);
  return {
    favoriteIds: shelf.favorites,
    comparedIds: new Set(shelf.compareBasket),
    recentViewed: shelf.recentViewed,
    compareCount: shelf.compareBasket.length,
    compareLimit: productShelfConfig.maxCompareBasket,
  };
}

function subscribeProductShelf(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleStoreChange = () => onStoreChange();
  const hydrationTimer = window.setTimeout(handleStoreChange, 0);
  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(PRODUCT_SHELF_UPDATED_EVENT, handleStoreChange);
  return () => {
    window.clearTimeout(hydrationTimer);
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(PRODUCT_SHELF_UPDATED_EVENT, handleStoreChange);
  };
}

function getProductShelfStorageSnapshot(): string {
  if (typeof window === "undefined") return EMPTY_PRODUCT_SHELF_STORAGE_SNAPSHOT;
  try {
    return createProductShelfStorageSnapshot(
      window.localStorage.getItem(productShelfConfig.storageKey),
      window.localStorage.getItem(productShelfConfig.legacyCompareStorageKey),
    );
  } catch {
    return EMPTY_PRODUCT_SHELF_STORAGE_SNAPSHOT;
  }
}

function getServerProductShelfStorageSnapshot(): string {
  return EMPTY_PRODUCT_SHELF_STORAGE_SNAPSHOT;
}

export function useProductShelfController(): ProductShelfController {
  const snapshot = useSyncExternalStore(
    subscribeProductShelf,
    getProductShelfStorageSnapshot,
    getServerProductShelfStorageSnapshot,
  );
  return useMemo(() => ({
    ...projectProductShelfStorageSnapshot(snapshot),
    toggleFavorite: toggleProductFavorite,
    toggleCompare: toggleProductCompare,
    addRecent: addRecentProduct,
  }), [snapshot]);
}
