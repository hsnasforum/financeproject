import {
  type CandidatePool,
  type CandidateSource,
  type DepositProtectionMode,
  type RecommendPlanningHandoff,
  type RecommendPlanningContext,
  type RecommendPurpose,
  type UserRecommendProfile,
} from "@/lib/recommend/types";
import {
  recommendOwnerStorageKey,
  type RecommendOwnerId,
} from "@/lib/recommend/ownerNamespace";

const MAX_RUNS = 50;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SavedRunProfile = {
  purpose: RecommendPurpose;
  kind: UserRecommendProfile["kind"];
  preferredTerm: UserRecommendProfile["preferredTerm"];
  liquidityPref: UserRecommendProfile["liquidityPref"];
  rateMode: UserRecommendProfile["rateMode"];
  topN: number;
  candidatePool: CandidatePool;
  candidateSources: CandidateSource[];
  depositProtection: DepositProtectionMode;
  weights: {
    rate: number;
    term: number;
    liquidity: number;
  };
  planning?: RecommendPlanningHandoff;
  planningContext?: RecommendPlanningContext;
};

export type SavedRunItem = {
  unifiedId: string;
  providerName: string;
  productName: string;
  kind: UserRecommendProfile["kind"];
  termMonths: number | null;
  appliedRate: number | null;
  rank: number;
  finalScore: number;
};

export type SavedRecommendRun = {
  ownerId: RecommendOwnerId;
  runId: string;
  savedAt: string;
  profile: SavedRunProfile;
  items: SavedRunItem[];
};

export type SavedRunInput = {
  runId?: string;
  savedAt?: string;
  profile: SavedRunProfile;
  items: SavedRunItem[];
};

type RecommendLikeItem = {
  unifiedId?: string;
  sourceId?: string;
  finPrdtCd?: string;
  providerName?: string;
  productName?: string;
  kind?: UserRecommendProfile["kind"];
  finalScore?: number;
  selectedOption?: {
    termMonths?: number | null;
    saveTrm?: string | null;
    appliedRate?: number | null;
  };
};

type RecommendLikeResponse = {
  items?: RecommendLikeItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.trunc(n));
}

