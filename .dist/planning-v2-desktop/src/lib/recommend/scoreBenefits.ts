import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import { BENEFIT_TOPICS, isTopicFilterBypassed, type BenefitTopicKey } from "../publicApis/benefitsTopics";

export type BenefitRecommendProfile = {
  topics?: BenefitTopicKey[];
  query?: string;
  categories?: string[];
  keywords?: string;
  sido?: string;
  sigungu?: string;
  includeNationwide: boolean;
  includeUnknown: boolean;
  topN: number;
};

export type BenefitScoreExplain = {
  maxPoints: 100;
  finalPoints: number;
  why: {
    summary: string;
    bullets: string[];
    badges?: string[];
  };
  contributions: {
    regionPoints: number;
    topicPoints: number;
    queryPoints: number;
    richnessPoints: number;
  };
  matched: {
    region: string;
    topics: string[];
    queryTokens: string[];
  };
  weights: {
    region: number;
    topic: number;
    query: number;
    richness: number;
  };
  assumptions: {
    relativeScore: true;
    note: string;
  };
  debug?: {
    contributions: {
      regionPoints: number;
      topicPoints: number;
      queryPoints: number;
      richnessPoints: number;
    };
    weights: {
      region: number;
      topic: number;
      query: number;
      richness: number;
    };
    matched: {
      region: string;
      topics: string[];
      queryTokens: string[];
    };
  };
};

export type ScoredBenefit = {
  item: BenefitCandidate;
  explain: BenefitScoreExplain;
};

const WEIGHTS = {
  region: 35,
  topic: 35,
  query: 20,
  richness: 10,
} as const;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length >= 2);
}

