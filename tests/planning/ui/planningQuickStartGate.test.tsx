import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlanningQuickStartGate, {
  resolvePlanningQuickStartAppliedNextStepSummary,
} from "../../../src/components/planning/PlanningQuickStartGate";

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
    expect(html).not.toContain("첫 실행·기록 저장");
  });

  it("moves a completed run directly to the stored report step", () => {
    const html = renderToStaticMarkup(
      <PlanningQuickStartGate
        nextStepLabel="저장된 리포트 확인"
        onApply={() => undefined}
        profileSyncState="saved"
        runDone
      />,
    );

    expect(html).toContain("첫 실행·기록 저장까지 확인됐습니다");
    expect(html).toContain("저장된 리포트 확인");
    expect(html).not.toContain("결과 저장");
  });

  it("shows first-use draft inputs but folds them after a completed run without removing fields", () => {
    const initial = renderToStaticMarkup(<PlanningQuickStartGate onApply={() => undefined} />);
    const completed = renderToStaticMarkup(<PlanningQuickStartGate onApply={() => undefined} profileSyncState="saved" runDone />);
    const details = (html: string) => html.match(/<details[^>]*data-testid="planning-quickstart-inputs"[^>]*>/)?.[0];
    expect(details(initial)).toMatch(/\sopen(?:[=\s>])/);
    expect(details(completed)).not.toMatch(/\sopen(?:[=\s>])/);
    expect(completed).toContain("월 실수령액(원)");
    expect(completed).toContain("목표까지 남은 개월");
    expect(completed).toContain("저장된 리포트 확인");
  });

  it("uses the warning confirmation CTA as the applied next-step summary", () => {
    expect(resolvePlanningQuickStartAppliedNextStepSummary({
      nextStepLabel: "먼저 실행 경고 확인",
      runDone: false,
      runStatusReviewRequired: false,
      profileSyncState: "saved",
      profileSavedAfterApply: true,
    })).toBe("먼저 실행 경고 확인");
  });
});
