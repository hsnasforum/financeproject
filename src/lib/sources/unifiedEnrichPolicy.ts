export type DepositProtectionMode = "any" | "prefer" | "require";

type WithDepositSignal = {
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
};

export function applyDepositProtectionOnViews<T extends WithDepositSignal>(input: {
  items: T[];
  mode: DepositProtectionMode;
}): T[] {
  void input.mode;
  return input.items;
}

export type UnifiedOptionView = {
  sourceId?: string;
  termMonths: number | null;
  saveTrm?: string;
  intrRate: number | null;
  intrRate2: number | null;
};

export type UnifiedMergeItem = {
  stableId: string;
  sourceId: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
  options?: UnifiedOptionView[];
  sourceIds?: string[];
};

type UnifiedSortMode = "recent" | "name";

const FINLIFE_SOURCE_ID = "finlife";

function sourcePriority(sourceId: string): number {
  return sourceId === FINLIFE_SOURCE_ID ? 0 : 1;
}

function toTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function compareWinnerPriority(a: UnifiedMergeItem, b: UnifiedMergeItem): number {
  const sourceGap = sourcePriority(a.sourceId) - sourcePriority(b.sourceId);
  if (sourceGap !== 0) return sourceGap;

  const aTs = toTimestamp(a.lastSeenAt ?? a.updatedAt ?? a.firstSeenAt);
  const bTs = toTimestamp(b.lastSeenAt ?? b.updatedAt ?? b.firstSeenAt);
  if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;

  const providerGap = (a.providerName ?? "").localeCompare(b.providerName ?? "");
  if (providerGap !== 0) return providerGap;
  const productGap = (a.productName ?? "").localeCompare(b.productName ?? "");
  if (productGap !== 0) return productGap;
  return (a.externalKey ?? "").localeCompare(b.externalKey ?? "");
}

function optionDedupKey(option: UnifiedOptionView): string {
  if (typeof option.termMonths === "number" && Number.isFinite(option.termMonths) && option.termMonths >= 0) {
    return `m:${Math.trunc(option.termMonths)}`;
  }
  const saveTrm = (option.saveTrm ?? "").trim().toLowerCase();
  return saveTrm ? `s:${saveTrm}` : `u:${option.sourceId ?? ""}`;
}

function compareOptionPickPriority(a: UnifiedOptionView, b: UnifiedOptionView): number {
  const aMax = a.intrRate2 ?? Number.NEGATIVE_INFINITY;
  const bMax = b.intrRate2 ?? Number.NEGATIVE_INFINITY;
  if (aMax !== bMax) return bMax - aMax;

  const aBase = a.intrRate ?? Number.NEGATIVE_INFINITY;
  const bBase = b.intrRate ?? Number.NEGATIVE_INFINITY;
  if (aBase !== bBase) return bBase - aBase;

  const sourceGap = sourcePriority(a.sourceId ?? "") - sourcePriority(b.sourceId ?? "");
  if (sourceGap !== 0) return sourceGap;

  return (a.saveTrm ?? "").localeCompare(b.saveTrm ?? "");
}

export function sortUnifiedOptions(options: UnifiedOptionView[]): UnifiedOptionView[] {
  return [...options].sort((a, b) => {
    const aTerm = typeof a.termMonths === "number" && Number.isFinite(a.termMonths) ? a.termMonths : Number.POSITIVE_INFINITY;
    const bTerm = typeof b.termMonths === "number" && Number.isFinite(b.termMonths) ? b.termMonths : Number.POSITIVE_INFINITY;
    if (aTerm !== bTerm) return aTerm - bTerm;

    const maxGap = (b.intrRate2 ?? Number.NEGATIVE_INFINITY) - (a.intrRate2 ?? Number.NEGATIVE_INFINITY);
    if (maxGap !== 0) return maxGap;
    const baseGap = (b.intrRate ?? Number.NEGATIVE_INFINITY) - (a.intrRate ?? Number.NEGATIVE_INFINITY);
    if (baseGap !== 0) return baseGap;

    const sourceGap = sourcePriority(a.sourceId ?? "") - sourcePriority(b.sourceId ?? "");
    if (sourceGap !== 0) return sourceGap;
    return (a.saveTrm ?? "").localeCompare(b.saveTrm ?? "");
  });
}

function mergeOptionsByTerm(items: UnifiedMergeItem[]): UnifiedOptionView[] {
  const merged = new Map<string, UnifiedOptionView>();
  for (const item of items) {
    for (const option of item.options ?? []) {
      const key = optionDedupKey(option);
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, option);
        continue;
      }
      if (compareOptionPickPriority(option, prev) < 0) {
        merged.set(key, option);
      }
    }
  }
  return sortUnifiedOptions([...merged.values()]);
}

function pickSummary(items: UnifiedMergeItem[], winner: UnifiedMergeItem): string | undefined {
  if (winner.summary && winner.summary.trim()) return winner.summary;
  for (const item of items) {
    if (item.summary && item.summary.trim()) return item.summary;
  }
  return undefined;
}

