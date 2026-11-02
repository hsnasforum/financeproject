import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { type ComponentProps } from "react";
import { ProfileDraftFromBatchClient } from "../src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient";
import { ProfileDraftDetailClient } from "../src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient";
import { ProfileDraftPreflightClient } from "../src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient";
import { ProfileDraftsListClient } from "../src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

type DetailProps = ComponentProps<typeof ProfileDraftDetailClient>;

const applyDraftFixture: NonNullable<DetailProps["initialDraft"]> = {
  id: "d_apply",
  batchId: "b_apply",
  createdAt: "2026-09-07T00:00:00.000Z",
  draftPatch: {
    monthlyIncomeNet: 5_200_000,
    monthlyEssentialExpenses: 2_100_000,
    monthlyDiscretionaryExpenses: 700_000,
    assumptions: [],
    monthsConsidered: 3,
  },
  evidence: {
    monthsUsed: ["2026-06", "2026-07", "2026-08"],
    ymStats: [],
    byCategoryStats: [],
    medians: { incomeKrw: 5_200_000, expenseKrw: 2_800_000, fixedExpenseKrw: 2_100_000, variableExpenseKrw: 700_000, debtExpenseKrw: 0 },
    ruleCoverage: { total: 0, override: 0, rule: 0, default: 0, transfer: 0 },
  },
  assumptions: [],
};

const updatePreflightFixture: NonNullable<DetailProps["initialPreflight"]> = {
  ok: true,
  targetProfileId: "profile-a",
  profileRevision: "profile-a-revision",
  draftPatchHash: "draft-patch-hash",
  changes: [{ path: "/monthlyIncomeNet", kind: "set", before: 5_000_000, after: 5_200_000 }],
  warnings: [],
  errors: [],
  summary: { changedCount: 1, errorCount: 0, warningCount: 0 },
};

function renderApplyControls(initialPreflight: DetailProps["initialPreflight"], initialProfileId = "") {
  return renderToStaticMarkup(
    <ProfileDraftDetailClient
      disableAutoLoad
      id={applyDraftFixture.id}
      initialDraft={applyDraftFixture}
      initialPreflight={initialPreflight}
      initialProfileId={initialProfileId}
      initialProfiles={[{ profileId: "profile-a" }, { profileId: "profile-b" }]}
    />,
  );
}

function applyButtonTag(html: string, testId: string) {
  const tag = html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0];
  expect(tag).toBeDefined();
  return tag ?? "";
}

describe("planning v3 profile drafts UI", () => {
  it("separates explicit update and create actions and blocks both before preflight", () => {
    const html = renderApplyControls(null, "profile-a");

    expect(html).toContain("선택한 프로필 갱신");
    expect(html).toContain("새 프로필로 만들기");
    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("keeps create available after an after-only preflight while update requires a selection", () => {
    const html = renderApplyControls({
      ...updatePreflightFixture,
      targetProfileId: undefined,
      profileRevision: undefined,
      draftPatchHash: undefined,
    });

    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("기존 프로필을 갱신하려면 기준 프로필을 선택해 주세요.");
  });

  it("enables explicit update with the matching profile generation and keeps the existing warning UX", () => {
    const html = renderApplyControls({
      ...updatePreflightFixture,
      warnings: [{ code: "W_SAMPLE", message: "검토할 경고" }],
      summary: { changedCount: 1, errorCount: 0, warningCount: 1 },
    }, "profile-a");

    expect(applyButtonTag(html, "v3-draft-update-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("경고를 확인한 뒤 적용할 수 있습니다.");
    expect(html).toContain("자산, 부채, 목표와 나머지 설정은 유지됩니다.");
  });

  it("shows observed-debt warnings even when no monthly value changes", () => {
    const html = renderApplyControls({ ...updatePreflightFixture, changes: [],
      warnings: [{ code: "OBSERVED_DEBT_WITHOUT_PROFILE_DEBT", message: "거래에서 부채상환이 관측됐지만 프로필에 부채가 없습니다." }],
      summary: { changedCount: 0, errorCount: 0, warningCount: 1 },
    }, "profile-a");
    expect(html).toContain("거래에서 부채상환이 관측됐지만 프로필에 부채가 없습니다.");
    expect(html).toContain("경고를 확인한 뒤 적용할 수 있습니다.");
    expect(html).not.toContain("오류 없음.");
    expect(applyButtonTag(html, "v3-draft-update-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("blocks both apply modes and explains why an old debt-inclusive draft must be regenerated", () => {
    const message = "초안의 생활지출이 월별 부채상환 제외 금액과 다릅니다. 원래 거래 자료에서 새 초안을 생성한 뒤 다시 확인해 주세요.";
    const html = renderApplyControls({ ...updatePreflightFixture, ok: false,
      errors: [{ path: "/monthlyEssentialExpenses", message }], summary: { changedCount: 1, errorCount: 1, warningCount: 0 },
    }, "profile-a");
    expect(html).toContain(message);
    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it.each([
    { name: "missing profile revision", preflight: { ...updatePreflightFixture, profileRevision: undefined } },
    { name: "missing draft patch hash", preflight: { ...updatePreflightFixture, draftPatchHash: undefined } },
  ])("blocks update with $name while preserving create-copy", ({ preflight }) => {
    const html = renderApplyControls(preflight, "profile-a");

    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("프로필 갱신을 위해 프리플라이트를 다시 실행해 주세요.");
  });

  it("preserves warning guidance for legacy create preflight without enabling update", () => {
    const html = renderApplyControls({
      ...updatePreflightFixture,
      profileRevision: undefined,
      draftPatchHash: undefined,
      warnings: [{ code: "W_SAMPLE", message: "변경 내용을 검토한 뒤 적용해 주세요." }],
      summary: { changedCount: 1, errorCount: 0, warningCount: 1 },
    }, "profile-a");

    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("경고를 확인한 뒤 적용할 수 있습니다.");
  });

  it.each([
    { name: "selection changed", preflight: updatePreflightFixture, selected: "profile-b" },
    { name: "preflight failed", preflight: { ...updatePreflightFixture, ok: false }, selected: "profile-a" },
    { name: "preflight errors", preflight: { ...updatePreflightFixture, errors: [{ path: "/monthlyIncomeNet", message: "invalid" }] }, selected: "profile-a" },
    { name: "preflight error summary", preflight: { ...updatePreflightFixture, summary: { changedCount: 1, errorCount: 1, warningCount: 0 } }, selected: "profile-a" },
  ])("blocks both apply actions when $name", ({ preflight, selected }) => {
    const html = renderApplyControls(preflight, selected);

    expect(applyButtonTag(html, "v3-draft-update-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(applyButtonTag(html, "v3-draft-apply-profile")).toMatch(/\sdisabled(?:=|\s|>)/);
  });

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
