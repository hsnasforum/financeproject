import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseAccountsPayload,
  TransactionsBatchListClient,
} from "../src/app/planning/v3/transactions/_components/TransactionsBatchListClient";
import { TransactionBatchDetailDraftReviewSection } from "../src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections";
import {
  isAccount,
  isDraftCreateResponse,
} from "../src/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

const STORED_ACCOUNT_KINDS = ["checking", "saving", "card", "cash", "other", "bank", "broker"];

function storedAccount(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `acc_${kind}`,
    name: `합성 ${kind}`,
    kind,
    currency: "KRW",
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function uploadSelectTag(html: string): string {
  const tag = html.match(/<select[^>]*data-testid="v3-upload-account-select"[^>]*>/)?.[0];
  if (!tag) throw new Error("upload account select not rendered");
  return tag;
}

function renderDraftReview(hasBatchAccount: boolean): string {
  return renderToStaticMarkup(
    <TransactionBatchDetailDraftReviewSection
      draftReview={{
        hasBatchAccount,
        draftSaving: false,
        draftMessage: "",
        onCreateDraftAndGoToReview: async () => undefined,
      }}
    />,
  );
}

function draftReviewButtonTag(html: string): string {
  const tag = html.match(/<button[^>]*data-testid="v3-go-draft-review"[^>]*>/)?.[0];
  if (!tag) throw new Error("draft review button not rendered");
  return tag;
}

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
    expect(html).toMatch(/<a [^>]*href="\/planning\/v3\/categories\/rules"[^>]*>분류 규칙\(베타\)<\/a>/);
    expect(html).toContain('href="/planning/v3/batches"');
    expect(html).toContain("Batch Center");
    expect(html).toContain('href="/planning/v3/import/csv"');
    expect(html).toContain("raw CSV Import");
    expect(html).toContain("저장된 배치가 없습니다.");
  });

  it("keeps every stored account kind from the accounts API response", () => {
    const parsed = parseAccountsPayload({
      ok: true,
      items: STORED_ACCOUNT_KINDS.map((kind) => storedAccount(kind)),
      meta: { userId: "synthetic" },
    });

    expect(parsed.map((account) => account.kind)).toEqual(STORED_ACCOUNT_KINDS);
  });

  it("drops malformed accounts and failed response shapes", () => {
    const parsed = parseAccountsPayload({
      ok: true,
      items: [
        storedAccount("bank"),
        storedAccount("unknown-kind"),
        storedAccount("bank", { id: "" }),
        storedAccount("bank", { name: "   " }),
        storedAccount("bank", { kind: undefined }),
        "not-an-account",
        null,
      ],
    });

    expect(parsed.map((account) => account.id)).toEqual(["acc_bank"]);
    expect(parseAccountsPayload({ ok: false, items: [storedAccount("bank")] })).toEqual([]);
    expect(parseAccountsPayload({ ok: true, items: "acc_bank" })).toEqual([]);
    expect(parseAccountsPayload(null)).toEqual([]);
  });

  it.each(["bank", "broker"])("lets the upload select a stored %s account from the API response", (kind) => {
    const initialAccounts = parseAccountsPayload({ ok: true, items: [storedAccount(kind)] });
    const html = renderToStaticMarkup(
      <TransactionsBatchListClient disableAutoLoad initialAccounts={initialAccounts} initialRows={[]} />,
    );

    expect(uploadSelectTag(html)).not.toMatch(/\sdisabled=""/);
    const option = html.match(new RegExp(`<option[^>]*value="acc_${kind}"[^>]*>`))?.[0];
    expect(option).toContain('selected=""');
  });

  it("keeps the upload select disabled when the response has no usable account", () => {
    const initialAccounts = parseAccountsPayload({ ok: true, items: [storedAccount("unknown-kind")] });
    const html = renderToStaticMarkup(
      <TransactionsBatchListClient disableAutoLoad initialAccounts={initialAccounts} initialRows={[]} />,
    );

    expect(uploadSelectTag(html)).toMatch(/\sdisabled=""/);
  });

  it("accepts the same account kinds on the batch detail screen", () => {
    const items: unknown[] = [
      ...STORED_ACCOUNT_KINDS.map((kind) => storedAccount(kind)),
      storedAccount("unknown-kind"),
      storedAccount("bank", { id: "" }),
      storedAccount("bank", { name: "" }),
      null,
    ];

    expect(items.filter(isAccount).map((account) => account.kind)).toEqual(STORED_ACCOUNT_KINDS);
  });

  it("explains the profile draft basis and only requires a batch account", () => {
    const html = renderDraftReview(true);

    expect(draftReviewButtonTag(html)).not.toMatch(/\sdisabled=""/);
    expect(html).toContain('data-testid="v3-draft-review-basis"');
    expect(html).toContain("저장된 분류 규칙과 거래별 보정으로 최근 6개월을 다시 집계");
    expect(html).toContain("이체·비율·분할 옵션과 초안 패치 요약은 이 초안에 적용되지 않습니다.");
    expect(draftReviewButtonTag(renderDraftReview(false))).toMatch(/\sdisabled=""/);
  });

  it("reads the profile draft create response shape", () => {
    expect(isDraftCreateResponse({ ok: true, data: { id: "draft-1" } })).toBe(true);
    expect(isDraftCreateResponse({ ok: true, id: "draft-1" })).toBe(false);
    expect(isDraftCreateResponse({ ok: true, data: {} })).toBe(false);
    expect(isDraftCreateResponse({ ok: false, data: { id: "draft-1" } })).toBe(false);
  });
});
