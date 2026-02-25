import { describe, expect, it } from "vitest";
import { pickHighlights } from "../src/lib/finlife/highlights";

describe("finlife highlights user audience", () => {
  it("hides code keys and keeps human-readable keys", () => {
    const rows = pickHighlights(
      {
        intr_rate_type: "S",
        intr_rate_type_nm: "단리",
        save_trm: "12",
        intr_rate: "2.95",
        fin_prdt_cd: "P001",
      },
      undefined,
      { audience: "user", limit: 8 },
    );

    const labels = rows.map((row) => row.label);
    const values = rows.map((row) => row.value);
    expect(labels).toContain("이자 방식");
    expect(values).toContain("단리");
    expect(values).toContain("12개월");
    expect(values).toContain("2.95%");
    expect(labels.some((label) => /intr_rate_type|fin_prdt_cd/i.test(label))).toBe(false);
  });
});
