import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTitle } from "../src/lib/dart/disclosureNormalize";
import { loadRules, type DisclosureNormalizationRules } from "../src/lib/dart/disclosureClassifier";

describe("disclosure title normalize", () => {
  it("removes configured prefix/suffix/noise deterministically", () => {
    const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");
    const rules = loadRules(rulesPath);
    const out = normalizeTitle("[정정] 단일판매ㆍ공급계약 체결 공시서류제출", rules);

    expect(out.normalized).toBe("단일판매 공급계약 체결");
    expect(out.flags).toEqual([
      "noise:공시서류",
      "noise:제출",
      "prefix:[정정]",
    ]);
  });

  it("keeps stable output on repeated calls", () => {
    const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");
    const rules = loadRules(rulesPath);
    const raw = JSON.parse(fs.readFileSync(rulesPath, "utf-8")) as { normalization?: DisclosureNormalizationRules };
    const a = normalizeTitle(" [첨부정정] 유상증자 결정 (첨부) ", rules);
    const b = normalizeTitle(" [첨부정정] 유상증자 결정 (첨부) ", rules.normalization);
    const c = normalizeTitle(" [첨부정정] 유상증자 결정 (첨부) ", raw.normalization ?? rules.normalization);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
