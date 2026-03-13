import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next config dev origins", () => {
  it("allows loopback origins used by local and e2e flows", () => {
    const origins = Array.isArray(nextConfig.allowedDevOrigins) ? nextConfig.allowedDevOrigins : [];
    expect(origins).toEqual(expect.arrayContaining(["127.0.0.1", "localhost", "::1", "[::1]"]));
  });
});
