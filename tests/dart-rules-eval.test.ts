import path from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { evaluateDisclosureRules } from "../scripts/dart_rules_eval.mjs";
import { classify, loadRules } from "../src/lib/dart/disclosureClassifier";
import { normalizeTitle, tokenizeTitle } from "../src/lib/dart/disclosureNormalize";

const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

describe("dart rules eval", () => {
  it("returns category counts and unknown rate for a small corpus", () => {
    const rules = loadRules(rulesPath);
    const corpus = [
      { corpCode: "00126380", corpName: "삼성전자", rceptDt: "20260226", reportNm: "유상증자 결정", rceptNo: "2026000001" },
      { corpCode: "00164779", corpName: "현대차", rceptDt: "20260225", reportNm: "단일판매 공급계약 체결", rceptNo: "2026000002" },
      { corpCode: "00164779", corpName: "현대차", rceptDt: "20260224", reportNm: "기타 안내 공지", rceptNo: "2026000003" },
    ];

    const result = evaluateDisclosureRules({
      corpusItems: corpus,
      rules,
      normalizeTitle,
      tokenizeTitle,
      classify,
    });

    expect(result.total).toBe(3);
    expect(result.categoryCounts).toBeTypeOf("object");
    expect(result.categoryCounts).toHaveProperty("other");
    expect(result).toHaveProperty("unknownRate");
    expect(typeof result.unknownRate).toBe("number");
    expect(result.unknownRate).toBeGreaterThanOrEqual(0);
    expect(result.unknownRate).toBeLessThanOrEqual(1);
  });
});
