import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runGov24SnapshotSync: vi.fn(),
}));

vi.mock("@/lib/gov24/syncRunner", () => ({
  runGov24SnapshotSync: mocks.runGov24SnapshotSync,
}));

import { POST as simpleFindPost } from "../src/app/api/gov24/simple-find/route";
import { POST as syncPost } from "../src/app/api/gov24/sync/route";

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function jsonRequest(
  pathName: string,
  init: {
    body?: Record<string, unknown>;
    origin?: string | null;
    host?: string;
  } = {},
): Request {
  const host = init.host ?? LOCAL_HOST;
  const origin = init.origin === undefined ? `http://${host}` : init.origin;
  const headers: Record<string, string> = {
    host,
    "content-type": "application/json",
    referer: `${origin ?? LOCAL_ORIGIN}/gov24`,
  };
  if (origin) headers.origin = origin;

  return new Request(`http://${host}${pathName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(init.body ?? {}),
  });
}

describe("gov24 route mutation guards", () => {
  beforeEach(() => {
    mocks.runGov24SnapshotSync.mockReset();
    mocks.runGov24SnapshotSync.mockResolvedValue({
      ok: true,
      meta: {
        completionRate: 1,
        uniqueCount: 10,
        upstreamTotalCount: 10,
        hardCapPages: 200,
        effectivePerPage: 200,
        truncatedByHardCap: false,
      },
    });
  });

  it("keeps simple-find validation behavior for same-origin browser requests", async () => {
    const response = await simpleFindPost(jsonRequest("/api/gov24/simple-find", {
      body: {
        targetType: "individual",
      },
    }));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string }; meta?: { fallback?: { sourceKey?: string; reason?: string } } };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.meta?.fallback?.sourceKey).toBe("gov24");
    expect(payload.meta?.fallback?.reason).toBe("input_invalid");
  });

  it("blocks simple-find when Origin is missing", async () => {
    const response = await simpleFindPost(jsonRequest("/api/gov24/simple-find", {
      origin: null,
      body: { targetType: "individual" },
    }));
    const payload = await response.json() as { error?: { code?: string }; meta?: { fallback?: { sourceKey?: string; reason?: string } } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("MISSING_ORIGIN");
    expect(payload.meta?.fallback?.sourceKey).toBe("gov24");
    expect(payload.meta?.fallback?.reason).toBe("origin_rejected");
  });

  it("blocks simple-find from an untrusted Origin", async () => {
    const response = await simpleFindPost(jsonRequest("/api/gov24/simple-find", {
      origin: "https://evil.example",
      body: { targetType: "individual" },
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("UNTRUSTED_ORIGIN");
  });

  it("keeps gov24 sync available for same-origin browser requests", async () => {
    const response = await syncPost(jsonRequest("/api/gov24/sync"));
    const payload = await response.json() as { ok?: boolean; meta?: { fallback?: { sourceKey?: string; reason?: string } } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta?.fallback?.sourceKey).toBe("gov24");
    expect(payload.meta?.fallback?.reason).toBe("sync_success");
    expect(mocks.runGov24SnapshotSync).toHaveBeenCalledTimes(1);
  });

  it("blocks gov24 sync before upstream work when Origin is missing", async () => {
    const response = await syncPost(jsonRequest("/api/gov24/sync", {
      origin: null,
    }));
    const payload = await response.json() as { error?: { code?: string }; meta?: { fallback?: { sourceKey?: string; reason?: string } } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("MISSING_ORIGIN");
    expect(payload.meta?.fallback?.sourceKey).toBe("gov24");
    expect(payload.meta?.fallback?.reason).toBe("origin_rejected");
    expect(mocks.runGov24SnapshotSync).not.toHaveBeenCalled();
  });
});
