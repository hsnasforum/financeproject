import {
  type RunLegacyBackfillDetailedReadResult,
  type RunLegacyBackfillReadFallback,
  type RunLegacyBackfillReadSource,
} from "./runLegacyBackfillReadStore";
import { type PlanningRunRecord } from "./types";

export type LegacyRunBackfillSummary = {
  totalRuns: number;
  opsDoctorRuns: number;
  userRuns: number;
  legacyCandidates: number;
  opsDoctorLegacyCandidates: number;
  userLegacyCandidates: number;
  resultDtoOnlyCandidates: number;
  missingResultDtoCandidates: number;
  missingEngineSchemaCandidates: number;
  unreadableCandidates: number;
};

export type LegacyRunBackfillCandidateReason =
  | "resultDtoOnly"
  | "missingResultDto"
  | "missingEngineSchema"
  | "unreadableMeta";

export type LegacyRunBackfillCandidate = {
  id: string;
  profileId: string;
  createdAt: string;
  title?: string;
  runKind: "opsDoctor" | "user";
  reason: LegacyRunBackfillCandidateReason;
};

export type LegacyRunBackfillResult = {
  selected: number;
  migrated: number;
  skipped: number;
  failed: number;
  candidates: LegacyRunBackfillCandidate[];
};

export type LegacyRunBackfillAnomalyReason =
  | "unreadableMeta"
  | "rawInvalidJson"
  | "rawInvalidRunRecord"
  | "postCheckMissingRun"
  | "postCheckMissingEngine"
  | "postCheckMissingEngineSchema"
  | "readException";

export type LegacyRunBackfillAnomaly = {
  candidateReason: LegacyRunBackfillCandidateReason;
  errorName?: string;
  outcome: "recovered" | "skipped" | "failed";
  reason: LegacyRunBackfillAnomalyReason;
  runKind: LegacyRunBackfillCandidate["runKind"];
  source?: RunLegacyBackfillReadSource;
};

export type LegacyRunBackfillAnomalyRecorder = (
  event: LegacyRunBackfillAnomaly,
) => Promise<void> | void;

type LegacyRunBackfillIndexEntry = {
  id: string;
  profileId: string;
  createdAt: string;
  title?: string;
};

type ReadRunForBackfillOptions = {
  persistMigrations?: boolean;
};

type LegacyRunBackfillDependencies = {
  listIndexEntries: () => Promise<LegacyRunBackfillIndexEntry[]>;
  readRawRunForIndexEntry: (row: LegacyRunBackfillIndexEntry) => Promise<PlanningRunRecord | null>;
  readRawRunForIndexEntryDetailed?: (
    row: LegacyRunBackfillIndexEntry,
  ) => Promise<RunLegacyBackfillDetailedReadResult>;
  readRunForCandidate: (
    candidate: LegacyRunBackfillCandidate,
    options?: ReadRunForBackfillOptions,
  ) => Promise<PlanningRunRecord | null>;
  ensureStartupMigrations: () => Promise<void>;
  isEngineEnvelopeLike: (value: unknown) => boolean;
  recordBackfillAnomaly?: LegacyRunBackfillAnomalyRecorder;
};

const SAFE_ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

function sortByCreatedAtDesc<T extends { id: string; createdAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
}

function resolveBackfillRunKind(row: Pick<LegacyRunBackfillIndexEntry, "id" | "profileId">): "opsDoctor" | "user" {
  return row.id.startsWith("ops-doctor-") || row.profileId === "ops-doctor"
    ? "opsDoctor"
    : "user";
}

function normalizeErrorName(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : "Error";
  return SAFE_ERROR_NAMES.has(name) ? name : "Error";
}

function toBackfillAnomaly(
  candidate: LegacyRunBackfillCandidate,
  outcome: LegacyRunBackfillAnomaly["outcome"],
  reason: LegacyRunBackfillAnomalyReason,
  error?: unknown,
  source?: RunLegacyBackfillReadSource,
): LegacyRunBackfillAnomaly {
  return {
    candidateReason: candidate.reason,
    ...(error === undefined ? {} : { errorName: normalizeErrorName(error) }),
    outcome,
    reason,
    runKind: candidate.runKind,
    ...(source ? { source } : {}),
  };
}

