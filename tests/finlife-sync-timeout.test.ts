import { describe, expect, it } from "vitest";
import { resolveFinlifeSyncTimeoutMs } from "../scripts/finlife_cli_common.mjs";

describe("finlife sync page timeout", () => {
  it("waits 30 seconds by default and treats blank values as unset", () => {
    expect(resolveFinlifeSyncTimeoutMs({})).toBe(30_000);
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "" })).toBe(30_000);
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "   " })).toBe(30_000);
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "not-a-number" })).toBe(30_000);
  });

  it("accepts bounded overrides", () => {
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "45000" })).toBe(45_000);
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "100" })).toBe(500);
    expect(resolveFinlifeSyncTimeoutMs({ FINLIFE_SYNC_TIMEOUT_MS: "999999" })).toBe(120_000);
  });
});
