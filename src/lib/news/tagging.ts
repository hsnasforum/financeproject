import { tokenizeText } from "./dedupe.ts";
import {
  type NewsItem,
  type NewsTopicDefinition,
  type NewsTopicDictionary,
  type NewsTopicTag,
  type TaggedNewsItem,
} from "./types.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function normalizeTopic(input: NewsTopicDefinition): NewsTopicDefinition {
  return {
    id: asString(input.id),
    label: asString(input.label),
    keywords: asArray(input.keywords),
    entities: asArray(input.entities),
    watchVariables: asArray(input.watchVariables),
    counterSignals: asArray(input.counterSignals),
  };
}

function normalizeDictionary(input: NewsTopicDictionary): NewsTopicDictionary {
  const topics = Array.isArray(input.topics)
    ? input.topics.map(normalizeTopic).filter((topic) => topic.id && topic.label)
    : [];

  const fallbackId = asString(input.fallbackTopic?.id) || "general";
  const fallbackLabel = asString(input.fallbackTopic?.label) || "일반";
  return {
    ...input,
    topics,
    fallbackTopic: {
      id: fallbackId,
      label: fallbackLabel,
      watchVariables: asArray(input.fallbackTopic?.watchVariables),
      counterSignals: asArray(input.fallbackTopic?.counterSignals),
    },
    stopwords: asArray(input.stopwords).map((word) => word.toLowerCase()),
  };
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function inverseDocumentFrequency(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docs) {
    const uniq = new Set(tokens);
    for (const token of uniq) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const n = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [token, freq] of df.entries()) {
    const value = Math.log((n + 1) / (freq + 1)) + 1;
    idf.set(token, Math.round(value * 10000) / 10000);
  }
  return idf;
}

function matchTerms(input: string, terms: string[]): string[] {
  const normalized = input.toLowerCase();
  const matched = terms
    .map((term) => asString(term).toLowerCase())
    .filter(Boolean)
    .filter((term) => normalized.includes(term));
  return [...new Set(matched)].sort((a, b) => a.localeCompare(b));
}

function buildTopicTag(args: {
  titleDesc: string;
  tf: Map<string, number>;
  idf: Map<string, number>;
  topic: NewsTopicDefinition;
}): NewsTopicTag {
  const keywordMatches = matchTerms(args.titleDesc, args.topic.keywords);
  const entityMatches = matchTerms(args.titleDesc, args.topic.entities);

  let tfidfBoost = 0;
  const boostingTerms = [...keywordMatches, ...entityMatches];
  for (const term of boostingTerms) {
    const tfValue = args.tf.get(term) ?? 0;
    const idfValue = args.idf.get(term) ?? 0;
    tfidfBoost += tfValue * idfValue;
  }
  tfidfBoost = Math.round(tfidfBoost * 100) / 100;

  const score = keywordMatches.length * 2 + entityMatches.length * 3 + Math.min(5, tfidfBoost);

  return {
    topicId: args.topic.id,
    topicLabel: args.topic.label,
    score: Math.round(score * 100) / 100,
    keywordMatches,
    entityMatches,
    tfidfBoost,
  };
}

function compareTag(a: NewsTopicTag, b: NewsTopicTag): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.topicLabel !== b.topicLabel) return a.topicLabel.localeCompare(b.topicLabel);
  return a.topicId.localeCompare(b.topicId);
}

export function tagNewsItems(items: NewsItem[], dictionaryInput: NewsTopicDictionary): TaggedNewsItem[] {
  const dictionary = normalizeDictionary(dictionaryInput);
  const stopwords = new Set((dictionary.stopwords ?? []).map((word) => word.toLowerCase()));
  const docs = items.map((item) => tokenizeText(`${item.title} ${item.snippet || item.description || ""}`.toLowerCase(), stopwords));
  const idf = inverseDocumentFrequency(docs);

  const tagged: TaggedNewsItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const tokens = docs[index] ?? [];
    const tf = termFrequency(tokens);
    const titleDesc = `${item.title} ${item.snippet || item.description || ""}`.toLowerCase();

    const topicTags = dictionary.topics
      .map((topic) => buildTopicTag({
        titleDesc,
        tf,
        idf,
        topic,
      }))
      .filter((topic) => topic.score > 0)
      .sort(compareTag);

    const primary = topicTags[0] ?? {
      topicId: dictionary.fallbackTopic.id,
      topicLabel: dictionary.fallbackTopic.label,
      score: 0,
      keywordMatches: [],
      entityMatches: [],
      tfidfBoost: 0,
    };

    tagged.push({
      ...item,
      tokens,
      tags: topicTags,
      primaryTopicId: primary.topicId,
      primaryTopicLabel: primary.topicLabel,
      primaryTopicScore: primary.score,
    });
  }

  return tagged;
}
