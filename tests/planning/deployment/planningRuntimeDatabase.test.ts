import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPlanningSqliteSchema,
  DEFAULT_PLANNING_SQLITE_URL,
  formatPlanningSqliteDatabaseUrl,
  inspectPlanningSqliteSchema,
  readPlanningSqliteSchemaContract,
  REQUIRED_PLANNING_SQLITE_TABLES,
  resolvePlanningBetterSqlite3Package,
  resolvePlanningSqliteDatabase,
} from "../../../src/lib/planning/deployment/runtimeDatabase.mjs";

const cleanupRoots: string[] = [];

afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-runtime-database-"));
  cleanupRoots.push(root);
  return root;
}

function createSchemaDatabase(
  databasePath: string,
  schemaContract = readPlanningSqliteSchemaContract({ cwd: process.cwd() }),
): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    for (const entry of schemaContract) {
      const columns = entry.columns.map((column) => `"${column}" TEXT`).join(", ");
      database.exec(`CREATE TABLE "${entry.tableName}" (${columns})`);
    }
  } finally {
    database.close();
  }
}

describe("desktop runtime SQLite database", () => {
  it("canonicalizes the default and configured relative file URLs against the launcher cwd", () => {
    const root = makeRoot();
    const defaultDatabasePath = path.join(root, "prisma", "dev.db");
    const configuredDatabasePath = path.join(root, "dev.db");

    expect(resolvePlanningSqliteDatabase({ cwd: root, env: {} })).toEqual({
      configuredUrl: DEFAULT_PLANNING_SQLITE_URL,
      databasePath: defaultDatabasePath,
      databaseUrl: formatPlanningSqliteDatabaseUrl({ cwd: root, databasePath: defaultDatabasePath }),
    });
    expect(resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "file:./dev.db" },
    })).toMatchObject({
      databasePath: configuredDatabasePath,
      databaseUrl: formatPlanningSqliteDatabaseUrl({ cwd: root, databasePath: configuredDatabasePath }),
    });
  });

  it("formats Windows SQLite paths for Prisma and resolves the verified native package", () => {
    expect(formatPlanningSqliteDatabaseUrl({
      cwd: "C:\\apps\\planning",
      databasePath: "C:\\smoke\\finance.db",
      platform: "win32",
    })).toBe("file:C:/smoke/finance.db");
    expect(formatPlanningSqliteDatabaseUrl({
      cwd: "C:\\apps\\Planning #1",
      databasePath: "C:\\Users\\홍 길동\\Planning #1\\finance%ready.db",
      platform: "win32",
    })).toBe("file:C:/Users/홍 길동/Planning #1/finance%ready.db");
    expect(() => formatPlanningSqliteDatabaseUrl({
      cwd: "D:\\apps\\planning",
      databasePath: "C:\\smoke\\finance.db",
      platform: "win32",
    })).toThrow("same filesystem volume");
    expect(resolvePlanningBetterSqlite3Package({ cwd: process.cwd() })).toContain("better-sqlite3");
  });

  it("rejects non-file, remote file, in-memory, and option-bearing database URLs", () => {
    const root = makeRoot();
    expect(() => resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "postgresql://db.example/finance" },
    })).toThrow("only a local SQLite");
    expect(() => resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "file://server/share/finance.db" },
    })).toThrow("local SQLite file");
    expect(() => resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "file::memory:" },
    })).toThrow("persistent SQLite");
    expect(() => resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "file:./dev.db?mode=ro" },
    })).toThrow("query or fragment");
  });

  it("keeps Prisma-literal hash and percent characters in local SQLite paths", () => {
    const root = makeRoot();
    const databasePath = path.join(root, "database #1", "finance%ready.db");

    expect(resolvePlanningSqliteDatabase({
      cwd: root,
      env: { DATABASE_URL: "file:./database #1/finance%ready.db" },
    })).toEqual({
      configuredUrl: "file:./database #1/finance%ready.db",
      databasePath,
      databaseUrl: process.platform === "win32"
        ? `file:${databasePath.replaceAll("\\", "/")}`
        : `file:${databasePath}`,
    });
  });

  it("requires every Prisma model table before starting the desktop runtime", () => {
    const root = makeRoot();
    const databasePath = path.join(root, "dev.db");
    const schemaContract = readPlanningSqliteSchemaContract({ cwd: process.cwd() });
    createSchemaDatabase(databasePath, schemaContract.slice(0, -1));

    const inspected = inspectPlanningSqliteSchema({ databasePath });
    expect(inspected).toMatchObject({
      ok: false,
      reason: "missing_tables",
      missingTables: [REQUIRED_PLANNING_SQLITE_TABLES.at(-1)],
      missingColumns: [],
    });
    expect(() => assertPlanningSqliteSchema({ databasePath })).toThrow("missing tables");

    const completePath = path.join(root, "complete.db");
    createSchemaDatabase(completePath);
    expect(assertPlanningSqliteSchema({ databasePath: completePath })).toMatchObject({
      ok: true,
      missingTables: [],
      missingColumns: [],
    });
  });

  it("rejects a database that has every table but is missing a persisted Prisma column", () => {
    const root = makeRoot();
    const databasePath = path.join(root, "missing-column.db");
    const schemaContract = readPlanningSqliteSchemaContract({ cwd: process.cwd() });
    const lastEntry = schemaContract.at(-1)!;
    const missingColumn = lastEntry.columns.at(-1)!;
    createSchemaDatabase(databasePath, [
      ...schemaContract.slice(0, -1),
      { ...lastEntry, columns: lastEntry.columns.slice(0, -1) },
    ]);

    expect(inspectPlanningSqliteSchema({ databasePath })).toMatchObject({
      ok: false,
      reason: "missing_columns",
      missingTables: [],
      missingColumns: [`${lastEntry.tableName}.${missingColumn}`],
    });
    expect(() => assertPlanningSqliteSchema({ databasePath })).toThrow("missing columns");
  });

  it("keeps the required table contract aligned with the Prisma schema", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const modelNames = [...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gmu)]
      .map((match) => match[1])
      .sort();
    expect([...REQUIRED_PLANNING_SQLITE_TABLES].sort()).toEqual(modelNames);
    expect(readPlanningSqliteSchemaContract({ cwd: process.cwd() }).map((entry) => entry.tableName).sort())
      .toEqual(modelNames);
  });
});
