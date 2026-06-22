#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const MANIFEST_VERSION = 1;
const DEFAULT_DATA_DIR = ".data/planning";
const DEFAULT_SQLITE_SCHEMA = "prisma/schema.prisma";
const DEFAULT_POSTGRES_SCHEMA = "prisma/schema.postgres.prisma";
const APPLY_CONFIRM = "APPLY POSTGRES READINESS";
const LEGACY_DRY_RUN_USER_ID = "legacy";
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u;
const SAFE_USER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const options = {
    mode: "dry-run",
    dataDir: asString(process.env.PLANNING_DATA_DIR) || DEFAULT_DATA_DIR,
    outDir: "",
    sqliteSchema: DEFAULT_SQLITE_SCHEMA,
    postgresSchema: DEFAULT_POSTGRES_SCHEMA,
    confirm: "",
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }
    if (arg === "--apply") {
      options.mode = "apply";
      continue;
    }
    if (arg.startsWith("--data-dir=")) {
      options.dataDir = arg.slice("--data-dir=".length).trim();
      continue;
    }
    if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length).trim();
      continue;
    }
    if (arg.startsWith("--sqlite-schema=")) {
      options.sqliteSchema = arg.slice("--sqlite-schema=".length).trim();
      continue;
    }
    if (arg.startsWith("--postgres-schema=")) {
      options.postgresSchema = arg.slice("--postgres-schema=".length).trim();
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      options.confirm = arg.slice("--confirm=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.dataDir) throw new Error("Missing --data-dir");
  if (!options.sqliteSchema) throw new Error("Missing --sqlite-schema");
  if (!options.postgresSchema) throw new Error("Missing --postgres-schema");
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/planning_postgres_readiness.mjs [--dry-run] [--data-dir=.data/planning] [--out-dir=tmp/planning-postgres-readiness]

Builds a PostgreSQL migration readiness manifest for the current SQLite schema
and planning file-store, optionally exports a checksum-verifiable dry-run bundle.

Confirmed apply is intentionally blocked until the PostgreSQL apply path exists.
If apply mode is requested, it must use --confirm="${APPLY_CONFIRM}" and exits
with a non-zero status.`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readFileHash(filePath) {
  const bytes = await fs.readFile(filePath);
  return {
    bytes,
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function normalizeRelPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isSubpath(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function schemaProvider(schemaText) {
  const match = /datasource\s+\w+\s+\{[\s\S]*?provider\s*=\s*"([^"]+)"/u.exec(schemaText);
  return match?.[1] ?? "";
}

function modelNames(schemaText) {
  return [...schemaText.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
}

async function schemaSummary(root, schemaPath) {
  const absolutePath = path.resolve(root, schemaPath);
  const { bytes, byteSize, sha256: hash } = await readFileHash(absolutePath);
  const text = bytes.toString("utf-8");
  return {
    path: normalizeRelPath(path.relative(root, absolutePath)),
    provider: schemaProvider(text),
    modelCount: modelNames(text).length,
    sha256: hash,
    byteSize,
  };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootDir) {
  if (!await pathExists(rootDir)) return [];
  const out = [];

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(absolutePath);
    }
  }

  await visit(rootDir);
  out.sort((a, b) => normalizeRelPath(path.relative(rootDir, a)).localeCompare(
    normalizeRelPath(path.relative(rootDir, b)),
  ));
  return out;
}

async function buildSourceFileEntries(dataDir) {
  const files = await listFilesRecursive(dataDir);
  const entries = [];
  for (const filePath of files) {
    const { byteSize, sha256: hash } = await readFileHash(filePath);
    entries.push({
      path: normalizeRelPath(path.relative(dataDir, filePath)),
      byteSize,
      sha256: hash,
    });
  }
  return entries;
}

function manifestChecksum(input) {
  return sha256(Buffer.from(JSON.stringify(input), "utf-8"));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeRecordId(value, field) {
  const text = asString(value);
  if (!SAFE_ID_PATTERN.test(text)) throw new Error(`${field}: invalid record id`);
  return text;
}

function sanitizePlanningUserId(value, field) {
  const text = asString(value);
  if (!SAFE_USER_ID_PATTERN.test(text)) throw new Error(`${field}: invalid planning user id`);
  return text;
}

function safeIntegerToDbString(value, field) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${field}: expected a finite integer number`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field}: exceeds the safe integer range of the public number API contract`);
  }
  return BigInt(value).toString();
}

function nullableSafeIntegerToDbString(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return safeIntegerToDbString(Number(value), field);
}

function normalizeIsoDate(value, fallback) {
  const raw = asString(value);
  const date = raw ? new Date(raw) : new Date(fallback);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toISOString();
}

function normalizeDateOnly(value, field) {
  const text = asString(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (!match) throw new Error(`${field}: expected YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${field}: invalid calendar date`);
  }
  return date.toISOString();
}

function normalizeAccountKind(value) {
  const normalized = asString(value).toLowerCase();
  return normalized || "bank";
}

function parseJsonBytes(bytes, filePath) {
  try {
    return JSON.parse(bytes.toString("utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: invalid JSON (${message})`);
  }
}