function buildItemText(item: BenefitCandidate): string {
  return normalizeText([
    item.title,
    item.summary,
    item.org,
    item.applyHow,
    ...(item.eligibilityHints ?? []),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(" "));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function regionLabel(item: BenefitCandidate, profile: BenefitRecommendProfile): string {
  if (item.region.scope === "REGIONAL") {
    if (profile.sido && profile.sigungu) return `${profile.sido} ${profile.sigungu} 기준`;
    if (profile.sido) return `${profile.sido} 기준`;
    return "지역 일반";
  }
  if (item.region.scope === "NATIONWIDE") return "전국";
  return "지역 미상";
}

function getRegionScore(item: BenefitCandidate, profile: BenefitRecommendProfile): { points: number; matched: string } {
  const hasSido = Boolean(profile.sido);
  const hasSigungu = Boolean(profile.sigungu);
  const tags = item.region.tags ?? [];

  if (item.region.scope === "REGIONAL") {
    if (hasSigungu && profile.sido && tags.includes(`${profile.sido} ${profile.sigungu}`)) {
      return { points: WEIGHTS.region, matched: `${profile.sido} ${profile.sigungu} 일치` };
    }
    if (hasSigungu && profile.sigungu && tags.includes(profile.sigungu)) {
      return { points: 30, matched: `${profile.sigungu} 일치` };
    }
    if (hasSido && profile.sido && tags.includes(profile.sido)) {
      return { points: 24, matched: `${profile.sido} 일치` };
    }
    if (!hasSido && !hasSigungu) {
      return { points: 18, matched: "지역 제한 없음" };
    }
    return { points: 6, matched: "지역 부분 일치" };
  }

  if (item.region.scope === "NATIONWIDE") {
    if (!profile.includeNationwide) return { points: 0, matched: "전국 제외" };
    return { points: hasSido || hasSigungu ? 12 : 16, matched: "전국" };
  }

  if (!profile.includeUnknown) return { points: 0, matched: "미상 제외" };
  return { points: 4, matched: "미상" };
}

function getTopicScore(item: BenefitCandidate, itemText: string, topics: BenefitTopicKey[]): { points: number; matched: string[] } {
  if (!topics.length) return { points: 0, matched: [] };
  const matched = new Set<string>();
  for (const topic of topics) {
    const topicConfig = BENEFIT_TOPICS[topic];
    if (!topicConfig) continue;
    const hasTopicMatch = (item.topicMatch?.matchedTopics ?? []).includes(topic);
    if (hasTopicMatch || topicConfig.synonyms.some((synonym) => itemText.includes(normalizeText(synonym)))) {
      matched.add(topicConfig.label);
    }
  }
  if (matched.size === 0) return { points: 0, matched: [] };
  const unit = WEIGHTS.topic / Math.max(topics.length, 1);
  return { points: Math.min(WEIGHTS.topic, matched.size * unit), matched: [...matched] };
}

function getQueryScore(itemText: string, query: string): { points: number; matched: string[] } {
  const tokens = tokenize(query);
  if (!tokens.length) return { points: 0, matched: [] };
  const matched = tokens.filter((token) => itemText.includes(token));
  if (!matched.length) return { points: 0, matched: [] };
  const unit = WEIGHTS.query / tokens.length;
  return { points: Math.min(WEIGHTS.query, matched.length * unit), matched };
}

function getRichnessScore(item: BenefitCandidate): number {
  let points = 0;
  const hintCount = item.eligibilityHints?.length ?? 0;
  if (hintCount >= 3) points += 4;
  else if (hintCount > 0) points += 2;

  if ((item.summary ?? "").trim().length >= 30) points += 3;
  if ((item.applyHow ?? "").trim().length > 0) points += 2;
  if ((item.org ?? "").trim().length > 0) points += 1;

  return Math.min(WEIGHTS.richness, points);
}

export function scoreBenefits(items: BenefitCandidate[], profile: BenefitRecommendProfile): ScoredBenefit[] {
  const selectedTopicsRaw = profile.topics ?? [];
  const selectedTopics = isTopicFilterBypassed(selectedTopicsRaw) ? [] : selectedTopicsRaw;
  const query = profile.query ?? profile.keywords ?? "";
  const scored = items.map((item) => {
    const itemText = buildItemText(item);
    const region = getRegionScore(item, profile);
    const topic = getTopicScore(item, itemText, selectedTopics);
    const queryScore = getQueryScore(itemText, query);
    const richness = getRichnessScore(item);

    const finalPoints = round1(Math.min(100, region.points + topic.points + queryScore.points + richness));
    const hintCount = item.eligibilityHints?.length ?? 0;
    const bullets: string[] = [];

    if (item.region.scope === "REGIONAL") {
      if (profile.sido && profile.sigungu) {
        bullets.push(`선택한 지역(${profile.sido} ${profile.sigungu})과의 일치 여부를 우선 반영했습니다.`);
      } else if (profile.sido) {
        bullets.push(`선택한 시/도(${profile.sido}) 범위에 포함되는 항목입니다.`);
      } else {
        bullets.push("지역 제한 조건 없이 비교 가능한 항목입니다.");
      }
    } else if (item.region.scope === "NATIONWIDE") {
      bullets.push("전국 대상(지역 제한 없음)으로 선택 지역과 무관하게 검토 가능합니다.");
    } else {
      bullets.push("지역 정보가 부족(미상)하지만 조건/내용 기준으로 후보에 포함했습니다.");
    }

    if (topic.matched.length > 0) {
      bullets.push(`주제(${topic.matched.join(", ")}) 관련 키워드가 제목/요약/조건에 포함됩니다.`);
    }
    if (queryScore.matched.length > 0) {
      bullets.push(`고급 검색(${queryScore.matched.join(", ")})이 내용에 매칭됩니다.`);
    }
    if (bullets.length < 3) {
      if (hintCount > 0 || item.applyHow || item.summary.length > 30) {
        bullets.push(`조건/신청방법 등 정보량이 비교적 충분합니다(조건 힌트 ${hintCount}개).`);
      } else {
        bullets.push("원본 제공 정보가 제한적이라 보수적으로 비교했습니다.");
      }
    }

    const matchedTopics = topic.matched.length > 0 ? topic.matched.join(", ") : "주제 일반";
    const summary = `${regionLabel(item, profile)} · ${matchedTopics} · ${item.org ?? "기관 정보 미상"}`;

    return {
      item,
      explain: {
        maxPoints: 100 as const,
        finalPoints,
        why: {
          summary,
          bullets: bullets.slice(0, 3),
          badges: ["혜택 비교"],
        },
        contributions: {
          regionPoints: round1(region.points),
          topicPoints: round1(topic.points),
          queryPoints: round1(queryScore.points),
          richnessPoints: round1(richness),
        },
        matched: {
          region: region.matched,
          topics: topic.matched,
          queryTokens: queryScore.matched,
        },
        weights: {
          region: WEIGHTS.region,
          topic: WEIGHTS.topic,
          query: WEIGHTS.query,
          richness: WEIGHTS.richness,
        },
        assumptions: {
          relativeScore: true as const,
          note: "점수는 후보군 내 매칭 품질 비교이며 실제 수급/선정 여부는 자격 심사에 따라 달라집니다.",
        },
        debug: {
          contributions: {
            regionPoints: round1(region.points),
            topicPoints: round1(topic.points),
            queryPoints: round1(queryScore.points),
            richnessPoints: round1(richness),
          },
          weights: {
            region: WEIGHTS.region,
            topic: WEIGHTS.topic,
            query: WEIGHTS.query,
            richness: WEIGHTS.richness,
          },
          matched: {
            region: region.matched,
            topics: topic.matched,
            queryTokens: queryScore.matched,
          },
        },
      },
    } satisfies ScoredBenefit;
  });

  return scored
    .sort((a, b) => b.explain.finalPoints - a.explain.finalPoints)
    .slice(0, Math.max(1, profile.topN || 5));
}
