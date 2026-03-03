import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import {
  createDraftFromBatch,
  deleteProfileDraft,
  getProfileDraft,
  listProfileDrafts,
} from "../src/lib/planning/v3/store/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toStablePayload(input: Awaited<ReturnType<typeof createDraftFromBatch>>) {
  return {
    draftPatch: input.draftPatch,
    evidence: input.evidence,
    assumptions: input.assumptions,
    stats: input.stats,
  };
}

describe("planning v3 profile draft store", () => {
  let root = "";
  let accountId = "";
  let batchId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-draft-store-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    const account = await createAccount({ name: "Main", kind: "checking" });
    accountId = account.id;
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,3000000,salary",
        "2026-01-02,-1200000,rent",
        "2026-02-01,3200000,salary",
        "2026-02-02,-1100000,rent",
        "2026-03-01,3100000,salary",
        "2026-03-02,-1000000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "profile-draft-store.csv",
    });
    batchId = created.batch.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("createDraftFromBatch stores generated draft payload and round-trips", async () => {
    const created = await createDraftFromBatch(batchId);
    const found = await getProfileDraft(created.id);
    expect(found).toEqual(created);
    expect(toStablePayload(created)).toMatchSnapshot();
  });

  it("listProfileDrafts sorts by createdAt desc", async () => {
    const first = await createDraftFromBatch(batchId);
    await sleep(5);
    const second = await createDraftFromBatch(batchId);

    const rows = await listProfileDrafts();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.id).toBe(second.id);
    expect(rows[1]?.id).toBe(first.id);
  });

  it("returns null for missing profile draft id", async () => {
    const found = await getProfileDraft("d_missing_profile_draft");
    expect(found).toBeNull();
  });

  it("deleteProfileDraft removes stored draft", async () => {
    const created = await createDraftFromBatch(batchId);
    const deleted = await deleteProfileDraft(created.id);
    expect(deleted.deleted).toBe(true);
    const found = await getProfileDraft(created.id);
    expect(found).toBeNull();
  });

  it("keeps draftPatch/evidence deterministic for the same batch", async () => {
    const left = await createDraftFromBatch(batchId);
    const right = await createDraftFromBatch(batchId);
    expect(toStablePayload(left)).toEqual(toStablePayload(right));
  });
});

