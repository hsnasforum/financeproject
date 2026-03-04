import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runV3Doctor } from "./doctor";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf-8");
}

describe("planning v3 doctor", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-doctor-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns ok for valid local .data structures", () => {
    const root = createRoot();

    writeJson(path.join(root, ".data/news/items/item-1.json"), {
      id: "item-1",
      sourceId: "source-a",
      title: "샘플 뉴스",
      url: "https://example.com/news/1",
      publishedAt: "2026-03-04T00:00:00.000Z",
      guid: "guid-1",
      snippet: "요약",
      fetchedAt: "2026-03-04T00:10:00.000Z",
    });
    writeJson(path.join(root, ".data/news/state.json"), {
      lastRunAt: "2026-03-04T00:10:00.000Z",
      sources: {
        source_a: {
          lastRunAt: "2026-03-04T00:10:00.000Z",
        },
      },
    });
    writeJson(path.join(root, ".data/news/daily/2026-03-04.json"), [
      {
        dateKst: "2026-03-04",
        topicId: "rates",
        topicLabel: "금리/통화정책",
        count: 2,
        scoreSum: 2.3,
        sourceDiversity: 0.5,
        baselineMean: 1.2,
        baselineStddev: 0.8,
        burstZ: 1.1,
        burstGrade: "Med",
      },
    ]);

    writeText(path.join(root, ".data/indicators/series/kr_cpi.jsonl"), `${JSON.stringify({ date: "2026-03", value: 112.3 })}\n`);
    writeJson(path.join(root, ".data/indicators/meta/kr_cpi.json"), {
      seriesId: "kr_cpi",
      asOf: "2026-03-04T00:00:00.000Z",
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_cpi",
        frequency: "M",
      },
      observations: {
        count: 1,
        firstDate: "2026-03",
        lastDate: "2026-03",
      },
    });
    writeJson(path.join(root, ".data/indicators/state.json"), {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      series: {
        kr_cpi: {
          updatedAt: "2026-03-04T00:00:00.000Z",
          lastObservationDate: "2026-03",
          observationsCount: 1,
        },
      },
    });

    writeText(path.join(root, ".data/alerts/events.jsonl"), `${JSON.stringify({
      id: "event-1",
      createdAt: "2026-03-04T00:00:00.000Z",
      dayKst: "2026-03-04",
      source: "news:refresh",
      ruleId: "topic_burst_high",
      ruleKind: "topic_burst",
      level: "high",
      title: "토픽 급증",
      summary: "조건 충족",
      targetType: "topic",
      targetId: "rates",
      snapshot: {
        triggerStatus: "met",
        burstLevel: "상",
      },
    })}\n`);

    writeJson(path.join(root, ".data/journal/entries/entry-1.json"), {
      id: "entry-1",
      date: "2026-03-04",
      observations: ["관찰"],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-03-04T00:00:00.000Z",
      updatedAt: "2026-03-04T00:10:00.000Z",
    });

    const report = runV3Doctor({ cwd: root });
    expect(report.ok).toBe(true);
    expect(report.counts.errors).toBe(0);
    expect(report.counts.warnings).toBe(0);
    expect(report.counts.files).toBeGreaterThan(0);
  });

  it("reports schema errors and missing paths without mutating data", () => {
    const root = createRoot();
    writeJson(path.join(root, ".data/news/items/bad.json"), { id: "bad" });
    writeText(path.join(root, ".data/alerts/events.jsonl"), "{\"invalid\":true}\n");

    const before = fs.readFileSync(path.join(root, ".data/news/items/bad.json"), "utf-8");
    const report = runV3Doctor({ cwd: root });
    const after = fs.readFileSync(path.join(root, ".data/news/items/bad.json"), "utf-8");

    expect(report.ok).toBe(false);
    expect(report.counts.errors).toBeGreaterThan(0);
    expect(report.counts.warnings).toBeGreaterThan(0);
    expect(report.issues.some((row) => row.path.endsWith(".data/news/items/bad.json"))).toBe(true);
    expect(report.issues.some((row) => row.path.endsWith(".data/alerts/events.jsonl"))).toBe(true);
    expect(before).toBe(after);
  });
});
