import {
  clearCompare,
  loadShelfFromStorage,
  productShelfConfig,
  saveShelfToStorage,
} from "../state/productShelf";

const COMPARE_STORAGE_KEY = "products_compare_ids_v1";
const DEFAULT_COMPARE_LIMIT = 4;

function normalizeId(id: string): string {
  return id.trim();
}

function normalizeList(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function inBrowser(): boolean {
  return typeof window !== "undefined";
}

export function limitCompareIds(ids: string[], max = DEFAULT_COMPARE_LIMIT): string[] {
  const normalized = normalizeList(ids);
  const safeMax = Number.isFinite(max) ? Math.max(1, Math.trunc(max)) : DEFAULT_COMPARE_LIMIT;
  if (normalized.length <= safeMax) return normalized;
  return normalized.slice(normalized.length - safeMax);
}

export function addCompareId(ids: string[], id: string, max = DEFAULT_COMPARE_LIMIT): string[] {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return limitCompareIds(ids, max);
  const next = [...normalizeList(ids)];
  if (!next.includes(normalizedId)) next.push(normalizedId);
  return limitCompareIds(next, max);
}

export function removeCompareId(ids: string[], id: string): string[] {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return normalizeList(ids);
  return normalizeList(ids).filter((item) => item !== normalizedId);
}

export function loadCompareIds(raw: string | null, max = DEFAULT_COMPARE_LIMIT): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((entry): entry is string => typeof entry === "string");
    return limitCompareIds(ids, max);
  } catch {
    return [];
  }
}

export function loadCompareIdsFromStorage(max = DEFAULT_COMPARE_LIMIT): string[] {
  if (!inBrowser()) return [];
  const shelf = loadShelfFromStorage();
  return limitCompareIds(shelf.compareBasket, max);
}

export function saveCompareIdsToStorage(ids: string[], max = DEFAULT_COMPARE_LIMIT): string[] {
  const next = limitCompareIds(ids, max);
  if (!inBrowser()) return next;
  const shelf = loadShelfFromStorage();
  saveShelfToStorage({
    ...shelf,
    compareBasket: next,
  });
  return next;
}

export function addCompareIdToStorage(id: string, max = DEFAULT_COMPARE_LIMIT): string[] {
  const shelf = loadShelfFromStorage();
  const next = addCompareId(shelf.compareBasket, id, max);
  saveShelfToStorage({
    ...shelf,
    compareBasket: next,
  });
  return next;
}

export function removeCompareIdFromStorage(id: string, max = DEFAULT_COMPARE_LIMIT): string[] {
  const current = loadCompareIdsFromStorage(max);
  const next = removeCompareId(current, id);
  return saveCompareIdsToStorage(next, max);
}

export function clearCompareIdsStorage(): void {
  if (!inBrowser()) return;
  clearCompare();
}

export const compareStoreConfig = {
  storageKey: COMPARE_STORAGE_KEY,
  max: Math.min(DEFAULT_COMPARE_LIMIT, productShelfConfig.maxCompareBasket),
};
