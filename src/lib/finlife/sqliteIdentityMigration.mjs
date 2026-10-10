import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { canonicalFinlifeValue, finlifeIdentity, joinFinlifeRows, normalizeFinlifeCompany } from "./identity.mjs";
import { readPlanningSqliteSchemaContract, resolvePlanningBetterSqlite3Package } from "../planning/deployment/runtimeDatabase.mjs";
import { verifyPlanningWriterLeaseCapability } from "../planning/deployment/writerLease.mjs";

const MIGRATION = "finlife-scoped-identity-v1";
const WRITERS = new Set(["finlife:identity:migrate:apply", "desktop.install"]);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const hash = (value) => createHash("sha256").update(value).digest("hex");
const encoded = (value) => JSON.stringify(value, (_key, item) => {
  if (typeof item === "bigint") return { sqliteInteger: String(item) };
  if (typeof item === "number" && (!Number.isFinite(item) || Object.is(item, -0))) return { sqliteReal: Object.is(item, -0) ? "-0" : String(item) };
  return item;
});
const problem = (code) => {
  const error = new Error("FINLIFE migration: " + code);
  error.code = code;
  return error;
};
const requireCondition = (condition, code) => { if (!condition) throw problem(code); };

function sqlite(cwd) {
  return createRequire(import.meta.url)(resolvePlanningBetterSqlite3Package({ cwd }));
}
function checkFile(databasePath) {
  requireCondition(typeof databasePath === "string" && path.isAbsolute(databasePath), "DATABASE_PATH_REQUIRED");
  let cursor = databasePath;
  while (true) {
    try { requireCondition(!fs.lstatSync(cursor).isSymbolicLink(), "DATABASE_SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (!fs.existsSync(databasePath)) return false;
  const stat = fs.statSync(databasePath);
  requireCondition(stat.isFile() && stat.nlink === 1, "DATABASE_NOT_PRIVATE_REGULAR_FILE");
  return stat.size > 0;
}
function checkIntegrity(db) {
  const integrity = db.pragma("integrity_check");
  requireCondition(integrity.length === 1 && integrity[0].integrity_check === "ok", "SQLITE_INTEGRITY_FAILED");
  requireCondition(db.pragma("foreign_key_check").length === 0, "FOREIGN_KEY_CHECK_FAILED");
}
function readRaw(value) {
  let raw;
  try { raw = JSON.parse(value); } catch { throw problem("INVALID_RAW_JSON"); }
  requireCondition(raw && typeof raw === "object" && !Array.isArray(raw), "MISSING_RAW_IDENTITY");
  return raw;
}
function columns(db, table) { return db.pragma("table_info(" + quote(table) + ")"); }
function indexShape(db, index, column, unique) {
  if (!index || index.unique !== unique || index.partial || index.origin !== "c") return false;
  const key = db.pragma("index_xinfo(" + quote(index.name) + ")").filter(row => row.key);
  return key.length === 1 && key[0].name === column && key[0].coll === "BINARY" && !key[0].desc;
}
function assertLegacyKind(kind, raw, options) {
  const present = (row, key) => String(row[key] ?? "").trim().length > 0;
  if (kind === "pension") {
    requireCondition(present(raw, "pnsn_kind") && present(raw, "prdt_type"), "PRODUCT_KIND_UNRESOLVED");
    return;
  }
  if (kind === "credit-loan") {
    requireCondition(present(raw, "crdt_prdt_type"), "PRODUCT_KIND_UNRESOLVED");
    return;
  }
  requireCondition(options.length > 0, "PRODUCT_KIND_UNRESOLVED");
  for (const option of options) {
    const savings = present(option, "intr_rate_type") && present(option, "save_trm") && !present(option, "lend_rate_type") && !present(option, "crdt_lend_rate_type") && !present(option, "pnsn_recp_trm");
    const loan = present(option, "rpay_type") && present(option, "lend_rate_type") && !present(option, "intr_rate_type") && !present(option, "crdt_lend_rate_type") && !present(option, "pnsn_recp_trm");
    const matches = kind === "deposit" ? savings && !present(option, "rsrv_type")
      : kind === "saving" ? savings && present(option, "rsrv_type")
      : kind === "mortgage-loan" ? loan && present(option, "mrtg_type")
      : kind === "rent-house-loan" ? loan && !present(option, "mrtg_type") : false;
    requireCondition(matches, "PRODUCT_KIND_UNRESOLVED");
  }
}
function plan(db, cwd) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if (!tables.length) {
    requireCondition(db.prepare("SELECT count(*) AS n FROM sqlite_schema").get().n === 0, "UNKNOWN_EMPTY_SCHEMA");
    return { status: "empty", issues: [], productCount: 0, assignments: [] };
  }
  checkIntegrity(db);
  for (const { name } of tables) {
    requireCondition(db.pragma("table_xinfo(" + quote(name) + ")").every(column => !column.hidden), "UNSUPPORTED_GENERATED_OR_HIDDEN_COLUMN");
  }
  for (const entry of readPlanningSqliteSchemaContract({ cwd })) {
    const table = entry.tableName;
    const required = entry.columns.filter(name => table !== "Product" || name !== "identityKey");
    const names = new Set(columns(db, table).map(row => row.name));
    requireCondition(required.every(name => names.has(name)), "UNSUPPORTED_LEGACY_SCHEMA");
  }
  const productColumns = columns(db, "Product");
  const id = productColumns.find(row => row.name === "id");
  requireCondition(id?.pk === 1 && id.type.toUpperCase() === "INTEGER", "UNSUPPORTED_PRODUCT_PRIMARY_KEY");
  const identity = productColumns.find(row => row.name === "identityKey");
  if (identity) requireCondition(identity.type.toUpperCase() === "TEXT" && !identity.pk && !identity.notnull && identity.dflt_value === null, "UNSUPPORTED_IDENTITY_COLUMN");
  const indexes = db.pragma('index_list("Product")');
  const oldIndex = indexes.find(row => row.name === "Product_finPrdtCd_key");
  const identityIndex = indexes.find(row => row.name === "Product_identityKey_key");
  const codeIndex = indexes.find(row => row.name === "Product_finPrdtCd_idx");
  if (oldIndex) requireCondition(indexShape(db, oldIndex, "finPrdtCd", 1), "UNSUPPORTED_LEGACY_INDEX");
  if (identityIndex) requireCondition(indexShape(db, identityIndex, "identityKey", 1), "UNSUPPORTED_IDENTITY_INDEX");
  if (codeIndex) requireCondition(indexShape(db, codeIndex, "finPrdtCd", 0), "UNSUPPORTED_CODE_INDEX");
  for (const index of indexes) {
    if (!index.unique || index === oldIndex || index === identityIndex) continue;
    throw problem("UNKNOWN_IDENTITY_CONSTRAINT");
  }
  const providers = new Map(db.prepare('SELECT id, code FROM "Provider"').safeIntegers().all().map(row => [String(row.id), row.code]));
  const options = new Map();
  for (const row of db.prepare('SELECT id, productId, raw FROM "ProductOption"').safeIntegers().all()) {
    const group = options.get(String(row.productId)) ?? [];
    group.push(readRaw(row.raw));
    options.set(String(row.productId), group);
  }
  const assignments = [];
  const identities = new Set();
  const products = db.prepare('SELECT * FROM "Product"').safeIntegers().all();
  for (const row of products) {
    const raw = readRaw(row.raw);
    const company = normalizeFinlifeCompany(raw.fin_co_no);
    requireCondition(typeof row.finPrdtCd === "string" && row.finPrdtCd === String(raw.fin_prdt_cd ?? "").trim(), "PRODUCT_CODE_CONFLICT");
    requireCondition(row.providerId !== null && providers.has(String(row.providerId))
      && normalizeFinlifeCompany(providers.get(String(row.providerId))) === company, "PROVIDER_IDENTITY_UNRESOLVED");
    const key = finlifeIdentity(row.kind, raw);
    const children = options.get(String(row.id)) ?? [];
    joinFinlifeRows([raw], children, { kind: row.kind, strict: true });
    if (row.identityKey == null) assertLegacyKind(row.kind, raw, children);
    requireCondition(new Set(children.map(canonicalFinlifeValue)).size === children.length, "DUPLICATE_OPTION");
    requireCondition(!identities.has(key), "DUPLICATE_PRODUCT_IDENTITY");
    identities.add(key);
    requireCondition(row.identityKey == null || row.identityKey === key, "EXISTING_IDENTITY_CONFLICT");
    assignments.push({ id: row.id, key, pending: row.identityKey == null });
    options.delete(String(row.id));
  }
  requireCondition(options.size === 0, "ORPHAN_OPTION");
  const required = !identity || !identityIndex || !codeIndex || Boolean(oldIndex) || assignments.some(row => row.pending);
  return { status: required ? "required" : "ready", issues: [], productCount: products.length, assignments, hasIdentity: Boolean(identity), oldIndex: Boolean(oldIndex), identityIndex: Boolean(identityIndex), codeIndex: Boolean(codeIndex) };
}
function summary(result) { return { status: result.status, issues: result.issues, productCount: result.productCount }; }

/** Read-only diagnostic. No raw product/user values appear in its report. */
export function inspectFinlifeIdentityMigration({ cwd = process.cwd(), databasePath }) {
  let db;
  try {
    if (!checkFile(databasePath)) return { status: "empty", issues: [], productCount: 0 };
    const Database = sqlite(cwd);
    db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 0 });
    db.exec("BEGIN");
    return summary(plan(db, cwd));
  } catch (error) {
    return { status: "blocked", issues: [error.code ?? "SQLITE_INSPECTION_FAILED"], productCount: null };
  } finally { if (db?.inTransaction) db.exec("ROLLBACK"); db?.close(); }
}
export function assertFinlifeIdentityReady(input) {
  const inspected = inspectFinlifeIdentityMigration(input);
  if (inspected.status !== "ready") {
    throw problem("IDENTITY_" + inspected.status.toUpperCase() + ": " + inspected.issues.join(",")
      + ". Stop the app; run pnpm finlife:identity:migrate to inspect. Use pnpm finlife:identity:migrate:apply only after resolving blocked data.");
  }
  return inspected;
}
function contents(db, omitIdentity = false) {
  const entries = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()) {
    const names = columns(db, name).map(row => row.name).filter(column => !(omitIdentity && name === "Product" && column === "identityKey"));
    const rows = db.prepare("SELECT " + names.map(quote).join(",") + " FROM " + quote(name)).safeIntegers().all().map(encoded).sort();
    entries.push({ table: name, columns: names, count: rows.length, digest: hash(encoded(rows)) });
  }
  return entries;
}
function schemaDigest(db) {
  return hash(encoded(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all()));
}
function syncedWrite(file, data) {
  const fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDirectory(directory) {
  // Windows does not support opening directory handles through Node fs.openSync.
  if (process.platform === "win32") return;
  const fd = fs.openSync(directory, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function backupDirectory(controlRoot) {
  const base = fs.realpathSync(controlRoot);
  let current = base;
  for (const segment of ["backups", "finlife-identity", randomUUID()]) {
    current = path.join(current, segment);
    try { fs.mkdirSync(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    requireCondition(fs.lstatSync(current).isDirectory() && !fs.lstatSync(current).isSymbolicLink(), "BACKUP_PATH_UNSAFE");
    syncDirectory(path.dirname(current));
  }
  return current;
}

/** Caller must own the authoritative control-root maintenance lease for the whole operation. */
export async function migrateFinlifeIdentityDatabase({ cwd = process.cwd(), databasePath, controlRoot, capability }) {
  const lease = await verifyPlanningWriterLeaseCapability({ dataRoot: controlRoot, capability });
  requireCondition(WRITERS.has(lease.writerId), "maintenance writer required");
  const inspected = inspectFinlifeIdentityMigration({ cwd, databasePath });
  if (inspected.status === "ready") return { ...inspected, applied: false };
  requireCondition(inspected.status === "required", inspected.issues.join(",") || "DATABASE_NOT_MIGRATABLE");
  const Database = sqlite(cwd);
  const db = new Database(databasePath, { fileMustExist: true, timeout: 0 });
  let backupPath;
  let receiptPath;
  let committed = false;
  try {
    db.pragma("foreign_keys=ON");
    db.pragma("synchronous=FULL");
    // Prevent every SQLite writer (including one ignoring the application lease).
    db.exec("BEGIN IMMEDIATE");
    const migration = plan(db, cwd);
    requireCondition(migration.status === "required", "DATABASE_CHANGED_AFTER_PREFLIGHT");
    const before = contents(db, true);
    const exactBefore = contents(db);
    const beforeSchema = schemaDigest(db);
    const directory = backupDirectory(controlRoot);
    backupPath = path.join(directory, "before.sqlite");
    receiptPath = path.join(directory, "prepared.json");
    syncedWrite(backupPath, "");
    const reader = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 0 });
    try { await reader.backup(backupPath); } finally { reader.close(); }
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true, timeout: 0 });
    try {
      checkIntegrity(backup);
      requireCondition(encoded(contents(backup)) === encoded(exactBefore) && schemaDigest(backup) === beforeSchema, "BACKUP_VERIFICATION_FAILED");
    } finally { backup.close(); }
    const fd = fs.openSync(backupPath, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    syncedWrite(receiptPath, JSON.stringify({
      migration: MIGRATION, state: "prepared", createdAt: new Date().toISOString(),
      productCount: migration.productCount, preservedTables: before, schemaDigest: beforeSchema,
      backupSha256: hash(fs.readFileSync(backupPath)),
    }, null, 2) + "\n");
    syncDirectory(directory);
    await verifyPlanningWriterLeaseCapability({ dataRoot: controlRoot, capability });
    if (!migration.hasIdentity) db.exec('ALTER TABLE "Product" ADD COLUMN "identityKey" TEXT');
    const update = db.prepare('UPDATE "Product" SET "identityKey"=? WHERE "id"=?');
    for (const row of migration.assignments) if (row.pending) update.run(row.key, row.id);
    if (!migration.identityIndex) db.exec('CREATE UNIQUE INDEX "Product_identityKey_key" ON "Product"("identityKey")');
    if (!migration.codeIndex) db.exec('CREATE INDEX "Product_finPrdtCd_idx" ON "Product"("finPrdtCd")');
    if (migration.oldIndex) db.exec('DROP INDEX "Product_finPrdtCd_key"');
    requireCondition(plan(db, cwd).status === "ready", "POST_MIGRATION_NOT_READY");
    requireCondition(encoded(contents(db, true)) === encoded(before), "DATA_PRESERVATION_FAILED");
    db.exec("COMMIT");
    committed = true;
    const appliedPath = path.join(directory, "applied.json");
    syncedWrite(appliedPath, JSON.stringify({ migration: MIGRATION, state: "applied", completedAt: new Date().toISOString(), productCount: migration.productCount, preservedTables: before }, null, 2) + "\n");
    syncDirectory(directory);
    return { status: "ready", issues: [], applied: true, productCount: migration.productCount, backupPath, receiptPath: appliedPath };
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    error.migrationCommitted = committed;
    if (backupPath) error.backupPath = backupPath;
    if (receiptPath) error.receiptPath = receiptPath;
    throw error;
  } finally { db.close(); }
}
