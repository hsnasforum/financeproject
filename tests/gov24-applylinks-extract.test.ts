import { describe, expect, it } from "vitest";
import { extractApplyLinks } from "../src/lib/gov24/applyLinks";

describe("gov24 apply links extract", () => {
  it("extracts url from applyHow text", () => {
    const extracted = extractApplyLinks({
      serviceId: "ABC123",
      applyHow: "정부24 온라인 신청: https://www.gov.kr/portal/rcvfvrSvc/dtlEx/ABC123",
    });

    expect(extracted.links.length).toBe(1);
    expect(extracted.links[0]?.url).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/ABC123");
    expect(extracted.primaryUrl).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/ABC123");
  });

  it("blocks unsafe schemes", () => {
    const extracted = extractApplyLinks({ applyHow: "온라인 신청 javascript:alert(1)", link: "javascript:alert(1)" });
    expect(extracted.links).toEqual([]);
    expect(extracted.primaryUrl).toBeNull();
  });
});
