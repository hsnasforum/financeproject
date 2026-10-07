import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planningBatchLifecycleErrorResponse } from "../src/lib/planning/api/batchLifecycleErrorResponse";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { upsertCurrentUserAccountMappingOverride } from "../src/lib/planning/v3/service/accountMappingOverridesRepository";
import { deleteCurrentUserStoredBatch } from "../src/lib/planning/v3/service/batchReadRepository";
import {
  BatchLifecycleMutationError,
} from "../src/lib/planning/v3/service/batchLifecycleMutation";
import { upsertCurrentUserBatchTxnOverride } from "../src/lib/planning/v3/service/batchTxnOverridesRepository";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { getStoredBatchCommandSurfaceState } from "../src/lib/planning/v3/service/storedBatchCommandSurface";
import { upsertCurrentUserTransactionOverride } from "../src/lib/planning/v3/service/transactionOverridesRepository";
import { upsertCurrentUserTransferOverride } from "../src/lib/planning/v3/service/txnTransferOverridesRepository";
import { getAccountMappingOverrides } from "../src/lib/planning/v3/store/accountMappingOverridesStore";
import { getBatchTxnOverrides } from "../src/lib/planning/v3/store/txnOverridesStore";
import { getTransferOverrides } from "../src/lib/planning/v3/store/txnTransferOverridesStore";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_USER_ID",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
}

