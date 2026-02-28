import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCleanup } from "../src/lib/maintenance/cleanup";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-cleanup-"));
  roots.push(root);
  return root;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("maintenance cleanup", () => {
  it("trims history/feedback, truncates large log, and keeps only latest restore point", () => {
    const root = makeRoot();
    const tmpDir = path.join(root, "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });

    const fixHistory = Array.from({ length: 250 }, (_, idx) => ({ id: `h-${idx}` }));
    fs.writeFileSync(path.join(tmpDir, "fix_history.json"), JSON.stringify(fixHistory, null, 2), "utf-8");

    const feedback = Array.from({ length: 620 }, (_, idx) => ({ id: `f-${idx}` }));
    fs.writeFileSync(path.join(tmpDir, "user_feedback.json"), JSON.stringify(feedback, null, 2), "utf-8");

    const largeLine = `${"x".repeat(640)}\n`;
    const largeLog = Array.from({ length: 3200 }, () => largeLine).join("");
    fs.writeFileSync(path.join(tmpDir, "daily_refresh.log"), largeLog, "utf-8");

    const restoreOld = path.join(tmpDir, "backup_restore_point.20260226.json");
    const restoreNew = path.join(tmpDir, "backup_restore_point.20260227.json");
    const restoreCanonical = path.join(tmpDir, "backup_restore_point.json");
    fs.writeFileSync(restoreOld, "old", "utf-8");
    fs.writeFileSync(restoreNew, "newest", "utf-8");
    fs.writeFileSync(restoreCanonical, "canonical-old", "utf-8");
    fs.utimesSync(restoreOld, new Date("2026-02-26T00:00:00.000Z"), new Date("2026-02-26T00:00:00.000Z"));
    fs.utimesSync(restoreCanonical, new Date("2026-02-27T00:00:00.000Z"), new Date("2026-02-27T00:00:00.000Z"));
    fs.utimesSync(restoreNew, new Date("2026-02-28T00:00:00.000Z"), new Date("2026-02-28T00:00:00.000Z"));

    const result = runCleanup({ now: new Date("2026-02-28T01:00:00.000Z"), cwd: root });
    expect(result.ok).toBe(true);
    expect(result.report.generatedAt).toBe("2026-02-28T01:00:00.000Z");
    expect(result.report.policy.feedbackMaxItems).toBe(500);
    expect(result.report.policy.fixHistoryMaxItems).toBe(200);
    expect(result.report.policy.keepBackupRestorePoint).toBe(true);

    const nextFixHistory = readJson(path.join(tmpDir, "fix_history.json")) as Array<{ id?: string }>;
    expect(nextFixHistory).toHaveLength(200);
    expect(nextFixHistory[0]?.id).toBe("h-50");
    expect(nextFixHistory[199]?.id).toBe("h-249");

    const nextFeedback = readJson(path.join(tmpDir, "user_feedback.json")) as Array<{ id?: string }>;
    expect(nextFeedback).toHaveLength(500);
    expect(nextFeedback[0]?.id).toBe("f-120");
    expect(nextFeedback[499]?.id).toBe("f-619");

    const logPath = path.join(tmpDir, "daily_refresh.log");
    const logStat = fs.statSync(logPath);
    expect(logStat.size).toBeLessThanOrEqual(200 * 1024);
    const logLines = fs.readFileSync(logPath, "utf-8").trimEnd().split("\n");
    expect(logLines.length).toBeLessThanOrEqual(2000);

    const restoreCandidates = fs
      .readdirSync(tmpDir)
      .filter((name) => /^backup_restore_point(?:[._-].+)?\.json$/.test(name));
    expect(restoreCandidates).toEqual(["backup_restore_point.json"]);
    expect(fs.readFileSync(restoreCanonical, "utf-8")).toBe("newest");

    const reportPath = path.join(tmpDir, "cleanup_report.json");
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = readJson(reportPath) as {
      summary?: { removed?: number; truncated?: number };
      targets?: Array<{ target?: string; status?: string }>;
    };
    expect(report.summary?.removed).toBeGreaterThanOrEqual(172);
    expect(report.summary?.truncated).toBe(1);
    expect(report.targets?.some((row) => row.target === "tmp/daily_refresh.log" && row.status === "truncated")).toBe(true);
  });

  it("skips missing files without error and still writes report", () => {
    const root = makeRoot();

    const result = runCleanup({ now: new Date("2026-02-28T02:00:00.000Z"), cwd: root });
    expect(result.ok).toBe(true);

    const reportPath = path.join(root, "tmp", "cleanup_report.json");
    expect(fs.existsSync(reportPath)).toBe(true);

    const report = readJson(reportPath) as {
      generatedAt?: string;
      summary?: { skipped?: number; errors?: number };
      targets?: Array<{ status?: string }>;
    };
    expect(report.generatedAt).toBe("2026-02-28T02:00:00.000Z");
    expect(report.summary?.errors).toBe(0);
    expect(report.summary?.skipped).toBeGreaterThanOrEqual(3);
    expect((report.targets ?? []).every((row) => row.status !== "error")).toBe(true);
  });

  it("applies retention policy file values", () => {
    const root = makeRoot();
    const tmpDir = path.join(root, "tmp");
    const configDir = path.join(root, "config");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    fs.writeFileSync(
      path.join(configDir, "retention-policy.json"),
      JSON.stringify({
        version: 3,
        feedbackMaxItems: 70,
        fixHistoryMaxItems: 60,
        refreshLogMaxBytes: 60 * 1024,
        refreshLogKeepTailBytes: 20 * 1024,
        keepBackupRestorePoint: false,
      }, null, 2),
      "utf-8",
    );

    const fixHistory = Array.from({ length: 120 }, (_, idx) => ({ id: `h-${idx}` }));
    fs.writeFileSync(path.join(tmpDir, "fix_history.json"), JSON.stringify(fixHistory, null, 2), "utf-8");
    const feedback = Array.from({ length: 120 }, (_, idx) => ({ id: `f-${idx}` }));
    fs.writeFileSync(path.join(tmpDir, "user_feedback.json"), JSON.stringify(feedback, null, 2), "utf-8");
    fs.writeFileSync(path.join(tmpDir, "daily_refresh.log"), `${"log\n".repeat(30_000)}`, "utf-8");
    fs.writeFileSync(path.join(tmpDir, "backup_restore_point.json"), "keep?", "utf-8");
    fs.writeFileSync(path.join(tmpDir, "backup_restore_point.old.json"), "old", "utf-8");

    const result = runCleanup({ now: new Date("2026-02-28T03:00:00.000Z"), cwd: root });
    expect(result.ok).toBe(true);
    expect(result.report.policy.version).toBe(3);
    expect(result.report.policy.feedbackMaxItems).toBe(70);
    expect(result.report.policy.fixHistoryMaxItems).toBe(60);
    expect(result.report.policy.keepBackupRestorePoint).toBe(false);

    const nextFixHistory = readJson(path.join(tmpDir, "fix_history.json")) as Array<{ id?: string }>;
    expect(nextFixHistory).toHaveLength(60);
    expect(nextFixHistory[0]?.id).toBe("h-60");

    const nextFeedback = readJson(path.join(tmpDir, "user_feedback.json")) as Array<{ id?: string }>;
    expect(nextFeedback).toHaveLength(70);
    expect(nextFeedback[0]?.id).toBe("f-50");

    const logStat = fs.statSync(path.join(tmpDir, "daily_refresh.log"));
    expect(logStat.size).toBeLessThanOrEqual(20 * 1024);

    const restoreCandidates = fs
      .readdirSync(tmpDir)
      .filter((name) => /^backup_restore_point(?:[._-].+)?\.json$/.test(name));
    expect(restoreCandidates).toEqual([]);
  });
});
