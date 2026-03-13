import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/planning/v3/draft/scenario/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3920";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";
const CSRF = "draft-scenario-csrf";

function requestJson(
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
    includeCsrfCookie?: boolean;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  const headers: Record<string, string> = {
    host,
    origin,
    referer: `${refererOrigin}/planning/v3/drafts`,
    "content-type": "application/json",
  };
  if (options?.includeCsrfCookie ?? true) {
    headers.cookie = `dev_csrf=${CSRF}`;
    headers["x-csrf-token"] = CSRF;
  }
  return new Request(`${requestOrigin}/api/planning/v3/draft/scenario`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      csrf: CSRF,
      ...((body ?? {}) as Record<string, unknown>),
    }),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("POST /api/planning/v3/draft/scenario", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("returns deterministic result for same seed and same logical input", async () => {
    const body = {
      seed: 42,
      draftPatch: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 500_000,
      },
      scenario: {
        volatilityPct: 20,
        periodMonths: 24,
        sampleCount: 1000,
      },
    };

    const responseA = await POST(requestJson(body));
    const responseB = await POST(requestJson(body));
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const payloadA = await responseA.json() as {
      ok?: boolean;
      data?: {
        summary?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        scenarios?: Record<string, Record<string, unknown>>;
        comparisons?: Record<string, Record<string, unknown>>;
      };
    };
    const payloadB = await responseB.json() as typeof payloadA;
    expect(payloadA.ok).toBe(true);
    expect(payloadB.ok).toBe(true);
    expect(payloadA.data).toEqual(payloadB.data);
    expect(payloadA.data?.summary?.failureDefinition).toBe("finalCumulativeNetKrw < 0");
    expect(Object.keys(payloadA.data?.scenarios ?? {}).sort()).toEqual(["aggressive", "base", "conservative"]);
    expect(Object.keys(payloadA.data?.comparisons ?? {}).sort()).toEqual(["aggressiveVsBase", "conservativeVsBase"]);
    expect(payloadA.data?.summary?.mean).toBe(payloadA.data?.scenarios?.base?.mean);
  });

  it("is stable against input order/format changes", async () => {
    const bodyA = {
      seed: 42,
      draftPatch: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 500_000,
      },
      scenario: {
        volatilityPct: 20,
        periodMonths: 24,
        sampleCount: 1000,
      },
    };

    const bodyB = {
      draftPatch: {
        monthlyDiscretionaryExpenses: "500000",
        monthlyEssentialExpenses: "1000000",
        monthlyIncomeNet: "3000000",
        narrative: "ignore-me",
      },
      periodMonths: "24",
      sampleCount: "1000",
      volatilityPct: "20",
      seed: "42",
    };

    const [responseA, responseB] = await Promise.all([
      POST(requestJson(bodyA)),
      POST(requestJson(bodyB)),
    ]);
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const payloadA = await responseA.json() as {
      ok?: boolean;
      data?: {
        summary?: {
          mean?: number;
          median?: number;
          p05?: number;
          p25?: number;
          p75?: number;
          p95?: number;
          failureProbability?: number;
          failureDefinition?: string;
        };
        meta?: {
          seed?: number;
          sampleCount?: number;
          periodMonths?: number;
          volatilityPct?: number;
        };
        scenarios?: Record<string, {
          mean?: number;
          median?: number;
          p05?: number;
          p25?: number;
          p75?: number;
          p95?: number;
          failureProbability?: number;
        }>;
        comparisons?: Record<string, {
          deltaMean?: number;
          deltaMedian?: number;
          deltaP05?: number;
          deltaP95?: number;
          deltaFailureProbability?: number;
        }>;
      };
    };
    const payloadB = await responseB.json() as typeof payloadA;
    expect(payloadA.ok).toBe(true);
    expect(payloadB.ok).toBe(true);
    expect(payloadA.data).toEqual(payloadB.data);
    expect(payloadA.data?.summary?.mean).toBe(payloadA.data?.scenarios?.base?.mean);
    expect(payloadA.data?.meta?.volatilityPct).toBe(20);
  });

  it("allows same-origin remote host without csrf cookie and still blocks cross-origin", async () => {
    const body = {
      seed: 7,
      draftPatch: {
        monthlyIncomeNet: 2_500_000,
        monthlyEssentialExpenses: 900_000,
        monthlyDiscretionaryExpenses: 400_000,
      },
      scenario: {
        volatilityPct: 15,
        periodMonths: 12,
        sampleCount: 200,
      },
    };

    const sameOrigin = await POST(requestJson(body, {
      requestOrigin: REMOTE_ORIGIN,
      host: REMOTE_HOST,
      includeCsrfCookie: false,
    }));
    expect(sameOrigin.status).toBe(200);
    const sameOriginPayload = await sameOrigin.json() as { ok?: boolean };
    expect(sameOriginPayload.ok).toBe(true);

    await expectOriginMismatch(POST(requestJson(body, {
      requestOrigin: REMOTE_ORIGIN,
      host: REMOTE_HOST,
      origin: EVIL_ORIGIN,
      refererOrigin: EVIL_ORIGIN,
      includeCsrfCookie: false,
    })));
  });
});
