import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/lib/dart/disclosureClassifier";
import { suggestLabel } from "../src/lib/dart/labelSuggest";

const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

describe("label suggest", () => {
  it("predicts expected categories for common disclosure titles", () => {
    const rules = loadRules(rulesPath);

    const capital = suggestLabel({ reportNm: "유상증자 결정" }, rules);
    const mna = suggestLabel({ reportNm: "합병 결정" }, rules);
    const contract = suggestLabel({ reportNm: "소송 등의 제기" }, rules);

    expect(capital.predictedCategoryId).toBe("capital");
    expect(mna.predictedCategoryId).toBe("mna");
    expect(contract.predictedCategoryId).toBe("contract");
  });

  it("marks unknown/low-confidence titles as uncertain and keeps score in range", () => {
    const rules = loadRules(rulesPath);
    const out = suggestLabel({ reportNm: "사업보고서(제출)" }, rules);

    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    expect(out.uncertain).toBe(true);
  });

  it("is deterministic for same input", () => {
    const rules = loadRules(rulesPath);
    const a = suggestLabel({ reportNm: "유상증자 결정 정정공시" }, rules);
    const b = suggestLabel({ reportNm: "유상증자 결정 정정공시" }, rules);
    expect(a).toEqual(b);
  });
});
