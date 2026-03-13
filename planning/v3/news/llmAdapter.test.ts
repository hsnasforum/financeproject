import { describe, expect, it, vi } from "vitest";
import { type ScoredNewsItem } from "./contracts";
import { type DigestDay } from "./digest/contracts";
import { type ScenarioPack } from "./scenario/contracts";
import { rewriteDigestScenarioTextWithLocalLlm } from "./llmAdapter";
import { buildNewsRewritePrompt } from "../llm/prompts";

function makeDigest(): DigestDay {
  return {
    schemaVersion: 1,
    date: "2026-03-05",
    observation: "관찰: 금리 관련 토픽의 비중이 확대되는 흐름입니다.",
    evidence: [
      {
        title: "기준금리 동결 발표",
        url: "https://example.com/a",
        sourceId: "fixture",
        publishedAt: "2026-03-05T00:00:00.000Z",
        topics: ["rates"],
      },
      {
        title: "환율 변동성 점검",
        url: "https://example.com/b",
        sourceId: "fixture",
        publishedAt: "2026-03-05T01:00:00.000Z",
        topics: ["fx"],
      },
    ],
    watchlist: ["기준금리", "USDKRW"],
    counterSignals: ["원자재 가격 안정 시 신호가 약화될 수 있습니다."],
  };
}

function makeScenarios(): ScenarioPack {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-05T02:00:00.000Z",
    cards: [
      {
        name: "Base",
        observation: "현재 신호가 유지되는 경로입니다.",
        triggers: [{ kind: "topicBurst", topicId: "rates", condition: "med", note: "금리 토픽 강도" }],
        invalidation: ["금리 토픽 강도가 낮아지면 경로가 약화됩니다."],
        indicators: ["rates"],
        options: ["지표 관찰 주기를 유지합니다."],
        linkedTopics: ["rates"],
      },
      {
        name: "Bull",
        observation: "신호가 완화되는 경로입니다.",
        triggers: [{ kind: "topicBurst", topicId: "rates", condition: "low", note: "금리 토픽 강도" }],
        invalidation: ["금리 토픽 강도가 다시 확대되면 경로가 약화됩니다."],
        indicators: ["rates"],
        options: ["완화 신호와 반대 지표를 병행 관찰합니다."],
        linkedTopics: ["rates"],
      },
      {
        name: "Bear",
        observation: "신호가 강화되는 경로입니다.",
        triggers: [{ kind: "topicBurst", topicId: "rates", condition: "high", note: "금리 토픽 강도" }],
        invalidation: ["금리 토픽 강도가 완화되면 경로가 약화됩니다."],
        indicators: ["rates"],
        options: ["변동성 확대 여부를 우선 관찰합니다."],
        linkedTopics: ["rates"],
      },
    ],
  };
}

function makeTopItems(): Pick<ScoredNewsItem, "title" | "snippet" | "primaryTopicId" | "sourceId">[] {
  return [
    {
      title: "기준금리 동결 발표",
      snippet: "금리 동결 기조를 유지한다는 내용입니다.",
      primaryTopicId: "rates",
      sourceId: "fixture",
    },
    {
      title: "환율 변동성 점검",
      snippet: "외환 시장 변동성 확대 가능성을 점검합니다.",
      primaryTopicId: "fx",
      sourceId: "fixture",
    },
  ];
}

