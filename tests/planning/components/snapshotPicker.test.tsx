import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SnapshotPicker from "../../../src/app/planning/_components/SnapshotPicker";
import { type SnapshotListItem } from "../../../src/app/planning/_lib/snapshotList";

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
    expect(html).toContain("LATEST · unavailable");
    expect(html).toContain("Stale 120d");
    expect(html).toContain("위험");
    expect(html).toContain("경고 3");
    expect(html).toContain("latest 스냅샷이 없습니다.");
    expect(html).toContain("/ops/assumptions에서 동기화 권장");
    expect(html).toContain('data-testid="planning-snapshot-ops-link"');
    expect(html).toContain('href="/ops/assumptions"');
    expect(html).toContain('href="/ops/assumptions/history"');
    expect(html).toContain("Details");
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

    expect(html).toContain("LATEST · asOf 2026-01-31");
    expect(html).toContain("기준금리 2.50%");
    expect(html).toContain("CPI 2.00%");
    expect(html).toContain("예금 3.10%");
    expect(html).toContain("(stale 12d)");
    expect(html).toContain("Fresh");
    expect(html).not.toContain("위험");
    expect(html).not.toContain("주의");
    expect(html).not.toContain("경고 ");
    expect(html).not.toContain("latest 스냅샷이 없습니다.");
    expect(html).not.toContain("동기화 권장");
    expect(html).not.toContain("Details");
  });
});
