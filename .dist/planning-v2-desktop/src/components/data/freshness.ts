import { type SourceStatusRow, type UnifiedKind, type UnifiedSourceId } from "@/lib/sources/types";

export type SourceImportance = "required" | "optional";

export type FreshnessSourceSpec = {
  sourceId: UnifiedSourceId;
  kind: UnifiedKind;
  label?: string;
  importance?: SourceImportance;
};

export type FreshnessLevel = "ok" | "info" | "warn" | "error";
export type FreshnessItemStatus = "ok" | "stale" | "error" | "empty";

export type FreshnessSummaryItem = FreshnessSourceSpec & {
  importance: SourceImportance;
  status: FreshnessItemStatus;
  isFresh: boolean;
  counts: number;
  ageMs: number | null;
  ttlMs: number | null;
  lastSyncedAt: string | null;
  lastError?: string;
  reason: string;
};

export type FreshnessSummary = {
  level: FreshnessLevel;
  message: string;
  requiredIssuesCount: number;
  optionalIssuesCount: number;
  items: FreshnessSummaryItem[];
};

type SummarizeOptions = {
  strict?: boolean;
};

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "-";
  const ms = Math.max(0, Math.trunc(value));
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const days = Math.floor(ms / day);
  const hours = Math.floor((ms % day) / hour);
  const minutes = Math.floor((ms % hour) / minute);
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return `${Math.max(1, Math.round(ms / 1000))}초`;
}

export function formatAge(value: number | null): string {
  const base = formatMs(value);
  return base === "-" ? "-" : `${base} 전`;
}

export function formatTtl(value: number | null): string {
  const base = formatMs(value);
  return base === "-" ? "-" : `TTL ${base}`;
}

function rowKey(input: { sourceId: UnifiedSourceId; kind: UnifiedKind }): string {
  return `${input.sourceId}:${input.kind}`;
}

function summarizeItemStatus(row: SourceStatusRow | null): { status: FreshnessItemStatus; reason: string } {
  if (!row) return { status: "empty", reason: "상태 정보 없음" };
  if (row.lastError?.message) return { status: "error", reason: "최근 동기화 실패" };
  if (row.counts <= 0) return { status: "empty", reason: "데이터 없음" };
  if (!row.isFresh) return { status: "stale", reason: "데이터 오래됨" };
  return { status: "ok", reason: "최신" };
}

export function summarizeFreshness(
  statusRows: SourceStatusRow[],
  specs: FreshnessSourceSpec[],
  options: SummarizeOptions = {},
): FreshnessSummary {
  if (specs.length === 0) {
    return {
      level: "ok",
      message: "확인할 필수 소스가 없습니다.",
      requiredIssuesCount: 0,
      optionalIssuesCount: 0,
      items: [],
    };
  }

  const rowMap = new Map<string, SourceStatusRow>();
  for (const row of statusRows) rowMap.set(rowKey({ sourceId: row.sourceId, kind: row.kind }), row);

  const strict = options.strict === true;

  const items: FreshnessSummaryItem[] = specs.map((spec) => {
    const row = rowMap.get(rowKey(spec)) ?? null;
    const importance: SourceImportance = strict ? "required" : (spec.importance ?? "required");
    const status = summarizeItemStatus(row);
    return {
      ...spec,
      importance,
      status: status.status,
      isFresh: row?.isFresh ?? false,
      counts: row?.counts ?? 0,
      ageMs: row?.ageMs ?? null,
      ttlMs: row?.ttlMs ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
      ...(row?.lastError?.message ? { lastError: row.lastError.message } : {}),
      reason: status.reason,
    };
  });

  const requiredIssues = items.filter((item) => item.importance === "required" && item.status !== "ok");
  const optionalIssues = items.filter((item) => item.importance === "optional" && item.status !== "ok");
  const requiredHasError = requiredIssues.some((item) => item.status === "error");

  if (requiredHasError) {
    return {
      level: "error",
      message: "일부 소스가 최근 동기화에 실패했습니다. 수동 동기화 후 재확인을 권장합니다.",
      requiredIssuesCount: requiredIssues.length,
      optionalIssuesCount: optionalIssues.length,
      items,
    };
  }

  if (requiredIssues.length > 0) {
    return {
      level: "warn",
      message: "일부 소스 데이터가 오래됐거나 비어 있습니다. 수동 갱신을 권장합니다.",
      requiredIssuesCount: requiredIssues.length,
      optionalIssuesCount: optionalIssues.length,
      items,
    };
  }

  if (optionalIssues.length > 0) {
    return {
      level: "info",
      message: "필수 소스는 최신입니다. 선택 소스 상태를 확인하세요.",
      requiredIssuesCount: requiredIssues.length,
      optionalIssuesCount: optionalIssues.length,
      items,
    };
  }

  return {
    level: "ok",
    message: "필수 소스 데이터가 최신 상태입니다.",
    requiredIssuesCount: 0,
    optionalIssuesCount: 0,
    items,
  };
}
