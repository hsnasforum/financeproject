export type Gov24SnapshotStatus = {
  totalItems?: number;
  completionRate?: number;
};

export function shouldTriggerGov24AutoSync(snapshot: Gov24SnapshotStatus | null | undefined): boolean {
  if (!snapshot) return true;
  if ((snapshot.totalItems ?? 0) <= 0) return true;
  if (typeof snapshot.completionRate !== "number") return true;
  return snapshot.completionRate < 0.95;
}

