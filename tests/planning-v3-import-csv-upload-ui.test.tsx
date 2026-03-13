import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportCsvClient } from "../src/app/planning/v3/import/_components/ImportCsvClient";
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
});
