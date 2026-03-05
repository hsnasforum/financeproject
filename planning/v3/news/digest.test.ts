import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { buildDigest, noRecommendationText } from "./digest";
import { upsertItems, writeDailyStats } from "./store";
import { appendSeriesObservations } from "../indicators/store";

describe("planning v3 news digest", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("digest output contains no banned recommendation phrases", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-digest-"));
    roots.push(root);
    const indicatorsRoot = path.join(root, "indicators");

    upsertItems(FIXTURE_ITEMS, root);
    appendSeriesObservations("kr_base_rate", [
      { date: "2025-11", value: 3.5 },
      { date: "2025-12", value: 3.5 },
      { date: "2026-01", value: 3.25 },
      { date: "2026-02", value: 3.25 },
    ], indicatorsRoot);
    appendSeriesObservations("kr_usdkrw", [
      { date: "2026-03-01", value: 1341.1 },
      { date: "2026-03-02", value: 1347.8 },
      { date: "2026-03-03", value: 1344.3 },
      { date: "2026-03-04", value: 1342.9 },
    ], indicatorsRoot);
    appendSeriesObservations("kr_cpi", [
      { date: "2025-10", value: 113.1 },
      { date: "2025-11", value: 113.3 },
      { date: "2025-12", value: 113.6 },
      { date: "2026-01", value: 113.9 },
      { date: "2026-02", value: 114.0 },
      { date: "2026-03", value: 114.3 },
    ], indicatorsRoot);

    writeDailyStats("2026-03-02", [
      {
        dateKst: "2026-03-02",
        topicId: "rates",
        topicLabel: "금리",
        count: 1,
        baselineMean: 0,
        baselineStddev: 0,
        burstZ: 0.8,
        burstGrade: "하",
      },
    ], root);

    writeDailyStats("2026-03-03", [
      {
        dateKst: "2026-03-03",
        topicId: "rates",
        topicLabel: "금리",
        count: 2,
        baselineMean: 1,
        baselineStddev: 0,
        burstZ: 1,
        burstGrade: "중",
      },
    ], root);

    writeDailyStats("2026-03-04", [
      {
        dateKst: "2026-03-04",
        topicId: "rates",
        topicLabel: "금리",
        count: 6,
        baselineMean: 1.5,
        baselineStddev: 0.5,
        burstZ: 4,
        burstGrade: "상",
      },
    ], root);

    const digest = buildDigest(
      { fromKst: "2026-03-02", toKst: "2026-03-04" },
      { rootDir: root, indicatorsRootDir: indicatorsRoot, now: new Date(FIXTURE_NOW_ISO) },
    );

    expect(digest.topItems.length).toBeGreaterThan(0);
    expect(digest.topTopics.length).toBeGreaterThan(0);
    expect(digest.burstTopics.length).toBeGreaterThan(0);
    expect(digest.watchlist.length).toBeGreaterThan(0);
    expect(digest.watchlist.every((row) => row.label.length > 0)).toBe(true);
    expect(digest.watchlist.every((row) => row.seriesId.length > 0)).toBe(true);
    expect(digest.watchlist.every((row) => row.window >= 1)).toBe(true);
    expect(digest.watchlist.every((row) => row.compactSummary.length > 0)).toBe(true);
    expect(digest.watchlist.some((row) => row.status === "ok")).toBe(true);
    expect(digest.watchlist.every((row) => !/[0-9]|%|σ/.test(row.compactSummary))).toBe(true);
    expect(digest.observationLines.length).toBeGreaterThan(0);

    const merged = digest.observationLines.join(" ");
    expect(noRecommendationText(merged)).toBe(true);
    expect(merged).not.toMatch(/매수|매도|정답|무조건|확실|해야\s*한다/);
  });

  it("known bad strings are rejected", () => {
    const badSamples = [
      "지금은 매수 타이밍입니다.",
      "무조건 올라갑니다.",
      "정답은 매도입니다.",
      "지금 팔아야 한다.",
      "You must buy now",
    ];

    for (const bad of badSamples) {
      expect(noRecommendationText(bad)).toBe(false);
    }

    expect(noRecommendationText("조건부로 변동성 확대 가능성이 있습니다.")).toBe(true);
    expect(noRecommendationText("모니터링이 필요합니다.")).toBe(true);
  });
});
