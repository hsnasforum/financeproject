import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readExposureProfile,
  resolveExposureProfilePath,
  writeExposureProfile,
} from "../src/lib/news/exposureStore";

const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

let root = "";

describe("news exposure store", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-exposure-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns null when profile file is missing", () => {
    expect(readExposureProfile()).toBeNull();
  });

  it("writes and reads profile with updatedAt", () => {
    const saved = writeExposureProfile({
      debt: {
        hasDebt: true,
        rateType: "variable",
        repricingHorizon: "short",
      },
      liquidity: {
        monthsOfCashBuffer: "low",
      },
    });

    expect(typeof saved.updatedAt).toBe("string");
    expect(saved.debt?.rateType).toBe("variable");

    const loaded = readExposureProfile();
    expect(loaded?.debt?.hasDebt).toBe(true);
    expect(loaded?.liquidity?.monthsOfCashBuffer).toBe("low");
    expect(fs.existsSync(resolveExposureProfilePath())).toBe(true);
  });

  it("rejects invalid profile shape", () => {
    expect(() => writeExposureProfile({
      debt: {
        rateType: "floating",
      },
    })).toThrow();
  });
});
