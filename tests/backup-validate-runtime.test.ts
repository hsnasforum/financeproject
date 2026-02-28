import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRuntime } from "../src/lib/backup/backupValidateRuntime";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-backup-validate-"));
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

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("backup runtime validation", () => {
  it("returns ok=true for valid runtime files", () => {
    const root = createTempRoot();
    writeJson(root, "tmp/user_feedback.json", {
      version: 1,
      items: [],
    });
    writeJson(root, "tmp/dart/disclosure_alerts.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/dart/disclosure_digest.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/dart/daily_brief.json", { generatedAt: new Date().toISOString() });
    writeJson(root, "tmp/daily_refresh_result.json", { steps: [] });

    const result = validateRuntime({ baseDir: root });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns issues for invalid json and missing required fields", () => {
    const root = createTempRoot();
    writeText(root, "tmp/user_feedback.json", "{ invalid json");
    writeJson(root, "tmp/dart/disclosure_alerts.json", { foo: 1 });
    writeJson(root, "tmp/dart/disclosure_digest.json", { generatedAt: "" });
    writeJson(root, "tmp/dart/daily_brief.json", { generatedAt: "2026-01-01T00:00:00.000Z" });
    writeJson(root, "tmp/daily_refresh_result.json", { generatedAt: "2026-01-01T00:00:00.000Z" });

    const result = validateRuntime({ baseDir: root });
    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.includes("tmp/user_feedback.json"))).toBe(true);
    expect(result.issues.some((entry) => entry.includes("tmp/dart/disclosure_alerts.json"))).toBe(true);
    expect(result.issues.some((entry) => entry.includes("tmp/dart/disclosure_digest.json"))).toBe(true);
    expect(result.issues.some((entry) => entry.includes("tmp/daily_refresh_result.json"))).toBe(true);
  });

  it("skips missing files by default", () => {
    const root = createTempRoot();
    const result = validateRuntime({ baseDir: root });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("adds issue when required path is missing", () => {
    const root = createTempRoot();
    const result = validateRuntime({
      baseDir: root,
      requiredPaths: ["tmp/dart/disclosure_alerts.json"],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.includes("tmp/dart/disclosure_alerts.json"))).toBe(true);
  });
});
