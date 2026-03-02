import { PlanningV2ValidationError } from "./types";
import { ko } from "./messages.ko";

export type PlanningErrorCode =
  | "INPUT"
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_MISSING"
  | "BUDGET_EXCEEDED"
  | "DISABLED"
  | "LOCAL_ONLY"
  | "CSRF"
  | "INTERNAL";

export type PlanningError = {
  code: PlanningErrorCode;
  message: string;
  details?: unknown;
};

const CODE_MAP: Record<string, PlanningErrorCode> = {
  INPUT: "INPUT",
  SNAPSHOT_NOT_FOUND: "SNAPSHOT_NOT_FOUND",
  SNAPSHOT_MISSING: "SNAPSHOT_MISSING",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  ORIGIN_MISMATCH: "LOCAL_ONLY",
  CSRF: "CSRF",
  CSRF_MISMATCH: "CSRF",
  INTERNAL: "INTERNAL",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMessage(code: PlanningErrorCode, rawMessage: unknown): string {
  const text = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!text) return ko[code];

  if (code === "BUDGET_EXCEEDED") return text;
  if (code === "DISABLED") return ko.DISABLED;
  if (code === "SNAPSHOT_NOT_FOUND") return ko.SNAPSHOT_NOT_FOUND;
  if (code === "SNAPSHOT_MISSING") return ko.SNAPSHOT_MISSING;
  if (code === "LOCAL_ONLY") return ko.LOCAL_ONLY;
  if (code === "CSRF") return ko.CSRF;
  if (code === "INPUT") return ko.INPUT;
  if (code === "INTERNAL") return ko.INTERNAL;
  return text;
}

export function normalizePlanningErrorCode(code: unknown): PlanningErrorCode {
  const key = typeof code === "string" ? code.trim().toUpperCase() : "";
  return CODE_MAP[key] ?? "INTERNAL";
}

export function toPlanningError(error: unknown): PlanningError {
  if (error instanceof PlanningV2ValidationError) {
    return {
      code: "INPUT",
      message: ko.INPUT,
      details: error.issues,
    };
  }

  if (isRecord(error)) {
    const code = normalizePlanningErrorCode(error.code);
    return {
      code,
      message: normalizeMessage(code, error.message),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  return {
    code: "INTERNAL",
    message: ko.INTERNAL,
  };
}
