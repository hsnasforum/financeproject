import { NextResponse } from "next/server";
import {
  StorageCorruptedError,
  StorageUnavailableError,
} from "../storage/serverFileRead";

type StorageErrorMeta = Record<string, unknown> | undefined;

export function planningProfileStorageErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Invalid record id") return message;
  if (message === "VAULT_LOCKED") return "저장소가 잠겨 있습니다. 잠금을 해제한 후 다시 시도해 주세요.";
  if (message === "PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED") {
    return "암호화된 저장 데이터를 읽으려면 기존 암호 설정이 필요합니다.";
  }
  return fallback;
}

function withMeta(
  body: { ok: false; error: Record<string, unknown> },
  meta: StorageErrorMeta,
): { ok: false; error: Record<string, unknown>; meta?: Record<string, unknown> } {
  if (!meta) return body;
  return { ...body, meta };
}

export function planningStorageErrorResponse(
  error: unknown,
  meta?: StorageErrorMeta,
  options?: { recoveryHref?: string | null },
): NextResponse | null {
  const recoveryHref = options?.recoveryHref === undefined ? "/ops/doctor" : options.recoveryHref;
  if (error instanceof StorageCorruptedError) {
    return NextResponse.json(
      withMeta({
        ok: false,
        error: {
          code: "STORAGE_CORRUPT",
          message: recoveryHref
            ? `저장 데이터가 손상되었을 수 있습니다. ${recoveryHref}에서 점검해 주세요.`
            : "저장 데이터가 손상되었을 수 있습니다. 기존 파일을 보관하고, 저장 상태를 확인한 후 다시 시도해 주세요.",
          ...(recoveryHref ? { fixHref: recoveryHref } : {}),
          ...(typeof error.lineNumber === "number" ? { details: { lineNumber: error.lineNumber } } : {}),
        },
      }, meta),
      { status: 500 },
    );
  }

  if (error instanceof StorageUnavailableError) {
    return NextResponse.json(
      withMeta({
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: recoveryHref
            ? `저장소를 사용할 수 없습니다. ${recoveryHref}에서 권한과 파일 상태를 점검해 주세요.`
            : "저장소를 사용할 수 없습니다. 파일 접근 권한과 저장 공간을 확인한 후 다시 시도해 주세요.",
          ...(recoveryHref ? { fixHref: recoveryHref } : {}),
        },
      }, meta),
      { status: 503 },
    );
  }

  return null;
}
