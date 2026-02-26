import { describe, expect, it } from "vitest";
import { exchangeProvider } from "../../src/lib/providers/exchange";
import { runProvider } from "../../src/lib/providers/runProvider";
import { expectProviderContract } from "./contractHarness";

describe("exchange provider contract", () => {
  it("returns contract-compliant error when env is missing", async () => {
    const response = await runProvider(exchangeProvider, { dateYYYYMMDD: "20260225" }, {
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });

    expectProviderContract(response, { sourceId: "exchange" });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe("ENV_MISSING");
      expect(response.error.message).toContain("설정");
    }
  });
});
