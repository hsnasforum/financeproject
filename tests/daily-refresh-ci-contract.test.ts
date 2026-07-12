import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DAILY_REFRESH_APPROVED_PR_PATHS,
  DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES,
  DAILY_REFRESH_STEP_NAMES,
  parseDailyRefreshFreshnessReport,
  validateDailyRefreshEnvironment,
} from "../scripts/daily_refresh_contract.mjs";
import { runDailyRefreshCi } from "../scripts/daily_refresh_ci.mjs";

const roots: string[] = [];

function createRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-daily-refresh-ci-"));
  roots.push(root);
  return root;
}

function writeText(root: string, relativePath: string, text: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf-8");
}

function validResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    mode: "strict",
    generatedAt: "2026-07-12T00:00:00.000Z",
    steps: DAILY_REFRESH_STEP_NAMES.map((name) => ({
      name,
      status: "ok",
      tookMs: 1,
      stdoutTail: `${name}:ok`,
      stderrTail: "",
    })),
    ok: true,
    ...overrides,
  };
}

function freshnessReport(input: {
  stale?: number;
  missing?: number;
  invalid?: number;
  generatedAt?: string;
} = {}): string {
  const stale = input.stale ?? 0;
  const missing = input.missing ?? 0;
  const invalid = input.invalid ?? 0;
  const fresh = 8 - stale - missing - invalid;
  const generatedAt = input.generatedAt ?? "2026-07-12T00:01:00.000Z";
  const snapshotRows = DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES.map((file, index) => {
    const status = index === 0 && stale > 0
      ? "stale"
      : index === 1 && missing > 0
        ? "missing_generated_at"
        : index === 2 && invalid > 0
          ? "invalid_generated_at"
          : "fresh";
    const snapshotGeneratedAt = status === "missing_generated_at"
      ? "-"
      : status === "invalid_generated_at"
        ? "invalid"
        : "2026-07-12T00:00:00.000Z";
    const source = file.startsWith("finlife_")
      ? "finlife"
      : file.startsWith("benefits_")
        ? "benefits"
        : "exchange";
    return `| ${file} | ${source} | ${snapshotGeneratedAt} | 0.00 | 7 | ${status} |`;
  });
  return [
    "# Data Freshness Report",
    "",
    `- Generated at: ${generatedAt}`,
    "- Mode: strict",
    "",
    "## Snapshot Status",
    "",
    "| File | Source | generatedAt | ageDays | maxAgeDays | Status |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...snapshotRows,
    "",
    "## Summary",
    "",
    "- total: 8",
    `- fresh: ${fresh}`,
    `- stale: ${stale}`,
    `- missingTimestamp: ${missing}`,
    `- invalidTimestamp: ${invalid}`,
    "- ignoredAuxiliary: 2",
    "",
  ].join("\n");
}

