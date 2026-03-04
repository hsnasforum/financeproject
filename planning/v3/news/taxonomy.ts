import { NewsTopicSchema, TopicTagSchema, type NewsItem, type NewsTopic, type TopicTag } from "./contracts";

const RAW_TOPICS: NewsTopic[] = [
  {
    id: "rates",
    label: "금리",
    keywords: ["금리", "기준금리", "fomc", "fed", "rate", "yield"],
    entities: ["연준", "한국은행", "federal reserve"],
  },
  {
    id: "fx",
    label: "환율",
    keywords: ["환율", "원달러", "달러", "dollar", "fx"],
    entities: ["usdkrw", "dxy"],
  },
  {
    id: "oil",
    label: "유가",
    keywords: ["유가", "원유", "wti", "brent", "opec", "oil"],
    entities: ["opec+"],
  },
  {
    id: "equity",
    label: "주식시장",
    keywords: ["주식", "증시", "코스피", "코스닥", "s&p", "nasdaq", "equity"],
    entities: ["kospi", "kosdaq", "s&p500"],
  },
  {
    id: "policy",
    label: "정책/규제",
    keywords: ["정책", "규제", "관세", "법안", "tax", "tariff", "regulation"],
    entities: ["정부", "재무부", "financial services commission"],
  },
];

export const NEWS_TOPICS: NewsTopic[] = RAW_TOPICS.map((topic) => NewsTopicSchema.parse(topic));

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
      return TopicTagSchema.parse({
        topicId: topic.id,
        topicLabel: topic.label,
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
