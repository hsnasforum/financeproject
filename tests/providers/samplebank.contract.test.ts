import { describe, expect, it } from "vitest";
import { samplebankProvider } from "../../src/lib/providers/samplebank";
import { runProvider } from "../../src/lib/providers/runProvider";
import { expectProviderContract } from "./contractHarness";

describe("samplebank provider contract", () => {
  it("returns replay-backed contract-compliant response", async () => {
    const response = await runProvider(samplebankProvider, { kind: "deposit" }, {
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      debug: true,
    });
    expectProviderContract(response, { sourceId: "samplebank", debug: true });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.meta.fallback?.mode).toBe("REPLAY");
      expect(response.meta.cacheKey).toContain("kind=deposit");
      expect(response.meta.generatedAt).toBe("2026-02-25T00:00:00.000Z");
      expect(response.data.items.length).toBeGreaterThan(0);
      expect(response.data.items[0]?.stableId.startsWith("samplebank:")).toBe(true);
      expect(response.data.items[0]?.sourceId).toBe("samplebank");
    }
  });
});
