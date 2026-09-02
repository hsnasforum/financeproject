import { getUnifiedSourceStatuses } from "@/lib/sources/status";
import type {
  ProductFreshnessSummary,
  ProductSourceFreshness,
  ProductSourceIssue,
  SourceStatusRow,
  UnifiedKind,
  UnifiedSourceId,
} from "@/lib/sources/types";

function uniqueSources(sourceIds: UnifiedSourceId[]): UnifiedSourceId[] {
  return [...new Set(sourceIds)];
}

export function applyProductSourceIssues(
  summary: ProductFreshnessSummary,
  issues: ProductSourceIssue[] | undefined,
): ProductFreshnessSummary {
  if (!issues?.length) return summary;
  const sources = summary.sources.map((source) => {
    const sourceIssues = issues.filter((issue) => issue.sourceId === source.sourceId);
    if (sourceIssues.length === 0) return source;
    const queryIssue = sourceIssues.find((issue) => issue.phase === "query");
    if (queryIssue) {
      return {
        ...source,
        sourceAsOf: null,
        ageMs: null,
        freshness: "unavailable" as const,
        fallbackUsed: false,
        message: queryIssue.message,
      };
    }
    const refreshIssue = sourceIssues.find((issue) => issue.phase === "refresh");
    if (!refreshIssue) return source;
    return {
      ...source,
      freshness: source.freshness === "unavailable" ? "unavailable" as const : "stale" as const,
      fallbackUsed: true,
      message: refreshIssue.message,
    };
  });
  return {
    ...summary,
    sources,
    overall: overallFreshness(sources),
  };
}

function missingSource(input: {
  sourceId: UnifiedSourceId;
  kind: UnifiedKind;
  checkedAt: string;
}): ProductSourceFreshness {
  if (input.sourceId === "samplebank") {
    return {
      sourceId: input.sourceId,
      kind: input.kind,
      sourceAsOf: null,
      checkedAt: input.checkedAt,
      ttlMs: null,
      ageMs: null,
      freshness: "sample",
      fallbackUsed: true,
      message: "실제 금융회사 공시가 아닌 화면 확인용 예시 데이터입니다.",
    };
  }
  return {
    sourceId: input.sourceId,
    kind: input.kind,
    sourceAsOf: null,
    checkedAt: input.checkedAt,
    ttlMs: null,
    ageMs: null,
    freshness: "unavailable",
    fallbackUsed: false,
    message: "원천 데이터의 기준 시각을 확인하지 못했습니다. 가입 전 금융회사 공시를 다시 확인해 주세요.",
  };
}

function toPublicSource(status: SourceStatusRow, checkedAt: string): ProductSourceFreshness {
  const unavailable = !status.lastSyncedAt;
  const freshness = unavailable ? "unavailable" : status.isFresh ? "fresh" : "stale";
  const message = status.lastError?.message
    ?? (freshness === "fresh"
      ? "원천 데이터가 설정된 갱신 주기 안에 있습니다."
      : freshness === "stale"
        ? "설정된 갱신 주기를 지난 데이터입니다. 가입 전 금융회사 공시를 다시 확인해 주세요."
        : "원천 데이터의 기준 시각을 확인하지 못했습니다. 가입 전 금융회사 공시를 다시 확인해 주세요.");
  return {
    sourceId: status.sourceId,
    kind: status.kind,
    sourceAsOf: status.lastSyncedAt,
    checkedAt,
    ttlMs: status.ttlMs,
    ageMs: status.ageMs,
    freshness,
    fallbackUsed: status.fallbackUsed === true,
    message,
  };
}

function overallFreshness(sources: ProductSourceFreshness[]): ProductFreshnessSummary["overall"] {
  if (sources.length === 0 || sources.every((source) => source.freshness === "unavailable")) return "unavailable";
  const hasUnavailable = sources.some((source) => source.freshness === "unavailable");
  const hasUsable = sources.some((source) => source.freshness !== "unavailable");
  if (hasUnavailable && hasUsable) return "partial";
  if (sources.every((source) => source.freshness === "fresh" && !source.fallbackUsed)) return "fresh";
  return "stale";
}

export function buildProductFreshnessSummary(input: {
  kind: UnifiedKind;
  sourceIds: UnifiedSourceId[];
  statuses: SourceStatusRow[];
  checkedAt?: string;
}): ProductFreshnessSummary {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const sources = uniqueSources(input.sourceIds).map((sourceId) => {
    const status = input.statuses.find((row) => row.sourceId === sourceId && row.kind === input.kind);
    return status ? toPublicSource(status, checkedAt) : missingSource({ sourceId, kind: input.kind, checkedAt });
  });
  return {
    checkedAt,
    overall: overallFreshness(sources),
    sources,
  };
}

export async function getProductFreshnessSummary(input: {
  kind: UnifiedKind;
  sourceIds: UnifiedSourceId[];
  checkedAt?: string;
}): Promise<ProductFreshnessSummary> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  try {
    const needsStatusLookup = input.sourceIds.some((sourceId) => sourceId !== "samplebank");
    const statuses = needsStatusLookup ? await getUnifiedSourceStatuses() : [];
    return buildProductFreshnessSummary({ ...input, checkedAt, statuses });
  } catch (error) {
    console.error("[products/freshness] source status unavailable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return buildProductFreshnessSummary({ ...input, checkedAt, statuses: [] });
  }
}
