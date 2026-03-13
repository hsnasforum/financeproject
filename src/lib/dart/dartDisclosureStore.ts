type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "dart_disclosure_store_v1";
const SEEN_MAX_PER_CORP = 500;
const RECENT_CORP_MAX = 50;

export type DisclosureMonitorSettings = {
  from?: string;
  to?: string;
  type?: string;
  finalOnly: boolean;
  pageCount: number;
};

export type DisclosureMonitorView = {
  focusMode: "all" | "pending" | "unchecked";
};

export type DisclosureMonitorState = {
  seenReceiptNos: Record<string, string[]>;
  lastCheckedAt: Record<string, string>;
  settings: DisclosureMonitorSettings;
  view: DisclosureMonitorView;
};

export type DisclosureLikeItem = {
  receiptNo?: string;
  rcept_no?: string;
  corpCode?: string;
  corp_code?: string;
  [key: string]: unknown;
};

export type DisclosureDiffResult<T extends DisclosureLikeItem> = {
  newItems: T[];
  seenItems: T[];
};

function inBrowser(): boolean {
  return typeof window !== "undefined";
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (!inBrowser()) return null;
  return window.localStorage;
}

function normalizeCorpCode(value: string): string {
  return value.trim();
}

function normalizeReceiptNo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function defaultSettings(): DisclosureMonitorSettings {
  return {
    finalOnly: true,
    pageCount: 20,
  };
}

function defaultView(): DisclosureMonitorView {
  return {
    focusMode: "all",
  };
}

function safeSettings(input: unknown): DisclosureMonitorSettings {
  if (!input || typeof input !== "object") return defaultSettings();
  const value = input as Record<string, unknown>;
  const from = typeof value.from === "string" && value.from.trim() ? value.from.trim() : undefined;
  const to = typeof value.to === "string" && value.to.trim() ? value.to.trim() : undefined;
  const type = typeof value.type === "string" && value.type.trim() ? value.type.trim() : undefined;
  const finalOnly = value.finalOnly === false ? false : true;
  const pageCountRaw = Number(value.pageCount);
  const pageCount = Number.isInteger(pageCountRaw) ? Math.max(1, Math.min(100, pageCountRaw)) : 20;
  return {
    from,
    to,
    type,
    finalOnly,
    pageCount,
  };
}

function safeView(input: unknown): DisclosureMonitorView {
  if (!input || typeof input !== "object") return defaultView();
  const value = input as Record<string, unknown>;
  const focusMode = value.focusMode;
  if (focusMode === "pending" || focusMode === "unchecked" || focusMode === "all") {
    return { focusMode };
  }
  return {
    focusMode: value.showPendingOnly === true ? "pending" : "all",
  };
}

function emptyState(): DisclosureMonitorState {
  return {
    seenReceiptNos: {},
    lastCheckedAt: {},
    settings: defaultSettings(),
    view: defaultView(),
  };
}

function parseState(raw: string | null): DisclosureMonitorState {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyState();
    const value = parsed as Record<string, unknown>;
    const seenRaw = value.seenReceiptNos;
    const lastCheckedRaw = value.lastCheckedAt;
    const seenReceiptNos: Record<string, string[]> = {};
    if (seenRaw && typeof seenRaw === "object") {
      for (const [corpCodeRaw, rows] of Object.entries(seenRaw as Record<string, unknown>)) {
        const corpCode = normalizeCorpCode(corpCodeRaw);
        if (!corpCode || !Array.isArray(rows)) continue;
        const out: string[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
          const receiptNo = normalizeReceiptNo(row);
          if (!receiptNo || seen.has(receiptNo)) continue;
          seen.add(receiptNo);
          out.push(receiptNo);
          if (out.length >= SEEN_MAX_PER_CORP) break;
        }
        if (out.length > 0) seenReceiptNos[corpCode] = out;
      }
    }

    const lastCheckedAt: Record<string, string> = {};
    if (lastCheckedRaw && typeof lastCheckedRaw === "object") {
      for (const [corpCodeRaw, dateRaw] of Object.entries(lastCheckedRaw as Record<string, unknown>)) {
        const corpCode = normalizeCorpCode(corpCodeRaw);
        if (!corpCode || typeof dateRaw !== "string") continue;
        const parsedDate = new Date(dateRaw);
        if (!Number.isFinite(parsedDate.getTime())) continue;
        lastCheckedAt[corpCode] = parsedDate.toISOString();
      }
    }

    return {
      seenReceiptNos,
      lastCheckedAt,
      settings: safeSettings(value.settings),
      view: safeView(value.view),
    };
  } catch {
    return emptyState();
  }
}

function readState(storage?: StorageLike): DisclosureMonitorState {
  const resolved = resolveStorage(storage);
  if (!resolved) return emptyState();
  return parseState(resolved.getItem(STORAGE_KEY));
}