function seedApprovedArtifacts(root: string, freshness = freshnessReport()): void {
  for (const relativePath of DAILY_REFRESH_APPROVED_PR_PATHS) {
    const content = relativePath === "docs/data-freshness-report.md"
      ? freshness
      : `fixture:${relativePath}\n`;
    writeText(root, relativePath, content);
  }
  writeText(root, ".gitignore", [
    "tmp/",
    "github-output.txt",
    "step-summary.md",
    "external.json",
    "moved-data/",
  ].join("\n") + "\n");
  const initialized = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf-8" });
  expect(initialized.status, initialized.stderr).toBe(0);
  const committed = spawnSync("git", [
    "-c",
    "user.name=finance-test",
    "-c",
    "user.email=finance-test@example.invalid",
    "add",
    ".",
  ], { cwd: root, encoding: "utf-8" });
  expect(committed.status, committed.stderr).toBe(0);
  const commit = spawnSync("git", [
    "-c",
    "user.name=finance-test",
    "-c",
    "user.email=finance-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ], { cwd: root, encoding: "utf-8" });
  expect(commit.status, commit.stderr).toBe(0);
}

function writeResult(root: string, value: unknown): string {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  writeText(root, "tmp/daily_refresh_result.json", text);
  return text;
}

function runFixture(root: string) {
  return runDailyRefreshCi({
    cwd: root,
    evidencePath: "tmp/daily_refresh_evidence.json",
    prBodyPath: "tmp/daily_refresh_pr_body.md",
    outputPath: path.join(root, "github-output.txt"),
    stepSummaryPath: path.join(root, "step-summary.md"),
    runUrl: "https://github.example/runs/1",
    now: new Date("2026-07-12T00:02:00.000Z"),
  });
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("daily refresh CI evidence contract", () => {
  it("requires the exact CI env groups without exposing their values", () => {
    expect(() => validateDailyRefreshEnvironment({})).toThrowError(
      /FINLIFE_API_KEY.*FINLIFE_TOPFIN_GRP_LIST.*DATAGO.*ECOS.*EXIM_EXCHANGE_API_KEY.*EXIM_EXCHANGE_API_URL.*MOIS_BENEFITS_API_KEY.*MOIS_BENEFITS_API_URL.*OPENDART_API_KEY/,
    );
    expect(validateDailyRefreshEnvironment({
      FINLIFE_API_KEY: "finlife",
      FINLIFE_TOPFIN_GRP_LIST: "020000",
      DATAGO_SERVICE_KEY: "datago",
      ECOS_API_KEY: "ecos",
      EXIM_EXCHANGE_API_KEY: "exchange",
      EXIM_EXCHANGE_API_URL: "https://example.test/exchange",
      MOIS_BENEFITS_API_KEY: "benefits",
      MOIS_BENEFITS_API_URL: "https://example.test/gov24/v3/serviceList",
      OPENDART_API_KEY: "dart",
    })).toMatchObject({ ok: true });
  });

  it("rejects an insecure Gov24 endpoint before running the strict workflow", () => {
    expect(() => validateDailyRefreshEnvironment({
      FINLIFE_API_KEY: "finlife",
      FINLIFE_TOPFIN_GRP_LIST: "020000",
      DATAGO_SERVICE_KEY: "datago",
      ECOS_API_KEY: "ecos",
      EXIM_EXCHANGE_API_KEY: "exchange",
      EXIM_EXCHANGE_API_URL: "https://example.test/exchange",
      MOIS_BENEFITS_API_KEY: "benefits",
      MOIS_BENEFITS_API_URL: "http://example.test/gov24/v3/serviceList",
      OPENDART_API_KEY: "dart",
    })).toThrowError(/MOIS_BENEFITS_API_URL must use https/);
  });

  it("validates strict success and emits freshness plus approved path checksums", () => {
    const root = createRoot();
    seedApprovedArtifacts(root);
    const resultText = writeResult(root, validResult());

    const output = runFixture(root);

    expect(output.exitCode).toBe(0);
    expect(output.evidence).toMatchObject({
      schemaVersion: 1,
      ok: true,
      result: {
        mode: "strict",
        sha256: crypto.createHash("sha256").update(resultText).digest("hex"),
      },
      freshness: {
        mode: "strict",
        fresh: 8,
        stale: 0,
      },
      approvedPaths: DAILY_REFRESH_APPROVED_PR_PATHS,
    });
    const artifacts = "artifacts" in output.evidence ? output.evidence.artifacts : [];
    expect(artifacts).toHaveLength(DAILY_REFRESH_APPROVED_PR_PATHS.length);
    expect(output.report).toContain("summary.ok: `true`");
    expect(output.report).toContain("Approved artifact provenance");
    expect(output.report).not.toContain("stdoutTail");
    expect(fs.readFileSync(path.join(root, "github-output.txt"), "utf-8")).toContain("ok=true");
  });

  it("writes failure evidence and blocks ok=false or malformed results", () => {
    const failedRoot = createRoot();
    const malformedRoot = createRoot();
    seedApprovedArtifacts(failedRoot);
    seedApprovedArtifacts(malformedRoot);
    const failed = validResult({
      steps: DAILY_REFRESH_STEP_NAMES.map((name, index) => ({
        name,
        status: index === 1 ? "failed" : "ok",
        tookMs: 1,
        stdoutTail: "",
        stderrTail: index === 1 ? "failed" : "",
      })),
      ok: false,
    });
    writeResult(failedRoot, failed);
    writeResult(malformedRoot, { ...validResult(), steps: [] });

    const failedOutput = runFixture(failedRoot);
    const malformedOutput = runFixture(malformedRoot);

    expect(failedOutput.exitCode).toBe(1);
    expect(failedOutput.report).toContain("automated PR: `blocked`");
    expect(malformedOutput.exitCode).toBe(1);
    expect(fs.readFileSync(path.join(malformedRoot, "github-output.txt"), "utf-8")).toContain("ok=false");
  });

  it("blocks stale freshness evidence even when the refresh summary says ok", () => {
    const root = createRoot();
    seedApprovedArtifacts(root, freshnessReport({ stale: 1 }));
    writeResult(root, validResult());

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.evidence).toMatchObject({
      ok: false,
      error: { code: "DAILY_REFRESH_EVIDENCE_INVALID" },
    });
  });

  it("parses stale reports for diagnostics unless fresh evidence is required", () => {
    const report = freshnessReport({ stale: 1 });

    expect(parseDailyRefreshFreshnessReport(report, { requireStrict: true })).toMatchObject({
      fresh: 7,
      stale: 1,
    });
    expect(() => parseDailyRefreshFreshnessReport(report, {
      requireStrict: true,
      requireFresh: true,
    })).toThrowError(/snapshot is not fresh/);
  });

  it("blocks a fresh-looking report that predates the current refresh run", () => {
    const root = createRoot();
    seedApprovedArtifacts(root, freshnessReport({ generatedAt: "2026-07-11T23:00:00.000Z" }));
    writeResult(root, validResult());

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.report).toContain("freshness report predates daily refresh result");
  });

  it("rejects symlinked approved artifacts instead of hashing outside files", () => {
    const root = createRoot();
    seedApprovedArtifacts(root);
    writeResult(root, validResult());
    const target = path.join(root, "external.json");
    fs.writeFileSync(target, "external\n", "utf-8");
    const approved = path.join(root, DAILY_REFRESH_APPROVED_PR_PATHS[0]);
    fs.rmSync(approved);
    fs.symlinkSync(target, approved, "file");

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.report).toContain("approved artifact path contains symlink");
  });

  it("rejects an approved artifact under a symlinked ancestor directory", () => {
    const root = createRoot();
    seedApprovedArtifacts(root);
    writeResult(root, validResult());
    const dataDir = path.join(root, ".data");
    const movedDir = path.join(root, "moved-data");
    fs.renameSync(dataDir, movedDir);
    fs.symlinkSync(movedDir, dataDir, "dir");

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.report).toContain("approved artifact path contains symlink");
  });

  it("blocks tracked or untracked changes outside the approved PR allowlist", () => {
    const root = createRoot();
    seedApprovedArtifacts(root);
    writeResult(root, validResult());
    writeText(root, "src/unapproved.ts", "export {};\n");

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.report).toContain("daily refresh changed unapproved path: src/unapproved.ts");
  });

  it("neutralizes malformed JSON markup in the failure summary", () => {
    const root = createRoot();
    seedApprovedArtifacts(root);
    writeText(root, "tmp/daily_refresh_result.json", "{<script>|`bad`\n");

    const output = runFixture(root);

    expect(output.exitCode).toBe(1);
    expect(output.report).not.toContain("<script>");
    expect(output.report).not.toContain("`bad`");
  });
});
