import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPlanningSmokeDatabaseFile,
  resolvePlanningSmokeDatabaseUrl,
} from "../../../scripts/planning_smoke_database.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("planning smoke database URL", () => {
  it("uses Prisma-compatible absolute SQLite URLs on Windows", () => {
    expect(resolvePlanningSmokeDatabaseUrl({
      appDir: "C:\\apps\\planning",
      databasePath: "C:\\smoke\\finance.db",
      platform: "win32",
    })).toBe("file:C:/smoke/finance.db");
    expect(resolvePlanningSmokeDatabaseUrl({
      appDir: "C:\\apps\\Planning #1",
      databasePath: "C:\\smoke data\\finance%ready.db",
      platform: "win32",
    })).toBe("file:C:/smoke data/finance%ready.db");
  });

  it("fails closed when a Windows smoke database is on another volume", () => {
    expect(() => resolvePlanningSmokeDatabaseUrl({
      appDir: "D:\\apps\\planning",
      databasePath: "C:\\smoke\\finance.db",
      platform: "win32",
    })).toThrow("same filesystem volume");
  });

  it("uses canonical absolute POSIX smoke database URLs", () => {
    expect(resolvePlanningSmokeDatabaseUrl({
      appDir: "/opt/planning",
      databasePath: "/tmp/planning-smoke/finance.db",
      platform: "linux",
    })).toBe("file:/tmp/planning-smoke/finance.db");
    expect(resolvePlanningSmokeDatabaseUrl({
      appDir: "/opt/planning",
      databasePath: "/tmp/planning #1/finance%ready.db",
      platform: "linux",
    })).toBe("file:/tmp/planning #1/finance%ready.db");
  });

  it("creates a new empty database file before Prisma schema preparation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-smoke-database-"));
    cleanupRoots.push(root);
    const databasePath = path.join(root, "database", "finance.db");

    await createPlanningSmokeDatabaseFile(databasePath);

    await expect(fs.stat(databasePath)).resolves.toMatchObject({ size: 0 });
    await expect(createPlanningSmokeDatabaseFile(databasePath)).rejects.toMatchObject({ code: "EEXIST" });
  });
});
