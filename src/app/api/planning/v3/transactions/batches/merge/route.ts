import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { mergeBatches, TransactionStoreInputError } from "@/lib/planning/v3/transactions/store";

type MergeBody = {
  fromBatchId?: unknown;
  intoBatchId?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, body: MergeBody): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(body?.csrf) }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: MergeBody = null;
  try {
    body = (await request.json()) as MergeBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const fromBatchId = asString(body?.fromBatchId);
  const intoBatchId = asString(body?.intoBatchId);
  if (!fromBatchId || !intoBatchId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "배치 병합 입력이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const merged = await mergeBatches(fromBatchId, intoBatchId);
    return NextResponse.json({
      ok: true,
      mergedCount: merged.mergedCount,
      dedupedCount: merged.dedupedCount,
    });
  } catch (error) {
    if (error instanceof TransactionStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "배치 병합 입력이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 병합에 실패했습니다." } },
      { status: 500 },
    );
  }
}
