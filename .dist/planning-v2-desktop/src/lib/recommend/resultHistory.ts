import type {
  CandidateSource,
  DepositProtectionMode,
  RecommendPurpose,
  RateMode,
  UserRecommendProfile,
} from "@/lib/recommend/types";

export type RecommendResultItemSnapshot = {
  key: string;
  sourceId: string;
  finPrdtCd: string;
  productName: string;
  providerName: string;
  rank: number;
  appliedRate: number | null;
  saveTrm: string | null;
};

export type RecommendResultSnapshot = {
  savedAt: string;
  profile: {
    purpose: RecommendPurpose;
    kind: UserRecommendProfile["kind"];
    preferredTerm: UserRecommendProfile["preferredTerm"];
    liquidityPref: UserRecommendProfile["liquidityPref"];
    rateMode: UserRecommendProfile["rateMode"];
    topN: number;
  };
  meta?: {
    kind: UserRecommendProfile["kind"];
    topN: number;
    rateMode: RateMode;
    candidateSources: CandidateSource[];
    depositProtection: DepositProtectionMode;
    weights: {
      rate: number;
      term: number;
      liquidity: number;
    };
    assumptions?: {
      rateSelectionPolicy?: string;
      liquidityPolicy?: string;
      normalizationPolicy?: string;
      kdbParsingPolicy?: string;
      depositProtectionPolicy?: string;
    };
  };
  items: RecommendResultItemSnapshot[];
};

