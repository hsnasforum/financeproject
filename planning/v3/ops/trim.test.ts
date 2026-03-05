import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runV3Trim } from "./trim";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf-8");
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

describe("planning v3 trim cli", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-trim-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints preview summary without mutating files when apply=false", () => {
    const root = createRoot();

    writeJson(path.join(root, ".data/news/items/old.json"), {
      id: "old",
      sourceId: "source",
      title: "old",
      url: "https://example.com/old",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/news/items/new.json"), {
      id: "new",
      sourceId: "source",
      title: "new",
      url: "https://example.com/new",
      fetchedAt: "2026-03-03T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/news/daily/2026-01-01.json"), []);
    writeJson(path.join(root, ".data/news/daily/2026-03-03.json"), []);

    writeText(path.join(root, ".data/indicators/series/kr_cpi.jsonl"), [
      JSON.stringify({ date: "2025-12", value: 1 }),
      JSON.stringify({ date: "2026-03", value: 2 }),
    ].join("\n") + "\n");

    writeText(path.join(root, ".data/alerts/events.jsonl"), [
      JSON.stringify({
        id: "old-alert",
        createdAt: "2026-01-01T00:00:00.000Z",
        dayKst: "2026-01-01",
        source: "news:refresh",
        ruleId: "rule-1",
        ruleKind: "topic_burst",
        level: "high",
        title: "old",
        summary: "old",
        targetType: "topic",
        targetId: "rates",
        snapshot: { triggerStatus: "met", burstLevel: "상" },
      }),
      JSON.stringify({
        id: "new-alert",
        createdAt: "2026-03-03T00:00:00.000Z",
        dayKst: "2026-03-03",
        source: "news:refresh",
        ruleId: "rule-1",
        ruleKind: "topic_burst",
        level: "high",
        title: "new",
        summary: "new",
        targetType: "topic",
        targetId: "rates",
        snapshot: { triggerStatus: "met", burstLevel: "중" },
      }),
    ].join("\n") + "\n");

    writeJson(path.join(root, ".data/journal/entries/old-entry.json"), {
      id: "old-entry",
      date: "2026-01-01",
      observations: [],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/journal/entries/new-entry.json"), {
      id: "new-entry",
      date: "2026-03-03",
      observations: [],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-03-03T00:00:00.000Z",
      updatedAt: "2026-03-03T00:00:00.000Z",
    });

    const beforeSeries = readLines(path.join(root, ".data/indicators/series/kr_cpi.jsonl"));
    const beforeAlerts = readLines(path.join(root, ".data/alerts/events.jsonl"));

    const summary = runV3Trim({
      cwd: root,
      retentionDays: 30,
      apply: false,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(summary.mode).toBe("preview");
    expect(summary.totals.candidates).toBeGreaterThan(0);
    expect(summary.totals.trimmed).toBe(0);
    expect(fs.existsSync(path.join(root, ".data/news/items/old.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".data/news/daily/2026-01-01.json"))).toBe(true);
    expect(readLines(path.join(root, ".data/indicators/series/kr_cpi.jsonl"))).toEqual(beforeSeries);
    expect(readLines(path.join(root, ".data/alerts/events.jsonl"))).toEqual(beforeAlerts);
    expect(fs.existsSync(path.join(root, ".data/journal/entries/old-entry.json"))).toBe(true);
  });

  it("trims old rows/files only when apply=true", () => {
    const root = createRoot();

    writeJson(path.join(root, ".data/news/items/old.json"), {
      id: "old",
      sourceId: "source",
      title: "old",
      url: "https://example.com/old",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/news/items/new.json"), {
      id: "new",
      sourceId: "source",
      title: "new",
      url: "https://example.com/new",
      fetchedAt: "2026-03-03T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/news/daily/2026-01-01.json"), []);
    writeJson(path.join(root, ".data/news/daily/2026-03-03.json"), []);

    writeText(path.join(root, ".data/indicators/series/kr_cpi.jsonl"), [
      JSON.stringify({ date: "2025-12", value: 1 }),
      JSON.stringify({ date: "2026-03", value: 2 }),
    ].join("\n") + "\n");

    writeText(path.join(root, ".data/alerts/events.jsonl"), [
      JSON.stringify({
        id: "old-alert",
        createdAt: "2026-01-01T00:00:00.000Z",
        dayKst: "2026-01-01",
        source: "news:refresh",
        ruleId: "rule-1",
        ruleKind: "topic_burst",
        level: "high",
        title: "old",
        summary: "old",
        targetType: "topic",
        targetId: "rates",
        snapshot: { triggerStatus: "met", burstLevel: "상" },
      }),
      JSON.stringify({
        id: "new-alert",
        createdAt: "2026-03-03T00:00:00.000Z",
        dayKst: "2026-03-03",
        source: "news:refresh",
        ruleId: "rule-1",
        ruleKind: "topic_burst",
        level: "high",
        title: "new",
        summary: "new",
        targetType: "topic",
        targetId: "rates",
        snapshot: { triggerStatus: "met", burstLevel: "중" },
      }),
    ].join("\n") + "\n");

    writeJson(path.join(root, ".data/journal/entries/old-entry.json"), {
      id: "old-entry",
      date: "2026-01-01",
      observations: [],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    writeJson(path.join(root, ".data/journal/entries/new-entry.json"), {
      id: "new-entry",
      date: "2026-03-03",
      observations: [],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-03-03T00:00:00.000Z",
      updatedAt: "2026-03-03T00:00:00.000Z",
    });

    const summary = runV3Trim({
      cwd: root,
      retentionDays: 30,
      apply: true,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(summary.mode).toBe("apply");
    expect(summary.totals.trimmed).toBeGreaterThan(0);

    expect(fs.existsSync(path.join(root, ".data/news/items/old.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".data/news/items/new.json"))).toBe(true);

    expect(fs.existsSync(path.join(root, ".data/news/daily/2026-01-01.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".data/news/daily/2026-03-03.json"))).toBe(true);

    expect(readLines(path.join(root, ".data/indicators/series/kr_cpi.jsonl"))).toEqual([
      JSON.stringify({ date: "2026-03", value: 2 }),
    ]);

    expect(readLines(path.join(root, ".data/alerts/events.jsonl")).length).toBe(1);
    expect(readLines(path.join(root, ".data/alerts/events.jsonl"))[0]?.includes("new-alert")).toBe(true);

    expect(fs.existsSync(path.join(root, ".data/journal/entries/old-entry.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".data/journal/entries/new-entry.json"))).toBe(true);
  });
});
