export type Gov24StatusSyncState = "ready" | "syncing" | "needs_sync";

export type Gov24StatusSnapshot = {
  totalItems?: number;
  completionRate?: number;
  generatedAt?: string;
  hardCapPages?: number;
  neededPagesEstimate?: number;
  effectiveMaxPages?: number;
  pagesFetched?: number;
  uniqueCount?: number;
  truncatedByHardCap?: boolean;
  isStale?: boolean;
};

export type Gov24StatusMeta = {
  snapshot: Gov24StatusSnapshot | null;
  sync: { state: Gov24StatusSyncState };
  fallback?: {
    mode?: string;
    reason?: string;
  };
  message?: string;
};

export type Gov24StatusParseFailure =
  | "PAYLOAD_NOT_OK"
  | "META_MISSING"
  | "SYNC_STATE_INVALID"
  | "SNAPSHOT_INVALID"
  | "FALLBACK_INVALID"
  | "MESSAGE_INVALID";

export type Gov24StatusParseResult =
  | { valid: true; meta: Gov24StatusMeta }
  | { valid: false; reason: Gov24StatusParseFailure };

export type Gov24StatusCheckState = "checking" | "idle" | "retrying" | "paused" | "failed";

// A healthy sync gets progressively quieter and hands control back after roughly nine minutes.
export const GOV24_STATUS_POLL_DELAYS_MS = [10_000, 20_000, 30_000, 60_000] as const;
export const GOV24_STATUS_MAX_AUTO_POLLS = 12;
// Consecutive transport/contract failures retry four times, then require an explicit user action.
export const GOV24_STATUS_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

export const GOV24_STATUS_CHECK_COPY = {
  retrying: (delayMs: number) =>
    `혜택 기준 데이터 상태를 잠시 확인하지 못했습니다. ${Math.ceil(delayMs / 1_000)}초 후 자동으로 다시 확인합니다.`,
  paused: "자동 상태 확인을 마쳤습니다. 기준 데이터가 계속 갱신 중이면 상태를 다시 확인해 주세요.",
  failed: "상태 확인 실패: 혜택 기준 데이터의 현재 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isValidSnapshot(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!isOptionalNonNegativeInteger(value.totalItems)) return false;
  if (!isOptionalNonNegativeInteger(value.hardCapPages)) return false;
  if (!isOptionalNonNegativeInteger(value.neededPagesEstimate)) return false;
  if (!isOptionalNonNegativeInteger(value.effectiveMaxPages)) return false;
  if (!isOptionalNonNegativeInteger(value.pagesFetched)) return false;
  if (!isOptionalNonNegativeInteger(value.uniqueCount)) return false;
  if (
    value.completionRate !== undefined
    && (typeof value.completionRate !== "number"
      || !Number.isFinite(value.completionRate)
      || value.completionRate < 0
      || value.completionRate > 1)
  ) {
    return false;
  }
  if (
    value.generatedAt !== undefined
    && (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)))
  ) {
    return false;
  }
  if (value.truncatedByHardCap !== undefined && typeof value.truncatedByHardCap !== "boolean") return false;
  if (value.isStale !== undefined && typeof value.isStale !== "boolean") return false;
  return true;
}

function normalizeSnapshot(value: Record<string, unknown>): Gov24StatusSnapshot {
  return {
    ...(typeof value.totalItems === "number" ? { totalItems: value.totalItems } : {}),
    ...(typeof value.completionRate === "number" ? { completionRate: value.completionRate } : {}),
    ...(typeof value.generatedAt === "string" ? { generatedAt: value.generatedAt } : {}),
    ...(typeof value.hardCapPages === "number" ? { hardCapPages: value.hardCapPages } : {}),
    ...(typeof value.neededPagesEstimate === "number" ? { neededPagesEstimate: value.neededPagesEstimate } : {}),
    ...(typeof value.effectiveMaxPages === "number" ? { effectiveMaxPages: value.effectiveMaxPages } : {}),
    ...(typeof value.pagesFetched === "number" ? { pagesFetched: value.pagesFetched } : {}),
    ...(typeof value.uniqueCount === "number" ? { uniqueCount: value.uniqueCount } : {}),
    ...(typeof value.truncatedByHardCap === "boolean"
      ? { truncatedByHardCap: value.truncatedByHardCap }
      : {}),
    ...(typeof value.isStale === "boolean" ? { isStale: value.isStale } : {}),
  };
}

function hasReadySnapshotEvidence(snapshot: Gov24StatusSnapshot | null): boolean {
  return Boolean(
    snapshot
    && (snapshot.generatedAt !== undefined
      || snapshot.totalItems !== undefined
      || snapshot.uniqueCount !== undefined),
  );
}

export function parseGov24StatusPayload(payload: unknown): Gov24StatusParseResult {
  if (!isRecord(payload) || payload.ok !== true) return { valid: false, reason: "PAYLOAD_NOT_OK" };
  if (!isRecord(payload.meta)) return { valid: false, reason: "META_MISSING" };
  if (!isRecord(payload.meta.sync)) return { valid: false, reason: "SYNC_STATE_INVALID" };

  const syncState = payload.meta.sync.state;
  if (syncState !== "ready" && syncState !== "syncing" && syncState !== "needs_sync") {
    return { valid: false, reason: "SYNC_STATE_INVALID" };
  }

  const rawSnapshot = payload.meta.snapshot;
  if (rawSnapshot !== null && !isValidSnapshot(rawSnapshot)) {
    return { valid: false, reason: "SNAPSHOT_INVALID" };
  }
  const snapshot = rawSnapshot === null ? null : normalizeSnapshot(rawSnapshot);
  if (syncState === "ready" && !hasReadySnapshotEvidence(snapshot)) {
    return { valid: false, reason: "SNAPSHOT_INVALID" };
  }

  const rawFallback = payload.meta.fallback;
  if (
    rawFallback !== undefined
    && (!isRecord(rawFallback)
      || !isOptionalString(rawFallback.mode)
      || !isOptionalString(rawFallback.reason))
  ) {
    return { valid: false, reason: "FALLBACK_INVALID" };
  }
  if (!isOptionalString(payload.meta.message)) {
    return { valid: false, reason: "MESSAGE_INVALID" };
  }

  return {
    valid: true,
    meta: {
      snapshot,
      sync: { state: syncState },
      ...(isRecord(rawFallback)
        ? {
            fallback: {
              ...(typeof rawFallback.mode === "string" ? { mode: rawFallback.mode } : {}),
              ...(typeof rawFallback.reason === "string" ? { reason: rawFallback.reason } : {}),
            },
          }
        : {}),
      ...(typeof payload.meta.message === "string" ? { message: payload.meta.message } : {}),
    },
  };
}
