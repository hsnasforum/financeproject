import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_PLANNING_SQLITE_URL = "file:./prisma/dev.db";

export const REQUIRED_PLANNING_SQLITE_TABLES = Object.freeze([
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "Provider",
  "Product",
  "ProductOption",
  "UserProfile",
  "Favorite",
  "PlannerSnapshot",
  "ProviderAlias",
  "ExternalSourceSnapshot",
  "ExternalProduct",
  "ExternalProductMatch",
]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function directoryBaseUrl(cwd) {
  const resolved = path.resolve(cwd);
  return pathToFileURL(`${resolved}${path.sep}`);
}

function isPathWithin(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (
    relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

function parsePrismaMappedName(source, marker) {
  const match = source.match(new RegExp(`${marker}\\(\\s*("(?:[^"\\\\]|\\\\.)*")\\s*\\)`));
  if (!match) return "";
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`Prisma schema contains an invalid ${marker} string`);
  }
}

export function readPlanningSqliteSchemaContract(options = {}) {
  const cwd = fs.realpathSync(path.resolve(options.cwd ?? process.cwd()));
  const schemaPath = path.join(cwd, "prisma", "schema.prisma");
  const schemaSource = fs.readFileSync(schemaPath, "utf8");
  const modelMatches = [...schemaSource.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\}/gmu)];
  const modelNames = new Set(modelMatches.map((match) => match[1]));
  const contract = modelMatches.map((match) => {
    const modelName = match[1];
    const modelBody = match[2];
    const tableName = parsePrismaMappedName(modelBody, "@@map") || modelName;
    const columns = [];
    for (const rawLine of modelBody.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s+([^\s]+)/u);
      if (!fieldMatch) continue;
      const [, fieldName, fieldType] = fieldMatch;
      const baseType = fieldType.replace(/[?\[\]]/g, "");
      if (modelNames.has(baseType)) continue;
      columns.push(parsePrismaMappedName(line, "@map") || fieldName);
    }
    if (columns.length === 0) {
      throw new Error(`Prisma model ${modelName} has no persisted columns`);
    }
    return Object.freeze({ modelName, tableName, columns: Object.freeze(columns) });
  });
  if (contract.length === 0) {
    throw new Error("Prisma schema does not define any models");
  }
  return Object.freeze(contract);
}

