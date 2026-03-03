import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as previewPOST } from "../src/app/api/planning/v3/import/csv/preview/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3500";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const MARKER = "PII_SHOULD_NOT_LEAK";

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

describe("planning v3 csv preview redaction", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("does not expose raw desc marker in preview api response", async () => {
    const response = await previewPOST(requestJson({
      csvText: [
        "date,amount,description",
        `2026-03-01,1000,${MARKER} 123456789`,
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
    }));

    expect(response.status).toBe(200);

    const responseText = await response.text();
    expect(responseText).not.toContain(MARKER);

    const payload = JSON.parse(responseText) as {
      ok?: boolean;
      preview?: {
        rows?: Array<{ descMasked?: string }>;
      };
    };
    expect(payload.ok).toBe(true);
    const masked = payload.preview?.rows?.[0]?.descMasked ?? "";
    expect(masked).not.toContain(MARKER);
  });
});
