import { describe, expect, it } from "vitest";
import { isLocalRequest } from "../src/lib/dev/localRequest";

function makeRequestLike(url: string, headers: Record<string, string>, ip?: string) {
  const map = new Map<string, string>();
  Object.entries(headers).forEach(([key, value]) => {
    map.set(key.toLowerCase(), value);
  });
  return {
    url,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
    },
    ...(typeof ip === "string" ? { ip } : {}),
  };
}

describe("isLocalRequest", () => {
  it("allows localhost host with no forwarding headers", () => {
    const request = makeRequestLike("http://localhost:3000/ops", { host: "localhost:3000" });
    expect(isLocalRequest(request)).toBe(true);
  });

  it("allows 0.0.0.0 host in local dev", () => {
    const request = makeRequestLike("http://0.0.0.0:3000/ops", { host: "0.0.0.0:3000" });
    expect(isLocalRequest(request)).toBe(true);
  });

  it("blocks non-local host", () => {
    const request = makeRequestLike("https://example.com/ops", { host: "example.com" });
    expect(isLocalRequest(request)).toBe(false);
  });

  it("blocks external forwarded ip even with localhost host", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "localhost:3000",
        "x-forwarded-for": "203.0.113.9",
      },
    );
    expect(isLocalRequest(request)).toBe(false);
  });

  it("allows when ALLOW_REMOTE=true override is set", () => {
    const request = makeRequestLike("https://example.com/ops", { host: "example.com" });
    expect(isLocalRequest(request, { ...process.env, ALLOW_REMOTE: "true" })).toBe(true);
  });
});
