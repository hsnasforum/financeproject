import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPolicy, loadPolicy, validatePolicy } from "../src/lib/maintenance/retentionPolicy";

const roots: string[] = [];

function makeTempPolicyPath(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-retention-policy-"));
  roots.push(root);
  return path.join(root, "config", "retention-policy.json");
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("retention policy", () => {
  it("loads default policy when file is missing", () => {
    const policyPath = makeTempPolicyPath();
    const policy = loadPolicy(policyPath);
    expect(policy).toEqual(defaultPolicy());
  });

  it("rejects out-of-range values", () => {
    const result = validatePolicy({
      version: 1,
      feedbackMaxItems: 10,
      fixHistoryMaxItems: 99999,
      refreshLogMaxBytes: 20 * 1024,
      refreshLogKeepTailBytes: 5 * 1024,
      keepBackupRestorePoint: "yes",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts valid values", () => {
    const result = validatePolicy({
      version: 2,
      feedbackMaxItems: 1500,
      fixHistoryMaxItems: 600,
      refreshLogMaxBytes: 2 * 1024 * 1024,
      refreshLogKeepTailBytes: 300 * 1024,
      keepBackupRestorePoint: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feedbackMaxItems).toBe(1500);
    expect(result.data.keepBackupRestorePoint).toBe(false);
  });
});
