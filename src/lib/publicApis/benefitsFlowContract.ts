export type BenefitsFlowSurface = "benefits" | "gov24";

export type BenefitsSnapshotInput = {
  snapshot?: {
    totalItems?: number;
    totalItemsInSnapshot?: number;
    snapshotTotal?: number;
    completionRate?: number;
    generatedAt?: string;
    uniqueCount?: number;
    truncatedByHardCap?: boolean;
  } | null;
  sync?: {
    state?: string;
  };
  fallback?: {
    reason?: string;
  };
  generatedAt?: string | null;
  snapshotTotal?: number | null;
  completionRate?: number | null;
  uniqueCount?: number | null;
  message?: string | null;
};

export type BenefitsSnapshotStatus = {
  state: "ready" | "syncing" | "needs_sync" | "partial" | "unknown";
  stateLabel: string;
  generatedAt: string | null;
  totalItems: number | null;
  uniqueCount: number | null;
  completionRate: number | null;
  notice: string | null;
};

const INTERNAL_MESSAGE_PATTERN = /(?:\/api\/dev|pnpm|snapshot\/refresh|run\s+pnpm|script|internal endpoint)/i;

export const BENEFITS_FLOW_COPY = {
  sharedDisclaimer:
    "이 화면은 확정 수급 판정이 아니라, 지금 조건에서 다시 확인할 혜택 후보를 좁혀 보는 단계입니다. 신청 전에는 상세에서 지원 조건과 신청 방법을 다시 확인하세요.",
  snapshotMissing:
    "공공 혜택 기준 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 조회하거나 검색 범위를 줄여 주세요.",
  snapshotStale:
    "공공 혜택 기준 시점이 오래되었습니다. 현재 결과는 마지막으로 저장된 자료이며 최신 내용은 신청 전에 다시 확인해 주세요.",
  requestFailed: "혜택 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  empty: "조건이나 키워드를 조금 넓혀서 혜택 후보를 다시 찾아보세요.",
  loading: "현재 조건에 맞는 정부 혜택 후보를 찾고 있습니다.",
} as const;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw : null;
}

export function sanitizeBenefitUserMessage(value: unknown, fallback: string = BENEFITS_FLOW_COPY.requestFailed): string {
  const raw = asString(value);
  if (!raw) return fallback;
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (!firstLine || INTERNAL_MESSAGE_PATTERN.test(firstLine)) return fallback;
  return firstLine;
}

export function readBenefitErrorMessage(payload: unknown, fallback = BENEFITS_FLOW_COPY.requestFailed): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = sanitizeBenefitUserMessage((error as Record<string, unknown>).message, fallback);
    if (message) return message;
  }
  return sanitizeBenefitUserMessage(record.message, fallback);
}

export function buildBenefitsSnapshotStatus(meta: BenefitsSnapshotInput | null | undefined): BenefitsSnapshotStatus {
  const snapshot = meta?.snapshot ?? null;
  const fallbackReason = meta?.fallback?.reason;
  const generatedAt = asString(snapshot?.generatedAt) ?? asString(meta?.generatedAt);
  const totalItems =
    asNumber(snapshot?.totalItems)
    ?? asNumber(snapshot?.totalItemsInSnapshot)
    ?? asNumber(snapshot?.snapshotTotal)
    ?? asNumber(meta?.snapshotTotal);
  const uniqueCount = asNumber(snapshot?.uniqueCount) ?? asNumber(meta?.uniqueCount);
  const completionRate = asNumber(snapshot?.completionRate) ?? asNumber(meta?.completionRate);
  const syncState = asString(meta?.sync?.state);

  if (syncState === "syncing") {
    return {
      state: "syncing",
      stateLabel: "기준 데이터 갱신 중",
      generatedAt,
      totalItems,
      uniqueCount,
      completionRate,
      notice: "공공 혜택 기준 데이터를 갱신하는 중입니다. 잠시 후 결과가 늘어날 수 있습니다.",
    };
  }

  if (fallbackReason === "snapshot_stale") {
    return {
      state: "needs_sync",
      stateLabel: "기준 시점 오래됨",
      generatedAt,
      totalItems,
      uniqueCount,
      completionRate,
      notice: sanitizeBenefitUserMessage(meta?.message, BENEFITS_FLOW_COPY.snapshotStale),
    };
  }

  if (fallbackReason === "snapshot_missing" || syncState === "needs_sync") {
    return {
      state: "needs_sync",
      stateLabel: "기준 데이터 준비 필요",
      generatedAt,
      totalItems,
      uniqueCount,
      completionRate,
      notice: sanitizeBenefitUserMessage(meta?.message, BENEFITS_FLOW_COPY.snapshotMissing),
    };
  }

  if ((snapshot?.truncatedByHardCap || (completionRate !== null && completionRate > 0 && completionRate < 0.95))) {
    const percent = completionRate !== null ? `${Math.round(completionRate * 1000) / 10}%` : "?";
    return {
      state: "partial",
      stateLabel: "기준 데이터 일부 반영",
      generatedAt,
      totalItems,
      uniqueCount,
      completionRate,
      notice: `일부 혜택은 순차 반영 중일 수 있습니다. 현재 반영 범위 ${percent}`,
    };
  }

  if (generatedAt || totalItems !== null || uniqueCount !== null) {
    return {
      state: "ready",
      stateLabel: "기준 데이터 확인됨",
      generatedAt,
      totalItems,
      uniqueCount,
      completionRate,
      notice: null,
    };
  }

  return {
    state: "unknown",
    stateLabel: "기준 데이터 확인 중",
    generatedAt,
    totalItems,
    uniqueCount,
    completionRate,
    notice: null,
  };
}

export function benefitResultSummary(input: { surface: BenefitsFlowSurface; totalMatched: number }): string {
  const count = Math.max(0, Math.trunc(input.totalMatched)).toLocaleString();
  return input.surface === "gov24"
    ? `현재 조건 기준 ${count}건의 혜택 후보를 읽는 중입니다.`
    : `${count}건의 혜택 후보`;
}
