import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayQueue } from "../../../src/components/home/TodayQueue";
import { HomePortalClient } from "../../../src/components/HomePortalClient";

describe("home quick rules status", () => {
  it("renders quick rules status on today action summary", () => {
    const html = renderToStaticMarkup(
      <TodayQueue
        actionSummary={{
          badge: "LIVE",
          title: "이번 달 액션",
          summary: "먼저 줄일 항목을 확인합니다.",
          basis: "최신 실행 기준",
          href: "/planning/reports?runId=run-1",
          quickRuleLabel: "고정의무 압박",
          quickRuleDetail: "월 실수령 대비 고정지출 비중이 커서 먼저 줄일 항목을 확인하는 편이 안전합니다.",
          metrics: [
            { label: "월 잉여금", value: "70만", hint: "고정의무 압박 · 현재 저장된 플랜 기준으로 남는 돈입니다." },
            { label: "비상금 버팀력", value: "2.5개월", hint: "현재 현금 여력으로 버틸 수 있는 기간입니다." },
            { label: "경고 신호", value: "1건", hint: "목표 진행 1개 · 먼저 확인할 신호를 묶었습니다." },
          ],
        }}
      />,
    );

    expect(html).toContain("quick rules · 고정의무 압박");
    expect(html).toContain("상태 읽기:");
  });

  it("renders quick rules status on home featured action card", () => {
    const html = renderToStaticMarkup(
      <HomePortalClient
        featuredAction={{
          badge: "LIVE",
          title: "이번 달 액션",
          summary: "액션부터 이어서 봅니다.",
          href: "/planning/reports?runId=run-1",
          basis: "최신 실행 기준",
          quickRuleLabel: "배분 가능",
          quickRuleDetail: "고정지출을 뺀 뒤 남는 돈이 있어 비상금, 목표, 여유예산을 나눠 보는 출발점으로 쓸 수 있습니다.",
        }}
        recentRuns={[
          {
            id: "run-1",
            profileId: "profile-1",
            title: "최근 플랜",
            createdAt: "2026-03-13T00:00:00.000Z",
            horizonMonths: 24,
            policyId: "balanced",
            overallStatus: "SUCCESS",
          },
        ]}
      />,
    );

    expect(html).toContain("빠른 점검 · 배분 가능");
    expect(html).toContain("상태 읽기:");
  });
});
