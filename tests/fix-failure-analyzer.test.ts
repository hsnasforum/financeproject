import { describe, expect, it } from "vitest";
import { analyzeFixFailure } from "../src/lib/diagnostics/fixFailureAnalyzer";

describe("fix failure analyzer", () => {
  it("classifies missing OPENDART key", () => {
    const analyzed = analyzeFixFailure({
      fixId: "DART_WATCH",
      stderrTail: "OpenDART 설정이 필요합니다. OPENDART_API_KEY를 확인하세요.",
    });

    expect(analyzed.cause).toBe("MISSING_OPENDART_KEY");
    expect(analyzed.suggestedFixIds).toContain("DART_WATCH");
    expect(analyzed.suggestedFixIds).toContain("DAILY_REFRESH");
  });

  it("classifies missing corp index", () => {
    const analyzed = analyzeFixFailure({
      fixId: "DART_WATCH",
      stderrTail: "corpCodes 인덱스가 없습니다. scripts/dart_corpcode_build.py를 실행하세요.",
    });

    expect(analyzed.cause).toBe("MISSING_CORP_INDEX");
    expect(analyzed.suggestedFixIds).toContain("DART_WATCH");
  });

  it("classifies db not ready", () => {
    const analyzed = analyzeFixFailure({
      fixId: "SEED_DEBUG",
      stderrTail: "PrismaClientInitializationError: Can't reach database server",
    });

    expect(analyzed.cause).toBe("DB_NOT_READY");
    expect(analyzed.suggestedFixIds).toEqual(expect.arrayContaining(["PRISMA_DB_PUSH", "SEED_DEBUG"]));
  });

  it("classifies upstream unavailable", () => {
    const analyzed = analyzeFixFailure({
      fixId: "DAILY_REFRESH",
      stderrTail: "fetch failed: request_timeout (503 Service Unavailable)",
    });

    expect(analyzed.cause).toBe("UPSTREAM_UNAVAILABLE");
    expect(analyzed.suggestedFixIds).toContain("DAILY_REFRESH");
  });

  it("falls back to unknown when no pattern matches", () => {
    const analyzed = analyzeFixFailure({
      fixId: "DATA_DOCTOR",
      stderrTail: "unexpected random failure marker",
    });

    expect(analyzed.cause).toBe("UNKNOWN");
    expect(analyzed.suggestedFixIds).toEqual(["DATA_DOCTOR"]);
  });
});
