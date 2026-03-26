import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionsBatchListClient } from "../src/app/planning/v3/transactions/_components/TransactionsBatchListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("planning v3 transactions batches entry UI", () => {
  it("renders official beta entry copy and primary handoff links", () => {
    const html = renderToStaticMarkup(
      <TransactionsBatchListClient
        disableAutoLoad
        initialAccounts={[
          {
            id: "acc_main",
            name: "생활비 통장",
            kind: "checking",
            currency: "KRW",
          },
        ]}
        initialRows={[
          {
            id: "batch_1",
            createdAt: "2026-03-26T00:00:00.000Z",
            kind: "csv",
            fileName: "sample.csv",
            total: 12,
            ok: 11,
            failed: 1,
          },
        ]}
      />,
    );

    expect(html).toContain("Import-to-Planning Beta");
    expect(html).toContain("거래내역 가져오기 시작");
    expect(html).toContain('href="#transactions-upload"');
    expect(html).toContain("CSV 업로드");
    expect(html).toContain("최근 배치 확인");
    expect(html).toContain('href="/planning/v3/balances"');
    expect(html).toContain("balances 확인");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("profile drafts 확인");
    expect(html).toContain('data-testid="v3-upload-input"');
    expect(html).toContain('data-testid="v3-upload-submit"');
    expect(html).toContain('data-testid="v3-batch-list"');
    expect(html).toContain('href="/planning/reports"');
    expect(html).toContain("stable report는 직접 entry가 아니라 handoff 도착점입니다.");
  });

  it("keeps support and internal links visually secondary", () => {
    const html = renderToStaticMarkup(
      <TransactionsBatchListClient disableAutoLoad initialRows={[]} />,
    );

    expect(html).toContain("Support / Internal");
    expect(html).toContain('href="/planning/v3/accounts"');
    expect(html).toContain("계좌 관리");
    expect(html).toContain('href="/planning/v3/batches"');
    expect(html).toContain("Batch Center");
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain("raw CSV Import");
    expect(html).toContain("저장된 배치가 없습니다.");
  });
});
