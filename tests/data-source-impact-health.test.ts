import { describe, expect, it } from "vitest";
import {
  buildDataSourceImpactHealthSummaryMap,
  buildDataSourceImpactOperatorCardSummaries,
  buildDataSourceImpactReadOnlyHealth,
} from "../src/lib/dataSources/impactHealth";

describe("data source impact read-only health", () => {
  it("shows index/generatedAt and planning snapshot timestamps", () => {
    const result = buildDataSourceImpactReadOnlyHealth({
      openDartConfigured: true,
      openDartIndexStatus: {
        exists: true,
        primaryPath: "tmp/dart/corpCodes.index.json",
        triedPaths: ["tmp/dart/corpCodes.index.json"],
        freshness: { state: "fresh", ageDays: 1, thresholdDays: 14 },
        meta: {
          loadedPath: "tmp/dart/corpCodes.index.json",
          mtimeMs: 1,
          generatedAt: "2026-03-11T10:00:00.000Z",
          count: 1234,
        },
      },
      planningSnapshot: {
        version: 1,
        asOf: "2026-03-10",
        fetchedAt: "2026-03-11T09:00:00.000Z",
        korea: {},
        sources: [{ name: "ECOS", url: "https://example.com", fetchedAt: "2026-03-11T09:00:00.000Z" }],
        warnings: [],
      },
    });

    expect(result.dart).toEqual({
      tone: "info",
      title: "운영 최신 기준",
      description: "회사 검색 인덱스 기준입니다. 신규 공시 접수 시각과는 다를 수 있습니다.",
      statusLabel: "정상",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: "2026-03-11T10:00:00.000Z",
      details: [
        { label: "인덱스 건수", value: "1234개" },
        { label: "인덱스 상태", value: "사용 가능" },
      ],
    });
    expect(result.planning).toEqual({
      tone: "info",
      title: "운영 최신 기준",
      description: "현재 저장된 latest planning 가정 스냅샷 기준입니다.",
      statusLabel: "정상",
      checkedAtLabel: "최신 동기화",
      checkedAt: "2026-03-11T09:00:00.000Z",
      details: [{ label: "스냅샷 기준일", value: "2026-03-10" }],
    });
  });

  it("keeps OpenDART generatedAt visible even when the key is missing", () => {
    const result = buildDataSourceImpactReadOnlyHealth({
      openDartConfigured: false,
      openDartIndexStatus: {
        exists: true,
        primaryPath: "tmp/dart/corpCodes.index.json",
        triedPaths: ["tmp/dart/corpCodes.index.json"],
        freshness: { state: "fresh", ageDays: 1, thresholdDays: 14 },
        meta: {
          loadedPath: "tmp/dart/corpCodes.index.json",
          mtimeMs: 1,
          generatedAt: "2026-03-11T10:00:00.000Z",
          count: 500,
        },
      },
      planningSnapshot: null,
    });

    expect(result.dart).toEqual({
      tone: "warning",
      title: "운영 최신 기준",
      description: "OPENDART 키가 없어 사용자 경로에 바로 연결되지는 않습니다. 회사 검색 인덱스 기준입니다. 신규 공시 접수 시각과는 다를 수 있습니다.",
      statusLabel: "주의",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: "2026-03-11T10:00:00.000Z",
      details: [
        { label: "인덱스 건수", value: "500개" },
        { label: "인덱스 상태", value: "사용 가능" },
      ],
    });
    expect(result.planning).toEqual({
      tone: "warning",
      title: "운영 최신 기준",
      description: "저장된 latest planning 스냅샷이 없습니다. assumptions 동기화 상태를 확인하세요.",
      statusLabel: "주의",
      checkedAt: null,
      details: [{ label: "상태", value: "최신 스냅샷 없음" }],
    });
  });

  it("marks a stale DART index as warning in both read-only and health summaries", () => {
    const dartStatus = {
      exists: true,
      primaryPath: "tmp/dart/corpCodes.index.json",
      triedPaths: ["tmp/dart/corpCodes.index.json"],
      freshness: { state: "stale" as const, ageDays: 15, thresholdDays: 14 },
      meta: {
        loadedPath: "tmp/dart/corpCodes.index.json",
        mtimeMs: 1,
        generatedAt: "2026-08-09T00:00:00.000Z",
        count: 1234,
      },
    };

    const readOnly = buildDataSourceImpactReadOnlyHealth({
      openDartConfigured: true,
      openDartIndexStatus: dartStatus,
      planningSnapshot: null,
    });
    const healthSummary = buildDataSourceImpactHealthSummaryMap({
      openDartConfigured: true,
      dartStatus,
      planningSnapshot: null,
    });

    expect(readOnly.dart).toMatchObject({
      tone: "warning",
      statusLabel: "주의",
      checkedAt: "2026-08-09T00:00:00.000Z",
    });
    expect(readOnly.dart?.description).toContain("14일 기준보다 오래됐습니다");
    expect(readOnly.dart?.details).toContainEqual({
      label: "인덱스 상태",
      value: "15일 경과 · 14일 기준 오래됨",
    });
    expect(healthSummary.dart?.items[0]).toMatchObject({
      tone: "error",
      statusLabel: "주의",
      checkedAt: "2026-08-09T00:00:00.000Z",
    });
  });

  it("keeps an index with unknown freshness usable but never labels it normal", () => {
    const result = buildDataSourceImpactReadOnlyHealth({
      openDartConfigured: true,
      openDartIndexStatus: {
        exists: true,
        primaryPath: "tmp/dart/corpCodes.index.json",
        triedPaths: ["tmp/dart/corpCodes.index.json"],
        freshness: { state: "unknown", ageDays: null, thresholdDays: 14 },
        meta: {
          loadedPath: "tmp/dart/corpCodes.index.json",
          mtimeMs: 1,
          generatedAt: "invalid",
          count: 500,
        },
      },
      planningSnapshot: null,
    });

    expect(result.dart).toMatchObject({
      tone: "warning",
      statusLabel: "주의",
      checkedAt: null,
    });
    expect(result.dart?.description).toContain("최신 여부를 판단하지 못했습니다");
  });

  it("marks an existing but unreadable DART index as unavailable", () => {
    const dartStatus = {
      exists: true,
      usable: false,
      issue: "INVALID_INDEX" as const,
      primaryPath: "tmp/dart/corpCodes.index.json",
      triedPaths: ["tmp/dart/corpCodes.index.json"],
      freshness: { state: "unknown" as const, ageDays: null, thresholdDays: 14 },
      meta: {
        loadedPath: "tmp/dart/corpCodes.index.json",
        mtimeMs: 1,
      },
    };

    const readOnly = buildDataSourceImpactReadOnlyHealth({
      openDartConfigured: true,
      openDartIndexStatus: dartStatus,
      planningSnapshot: null,
    });
    const summary = buildDataSourceImpactHealthSummaryMap({
      openDartConfigured: true,
      dartStatus,
      planningSnapshot: null,
    });

    expect(readOnly.dart).toMatchObject({
      tone: "warning",
      statusLabel: "주의",
      checkedAt: null,
      details: [{ label: "상태", value: "인덱스 읽기 실패" }],
    });
    expect(readOnly.dart?.description).toContain("파일을 읽지 못해");
    expect(summary.dart?.items[0]).toMatchObject({
      tone: "error",
      statusLabel: "주의",
      checkedAt: null,
      details: [{ label: "인덱스 상태", value: "파일 읽기 실패" }],
    });
    expect(summary.dart?.items[0]?.summaryText).toContain("파일을 읽지 못했습니다");
  });

  it("builds operator card summaries in stable card order", () => {
    const summaries = buildDataSourceImpactOperatorCardSummaries({
      impactReadOnlyByCardId: {
        planning: {
          tone: "info",
          title: "운영 최신 기준",
          description: "planning summary",
          statusLabel: "정상",
          checkedAtLabel: "최신 동기화",
          checkedAt: "2026-03-11T09:00:00.000Z",
          details: [],
        },
        dart: {
          tone: "warning",
          title: "운영 최신 기준",
          description: "dart summary",
          statusLabel: "주의",
          checkedAt: null,
          details: [{ label: "상태", value: "검색 인덱스 없음" }],
        },
      },
      impactHealthByCardId: {
        planning: {
          latestCheckedAt: "2026-03-11T09:00:00.000Z",
          items: [],
        },
      },
    });

    expect(summaries).toEqual([
      {
        cardId: "dart",
        label: "기업 공시 모니터링",
        readOnly: {
          tone: "warning",
          title: "운영 최신 기준",
          description: "dart summary",
          statusLabel: "주의",
          checkedAt: null,
          details: [{ label: "상태", value: "검색 인덱스 없음" }],
        },
        healthSummary: null,
      },
      {
        cardId: "planning",
        label: "재무설계 기준금리 참고",
        readOnly: {
          tone: "info",
          title: "운영 최신 기준",
          description: "planning summary",
          statusLabel: "정상",
          checkedAtLabel: "최신 동기화",
          checkedAt: "2026-03-11T09:00:00.000Z",
          details: [],
        },
        healthSummary: {
          latestCheckedAt: "2026-03-11T09:00:00.000Z",
          items: [],
        },
      },
    ]);
  });
});