function writeState(next: DisclosureMonitorState, storage?: StorageLike): DisclosureMonitorState {
  const resolved = resolveStorage(storage);
  if (!resolved) return next;
  resolved.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function extractReceiptNos(items: DisclosureLikeItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const receiptNo = normalizeReceiptNo(item.receiptNo ?? item.rcept_no);
    if (!receiptNo || seen.has(receiptNo)) continue;
    seen.add(receiptNo);
    out.push(receiptNo);
  }
  return out;
}

function limitCorpMaps<T>(map: Record<string, T>): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= RECENT_CORP_MAX) return map;
  const picked = keys.slice(keys.length - RECENT_CORP_MAX);
  const next: Record<string, T> = {};
  for (const key of picked) {
    next[key] = map[key] as T;
  }
  return next;
}

export function listSeenReceiptNos(corpCode: string, storage?: StorageLike): string[] {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) return [];
  return readState(storage).seenReceiptNos[normalized] ?? [];
}

export function getLastCheckedAt(corpCode: string, storage?: StorageLike): string | null {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) return null;
  return readState(storage).lastCheckedAt[normalized] ?? null;
}

export function getDisclosureSettings(storage?: StorageLike): DisclosureMonitorSettings {
  return readState(storage).settings;
}

export function getDisclosureMonitorView(storage?: StorageLike): DisclosureMonitorView {
  return readState(storage).view;
}

export function setDisclosureSettings(
  patch: Partial<DisclosureMonitorSettings>,
  storage?: StorageLike,
): DisclosureMonitorSettings {
  const state = readState(storage);
  const nextSettings = safeSettings({
    ...state.settings,
    ...patch,
  });
  writeState({
    ...state,
    settings: nextSettings,
  }, storage);
  return nextSettings;
}

export function setDisclosureMonitorView(
  patch: Partial<DisclosureMonitorView>,
  storage?: StorageLike,
): DisclosureMonitorView {
  const state = readState(storage);
  const nextView = safeView({
    ...state.view,
    ...patch,
  });
  writeState({
    ...state,
    view: nextView,
  }, storage);
  return nextView;
}

export function diffNew<T extends DisclosureLikeItem>(
  corpCode: string,
  items: T[],
  storage?: StorageLike,
): DisclosureDiffResult<T> {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) {
    return {
      newItems: [],
      seenItems: [...items],
    };
  }
  const seen = new Set(listSeenReceiptNos(normalized, storage));
  const newItems: T[] = [];
  const seenItems: T[] = [];
  for (const item of items) {
    const receiptNo = normalizeReceiptNo(item.receiptNo ?? item.rcept_no);
    if (!receiptNo) {
      seenItems.push(item);
      continue;
    }
    if (seen.has(receiptNo)) {
      seenItems.push(item);
      continue;
    }
    newItems.push(item);
  }
  return { newItems, seenItems };
}

export function markSeen(
  corpCode: string,
  itemsOrReceiptNos: DisclosureLikeItem[] | string[],
  storage?: StorageLike,
  checkedAt?: string,
): string[] {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) return [];
  const state = readState(storage);
  const current = state.seenReceiptNos[normalized] ?? [];
  const incoming = Array.isArray(itemsOrReceiptNos) && typeof itemsOrReceiptNos[0] === "string"
    ? (itemsOrReceiptNos as string[])
    : extractReceiptNos(itemsOrReceiptNos as DisclosureLikeItem[]);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const receiptNoRaw of incoming) {
    const receiptNo = normalizeReceiptNo(receiptNoRaw);
    if (!receiptNo || seen.has(receiptNo)) continue;
    seen.add(receiptNo);
    merged.push(receiptNo);
  }
  for (const receiptNoRaw of current) {
    const receiptNo = normalizeReceiptNo(receiptNoRaw);
    if (!receiptNo || seen.has(receiptNo)) continue;
    seen.add(receiptNo);
    merged.push(receiptNo);
  }

  const limited = merged.slice(0, SEEN_MAX_PER_CORP);
  const nextSeen = limitCorpMaps({
    ...state.seenReceiptNos,
    [normalized]: limited,
  });
  const nextChecked = new Date(checkedAt ?? new Date().toISOString());
  const nextLastChecked = limitCorpMaps({
    ...state.lastCheckedAt,
    [normalized]: Number.isFinite(nextChecked.getTime()) ? nextChecked.toISOString() : new Date().toISOString(),
  });

  writeState({
    ...state,
    seenReceiptNos: nextSeen,
    lastCheckedAt: nextLastChecked,
  }, storage);
  return limited;
}

export function clearDisclosureStore(storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.removeItem(STORAGE_KEY);
}

export const dartDisclosureStoreConfig = {
  storageKey: STORAGE_KEY,
  maxSeenPerCorp: SEEN_MAX_PER_CORP,
  maxCorpEntries: RECENT_CORP_MAX,
};
