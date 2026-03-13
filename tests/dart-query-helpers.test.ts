import { describe, expect, it } from "vitest";
import {
  buildDartCompanyHref,
  buildDartMonitorHref,
  buildDartSearchHref,
  normalizeDartCorpName,
  normalizeDartCorpCode,
  normalizeDartSearchQuery,
} from "../src/lib/dart/query";

describe("dart query helpers", () => {
  it("accepts only 8-digit corp codes", () => {
    expect(normalizeDartCorpCode("00126380")).toBe("00126380");
    expect(normalizeDartCorpCode("ABC12345")).toBe("");
    expect(normalizeDartCorpCode(" 00126380 ")).toBe("00126380");
  });

  it("normalizes search query spacing and length", () => {
    expect(normalizeDartSearchQuery("  삼성   전자  ")).toBe("삼성 전자");
    expect(normalizeDartSearchQuery("")).toBe("");
    expect(normalizeDartSearchQuery("a".repeat(120)).length).toBe(80);
    expect(normalizeDartCorpName("  삼성   전자  ")).toBe("삼성 전자");
  });

  it("builds safe dart search/company hrefs", () => {
    expect(buildDartSearchHref("  삼성   전자 ")).toBe("/public/dart?q=%EC%82%BC%EC%84%B1%20%EC%A0%84%EC%9E%90");
    expect(buildDartSearchHref(undefined, "monitor")).toBe("/public/dart?tab=monitor");
    expect(buildDartSearchHref("")).toBe("/public/dart");
    expect(buildDartCompanyHref("00126380", " 삼성 ", " 삼성전자 ")).toBe("/public/dart/company?corpCode=00126380&fromQuery=%EC%82%BC%EC%84%B1&corpName=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90");
    expect(buildDartCompanyHref("00126380", undefined, " 삼성전자 ")).toBe("/public/dart/company?corpCode=00126380&corpName=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90");
    expect(buildDartMonitorHref("00126380", " 삼성전자 ")).toBe("/public/dart?tab=monitor&corpCode=00126380&corpName=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90");
    expect(buildDartMonitorHref("bad", "삼성전자")).toBe("/public/dart?tab=monitor");
    expect(buildDartCompanyHref("bad", "삼성")).toBe("/public/dart?q=%EC%82%BC%EC%84%B1");
  });
});
