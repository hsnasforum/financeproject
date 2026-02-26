import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  const originalApiKey = process.env.OPENDART_API_KEY;

  afterEach(() => {
    if (typeof originalApiKey === "string") process.env.OPENDART_API_KEY = originalApiKey;
    else delete process.env.OPENDART_API_KEY;
    vi.restoreAllMocks();
  });

  it("is disabled in production", () => {
    expect(canAutoBuildFromUi("production")).toBe(false);
  });

  it("is disabled when OPENDART_API_KEY is missing", () => {
    delete process.env.OPENDART_API_KEY;
    expect(canAutoBuildFromUi("development")).toBe(false);
  });

  it("is disabled when script does not exist", () => {
    process.env.OPENDART_API_KEY = "test-key";
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(canAutoBuildFromUi("development")).toBe(false);
  });

  it("is enabled in development when key and script exist", () => {
    process.env.OPENDART_API_KEY = "test-key";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    expect(canAutoBuildFromUi("development")).toBe(true);
  });
});
