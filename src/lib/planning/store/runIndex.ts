import { type PlanningRunRecord } from "./types";

export const RUN_INDEX_VERSION = 1;

export type RunIndexEntry = {
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
  snapshot?: {
    id?: string;
    asOf?: string;
    missing?: boolean;
  };
  warningsCount?: number;
  criticalCount?: number;
};

export type RunIndexFile = {
  version: typeof RUN_INDEX_VERSION;
  entries: RunIndexEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sortRunIndexEntriesByCreatedAtDesc<T extends { id: string; createdAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
}

export function toRunIndexEntry(record: PlanningRunRecord): RunIndexEntry {
  return {
    id: record.id,
    profileId: record.profileId,
    ...(asString(record.title) ? { title: asString(record.title) } : {}),
    createdAt: record.createdAt,
    ...(record.overallStatus ? { overallStatus: record.overallStatus } : {}),
    snapshot: {
      ...(asString(record.meta.snapshot?.id) ? { id: asString(record.meta.snapshot?.id) } : {}),
      ...(asString(record.meta.snapshot?.asOf) ? { asOf: asString(record.meta.snapshot?.asOf) } : {}),
      ...(record.meta.snapshot?.missing === true ? { missing: true } : {}),
    },
    ...(typeof record.outputs?.resultDto?.summary?.totalWarnings === "number"
      ? { warningsCount: record.outputs.resultDto.summary.totalWarnings }
      : {}),
    ...(typeof record.meta.health?.criticalCount === "number"
      ? { criticalCount: record.meta.health.criticalCount }
      : {}),
  };
}

export function isRunIndexEntry(value: unknown): value is RunIndexEntry {
  if (!isRecord(value)) return false;
  if (!asString(value.id)) return false;
  if (!asString(value.profileId)) return false;
  if (!asString(value.createdAt)) return false;
  return true;
}

export function parseRunIndex(payload: unknown): RunIndexEntry[] {
  if (!isRecord(payload)) return [];
  const version = Math.trunc(Number(payload.version));
  if (version !== RUN_INDEX_VERSION) return [];
  const rows = asArray(payload.entries).filter((entry) => isRunIndexEntry(entry)) as RunIndexEntry[];
  return sortRunIndexEntriesByCreatedAtDesc(rows).map((row) => ({ ...row }));
}

export function buildRunIndexFile(entries: RunIndexEntry[]): RunIndexFile {
  return {
    version: RUN_INDEX_VERSION,
    entries: sortRunIndexEntriesByCreatedAtDesc(entries),
  };
}
