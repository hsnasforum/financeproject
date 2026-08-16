import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANNING_WRITER_ENTRYPOINTS,
  PLANNING_WRITER_EXCLUSIONS,
  PLANNING_WRITER_SOURCES,
  createPlanningWriterTargetRegistry,
  planningWriterRegistryDigest,
} from "../../../src/lib/planning/storage/writerOwnershipRegistry.mjs";
import { PLANNING_DATA_OWNER_IDS, createPlanningArchiveContext, resolvePlanningDataOwners } from "../../../src/lib/ops/backup/planningOwnerRegistry";
import { PLANNING_WRITER_TARGET_REGISTRY, resolvePlanningWriterTarget } from "../../../src/lib/planning/storage/writerTargets";
import {
  findUnclassifiedMutationCandidates,
  findExportedBypassErrors,
  findExportedBypassGraphErrors,
  findPackageScriptMutationCandidates,
  findUndeclaredRegisteredChildren,
  findUnregisteredPackageAliases,
  runPlanningWriterOwnershipGuard,
  scanChildProcessPackageScripts,
  scanDirectWriterPathViolations,
  scanMutationSignals,
  validatePlanningWriterTargets,
} from "../../../scripts/planning_writer_ownership_guard.mjs";

const repoRoot = path.resolve(__dirname, "../../..");

