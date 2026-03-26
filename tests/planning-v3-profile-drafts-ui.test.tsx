import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileDraftFromBatchClient } from "../src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient";
import { ProfileDraftDetailClient } from "../src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient";
import { ProfileDraftPreflightClient } from "../src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient";
import { ProfileDraftsListClient } from "../src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("planning v3 profile drafts UI", () => {
  it("renders batch entry links toward saved profile drafts flow", () => {
    const html = renderToStaticMarkup(<ProfileDraftFromBatchClient initialBatchId="batch-1" />);

    expect(html).toContain("compat/raw draft preview surface");
    expect(html).toContain("official profile drafts");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("official batch entry");
    expect(html).toContain('href="/planning/v3/transactions/batches"');
    expect(html).toContain("Support / Internal");
    expect(html).toContain("compat draft 생성 화면");
    expect(html).toContain('href="/planning/v3/drafts/profile"');
    expect(html).toContain("planning 실행을 저장한 뒤 확인하는 도착점입니다.");
  });

  it("renders drafts list with row and delete action", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftsListClient
        disableAutoLoad
        initialRows={[
          {
            draftId: "d_1",
            id: "d_1",
            batchId: "b_1",
            createdAt: "2026-03-03T00:00:00.000Z",
            stats: { months: 3, unassignedCount: 0 },
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-drafts-list"');
    expect(html).toContain('data-testid="v3-draft-row-d_1"');
    expect(html).toContain("삭제");
  });

  it("renders drafts list empty/help links before any saved profile draft exists", () => {
    const html = renderToStaticMarkup(<ProfileDraftsListClient disableAutoLoad initialRows={[]} />);

    expect(html).toContain("저장된 profile draft가 없습니다.");
    expect(html).toContain("stable planning handoff 직전 검토 축");
    expect(html).toContain('href="/planning/v3/balances"');
    expect(html).toContain("balances 다시 확인");
    expect(html).toContain("Support / Internal");
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain("raw CSV Import");
    expect(html).toContain('href="/planning/v3/batches"');
    expect(html).toContain("raw 배치 센터");
  });

  it("renders loading guidance before drafts list fetch resolves", () => {
    const html = renderToStaticMarkup(<ProfileDraftsListClient initialRows={[]} />);

    expect(html).toContain("목록을 불러오는 중...");
    expect(html).not.toContain("저장된 profile draft가 없습니다.");
    expect(html).not.toContain("초안 목록을 확인하지 못했습니다. 새로고침으로 다시 시도해 주세요.");
  });

  it("renders drafts list load failure guidance without empty copy", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftsListClient
        disableAutoLoad
        initialLoadFailed
        initialRows={[]}
      />,
    );

    expect(html).toContain('data-testid="v3-profile-drafts-load-failure"');
    expect(html).toContain("초안 목록을 확인하지 못했습니다. 새로고침으로 다시 시도해 주세요.");
    expect(html).not.toContain("저장된 profile draft가 없습니다.");
  });

  it("renders load failure guidance without empty copy when drafts list fetch fails", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftsListClient
        disableAutoLoad
        initialRows={[]}
        initialLoadFailed
      />,
    );

    expect(html).toContain("초안 목록을 확인하지 못했습니다. 새로고침으로 다시 시도해 주세요.");
    expect(html).not.toContain("저장된 profile draft가 없습니다.");
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain('href="/planning/v3/batches"');
  });

  it("renders standalone preflight page guidance before execution", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftPreflightClient id="d_1" initialProfileId="profile-base" />,
    );

    expect(html).toContain("apply 직전 영향 범위 확인 surface");
    expect(html).toContain("프리플라이트 실행");
    expect(html).toContain("URL 반영");
    expect(html).toContain('data-testid="v3-preflight-errors"');
    expect(html).toContain("프리플라이트를 실행하면 오류와 경고가 이 영역에 정리됩니다.");
    expect(html).toContain('href="/planning/v3/profile/drafts/d_1/preflight?profileId=profile-base"');
    expect(html).toContain('href="/planning/reports"');
    expect(html).toContain("stable report 확인");
    expect(html).toContain("stable report 확인은 planning에서 실행을 저장한 뒤 이어지는");
    expect(html).toContain("Support / Internal");
    expect(html).toContain('href="/planning/v3/profile/draft"');
  });

  it("renders standalone preflight failure guidance after a failed run", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftPreflightClient
        id="d_1"
        initialProfileId="profile-base"
        initialResult={{
          ok: false,
          targetProfileId: "profile-base",
          changes: [],
          warnings: [],
          errors: [],
          summary: { changedCount: 0, errorCount: 0, warningCount: 0 },
        }}
      />,
    );

    expect(html).toContain('data-testid="v3-preflight-summary"');
    expect(html).toContain("프리플라이트 실행 실패");
    expect(html).toContain("실행이 실패해 요약을 만들지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
    expect(html).toContain("실행이 완료되지 않아 오류와 경고를 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
    expect(html).toContain("실행이 완료되지 않아 변경 항목을 계산하지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
  });

  it("renders preflight not-run guidance before apply on detail page", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftDetailClient
        disableAutoLoad
        id="d_1"
        initialDraft={{
          id: "d_1",
          batchId: "b_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 1_500_000,
            monthlyDiscretionaryExpenses: 400_000,
            assumptions: ["assumption"],
            monthsConsidered: 3,
          },
          evidence: {
            monthsUsed: ["2026-01", "2026-02", "2026-03"],
            ymStats: [
              {
                ym: "2026-01",
                incomeKrw: 3_000_000,
                expenseKrw: 1_900_000,
                fixedExpenseKrw: 1_200_000,
                variableExpenseKrw: 700_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
            ],
            byCategoryStats: [{ categoryId: "housing", totalKrw: 1_200_000 }],
            medians: {
              incomeKrw: 3_000_000,
              expenseKrw: 1_900_000,
              fixedExpenseKrw: 1_200_000,
              variableExpenseKrw: 700_000,
              debtExpenseKrw: 0,
            },
            ruleCoverage: { total: 1, override: 0, rule: 1, default: 0, transfer: 0 },
          },
          assumptions: ["assumption"],
          stats: {
            months: 3,
            transfersExcluded: true,
            unassignedCount: 0,
          },
        }}
        initialProfiles={[
          { profileId: "p_1", name: "default", updatedAt: "2026-03-03T00:00:00.000Z" },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-draft-apply-guidance"');
    expect(html).toContain("stable planning handoff 직전의 개별 초안 검토 surface");
    expect(html).toContain('href="/planning/v3/profile/drafts/d_1/preflight"');
    expect(html).toContain("preflight 확인");
    expect(html).toContain('href="/planning/reports"');
    expect(html).toContain("stable report 확인");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("초안 목록");
    expect(html).toContain("Support / Internal");
    expect(html).toContain('href="/planning/v3/profile/draft"');
    expect(html).toContain("compat raw draft preview");
    expect(html).toContain('href="/planning/v3/batches"');
    expect(html).toContain("raw 배치 센터");
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain("raw CSV Import");
    expect(html).toContain("stable report는 v3 공식 entry가 아니라 preflight/apply 뒤 planning 실행 저장 다음 확인하는 도착점입니다.");
    expect(html).toContain("다음 단계: 기준 프로필을 고른 뒤 preflight로 영향 범위를 확인하고, apply 뒤 planning에서 실행을 저장하면 stable report 도착점으로 이어집니다.");
    expect(html).toContain("프리플라이트를 먼저 실행하면 이 기준으로 적용 가능 여부가 정리됩니다.");
    expect(html).toContain("프리플라이트를 실행하면 적용을 막는 오류가 이 영역에 정리됩니다.");
    expect(html).toContain("프리플라이트를 실행하면 검토가 필요한 경고가 이 영역에 정리됩니다.");
    expect(html).toContain("프리플라이트를 실행하면 적용 시 바뀌는 항목이 이 영역에 정리됩니다.");
  });

  it("renders embedded preflight controls and result blocks on detail page", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftDetailClient
        disableAutoLoad
        id="d_1"
        initialDraft={{
          id: "d_1",
          batchId: "b_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 1_500_000,
            monthlyDiscretionaryExpenses: 400_000,
            assumptions: ["assumption"],
            monthsConsidered: 3,
          },
          evidence: {
            monthsUsed: ["2026-01", "2026-02", "2026-03"],
            ymStats: [
              {
                ym: "2026-01",
                incomeKrw: 3_000_000,
                expenseKrw: 1_900_000,
                fixedExpenseKrw: 1_200_000,
                variableExpenseKrw: 700_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
            ],
            byCategoryStats: [{ categoryId: "housing", totalKrw: 1_200_000 }],
            medians: {
              incomeKrw: 3_000_000,
              expenseKrw: 1_900_000,
              fixedExpenseKrw: 1_200_000,
              variableExpenseKrw: 700_000,
              debtExpenseKrw: 0,
            },
            ruleCoverage: { total: 1, override: 0, rule: 1, default: 0, transfer: 0 },
          },
          assumptions: ["assumption"],
          stats: {
            months: 3,
            transfersExcluded: true,
            unassignedCount: 0,
          },
        }}
        initialPreflight={{
          ok: true,
          changes: [{ path: "/monthlyIncomeNet", kind: "set", before: 2_000_000, after: 3_000_000 }],
          warnings: [{ code: "W_SAMPLE", message: "warning" }],
          errors: [{ path: "/goals", message: "sample error" }],
          summary: { changedCount: 1, errorCount: 1, warningCount: 1 },
        }}
        initialProfiles={[
          { profileId: "p_1", name: "default", updatedAt: "2026-03-03T00:00:00.000Z" },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-draft-meta"');
    expect(html).toContain('data-testid="v3-draft-base-profile-picker"');
    expect(html).toContain('data-testid="v3-draft-run-preflight"');
    expect(html).toContain('data-testid="v3-draft-apply-profile"');
    expect(html).toContain("오류가 있어 아직 적용할 수 없습니다.");
    expect(html).toContain('data-testid="v3-preflight-summary"');
    expect(html).toContain('data-testid="v3-preflight-errors"');
    expect(html).toContain('data-testid="v3-preflight-warnings"');
    expect(html).toContain('data-testid="v3-preflight-changes"');
  });

  it("renders detail failure guidance after a failed preflight run", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftDetailClient
        disableAutoLoad
        id="d_1"
        initialDraft={{
          id: "d_1",
          batchId: "b_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 1_500_000,
            monthlyDiscretionaryExpenses: 400_000,
            assumptions: ["assumption"],
            monthsConsidered: 3,
          },
          evidence: {
            monthsUsed: ["2026-01", "2026-02", "2026-03"],
            ymStats: [
              {
                ym: "2026-01",
                incomeKrw: 3_000_000,
                expenseKrw: 1_900_000,
                fixedExpenseKrw: 1_200_000,
                variableExpenseKrw: 700_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
            ],
            byCategoryStats: [{ categoryId: "housing", totalKrw: 1_200_000 }],
            medians: {
              incomeKrw: 3_000_000,
              expenseKrw: 1_900_000,
              fixedExpenseKrw: 1_200_000,
              variableExpenseKrw: 700_000,
              debtExpenseKrw: 0,
            },
            ruleCoverage: { total: 1, override: 0, rule: 1, default: 0, transfer: 0 },
          },
          assumptions: ["assumption"],
          stats: {
            months: 3,
            transfersExcluded: true,
            unassignedCount: 0,
          },
        }}
        initialPreflight={{
          ok: false,
          changes: [],
          warnings: [],
          errors: [],
          summary: { changedCount: 0, errorCount: 0, warningCount: 0 },
        }}
        initialProfiles={[
          { profileId: "p_1", name: "default", updatedAt: "2026-03-03T00:00:00.000Z" },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-draft-apply-guidance"');
    expect(html).toContain("프리플라이트 실행이 실패했습니다. 같은 기준으로 다시 실행해 주세요.");
    expect(html).toContain("실행이 실패해 요약을 만들지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
    expect(html).toContain("실행이 완료되지 않아 오류 목록을 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
    expect(html).toContain("실행이 완료되지 않아 경고 목록을 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
    expect(html).toContain("실행이 완료되지 않아 변경 항목을 계산하지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요.");
  });
});
