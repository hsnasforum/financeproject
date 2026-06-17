#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SQLITE_URL = "file:./prisma/dev.db";
const DEFAULT_USER_ID = "default";
const APPLY_CONFIRM = "BACKFILL PLANNING USER";
const OWNED_TABLES = ["UserProfile", "Favorite", "PlannerSnapshot"];

function parseArgs(argv) {
  const options = {
    dbUrl: process.env.DATABASE_URL?.trim() || DEFAULT_SQLITE_URL,
    defaultUserId: process.env.PLANNING_AUTH_DEFAULT_USER_ID?.trim()
      || process.env.PLANNING_USER_ID?.trim()
      || DEFAULT_USER_ID,
    apply: false,
    confirm: "",
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      options.confirm = arg.slice("--confirm=".length);
      continue;
    }
    if (arg.startsWith("--db-url=")) {
      options.dbUrl = arg.slice("--db-url=".length).trim();
      continue;
    }
    if (arg.startsWith("--default-user-id=")) {
      options.defaultUserId = arg.slice("--default-user-id=".length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  options.dbUrl ||= DEFAULT_SQLITE_URL;
  options.defaultUserId = sanitizePlanningUserId(options.defaultUserId || DEFAULT_USER_ID);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/planning_auth_sqlite_backfill.mjs [--dry-run] [--apply --confirm="${APPLY_CONFIRM}"] [--db-url=file:./prisma/dev.db] [--default-user-id=default]

Prepares the active SQLite database for Auth.js and nullable planning ownership columns.
Dry-run is the default and never mutates the source database.`);
}

function sanitizePlanningUserId(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(candidate)) {
    throw new Error("Invalid planning user id");
  }
  return candidate;
}

function resolveSqlitePath(dbUrl) {
  if (!dbUrl.startsWith("file:")) {
    throw new Error(`Only SQLite file: URLs are supported by this backfill script: ${dbUrl}`);
  }
  const rawPath = dbUrl.slice("file:".length);
  if (!rawPath || rawPath === ":memory:") {
    throw new Error("A persistent SQLite file is required.");
  }
  return path.resolve(process.cwd(), rawPath);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createSqliteDatabase(dbPath, readonly) {
  const require = createRequire(import.meta.url);
  const BetterSqlite3 = require("better-sqlite3");
  return new BetterSqlite3(dbPath, {
    fileMustExist: true,
    readonly,
  });
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function listColumns(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all()
    .map((column) => String(column.name));
}

function columnExists(db, tableName, columnName) {
  return listColumns(db, tableName).includes(columnName);
}

function countRows(db, tableName) {
  if (!tableExists(db, tableName)) return 0;
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).get();
  return Number(row?.count ?? 0);
}

function countRowsMissingUserId(db, tableName) {
  if (!tableExists(db, tableName)) return 0;
  if (!columnExists(db, tableName, "userId")) return countRows(db, tableName);
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE "userId" IS NULL OR TRIM("userId") = ''`)
    .get();
  return Number(row?.count ?? 0);
}

function createAuthTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "email" TEXT,
      "emailVerified" DATETIME,
      "image" TEXT,
      "passwordHash" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

    CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "providerAccountId" TEXT NOT NULL,
      "refresh_token" TEXT,
      "access_token" TEXT,
      "expires_at" INTEGER,
      "token_type" TEXT,
      "scope" TEXT,
      "id_token" TEXT,
      "session_state" TEXT,
      CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
    CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

    CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionToken" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "expires" DATETIME NOT NULL,
      CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");
    CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

    CREATE TABLE IF NOT EXISTS "VerificationToken" (
      "identifier" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "expires" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");
    CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
  `);
}

function insertDefaultUser(db, userId) {
  const columns = new Set(listColumns(db, "User"));
  if (!columns.has("id")) throw new Error("User table does not have an id column.");

  const existing = db.prepare('SELECT "id" FROM "User" WHERE "id" = ?').get(userId);
  if (existing) return false;

  const now = new Date().toISOString();
  const values = {
    id: userId,
    name: "Local default user",
    createdAt: now,
    updatedAt: now,
  };
  const insertColumns = Object.keys(values).filter((column) => columns.has(column));
  const placeholders = insertColumns.map(() => "?").join(", ");
  db.prepare(
    `INSERT INTO "User" (${insertColumns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
  ).run(...insertColumns.map((column) => values[column]));
  return true;
}

function ensureUserIdColumn(db, tableName) {
  if (!tableExists(db, tableName)) return false;
  if (columnExists(db, tableName, "userId")) return false;
  db.prepare(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN "userId" TEXT`).run();
  return true;
}

function createOwnershipIndexes(db) {
  if (tableExists(db, "UserProfile") && columnExists(db, "UserProfile", "userId")) {
    db.prepare('CREATE INDEX IF NOT EXISTS "UserProfile_userId_idx" ON "UserProfile"("userId")').run();
  }
  if (tableExists(db, "Favorite") && columnExists(db, "Favorite", "userId")) {
    db.prepare('CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId")').run();
  }
  if (tableExists(db, "PlannerSnapshot") && columnExists(db, "PlannerSnapshot", "userId")) {
    db.prepare('CREATE INDEX IF NOT EXISTS "PlannerSnapshot_userId_createdAt_idx" ON "PlannerSnapshot"("userId", "createdAt")').run();
  }
}

function backfillUserProfiles(db, userId) {
  if (!tableExists(db, "UserProfile") || !columnExists(db, "UserProfile", "userId")) return 0;
  const result = db
    .prepare('UPDATE "UserProfile" SET "userId" = ? WHERE "userId" IS NULL OR TRIM("userId") = \'\'')
    .run(userId);
  return Number(result.changes ?? 0);
}

function backfillOwnedChildTable(db, tableName, userId) {
  if (!tableExists(db, tableName) || !columnExists(db, tableName, "userId")) return 0;
  if (!columnExists(db, tableName, "userProfileId") || !tableExists(db, "UserProfile")) {
    const result = db
      .prepare(`UPDATE ${quoteIdentifier(tableName)} SET "userId" = ? WHERE "userId" IS NULL OR TRIM("userId") = ''`)
      .run(userId);
    return Number(result.changes ?? 0);
  }
  const result = db
    .prepare(`
      UPDATE ${quoteIdentifier(tableName)}
      SET "userId" = COALESCE(
        (SELECT "userId" FROM "UserProfile" WHERE "UserProfile"."id" = ${quoteIdentifier(tableName)}."userProfileId"),
        ?
      )
      WHERE "userId" IS NULL OR TRIM("userId") = ''
    `)
    .run(userId);
  return Number(result.changes ?? 0);
}

function inspectPlan(db, options) {
  const authTables = ["User", "Account", "Session", "VerificationToken"].map((tableName) => ({
    name: tableName,
    exists: tableExists(db, tableName),
  }));
  const planningTables = OWNED_TABLES.map((tableName) => ({
    name: tableName,
    exists: tableExists(db, tableName),
    hasUserId: columnExists(db, tableName, "userId"),
    rowCount: countRows(db, tableName),
    rowsMissingUserId: countRowsMissingUserId(db, tableName),
  }));

  return {
    mode: options.apply ? "apply" : "dry-run",
    sourceMutation: options.apply,
    dbUrl: options.dbUrl,
    dbPath: path.relative(process.cwd(), resolveSqlitePath(options.dbUrl)).replaceAll("\\", "/"),
    defaultUserId: options.defaultUserId,
    authTables,
    planningTables,
    requiredConfirm: APPLY_CONFIRM,
  };
}

function applyBackfill(db, options) {
  const before = inspectPlan(db, options);
  const applied = {
    createdDefaultUser: false,
    addedUserIdColumns: [],
    backfilledRows: {},
  };

  const transaction = db.transaction(() => {
    db.pragma("foreign_keys = ON");
    createAuthTables(db);
    applied.createdDefaultUser = insertDefaultUser(db, options.defaultUserId);
    for (const tableName of OWNED_TABLES) {
      if (ensureUserIdColumn(db, tableName)) {
        applied.addedUserIdColumns.push(tableName);
      }
    }
    applied.backfilledRows.UserProfile = backfillUserProfiles(db, options.defaultUserId);
    applied.backfilledRows.Favorite = backfillOwnedChildTable(db, "Favorite", options.defaultUserId);
    applied.backfilledRows.PlannerSnapshot = backfillOwnedChildTable(db, "PlannerSnapshot", options.defaultUserId);
    createOwnershipIndexes(db);
  });

  transaction();
  return {
    before,
    applied,
    after: inspectPlan(db, options),
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    if (options.apply && options.confirm !== APPLY_CONFIRM) {
      throw new Error(`Apply requires --confirm="${APPLY_CONFIRM}".`);
    }

    const dbPath = resolveSqlitePath(options.dbUrl);
    if (!fs.existsSync(dbPath)) {
      throw new Error(`SQLite database not found: ${dbPath}`);
    }

    const db = createSqliteDatabase(dbPath, !options.apply);
    try {
      const result = options.apply
        ? applyBackfill(db, options)
        : inspectPlan(db, options);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[planning:auth:sqlite-backfill] ${message}`);
    process.exit(1);
  }
}

main();
