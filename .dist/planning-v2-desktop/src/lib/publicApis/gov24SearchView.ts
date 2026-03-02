import { type BenefitCandidate } from "./contracts/types";
import { buildBenefitsSearchPayload } from "./benefitsSearchView";

export function buildGov24SearchPayload(
  items: BenefitCandidate[],
  params: { query: string; cursor: number; pageSize: number },
  baseMeta: Record<string, unknown>,
) {
  return buildBenefitsSearchPayload(
    items,
    {
      query: params.query,
      cursor: params.cursor,
      pageSize: params.pageSize,
      includeFacets: params.cursor === 0,
      selectedSido: null,
      selectedSigungu: null,
      includeNationwide: true,
      includeUnknown: true,
      selectedTopics: [],
      topicMode: "or",
    },
    baseMeta,
  );
}

