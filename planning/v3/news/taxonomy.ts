import { NewsTopicSchema, TopicTagSchema, type NewsItem, type NewsTopic, type TopicTag } from "./contracts";

const RAW_TOPICS: NewsTopic[] = [
  {
    id: "rates",
    label: "금리/통화정책",
    keywords: ["기준금리", "금리", "금통위", "인하", "인상", "동결", "통화정책", "유동성", "긴축", "fomc", "rate", "yield"],
    entities: ["연준", "한국은행", "federal reserve"],
  },
  {
    id: "inflation",
    label: "물가/인플레이션",
    keywords: ["물가", "인플레이션", "cpi", "소비자물가", "근원", "ppi", "가격", "상승률", "안정목표"],
  },
  {
    id: "fx",
    label: "환율/대외",
    keywords: ["환율", "원화", "달러", "외환", "외환시장", "자본유출", "자본유입", "경상수지", "무역수지", "usdkrw", "dollar", "fx"],
    entities: ["usdkrw", "dxy"],
  },
  {
    id: "growth",
    label: "경기/성장",
    keywords: ["성장", "경기", "침체", "회복", "수요", "소비", "투자", "수출", "생산", "pmi", "equity", "주식", "증시"],
  },
  {
    id: "labor",
    label: "고용",
    keywords: ["고용", "실업", "취업자", "임금", "구인", "노동", "고용률"],
  },
  {
    id: "credit",
    label: "신용/금융불안",
    keywords: ["신용", "스프레드", "pf", "부도", "연체", "채권", "자금경색", "뱅크런", "bank run", "credit"],
  },
  {
    id: "commodities",
    label: "원자재/에너지",
    keywords: ["유가", "원유", "wti", "브렌트", "brent", "가스", "원자재", "곡물", "공급망", "oil"],
    entities: ["opec+"],
  },
  {
    id: "fiscal",
    label: "재정/세제",
    keywords: ["재정", "국채", "예산", "세제", "세금", "지출", "적자", "부채", "발행", "정책", "관세", "tax", "tariff", "regulation"],
    entities: ["정부", "재무부", "financial services commission", "moef"],
  },
];

export const NEWS_TOPICS: NewsTopic[] = RAW_TOPICS.map((topic) => NewsTopicSchema.parse(topic));

export const LEGACY_TOPIC_ALIAS: Record<string, string> = {
  oil: "commodities",
  policy: "fiscal",
  equity: "growth",
};

const TOPIC_BY_ID = new Map(NEWS_TOPICS.map((topic) => [topic.id, topic]));

export function canonicalizeTopicId(topicId: string): string {
  const normalized = topicId.trim().toLowerCase();
  if (!normalized) return normalized;
  return LEGACY_TOPIC_ALIAS[normalized] ?? normalized;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function tagItemTopics(item: NewsItem, topics: NewsTopic[] = NEWS_TOPICS): TopicTag[] {
  const text = normalizeText(`${item.title} ${item.snippet ?? ""}`);
  if (!text) return [];

  const out = topics
    .map((topic) => {
      const keywordHits = topic.keywords.filter((keyword) => text.includes(normalizeText(keyword)));
      const entityHits = (topic.entities ?? []).filter((entity) => text.includes(normalizeText(entity)));
      const hits = dedupe([...keywordHits, ...entityHits]);
      const canonicalTopicId = canonicalizeTopicId(topic.id);
      const canonicalTopic = TOPIC_BY_ID.get(canonicalTopicId) ?? topic;

      return TopicTagSchema.parse({
        topicId: canonicalTopic.id,
        topicLabel: canonicalTopic.label,
        keywordHits: keywordHits.length,
        entityHits: entityHits.length,
        hits,
      });
    })
    .filter((row) => row.hits.length > 0)
    .sort((a, b) => {
      if (a.hits.length !== b.hits.length) return b.hits.length - a.hits.length;
      return a.topicId.localeCompare(b.topicId);
    });

  return out;
}
