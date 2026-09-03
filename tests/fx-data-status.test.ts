import { describe, expect, it } from "vitest";
import { buildFxDataStatus } from "../src/lib/publicApis/fxDataStatus";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("FX user-facing data status", () => {
  it("distinguishes live, cache, and mock responses", () => {
    expect(buildFxDataStatus({
      rowCount: 1,
      meta: { provenance: { mode: "live", asOf: "2026-09-01" }, cache: "miss" },
      now: NOW,
    })).toMatchObject({ mode: "live", label: "실시간 원천 조회", cacheHit: false, isStale: false });

    expect(buildFxDataStatus({
      rowCount: 1,
      meta: { provenance: { mode: "live", asOf: "2026-09-01" }, cache: "hit" },
      now: NOW,
    })).toMatchObject({ mode: "cache", label: "응답 캐시 사용", cacheHit: true, isStale: false });

    expect(buildFxDataStatus({
      rowCount: 1,
      meta: { provenance: { mode: "mock", asOf: "2026-06-22", degraded: true }, cache: "miss" },
      now: NOW,
    })).toMatchObject({ mode: "mock", label: "예시 데이터", cacheHit: false, isStale: true });
  });

  it("marks old and unavailable data without calling it current", () => {
    expect(buildFxDataStatus({
      rowCount: 1,
      meta: { provenance: { mode: "live", asOf: "2026-08-29" }, cache: "miss" },
      now: NOW,
    })).toMatchObject({ isStale: true, freshnessLabel: "기준 시점 오래됨" });
    expect(buildFxDataStatus({ rowCount: 0, meta: null, now: NOW })).toMatchObject({
      mode: "unavailable",
      label: "사용 가능한 환율 없음",
    });
  });

  it("canonicalizes compact quote dates before evaluating freshness", () => {
    expect(buildFxDataStatus({
      rowCount: 1,
      meta: { provenance: { mode: "live", asOf: "20260829" }, cache: "miss" },
      now: NOW,
    })).toMatchObject({
      mode: "live",
      asOf: "2026-08-29",
      isStale: true,
      freshnessLabel: "기준 시점 오래됨",
    });
  });

  it.each([undefined, "not-a-date", "2026-02-30"])(
    "fails closed when the quote date cannot be verified: %s",
    (asOf) => {
      expect(buildFxDataStatus({
        rowCount: 1,
        meta: { provenance: { mode: "live", ...(asOf ? { asOf } : {}) }, cache: "miss" },
        now: NOW,
      })).toMatchObject({
        mode: "unavailable",
        asOf: null,
        isStale: true,
        freshnessLabel: asOf ? "기준 시점 확인 불가" : "기준 시점 확인 필요",
      });
    },
  );
});
