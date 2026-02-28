import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultAutoMergePolicy,
  loadAutoMergePolicy,
  saveAutoMergePolicy,
  validateAutoMergePolicy,
} from "../src/lib/ops/autoMergePolicy";

const env = process.env as Record<string, string | undefined>;
const originalPolicyPath = process.env.AUTO_MERGE_POLICY_PATH;
const TEST_DIR = path.join(process.cwd(), "tmp", "tests", "auto-merge-policy");
const TEST_POLICY_PATH = path.join(TEST_DIR, "policy.json");

async function resetTestDir() {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
}

describe("auto merge policy util", () => {
  beforeEach(async () => {
    env.AUTO_MERGE_POLICY_PATH = TEST_POLICY_PATH;
    await resetTestDir();
  });

  afterEach(async () => {
    if (typeof originalPolicyPath === "string") env.AUTO_MERGE_POLICY_PATH = originalPolicyPath;
    else delete env.AUTO_MERGE_POLICY_PATH;
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns defaults when policy file is missing", async () => {
    const loaded = await loadAutoMergePolicy();
    const defaults = defaultAutoMergePolicy();
    expect(loaded.enabled).toBe(defaults.enabled);
    expect(loaded.mergeMethod).toBe(defaults.mergeMethod);
    expect(loaded.requiredChecks).toEqual(defaults.requiredChecks);
  });

  it("returns defaults when policy json is invalid", async () => {
    await fs.writeFile(TEST_POLICY_PATH, "{invalid-json", "utf-8");
    const loaded = await loadAutoMergePolicy();
    expect(loaded).toMatchObject({
      enabled: false,
      mergeMethod: "squash",
      requiredLabel: "automerge",
      requiredChecks: ["CI"],
    });
  });

  it("rejects invalid policy ranges and empty checks", () => {
    const result = validateAutoMergePolicy({
      enabled: true,
      mergeMethod: "other",
      requiredLabel: "",
      requiredChecks: [],
      minApprovals: -1,
      requireClean: false,
      arm: {
        defaultPollSeconds: 1,
        maxConcurrentPolls: 99,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("requiredChecks must include at least one check name");
    expect(result.errors).toContain("mergeMethod must be one of: squash|merge|rebase");
    expect(result.errors).toContain("requiredLabel must not be empty");
  });

  it("saves policy atomically via temp file + rename", async () => {
    const saved = await saveAutoMergePolicy({
      ...defaultAutoMergePolicy(),
      enabled: true,
      mergeMethod: "rebase",
      requiredChecks: ["CI", "lint"],
      updatedBy: "test",
    });

    expect(saved.enabled).toBe(true);
    expect(saved.mergeMethod).toBe("rebase");
    const raw = await fs.readFile(TEST_POLICY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { enabled?: boolean; mergeMethod?: string; updatedBy?: string };
    expect(parsed.enabled).toBe(true);
    expect(parsed.mergeMethod).toBe("rebase");
    expect(parsed.updatedBy).toBe("test");

    const tmpPath = `${TEST_POLICY_PATH}.tmp`;
    await expect(fs.access(tmpPath)).rejects.toBeDefined();
  });
});
