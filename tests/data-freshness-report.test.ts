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
});