function normalizeTermMonths(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseTermMonthsFromString(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const matched = value.match(/\d+/);
  if (!matched) return null;
  const n = Number(matched[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function ensureUnifiedId(item: RecommendLikeItem, fallbackRank: number): string {
  const given = typeof item.unifiedId === "string" ? item.unifiedId.trim() : "";
  if (given) return given;
  const sourceId = typeof item.sourceId === "string" ? item.sourceId.trim() : "";
  const finPrdtCd = typeof item.finPrdtCd === "string" ? item.finPrdtCd.trim() : "";
  if (finPrdtCd.startsWith("finlife:") || (sourceId && finPrdtCd.startsWith(`${sourceId}:`))) return finPrdtCd;
  if (sourceId && finPrdtCd) return `${sourceId}:${finPrdtCd}`;
  if (finPrdtCd) return `unknown:${finPrdtCd}`;
  return `unknown:item_${fallbackRank}`;
}

function normalizeDateIso(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeProfile(value: unknown): SavedRunProfile | null {
  if (!isRecord(value)) return null;

  const purpose = value.purpose;
  const kind = value.kind;
  const preferredTerm = value.preferredTerm;
  const liquidityPref = value.liquidityPref;
  const rateMode = value.rateMode;
  const candidatePoolRaw = value.candidatePool;
  const depositProtection = value.depositProtection;
  const topN = normalizeInt(value.topN, 10);

  if (purpose !== "emergency" && purpose !== "seed-money" && purpose !== "long-term") return null;
  if (kind !== "deposit" && kind !== "saving") return null;
  if (preferredTerm !== 3 && preferredTerm !== 6 && preferredTerm !== 12 && preferredTerm !== 24 && preferredTerm !== 36) return null;
  if (liquidityPref !== "low" && liquidityPref !== "mid" && liquidityPref !== "high") return null;
  if (rateMode !== "max" && rateMode !== "base" && rateMode !== "simple") return null;
  if (candidatePoolRaw !== undefined && candidatePoolRaw !== "legacy" && candidatePoolRaw !== "unified") return null;
  if (depositProtection !== "any" && depositProtection !== "prefer" && depositProtection !== "require") return null;
  const candidatePool: CandidatePool = "unified";

  const rawCandidateSources = Array.isArray(value.candidateSources) ? value.candidateSources : [];
  const candidateSources = rawCandidateSources
    .filter((entry): entry is CandidateSource => entry === "finlife" || entry === "datago_kdb");
  const normalizedSources: CandidateSource[] = candidateSources.length > 0
    ? [...new Set(candidateSources)]
    : ["finlife"];

  const rawWeights = isRecord(value.weights) ? value.weights : {};
  const rawPlanning = isRecord(value.planning) ? value.planning : {};
  const rawPlanningSummary = isRecord(rawPlanning.summary) ? rawPlanning.summary : {};
  const rawPlanningContext = isRecord(value.planningContext) ? value.planningContext : {};
  const planningRunId = typeof rawPlanning.runId === "string" ? rawPlanning.runId.trim() : "";
  const planningStage = rawPlanningSummary.stage;
  const planningOverallStatus = rawPlanningSummary.overallStatus;
  const planningContext: RecommendPlanningContext = {
    ...(normalizeNumber(rawPlanningContext.monthlyIncomeKrw) !== null
      ? { monthlyIncomeKrw: Math.max(0, Math.round(normalizeNumber(rawPlanningContext.monthlyIncomeKrw) as number)) }
      : {}),
    ...(normalizeNumber(rawPlanningContext.monthlyExpenseKrw) !== null
      ? { monthlyExpenseKrw: Math.max(0, Math.round(normalizeNumber(rawPlanningContext.monthlyExpenseKrw) as number)) }
      : {}),
    ...(normalizeNumber(rawPlanningContext.liquidAssetsKrw) !== null
      ? { liquidAssetsKrw: Math.max(0, Math.round(normalizeNumber(rawPlanningContext.liquidAssetsKrw) as number)) }
      : {}),
    ...(normalizeNumber(rawPlanningContext.debtBalanceKrw) !== null
      ? { debtBalanceKrw: Math.max(0, Math.round(normalizeNumber(rawPlanningContext.debtBalanceKrw) as number)) }
      : {}),
  };
  const planning: RecommendPlanningHandoff | undefined = planningRunId
    && (planningStage === "DEFICIT" || planningStage === "DEBT" || planningStage === "EMERGENCY" || planningStage === "INVEST")
    ? {
        runId: planningRunId,
        summary: {
          stage: planningStage,
          ...(
            planningOverallStatus === "RUNNING"
            || planningOverallStatus === "SUCCESS"
            || planningOverallStatus === "PARTIAL_SUCCESS"
            || planningOverallStatus === "FAILED"
              ? { overallStatus: planningOverallStatus }
              : {}
          ),
        },
      }
    : undefined;
  return {
    purpose,
    kind,
    preferredTerm,
    liquidityPref,
    rateMode,
    topN,
    candidatePool,
    candidateSources: normalizedSources,
    depositProtection,
    weights: {
      rate: normalizeNumber(rawWeights.rate) ?? 0,
      term: normalizeNumber(rawWeights.term) ?? 0,
      liquidity: normalizeNumber(rawWeights.liquidity) ?? 0,
    },
    ...(planning ? { planning } : {}),
    ...(Object.keys(planningContext).length > 0 ? { planningContext } : {}),
  };
}

function normalizeItem(value: unknown): SavedRunItem | null {
  if (!isRecord(value)) return null;

  const unifiedId = typeof value.unifiedId === "string" ? value.unifiedId.trim() : "";
  const providerName = typeof value.providerName === "string" ? value.providerName : "";
  const productName = typeof value.productName === "string" ? value.productName : "";
  const kind = value.kind;
  const rank = normalizeInt(value.rank, 1);
  const finalScore = normalizeNumber(value.finalScore) ?? 0;
  const appliedRate = normalizeNumber(value.appliedRate);
  const termMonths = normalizeTermMonths(value.termMonths);

  if (!unifiedId) return null;
  if (kind !== "deposit" && kind !== "saving") return null;

  return {
    unifiedId,
    providerName,
    productName,
    kind,
    termMonths,
    appliedRate,
    rank,
    finalScore,
  };
}

function normalizeRun(ownerId: RecommendOwnerId, value: unknown): SavedRecommendRun | null {
  if (!isRecord(value)) return null;
  if (value.ownerId !== ownerId) return null;
  const runId = typeof value.runId === "string" ? value.runId.trim() : "";
  if (!runId) return null;

  const profile = normalizeProfile(value.profile);
  if (!profile) return null;

  const savedAt = normalizeDateIso(value.savedAt);
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is SavedRunItem => item !== null);

  return {
    ownerId,
    runId,
    savedAt,
    profile,
    items,
  };
}

function normalizeMigrationProfile(value: unknown): SavedRunProfile | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.topN) || (value.topN as number) < 1) return null;
  if (!Array.isArray(value.candidateSources) || value.candidateSources.length < 1) return null;
  if (!value.candidateSources.every((entry) => entry === "finlife" || entry === "datago_kdb")) return null;
  if (new Set(value.candidateSources).size !== value.candidateSources.length) return null;
  if (!isRecord(value.weights)) return null;
  if (![value.weights.rate, value.weights.term, value.weights.liquidity]
    .every((entry) => typeof entry === "number" && Number.isFinite(entry))) return null;

  if (value.planning !== undefined) {
    if (!isRecord(value.planning) || typeof value.planning.runId !== "string" || !value.planning.runId.trim()) return null;
    if (!isRecord(value.planning.summary)) return null;
    if (!["DEFICIT", "DEBT", "EMERGENCY", "INVEST"].includes(String(value.planning.summary.stage))) return null;
    if (
      value.planning.summary.overallStatus !== undefined
      && !["RUNNING", "SUCCESS", "PARTIAL_SUCCESS", "FAILED"].includes(String(value.planning.summary.overallStatus))
    ) return null;
  }

  if (value.planningContext !== undefined) {
    if (!isRecord(value.planningContext)) return null;
    for (const key of ["monthlyIncomeKrw", "monthlyExpenseKrw", "liquidAssetsKrw", "debtBalanceKrw"] as const) {
      const entry = value.planningContext[key];
      if (entry !== undefined && (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || !Number.isInteger(entry))) {
        return null;
      }
    }
  }

  return normalizeProfile(value);
}

function normalizeMigrationItem(value: unknown): SavedRunItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.unifiedId !== "string" || !value.unifiedId.trim()) return null;
  if (typeof value.providerName !== "string" || typeof value.productName !== "string") return null;
  if (value.kind !== "deposit" && value.kind !== "saving") return null;
  if (value.termMonths !== null && (typeof value.termMonths !== "number" || !Number.isInteger(value.termMonths) || value.termMonths <= 0)) return null;
  if (value.appliedRate !== null && (typeof value.appliedRate !== "number" || !Number.isFinite(value.appliedRate))) return null;
  if (typeof value.rank !== "number" || !Number.isInteger(value.rank) || value.rank < 1) return null;
  if (typeof value.finalScore !== "number" || !Number.isFinite(value.finalScore)) return null;
  return normalizeItem(value);
}

