import { LATEST_SNAPSHOT_VERSION } from "./versions.ts";
import { type MigrationResult } from "./types.ts";

type AssumptionsSourceLike = {
  name: string;
  url: string;
  fetchedAt: string;
};

type AssumptionsSnapshotLike = {
  version: 1;
  asOf: string;
  fetchedAt: string;
  korea: Record<string, number | undefined>;
  sources: AssumptionsSourceLike[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const parsed = Math.trunc(Number(value.version));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return parsed;
}

function normalizeSourceRow(
  row: unknown,
  fallbackFetchedAt: string,
): { value: AssumptionsSourceLike | null; changed: boolean } {
  if (isRecord(row)) {
    const name = asString(row.name || row.label || row.title);
    const url = asString(row.url || row.link || row.href);
    const fetchedAt = asString(row.fetchedAt || row.capturedAt || row.asOf) || fallbackFetchedAt;
    if (!name && !url && !fetchedAt) return { value: null, changed: true };
    return {
      value: {
        name: name || url || "legacy-source",
        url: url || "",
        fetchedAt,
      },
      changed: name !== asString(row.name) || url !== asString(row.url) || fetchedAt !== asString(row.fetchedAt),
    };
  }

  if (typeof row === "string") {
    const text = row.trim();
    if (!text) return { value: null, changed: true };
    return {
      value: {
        name: text,
        url: text.startsWith("http://") || text.startsWith("https://") ? text : "",
        fetchedAt: fallbackFetchedAt,
      },
      changed: true,
    };
  }

  return { value: null, changed: true };
}

function failSnapshot(fromVersion: number, errors: string[], warnings: string[] = []): MigrationResult<AssumptionsSnapshotLike> {
  return {
    ok: false,
    fromVersion,
    toVersion: LATEST_SNAPSHOT_VERSION,
    changed: false,
    warnings,
    errors,
  };
}

export function migrateAssumptionsSnapshot(input: unknown): MigrationResult<AssumptionsSnapshotLike> {
  const fromVersion = readVersion(input);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!isRecord(input)) {
    return failSnapshot(fromVersion, ["INVALID_RECORD_OBJECT"]);
  }

  const asOf = asString(input.asOf);
  const fetchedAt = asString(input.fetchedAt);
  if (!asOf || !Number.isFinite(Date.parse(asOf))) errors.push("MISSING_AS_OF");
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) errors.push("MISSING_FETCHED_AT");

  if (fromVersion < 1) warnings.push("VERSION_MISSING_DEFAULTED");
  if (errors.length > 0) return failSnapshot(fromVersion, errors, warnings);

  const rawSources = input.sources;
  const normalizedSources: AssumptionsSourceLike[] = [];
  let sourcesChanged = false;
  if (Array.isArray(rawSources)) {
    for (const row of rawSources) {
      const normalized = normalizeSourceRow(row, fetchedAt);
      if (normalized.changed) sourcesChanged = true;
      if (normalized.value) normalizedSources.push(normalized.value);
    }
    if (sourcesChanged) warnings.push("SOURCES_SHAPE_NORMALIZED");
  } else if (isFiniteNumber(input.sourcesCount) && input.sourcesCount > 0) {
    const count = Math.max(1, Math.min(200, Math.trunc(input.sourcesCount)));
    for (let i = 0; i < count; i += 1) {
      normalizedSources.push({
        name: `legacy-source-${i + 1}`,
        url: "",
        fetchedAt,
      });
    }
    warnings.push("SOURCES_COUNT_PLACEHOLDER");
    sourcesChanged = true;
  } else {
    warnings.push("SOURCES_EMPTY_DEFAULTED");
    sourcesChanged = rawSources !== undefined;
  }

  const rawWarnings = Array.isArray(input.warnings)
    ? input.warnings.filter((row): row is string => typeof row === "string").map((row) => row.trim()).filter(Boolean)
    : [];
  if (!Array.isArray(input.warnings) && input.warnings !== undefined) {
    warnings.push("WARNINGS_SHAPE_NORMALIZED");
  }

  const rawKorea = isRecord(input.korea) ? input.korea : {};
  const numericKeys = [
    "policyRatePct",
    "callOvernightPct",
    "cd91Pct",
    "koribor3mPct",
    "msb364Pct",
    "baseRatePct",
    "cpiYoYPct",
    "coreCpiYoYPct",
    "newDepositAvgPct",
    "newLoanAvgPct",
    "depositOutstandingAvgPct",
    "loanOutstandingAvgPct",
  ] as const;

  const korea: AssumptionsSnapshotLike["korea"] = {};
  for (const key of numericKeys) {
    if (isFiniteNumber(rawKorea[key])) {
      korea[key] = rawKorea[key];
    }
  }

  const data: AssumptionsSnapshotLike = {
    version: LATEST_SNAPSHOT_VERSION,
    asOf: new Date(asOf).toISOString().slice(0, 10),
    fetchedAt: new Date(fetchedAt).toISOString(),
    korea,
    sources: normalizedSources,
    warnings: rawWarnings,
  };

  const changed = fromVersion < LATEST_SNAPSHOT_VERSION
    || sourcesChanged
    || JSON.stringify(data) !== JSON.stringify(input);

  return {
    ok: true,
    fromVersion,
    toVersion: LATEST_SNAPSHOT_VERSION,
    changed,
    data,
    warnings,
    errors: [],
  };
}
