import { NextResponse } from "next/server";
import { BatchLifecycleMutationError } from "@/lib/planning/v3/service/batchLifecycleMutation";

type BatchLifecycleErrorMeta = Record<string, unknown> | undefined;

export function planningBatchLifecycleErrorResponse(
  error: unknown,
  meta?: BatchLifecycleErrorMeta,
): NextResponse | null {
  if (!(error instanceof BatchLifecycleMutationError)) return null;

  const notFound = error.code === "NOT_FOUND";
  const readOnly = error.code === "READ_ONLY";
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: notFound ? "NO_DATA" : "INPUT",
        message: notFound
          ? "배치를 찾을 수 없습니다."
          : readOnly
            ? "저장 메타가 없는 배치는 변경할 수 없습니다."
            : "배치 식별자가 올바르지 않습니다.",
      },
      ...(meta ? { meta } : {}),
    },
    { status: notFound ? 404 : 400 },
  );
}
