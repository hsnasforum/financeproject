import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/backup/exportPaths", () => ({
  collectServerPaths: () => [],
}));

vi.mock("../src/lib/audit/auditLogStore", () => ({
  append: vi.fn(),
}));

import { GET } from "../src/app/api/dev/backup/export/route";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalAllowRemote = process.env.ALLOW_REMOTE;

afterEach(() => {
  if (typeof originalAllowRemote === "string") mutableEnv.ALLOW_REMOTE = originalAllowRemote;
  else delete mutableEnv.ALLOW_REMOTE;
});

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("dev backup export route", () => {
  it("requires Dev unlock before reading backup paths", async () => {
    const response = await GET(request("http://localhost:3000/api/dev/backup/export"));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects remote requests even when ALLOW_REMOTE and spoofed forwarding headers are present", async () => {
    mutableEnv.ALLOW_REMOTE = "1";
    const response = await GET(request("https://example.com/api/dev/backup/export", {
      host: "example.com",
      "x-forwarded-host": "localhost:3000",
      cookie: "dev_action=1",
    }));
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("LOCAL_ONLY");
  });

  it("allows an unlocked direct loopback request", async () => {
    const response = await GET(request("http://localhost:3000/api/dev/backup/export", {
      cookie: "dev_action=1",
    }));
    const body = await response.json() as { ok?: boolean; data?: { serverFiles?: unknown } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.serverFiles).toEqual({});
  });
});