function normalizeMigrationRun(
  ownerId: RecommendOwnerId,
  value: unknown,
  allowMissingOwner: boolean,
): SavedRecommendRun | null {
  if (!isRecord(value)) return null;
  if (
    value.ownerId !== ownerId
    && !(allowMissingOwner && value.ownerId === undefined)
  ) {
    return null;
  }
  const runId = typeof value.runId === "string" ? value.runId.trim() : "";
  if (!runId) return null;
  if (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) return null;
  const profile = normalizeMigrationProfile(value.profile);
  if (!profile || !Array.isArray(value.items)) return null;
  const items = value.items.map(normalizeMigrationItem);
  if (items.some((item) => item === null)) return null;

  return {
    ownerId,
    runId,
    savedAt: new Date(value.savedAt).toISOString(),
    profile,
    items: items as SavedRunItem[],
  };
}

function toTimestamp(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function sortRuns(items: SavedRecommendRun[]): SavedRecommendRun[] {
  return [...items].sort((a, b) => {
    const tsGap = toTimestamp(b.savedAt) - toTimestamp(a.savedAt);
    if (tsGap !== 0) return tsGap;
    return b.runId.localeCompare(a.runId);
  });
}

function enforceLimit(items: SavedRecommendRun[]): SavedRecommendRun[] {
  return sortRuns(items).slice(0, MAX_RUNS);
}

function parseOwnedRunsRawStrict(ownerId: RecommendOwnerId, raw: string | null): SavedRecommendRun[] | null {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.length > MAX_RUNS) return null;
    const normalized = parsed.map((item) => normalizeMigrationRun(ownerId, item, false));
    if (normalized.some((item) => item === null)) return null;
    const runs = normalized as SavedRecommendRun[];
    if (new Set(runs.map((run) => run.runId)).size !== runs.length) return null;
    return sortRuns(runs);
  } catch {
    return null;
  }
}

