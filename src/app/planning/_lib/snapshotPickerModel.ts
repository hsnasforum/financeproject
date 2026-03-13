import { type SnapshotSelection } from "./snapshotSelection";
import { type SnapshotListItem } from "./snapshotList";

export type SnapshotPickerItems = {
  latest?: SnapshotListItem;
  history: SnapshotListItem[];
};

const SNAPSHOT_HISTORY_PREFIX = "history:";

export function resolveSnapshotPickerSelectedItem(
  items: SnapshotPickerItems,
  value: SnapshotSelection,
): SnapshotListItem | undefined {
  if (value.mode === "latest") return items.latest;
  return items.history.find((item) => item.id === value.id);
}

export function buildSnapshotPickerSelectValue(value: SnapshotSelection): string {
  return value.mode === "latest" ? "latest" : `${SNAPSHOT_HISTORY_PREFIX}${value.id}`;
}

export function parseSnapshotPickerSelectValue(raw: string): SnapshotSelection | null {
  const normalized = raw.trim();
  if (normalized === "latest") return { mode: "latest" };
  if (!normalized.startsWith(SNAPSHOT_HISTORY_PREFIX)) return null;
  const id = normalized.slice(SNAPSHOT_HISTORY_PREFIX.length).trim();
  return id ? { mode: "history", id } : null;
}

export function getSnapshotDetailsToggleLabel(detailsOpen: boolean): string {
  return detailsOpen ? "Details 닫기" : "Details";
}
