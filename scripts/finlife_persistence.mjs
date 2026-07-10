import path from "node:path";

export const PRIORITY_KIND_ORDER = [
  "saving",
  "pension",
  "mortgage-loan",
  "rent-house-loan",
  "credit-loan",
  "deposit",
];

export const KIND_PRIORITY = new Map(
  PRIORITY_KIND_ORDER.map((kind, index) => [kind, index + 1]),
);

export class FinlifeSyncPersistenceError extends Error {
  constructor(kind, phase, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`FINLIFE ${kind} persistence failed (phase=${phase}): ${detail}`, { cause });
    this.name = "FinlifeSyncPersistenceError";
    this.kind = kind;
    this.phase = phase;
  }
}

function requireDependency(dependencies, name) {
  const dependency = dependencies?.[name];
  if (typeof dependency !== "function") {
    throw new Error(`FINLIFE persistence dependency is missing: ${name}`);
  }
  return dependency;
}

function normalizeSearchText(input) {
  return String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("주식회사", "")
    .replaceAll("(주)", "")
    .replaceAll("㈜", "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

function nonNegativeCount(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function nullableNonNegativeCount(value) {
  return value == null ? null : nonNegativeCount(value);
}

function nullableInteger(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Math.trunc(Number(value));
}

export async function writeFinlifeCompletionEvidence(input, dependencies = {}) {
  if (input.state !== "db-complete" && input.state !== "complete") {
    throw new Error(`Invalid FINLIFE completion evidence state: ${input.state}`);
  }
  const getPrismaClient = requireDependency(dependencies, "getPrismaClient");
  const prisma = await getPrismaClient();
  const dbCompletedAt = new Date(input.dbCompletedAt);
  if (!Number.isFinite(dbCompletedAt.getTime())) {
    throw new Error(`Invalid FINLIFE DB completion timestamp: ${input.dbCompletedAt}`);
  }
  const isComplete = input.state === "complete";
  const snapshotCompletedAt = isComplete ? new Date(input.snapshotCompletedAt) : null;
  if (isComplete && !Number.isFinite(snapshotCompletedAt.getTime())) {
    throw new Error(`Invalid FINLIFE snapshot completion timestamp: ${input.snapshotCompletedAt}`);
  }

  const ttlMs = Number.isFinite(Number(input.ttlMs)) && Number(input.ttlMs) > 0
    ? Math.trunc(Number(input.ttlMs))
    : 43_200_000;
  const fetchedItems = nonNegativeCount(input.fetchedItems);
  const productsUpserted = nonNegativeCount(input.dbSync?.productsUpserted);
  const observedAt = isComplete ? input.snapshotCompletedAt : input.dbCompletedAt;
  const provenance = input.provenance?.mode === "replay"
    ? {
        mode: "replay",
        replayFile: path.basename(String(input.provenance.replayFile || "unknown")),
        ...(Number.isFinite(Number(input.provenance.dumpSchemaVersion))
          ? { dumpSchemaVersion: Number(input.provenance.dumpSchemaVersion) }
          : {}),
      }
    : { mode: "live" };
  const metaJson = {
    evidenceType: "finlife-prisma-product-sync",
    completionState: isComplete ? "complete" : "db-complete",
    dbCompletedAt: input.dbCompletedAt,
    snapshotCompletedAt: isComplete ? input.snapshotCompletedAt : null,
    provenance,
    source: input.source === "mock" ? "mock" : "finlife",
    fallbackUsed: Boolean(input.fallbackUsed),
    ...(typeof input.snapshotGeneratedAt === "string" ? { snapshotGeneratedAt: input.snapshotGeneratedAt } : {}),
    ...(typeof input.completionRate === "number" ? { completionRate: input.completionRate } : {}),
    truncatedByHardCap: Boolean(input.truncatedByHardCap),
    lastAttemptAt: observedAt,
    lastRun: {
      startedAt: input.startedAt,
      ...(isComplete ? { finishedAt: input.snapshotCompletedAt } : {}),
      fetchedItems,
      upsertedItems: productsUpserted,
      touchedItems: productsUpserted,
      totalCount: fetchedItems,
      providersUpserted: nonNegativeCount(input.dbSync?.providersUpserted),
      optionsWritten: nonNegativeCount(input.dbSync?.optionsWritten),
      skippedCrossKindDuplicates: nonNegativeCount(input.dbSync?.skippedCrossKindDuplicates),
      replacedCrossKindDuplicates: nonNegativeCount(input.dbSync?.replacedCrossKindDuplicates),
      candidateItems: nonNegativeCount(input.dbSync?.candidateItems),
      inventoryItems: nullableNonNegativeCount(input.dbSync?.inventoryItems),
      inventoryDeltaItems: nullableInteger(input.dbSync?.inventoryDeltaItems),
      staleCandidateItems: nullableNonNegativeCount(input.dbSync?.staleCandidateItems),
      resultCode: isComplete ? "OK" : "DB_COMPLETED",
    },
    ...(isComplete ? { lastError: null } : {}),
  };

  const update = {
    ttlMs,
    metaJson,
    ...(isComplete ? { lastSyncedAt: snapshotCompletedAt } : {}),
  };

  return prisma.externalSourceSnapshot.upsert({
    where: {
      sourceId_kind: {
        sourceId: "finlife",
        kind: input.kind,
      },
    },
    update,
    create: {
      sourceId: "finlife",
      kind: input.kind,
      lastSyncedAt: isComplete ? snapshotCompletedAt : new Date(0),
      ttlMs,
      metaJson,
    },
  });
}

export async function syncFinlifeProductsToDb(kind, items, options = {}) {
  const getPrismaClient = requireDependency(options, "getPrismaClient");
  const prisma = await getPrismaClient();
  const priorityByKind = options.priorityByKind instanceof Map ? options.priorityByKind : KIND_PRIORITY;
  const currentPriority = priorityByKind.get(kind) ?? Number.MAX_SAFE_INTEGER;
  const normalizedItems = [];
  const seenCodes = new Set();
  for (const item of items) {
    const code = String(item?.fin_prdt_cd || "").trim();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    normalizedItems.push(item);
  }
  const existingRows = normalizedItems.length > 0
    ? await prisma.product.findMany({
        where: { finPrdtCd: { in: normalizedItems.map((row) => row.fin_prdt_cd) } },
        select: { finPrdtCd: true, kind: true },
      })
    : [];
  const existingByCode = new Map(existingRows.map((row) => [row.finPrdtCd, row.kind]));
  const candidateItems = normalizedItems.length;
  let providersUpserted = 0;
  let productsUpserted = 0;
  let optionsWritten = 0;
  let skippedCrossKindDuplicates = 0;
  let replacedCrossKindDuplicates = 0;

  for (const item of normalizedItems) {
    const finPrdtCd = String(item.fin_prdt_cd || "").trim();
    const existingKind = existingByCode.get(finPrdtCd);
    if (existingKind && existingKind !== kind) {
      const existingPriority = priorityByKind.get(existingKind) ?? Number.MAX_SAFE_INTEGER;
      if (existingPriority <= currentPriority) {
        skippedCrossKindDuplicates += 1;
        continue;
      }
      replacedCrossKindDuplicates += 1;
    }

    const providerName = String(item.kor_co_nm || "").trim();
    const productName = String(item.fin_prdt_nm || "").trim();
    const providerNameNorm = normalizeSearchText(providerName);
    const productNameNorm = normalizeSearchText(productName);
    const searchTextNorm = normalizeSearchText(`${providerName} ${productName}`);
    const providerCodeRaw = String(item.fin_co_no || "").trim();
    const providerCode = providerCodeRaw || `finlife:${providerNameNorm || "unknown"}`;
    const safeProviderName = providerName || providerCode;

    const provider = await prisma.provider.upsert({
      where: { code: providerCode },
      update: { name: safeProviderName },
      create: { code: providerCode, name: safeProviderName },
    });
    providersUpserted += 1;

    const product = await prisma.product.upsert({
      where: { finPrdtCd },
      update: {
        kind,
        name: productName || null,
        providerId: provider.id,
        providerNameNorm: providerNameNorm || null,
        productNameNorm: productNameNorm || null,
        searchTextNorm: searchTextNorm || null,
        raw: item.raw ?? null,
      },
      create: {
        finPrdtCd,
        kind,
        name: productName || null,
        providerId: provider.id,
        providerNameNorm: providerNameNorm || null,
        productNameNorm: productNameNorm || null,
        searchTextNorm: searchTextNorm || null,
        raw: item.raw ?? null,
      },
    });
    productsUpserted += 1;

    await prisma.productOption.deleteMany({ where: { productId: product.id } });
    if (Array.isArray(item.options) && item.options.length > 0) {
      await prisma.productOption.createMany({
        data: item.options.map((option) => ({
          productId: product.id,
          saveTrm: option.save_trm == null ? null : String(option.save_trm),
          intrRate: typeof option.intr_rate === "number" ? option.intr_rate : null,
          intrRate2: typeof option.intr_rate2 === "number" ? option.intr_rate2 : null,
          raw: option.raw ?? null,
        })),
      });
      optionsWritten += item.options.length;
    }
  }

  let inventoryItems = null;
  let inventoryDeltaItems = null;
  let staleCandidateItems = null;
  try {
    inventoryItems = nonNegativeCount(await prisma.product.count({ where: { kind } }));
    inventoryDeltaItems = inventoryItems - candidateItems;
    staleCandidateItems = Math.max(0, inventoryItems - productsUpserted);
  } catch {
    // Inventory diagnostics must not turn successful product writes into a failed sync.
  }

  return {
    providersUpserted,
    productsUpserted,
    optionsWritten,
    skippedCrossKindDuplicates,
    replacedCrossKindDuplicates,
    candidateItems,
    inventoryItems,
    inventoryDeltaItems,
    staleCandidateItems,
  };
}

export async function persistFinlifeSyncKind(input, dependencies = {}) {
  const syncProductsToDb = requireDependency(dependencies, "syncProductsToDb");
  const saveCompletionEvidence = requireDependency(dependencies, "writeCompletionEvidence");
  const saveSnapshot = requireDependency(dependencies, "writeSnapshot");
  const saveAttempt = requireDependency(dependencies, "writeSyncAttempt");
  const removeAttempt = requireDependency(dependencies, "clearSyncAttempt");
  const nowIso = dependencies.nowIso ?? (() => new Date().toISOString());
  const startedAt = nowIso();
  let dbSync;
  let dbCompletedAt;

  const recordAttempt = (status, phase, errorCode) => {
    saveAttempt(input.kind, {
      status,
      phase,
      startedAt,
      updatedAt: nowIso(),
      ...(errorCode ? { errorCode } : {}),
    });
  };
  const recordFailure = (phase, errorCode) => {
    try {
      recordAttempt("failed", phase, errorCode);
    } catch {
      return;
    }
  };

  try {
    recordAttempt("running", "db");
  } catch (error) {
    throw new FinlifeSyncPersistenceError(input.kind, "attempt", error);
  }

  try {
    dbSync = await syncProductsToDb(input.kind, input.snapshot.items, {
      priorityByKind: input.priorityByKind ?? KIND_PRIORITY,
    });
    dbCompletedAt = nowIso();
    await saveCompletionEvidence({
      state: "db-complete",
      kind: input.kind,
      ttlMs: input.snapshot.meta.ttlMs,
      startedAt,
      dbCompletedAt,
      fetchedItems: input.snapshot.items.length,
      snapshotGeneratedAt: input.snapshot.meta.generatedAt,
      completionRate: input.snapshot.meta.completionRate,
      truncatedByHardCap: input.snapshot.meta.truncatedByHardCap,
      source: input.snapshot.meta.source,
      fallbackUsed: input.snapshot.meta.fallbackUsed,
      provenance: input.provenance,
      dbSync,
    });
  } catch (error) {
    recordFailure("db", "DB_SYNC_FAILED");
    throw new FinlifeSyncPersistenceError(input.kind, "db", error);
  }

  try {
    recordAttempt("running", "snapshot");
  } catch (error) {
    throw new FinlifeSyncPersistenceError(input.kind, "attempt", error);
  }

  try {
    saveSnapshot(input.kind, input.snapshot);
  } catch (error) {
    recordFailure("snapshot", "SNAPSHOT_WRITE_FAILED");
    throw new FinlifeSyncPersistenceError(input.kind, "snapshot", error);
  }

  try {
    recordAttempt("running", "completion");
  } catch (error) {
    throw new FinlifeSyncPersistenceError(input.kind, "attempt", error);
  }

  try {
    await saveCompletionEvidence({
      state: "complete",
      kind: input.kind,
      ttlMs: input.snapshot.meta.ttlMs,
      startedAt,
      dbCompletedAt,
      snapshotCompletedAt: nowIso(),
      fetchedItems: input.snapshot.items.length,
      snapshotGeneratedAt: input.snapshot.meta.generatedAt,
      completionRate: input.snapshot.meta.completionRate,
      truncatedByHardCap: input.snapshot.meta.truncatedByHardCap,
      source: input.snapshot.meta.source,
      fallbackUsed: input.snapshot.meta.fallbackUsed,
      provenance: input.provenance,
      dbSync,
    });
  } catch (error) {
    recordFailure("completion", "COMPLETION_WRITE_FAILED");
    throw new FinlifeSyncPersistenceError(input.kind, "completion", error);
  }

  try {
    removeAttempt(input.kind);
  } catch (error) {
    throw new FinlifeSyncPersistenceError(input.kind, "attempt", error);
  }

  return {
    dbSync,
    snapshotWritten: true,
  };
}
