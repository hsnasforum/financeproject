import { describe, expect, it } from "vitest";
import { buildImpactPingSummary, getImpactPingCapableSourceIds } from "../src/lib/dataSources/impactPing";

describe("data source impact ping summary", () => {
  const sourceLabels = {
    EXIM_EXCHANGE: "한국수출입은행 환율",
    MOIS_BENEFITS: "보조금24",
    MOLIT_SALES: "국토부 실거래(매매)",
    MOLIT_RENT: "국토부 전월세",
    REB_SUBSCRIPTION: "청약홈",
  };

  it("returns null when no ping-capable sources exist", () => {
    expect(getImpactPingCapableSourceIds({ primarySourceIds: ["OPENDART"], supportSourceIds: ["BOK_ECOS"] })).toEqual([]);
    expect(buildImpactPingSummary(
      { primarySourceIds: ["OPENDART"], supportSourceIds: ["BOK_ECOS"] },
      sourceLabels,
      {},
    )).toBeNull();
  });

  it("sorts recent snapshots and reports pending labels", () => {
    const result = buildImpactPingSummary(
      { primarySourceIds: ["MOLIT_SALES", "MOLIT_RENT"], supportSourceIds: ["REB_SUBSCRIPTION"] },
      sourceLabels,
      {
        REB_SUBSCRIPTION: {
          source: "reb_subscription",
          tone: "error",
          text: "연결 주의 · 0건",
          summaryText: "0건",
          statusLabel: "주의",
          fetchedAt: "2026-03-11T10:00:00.000Z",
        },
        MOLIT_RENT: {
          source: "molit_rent",
          tone: "ok",
          text: "연결 OK · 24건",
          summaryText: "24건",
          statusLabel: "정상",
          fetchedAt: "2026-03-11T11:00:00.000Z",
        },
      },
    );

    expect(result).toEqual({
      latestFetchedAt: "2026-03-11T11:00:00.000Z",
      items: [
        {
          sourceId: "MOLIT_RENT",
          sourceLabel: "국토부 전월세",
          summaryText: "24건",
          fetchedAt: "2026-03-11T11:00:00.000Z",
          statusLabel: "정상",
          tone: "ok",
        },
        {
          sourceId: "REB_SUBSCRIPTION",
          sourceLabel: "청약홈",
          summaryText: "0건",
          fetchedAt: "2026-03-11T10:00:00.000Z",
          statusLabel: "주의",
          tone: "error",
        },
      ],
      pendingSourceLabels: ["국토부 실거래(매매)"],
    });
  });
});
