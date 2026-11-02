import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportCsvClient, parseAccountsPayload } from "../src/app/planning/v3/import/_components/ImportCsvClient";
import { CsvBatchUploadClient } from "../src/app/planning/v3/import/csv/_components/CsvBatchUploadClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("planning v3 csv upload page", () => {
  it("renders upload controls and entry links with required test ids", () => {
    const html = renderToStaticMarkup(<CsvBatchUploadClient />);
    expect(html).toContain('data-testid="v3-csv-upload-page"');
    expect(html).toContain('data-testid="v3-csv-file-input"');
    expect(html).toContain('data-testid="v3-csv-upload-submit"');
    expect(html).toContain('href="/planning/v3/batches"');
    expect(html).toContain("Batch Center");
    expect(html).toContain('href="/planning/v3/profile/drafts"');
    expect(html).toContain("Draft 목록");
  });

  it("renders import entry CTA and empty-help surface", () => {
    const html = renderToStaticMarkup(<ImportCsvClient />);
    expect(html).toContain('data-testid="v3-csv-import-submit"');
    expect(html).toContain("CSV 배치로 저장");
    expect(html).toContain('href="/planning/v3/transactions/batches"');
    expect(html).toContain("배치 목록 보기");
    expect(html).toContain('href="/planning/v3/drafts"');
    expect(html).toContain("초안 목록");
    expect(html).toContain("추천 매핑");
    expect(html).toContain("헤더를 읽으면 추천 매핑이 표시됩니다.");
    expect(html).toContain("실패 요약이 없습니다.");
  });

  it("keeps every stored account kind from the accounts API response", () => {
    const kinds = ["checking", "saving", "card", "cash", "other", "bank", "broker"];
    const parsed = parseAccountsPayload({
      ok: true,
      items: kinds.map((kind) => ({ id: `acc_${kind}`, name: `합성 ${kind}`, kind, currency: "KRW" })),
    });

    expect(parsed.map((account) => account.kind)).toEqual(kinds);
  });

  it("drops malformed accounts and failed response shapes", () => {
    const parsed = parseAccountsPayload({
      ok: true,
      items: [
        { id: "acc_bank", name: "합성 bank", kind: "bank", currency: "KRW" },
        { id: "acc_unknown", name: "합성 unknown", kind: "unknown-kind", currency: "KRW" },
        { id: "", name: "합성 bank", kind: "bank", currency: "KRW" },
        { id: "acc_blank", name: "   ", kind: "bank", currency: "KRW" },
        "not-an-account",
        null,
      ],
    });

    expect(parsed.map((account) => account.id)).toEqual(["acc_bank"]);
    expect(parseAccountsPayload({ ok: false, items: [] })).toEqual([]);
    expect(parseAccountsPayload({ ok: true, items: "acc_bank" })).toEqual([]);
    expect(parseAccountsPayload(null)).toEqual([]);
  });
});
