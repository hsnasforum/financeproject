import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as runReportPdfGET } from "../../src/app/api/planning/v2/runs/[id]/report.pdf/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPdfFlag = process.env.PLANNING_PDF_ENABLED;
const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

function buildGetRequest(urlPath: string, host = LOCAL_HOST, cookie = ""): Request {
  const origin = host === REMOTE_HOST ? REMOTE_ORIGIN : LOCAL_ORIGIN;
  const headers: Record<string, string> = {
    host,
    origin,
    referer: `${origin}/planning/runs`,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers,
  });
}

describe("GET /api/planning/v2/runs/[id]/report.pdf", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPdfFlag === "string") env.PLANNING_PDF_ENABLED = originalPdfFlag;
    else delete env.PLANNING_PDF_ENABLED;
  });

  it("returns DISABLED when PLANNING_PDF_ENABLED is false", async () => {
    env.PLANNING_PDF_ENABLED = "false";

    const response = await runReportPdfGET(
      buildGetRequest("/api/planning/v2/runs/sample-run/report.pdf"),
      { params: Promise.resolve({ id: "sample-run" }) },
    );
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("DISABLED");
  });

  it("allows same-origin remote requests and still honors feature flags", async () => {
    env.PLANNING_PDF_ENABLED = "false";
    const response = await runReportPdfGET(
      buildGetRequest("/api/planning/v2/runs/sample-run/report.pdf", REMOTE_HOST),
      { params: Promise.resolve({ id: "sample-run" }) },
    );
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("DISABLED");
  });

  it("blocks cross-origin requests", async () => {
    env.PLANNING_PDF_ENABLED = "false";
    const response = await runReportPdfGET(
      new Request(`${LOCAL_ORIGIN}/api/planning/v2/runs/sample-run/report.pdf`, {
        method: "GET",
        headers: {
          host: LOCAL_HOST,
          origin: REMOTE_ORIGIN,
          referer: `${REMOTE_ORIGIN}/planning/runs`,
        },
      }),
      { params: Promise.resolve({ id: "sample-run" }) },
    );
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
  });

  it("enforces csrf when csrf cookie exists", async () => {
    env.PLANNING_PDF_ENABLED = "false";
    const response = await runReportPdfGET(
      buildGetRequest("/api/planning/v2/runs/sample-run/report.pdf", LOCAL_HOST, "dev_csrf=test-token"),
      { params: Promise.resolve({ id: "sample-run" }) },
    );
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
  });
});
