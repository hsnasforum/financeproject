import { describe, expect, it } from "vitest";
import {
  addRule,
  applyRules,
  removeRule,
  toggleRule,
  type AlertRule,
} from "../src/lib/dart/alertRulesStore";

describe("alert rules store", () => {
  it("adds, toggles, and removes rules", () => {
    const added = addRule([], { kind: "corp", value: "005930" });
    expect(added).toHaveLength(1);
    expect(added[0]?.enabled).toBe(true);

    const toggled = toggleRule(added, added[0]!.id);
    expect(toggled[0]?.enabled).toBe(false);

    const removed = removeRule(toggled, toggled[0]!.id);
    expect(removed).toHaveLength(0);
  });

  it("applies cluster/corp/category/keyword matching rules", () => {
    const rules: AlertRule[] = [
      { id: "r1", kind: "cluster", value: "c:1", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
      { id: "r2", kind: "corp", value: "005930", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
      { id: "r3", kind: "category", value: "contract", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
      { id: "r4", kind: "keyword", value: "유상증자", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
    ];

    const items = [
      { id: "1", clusterKey: "c:1", corpCode: "111111", categoryId: "other", title: "정상 공시" },
      { id: "2", clusterKey: "c:2", corpCode: "005930", categoryId: "other", title: "정상 공시" },
      { id: "3", clusterKey: "c:3", corpCode: "222222", categoryId: "contract", title: "정상 공시" },
      { id: "4", clusterKey: "c:4", corpCode: "333333", categoryId: "other", normalizedTitle: "유상증자 결정", title: "원문 제목" },
      { id: "5", clusterKey: "c:5", corpCode: "444444", categoryId: "other", title: "보여야 함" },
    ];

    const filtered = applyRules(items, rules);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("5");
  });
});