function toBackfillReadAnomalyReason(
  fallback: RunLegacyBackfillReadFallback,
): Extract<LegacyRunBackfillAnomalyReason, "rawInvalidJson" | "rawInvalidRunRecord"> | null {
  if (fallback.reason === "invalid-json") return "rawInvalidJson";
  if (fallback.reason === "invalid-run-record") return "rawInvalidRunRecord";
  return null;
}

function recordBackfillAnomaly(
  deps: Pick<LegacyRunBackfillDependencies, "recordBackfillAnomaly">,
  event: LegacyRunBackfillAnomaly,
): void {
  if (!deps.recordBackfillAnomaly) return;
  try {
    const pending = deps.recordBackfillAnomaly(event);
    if (pending && typeof pending.then === "function") {
      void Promise.resolve(pending).catch(() => undefined);
    }
  } catch {
    // Best-effort observability must not alter or delay the backfill result.
  }
}

export function resolveLegacyRunBackfillCandidateReason(
  raw: PlanningRunRecord | null,
  isEngineEnvelopeLike: (value: unknown) => boolean,
): LegacyRunBackfillCandidateReason | null {
  if (!raw) return "unreadableMeta";

  const outputs = asRecord(raw.outputs);
  const hasEngine = isEngineEnvelopeLike(outputs.engine);
  const rawEngineSchemaVersion = Math.trunc(Number(outputs.engineSchemaVersion));
  const hasEngineSchema = Number.isFinite(rawEngineSchemaVersion) && rawEngineSchemaVersion >= 1;
  const hasResultDto = outputs.resultDto !== undefined;

  if (hasEngine && hasEngineSchema) return null;
  if (hasEngine && !hasEngineSchema) return "missingEngineSchema";
  if (!hasEngine && hasResultDto) return "resultDtoOnly";
  if (!hasEngine && !hasResultDto) return "missingResultDto";
  return null;
}

export async function summarizeLegacyRunBackfillWith(
  deps: LegacyRunBackfillDependencies,
): Promise<LegacyRunBackfillSummary> {
  const indexRows = await deps.listIndexEntries();
  const summary: LegacyRunBackfillSummary = {
    totalRuns: indexRows.length,
    opsDoctorRuns: 0,
    userRuns: 0,
    legacyCandidates: 0,
    opsDoctorLegacyCandidates: 0,
    userLegacyCandidates: 0,
    resultDtoOnlyCandidates: 0,
    missingResultDtoCandidates: 0,
    missingEngineSchemaCandidates: 0,
    unreadableCandidates: 0,
  };

  for (const row of indexRows) {
    const runKind = resolveBackfillRunKind(row);
    if (runKind === "opsDoctor") {
      summary.opsDoctorRuns += 1;
    } else {
      summary.userRuns += 1;
    }

    const raw = await deps.readRawRunForIndexEntry(row);
    const reason = resolveLegacyRunBackfillCandidateReason(raw, deps.isEngineEnvelopeLike);
    if (reason) {
      summary.legacyCandidates += 1;
      if (runKind === "opsDoctor") summary.opsDoctorLegacyCandidates += 1;
      else summary.userLegacyCandidates += 1;
      if (reason === "resultDtoOnly") summary.resultDtoOnlyCandidates += 1;
      if (reason === "missingResultDto") summary.missingResultDtoCandidates += 1;
      if (reason === "missingEngineSchema") summary.missingEngineSchemaCandidates += 1;
      if (reason === "unreadableMeta") summary.unreadableCandidates += 1;
    }
  }

  return summary;
}

