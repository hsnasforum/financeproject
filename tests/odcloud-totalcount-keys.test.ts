import { describe, expect, it } from "vitest";
import { extractOdcloudRows } from "../src/lib/publicApis/odcloudScan";

describe("odcloud totalCount key variants", () => {
  it("reads totalCnt from response root", () => {
    const result = extractOdcloudRows({
      totalCnt: 1234,
      pageNo: 1,
      numOfRows: 50,
      data: [{ id: "a" }],
    });
    expect("rows" in result).toBe(true);
    if (!("rows" in result)) return;
    expect(result.meta.totalCount).toBe(1234);
    expect(result.meta.totalCountKey).toBe("totalCnt");
    expect(result.meta.page).toBe(1);
    expect(result.meta.perPage).toBe(50);
  });

  it("reads matchCount from nested data object", () => {
    const result = extractOdcloudRows({
      data: {
        matchCount: "987",
        page_no: "2",
        rows: "100",
      },
      rows: [{ id: "b" }],
    });
    expect("rows" in result).toBe(true);
    if (!("rows" in result)) return;
    expect(result.meta.totalCount).toBe(987);
    expect(result.meta.totalCountKey).toBe("matchCount");
    expect(result.meta.page).toBe(2);
    expect(result.meta.perPage).toBe(100);
  });
});

