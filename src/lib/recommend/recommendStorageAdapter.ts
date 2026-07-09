import type { RecommendProfileNormalized } from "@/lib/schemas/recommendProfile";

export type RecommendStorageItemInput = {
  sourceId: string;
  finPrdtCd: string;
  productName: string;
  providerName: string;
  selectedOption: {
    appliedRate: number;
    saveTrm: string | null;
    termMonths: number | null;
  };
};

export type StoredRecommendItemV1 = {
  key: string;
  sourceId: string;
  finPrdtCd: string;
  productName: string;
  providerName: string;
  rank: number;
  appliedRate: number | null;
  saveTrm: string | null;
};

export type StoredRecommendResultV1<
  TProfile = RecommendProfileNormalized,
  TMeta = unknown,
> = {
  version: 1;
  savedAt: string;
  profile: TProfile;
  meta?: TMeta;
  items: StoredRecommendItemV1[];
};

export const RECOMMEND_RESULT_STORAGE_KEY = "recommend_last_result_v1";
export const RECOMMEND_AUTORUN_SIG_SESSION_KEY = "recommend_autorun_sig";

function normalizeStoredTerm(value: string | null | undefined, termMonths: number | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length > 0) return raw;
  if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) return String(Math.trunc(termMonths));
  return null;
}

export function buildStoredRecommendResult<TProfile, TMeta>(input: {
  profile: TProfile;
  meta?: TMeta;
  items?: RecommendStorageItemInput[];
  now?: Date;
}): StoredRecommendResultV1<TProfile, TMeta> {
  const items = (input.items ?? []).map((item, index) => ({
    key: `${item.sourceId}::${item.finPrdtCd}`,
    sourceId: item.sourceId,
    finPrdtCd: item.finPrdtCd,
    productName: item.productName,
    providerName: item.providerName,
    rank: index + 1,
    appliedRate: Number.isFinite(item.selectedOption.appliedRate) ? item.selectedOption.appliedRate : null,
    saveTrm: normalizeStoredTerm(item.selectedOption.saveTrm, item.selectedOption.termMonths),
  }));

  return {
    version: 1,
    savedAt: (input.now ?? new Date()).toISOString(),
    profile: input.profile,
    meta: input.meta,
    items,
  };
}

export function parseStoredRecommendResult<TProfile = RecommendProfileNormalized, TMeta = unknown>(
  raw: string | null,
): StoredRecommendResultV1<TProfile, TMeta> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRecommendResultV1<TProfile, TMeta>>;
    if (parsed.version !== 1) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as StoredRecommendResultV1<TProfile, TMeta>;
  } catch {
    return null;
  }
}

export function buildRecommendAutorunSignature(profile: Pick<
  RecommendProfileNormalized,
  "purpose" | "kind" | "preferredTerm" | "liquidityPref" | "rateMode" | "topN" | "candidatePool" | "candidateSources" | "depositProtection" | "weights"
>): string {
  return JSON.stringify({
    purpose: profile.purpose,
    kind: profile.kind,
    preferredTerm: profile.preferredTerm,
    liquidityPref: profile.liquidityPref,
    rateMode: profile.rateMode,
    topN: profile.topN,
    candidatePool: profile.candidatePool,
    candidateSources: profile.candidateSources,
    depositProtection: profile.depositProtection,
    weights: profile.weights,
  });
}

export function readRecommendAutorunSessionPayload(storage: Storage | null | undefined = typeof window === "undefined" ? null : window.sessionStorage): {
  sig: string;
  runId: string | null;
} | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RECOMMEND_AUTORUN_SIG_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{ sig: string; runId: string | null }>;
    if (typeof parsed.sig !== "string" || !parsed.sig) return null;
    return {
      sig: parsed.sig,
      runId: typeof parsed.runId === "string" && parsed.runId ? parsed.runId : null,
    };
  } catch {
    return null;
  }
}

export function writeRecommendAutorunSessionPayload(
  payload: { sig: string; runId: string | null },
  storage: Storage | null | undefined = typeof window === "undefined" ? null : window.sessionStorage,
): void {
  if (!storage) return;
  storage.setItem(RECOMMEND_AUTORUN_SIG_SESSION_KEY, JSON.stringify(payload));
}

export function buildRecommendRequest(input: {
  profile: RecommendProfileNormalized;
}): {
  url: string;
  init: RequestInit;
} {
  return {
    url: `/api/recommend?topN=${input.profile.topN}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.profile),
    },
  };
}