async function inAliceScope<T>(callback: () => Promise<T> | T): Promise<T> {
  return await runWithPlanningUserScope({ userId: "alice", authSource: "test" }, callback);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function seedSyntheticStoredOnlyBatch(root: string, batchId: string, txnId: string): void {
  const filePath = path.join(root, "users", "alice", "planning-v3", "batches", `${batchId}.ndjson`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({
    batchId,
    txnId,
    date: "2026-08-01",
    amountKrw: -12000,
    description: "lunch",
    source: "csv",
  })}\n`, "utf8");
}

describe.sequential("planning v3 batch lifecycle mutation", () => {
  let root = "";

  beforeEach(() => {
    restoreEnv();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batch-lifecycle-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_SINGLE_USER_MODE = "0";
    env.PLANNING_USER_ID = "default";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function createBatch() {
    return inAliceScope(() => importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-08-01,-12000,lunch",
      ].join("\n"),
    }));
  }

  async function seedSidecars(batchId: string, txnId: string): Promise<void> {
    await inAliceScope(async () => {
      await upsertCurrentUserBatchTxnOverride({
        batchId,
        txnId,
        categoryId: "food",
      });
      await upsertCurrentUserAccountMappingOverride({
        batchId,
        txnId,
        accountId: "account-before",
      });
      await upsertCurrentUserTransferOverride({
        batchId,
        txnId,
        forceTransfer: true,
      });
    });
  }

  it("keeps a queued sidecar update after a failed delete rollback", async () => {
    const imported = await createBatch();
    const batchId = imported.batchMeta.id;
    const txnId = imported.transactions[0]?.txnId ?? "";
    expect(txnId).toBeTruthy();
    await seedSidecars(batchId, txnId);

    const batchFilePath = path.join(root, "users", "alice", "planning-v3", "batches", `${batchId}.ndjson`);
    const reachedBatchDelete = deferred();
    const releaseBatchDelete = deferred();
    const originalUnlink = fsPromises.unlink.bind(fsPromises);
    vi.spyOn(fsPromises, "unlink").mockImplementation(async (candidate) => {
      if (path.resolve(String(candidate)) === path.resolve(batchFilePath)) {
        reachedBatchDelete.resolve();
        await releaseBatchDelete.promise;
        throw Object.assign(new Error("injected batch unlink failure"), { code: "EACCES" });
      }
      return originalUnlink(candidate);
    });

    const deletion = inAliceScope(() => deleteCurrentUserStoredBatch(batchId));
    await reachedBatchDelete.promise;

    let mutationSettled = false;
    const mutation = inAliceScope(() => upsertCurrentUserAccountMappingOverride({
      batchId,
      txnId,
      accountId: "account-after",
    })).finally(() => {
      mutationSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mutationSettled).toBe(false);

    releaseBatchDelete.resolve();
    await expect(deletion).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    await expect(mutation).resolves.toMatchObject({ accountId: "account-after" });

    await inAliceScope(async () => {
      expect((await getAccountMappingOverrides(batchId))[txnId]?.accountId).toBe("account-after");
      expect((await getBatchTxnOverrides(batchId))[txnId]?.categoryId).toBe("food");
      expect((await getTransferOverrides(batchId))[txnId]?.forceTransfer).toBe(true);
      expect(await getStoredBatchCommandSurfaceState(batchId)).not.toBe("missing");
    });
  });

  it("rejects every queued sidecar mutation after a successful delete", async () => {
    const imported = await createBatch();
    const batchId = imported.batchMeta.id;
    const txnId = imported.transactions[0]?.txnId ?? "";
    expect(txnId).toBeTruthy();
    await seedSidecars(batchId, txnId);

    const batchFilePath = path.join(root, "users", "alice", "planning-v3", "batches", `${batchId}.ndjson`);
    const reachedBatchDelete = deferred();
    const releaseBatchDelete = deferred();
    const originalUnlink = fsPromises.unlink.bind(fsPromises);
    vi.spyOn(fsPromises, "unlink").mockImplementation(async (candidate) => {
      if (path.resolve(String(candidate)) === path.resolve(batchFilePath)) {
        reachedBatchDelete.resolve();
        await releaseBatchDelete.promise;
      }
      return originalUnlink(candidate);
    });

    const deletion = inAliceScope(() => deleteCurrentUserStoredBatch(batchId));
    await reachedBatchDelete.promise;

    const queuedMutations = [
      inAliceScope(() => upsertCurrentUserBatchTxnOverride({ batchId, txnId, categoryId: "housing" })),
      inAliceScope(() => upsertCurrentUserTransactionOverride({ batchId, txnId, categoryId: "education" })),
      inAliceScope(() => upsertCurrentUserAccountMappingOverride({ batchId, txnId, accountId: "account-after" })),
      inAliceScope(() => upsertCurrentUserTransferOverride({ batchId, txnId, forceNonTransfer: true })),
    ];

    releaseBatchDelete.resolve();
    await expect(deletion).resolves.toBeUndefined();
    const results = await Promise.allSettled(queuedMutations);
    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(BatchLifecycleMutationError);
        expect(result.reason).toMatchObject({ code: "NOT_FOUND" });
      }
    }

    await inAliceScope(async () => {
      expect(await getStoredBatchCommandSurfaceState(batchId)).toBe("missing");
      expect(await getBatchTxnOverrides(batchId)).toEqual({});
      expect(await getAccountMappingOverrides(batchId)).toEqual({});
      expect(await getTransferOverrides(batchId)).toEqual({});
    });

    const reimported = await createBatch();
    expect(reimported.batchMeta.id).toBe(batchId);
    await inAliceScope(async () => {
      expect(await getBatchTxnOverrides(batchId)).toEqual({});
      expect(await getAccountMappingOverrides(batchId)).toEqual({});
      expect(await getTransferOverrides(batchId)).toEqual({});
    });
  });

  it("keeps synthetic stored-only batches read-only while preserving explicit deletion", async () => {
    const batchId = "syntheticreadonly001";
    const txnId = "aaaaaaaaaaaaaaaa";
    seedSyntheticStoredOnlyBatch(root, batchId, txnId);

    const mutations = await Promise.allSettled([
      inAliceScope(() => upsertCurrentUserBatchTxnOverride({ batchId, txnId, categoryId: "food" })),
      inAliceScope(() => upsertCurrentUserTransactionOverride({ batchId, txnId, categoryId: "education" })),
      inAliceScope(() => upsertCurrentUserAccountMappingOverride({ batchId, txnId, accountId: "account-after" })),
      inAliceScope(() => upsertCurrentUserTransferOverride({ batchId, txnId, forceTransfer: true })),
    ]);

    for (const result of mutations) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(BatchLifecycleMutationError);
        expect(result.reason).toMatchObject({ code: "READ_ONLY" });
      }
    }

    const readOnlyResponse = planningBatchLifecycleErrorResponse(
      new BatchLifecycleMutationError("READ_ONLY", "synthetic stored-only batch is read-only"),
    );
    expect(readOnlyResponse?.status).toBe(400);
    await expect(readOnlyResponse?.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INPUT",
        message: "저장 메타가 없는 배치는 변경할 수 없습니다.",
      },
    });

    await inAliceScope(async () => {
      expect(await getStoredBatchCommandSurfaceState(batchId)).toBe("synthetic-stored-only");
      expect(await getBatchTxnOverrides(batchId)).toEqual({});
      expect(await getAccountMappingOverrides(batchId)).toEqual({});
      expect(await getTransferOverrides(batchId)).toEqual({});
      await expect(deleteCurrentUserStoredBatch(batchId)).resolves.toBeUndefined();
      expect(await getStoredBatchCommandSurfaceState(batchId)).toBe("missing");
    });
  });
});
