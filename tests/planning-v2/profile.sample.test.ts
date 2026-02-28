import { describe, expect, it } from "vitest";
import { SAMPLE_PROFILE_V2_KO } from "../../src/lib/planning/samples/profile.sample.ko";
import { validateProfileV2 } from "../../src/lib/planning/v2/validate";

describe("SAMPLE_PROFILE_V2_KO", () => {
  it("passes ProfileV2 validation", () => {
    expect(() => validateProfileV2(SAMPLE_PROFILE_V2_KO)).not.toThrow();
    const profile = validateProfileV2(SAMPLE_PROFILE_V2_KO);
    expect(profile.debts.length).toBeGreaterThan(0);
    expect(profile.goals.length).toBeGreaterThan(0);
  });
});
