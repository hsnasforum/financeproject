import { describe, expect, it } from "vitest";
import { classifyExpense } from "../src/lib/planning/v3/service/classifyExpense";

describe("planning v3 classifyExpense", () => {
  it("classifies fixed keywords from ko/en", () => {
    expect(classifyExpense("월세 자동이체")).toBe("fixed");
    expect(classifyExpense("loan interest payment")).toBe("fixed");
  });

  it("classifies variable hints and unknown", () => {
    expect(classifyExpense("주말 grocery")).toBe("variable");
    expect(classifyExpense("  ")).toBe("unknown");
    expect(classifyExpense("기타지출")).toBe("unknown");
  });
});
