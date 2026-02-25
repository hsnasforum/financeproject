import { describe, expect, it } from "vitest";
import { extractPagingMeta } from "../src/lib/finlife/meta";

describe("finlife meta extraction", () => {
  it("extracts total_count and page numbers from raw.result", () => {
    const meta = extractPagingMeta({
      result: {
        total_count: "123",
        now_page_no: "2",
        max_page_no: "7",
      },
      err_cd: "000",
      err_msg: "OK",
    });

    expect(meta.totalCount).toBe(123);
    expect(meta.nowPage).toBe(2);
    expect(meta.maxPage).toBe(7);
    expect(meta.errCd).toBe("000");
    expect(meta.errMsg).toBe("OK");
  });
});
