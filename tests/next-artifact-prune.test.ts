import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  pruneRootIsolatedBuildArtifacts,
  pruneStandaloneDataArtifactsForBuildPreflight,
} from "../scripts/next_artifact_prune.mjs";

const roots: string[] = [];
const children: ChildProcess[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-next-artifact-prune-"));
  roots.push(root);
  return root;
}

function seedIsolatedBuildArtifacts(root: string) {
  fs.mkdirSync(path.join(root, ".next-build-live"), { recursive: true });
  fs.mkdirSync(path.join(root, ".next-build-old"), { recursive: true });
  fs.writeFileSync(path.join(root, ".next-build-live-tsconfig.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(root, ".next-build-old-tsconfig.json"), "{}\n", "utf8");
  fs.writeFileSync(
    path.join(root, ".next-build-info.json"),
    `${JSON.stringify({ distDir: ".next-build-live" })}\n`,
    "utf8",
  );
}

function seedTrackedStandaloneDataArtifacts(root: string) {
  const itemsDir = path.join(root, ".next-build-live", "standalone", ".data", "news", "items");
  fs.mkdirSync(itemsDir, { recursive: true });
  fs.writeFileSync(path.join(itemsDir, "sample.json"), '{"ok":true}\n', "utf8");
  fs.writeFileSync(
    path.join(root, ".next-build-info.json"),
    `${JSON.stringify({ distDir: ".next-build-live" })}\n`,
    "utf8",
  );
}

async function spawnRepoRuntime(root: string, argv1: string): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000);", argv1],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  children.push(child);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return child;
}

async function stopChildren() {
  const pending = children.splice(0).map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  });
  await Promise.all(pending);
}

afterEach(async () => {
  await stopChildren();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("next_artifact_prune", () => {
  it("prunes stale isolated build artifacts even while repo dev runtime is active", async () => {
    const root = makeRoot();
    seedIsolatedBuildArtifacts(root);
    await spawnRepoRuntime(root, "next_dev_safe.mjs");

    const result = pruneRootIsolatedBuildArtifacts({ cwd: root });

    expect(result.skippedDueToActiveRuntime).toBe(false);
    expect(result.removed).toContain(".next-build-old");
    expect(result.removed).toContain(".next-build-old-tsconfig.json");
    expect(result.skipped).toContain(".next-build-live");
    expect(result.skipped).toContain(".next-build-live-tsconfig.json");
    expect(result.skipped).toContain(".next-build-info.json");
    expect(fs.existsSync(path.join(root, ".next-build-live"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".next-build-old"))).toBe(false);
  });

  it("skips isolated build pruning while repo build runtime is active", async () => {
    const root = makeRoot();
    seedIsolatedBuildArtifacts(root);
    await spawnRepoRuntime(root, "next_build_safe.mjs");

    const result = pruneRootIsolatedBuildArtifacts({ cwd: root });

    expect(result.skippedDueToActiveRuntime).toBe(true);
    expect(result.activeRuntimeProcesses.map((entry) => entry.kind)).toContain("build");
    expect(result.removed).toEqual([]);
    expect(fs.existsSync(path.join(root, ".next-build-old"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".next-build-old-tsconfig.json"))).toBe(true);
  });

  it("prunes tracked standalone data shadows during build preflight even while repo dev runtime is active", async () => {
    const root = makeRoot();
    seedTrackedStandaloneDataArtifacts(root);
    await spawnRepoRuntime(root, "next_dev_safe.mjs");

    const result = pruneStandaloneDataArtifactsForBuildPreflight({ cwd: root });

    expect(result.skippedDueToActiveRuntime).toBe(false);
    expect(result.removed).toContain(".next-build-live/standalone/.data");
    expect(fs.existsSync(path.join(root, ".next-build-live", "standalone", ".data"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".next-build-live"))).toBe(true);
  });

  it("skips tracked standalone data cleanup while repo prod runtime is active", async () => {
    const root = makeRoot();
    seedTrackedStandaloneDataArtifacts(root);
    await spawnRepoRuntime(root, "next_prod_safe.mjs");

    const result = pruneStandaloneDataArtifactsForBuildPreflight({ cwd: root });

    expect(result.skippedDueToActiveRuntime).toBe(true);
    expect(result.activeRuntimeProcesses.map((entry) => entry.kind)).toContain("prod");
    expect(fs.existsSync(path.join(root, ".next-build-live", "standalone", ".data", "news", "items"))).toBe(true);
  });
});
