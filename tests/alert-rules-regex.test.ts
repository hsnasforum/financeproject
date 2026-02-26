import { describe, expect, it } from "vitest";
import { addRule, applyRules, type AlertRule } from "../src/lib/dart/alertRulesStore";
import { validateRegexPattern } from "../src/lib/dart/ruleRegexGuard";

describe("alert rules regex", () => {
  it("rejects invalid or risky regex patterns", () => {
    expect(validateRegexPattern("(").ok).toBe(false);
    expect(validateRegexPattern("(.*)+").ok).toBe(false);
    expect(validateRegexPattern("(.+)+").ok).toBe(false);
    expect(validateRegexPattern("(\\w+)+").ok).toBe(false);

    const blocked = addRule([], { kind: "keyword", match: "regex", value: "(.*)+" });
    expect(blocked).toHaveLength(0);
  });

  it("supports contains/startsWith/regex matching for keyword rules", () => {
    const items = [
      { id: "1", title: "유상증자 결정" },
      { id: "2", title: "[정정] 유상증자 결정" },
      { id: "3", title: "단일판매 공급계약 체결" },
    ];

    const containsRule: AlertRule = {
      id: "c1",
      kind: "keyword",
      value: "유상증자",
      match: "contains",
      enabled: true,
      createdAt: "2026-02-26T10:00:00.000Z",
    };
    expect(applyRules(items, [containsRule]).map((item) => item.id)).toEqual(["3"]);

    const startsWithRule: AlertRule = {
      id: "s1",
      kind: "keyword",
      value: "[정정]",
      match: "startsWith",
      enabled: true,
      createdAt: "2026-02-26T10:00:00.000Z",
    };
    expect(applyRules(items, [startsWithRule]).map((item) => item.id)).toEqual(["1", "3"]);

    const regexRule: AlertRule = {
      id: "r1",
      kind: "keyword",
      value: "^유상증자\\s*결정$",
      match: "regex",
      enabled: true,
      createdAt: "2026-02-26T10:00:00.000Z",
    };
    expect(applyRules(items, [regexRule]).map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("ignores invalid regex rules during apply", () => {
    const items = [{ id: "1", title: "유상증자 결정" }];
    const invalidRegexRule: AlertRule = {
      id: "bad",
      kind: "keyword",
      value: "(.*)+",
      match: "regex",
      enabled: true,
      createdAt: "2026-02-26T10:00:00.000Z",
    };
    expect(applyRules(items, [invalidRegexRule])).toEqual(items);
  });
});
