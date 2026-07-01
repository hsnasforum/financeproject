import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOpeningBalances, upsertOpeningBalance } from "../src/lib/planning/v3/store/openingBalancesStore";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningUserId = process.env.PLANNING_USER_ID;

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

    if (typeof originalNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;

    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;

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

  it("does not overwrite a corrupted opening balances file during upsert", async () => {
    const balancesPath = path.join(root, "planning-v3", "opening-balances.json");
    const corrupted = "{ broken opening balances json";
    fs.mkdirSync(path.dirname(balancesPath), { recursive: true });
    fs.writeFileSync(balancesPath, corrupted, "utf-8");

    await expect(upsertOpeningBalance("acc-a", "2026-03-01", 1000)).rejects.toMatchObject({
      name: "StorageCorruptedError",
    });

    expect(fs.readFileSync(balancesPath, "utf-8")).toBe(corrupted);
  });

  it("isolates opening balances by planning namespace when enabled", async () => {
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_USER_ID = "default";

    const aliceBalances = await runWithPlanningUserScope({ userId: "alice" }, async () => {
      await upsertOpeningBalance("acc-main", "2026-03-01", 1000);
      return getOpeningBalances();
    });

    const bobBalances = await runWithPlanningUserScope({ userId: "bob" }, async () => {
      await upsertOpeningBalance("acc-main", "2026-03-01", 2000);
      return getOpeningBalances();
    });

    expect(aliceBalances["acc-main"]?.amountKrw).toBe(1000);
    expect(bobBalances["acc-main"]?.amountKrw).toBe(2000);
    expect(fs.existsSync(path.join(root, "users", "alice", "planning-v3", "opening-balances.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "users", "bob", "planning-v3", "opening-balances.json"))).toBe(true);
  });
});
