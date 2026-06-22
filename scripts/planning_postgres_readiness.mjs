#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const MANIFEST_VERSION = 1;
const DEFAULT_DATA_DIR = ".data/planning";
const DEFAULT_SQLITE_SCHEMA = "prisma/schema.prisma";
const DEFAULT_POSTGRES_SCHEMA = "prisma/schema.postgres.prisma";
const APPLY_CONFIRM = "APPLY POSTGRES READINESS";
const DATABASE_URL_ENV = "DATABASE_URL";
const DB_CONNECTION_TIMEOUT_MS = 10_000;
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
    checkDbConnection: false,
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
    if (arg === "--check-db-connection") {
      options.checkDbConnection = true;
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
       node scripts/planning_postgres_readiness.mjs --apply --confirm="${APPLY_CONFIRM}" [--check-db-connection]

Builds a PostgreSQL migration readiness manifest for the current SQLite schema
and planning file-store, optionally exports a checksum-verifiable dry-run bundle.

Confirmed apply is intentionally blocked until the PostgreSQL apply path exists.
If apply mode is requested, it must use --confirm="${APPLY_CONFIRM}", runs the
same preflight evidence gates, requires ${DATABASE_URL_ENV} to point at a
postgresql:// or postgres:// target, and exits with a non-zero status.
Use --check-db-connection only with a disposable PostgreSQL target; it sends
SELECT 1 through Prisma db execute and records the result without applying data.`);
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

function resolvePrismaBin(root) {
  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  return path.join(root, "node_modules", ".bin", binName);
}

function compactProcessOutput(stdout, stderr) {
  const lines = `${stdout ?? ""}\n${stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-4).join(" | ");
}

function validatePrismaSchema(root, schemaPath) {
  const prismaBin = resolvePrismaBin(root);
  const absoluteSchemaPath = path.resolve(root, schemaPath);
  const relativeSchemaPath = normalizeRelPath(path.relative(root, absoluteSchemaPath));
  if (!fsSync.existsSync(prismaBin)) {
    return {
      status: "FAIL",
      schemaPath: relativeSchemaPath,
      reason: "prisma_binary_missing",
    };
  }

  const result = spawnSync(prismaBin, ["validate", "--schema", absoluteSchemaPath], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });

  return {
    status: result.status === 0 ? "PASS" : "FAIL",
    schemaPath: relativeSchemaPath,
    exitCode: typeof result.status === "number" ? result.status : 1,
    ...(result.status === 0 ? {} : { message: compactProcessOutput(result.stdout, result.stderr) }),
  };
}

