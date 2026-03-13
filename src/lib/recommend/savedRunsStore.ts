import {
  type CandidatePool,
  type CandidateSource,
  type DepositProtectionMode,
  type RecommendPlanningContext,
  type RecommendPurpose,
  type UserRecommendProfile,
} from "@/lib/recommend/types";

const STORAGE_KEY = "recommend_saved_runs_v1";
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
  const rawPlanningContext = isRecord(value.planningContext) ? value.planningContext : {};
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

function normalizeRun(value: unknown): SavedRecommendRun | null {
  if (!isRecord(value)) return null;
  const runId = typeof value.runId === "string" ? value.runId.trim() : "";
  if (!runId) return null;

  const profile = normalizeProfile(value.profile);
  if (!profile) return null;

  const savedAt = normalizeDateIso(value.savedAt);
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is SavedRunItem => item !== null);

  return {
    runId,
    savedAt,
    profile,
    items,
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

function readRuns(storage?: StorageLike): SavedRecommendRun[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return enforceLimit(parsed.map(normalizeRun).filter((item): item is SavedRecommendRun => item !== null));
  } catch {
    return [];
  }
}

function writeRuns(items: SavedRecommendRun[], storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.setItem(STORAGE_KEY, JSON.stringify(enforceLimit(items)));
}

function createRunId(savedAt: string): string {
  const stamp = savedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `run_${stamp}_${nonce}`;
}

export function listRuns(storage?: StorageLike): SavedRecommendRun[] {
  return readRuns(storage);
}

export function saveRun(input: SavedRunInput, storage?: StorageLike): SavedRecommendRun {
  const savedAt = normalizeDateIso(input.savedAt);
  const normalized = normalizeRun({
    runId: (input.runId ?? "").trim() || createRunId(savedAt),
    savedAt,
    profile: input.profile,
    items: input.items,
  });

  if (!normalized) {
    throw new Error("saveRun input is invalid");
  }

  const current = readRuns(storage);
  const next = [normalized, ...current.filter((run) => run.runId !== normalized.runId)];
  writeRuns(next, storage);
  return normalized;
}

export function buildRunFromRecommend(
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
    runId: (overrides?.runId ?? "").trim() || createRunId(savedAt),
    savedAt,
    profile,
    items,
  };
}

export function saveRunFromRecommend(
  profile: SavedRunProfile,
  response: RecommendLikeResponse,
  storage?: StorageLike,
): string {
  const run = buildRunFromRecommend(profile, response);
  const saved = saveRun(run, storage);
  return saved.runId;
}

export function getRun(runId: string, storage?: StorageLike): SavedRecommendRun | null {
  const target = runId.trim();
  if (!target) return null;
  return readRuns(storage).find((run) => run.runId === target) ?? null;
}

export function removeRun(runId: string, storage?: StorageLike): void {
  const target = runId.trim();
  if (!target) return;
  const next = readRuns(storage).filter((run) => run.runId !== target);
  writeRuns(next, storage);
}

export function clearRuns(storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.removeItem(STORAGE_KEY);
}

export function exportRunJson(run: SavedRecommendRun): string {
  return JSON.stringify(run, null, 2);
}

export function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function formatCsvNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return String(value);
}

export function exportRunCsv(run: SavedRecommendRun): string {
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
  storageKey: STORAGE_KEY,
  maxRuns: MAX_RUNS,
};
