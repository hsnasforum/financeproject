import { describe, expect, it } from "vitest";
import { resolveOdcloudEndpoint } from "../src/lib/publicApis/odcloud";

describe("odcloud endpoint resolver", () => {
  it("resolves base-only /api with default path", () => {
    const resolved = resolveOdcloudEndpoint("https://api.odcloud.kr/api", "/gov24/v3/serviceList", {
      allowBaseOnly: true,
      allowDirOnly: true,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.url.toString()).toBe("https://api.odcloud.kr/api/gov24/v3/serviceList");
    expect(resolved.resolvedFrom).toBe("base");
  });

  it("resolves dir-only path by appending default last segment", () => {
    const resolved = resolveOdcloudEndpoint("https://api.odcloud.kr/api/gov24/v3", "/gov24/v3/serviceList", {
      allowBaseOnly: true,
      allowDirOnly: true,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.url.toString()).toBe("https://api.odcloud.kr/api/gov24/v3/serviceList");
    expect(resolved.resolvedFrom).toBe("dir");
  });

  it("keeps full endpoint when already complete", () => {
    const resolved = resolveOdcloudEndpoint(
      "https://api.odcloud.kr/api/gov24/v3/serviceList?x=1",
      "/gov24/v3/serviceList",
      { allowBaseOnly: true, allowDirOnly: true },
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.url.toString()).toBe("https://api.odcloud.kr/api/gov24/v3/serviceList");
    expect(resolved.resolvedFrom).toBe("full");
  });

  it("detects doc url and returns ENV_DOC_URL", () => {
    const resolved = resolveOdcloudEndpoint(
      "https://infuser.odcloud.kr/oas/docs?namespace=15083277/v1/api-docs",
      "/gov24/v3/serviceList",
      { allowBaseOnly: true, allowDirOnly: true },
    );
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.code).toBe("ENV_DOC_URL");
  });
});

