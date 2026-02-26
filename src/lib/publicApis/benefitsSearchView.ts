import { SIDO_LIST, extractRegionTagsFromTexts, normalizeSido } from "../regions/kr";
import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "../regions/kr_admin_2025";
import { isTopicFilterBypassed, type BenefitTopicKey } from "./benefitsTopics";
import { applyTopicFilter } from "./benefitsTopicMatch";
import { type BenefitCandidate } from "./contracts/types";

export type SearchFilters = {
  query: string;
  limit?: number;
  pageSize?: number;
  cursor?: number;
  includeFacets?: boolean;
  selectedSido: string | null;
  selectedSigungu: string | null;
  includeNationwide: boolean;
  includeUnknown: boolean;
  selectedTopics: BenefitTopicKey[];
  topicMode: "or" | "and";
};

type RegionFacet = { key: string; count: number };

const SIGUNGU_BLACKLIST = new Set([
  "가구",
  "인구",
  "세대",
  "청년",
  "고령",
  "아동",
  "여성",
  "전국",
  "지역",
  "기타",
]);

function toSearchFields(item: BenefitCandidate): string[] {
  return [item.title, item.summary, item.org, item.applyHow, ...(item.eligibilityHints ?? []), item.eligibilityText, item.eligibilityExcerpt]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => entry.toLowerCase());
}

const EFFECTIVE_REGION_CACHE = new WeakMap<BenefitCandidate, BenefitCandidate["region"]>();

function getEffectiveRegion(item: BenefitCandidate): BenefitCandidate["region"] {
  const cached = EFFECTIVE_REGION_CACHE.get(item);
  if (cached) return cached;

  if (item.region.scope !== "UNKNOWN") {
    EFFECTIVE_REGION_CACHE.set(item, item.region);
    return item.region;
  }

  // Avoid overfitting to long summary texts; prefer high-signal fields first.
  const focusedTexts = [item.org, item.title, item.applyHow]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const fallbackTexts = [item.summary, ...(item.eligibilityHints ?? []), item.eligibilityText, item.eligibilityExcerpt]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const focused = extractRegionTagsFromTexts(focusedTexts);
  const inferred = focused.scope !== "UNKNOWN" ? focused : extractRegionTagsFromTexts(fallbackTexts);

  if (inferred.scope === "UNKNOWN") {
    EFFECTIVE_REGION_CACHE.set(item, item.region);
    return item.region;
  }

  const merged: BenefitCandidate["region"] = {
    ...item.region,
    ...inferred,
    confidence: "LOW",
    unknownReason: undefined,
  };
  EFFECTIVE_REGION_CACHE.set(item, merged);
  return merged;
}

export function filterBenefitsByQuery(items: BenefitCandidate[], query: string): BenefitCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => toSearchFields(item).some((entry) => entry.includes(q)));
}

function applyScopeToggles(items: BenefitCandidate[], includeNationwide: boolean, includeUnknown: boolean): BenefitCandidate[] {
  return items.filter((item) => {
    const region = getEffectiveRegion(item);
    if (region.scope === "NATIONWIDE") return includeNationwide;
    if (region.scope === "UNKNOWN") return includeUnknown;
    return true;
  });
}

function applySido(items: BenefitCandidate[], selectedSido: string | null): BenefitCandidate[] {
  if (!selectedSido) return items;
  return items.filter((item) => {
    const region = getEffectiveRegion(item);
    if (region.scope !== "REGIONAL") return true;
    return (region.tags ?? []).includes(selectedSido);
  });
}

function applySigungu(items: BenefitCandidate[], selectedSido: string | null, selectedSigungu: string | null): BenefitCandidate[] {
  if (!selectedSido || !selectedSigungu) return items;
  return items.filter((item) => {
    const region = getEffectiveRegion(item);
    if (region.scope !== "REGIONAL") return true;
    const tags = region.tags ?? [];
    return tags.includes(`${selectedSido} ${selectedSigungu}`) || tags.includes(selectedSigungu);
  });
}

function getSigunguCatalogBySido(sido: string): string[] {
  const match = SIDO_ADMIN_2025.find((entry) => normalizeSido(entry.name) === sido);
  if (!match) return [];
  return (SIGUNGU_BY_SIDO_CODE_2025[match.code] ?? []).map((entry) => entry.name);
}

function getSigunguCatalogSetBySido(sido: string): Set<string> {
  return new Set(getSigunguCatalogBySido(sido));
}

function buildSidoFacets(items: BenefitCandidate[]): RegionFacet[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const region = getEffectiveRegion(item);
    if (region.scope !== "REGIONAL") continue;
    const rawSido = region.sido ?? region.tags.find((tag) => Boolean(normalizeSido(tag)));
    const key = rawSido ? normalizeSido(rawSido) : null;
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return SIDO_LIST.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

function buildSigunguFacets(items: BenefitCandidate[], selectedSido: string | null): RegionFacet[] {
  if (!selectedSido) return [];
  const allowedSigunguSet = getSigunguCatalogSetBySido(selectedSido);
  const counts = new Map<string, number>();
  for (const item of items) {
    const region = getEffectiveRegion(item);
    if (region.scope !== "REGIONAL") continue;
    for (const tag of region.tags ?? []) {
      if (!tag.startsWith(`${selectedSido} `)) continue;
      const sigungu = tag.slice(selectedSido.length + 1).trim();
      if (!sigungu || !/[시군구]$/.test(sigungu)) continue;
      if (sigungu === `${selectedSido}시` || sigungu === `${selectedSido}도`) continue;
      if (SIGUNGU_BLACKLIST.has(sigungu)) continue;
      if (allowedSigunguSet.size > 0 && !allowedSigunguSet.has(sigungu)) continue;
      counts.set(sigungu, (counts.get(sigungu) ?? 0) + 1);
    }
  }
  for (const sigungu of getSigunguCatalogBySido(selectedSido)) {
    if (!counts.has(sigungu)) counts.set(sigungu, 0);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key, "ko"));
}