export async function listLegacyRunBackfillCandidatesWith(
  deps: LegacyRunBackfillDependencies,
  options?: {
    limit?: number;
    includeOpsDoctor?: boolean;
  },
  observeCandidateReadFallback?: (
    candidate: LegacyRunBackfillCandidate,
    fallback: RunLegacyBackfillReadFallback | undefined,
  ) => void,
): Promise<LegacyRunBackfillCandidate[]> {
  const indexRows = await deps.listIndexEntries();
  const out: LegacyRunBackfillCandidate[] = [];
  for (const row of indexRows) {
    const runKind = resolveBackfillRunKind(row);
    if (runKind === "opsDoctor" && options?.includeOpsDoctor !== true) continue;

    const detailedRead = deps.readRawRunForIndexEntryDetailed
      ? await deps.readRawRunForIndexEntryDetailed(row)
      : {
          run: await deps.readRawRunForIndexEntry(row),
          fallbacks: [],
        };
    const raw = detailedRead.run;
    const reason = resolveLegacyRunBackfillCandidateReason(raw, deps.isEngineEnvelopeLike);
    if (!reason) continue;
    const candidate: LegacyRunBackfillCandidate = {
      id: row.id,
      profileId: row.profileId,
      createdAt: row.createdAt,
      ...(asString(row.title) ? { title: asString(row.title) } : {}),
      runKind,
      reason,
    };
    observeCandidateReadFallback?.(
      candidate,
      detailedRead.fallbacks.find((fallback) => fallback.reason !== "missing-file"),
    );
    out.push(candidate);
  }

  const limit = toSafeLimit(options?.limit, 100);
  return sortByCreatedAtDesc(out).slice(0, limit);
}

export async function backfillLegacyRunsWith(
  deps: LegacyRunBackfillDependencies,
  options?: {
    limit?: number;
    includeOpsDoctor?: boolean;
  },
): Promise<LegacyRunBackfillResult> {
  await deps.ensureStartupMigrations();

  const candidateReadFallbacks = new Map<
    LegacyRunBackfillCandidate,
    RunLegacyBackfillReadFallback
  >();
  const candidates = await listLegacyRunBackfillCandidatesWith(
    deps,
    {
      limit: options?.limit,
      includeOpsDoctor: options?.includeOpsDoctor,
    },
    (candidate, fallback) => {
      if (fallback) candidateReadFallbacks.set(candidate, fallback);
    },
  );

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const readFallback = candidateReadFallbacks.get(candidate);
    const readAnomalyReason = readFallback
      ? toBackfillReadAnomalyReason(readFallback)
      : null;
    if (readFallback && readAnomalyReason) {
      recordBackfillAnomaly(
        deps,
        toBackfillAnomaly(
          candidate,
          candidate.reason === "unreadableMeta" ? "skipped" : "recovered",
          readAnomalyReason,
          undefined,
          readFallback.source,
        ),
      );
    }

    if (candidate.reason === "unreadableMeta") {
      skipped += 1;
      if (!readAnomalyReason) {
        recordBackfillAnomaly(
          deps,
          toBackfillAnomaly(candidate, "skipped", "unreadableMeta"),
        );
      }
      continue;
    }

    try {
      const loaded = await deps.readRunForCandidate(candidate, { persistMigrations: true });
      const outputs = asRecord(loaded?.outputs);
      const hasEngine = Boolean(loaded && deps.isEngineEnvelopeLike(outputs.engine));
      const rawEngineSchemaVersion = Math.trunc(Number(outputs.engineSchemaVersion));
      const hasEngineSchema = Number.isFinite(rawEngineSchemaVersion) && rawEngineSchemaVersion >= 1;
      if (hasEngine && hasEngineSchema) {
        migrated += 1;
      } else {
        failed += 1;
        const reason: LegacyRunBackfillAnomalyReason = !loaded
          ? "postCheckMissingRun"
          : hasEngine
            ? "postCheckMissingEngineSchema"
            : "postCheckMissingEngine";
        recordBackfillAnomaly(
          deps,
          toBackfillAnomaly(candidate, "failed", reason),
        );
      }
    } catch (error) {
      failed += 1;
      recordBackfillAnomaly(
        deps,
        toBackfillAnomaly(candidate, "failed", "readException", error),
      );
    }
  }

  return {
    selected: candidates.length,
    migrated,
    skipped,
    failed,
    candidates,
  };
}
