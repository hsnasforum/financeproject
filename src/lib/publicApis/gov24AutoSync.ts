import { getMaxAgeMs } from "../dataSources/cachePolicy";

export type Gov24SnapshotStatus = {
  totalItems?: number;
  completionRate?: number;
  generatedAt?: string;
};

export function shouldTriggerGov24AutoSync(snapshot: Gov24SnapshotStatus | null | undefined): boolean {
  if (!snapshot) return true;
  if ((snapshot.totalItems ?? 0) <= 0) return true;
  if (typeof snapshot.completionRate !== "number") return true;
  const generatedMs = Date.parse(snapshot.generatedAt ?? "");
  if (Number.isFinite(generatedMs) && Date.now() - generatedMs > getMaxAgeMs("gov24")) {
    return true;
  }
  return snapshot.completionRate < 0.95;
}
