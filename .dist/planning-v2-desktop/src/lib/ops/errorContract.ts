import { NextResponse } from "next/server";
import { redactText } from "../planning/privacy/redact";
import { inferFixHrefByErrorCode } from "./errorFixHref";

export type OpsContractErrorCode =
  | "LOCKED"
  | "CSRF"
  | "LOCAL_ONLY"
  | "VALIDATION"
  | "STALE_ASSUMPTIONS"
  | "STORAGE_CORRUPT"
  | "BACKUP_INVALID"
  | "INTERNAL";

type OpsErrorShape = {
  code: OpsContractErrorCode;
  message: string;
  fixHref?: string;
  details?: unknown;
};

type OpsErrorResponseInput = {
  code: string;
  message?: string;
  status?: number;
  fixHref?: string;
  details?: unknown;
};

const DEFAULT_MESSAGE: Record<OpsContractErrorCode, string> = {
  LOCKED: "잠금 해제 후 다시 시도해 주세요.",
  CSRF: "요청이 차단되었습니다(CSRF). 페이지를 새로고침 후 다시 시도하세요.",
  LOCAL_ONLY: "로컬 환경에서만 사용할 수 있습니다.",
  VALIDATION: "입력값이 올바르지 않습니다.",
  STALE_ASSUMPTIONS: "가정 스냅샷이 오래되었습니다. 최신화 후 다시 시도해 주세요.",
  STORAGE_CORRUPT: "저장 데이터가 손상되었을 수 있습니다. /ops/doctor에서 점검해 주세요.",
  BACKUP_INVALID: "백업 파일 형식이 올바르지 않습니다.",
  INTERNAL: "처리 중 오류가 발생했습니다.",
};

const DEFAULT_STATUS: Record<OpsContractErrorCode, number> = {
  LOCKED: 423,
  CSRF: 403,
  LOCAL_ONLY: 403,
  VALIDATION: 400,
  STALE_ASSUMPTIONS: 409,
  STORAGE_CORRUPT: 500,
  BACKUP_INVALID: 400,
  INTERNAL: 500,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRawCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

export function normalizeOpsErrorCode(raw: unknown): OpsContractErrorCode {
  const code = normalizeRawCode(raw);
  if (!code) return "INTERNAL";
  if (code === "LOCKED" || code === "VAULT_LOCKED" || code.startsWith("VAULT_UNLOCK_BACKOFF")) return "LOCKED";
  if (code === "CSRF" || code === "CSRF_MISMATCH") return "CSRF";
  if (code === "LOCAL_ONLY" || code === "ORIGIN_MISMATCH") return "LOCAL_ONLY";
  if (
    code === "STALE_ASSUMPTIONS"
    || code === "SNAPSHOT_STALE"
    || code === "SNAPSHOT_VERY_STALE"
    || code === "SNAPSHOT_NOT_FOUND"
  ) {
    return "STALE_ASSUMPTIONS";
  }
  if (
    code === "BACKUP_INVALID"
    || code === "INVALID_ARCHIVE"
    || code === "INVALID_ZIP"
    || code.startsWith("MANIFEST_")
    || code.startsWith("ZIP_")
    || code.startsWith("ENCRYPTED_PACKAGE_")
  ) {
    return "BACKUP_INVALID";
  }
  if (
    code === "STORAGE_CORRUPT"
    || code === "MIGRATION_FAILED"
    || code === "READ_FAILED"
    || code === "PARSE_FAILED"
    || code.startsWith("STORAGE_")
  ) {
    return "STORAGE_CORRUPT";
  }
  if (
    code === "VALIDATION"
    || code === "INPUT"
    || code === "INVALID_FORM"
    || code === "CONFIRM_MISMATCH"
    || code.endsWith("_REQUIRED")
    || code.startsWith("INVALID_")
  ) {
    return "VALIDATION";
  }
  return "INTERNAL";
}

export function toOpsContractError(input: OpsErrorResponseInput): {
  status: number;
  body: { ok: false; error: OpsErrorShape };
} {
  const code = normalizeOpsErrorCode(input.code);
  const safeMessage = redactText(typeof input.message === "string" ? input.message : "");
  const message = safeMessage.trim() || DEFAULT_MESSAGE[code];
  const error: OpsErrorShape = {
    code,
    message,
  };
  const fixHref = input.fixHref || inferFixHrefByErrorCode(input.code);
  if (fixHref) {
    error.fixHref = fixHref;
  }

  if (input.details !== undefined) {
    error.details = input.details;
  }

  return {
    status: typeof input.status === "number" ? input.status : DEFAULT_STATUS[code],
    body: { ok: false, error },
  };
}

export function opsErrorResponse(input: OpsErrorResponseInput): NextResponse {
  const normalized = toOpsContractError(input);
  return NextResponse.json(normalized.body, { status: normalized.status });
}

export function toOpsGuardError(error: unknown): { status: number; code: string; message: string } | null {
  if (!isRecord(error)) return null;
  const status = Number(error.status);
  const code = normalizeRawCode(error.code);
  const message = typeof error.message === "string" ? error.message : "";
  if (!Number.isFinite(status) || !code) return null;
  return {
    status: Math.trunc(status),
    code,
    message,
  };
}
