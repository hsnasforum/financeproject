import { type SnapshotSelection } from "./snapshotSelection";
import { type SnapshotListItem } from "./snapshotList";

export type SnapshotItemsState = {
  latest?: SnapshotListItem;
  history: SnapshotListItem[];
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function parseWorkspaceSnapshotListItem(value: unknown): SnapshotListItem | null {
  const row = asRecord(value);
  const id = asString(row.id).trim();
  if (!id) return null;
  const staleDaysRaw = asNumber(row.staleDays);
  const warningsCountRaw = asNumber(row.warningsCount);
  const koreaRow = asRecord(row.korea);
  const korea = {
    ...(typeof asNumber(koreaRow.policyRatePct) === "number" ? { policyRatePct: asNumber(koreaRow.policyRatePct) } : {}),
    ...(typeof asNumber(koreaRow.cpiYoYPct) === "number" ? { cpiYoYPct: asNumber(koreaRow.cpiYoYPct) } : {}),
    ...(typeof asNumber(koreaRow.newDepositAvgPct) === "number" ? { newDepositAvgPct: asNumber(koreaRow.newDepositAvgPct) } : {}),
  };
  return {
    id,
    ...(asString(row.asOf).trim() ? { asOf: asString(row.asOf).trim() } : {}),
    ...(asString(row.fetchedAt).trim() ? { fetchedAt: asString(row.fetchedAt).trim() } : {}),
    ...(typeof staleDaysRaw === "number" ? { staleDays: Math.max(0, Math.trunc(staleDaysRaw)) } : {}),
    ...(typeof warningsCountRaw === "number" ? { warningsCount: Math.max(0, Math.trunc(warningsCountRaw)) } : {}),
    ...(Object.keys(korea).length > 0 ? { korea } : {}),
  };
}

export function sortWorkspaceSnapshotHistory(items: SnapshotListItem[]): SnapshotListItem[] {
  return [...items].sort((a, b) => {
    const aTs = Date.parse(a.fetchedAt ?? "");
    const bTs = Date.parse(b.fetchedAt ?? "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
    return b.id.localeCompare(a.id);
  });
}

export function normalizeWorkspaceSnapshotItemsState(items: SnapshotItemsState): SnapshotItemsState {
  return {
    ...(items.latest ? { latest: items.latest } : {}),
    history: sortWorkspaceSnapshotHistory(items.history),
  };
}

export function buildWorkspaceSnapshotItemsStateFromApi(value: unknown): SnapshotItemsState {
  const row = asRecord(value);
  const latest = parseWorkspaceSnapshotListItem(row.latest);
  const history = sortWorkspaceSnapshotHistory(
    asArray(row.items)
      .map((entry) => parseWorkspaceSnapshotListItem(entry))
      .filter((entry): entry is SnapshotListItem => entry !== null),
  );

  return {
    ...(latest ? { latest } : {}),
    history,
  };
}

export function resolveInitialWorkspaceSnapshotSelection(items: SnapshotItemsState): SnapshotSelection {
  if (items.latest) return { mode: "latest" };
  const firstHistory = items.history[0];
  return firstHistory ? { mode: "history", id: firstHistory.id } : { mode: "latest" };
}

export function normalizeWorkspaceSnapshotSelection(
  items: SnapshotItemsState,
  selection: SnapshotSelection,
): SnapshotSelection {
  if (selection.mode === "latest") return selection;
  return items.history.some((item) => item.id === selection.id)
    ? { mode: "history", id: selection.id }
    : resolveInitialWorkspaceSnapshotSelection(items);
}

export function isSameWorkspaceSnapshotSelection(
  left: SnapshotSelection,
  right: SnapshotSelection,
): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "latest") return true;
  return right.mode === "history" && left.id === right.id;
}

export function resolveWorkspaceSelectedSnapshotItem(
  items: SnapshotItemsState,
  selection: SnapshotSelection,
): SnapshotListItem | undefined {
  if (selection.mode === "latest") return items.latest;
  return items.history.find((item) => item.id === selection.id);
}

export function resolveWorkspaceSnapshotSelectionFallback(
  code: unknown,
): SnapshotSelection | null {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  return normalized === "SNAPSHOT_NOT_FOUND" ? { mode: "latest" } : null;
}
