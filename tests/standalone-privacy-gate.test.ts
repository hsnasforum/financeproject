import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PUBLIC_SNAPSHOT_FILES } from "../scripts/public_snapshot_assets.mjs";
import {
  STANDALONE_PRIVACY_RECEIPT,
  TRACE_COPY_FAILURE_PATTERN,
  auditArtifactTree,
  auditBuildTraces,
  auditStandaloneBuild,
  auditStandaloneTree,
  classifyPrivatePath,
  invalidateStandalonePrivacyReceipt,
  removeGeneratedStandaloneEnv,
  verifySourceRuntimePrivacyReceipt,
  verifyStandalonePrivacyReceipt,
  writeStandalonePrivacyReceipt,
} from "../scripts/standalone_privacy_gate.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeProject(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "finance-privacy-gate-")));
  roots.push(root);
  return root;
}
function write(root: string, relative: string, content = "TEST_ONLY\n"): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
function writeTrace(root: string, relativeTrace: string, entries: string[]): void {
  const traceFile = path.join(root, ".next", relativeTrace);
  fs.mkdirSync(path.dirname(traceFile), { recursive: true });
  fs.writeFileSync(traceFile, JSON.stringify({ version: 1, files: entries.map((entry) => path.relative(path.dirname(traceFile), path.join(root, entry))) }));
}
// A built project whose standalone holds server.js, BUILD_IDs, the official snapshots and an internal pnpm link.
function seedBuiltProject(root: string): string {
  write(root, "package.json", "{}\n");
  write(root, ".env.local.example", "EXAMPLE=1\n");
  write(root, "src/app/page.js");
  write(root, "tests/fixtures/providers/samplebank.deposit.json", "{}\n");
  write(root, ".next/BUILD_ID", "build-a\n");
  const standalone = path.join(root, ".next", "standalone");
  write(standalone, "server.js");
  write(standalone, ".next/BUILD_ID", "build-a\n");
  write(standalone, ".env.local.example", "EXAMPLE=1\n");
  write(standalone, "node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js");
  fs.symlinkSync(path.join(".pnpm", "pkg@1.0.0", "node_modules", "pkg"), path.join(standalone, "node_modules", "pkg-link"), "dir");
  for (const name of PUBLIC_SNAPSHOT_FILES) write(standalone, `.data/${name}`, "{}\n");
  writeTrace(root, "server/app/page.js.nft.json", ["package.json", ".env.local.example", "src/app/page.js", "tests/fixtures/providers/samplebank.deposit.json"]);
  writeTrace(root, "next-server.js.nft.json", ["package.json"]);
  return standalone;
}
const codes = (result: { violations: Array<{ code: string }> }) => [...new Set(result.violations.map((v) => v.code))].sort();

