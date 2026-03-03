import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as previewPOST } from "../src/app/api/planning/v3/import/csv/preview/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3400";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv/preview`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 csv preview api", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("returns validation errors when mapping is missing/duplicated", async () => {
    const response = await previewPOST(requestJson({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000,hello",
      ].join("\n"),
      mapping: {
        amountKey: "amount",
        descKey: "amount",
      },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      validation?: {
        ok?: boolean;
        errors?: Array<{ field?: string }>;
      };
      preview?: {
        stats?: {
          total?: number;
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.validation?.ok).toBe(false);
    const fields = (payload.validation?.errors ?? []).map((entry) => entry.field);
    expect(fields).toContain("dateKey");
    expect(fields).toContain("conflict");
    expect(payload.preview?.stats?.total).toBe(0);
  });
});