function planningV3Target(entryPath) {
  const parts = entryPath.split("/");
  if (parts[0] === "users" && parts.length >= 4 && parts[2] === "planning-v3") {
    return {
      userId: sanitizePlanningUserId(parts[1], `${entryPath}.userId`),
      subPath: parts.slice(3).join("/"),
    };
  }
  if (parts[0] === "planning-v3" && parts.length >= 2) {
    return {
      userId: LEGACY_DRY_RUN_USER_ID,
      subPath: parts.slice(1).join("/"),
    };
  }
  return null;
}

function normalizeAccount(value, filePath) {
  if (!isRecord(value)) return null;
  const id = sanitizeRecordId(asString(value.id) || asString(value.accountId), `${filePath}.id`);
  const name = asString(value.name)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  const note = asString(value.note)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id,
    name: name.slice(0, 80),
    kind: normalizeAccountKind(value.kind),
    currency: "KRW",
    createdAt: normalizeIsoDate(value.createdAt, new Date(0).toISOString()),
    ...(note ? { note: note.slice(0, 200) } : {}),
    ...(value.startingBalanceKrw !== undefined && value.startingBalanceKrw !== null
      ? { startingBalanceKrw: Number(value.startingBalanceKrw) }
      : {}),
  };
}

function parseAccountsState(parsed, filePath) {
  const rawItems = isRecord(parsed) && Array.isArray(parsed.items)
    ? parsed.items
    : (Array.isArray(parsed) ? parsed : []);
  const items = [];
  let skipped = 0;
  for (const item of rawItems) {
    const normalized = normalizeAccount(item, filePath);
    if (normalized) {
      items.push(normalized);
    } else {
      skipped += 1;
    }
  }
  return { items, skipped };
}

function normalizeOpeningBalance(value, filePath) {
  if (!isRecord(value)) return null;
  return {
    accountId: sanitizeRecordId(value.accountId, `${filePath}.accountId`),
    asOfDate: asString(value.asOfDate),
    amountKrw: Number(value.amountKrw),
  };
}

function parseOpeningBalancesState(parsed, filePath) {
  if (!isRecord(parsed) || !isRecord(parsed.items)) return { items: [], skipped: 0 };
  const items = [];
  let skipped = 0;
  for (const [accountId, value] of Object.entries(parsed.items)) {
    const candidate = isRecord(value) ? { ...value, accountId: value.accountId ?? accountId } : value;
    const normalized = normalizeOpeningBalance(candidate, `${filePath}.${accountId}`);
    if (normalized) {
      items.push(normalized);
    } else {
      skipped += 1;
    }
  }
  return { items, skipped };
}

