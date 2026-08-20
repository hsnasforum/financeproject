import { describe, expect, it } from "vitest";
import {
  buildBundle,
  CLIENT_STORAGE_WHITELIST,
  validateBundle,
} from "../src/lib/backup/backupBundle";
import { RECOMMEND_LEGACY_STORAGE_KEYS } from "../src/lib/recommend/ownerNamespace";

describe("backup bundle", () => {
  it("accepts a valid bundle with whitelisted paths", () => {
    const bundle = buildBundle({
      serverFilesMap: {
        "tmp/user_feedback.json": "[]",
        "tmp/daily_refresh_result.json": "{\"ok\":true}",
        "tmp/dart/daily_brief.json": "{\"lines\":[]}",
        ".data/ops/auto-merge-policy.json": "{\"version\":1}",
        ".data/planning/assumptions.latest.json": "{\"version\":1}",
        ".data/planning/assumptions/history/2026-02-28_2026-02-28-09-00-00.json": "{\"version\":1}",
        ".data/planning/profiles/profile-1.json": "{\"version\":1}",
        ".data/planning/runs/run-1.json": "{\"version\":1}",
        ".data/planning/eval/latest.json": "{\"version\":1}",
        ".data/planning/eval/history/2026-02-28.json": "{\"version\":1}",
        ".data/planning/cache/simulate.abc.json": "{\"version\":1}",
      },
      clientStorageMap: {
        "planner:last": "{\"input\":{}}",
        "products_shelf_v1": "[]",
        "finance:recommend:v2:alice:profile": "{\"ownerId\":\"alice\"}",
      },
    });

    expect(validateBundle(bundle)).toEqual({ ok: true });
  });

  it("rejects bundle with invalid version", () => {
    const bundle = buildBundle({
      serverFilesMap: { "tmp/user_feedback.json": "[]" },
      clientStorageMap: { "planner:last": "{}" },
    }) as unknown as { version: number };
    bundle.version = 999;

    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("bundle.version");
    }
  });

  it("rejects bundle when required fields are missing", () => {
    const result = validateBundle({
      version: 1,
      generatedAt: new Date().toISOString(),
      serverFiles: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("clientStorage");
    }
  });

  it("rejects bundle containing non-whitelisted server path", () => {
    const bundle = buildBundle({
      serverFilesMap: {
        "tmp/user_feedback.json": "[]",
        "tmp/not_allowed.json": "{}",
      },
      clientStorageMap: {
        "planner:last": "{}",
      },
    });
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("허용되지 않은 server path");
    }
  });

  it("accepts legacy v1 recommendation keys for import compatibility", () => {
    const legacyV1Bundle = {
      version: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      serverFiles: {},
      clientStorage: {
        recommend_profile_v1: "{\"purpose\":\"seed-money\"}",
        recommend_last_result_v1: null,
      },
    };

    expect(validateBundle(legacyV1Bundle)).toEqual({ ok: true });
    expect(CLIENT_STORAGE_WHITELIST).not.toEqual(
      expect.arrayContaining([...RECOMMEND_LEGACY_STORAGE_KEYS]),
    );
  });

  it("rejects malformed owner-namespaced recommendation browser state", () => {
    for (const key of [
      "finance:recommend:v2::profile",
      "finance:recommend:v2:alice:unknown",
      "finance:recommend:v2:%GG:profile",
      "finance:recommend:v2: alice :profile",
    ]) {
      const bundle = buildBundle({
        serverFilesMap: {},
        clientStorageMap: { [key]: "{}" },
      });
      const result = validateBundle(bundle);
      expect(result.ok, key).toBe(false);
    }
  });
});
