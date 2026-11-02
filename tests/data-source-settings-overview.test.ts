import { describe, expect, it } from "vitest";
import { buildDataSourceSettingsOverview } from "../src/lib/dataSources/settingsOverview";
import type { DataSourceUserImpactCard } from "../src/lib/dataSources/userImpact";

function card(id: string, state: DataSourceUserImpactCard["state"]): DataSourceUserImpactCard {
  return {
    id,
    title: `${id} 화면`,
    question: "무엇을 확인하나요?",
    description: "설명",
    basis: "기준",
    freshness: "기준 시점",
    routes: [],
    primarySourceIds: [id.toUpperCase()],
    state,
  };
}

describe("data source settings overview", () => {
  it("puts stale or failed read-only health before configuration gaps", () => {
    const overview = buildDataSourceSettingsOverview({
      cards: [card("missing", "missing"), card("stale", "ready"), card("ready", "ready")],
      readOnlyHealthByCardId: {
        stale: {
          tone: "warning",
          title: "운영 최신 기준",
          description: "저장된 기준이 오래됐습니다.",
          statusLabel: "주의",
          checkedAt: null,
          details: [],
        },
      },
      sources: [
        { id: "source-ready", label: "정상 연결", status: { state: "configured" } },
        { id: "source-missing", label: "미설정 연결", status: { state: "missing" } },
        { id: "source-error", label: "오류 연결", status: { state: "error" } },
      ],
    });

    expect(overview).toMatchObject({
      totalImpactCount: 3,
      readyImpactCount: 2,
      warningCount: 2,
      sourceAttentionCount: 2,
    });
    expect(overview.attentionItems.map((item) => item.id)).toEqual(["stale", "source:source-error", "missing"]);
    expect(overview.attentionItems[0]).toMatchObject({
      reason: "저장된 기준이 오래됐습니다.",
      statusLabel: "최신 기준 확인",
    });
    expect(overview.attentionItems[1]).toMatchObject({
      label: "오류 연결",
      statusLabel: "연결 오류",
    });
  });
});