describe("standalone privacy gate", () => {
  it("classifies private paths by name only and keeps public examples and public package data", () => {
    expect(classifyPrivatePath("tmp/user_feedback.json")).toBe("private-directory:tmp");
    expect(classifyPrivatePath("work/local/x/package.json")).toBe("private-directory:work");
    expect(classifyPrivatePath(".claude/worktrees/a/package.json")).toBe("private-directory:.claude");
    expect(classifyPrivatePath(".data/planning/profile.json")).toBe("private-directory:.data");
    expect(classifyPrivatePath(".env")).toBe("real-env-file");
    expect(classifyPrivatePath(".env.local")).toBe("real-env-file");
    expect(classifyPrivatePath(".env.production")).toBe("real-env-file");
    expect(classifyPrivatePath("nested/.env.backup")).toBe("real-env-file");
    expect(classifyPrivatePath("env.local")).toBe("real-env-file");
    expect(classifyPrivatePath(".env.local.example")).toBeNull();
    expect(classifyPrivatePath(".env.example")).toBeNull();
    expect(classifyPrivatePath("dev.db")).toBe("database-file");
    expect(classifyPrivatePath("prisma/dev.db-journal")).toBe("database-file");
    expect(classifyPrivatePath("x/finance.sqlite-wal")).toBe("database-file");
    expect(classifyPrivatePath("a/private-after/copy.json")).toBe("private-backup");
    expect(classifyPrivatePath(".npmrc")).toBe("credential-file");
    expect(classifyPrivatePath("certs/server.pem")).toBe("credential-file");
    expect(classifyPrivatePath("node_modules/.pnpm/caniuse-lite@1.0.30001810/node_modules/caniuse-lite/data/features/credential-management.js")).toBeNull();
    expect(classifyPrivatePath("tests/fixtures/providers/samplebank.deposit.json")).toBeNull();
    expect(classifyPrivatePath("node_modules/.pnpm/mime-db@1.54.0/node_modules/mime-db/db.json")).toBeNull();
  });

  it("passes a clean build and reports full counts separately from bounded samples", () => {
    const root = makeProject();
    seedBuiltProject(root);
    const result = auditStandaloneBuild({ projectRoot: root });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({ traceFiles: 2, publicSnapshots: PUBLIC_SNAPSHOT_FILES.length });

    for (let index = 0; index < 250; index += 1) write(root, `tmp/many/${index}.json`);
    writeTrace(root, "server/app/many/route.js.nft.json", Array.from({ length: 250 }, (_, index) => `tmp/many/${index}.json`));
    const many = auditBuildTraces({ projectRoot: root });
    expect(many.violationCount).toBe(250);
    expect(many.violations.length).toBeLessThan(250);
    expect(many.violationsByCode).toEqual({ "private-directory:tmp": 250 });
  });

  it("rejects traced project roots, directories, env files, databases, tmp paths and paths outside the project", () => {
    const root = makeProject();
    seedBuiltProject(root);
    write(root, ".env.local", "TEST_ONLY_SECRET=1\n");
    write(root, "dev.db");
    write(root, "tmp/backup_restore_point.json");
    fs.mkdirSync(path.join(root, "some-dir"));
    const outside = makeProject();
    write(outside, "secret.txt");
    const traceFile = path.join(root, ".next", "server", "app", "api", "dev", "route.js.nft.json");
    fs.mkdirSync(path.dirname(traceFile), { recursive: true });
    fs.writeFileSync(traceFile, JSON.stringify({ version: 1, files: [
      path.relative(path.dirname(traceFile), root),
      path.relative(path.dirname(traceFile), path.join(root, "some-dir")),
      path.relative(path.dirname(traceFile), path.join(root, ".env.local")),
      path.relative(path.dirname(traceFile), path.join(root, "dev.db")),
      path.relative(path.dirname(traceFile), path.join(root, "tmp", "backup_restore_point.json")),
      path.relative(path.dirname(traceFile), path.join(outside, "secret.txt")),
    ] }));
    const result = auditBuildTraces({ projectRoot: root });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual([
      "database-file",
      "private-directory:tmp",
      "real-env-file",
      "trace-directory",
      "trace-outside-project",
      "trace-project-root",
    ]);
  });

  it("rejects private entries, external links and unexpected .data entries in a built standalone", () => {
    const root = makeProject();
    const standalone = seedBuiltProject(root);
    write(standalone, ".env.local", "TEST_ONLY_SECRET=1\n");
    write(standalone, "dev.db");
    write(standalone, "tmp/finance-final/private/runtime.sqlite");
    write(standalone, ".data/scenarios/overrides.json", "{}\n");
    const outside = makeProject();
    fs.symlinkSync(outside, path.join(standalone, "linked-outside"), "dir");
    const result = auditStandaloneTree({ standaloneDir: standalone, phase: "build", projectRoot: root });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual([
      "database-file",
      "private-directory:tmp",
      "real-env-file",
      "standalone-data-unexpected-entry",
      "standalone-external-link",
    ]);
  });

  it("allows the three official runtime links only on a source standalone input, with their exact targets", () => {
    const root = makeProject();
    const standalone = seedBuiltProject(root);
    write(root, ".next/static/chunks/app.js");
    write(root, "public/robots.txt");
    write(root, "prisma/schema.prisma");
    fs.symlinkSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), "dir");
    fs.symlinkSync(path.join(root, "public"), path.join(standalone, "public"), "dir");
    fs.symlinkSync(path.join(root, "prisma"), path.join(standalone, "prisma"), "dir");
    write(standalone, "audit-source/marker.txt");
    fs.mkdirSync(path.join(standalone, "tmp"));
    fs.symlinkSync(path.join(standalone, "audit-source", "marker.txt"), path.join(standalone, "tmp", "txn-batch-detail-client-audit.tsx"), "file");
    write(standalone, ".data/journal/private.json", "TEST_ONLY_PRIVATE_CANARY");

    expect(auditStandaloneTree({ standaloneDir: standalone, phase: "source-input", projectRoot: root }).violations).toEqual([]);
    expect(codes(auditStandaloneTree({ standaloneDir: standalone, phase: "build", projectRoot: root }))).toEqual([
      "private-directory:tmp",
      "standalone-data-unexpected-entry",
      "standalone-external-link",
    ]);

    fs.unlinkSync(path.join(standalone, "public"));
    fs.symlinkSync(path.join(root, "src"), path.join(standalone, "public"), "dir");
    write(standalone, "tmp/other.json");
    expect(codes(auditStandaloneTree({ standaloneDir: standalone, phase: "source-input", projectRoot: root }))).toEqual([
      "private-directory:tmp",
      "standalone-external-link",
    ]);
  });

  it("requires a packaged artifact without links, private names or extra snapshot entries", () => {
    const artifact = makeProject();
    const standalone = path.join(artifact, ".next", "standalone");
    write(standalone, "server.js");
    for (const name of PUBLIC_SNAPSHOT_FILES) write(standalone, `.data/${name}`, "{}\n");
    write(artifact, ".env.local.example", "EXAMPLE=1\n");
    write(artifact, "prisma/schema.prisma");
    // The builder may leave an empty directory where omitted alias links were; it carries no data.
    fs.mkdirSync(path.join(standalone, "tmp"));
    expect(auditArtifactTree({ artifactDir: artifact }).violations).toEqual([]);

    write(artifact, ".env.local", "TEST_ONLY_SECRET=1\n");
    write(standalone, "tmp/private.sqlite");
    fs.symlinkSync(path.join(artifact, "prisma"), path.join(standalone, "prisma"), "dir");
    write(standalone, ".data/finlife_deposit_sync_attempt.json", "{}\n");
    const result = auditArtifactTree({ artifactDir: artifact });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual([
      "private-directory:tmp",
      "real-env-file",
      "standalone-data-unexpected-entry",
      "standalone-external-link",
    ]);
  });

  it("removes only the exact generated standalone .env and never the source", () => {
    const root = makeProject();
    const standalone = seedBuiltProject(root);
    const sourceEnv = write(root, ".env", "TEST_ONLY_SOURCE=1\n");
    write(standalone, ".env", "TEST_ONLY_SOURCE=1\n");
    expect(removeGeneratedStandaloneEnv({ projectRoot: root })).toEqual({ removed: true });
    expect(fs.existsSync(path.join(standalone, ".env"))).toBe(false);
    expect(fs.readFileSync(sourceEnv, "utf8")).toBe("TEST_ONLY_SOURCE=1\n");
    expect(removeGeneratedStandaloneEnv({ projectRoot: root })).toEqual({ removed: false });

    fs.symlinkSync(sourceEnv, path.join(standalone, ".env"));
    expect(() => removeGeneratedStandaloneEnv({ projectRoot: root })).toThrow("not a plain single-link file");
    expect(fs.lstatSync(path.join(standalone, ".env")).isSymbolicLink()).toBe(true);
    fs.unlinkSync(path.join(standalone, ".env"));

    fs.linkSync(sourceEnv, path.join(standalone, ".env"));
    expect(() => removeGeneratedStandaloneEnv({ projectRoot: root })).toThrow("not a plain single-link file");
    expect(fs.readFileSync(sourceEnv, "utf8")).toBe("TEST_ONLY_SOURCE=1\n");
  });

  it("stops without removing anything when Next copied a .env.production", () => {
    const root = makeProject();
    const standalone = seedBuiltProject(root);
    write(standalone, ".env", "TEST_ONLY=1\n");
    write(standalone, ".env.production", "TEST_ONLY_PRODUCTION=1\n");
    expect(() => removeGeneratedStandaloneEnv({ projectRoot: root })).toThrow(".env.production found");
    expect(fs.existsSync(path.join(standalone, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(standalone, ".env.production"))).toBe(true);
  });

  it("binds the receipt to the selected build output and its BUILD_ID", () => {
    const root = makeProject();
    seedBuiltProject(root);
    expect(() => verifyStandalonePrivacyReceipt({ projectRoot: root })).toThrow("receipt is missing");
    const receipt = writeStandalonePrivacyReceipt({ projectRoot: root, summary: { files: 1 } });
    expect(receipt).toMatchObject({ distDir: ".next", buildId: "build-a" });
    expect(verifyStandalonePrivacyReceipt({ projectRoot: root }).buildId).toBe("build-a");
    expect(() => writeStandalonePrivacyReceipt({ projectRoot: root })).toThrow();

    write(root, ".next/BUILD_ID", "build-b\n");
    expect(() => verifyStandalonePrivacyReceipt({ projectRoot: root })).toThrow("does not match the current BUILD_ID");
    write(root, ".next/BUILD_ID", "build-a\n");
    write(root, ".next/standalone/.next/BUILD_ID", "build-other\n");
    expect(() => verifyStandalonePrivacyReceipt({ projectRoot: root })).toThrow("does not match the standalone BUILD_ID");

    expect(invalidateStandalonePrivacyReceipt({ projectRoot: root })).toBe(true);
    expect(fs.existsSync(path.join(root, ".next", STANDALONE_PRIVACY_RECEIPT))).toBe(false);
    expect(invalidateStandalonePrivacyReceipt({ projectRoot: root })).toBe(false);
  });

  it("requires the receipt for the selected isolated dist and for the next-start fallback; only managed standalone is exempt", () => {
    const root = makeProject();
    seedBuiltProject(root);
    write(root, ".next-build-123/BUILD_ID", "isolated\n");
    write(root, ".next-build-123/standalone/.next-build-123/BUILD_ID", "isolated\n");
    writeStandalonePrivacyReceipt({ projectRoot: root });

    expect(verifySourceRuntimePrivacyReceipt({ projectRoot: root, standaloneDistDir: ".next" })).toMatchObject({ checked: true, distDir: ".next" });
    expect(() => verifySourceRuntimePrivacyReceipt({ projectRoot: root, standaloneDistDir: ".next-build-123" })).toThrow("receipt is missing for .next-build-123");
    writeStandalonePrivacyReceipt({ projectRoot: root, distDir: ".next-build-123" });
    expect(verifySourceRuntimePrivacyReceipt({ projectRoot: root, standaloneDistDir: ".next-build-123" })).toMatchObject({ checked: true, buildId: "isolated" });

    expect(verifySourceRuntimePrivacyReceipt({ projectRoot: root })).toMatchObject({ checked: true, distDir: ".next" });
    expect(() => verifySourceRuntimePrivacyReceipt({ projectRoot: root, requestedDistDir: ".next-missing" })).toThrow("receipt is missing");
    expect(() => verifySourceRuntimePrivacyReceipt({ projectRoot: root, managedInstallation: true, requestedDistDir: ".next-missing" })).toThrow("receipt is missing");
    expect(verifySourceRuntimePrivacyReceipt({ projectRoot: root, managedInstallation: true, standaloneDistDir: ".next-missing" })).toEqual({ checked: false, reason: "managed-installation" });
  });

  it("recognizes the Next.js trace copy warning", () => {
    expect(TRACE_COPY_FAILURE_PATTERN.test("⚠ Failed to copy traced files for /x/.next/server/app/api/dev/backup/import/route.js Error: EISDIR")).toBe(true);
    expect(TRACE_COPY_FAILURE_PATTERN.test("Collecting build traces ...")).toBe(false);
  });
});
