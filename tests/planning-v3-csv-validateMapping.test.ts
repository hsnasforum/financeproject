import { describe, expect, it } from "vitest";
import { validateCsvMapping } from "../src/lib/planning/v3/providers/csv/validateMapping";

describe("validateCsvMapping", () => {
  it("returns errors for missing required fields and duplicate conflicts", () => {
    const result = validateCsvMapping(
      {
        dateKey: "",
        amountKey: "거래금액",
        descKey: "거래금액",
      },
      {
        headers: ["거래일자", "거래금액", "적요"],
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "dateKey",
      }),
      expect.objectContaining({
        field: "conflict",
      }),
    ]));
  });
});
