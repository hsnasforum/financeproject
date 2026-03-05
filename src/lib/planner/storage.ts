import { type PlannerInput, type PlannerMetrics, type Recommendation } from "@/lib/planner/plan";

const STORAGE_KEY = "finlife_planner_snapshots_v1";
const MAX_SNAPSHOTS = 20;

export type PlannerSnapshot = {
  id: string;
  createdAt: string;
  input: PlannerInput;
  metrics: PlannerMetrics;
  recommendations: Recommendation[];
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readAll(): PlannerSnapshot[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PlannerSnapshot[];
  } catch {
    return [];
  }
}

function writeAll(items: PlannerSnapshot[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listSnapshots(): PlannerSnapshot[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function saveSnapshot(snapshot: PlannerSnapshot): void {
  const current = listSnapshots();
  const next = [snapshot, ...current.filter((x) => x.id !== snapshot.id)].slice(0, MAX_SNAPSHOTS);
  writeAll(next);
}

export function loadSnapshot(id: string): PlannerSnapshot | null {
  return listSnapshots().find((x) => x.id === id) ?? null;
}

export function deleteSnapshot(id: string): void {
  const next = listSnapshots().filter((x) => x.id !== id);
  writeAll(next);
}

export function createSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
