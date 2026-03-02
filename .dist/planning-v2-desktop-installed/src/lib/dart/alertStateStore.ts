export const ALERT_STATE_STORAGE_KEY = "dart_alert_state_v1";

export type AlertState = {
  read: Record<string, string>;
  pinned: Record<string, string>;
  mutedClusters: Record<string, string>;
};

export type AlertStateInputItem = {
  id?: string;
  clusterKey?: string;
  corpName?: string;
  categoryLabel?: string;
  title?: string;
  rceptNo?: string;
  clusterScore?: number;
  date?: string | null;
  isNew?: boolean;
  [key: string]: unknown;
};

export type AlertStateAppliedItem<T extends AlertStateInputItem = AlertStateInputItem> = T & {
  id: string;
  clusterKey: string;
  isRead: boolean;
  isPinned: boolean;
  pinnedAt: string | null;
  showNewBadge: boolean;
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = asString(key);
    const normalizedValue = asString(value);
    if (!normalizedKey || !normalizedValue) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

function normalizeState(raw: unknown): AlertState {
  if (!isRecord(raw)) return emptyAlertState();
  return {
    read: normalizeRecord(raw.read),
    pinned: normalizeRecord(raw.pinned),
    mutedClusters: normalizeRecord(raw.mutedClusters),
  };
}

function storageRef(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function emptyAlertState(): AlertState {
  return {
    read: {},
    pinned: {},
    mutedClusters: {},
  };
}

export function loadAlertState(storageKey = ALERT_STATE_STORAGE_KEY): AlertState {
  const storage = storageRef();
  if (!storage) return emptyAlertState();
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyAlertState();
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return emptyAlertState();
  }
}

export function saveAlertState(state: AlertState, storageKey = ALERT_STATE_STORAGE_KEY): void {
  const storage = storageRef();
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeState(state)));
  } catch {
    // no-op: keep UI responsive even when storage quota blocks persistence
  }
}

export function buildAlertItemId(item: AlertStateInputItem): string {
  const explicit = asString(item.id);
  if (explicit) return explicit;
  const cluster = buildAlertClusterKey(item);
  const receipt = asString(item.rceptNo);
  if (receipt) return `${cluster}::${receipt}`;
  const title = asString(item.title);
  if (title) return `${cluster}::${title}`;
  return `${cluster}::item`;
}

export function buildAlertClusterKey(item: AlertStateInputItem): string {
  const explicit = asString(item.clusterKey);
  if (explicit) return explicit;
  const corp = asString(item.corpName) || "-";
  const category = asString(item.categoryLabel) || "기타";
  const title = asString(item.title) || "(제목 없음)";
  return `${corp}::${category}::${title}`;
}

export function markRead(id: string, state: AlertState, at = nowIso()): AlertState {
  const key = asString(id);
  if (!key) return state;
  return {
    ...state,
    read: {
      ...state.read,
      [key]: asString(at) || nowIso(),
    },
  };
}

export function togglePin(id: string, state: AlertState, at = nowIso()): AlertState {
  const key = asString(id);
  if (!key) return state;
  const nextPinned = { ...state.pinned };
  if (nextPinned[key]) {
    delete nextPinned[key];
  } else {
    nextPinned[key] = asString(at) || nowIso();
  }
  return {
    ...state,
    pinned: nextPinned,
  };
}

export function muteCluster(clusterKey: string, state: AlertState, at = nowIso()): AlertState {
  const key = asString(clusterKey);
  if (!key) return state;
  return {
    ...state,
    mutedClusters: {
      ...state.mutedClusters,
      [key]: asString(at) || nowIso(),
    },
  };
}

function toSortTime(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareAppliedItems(
  a: AlertStateAppliedItem,
  b: AlertStateAppliedItem,
): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.isPinned && b.isPinned) {
    const pinDiff = toSortTime(b.pinnedAt) - toSortTime(a.pinnedAt);
    if (pinDiff !== 0) return pinDiff;
  }

  const scoreDiff = asNumber(b.clusterScore, 0) - asNumber(a.clusterScore, 0);
  if (scoreDiff !== 0) return scoreDiff;

  const dateDiff = toSortTime(b.date) - toSortTime(a.date);
  if (dateDiff !== 0) return dateDiff;

  return a.id.localeCompare(b.id);
}

export function applyState<T extends AlertStateInputItem>(
  alertItems: T[],
  state: AlertState,
): AlertStateAppliedItem<T>[] {
  const rows = Array.isArray(alertItems) ? alertItems : [];
  const applied = rows
    .map((item) => {
      const id = buildAlertItemId(item);
      const clusterKey = buildAlertClusterKey(item);
      const isRead = Boolean(state.read[id]);
      const pinnedAt = state.pinned[id] ?? null;
      return {
        ...item,
        id,
        clusterKey,
        isRead,
        isPinned: Boolean(pinnedAt),
        pinnedAt,
        showNewBadge: Boolean(item.isNew) && !isRead,
      };
    })
    .filter((item) => !state.mutedClusters[item.clusterKey])
    .sort(compareAppliedItems);

  return applied;
}
