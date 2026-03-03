import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  upsertAccount,
  updateAccount,
} from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 accountsStore", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-accounts-"));
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

  it("creates/lists/updates/deletes accounts deterministically", async () => {
    const first = await createAccount({
      name: "Main Checking",
      kind: "checking",
      note: "primary",
      startingBalanceKrw: 100000,
    });
    const second = await createAccount({
      name: "Card A",
      kind: "card",
    });

    const listed = await listAccounts();
    expect(listed.map((row) => row.name)).toEqual(["Card A", "Main Checking"]);
    expect(listed.every((row) => row.currency === "KRW")).toBe(true);
    expect(listed.find((row) => row.id === first.id)?.startingBalanceKrw).toBe(100000);

    const updated = await updateAccount(first.id, {
      name: "Main Account",
      kind: "saving",
      note: "",
      startingBalanceKrw: -25000,
    });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Main Account");
    expect(updated?.kind).toBe("saving");
    expect(updated?.note).toBeUndefined();
    expect(updated?.startingBalanceKrw).toBe(-25000);

    const deleted = await deleteAccount(second.id);
    expect(deleted).toBe(true);
    const afterDelete = await listAccounts();
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.id).toBe(first.id);
  });

  it("upsert keeps deterministic ordering and stable ids", async () => {
    const first = await upsertAccount({
      accountId: "acc-z",
      name: "Z Account",
      kind: "bank",
    });
    const second = await upsertAccount({
      accountId: "acc-a",
      name: "A Account",
      kind: "card",
    });

    const listed = await listAccounts();
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);

    const updated = await upsertAccount({
      accountId: "acc-z",
      name: "Z Account Updated",
      kind: "broker",
    });
    expect(updated.id).toBe("acc-z");
    expect(updated.name).toBe("Z Account Updated");
  });
});
