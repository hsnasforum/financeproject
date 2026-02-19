import { describe, expect, it } from "vitest";
import { canAutoBuildFromUi, canBuildCorpIndex } from "../src/lib/publicApis/dart/indexBuildGuard";

describe("canBuildCorpIndex", () => {
  it("allows in non-production", () => {
    const result = canBuildCorpIndex({ nodeEnv: "development" });
    expect(result.allowed).toBe(true);
  });

  it("blocks production when token is missing", () => {
    const result = canBuildCorpIndex({ nodeEnv: "production", configuredToken: "", requestToken: "" });
    expect(result.allowed).toBe(false);
  });

  it("allows production only when tokens match", () => {
    const denied = canBuildCorpIndex({ nodeEnv: "production", configuredToken: "abc", requestToken: "wrong" });
    const allowed = canBuildCorpIndex({ nodeEnv: "production", configuredToken: "abc", requestToken: "abc" });

    expect(denied.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});

describe("canAutoBuildFromUi", () => {
  it("is disabled in production", () => {
    expect(canAutoBuildFromUi("production")).toBe(false);
    expect(canAutoBuildFromUi("development")).toBe(true);
  });
});
