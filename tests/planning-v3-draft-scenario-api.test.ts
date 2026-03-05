import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/planning/v3/draft/scenario/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3920";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF = "draft-scenario-csrf";

function requestJson(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/draft/scenario`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
      cookie: `dev_csrf=${CSRF}`,
      "x-csrf-token": CSRF,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      csrf: CSRF,
      ...((body ?? {}) as Record<string, unknown>),
    }),
  });
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
});
