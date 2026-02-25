import { describe, expect, it } from "vitest";
import { decideTrustedOrigin, isLoopbackHost, normalizeHostname } from "../src/lib/security/trustedOrigin";

describe("trusted origin decision", () => {
  it("allows same host origin", () => {
    const headers = new Headers({
      origin: "http://localhost:3000",
      host: "localhost:3000",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(true);
  });

  it("allows loopback equivalence between localhost and 127.0.0.1", () => {
    const headers = new Headers({
      origin: "http://localhost:3000",
      host: "127.0.0.1:3000",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(true);
  });

  it("allows forwarded host when proxy is used", () => {
    const headers = new Headers({
      origin: "https://abc-3000.app.github.dev",
      host: "127.0.0.1:3000",
      "x-forwarded-host": "abc-3000.app.github.dev",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(true);
  });

  it("blocks untrusted origin", () => {
    const headers = new Headers({
      origin: "https://evil.com",
      host: "localhost:3000",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("UNTRUSTED_ORIGIN");
  });

  it("blocks forwarded-style origin without allowlist when forwarded host is missing", () => {
    const headers = new Headers({
      origin: "https://abc-3000.app.github.dev",
      host: "127.0.0.1:3000",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("UNTRUSTED_ORIGIN");
  });

  it("allows forwarded-style origin with allowlist", () => {
    const headers = new Headers({
      origin: "https://abc-3000.app.github.dev",
      host: "127.0.0.1:3000",
    });

    const out = decideTrustedOrigin(headers, {
      trustedOriginHosts: ["*.app.github.dev"],
      trustedForwardHosts: ["127.0.0.1", "localhost"],
    });
    expect(out.ok).toBe(true);
  });

  it("blocks missing origin by default", () => {
    const headers = new Headers({
      host: "localhost:3000",
    });

    const out = decideTrustedOrigin(headers);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("MISSING_ORIGIN");
  });

  it("allows missing origin only with allowMissingOrigin and loopback host", () => {
    const headers = new Headers({
      host: "127.0.0.1:3000",
    });

    const out = decideTrustedOrigin(headers, { allowMissingOrigin: true });
    expect(out.ok).toBe(true);
  });
});

describe("trusted origin helpers", () => {
  it("normalizes ipv6 bracket host", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
  });

  it("detects loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });
});
