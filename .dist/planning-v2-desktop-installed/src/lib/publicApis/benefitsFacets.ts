import { type BenefitCandidate } from "./contracts/types";
import { SIDO_LIST, normalizeSido } from "../regions/kr";

export type RegionFacet = { key: string; count: number };

export type RegionFacets = {
  sido: RegionFacet[];
  sigungu: RegionFacet[];
};

type RegionFilterParams = {
  sido: string | null;
  sigungu: string | null;
  includeNationwide: boolean;
  includeUnknown: boolean;
};

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

function includeByScope(item: BenefitCandidate, params: Pick<RegionFilterParams, "includeNationwide" | "includeUnknown">): boolean {
  if (item.region.scope === "NATIONWIDE") return params.includeNationwide;
  if (item.region.scope === "UNKNOWN") return params.includeUnknown;
  return true;
}

function matchSido(item: BenefitCandidate, sido: string | null): boolean {
  if (!sido) return true;
  if (item.region.scope !== "REGIONAL") return true;
  const tags = item.region.tags ?? [];
  return tags.includes(sido);
}

function matchSigungu(item: BenefitCandidate, sido: string | null, sigungu: string | null): boolean {
  if (!sigungu) return true;
  if (item.region.scope !== "REGIONAL") return true;
  const tags = item.region.tags ?? [];
  if (sido && tags.includes(`${sido} ${sigungu}`)) return true;
  return tags.includes(sigungu);
}

export function buildBenefitsRegionView(items: BenefitCandidate[], params: RegionFilterParams): {
  baseItems: BenefitCandidate[];
  itemsAfterSido: BenefitCandidate[];
  finalItems: BenefitCandidate[];
  facets: RegionFacets;
} {
  const baseItems = items.filter((item) => includeByScope(item, params));
  const itemsAfterSido = baseItems.filter((item) => matchSido(item, params.sido));
  const finalItems = itemsAfterSido.filter((item) => matchSigungu(item, params.sido, params.sigungu));

  const sidoCounts = new Map<string, number>();
  for (const item of baseItems) {
    if (item.region.scope !== "REGIONAL") continue;
    const rawSido = item.region.sido ?? item.region.tags.find((tag) => Boolean(normalizeSido(tag)));
    const key = rawSido ? normalizeSido(rawSido) : null;
    if (!key) continue;
    sidoCounts.set(key, (sidoCounts.get(key) ?? 0) + 1);
  }

  const sigunguCounts = new Map<string, number>();
  if (params.sido) {
    for (const item of itemsAfterSido) {
      if (item.region.scope !== "REGIONAL") continue;
      for (const tag of item.region.tags ?? []) {
        if (!tag.startsWith(`${params.sido} `)) continue;
        const sigungu = tag.slice(params.sido.length + 1).trim();
        if (!sigungu || !/[시군구]$/.test(sigungu)) continue;
        if (sigungu === `${params.sido}시` || sigungu === `${params.sido}도`) continue;
        if (SIGUNGU_BLACKLIST.has(sigungu)) continue;
        sigunguCounts.set(sigungu, (sigunguCounts.get(sigungu) ?? 0) + 1);
      }
    }
  }

  return {
    baseItems,
    itemsAfterSido,
    finalItems,
    facets: {
      sido: SIDO_LIST.map((key) => ({ key, count: sidoCounts.get(key) ?? 0 })),
      sigungu: params.sido
        ? [...sigunguCounts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key, "ko"))
        : [],
    },
  };
}
