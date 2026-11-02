import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { acquirePlanningWriterLease } from "../../../src/lib/planning/deployment/writerLease.mjs";
import {
  PLANNING_DISABLED_WRITER_SCRIPTS,
  PLANNING_MUTATING_PACKAGE_SCRIPTS,
  PLANNING_READ_ONLY_PACKAGE_SCRIPTS,
} from "../../../src/lib/planning/deployment/writerRegistry.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function runWriterWrapper(args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/planning_writer_entry.mjs"), ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout: stdout.join(""), stderr: stderr.join("") }));
  });
}

function runScheduler(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("bash", ["scripts/planning_v2_ops_scheduler.sh", ...args], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout: stdout.join(""), stderr: stderr.join("") }));
  });
}

describe("planning writer registry", () => {
  it("uses the installed authoritative environment and production root for the identity migration writer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-identity-writer-env-"));
    cleanupRoots.push(root);
    const cwd = path.join(root, "installed");
    const controlRoot = path.join(root, "configured-control");
    const markerPath = path.join(root, "writer-env.json");
    await fs.mkdir(cwd);
    await fs.writeFile(path.join(cwd, "desktop-manifest.json"), "{}\n");
    await fs.writeFile(path.join(cwd, ".env.local"), `DATABASE_URL=file:./prisma/managed.db\nPLANNING_DATA_DIR=${path.join(controlRoot, "vault")}\nPLANNING_APP_NAME=ManagedIdentityFixture\n`);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "file:./ambient-wrong.db",
      PLANNING_DATA_DIR: path.join(root, "ambient-wrong", "vault"),
      PLANNING_APP_NAME: "AmbientWrongApp",
    };
    const args = ["finlife:identity:migrate:apply", "--", process.execPath, "--input-type=module", "--eval",
      `await import("node:fs/promises").then((fs) => fs.writeFile(${JSON.stringify(markerPath)}, JSON.stringify({databaseUrl:process.env.DATABASE_URL, planningRoot:process.env.PLANNING_DATA_DIR, controlRoot:process.env.PLANNING_WRITER_DATA_ROOT, nodeEnv:process.env.NODE_ENV})))`];
    const lease = await acquirePlanningWriterLease({ dataRoot: controlRoot, writerId: "runtime.desktop" });
    try {
      const blocked = await runWriterWrapper(args, env, cwd);
      expect(blocked.code).toBe(1);
      expect(blocked.stderr).toContain("PLANNING_WRITER_LEASE_HELD");
      await expect(fs.access(markerPath)).rejects.toThrow();
    } finally {
      await lease.release();
    }
    const allowed = await runWriterWrapper(args, env, cwd);
    expect(allowed, allowed.stderr).toMatchObject({ code: 0 });
    expect(JSON.parse(await fs.readFile(markerPath, "utf8"))).toEqual({
      databaseUrl: "file:./prisma/managed.db",
      planningRoot: path.join(controlRoot, "vault"),
      controlRoot,
      nodeEnv: "production",
    });
  });

  it("keeps an explicit source-checkout database and planning root for the identity writer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-identity-source-env-"));
    cleanupRoots.push(root);
    const markerPath = path.join(root, "writer-env.json");
    const planningRoot = path.join(root, "planning");
    await fs.writeFile(path.join(root, ".env.local"), "DATABASE_URL=file:./configured.db\nPLANNING_DATA_DIR=./configured/vault\n");
    const result = await runWriterWrapper([
      "finlife:identity:migrate:apply", "--", process.execPath, "--input-type=module", "--eval",
      `await import("node:fs/promises").then((fs) => fs.writeFile(${JSON.stringify(markerPath)}, JSON.stringify({databaseUrl:process.env.DATABASE_URL, planningRoot:process.env.PLANNING_DATA_DIR})))`,
    ], { ...process.env, NODE_ENV: "test", DATABASE_URL: "file:./explicit.db", PLANNING_DATA_DIR: planningRoot }, root);
    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(JSON.parse(await fs.readFile(markerPath, "utf8"))).toEqual({ databaseUrl: "file:./explicit.db", planningRoot });
  });

  it("routes every supported mutating package script through the canonical wrapper", async () => {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const scriptName of PLANNING_MUTATING_PACKAGE_SCRIPTS) {
      expect(packageJson.scripts[scriptName], scriptName)
        .toContain(`planning_writer_entry.mjs ${scriptName} --`);
    }
  });

  it("keeps read-only and disabled commands outside the active writer wrapper", async () => {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const scriptName of [...PLANNING_READ_ONLY_PACKAGE_SCRIPTS, ...PLANNING_DISABLED_WRITER_SCRIPTS]) {
      expect(packageJson.scripts[scriptName], scriptName).not.toContain("planning_writer_entry.mjs");
    }
    expect(packageJson.scripts.start).toContain("planning_v2_desktop_launch.mjs");
    expect(packageJson.scripts["start:local"]).toContain("start_local.mjs");
    expect(await fs.readFile("scripts/start_local.mjs", "utf8")).toContain("planning_v2_desktop_launch.mjs");
    expect(packageJson.scripts["start:raw"]).toContain("planning_unsupported_mode.mjs");
    expect(await fs.readFile("scripts/planning_v2_ops_scheduler.sh", "utf8"))
      .toContain("planning_writer_entry.mjs planning:v2:ops:scheduler --");
  });

  it("blocks a real command while another process owns the same app data root", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-writer-registry-"));
    cleanupRoots.push(controlRoot);
    const markerPath = path.join(controlRoot, "ran.txt");
    const planningRoot = path.join(controlRoot, "planning");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      PLANNING_DATA_DIR: planningRoot,
    };
    const lease = await acquirePlanningWriterLease({
      dataRoot: controlRoot,
      writerId: "test-holder",
    });

    const blocked = await runWriterWrapper([
      "news:refresh",
      "--",
      process.execPath,
      "--input-type=module",
      "--eval",
      `await import("node:fs/promises").then((fs) => fs.writeFile(${JSON.stringify(markerPath)}, "ran"))`,
    ], env);
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain("PLANNING_WRITER_LEASE_HELD");
    await expect(fs.access(markerPath)).rejects.toThrow();

    await lease.release();
    const allowed = await runWriterWrapper([
      "news:refresh",
      "--",
      process.execPath,
      "--input-type=module",
      "--eval",
      `await import("node:fs/promises").then((fs) => fs.writeFile(${JSON.stringify(markerPath)}, "ran"))`,
    ], env);
    expect(allowed).toMatchObject({ code: 0, stderr: "" });
    await expect(fs.readFile(markerPath, "utf8")).resolves.toBe("ran");
  });

  it.skipIf(process.platform === "win32")("preserves the scheduler command failure code and event status", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-writer-scheduler-"));
    cleanupRoots.push(controlRoot);
    const planningRoot = path.join(controlRoot, "planning");
    const result = await runScheduler(["weekly"], {
      ...process.env,
      NODE_ENV: "test",
      NODE_BIN_DIR: path.dirname(process.execPath),
      PLANNING_DATA_DIR: planningRoot,
      PNPM_BIN: "false",
    });

    expect(result.code).toBe(1);
    const eventSource = await fs.readFile(path.join(planningRoot, "ops", "logs", "scheduler.ndjson"), "utf8");
    const event = JSON.parse(eventSource.trim()) as { ok: boolean; exitCode: number; message: string };
    expect(event).toMatchObject({ ok: false, exitCode: 1, message: "failed" });
  });
});
