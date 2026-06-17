import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3") as new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  close(): void;
};

type TempState = {
  dir: string;
};

function createLegacyDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  try {
    db.exec(`
      CREATE TABLE "UserProfile" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "purpose" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "Product" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "finPrdtCd" TEXT NOT NULL UNIQUE,
        "kind" TEXT NOT NULL
      );
      CREATE TABLE "Favorite" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "userProfileId" INTEGER NOT NULL,
        "productId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "PlannerSnapshot" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "userProfileId" INTEGER NOT NULL,
        "monthlyIncome" REAL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "UserProfile" ("purpose") VALUES ('retirement');
      INSERT INTO "Product" ("finPrdtCd", "kind") VALUES ('fin-1', 'deposit');
      INSERT INTO "Favorite" ("userProfileId", "productId") VALUES (1, 1);
      INSERT INTO "PlannerSnapshot" ("userProfileId", "monthlyIncome") VALUES (1, 4000000);
    `);
  } finally {
    db.close();
  }
}

function runBackfill(dbPath: string, args: string[] = []) {
  return spawnSync(process.execPath, [
    "scripts/planning_auth_sqlite_backfill.mjs",
    `--db-url=file:${dbPath}`,
    "--default-user-id=alice",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function listColumns(dbPath: string, tableName: string): string[] {
  const db = new BetterSqlite3(dbPath);
  try {
    return db.prepare(`PRAGMA table_info("${tableName}")`).all()
      .map((row) => (row as { name: string }).name);
  } finally {
    db.close();
  }
}

function getScalar<T>(dbPath: string, sql: string): T {
  const db = new BetterSqlite3(dbPath);
  try {
    const row = db.prepare(sql).get() as Record<string, T>;
    return Object.values(row)[0] as T;
  } finally {
    db.close();
  }
}

describe("planning auth sqlite backfill script", () => {
  const temp: TempState[] = [];

  afterEach(() => {
    for (const state of temp.splice(0)) {
      fs.rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("reports a dry-run plan without mutating the legacy db", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-auth-backfill-"));
    temp.push({ dir });
    const dbPath = path.join(dir, "legacy.db");
    createLegacyDb(dbPath);

    const result = runBackfill(dbPath, ["--dry-run"]);

    expect(result.status).toBe(0);
    const payload = parseStdout(result.stdout);
    expect(payload.mode).toBe("dry-run");
    expect(payload.sourceMutation).toBe(false);
    expect(listColumns(dbPath, "UserProfile")).not.toContain("userId");
    expect(getScalar<number>(dbPath, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='User'")).toBe(0);
  });

  it("creates auth tables, backfills nullable ownership columns, and is idempotent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-auth-backfill-"));
    temp.push({ dir });
    const dbPath = path.join(dir, "legacy.db");
    createLegacyDb(dbPath);

    const first = runBackfill(dbPath, ["--apply", "--confirm=BACKFILL PLANNING USER"]);

    expect(first.status).toBe(0);
    const payload = parseStdout(first.stdout) as {
      applied: {
        createdDefaultUser: boolean;
        addedUserIdColumns: string[];
        backfilledRows: Record<string, number>;
      };
    };
    expect(payload.applied.createdDefaultUser).toBe(true);
    expect(payload.applied.addedUserIdColumns.sort()).toEqual(["Favorite", "PlannerSnapshot", "UserProfile"]);
    expect(payload.applied.backfilledRows).toMatchObject({
      UserProfile: 1,
      Favorite: 1,
      PlannerSnapshot: 1,
    });
    expect(getScalar<string>(dbPath, 'SELECT "id" AS id FROM "User" WHERE "id" = \'alice\'')).toBe("alice");
    expect(listColumns(dbPath, "Favorite")).toContain("userId");
    expect(getScalar<string>(dbPath, 'SELECT "userId" AS userId FROM "Favorite" WHERE "id" = 1')).toBe("alice");
    expect(getScalar<string>(dbPath, 'SELECT "userId" AS userId FROM "PlannerSnapshot" WHERE "id" = 1')).toBe("alice");

    const second = runBackfill(dbPath, ["--apply", "--confirm=BACKFILL PLANNING USER"]);
    expect(second.status).toBe(0);
    const secondPayload = parseStdout(second.stdout) as {
      applied: {
        createdDefaultUser: boolean;
        addedUserIdColumns: string[];
        backfilledRows: Record<string, number>;
      };
    };
    expect(secondPayload.applied.createdDefaultUser).toBe(false);
    expect(secondPayload.applied.addedUserIdColumns).toEqual([]);
    expect(secondPayload.applied.backfilledRows).toMatchObject({
      UserProfile: 0,
      Favorite: 0,
      PlannerSnapshot: 0,
    });
  });
});
