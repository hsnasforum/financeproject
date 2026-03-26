import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BalancesClient } from "../src/app/planning/v3/balances/_components/BalancesClient";
import { TransactionBatchDetailClient } from "../src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("planning v3 import follow-through UI", () => {
  it("renders batch detail handoff copy with official funnel and support tiers split", () => {
    const html = renderToStaticMarkup(<TransactionBatchDetailClient id="batch_1" />);

    expect(html).toContain("deep-link only 배치 상세/보정 surface");
    expect(html).toContain('href="/planning/v3/balances"');
    expect(html).toContain("balances 확인");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("profile drafts 검토");
    expect(html).toContain("Support / Internal");
    expect(html).toContain('href="/planning/v3/accounts"');
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain("raw CSV Import");
    expect(html).toContain('href="/planning/reports"');
    expect(html).toContain("stable report는 이 화면의 직접 entry가 아닙니다.");
  });

  it("renders balances hero copy as projection step before drafts review", () => {
    const html = renderToStaticMarkup(<BalancesClient />);

    expect(html).toContain("이 화면은 import 결과 projection 확인 축입니다.");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("profile drafts 확인");
    expect(html).toContain("다음 단계: profile drafts 검토");
    expect(html).toContain('href="/planning/v3/accounts"');
    expect(html).toContain("Support: 계좌 관리");
  });
});
