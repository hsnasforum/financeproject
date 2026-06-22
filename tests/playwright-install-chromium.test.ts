import { describe, expect, it } from "vitest";

import { parseBoundedInteger, parseInstallConfig } from "../scripts/playwright_install_chromium.mjs";

describe("playwright chromium installer config", () => {
  it("bounds numeric values and falls back for invalid input", () => {
    expect(parseBoundedInteger("4", 2, { min: 1, max: 5 })).toBe(4);
    expect(parseBoundedInteger("99", 2, { min: 1, max: 5 })).toBe(5);
    expect(parseBoundedInteger("-1", 2, { min: 1, max: 5 })).toBe(1);
    expect(parseBoundedInteger("not-a-number", 2, { min: 1, max: 5 })).toBe(2);
  });

  it("lets CI override attempts, timeout, and retry delay", () => {
    expect(
      parseInstallConfig(
        ["--attempts=3", "--timeout-ms=120000", "--delay-ms=0"],
        {
          NODE_ENV: "test",
          PLAYWRIGHT_INSTALL_ATTEMPTS: "1",
          PLAYWRIGHT_INSTALL_TIMEOUT_MS: "30000",
          PLAYWRIGHT_INSTALL_RETRY_DELAY_MS: "1000",
        },
      ),
    ).toEqual({
      attempts: 3,
      timeoutMs: 120000,
      delayMs: 0,
    });
  });
});
