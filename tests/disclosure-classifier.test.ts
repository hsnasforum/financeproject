import path from "node:path";
import { describe, expect, it } from "vitest";
import { classify, loadRules } from "../src/lib/dart/disclosureClassifier";

const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

describe("disclosure classifier", () => {
  it("classifies high-impact capital event with boosters", () => {
    const rules = loadRules(rulesPath);
    const out = classify({ reportName: "유상증자 결정 정정공시" }, rules);

    expect(out.categoryId).toBe("capital");
    expect(out.level).toBe("high");
    expect(out.score).toBeGreaterThanOrEqual(rules.thresholds.high);
    expect(out.signals.some((signal) => signal.includes("category:capital:유상증자"))).toBe(true);
    expect(out.signals.some((signal) => signal.includes("booster:정정"))).toBe(true);
  });

  it("returns deterministic result for same input", () => {
    const rules = loadRules(rulesPath);
    const a = classify({ reportName: "단일판매ㆍ공급계약 체결" }, rules);
    const b = classify({ reportName: "단일판매ㆍ공급계약 체결" }, rules);
    expect(a).toEqual(b);
  });

  it("falls back to low/other when no pattern matches", () => {
    const rules = loadRules(rulesPath);
    const out = classify({ reportName: "기타 안내 공지" }, rules);

    expect(out.categoryId).toBe("other");
    expect(out.level).toBe("low");
    expect(out.score).toBeLessThan(rules.thresholds.mid);
  });
});