describe("Planning writer ownership registry", () => {
  it("references the canonical 17 archive owners without changing their exact set", () => {
    const archiveTargets = PLANNING_WRITER_TARGET_REGISTRY.filter((target) => target.class === "archive-owner");
    expect(archiveTargets.map((target) => target.archiveOwnerId)).toEqual([...PLANNING_DATA_OWNER_IDS]);
    expect(PLANNING_DATA_OWNER_IDS).toHaveLength(17);
  });

  it("keeps archive target namespace provenance aligned with the owner registry", () => {
    const context = createPlanningArchiveContext({
      cwd: "/workspace/app",
      env: { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "1", PLANNING_USER_ID: "alice" },
      platform: "linux",
      userId: "alice",
    });
    const owners = resolvePlanningDataOwners(context);
    const targets = createPlanningWriterTargetRegistry(PLANNING_DATA_OWNER_IDS)
      .filter((target) => target.class === "archive-owner");
    for (const target of targets) {
      const owner = owners.find((row) => row.ownerId === target.archiveOwnerId);
      expect(target.namespace).toBe(owner?.namespace.mode === "shared" ? "runtime-shared" : "user");
    }
  });

  it("resolves archive physical paths only through the owner registry", () => {
    const input = { cwd: "/workspace/app", env: { NODE_ENV: "development" } as NodeJS.ProcessEnv, platform: "linux" as const };
    const owner = resolvePlanningDataOwners(createPlanningArchiveContext(input)).find((row) => row.ownerId === "v3.news");
    expect(owner).toBeDefined();
    expect(resolvePlanningWriterTarget("archive:v3.news", input).paths)
      .toEqual(owner?.locations.map((location) => location.targetPath));
  });

  it("keeps exact file targets separate from directory targets", () => {
    const input = { cwd: "/workspace/app", env: { NODE_ENV: "development" } as NodeJS.ProcessEnv, platform: "linux" as const };
    expect(resolvePlanningWriterTarget("control.assumptions", input).paths).toEqual([path.resolve(input.cwd, ".data/planning/assumptions")]);
    expect(resolvePlanningWriterTarget("control.assumptions-latest", input).paths).toEqual([path.resolve(input.cwd, ".data/planning/assumptions.latest.json")]);
    expect(resolvePlanningWriterTarget("control.local-auth", input).paths).toEqual([path.resolve(input.cwd, ".data/planning/users/index.json")]);
  });

  it("keeps every registered source, target, exclusion, and entrypoint machine-checkable", () => {
    expect(PLANNING_WRITER_SOURCES).toHaveLength(63);
    expect(PLANNING_WRITER_EXCLUSIONS).toHaveLength(17);
    expect(PLANNING_WRITER_ENTRYPOINTS).toHaveLength(46);
    for (const source of PLANNING_WRITER_SOURCES) expect(fs.existsSync(path.join(repoRoot, source.sourcePath))).toBe(true);
    const report = runPlanningWriterOwnershipGuard();
    expect(report.errors).toEqual([]);
    expect(report.counts.unresolved).toBe(0);
    expect(report.counts).toMatchObject({ targets: 39, sources: 63, exclusions: 17, entrypoints: 46 });
    expect(report.digest).toBe("2e3f6d4ceeeb7247b1e572c015b7f10282da0e1bbcdc717845d23d73cb49474f");
    expect(PLANNING_WRITER_SOURCES.filter((source) => source.mutationSignals.includes("manual-indirect")).map((source) => source.id)).toEqual([
      "ops.action-log",
      "ops.auto-merge",
      "ops.planning-data-vault",
      "ops.preview-token",
      "ops.replace-restore",
      "ops.data-quality",
      "ops.metrics-store",
      "ops.metrics-log",
      "ops.scheduler-health",
      "ops.security-audit",
      "planning.local-auth",
      "planning.reports",
      "planning.share",
      "planning.run-codec",
    ]);
  });

  it("detects fs aliases and fails a new unclassified writer closed", () => {
    const findings = scanMutationSignals("fixture.ts", `
      import { promises as fsPromises } from "node:fs";
      import { writeFile as save } from "node:fs/promises";
      export async function mutate() {
        await fsPromises.rename("a", "b");
        await save("b", "value");
      }
    `);
    expect(findings.map((finding) => finding.signal)).toEqual(expect.arrayContaining(["fs:rename", "fs:writeFile"]));
    expect(findUnclassifiedMutationCandidates(
      [{ sourcePath: "src/lib/planning/newWriter.ts", findings }],
      new Set(),
      new Set(),
    )).toEqual([expect.stringContaining("UNCLASSIFIED_MUTATION_SOURCE:src/lib/planning/newWriter.ts")]);
  });

  it("detects createRequire SQLite writers and unregistered Planning script executables", () => {
    const sqliteSource = `
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      const Database = require("better-sqlite3");
      new Database("database.db");
    `;
    expect(scanMutationSignals("scripts/new_writer.mjs", sqliteSource).map((finding) => finding.signal)).toContain("sqlite:open");
    expect(findPackageScriptMutationCandidates(
      { "planning:new-writer": "node scripts/new_writer.mjs" },
      (sourcePath) => sourcePath === "scripts/new_writer.mjs" ? sqliteSource : null,
    )).toEqual([{ sourcePath: "scripts/new_writer.mjs", findings: [{ signal: "sqlite:open", line: 5 }] }]);
  });

  it("fails a new package alias to a mutating executable closed", () => {
    expect(findUnregisteredPackageAliases(
      { "planning:unsafe-alias": "node scripts/news_refresh.mjs" },
      PLANNING_WRITER_ENTRYPOINTS,
    )).toEqual(["PACKAGE_ALIAS_UNREGISTERED:planning:unsafe-alias"]);
    expect(findUnregisteredPackageAliases(
      { "planning:unsafe-nested": "pnpm planning:assumptions:sync" },
      PLANNING_WRITER_ENTRYPOINTS,
    )).toEqual(["PACKAGE_ALIAS_UNREGISTERED:planning:unsafe-nested"]);
  });

  it("fails undeclared registered children and exported mutation bypasses closed", () => {
    expect(findUndeclaredRegisteredChildren(
      { id: "fixture.parent", childEntrypoints: [], childCommandExclusions: [] },
      ["news:refresh"],
      PLANNING_WRITER_ENTRYPOINTS,
    )).toEqual(["ENTRYPOINT_CHILD_UNDECLARED:fixture.parent:cli.news-refresh"]);

    expect(findExportedBypassErrors([
      { sourcePath: "fixture.ts", exportedBypassRisk: false },
    ], () => `export async function write() { await Promise.resolve(); }`))
      .toEqual(["EXPORTED_MUTATION_BYPASS_UNDECLARED:fixture.ts"]);

    expect(findExportedBypassGraphErrors(
      [{ id: "fixture.writer", sourcePath: "fixture.ts", exportedBypassRisk: true }],
      [],
      () => "export function mutate() {}",
    )).toEqual(["EXPORTED_MUTATION_SOURCE_ORPHAN:fixture.writer"]);
  });

  it("parses child_process and shell package commands and fails unknown children closed", () => {
    const scripts = new Set(["planning:new-writer", "news:refresh"]);
    expect(scanChildProcessPackageScripts("fixture.mjs", scripts, `
      import { spawnSync } from "node:child_process";
      spawnSync("pnpm", ["planning:new-writer"]);
    `)).toEqual(["planning:new-writer"]);
    expect(scanChildProcessPackageScripts("fixture.sh", scripts, "pnpm news:refresh --strict\n")).toEqual(["news:refresh"]);
    expect(findUndeclaredRegisteredChildren(
      { id: "fixture.parent", childEntrypoints: [], childCommandExclusions: [] },
      ["planning:new-writer"],
      PLANNING_WRITER_ENTRYPOINTS,
    )).toEqual(["ENTRYPOINT_CHILD_UNREGISTERED:fixture.parent:planning:new-writer"]);
  });

  it("keeps the digest stable across entry ordering and changes it for semantic edits", () => {
    const targets = createPlanningWriterTargetRegistry(PLANNING_DATA_OWNER_IDS);
    const baseline = planningWriterRegistryDigest({ targets });
    expect(planningWriterRegistryDigest({ targets: [...targets].reverse(), sources: [...PLANNING_WRITER_SOURCES].reverse(), exclusions: [...PLANNING_WRITER_EXCLUSIONS].reverse(), entrypoints: [...PLANNING_WRITER_ENTRYPOINTS].reverse() }))
      .toBe(baseline);
    const changedTargets = targets.map((target, index) => index === 0 ? { ...target, authoritative: !target.authoritative } : target);
    expect(planningWriterRegistryDigest({ targets: changedTargets })).not.toBe(baseline);
    const changedExclusions = PLANNING_WRITER_EXCLUSIONS.map((row, index) => index === 0 ? { ...row, reason: `${row.reason} changed` } : row);
    expect(planningWriterRegistryDigest({ targets, exclusions: changedExclusions })).not.toBe(baseline);
  });

  it("rejects invalid target policy, traversal, case, Unicode, and parent overlap", () => {
    const targets = createPlanningWriterTargetRegistry(PLANNING_DATA_OWNER_IDS);
    const outputTemplate = targets.find((target) => target.id === "output.release");
    if (!outputTemplate) throw new Error("missing output target fixture");
    const invalid = [
      ...targets.map((target) => target.id === "derived.planning-cache" ? { ...target, authoritative: true } : target),
      { ...outputTemplate, id: "fixture.case-a", logicalPath: "Case" },
      { ...outputTemplate, id: "fixture.case-b", logicalPath: "case" },
      { ...outputTemplate, id: "fixture.unicode-a", logicalPath: "é" },
      { ...outputTemplate, id: "fixture.unicode-b", logicalPath: "e\u0301" },
      { ...outputTemplate, id: "fixture.parent", logicalPath: "parent" },
      { ...outputTemplate, id: "fixture.child", logicalPath: "parent/child" },
      { ...outputTemplate, id: "fixture.traversal", logicalPath: "../escape" },
      { ...outputTemplate, id: "fixture.wildcard", logicalPath: "**" },
      { ...outputTemplate, id: "fixture.namespace", logicalPath: "namespace", namespace: "external" },
    ];
    const errors = validatePlanningWriterTargets(invalid, PLANNING_DATA_OWNER_IDS);
    expect(errors).toEqual(expect.arrayContaining([
      "TARGET_AUTHORITATIVE_INVALID:derived.planning-cache",
      "TARGET_LOGICAL_PATH_COLLISION:fixture.case-b",
      "TARGET_LOGICAL_PATH_COLLISION:fixture.unicode-b",
      "TARGET_LOGICAL_PATH_OVERLAP:fixture.parent:fixture.child",
      "TARGET_LOGICAL_PATH_INVALID:fixture.traversal",
      "TARGET_LOGICAL_PATH_INVALID:fixture.wildcard",
      "TARGET_NAMESPACE_INVALID:fixture.namespace",
    ]));
  });

  it("detects direct cwd data paths through path aliases and expressions", () => {
    expect(scanDirectWriterPathViolations("fixture.ts", `
      import p from "node:path";
      import { join as combine } from "node:path";
      p.join(cwd, ".data", "news");
      combine(rootDir, ".data", "planning");
      const value = \`\${cwd}/.data/cache\`;
    `).map((finding) => finding.signal)).toEqual([
      "cwd-data-path",
      "cwd-data-path",
      "cwd-data-expression",
    ]);
    expect(scanDirectWriterPathViolations("fixture.ts", `
      import { resolvePlanningRuntimeRoots } from "./runtimeRoots.mjs";
      resolvePlanningRuntimeRoots(input);
      const row = { legacyPath: path.join(cwd, ".data", "news") };
    `)).toEqual([]);
    expect(scanDirectWriterPathViolations("fixture.ts", `
      import path from "node:path";
      const row = { legacyPath: path.join(cwd, ".data", "legacy"), active: path.join(cwd, ".data", "active") };
    `)).toEqual([{ line: 3, signal: "cwd-data-path" }]);
  });

  it("keeps dynamic scanner gaps explicit through manual-indirect source records", () => {
    expect(scanMutationSignals("fixture.ts", `
      import * as fs from "node:fs";
      const method = "writeFileSync";
      fs[method]("file", "value");
    `)).toEqual([]);
    expect(PLANNING_WRITER_SOURCES.some((source) => source.mutationSignals.includes("manual-indirect"))).toBe(true);
  });

  it("derives the HTTP runtime graph from every inherited source", () => {
    const runtime = PLANNING_WRITER_ENTRYPOINTS.find((entry) => entry.id === "runtime.http-store");
    expect(runtime?.sources).toEqual(PLANNING_WRITER_SOURCES
      .filter((source) => source.futureLeasePolicy === "inherited-runtime")
      .map((source) => source.id));
    expect(new Set(runtime?.targets)).toEqual(new Set(runtime?.sources.flatMap((sourceId) => (
      PLANNING_WRITER_SOURCES.find((source) => source.id === sourceId)?.targets ?? []
    ))));
  });
});
