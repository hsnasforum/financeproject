import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SnapshotPicker from "../../../src/components/planning/workspace/SnapshotPicker";
import { type SnapshotListItem } from "../../../src/lib/planning/ui/snapshotListTypes";

describe("SnapshotPicker", () => {
  it("renders unavailable latest guidance and stale risk state for a selected history snapshot", () => {
    const historyItem: SnapshotListItem = {
      id: "snap-risk",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-01T00:00:00.000Z",
      staleDays: 120,
      korea: {
        policyRatePct: 2.5,
        cpiYoYPct: 2.0,
        newDepositAvgPct: 3.1,
      },
      warningsCount: 3,
    };

    const html = renderToStaticMarkup(
      <SnapshotPicker
        advancedEnabled
        items={{ history: [historyItem] }}
        onChange={() => undefined}
        value={{ mode: "history", id: "snap-risk" }}
      />,
    );

    expect(html).toContain('data-testid="snapshot-selector"');
    expect(html).toContain('data-testid="planning-snapshot-select"');
    expect(html).toContain("최신 데이터 없음");
    expect(html).toContain("120일 경과");
    expect(html).toContain("위험");
    expect(html).toContain("경고 3");
    expect(html).toContain("최신 계산 기준 데이터가 없습니다.");
    expect(html).toContain("데이터 상태 확인하기");
    expect(html).toContain('href="/settings/data-sources"');
    expect(html).not.toContain('href="/ops/assumptions');
    expect(html).toContain("세부 정보");
    expect(html).toContain('aria-controls="snapshot-details-panel"');
    expect(html).not.toContain('id="snapshot-details-panel"');
  });

  it("renders a fresh latest snapshot without sync guidance", () => {
    const latestItem: SnapshotListItem = {
      id: "snap-latest",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-10T00:00:00.000Z",
      staleDays: 12,
      korea: {
        policyRatePct: 2.5,
        cpiYoYPct: 2.0,
        newDepositAvgPct: 3.1,
      },
      warningsCount: 0,
    };

    const html = renderToStaticMarkup(
      <SnapshotPicker
        items={{ latest: latestItem, history: [] }}
        onChange={() => undefined}
        value={{ mode: "latest" }}
      />,
    );

    expect(html).toContain("최신 · 기준일 2026-01-31");
    expect(html).toContain("기준금리 2.50%");
    expect(html).toContain("소비자물가 2.00%");
    expect(html).toContain("예금 3.10%");
    expect(html).toContain("12일 경과");
    expect(html).toContain("최신 기준");
    expect(html).not.toContain("위험");
    expect(html).not.toContain("주의");
    expect(html).not.toContain("경고 ");
    expect(html).not.toContain("최신 계산 기준 데이터가 없습니다.");
    expect(html).not.toContain("데이터 상태 확인하기");
    expect(html).not.toContain("세부 정보");
  });
});