function toFinancialAccountRow(account, owner) {
  const now = owner.now;
  return {
    id: account.id,
    userId: owner.userId,
    planningProfileId: null,
    name: account.name,
    accountType: account.kind,
    institution: null,
    balanceKrw: nullableSafeIntegerToDbString(account.startingBalanceKrw, "financialAccount.balanceKrw"),
    currency: account.currency,
    rawJson: {
      source: "planning-v3-account",
      ...(account.note ? { note: account.note } : {}),
      ...(account.createdAt ? { createdAt: account.createdAt } : {}),
    },
    createdAt: normalizeIsoDate(account.createdAt, now),
    updatedAt: now,
  };
}

function toOpeningBalanceRow(balance, owner) {
  return {
    id: `opening:${owner.userId}:${balance.accountId}:${balance.asOfDate}`,
    userId: owner.userId,
    planningProfileId: null,
    financialAccountId: balance.accountId,
    asOfDate: normalizeDateOnly(balance.asOfDate, "openingBalance.asOfDate"),
    amountKrw: safeIntegerToDbString(balance.amountKrw, "openingBalance.amountKrw"),
    createdAt: owner.now,
    updatedAt: owner.now,
  };
}

function emptyApplyState() {
  return {
    financialAccounts: new Map(),
    openingBalances: new Map(),
  };
}

function cloneApplyState(state) {
  return {
    financialAccounts: new Map(state.financialAccounts),
    openingBalances: new Map(state.openingBalances),
  };
}

