import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CsvBatchUploadClient } from "../src/app/planning/v3/import/csv/_components/CsvBatchUploadClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("planning v3 csv upload page", () => {
  it("renders upload controls with required test ids", () => {
    const html = renderToStaticMarkup(<CsvBatchUploadClient />);
    expect(html).toContain('data-testid="v3-csv-upload-page"');
    expect(html).toContain('data-testid="v3-csv-file-input"');
    expect(html).toContain('data-testid="v3-csv-upload-submit"');
  });
});
