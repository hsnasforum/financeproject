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
});
