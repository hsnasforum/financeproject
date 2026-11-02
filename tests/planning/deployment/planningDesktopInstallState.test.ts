import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDesktopInstallationIdentity,
  assertManagedDesktopDatabasePath,
  copyPreservedDesktopState,
  removeDesktopBinariesPreservingState,
} from "../../../scripts/planning_desktop_install_state.mjs";
import {
  assertDesktopInstallPathsSeparated,
  assertDesktopInstallationStopped,
  buildWindowsShortcutRemovalScript,
  buildWindowsShortcutScript,
  createWindowsShortcuts,
  removeWindowsShortcuts,
  renameDesktopPath,
  resolveDesktopStageDatabaseEnvironment,
} from "../../../scripts/planning_v2_desktop_install.mjs";
import {
  DESKTOP_MANIFEST_FILENAME,
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
} from "../../../scripts/planning_v2_desktop_provenance.mjs";
import { parseArgs as parseDesktopUninstallArgs } from "../../../scripts/planning_v2_desktop_uninstall.mjs";
import { formatPlanningSqliteDatabaseUrl } from "../../../src/lib/planning/deployment/runtimeDatabase.mjs";
import { acquirePlanningWriterLease } from "../../../src/lib/planning/deployment/writerLease.mjs";
import { createFinlifeLegacyFixture, snapshotDatabase } from "../../helpers/finlifeLegacyDatabase";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-desktop-install-state-"));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

async function migrationInstallFixture({ internalControlRoot = false, existing = true, databaseRelative = "prisma/dev.db" } = {}) {
  const root = makeRoot();
  const fromDir = path.join(root, "artifact");
  const toDir = path.join(root, "installed");
  const controlRoot = internalControlRoot ? path.join(toDir, "app-data") : path.join(root, "app-data");
  write(fromDir, "package.json", JSON.stringify({ name: "finance", version: "1.4.0" }));
  write(fromDir, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(fromDir, ".env.local.example", `DATABASE_URL=file:./${databaseRelative}\nPLANNING_DATA_DIR=${path.join(controlRoot, "vault")}\n`);
  write(fromDir, "prisma/schema.prisma", fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8"));
  // A legacy update must never delegate schema changes to Prisma db push.
  write(fromDir, "scripts/prisma_cli_safe.mjs", 'throw new Error("unexpected schema db push on existing database");\n');
  const sqliteRoot = path.dirname(createRequire(import.meta.url).resolve("better-sqlite3/package.json"));
  const bindingsRoot = path.dirname(createRequire(path.join(sqliteRoot, "package.json")).resolve("bindings/package.json"));
  const uriRoot = path.dirname(createRequire(path.join(bindingsRoot, "package.json")).resolve("file-uri-to-path/package.json"));
  for (const [packageName, packageRoot] of [["better-sqlite3", sqliteRoot], ["bindings", bindingsRoot], ["file-uri-to-path", uriRoot]]) {
    fs.cpSync(packageRoot, path.join(fromDir, "node_modules", packageName), { recursive: true, dereference: true });
  }
  const checksum = await computeArtifactChecksum(fromDir);
  write(fromDir, "desktop-manifest.json", JSON.stringify({
    kind: DESKTOP_MANIFEST_KIND,
    provenanceVersion: DESKTOP_PROVENANCE_VERSION,
    version: "1.4.0",
    packageVersion: "1.4.0",
    gitSha: "a".repeat(40),
    lockfileSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(fromDir, "pnpm-lock.yaml"))).digest("hex"),
    platform: process.platform,
    arch: process.arch,
    nodeAbi: process.versions.modules,
    artifactChecksum: checksum,
  }));
  const databasePath = path.join(toDir, databaseRelative);
  if (existing) {
    write(toDir, "package.json", JSON.stringify({ name: "finance", version: "0.1.0" }));
    write(toDir, ".env.local", `DATABASE_URL=file:./${databaseRelative}\nPLANNING_DATA_DIR=${path.join(controlRoot, "vault")}\n`);
    write(toDir, "user-note.txt", "preserve user file\n");
    createFinlifeLegacyFixture(databasePath);
  }
  return { root, fromDir, toDir, controlRoot, databasePath };
}

