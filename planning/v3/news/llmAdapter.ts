import { z } from "zod";
import { type ScoredNewsItem } from "./contracts";
import { type DigestDay, DigestDaySchema } from "./digest/contracts";
import { assertNoRecommendationText } from "./guard/noRecommendationText";
import { type ScenarioPack, ScenarioPackSchema } from "./scenario/contracts";
import { buildNewsRewritePrompt } from "../llm/prompts";

const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_ENDPOINT_PATH = "/api/generate";
const DEFAULT_TIMEOUT_MS = 4_000;

const LoopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const LlmGenerateResponseSchema = z.object({
  response: z.string().optional(),
  message: z.object({
    content: z.string().optional(),
  }).optional(),
  output_text: z.string().optional(),
});

const LlmRewritePayloadSchema = z.object({
  digest: z.object({
    observation: z.string().trim().min(1).optional(),
    counterSignals: z.array(z.string().trim().min(1)).max(6).optional(),
  }).optional(),
  scenarios: z.array(z.object({
    name: z.enum(["Base", "Bull", "Bear"]),
    observation: z.string().trim().min(1).optional(),
    invalidation: z.array(z.string().trim().min(1)).min(1).max(3).optional(),
    options: z.array(z.string().trim().min(1)).min(1).max(3).optional(),
  })).max(3).optional(),
});

const CONDITIONAL_CUE_PATTERN = /(조건부|가능|가정|경우|완화|확대|유지|변동|관측|추정)/;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/g;

type LlmMode = {
  enabled: boolean;
  model: string;
  endpointUrl: string;
  timeoutMs: number;
  reason?: string;
};

export type LlmRewriteResult = {
  digest: DigestDay;
  scenarios: ScenarioPack;
  applied: boolean;
  reason: string;
};

type RewriteInput = {
  digest: DigestDay;
  scenarios: ScenarioPack;
  topItems: Pick<ScoredNewsItem, "title" | "snippet" | "primaryTopicId" | "sourceId">[];
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function toSafeTimeoutMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(20_000, Math.round(parsed)));
}

function isLoopbackHostname(hostname: string): boolean {
  return LoopbackHosts.has(hostname.trim().toLowerCase());
}

