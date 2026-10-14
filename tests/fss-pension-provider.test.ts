import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FSS_PENSION_GUARANTEED_AREAS,
  FSS_PENSION_PRODUCT_AREAS,
  classifyFssPensionResult,
  listRecentCompletedQuarters,
  normalizeFssPensionGuaranteedRows,
  normalizeFssPensionProductRows,
} from "../src/lib/publicApis/providers/fssPension.mjs";

// Excerpts of real 통합연금포털 responses captured on 2026-10-15 (public disclosure data).
function fixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "fss_pension", name), "utf8"));
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

const area = (code: number) => FSS_PENSION_PRODUCT_AREAS.find((entry) => entry.code === code)!;
const guaranteedArea = (code: number) => FSS_PENSION_GUARANTEED_AREAS.find((entry) => entry.code === code)!;

describe("FSS pension result codes", () => {
  it("separates success, unpublished data and failures", () => {
    expect(classifyFssPensionResult(fixture("psProdList2_2026q2_area1.json")).status).toBe("ok");
    expect(classifyFssPensionResult(fixture("psProdList2_2026q3_not_published.json"))).toEqual({
      code: "001",
      status: "no_data",
      message: "조회 결과가 없습니다.",
    });
    expect(classifyFssPensionResult({ code: "101", message: "limit" }).status).toBe("daily_limit");
    expect(classifyFssPensionResult({ code: "600" }).status).toBe("approval_required");
    expect(classifyFssPensionResult(null).status).toBe("unknown");
  });
});

describe("FSS pension product rows (psProdList2)", () => {
  it("keeps published values, converts launch dates and counts rows without product information", () => {
    const result = normalizeFssPensionProductRows(fixture("psProdList2_2026q2_area3.json"), area(3));

    expect(result.sourceRows).toBe(4);
    expect(result.excludedRowsWithoutProductInfo).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ areaCode: 3, area: "자산운용", sells: expect.stringMatching(/^[YN]$/) });
    expect(result.items[0].launchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A published negative fee rate stays as published instead of being clamped or dropped.
    expect(result.items[1].avgFeeRate).toBeLessThan(0);
    // Missing yields are null, never zero.
    expect(result.items[1].earnRate5).toBeNull();
  });

  it("accepts every captured area", () => {
    for (const code of [1, 3, 4, 5]) {
      const result = normalizeFssPensionProductRows(fixture(`psProdList2_2026q2_area${code}.json`), area(code));
      expect(result.items.length).toBeGreaterThan(0);
      expect(new Set(result.items.map((item: { area: string }) => item.area))).toEqual(new Set([area(code).label]));
    }
  });

  it("fails closed on result errors and contract breaks", () => {
    expect(thrownBy(() => normalizeFssPensionProductRows(fixture("psProdList2_2026q3_not_published.json"), area(4))))
      .toMatchObject({ code: "NO_DATA" });
    expect(thrownBy(() => normalizeFssPensionProductRows({ code: "101", message: "limit" }, area(4))))
      .toMatchObject({ code: "RATE_LIMIT" });
    expect(thrownBy(() => normalizeFssPensionProductRows({ code: "100", message: "key" }, area(4))))
      .toMatchObject({ code: "AUTH" });

    const life = fixture("psProdList2_2026q2_area4.json");
    expect(thrownBy(() => normalizeFssPensionProductRows(life, area(5)))).toMatchObject({ code: "CONTRACT" });
    expect(() => normalizeFssPensionProductRows({ ...life, count: life.count + 1 }, area(4)))
      .toThrow(/count/);
    const badSells = structuredClone(life);
    badSells.list[0].sells = "maybe";
    expect(() => normalizeFssPensionProductRows(badSells, area(4))).toThrow(/sells/);
    const badDate = structuredClone(life);
    badDate.list[0].launchDate = "2026/02/30";
    expect(() => normalizeFssPensionProductRows(badDate, area(4))).toThrow(/calendar date/);
    const badRate = structuredClone(life);
    badRate.list[0].avgFeeRate = "4.5";
    expect(() => normalizeFssPensionProductRows(badRate, area(4))).toThrow(/avgFeeRate/);
  });
});

describe("FSS pension guaranteed rows (psGuaranteedProdList)", () => {
  it("keeps free-text guarantees, records the report month and removes only exact duplicates", () => {
    const result = normalizeFssPensionGuaranteedRows(fixture("psGuaranteedProdList_area5.json"), guaranteedArea(5));

    expect(result.reportMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(result.sourceRows).toBe(3);
    expect(result.exactDuplicateRowsRemoved).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items.some((item: { guaranteedInterestRate: string | null }) => item.guaranteedInterestRate === null)).toBe(true);

    const life = normalizeFssPensionGuaranteedRows(fixture("psGuaranteedProdList_area4.json"), guaranteedArea(4));
    expect(life.items[0].guaranteedInterestRate).toEqual(expect.stringContaining("%"));
    expect(typeof life.items[0].publishedInterestRate).toBe("number");
  });

  it("fails closed on mixed months and missing published rates", () => {
    const mixed = fixture("psGuaranteedProdList_area4.json");
    mixed.list[1].reportDate = "2026/08";
    expect(() => normalizeFssPensionGuaranteedRows(mixed, guaranteedArea(4))).toThrow(/different report months/);

    const missingRate = fixture("psGuaranteedProdList_area4.json");
    delete missingRate.list[0].publishedInterestRate;
    expect(() => normalizeFssPensionGuaranteedRows(missingRate, guaranteedArea(4))).toThrow(/publishedInterestRate/);
  });
});

describe("recent completed quarters (KST)", () => {
  it("starts from the quarter before the current KST quarter", () => {
    expect(listRecentCompletedQuarters(new Date("2026-10-14T16:00:00Z"))).toEqual([
      { year: 2026, quarter: 3 },
      { year: 2026, quarter: 2 },
      { year: 2026, quarter: 1 },
    ]);
    // 2026-01-01 00:30 KST is already in the new year even though UTC is still 2025-12-31.
    expect(listRecentCompletedQuarters(new Date("2025-12-31T15:30:00Z"), 2)).toEqual([
      { year: 2025, quarter: 4 },
      { year: 2025, quarter: 3 },
    ]);
    // 2026-03-31 23:59 KST still belongs to Q1, so Q4 2025 is the latest completed quarter.
    expect(listRecentCompletedQuarters(new Date("2026-03-31T14:59:00Z"), 1)).toEqual([{ year: 2025, quarter: 4 }]);
  });
});
