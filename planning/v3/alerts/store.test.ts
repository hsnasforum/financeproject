import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendAlertEvents, readAlertEvents, resolveAlertEventsPath } from "./store";

describe("planning v3 alerts store", () => {
  const roots: string[] = [];
  const env = process.env as Record<string, string | undefined>;
  const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-alerts-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
  });

  it("appends jsonl and suppresses near-duplicate events in short window", () => {
    const rootDir = createRoot();

    const first = appendAlertEvents({
      rootDir,
      dedupWindowMinutes: 180,
      events: [
        {
          id: "a1",
          createdAt: "2026-03-04T00:00:00.000Z",
          dayKst: "2026-03-04",
          source: "news:refresh",
          ruleId: "topic_fx_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "토픽 급증",
          summary: "토픽 급증 조건이 충족되었습니다.",
          targetType: "topic",
          targetId: "fx",
          snapshot: { triggerStatus: "met", burstLevel: "상" },
        },
      ],
    });
    expect(first.appended).toBe(1);

    const second = appendAlertEvents({
      rootDir,
      dedupWindowMinutes: 180,
      events: [
        {
          id: "a2",
          createdAt: "2026-03-04T02:30:00.000Z",
          dayKst: "2026-03-04",
          source: "indicators:refresh",
          ruleId: "topic_fx_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "토픽 급증",
          summary: "토픽 급증 조건이 충족되었습니다.",
          targetType: "topic",
          targetId: "fx",
          snapshot: { triggerStatus: "met", burstLevel: "상" },
        },
      ],
    });
    expect(second.appended).toBe(0);

    const third = appendAlertEvents({
      rootDir,
      dedupWindowMinutes: 180,
      events: [
        {
          id: "a3",
          createdAt: "2026-03-04T04:10:00.000Z",
          dayKst: "2026-03-04",
          source: "news:refresh",
          ruleId: "topic_fx_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "토픽 급증",
          summary: "토픽 급증 조건이 충족되었습니다.",
          targetType: "topic",
          targetId: "fx",
          snapshot: { triggerStatus: "met", burstLevel: "상" },
        },
      ],
    });
    expect(third.appended).toBe(1);

    const events = readAlertEvents(rootDir);
    expect(events).toHaveLength(2);
    expect(events.map((row) => row.id).sort()).toEqual(["a1", "a3"]);
  });

  it("uses env-aware default root when PLANNING_DATA_DIR is set", () => {
    const root = createRoot();
    env.PLANNING_DATA_DIR = path.join(root, "planning");

    const result = appendAlertEvents({
      events: [
        {
          id: "env-a1",
          createdAt: "2026-03-04T00:00:00.000Z",
          dayKst: "2026-03-04",
          source: "news:refresh",
          ruleId: "topic_fx_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "환경 경로 알림",
          summary: "env root",
          targetType: "topic",
          targetId: "fx",
          snapshot: { triggerStatus: "met", burstLevel: "상" },
        },
      ],
    });

    expect(result.appended).toBe(1);
    expect(resolveAlertEventsPath()).toBe(path.join(root, "alerts", "events.jsonl"));
    expect(fs.existsSync(path.join(root, "alerts", "events.jsonl"))).toBe(true);
    expect(readAlertEvents().map((row) => row.id)).toEqual(["env-a1"]);
  });
});
