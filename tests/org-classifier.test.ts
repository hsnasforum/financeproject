import { describe, expect, it } from "vitest";
import { buildOrgTypeCounts, classifyOrgType } from "../src/lib/gov24/orgClassifier";

describe("org classifier", () => {
  it("classifies known organizations", () => {
    expect(classifyOrgType("서울특별시청")).toBe("local");
    expect(classifyOrgType("보건복지부")).toBe("central");
    expect(classifyOrgType("경기도교육청")).toBe("education");
    expect(classifyOrgType("한국장학재단")).toBe("public");
  });

  it("builds counts from result list", () => {
    const counts = buildOrgTypeCounts([
      { org: "서울특별시청" },
      { org: "보건복지부" },
      { org: "경기도교육청" },
      { org: "한국장학재단" },
      { org: "한국장학재단" },
    ]);
    expect(counts.local).toBe(1);
    expect(counts.central).toBe(1);
    expect(counts.education).toBe(1);
    expect(counts.public).toBe(2);
  });
});

