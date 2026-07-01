import { NextResponse } from "next/server";
import {
  StorageCorruptedError,
  StorageUnavailableError,
} from "../storage/serverFileRead";

type StorageErrorMeta = Record<string, unknown> | undefined;

function withMeta(
  body: { ok: false; error: Record<string, unknown> },
  meta: StorageErrorMeta,
): { ok: false; error: Record<string, unknown>; meta?: Record<string, unknown> } {
  if (!meta) return body;
  return { ...body, meta };
}

export function planningStorageErrorResponse(error: unknown, meta?: StorageErrorMeta): NextResponse | null {
  if (error instanceof StorageCorruptedError) {
    return NextResponse.json(
      withMeta({
        ok: false,
        error: {
          code: "STORAGE_CORRUPT",
          message: "저장 데이터가 손상되었을 수 있습니다. /ops/doctor에서 점검해 주세요.",
          fixHref: "/ops/doctor",
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
          message: "저장소를 사용할 수 없습니다. /ops/doctor에서 권한과 파일 상태를 점검해 주세요.",
          fixHref: "/ops/doctor",
        },
      }, meta),
      { status: 503 },
    );
  }

  return null;
}