export type RecommendResultDelta = {
  hasPrevious: boolean;
  previousSavedAt?: string;
  currentSavedAt: string;
  previousTopRate: number | null;
  currentTopRate: number | null;
  rateDiffPct: number | null;
  optionChanges: Array<{
    key: string;
    sourceId: string;
    finPrdtCd: string;
    productName: string;
    previousOption: string | null;
    currentOption: string | null;
    previousRate: number | null;
    currentRate: number | null;
    rateDiffPct: number | null;
  }>;
  rankChanges: Array<{
    key: string;
    sourceId: string;
    finPrdtCd: string;
    productName: string;
    previousRank: number;
    currentRank: number;
    shift: number;
  }>;
  newItems: Array<{ key: string; sourceId: string; finPrdtCd: string; productName: string }>;
  droppedItems: Array<{ key: string; sourceId: string; finPrdtCd: string; productName: string }>;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asValidKind(value: unknown): UserRecommendProfile["kind"] | null {
  if (value === "deposit" || value === "saving") return value;
  return null;
}

function asValidRateMode(value: unknown): RateMode | null {
  if (value === "max" || value === "base" || value === "simple") return value;
  return null;
}

function asValidDepositProtection(value: unknown): DepositProtectionMode | null {
  if (value === "any" || value === "prefer" || value === "require") return value;
  return null;
}

function asValidCandidateSources(value: unknown): CandidateSource[] {
  if (!Array.isArray(value)) return ["finlife"];
  const normalized = value.filter((entry): entry is CandidateSource => entry === "finlife" || entry === "datago_kdb");
  return normalized.length > 0 ? normalized : ["finlife"];
}

function normalizeIdPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildItemIdentityKey(sourceId: string, finPrdtCd: string, providerName: string): string {
  const sourcePart = normalizeIdPart(sourceId || providerName || "unknown");
  const codePart = normalizeIdPart(finPrdtCd || "unknown");
  return `${sourcePart}::${codePart}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseRecommendResultSnapshot(raw: string | null): RecommendResultSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : null;
    if (!savedAt) return null;

    const profileRaw = isRecord(parsed.profile) ? parsed.profile : null;
    const parsedKind = asValidKind(parsed.kind);
    const profileKind = asValidKind(profileRaw?.kind ?? parsedKind);
    if (!profileRaw || !profileKind) return null;

    const purpose = profileRaw.purpose;
    const preferredTerm = profileRaw.preferredTerm;
    const liquidityPref = profileRaw.liquidityPref;
    const rateModeRaw = profileRaw.rateMode;
    const topN = Number(profileRaw.topN);
    const rateMode = asValidRateMode(rateModeRaw);

    if (purpose !== "emergency" && purpose !== "seed-money" && purpose !== "long-term") return null;
    if (preferredTerm !== 3 && preferredTerm !== 6 && preferredTerm !== 12 && preferredTerm !== 24 && preferredTerm !== 36) return null;
    if (liquidityPref !== "low" && liquidityPref !== "mid" && liquidityPref !== "high") return null;
    if (!rateMode) return null;
    if (!Number.isFinite(topN)) return null;

    if (!Array.isArray(parsed.items)) return null;
    const items: RecommendResultItemSnapshot[] = parsed.items
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry, index) => {
        const finPrdtCd = typeof entry.finPrdtCd === "string" ? entry.finPrdtCd : "";
        const productName = typeof entry.productName === "string" ? entry.productName : "상품명 없음";
        const providerName = typeof entry.providerName === "string" ? entry.providerName : "금융사 정보 없음";
        const sourceIdRaw = typeof entry.sourceId === "string" ? entry.sourceId : "";
        const sourceId = sourceIdRaw || providerName || "unknown";
        const rankRaw = Number(entry.rank);
        const rank = Number.isFinite(rankRaw) && rankRaw > 0 ? Math.trunc(rankRaw) : index + 1;
        const saveTrm = typeof entry.saveTrm === "string" ? entry.saveTrm : null;
        const appliedRate = asFiniteNumber(entry.appliedRate);
        const key = typeof entry.key === "string" && entry.key.trim().length > 0
          ? entry.key
          : buildItemIdentityKey(sourceId, finPrdtCd, providerName);

        return {
          key,
          sourceId,
          finPrdtCd,
          productName,
          providerName,
          rank,
          appliedRate,
          saveTrm,
        };
      });

    const metaRaw = isRecord(parsed.meta) ? parsed.meta : null;
    const metaKind = asValidKind(metaRaw?.kind);
    const metaRateMode = asValidRateMode(metaRaw?.rateMode);
    const metaTopN = Number(metaRaw?.topN);
    const meta = metaRaw && metaKind && metaRateMode && Number.isFinite(metaTopN)
      ? {
          kind: metaKind,
          topN: Math.trunc(metaTopN),
          rateMode: metaRateMode,
          candidateSources: asValidCandidateSources(metaRaw.candidateSources),
          depositProtection: asValidDepositProtection(metaRaw.depositProtection) ?? "any",
          weights: {
            rate: Number(metaRaw.weights && isRecord(metaRaw.weights) ? metaRaw.weights.rate : 0),
            term: Number(metaRaw.weights && isRecord(metaRaw.weights) ? metaRaw.weights.term : 0),
            liquidity: Number(metaRaw.weights && isRecord(metaRaw.weights) ? metaRaw.weights.liquidity : 0),
          },
          assumptions: isRecord(metaRaw.assumptions)
            ? {
                rateSelectionPolicy: typeof metaRaw.assumptions.rateSelectionPolicy === "string" ? metaRaw.assumptions.rateSelectionPolicy : undefined,
                liquidityPolicy: typeof metaRaw.assumptions.liquidityPolicy === "string" ? metaRaw.assumptions.liquidityPolicy : undefined,
                normalizationPolicy: typeof metaRaw.assumptions.normalizationPolicy === "string" ? metaRaw.assumptions.normalizationPolicy : undefined,
                kdbParsingPolicy: typeof metaRaw.assumptions.kdbParsingPolicy === "string" ? metaRaw.assumptions.kdbParsingPolicy : undefined,
                depositProtectionPolicy: typeof metaRaw.assumptions.depositProtectionPolicy === "string" ? metaRaw.assumptions.depositProtectionPolicy : undefined,
              }
            : undefined,
        }
      : undefined;

    return {
      savedAt,
      profile: {
        purpose,
        kind: profileKind,
        preferredTerm,
        liquidityPref,
        rateMode,
        topN: Math.trunc(topN),
      },
      meta,
      items,
    };
  } catch {
    return null;
  }
}

export function parseRecommendResultDelta(raw: string | null): RecommendResultDelta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.hasPrevious !== "boolean") return null;
    if (typeof parsed.currentSavedAt !== "string") return null;
    if (!Array.isArray(parsed.optionChanges) || !Array.isArray(parsed.rankChanges) || !Array.isArray(parsed.newItems) || !Array.isArray(parsed.droppedItems)) {
      return null;
    }
    return parsed as RecommendResultDelta;
  } catch {
    return null;
  }
}

export function buildRecommendResultSnapshot(input: {
  savedAt?: string;
  profile: {
    purpose: RecommendPurpose;
    kind: UserRecommendProfile["kind"];
    preferredTerm: UserRecommendProfile["preferredTerm"];
    liquidityPref: UserRecommendProfile["liquidityPref"];
    rateMode: UserRecommendProfile["rateMode"];
    topN: number;
  };
  meta?: RecommendResultSnapshot["meta"];
  items: Array<{
    sourceId?: string;
    finPrdtCd: string;
    productName: string;
    providerName: string;
    selectedOption?: {
      appliedRate?: number;
      saveTrm?: string | null;
    };
  }>;
}): RecommendResultSnapshot {
  const savedAt = input.savedAt ?? new Date().toISOString();
  const mappedItems: RecommendResultItemSnapshot[] = input.items.map((item, index) => ({
    key: buildItemIdentityKey(item.sourceId ?? "", item.finPrdtCd, item.providerName),
    sourceId: item.sourceId ?? item.providerName ?? "unknown",
    finPrdtCd: item.finPrdtCd,
    productName: item.productName,
    providerName: item.providerName,
    rank: index + 1,
    appliedRate: asFiniteNumber(item.selectedOption?.appliedRate),
    saveTrm: typeof item.selectedOption?.saveTrm === "string" ? item.selectedOption.saveTrm : null,
  }));

  return {
    savedAt,
    profile: {
      purpose: input.profile.purpose,
      kind: input.profile.kind,
      preferredTerm: input.profile.preferredTerm,
      liquidityPref: input.profile.liquidityPref,
      rateMode: input.profile.rateMode,
      topN: input.profile.topN,
    },
    meta: input.meta,
    items: mappedItems,
  };
}

export function computeRecommendResultDelta(
  previous: RecommendResultSnapshot | null,
  current: RecommendResultSnapshot,
): RecommendResultDelta {
  const previousTopRate = previous?.items[0]?.appliedRate ?? null;
  const currentTopRate = current.items[0]?.appliedRate ?? null;
  const rateDiffPct = previousTopRate !== null && currentTopRate !== null
    ? currentTopRate - previousTopRate
    : null;

  const previousMap = new Map(previous?.items.map((item) => [item.key, item]) ?? []);
  const currentMap = new Map(current.items.map((item) => [item.key, item]));

  const optionChanges: RecommendResultDelta["optionChanges"] = [];
  const rankChanges: RecommendResultDelta["rankChanges"] = [];
  const newItems: RecommendResultDelta["newItems"] = [];
  const droppedItems: RecommendResultDelta["droppedItems"] = [];

  for (const currentItem of current.items) {
    const before = previousMap.get(currentItem.key);
    if (!before) {
      newItems.push({
        key: currentItem.key,
        sourceId: currentItem.sourceId,
        finPrdtCd: currentItem.finPrdtCd,
        productName: currentItem.productName,
      });
      continue;
    }

    if (before.rank !== currentItem.rank) {
      rankChanges.push({
        key: currentItem.key,
        sourceId: currentItem.sourceId,
        finPrdtCd: currentItem.finPrdtCd,
        productName: currentItem.productName,
        previousRank: before.rank,
        currentRank: currentItem.rank,
        shift: before.rank - currentItem.rank,
      });
    }

    const optionChanged = before.saveTrm !== currentItem.saveTrm;
    const rateChanged = before.appliedRate !== currentItem.appliedRate;
    if (optionChanged || rateChanged) {
      optionChanges.push({
        key: currentItem.key,
        sourceId: currentItem.sourceId,
        finPrdtCd: currentItem.finPrdtCd,
        productName: currentItem.productName,
        previousOption: before.saveTrm,
        currentOption: currentItem.saveTrm,
        previousRate: before.appliedRate,
        currentRate: currentItem.appliedRate,
        rateDiffPct:
          before.appliedRate !== null && currentItem.appliedRate !== null
            ? currentItem.appliedRate - before.appliedRate
            : null,
      });
    }
  }

  for (const prevItem of previous?.items ?? []) {
    if (currentMap.has(prevItem.key)) continue;
    droppedItems.push({
      key: prevItem.key,
      sourceId: prevItem.sourceId,
      finPrdtCd: prevItem.finPrdtCd,
      productName: prevItem.productName,
    });
  }

  optionChanges.sort((a, b) => Math.abs(b.rateDiffPct ?? 0) - Math.abs(a.rateDiffPct ?? 0));
  rankChanges.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));

  return {
    hasPrevious: Boolean(previous),
    previousSavedAt: previous?.savedAt,
    currentSavedAt: current.savedAt,
    previousTopRate,
    currentTopRate,
    rateDiffPct,
    optionChanges,
    rankChanges,
    newItems,
    droppedItems,
  };
}
