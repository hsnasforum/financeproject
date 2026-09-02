import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

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

  it("keeps supported local and release commands on the canonical exception file", () => {
    const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    }).scripts;

    for (const name of ["freshness:report", "freshness:release", "data:doctor", "verify"]) {
      expect(scripts[name], name).toContain("--exceptions=config/data-freshness-exceptions.json");
    }
  });
});
