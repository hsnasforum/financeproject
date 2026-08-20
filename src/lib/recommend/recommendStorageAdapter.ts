import type { RecommendProfileNormalized } from "@/lib/schemas/recommendProfile";
import {
  recommendOwnerStorageKey,
  type RecommendOwnerId,
} from "@/lib/recommend/ownerNamespace";

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

export type StoredRecommendProfileV2<TProfile = RecommendProfileNormalized> = {
  version: 2;
  ownerId: RecommendOwnerId;
  profile: TProfile;
};

export type StoredRecommendResultV2<
  TProfile = RecommendProfileNormalized,
  TMeta = unknown,
> = {
  version: 2;
  ownerId: RecommendOwnerId;
  savedAt: string;
  profile: TProfile;
  meta?: TMeta;
  items: StoredRecommendItemV1[];
};

export function recommendProfileStorageKey(ownerId: RecommendOwnerId): string {
  return recommendOwnerStorageKey(ownerId, "profile");
}

export function recommendResultStorageKey(ownerId: RecommendOwnerId): string {
  return recommendOwnerStorageKey(ownerId, "last-result");
}

export function recommendAutorunSessionKey(ownerId: RecommendOwnerId): string {
  return recommendOwnerStorageKey(ownerId, "autorun");
}

function normalizeStoredTerm(value: string | null | undefined, termMonths: number | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length > 0) return raw;
  if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) return String(Math.trunc(termMonths));
  return null;
}

export function buildStoredRecommendResult<TProfile, TMeta>(input: {
  ownerId: RecommendOwnerId;
  profile: TProfile;
  meta?: TMeta;
  items?: RecommendStorageItemInput[];
  now?: Date;
}): StoredRecommendResultV2<TProfile, TMeta> {
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
    version: 2,
    ownerId: input.ownerId,
    savedAt: (input.now ?? new Date()).toISOString(),
    profile: input.profile,
    meta: input.meta,
    items,
  };
}

export function buildStoredRecommendProfile<TProfile>(
  ownerId: RecommendOwnerId,
  profile: TProfile,
): StoredRecommendProfileV2<TProfile> {
  return { version: 2, ownerId, profile };
}

export function parseStoredRecommendProfile<TProfile = RecommendProfileNormalized>(
  ownerId: RecommendOwnerId,
  raw: string | null,
): StoredRecommendProfileV2<TProfile> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRecommendProfileV2<TProfile>>;
    if (parsed.version !== 2 || parsed.ownerId !== ownerId) return null;
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    return parsed as StoredRecommendProfileV2<TProfile>;
  } catch {
    return null;
  }
}

export function parseStoredRecommendResult<TProfile = RecommendProfileNormalized, TMeta = unknown>(
  ownerId: RecommendOwnerId,
  raw: string | null,
): StoredRecommendResultV2<TProfile, TMeta> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRecommendResultV2<TProfile, TMeta>>;
    if (parsed.version !== 2 || parsed.ownerId !== ownerId) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as StoredRecommendResultV2<TProfile, TMeta>;
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

export function readRecommendAutorunSessionPayload(
  ownerId: RecommendOwnerId,
  storage: Storage | null | undefined = typeof window === "undefined" ? null : window.sessionStorage,
): {
  sig: string;
  runId: string | null;
} | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(recommendAutorunSessionKey(ownerId));
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
  ownerId: RecommendOwnerId,
  payload: { sig: string; runId: string | null },
  storage: Storage | null | undefined = typeof window === "undefined" ? null : window.sessionStorage,
): void {
  if (!storage) return;
  storage.setItem(recommendAutorunSessionKey(ownerId), JSON.stringify(payload));
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