function serializeApplyState(state) {
  return JSON.stringify({
    financialAccounts: [...state.financialAccounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    openingBalances: [...state.openingBalances.entries()].sort(([left], [right]) => left.localeCompare(right)),
  });
}

function applyOperation(state, operation) {
  if (operation.table === "financialAccounts") {
    state.financialAccounts.set(operation.key, operation.row);
    return;
  }
  if (operation.table === "openingBalances") {
    state.openingBalances.set(operation.key, operation.row);
    return;
  }
  throw new Error(`Unknown dry-run apply table: ${operation.table}`);
}

function applyOperationsWithRollback(state, operations, options = {}) {
  const rollbackDigest = serializeApplyState(state);
  const working = cloneApplyState(state);
  let applied = 0;
  try {
    for (const operation of operations) {
      applyOperation(working, operation);
      applied += 1;
      if (options.failAfter !== undefined && applied >= options.failAfter) {
        throw new Error(`Injected dry-run apply failure after ${applied} operation(s)`);
      }
    }
    return {
      status: "COMMITTED",
      state: working,
      applied,
      rolledBack: false,
      rollbackDigestUnchanged: true,
    };
  } catch (error) {
    return {
      status: "ROLLED_BACK",
      state,
      applied,
      rolledBack: true,
      rollbackDigestUnchanged: serializeApplyState(state) === rollbackDigest,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildDryRunApplyOperations(root, options, manifest, exported) {
  const filesRoot = exported.written && exported.filesRoot
    ? path.resolve(root, exported.filesRoot)
    : path.resolve(root, options.dataDir);
  const now = new Date(0).toISOString();
  const operations = [];
  let skippedRecords = 0;
  let targetedFiles = 0;

  for (const entry of manifest.files) {
    const target = planningV3Target(entry.path);
    if (!target || (target.subPath !== "accounts.json" && target.subPath !== "opening-balances.json")) continue;
    targetedFiles += 1;
    const filePath = path.join(filesRoot, ...entry.path.split("/"));
    const parsed = parseJsonBytes(await fs.readFile(filePath), entry.path);
    const owner = { userId: target.userId, now };

    if (target.subPath === "accounts.json") {
      const state = parseAccountsState(parsed, entry.path);
      skippedRecords += state.skipped;
      for (const account of state.items) {
        const row = toFinancialAccountRow(account, owner);
        operations.push({
          table: "financialAccounts",
          key: `${row.userId}:${row.id}`,
          row,
        });
      }
      continue;
    }

    const state = parseOpeningBalancesState(parsed, entry.path);
    skippedRecords += state.skipped;
    for (const balance of state.items) {
      const row = toOpeningBalanceRow(balance, owner);
      operations.push({
        table: "openingBalances",
        key: `${row.userId}:${row.financialAccountId}:${row.asOfDate}`,
        row,
      });
    }
  }

  return { operations, targetedFiles, skippedRecords };
}

function simulateDryRunApply(operations) {
  const initial = emptyApplyState();
  const first = applyOperationsWithRollback(initial, operations);
  if (first.status !== "COMMITTED") {
    return {
      ok: false,
      operations: operations.length,
      tableCounts: {
        financialAccounts: 0,
        openingBalances: 0,
      },
      idempotentUpsert: false,
      rollbackOnFailure: false,
      rollbackProbe: {
        status: "FAIL",
        reason: first.error ?? "initial_apply_failed",
      },
    };
  }

  const firstDigest = serializeApplyState(first.state);
  const second = applyOperationsWithRollback(first.state, operations);
  const secondDigest = serializeApplyState(second.state);
  const rollbackProbe = operations.length > 0
    ? applyOperationsWithRollback(initial, operations, { failAfter: 1 })
    : null;
  const rollbackOk = rollbackProbe === null
    || (rollbackProbe.status === "ROLLED_BACK" && rollbackProbe.rolledBack && rollbackProbe.rollbackDigestUnchanged);
  const idempotentUpsert = second.status === "COMMITTED" && firstDigest === secondDigest;
  const rollbackExercised = rollbackProbe !== null;

  return {
    ok: idempotentUpsert && (rollbackExercised ? rollbackOk : true),
    operations: operations.length,
    tableCounts: {
      financialAccounts: first.state.financialAccounts.size,
      openingBalances: first.state.openingBalances.size,
    },
    idempotentUpsert,
    rollbackOnFailure: rollbackExercised ? rollbackOk : false,
    rollbackProbe: rollbackProbe === null
      ? { status: "SKIPPED", reason: "no_target_operations" }
      : {
        status: rollbackOk ? "PASS" : "FAIL",
        injectedAfter: 1,
        appliedBeforeFailure: rollbackProbe.applied,
        rollbackDigestUnchanged: rollbackProbe.rollbackDigestUnchanged,
      },
  };
}

async function buildManifest(root, options) {
  const dataDir = path.resolve(root, options.dataDir);
  const sqlite = await schemaSummary(root, options.sqliteSchema);
  const postgres = await schemaSummary(root, options.postgresSchema);
  const files = await buildSourceFileEntries(dataDir);
  const checksumInput = {
    schema: { sqlite, postgres },
    files,
  };

  return {
    kind: "planning-postgres-readiness",
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    root: normalizeRelPath(path.relative(root, dataDir)) || ".",
    schema: {
      sqlite,
      postgres,
    },
    files,
    counts: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.byteSize, 0),
    },
    checksum: manifestChecksum(checksumInput),
  };
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function removePathIfExists(filePath) {
  await fs.rm(filePath, { recursive: true, force: true });
}

async function exportDryRunBundle(root, options, manifest) {
  if (!options.outDir) {
    return {
      written: false,
      manifestPath: "",
      filesRoot: "",
      files: manifest.files,
      checksum: manifest.checksum,
    };
  }

  const dataDir = path.resolve(root, options.dataDir);
  const outDir = path.resolve(root, options.outDir);
  if (outDir === dataDir || isSubpath(dataDir, outDir) || isSubpath(outDir, dataDir)) {
    throw new Error("--out-dir must be outside --data-dir");
  }

  const filesRoot = path.join(outDir, "files");
  const exportManifestPath = path.join(outDir, "manifest.json");
  const exportToken = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
  const stagingFilesRoot = path.join(outDir, `.files.tmp-${exportToken}`);
  const stagingManifestPath = path.join(outDir, `manifest.json.tmp-${exportToken}`);
  let committed = false;

  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir(stagingFilesRoot, { recursive: true });
    for (const entry of manifest.files) {
      const sourcePath = path.join(dataDir, ...entry.path.split("/"));
      const targetPath = path.join(stagingFilesRoot, ...entry.path.split("/"));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath, fsSync.constants.COPYFILE_FICLONE);
    }

    await writeJsonAtomic(stagingManifestPath, manifest);
    const exportedFiles = await buildSourceFileEntries(stagingFilesRoot);
    const checksum = manifestChecksum({
      schema: manifest.schema,
      files: exportedFiles,
    });

    await removePathIfExists(filesRoot);
    await fs.rename(stagingFilesRoot, filesRoot);
    await fs.rename(stagingManifestPath, exportManifestPath);
    committed = true;

    return {
      written: true,
      manifestPath: normalizeRelPath(path.relative(root, exportManifestPath)),
      filesRoot: normalizeRelPath(path.relative(root, filesRoot)),
      files: exportedFiles,
      checksum,
    };
  } finally {
    if (!committed) {
      await removePathIfExists(stagingFilesRoot);
      await removePathIfExists(stagingManifestPath);
    }
  }
}

async function buildDryRunApplyPlan(root, options, manifest, exported) {
  const schemaReady = manifest.schema.sqlite.provider === "sqlite"
    && manifest.schema.postgres.provider === "postgresql"
    && manifest.schema.sqlite.modelCount === 14
    && manifest.schema.postgres.modelCount === 28;
  const checksumOk = manifest.checksum === exported.checksum;
  const sourceFilesMatchExport = JSON.stringify(manifest.files) === JSON.stringify(exported.files);
  const { operations, targetedFiles, skippedRecords } = await buildDryRunApplyOperations(root, options, manifest, exported);
  const applySimulation = simulateDryRunApply(operations);

  return {
    sourceMutation: false,
    confirmedApply: {
      available: false,
      reason: "postgres_apply_not_implemented",
      requiredConfirm: APPLY_CONFIRM,
    },
    steps: [
      {
        name: "manifest",
        status: "PASS",
        fileCount: manifest.counts.files,
        checksum: manifest.checksum,
      },
      {
        name: "export",
        status: exported.written ? "PASS" : "SKIPPED",
        reason: exported.written ? undefined : "out_dir_not_provided",
        manifestPath: exported.manifestPath || undefined,
      },
      {
        name: "dry-run-apply",
        status: schemaReady && applySimulation.ok ? "PASS" : "FAIL",
        sqliteModels: manifest.schema.sqlite.modelCount,
        postgresModels: manifest.schema.postgres.modelCount,
        targetedFiles,
        skippedRecords,
        operations: applySimulation.operations,
        targetTables: applySimulation.tableCounts,
        idempotentUpsert: applySimulation.idempotentUpsert,
        rollbackOnFailure: applySimulation.rollbackOnFailure,
        rollbackProbe: applySimulation.rollbackProbe,
      },
      {
        name: "checksum-compare",
        status: checksumOk && sourceFilesMatchExport ? "PASS" : "FAIL",
        sourceManifestChecksum: manifest.checksum,
        exportManifestChecksum: exported.checksum,
      },
    ],
  };
}

async function run() {
  const root = path.resolve(process.cwd());
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  if (options.mode === "apply") {
    if (options.confirm !== APPLY_CONFIRM) {
      console.error(`[planning:postgres:readiness] confirm mismatch (required: "${APPLY_CONFIRM}")`);
      return 1;
    }
    console.error("[planning:postgres:readiness] confirmed apply is not implemented; run dry-run and checksum gates only.");
    return 1;
  }

  const manifest = await buildManifest(root, options);
  const exported = await exportDryRunBundle(root, options, manifest);
  const dryRunApply = await buildDryRunApplyPlan(root, options, manifest, exported);
  const hasFailure = dryRunApply.steps.some((step) => step.status === "FAIL");

  console.log(JSON.stringify({
    ok: !hasFailure,
    mode: "dry-run",
    manifest,
    export: {
      written: exported.written,
      manifestPath: exported.manifestPath || null,
      filesRoot: exported.filesRoot || null,
    },
    dryRunApply,
  }, null, 2));

  return hasFailure ? 1 : 0;
}

run()
  .then((code) => {
    if (typeof code === "number" && code !== 0) process.exit(code);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:postgres:readiness] FAIL\n${message}`);
    process.exit(1);
  });
