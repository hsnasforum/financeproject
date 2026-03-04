import { z } from "zod";
import { type ScoredNewsItem } from "./contracts";
import { type DigestDay, DigestDaySchema } from "./digest/contracts";
import { assertNoRecommendationText } from "./guard/noRecommendationText";
import { type ScenarioPack, ScenarioPackSchema } from "./scenario/contracts";

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

function truncate(value: string, max = 280): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildPrompt(input: {
  digest: DigestDay;
  scenarios: ScenarioPack;
  topItems: Pick<ScoredNewsItem, "title" | "snippet" | "primaryTopicId" | "sourceId">[];
}): string {
  const context = {
    digest: {
      observation: truncate(input.digest.observation, 240),
      counterSignals: input.digest.counterSignals.map((line) => truncate(line, 140)).slice(0, 6),
    },
    scenarios: input.scenarios.cards.map((card) => ({
      name: card.name,
      observation: truncate(card.observation, 240),
      invalidation: card.invalidation.map((line) => truncate(line, 140)).slice(0, 3),
      options: card.options.map((line) => truncate(line, 140)).slice(0, 3),
      linkedTopics: card.linkedTopics.slice(0, 3),
    })),
    evidence: input.topItems.slice(0, 6).map((item) => ({
      title: truncate(item.title, 160),
      snippet: truncate(asString(item.snippet), 200),
      topicId: asString(item.primaryTopicId),
      sourceId: asString(item.sourceId),
    })),
  };

  return [
    "You are rewriting short Korean planning texts for clarity.",
    "Rules:",
    "- Use ONLY the given summary/evidence context.",
    "- Never provide investment recommendations or imperative language.",
    "- Keep conditional and neutral wording.",
    "- Keep arrays concise.",
    "- Output JSON only.",
    "",
    "Target JSON schema:",
    "{\"digest\":{\"observation\":\"...\",\"counterSignals\":[\"...\",\"...\"]},\"scenarios\":[{\"name\":\"Base|Bull|Bear\",\"observation\":\"...\",\"invalidation\":[\"...\"],\"options\":[\"...\"]}]}",
    "",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
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
  const digest = DigestDaySchema.parse({
    ...input.digest,
    observation: asString(input.rewrite.digest?.observation) || input.digest.observation,
    counterSignals: (input.rewrite.digest?.counterSignals ?? input.digest.counterSignals)
      .map((line) => asString(line))
      .filter(Boolean)
      .slice(0, 6),
  });

  const rewriteByName = new Map(
    (input.rewrite.scenarios ?? []).map((row) => [row.name, row] as const),
  );

  const scenarios = ScenarioPackSchema.parse({
    ...input.scenarios,
    cards: input.scenarios.cards.map((card) => {
      const rewrite = rewriteByName.get(card.name);
      if (!rewrite) return card;
      return {
        ...card,
        observation: asString(rewrite.observation) || card.observation,
        invalidation: (rewrite.invalidation ?? card.invalidation)
          .map((line) => asString(line))
          .filter(Boolean)
          .slice(0, 3),
        options: (rewrite.options ?? card.options)
          .map((line) => asString(line))
          .filter(Boolean)
          .slice(0, 3),
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