function pickTimestampIso(input: {
  items: UnifiedMergeItem[];
  field: "firstSeenAt" | "lastSeenAt" | "updatedAt";
  mode: "min" | "max";
}): string | undefined {
  const values = input.items
    .map((item) => item[input.field])
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  if (values.length === 0) return undefined;
  const sorted = values.sort((a, b) => Date.parse(a) - Date.parse(b));
  return input.mode === "min" ? sorted[0] : sorted[sorted.length - 1];
}

function mergeSignals(items: UnifiedMergeItem[], winner: UnifiedMergeItem): UnifiedMergeItem["signals"] {
  const hasMatchedDeposit = items.some((item) => item.signals?.depositProtection === "matched");
  const hasKdbMatched = items.some((item) => item.signals?.kdbMatched);
  if (!winner.signals && !hasMatchedDeposit && !hasKdbMatched) return undefined;
  return {
    depositProtection: hasMatchedDeposit ? "matched" : winner.signals?.depositProtection,
    kdbMatched: hasKdbMatched || winner.signals?.kdbMatched,
  };
}

function mergeBadges(items: UnifiedMergeItem[]): string[] | undefined {
  const bag = new Set<string>();
  for (const item of items) {
    for (const badge of item.badges ?? []) {
      if (badge) bag.add(badge);
    }
  }
  return bag.size > 0 ? [...bag].sort((a, b) => a.localeCompare(b)) : undefined;
}

export function buildStableUnifiedId(input: {
  sourceId: string;
  externalKey: string;
  canonicalFinPrdtCd?: string | null;
}): string {
  const externalKey = (input.externalKey ?? "").trim();
  if (input.sourceId === FINLIFE_SOURCE_ID && externalKey) return externalKey;
  const canonical = (input.canonicalFinPrdtCd ?? "").trim();
  if (canonical) return canonical;
  return `${input.sourceId}:${externalKey || "unknown"}`;
}

function compareMergedItems(a: UnifiedMergeItem, b: UnifiedMergeItem, sort: UnifiedSortMode): number {
  if (sort === "recent") {
    const aTs = toTimestamp(a.lastSeenAt ?? a.updatedAt ?? a.firstSeenAt);
    const bTs = toTimestamp(b.lastSeenAt ?? b.updatedAt ?? b.firstSeenAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
  }

  const providerGap = (a.providerName ?? "").localeCompare(b.providerName ?? "");
  if (providerGap !== 0) return providerGap;
  const productGap = (a.productName ?? "").localeCompare(b.productName ?? "");
  if (productGap !== 0) return productGap;
  return (a.stableId ?? "").localeCompare(b.stableId ?? "");
}

export function mergeUnifiedCatalogRows(input: {
  items: UnifiedMergeItem[];
  sort: UnifiedSortMode;
}): UnifiedMergeItem[] {
  if (input.items.length === 0) return [];

  const grouped = new Map<string, UnifiedMergeItem[]>();
  for (const item of input.items) {
    const key = item.stableId || `${item.sourceId}:${item.externalKey}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  const merged: UnifiedMergeItem[] = [];
  for (const [stableId, bucket] of grouped.entries()) {
    const sortedByWinner = [...bucket].sort(compareWinnerPriority);
    const winner = sortedByWinner[0];

    const sourceIds = [...new Set(bucket.map((item) => item.sourceId))]
      .sort((a, b) => {
        const pri = sourcePriority(a) - sourcePriority(b);
        if (pri !== 0) return pri;
        return a.localeCompare(b);
      });

    merged.push({
      ...winner,
      stableId,
      summary: pickSummary(bucket, winner),
      firstSeenAt: pickTimestampIso({ items: bucket, field: "firstSeenAt", mode: "min" }),
      lastSeenAt: pickTimestampIso({ items: bucket, field: "lastSeenAt", mode: "max" }),
      updatedAt: pickTimestampIso({ items: bucket, field: "updatedAt", mode: "max" }),
      badges: mergeBadges(bucket),
      signals: mergeSignals(bucket, winner),
      options: mergeOptionsByTerm(bucket),
      sourceIds,
    });
  }

  return merged.sort((a, b) => compareMergedItems(a, b, input.sort));
}

export type CanonicalIntegratedItem = {
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
};

export function integrateCanonicalWithMatches<T extends CanonicalIntegratedItem>(input: {
  canonicalItems: T[];
  isKdbMatched: (item: T) => boolean;
  kdbOnlyItems?: T[];
}): { items: T[]; extras?: { kdbOnly?: T[] } } {
  const withSignals = input.canonicalItems.map((item) => {
    const signals: NonNullable<T["signals"]> = {
      kdbMatched: input.isKdbMatched(item),
    };
    const badges = new Set<string>(item.badges ?? ["FINLIFE"]);
    if (signals.kdbMatched) badges.add("KDB_MATCHED");
    return {
      ...item,
      signals,
      badges: [...badges],
    };
  });

  const items = applyDepositProtectionOnViews({
    items: withSignals,
    mode: "any",
  });

  if (!input.kdbOnlyItems) return { items };
  return {
    items,
    extras: { kdbOnly: input.kdbOnlyItems },
  };
}
