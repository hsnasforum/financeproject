import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  fetchExternal: vi.fn(),
  shouldCooldown: vi.fn<() => { cooldown: boolean; nextRetryAt?: string }>(() => ({ cooldown: false })),
  setCooldown: vi.fn(() => ({ sourceKey: "opendart_list", nextRetryAt: "2026-02-25T00:00:00.000Z" })),
}));

vi.mock("@/lib/http/fetchExternal", () => {
  class ExternalApiError extends Error {
    detail: { code: string; message: string };

    status?: number;

    retryAfterSeconds?: number;

    timeout?: boolean;

    constructor(
      detail: { code: string; message: string },
      options?: { status?: number; retryAfterSeconds?: number; timeout?: boolean },
    ) {
      super(detail.message);
      this.detail = detail;
      this.status = options?.status;
      this.retryAfterSeconds = options?.retryAfterSeconds;
      this.timeout = options?.timeout;
    }
  }

  return {
    fetchExternal: mocked.fetchExternal,
    ExternalApiError,
  };
});

vi.mock("@/lib/http/rateLimitCooldown", () => ({
  shouldCooldown: mocked.shouldCooldown,
  setCooldown: mocked.setCooldown,
}));

vi.mock("@/lib/http/apiResponse", async () => await import("../src/lib/http/apiResponse"));
vi.mock("@/lib/http/fallbackMeta", async () => await import("../src/lib/http/fallbackMeta"));
vi.mock("@/lib/publicApis/dart/opendartErrors", async () => await import("../src/lib/publicApis/dart/opendartErrors"));

import { GET } from "../src/app/api/public/disclosure/list/route";

describe("GET /api/public/disclosure/list mapping", () => {
  beforeEach(() => {
    mocked.fetchExternal.mockReset();
    mocked.shouldCooldown.mockReset();
    mocked.setCooldown.mockReset();
    mocked.shouldCooldown.mockReturnValue({ cooldown: false });
    mocked.setCooldown.mockReturnValue({ sourceKey: "opendart_list", nextRetryAt: "2026-02-25T00:00:00.000Z" });
    process.env.OPENDART_API_KEY = "test-key";
  });

  it("maps status 013 to NO_DATA(404)", async () => {
    mocked.fetchExternal.mockResolvedValue({
      ok: true,
      status: 200,
      kind: "json",
      body: {
        status: "013",
        message: "조회된 데이터가 없습니다.",
        page_no: "1",
        page_count: "10",
      },
      text: "",
      contentType: "application/json",
      headers: new Headers(),
      attempts: 1,
    });

    const req = new Request("http://localhost/api/public/disclosure/list?from=2025-01-01&to=2026-02-25");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("NO_DATA");
  });

  it("maps status 020 to RATE_LIMIT and sets cooldown", async () => {
    mocked.fetchExternal.mockResolvedValue({
      ok: true,
      status: 200,
      kind: "json",
      body: {
        status: "020",
        message: "요청 제한",
      },
      text: "",
      contentType: "application/json",
      headers: new Headers(),
      attempts: 1,
      retryAfterSeconds: 30,
    });

    const req = new Request("http://localhost/api/public/disclosure/list?corpCode=00126380");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string } };

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("RATE_LIMIT");
    expect(mocked.setCooldown).toHaveBeenCalled();
  });

  it("skips live call when cooldown is active", async () => {
    mocked.shouldCooldown.mockReturnValue({
      cooldown: true,
      nextRetryAt: "2026-02-25T00:00:00.000Z",
    });

    const req = new Request("http://localhost/api/public/disclosure/list?corpCode=00126380");
    const res = await GET(req);
    const json = await res.json() as { ok?: boolean; error?: { code?: string } };

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("RATE_LIMIT");
    expect(mocked.fetchExternal).not.toHaveBeenCalled();
  });
});
