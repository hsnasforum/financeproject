import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createFinlifeLegacyFixture, snapshotDatabase } from "./helpers/finlifeLegacyDatabase";

const root = process.cwd();
const scriptPath = path.join(root, "scripts", "prisma_cli_safe.mjs");

describe("Prisma safe CLI wrapper", () => {
  it.each(["--force-reset", "--accept-data-loss"])("rejects %s without changing an existing SQLite database", (flag) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-destructive-"));
    const databasePath = path.join(tempRoot, "finance.db");
    const database = new Database(databasePath);
    database.exec("CREATE TABLE sentinel (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO sentinel VALUES (1, 'preserve');");
    database.close();
    const before = fs.readFileSync(databasePath);
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push", flag], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href },
        encoding: "utf8",
      });
      expect(result.status, `${result.stderr}\n${result.stdout}`).not.toBe(0);
      expect(`${result.stderr}\n${result.stdout}`).toContain("unsafe db push arguments");
      expect(fs.readFileSync(databasePath)).toEqual(before);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["--schema", "prisma/schema.prisma"],
    ["--schema=prisma/schema.prisma"],
    ["--config", "prisma.config.ts"],
    ["--config=prisma.config.ts"],
    ["--url", "fixture-database-url"],
  ])("rejects database preparation overrides %s before creating a file", (...overrides) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-overrides-"));
    const databasePath = path.join(tempRoot, "finance.db");
    try {
      const args = overrides.map((value) => value === "fixture-database-url"
        ? pathToFileURL(path.join(tempRoot, "other.db")).href
        : value);
      const result = spawnSync(process.execPath, [scriptPath, "db", "push", ...args], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href },
        encoding: "utf8",
      });
      expect(result.status, `${result.stderr}\n${result.stdout}`).not.toBe(0);
      expect(`${result.stderr}\n${result.stdout}`).toContain("unsafe db push arguments");
      expect(fs.existsSync(databasePath)).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("refuses an existing incomplete database without invoking schema changes", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-existing-"));
    const databasePath = path.join(tempRoot, "finance.db");
    const database = new Database(databasePath);
    database.exec("CREATE TABLE sentinel (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO sentinel VALUES (1, 'preserve');");
    database.close();
    const before = fs.readFileSync(databasePath);
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href },
        encoding: "utf8",
      });
      expect(result.status, `${result.stderr}\n${result.stdout}`).not.toBe(0);
      expect(`${result.stderr}\n${result.stdout}`).toContain("existing SQLite database");
      expect(fs.readFileSync(databasePath)).toEqual(before);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("requires the identity migration for a populated legacy database and preserves every row", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-legacy-"));
    const databasePath = path.join(tempRoot, "legacy.db");
    createFinlifeLegacyFixture(databasePath);
    const before = snapshotDatabase(databasePath);
    const bytes = fs.readFileSync(databasePath);
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href },
        encoding: "utf8",
      });
      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
      expect(`${result.stderr}\n${result.stdout}`).toContain("finlife:identity:migrate");
      expect(fs.readFileSync(databasePath)).toEqual(bytes);
      expect(snapshotDatabase(databasePath)).toEqual(before);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats an existing ready database as a read-only no-op and leaves user tables unchanged", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-ready-"));
    const databasePath = path.join(tempRoot, "ready.db");
    createFinlifeLegacyFixture(databasePath, { globalUnique: false, identityColumn: true });
    const database = new Database(databasePath);
    database.exec(`
      CREATE UNIQUE INDEX "Product_identityKey_key" ON "Product"("identityKey");
      CREATE INDEX "Product_finPrdtCd_idx" ON "Product"("finPrdtCd");
      UPDATE "Product" SET "identityKey"='finlife:deposit:0010001:SHARED-CODE';
      CREATE TABLE local_user_data (value TEXT NOT NULL);
      INSERT INTO local_user_data VALUES ('keep user data');
    `);
    database.close();
    const before = fs.readFileSync(databasePath);
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href },
        encoding: "utf8",
      });
      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      expect(`${result.stderr}\n${result.stdout}`).toContain("existing SQLite database is ready; no schema changes");
      expect(fs.readFileSync(databasePath)).toEqual(before);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses the JavaScript CLI entry instead of a Windows cmd shim", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('"prisma", "build", "index.js"');
    expect(source).toContain('".next", "standalone", "node_modules", "prisma"');
    expect(source).toContain(
      "spawnSync(process.execPath, [prismaCliPath, ...finalArgs]",
    );
    expect(source).toContain("process.loadEnvFile(filePath)");
    expect(source).not.toContain('from "dotenv"');
    expect(source).not.toContain("prisma.cmd");
  });

  it("runs the installed Prisma CLI through the current Node runtime", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--version"], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: "file:./prisma/prisma-cli-safe-test.db",
      },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("prisma");
  });

  it("creates a missing SQLite file before db push and applies the schema", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-safe-db-push-"));
    const databasePath = path.join(tempRoot, "database #1", "finance%ready.db");
    try {
      const result = spawnSync(process.execPath, [scriptPath, "db", "push"], {
        cwd: root,
        env: {
          ...process.env,
          DATABASE_URL: pathToFileURL(databasePath).href,
        },
        encoding: "utf8",
      });

      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      expect(fs.statSync(databasePath).size).toBeGreaterThan(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("SQLite database file: ready");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
