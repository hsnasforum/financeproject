import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateAlertEvents,
  evaluateAndAppendAlertEvents,
  readAlertEvents,
  writeAlertRuleOverrides,
} from "../src/lib/news/alerts";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

describe("news alerts", () => {
  const roots: string[] = [];

  function createFixtureCwd(): string {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-alerts-"));
    roots.push(cwd);

    writeJson(path.join(cwd, "config", "indicators-series.json"), {
      version: 1,
      series: [
        {
          id: "kr_usdkrw",
          sourceId: "ecos",
          externalId: "dummy",
          name: "KRW",
          frequency: "D",
        },
      ],
    });

    writeJson(path.join(cwd, "config", "news-alert-rules.json"), {
      version: 1,
      rules: [
        {
          id: "topic_fx_high",
          name: "환율 토픽 급증",
          enabled: true,
          level: "high",
          kind: "topic_burst",
          topicId: "fx",
          minBurstLevel: "상",
          minTodayCount: 2,
        },
        {
          id: "fx_zscore_high",
          name: "환율 zscore",
          enabled: true,
          level: "medium",
          kind: "indicator",
          seriesId: "kr_usdkrw",
          metric: "zscore",
          window: 4,
          condition: "high",
          threshold: 1,
          targetType: "topic",
          targetId: "fx",
        },
      ],
    });

    writeJson(path.join(cwd, ".data", "news", "topic_trends.latest.json"), {
      generatedAt: "2026-03-04T00:00:00.000Z",
      timezone: "Asia/Seoul",
      todayKst: "2026-03-04",
      windowDays: 30,
      topics: [
        {
          topicId: "fx",
          topicLabel: "환율/대외",
          todayCount: 5,
          yesterdayCount: 2,
          delta: 3,
          ratio: 2.5,
          avgLast7d: 2,
          stddevLast7d: 1,
          burstZ: 2.4,
          burstLevel: "상",
          lowHistory: false,
          sourceDiversity: 0.6,
          topSourceShare: 0.5,
          scoreSum: 10,
          series: [],
        },
      ],
      burstTopics: [],
    });

    fs.mkdirSync(path.join(cwd, ".data", "indicators", "series"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".data", "indicators", "series", "kr_usdkrw.jsonl"), [
      JSON.stringify({ date: "2026-03-01", value: 1300 }),
      JSON.stringify({ date: "2026-03-02", value: 1301 }),
      JSON.stringify({ date: "2026-03-03", value: 1302 }),
      JSON.stringify({ date: "2026-03-04", value: 1360 }),
    ].join("\n") + "\n", "utf-8");

    return cwd;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("evaluates topic burst + indicator rules and appends events idempotently", () => {
    const cwd = createFixtureCwd();

    const first = evaluateAndAppendAlertEvents({
      cwd,
      generatedAt: "2026-03-04T00:00:00.000Z",
      source: "news:refresh",
    });

    expect(first.evaluated).toBe(2);
    expect(first.appended).toBe(2);
    const rows = readAlertEvents(cwd);
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.ruleKind === "topic_burst")).toBe(true);
    expect(rows.some((row) => row.ruleKind === "indicator")).toBe(true);

    const second = evaluateAndAppendAlertEvents({
      cwd,
      generatedAt: "2026-03-04T03:00:00.000Z",
      source: "indicators:refresh",
    });
    expect(second.evaluated).toBe(2);
    expect(second.appended).toBe(0);
    expect(readAlertEvents(cwd)).toHaveLength(2);
  });

  it("applies local overrides to disable selected rules", () => {
    const cwd = createFixtureCwd();

    writeAlertRuleOverrides({
      rules: [
        {
          id: "topic_fx_high",
          enabled: false,
        },
      ],
    }, cwd);

    const evaluated = evaluateAlertEvents({
      cwd,
      generatedAt: "2026-03-04T00:00:00.000Z",
      source: "news:refresh",
    });

    expect(evaluated.events).toHaveLength(1);
    expect(evaluated.events[0]?.ruleId).toBe("fx_zscore_high");
  });
});