function runMigrationInstall(input: Awaited<ReturnType<typeof migrationInstallFixture>>) {
  return spawnSync(process.execPath, [
    path.join(process.cwd(), "scripts/planning_v2_desktop_install.mjs"),
    "--self-contained-source", "--skip-install", "--skip-shortcuts",
    `--from=${input.fromDir}`, `--to=${input.toDir}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, PLANNING_DATA_DIR: path.join(input.root, "ambient-wrong/vault") },
    encoding: "utf8",
    timeout: 15_000,
  });
}

function seedDesktopInstallationIdentity(targetDir: string): void {
  const version = "1.4.0";
  const lockfile = "lockfileVersion: '9.0'\n";
  write(targetDir, "package.json", `${JSON.stringify({ name: "finance", version })}\n`);
  write(targetDir, "pnpm-lock.yaml", lockfile);
  write(targetDir, ".env.local.example", "DATABASE_URL=file:./prisma/dev.db\n");
  write(targetDir, "scripts/planning_desktop_install_state.mjs", "export {};\n");
  write(targetDir, "scripts/planning_v2_desktop_uninstall.mjs", "export {};\n");
  write(targetDir, DESKTOP_MANIFEST_FILENAME, `${JSON.stringify({
    kind: DESKTOP_MANIFEST_KIND,
    provenanceVersion: DESKTOP_PROVENANCE_VERSION,
    version,
    packageVersion: version,
    gitSha: "a".repeat(40),
    lockfileSha256: crypto.createHash("sha256").update(lockfile).digest("hex"),
    platform: process.platform,
    arch: process.arch,
    nodeAbi: process.versions.modules,
    artifactChecksum: {
      algorithm: "sha256",
      value: "b".repeat(64),
      fileCount: 1,
      totalBytes: 1,
      excludes: [DESKTOP_MANIFEST_FILENAME],
    },
  }, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("desktop installation state ownership", () => {
  it("rejects a legacy database in an application-owned directory instead of treating the omitted stage file as new", async () => {
    const input = await migrationInstallFixture({ databaseRelative: "src/private.sqlite" });
    const before = fs.readFileSync(input.databasePath);
    const sidecars = ["-wal", "-journal"].map((suffix) => `${input.databasePath}${suffix}`);
    for (const sidecar of sidecars) fs.writeFileSync(sidecar, "fixture sidecar must be preserved");
    const result = runMigrationInstall(input);
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
    expect(result.stderr).toContain("existing SQLite database was not preserved in installation stage");
    expect(result.stderr).not.toContain("unexpected schema db push");
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
    for (const sidecar of sidecars) expect(fs.readFileSync(sidecar, "utf8")).toBe("fixture sidecar must be preserved");
    expect(JSON.parse(fs.readFileSync(path.join(input.toDir, "package.json"), "utf8")).version).toBe("0.1.0");
    expect(fs.existsSync(path.join(input.controlRoot, "backups/finlife-identity"))).toBe(false);
    expect(fs.existsSync(path.join(input.controlRoot, "runtime/writer-lease.json"))).toBe(false);
    expect(fs.readdirSync(input.root).filter((entry) => entry.includes(".install-") || entry.includes(".backup-"))).toEqual([]);
  });

  it("migrates the staged legacy database while preserving IDs, references and a durable backup after activation", async () => {
    const input = await migrationInstallFixture();
    const before = snapshotDatabase(input.databasePath);
    const sourceChecksum = await computeArtifactChecksum(input.fromDir);
    const result = runMigrationInstall(input);
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(snapshotDatabase(input.databasePath, { omitIdentity: true })).toEqual(before);
    expect(fs.readFileSync(path.join(input.toDir, "user-note.txt"), "utf8")).toBe("preserve user file\n");
    const backupRoot = path.join(input.controlRoot, "backups/finlife-identity");
    const backupDirectories = fs.readdirSync(backupRoot);
    expect(backupDirectories).toHaveLength(1);
    const backupPath = path.join(backupRoot, backupDirectories[0], "before.sqlite");
    expect(snapshotDatabase(backupPath)).toEqual(before);
    expect(await computeArtifactChecksum(input.fromDir)).toEqual(sourceChecksum);
    expect(fs.existsSync(path.join(input.controlRoot, "runtime/writer-lease.json"))).toBe(false);
    const readyBytes = fs.readFileSync(input.databasePath);
    const repeated = runMigrationInstall(input);
    expect(repeated.status, `${repeated.stderr}\n${repeated.stdout}`).toBe(0);
    expect(fs.readFileSync(input.databasePath)).toEqual(readyBytes);
    expect(fs.readdirSync(backupRoot)).toEqual(backupDirectories);
  });

  it.each([true, false])("blocks installation copy when the configured control root has another writer (existing=%s)", async (existing) => {
    const input = await migrationInstallFixture({ existing });
    const before = existing ? fs.readFileSync(input.databasePath) : null;
    const lease = await acquirePlanningWriterLease({ dataRoot: input.controlRoot, writerId: "runtime.desktop" });
    try {
      const result = runMigrationInstall(input);
      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
      expect(result.stderr).toContain("PLANNING_WRITER_LEASE_HELD");
      if (before) expect(fs.readFileSync(input.databasePath)).toEqual(before);
      else expect(fs.existsSync(input.toDir)).toBe(false);
      expect(fs.readdirSync(input.root).filter((entry) => entry.includes(".install-") || entry.includes(".backup-"))).toEqual([]);
    } finally {
      await lease.release();
    }
  });

  it("fails closed on ambiguous legacy rows and keeps the prior installation intact", async () => {
    const input = await migrationInstallFixture();
    const database = new Database(input.databasePath);
    database.prepare('UPDATE "Product" SET raw=? WHERE id=40').run('{"fin_co_no":"0010002","fin_prdt_cd":"SHARED-CODE"}');
    database.close();
    const before = fs.readFileSync(input.databasePath);
    const result = runMigrationInstall(input);
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
    expect(result.stderr).toContain("FINLIFE migration:");
    expect(result.stderr).not.toContain("unexpected schema db push");
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
    expect(JSON.parse(fs.readFileSync(path.join(input.toDir, "package.json"), "utf8")).version).toBe("0.1.0");
    expect(fs.existsSync(path.join(input.controlRoot, "backups/finlife-identity"))).toBe(false);
    expect(fs.existsSync(path.join(input.controlRoot, "runtime/writer-lease.json"))).toBe(false);
    expect(fs.readdirSync(input.root).filter((entry) => entry.includes(".install-") || entry.includes(".backup-"))).toEqual([]);
  });

  it("rejects an installation-internal control root before copying or moving its lease and backup", async () => {
    const input = await migrationInstallFixture({ internalControlRoot: true });
    const before = fs.readFileSync(input.databasePath);
    const result = runMigrationInstall(input);
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
    expect(result.stderr).toContain("control root must stay outside");
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
    expect(fs.existsSync(path.join(input.controlRoot, "runtime/writer-lease.json"))).toBe(false);
    expect(fs.readdirSync(input.root).filter((entry) => entry.includes(".install-") || entry.includes(".backup-"))).toEqual([]);
  });

  it("uses only an installation-internal database and remaps an absolute target path into the stage", async () => {
    const root = makeRoot();
    const stageDir = path.join(root, "stage");
    const targetDir = path.join(root, "installed");
    fs.mkdirSync(stageDir, { recursive: true });
    write(stageDir, ".env.local", 'DATABASE_URL="file:./database #1/finance%ready.db"\n');

    const relative = await resolveDesktopStageDatabaseEnvironment({
      stageDir,
      toDir: targetDir,
      env: { NODE_ENV: "test", DATABASE_URL: "file:../ambient.db" },
    });
    expect(relative.databasePath).toBe(path.join(stageDir, "database #1", "finance%ready.db"));
    expect(relative.env.DATABASE_URL).toBe(relative.databaseUrl);

    const targetDatabase = path.join(targetDir, "storage", "absolute.db");
    write(
      stageDir,
      ".env.local",
      `DATABASE_URL="${formatPlanningSqliteDatabaseUrl({ cwd: targetDir, databasePath: targetDatabase })}"\n`,
    );
    const remapped = await resolveDesktopStageDatabaseEnvironment({ stageDir, toDir: targetDir });
    expect(remapped.databasePath).toBe(path.join(stageDir, "storage", "absolute.db"));

    const externalDatabase = path.join(root, "shared", "external.db");
    write(
      stageDir,
      ".env.local",
      `DATABASE_URL="${formatPlanningSqliteDatabaseUrl({ cwd: stageDir, databasePath: externalDatabase })}"\n`,
    );
    await expect(resolveDesktopStageDatabaseEnvironment({
      stageDir,
      toDir: targetDir,
    })).rejects.toThrow("must stay inside the installation directory");

    const linkedDatabaseRoot = path.join(root, "linked-database-root");
    fs.mkdirSync(linkedDatabaseRoot, { recursive: true });
    fs.mkdirSync(path.join(stageDir, "storage"), { recursive: true });
    fs.symlinkSync(
      linkedDatabaseRoot,
      path.join(stageDir, "storage", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    write(stageDir, ".env.local", "DATABASE_URL=file:./storage/linked/finance.db\n");
    await expect(resolveDesktopStageDatabaseEnvironment({
      stageDir,
      toDir: targetDir,
    })).rejects.toThrow("must stay inside the installation directory");
  });

  it("rejects source and target overlap through a symlink or junction alias", async () => {
    const root = makeRoot();
    const sourceDir = path.join(root, "artifact");
    const sourceAlias = path.join(root, "artifact-alias");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.symlinkSync(
      sourceDir,
      sourceAlias,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(assertDesktopInstallPathsSeparated(sourceDir, sourceAlias))
      .rejects.toThrow("must not overlap");
    await expect(assertDesktopInstallPathsSeparated(sourceDir, path.join(sourceAlias, "nested")))
      .rejects.toThrow("must not overlap");
  });

  it("keeps a managed runtime database inside the canonical installation root", async () => {
    const root = makeRoot();
    const installDir = path.join(root, "installed");
    const externalDir = path.join(root, "external");
    write(installDir, "desktop-manifest.json", "{}\n");
    write(installDir, "prisma/dev.db", "database");
    write(externalDir, "external.db", "external");

    await expect(assertManagedDesktopDatabasePath({
      installDir,
      databasePath: path.join(installDir, "prisma", "dev.db"),
    })).resolves.toMatchObject({ managed: true, allowedExternal: false });
    await expect(assertManagedDesktopDatabasePath({
      installDir,
      databasePath: path.join(externalDir, "external.db"),
    })).rejects.toThrow("must stay inside the installation directory");

    fs.symlinkSync(
      externalDir,
      path.join(installDir, "linked-database"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(assertManagedDesktopDatabasePath({
      installDir,
      databasePath: path.join(installDir, "linked-database", "external.db"),
    })).rejects.toThrow("must stay inside the installation directory");
  });

  it("retries only transient Windows-style rename failures within the bound", async () => {
    let attempts = 0;
    const waits: number[] = [];
    await renameDesktopPath("stage", "target", {
      rename: async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("temporarily locked"), { code: "EBUSY" });
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      maxAttempts: 3,
      retryDelayMs: 7,
    });

    expect(attempts).toBe(3);
    expect(waits).toEqual([7, 7]);

    let permanentAttempts = 0;
    await expect(renameDesktopPath("stage", "target", {
      rename: async () => {
        permanentAttempts += 1;
        throw Object.assign(new Error("invalid target"), { code: "EINVAL" });
      },
      wait: async () => undefined,
      maxAttempts: 3,
    })).rejects.toThrow("invalid target");
    expect(permanentAttempts).toBe(1);
  });

  it("resolves the authoritative stage database before dependency postinstall", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs"),
      "utf8",
    );
    const databaseIndex = source.indexOf(
      "const database = await resolveDesktopStageDatabaseEnvironment({ stageDir, toDir });",
    );
    const installIndex = source.indexOf('runPnpm(["install", "--frozen-lockfile"]');

    expect(databaseIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(databaseIndex);
    expect(source.slice(installIndex, installIndex + 260)).toContain("env: database.env");
  });

  it("preserves environment, SQLite, data, and unknown user files while replacing binaries", async () => {
    const root = makeRoot();
    const existingDir = path.join(root, "existing");
    const stageDir = path.join(root, "stage");
    write(existingDir, ".env.local", 'DATABASE_URL="file:./database #1/finance%ready.db"\n');
    write(existingDir, "prisma/dev.db", "old-database");
    write(existingDir, "prisma/dev.db-wal", "old-wal");
    write(existingDir, "prisma/schema.prisma", "old-schema");
    write(existingDir, ".data/planning/profile.json", "user-profile");
    write(existingDir, "storage/custom.db", "custom-database");
    write(existingDir, "scripts/old.mjs", "old-code");
    write(stageDir, "prisma/schema.prisma", "new-schema");
    write(stageDir, "scripts/new.mjs", "new-code");

    const preserved = await copyPreservedDesktopState({ existingDir, stageDir });

    expect(preserved).toEqual([
      ".data",
      ".env.local",
      "prisma/dev.db",
      "prisma/dev.db-wal",
      "storage",
    ]);
    expect(fs.readFileSync(path.join(stageDir, ".env.local"), "utf8")).toContain("database #1");
    expect(fs.readFileSync(path.join(stageDir, "prisma/dev.db"), "utf8")).toBe("old-database");
    expect(fs.readFileSync(path.join(stageDir, "prisma/schema.prisma"), "utf8")).toBe("new-schema");
    expect(fs.existsSync(path.join(stageDir, "scripts/old.mjs"))).toBe(false);
    expect(fs.readFileSync(path.join(stageDir, "scripts/new.mjs"), "utf8")).toBe("new-code");
  });

  it("rejects nested symlinks or junctions in preserved state", async () => {
    const root = makeRoot();
    const existingDir = path.join(root, "existing");
    const stageDir = path.join(root, "stage");
    const externalDir = path.join(root, "external");
    fs.mkdirSync(path.join(existingDir, "storage", "nested"), { recursive: true });
    fs.mkdirSync(stageDir, { recursive: true });
    write(externalDir, "outside.db", "outside");
    fs.symlinkSync(
      externalDir,
      path.join(existingDir, "storage", "nested", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(copyPreservedDesktopState({ existingDir, stageDir }))
      .rejects.toThrow("unsupported symlink or junction");
    expect(fs.existsSync(path.join(stageDir, "storage"))).toBe(false);
  });

  it("removes only package-owned entries and keeps local state during uninstall", async () => {
    const root = makeRoot();
    const targetDir = path.join(root, "installed");
    seedDesktopInstallationIdentity(targetDir);
    write(targetDir, ".env.local", "DATABASE_URL=file:./prisma/dev.db\n");
    write(targetDir, "prisma/dev.db", "database");
    write(targetDir, "prisma/schema.prisma", "schema");
    write(targetDir, "prisma/migrations/001.sql", "migration");
    write(targetDir, ".data/planning/profile.json", "profile");
    write(targetDir, "scripts/runtime.mjs", "runtime");

    const preserved = await removeDesktopBinariesPreservingState(targetDir);

    expect(preserved).toEqual([".data", ".env.local", "prisma"]);
    expect(fs.readFileSync(path.join(targetDir, "prisma/dev.db"), "utf8")).toBe("database");
    expect(fs.existsSync(path.join(targetDir, "prisma/schema.prisma"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, "scripts"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(false);
  });

  it("can leave only the active uninstall wrapper for its host to self-delete", async () => {
    const root = makeRoot();
    const targetDir = path.join(root, "installed");
    seedDesktopInstallationIdentity(targetDir);
    write(targetDir, ".env.local", "DATABASE_URL=file:./prisma/dev.db\n");
    write(targetDir, "prisma/dev.db", "database");
    write(targetDir, "uninstall.cmd", "@echo off\r\n");
    write(targetDir, "uninstall.sh", "#!/usr/bin/env bash\n");

    const preserved = await removeDesktopBinariesPreservingState(targetDir, {
      preserveOwnedEntries: ["uninstall.cmd"],
    });

    expect(preserved).toEqual([".env.local", "prisma"]);
    expect(fs.existsSync(path.join(targetDir, "uninstall.cmd"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "uninstall.sh"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(false);
  });

  it("requires a complete managed installation identity before package-owned deletion", async () => {
    const root = makeRoot();
    const targetDir = path.join(root, "package-shaped-project");
    write(targetDir, "package.json", "{}\n");
    write(targetDir, "scripts/runtime.mjs", "runtime\n");

    await expect(assertDesktopInstallationIdentity(targetDir))
      .rejects.toThrow("desktop uninstall manifest");
    await expect(removeDesktopBinariesPreservingState(targetDir))
      .rejects.toThrow("desktop uninstall manifest");
    expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "scripts/runtime.mjs"))).toBe(true);

    seedDesktopInstallationIdentity(targetDir);
    fs.appendFileSync(path.join(targetDir, "pnpm-lock.yaml"), "# drift\n", "utf8");
    await expect(assertDesktopInstallationIdentity(targetDir))
      .rejects.toThrow("lockfile identity");
    expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
  });

  it("rejects empty, missing, misspelled, and positional uninstall arguments", () => {
    expect(() => parseDesktopUninstallArgs(["--target="]))
      .toThrow("--target requires a non-empty value");
    expect(() => parseDesktopUninstallArgs(["--target", "--no-shortcuts"]))
      .toThrow("--target requires a non-empty value");
    expect(() => parseDesktopUninstallArgs(["--targte=/tmp/planning"]))
      .toThrow("unknown uninstall option");
    expect(() => parseDesktopUninstallArgs(["/tmp/planning"]))
      .toThrow("unexpected uninstall argument");
    expect(parseDesktopUninstallArgs(["--target", "/tmp/planning", "--no-shortcuts"]))
      .toMatchObject({ target: "/tmp/planning", removeShortcuts: false });
  });

  it("blocks updates while the configured desktop control root has a live instance", async () => {
    const root = makeRoot();
    const installDir = path.join(root, "installed");
    const planningRoot = path.join(root, "app-data", "vault");
    const lockPath = path.join(root, "app-data", "runtime", "desktop-instance.lock.json");
    write(installDir, ".env.local", `PLANNING_DATA_DIR=${planningRoot}\n`);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid })}\n`, "utf8");

    await expect(assertDesktopInstallationStopped({
      installDir,
      env: {
        NODE_ENV: "test",
        PLANNING_APP_NAME: "AmbientWrongApp",
        PLANNING_DATA_DIR: path.join(root, "ambient-wrong", "vault"),
      },
    })).rejects.toThrow("desktop app is still running");

    fs.rmSync(lockPath);
    await expect(assertDesktopInstallationStopped({
      installDir,
      env: {
        NODE_ENV: "test",
        PLANNING_APP_NAME: "AmbientWrongApp",
        PLANNING_DATA_DIR: path.join(root, "ambient-wrong", "vault"),
      },
    })).resolves.toMatchObject({ dataRoot: planningRoot });
  });

  it("blocks uninstall before mutating an installation with a live instance", () => {
    const root = makeRoot();
    const installDir = path.join(root, "installed");
    const planningRoot = path.join(root, "app-data", "vault");
    const lockPath = path.join(root, "app-data", "runtime", "desktop-instance.lock.json");
    seedDesktopInstallationIdentity(installDir);
    write(installDir, ".env.local", `PLANNING_DATA_DIR=${planningRoot}\n`);
    write(root, path.relative(root, lockPath), `${JSON.stringify({ pid: process.pid })}\n`);

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "planning_v2_desktop_uninstall.mjs"),
      "--target",
      installDir,
      "--no-shortcuts",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PLANNING_APP_NAME: "AmbientWrongApp",
        PLANNING_DATA_DIR: path.join(root, "ambient-wrong", "vault"),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("desktop app is still running");
    expect(fs.existsSync(path.join(installDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, ".env.local"))).toBe(true);

    fs.rmSync(lockPath);
    const completed = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "planning_v2_desktop_uninstall.mjs"),
      `--target=${installDir}`,
      "--no-shortcuts",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PLANNING_APP_NAME: "AmbientWrongApp",
        PLANNING_DATA_DIR: path.join(root, "ambient-wrong", "vault"),
      },
    });

    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stdout).toContain(`kept dataDir=${planningRoot}`);
    expect(fs.existsSync(path.join(installDir, "package.json"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, ".env.local"))).toBe(true);
  });

  it("generates compensating shortcut creation and restores touched links on Windows", async () => {
    const script = buildWindowsShortcutScript("C:\\Planning", "Planning v2", [
      "C:\\Desktop\\Planning v2.lnk",
    ]);
    expect(script).toContain("ReadAllBytes");
    expect(script).toContain("WriteAllBytes");
    expect(script).toContain("[IO.File]::Delete");
    expect(script).toContain("$touched");
    expect(script).toContain("$rollbackFailures");
    expect(script).toContain("desktop shortcut creation and rollback failed");

    if (process.platform !== "win32") return;
    const root = makeRoot();
    const installDir = path.join(root, "installed");
    const firstLink = path.join(root, "first.lnk");
    const blockedParent = path.join(root, "blocked-parent");
    const secondLink = path.join(blockedParent, "second.lnk");
    write(installDir, "run.cmd", "@echo off\r\n");
    await createWindowsShortcuts(installDir, "Planning test", {
      shortcutPaths: [firstLink],
    });
    const original = fs.readFileSync(firstLink);
    fs.writeFileSync(blockedParent, "not a directory", "utf8");

    await expect(createWindowsShortcuts(installDir, "Planning test", {
      shortcutPaths: [firstLink, secondLink],
    })).rejects.toThrow();
    expect(fs.readFileSync(firstLink)).toEqual(original);
    expect(fs.existsSync(secondLink)).toBe(false);
  });

  it("uses Windows known folders and reports shortcut removal failures before uninstall", async () => {
    const script = buildWindowsShortcutRemovalScript("Planning v2");
    expect(script).toContain("[Environment]::GetFolderPath('Desktop')");
    expect(script).toContain("[Environment]::GetFolderPath('Programs')");
    expect(script).toContain("$failures.Add");
    expect(script).toContain("AggregateException");

    if (process.platform !== "win32") return;
    const root = makeRoot();
    const blockedLink = path.join(root, "blocked.lnk");
    const removableLink = path.join(root, "removable.lnk");
    fs.mkdirSync(blockedLink, { recursive: true });
    fs.writeFileSync(removableLink, "shortcut", "utf8");

    await expect(removeWindowsShortcuts("Planning test", {
      cwd: root,
      shortcutPaths: [blockedLink, removableLink],
    })).rejects.toThrow();
    expect(fs.existsSync(blockedLink)).toBe(true);
    expect(fs.existsSync(removableLink)).toBe(false);
  });

  it("rejects shortcut names that could escape a Windows known folder", () => {
    expect(() => buildWindowsShortcutScript("C:\\Planning", "..\\outside"))
      .toThrow("unsupported Windows filename characters");
    expect(() => buildWindowsShortcutRemovalScript("outside/child"))
      .toThrow("unsupported Windows filename characters");
  });
});