function buildScopeCounts(items: BenefitCandidate[]) {
  const regional = items.filter((item) => getEffectiveRegion(item).scope === "REGIONAL").length;
  const nationwide = items.filter((item) => getEffectiveRegion(item).scope === "NATIONWIDE").length;
  const unknown = items.filter((item) => getEffectiveRegion(item).scope === "UNKNOWN").length;
  return {
    regional,
    nationwide,
    unknown,
    total: items.length,
  };
}

function toCountMap(facets: RegionFacet[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const facet of facets) {
    map[facet.key] = facet.count;
  }
  return map;
}

export function buildBenefitsSearchPayload(items: BenefitCandidate[], filters: SearchFilters, baseMeta: Record<string, unknown>) {
  const topicFilterBypassed = isTopicFilterBypassed(filters.selectedTopics);
  const items1 = topicFilterBypassed ? applyTopicFilter(items, [], "or") : applyTopicFilter(items, filters.selectedTopics, filters.topicMode);
  const items1q = filterBenefitsByQuery(items1, filters.query);
  const items2 = applyScopeToggles(items1q, filters.includeNationwide, filters.includeUnknown);

  const sidoFacets = buildSidoFacets(items2);

  const items3 = applySido(items2, filters.selectedSido);
  const sigunguFacets = buildSigunguFacets(items3, filters.selectedSido);

  const matchedAll = applySigungu(items3, filters.selectedSido, filters.selectedSigungu);
  const pageSize = Math.max(1, Math.min(200, Math.trunc(filters.pageSize ?? filters.limit ?? 50)));
  const cursor = Math.max(0, Math.trunc(filters.cursor ?? 0));
  const finalItems = matchedAll.slice(cursor, cursor + pageSize);
  const nextCursor = cursor + pageSize < matchedAll.length ? cursor + pageSize : null;
  const includeFacets = filters.includeFacets ?? cursor === 0;

  const truncatedByLimit = matchedAll.length > finalItems.length;
  const counts = buildScopeCounts(matchedAll);
  const pipeline = {
    snapshotUnique: items.length,
    afterTopics: items1.length,
    afterAdvancedQuery: items1q.length,
    afterScopeToggles: items2.length,
    afterSido: items3.length,
    afterSigungu: matchedAll.length,
    afterLimit: finalItems.length,
  };
  const topicReason = topicFilterBypassed
    ? "주제 필터 OFF(미선택/전체선택)"
    : `주제 필터 ON(${filters.selectedTopics.length}개, ${filters.topicMode.toUpperCase()})`;
  const queryReason = filters.query.trim() ? `고급검색 ON("${filters.query.trim()}")` : "고급검색 OFF";
  const regionReason = filters.selectedSigungu
    ? `지역=${filters.selectedSido ?? "전체"} ${filters.selectedSigungu}`
    : filters.selectedSido
      ? `지역=${filters.selectedSido}`
      : "지역=전체";
  const pipelineReason = `${topicReason}, ${queryReason}, ${regionReason} 적용 후 ${finalItems.length}개`;

  return {
    ok: true,
    data: {
      items: finalItems,
      totalMatched: matchedAll.length,
      page: {
        cursor,
        pageSize,
        nextCursor,
        hasMore: nextCursor !== null,
      },
      itemsTotalBeforeLimit: matchedAll.length,
      itemsTotalAfterQuery: items1q.length,
      itemsTotalAfterTopics: items1.length,
      itemsShown: finalItems.length,
      facets: {
        sido: includeFacets ? sidoFacets : [],
        sigungu: includeFacets ? sigunguFacets : [],
      },
      assumptions: { note: "혜택 수급 여부는 개인 조건 심사에 따라 달라집니다. 기본은 일부만 표시하며, 전체 수집은 scan=all에서 수행됩니다." },
    },
    meta: {
      ...baseMeta,
      truncatedByLimit: Boolean((baseMeta as { truncatedByLimit?: unknown }).truncatedByLimit) || truncatedByLimit,
      counts,
      countsBySido: toCountMap(sidoFacets),
      countsBySigungu: toCountMap(sigunguFacets),
      pipeline,
      pipelineReason,
      filters: {
        limit: filters.limit,
        pageSize,
        cursor,
        includeFacets,
        sido: filters.selectedSido,
        sigungu: filters.selectedSigungu,
        includeNationwide: filters.includeNationwide,
        includeUnknown: filters.includeUnknown,
        topics: topicFilterBypassed ? [] : filters.selectedTopics,
        topicMode: topicFilterBypassed ? null : filters.topicMode,
        topicsBypassed: topicFilterBypassed,
        query: filters.query,
      },
    },
  };
}
