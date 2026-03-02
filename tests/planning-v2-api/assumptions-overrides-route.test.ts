import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PATCH as overridesPATCH,
  PUT as overridesPUT,
} from "../../src/app/api/ops/assumptions/overrides/route";
import { POST as overridesResetPOST } from "../../src/app/api/ops/assumptions/overrides/reset/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

function buildRequest(options: {
  method: "PUT" | "PATCH" | "POST";
  urlPath: string;
  body: Record<string, unknown>;
  host?: string;
  cookie?: string;
}): Request {
  const host = options.host ?? "localhost:3000";
  const origin = `http://${host}`;
  return new Request(`${origin}${options.urlPath}`, {
    method: options.method,
    headers: {
      host,
      origin,
      referer: `${origin}/ops/assumptions`,
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(options.body),
  });
}

describe("ops assumptions overrides route guards", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  it("rejects PUT without csrf", async () => {
    const response = await overridesPUT(buildRequest({
      method: "PUT",
      urlPath: "/api/ops/assumptions/overrides",
      body: {
        profileId: "default-profile",
        items: [],
      },
      cookie: "dev_action=1; dev_csrf=test-token",
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("rejects PATCH from non-local host", async () => {
    const response = await overridesPATCH(buildRequest({
      method: "PATCH",
      urlPath: "/api/ops/assumptions/overrides",
      body: {
        csrf: "test-token",
        key: "inflationPct",
        value: 2.6,
      },
      host: "example.com",
      cookie: "dev_action=1; dev_csrf=test-token",
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("rejects reset endpoint without csrf", async () => {
    const response = await overridesResetPOST(buildRequest({
      method: "POST",
      urlPath: "/api/ops/assumptions/overrides/reset",
      body: {
        profileId: "default-profile",
      },
      cookie: "dev_action=1; dev_csrf=test-token",
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });
});

afterAll(() => {
  if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
  else delete env.NODE_ENV;
});
