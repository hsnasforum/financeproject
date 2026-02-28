import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPlanningIntegrity } from "../../src/lib/ops/planningDoctor";

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

describe("planning doctor integrity", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("returns ok=true for normal planning structure", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-doctor-"));

    writeJson(path.join(root, ".data/planning/assumptions.latest.json"), { version: 1 });
    writeJson(path.join(root, ".data/planning/assumptions/history/s1.json"), { version: 1 });
    writeJson(path.join(root, ".data/planning/profiles/p1.json"), { version: 1 });
    writeJson(path.join(root, ".data/planning/runs/r1.json"), { version: 1 });

    const report = await checkPlanningIntegrity({ baseDir: root, strict: false });
    expect(report.ok).toBe(true);
    expect(report.invalidJson).toEqual([]);
    expect(report.counts.assumptionsHistory).toBe(1);
    expect(report.counts.profiles).toBe(1);
    expect(report.counts.runs).toBe(1);
  });

  it("records invalid JSON and reports ok=false", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-doctor-"));

    writeJson(path.join(root, ".data/planning/assumptions.latest.json"), { version: 1 });
    writeJson(path.join(root, ".data/planning/assumptions/history/s1.json"), { version: 1 });
    fs.mkdirSync(path.join(root, ".data/planning/profiles"), { recursive: true });
    fs.writeFileSync(path.join(root, ".data/planning/profiles/p1.json"), "{not-json}", "utf-8");
    writeJson(path.join(root, ".data/planning/runs/r1.json"), { version: 1 });

    const report = await checkPlanningIntegrity({ baseDir: root, strict: false });
    expect(report.ok).toBe(false);
    expect(report.invalidJson.some((entry) => entry.includes(".data/planning/profiles/p1.json"))).toBe(true);
  });

  it("fails strict mode when required paths are missing", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-doctor-"));

    const loose = await checkPlanningIntegrity({ baseDir: root, strict: false });
    const strict = await checkPlanningIntegrity({ baseDir: root, strict: true });

    expect(loose.ok).toBe(true);
    expect(strict.ok).toBe(false);
    expect(strict.missing).toContain(".data/planning/assumptions.latest.json");
  });
});
