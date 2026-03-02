import { type BenefitCandidate } from "./contracts/types";
import { BENEFIT_TOPICS, type BenefitTopicKey } from "./benefitsTopics";

export type TopicEvidence = {
  topic: BenefitTopicKey;
  synonym: string;
  field: string;
};

export type TopicMatchResult = {
  matchedTopics: BenefitTopicKey[];
  evidence: TopicEvidence[];
};

const FIELD_LABELS: Record<string, string> = {
  title: "제목",
  summary: "요약",
  eligibility: "조건",
  applyHow: "신청방법",
  org: "기관",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getFieldTexts(item: BenefitCandidate): Array<{ field: string; value: string }> {
  const entries: Array<{ field: string; value: string | undefined }> = [
    { field: "title", value: item.title },
    { field: "summary", value: item.summary },
    { field: "eligibility", value: item.eligibilityText },
    { field: "eligibility", value: item.eligibilityExcerpt },
    { field: "applyHow", value: item.applyHow },
    { field: "org", value: item.org },
  ];
  for (const hint of item.eligibilityHints ?? []) {
    entries.push({ field: "eligibility", value: hint });
  }
  return entries
    .filter((entry): entry is { field: string; value: string } => Boolean(entry.value && entry.value.trim()))
    .map((entry) => ({ field: entry.field, value: normalize(entry.value) }));
}

export function matchBenefitTopics(
  item: BenefitCandidate,
  selectedTopics: BenefitTopicKey[],
): TopicMatchResult {
  if (selectedTopics.length === 0) return { matchedTopics: [], evidence: [] };

  const fieldTexts = getFieldTexts(item);
  const matchedTopics = new Set<BenefitTopicKey>();
  const evidence: TopicEvidence[] = [];

  for (const topic of selectedTopics) {
    const config = BENEFIT_TOPICS[topic];
    if (!config) continue;
    const allowedFields = new Set<string>(config.fields);

    for (const synonymRaw of config.synonyms) {
      const synonym = normalize(synonymRaw);
      for (const entry of fieldTexts) {
        if (!allowedFields.has(entry.field)) continue;
        if (!entry.value.includes(synonym)) continue;
        matchedTopics.add(topic);
        if (evidence.length < 3) {
          evidence.push({
            topic,
            synonym: synonymRaw,
            field: FIELD_LABELS[entry.field] ?? entry.field,
          });
        }
        break;
      }
      if (matchedTopics.has(topic)) break;
    }
  }

  return {
    matchedTopics: selectedTopics.filter((topic) => matchedTopics.has(topic)),
    evidence,
  };
}

export function applyTopicFilter(
  items: BenefitCandidate[],
  selectedTopics: BenefitTopicKey[],
  mode: "or" | "and" = "or",
): BenefitCandidate[] {
  if (selectedTopics.length === 0) {
    return items.map((item) => ({ ...item, topicMatch: { matchedTopics: [], evidence: [] } }));
  }

  const mapped = items.map((item) => {
    const topicMatch = matchBenefitTopics(item, selectedTopics);
    return {
      ...item,
      topicMatch,
    };
  });

  if (mode === "and") {
    return mapped.filter((item) => selectedTopics.every((topic) => item.topicMatch?.matchedTopics.includes(topic)));
  }

  return mapped.filter((item) => (item.topicMatch?.matchedTopics.length ?? 0) > 0);
}
