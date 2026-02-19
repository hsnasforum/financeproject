import { describe, expect, it } from "vitest";
import { normalizeCorpQuery, searchCorpIndex, type CorpCodeIndexV1 } from "../src/lib/publicApis/dart/corpIndex";

describe("searchCorpIndex", () => {
  it("keeps korean text while removing spacing and punctuation", () => {
    expect(normalizeCorpQuery(" 삼성 (주) ")).toBe("삼성주");
  });

  it("prioritizes startsWith matches before includes matches", () => {
    const index: CorpCodeIndexV1 = {
      version: 1,
      generatedAt: "2026-02-17T00:00:00Z",
      count: 4,
      items: [
        { corpCode: "00000001", corpName: "삼성전자", normName: normalizeCorpQuery("삼성전자"), stockCode: "005930" },
        { corpCode: "00000002", corpName: "한화삼성투자", normName: normalizeCorpQuery("한화삼성투자") },
        { corpCode: "00000003", corpName: "삼성물산", normName: normalizeCorpQuery("삼성물산"), stockCode: "028260" },
        { corpCode: "00000004", corpName: "중소기업", normName: normalizeCorpQuery("중소기업") },
      ],
    };

    const result = searchCorpIndex({ query: "삼성", sort: "name", limit: 10 }, index);

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.corpCode)).toEqual(["00000003", "00000001", "00000002"]);
  });
});
