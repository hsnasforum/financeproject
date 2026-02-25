import { describe, expect, it } from "vitest";
import { MEDIAN_INCOME_2025 } from "../src/lib/gov24/medianIncome2025";

describe("median income 2025", () => {
  it("contains expected table values", () => {
    const b50 = MEDIAN_INCOME_2025.brackets.find((entry) => entry.key === "0_50");
    const b200 = MEDIAN_INCOME_2025.brackets.find((entry) => entry.key === "101_200");
    expect(MEDIAN_INCOME_2025.year).toBe(2025);
    expect(b50?.households[1]).toBe(1_196_007);
    expect(b50?.households[6]).toBe(4_032_403);
    expect(b200?.households[4]).toBe(12_195_546);
  });
});