function resolveMode(env: NodeJS.ProcessEnv): LlmMode {
  const enabled = asBoolean(env.V3_NEWS_LOCAL_LLM_ENABLED);
  if (!enabled) {
    return {
      enabled: false,
      model: "",
      endpointUrl: "",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      reason: "disabled",
    };
  }

  const model = asString(env.V3_NEWS_LOCAL_LLM_MODEL);
  if (!model) {
    return {
      enabled: false,
      model: "",
      endpointUrl: "",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      reason: "model_missing",
    };
  }

  const baseUrlRaw = asString(env.V3_NEWS_LOCAL_LLM_BASE_URL) || DEFAULT_LOCAL_BASE_URL;
  const endpointPathRaw = asString(env.V3_NEWS_LOCAL_LLM_ENDPOINT_PATH) || DEFAULT_ENDPOINT_PATH;
  const timeoutMs = toSafeTimeoutMs(env.V3_NEWS_LOCAL_LLM_TIMEOUT_MS);

  let endpointUrl: string;
  try {
    const endpoint = new URL(endpointPathRaw, baseUrlRaw);
    if (!isLoopbackHostname(endpoint.hostname)) {
      return {
        enabled: false,
        model,
        endpointUrl: "",
        timeoutMs,
        reason: "non_localhost_endpoint",
      };
    }
    endpointUrl = endpoint.toString();
  } catch {
    return {
      enabled: false,
      model,
      endpointUrl: "",
      timeoutMs,
      reason: "invalid_endpoint",
    };
  }

  return {
    enabled: true,
    model,
    endpointUrl,
    timeoutMs,
    reason: "enabled",
  };
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncate(value: string, max = 280): string {
  const text = normalizeWhitespace(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function stripUnsafeTextArtifacts(value: string): string {
  const withoutLinks = value.replace(MARKDOWN_LINK_PATTERN, "");
  const withoutQuotes = withoutLinks.replace(/[`*_#>|]/g, " ");
  return normalizeWhitespace(withoutQuotes);
}

function ensureConditionalTone(value: string): string {
  if (!value) return value;
  if (CONDITIONAL_CUE_PATTERN.test(value)) return value;
  return `조건부 가능성: ${value}`;
}

function sanitizeShortConditionalText(value: unknown, max: number): string {
  const cleaned = stripUnsafeTextArtifacts(asString(value));
  if (!cleaned) return "";
  const conditional = ensureConditionalTone(cleaned);
  return truncate(conditional, max);
}

function sanitizeTextList(values: unknown[] | undefined, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => sanitizeShortConditionalText(value, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildPrompt(input: {
  digest: DigestDay;
  scenarios: ScenarioPack;
  topItems: Pick<ScoredNewsItem, "title" | "snippet" | "primaryTopicId" | "sourceId">[];
}): string {
  return buildNewsRewritePrompt({
    digest: {
      observation: input.digest.observation,
      counterSignals: input.digest.counterSignals,
    },
    scenarios: input.scenarios.cards.map((card) => ({
      name: card.name,
      observation: card.observation,
      invalidation: card.invalidation,
      options: card.options,
      linkedTopics: card.linkedTopics,
    })),
    evidence: input.topItems.map((item) => ({
      title: item.title,
      snippet: asString(item.snippet),
      topicId: asString(item.primaryTopicId),
      sourceId: asString(item.sourceId),
    })),
  });
}

function extractTextPayload(raw: unknown): string {
  const parsed = LlmGenerateResponseSchema.safeParse(raw);
  if (!parsed.success) return "";
  return asString(parsed.data.response)
    || asString(parsed.data.message?.content)
    || asString(parsed.data.output_text);
}

function collectPolicyTexts(input: { digest: DigestDay; scenarios: ScenarioPack }): string[] {
  const out: string[] = [input.digest.observation, ...input.digest.counterSignals];
  for (const card of input.scenarios.cards) {
    out.push(card.observation, ...card.options, ...card.invalidation);
  }
  return out;
}

function applyRewrite(input: {
  digest: DigestDay;
  scenarios: ScenarioPack;
  rewrite: z.infer<typeof LlmRewritePayloadSchema>;
}): { digest: DigestDay; scenarios: ScenarioPack } {
  const sanitizedObservation = sanitizeShortConditionalText(input.rewrite.digest?.observation, 220);
  const sanitizedCounterSignals = sanitizeTextList(input.rewrite.digest?.counterSignals, 6, 140);
  const digest = DigestDaySchema.parse({
    ...input.digest,
    observation: sanitizedObservation || input.digest.observation,
    counterSignals: sanitizedCounterSignals.length > 0 ? sanitizedCounterSignals : input.digest.counterSignals,
  });

  const rewriteByName = new Map(
    (input.rewrite.scenarios ?? []).map((row) => [row.name, row] as const),
  );

  const scenarios = ScenarioPackSchema.parse({
    ...input.scenarios,
    cards: input.scenarios.cards.map((card) => {
      const rewrite = rewriteByName.get(card.name);
      if (!rewrite) return card;
      const sanitizedScenarioObservation = sanitizeShortConditionalText(rewrite.observation, 220);
      const sanitizedInvalidation = sanitizeTextList(rewrite.invalidation, 3, 140);
      const sanitizedOptions = sanitizeTextList(rewrite.options, 3, 140);
      return {
        ...card,
        observation: sanitizedScenarioObservation || card.observation,
        invalidation: sanitizedInvalidation.length > 0 ? sanitizedInvalidation : card.invalidation,
        options: sanitizedOptions.length > 0 ? sanitizedOptions : card.options,
      };
    }),
  });

  return { digest, scenarios };
}

export async function rewriteDigestScenarioTextWithLocalLlm(input: RewriteInput): Promise<LlmRewriteResult> {
  const env = input.env ?? process.env;
  const mode = resolveMode(env);
  if (!mode.enabled) {
    return {
      digest: input.digest,
      scenarios: input.scenarios,
      applied: false,
      reason: mode.reason ?? "disabled",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mode.timeoutMs);

  try {
    const response = await fetchImpl(mode.endpointUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: mode.model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        prompt: buildPrompt({
          digest: input.digest,
          scenarios: input.scenarios,
          topItems: input.topItems,
        }),
      }),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      return {
        digest: input.digest,
        scenarios: input.scenarios,
        applied: false,
        reason: "llm_http_error",
      };
    }

    const raw = await response.json().catch(() => null);
    const textPayload = extractTextPayload(raw);
    if (!textPayload) {
      return {
        digest: input.digest,
        scenarios: input.scenarios,
        applied: false,
        reason: "llm_empty",
      };
    }

    let parsedPayload: unknown = null;
    try {
      parsedPayload = JSON.parse(textPayload);
    } catch {
      return {
        digest: input.digest,
        scenarios: input.scenarios,
        applied: false,
        reason: "llm_json_parse_failed",
      };
    }

    const parsed = LlmRewritePayloadSchema.safeParse(parsedPayload);
    if (!parsed.success) {
      return {
        digest: input.digest,
        scenarios: input.scenarios,
        applied: false,
        reason: "llm_schema_mismatch",
      };
    }

    const rewritten = applyRewrite({
      digest: input.digest,
      scenarios: input.scenarios,
      rewrite: parsed.data,
    });

    try {
      assertNoRecommendationText(collectPolicyTexts(rewritten));
    } catch {
      return {
        digest: input.digest,
        scenarios: input.scenarios,
        applied: false,
        reason: "llm_guard_rejected",
      };
    }

    return {
      digest: rewritten.digest,
      scenarios: rewritten.scenarios,
      applied: true,
      reason: "llm_applied",
    };
  } catch {
    return {
      digest: input.digest,
      scenarios: input.scenarios,
      applied: false,
      reason: "llm_unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}
