import { describe, expect, it } from "vitest";
import { extractApplyLinks } from "../src/lib/gov24/applyLinks";

describe("gov24 apply links fallback", () => {
  it("builds gov24 detail fallback url when online hint exists and no explicit url", () => {
    const extracted = extractApplyLinks({
      serviceId: "1234567890",
      applyHow: "정부24 온라인 신청 포함",
    });

    expect(extracted.links.length).toBeGreaterThanOrEqual(1);
    expect(extracted.primaryUrl).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/1234567890");
  });

  it("does not create fallback when no online hint", () => {
    const extracted = extractApplyLinks({
      serviceId: "1234567890",
      applyHow: "방문 신청",
    });

    expect(extracted.links).toEqual([]);
    expect(extracted.primaryUrl).toBeNull();
  });
});
