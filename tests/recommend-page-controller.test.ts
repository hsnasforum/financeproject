import { describe, expect, it } from "vitest";

import {
  buildRecommendHistoryHref,
  buildRecommendInitialProfileState,
  parseRecommendQueryOverrides,
  resolveRecommendAutorunContinuation,
} from "../src/lib/recommend/recommendPageController";
import { defaults as recommendProfileDefaults } from "../src/lib/schemas/recommendProfile";

describe("recommend page controller", () => {
  it("parses profile overrides and autorun flags without changing query semantics", () => {
    const query = parseRecommendQueryOverrides(new URLSearchParams({
      purpose: "emergency",
      preferredTerm: "3",
      autorun: "YES",
      save: "TRUE",
      go: "HISTORY",
      from: "planning-report",
    }));

    expect(query).toMatchObject({
      profilePatch: { purpose: "emergency", preferredTerm: 3 },
      hasQuery: true,
      autoRun: true,
      autoSave: true,
      goHistory: true,
      source: "planning-report",
      issues: [],
    });
  });

  it("keeps invalid query issues while falling back from malformed browser storage", () => {
    const state = buildRecommendInitialProfileState({
      searchParams: new URLSearchParams({ purpose: "invalid", autorun: "1" }),
      storedProfileRaw: "{invalid-json",
    });

    expect(state.profile).toEqual(recommendProfileDefaults());
    expect(state.queryOverrides.hasQuery).toBe(false);
    expect(state.queryOverrides.autoRun).toBe(true);
    expect(state.queryOverrides.issues.map((issue) => issue.path)).toContain("purpose");
  });

  it("applies query values after the stored profile", () => {
    const storedProfile = {
      ...recommendProfileDefaults(),
      purpose: "long-term" as const,
      kind: "saving" as const,
      preferredTerm: 24 as const,
    };
    const state = buildRecommendInitialProfileState({
      searchParams: new URLSearchParams({ purpose: "emergency", preferredTerm: "3" }),
      storedProfileRaw: JSON.stringify(storedProfile),
    });

    expect(state.profile).toMatchObject({
      purpose: "emergency",
      kind: "saving",
      preferredTerm: 3,
    });
  });

  it("normalizes legacy stored weights and reports that adjustment", () => {
    const storedProfile = {
      ...recommendProfileDefaults(),
      weights: { rate: 1, term: 1, liquidity: 1 },
    };
    const state = buildRecommendInitialProfileState({
      searchParams: new URLSearchParams(),
      storedProfileRaw: JSON.stringify(storedProfile),
    });

    expect(state.profile.weights.rate + state.profile.weights.term + state.profile.weights.liquidity).toBe(1);
    expect(state.weightNormalization).toMatchObject({
      normalized: true,
      originalSum: 3,
      reason: "sum_adjusted",
    });
  });

  it("reuses the same autorun signature and preserves the encoded history URL", () => {
    const continuation = resolveRecommendAutorunContinuation({
      signature: "same-signature",
      previous: { sig: "same-signature", runId: "run/with space" },
      goHistory: true,
    });

    expect(continuation).toEqual({
      kind: "reuse",
      runId: "run/with space",
      historyHref: "/recommend/history?open=run%2Fwith%20space",
    });
    expect(buildRecommendHistoryHref("run/with space")).toBe(
      "/recommend/history?open=run%2Fwith%20space",
    );
  });

  it("requests a new save when the signature or saved run is unavailable", () => {
    expect(resolveRecommendAutorunContinuation({
      signature: "next",
      previous: { sig: "previous", runId: "run-1" },
      goHistory: true,
    })).toEqual({ kind: "save", signature: "next", goHistory: true });

    expect(resolveRecommendAutorunContinuation({
      signature: "same",
      previous: { sig: "same", runId: null },
      goHistory: false,
    })).toEqual({ kind: "save", signature: "same", goHistory: false });
  });
});