describe("planning v3 news local llm adapter", () => {
  it("uses SSOT prompt builder for local rewrite requests", () => {
    const prompt = buildNewsRewritePrompt({
      digest: {
        observation: "관찰: 금리 신호를 조건부로 점검합니다.",
        counterSignals: ["반대 흐름도 병행 확인합니다."],
      },
      scenarios: [
        {
          name: "Base",
          observation: "현재 신호가 유지되는 가정입니다.",
          invalidation: ["신호가 완화되면 경로가 약화될 수 있습니다."],
          options: ["관찰 지표를 병행 확인합니다."],
          linkedTopics: ["rates"],
        },
      ],
      evidence: [
        {
          title: "기준금리 동결 발표",
          snippet: "금리 동결 흐름을 유지합니다.",
          topicId: "rates",
          sourceId: "fixture",
        },
      ],
    });

    expect(prompt).toContain("Target JSON schema");
    expect(prompt).toContain("Context JSON:");
    expect(prompt).toContain("\"promptVersion\":\"v1\"");
  });

  it("is off by default and keeps deterministic template output", async () => {
    const fetchMock = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
    const digest = makeDigest();
    const scenarios = makeScenarios();
    const result = await rewriteDigestScenarioTextWithLocalLlm({
      digest,
      scenarios,
      topItems: makeTopItems(),
      fetchImpl: fetchMock,
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(result.digest).toEqual(digest);
    expect(result.scenarios).toEqual(scenarios);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks non-localhost endpoint even when enabled", async () => {
    const fetchMock = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
    const result = await rewriteDigestScenarioTextWithLocalLlm({
      digest: makeDigest(),
      scenarios: makeScenarios(),
      topItems: makeTopItems(),
      fetchImpl: fetchMock,
      env: {
        NODE_ENV: "test",
        V3_NEWS_LOCAL_LLM_ENABLED: "1",
        V3_NEWS_LOCAL_LLM_MODEL: "local-model",
        V3_NEWS_LOCAL_LLM_BASE_URL: "https://example.com",
      } as NodeJS.ProcessEnv,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("non_localhost_endpoint");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rewrites digest/scenario text from localhost response", async () => {
    const responsePayload = {
      digest: {
        observation: "관찰: 금리 토픽과 환율 토픽의 동조 여부를 조건부로 점검합니다.",
        counterSignals: ["환율 변동성이 완화되면 현재 신호의 강도는 약화될 수 있습니다."],
      },
      scenarios: [
        {
          name: "Base",
          observation: "현재 신호가 이어진다는 가정의 경로입니다.",
          invalidation: ["금리 토픽 강도가 하향되면 가정이 약화될 수 있습니다."],
          options: ["핵심 지표를 병행 관찰하는 옵션을 유지합니다."],
        },
      ],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      response: JSON.stringify(responsePayload),
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await rewriteDigestScenarioTextWithLocalLlm({
      digest: makeDigest(),
      scenarios: makeScenarios(),
      topItems: makeTopItems(),
      fetchImpl: fetchMock,
      env: {
        NODE_ENV: "test",
        V3_NEWS_LOCAL_LLM_ENABLED: "1",
        V3_NEWS_LOCAL_LLM_MODEL: "local-model",
        V3_NEWS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434",
      } as NodeJS.ProcessEnv,
    });

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("llm_applied");
    expect(result.digest.observation).toContain("조건부");
    expect(result.scenarios.cards[0]?.observation).toContain("가정");
  });

  it("falls back to deterministic text when output violates language guard", async () => {
    const digest = makeDigest();
    const scenarios = makeScenarios();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      response: JSON.stringify({
        digest: {
          observation: "매수 타이밍입니다.",
        },
      }),
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await rewriteDigestScenarioTextWithLocalLlm({
      digest,
      scenarios,
      topItems: makeTopItems(),
      fetchImpl: fetchMock,
      env: {
        NODE_ENV: "test",
        V3_NEWS_LOCAL_LLM_ENABLED: "1",
        V3_NEWS_LOCAL_LLM_MODEL: "local-model",
        V3_NEWS_LOCAL_LLM_BASE_URL: "http://localhost:11434",
      } as NodeJS.ProcessEnv,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("llm_guard_rejected");
    expect(result.digest).toEqual(digest);
    expect(result.scenarios).toEqual(scenarios);
  });

  it("sanitizes rewritten text to short conditional sentences", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      response: JSON.stringify({
        digest: {
          observation: "시장 흐름을 그대로 본다 ".repeat(30),
          counterSignals: ["[원문](https://example.com/raw) 신호 반전도 본다 ".repeat(20)],
        },
        scenarios: [
          {
            name: "Base",
            observation: "추세를 확인한다 ".repeat(40),
            invalidation: ["이 흐름이 약해지면 재검토한다 ".repeat(20)],
            options: ["모니터링을 한다 ".repeat(20)],
          },
        ],
      }),
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await rewriteDigestScenarioTextWithLocalLlm({
      digest: makeDigest(),
      scenarios: makeScenarios(),
      topItems: makeTopItems(),
      fetchImpl: fetchMock,
      env: {
        NODE_ENV: "test",
        V3_NEWS_LOCAL_LLM_ENABLED: "1",
        V3_NEWS_LOCAL_LLM_MODEL: "local-model",
        V3_NEWS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434",
      } as NodeJS.ProcessEnv,
    });

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("llm_applied");
    expect(result.digest.observation.length).toBeLessThanOrEqual(220);
    expect(result.digest.observation).toContain("가능");
    expect(result.digest.counterSignals[0]).not.toContain("https://");
    expect(result.scenarios.cards[0]?.observation.length ?? 0).toBeLessThanOrEqual(220);
    expect(result.scenarios.cards[0]?.options[0] ?? "").toContain("가능");
  });
});
