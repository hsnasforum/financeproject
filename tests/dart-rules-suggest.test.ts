import path from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { buildSuggestionsFromCases, createTokenExtractor } from "../scripts/dart_rules_suggest_patches.mjs";
import { loadRules } from "../src/lib/dart/disclosureClassifier";
import { normalizeTitle, tokenizeTitle } from "../src/lib/dart/disclosureNormalize";

const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

describe("dart rules suggest", () => {
  it("includes useful tokens from misclassified/unknown cases", () => {
    const rules = loadRules(rulesPath);
    const extractTokens = createTokenExtractor({ rules, normalizeTitle, tokenizeTitle });
    const cases = [
      { label: "capital", predictedCategoryId: "other", reportNm: "유상증자 결정 공시서류 제출" },
      { label: "capital", predictedCategoryId: "disposition", reportNm: "유상증자 결정 정정" },
      { label: "mna", predictedCategoryId: "contract", reportNm: "합병 결정" },
    ];

    const out = buildSuggestionsFromCases(cases, extractTokens, 10);
    const byLabel = out.byLabel as Record<string, Array<{ token?: string }>>;
    const capitalTokens = (byLabel.capital ?? []).map((row) => row.token);
    const mnaTokens = (byLabel.mna ?? []).map((row) => row.token);

    expect(capitalTokens).toContain("유상증자");
    expect(mnaTokens).toContain("합병");
  });

  it("filters stopwords from suggestions", () => {
    const rules = loadRules(rulesPath);
    const extractTokens = createTokenExtractor({ rules, normalizeTitle, tokenizeTitle });
    const cases = [
      { label: "capital", predictedCategoryId: "other", reportNm: "정정 첨부 제출 공시 보고서 유상증자" },
    ];

    const out = buildSuggestionsFromCases(cases, extractTokens, 20);
    const byLabel = out.byLabel as Record<string, Array<{ token?: string }>>;
    const tokens = (byLabel.capital ?? []).map((row) => row.token);
    expect(tokens).toContain("유상증자");
    expect(tokens).not.toContain("정정");
    expect(tokens).not.toContain("첨부");
    expect(tokens).not.toContain("제출");
    expect(tokens).not.toContain("공시");
    expect(tokens).not.toContain("보고서");
  });
});
