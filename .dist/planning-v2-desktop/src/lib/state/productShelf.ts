const PRODUCT_SHELF_STORAGE_KEY = "products_shelf_v1";
const LEGACY_COMPARE_STORAGE_KEY = "products_compare_ids_v1";
const PRODUCT_SHELF_SCHEMA_VERSION = 1 as const;
const MAX_RECENT_VIEWED = 30;
const MAX_COMPARE_BASKET = 4;

export type ProductShelfState = {
  schemaVersion: typeof PRODUCT_SHELF_SCHEMA_VERSION;
  favorites: Set<string>;
  recentViewed: string[];
  compareBasket: string[];
};

type ProductShelfPersistedV1 = {
  schemaVersion: typeof PRODUCT_SHELF_SCHEMA_VERSION;
  favorites: string[];
  recentViewed: string[];
  compareBasket: string[];
};

type ProductShelfLegacyV0 = {
  favorites?: unknown;
  recentViewed?: unknown;
  compareBasket?: unknown;
  compareIds?: unknown;
};

function inBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeId(value: string): string {
  return value.trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeId(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function clampRecentViewed(ids: string[]): string[] {
  if (ids.length <= MAX_RECENT_VIEWED) return ids;
  return ids.slice(ids.length - MAX_RECENT_VIEWED);
}

function clampCompareBasket(ids: string[]): string[] {
  if (ids.length <= MAX_COMPARE_BASKET) return ids;
  return ids.slice(ids.length - MAX_COMPARE_BASKET);
}

function emptyShelf(): ProductShelfState {
  return {
    schemaVersion: PRODUCT_SHELF_SCHEMA_VERSION,
    favorites: new Set<string>(),
    recentViewed: [],
    compareBasket: [],
  };
}

function toPersisted(state: ProductShelfState): ProductShelfPersistedV1 {
  return {
    schemaVersion: PRODUCT_SHELF_SCHEMA_VERSION,
    favorites: [...state.favorites],
    recentViewed: clampRecentViewed(toStringArray(state.recentViewed)),
    compareBasket: clampCompareBasket(toStringArray(state.compareBasket)),
  };
}

function fromPersistedV1(value: ProductShelfPersistedV1): ProductShelfState {
  return {
    schemaVersion: PRODUCT_SHELF_SCHEMA_VERSION,
    favorites: new Set(toStringArray(value.favorites)),
    recentViewed: clampRecentViewed(toStringArray(value.recentViewed)),
    compareBasket: clampCompareBasket(toStringArray(value.compareBasket)),
  };
}

function migrateV0(value: ProductShelfLegacyV0): ProductShelfState {
  return {
    schemaVersion: PRODUCT_SHELF_SCHEMA_VERSION,
    favorites: new Set(toStringArray(value.favorites)),
    recentViewed: clampRecentViewed(toStringArray(value.recentViewed)),
    compareBasket: clampCompareBasket(
      toStringArray(Array.isArray(value.compareBasket) ? value.compareBasket : value.compareIds),
    ),
  };
}

export function migrateProductShelf(value: unknown): ProductShelfState {
  if (!value || typeof value !== "object") return emptyShelf();
  const row = value as Record<string, unknown>;
  if (row.schemaVersion === PRODUCT_SHELF_SCHEMA_VERSION) {
    return fromPersistedV1(row as unknown as ProductShelfPersistedV1);
  }
  return migrateV0(row as unknown as ProductShelfLegacyV0);
}

export function loadShelf(raw: string | null): ProductShelfState {
  if (!raw) return emptyShelf();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return migrateProductShelf(parsed);
  } catch {
    return emptyShelf();
  }
}

export function saveShelf(state: ProductShelfState): string {
  return JSON.stringify(toPersisted(state));
}

export function loadShelfFromStorage(): ProductShelfState {
  if (!inBrowser()) return emptyShelf();
  const current = window.localStorage.getItem(PRODUCT_SHELF_STORAGE_KEY);
  const loaded = loadShelf(current);
  if (loaded.compareBasket.length > 0 || current) return loaded;

  const legacyCompareRaw = window.localStorage.getItem(LEGACY_COMPARE_STORAGE_KEY);
  const legacyCompare = loadLegacyCompare(legacyCompareRaw);
  if (legacyCompare.length === 0) return loaded;

  const migrated: ProductShelfState = {
    ...loaded,
    compareBasket: clampCompareBasket(legacyCompare),
  };
  persistShelf(migrated);
  return migrated;
}

function loadLegacyCompare(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return clampCompareBasket(toStringArray(parsed));
  } catch {
    return [];
  }
}

function persistShelf(state: ProductShelfState): ProductShelfState {
  const persisted = toPersisted(state);
  const next = fromPersistedV1(persisted);
  if (!inBrowser()) return next;
  window.localStorage.setItem(PRODUCT_SHELF_STORAGE_KEY, JSON.stringify(persisted));
  window.localStorage.setItem(LEGACY_COMPARE_STORAGE_KEY, JSON.stringify(next.compareBasket));
  return next;
}

function withShelf(mutator: (current: ProductShelfState) => ProductShelfState): ProductShelfState {
  const current = loadShelfFromStorage();
  return persistShelf(mutator(current));
}

export function toggleFavorite(id: string): ProductShelfState {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return loadShelfFromStorage();
  return withShelf((current) => {
    const favorites = new Set(current.favorites);
    if (favorites.has(normalizedId)) favorites.delete(normalizedId);
    else favorites.add(normalizedId);
    return {
      ...current,
      favorites,
    };
  });
}

export function addRecent(id: string): ProductShelfState {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return loadShelfFromStorage();
  return withShelf((current) => {
    const deduped = current.recentViewed.filter((entry) => entry !== normalizedId);
    deduped.push(normalizedId);
    return {
      ...current,
      recentViewed: clampRecentViewed(toStringArray(deduped)),
    };
  });
}

export function toggleCompare(id: string): ProductShelfState {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return loadShelfFromStorage();
  return withShelf((current) => {
    const currentSet = new Set(current.compareBasket);
    if (currentSet.has(normalizedId)) {
      return {
        ...current,
        compareBasket: current.compareBasket.filter((entry) => entry !== normalizedId),
      };
    }

    const next = [...current.compareBasket, normalizedId];
    return {
      ...current,
      compareBasket: clampCompareBasket(toStringArray(next)),
    };
  });
}

export function clearCompare(): ProductShelfState {
  return withShelf((current) => ({
    ...current,
    compareBasket: [],
  }));
}

export function saveShelfToStorage(state: ProductShelfState): ProductShelfState {
  return persistShelf(state);
}

export const load = loadShelf;
export const save = saveShelf;
export const migrate = migrateProductShelf;

export const productShelfConfig = {
  storageKey: PRODUCT_SHELF_STORAGE_KEY,
  schemaVersion: PRODUCT_SHELF_SCHEMA_VERSION,
  maxRecentViewed: MAX_RECENT_VIEWED,
  maxCompareBasket: MAX_COMPARE_BASKET,
};