function analyzePostgresSchemaSql(sql, expectedModelCount) {
  const requiredTables = [
    "User",
    "Account",
    "PlanningProfile",
    "PlanningRun",
    "FinancialAccount",
    "Debt",
    "TransactionBatch",
    "Transaction",
    "OpeningBalance",
    "ExternalProduct",
  ];
  const tableChecks = Object.fromEntries(requiredTables.map((table) => [
    table,
    new RegExp(`^CREATE TABLE "${table}"`, "mu").test(sql) ? "PASS" : "FAIL",
  ]));
  const createTableCount = sql.match(/^CREATE TABLE /gmu)?.length ?? 0;
  const hasRequiredTables = Object.values(tableChecks).every((status) => status === "PASS");
  const hasBigInt = /\bBIGINT\b/iu.test(sql);
  const hasDecimal = /\bDECIMAL\s*\(/iu.test(sql);
  const hasJsonb = /\bJSONB\b/iu.test(sql);
  const hasForeignKeys = /^ALTER TABLE ".+" ADD CONSTRAINT ".+_fkey" FOREIGN KEY/mu.test(sql);
  const hasSQLiteMarkers = /\bAUTOINCREMENT\b|\bINTEGER PRIMARY KEY\b/iu.test(sql);

  return {
    status: createTableCount === expectedModelCount
      && hasRequiredTables
      && hasBigInt
      && hasDecimal
      && hasJsonb
      && hasForeignKeys
      && !hasSQLiteMarkers
      ? "PASS"
      : "FAIL",
    createTableCount,
    expectedCreateTableCount: expectedModelCount,
    requiredTables: tableChecks,
    columnTypes: {
      bigInt: hasBigInt ? "PASS" : "FAIL",
      decimal: hasDecimal ? "PASS" : "FAIL",
      jsonb: hasJsonb ? "PASS" : "FAIL",
    },
    foreignKeys: hasForeignKeys ? "PASS" : "FAIL",
    sqliteMarkers: hasSQLiteMarkers ? "FAIL" : "PASS",
  };
}

function generatePostgresSchemaSql(root, schemaPath, expectedModelCount) {
  const prismaBin = resolvePrismaBin(root);
  const absoluteSchemaPath = path.resolve(root, schemaPath);
  const relativeSchemaPath = normalizeRelPath(path.relative(root, absoluteSchemaPath));
  if (!fsSync.existsSync(prismaBin)) {
    return {
      status: "FAIL",
      schemaPath: relativeSchemaPath,
      reason: "prisma_binary_missing",
    };
  }

  const result = spawnSync(prismaBin, [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    absoluteSchemaPath,
    "--script",
  ], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });

  if (result.status !== 0) {
    return {
      status: "FAIL",
      schemaPath: relativeSchemaPath,
      exitCode: typeof result.status === "number" ? result.status : 1,
      message: compactProcessOutput(result.stdout, result.stderr),
    };
  }

  const sql = String(result.stdout ?? "");
  const analysis = analyzePostgresSchemaSql(sql, expectedModelCount);
  return {
    status: analysis.status,
    schemaPath: relativeSchemaPath,
    command: "prisma migrate diff --from-empty --to-schema <schema> --script",
    byteSize: Buffer.byteLength(sql, "utf-8"),
    sha256: sha256(Buffer.from(sql, "utf-8")),
    analysis,
  };
}

function readEnvValue(root, name) {
  const direct = asString(process.env[name]);
  if (direct) return { value: direct, source: "process.env" };

  for (const fileName of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!fsSync.existsSync(filePath)) continue;
    const parsed = dotenv.parse(fsSync.readFileSync(filePath));
    const value = asString(parsed[name]);
    if (value) return { value, source: fileName };
  }

  return { value: "", source: "unset" };
}

function redactDatabaseUrl(parsed) {
  const protocol = parsed.protocol.replace(/:$/u, "");
  const auth = parsed.username || parsed.password ? "<redacted>@" : "";
  return `${protocol}://${auth}${parsed.host}${parsed.pathname}`;
}

function databaseNameFromUrl(parsed) {
  return decodeURIComponent(parsed.pathname.replace(/^\/+/u, "")).split("/")[0] || null;
}

function evaluatePostgresDatabaseTarget(root) {
  const env = readEnvValue(root, DATABASE_URL_ENV);
  if (!env.value) {
    return {
      status: "FAIL",
      envName: DATABASE_URL_ENV,
      source: env.source,
      reason: "missing_database_url",
    };
  }

  let parsed;
  try {
    parsed = new URL(env.value);
  } catch {
    return {
      status: "FAIL",
      envName: DATABASE_URL_ENV,
      source: env.source,
      reason: "invalid_database_url",
    };
  }

  const protocol = parsed.protocol.replace(/:$/u, "");
  if (protocol !== "postgresql" && protocol !== "postgres") {
    return {
      status: "FAIL",
      envName: DATABASE_URL_ENV,
      source: env.source,
      reason: "unsupported_database_protocol",
      protocol,
    };
  }

  return {
    status: "PASS",
    envName: DATABASE_URL_ENV,
    source: env.source,
    protocol,
    host: parsed.host,
    database: databaseNameFromUrl(parsed),
    redactedUrl: redactDatabaseUrl(parsed),
  };
}

function redactKnownSecrets(text, secrets) {
  let redacted = String(text ?? "");
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join("<redacted>");
  }
  return redacted;
}