export function buildOwnerSavedRunsFromLegacy(
  ownerId: RecommendOwnerId,
  legacyRaw: string,
  currentOwnerRaw: string | null,
): { raw: string; migratedCount: number } | null {
  try {
    const legacyParsed = JSON.parse(legacyRaw) as unknown;
    if (!Array.isArray(legacyParsed)) return null;
    if (legacyParsed.length > MAX_RUNS) return null;
    const legacyRuns = legacyParsed.map((item) => normalizeMigrationRun(ownerId, item, true));
    if (legacyRuns.some((item) => item === null)) return null;
    const legacyRunIds = (legacyRuns as SavedRecommendRun[]).map((run) => run.runId);
    if (new Set(legacyRunIds).size !== legacyRunIds.length) return null;

    const currentRuns = parseOwnedRunsRawStrict(ownerId, currentOwnerRaw);
    if (!currentRuns) return null;

    const currentRunsById = new Map(currentRuns.map((run) => [run.runId, run]));
    for (const legacyRun of legacyRuns as SavedRecommendRun[]) {
      const currentRun = currentRunsById.get(legacyRun.runId);
      if (currentRun && JSON.stringify(currentRun) !== JSON.stringify(legacyRun)) {
        return null;
      }
    }
    const migratedRuns = (legacyRuns as SavedRecommendRun[])
      .filter((run) => !currentRunsById.has(run.runId));
    if (currentRuns.length + migratedRuns.length > MAX_RUNS) return null;
    const merged = enforceLimit([...currentRuns, ...migratedRuns]);
    return {
      raw: JSON.stringify(merged),
      migratedCount: migratedRuns.length,
    };
  } catch {
    return null;
  }
}

function readRuns(ownerId: RecommendOwnerId, storage?: StorageLike): SavedRecommendRun[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(recommendOwnerStorageKey(ownerId, "saved-runs"));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return enforceLimit(parsed
      .map((item) => normalizeRun(ownerId, item))
      .filter((item): item is SavedRecommendRun => item !== null));
  } catch {
    return [];
  }
}

function writeRuns(ownerId: RecommendOwnerId, items: SavedRecommendRun[], storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.setItem(recommendOwnerStorageKey(ownerId, "saved-runs"), JSON.stringify(enforceLimit(items)));
}

function createRunId(savedAt: string): string {
  const stamp = savedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `run_${stamp}_${nonce}`;
}

export function listRuns(ownerId: RecommendOwnerId, storage?: StorageLike): SavedRecommendRun[] {
  return readRuns(ownerId, storage);
}

export function saveRun(
  ownerId: RecommendOwnerId,
  input: SavedRunInput,
  storage?: StorageLike,
): SavedRecommendRun {
  const savedAt = normalizeDateIso(input.savedAt);
  const normalized = normalizeRun(ownerId, {
    ownerId,
    runId: (input.runId ?? "").trim() || createRunId(savedAt),
    savedAt,
    profile: input.profile,
    items: input.items,
  });

  if (!normalized) {
    throw new Error("saveRun input is invalid");
  }

  const current = readRuns(ownerId, storage);
  const next = [normalized, ...current.filter((run) => run.runId !== normalized.runId)];
  writeRuns(ownerId, next, storage);
  return normalized;
}

