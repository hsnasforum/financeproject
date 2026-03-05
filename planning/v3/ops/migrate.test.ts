import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runV3Migrate } from "./migrate";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

describe("planning v3 migrate cli", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-migrate-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs dry-run and reports schemaVersion upgrade candidates without mutating", () => {
    const root = createRoot();
    const statePath = path.join(root, ".data/news/state.json");
    writeJson(statePath, {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      sources: {},
    });

    const before = fs.readFileSync(statePath, "utf-8");
    const summary = runV3Migrate({
      cwd: root,
      apply: false,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });
    const after = fs.readFileSync(statePath, "utf-8");

    expect(summary.mode).toBe("preview");
    expect(summary.totals.changed).toBe(1);
    expect(summary.totals.applied).toBe(0);
    expect(summary.totals.errors).toBe(0);
    expect(before).toBe(after);
  });

  it("applies migration with backup and doctor report", () => {
    const root = createRoot();
    writeJson(path.join(root, ".data/news/state.json"), {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      sources: {},
    });
    writeJson(path.join(root, ".data/indicators/state.json"), {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      series: {},
    });

    const summary = runV3Migrate({
      cwd: root,
      apply: true,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(summary.mode).toBe("apply");
    expect(summary.totals.errors).toBe(0);
    expect(summary.totals.applied).toBe(2);
    expect(summary.backupPath).toBeTruthy();
    expect(summary.doctor).toBeDefined();
    expect(fs.existsSync(path.join(summary.backupPath!, "news/state.json"))).toBe(true);

    const migrated = JSON.parse(fs.readFileSync(path.join(root, ".data/news/state.json"), "utf-8")) as {
      schemaVersion?: number;
    };
    expect(migrated.schemaVersion).toBe(1);
  });

  it("blocks apply when validation errors exist", () => {
    const root = createRoot();
    writeJson(path.join(root, ".data/news/state.json"), {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      sources: [],
    });

    const preview = runV3Migrate({
      cwd: root,
      apply: false,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(preview.totals.errors).toBeGreaterThan(0);
    expect(() => runV3Migrate({
      cwd: root,
      apply: true,
      now: new Date("2026-03-04T00:00:00.000Z"),
    })).toThrow(/MIGRATE_BLOCKED:VALIDATION_FAILED/);
  });
});
