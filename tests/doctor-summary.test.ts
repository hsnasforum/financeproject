import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDoctorSummary } from "../src/lib/diagnostics/doctorSummary";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-doctor-summary-"));
  tempRoots.push(root);
  return root;
}

function writeText(root: string, relativePath: string, content: string): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, "utf-8");
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, JSON.stringify(value, null, 2));
}

function itemStatus(summary: ReturnType<typeof buildDoctorSummary>, id: string) {
  return summary.items.find((item) => item.id === id)?.status;
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("doctor summary", () => {
  it("returns overall OK when all checks pass", () => {
    const root = createTempRoot();
    writeJson(root, "tmp/daily_refresh_result.json", {
      generatedAt: new Date().toISOString(),
      ok: true,
      steps: [{ name: "data:doctor", status: "ok", tookMs: 1200 }],
    });
    writeText(root, "docs/schema-drift-report.md", `
| Snapshot | Breaking | Non-breaking |
| --- | ---: | ---: |
| a.json | 0 | 1 |
| b.json | 0 | 0 |
`);
    writeText(root, "docs/data-freshness-report.md", `
- stale: 0
- missingTimestamp: 0
- invalidTimestamp: 0
`);
    writeJson(root, "tmp/dart/disclosure_alerts.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/dart/disclosure_digest.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/dart/daily_brief.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/user_feedback.json", []);

    const summary = buildDoctorSummary({ baseDir: root });
    expect(summary.overall).toBe("OK");
    expect(itemStatus(summary, "daily-refresh")).toBe("OK");
    expect(itemStatus(summary, "schema-drift")).toBe("OK");
    expect(itemStatus(summary, "data-freshness")).toBe("OK");
    expect(itemStatus(summary, "dart-artifacts")).toBe("OK");
    expect(itemStatus(summary, "feedback-store")).toBe("OK");
  });

  it("returns WARN for missing files and freshness warning", () => {
    const root = createTempRoot();
    writeJson(root, "tmp/daily_refresh_result.json", {
      generatedAt: new Date().toISOString(),
      ok: true,
      steps: [{ name: "dart:watch", status: "ok", tookMs: 800 }],
    });
    writeText(root, "docs/schema-drift-report.md", `
| Snapshot | Breaking | Non-breaking |
| --- | ---: | ---: |
| a.json | 0 | 0 |
`);
    writeText(root, "docs/data-freshness-report.md", `
- stale: 0
- missingTimestamp: 1
- invalidTimestamp: 0
`);

    const summary = buildDoctorSummary({ baseDir: root });
    expect(summary.overall).toBe("WARN");
    expect(itemStatus(summary, "daily-refresh")).toBe("OK");
    expect(itemStatus(summary, "schema-drift")).toBe("OK");
    expect(itemStatus(summary, "data-freshness")).toBe("WARN");
    expect(itemStatus(summary, "dart-artifacts")).toBe("WARN");
    expect(itemStatus(summary, "feedback-store")).toBe("WARN");
  });

  it("returns FAIL when critical checks fail", () => {
    const root = createTempRoot();
    writeText(root, "tmp/daily_refresh_result.json", "{ invalid json");
    writeText(root, "docs/schema-drift-report.md", `
| Snapshot | Breaking | Non-breaking |
| --- | ---: | ---: |
| a.json | 2 | 1 |
`);
    writeText(root, "docs/data-freshness-report.md", `
- stale: 3
- missingTimestamp: 0
- invalidTimestamp: 0
`);
    writeText(root, "tmp/user_feedback.json", "{ broken");

    const summary = buildDoctorSummary({ baseDir: root });
    expect(summary.overall).toBe("FAIL");
    expect(itemStatus(summary, "daily-refresh")).toBe("FAIL");
    expect(itemStatus(summary, "schema-drift")).toBe("FAIL");
    expect(itemStatus(summary, "data-freshness")).toBe("FAIL");
    expect(itemStatus(summary, "feedback-store")).toBe("FAIL");
  });
});
