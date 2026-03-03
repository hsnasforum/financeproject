import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOpeningBalances, upsertOpeningBalance } from "../src/lib/planning/v3/store/openingBalancesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 openingBalancesStore", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-opening-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("upsert/get is deterministic with sorted keys", async () => {
    await upsertOpeningBalance("acc-b", "2026-03-01", 2000);
    await upsertOpeningBalance("acc-a", "2026-03-01", 1000);

    const balances = await getOpeningBalances();
    expect(Object.keys(balances)).toEqual(["acc-a", "acc-b"]);
    expect(balances["acc-a"]).toEqual({
      accountId: "acc-a",
      asOfDate: "2026-03-01",
      amountKrw: 1000,
    });
  });

  it("upsert overwrites same account deterministically", async () => {
    await upsertOpeningBalance("acc-a", "2026-01-01", 1000);
    await upsertOpeningBalance("acc-a", "2026-02-01", 1500);

    const balances = await getOpeningBalances();
    expect(balances["acc-a"]).toEqual({
      accountId: "acc-a",
      asOfDate: "2026-02-01",
      amountKrw: 1500,
    });
  });
});
