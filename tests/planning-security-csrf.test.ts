import { describe, expect, it } from "vitest";
import { POST as planningRunPost } from "../src/app/api/planning/run/route";
import { POST as assumptionsRefreshPost } from "../src/app/api/ops/assumptions/refresh/route";
import { POST as opsRunsCleanupPost } from "../src/app/api/ops/runs/cleanup/route";
import { DELETE as opsRunDelete } from "../src/app/api/ops/runs/[runId]/route";

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestWithCookies(urlPath: string, method: string, body: unknown, cookie: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

describe("CSRF enforcement", () => {
  it("rejects /api/planning/run when csrf is missing", async () => {
    const response = await planningRunPost(requestWithCookies(
      "/api/planning/run",
      "POST",
      {
        profileId: "p1",
        input: { horizonMonths: 12 },
      },
      "dev_csrf=test-token",
    ));

    const payload = await response.json() as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
  });

  it("rejects /api/ops/assumptions/refresh when csrf is missing", async () => {
    const response = await assumptionsRefreshPost(requestWithCookies(
      "/api/ops/assumptions/refresh",
      "POST",
      {},
      "dev_action=1; dev_csrf=test-token",
    ));

    const payload = await response.json() as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("rejects /api/ops/runs/cleanup when csrf is missing", async () => {
    const response = await opsRunsCleanupPost(requestWithCookies(
      "/api/ops/runs/cleanup",
      "POST",
      { dryRun: true },
      "dev_action=1; dev_csrf=test-token",
    ));

    const payload = await response.json() as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("rejects /api/ops/runs/[runId] DELETE when csrf is missing", async () => {
    const response = await opsRunDelete(
      requestWithCookies(
        "/api/ops/runs/r1",
        "DELETE",
        {},
        "dev_action=1; dev_csrf=test-token",
      ),
      { params: Promise.resolve({ runId: "r1" }) },
    );

    const payload = await response.json() as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });
});