function databaseUrlSecrets(rawUrl) {
  if (!rawUrl) return [];
  try {
    const parsed = new URL(rawUrl);
    return [
      rawUrl,
      parsed.password,
      decodeURIComponent(parsed.password),
    ].filter(Boolean);
  } catch {
    return [rawUrl];
  }
}

function checkPostgresDatabaseConnection(root, databaseTarget, databaseUrl) {
  if (databaseTarget.status !== "PASS") {
    return {
      status: "SKIPPED",
      reason: "database_target_failed",
    };
  }

  const prismaBin = resolvePrismaBin(root);
  if (!fsSync.existsSync(prismaBin)) {
    return {
      status: "FAIL",
      reason: "prisma_binary_missing",
    };
  }

  const result = spawnSync(prismaBin, ["db", "execute", "--stdin"], {
    cwd: root,
    encoding: "utf-8",
    input: "SELECT 1;\n",
    timeout: DB_CONNECTION_TIMEOUT_MS,
    env: {
      ...process.env,
      [DATABASE_URL_ENV]: databaseUrl,
      NO_COLOR: "1",
    },
  });
  const secrets = databaseUrlSecrets(databaseUrl);
  const message = redactKnownSecrets(compactProcessOutput(result.stdout, result.stderr), secrets);

  if (result.error) {
    const errorCode = result.error.code ?? "";
    return {
      status: "FAIL",
      reason: errorCode === "ETIMEDOUT" ? "connection_check_timeout" : "connection_check_error",
      timeoutMs: DB_CONNECTION_TIMEOUT_MS,
      message: redactKnownSecrets(result.error.message, secrets),
    };
  }

  if (result.status !== 0) {
    return {
      status: "FAIL",
      reason: "connection_check_failed",
      exitCode: typeof result.status === "number" ? result.status : 1,
      timeoutMs: DB_CONNECTION_TIMEOUT_MS,
      ...(message ? { message } : {}),
    };
  }

  return {
    status: "PASS",
    command: "prisma db execute --stdin",
    statement: "SELECT 1",
    timeoutMs: DB_CONNECTION_TIMEOUT_MS,
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

function batchIdFromTransactionsSubPath(subPath) {
  if (!subPath.startsWith("batches/") || !subPath.endsWith(".ndjson")) return "";
  const fileName = subPath.slice("batches/".length, -".ndjson".length);
  return sanitizeRecordId(fileName, `${subPath}.batchId`);
}

function planningDbId(kind, owner, sourceId) {
  const digest = sha256(Buffer.from(`${kind}:${owner.userId}:${sourceId}`, "utf-8")).slice(0, 32);
  return `planning_${kind}_${digest}`;
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

function normalizeBatchMonth(value) {
  const text = asString(value);
  return /^\d{4}-\d{2}$/u.test(text) ? text : "";
}

function monthBoundaryIsoDate(value, boundary, field) {
  const month = normalizeBatchMonth(value);
  if (!month) return null;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = boundary === "end"
    ? new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
    : 1;
  return normalizeDateOnly(`${month}-${String(day).padStart(2, "0")}`, field);
}

function normalizeBatchMeta(value, filePath) {
  if (!isRecord(value)) return null;
  const id = sanitizeRecordId(value.id, `${filePath}.id`);
  const source = asString(value.source);
  if (source !== "csv") return null;
  const rowCount = Math.max(0, Math.trunc(Number(value.rowCount) || 0));
  const sourceBinding = isRecord(value.importMetadata) && isRecord(value.importMetadata.sourceBinding)
    ? value.importMetadata.sourceBinding
    : null;
  const artifactSha256 = sourceBinding ? asString(sourceBinding.artifactSha256).toLowerCase() : "";

  return {
    id,
    source,
    rowCount,
    createdAt: normalizeIsoDate(value.createdAt, new Date(0).toISOString()),
    ...(normalizeBatchMonth(value.ymMin) ? { ymMin: normalizeBatchMonth(value.ymMin) } : {}),
    ...(normalizeBatchMonth(value.ymMax) ? { ymMax: normalizeBatchMonth(value.ymMax) } : {}),
    ...(artifactSha256 && /^[a-f0-9]{64}$/u.test(artifactSha256) ? { checksum: artifactSha256 } : {}),
  };
}

function parseBatchIndexState(parsed, filePath) {
  const rawItems = isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
  const items = [];
  let skipped = 0;
  for (const [index, item] of rawItems.entries()) {
    const normalized = normalizeBatchMeta(item, `${filePath}.items.${index}`);
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

function normalizeTransaction(value, batchId, filePath) {
  if (!isRecord(value)) return null;
  const txnId = asString(value.txnId).toLowerCase();
  if (!txnId) return null;
  const date = asString(value.date);
  if (!date) return null;
  const amountKrw = Number(value.amountKrw);
  const accountId = asString(value.accountId);
  const kind = asString(value.kind);
  const category = asString(value.category);
  const categoryId = asString(value.categoryId);
  const description = asString(value.description);
  const transferGroupId = asString(value.transferGroupId);
  const rowIndex = Math.trunc(Number(isRecord(value.meta) ? value.meta.rowIndex : undefined));

  return {
    txnId: sanitizeRecordId(txnId, `${filePath}.txnId`),
    batchId,
    ...(accountId ? { accountId: sanitizeRecordId(accountId, `${filePath}.accountId`) } : {}),
    date,
    amountKrw,
    ...(description ? { description } : {}),
    ...(kind === "income" || kind === "expense" || kind === "transfer" ? { kind } : {}),
    ...(category ? { category } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(transferGroupId ? { transferGroupId } : {}),
    source: "csv",
    ...(isRecord(value.transfer) ? { transfer: value.transfer } : {}),
    ...(Number.isFinite(rowIndex) && rowIndex > 0 ? { meta: { rowIndex } } : {}),
  };
}

function parseTransactionRows(bytes, batchId, filePath) {
  const items = [];
  let skipped = 0;
  const lines = bytes.toString("utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const [index, line] of lines.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }

    const normalized = normalizeTransaction(parsed, batchId, `${filePath}:${index + 1}`);
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
    id: planningDbId("financial_account", owner, account.id),
    userId: owner.userId,
    planningProfileId: null,
    name: account.name,
    accountType: account.kind,
    institution: null,
    balanceKrw: nullableSafeIntegerToDbString(account.startingBalanceKrw, "financialAccount.balanceKrw"),
    currency: account.currency,
    rawJson: {
      source: "planning-v3-account",
      sourceAccountId: account.id,
      ...(account.note ? { note: account.note } : {}),
      ...(account.createdAt ? { createdAt: account.createdAt } : {}),
    },
    createdAt: normalizeIsoDate(account.createdAt, now),
    updatedAt: now,
  };
}

function toTransactionBatchRow(batch, owner) {
  return {
    id: planningDbId("transaction_batch", owner, batch.id),
    userId: owner.userId,
    planningProfileId: null,
    source: batch.source,
    importKey: batch.id,
    periodStart: monthBoundaryIsoDate(batch.ymMin, "start", "transactionBatch.ymMin"),
    periodEnd: monthBoundaryIsoDate(batch.ymMax, "end", "transactionBatch.ymMax"),
    rowCount: batch.rowCount,
    checksum: batch.checksum ?? null,
    createdAt: normalizeIsoDate(batch.createdAt, owner.now),
  };
}

function toOpeningBalanceRow(balance, owner) {
  return {
    id: planningDbId("opening_balance", owner, `${balance.accountId}:${balance.asOfDate}`),
    userId: owner.userId,
    planningProfileId: null,
    financialAccountId: planningDbId("financial_account", owner, balance.accountId),
    asOfDate: normalizeDateOnly(balance.asOfDate, "openingBalance.asOfDate"),
    amountKrw: safeIntegerToDbString(balance.amountKrw, "openingBalance.amountKrw"),
    createdAt: owner.now,
    updatedAt: owner.now,
  };
}

function toTransactionRow(transaction, owner) {
  return {
    id: planningDbId("transaction", owner, transaction.txnId),
    userId: owner.userId,
    batchId: owner.batchId ? planningDbId("transaction_batch", owner, owner.batchId) : null,
    financialAccountId: transaction.accountId ? planningDbId("financial_account", owner, transaction.accountId) : null,
    occurredAt: normalizeDateOnly(transaction.date, "transaction.date"),
    description: transaction.description ?? "",
    amountKrw: safeIntegerToDbString(transaction.amountKrw, "transaction.amountKrw"),
    category: transaction.categoryId ?? transaction.category ?? null,
    rawJson: {
      source: transaction.source,
      sourceTxnId: transaction.txnId,
      ...(owner.batchId ? { sourceBatchId: owner.batchId } : {}),
      ...(transaction.accountId ? { sourceAccountId: transaction.accountId } : {}),
      ...(transaction.kind ? { kind: transaction.kind } : {}),
      ...(transaction.transferGroupId ? { transferGroupId: transaction.transferGroupId } : {}),
      ...(transaction.transfer ? { transfer: transaction.transfer } : {}),
      ...(transaction.meta ? { meta: transaction.meta } : {}),
    },
    createdAt: owner.now,
    updatedAt: owner.now,
  };
}

function emptyApplyState() {
  return {
    transactionBatches: new Map(),
    financialAccounts: new Map(),
    openingBalances: new Map(),
    transactions: new Map(),
  };
}

function cloneApplyState(state) {
  return {
    transactionBatches: new Map(state.transactionBatches),
    financialAccounts: new Map(state.financialAccounts),
    openingBalances: new Map(state.openingBalances),
    transactions: new Map(state.transactions),
  };
}

function serializeApplyState(state) {
  return JSON.stringify({
    transactionBatches: [...state.transactionBatches.entries()].sort(([left], [right]) => left.localeCompare(right)),
    financialAccounts: [...state.financialAccounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    openingBalances: [...state.openingBalances.entries()].sort(([left], [right]) => left.localeCompare(right)),
    transactions: [...state.transactions.entries()].sort(([left], [right]) => left.localeCompare(right)),
  });
}

function applyOperation(state, operation) {
  if (operation.table === "transactionBatches") {
    state.transactionBatches.set(operation.key, operation.row);
    return;
  }
  if (operation.table === "financialAccounts") {
    state.financialAccounts.set(operation.key, operation.row);
    return;
  }
  if (operation.table === "openingBalances") {
    state.openingBalances.set(operation.key, operation.row);
    return;
  }
  if (operation.table === "transactions") {
    state.transactions.set(operation.key, operation.row);
    return;
  }
  throw new Error(`Unknown dry-run apply table: ${operation.table}`);
}

function sortApplyOperations(operations) {
  const tableOrder = new Map([
    ["transactionBatches", 0],
    ["financialAccounts", 1],
    ["openingBalances", 2],
    ["transactions", 3],
  ]);
  return [...operations].sort((left, right) => (
    (tableOrder.get(left.table) ?? 99) - (tableOrder.get(right.table) ?? 99)
    || left.key.localeCompare(right.key)
  ));
}

function coalesceApplyOperations(operations) {
  const byKey = new Map();
  for (const operation of operations) {
    byKey.set(`${operation.table}:${operation.key}`, operation);
  }
  return [...byKey.values()];
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

function analyzeReferentialIntegrity(state) {
  const issues = {
    openingBalancesMissingFinancialAccount: 0,
    openingBalancesCrossUserFinancialAccount: 0,
    transactionsMissingBatch: 0,
    transactionsCrossUserBatch: 0,
    transactionsMissingFinancialAccount: 0,
    transactionsCrossUserFinancialAccount: 0,
  };

  for (const row of state.openingBalances.values()) {
    const account = state.financialAccounts.get(row.financialAccountId);
    if (!account) {
      issues.openingBalancesMissingFinancialAccount += 1;
      continue;
    }
    if (account.userId !== row.userId) issues.openingBalancesCrossUserFinancialAccount += 1;
  }

  for (const row of state.transactions.values()) {
    if (row.batchId) {
      const batch = state.transactionBatches.get(row.batchId);
      if (!batch) {
        issues.transactionsMissingBatch += 1;
      } else if (batch.userId !== row.userId) {
        issues.transactionsCrossUserBatch += 1;
      }
    }
    if (row.financialAccountId) {
      const account = state.financialAccounts.get(row.financialAccountId);
      if (!account) {
        issues.transactionsMissingFinancialAccount += 1;
      } else if (account.userId !== row.userId) {
        issues.transactionsCrossUserFinancialAccount += 1;
      }
    }
  }

  const issueCount = Object.values(issues).reduce((sum, count) => sum + count, 0);
  return {
    status: issueCount === 0 ? "PASS" : "FAIL",
    issueCount,
    ...issues,
  };
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
    const batchId = target ? batchIdFromTransactionsSubPath(target.subPath) : "";
    if (!target || (
      target.subPath !== "accounts.json"
      && target.subPath !== "opening-balances.json"
      && target.subPath !== "batches/index.json"
      && !batchId
    )) continue;
    targetedFiles += 1;
    const filePath = path.join(filesRoot, ...entry.path.split("/"));
    const owner = { userId: target.userId, now };

    if (target.subPath === "accounts.json") {
      const parsed = parseJsonBytes(await fs.readFile(filePath), entry.path);
      const state = parseAccountsState(parsed, entry.path);
      skippedRecords += state.skipped;
      for (const account of state.items) {
        const row = toFinancialAccountRow(account, owner);
        operations.push({
          table: "financialAccounts",
          key: row.id,
          row,
        });
      }
      continue;
    }

    if (target.subPath === "opening-balances.json") {
      const parsed = parseJsonBytes(await fs.readFile(filePath), entry.path);
      const state = parseOpeningBalancesState(parsed, entry.path);
      skippedRecords += state.skipped;
      for (const balance of state.items) {
        const row = toOpeningBalanceRow(balance, owner);
        operations.push({
          table: "openingBalances",
          key: row.id,
          row,
        });
      }
      continue;
    }

    if (target.subPath === "batches/index.json") {
      const parsed = parseJsonBytes(await fs.readFile(filePath), entry.path);
      const state = parseBatchIndexState(parsed, entry.path);
      skippedRecords += state.skipped;
      for (const batch of state.items) {
        const row = toTransactionBatchRow(batch, owner);
        operations.push({
          table: "transactionBatches",
          key: row.id,
          row,
        });
      }
      continue;
    }

    const state = parseTransactionRows(await fs.readFile(filePath), batchId, entry.path);
    skippedRecords += state.skipped;
    const batchRow = toTransactionBatchRow({
      id: batchId,
      source: "csv",
      rowCount: state.items.length,
      createdAt: now,
    }, owner);
    operations.push({
      table: "transactionBatches",
      key: batchRow.id,
      row: batchRow,
    });
    for (const transaction of state.items) {
      const row = toTransactionRow(transaction, { ...owner, batchId });
      operations.push({
        table: "transactions",
        key: row.id,
        row,
      });
    }
  }

  return { operations: sortApplyOperations(coalesceApplyOperations(operations)), targetedFiles, skippedRecords };
}

function simulateDryRunApply(operations) {
  const initial = emptyApplyState();
  const first = applyOperationsWithRollback(initial, operations);
  if (first.status !== "COMMITTED") {
    return {
      ok: false,
      operations: operations.length,
      tableCounts: {
        transactionBatches: 0,
        financialAccounts: 0,
        openingBalances: 0,
        transactions: 0,
      },
      idempotentUpsert: false,
      referentialIntegrity: {
        status: "FAIL",
        issueCount: 0,
        reason: first.error ?? "initial_apply_failed",
      },
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
  const referentialIntegrity = analyzeReferentialIntegrity(first.state);
  const rollbackOk = rollbackProbe === null
    || (rollbackProbe.status === "ROLLED_BACK" && rollbackProbe.rolledBack && rollbackProbe.rollbackDigestUnchanged);
  const idempotentUpsert = second.status === "COMMITTED" && firstDigest === secondDigest;
  const rollbackExercised = rollbackProbe !== null;

  return {
    ok: idempotentUpsert && (rollbackExercised ? rollbackOk : true) && referentialIntegrity.status === "PASS",
    operations: operations.length,
    tableCounts: {
      transactionBatches: first.state.transactionBatches.size,
      financialAccounts: first.state.financialAccounts.size,
      openingBalances: first.state.openingBalances.size,
      transactions: first.state.transactions.size,
    },
    idempotentUpsert,
    referentialIntegrity,
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
  const postgresSchemaValidation = validatePrismaSchema(root, options.postgresSchema);
  const postgresSchemaSql = generatePostgresSchemaSql(root, options.postgresSchema, manifest.schema.postgres.modelCount);
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
        name: "schema-validate",
        status: schemaReady && postgresSchemaValidation.status === "PASS" ? "PASS" : "FAIL",
        sqliteProvider: manifest.schema.sqlite.provider,
        postgresProvider: manifest.schema.postgres.provider,
        sqliteModels: manifest.schema.sqlite.modelCount,
        postgresModels: manifest.schema.postgres.modelCount,
        postgres: postgresSchemaValidation,
      },
      {
        name: "schema-sql-dry-run",
        status: schemaReady
          && postgresSchemaValidation.status === "PASS"
          && postgresSchemaSql.status === "PASS"
          && postgresSchemaSql.analysis?.status === "PASS"
          ? "PASS"
          : "FAIL",
        postgres: postgresSchemaSql,
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
        referentialIntegrity: applySimulation.referentialIntegrity,
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

function exportPayload(exported) {
  return {
    written: exported.written,
    manifestPath: exported.manifestPath || null,
    filesRoot: exported.filesRoot || null,
  };
}

async function buildReadinessReport(root, options) {
  const manifest = await buildManifest(root, options);
  const exported = await exportDryRunBundle(root, options, manifest);
  const dryRunApply = await buildDryRunApplyPlan(root, options, manifest, exported);
  const preflightFailed = dryRunApply.steps.some((step) => step.status === "FAIL");

  return {
    manifest,
    exported,
    dryRunApply,
    preflightFailed,
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
    const report = await buildReadinessReport(root, options);
    const databaseEnv = readEnvValue(root, DATABASE_URL_ENV);
    const databaseTarget = evaluatePostgresDatabaseTarget(root);
    const databaseConnection = options.checkDbConnection
      ? checkPostgresDatabaseConnection(root, databaseTarget, databaseEnv.value)
      : { status: "SKIPPED", reason: "check_not_requested" };
    const preflightFailed = report.preflightFailed
      || databaseTarget.status !== "PASS"
      || databaseConnection.status === "FAIL";
    console.log(JSON.stringify({
      ok: false,
      mode: "apply",
      manifest: report.manifest,
      export: exportPayload(report.exported),
      dryRunApply: report.dryRunApply,
      confirmedApply: {
        status: "BLOCKED",
        available: false,
        reason: "postgres_apply_not_implemented",
        preflightStatus: preflightFailed ? "FAIL" : "PASS",
        databaseTarget,
        databaseConnection,
        requiredConfirm: APPLY_CONFIRM,
      },
    }, null, 2));
    console.error("[planning:postgres:readiness] confirmed apply is not implemented; preflight evidence was emitted without mutating source data.");
    return 1;
  }

  const report = await buildReadinessReport(root, options);

  console.log(JSON.stringify({
    ok: !report.preflightFailed,
    mode: "dry-run",
    manifest: report.manifest,
    export: exportPayload(report.exported),
    dryRunApply: report.dryRunApply,
  }, null, 2));

  return report.preflightFailed ? 1 : 0;
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