export function formatPlanningSqliteDatabaseUrl(options = {}) {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const cwd = pathApi.resolve(options.cwd);
  const databasePath = pathApi.resolve(options.databasePath);
  const relativePath = pathApi.relative(cwd, databasePath);
  if (!relativePath || pathApi.isAbsolute(relativePath)) {
    throw new Error("desktop-local SQLite database must be on the same filesystem volume as the app");
  }
  if (platform === "win32") {
    return `file:${databasePath.replace(/\\/g, "/")}`;
  }
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

export function resolvePlanningBetterSqlite3Package(options = {}) {
  const cwd = fs.realpathSync(path.resolve(options.cwd ?? process.cwd()));
  const candidates = [
    path.join(cwd, "node_modules", "better-sqlite3"),
    path.join(cwd, ".next", "standalone", "node_modules", "better-sqlite3"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const packageRoot = fs.realpathSync(candidate);
    if (!isPathWithin(cwd, packageRoot)) {
      throw new Error("better-sqlite3 package escapes the app root");
    }
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    } catch {
      throw new Error("better-sqlite3 package metadata is invalid");
    }
    if (packageJson?.name !== "better-sqlite3") {
      throw new Error("better-sqlite3 package identity is invalid");
    }
    return packageRoot;
  }
  throw new Error("better-sqlite3 package is not available in project or standalone node_modules");
}

export function resolvePlanningSqliteDatabase(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const configuredUrl = asString(env.DATABASE_URL) || DEFAULT_PLANNING_SQLITE_URL;
  if (!configuredUrl.startsWith("file:")) {
    throw new Error("desktop-local supports only a local SQLite file database");
  }

  const configuredPath = configuredUrl.slice("file:".length);
  if (!configuredPath || /[\u0000\r\n]/u.test(configuredPath)) {
    throw new Error("DATABASE_URL must be a valid local SQLite file URL");
  }
  if (configuredPath.includes("?")) {
    throw new Error("desktop-local DATABASE_URL does not support query or fragment options");
  }
  let databasePath;
  if (configuredPath.startsWith("//")) {
    let parsed;
    try {
      parsed = new URL(configuredUrl, directoryBaseUrl(cwd));
    } catch {
      throw new Error("DATABASE_URL must be a valid local SQLite file URL");
    }
    if (parsed.protocol !== "file:" || (parsed.hostname && parsed.hostname !== "localhost")) {
      throw new Error("DATABASE_URL must resolve to a local SQLite file");
    }
    if (parsed.search || parsed.hash) {
      throw new Error("desktop-local DATABASE_URL does not support query or fragment options");
    }
    databasePath = path.resolve(fileURLToPath(parsed));
  } else {
    databasePath = path.resolve(cwd, configuredPath);
  }
  if (databasePath.includes("?")) {
    throw new Error("desktop-local DATABASE_URL does not support query or fragment options");
  }
  if (path.basename(databasePath) === ":memory:") {
    throw new Error("desktop-local requires a persistent SQLite file database");
  }

  return Object.freeze({
    configuredUrl,
    databasePath,
    databaseUrl: formatPlanningSqliteDatabaseUrl({ cwd, databasePath }),
  });
}

export function inspectPlanningSqliteSchema(options = {}) {
  const databasePath = path.resolve(options.databasePath ?? "");
  const schemaContract = options.schemaContract ?? readPlanningSqliteSchemaContract({ cwd: options.cwd });
  const requiredTables = options.requiredTables ?? schemaContract.map((entry) => entry.tableName);
  const requiredTableSet = new Set(requiredTables);
  const requiredColumns = schemaContract.filter((entry) => requiredTableSet.has(entry.tableName));
  if (!fs.existsSync(databasePath)) {
    return Object.freeze({
      ok: false,
      databasePath,
      missingTables: [...requiredTables],
      missingColumns: [],
      reason: "missing_database",
    });
  }
  const stats = fs.statSync(databasePath);
  if (!stats.isFile() || stats.size < 1) {
    return Object.freeze({
      ok: false,
      databasePath,
      missingTables: [...requiredTables],
      missingColumns: [],
      reason: "empty_database",
    });
  }

  const packageRoot = resolvePlanningBetterSqlite3Package({ cwd: options.cwd });
  const require = createRequire(path.join(packageRoot, "package.json"));
  const Database = require(packageRoot);
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const availableTables = new Set(rows.map((row) => asString(row?.name)).filter(Boolean));
    const missingTables = requiredTables.filter((table) => !availableTables.has(table));
    const missingColumns = [];
    for (const entry of requiredColumns) {
      if (!availableTables.has(entry.tableName)) continue;
      const quotedTableName = entry.tableName.replace(/"/g, '""');
      const columnRows = database.prepare(`PRAGMA table_info("${quotedTableName}")`).all();
      const availableColumns = new Set(columnRows.map((row) => asString(row?.name)).filter(Boolean));
      for (const column of entry.columns) {
        if (!availableColumns.has(column)) missingColumns.push(`${entry.tableName}.${column}`);
      }
    }
    return Object.freeze({
      ok: missingTables.length === 0 && missingColumns.length === 0,
      databasePath,
      missingTables,
      missingColumns,
      reason: missingTables.length > 0
        ? "missing_tables"
        : missingColumns.length > 0
          ? "missing_columns"
          : null,
    });
  } finally {
    database.close();
  }
}

export function assertPlanningSqliteSchema(options = {}) {
  const inspected = inspectPlanningSqliteSchema(options);
  if (inspected.ok) return inspected;
  const detail = inspected.reason === "missing_tables"
    ? `missing tables: ${inspected.missingTables.join(", ")}`
    : inspected.reason === "missing_columns"
      ? `missing columns: ${inspected.missingColumns.join(", ")}`
    : inspected.reason === "empty_database"
      ? "database file is empty"
      : "database file does not exist";
  throw new Error(
    `desktop-local SQLite schema is not ready (${detail}). Run \`pnpm prisma:generate\` and \`pnpm prisma:db:push\` before build/start.`,
  );
}
