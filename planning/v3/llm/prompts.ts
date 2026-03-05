export const V3_NEWS_LLM_PROMPT_VERSION = "v1";

export const V3_NEWS_LLM_SYSTEM_RULES = [
  "You are rewriting short Korean planning texts for clarity.",
  "Use ONLY the given summary/evidence context.",
  "Never provide investment recommendations or imperative language.",
  "Keep wording conditional and neutral.",
  "Keep all sentences short.",
  "Output JSON only.",
] as const;

export const V3_NEWS_LLM_OUTPUT_SCHEMA_HINT =
  "{\"digest\":{\"observation\":\"...\",\"counterSignals\":[\"...\",\"...\"]},\"scenarios\":[{\"name\":\"Base|Bull|Bear\",\"observation\":\"...\",\"invalidation\":[\"...\"],\"options\":[\"...\"]}]}";

export type NewsRewritePromptInput = {
  digest: {
    observation: string;
    counterSignals: string[];
  };
  scenarios: Array<{
    name: "Base" | "Bull" | "Bear";
    observation: string;
    invalidation: string[];
    options: string[];
    linkedTopics: string[];
  }>;
  evidence: Array<{
    title: string;
    snippet: string;
    topicId: string;
    sourceId: string;
  }>;
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncate(value: string, max: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1))}…`;
}

export function buildNewsRewritePrompt(input: NewsRewritePromptInput): string {
  const context = {
    promptVersion: V3_NEWS_LLM_PROMPT_VERSION,
    digest: {
      observation: truncate(input.digest.observation, 240),
      counterSignals: input.digest.counterSignals.map((line) => truncate(line, 140)).slice(0, 6),
    },
    scenarios: input.scenarios.map((card) => ({
      name: card.name,
      observation: truncate(card.observation, 240),
      invalidation: card.invalidation.map((line) => truncate(line, 140)).slice(0, 3),
      options: card.options.map((line) => truncate(line, 140)).slice(0, 3),
      linkedTopics: card.linkedTopics.slice(0, 3),
    })),
    evidence: input.evidence.slice(0, 6).map((item) => ({
      title: truncate(item.title, 160),
      snippet: truncate(item.snippet, 200),
      topicId: truncate(item.topicId, 60),
      sourceId: truncate(item.sourceId, 60),
    })),
  };

  return [
    ...V3_NEWS_LLM_SYSTEM_RULES,
    "",
    "Target JSON schema:",
    V3_NEWS_LLM_OUTPUT_SCHEMA_HINT,
    "",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
}
