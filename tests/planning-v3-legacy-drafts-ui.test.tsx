import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftDetailClient } from "../src/app/planning/v3/drafts/[id]/_components/DraftDetailClient";
import { DraftsListClient } from "../src/app/planning/v3/drafts/_components/DraftsListClient";
import { ProfileDraftClient } from "../src/app/planning/v3/drafts/profile/_components/ProfileDraftClient";

describe("planning v3 legacy drafts UI", () => {
  it("renders drafts list row, profile draft CTA, and delete confirmation surface", () => {
    const html = renderToStaticMarkup(
      <DraftsListClient
        disableAutoLoad
        initialDeleteTargetId="draft-1"
        initialRows={[
          {
            id: "draft-1",
            createdAt: "2026-03-03T00:00:00.000Z",
            source: {
              kind: "csv",
              months: 3,
              rows: 12,
            },
            summary: {
              medianIncomeKrw: 3_000_000,
              medianExpenseKrw: 2_000_000,
              avgNetKrw: 1_000_000,
            },
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-drafts-list"');
    expect(html).toContain('data-testid="v3-draft-row-draft-1"');
    expect(html).toContain('href="/planning/v3/drafts/profile"');
    expect(html).toContain("Profile 초안 생성");
    expect(html).toContain('href="/planning/v3/drafts/draft-1"');
    expect(html).toContain("상세");
    expect(html).toContain('data-testid="v3-draft-delete-dialog"');
    expect(html).toContain("초안 삭제 확인");
    expect(html).toContain("삭제 후 복구할 수 없습니다.");
  });

  it("renders draft detail back link and merged preview surface", () => {
    const html = renderToStaticMarkup(
      <DraftDetailClient
        disableAutoLoad
        id="draft-1"
        initialDraft={{
          id: "draft-1",
          createdAt: "2026-03-03T00:00:00.000Z",
          source: {
            kind: "csv",
            filename: "sample.csv",
            rows: 12,
            months: 3,
          },
          summary: {
            medianIncomeKrw: 3_000_000,
            medianExpenseKrw: 2_000_000,
            avgNetKrw: 1_000_000,
          },
          cashflow: [
            {
              ym: "2026-01",
              incomeKrw: 3_000_000,
              expenseKrw: 2_000_000,
              netKrw: 1_000_000,
              txCount: 4,
            },
          ],
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 1_500_000,
            monthlyDiscretionaryExpenses: 500_000,
          },
        }}
        initialProfiles={[
          {
            profileId: "profile-1",
            name: "기본 프로필",
            isDefault: true,
          },
        ]}
      />,
    );

    expect(html).toContain('href="/planning/v3/drafts"');
    expect(html).toContain("목록으로 돌아가기");
    expect(html).toContain('data-testid="v3-draft-summary"');
    expect(html).toContain("Merged Profile 미리보기");
    expect(html).toContain("기준 프로필을 선택해 이번 초안이 실제 프로필에 어떻게 반영되는지 먼저 확인할 수 있습니다.");
    expect(html).toContain("기준 프로필(선택)");
    expect(html).toContain("기본 템플릿");
    expect(html).toContain("적용 결과 미리보기");
    expect(html).toContain("Export merged profile JSON");
    expect(html).toContain('data-testid="v3-draft-diff"');
    expect(html).toContain("미리보기를 실행하면 변경 요약이 표시됩니다.");
  });

  it("renders legacy drafts empty-state guidance before any saved draft exists", () => {
    const html = renderToStaticMarkup(<DraftsListClient disableAutoLoad initialRows={[]} />);

    expect(html).toContain("저장된 초안이 없습니다.");
    expect(html).toContain('href="/planning/v3/drafts/profile"');
    expect(html).toContain("Profile 초안 생성");
  });

  it("renders profile draft entry CTAs toward canonical batch and draft routes", () => {
    const html = renderToStaticMarkup(<ProfileDraftClient />);

    expect(html).toContain('data-testid="v3-profile-draft-generate"');
    expect(html).toContain("이 초안은 자동 저장되지 않습니다.");
    expect(html).toContain('href="/planning/v3/transactions/batches"');
    expect(html).toContain("배치 목록");
    expect(html).toContain('href="/planning/v3/drafts"');
    expect(html).toContain("저장된 Draft 목록");
  });
});