export function buildRunFromRecommend(
  ownerId: RecommendOwnerId,
  profile: SavedRunProfile,
  response: RecommendLikeResponse,
  overrides?: { runId?: string; savedAt?: string },
): SavedRecommendRun {
  const savedAt = normalizeDateIso(overrides?.savedAt);
  const itemsRaw = Array.isArray(response.items) ? response.items : [];
  const items = itemsRaw.map((item, index) => {
    const termMonths = normalizeTermMonths(item.selectedOption?.termMonths) ?? parseTermMonthsFromString(item.selectedOption?.saveTrm);
    const appliedRate = normalizeNumber(item.selectedOption?.appliedRate);
    const finalScore = normalizeNumber(item.finalScore) ?? 0;
    return {
      unifiedId: ensureUnifiedId(item, index + 1),
      providerName: typeof item.providerName === "string" ? item.providerName : "",
      productName: typeof item.productName === "string" ? item.productName : "",
      kind: item.kind === "saving" ? "saving" : "deposit",
      termMonths,
      appliedRate,
      rank: index + 1,
      finalScore,
    } satisfies SavedRunItem;
  });

  return {
    ownerId,
    runId: (overrides?.runId ?? "").trim() || createRunId(savedAt),
    savedAt,
    profile,
    items,
  };
}

export function saveRunFromRecommend(
  ownerId: RecommendOwnerId,
  profile: SavedRunProfile,
  response: RecommendLikeResponse,
  storage?: StorageLike,
): string {
  const run = buildRunFromRecommend(ownerId, profile, response);
  const saved = saveRun(ownerId, run, storage);
  return saved.runId;
}

export function getRun(
  ownerId: RecommendOwnerId,
  runId: string,
  storage?: StorageLike,
): SavedRecommendRun | null {
  const target = runId.trim();
  if (!target) return null;
  return readRuns(ownerId, storage).find((run) => run.runId === target) ?? null;
}

export function removeRun(ownerId: RecommendOwnerId, runId: string, storage?: StorageLike): void {
  const target = runId.trim();
  if (!target) return;
  const next = readRuns(ownerId, storage).filter((run) => run.runId !== target);
  writeRuns(ownerId, next, storage);
}

export function clearRuns(ownerId: RecommendOwnerId, storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.removeItem(recommendOwnerStorageKey(ownerId, "saved-runs"));
}

function assertRunOwner(ownerId: RecommendOwnerId, run: SavedRecommendRun): void {
  if (run.ownerId !== ownerId) {
    throw new Error("recommend run owner mismatch");
  }
}

export function exportRunJson(ownerId: RecommendOwnerId, run: SavedRecommendRun): string {
  assertRunOwner(ownerId, run);
  return JSON.stringify({
    runId: run.runId,
    savedAt: run.savedAt,
    profile: run.profile,
    items: run.items,
  }, null, 2);
}

export function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function formatCsvNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return String(value);
}

export function exportRunCsv(ownerId: RecommendOwnerId, run: SavedRecommendRun): string {
  assertRunOwner(ownerId, run);
  const headers = [
    "runId",
    "savedAt",
    "purpose",
    "profileKind",
    "preferredTerm",
    "liquidityPref",
    "rateMode",
    "topN",
    "candidatePool",
    "candidateSources",
    "depositProtection",
    "weightRate",
    "weightTerm",
    "weightLiquidity",
    "rank",
    "unifiedId",
    "providerName",
    "productName",
    "itemKind",
    "termMonths",
    "appliedRate",
    "finalScore",
  ];

  const base = [
    run.runId,
    run.savedAt,
    run.profile.purpose,
    run.profile.kind,
    String(run.profile.preferredTerm),
    run.profile.liquidityPref,
    run.profile.rateMode,
    String(run.profile.topN),
    run.profile.candidatePool,
    run.profile.candidateSources.join("|"),
    run.profile.depositProtection,
    formatCsvNumber(run.profile.weights.rate),
    formatCsvNumber(run.profile.weights.term),
    formatCsvNumber(run.profile.weights.liquidity),
  ];

  const rows = (run.items.length > 0 ? run.items : [null]).map((item) => {
    const itemPart = item
      ? [
          String(item.rank),
          item.unifiedId,
          item.providerName,
          item.productName,
          item.kind,
          formatCsvNumber(item.termMonths),
          formatCsvNumber(item.appliedRate),
          formatCsvNumber(item.finalScore),
        ]
      : ["", "", "", "", "", "", "", ""];
    return [...base, ...itemPart].map((cell) => escapeCsvCell(cell)).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export const savedRunsStoreConfig = {
  storageKey: (ownerId: RecommendOwnerId) => recommendOwnerStorageKey(ownerId, "saved-runs"),
  maxRuns: MAX_RUNS,
};
