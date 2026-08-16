import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runV3Migrate } from "../../../src/lib/planning/v3/ops/migrate";
import { runV3Trim } from "../../../src/lib/planning/v3/ops/trim";
import { resolvePlanningWriterTarget } from "../../../src/lib/planning/storage/writerTargets";
import {
  resolvePlanningAssumptionsPath,
  resolvePlanningOpenApiPaths,
  resolvePlanningOpsPaths,
  resolvePlanningRegressionPaths,
  resolvePlanningReleasePaths,
} from "../../../scripts/planning_runtime_paths.mjs";

describe("canonical Planning writer consumers", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("resolves trim and migrate previews against an explicit canonical owner root", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "planning-writer-consumer-"));
    roots.push(cwd);
    const planningRoot = path.join(cwd, "owned", "planning");
    const env = { NODE_ENV: "test", PLANNING_DATA_DIR: planningRoot } as NodeJS.ProcessEnv;
    const targetInput = { cwd, env, platform: "linux" as const };
    const newsRoot = resolvePlanningWriterTarget("archive:v3.news", targetInput).paths[0];
    expect(newsRoot).toBe(path.join(cwd, "owned", "news"));

    const trim = runV3Trim({ ...targetInput, apply: false, now: new Date("2026-08-16T00:00:00.000Z") });
    expect(trim.mode).toBe("preview");
    expect(trim.totals).toEqual({ candidates: 0, trimmed: 0, errors: 0 });

    const migrate = runV3Migrate({ ...targetInput, apply: false, now: new Date("2026-08-16T00:00:00.000Z") });
    expect(migrate.mode).toBe("preview");
    expect(migrate.files.map((file) => file.path)).toContain(".data/news/state.json");
    expect(fs.existsSync(path.join(cwd, ".data"))).toBe(false);
  });

  it("fails closed instead of silently switching away from an existing legacy writer path", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "planning-writer-migration-"));
    roots.push(cwd);
    fs.mkdirSync(path.join(cwd, ".data", "news"), { recursive: true });
    const env = { NODE_ENV: "test", PLANNING_DATA_DIR: path.join(cwd, "owned", "planning") } as NodeJS.ProcessEnv;
    expect(() => runV3Migrate({ cwd, env, platform: "linux", apply: false }))
      .toThrowError(/PATH_MIGRATION_REQUIRED:/u);
  });

  it("treats the development exposure owner as an exact file target", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "planning-writer-exposure-"));
    roots.push(cwd);
    const exposurePath = path.join(cwd, ".data", "exposure", "profile.json");
    fs.mkdirSync(path.dirname(exposurePath), { recursive: true });
    fs.writeFileSync(exposurePath, "{}\n", "utf8");
    const summary = runV3Migrate({ cwd, env: { NODE_ENV: "test" }, platform: "linux", apply: false });
    expect(summary.files.find((file) => file.path === ".data/exposure/profile.json")?.exists).toBe(true);
  });

  it("backs up only canonical migration targets under an explicit runtime root", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "planning-writer-backup-"));
    roots.push(cwd);
    const env = { NODE_ENV: "test", PLANNING_DATA_DIR: path.join(cwd, "owned", "planning") } as NodeJS.ProcessEnv;
    const targetInput = { cwd, env, platform: "linux" as const };
    const exposurePath = resolvePlanningWriterTarget("archive:v3.exposure", targetInput).paths[0];
    if (!exposurePath) throw new Error("missing exposure target");
    fs.mkdirSync(path.dirname(exposurePath), { recursive: true });
    fs.writeFileSync(exposurePath, "{}\n", "utf8");
    fs.writeFileSync(path.join(cwd, "owned", "unrelated.txt"), "preserve\n", "utf8");

    const summary = runV3Migrate({
      ...targetInput,
      apply: true,
      now: new Date("2026-08-16T00:00:00.000Z"),
    });

    expect(summary.backupPath).toBe(path.join(cwd, "owned.bak-20260816000000"));
    expect(fs.existsSync(path.join(summary.backupPath ?? "", "exposure", "profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(summary.backupPath ?? "", "unrelated.txt"))).toBe(false);
  });

  it("resolves non-archive script paths through registered targets and blocks legacy drift", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "planning-writer-script-paths-"));
    roots.push(cwd);
    const planningRoot = path.join(cwd, "owned", "planning");
    const input = { cwd, env: { PLANNING_DATA_DIR: planningRoot }, platform: "linux" as const, homeDir: "/home/tester" };
    expect(resolvePlanningOpsPaths(input).root).toBe(path.join(planningRoot, "ops"));
    expect(resolvePlanningReleasePaths(input).root).toBe(path.join(planningRoot, "release"));
    expect(resolvePlanningRegressionPaths(input).root).toBe(path.join(planningRoot, "eval"));
    expect(resolvePlanningOpenApiPaths(input).root).toBe(path.join(planningRoot, "openapi"));
    expect(resolvePlanningAssumptionsPath(input)).toBe(path.join(planningRoot, "assumptions.latest.json"));

    fs.mkdirSync(path.join(cwd, ".data", "planning", "ops"), { recursive: true });
    expect(() => resolvePlanningOpsPaths(input)).toThrowError(/PATH_MIGRATION_REQUIRED:/u);
  });
});
