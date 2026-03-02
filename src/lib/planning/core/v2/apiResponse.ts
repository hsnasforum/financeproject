import { jsonError, jsonOk } from "../../api/response";
import { type PlanningErrorCode, normalizePlanningErrorCode } from "./errors";
import { ko } from "./messages.ko";

type SnapshotMeta = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing: boolean;
  warningsCount?: number;
  sourcesCount?: number;
};

type OkMeta = {
  generatedAt?: string;
  snapshot?: Partial<SnapshotMeta>;
  cache?: {
    hit: boolean;
    keyPrefix?: string;
  };
  health?: Record<string, unknown>;
  [key: string]: unknown;
};

type FailOptions = {
  issues?: string[];
  status?: number;
  meta?: Record<string, unknown>;
};

function normalizeSnapshotMeta(snapshot: OkMeta["snapshot"]): SnapshotMeta {
  if (!snapshot || snapshot.missing === true) {
    return { missing: true };
  }

  return {
    id: typeof snapshot.id === "string" ? snapshot.id : undefined,
    asOf: typeof snapshot.asOf === "string" ? snapshot.asOf : undefined,
    fetchedAt: typeof snapshot.fetchedAt === "string" ? snapshot.fetchedAt : undefined,
    missing: false,
    warningsCount: typeof snapshot.warningsCount === "number" ? snapshot.warningsCount : undefined,
    sourcesCount: typeof snapshot.sourcesCount === "number" ? snapshot.sourcesCount : undefined,
  };
}

export function ok<T>(data: T, meta?: OkMeta, status = 200) {
  const normalizedMeta = meta
    ? {
      ...meta,
      snapshot: normalizeSnapshotMeta(meta.snapshot),
    }
    : undefined;

  return jsonOk(
    {
      data,
      ...(normalizedMeta ? { meta: normalizedMeta } : {}),
    },
    { status },
  );
}

export function fail(code: PlanningErrorCode | string, message?: string, options?: FailOptions) {
  const normalizedCode = normalizePlanningErrorCode(code);
  const resolvedMessage = typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : ko[normalizedCode];

  return jsonError(normalizedCode, resolvedMessage, {
    ...(Array.isArray(options?.issues) && options.issues.length > 0 ? { issues: options.issues } : {}),
    ...(typeof options?.status === "number" ? { status: options.status } : {}),
    ...(options?.meta ? { meta: options.meta } : {}),
  });
}
