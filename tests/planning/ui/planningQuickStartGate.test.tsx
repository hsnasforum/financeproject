import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlanningQuickStartGate from "../../../src/components/planning/PlanningQuickStartGate";

describe("PlanningQuickStartGate", () => {
  it("renders preview-first CTA by default", () => {
    const html = renderToStaticMarkup(<PlanningQuickStartGate onApply={() => undefined} />);

    expect(html).toContain("초안 미리보기");
    expect(html).not.toContain("이 초안으로 시작");
    expect(html).not.toContain("data-testid=\"planning-quickstart-preview\"");
  });

  it("renders neutral restored guidance when run status cannot be verified", () => {
    const html = renderToStaticMarkup(
      <PlanningQuickStartGate
        nextStepDescription="현재 환경에서는 최근 저장 실행과 현재 프로필의 일치 여부를 자동 확인하지 못했습니다. 아래 실행 내역에서 진행 상태를 다시 확인해 주세요."
        nextStepLabel="진행 상태 다시 확인"
        onApply={() => undefined}
        profileSyncState="saved"
        runStatusReviewRequired
      />,
    );

    expect(html).toContain("data-testid=\"planning-quickstart-restored-state\"");
    expect(html).toContain("최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요.");
    expect(html).toContain("프로필 저장 완료 · 실행 상태 확인 필요");
    expect(html).toContain("진행 상태 다시 확인");
    expect(html).not.toContain("첫 실행 시작");
  });
});
