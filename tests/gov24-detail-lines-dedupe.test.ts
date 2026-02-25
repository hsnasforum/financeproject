import { describe, expect, it } from "vitest";
import { dedupeConsecutiveLines } from "../src/lib/gov24/detailLines";

describe("gov24 detail lines dedupe", () => {
  it("removes consecutive duplicated lines", () => {
    const lines = [
      "  방문 신청은 완도군청 문의  ",
      "방문 신청은 완도군청 문의",
      "방문 신청은 완도군청 문의",
      "온라인 신청 가능",
      "온라인 신청 가능",
      "상동",
      "전화문의 061-123-4567",
    ];
    const deduped = dedupeConsecutiveLines(lines);
    expect(deduped).toEqual([
      "방문 신청은 완도군청 문의",
      "온라인 신청 가능",
      "전화문의 061-123-4567",
    ]);
  });
});
