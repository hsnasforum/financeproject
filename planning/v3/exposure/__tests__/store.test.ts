import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readExposureProfile,
  resolveExposureProfilePath,
  saveExposureProfile,
} from "../store";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

let root = "";

describe("planning v3 exposure store", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-exposure-store-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads null when missing", () => {
    expect(readExposureProfile()).toBeNull();
  });

  it("writes profile atomically", () => {
    const saved = saveExposureProfile({
      debt: {
        hasDebt: "yes",
        rateType: "variable",
        repricingHorizon: "short",
      },
      liquidity: {
        monthsOfCashBuffer: "low",
      },
    });

    expect(typeof saved.savedAt).toBe("string");
    expect(saved.debt.rateType).toBe("variable");

    const loaded = readExposureProfile();
    expect(loaded?.debt.hasDebt).toBe("yes");
    expect(fs.existsSync(resolveExposureProfilePath())).toBe(true);
  });
});
