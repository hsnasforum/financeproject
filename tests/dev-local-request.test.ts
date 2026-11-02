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

  it("preserves direct IPv6 loopback requests", () => {
    const request = makeRequestLike("http://[::1]:3000/ops", { host: "[::1]:3000" }, "::1");
    expect(isLocalRequest(request)).toBe(true);
  });

  it("does not treat the all-interface bind address as a local request identity", () => {
    const request = makeRequestLike("http://0.0.0.0:3000/ops", { host: "0.0.0.0:3000" });
    expect(isLocalRequest(request)).toBe(false);
  });

  it("blocks a loopback Host header when the request URL is remote", () => {
    const request = makeRequestLike("https://example.com/ops", { host: "localhost:3000" });
    expect(isLocalRequest(request)).toBe(false);
  });

  it("does not let x-forwarded-host override the direct Host header", () => {
    const request = makeRequestLike(
      "https://example.com/ops",
      {
        host: "example.com",
        "x-forwarded-host": "localhost:3000",
      },
    );
    expect(isLocalRequest(request)).toBe(false);
  });

  it("blocks an inconsistent forwarded host on an otherwise local request", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "localhost:3000",
        "x-forwarded-host": "example.com",
      },
    );
    expect(isLocalRequest(request)).toBe(false);
  });

  it("allows only matching Next.js loopback forwarding values", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "localhost:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-port": "3000",
        "x-forwarded-proto": "http",
        "x-forwarded-for": "127.0.0.1",
      },
    );
    expect(isLocalRequest(request)).toBe(true);
  });

  it("accepts Next.js loopback aliases only when their ports match", () => {
    const normalizedAlias = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "127.0.0.1:3000",
        "x-forwarded-port": "3000",
        "x-forwarded-proto": "http",
        "x-forwarded-for": "127.0.0.1",
      },
    );
    const mismatchedPort = makeRequestLike(
      "http://localhost:3001/ops",
      { host: "127.0.0.1:3000" },
    );

    expect(isLocalRequest(normalizedAlias)).toBe(true);
    expect(isLocalRequest(mismatchedPort)).toBe(false);
  });

  it("blocks unsupported proxy identity headers even when they claim loopback", () => {
    for (const [name, value] of [
      ["forwarded", "for=127.0.0.1"],
      ["x-real-ip", "127.0.0.1"],
      ["cf-connecting-ip", "127.0.0.1"],
    ]) {
      const request = makeRequestLike(
        "http://localhost:3000/ops",
        { host: "localhost:3000", [name]: value },
      );
      expect(isLocalRequest(request)).toBe(false);
    }
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

  it("allows WSL bridge ip when running inside WSL", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "localhost:3000",
        "x-forwarded-for": "172.20.128.1",
      },
    );
    expect(isLocalRequest(request, { ...process.env, WSL_DISTRO_NAME: "Ubuntu" })).toBe(true);
  });

  it("uses the runtime peer ip when one is available", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      { host: "localhost:3000" },
      "203.0.113.9",
    );
    expect(isLocalRequest(request)).toBe(false);
  });

  it("blocks WSL bridge ip outside WSL env", () => {
    const request = makeRequestLike(
      "http://localhost:3000/ops",
      {
        host: "localhost:3000",
        "x-forwarded-for": "172.20.128.1",
      },
    );
    expect(isLocalRequest(request, { ...process.env, WSL_DISTRO_NAME: "", WSL_INTEROP: "" })).toBe(false);
  });

  it("allows when ALLOW_REMOTE=true override is set", () => {
    const request = makeRequestLike("https://example.com/ops", { host: "example.com" });
    expect(isLocalRequest(request, { ...process.env, ALLOW_REMOTE: "true" })).toBe(true);
  });

  it("ignores ALLOW_REMOTE=true in production", () => {
    const request = makeRequestLike("https://example.com/ops", { host: "example.com" });
    expect(isLocalRequest(request, { ...process.env, NODE_ENV: "production", ALLOW_REMOTE: "true" })).toBe(false);
  });
});
