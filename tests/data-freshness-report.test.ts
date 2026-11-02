import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

describe("freshness machine receipt", () => {
  it.each([
    ["2026-10-07T00:00:00Z", 0, "fresh"],
    ["2026-06-22T00:00:00Z", 1, "stale"],
  ])("records per-file strict results without changing inputs (%s)", (generatedAt, exit, status) => {
    const root = makeRoot();
    const input = path.join(root, ".data", "exchange_snapshot.json");
    const receipt = path.join(root, "receipt.json");
    const original = JSON.stringify({ generatedAt });
    fs.writeFileSync(input, original);
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/data_freshness_report.mjs"),
      "--strict", "--check-only", "--now=2026-10-07T01:00:00Z", `--json-report=${receipt}`], { cwd: root });
    expect(result.status).toBe(exit);
    expect(JSON.parse(fs.readFileSync(receipt, "utf8"))).toMatchObject({
      strict: true, checkOnly: true, passed: exit === 0, evaluatedAt: "2026-10-07T01:00:00.000Z",
      rows: [{ fileName: "exchange_snapshot.json", status }],
    });
    expect(fs.readFileSync(input, "utf8")).toBe(original);
    expect(fs.existsSync(path.join(root, "docs/data-freshness-report.md"))).toBe(false);
  });

  it("records an expired policy as a failure, and cannot overwrite an existing receipt", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, ".data/exchange_snapshot.json"), JSON.stringify({ generatedAt: "2026-06-22T00:00:00Z" }));
    fs.writeFileSync(path.join(root, "exceptions.json"), JSON.stringify({ schemaVersion: 1, exceptions: [{
      file: "exchange_snapshot.json", reason: "offline fixture", mitigation: "refresh before adoption", expiresAt: "2026-09-30T00:00:00Z",
    }] }));
    const receipt = path.join(root, "receipt.json");
    const args = [path.join(process.cwd(), "scripts/data_freshness_report.mjs"), "--strict", "--check-only",
      "--now=2026-10-07T01:00:00Z", "--exceptions=exceptions.json", `--json-report=${receipt}`];
    const result = spawnSync(process.execPath, args, { cwd: root });
    expect(result.status).toBe(1);
    const before = fs.readFileSync(receipt, "utf8");
    expect(JSON.parse(before)).toMatchObject({ passed: false, rows: null, error: "expired freshness exception: exchange_snapshot.json" });
    expect(spawnSync(process.execPath, args, { cwd: root }).status).toBe(1);
    expect(fs.readFileSync(receipt, "utf8")).toBe(before);
  });
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-data-freshness-report-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".data"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("data_freshness_report", () => {
  it("classifies exchange snapshots with the exchange freshness threshold", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-05-24T00:00:00.000Z" }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "data_freshness_report.mjs")], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const report = fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"), "utf8");
    expect(report).toContain("| exchange | 1 |");
    expect(report).toContain("| exchange_snapshot.json | exchange |");
  });

  it("fails strict mode when a tracked snapshot has no generated timestamp", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ rates: [] }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "data_freshness_report.mjs"), "--strict"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("snapshot freshness issues found in strict mode");
    const report = fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"), "utf8");
    expect(report).toContain("| exchange_snapshot.json | exchange | - | - | 1 | missing_generated_at |");
    expect(report).toContain("- missingTimestamp: 1");
  });

  it("fails strict mode when a tracked snapshot timestamp is invalid", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "benefits_snapshot.json"),
      JSON.stringify({ generatedAt: "not-a-date" }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "data_freshness_report.mjs"), "--strict"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("some snapshots have invalid generatedAt timestamp");
    const report = fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"), "utf8");
    expect(report).toContain("| benefits_snapshot.json | benefits | not-a-date | - | 7 | invalid_generated_at |");
    expect(report).toContain("- invalidTimestamp: 1");
  });

  it("allows only an explicit unexpired stale exception and records its mitigation", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "config", "freshness-exceptions.json"),
      JSON.stringify({
        schemaVersion: 1,
        exceptions: [{
          file: "exchange_snapshot.json",
          reason: "오프라인 재현을 위한 저장 스냅샷입니다.",
          mitigation: "사용자에게 기준일과 최신 환율 재확인 안내를 표시합니다.",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }],
      }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--exceptions=config/freshness-exceptions.json",
    ], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const report = fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"), "utf8");
    expect(report).toContain("stale_exception");
    expect(report).toContain("## Time-limited Exceptions");
    expect(report).toContain("최신 환율 재확인 안내");
    expect(report).toContain("- staleException: 1");
  });

  it.each([
    ["2026-09-29T23:59:59.999Z", 0],
    ["2026-09-30T00:00:00.000Z", 1],
    ["2026-09-30T00:00:00.001Z", 1],
  ] as const)("enforces the exception boundary %s (%s)", (now, expectedStatus) => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "config", "data-freshness-exceptions.json"),
      JSON.stringify({
        schemaVersion: 1,
        exceptions: [{
          file: "exchange_snapshot.json",
          reason: "오프라인 재현을 위한 저장 스냅샷입니다.",
          mitigation: "사용자에게 기준일과 최신 환율 재확인 안내를 표시합니다.",
          expiresAt: "2026-09-30T00:00:00.000Z",
        }],
      }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--exceptions=config/data-freshness-exceptions.json",
      `--now=${now}`,
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(expectedStatus);
    if (expectedStatus === 0) {
      expect(fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"), "utf8"))
        .toContain(`- Generated at: ${now}`);
    } else {
      expect(result.stderr).toContain("expired freshness exception: exchange_snapshot.json");
    }
  });

  it("fails clearly when the configured canonical exception file is missing", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--exceptions=config/data-freshness-exceptions.json",
      "--now=2026-09-01T00:00:00.000Z",
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("freshness exceptions file not found: config/data-freshness-exceptions.json");
  });

  it("keeps an existing report byte-identical in strict check-only mode", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-05-24T12:00:00.000Z" }),
      "utf8",
    );
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    const existingReport = Buffer.from("# Existing report\n\nDo not rewrite this file.\n", "utf8");
    fs.writeFileSync(path.join(root, "docs", "data-freshness-report.md"), existingReport);

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--check-only",
      "--now=2026-05-25T00:00:00.000Z",
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[freshness:check]");
    expect(fs.readFileSync(path.join(root, "docs", "data-freshness-report.md"))).toEqual(existingReport);
  });

  it("does not create a report in strict check-only mode", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-05-24T12:00:00.000Z" }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--check-only",
      "--now=2026-05-25T00:00:00.000Z",
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[freshness:check] validation passed");
    expect(fs.existsSync(path.join(root, "docs", "data-freshness-report.md"))).toBe(false);
  });

  it.each([
    ["stale", { generatedAt: "2026-05-20T00:00:00.000Z" }],
    ["missing", { rates: [] }],
    ["invalid", { generatedAt: "not-a-date" }],
  ] as const)("fails strict check-only mode for a %s snapshot", (_label, snapshot) => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify(snapshot),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--check-only",
      "--now=2026-05-25T00:00:00.000Z",
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[freshness:check]");
    expect(result.stdout).not.toContain("validation passed");
    expect(fs.existsSync(path.join(root, "docs", "data-freshness-report.md"))).toBe(false);
  });

  it("fails check-only validation when a freshness exception has expired", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".data", "exchange_snapshot.json"),
      JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "config", "data-freshness-exceptions.json"),
      JSON.stringify({
        schemaVersion: 1,
        exceptions: [{
          file: "exchange_snapshot.json",
          reason: "오프라인 재현을 위한 저장 스냅샷입니다.",
          mitigation: "사용자에게 기준일과 최신 환율 재확인 안내를 표시합니다.",
          expiresAt: "2026-05-25T00:00:00.000Z",
        }],
      }),
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "data_freshness_report.mjs"),
      "--strict",
      "--check-only",
      "--exceptions=config/data-freshness-exceptions.json",
      "--now=2026-05-25T00:00:00.000Z",
    ], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[freshness:check] failed: expired freshness exception: exchange_snapshot.json");
    expect(result.stdout).not.toContain("validation passed");
    expect(fs.existsSync(path.join(root, "docs", "data-freshness-report.md"))).toBe(false);
  });

  it("keeps supported local and release commands on the canonical exception file", () => {
    const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    }).scripts;

    for (const name of ["freshness:report", "freshness:release", "data:doctor", "verify"]) {
      expect(scripts[name], name).toContain("--exceptions=config/data-freshness-exceptions.json");
    }
    expect(scripts["freshness:release"]).toContain("--strict");
    expect(scripts["freshness:release"]).toContain("--check-only");
    expect(scripts["freshness:report"]).not.toContain("--check-only");
  });
});
