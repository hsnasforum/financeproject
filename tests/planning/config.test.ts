import { afterEach, describe, expect, it } from "vitest";
import { getPlanningFeatureFlags } from "../../src/lib/planning/config";

const env = process.env as Record<string, string | undefined>;
const original = {
  PLANNING_DEBUG_ENABLED: process.env.PLANNING_DEBUG_ENABLED,
  ECOS_ENABLED: process.env.ECOS_ENABLED,
  PLANNING_MONTE_CARLO_ENABLED: process.env.PLANNING_MONTE_CARLO_ENABLED,
  PLANNING_INCLUDE_PRODUCTS_ENABLED: process.env.PLANNING_INCLUDE_PRODUCTS_ENABLED,
  PLANNING_OPTIMIZER_ENABLED: process.env.PLANNING_OPTIMIZER_ENABLED,
  PLANNING_PDF_ENABLED: process.env.PLANNING_PDF_ENABLED,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
});

describe("getPlanningFeatureFlags", () => {
  it("returns conservative defaults when env is unset", () => {
    delete env.PLANNING_DEBUG_ENABLED;
    delete env.ECOS_ENABLED;
    delete env.PLANNING_MONTE_CARLO_ENABLED;
    delete env.PLANNING_INCLUDE_PRODUCTS_ENABLED;
    delete env.PLANNING_OPTIMIZER_ENABLED;
    delete env.PLANNING_PDF_ENABLED;

    expect(getPlanningFeatureFlags()).toEqual({
      debugEnabled: false,
      ecosEnabled: true,
      monteCarloEnabled: true,
      includeProductsEnabled: false,
      optimizerEnabled: false,
      pdfEnabled: false,
    });
  });

  it("parses explicit env overrides", () => {
    env.PLANNING_DEBUG_ENABLED = "true";
    env.ECOS_ENABLED = "false";
    env.PLANNING_MONTE_CARLO_ENABLED = "0";
    env.PLANNING_INCLUDE_PRODUCTS_ENABLED = "1";
    env.PLANNING_OPTIMIZER_ENABLED = "true";
    env.PLANNING_PDF_ENABLED = "yes";

    expect(getPlanningFeatureFlags()).toEqual({
      debugEnabled: true,
      ecosEnabled: false,
      monteCarloEnabled: false,
      includeProductsEnabled: true,
      optimizerEnabled: true,
      pdfEnabled: true,
    });
  });
});
