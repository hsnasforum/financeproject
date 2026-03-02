const STORAGE_KEY = "finlife_planner_checklist_checked_v1";

export type ChecklistCheckedMap = Record<string, boolean>;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadCheckedMap(): ChecklistCheckedMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ChecklistCheckedMap;
  } catch {
    return {};
  }
}

export function saveCheckedMap(map: ChecklistCheckedMap): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
