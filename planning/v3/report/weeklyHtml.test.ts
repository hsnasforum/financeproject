import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWeeklyHtmlReportExport, buildWeeklyHtmlReport } from "./weeklyHtml";
import { writeTodayCache, writeTrendsCache } from "../news/store";
import { type DigestDay } from "../news/digest/contracts";
import { type ScenarioPack } from "../news/scenario/contracts";

describe("planning v3 weekly html report export", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-weekly-report-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function seedCaches(newsRoot: string): void {
    const digest: DigestDay = {
      schemaVersion: 1,
      date: "2026-03-05",
      observation: "금리/환율 토픽의 비중 변화가 관찰됩니다.",
      evidence: [
        {
          title: "기준금리 동결 발표",
          url: "https://example.com/news-a",
          sourceId: "bok_press_all",
          publishedAt: "2026-03-05T01:00:00.000Z",
          topics: ["rates"],
        },
        {
          title: "원/달러 환율 점검",
          url: "https://example.com/news-b",
          sourceId: "bok_press_all",
          publishedAt: "2026-03-05T00:00:00.000Z",
          topics: ["fx"],
        },
      ],
      watchlist: ["기준금리", "USDKRW"],
      counterSignals: ["원자재 가격 완화 시 현재 관찰 강도는 낮아질 수 있습니다."],
    };

    const scenarios: ScenarioPack = {
      schemaVersion: 1,
      generatedAt: "2026-03-05T03:00:00.000Z",
      cards: [
        {
          name: "Base",
          observation: "현재 흐름이 이어지는 경로입니다.",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "med", note: "금리 토픽" }],
          invalidation: ["금리 토픽 강도가 낮아지면 경로가 약화될 수 있습니다."],
          indicators: ["rates"],
          options: ["관련 지표를 조건부로 점검합니다."],
          linkedTopics: ["rates"],
        },
        {
          name: "Bull",
          observation: "신호가 완화되는 경로입니다.",
          triggers: [{ kind: "topicBurst", topicId: "rates", condition: "low", note: "금리 토픽" }],
          invalidation: ["금리 토픽이 재확대되면 경로가 약화될 수 있습니다."],
          indicators: ["rates"],
          options: ["완화 신호와 반대 지표를 같이 확인합니다."],
          linkedTopics: ["rates", "fx"],
        },
        {
          name: "Bear",
          observation: "신호가 강화되는 경로입니다.",
          triggers: [{ kind: "topicBurst", topicId: "fx", condition: "high", note: "환율 토픽" }],
          invalidation: ["환율 토픽 강도가 완화되면 경로가 약화될 수 있습니다."],
          indicators: ["fx"],
          options: ["변동성 확대 여부를 조건부로 점검합니다."],
          linkedTopics: ["fx"],
        },
      ],
    };

    writeTodayCache({
      generatedAt: "2026-03-05T03:00:00.000Z",
      date: "2026-03-05",
      lastRefreshedAt: "2026-03-05T03:00:00.000Z",
      digest,
      scenarios,
    }, newsRoot);

    writeTrendsCache({
      generatedAt: "2026-03-05T03:00:00.000Z",
      date: "2026-03-05",
      windowDays: 7,
      topics: [
        {
          topicId: "rates",
          topicLabel: "금리/통화정책",
          count: 12,
          burstGrade: "High",
          sourceDiversity: 0.8,
        },
        {
          topicId: "fx",
          topicLabel: "환율/대외",
          count: 6,
          burstGrade: "Med",
          sourceDiversity: 0.6,
        },
      ],
    }, newsRoot);
  }

  it("exports weekly html using local summaries only", () => {
    const root = createRoot();
    const newsRoot = path.join(root, ".data", "news");
    seedCaches(newsRoot);

    const result = runWeeklyHtmlReportExport({ cwd: root, rootDir: newsRoot });
    expect(fs.existsSync(result.outputPath)).toBe(true);

    const html = fs.readFileSync(result.outputPath, "utf-8");
    expect(html).toContain("V3 주간 뉴스 요약 리포트");
    expect(html).toContain("금리/통화정책");
    expect(html).toContain("https://example.com/news-a");
    expect(html).toContain("Base");
    expect(html).toContain("High");

    // summary-only export guard
    expect(html).not.toContain("snippet");
    expect(html).not.toContain("transaction");
    expect(html).not.toContain("raw_csv");
    expect(html).not.toContain("fulltext");
  });

  it("is deterministic for identical local input", () => {
    const root = createRoot();
    const newsRoot = path.join(root, ".data", "news");
    seedCaches(newsRoot);

    const first = buildWeeklyHtmlReport({ rootDir: newsRoot, windowDays: 7 });
    const second = buildWeeklyHtmlReport({ rootDir: newsRoot, windowDays: 7 });

    expect(second.report).toEqual(first.report);
    expect(second.html).toBe(first.html);
  });
});
